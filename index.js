/**
 * dsh-model-panel — host half.
 *
 * Self-hosted balance/plan data source for the model panel: /dsh-model-panel/state.json
 * is the one endpoint the browser half calls. No other plugin has to be installed.
 *
 * This file is the entry point only. The work lives in ./lib:
 *   rows.js      credential resolution, one row per provider
 *   collect.js   which providers become rows, ordering, third-party channels
 *   snapshot.js  60s cache, in-flight de-duplication, on-disk seed
 *   routes.js    trust fence, response wrapper, the JSON endpoints
 *   subagent-gate.js  per-session delegation switch and its tool gate
 *
 * Third-party channel credits ride along as a separate `thirdParty` list:
 * channels published by the `dsh-connect` plugin (see ./lib/third-party.js) and
 * Our Free Model's EAC router credits (see ./lib/ofm-credits.js), de-duplicated
 * by channel name. Both are read-only.
 *
 * The whole provider adapter set is vendored under ./lib — every data source,
 * not just the ones enabled in the current profile. A row is produced for any
 * adapter whose credential resolves, so a catalog provider always finds its
 * row; enabled profile ids still win so a row keeps matching its catalog group
 * even when the profile renamed it.
 *
 * Everything is read-only towards the vendors: a resolved credential is sent
 * only to the URL declared by that provider's adapter, never to a user URL.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { loopbackBase, sendEmpty, sendJson } from './lib/http.js'
import { createSchedules } from './lib/schedules.js'
import { createSecrets } from './lib/secrets.js'
import { createCookieSetup } from './lib/cookie-setup.js'
import { createDeviceLogin } from './lib/opendesign-login.js'
import { createLoginHandler } from './lib/opendesign-login-route.js'
import { createAdapterSet } from './lib/registry.js'
import { fetchThirdParty } from './lib/third-party.js'
import { createOfmCredits } from './lib/ofm-credits.js'
import { createRows } from './lib/rows.js'
import { createCollect } from './lib/collect.js'
import { createSnapshot } from './lib/snapshot.js'
import { createFence, createRoutes, createSubagentRoute, fenced, registerRoutes } from './lib/routes.js'
import { createSubagentGate } from './lib/subagent-gate.js'

export const name = 'dsh-model-panel'

export const inject = ['webServer']

const ROUTE = '/dsh-model-panel/state.json'
const SETTINGS_ROUTE = '/dsh-model-panel/settings.json'
const SECRET_ROUTE = '/dsh-model-panel/secret.json'
const LOGIN_ROUTE = '/dsh-model-panel/login.json'
const SUBAGENT_ROUTE = '/dsh-model-panel/subagent.json'

/**
 * The version reported to a vendor that asks for one (OpenDesign stamps its
 * device authorizations with it). Read from the manifest rather than typed
 * here: a literal in a source file outlives its release.
 */
function moduleVersion() {
  try {
    const manifest = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
    return typeof manifest.version === 'string' && manifest.version ? manifest.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/**
 * The configured default for a session that never touched the switch.
 * `subagentDefault` is either one boolean, or a per-agent-preset map. Reads the
 * session's committed preset lazily so a preset mounted later is still seen.
 * @returns {{enabled: boolean, source: 'config'|'preset'} | null}
 */
function configuredSubagentDefault(config, get, rootId) {
  const setting = config && config.subagentDefault
  if (typeof setting === 'boolean') return { enabled: setting, source: 'config' }
  if (!setting || typeof setting !== 'object') return null
  const presets = get('agentPresets')
  const sessions = get('sessions')
  let preset = null
  if (presets && typeof presets.presetForSession === 'function' && sessions && typeof sessions.get === 'function' && rootId) {
    try {
      const session = sessions.get(rootId)
      preset = session ? presets.presetForSession(session) : null
    } catch {
      preset = null
    }
  }
  const keys = preset ? [String(preset), '*', 'default'] : ['*', 'default']
  for (const key of keys) {
    const value = setting[key]
    if (typeof value === 'boolean') return { enabled: value, source: preset ? 'preset' : 'config' }
  }
  return null
}

export function apply(ctx, config) {
  const cacheDir =
    (config && config.cacheDir) ||
    path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-model-panel')

  const get = (key) => {
    try {
      return ctx.get(key) || null
    } catch {
      return null
    }
  }

  const adapters = createAdapterSet({ cacheDir })
  const secrets = createSecrets({ getService: (key) => get(key) })
  const schedules = createSchedules({ cacheDir })
  // The settings page exists for usage numbers that only a signed-in console
  // session can read; it never touches a key-based endpoint.
  const cookieSetup = createCookieSetup({ adapters, secrets })

  /**
   * OpenDesign's billing key is handed out by a browser approval, not printed
   * on a page. That conversation lives in one state machine here; the settings
   * page starts it, polls it and cancels it, and the key itself only ever
   * reaches the credential store.
   */
  const login = createDeviceLogin({
    secrets,
    hostName: os.hostname(),
    product: 'dsh-model-panel/' + moduleVersion(),
    onGrant: async (controlKey) => {
      // The page's probe is cached and the key just changed: drop it so the
      // reload that follows the approval reports the new numbers.
      if (cookieSetup && typeof cookieSetup.invalidate === 'function') {
        cookieSetup.invalidate('OPENDESIGN_CONTROL_KEY')
      }
      // The key is stored already; ask the control plane which workspace it
      // belongs to and fill that row in while the key is in hand.
      const adapter = adapters.get('opendesign')
      if (!adapter || typeof adapter.validateControlKey !== 'function') return
      const found = await adapter.validateControlKey(controlKey, {})
      const workspaceId = found && found.ok ? found.workspaceId : null
      if (!workspaceId) return
      try {
        const current = await secrets.read('OPENDESIGN_WORKSPACE_ID')
        if (!current) await secrets.write('OPENDESIGN_WORKSPACE_ID', workspaceId)
      } catch {
        /* the workspace id is a convenience, never a requirement */
      }
    },
  })

  // Our Free Model 的 EAC router 渠道积分。走宿主连接的进程内 Fetch，不是
  // 裸回环 HTTP（`/api/*` 在宿主网关后面）。拿不到就空数组，卡片照常渲染。
  const ofmCredits = createOfmCredits({ get: (key) => get(key) })
  if (ctx && typeof ctx.effect === 'function') {
    ctx.effect(() => () => {
      try {
        ofmCredits.dispose()
      } catch {
        /* the host is already going away */
      }
    })
  }

  const rows = createRows({ adapters, secrets, get })
  const { collect } = createCollect({
    adapters,
    rows,
    get,
    schedules,
    fetchThirdParty,
    ofmCredits,
    storeReady: () => secrets.available(),
  })
  const { snapshot } = createSnapshot({ cacheDir, collect })

  const denied = createFence({ get })
  const routes = createRoutes({ snapshot, cookieSetup, denied })

  // Delegation is the host's business, but the switch sits in this panel: the
  // gate keeps its own file so it needs no session event the host must accept.
  const gate = createSubagentGate({
    cacheDir,
    get,
    toolNames: config && config.subagentToolNames,
    defaultFor: (root) => configuredSubagentDefault(config, get, root),
  })
  const subagent = createSubagentRoute({ gate })

  const loginRoute = createLoginHandler({ login, denied })

  const table = [
    { path: ROUTE, handler: fenced(denied, routes.handleState) },
    { path: SETTINGS_ROUTE, handler: fenced(denied, routes.handleSettings) },
    { path: SECRET_ROUTE, handler: fenced(denied, routes.handleSecret) },
    { path: SUBAGENT_ROUTE, handler: fenced(denied, subagent.handleSubagent) },
    { path: LOGIN_ROUTE, handler: loginRoute },
  ]
  registerRoutes(ctx, table)

  // Optional: without the tools service the switch still stores, it just does
  // not gate anything. Never let a missing service hold up the web routes.
  if (ctx && typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (inner) => {
      inner.effect(() => inner.tools.guard(gate.guard), 'guard:subagent-enabled')
    })
  }
}
