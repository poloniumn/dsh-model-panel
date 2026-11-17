/**
 * The HTTP surface: the trust fence every route passes, the response wrapper
 * they share, and the JSON endpoints (state, settings, secret, subagent).
 *
 * Split out of index.js. The web server is bound to loopback, but a page on
 * the open internet can still drive the browser into calling
 * `http://127.0.0.1:<port>` (DNS rebinding / cross-site fetch), so every route
 * asks the fence first.
 */
import { crossSite, loopbackBase, loopbackRequest, readJsonBody, sendEmpty, sendJson } from './http.js'

/** Closed when the host says the peer may not call us, or it is cross-site. */
export function createFence({ get }) {
  return function denied(req) {
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
}

/**
 * One handler shape for every route: fence, business body, and a 500 that never
 * rejects. The web server must not see an unhandled rejection, so the error
 * branch swallows even a broken response write.
 */
export function fenced(denied, handler) {
  return async function route(req, res) {
    try {
      const code = denied(req)
      if (code) return sendEmpty(res, code)
      return await handler(req, res)
    } catch (err) {
      try {
        return sendJson(res, 500, { ok: false, error: String((err && err.message) || err).slice(0, 200) })
      } catch {
        return undefined
      }
    }
  }
}

export function createRoutes({ snapshot, cookieSetup }) {
  function handleState(req, res) {
    return snapshot(loopbackBase(req.headers && req.headers.host)).then((state) =>
      sendJson(res, state && state.ok ? 200 : 500, state)
    )
  }

  /** Cookie-backed setup entries: what is stored, and what it unlocks. */
  function handleSettings(req, res) {
    if (req.method && req.method !== 'GET') return sendEmpty(res, 405)
    return cookieSetup.list().then((entries) =>
      sendJson(res, 200, { ok: true, updatedAt: Date.now(), entries, total: entries.length })
    )
  }

  /**
   * Store or drop one credential. The value is never echoed back.
   *
   * A cookie value may arrive as a raw header or as a whole exported file
   * (Cookie-Editor JSON, a Netscape cookies.txt, a `{name: value}` map); the
   * setup module normalises all of them into one header.
   */
  async function handleSecret(req, res) {
    if (req.method && req.method !== 'POST') return sendEmpty(res, 405)
    // An exported cookies file is posted as the value, so the default 64 KB
    // body limit is too tight for a browser profile's full cookie set.
    const body = await readJsonBody(req, 512 * 1024)
    if (!body || typeof body !== 'object') return sendJson(res, 400, { ok: false, error: 'invalid body' })
    const action = body.action === 'clear' ? 'clear' : 'save'
    // `ref` picks one credential row of a provider that owns several
    // (OpenDesign: control key / workspace id / console cookie). Absent,
    // the id alone resolves as before.
    const ref = typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim() : undefined
    const result =
      action === 'clear'
        ? await cookieSetup.clear(body.id, ref)
        : await cookieSetup.save(body.id, body.value, ref)
    return sendJson(res, result && result.ok ? 200 : 400, result)
  }

  return { handleState, handleSettings, handleSecret }
}

/** Query parameter of the subagent route: which session the row is drawn for. */
function sessionFromUrl(url) {
  const text = String(url || '')
  const at = text.indexOf('?')
  if (at < 0) return ''
  const value = new URLSearchParams(text.slice(at + 1)).get('session')
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/**
 * The per-session "subagents" switch. GET answers the current value, POST
 * stores a new one; `session` names the session (query string on GET, body on
 * POST) and is resolved to its root session by the gate.
 */
export function createSubagentRoute({ gate }) {
  async function handleSubagent(req, res) {
    if (req.method === 'GET' || req.method === undefined) {
      const sessionId = sessionFromUrl(req.url)
      const state = gate.state(sessionId)
      return sendJson(res, 200, { ok: true, enabled: state.enabled, source: state.source })
    }
    if (req.method !== 'POST') return sendEmpty(res, 405)
    const body = await readJsonBody(req)
    if (!body || typeof body !== 'object' || typeof body.enabled !== 'boolean') {
      return sendJson(res, 400, { ok: false, error: 'invalid body' })
    }
    const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : sessionFromUrl(req.url)
    const result = gate.setEnabled(sessionId, body.enabled)
    if (!result.ok) return sendJson(res, 400, result)
    return sendJson(res, 200, { ok: true, enabled: result.enabled, source: result.source })
  }

  return { handleSubagent }
}

/** Register every `{ path, handler }` pair on the host's web server. */
export function registerRoutes(ctx, routes) {
  ctx.inject(['webServer'], (inner) => {
    for (const route of routes) {
      inner.effect(
        () => inner.webServer.register({ kind: 'exact', path: route.path, handler: route.handler }),
        `route:${route.path}`
      )
    }
  })
}
