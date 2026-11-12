import { num } from '../util.js'

/**
 * OpenCode Go — three rolling windows.
 *
 * `GET https://opencode.ai/zen/go/v1/usage` with a bearer key returns
 * `{ usage: { rolling: {percent, resetsAt}, weekly: {...}, monthly: {...} } }`
 * where `percent` is the fraction **used**.
 */
const WINDOWS = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'rolling', label: '5-hour' },
]

export function parseOpencodeUsage(body) {
  const usage = body && body.usage ? body.usage : {}
  const windows = WINDOWS.map(({ key, label }) => {
    const entry = usage[key] || {}
    const raw = num(entry.percent)
    const used = raw === null ? null : Math.max(0, Math.min(100, raw))
    const at = entry.resetsAt ? Date.parse(entry.resetsAt) : NaN
    return {
      label,
      usedPct: used,
      remainPct: used === null ? null : 100 - used,
      resetAt: Number.isFinite(at) ? at : null,
    }
  })
  const primary = windows[0]
  return {
    plan: 'Go',
    usedPct: primary.usedPct,
    remainPct: primary.remainPct,
    endAt: primary.resetAt,
    remainingDays: primary.resetAt ? Math.max(0, Math.floor((primary.resetAt - Date.now()) / 86_400_000)) : null,
    windows,
  }
}

export default {
  id: 'opencode-go',
  label: 'OpenCode',
  kind: 'plan',
  order: 35,
  secret: {
    ref: 'OPENCODE_GO_API_KEY',
    type: 'key',
    // pi-ai's built-in Go route reads OPENCODE_API_KEY (shared with the Zen
    // wallet); a separately saved Go key is named OPENCODE_GO_API_KEY. Both
    // names refer to the same subscription credential — accept either one,
    // dedicated name first. Recognising only one produces the confusing
    // "model works but quota says no credential" state.
    aliases: ['OPENCODE_API_KEY'],
  },
  url: 'https://opencode.ai/zen/go/v1/usage',
  consoleUrl: 'https://opencode.ai/console/workspace',
  windows: true,
  parsePlan: parseOpencodeUsage,
  setup: {},
}