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
/** Cache shape version; a document written by an older build is refetched. */
const SCHEMA = 2
const BADGE_RE = /(\d+(?:\.\d+)?)\s*折/
const WINDOW_RE = /(\d{1,2}):(\d{2})\s*[-–—~至到]\s*(?:次日\s*)?(\d{1,2}):(\d{2})/

/**
 * Model key used to compare a profile id with a catalog id/display name.
 *
 * The console advertises the promotion per model and the same night window can
 * carry several groups (4 折 for `auto`/Qwen3.8, 5 折 for DeepSeek-V4). Ids and
 * display names drift independently — the profile may hold
 * `deepseek-v4.1-flash-1017` while the catalog lists `DeepSeek-V4.1-Flash` —
 * so both sides are folded to lowercase letters and digits with the revision
 * suffix removed before they are compared.
 */
export function normalizeModelKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
    .replace(/\d{2,4}$/, '')
}

/**
 * `[{discount:'4', ids:['auto','qwen3.8-flash'], keys:[…], names:[…]}]` from
 * `listTokenPlanModels`.
 *
 * Every group keeps its whole model list. The console shows the promotion on
 * each covered model (the `auto` row is just one of them), so collapsing a
 * group to its `auto` entry would hide the models the user actually runs.
 */
export function parseBadges(list) {
  const groups = new Map()
  for (const model of list || []) {
    const label = String(model.badgeLabel || '')
    const desc = String(model.badgeDescription || '')
    if (!label.includes('夜间') && !WINDOW_RE.test(desc)) continue
    const match = BADGE_RE.exec(desc) || BADGE_RE.exec(label)
    if (!match) continue
    const id = String(model.modelId || '')
    let name = model.name
    try {
      const parsed = JSON.parse(model.name || '{}')
      if (parsed && parsed['zh-CN']) name = parsed['zh-CN']
    } catch { /* keep the raw name */ }
    name = String(name || id)
    if (!groups.has(match[1])) groups.set(match[1], { ids: [], names: [] })
    const group = groups.get(match[1])
    if (id && group.ids.indexOf(id) < 0) group.ids.push(id)
    if (name && group.names.indexOf(name) < 0) group.names.push(name)
  }
  return [...groups.entries()]
    .map(([discount, group]) => ({
      discount,
      ids: group.ids,
      keys: [...new Set(group.ids.concat(group.names).map(normalizeModelKey).filter(Boolean))],
      names: group.names,
    }))
    .sort((a, b) => Number(a.discount) - Number(b.discount))
}

/**
 * Groups cached before this build only carried display names (`models`). They
 * are lifted into the current shape instead of waiting for the next fetch, so
 * an upgraded install keeps its schedule even when the fetch fails.
 */
export function upgradeBadges(badges) {
  return (Array.isArray(badges) ? badges : []).map((badge) => {
    const raw = badge && typeof badge === 'object' ? badge : {}
    const ids = Array.isArray(raw.ids) ? raw.ids.map(String) : []
    const names = Array.isArray(raw.names)
      ? raw.names.map(String)
      : Array.isArray(raw.models) ? raw.models.map(String) : []
    const keys = [...new Set(ids.concat(names).map(normalizeModelKey).filter(Boolean))]
    return { discount: String(raw.discount || ''), ids, keys, names }
  })
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
      schema: SCHEMA,
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
    if (cached && cached.schema === SCHEMA && Array.isArray(cached.badges)
      && typeof cached.nextAt === 'number' && now < cached.nextAt) {
      return cached
    }
    try {
      return await fetchNow(cookie)
    } catch (error) {
      if (!cached) throw error
      // A schedule fetched by an older build only carried display names; lift
      // it into the current shape so the installed panel keeps working even
      // while the console is unreachable.
      const retry = { ...cached, schema: SCHEMA, badges: upgradeBadges(cached.badges), nextAt: now + 3_600_000 }
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