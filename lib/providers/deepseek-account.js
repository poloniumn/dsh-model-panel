import { num } from '../util.js'

/**
 * DeepSeek wallet through the DSH login (no API key needed). The host half
 * passes the `deepseekAccount` service in `ctx.account`; this adapter only
 * shapes the answer.
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
    const sum = (list) => (list || []).reduce((total, wallet) => {
      const value = num(wallet && wallet.balance)
      return value === null ? total : total + value
    }, 0)
    const wallets = balance.value || []
    const bonusWallets = balance.bonusWallets || []
    if (!wallets.length && !bonusWallets.length) return { status: 'error', detail: 'empty wallet' }
    const currency = String((wallets[0] || bonusWallets[0] || {}).currency || 'CNY').toUpperCase()
    const bonus = sum(bonusWallets)
    return { status: 'ok', amount: sum(wallets) + bonus, bonus, currency }
  },
  meta(row, state) {
    if (state.schedules?.deepseek) row.peakSchedule = state.schedules.deepseek
  },
}