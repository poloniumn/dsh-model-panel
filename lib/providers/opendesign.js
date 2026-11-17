/**
 * OpenDesign (AMR) usage and wallet.
 *
 * Two different credentials exist on this vendor and they are not
 * interchangeable:
 *
 *   - the **runtime key** (`sk-amr-…`, the `apiKeyEnv` of the model route)
 *     only reaches `amr-link.open-design.ai/v1` — `/models` and
 *     `/chat/completions`. Every billing route answers 401 to it and the chat
 *     response carries no quota header. It cannot read usage, by design.
 *   - the **control key** (`vela_ctrl_…`, or a console Cookie) reaches
 *     `amr-api.open-design.ai/api/v1`: `/wallet/balance`,
 *     `/billing/summary` and `/workspaces/<id>/billing/preflight`.
 *
 * So the adapter keeps the model key for the route and asks for a control key
 * plus a workspace id through `secret.extras`. A missing control key is
 * reported as "needs a control key", never as a zero balance.
 *
 * All parsers below are pure and exported: the test suite exercises them
 * against the published contract (`packages/contracts/src/api/collab.ts`) with
 * no network and no host.
 */
import { errorState } from '../util.js'
import { decimal, requestJson, timestamp, windowLabel as upstreamWindowLabel, windowRow } from '../upstream.js'

const API = 'https://amr-api.open-design.ai'

/** Seconds → the window label the card shows. */
export function windowLabel(seconds) {
  return upstreamWindowLabel(seconds, 'Window')
}

/** `{workspaceId}` from `GET /api/v1/workspaces/current`, or null. */
export function parseWorkspace(body) {
  const box = body && typeof body === 'object' ? body : null
  if (!box) return null
  const inner = box.workspace && typeof box.workspace === 'object' ? box.workspace : box
  const id = String(inner.workspaceId || inner.id || '').trim()
  return id ? { workspaceId: id } : null
}

/** `WorkspaceWalletBalance` → `{balanceUsd, updatedAt}` (credits are strings). */
export function parseWallet(body) {
  const box = body && typeof body === 'object' ? body : null
  if (!box) return null
  const amount = decimal(box.balanceUsd)
  if (amount === null) return null
  return { balanceUsd: amount, updatedAt: timestamp(box.updatedAt) }
}

/** `WorkspaceBillingSummary` → tier / status, both optional. */
export function parseSummary(body) {
  const box = body && typeof body === 'object' ? body : null
  if (!box) return null
  const inner = box.summary && typeof box.summary === 'object' ? box.summary : box
  const tier = inner.membershipTier ? String(inner.membershipTier) : null
  const status = inner.subscriptionStatus ? String(inner.subscriptionStatus) : null
  if (!tier && !status) return null
  return { membershipTier: tier, subscriptionStatus: status }
}

/**
 * `WorkspaceBillingPreflight` → plan tier, funding source, balance and the
 * coding-plan windows.
 *
 * `windows[]` reports `usedCredits` / `limitCredits` / `remainingCredits` as
 * strings, so everything is parsed with `decimal`. A window with a missing or
 * non-positive limit is dropped: a percentage of nothing is not a number.
 */
export function parsePreflight(body) {
  const box = body && typeof body === 'object' ? body : null
  if (!box) return null
  const plan = box.codingPlan && typeof box.codingPlan === 'object' ? box.codingPlan : null
  const windows = []
  for (const raw of (plan && Array.isArray(plan.windows) ? plan.windows : [])) {
    if (!raw || typeof raw !== 'object') continue
    const limit = decimal(raw.limitCredits)
    if (limit === null || limit <= 0) continue
    const used = decimal(raw.usedCredits)
    const remaining = decimal(raw.remainingCredits)
    const usedPct = used !== null
      ? (used / limit) * 100
      : remaining !== null ? ((limit - remaining) / limit) * 100 : null
    if (usedPct === null) continue
    windows.push(windowRow(windowLabel(raw.durationSeconds), usedPct, timestamp(raw.resetsAt)))
  }
  const tier = plan && plan.tier ? String(plan.tier) : null
  const funding = box.funding ? String(box.funding) : null
  const balanceUsd = decimal(box.balanceUsd)
  const eligible = plan && typeof plan.eligible === 'boolean' ? plan.eligible : null
  if (!tier && !windows.length && balanceUsd === null) return null
  return { tier, funding, balanceUsd, eligible, windows }
}

function headersFor(ctx, workspaceId) {
  const extras = (ctx && ctx.extras) || {}
  const head = { accept: 'application/json' }
  if (extras.controlKey) head.authorization = 'Bearer ' + extras.controlKey
  else if (extras.cookie) head.cookie = extras.cookie
  if (workspaceId) head['x-vela-workspace-id'] = workspaceId
  return head
}

/** Whether this install can read usage at all. */
export function hasControlCredential(ctx) {
  const extras = (ctx && ctx.extras) || {}
  return Boolean(extras.controlKey || extras.cookie)
}

async function get(path, mode, ctx, workspaceId) {
  return requestJson(API + path, {
    auth: 'raw',
    headers: headersFor(ctx, workspaceId),
    timeoutMs: 6_000,
    // Tests drive the three billing endpoints through this hook; the panel
    // never passes one.
    fetchImpl: (ctx && ctx.fetchImpl) || undefined,
  })
}

/** Explain a failure in a way a user can act on. */
function failure(result, what) {
  if (result && result.status === 402) {
    return { status: 'error', detail: `${what}: 额度不足（上游拒绝）` }
  }
  if (result && result.authFailed) {
    return { status: 'expired', detail: `${what}: 控制键无效或不是控制键（运行时密钥读不到用量）` }
  }
  if (result && result.status === 404) {
    return { status: 'error', detail: `${what}: workspace id not found` }
  }
  return { ...errorState((result && result.error) || 'request failed'), detail: `${what}: ${(result && result.error) || 'request failed'}` }
}

async function fetchSecret(secret, ctx) {
  const extras = (ctx && ctx.extras) || {}
  if (!hasControlCredential(ctx)) {
    // The runtime key is present but it is the wrong kind of credential for
    // billing; say so instead of drawing a fabricated zero.
    return {
      status: 'no-control-key',
      detail: 'OpenDesign 用量需要控制键（vela_ctrl_…）或控制台 Cookie；运行时密钥只能调用模型',
    }
  }

  let workspaceId = String(extras.workspaceId || '').trim()
  if (!workspaceId) {
    const current = await get('/api/v1/workspaces/current', 'control', ctx, null)
    if (!current.ok) return failure(current, 'workspaces/current')
    const found = parseWorkspace(current.body)
    if (!found) return { status: 'error', detail: 'workspaces/current: 没有返回工作区 ID' }
    workspaceId = found.workspaceId
  }

  // Preflight carries the plan windows, the wallet the balance and the summary
  // the subscription — three independent answers. Asking for them one at a
  // time is what made the first paint take seconds; they go out together now.
  // Preflight is the only one whose auth failure is fatal; the other two are
  // best effort and a failure must not hide the preflight numbers.
  const [preflight, wallet, summary] = await Promise.all([
    get(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/billing/preflight`, 'control', ctx, workspaceId),
    get('/api/v1/wallet/balance', 'control', ctx, workspaceId),
    get('/api/v1/billing/summary', 'control', ctx, workspaceId),
  ])
  let plan = null
  if (preflight.ok) plan = parsePreflight(preflight.body)
  else if (preflight.authFailed) return failure(preflight, 'billing/preflight')

  const balance = wallet.ok ? parseWallet(wallet.body) : null
  const meta = summary.ok ? parseSummary(summary.body) : null

  const amount = balance && Number.isFinite(balance.balanceUsd)
    ? balance.balanceUsd
    : plan && Number.isFinite(plan.balanceUsd) ? plan.balanceUsd : null

  if (amount === null && !(plan && plan.windows.length)) {
    return failure(preflight.ok ? wallet : preflight, 'billing')
  }

  const notes = []
  if (plan && plan.funding) notes.push(plan.funding === 'coding_plan' ? 'Coding plan' : plan.funding)
  if (meta && meta.subscriptionStatus) notes.push(meta.subscriptionStatus)

  const row = {
    status: 'ok',
    kind: 'money',
    currency: 'USD',
    plan: (meta && meta.membershipTier) || (plan && plan.tier) || null,
    notes,
    workspaceId,
    windows: plan ? plan.windows : [],
    updatedAt: (balance && balance.updatedAt) || null,
  }
  if (amount !== null) row.amount = Math.round(amount * 100) / 100
  return row
}

async function validateControlKey(key, ctx) {
  const result = await get('/api/v1/workspaces/current', 'control', Object.assign({}, ctx, { extras: { controlKey: key } }), null)
  if (!result.ok) return { ok: false, message: (failure(result, 'workspaces/current').detail) }
  const found = parseWorkspace(result.body)
  if (!found) return { ok: false, message: 'workspaces/current 没有返回工作区 ID' }
  return { ok: true, workspaceId: found.workspaceId, message: '控制键可用' }
}

export default {
  id: 'opendesign',
  label: 'OpenDesign',
  kind: 'money',
  order: 55,
  consoleUrl: 'https://open-design.ai',
  secret: {
    ref: 'OPENDESIGN_API_KEY',
    type: 'key',
    // Second credentials for the billing API. `as` is the key the adapter
    // sees in `ctx.extras`; nothing is guessed from the ref name.
    extras: [
      { ref: 'OPENDESIGN_CONTROL_KEY', type: 'key', as: 'controlKey', label: '控制键', optional: true, placeholder: 'vela_ctrl_…' },
      { ref: 'OPENDESIGN_WORKSPACE_ID', type: 'text', as: 'workspaceId', label: '工作区 ID', optional: true },
      { ref: 'OPENDESIGN_CONSOLE_COOKIE', type: 'cookie', as: 'cookie', label: '控制台 Cookie', optional: true },
    ],
  },
  setup: { consoleUrl: 'https://open-design.ai' },
  fetchSecret,
  validateControlKey,
  parseWallet,
  parseSummary,
  parsePreflight,
  parseWorkspace,
}
