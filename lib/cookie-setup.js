/**
 * The credential settings page, host half.
 *
 * Some providers publish usage numbers that no API key can read: the numbers
 * only exist behind a signed-in console session, or behind a second credential
 * the model route never uses. This module owns the small, explicit list of
 * those providers, reads their stored values from the DSH credential store, and
 * never calls a key-based model endpoint.
 *
 * Two kinds of entry live here:
 *
 *   - `COOKIE_PROVIDER_IDS`: adapters whose own secret is a console cookie
 *     (Qwen Token Plan). The whole flow — paste, save, validate — is unchanged.
 *   - `EXTRA_PROVIDERS`: secondary credentials declared by an adapter's
 *     `secret.extras`. OpenDesign's runtime key can only call models, so its
 *     control key (and optional workspace id) is collected here instead.
 *
 * Only vendors whose protocol is actually implemented are listed. Adding one
 * means adding its adapter id (or its extras) after the parser is verified.
 */
import { describeSecret, looksLikeCookie, normalizeCookie } from './secrets.js'
import { domainFilterFor, parseCookieExport } from './cookie-import.js'

/**
 * Providers the settings page offers as console cookies, in display order.
 * Any other adapter whose secret is a cookie joins after these, so adding a
 * cookie-based vendor to the registry is enough to make it paste-able here.
 */
export const COOKIE_PROVIDER_IDS = ['qwen-token-plan-cn', 'xiaomi-token-plan-cn']

/**
 * Secondary credentials, declared here rather than read off the adapter so the
 * page order and the wording stay stable.
 *
 * `providerId` names the adapter the value feeds; `ref` is the credential
 * store key (the same one `secret.extras` resolves); `type` decides the
 * validation; `optional` only hides the "未配置" warning.
 */
export const EXTRA_PROVIDERS = [
  {
    providerId: 'opendesign',
    ref: 'OPENDESIGN_CONTROL_KEY',
    type: 'key',
    label: '控制键',
    hint: '读用量只需要这一个；下方的控制台 Cookie 是它的备选，两者二选一',
    placeholder: 'vela_ctrl_…',
    optional: false,
    env: 'OPENDESIGN_CONTROL_KEY',
    // The row that reports what this whole group unlocks: the adapter is
    // probed once, here, with every extras row resolved.
    reports: true,
  },
  {
    providerId: 'opendesign',
    ref: 'OPENDESIGN_WORKSPACE_ID',
    type: 'text',
    label: '工作区 ID',
    hint: '留空即可：存控制键时会自动问出来并回填',
    placeholder: 'workspaceId',
    optional: true,
    env: 'OPENDESIGN_WORKSPACE_ID',
  },
  {
    providerId: 'opendesign',
    ref: 'OPENDESIGN_CONSOLE_COOKIE',
    type: 'cookie',
    label: '控制台 Cookie',
    hint: '与控制键二选一：拿不到控制键时，用控制台会话顶替',
    // No placeholder: the page falls back to the localised cookie wording.
    optional: true,
    env: null,
  },
]

/** Keep only the fields the settings page renders. */
function shapeUsage(row) {
  if (!row || typeof row !== 'object') return { status: 'error', detail: 'empty answer' }
  const shaped = { status: row.status || 'ok' }
  for (const key of ['plan', 'planStatus', 'detail', 'workspaceId']) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') shaped[key] = row[key]
  }
  for (const key of ['usedPct', 'remainPct', 'remainingDays', 'amount']) {
    if (typeof row[key] === 'number' && Number.isFinite(row[key])) shaped[key] = row[key]
  }
  for (const key of ['endAt', 'currency']) {
    if (row[key] !== undefined && row[key] !== null) shaped[key] = row[key]
  }
  // A wallet row can carry plan windows (OpenDesign: 5-hour and 7-day pools).
  if (Array.isArray(row.windows)) {
    shaped.windows = row.windows
      .filter((win) => win && typeof win === 'object')
      .map((win) => ({
        label: String(win.label || ''),
        usedPct: Number.isFinite(win.usedPct) ? win.usedPct : null,
        remainPct: Number.isFinite(win.remainPct) ? win.remainPct : null,
        resetAt: win.resetAt === undefined ? null : win.resetAt,
      }))
      .slice(0, 4)
  }
  if (Array.isArray(row.notes)) shaped.notes = row.notes.filter((n) => typeof n === 'string').slice(0, 4)
  return shaped
}

/** `vela_ctrl_…`: a control key is a single opaque token, not a sentence. */
function looksLikeKey(value) {
  const text = String(value || '').trim()
  return /^[A-Za-z0-9_.:+/=-]{12,}$/.test(text) && !/\s/.test(text)
}

function looksLikeId(value) {
  const text = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(text)
}

export function createCookieSetup({ adapters, secrets, ttlMs = 60_000 }) {
  const cache = new Map()

  /**
   * The adapters this page owns, resolved from the live adapter set: the
   * declared order first, then any other cookie-secret adapter so a new
   * cookie-based vendor shows up here without touching this file.
   */
  function providers() {
    const out = []
    const take = (adapter) => {
      if (!adapter || !adapter.secret || adapter.secret.type !== 'cookie' || !adapter.secret.ref) return
      if (out.some((other) => other.secret.ref === adapter.secret.ref)) return
      out.push(adapter)
    }
    for (const id of COOKIE_PROVIDER_IDS) take(adapters.get(id))
    const all = Array.isArray(adapters.all) ? adapters.all : []
    for (const adapter of all) take(adapter)
    return out
  }

  /** The adapter one extras entry feeds, or null. */
  function extrasAdapter(entry) {
    const adapter = adapters.get(entry.providerId)
    return adapter || null
  }

  function find(id) {
    const wanted = String(id || '')
    return providers().find((adapter) => adapter.id === wanted || (adapter.aliases || []).includes(wanted)) || null
  }

  function base(adapter) {
    const setup = adapter.setup || {}
    return {
      id: adapter.id,
      label: adapter.label || adapter.id,
      ref: adapter.secret.ref,
      consoleUrl: setup.consoleUrl || adapter.consoleUrl || null,
      type: 'cookie',
      optional: false,
    }
  }

  /** One console-cookie row: whether a value is stored, plus its usage. */
  async function entry(adapter, { usage = true } = {}) {
    const row = base(adapter)
    let value = null
    try {
      value = await secrets.read(row.ref)
    } catch {
      value = null
    }
    if (!value) return { ...row, set: false }
    const described = describeSecret(value)
    const stored = { ...row, set: true, hint: described.hint || null }
    if (!usage) return stored
    const hit = cache.get(row.ref)
    if (hit && Date.now() - hit.at < ttlMs) return { ...stored, ...hit.value }
    try {
      const shaped = shapeUsage(await adapter.fetchSecret(value, { auth: 'cookie' }))
      const fresh = { ...shaped, updatedAt: Date.now() }
      cache.set(row.ref, { at: Date.now(), value: fresh })
      return { ...stored, ...fresh }
    } catch (error) {
      return { ...stored, status: 'error', detail: String((error && error.message) || error).slice(0, 160) }
    }
  }

  /**
   * Every stored extras value of one provider, keyed by the name the adapter's
   * own `secret.extras` declares (`as`), so `fetchSecret` sees the same shape
   * the panel's collect path gives it.
   */
  async function extrasOf(providerId) {
    const out = {}
    for (const extra of EXTRA_PROVIDERS) {
      if (extra.providerId !== providerId) continue
      let value = null
      try {
        value = await secrets.read(extra.ref)
      } catch {
        value = null
      }
      if (!value && extra.env) {
        const fromEnv = process.env[extra.env]
        if (fromEnv && String(fromEnv).trim()) value = String(fromEnv).trim()
      }
      if (!value) continue
      const adapter = extrasAdapter(extra)
      const declared =
        adapter && adapter.secret && Array.isArray(adapter.secret.extras)
          ? adapter.secret.extras.find((item) => item && item.ref === extra.ref)
          : null
      out[(declared && declared.as) || extra.ref] = value
    }
    return out
  }

  /**
   * The numbers an extras group unlocks, probed once per provider.
   *
   * The panel row already reports them, but the settings page has to say the
   * key worked at the moment it is saved — otherwise a stored control key
   * shows "已配置" with no numbers anywhere and reads as a failure.
   */
  async function groupUsage(providerId) {
    const adapter = adapters.get(providerId)
    if (!adapter || typeof adapter.fetchSecret !== 'function') return null
    const cached = cache.get('group:' + providerId)
    if (cached && Date.now() - cached.at < ttlMs) return cached.value
    const extras = await extrasOf(providerId)
    // Nothing to authenticate with: stay silent instead of reporting a
    // failure the reader cannot act on.
    if (!Object.keys(extras).length) return null
    let runtimeKey = null
    try {
      runtimeKey = adapter.secret && adapter.secret.ref ? await secrets.read(adapter.secret.ref) : null
    } catch {
      runtimeKey = null
    }
    let shaped
    try {
      shaped = shapeUsage(await adapter.fetchSecret(runtimeKey, { auth: 'key', extras }))
    } catch (error) {
      shaped = { status: 'error', detail: String((error && error.message) || error).slice(0, 160) }
    }
    const fresh = { ...shaped, updatedAt: Date.now() }
    cache.set('group:' + providerId, { at: Date.now(), value: fresh })
    return fresh
  }

  /**
   * One extras row: whether a value is stored, plus — on the row that owns
   * the group — the usage every row of the group unlocks.
   */
  async function extrasEntry(extra) {
    const adapter = extrasAdapter(extra)
    const row = {
      id: extra.providerId,
      label: extra.label,
      ref: extra.ref,
      consoleUrl: (adapter && adapter.consoleUrl) || null,
      type: extra.type,
      optional: Boolean(extra.optional),
      hint: extra.hint || null,
      placeholder: extra.placeholder || null,
      group: extra.providerId,
      groupLabel: (adapter && (adapter.label || adapter.id)) || extra.providerId,
      usage: false,
    }
    let value = null
    try {
      value = await secrets.read(row.ref)
    } catch {
      value = null
    }
    if (!value && extra.env) {
      const fromEnv = process.env[extra.env]
      if (fromEnv && String(fromEnv).trim()) value = String(fromEnv).trim()
    }
    // `fromEnv` says the value came from the environment, so the page can
    // explain why clearing the field does not empty it.
    const fromEnv = Boolean(extra.env && value && value === String(process.env[extra.env] || '').trim())
    if (!value) return { ...row, set: false, fromEnv: false }
    const described = describeSecret(value)
    const stored = { ...row, set: true, hint: described.hint || null, fromEnv }
    if (!extra.reports) return stored
    // The reporting row asks the adapter what the whole group unlocks; a
    // clear answer is what tells the reader the key actually works.
    const usage = await groupUsage(extra.providerId)
    return usage ? { ...stored, ...usage } : stored
  }

  async function list({ usage = true } = {}) {
    const out = []
    for (const adapter of providers()) out.push(await entry(adapter, { usage }))
    for (const extra of EXTRA_PROVIDERS) out.push(await extrasEntry(extra))
    return out
  }

  /**
   * Which kind of value a ref expects, so save() can validate it.
   *
   * `source` matters: a console-cookie *provider* stores under its own
   * `adapter.secret.ref`, while an *extra* row (even a cookie-typed one) stores
   * under its own ref. Mixing them would overwrite the model key.
   */
  function kindOf(ref) {
    if (!ref) return null
    const adapter = providers().find((item) => item.secret.ref === ref)
    if (adapter) return { source: 'provider', kind: 'cookie', adapter, optional: false }
    const extra = EXTRA_PROVIDERS.find((item) => item.ref === ref)
    if (extra) return { source: 'extra', kind: extra.type, adapter: extrasAdapter(extra), extra, optional: Boolean(extra.optional) }
    return null
  }

  /** Resolve the row a save/clear applies to: explicit ref first, then the id. */
  function targetOf(id, ref) {
    const byRef = kindOf(ref)
    if (byRef) return byRef
    const adapter = find(id)
    if (adapter) return { source: 'provider', kind: 'cookie', adapter, optional: false }
    return null
  }

  /**
   * Store a pasted value, then report what it unlocks. Never echoes the value.
   *
   * `ref` selects the row; when omitted the id is treated as a provider id,
   * which keeps the pre-extras call shape working.
   */
  async function save(id, raw, ref) {
    const target = targetOf(id, ref)
    if (!target) return { ok: false, error: 'unknown provider: ' + String(id || '') }

    let value
    let imported = null
    if (target.kind === 'cookie') {
      // A value can arrive as a header, as a Cookie-Editor JSON file, as a
      // Netscape cookies.txt or as a bare `{name: value}` map. All of them
      // reduce to one header here, filtered to the provider's own domains.
      const providerId = target.source === 'provider' ? target.adapter.id : target.extra.providerId
      const parsed = parseCookieExport(raw, { providerDomains: domainFilterFor(providerId) })
      if (!parsed.ok && parsed.reason === 'no-cookies') {
        return { ok: false, error: 'the export holds no usable cookie for ' + providerId }
      }
      value = parsed.ok ? parsed.cookie : normalizeCookie(raw)
      if (!looksLikeCookie(value)) {
        return { ok: false, error: 'not a cookie: paste the console Cookie header or the whole Cookie-Editor “Export As: JSON” text' }
      }
      if (parsed.ok && parsed.format !== 'header') {
        imported = {
          format: parsed.format,
          count: parsed.count,
          total: parsed.total,
          skipped: parsed.skipped,
          filteredOut: Number(parsed.filteredOut) || 0,
          filtered: Boolean(parsed.filtered),
          names: parsed.names,
        }
      }
    } else if (target.kind === 'key') {
      value = String(raw == null ? '' : raw).trim()
      if (!looksLikeKey(value)) {
        return { ok: false, error: 'not a control key: paste the single token copied from the console (vela_ctrl_…)' }
      }
    } else {
      value = String(raw == null ? '' : raw).trim()
      if (!looksLikeId(value)) return { ok: false, error: 'not a workspace id: paste the id exactly as the console shows it' }
    }

    const storedRef = target.source === 'provider' ? target.adapter.secret.ref : target.extra.ref
    try {
      await secrets.write(storedRef, value)
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error).slice(0, 140) }
    }
    cache.delete(storedRef)
    if (target.source === 'extra') cache.delete('group:' + target.extra.providerId)

    let validation = null
    if (target.source === 'provider' && typeof target.adapter.validate === 'function') {
      try {
        validation = await target.adapter.validate(value)
      } catch (error) {
        validation = { ok: false, message: String((error && error.message) || error).slice(0, 140) }
      }
    }
    if (target.kind === 'key' && target.adapter && typeof target.adapter.validateControlKey === 'function') {
      try {
        validation = await target.adapter.validateControlKey(value, {})
      } catch (error) {
        validation = { ok: false, message: String((error && error.message) || error).slice(0, 140) }
      }
      // A working control key names its workspace; filling it in saves the user
      // a second paste and keeps the adapter's lookup from repeating.
      if (validation && validation.ok && validation.workspaceId) {
        const wsRef = EXTRA_PROVIDERS.find((item) => item.providerId === target.extra.providerId && item.type === 'text')
        if (wsRef) {
          let current = null
          try {
            current = await secrets.read(wsRef.ref)
          } catch {
            current = null
          }
          if (!current) {
            try {
              await secrets.write(wsRef.ref, validation.workspaceId)
            } catch { /* the workspace id is a convenience, not a requirement */ }
          }
        }
      }
    }

    const fresh = target.source === 'provider'
      ? await entry(target.adapter)
      : await extrasEntry(target.extra)
    return { ok: true, saved: true, validation, entry: fresh, imported }
  }

  /** Drop one stored value; `ref` may name any row of any provider. */
  async function clear(id, ref) {
    const target = targetOf(id, ref)
    if (!target) return { ok: false, error: 'unknown provider: ' + String(id || '') }
    const storedRef = target.source === 'provider' ? target.adapter.secret.ref : target.extra.ref
    let cleared = false
    try {
      cleared = await secrets.clear(storedRef)
    } catch {
      cleared = false
    }
    cache.delete(storedRef)
    if (target.source === 'extra') cache.delete('group:' + target.extra.providerId)
    const fresh = target.source === 'provider'
      ? await entry(target.adapter, { usage: false })
      : await extrasEntry(target.extra)
    return { ok: true, cleared, entry: fresh }
  }

  /**
   * Forget a cached probe. Used when a credential is written by someone
   * else — the browser sign-in stores the control key itself, so the page
   * must not keep showing the numbers from the key that was replaced.
   */
  function invalidate(ref) {
    if (ref) cache.delete(ref)
    const extra = EXTRA_PROVIDERS.find((item) => item.ref === ref)
    if (extra) cache.delete('group:' + extra.providerId)
  }

  return { list, save, clear, invalidate, refs: () => providers().map((adapter) => adapter.secret.ref) }
}
