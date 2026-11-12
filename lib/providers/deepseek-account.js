import { num } from '../util.js'

/** Add one wallet list into per-currency buckets; a bonus list also counts as bonus. */
function bucketize(target, list, isBonus) {
  for (const wallet of list || []) {
    if (!wallet || typeof wallet !== 'object') continue
    const value = num(wallet.balance)
    if (value === null) continue
    const currency = String(wallet.currency || 'CNY').toUpperCase()
    const bucket = target.get(currency) || { amount: 0, bonus: 0, currency }
    bucket.amount += value
    if (isBonus) bucket.bonus += value
    target.set(currency, bucket)
  }
}

/**
 * DeepSeek wallet through the DSH login (no API key needed). The host half
 * passes the deepseekAccount service in ctx.account; this adapter only shapes
 * the answer.
 *
 * The service reports one wallet row per currency plus an independent bonus
 * table. Amounts in different currencies are never added together: the row
 * shows the CNY wallet (what a paid DeepSeek account tops up) and falls back
 * to whichever wallet the service listed first.
 */
export default {
  id: 'deepseek-account',
  label: 'DeepSeek',
  kind: 'account',
  order: 5,
  secret: { type: 'account' },
  consoleUrl: 'https://platform.deepseek.com/top_up',
  /** True when DSH holds a login for the DeepSeek account service. */
  async available(account) {
    if (!account || typeof account.getState !== 'function') return false
    try {
      const state = await account.getState()
      return Boolean(state && state.status === 'credential-stored')
    } catch {
      return false
    }
  },
  async fetchSecret(_secret, ctx) {
    const service = ctx.account
    if (!service) return { status: 'error', detail: 'account service unavailable' }
    const client = {
      version: '1.0.0',
      locale: 'zh-CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
    const balance = await service.getBalance(client)
    if (!balance) return { status: 'no-key', detail: 'signed-out' }
    if (balance.status !== 'ready') return { status: 'error', detail: 'account query failed' }

    const wallets = Array.isArray(balance.value) ? balance.value : []
    const bonusWallets = Array.isArray(balance.bonusWallets) ? balance.bonusWallets : []
    if (!wallets.length && !bonusWallets.length) return { status: 'error', detail: 'empty wallet' }

    const buckets = new Map()
    bucketize(buckets, wallets, false)
    bucketize(buckets, bonusWallets, true)

    const firstCurrency = wallets.length ? String(wallets[0].currency || 'CNY').toUpperCase() : null
    const chosen = buckets.get('CNY') || (firstCurrency ? buckets.get(firstCurrency) : null) || [...buckets.values()][0]
    if (!chosen) return { status: 'error', detail: 'no numeric wallet row' }

    // bonus is reported separately so the card can say what part of the total
    // is granted credit rather than top-up.
    return {
      status: 'ok',
      amount: chosen.amount,
      bonus: chosen.bonus,
      currency: chosen.currency,
    }
  },
  meta(row, state) {
    if (state.schedules?.deepseek) row.peakSchedule = state.schedules.deepseek
  },
}
