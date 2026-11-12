/**
 * Qwen night-discount schedule.
 *
 * The promotion (e.g. "每晚 20:00 - 次日 08:00，Credits 低至 4 折") is published
 * in the model catalog of the console, not in the subscription API. It changes
 * rarely, so it is fetched **once per night window start** instead of on every
 * balance refresh:
 *
 *   - the window start is read from the live badge copy, so if Qwen moves the
 *     start from 22:00 to 20:00 the next fetch is scheduled at 20:00;
 *   - a failed fetch keeps yesterday's badges and retries in an hour;
 *   - the state lives in `<cacheDir>/qwen-discount.json`.
 */
import { readJson, writeJson } from './cache.js'
import { nextLocalTime } from './util.js'

const DEFAULT_WINDOW = { startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 }
const BADGE_RE = /(\d+(?:\.\d+)?)\s*折/
const WINDOW_RE = /(\d{1,2}):(\d{2})\s*[-–—~至到]\s*(?:次日\s*)?(\d{1,2}):(\d{2})/

/**
 * `[{discount:'4', models:['Auto']}]` from `listTokenPlanModels`.
 * The console marks the promotion on the `auto` entry only, so when a discount
 * group has an `auto` row that is the one we show (other covered models carry
 * the same badge text in the catalog but "New" in the console).
 */
export function parseBadges(list) {
  const groups = new Map()
  for (const model of list || []) {
    const label = String(model.badgeLabel || '')
    const desc = String(model.badgeDescription || '')
    if (!label.includes('夜间') && !WINDOW_RE.test(desc)) continue
    const match = BADGE_RE.exec(desc) || BADGE_RE.exec(label)
    if (!match) continue
    let name = model.modelId
    try {
      const parsed = JSON.parse(model.name || '{}')
      if (parsed && parsed['zh-CN']) name = parsed['zh-CN']
    } catch { /* keep modelId */ }
    name = String(name).replace(/-(?:\d{4}|\d{2})$/, '')
    if (!groups.has(match[1])) groups.set(match[1], new Map())
    groups.get(match[1]).set(String(model.modelId || name), name)
  }
  return [...groups.entries()].map(([discount, models]) => ({
    discount,
    models: [...new Set((models.has('auto') ? new Map([['auto', models.get('auto')]]) : models).values())],
  }))
}

/** Window advertised by the badge copy, or null. */
export function parseWindow(list) {
  for (const model of list || []) {
    const match = WINDOW_RE.exec(`${model.badgeDescription || ''} ${model.badgeLabel || ''}`)
    if (!match) continue
    return {
      startHour: Number(match[1]),
      startMinute: Number(match[2]),
      endHour: Number(match[3]),
      endMinute: Number(match[4]),
    }
  }
  return null
}

export function createQwenDiscount({ cacheDir, gateway }) {
  const file = `${cacheDir}/qwen-discount.json`

  async function fetchNow(cookie) {
    const models = await gateway(cookie, 'zeldaHttp.dashscopeModel./zelda/api/v1/modelCenter/listTokenPlanModels', {
      input: { pageNo: 1, pageSize: 100, edition: 'PERSONAL' },
    })
    const list = models && models.list ? models.list : []
    const window = parseWindow(list) || { ...DEFAULT_WINDOW }
    const now = Date.now()
    const state = {
      badges: parseBadges(list),
      window,
      fetchedAt: now,
      nextAt: nextLocalTime(now, window.startHour, window.startMinute || 0),
    }
    writeJson(file, state)
    return state
  }

  async function current(cookie) {
    const now = Date.now()
    const cached = readJson(file)
    if (cached && Array.isArray(cached.badges) && typeof cached.nextAt === 'number' && now < cached.nextAt) {
      return cached
    }
    try {
      return await fetchNow(cookie)
    } catch (error) {
      if (!cached) throw error
      const retry = { ...cached, nextAt: now + 3_600_000 }
      writeJson(file, retry)
      return retry
    }
  }

  /** Force a fetch (setup page "refresh" button). */
  async function refresh(cookie) {
    return fetchNow(cookie)
  }

  return { current, refresh, file }
}

export { DEFAULT_WINDOW }