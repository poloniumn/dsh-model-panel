import { parseBeijing, planShape } from '../util.js'

const PLAN_NAMES = { lite: 'Lite', standard: '标准', pro: '专业', max: 'Max' }

function planName(code) {
  const key = String(code || '').trim().toLowerCase()
  if (!key) return null
  return PLAN_NAMES[key] || key.toUpperCase()
}

/**
 * MiMo Token Plan
 * `{object:'token_plan', plan_code, auto_renew, period:{end_at}, quota:{used_credits,total_credits}}`
 *
 * The night rate (0.8x, i.e. 8折 between 00:00–08:00 Beijing) is published on
 * the plan FAQ page, so the window and the rate are scraped there once a day;
 * the defaults below are the documented values.
 */
export default {
  id: 'xiaomi-token-plan-cn',
  label: 'MIMO',
  kind: 'plan',
  order: 21,
  secret: { ref: 'XIAOMI_TOKEN_PLAN_CN_API_KEY', type: 'key' },
  url: 'https://token-plan-cn.xiaomimimo.com/v1/platform/token_plan',
  consoleUrl: 'https://platform.xiaomimimo.com/console/plan-manage',
  parsePlan(body) {
    if (!body || body.object !== 'token_plan') return null
    const quota = body.quota || {}
    const total = Number(quota.total_credits)
    const used = Number(quota.used_credits)
    const usedPct = Number.isFinite(total) && total > 0 && Number.isFinite(used) ? (used / total) * 100 : null
    return {
      plan: planName(body.plan_code),
      autoRenew: body.auto_renew === true,
      ...planShape(usedPct, parseBeijing(body.period && body.period.end_at)),
    }
  },
  meta(row, state) {
    const mimo = state.schedules?.mimo
    if (!mimo) return
    row.nightWindow = mimo.window
    if (row.status === 'ok') row.nightBadges = [{ discount: mimo.discount, models: [] }]
  },
  setup: {},
}