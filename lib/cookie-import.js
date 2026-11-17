/**
 * Import one browser cookie export, without retyping a header.
 *
 * A console cookie is a semicolon header, but the browsing tools people
 * actually have (Cookie-Editor, EditThisCookie, a browser's own "copy as
 * cURL") produce a file. This module turns the file into the header the
 * adapters expect, keeping only the cookies that belong to the provider:
 *
 *   - Cookie-Editor JSON export: an array of `{name, value, domain,
 *     expirationDate, session, httpOnly, ...}` objects.
 *   - EditThisCookie style: `{cookies: [...]}`.
 *   - Netscape `cookies.txt`: seven tab-separated fields, optionally prefixed
 *     with `#HttpOnly_`.
 *   - A header string that is already `name=value; name2=value2`.
 *
 * Domain filtering is permissive on purpose: when nothing in the file matches
 * the provider's domain, the whole file is used rather than producing an empty
 * header. A cookie the gateway ignores costs nothing; a silently empty header
 * costs a debugging session.
 */
import { normalizeCookie } from './secrets.js'

/**
 * Domains each provider's console session lives on. A cookie whose domain
 * ends with one of these is preferred; see the fallback above.
 *
 * An unlisted provider is not an error: the whole paste is used, which is
 * what a console whose session spans several hosts needs anyway. Listing a
 * vendor here only trims a large export down to the cookies that matter.
 */
const PROVIDER_DOMAINS = {
  'qwen-token-plan-cn': ['qianwenai.com', 'aliyun.com', 'aliyuncs.com'],
  'xiaomi-token-plan-cn': ['xiaomimimo.com', 'mi.com'],
  opendesign: ['open-design.ai'],
}

export function domainFilterFor(id) {
  return PROVIDER_DOMAINS[String(id || '')] || []
}

function hostOf(domain) {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^#httponly_/i, '')
    .replace(/^\*?/, '')
    .replace(/^\./, '')
}

function matchesHost(host, filters) {
  if (!host || !filters.length) return false
  return filters.some((filter) => host === filter || host.endsWith('.' + filter))
}

/** A cookie value that would break a semicolon-joined header is unusable. */
function cleanValue(value) {
  const text = String(value === undefined || value === null ? '' : value)
  if (!text) return null
  if (/[;\r\n]/.test(text)) return null
  return text
}

function fromJson(value, now) {
  let parsed = value
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.cookies)) return parsed.cookies
  if (parsed && Array.isArray(parsed.data)) return parsed.data
  if (parsed && typeof parsed === 'object') {
    // A plain `{name: value}` map is also what some exporters write.
    const map = Object.entries(parsed).filter(([, v]) => typeof v === 'string')
    if (map.length) return map.map(([name, v]) => ({ name, value: v }))
  }
  return null
}

function fromNetscape(text) {
  const out = []
  const lines = String(text).split(/\r?\n/)
  for (const line of lines) {
    const raw = line.replace(/^#HttpOnly_/i, '')
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const fields = line.replace(/^#HttpOnly_/i, '').split('\t')
    if (fields.length < 7) continue
    out.push({
      domain: fields[0],
      name: fields[5],
      value: fields.slice(6).join('\t'),
      expirationDate: Number(fields[4]) || 0,
    })
  }
  return out
}

/**
 * Turn any supported export into `{ ok, cookie, format, count, total, names,
 * domains, skipped }`. `ok: false` carries a short `reason`.
 */
export function parseCookieExport(input, { providerDomains = [], now = Date.now() } = {}) {
  const text = String(input === undefined || input === null ? '' : input).trim()
  if (!text) return { ok: false, reason: 'empty' }

  let candidates = null
  let format = 'header'

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const cookies = fromJson(JSON.parse(text), now)
      if (cookies) {
        candidates = cookies.filter((cookie) => cookie && typeof cookie === 'object')
        format = 'json'
      }
    } catch {
      candidates = null
    }
  }

  if (!candidates) {
    const netscape = fromNetscape(text)
    if (netscape.length) {
      candidates = netscape
      format = 'netscape'
    }
  }

  if (!candidates) {
    // Already a header string: nothing to extract, only to tidy.
    const cookie = normalizeCookie(text)
    if (!cookie) return { ok: false, reason: 'empty' }
    return {
      ok: true,
      format,
      cookie,
      count: cookie.split(';').filter((part) => part.trim()).length,
      total: 0,
      names: [],
      domains: [],
      skipped: 0,
    }
  }

  const usable = []
  const skipped = []
  const seenDomains = []
  for (const cookie of candidates) {
    const host = hostOf(cookie.domain)
    if (host) seenDomains.push(host)
    const name = String(cookie.name || '').trim()
    const value = cleanValue(cookie.value)
    if (!name || !/^[\w.#$%&+^|~-]+$/.test(name)) {
      skipped.push(name || '(unnamed)')
      continue
    }
    if (value === null) {
      skipped.push(name)
      continue
    }
    const expires = Number(cookie.expirationDate)
    const session = cookie.session === true
    if (!session && Number.isFinite(expires) && expires > 0 && expires * 1000 < now) {
      skipped.push(name)
      continue
    }
    usable.push({ name, value, host })
  }

  if (!usable.length) return { ok: false, reason: 'no-cookies', domains: seenDomains, skipped: skipped.length }

  const filters = (Array.isArray(providerDomains) ? providerDomains : []).filter(Boolean)
  const matched = filters.length ? usable.filter((cookie) => matchesHost(cookie.host, filters)) : []
  const picked = matched.length ? matched : usable

  // Later entries win: a file can carry the same name for several paths.
  const byName = new Map()
  for (const cookie of picked) byName.set(cookie.name, cookie.value)

  const header = normalizeCookie(
    [...byName.entries()].map(([name, value]) => name + '=' + value).join('; ')
  )
  if (!header) return { ok: false, reason: 'no-cookies', domains: seenDomains, skipped: skipped.length }

  return {
    ok: true,
    format,
    cookie: header,
    count: byName.size,
    total: usable.length,
    names: [...byName.keys()],
    domains: [...new Set(seenDomains)],
    skipped: skipped.length,
    // Cookies that were readable but belong to another site.
    filteredOut: matched.length ? usable.length - matched.length : 0,
    filtered: Boolean(matched.length),
  }
}
