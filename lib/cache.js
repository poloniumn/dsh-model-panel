/**
 * Small JSON document cache stored in the DSH home directory.
 *
 * Every piece of state this plugin keeps (today's baseline, the Qwen discount
 * schedule, the scraped price windows) is a single JSON document with an
 * optional `nextAt` timestamp. `readJson` / `writeJson` are the only place that
 * touches the disk, so a storage backend can be swapped in later without
 * changing any provider.
 */
import fs from 'node:fs'
import path from 'node:path'

/** Directory that holds the plugin's JSON documents. */
export function fileIn(dir, name) {
  return path.join(dir, name)
}

export function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

export function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data), 'utf8')
    return true
  } catch {
    // A failed write only costs us the cache; never break the card for it.
    return false
  }
}

export function removeJson(file) {
  try {
    fs.rmSync(file, { force: true })
  } catch { /* nothing to remove */ }
}