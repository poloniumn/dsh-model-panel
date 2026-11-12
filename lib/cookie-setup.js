/**
 * The cookie-only settings page, host half.
 *
 * Some providers publish usage numbers that no API key can read: the numbers
 * only exist behind a signed-in console session. This module owns the small
 * set of those providers, reads their stored cookie from the DSH credential
 * store, and never calls a key-based endpoint — the page exists to fill the
 * gaps the panel's key path cannot fill.
 *
 * Only vendors whose console protocol is actually implemented are listed.
 * Adding one means adding its adapter id here after its parser is verified.
 */
import { describeSecret, looksLikeCookie, normalizeCookie } from './secrets.js'

/** Providers the settings page offers, in display order. */
export const COOKIE_PROVIDER_IDS = ['qwen-token-plan-cn']

/** Keep only the fields the settings page renders. */
function shapeUsage(row) {
  if (!row || typeof row !== 'object') return { status: 'error', detail: 'empty answer' }
  const shaped = { status: row.status || 'ok' }
  for (const key of ['plan', 'planStatus', 'detail']) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') shaped[key] = row[key]
  }
  for (const key of ['usedPct', 'remainPct', 'remainingDays', 'amount']) {
    if (typeof row[key] === 'number' && Number.isFinite(row[key])) shaped[key] = row[key]
  }
  for (const key of ['endAt', 'currency']) {
    if (row[key] !== undefined && row[key] !== null) shaped[key] = row[key]
  }
  return shaped
}

export function createCookieSetup({ adapters, secrets, ttlMs = 60_000 }) {
  const cache = new Map()

  /** The adapters this page owns, resolved from the live adapter set. */
  function providers() {
    const out = []
    for (const id of COOKIE_PROVIDER_IDS) {
      const adapter = adapters.get(id)
      if (!adapter || !adapter.secret || adapter.secret.type !== 'cookie' || !adapter.secret.ref) continue
      out.push(adapter)
    }
    return out
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
    }
  }

  /** Onerow: whether a cookie is stored, plus (optionally) the usage it unlocks. */
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

  async function list({ usage = true } = {}) {
    const out = []
    for (const adapter of providers()) out.push(await entry(adapter, { usage }))
    return out
  }

  /** Store a pasted cookie, then report what it unlocks. Never echoes the value. */
  async function save(id, raw) {
    const adapter = find(id)
    if (!adapter) return { ok: false, error: 'unknown provider: ' + String(id || '') }
    const value = normalizeCookie(raw)
    if (!looksLikeCookie(value)) {
      return { ok: false, error: 'not a cookie: paste the console Cookie header (name=value; name2=value2)' }
    }
    try {
      await secrets.write(adapter.secret.ref, value)
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error).slice(0, 140) }
    }
    cache.delete(adapter.secret.ref)
    let validation = null
    if (typeof adapter.validate === 'function') {
      try {
        validation = await adapter.validate(value)
      } catch (error) {
        validation = { ok: false, message: String((error && error.message) || error).slice(0, 140) }
      }
    }
    return { ok: true, saved: true, validation, entry: await entry(adapter) }
  }

  async function clear(id) {
    const adapter = find(id)
    if (!adapter) return { ok: false, error: 'unknown provider: ' + String(id || '') }
    let cleared = false
    try {
      cleared = await secrets.clear(adapter.secret.ref)
    } catch {
      cleared = false
    }
    cache.delete(adapter.secret.ref)
    return { ok: true, cleared, entry: await entry(adapter, { usage: false }) }
  }

  return { list, save, clear }
}
