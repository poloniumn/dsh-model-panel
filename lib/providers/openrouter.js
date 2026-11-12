import { planShape } from '../util.js'
import { decimal, optionalJson, requestError, requestJson, windowRow } from '../upstream.js'

/**
 * OpenRouter — two endpoints, two different permissions.
 *
 * `/api/v1/key` is readable by ANY inference key and reports the key's limit,
 * remaining credits, free-tier daily cap and lifetime usage.
 * `/api/v1/credits` reports total_credits − total_usage (the *current*
 * balance) but is only open to management / provisioning keys; a normal key
 * gets 403. The old adapter threw the whole row away over that 403. Here the
 * credits call is optional: when it fails we still show the key limit window.
 */
const KEY_URL = 'https://openrouter.ai/api/v1/key'
const CREDITS_URL = 'https://openrouter.ai/api/v1/credits'

export function parseOpenRouter(keyBody, creditBody) {
  const data = keyBody && typeof keyBody.data === 'object' ? keyBody.data : null
  if (!data) return null
  const windows = []
  const limit = decimal(data.limit)
  const remaining = decimal(data.limit_remaining)
  if (limit !== null && limit > 0 && remaining !== null) {
    const reset = String(data.limit_reset || 'period')
    windows.push(windowRow(reset === 'monthly' ? 'Monthly limit' : reset === 'weekly' ? 'Weekly limit' : reset === 'daily' ? 'Daily limit' : 'Key limit', ((limit - remaining) / limit) * 100, null))
  }
  const free = data.free_model_daily_requests || {}
  const freeLimit = decimal(free.limit)
  const freeUsed = decimal(free.used)
  if (freeLimit !== null && freeLimit > 0 && freeUsed !== null) {
    windows.push(windowRow('Free daily', (freeUsed / freeLimit) * 100, null))
  }

  const notes = []
  if (data.is_free_tier === true) notes.push('Free tier')
  const spend = decimal(data.usage)
  if (spend !== null) notes.push(`Lifetime spend ${spend} USD`)

  const credits = creditBody && typeof creditBody.data === 'object' ? creditBody.data : null
  const total = decimal(credits && credits.total_credits)
  const used = decimal(credits && credits.total_usage)
  if (total !== null && used !== null) {
    return {
      kind: 'money',
      amount: Math.max(0, total - used),
      currency: 'USD',
      notes,
    }
  }
  if (windows.length) {
    const first = windows[0]
    return {
      kind: 'plan',
      plan: null,
      notes,
      windows,
      ...planShape(first.usedPct, null),
    }
  }
  return null
}

export default {
  id: 'openrouter',
  label: 'OpenRouter',
  kind: 'money',
  order: 52,
  secret: { ref: 'OPENROUTER_API_KEY', type: 'key' },
  consoleUrl: 'https://openrouter.ai/settings/credits',
  setup: {},
  parseOpenRouter,
  async validate(key, ctx) {
    const row = await this.fetchSecret(key, ctx)
    return row.status === 'ok'
      ? { ok: true }
      : { ok: false, message: row.detail || 'credential rejected by OpenRouter' }
  },
  async fetchSecret(secret, ctx) {
    const key = typeof secret === 'string' ? secret : String((secret && secret.value) || '')
    const fetchImpl = (ctx && ctx.fetchImpl) || globalThis.fetch
    const keyResult = await requestJson(KEY_URL, { key, fetchImpl })
    if (!keyResult.ok) return requestError(keyResult)
    // A 403 here means "inference key", not "wrong key": degrade quietly.
    const credits = await optionalJson(CREDITS_URL, { key, fetchImpl })
    const shaped = parseOpenRouter(keyResult.body, credits)
    return shaped ? { status: 'ok', ...shaped } : { status: 'error', detail: 'unexpected key payload' }
  },
}
