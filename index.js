/**
 * dsh-model-panel — host half.
 *
 * Self-hosted balance/plan data source for the model panel: this file owns
 * every provider adapter, so /dsh-model-panel/state.json is the one endpoint
 * the browser half calls. No other plugin has to be installed.
 *
 * Third-party channel credits ride along as a separate `thirdParty` list:
 * channels published by the `dsh-connect` plugin (see ./lib/third-party.js) and
 * Our Free Model's EAC router credits (see ./lib/ofm-credits.js), de-duplicated
 * by channel name. Both are read-only.
 *
 * The whole provider adapter set is vendored under ./lib — every data source,
 * not just the ones enabled in the current
 * profile. A row is produced for any adapter whose credential resolves, so a
 * catalog provider always finds its row; enabled profile ids still win so a
 * row keeps matching its catalog group even when the profile renamed it.
 *
 * Everything is read-only towards the vendors: a resolved credential is sent
 * only to the URL declared by that provider's adapter, never to a user URL.
 */
import os from 'node:os'
import path from 'node:path'

import { crossSite, loopbackBase, loopbackRequest, sendEmpty, sendJson } from './lib/http.js'
import { createSchedules } from './lib/schedules.js'
import { createSecrets } from './lib/secrets.js'
import { createAdapterSet } from './lib/registry.js'
import { errorState, getJson, num } from './lib/util.js'
import { fetchThirdParty } from './lib/third-party.js'
import { createOfmCredits } from './lib/ofm-credits.js'

export const name = 'dsh-model-panel'

export const inject = ['webServer']

const ROUTE = '/dsh-model-panel/state.json'
const CACHE_TTL_MS = 60_000

/**
 * The primary credential reference for one row. A cookie-backed adapter must
 * always use its own console cookie — never the model router's `apiKeyEnv`
 * (a regular API key), which the console gateway rejects. Key-backed adapters
 * may follow a renamed profile ref.
 */
function chooseSecretRef(secret, profileRef) {
  if (secret.type === 'cookie') return secret.ref
  return profileRef || secret.ref
}

/**
 * Every name a key may be stored under, in priority order. Some vendors have
 * two accepted ref names (e.g. OpenCode Go's dedicated key and the Zen key),
 * and a profile can rename its key through `apiKeyEnv`. Names are tried one
 * at a time against the credential store — never merged across sources.
 * Cookies stay pinned to their own console ref.
 */
function secretRefCandidates(secret, profileRef) {
  if (!secret || secret.type === 'account') return []
  if (secret.type === 'cookie') return [secret.ref]
  const refs = []
  const push = (ref) => {
    if (ref && !refs.includes(ref)) refs.push(ref)
  }
  push(profileRef)
  push(secret.ref)
  for (const alias of secret.aliases || []) push(alias)
  return refs
}

export function apply(ctx, config) {
  const cacheDir =
    (config && config.cacheDir) ||
    path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-model-panel')

  const adapters = createAdapterSet({ cacheDir })
  const adapterFor = (id) => adapters.get(id)
  const get = (key) => {
    try {
      return ctx.get(key) || null
    } catch {
      return null
    }
  }
  const secrets = createSecrets({ getService: (key) => get(key) })
  const schedules = createSchedules({ cacheDir })

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

  let cache = null
  let cacheAt = 0
  let inflight = null

  /**
   * Live provider ids from the profile's llm-pi-ai config, with displayName /
   * apiKeyEnv renames applied. Same semantics as the adapters under ./lib/providers.
   */
  function enabledProviders() {
    const ids = new Map()
    try {
      const editor = get('configEditor')
      const rows = (editor && typeof editor.configuration === 'function' && editor.configuration()) || []
      for (const entry of rows) {
        const entryName = String((entry && (entry.name || entry.id)) || '')
        if (!entryName.includes('llm-pi-ai')) continue
        for (const layer of [entry && entry.inherited, entry && entry.override, entry && entry.config]) {
          const providers = layer && layer.providers
          if (!providers || typeof providers !== 'object') continue
          for (const [id, profile] of Object.entries(providers)) {
            if (!id) continue
            if (profile && profile.disabled === true) {
              ids.delete(id)
              continue
            }
            const previous = ids.get(id) || {}
            const displayName =
              typeof profile?.displayName === 'string' && profile.displayName.trim()
                ? profile.displayName.trim()
                : previous.displayName
            const keyRef =
              typeof profile?.apiKeyEnv === 'string' && profile.apiKeyEnv.trim()
                ? profile.apiKeyEnv.trim()
                : previous.keyRef
            ids.set(id, { displayName, keyRef })
          }
        }
      }
    } catch {
      /* config unreadable: no enabled rows */
    }
    return ids
  }

  function adapterMeta(adapter, id, meta) {
    return {
      kind: adapter.kind || 'console',
      label: (adapter.labelFor && adapter.labelFor(id)) || adapter.label || meta.displayName || id,
      order: (adapter.orderFor && adapter.orderFor(id)) ?? adapter.order ?? 60,
      consoleUrl: (adapter.consoleUrlFor && adapter.consoleUrlFor(id)) ?? adapter.consoleUrl ?? null,
      secret: (adapter.secretFor && adapter.secretFor(id)) ?? adapter.secret ?? null,
    }
  }

  /** Build one row for one provider. Never throws. */
  async function buildRow(id, meta) {
    try {
      const adapter = adapterFor(id)
      if (!adapter) return fallbackRow(id, meta)
      const shaped = adapterMeta(adapter, id, meta)
      const row = {
        id,
        kind: shaped.kind,
        label: shaped.label,
        order: shaped.order,
        consoleUrl: shaped.consoleUrl,
        status: 'console',
        keyRef: shaped.secret?.ref || null,
      }

      // The login-backed wallet needs no credential of its own.
      if (shaped.secret?.type === 'account') {
        try {
          return {
            ...row,
            ...(await adapter.fetchSecret(shaped.secret, { account: get('deepseekAccount') })),
          }
        } catch (err) {
          return { ...row, status: 'error', detail: String((err && err.message) || err).slice(0, 160) }
        }
      }

      if (row.kind === 'console' || !shaped.secret?.ref) return row

      // Cookie-backed adapters read their own console cookie, NOT the model
      // router's `apiKeyEnv`. Key-backed adapters may follow the rename, but
      // only when it actually resolves.
      const candidates = secretRefCandidates(shaped.secret, meta.keyRef)
      let ref = candidates[0] || shaped.secret.ref
      let secret = null
      for (const candidate of candidates) {
        let value = null
        try {
          value = await secrets.read(candidate)
        } catch {
          value = null
        }
        if (value) {
          ref = candidate
          secret = value
          break
        }
      }
      if (!secret) return { ...row, status: 'no-key', keyRef: ref }

      if (typeof adapter.fetchSecret === 'function') {
        const result = await adapter.fetchSecret(secret, { account: get('deepseekAccount'), row })
        return { ...row, ...result }
      }
      const result = await getJson((adapter.urlFor && adapter.urlFor(id)) || adapter.url, secret)
      if (!result.ok) return { ...row, ...errorState(result.error) }
      if (row.kind === 'plan') {
        const plan = adapter.parsePlan(result.body)
        if (!plan || (plan.usedPct === null && !Array.isArray(plan.windows))) {
          return { ...row, status: 'error', detail: 'unexpected plan payload' }
        }
        return { ...row, ...plan, status: 'ok' }
      }
      const balance = adapter.parseKey(result.body)
      if (!balance || num(balance.amount) === null) {
        return { ...row, status: 'error', detail: 'unexpected balance payload' }
      }
      return { ...row, status: 'ok', ...balance }
    } catch (err) {
      return {
        id,
        kind: 'console',
        label: (meta && meta.displayName) || id,
        order: 60,
        consoleUrl: null,
        status: 'error',
        detail: String((err && err.message) || err).slice(0, 160),
      }
    }
  }

  /** A provider this plugin has no adapter for: a console link only. */
  function fallbackRow(id, meta) {
    return {
      id,
      kind: 'console',
      label: (meta && meta.displayName) || id,
      order: 60,
      consoleUrl: null,
      status: 'console',
      keyRef: (meta && meta.keyRef) || null,
    }
  }

  async function collect(base = null) {
    const enabled = enabledProviders()

    // Every ported adapter is a data source — not only the currently enabled
    // ones. Enabled ids win so a row keeps the profile's provider id (the
    // catalog group id) even when that id is an adapter alias.
    const ids = new Map()
    for (const [id, meta] of enabled) ids.set(id, meta)
    for (const adapter of adapters.all) {
      if (ids.has(adapter.id)) continue
      let covered = false
      for (const id of ids.keys()) {
        if (adapterFor(id) === adapter) {
          covered = true
          break
        }
      }
      if (covered) continue
      // The login-backed wallet only exists while the DSH login is stored.
      if (adapter.secret?.type === 'account') {
        try {
          if (typeof adapter.available === 'function' && !(await adapter.available(get('deepseekAccount')))) {
            continue
          }
        } catch {
          continue
        }
      }
      ids.set(adapter.id, {})
    }

    const built = await Promise.all([...ids.entries()].map(([id, meta]) => buildRow(id, meta)))

    // One DeepSeek row: when the login-backed wallet answers, a keyed row that
    // has no key of its own is redundant.
    const accountRow = built.find((row) => row.id === 'deepseek-account')
    const rows = built.filter((row) => {
      if (row.id !== 'deepseek') return true
      return !(accountRow && accountRow.status === 'ok' && row.status === 'no-key')
    })

    // An empty wallet says nothing the user needs to see; a negative balance
    // (owed) still does.
    const visible = rows.filter(
      (row) => !((row.kind === 'money' || row.kind === 'account') && row.status === 'ok' && row.amount === 0)
    )

    // Adapter metadata (DeepSeek peak schedule for the off-peak green wash).
    const state = { schedules: await schedules.current() }
    for (const row of visible) {
      const adapter = adapterFor(row.id)
      if (adapter && typeof adapter.meta === 'function') {
        try {
          adapter.meta(row, state)
        } catch {
          /* metadata is cosmetic */
        }
      }
    }

    visible.sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)))

    // Two independent third-party sources, merged by name (case-insensitive) so
    // one channel that both plugins can see is not drawn twice.
    const [connected, ofm] = await Promise.all([
      fetchThirdParty(base),
      ofmCredits.readAll().catch(() => []),
    ])
    const thirdParty = [...connected]
    const seen = new Set(connected.map((row) => String(row.name || '').trim().toLowerCase()))
    for (const row of ofm) {
      const key = String(row.name || '').trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      thirdParty.push(row)
    }

    return { ok: true, updatedAt: Date.now(), rows: visible, thirdParty }
  }

  /** 60s cache + inflight de-duplication; never rejects. */
  function snapshot(base) {
    if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return Promise.resolve(cache)
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const next = await collect(base)
        cache = next
        cacheAt = Date.now()
        return next
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err).slice(0, 200) }
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  /** Closed when the host says the peer may not call us, or it is cross-site. */
  function denied(req) {
    try {
      if (crossSite(req) || !loopbackRequest(req)) return 403
      const connection = get('connection')
      if (connection && typeof connection.requestRejection === 'function') {
        const code = connection.requestRejection(req)
        if (code !== undefined && code !== null && code !== false) {
          return typeof code === 'number' ? code : 403
        }
      }
      return null
    } catch {
      return 403
    }
  }

  /** Never rejects: the web server must not see an unhandled rejection. */
  async function handleState(req, res) {
    try {
      const code = denied(req)
      if (code) return sendEmpty(res, code)
      const state = await snapshot(loopbackBase(req.headers && req.headers.host))
      return sendJson(res, state && state.ok ? 200 : 500, state)
    } catch (err) {
      try {
        return sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 200) })
      } catch {
        return undefined
      }
    }
  }

  ctx.inject(['webServer'], (inner) => {
    inner.effect(
      () => inner.webServer.register({ kind: 'exact', path: ROUTE, handler: handleState }),
      `route:${ROUTE}`
    )
  })
}
