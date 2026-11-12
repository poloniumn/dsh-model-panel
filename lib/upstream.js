/**
 * Upstream request layer.
 *
 * Vendors do not all speak `GET + Authorization: Bearer`. The contracts here
 * were folded in from dsh-subusage 0.24.5, whose adapters were verified
 * against real accounts:
 *
 *   - Z.ai International / Ollama Cloud: bare `Authorization`, no `Bearer`
 *   - NanoGPT balance: `x-api-key` + `POST {}` on a different host
 *   - console sessions: `Cookie`, sometimes with Origin/Referer
 *   - OpenRouter / ZenMux / Kimi / NanoGPT / APIGOTO: two (or three)
 *     endpoints, where a secondary failure must degrade silently instead of
 *     failing the whole row
 *   - money fields are not always plain numbers: Novita is 1/10000 USD,
 *     Hyperbolic is cents, DeepInfra is a *negative* balance, Vercel is a
 *     decimal string
 *   - HTTP 200 can still mean "credential expired" (business codes), and
 *     3xx is not an auth failure; 408/429/5xx are worth one retry
 *
 * Everything returns a result object rather than throwing, so one vendor can
 * never take down the whole card.
 */
import { FETCH_TIMEOUT_MS, UA, num } from './util.js'

export const MAX_RESPONSE_BYTES = 1024 * 1024
export const DEFAULT_TIMEOUT_MS = 10_000

const AUTH = {
  bearer: (key) => ({ authorization: `Bearer ${key}` }),
  raw: (key) => ({ authorization: key }),
  'x-api-key': (key) => ({ 'x-api-key': key }),
  token: (key) => ({ authorization: `token ${key}` }),
  cookie: (key) => ({ cookie: key }),
}

/** Header set for one credential. Unknown modes fall back to Bearer. */
export function authHeaders(key, mode = 'bearer') {
  if (!key) return {}
  const build = AUTH[mode] || AUTH.bearer
  return build(String(key))
}

/** A decimal string such as `"12.50"` → 12.5; anything else → null. */
export function decimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/** Clamp a used percentage and produce the card's `{label, ...}` window. */
export function windowRow(label, usedPct, resetAt) {
  const used = num(usedPct)
  const pct = used === null ? null : Math.max(0, Math.min(100, used))
  return {
    label,
    usedPct: pct,
    remainPct: pct === null ? null : 100 - pct,
    resetAt: Number.isFinite(resetAt) ? resetAt : null,
  }
}

/** A timestamp that may be an ISO string, epoch ms *or* epoch seconds. */
export function timestamp(value) {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  const n = num(value)
  if (n === null || n <= 0) return null
  return n > 1e11 ? n : n * 1000
}

function retryAfterMs(response) {
  const raw = response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('retry-after')
    : null
  if (!raw) return null
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw) * 1000
  const at = Date.parse(raw)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

/**
 * One upstream JSON call.
 *
 * @param {string} url  absolute, https-only URL declared by an adapter
 * @param {object}  [options]
 * @param {string}  [options.key]        credential value
 * @param {string}  [options.auth]       'bearer' | 'raw' | 'x-api-key' | 'token' | 'cookie'
 * @param {object}  [options.headers]    extra / overriding headers
 * @param {string}  [options.method]
 * @param {string}  [options.body]
 * @param {number}  [options.timeoutMs]
 * @param {Function}[options.fetchImpl] injectable for tests
 * @returns {Promise<{ok:boolean, body?:any, error?:string, status?:number,
 *                     authFailed?:boolean, retryable?:boolean, retryAfterMs?:number}>}
 */
export async function requestJson(url, options = {}) {
  const {
    key,
    auth = 'bearer',
    headers: extra = {},
    method = 'GET',
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = options

  // A credential must never be redirected to a host the adapter did not name.
  const requestHeaders = {
    accept: 'application/json',
    'user-agent': UA,
    ...authHeaders(key, auth),
    ...extra,
  }

  let response
  try {
    response = await fetchImpl(url, {
      method,
      ...(body !== undefined ? { body } : {}),
      headers: requestHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs || FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err).slice(0, 160), retryable: true }
  }

  const status = Number(response.status) || 0

  // A 3xx here is a domain migration / login redirect, not "key expired".
  if (status >= 300 && status < 400) {
    return { ok: false, status, error: `unexpected redirect (HTTP ${status})` }
  }
  if (status === 401 || status === 403) {
    return { ok: false, status, authFailed: true, error: `credential expired or rejected (HTTP ${status})` }
  }
  if (!response.ok) {
    return {
      ok: false,
      status,
      error: `HTTP ${status}`,
      retryable: status === 408 || status === 429 || status >= 500,
      retryAfterMs: retryAfterMs(response) ?? undefined,
    }
  }

  const declared = Number(
    response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('content-length')
      : 0,
  )
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    return { ok: false, status, error: 'response exceeds 1 MiB' }
  }

  let text
  try {
    text = await response.text()
  } catch (err) {
    return { ok: false, status, error: 'failed to read response', retryable: true }
  }
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    return { ok: false, status, error: 'response exceeds 1 MiB' }
  }
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    return { ok: false, status, error: 'response is not JSON (session probably expired)' }
  }
  // Some gateways answer 200 with a business-level auth code.
  if ([401, 403, '401', '403'].includes(parsed && parsed.code)) {
    return { ok: false, status, authFailed: true, error: 'credential expired or rejected' }
  }
  return { ok: true, status, body: parsed }
}

/** A secondary endpoint whose failure is allowed to disappear silently. */
export async function optionalJson(url, options) {
  const result = await requestJson(url, options)
  return result.ok ? result.body : undefined
}

/** Turn a failed request into the row state the card understands. */
export function requestError(result) {
  const message = result.error || 'upstream request failed'
  return {
    status: result.authFailed ? 'expired' : 'error',
    detail: String(message).slice(0, 140),
  }
}
