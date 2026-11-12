/**
 * Small helpers shared by every provider: number coercion, path lookup, HTTP
 * with a timeout, and a few time choices used by the scraped schedules.
 */

export const FETCH_TIMEOUT_MS = 8_000

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Finite number or null. */
export function num(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Read one dot-separated path out of a parsed JSON body. */
export function pick(root, path) {
  let cur = root
  for (const key of String(path).split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = cur[key]
  }
  return cur
}

/** Clamp into [0, 100]; null passes through. */
export function clampPct(value) {
  const n = num(value)
  return n === null ? null : Math.max(0, Math.min(100, n))
}

/** `{ usedPct, remainPct, endAt, remainingDays }` — the shared plan row shape. */
export function planShape(usedPct, endAt) {
  const used = clampPct(usedPct)
  const remainPct = used === null ? null : 100 - used
  const remainingDays = endAt ? Math.max(0, Math.floor((endAt - Date.now()) / 86_400_000)) : null
  return { usedPct: used, remainPct, endAt: endAt ?? null, remainingDays }
}

/** Local midnight key `YYYY-MM-DD`. */
export function todayKey(now = new Date()) {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/** Epoch ms of the next local `HH:MM` strictly after `fromMs`. */
export function nextLocalTime(fromMs, hour, minute = 0) {
  const next = new Date(fromMs)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= fromMs) next.setDate(next.getDate() + 1)
  return next.getTime()
}

/** `"2026-11-30 23:59:59"` in Beijing time → epoch ms. */
export function parseBeijing(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(text || ''))
  if (!match) return null
  return Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4] - 8, +match[5], +match[6])
}

/** GET JSON with a bearer key. Errors are returned, never thrown. */
export async function getJson(url, key) {
  // Some vendors (opencode.ai) reset the first connection to the node client
  // now and then; one quiet retry turns that into a normal answer.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await getJsonOnce(url, key)
    } catch (err) {
      if (attempt >= 1) return { ok: false, error: String((err && err.message) || err).slice(0, 160) }
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }
}

async function getJsonOnce(url, key) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!response.ok) {
    const message = (body && (body.error?.message || body.message || body.msg)) || `HTTP ${response.status}`
    return { ok: false, error: String(message).slice(0, 160) }
  }
  return { ok: true, body }
}

/** GET a page and reduce it to plain text (for the published price pages). */
export async function getText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent': UA,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const html = await response.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
}

/**
 * Map a vendor failure onto a row status the panel can explain.
 * `expired` means "your credential is no longer accepted".
 */
export function errorState(message) {
  const raw = String(message || '').trim()
  if (/notlogined|not.?login|sign.?in|unauthor|登录|invalid|expired|forbidden|401|403/i.test(raw)) {
    return { status: 'expired', detail: raw.slice(0, 140) }
  }
  return { status: 'error', detail: /timeout|aborted/i.test(raw) ? 'timeout' : raw.slice(0, 140) }
}