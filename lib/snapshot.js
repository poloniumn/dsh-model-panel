/**
 * Answer cache: 60s cache, in-flight de-duplication, and the on-disk seed.
 *
 * A cold process has no cache, and a full provider sweep is seconds of
 * network. So the first caller gets the last state that was written to disk
 * (still a real answer, just not a new one) while the sweep runs, and the
 * next call — the refresh the panel schedules a moment later — hands over
 * the fresh numbers.
 */
import fs from 'node:fs'
import path from 'node:path'

export const CACHE_TTL_MS = 60_000

/**
 * How long the last answered state may still be shown while a fresh one is
 * being collected. The card used to wait for the whole provider sweep (several
 * seconds after a restart) with an empty panel; the previous answer is good
 * enough for that first paint, and the refresh lands a moment later.
 */
export const STALE_TTL_MS = 30 * 60_000

export function createSnapshot({ cacheDir, collect }) {
  let cache = null
  let cacheAt = 0
  let inflight = null

  /**
   * The last state the browser asked for, on disk. Balance rows never carry a
   * credential value, so this file is safe to keep — and it is the only way to
   * see why a provider rendered no number when the panel itself is closed.
   */
  const diagnosticsFile = () => path.join(cacheDir, 'last-state.json')

  let lastWritten = ''
  let dirReady = false

  /**
   * Fire-and-forget: a refresh must not block on a diagnostic file, and an
   * unchanged payload (the common case on a 60s re-answer) writes nothing.
   */
  function recordDiagnostics(state) {
    let text
    try {
      text = JSON.stringify({ at: new Date().toISOString(), rows: state.rows, thirdParty: state.thirdParty }, null, 1)
    } catch {
      return
    }
    const stamp = text.slice(0, 120)
    if (stamp === lastWritten) return
    lastWritten = stamp
    const write = () => {
      fs.promises.writeFile(diagnosticsFile(), text).catch(() => {})
    }
    if (dirReady) {
      write()
      return
    }
    dirReady = true
    fs.promises
      .mkdir(cacheDir, { recursive: true })
      .then(write)
      .catch(() => {})
  }

  /**
   * The last state this plugin answered with, read back at startup. It is
   * written for diagnostics anyway, so the very first request after a restart
   * can be answered from disk instead of waiting for 24 vendor adapters.
   * Returns null when the file is missing, unreadable or too old.
   */
  function readDiagnostics() {
    try {
      const data = JSON.parse(fs.readFileSync(diagnosticsFile(), 'utf8'))
      if (!data || !Array.isArray(data.rows)) return null
      const at = Date.parse(data.at)
      if (!Number.isFinite(at) || Date.now() - at > STALE_TTL_MS) return null
      return {
        state: { ok: true, updatedAt: at, rows: data.rows, thirdParty: Array.isArray(data.thirdParty) ? data.thirdParty : [] },
        at,
      }
    } catch {
      return null
    }
  }

  /** The collect pass, de-duplicated; never rejects. */
  function refresh(base) {
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const next = await collect(base)
        recordDiagnostics(next)
        cache = next
        cacheAt = Date.now()
        return next
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err).slice(0, 200) }
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  /**
   * Answer immediately with what we have; warm the 60s cache in the background.
   *
   * The answer is flagged `stale`: the browser draws it right away and asks
   * again in a moment, which is how a cold start goes from "empty panel for
   * eight seconds" to "numbers now, better numbers a second later".
   */
  function staleWhileRevalidate(seed, base) {
    refresh(base).catch(() => {
      /* a failed refresh keeps the previous answer on screen */
    })
    return Promise.resolve({ ...seed.state, stale: true })
  }

  /**
   * 60s cache + inflight de-duplication; never rejects.
   *
   * A cold process has no cache, and a full provider sweep is seconds of
   * network. So the first caller gets the last state that was written to disk
   * (still a real answer, just not a new one) while the sweep runs, and the
   * next call — the refresh the panel schedules a moment later — hands over
   * the fresh numbers.
   */
  function snapshot(base) {
    if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return Promise.resolve(cache)
    // Somebody is already collecting: the re-asked request waits for the real
    // numbers instead of being served the same stale seed again.
    if (inflight) return inflight
    const seed = cache ? { state: cache } : readDiagnostics()
    if (seed) return staleWhileRevalidate(seed, base)
    return refresh(base)
  }

  return { snapshot, refresh, readDiagnostics, diagnosticsFile }
}
