import { FETCH_TIMEOUT_MS, UA, errorState, getJson, num, parseBeijing, planShape } from '../util.js'

const PLAN_NAMES = { lite: 'Lite', standard: '标准', pro: '专业', max: 'Max' }

const CONSOLE = 'https://platform.xiaomimimo.com'
const API = CONSOLE + '/api/v1'
const KEY_URL = 'https://token-plan-cn.xiaomimimo.com/v1/platform/token_plan'

function planName(code) {
  const key = String(code || '').trim().toLowerCase()
  if (!key) return null
  return PLAN_NAMES[key] || key.toUpperCase()
}

/** Epoch ms from either an epoch number (s or ms) or a date string. */
function epoch(value) {
  const n = num(value)
  if (n !== null) return n > 1e12 ? n : n * 1000
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * One console read with the signed-in session cookie — the same three
 * endpoints the balance page itself calls. A console answer is
 * `{ code: 0, data: … }`; a rejected session shows up as 401/403 or as a
 * non-zero code.
 */
async function consoleGet(path, cookie) {
  const response = await fetch(API + path, {
    method: 'GET',
    headers: {
      Cookie: cookie,
      Origin: CONSOLE,
      Referer: CONSOLE + '/#/console/balance',
      'x-timezone': 'UTC+08:00',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent': UA,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error('console cookie expired (HTTP ' + response.status + ')')
  }
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) throw new Error('HTTP ' + response.status)
  const code = body && typeof body === 'object' ? body.code : null
  if (code !== null && code !== undefined && ![0, 200, '0', '200'].includes(code)) {
    throw new Error(String((body && (body.msg || body.message)) || 'console code ' + code).slice(0, 120))
  }
  return body
}

/** The plan pool the console publishes: month-to-date first, then the month cap. */
function pickPool(group, name) {
  const items = group && Array.isArray(group.items) ? group.items : []
  return items.find((item) => item && item.name === name) || null
}

/**
 * Balances and plan usage from the console. Both are independent: a wallet may
 * be unreadable while the plan is live, and a plan may be absent on a wallet-
 * only account, so each half stands on its own.
 */
function consoleRow(balanceBody, detailBody, usageBody) {
  const wallet = balanceBody && balanceBody.data && typeof balanceBody.data === 'object' ? balanceBody.data : null
  const amount = wallet ? num(wallet.balance) : null
  const currency = wallet && /^[A-Z]{3}$/.test(String(wallet.currency || '')) ? String(wallet.currency) : 'CNY'
  const data = (usageBody && usageBody.data) || {}
  const detail = (detailBody && detailBody.data) || {}
  const pools = [pickPool(data.usage, 'plan_total_token'), pickPool(data.monthUsage, 'month_total_token')].filter(Boolean)
  // A pool with limit 0 has nothing left to divide by; prefer a readable one.
  const pool = pools.find((row) => num(row.limit) !== 0) || pools[0] || null
  const percent = pool ? num(pool.percent) : null
  const plan = detail.planName || detail.planCode || null
  const autoRenew = detail.autoRenew === true || detail.auto_renew === true
  const endAt = epoch(detail.currentPeriodEnd) ?? parseBeijing(detail.currentPeriodEnd)

  if (percent === null && amount === null) {
    return { status: 'error', detail: 'console answer carries no balance and no plan usage' }
  }
  if (percent === null) {
    return { kind: 'money', status: 'ok', amount, currency, plan: planName(plan), autoRenew }
  }
  return {
    kind: 'plan',
    status: 'ok',
    plan: planName(plan),
    autoRenew,
    amount,
    currency,
    ...planShape(percent * 100, endAt),
  }
}

/**
 * MiMo Token Plan.
 *
 * The console session cookie is the verified path (the console reads
 * /balance, /tokenPlan/detail and /tokenPlan/usage with it); a Token Plan API
 * key is kept as a fallback for installs that only ever configured one.
 */
export default {
  id: 'xiaomi-token-plan-cn',
  label: 'MIMO',
  kind: 'plan',
  order: 21,
  secret: {
    ref: 'XIAOMI_TOKEN_PLAN_CN_COOKIE',
    type: 'cookie',
    fallbacks: [{ ref: 'XIAOMI_TOKEN_PLAN_CN_API_KEY' }],
  },
  url: KEY_URL,
  consoleUrl: CONSOLE + '/console/plan-manage',
  setup: {},

  /** `{object:'token_plan', plan_code, auto_renew, period:{end_at}, quota:{used_credits,total_credits}}` */
  parsePlan(body) {
    if (!body || body.object !== 'token_plan') return null
    const quota = body.quota || {}
    const total = num(quota.total_credits)
    const used = num(quota.used_credits)
    const usedPct = total !== null && total > 0 && used !== null ? (used / total) * 100 : null
    return {
      plan: planName(body.plan_code),
      autoRenew: body.auto_renew === true,
      ...planShape(usedPct, parseBeijing(body.period && body.period.end_at)),
    }
  },

  async fetchSecret(secret, ctx) {
    const auth = (ctx && ctx.auth) || 'cookie'
    if (auth !== 'cookie') {
      const result = await getJson(KEY_URL, secret)
      if (!result.ok) return errorState(result.error)
      const plan = this.parsePlan(result.body)
      if (!plan || plan.usedPct === null) return { status: 'error', detail: 'unexpected plan payload' }
      return { status: 'ok', ...plan }
    }
    let balance = null
    let detail = null
    let usage = null
    const settled = await Promise.allSettled([
      consoleGet('/balance', secret),
      consoleGet('/tokenPlan/detail', secret),
      consoleGet('/tokenPlan/usage', secret),
    ])
    const failure = settled.find((item) => item.status === 'rejected')
    if (failure) return errorState(String((failure.reason && failure.reason.message) || failure.reason))
    ;[balance, detail, usage] = settled.map((item) => (item.status === 'fulfilled' ? item.value : null))
    return consoleRow(balance, detail, usage)
  },

  meta(row, state) {
    const mimo = state.schedules?.mimo
    if (!mimo) return
    row.nightWindow = mimo.window
    if (row.status === 'ok') row.nightBadges = [{ discount: mimo.discount, models: [] }]
  },
}
