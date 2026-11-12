/**
 * Vendor catalogue for the providers that speak a plain HTTP quota/balance
 * protocol. One entry declares the endpoints, the auth *mode*, and a pure
 * `parse` function; `makeVendor` turns it into an adapter.
 *
 * Why one table instead of a file per vendor: these adapters differ only in
 * their wire contract, and keeping the contracts side by side makes the
 * differences (bare Authorization, x-api-key POST, secondary endpoints that
 * may fail, unit conversions) auditable. The contracts come from
 * dsh-subusage 0.24.5, where each one was checked against a real account.
 *
 * Deliberately NOT ported: anything that needs a local OAuth login file,
 * a QR scan or an IAM HMAC signature (Grok / Codex / Copilot / Volcengine /
 * MiMo console / Command Code). Those need the host's credential-record and
 * login services, which this plugin does not inject.
 */
import { num, planShape } from '../util.js'
import { decimal, requestError, requestJson, timestamp, windowRow } from '../upstream.js'

/** `windowRow[]` → the plan row shape the card renders. */
function planResult(windows, { plan = null, endAt = null, notes = [] } = {}) {
  const first = windows[0] || {}
  return {
    kind: 'plan',
    plan,
    notes,
    windows,
    ...planShape(first.usedPct, endAt ?? first.resetAt),
  }
}

function moneyResult(amount, currency, bonus = null) {
  return { kind: 'money', amount: Math.round(amount * 100) / 100, currency, ...(bonus === null ? {} : { bonus }) }
}

/** Convert a window length in seconds into a stable label. */
function windowLabel(seconds) {
  if (seconds === null || seconds <= 0) return 'Period'
  if (seconds <= 6 * 3600) return '5-hour'
  if (seconds <= 36 * 3600) return 'Daily'
  if (seconds <= 8 * 86400) return 'Weekly'
  if (seconds <= 32 * 86400) return 'Monthly'
  return 'Period'
}

const SPECS = [
  // ── wallet balances ────────────────────────────────────────────────────
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    order: 55,
    ref: 'SILICONFLOW_API_KEY',
    consoleUrl: 'https://cloud.siliconflow.cn/account/expense',
    endpoints: [{ name: 'info', url: 'https://api.siliconflow.cn/v1/user/info' }],
    // `GET /v1/user/info` (bearerAuth) answers data.balance / totalBalance.
    // No currency field: the platform bills in CNY, so say CNY, not USD.
    parse: ({ info }) => {
      const data = info && typeof info.data === 'object' ? info.data : null
      if (!data) return null
      const total = decimal(data.totalBalance) ?? decimal(data.balance) ?? decimal(data.chargeBalance)
      return total === null ? null : moneyResult(total, 'CNY')
    },
  },
  {
    id: 'novita',
    label: 'Novita AI',
    order: 56,
    ref: 'NOVITA_API_KEY',
    consoleUrl: 'https://novita.ai/settings/billing',
    endpoints: [{ name: 'balance', url: 'https://api.novita.ai/openapi/v1/billing/balance/detail' }],
    // availableBalance is a decimal string in 1/10000 USD (10000 = $1.00).
    parse: ({ balance }) => {
      const raw = decimal(balance && balance.availableBalance)
      return raw === null ? null : moneyResult(raw / 10000, 'USD')
    },
  },
  {
    id: 'hyperbolic',
    label: 'Hyperbolic',
    order: 57,
    ref: 'HYPERBOLIC_API_KEY',
    consoleUrl: 'https://app.hyperbolic.ai/settings/billing',
    endpoints: [{ name: 'balance', url: 'https://api.hyperbolic.ai/v2/customer/balance' }],
    parse: ({ balance }) => {
      const cents = decimal(balance && balance.balanceCents)
      return cents === null ? null : moneyResult(cents / 100, 'USD')
    },
  },
  {
    id: 'deepinfra',
    label: 'DeepInfra',
    order: 58,
    ref: 'DEEPINFRA_API_KEY',
    consoleUrl: 'https://deepinfra.com/dash/billing',
    endpoints: [{ name: 'checklist', url: 'https://api.deepinfra.com/payment/checklist?compute_owed=true' }],
    // Prepaid funds arrive as a NEGATIVE stripe_balance; positive means owed.
    // A negative amount survives the card's "hide empty wallets" filter.
    parse: ({ checklist }) => {
      const raw = decimal(checklist && checklist.stripe_balance)
      return raw === null ? null : moneyResult(-raw, 'USD')
    },
  },
  {
    id: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    order: 59,
    ref: 'AI_GATEWAY_API_KEY',
    consoleUrl: 'https://vercel.com/dashboard/ai-gateway',
    endpoints: [{ name: 'credits', url: 'https://ai-gateway.vercel.sh/v1/credits' }],
    parse: ({ credits }) => {
      const raw = decimal(credits && credits.balance) ?? decimal(credits && credits.data && credits.data.balance)
      return raw === null ? null : moneyResult(raw, 'USD')
    },
  },

  // ── subscription windows ───────────────────────────────────────────────
  {
    id: 'ollama-cloud',
    label: 'Ollama Cloud',
    order: 60,
    ref: 'OLLAMA_API_KEY',
    consoleUrl: 'https://ollama.com/settings',
    // Bare Authorization, NOT Bearer — copying the generic header fails here.
    endpoints: [{ name: 'usage', url: 'https://ollama.com/api/usage', auth: 'raw' }],
    parse: ({ usage }) => {
      const limits = usage && typeof usage.limits === 'object' ? usage.limits : {}
      const windows = []
      for (const [field, label] of [['session', 'Session'], ['weekly', 'Weekly'], ['monthly', 'Monthly']]) {
        const fraction = decimal(limits[field] && limits[field].usage)
        if (fraction === null) continue
        windows.push(windowRow(label, fraction * 100, null))
      }
      return windows.length ? planResult(windows) : null
    },
  },
  {
    id: 'chutes',
    label: 'Chutes',
    order: 61,
    ref: 'CHUTES_API_KEY',
    consoleUrl: 'https://chutes.ai/app',
    endpoints: [{ name: 'quota', url: 'https://api.chutes.ai/users/me/quota_usage/me' }],
    // The endpoint does not report a reset time, so do not invent one.
    parse: ({ quota }) => {
      const limit = decimal(quota && quota.quota)
      const used = decimal(quota && quota.used)
      if (limit === null || used === null || limit <= 0) return null
      return planResult([windowRow('Quota', (used / limit) * 100, null)])
    },
  },
  {
    id: 'synthetic',
    label: 'Synthetic',
    order: 62,
    ref: 'SYNTHETIC_API_KEY',
    consoleUrl: 'https://dev.synthetic.new/dashboard',
    endpoints: [{ name: 'quotas', url: 'https://api.synthetic.new/v2/quotas' }],
    parse: ({ quotas }) => {
      const sub = quotas && quotas.subscription
      const used = decimal(sub && sub.requests)
      const limit = decimal(sub && sub.limit)
      if (used === null || limit === null || limit <= 0) return null
      return planResult([windowRow('Requests', (used / limit) * 100, timestamp(sub.renewsAt))])
    },
  },
  {
    id: 'nanogpt',
    label: 'NanoGPT',
    order: 63,
    ref: 'NANOGPT_API_KEY',
    consoleUrl: 'https://nano-gpt.com/account',
    endpoints: [
      // A management key uses a different host from a regular subscription key.
      {
        name: 'usage',
        url: (key) => String(key || '').startsWith('sk-nano-mgmt-')
          ? 'https://nano-gpt.com/api/management/v1/subscription/usage'
          : 'https://api.nano-gpt.com/api/subscription/v1/usage',
      },
      // Balance is a SEPARATE endpoint: x-api-key + POST {}, optional because
      // its failure must not wipe out the subscription windows.
      {
        name: 'balance',
        url: 'https://nano-gpt.com/api/check-balance',
        auth: 'x-api-key',
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
        optional: true,
      },
    ],
    parse: ({ usage, balance }) => {
      if (!usage || typeof usage.active !== 'boolean') return null
      const windows = []
      for (const [field, label] of [
        ['dailyInputTokens', 'Daily'],
        ['weeklyInputTokens', 'Weekly'],
        ['tokens', 'Tokens'],
      ]) {
        const row = usage[field]
        const pct = decimal(row && row.percentUsed)
        if (pct === null) continue
        windows.push(windowRow(label, pct * 100, timestamp(row && row.resetAt)))
      }
      const notes = []
      const usd = decimal(balance && balance.usd_balance)
      if (usd !== null) notes.push(`${usd} USD wallet`)
      if (!windows.length && !notes.length) return null
      // No windows (inactive subscription) but a wallet balance: show money.
      if (!windows.length && usd !== null) return moneyResult(usd, 'USD')
      return planResult(windows, { plan: typeof usage.state === 'string' ? usage.state : null, notes })
    },
  },
  {
    id: 'minimax-cn',
    label: 'MiniMax',
    order: 64,
    ref: 'MINIMAX_CN_API_KEY',
    consoleUrl: 'https://platform.minimaxi.com/user-center/balance',
    endpoints: [{ name: 'remains', url: 'https://api.minimaxi.com/v1/token_plan/remains' }],
    // MiniMax reports auth failures as HTTP 200 + base_resp.status_code.
    check: ({ remains }) => {
      const code = num(remains && remains.base_resp && remains.base_resp.status_code)
      if (code === null || code === 0) return null
      if ([1004, 2049].includes(code)) return { status: 'expired', detail: 'MiniMax subscription key rejected' }
      if ([1001, 1002].includes(code)) return { status: 'error', detail: 'MiniMax quota endpoint unavailable' }
      return { status: 'error', detail: `MiniMax status ${code}` }
    },
    parse: ({ remains }) => {
      const list = Array.isArray(remains && remains.model_remains) ? remains.model_remains : []
      const general = list.filter((row) => row && row.model_name === 'general')
      const candidates = general.length
        ? general
        : list.filter((row) => row && /^MiniMax-M/i.test(String(row.model_name || '')))
      if (candidates.length !== 1) return null
      const row = candidates[0]
      const windows = []
      for (const [prefix, label, end] of [
        ['current_interval', '5-hour', 'end_time'],
        ['current_weekly', 'Weekly', 'weekly_end_time'],
      ]) {
        const status = num(row[`${prefix}_status`])
        if (status === 3) continue // unlimited / not enabled — do not draw 0%
        const total = decimal(row[`${prefix}_total_count`])
        const remaining = decimal(row[`${prefix}_remaining_percent`])
        let usedPct = null
        if (status === 2) usedPct = 100
        else if (remaining !== null) usedPct = 100 - remaining
        else if (total !== null && total > 0) {
          const count = decimal(row[`${prefix}_usage_count`])
          if (count !== null) usedPct = (count / total) * 100
        }
        if (usedPct === null) continue
        windows.push(windowRow(label, usedPct, timestamp(row[end])))
      }
      return windows.length ? planResult(windows) : null
    },
  },
  {
    id: 'zenmux',
    label: 'ZenMux',
    order: 65,
    ref: 'ZENMUX_MANAGEMENT_API_KEY',
    consoleUrl: 'https://zenmux.ai/console/subscription',
    // A Management key is required; a normal inference key is rejected.
    endpoints: [
      { name: 'subscription', url: 'https://zenmux.ai/api/v1/management/subscription/detail', optional: true },
      { name: 'balance', url: 'https://zenmux.ai/api/v1/management/payg/balance', optional: true },
    ],
    parse: ({ subscription, balance }) => {
      const data = subscription && typeof subscription.data === 'object' ? subscription.data : {}
      const windows = []
      for (const [field, label] of [['quota_5_hour', '5-hour'], ['quota_7_day', 'Weekly']]) {
        const q = data[field]
        const pct = q && typeof q === 'object' ? decimal(q.usage_percentage) : null
        if (pct === null) continue
        windows.push(windowRow(label, pct * 100, timestamp(q.resets_at)))
      }
      const wallet = balance && typeof balance.data === 'object' ? balance.data : {}
      const total = decimal(wallet.total_credits)
      const currency = String(wallet.currency || 'USD').toUpperCase()
      const notes = total === null ? [] : [`${total} ${currency} PAYG`]
      if (!windows.length && total !== null) return moneyResult(total, currency)
      if (!windows.length) return null
      return planResult(windows, { plan: (data.plan && data.plan.tier) || null, notes })
    },
  },
  {
    id: 'apigoto',
    label: 'APIGOTO',
    order: 66,
    ref: 'APIGOTO_API_KEY',
    consoleUrl: 'https://apigoto.com/console',
    // One Bearer GET returns both the subscription window and the wallet.
    endpoints: [{ name: 'usage', url: 'https://api.apigoto.com/v1/usage' }],
    parse: ({ usage }) => {
      if (!usage || typeof usage !== 'object') return null
      const sub = usage.subscription && typeof usage.subscription === 'object' ? usage.subscription : {}
      const windows = []
      const used = decimal(sub.used)
      const limit = decimal(sub.limit)
      if (used !== null && limit !== null && limit > 0) {
        // The window length is reported, never inferred from the plan name.
        windows.push(windowRow(windowLabel(decimal(sub.window_sec)), (used / limit) * 100, null))
      }
      const notes = []
      const wallet = decimal(usage.balance_usd)
      if (wallet !== null) notes.push(`${wallet} USD wallet`)
      const expires = timestamp(sub.expires_at)
      if (expires) notes.push(`Plan ends ${new Date(expires).toISOString().slice(0, 10)}`)
      if (!windows.length && wallet !== null) return moneyResult(wallet, 'USD')
      if (!windows.length) return null
      return planResult(windows, { plan: sub.plan_name || null, notes })
    },
  },
]

/**
 * Build one adapter from a spec. `parse` is kept on the adapter so the wire
 * contracts can be unit-tested without any network access.
 */
export function makeVendor(spec) {
  return {
    id: spec.id,
    aliases: spec.aliases,
    label: spec.label,
    kind: 'money',
    order: spec.order,
    consoleUrl: spec.consoleUrl,
    secret: { ref: spec.ref, type: 'key', ...(spec.refAliases ? { aliases: spec.refAliases } : {}) },
    setup: {},
    // Both pure contracts are exposed so the wire behaviour is unit-testable
    // without a network call.
    parse: spec.parse,
    check: spec.check,
    /** The setup page probes the primary endpoint before storing a pasted key. */
    async validate(key, ctx) {
      const primary = spec.endpoints.find((endpoint) => !endpoint.optional)
      if (!primary) return { ok: true }
      const value = String(key || '')
      const url = typeof primary.url === 'function' ? primary.url(value) : primary.url
      const result = await requestJson(url, {
        key: value,
        auth: primary.auth || 'bearer',
        method: primary.method || 'GET',
        ...(primary.body !== undefined ? { body: primary.body } : {}),
        ...(primary.headers ? { headers: primary.headers } : {}),
        fetchImpl: (ctx && ctx.fetchImpl) || globalThis.fetch,
      })
      if (result.ok) return { ok: true }
      return {
        ok: false,
        message: result.authFailed
          ? 'credential rejected by the vendor'
          : String(result.error || 'vendor did not answer').slice(0, 120),
      }
    },
    async fetchSecret(secret, ctx) {
      const key = typeof secret === 'string' ? secret : String((secret && secret.value) || '')
      const fetchImpl = (ctx && ctx.fetchImpl) || globalThis.fetch
      const bodies = {}
      for (const endpoint of spec.endpoints) {
        const url = typeof endpoint.url === 'function' ? endpoint.url(key) : endpoint.url
        const result = await requestJson(url, {
          key,
          auth: endpoint.auth || 'bearer',
          method: endpoint.method || 'GET',
          ...(endpoint.body !== undefined ? { body: endpoint.body } : {}),
          ...(endpoint.headers ? { headers: endpoint.headers } : {}),
          ...(endpoint.timeoutMs ? { timeoutMs: endpoint.timeoutMs } : {}),
          fetchImpl,
        })
        if (!result.ok) {
          if (endpoint.optional) { bodies[endpoint.name] = undefined; continue }
          return requestError(result)
        }
        bodies[endpoint.name] = result.body
      }
      // Secondary endpoints are allowed to fail; requiring at least one answer
      // keeps a row from being rendered out of nothing.
      if (!Object.values(bodies).some((body) => body !== undefined)) {
        return { status: 'error', detail: 'no upstream endpoint answered' }
      }
      if (typeof spec.check === 'function') {
        const failure = spec.check(bodies)
        if (failure) return failure
      }
      let shaped
      try {
        shaped = spec.parse(bodies)
      } catch (err) {
        return { status: 'error', detail: String((err && err.message) || err).slice(0, 140) }
      }
      if (!shaped) return { status: 'error', detail: 'unexpected balance payload' }
      return { status: 'ok', ...shaped }
    },
  }
}

// MiniMax International is a different host and a different key; the quota
// payload shape is identical, so it reuses the CN adapter's pure contracts.
const minimaxCn = SPECS.find((spec) => spec.id === 'minimax-cn')
SPECS.push({
  id: 'minimax',
  label: 'MiniMax Intl',
  order: 67,
  ref: 'MINIMAX_API_KEY',
  consoleUrl: 'https://www.minimax.io/platform',
  endpoints: [{ name: 'remains', url: 'https://api.minimax.io/v1/token_plan/remains' }],
  check: minimaxCn.check,
  parse: minimaxCn.parse,
})

export const VENDORS = SPECS.map(makeVendor)
