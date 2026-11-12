import { num, planShape } from '../util.js'
import { createQwenDiscount } from '../qwen-discount.js'

const GATEWAY = 'https://cs-data.qianwenai.com/data/api.json'
const ORIGIN = 'https://platform.qianwenai.com'
const PLAN_PAGE = 'https://platform.qianwenai.com/home/analytics/token-plan/individual'
// The console gateway requires this envelope on every call.
const CORNERSTONE = {
  domain: 'platform.qianwenai.com',
  consoleSite: 'QIANWENAI',
  console: 'ONE_CONSOLE',
  xsp_lang: 'zh-CN',
  protocol: 'V2',
  productCode: 'p_efm',
}
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const PLAN_NAMES = { lite: 'Lite', standard: '标准', pro: '专业', max: 'Max' }

function planName(code) {
  const key = String(code || '').trim().toLowerCase()
  if (!key) return null
  return PLAN_NAMES[key] || key.toUpperCase()
}

/**
 * One call to the qianwenai console gateway. `api` is the console RPC name and
 * `data` its input; the cookie is the signed-in console session.
 */
export async function qwenGateway(cookie, api, data, timeoutMs = 8_000) {
  const inner = { ...(data || {}), cornerstoneParam: { ...CORNERSTONE } }
  const query = new URLSearchParams({
    product: 'sfm_bailian',
    action: 'BroadScopeAspnGateway',
    region: 'cn-beijing',
  })
  const response = await fetch(`${GATEWAY}?${query.toString()}`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: PLAN_PAGE,
      Origin: ORIGIN,
      'User-Agent': UA,
    },
    body: new URLSearchParams({ params: JSON.stringify({ Api: api, Data: inner, V: '1.0' }) }).toString(),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!(response.headers.get('content-type') || '').includes('json')) {
    throw new Error(`cookie expired (HTTP ${response.status})`)
  }
  const payload = await response.json()
  let box = payload && payload.data
  if (box && box.DataV2) box = box.DataV2.data
  const code = box && box.code
  if (code !== 'SUCCESS' && code !== 200 && code !== '200') {
    throw new Error(String((box && (box.errorMsg || box.msg)) || `gateway ${code}`).slice(0, 120))
  }
  return (box && box.data) || {}
}

/** Reads the subscription + usage the console shows on the Token Plan page. */
export async function qwenSubscription(cookie) {
  // The console RPC occasionally answers NotLogined for a session that is
  // still valid, so retry the login-gated reads once before believing it.
  let sub
  try {
    sub = await qwenGateway(cookie, 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription', {
      commodityCode: 'sfm_tokenplansolo_public_cn',
    })
  } catch (first) {
    if (!/NotLogined|NotLogin/i.test(String((first && first.message) || first))) throw first
    sub = await qwenGateway(cookie, 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription', {
      commodityCode: 'sfm_tokenplansolo_public_cn',
    })
  }
  const usage = await qwenGateway(cookie, 'zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage')
  const ratio = num(usage.per1MonthPercentage)
  return {
    specCode: sub.specCode || null,
    planStatus: sub.status ? String(sub.status) : null,
    endAt: num(sub.endTime) ?? num(usage.per1MonthResetTime),
    usedPct: ratio === null ? null : ratio * 100,
  }
}

/** Cheap validity probe used by the setup page. */
export async function qwenValidate(cookie) {
  try {
    const result = await qwenSubscription(cookie)
    return { ok: true, plan: planName(result.specCode) }
  } catch (error) {
    const text = String((error && error.message) || error)
    // The console RPC reports an expired session as a business error code.
    const expired = /NotLogined|NotLogin|Login\.|session|login/i.test(text) || /HTTP 4\d\d/.test(text)
    return { ok: false, status: expired ? 'expired' : 'error', message: text.slice(0, 120) }
  }
}

/**
 * Qwen Token Plan. There is no key-based API: the numbers only exist behind
 * the qianwenai console session, so the secret is the console `Cookie` header.
 * Night discounts come from the model catalog and are re-read once a day
 * (see `lib/qwen-discount.js`), not on every balance refresh.
 */
/** What every Qwen adapter instance shares. */
const BASE = {
  id: 'qwen-token-plan-cn',
  label: 'Qwen',
  kind: 'plan',
  order: 30,
  secret: { ref: 'QWEN_TOKEN_PLAN_COOKIE', type: 'cookie' },
  consoleUrl: 'https://platform.qianwenai.com/home/billing/subscription/token-plan',
  setup: { consoleUrl: 'https://platform.qianwenai.com/home/billing/subscription/token-plan' },
}

/**
 * Builds the Qwen adapter. The night-discount cache holds a fetch timestamp,
 * so it lives on the instance rather than on the module.
 */
function createQwenPlan({ cacheDir }) {
  const discount = createQwenDiscount({ cacheDir, gateway: qwenGateway })

  return {
    async validate(cookie) {
      // The setup form expects `{ ok, message, plan }`; never let it throw.
      const result = await qwenValidate(cookie)
      return result.ok
        ? { ok: true, plan: result.plan || null, message: result.plan ? `Token Plan · ${result.plan}` : 'ok' }
        : { ok: false, message: `cookie expired or rejected (${result.message || result.status})` }
    },
    async fetchSecret(cookie) {
      const sub = await qwenSubscription(cookie)
      let nightBadges = []
      let nightWindow = null
      try {
        const state = await discount.current(cookie)
        nightBadges = state.badges || []
        nightWindow = state.window || null
      } catch { /* the discount is optional — the row still renders */ }
      return {
        status: 'ok',
        plan: planName(sub.specCode),
        planStatus: sub.planStatus,
        nightBadges,
        nightWindow,
        ...planShape(sub.usedPct, sub.endAt),
      }
    },
  }
}

export default {
  create: createQwenPlan,
  ...BASE,
}