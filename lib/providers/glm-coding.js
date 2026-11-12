import { num } from '../util.js'
import { requestError, requestJson, timestamp, windowRow } from '../upstream.js'

/**
 * Z.ai / BigModel coding-plan quota.
 *
 * The old adapter said "no public balance API" and rendered a bare console
 * link. dsh-subusage 0.24.5 documents the real console endpoint — and the two
 * regions do NOT authenticate the same way:
 *
 *   international  GET https://api.z.ai/api/monitor/usage/quota/limit
 *                   `Authorization: <key>`  (bare, NO `Bearer`)
 *   China          GET https://open.bigmodel.cn/api/monitor/usage/quota/limit?type=1
 *                   `Authorization: Bearer <key>`
 *
 * `data.limits[]` mixes several pools; only CREDIT_LIMIT / TOKENS_LIMIT with
 * unit 3 (5-hour) or 6 (weekly) are model quota, and `percentage` is USED,
 * not remaining. `data.level` is the plan tier.
 */
export function parseZaiQuota(body) {
  const data = body && typeof body.data === 'object' ? body.data : null
  if (!data || !Array.isArray(data.limits)) return null
  const windows = []
  for (const limit of data.limits) {
    if (!limit || !['CREDIT_LIMIT', 'TOKENS_LIMIT'].includes(limit.type)) continue
    const unit = limit.type === 'TOKENS_LIMIT' && limit.unit === undefined ? 3 : num(limit.unit)
    if (unit !== 3 && unit !== 6) continue
    const used = num(limit.percentage)
    if (used === null) continue
    windows.push(windowRow(unit === 3 ? '5-hour' : 'Weekly', used, timestamp(limit.nextResetTime)))
  }
  if (!windows.length) return null
  const first = windows[0]
  return {
    kind: 'plan',
    plan: typeof data.level === 'string' ? data.level : null,
    windows,
    usedPct: first.usedPct,
    remainPct: first.remainPct,
    endAt: first.resetAt,
    remainingDays: first.resetAt
      ? Math.max(0, Math.floor((first.resetAt - Date.now()) / 86_400_000))
      : null,
  }
}

export function makeZaiAdapter(region = 'cn') {
  const intl = region !== 'cn'
  return {
    id: intl ? 'zai-coding' : 'zai-coding-cn',
    aliases: intl ? [] : ['glm-coding'],
    label: intl ? 'Z.ai' : 'GLM Coding',
    kind: 'plan',
    order: intl ? 51 : 50,
    secret: {
      ref: intl ? 'ZAI_CODING_API_KEY' : 'ZAI_CODING_CN_API_KEY',
      type: 'key',
    },
    url: intl
      ? 'https://api.z.ai/api/monitor/usage/quota/limit'
      : 'https://open.bigmodel.cn/api/monitor/usage/quota/limit?type=1',
    consoleUrl: intl ? 'https://z.ai/subscribe' : 'https://open.bigmodel.cn/',
    setup: {},
    parseZaiQuota,
    async validate(key, ctx) {
      const row = await this.fetchSecret(key, ctx)
      return row.status === 'ok'
        ? { ok: true }
        : { ok: false, message: row.detail || 'credential rejected by Z.ai' }
    },
    async fetchSecret(secret, ctx) {
      const key = typeof secret === 'string' ? secret : String((secret && secret.value) || '')
      const result = await requestJson(this.url, {
        key,
        auth: intl ? 'raw' : 'bearer',
        fetchImpl: (ctx && ctx.fetchImpl) || globalThis.fetch,
      })
      if (!result.ok) return requestError(result)
      const shaped = parseZaiQuota(result.body)
      return shaped ? { status: 'ok', ...shaped } : { status: 'error', detail: 'unexpected quota payload' }
    },
  }
}

export const zaiInternational = makeZaiAdapter('intl')

export default makeZaiAdapter('cn')
