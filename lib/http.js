/**
 * Request trust fence shared by every route this plugin serves.
 *
 * The web server is bound to loopback, but a page on the open internet can
 * still drive the browser into calling `http://127.0.0.1:<port>` (DNS
 * rebinding / cross-site fetch). Every route therefore requires a loopback
 * Host header and a loopback-or-absent Origin header, and the state route also
 * asks the host's own `connection` service whether the peer is allowed.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

function hostname(host) {
  const text = String(host || '').trim().toLowerCase()
  if (!text) return null
  if (text.startsWith('[')) {
    const end = text.indexOf(']')
    return end > 0 ? text.slice(0, end + 1) : null
  }
  const colon = text.lastIndexOf(':')
  return colon > 0 ? text.slice(0, colon) : text
}

export function hostIsLoopback(host) {
  return LOOPBACK_HOSTS.has(hostname(host) || '')
}

export function originIsLoopback(origin) {
  if (origin === undefined || origin === null || String(origin).trim() === '') return true
  try {
    return LOOPBACK_HOSTS.has(new URL(String(origin)).hostname)
  } catch {
    return false
  }
}

export function loopbackRequest(req) {
  const headers = (req && req.headers) || {}
  return hostIsLoopback(headers.host) && originIsLoopback(headers.origin)
}

/** `Host: 127.0.0.1:3088` → `http://127.0.0.1:3088`, else null. */
export function loopbackBase(host) {
  const host_ = String(host || '').trim()
  if (!hostIsLoopback(host_)) return null
  if (!host_.includes(':')) return null
  return `http://${host_}`
}

/** Cross-site navigation hint: the browser tells us when it is not same-site. */
export function crossSite(req) {
  const headers = (req && req.headers) || {}
  if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return true
  return headers.origin !== undefined && headers.origin !== null && headers.origin !== '' && !originIsLoopback(headers.origin)
}

/** Read a small JSON body; returns null when it is missing or malformed. */
export async function readJsonBody(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  if (!chunks.length) return null
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(Buffer.byteLength(body)),
  })
  res.end(body)
}

export function sendEmpty(res, status) {
  res.writeHead(status, { 'Cache-Control': 'no-store' })
  res.end()
}