import { num, pick, planShape } from '../util.js'
import { decimal, optionalJson, requestError, requestJson, timestamp, windowRow } from '../upstream.js'

/** `{data:{available_balance, voucher_balance}}` on the Moonshot open platform. */
function parseMoonshot(body) {
  const amount = num(pick(body, 'data.available_balance'))
  if (amount === null) return null
  return { amount, currency: 'CNY', bonus: num(pick(body, 'data.voucher_balance')) }
}

const USAGE_URL = 'https://api.kimi.com/coding/v1/usages'
const ME_URL = 'https://api.kimi.com/coding/v1/me'

/**
 * Kimi Coding `/coding/v1/usages` has two generations of payload: new accounts
 * report ratio pools (`limit_5h` / `limit_7d` / `limit_month_total`), older
 * ones report absolute `limits[]` plus a top-level `usage`. Neither field set
 * is guaranteed, so unknown windows are skipped rather than inferred.
 */
export function parseKimiUsage(body) {
  const pools = [body && body.usages, body && body.usage, body && body.limits]
    .filter((value) => value && typeof value === 'object' && !Array.isArray(value))
  const windows = []
  for (const [field, label] of [
    ['limit_5h', '5-hour'],
    ['limit_7d', 'Weekly'],
    ['limit_month_total', 'Monthly'],
  ]) {
    const row = pools.map((pool) => pool[field]).find((value) => value !== undefined)
    if (!row || typeof row !== 'object') continue
    const ratio = decimal(row.used_ratio)
    if (ratio === null) continue
    windows.push(windowRow(label, ratio * 100, timestamp(row.reset_time)))
  }
  if (!windows.length) {
    const absolute = (row, label) => {
      const limit = decimal(row && row.limit)
      const remaining = decimal(row && row.remaining)
      if (limit === null || limit <= 0 || remaining === null) return
      windows.push(windowRow(label, ((limit - remaining) / limit) * 100, timestamp(row && row.resetTime)))
    }
    const burst = (Array.isArray(body && body.limits) ? body.limits : [])
      .find((row) => row && row.window && row.window.duration === 300 && row.window.timeUnit === 'TIME_UNIT_MINUTE')
    if (burst) absolute(burst.detail, '5-hour')
    if (body && typeof body.usage === 'object') absolute(body.usage, 'Weekly')
  }
  if (!windows.length) return null
  const first = windows[0]
  return { windows, ...planShape(first.usedPct, first.resetAt) }
}

function walletUrl(providerId) {
  return providerId === 'moonshotai'
    ? 'https://api.moonshot.ai/v1/users/me/balance'
    : 'https://api.moonshot.cn/v1/users/me/balance'
}

/**
 * Kimi / Moonshot: one adapter, two billing models.
 *
 * `kimi-coding` is a subscription route whose numbers only exist on
 * `api.kimi.com` (`/coding/v1/usages`). The `moonshotai*` routes are
 * pay-as-you-go wallets on `api.moonshot.*`. The subscription endpoint is
 * tried first with a short timeout and silently falls back to the wallet, so
 * a key from either platform still produces a row.
 */
export default {
  id: 'kimi-coding',
  aliases: ['moonshotai-cn', 'moonshotai'],
  label: 'Kimi',
  kind: 'money',
  order: 40,
  secret: { ref: 'KIMI_API_KEY', type: 'key' },
  url: 'https://api.moonshot.cn/v1/users/me/balance',
  consoleUrl: 'https://platform.moonshot.cn/console',
  /** The international host needs its own url. */
  urlFor(providerId) {
    return walletUrl(providerId)
  },
  consoleUrlFor(providerId) {
    return providerId === 'moonshotai'
      ? 'https://platform.moonshot.ai/console'
      : 'https://platform.moonshot.cn/console'
  },
  /** Regional hosts resolve different credential refs by default. */
  secretFor(providerId) {
    return providerId === 'kimi-coding'
      ? { ref: 'KIMI_API_KEY', type: 'key' }
      : { ref: 'MOONSHOT_API_KEY', type: 'key' }
  },
  labelFor(providerId) {
    if (providerId === 'moonshotai') return 'Moonshot'
    if (providerId === 'moonshotai-cn') return 'Kimi 开放平台'
    return 'Kimi'
  },
  orderFor(providerId) {
    return providerId === 'kimi-coding' ? 40 : providerId === 'moonshotai-cn' ? 41 : 42
  },
  parseKey(body) {
    return parseMoonshot(body)
  },
  parseKimiUsage,
  async fetchSecret(secret, ctx) {
    const key = typeof secret === 'string' ? secret : String((secret && secret.value) || '')
    const rowId = ctx && ctx.row && ctx.row.id
    const fetchImpl = (ctx && ctx.fetchImpl) || globalThis.fetch

    if (rowId === 'kimi-coding') {
      const usage = await requestJson(USAGE_URL, { key, timeoutMs: 4_000, fetchImpl })
      if (usage.ok) {
        const shaped = parseKimiUsage(usage.body)
        if (shaped) {
          const me = await optionalJson(ME_URL, { key, timeoutMs: 4_000, fetchImpl })
          return {
            status: 'ok',
            kind: 'plan',
            plan: me && typeof me.user_level_name === 'string' ? me.user_level_name : null,
            ...shaped,
          }
        }
      }
    }

    // Pay-as-you-go wallet (and the fallback when the coding endpoint is
    // unavailable for this key).
    const result = await requestJson(walletUrl(rowId), { key, fetchImpl })
    if (!result.ok) return requestError(result)
    const money = parseMoonshot(result.body)
    return money
      ? { status: 'ok', kind: 'money', ...money }
      : { status: 'error', detail: 'unexpected balance payload' }
  },
}
