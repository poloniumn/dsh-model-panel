/**
 * our Free Model「EAC router」页面的渠道积分。
 *
 * OFM 没有暴露任何渠道积分的 HTTP 路由 —— 它自己也是通过宿主 Connection 的
 * 进程内 Fetch 调 `/api/channel-pack` 的 `usage.badge`。裸回环 HTTP 打到
 * `/api/*` 属于宿主鉴权面，没有会话凭据会被网关直接拒绝，所以这里同样走
 * `createPeer` + `createSharedFetchHandler('/api')`，而不是 `fetch(base + …)`。
 *
 * 用 `usage.badge` 而不是 `credits.balances`：前者带宿主 TTL 缓存、只含启用
 * 账号，卡片按分钟轮询时不会把上游请求数放大。
 */

/** 与 OFM 自己的 CHANNEL_PROVIDERS / CHANNEL_CREDITS 对齐。 */
export const OFM_CHANNELS = Object.freeze([
  { id: 'lobsterai', name: 'LobsterAI', org: '有道', unit: 'credits' },
  { id: 'qoder', name: 'Qoder', org: '阿里系', unit: 'credits' },
  { id: 'qodercn', name: 'Qoder 中国版', org: '阿里系', unit: 'credits' },
  { id: 'trae', name: 'TRAE', org: '字节', unit: 'credits' },
  { id: 'cline', name: 'Cline', org: 'Cline', unit: 'dollars' },
  { id: 'loomy', name: 'Loomy', org: '讯飞', unit: 'credits' },
  { id: 'raccoon', name: 'Raccoon', org: '商汤', unit: 'credits' },
  { id: 'minimax', name: 'MiniMax Code', org: 'MiniMax', unit: 'credits' },
  { id: 'zcode', name: 'ZCode', org: '智谱', unit: 'token' },
  { id: 'gemini', name: 'Gemini', org: 'Google Code Assist', unit: 'quota' },
])

const isNum = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * 只有明确报了 `total > 0` 且 `remaining` 落在 `[0, total]` 的分桶才参与百分比；
 * 报不出容量的渠道返回 null，卡片就只显示金额，不编造一条进度条。
 */
export function capacityPercent(accounts) {
  if (!Array.isArray(accounts)) return null
  let remaining = 0
  let total = 0
  let seen = false
  for (const account of accounts) {
    const packages = account && account.balance && account.balance.packages
    if (!Array.isArray(packages)) continue
    for (const pkg of packages) {
      if (!pkg || pkg.active === false) continue
      if (!isNum(pkg.total) || pkg.total <= 0) continue
      if (!isNum(pkg.remaining) || pkg.remaining < 0 || pkg.remaining > pkg.total) continue
      remaining += pkg.remaining
      total += pkg.total
      seen = true
    }
  }
  if (!seen || total <= 0) return null
  const pct = (remaining / total) * 100
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10))
}

/**
 * `usage.badge` 的 `value` → 卡片上的一行。
 *
 * 没有配置账号的渠道返回一行 `amount: 0` 的「空行」——渠道照样出现在卡片上，
 * 显示「剩余 0」而不是被隐藏。有账号但读不出额度时返回 `ok: false` 的行，让卡片
 * 显示「查询失败」。Gemini 报的是 quota（`balance.total` 是百分比相加），不当余额展示。
 */
export function mapOfmChannel(channel, value) {
  const accounts = Array.isArray(value && value.accounts) ? value.accounts : []
  if (!accounts.length) {
    // 没有启用账号的渠道照样出行：卡片显示「剩余 0」，而不是把渠道整条藏掉。
    // `empty: true` 让调用方能区分「真的是 0」和「没量到」。
    return {
      id: `ofm-${channel.id}`,
      name: channel.name,
      kind: 'EAC router',
      source: 'ofm',
      unit: channel.unit,
      amount: channel.unit === 'quota' ? null : 0,
      remainPct: channel.unit === 'quota' ? 0 : null,
      accounts: 0,
      ok: true,
      empty: true,
    }
  }

  let sum = 0
  let measured = 0
  for (const account of accounts) {
    const balance = account && account.balance
    if (balance && isNum(balance.total)) {
      sum += balance.total
      measured += 1
    }
  }

  const remainPct = capacityPercent(accounts)
  return {
    id: `ofm-${channel.id}`,
    name: channel.name,
    kind: 'EAC router',
    source: 'ofm',
    unit: channel.unit,
    amount: measured > 0 && channel.unit !== 'quota' ? sum : null,
    remainPct,
    accounts: measured,
    ok: measured > 0 || remainPct !== null,
  }
}

/**
 * 创建读取器。`get` 是宿主的 `ctx.get`；拿不到 connection 或它没有进程内
 * Fetch 分发（插件未装、宿主版本不符）时 `readAll()` 返回 []，卡片照常渲染。
 */
export function createOfmCredits({ get, timeoutMs = 8_000 } = {}) {
  const state = { connection: null, peer: null, handler: null, sequence: 0 }

  function ready() {
    let conn = null
    try { conn = typeof get === 'function' ? get('connection') : null } catch { conn = null }
    if (!conn || typeof conn.createPeer !== 'function' || typeof conn.createSharedFetchHandler !== 'function') return false
    if (typeof Request !== 'function') return false
    if (state.connection !== conn) {
      const previous = state.peer
      state.connection = conn
      state.peer = conn.createPeer({ principal: { kind: 'owner' } })
      state.handler = conn.createSharedFetchHandler('/api')
      if (previous && typeof previous.dispose === 'function') {
        try { const done = previous.dispose(); if (done && typeof done.catch === 'function') done.catch(() => {}) } catch { /* 换连接而已 */ }
      }
    }
    return true
  }

  async function read(channel) {
    const rpcId = `balance-ofm-${++state.sequence}`
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined
    const request = new Request('http://localhost/api/channel-pack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: 'channel-pack',
        payload: { method: 'usage.badge', payload: { provider: channel.id, force: false } },
      }),
    })
    const response = await state.handler.fetch(request, state.peer)
    if (response.status === 404) return null // OFM 没装
    if (!response.ok) throw new Error(`channel-pack HTTP ${response.status}`)
    const message = await response.json()
    if (!message || message.type !== 'server-response' || message.rpcId !== rpcId) {
      throw new Error('channel-pack 响应与请求不匹配')
    }
    if (!message.result || message.result.ok !== true) {
      const detail = message.result && message.result.error
      const text = detail && typeof detail === 'object' ? detail.message : detail
      throw new Error(String(text || 'channel-pack 调用失败'))
    }
    return mapOfmChannel(channel, message.result.value)
  }

  /** 并发读十个渠道，单个失败不影响其它行。 */
  async function readAll() {
    if (!ready()) return []
    let settled
    try {
      settled = await Promise.allSettled(OFM_CHANNELS.map((channel) => read(channel)))
    } catch {
      return []
    }
    // 读失败的渠道也留一行 `ok: false`，卡片会写「查询失败」而不是把它藏起来；
    // 只有 OFM 没装（404 → null）时才真的不出行。
    return settled.flatMap((entry, index) => {
      if (entry.status === 'fulfilled') return entry.value ? [entry.value] : []
      const channel = OFM_CHANNELS[index]
      return [{
        id: `ofm-${channel.id}`,
        name: channel.name,
        kind: 'EAC router',
        source: 'ofm',
        unit: channel.unit,
        amount: null,
        remainPct: null,
        accounts: 0,
        ok: false,
      }]
    })
  }

  function dispose() {
    const peer = state.peer
    state.connection = null
    state.peer = null
    state.handler = null
    if (peer && typeof peer.dispose === 'function') {
      try { const done = peer.dispose(); if (done && typeof done.catch === 'function') done.catch(() => {}) } catch { /* 已经没了 */ }
    }
  }

  return { readAll, dispose }
}
