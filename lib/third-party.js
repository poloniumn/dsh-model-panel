/**
 * Third-party channels (WorkBuddy / Trae / Qoder) as exposed by the
 * `dsh-connect` plugin (`dsh-workbuddy-trae-qoder-connect`).
 *
 * That plugin already signs in to each channel and publishes a loopback-only
 * status document with a credits label and a remaining ratio, so the card
 * re-reads that document instead of re-implementing three upstream protocols.
 * Any failure yields an empty list and the section disappears.
 */
import { num } from './util.js'

export const CONNECT_STATUS_PATH = '/plugins/dsh-connect/status'

export function mapChannels(doc) {
  const channels = doc && Array.isArray(doc.channels) ? doc.channels : []
  return channels
    .filter((channel) => channel && channel.state === 'signed-in')
    .map((channel) => {
      const credits = channel.credits || {}
      const progress = num(credits.progress)
      const value = num(credits.value)
      const packages = num(credits.packages)
      return {
        id: String(channel.id || ''),
        name: String(channel.displayName || channel.id || ''),
        kind: String(channel.kind || ''),
        label: typeof credits.label === 'string' ? credits.label : null,
        remainPct: progress === null ? null : Math.round(progress * 1000) / 10,
        ...(value === null ? {} : { value }),
        ...(packages === null ? {} : { packages }),
      }
    })
    .filter((row) => row.id !== '')
}

/** `base` is `http://127.0.0.1:<port>` — the host this request arrived on. */
export async function fetchThirdParty(base, timeoutMs = 8_000) {
  if (!base) return []
  try {
    const response = await fetch(`${base}${CONNECT_STATUS_PATH}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return []
    return mapChannels(await response.json())
  } catch {
    return []
  }
}