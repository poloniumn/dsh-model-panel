/**
 * Peak / discount windows, scraped from the vendors' public price pages.
 *
 * No vendor exposes these in an API, and they change with pricing updates, so
 * each page is fetched **once a day** (04:00 local) and cached in
 * `<cacheDir>/schedules.json`. A failed fetch keeps the previous schedule.
 *
 * To teach the plugin a new vendor's window, add a `scrape` entry:
 *   { url, parse(text) => { window?, weekdays?, windows?, discount?, source } }
 * and read it in the client through `row.peakSchedule` / `row.nightWindow`.
 */
import { getText, nextLocalTime } from './util.js'
import { readJson, writeJson } from './cache.js'

export const DEFAULTS = {
  deepseek: {
    weekdays: [1, 2, 3, 4, 5],
    windows: [
      { startMinute: 540, endMinute: 720 },
      { startMinute: 840, endMinute: 1080 },
    ],
    source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  },
  mimo: {
    window: { startHour: 0, startMinute: 0, endHour: 8, endMinute: 0 },
    discount: '8',
    source: 'https://mimo.mi.com/docs/zh-CN/quick-start/faq/token-plan/Plans%26Pricing',
  },
}

/** "北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00" */
const DS_PEAK_RE = /周[一二三四五六日][^0-9]{0,20}?(\d{1,2}):(\d{2})\s*[-–—~至到]\s*(\d{1,2}):(\d{2})、\s*(\d{1,2}):(\d{2})\s*[-–—~至到]\s*(\d{1,2}):(\d{2})/
/** "非高峰期（北京时间 0:00-8:00 …） 0.8x Credits" */
const MIMO_NIGHT_RE = /北京时间\s*(\d{1,2}):(\d{2})\s*[-–—~至到]\s*(\d{1,2}):(\d{2})/
const MIMO_RATE_RE = /(\d+(?:\.\d+)?)\s*[x×]\s*Credits/

export function parseDeepseekPeak(text) {
  const match = DS_PEAK_RE.exec(String(text || ''))
  if (!match) return null
  const toMin = (h, m) => Number(h) * 60 + Number(m)
  return {
    weekdays: [1, 2, 3, 4, 5],
    windows: [
      { startMinute: toMin(match[1], match[2]), endMinute: toMin(match[3], match[4]) },
      { startMinute: toMin(match[5], match[6]), endMinute: toMin(match[7], match[8]) },
    ],
    source: DEFAULTS.deepseek.source,
  }
}

export function parseMimoNight(text) {
  const match = MIMO_NIGHT_RE.exec(String(text || ''))
  if (!match) return null
  const rate = MIMO_RATE_RE.exec(String(text || ''))
  return {
    // 0.8x → "8" (折); a missing rate keeps the documented 8折.
    discount: rate ? String(Math.round(Number(rate[1]) * 10)) : DEFAULTS.mimo.discount,
    window: {
      startHour: Number(match[1]),
      startMinute: Number(match[2]),
      endHour: Number(match[3]),
      endMinute: Number(match[4]),
    },
    source: DEFAULTS.mimo.source,
  }
}

export function createSchedules({ cacheDir }) {
  const file = `${cacheDir}/schedules.json`
  let inflight = null

  async function fetchAll(cached) {
    const next = { ...(cached || {}) }
    const jobs = [
      ['deepseek', DEFAULTS.deepseek.source, parseDeepseekPeak],
      ['mimo', DEFAULTS.mimo.source, parseMimoNight],
    ]
    for (const [key, url, parse] of jobs) {
      try {
        const parsed = parse(await getText(url))
        if (parsed) next[key] = parsed
      } catch { /* keep the previous schedule */ }
    }
    next.fetchedAt = Date.now()
    next.nextAt = nextLocalTime(Date.now(), 4)
    writeJson(file, next)
    return next
  }

  /** Cached schedules; refreshes once a day. Never throws. */
  async function current() {
    const cached = readJson(file)
    if (cached && typeof cached.nextAt === 'number' && Date.now() < cached.nextAt) return cached
    if (inflight) return inflight
    inflight = fetchAll(cached)
      .catch(() => cached || { ...DEFAULTS })
      .finally(() => { inflight = null })
    return inflight
  }

  return { current, file }
}