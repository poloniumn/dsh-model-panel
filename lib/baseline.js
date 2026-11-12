/**
 * Today's consumption, accumulated from successive readings.
 *
 * Each refresh gives a new sample. The baseline keeps the previous reading
 * (`last`) and how much was used so far today (`today`):
 *
 *   money rows  — a DROP is usage.  A rise (top-up, refund) is ignored: the
 *                 anchor is re-based at the new level and the sample is dropped.
 *   plan rows   — a RISE in used% is usage. A drop is a billing-period reset and
 *                 is ignored the same way.
 *
 * The document lives at `<cacheDir>/baseline.json`:
 *   { date: 'YYYY-MM-DD', values: { [rowId]: { last, today } } }
 * and starts over at local midnight.
 */
import { readJson, writeJson } from './cache.js'
import { todayKey } from './util.js'

export function createBaseline(file) {
  let doc = null

  function load() {
    const key = todayKey()
    const cached = readJson(file)
    if (cached && cached.date === key && cached.values && typeof cached.values === 'object') {
      doc = cached
    } else {
      doc = { date: key, values: {} }
    }
    return doc
  }

  function current() {
    if (!doc || doc.date !== todayKey()) load()
    return doc
  }

  /**
   * Feed one sample and return how much was used today.
   * `lowerIsUsage` is true for money rows, false for plan rows.
   */
  function sample(id, value, lowerIsUsage, precision = 100) {
    const doc = current()
    const round = (v) => Math.round(v * precision) / precision
    const entry = doc.values[id]
    if (!entry || typeof entry.last !== 'number') {
      doc.values[id] = { last: value, today: 0 }
      return 0
    }
    if (value === entry.last) return entry.today
    const isUsage = lowerIsUsage ? value < entry.last : value > entry.last
    if (isUsage) entry.today = round(entry.today + Math.abs(value - entry.last))
    // Re-anchor either way, so the direction that is not usage never counts.
    entry.last = value
    return entry.today
  }

  function flush() {
    if (doc) writeJson(file, doc)
  }

  /** Forget one row (used when a provider is disabled). */
  function forget(id) {
    const doc = current()
    if (doc.values[id]) {
      delete doc.values[id]
      writeJson(file, doc)
    }
  }

  return { sample, flush, forget, read: current }
}