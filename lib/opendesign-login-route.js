/**
 * `POST /dsh-model-panel/login.json` — the three actions the settings page
 * needs for OpenDesign's browser approval.
 *
 * `start`   opens a device authorization and returns the code and the link.
 * `status`  polls the token endpoint when the next poll is due. The page
 *           drives the cadence; the host keeps no interval of its own, so an
 *           unloaded plugin leaves no timer behind.
 * `cancel`  forgets a pending authorization without touching a stored key.
 *
 * The response never carries the credential: the grant is written into the
 * credential store inside the state machine, and the page then re-reads the
 * ordinary settings list to watch the row turn into "已配置".
 */
import { readJsonBody, sendEmpty, sendJson } from './http.js'

const ACTIONS = new Set(['start', 'status', 'cancel'])

/** Build the handler; `denied` is the host's own loopback/cross-site guard. */
export function createLoginHandler({ login, denied }) {
  return async function handleLogin(req, res) {
    try {
      const code = denied(req)
      if (code) return sendEmpty(res, code)
      if (req.method && req.method !== 'POST') return sendEmpty(res, 405)
      const body = await readJsonBody(req, 64 * 1024)
      if (!body || typeof body !== 'object') return sendJson(res, 400, { ok: false, error: 'invalid body' })
      const action = typeof body.action === 'string' ? body.action : ''
      if (!ACTIONS.has(action)) return sendJson(res, 400, { ok: false, error: 'unknown action: ' + action })
      const state =
        action === 'start' ? await login.start() : action === 'cancel' ? login.cancel() : await login.status()
      return sendJson(res, 200, state)
    } catch (err) {
      try {
        return sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 200) })
      } catch {
        return undefined
      }
    }
  }
}
