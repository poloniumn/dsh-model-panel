/**
 * OpenDesign console sign-in — the device-authorization flow behind `vela login`.
 *
 * The wallet, the plan and the 5-hour / 7-day windows only exist on the
 * control plane (`amr-api.open-design.ai`), and that plane only answers a
 * `vela_ctrl_…` key — a credential printed on no page. It is minted by a
 * browser approval: the host asks for a device authorization, the user opens
 * the returned link and approves the six-digit code, and the token endpoint
 * hands the key back. That is the whole reason this module exists: without it
 * a user with a working `sk-amr_…` key still cannot see a single number.
 *
 * Polling is driven by the settings page, not by a timer: `status()` asks
 * upstream only when the next poll is due, so a page that stops asking stops
 * costing requests and an unloaded plugin leaves no interval behind.
 *
 * The parsers are pure and exported so the suite can exercise them with no
 * network: `parseAuthorization`, `readGrant`, `readAnswer`.
 */
import { requestJson } from './upstream.js'

/** Control plane; the model plane (`amr-link`) is a different host. */
const LOGIN_BASE = 'https://amr-api.open-design.ai'

/** Approval page, used when an answer carries no `activationUrl` of its own. */
const ACTIVATION_FALLBACK = 'https://open-design.ai/cloud/cli/activate'

/** Poll cadence when the service does not name one. */
const DEFAULT_INTERVAL_MS = 2000

/** An authorization is only worth polling for this long. */
export const MAX_WAIT_MS = 10 * 60_000

/**
 * Statuses worth a second look.
 *
 * The control plane answers `503 database_unavailable` in bursts (measured
 * 2026-11-11: 15/20 on the one-shot device-authorization POST, while
 * `billing/summary` was 20/20), and Cloudflare adds 520–524 when the origin
 * returns an empty reply. Starting a sign-in has no second chance of its own,
 * so each request here gets a small retry budget.
 */
const TRANSIENT = new Set([502, 503, 504, 520, 521, 522, 523, 524])

/** Attempts per request, and the pause between them. */
const ATTEMPTS = 4
const RETRY_MS = 500

function textOf(value) {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text ? text : undefined
}

/** A key the settings page can act on: one opaque token, not a sentence. */
export function looksLikeControlKey(value) {
  const text = String(value == null ? '' : value).trim()
  return /^[A-Za-z0-9_.:+/=-]{12,}$/.test(text) && !/\s/.test(text)
}

/**
 * `POST /api/v1/cli/device-authorizations` → the pending authorization.
 *
 * Returns null when the answer is missing a piece the poll would need, so a
 * half-written body can never leave the page showing a code nobody can
 * approve.
 */
export function parseAuthorization(body, now) {
  const box = body && typeof body === 'object' ? body : null
  if (!box) return null
  const deviceId = textOf(box.deviceId)
  const deviceSecret = textOf(box.deviceSecret)
  const userCode = textOf(box.userCode)
  if (!deviceId || !deviceSecret || !userCode) return null
  const expiresAt = Date.parse(box.expiresAt ?? '')
  const intervalSeconds = Number(box.pollIntervalSeconds)
  const activationUrl = textOf(box.activationUrl)
  return {
    deviceId,
    deviceSecret,
    userCode,
    activationUrl: activationUrl || ACTIVATION_FALLBACK + '?userCode=' + encodeURIComponent(userCode),
    startedAt: now,
    until: Number.isFinite(expiresAt) && expiresAt > now ? expiresAt : now + MAX_WAIT_MS,
    intervalMs: Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds * 1000 : DEFAULT_INTERVAL_MS,
  }
}

/** The control key an approved authorization hands back, or null. */
function readGrant(body) {
  const box = body && typeof body === 'object' ? body : null
  if (!box) return null
  const key = textOf(box.controlKey)
  if (!key || !looksLikeControlKey(key)) return null
  return { controlKey: key, email: textOf(box.user && box.user.email) || null, createdAt: now0() }
}

// `readGrant` must stay pure for the suite, so the timestamp it stamps comes
// from this one indirection rather than from an argument every caller repeats.
function now0() {
  return Date.now()
}

/**
 * What one token poll means.
 *
 * `pending` covers everything unrecognised on purpose: a 5xx must never be
 * reported as a refused approval, because the user may have approved already
 * and the token endpoint is the only place that fact surfaces.
 */
export function readAnswer(result) {
  const box = result && typeof result === 'object' ? result : {}
  const granted = box.ok ? readGrant(box.body) : null
  if (granted) return { state: 'granted', grant: granted }
  const status = String((box.body && box.body.status) || '').toLowerCase()
  if (status === 'expired' || status === 'denied' || status === 'rejected' || status === 'canceled' || status === 'cancelled') {
    return { state: 'error', reason: status }
  }
  if (box.status === 404 || box.status === 410) return { state: 'error', reason: 'expired' }
  if (box.status === 401 || box.authFailed) return { state: 'error', reason: 'rejected' }
  return { state: 'pending' }
}

/**
 * One request with the transient-status retry budget.
 *
 * A refusal that is not on the list is the service's settled answer and is
 * returned at once — retrying a 4xx only delays the message the user needs.
 */
async function send(url, options, fetchJson) {
  let last = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const result = await fetchJson(url, options)
    if (result && result.ok) return result
    last = result
    const status = Number(result && result.status)
    if (!TRANSIENT.has(status) && status !== 0) return result
    if (attempt === ATTEMPTS - 1) break
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS * (attempt + 1)))
  }
  return last || { ok: false, error: 'request failed' }
}

/**
 * The sign-in state machine.
 *
 * `onGrant` is awaited before the state flips to `granted`, so a page that
 * sees the success also sees the credential already stored — otherwise a
 * refresh would race the write and show the old "未配置" row.
 */
export function createDeviceLogin({
  secrets,
  ref = 'OPENDESIGN_CONTROL_KEY',
  workspaceRef = 'OPENDESIGN_WORKSPACE_ID',
  fetchJson = requestJson,
  hostName = 'dsh',
  product = 'dsh-model-panel/unknown',
  clock = () => Date.now(),
  onGrant,
} = {}) {
  let state = null

  function snapshot() {
    const base = { ok: true, state: 'idle', userCode: null, activationUrl: null, expiresAt: null, intervalMs: DEFAULT_INTERVAL_MS, message: null }
    if (!state) return base
    const out = { ...base, state: state.state, userCode: state.userCode, activationUrl: state.activationUrl, expiresAt: state.until, intervalMs: state.intervalMs }
    if (state.message) out.message = state.message
    if (state.email) out.email = state.email
    if (state.state === 'pending' && clock() >= state.until) {
      // The approval window closed without an answer: say so on the next
      // snapshot instead of leaving a code that can no longer be approved.
      state = { ...state, state: 'error', message: 'approval expired' }
      return { ...out, state: 'error', message: 'approval expired' }
    }
    return out
  }

  async function start() {
    if (state && state.state === 'pending' && clock() < state.until) return snapshot()
    const begun = clock()
    const answer = await send(
      LOGIN_BASE + '/api/v1/cli/device-authorizations',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cliVersion: product, host: String(hostName || 'dsh'), profile: 'prod' }),
      },
      fetchJson,
    )
    const parsed = answer && answer.ok ? parseAuthorization(answer.body, begun) : null
    if (!parsed) {
      const detail = answer && answer.status ? 'HTTP ' + answer.status : (answer && answer.error) || 'no answer'
      state = { state: 'error', message: 'could not start a sign-in: ' + detail, userCode: null, activationUrl: null, until: begun, intervalMs: DEFAULT_INTERVAL_MS }
      return snapshot()
    }
    // One interval of grace before the first poll: a request fired in the same
    // millisecond the code was issued can only answer "pending" and would cost
    // a device-authorization round trip for nothing.
    state = { ...parsed, state: 'pending', nextPollAt: begun + parsed.intervalMs, message: null, email: null }
    return snapshot()
  }

  async function status() {
    if (!state) return snapshot()
    if (state.state !== 'pending') return snapshot()
    const now = clock()
    if (now >= state.until) return snapshot()
    if (now < state.nextPollAt) return snapshot()
    // The next poll is scheduled before the await: two concurrent page polls
    // must not both reach the token endpoint for the same device code.
    state = { ...state, nextPollAt: now + state.intervalMs }
    const answer = await send(
      LOGIN_BASE + '/api/v1/cli/device-authorizations/' + encodeURIComponent(state.deviceId) + '/token',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceSecret: state.deviceSecret }) },
      fetchJson,
    )
    const verdict = readAnswer(answer)
    if (verdict.state === 'granted') {
      const key = verdict.grant.controlKey
      let stored = false
      if (secrets && typeof secrets.write === 'function') {
        try {
          await secrets.write(ref, key)
          stored = true
        } catch {
          stored = false
        }
      }
      if (typeof onGrant === 'function') {
        try {
          await onGrant(key, verdict.grant)
        } catch {
          /* the credential is already stored; a follow-up may still fail */
        }
      }
      state = { ...state, state: stored ? 'granted' : 'error', email: verdict.grant.email || null, message: stored ? null : 'the credential store refused the key' }
      return snapshot()
    }
    if (verdict.state === 'error') {
      const reason = verdict.reason === 'rejected' ? 'the approval was refused' : 'the approval expired'
      state = { ...state, state: 'error', message: reason }
      return snapshot()
    }
    return snapshot()
  }

  /** Drop the pending authorization without touching a stored key. */
  function cancel() {
    state = null
    return snapshot()
  }

  return { start, status, cancel, snapshot, ref }
}
