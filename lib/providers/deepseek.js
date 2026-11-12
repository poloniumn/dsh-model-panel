import { getJson, num, pick } from '../util.js'

/** `{balance_infos:[{currency,total_balance,cash_balance,granted_balance}]}` */
function parseBalanceInfos(body) {
  const infos = Array.isArray(pick(body, 'balance_infos')) ? body.balance_infos : []
  const info = infos.find((it) => it && String(it.currency || '').toUpperCase() === 'CNY') || infos[0]
  if (!info || typeof info !== 'object') return null
  const amount = num(info.total_balance) ?? num(info.cash_balance)
  if (amount === null) return null
  return {
    amount,
    currency: String(info.currency || 'CNY').toUpperCase(),
    bonus: num(info.granted_balance),
  }
}

export default {
  id: 'deepseek',
  label: 'DeepSeek',
  kind: 'money',
  order: 10,
  secret: { ref: 'DEEPSEEK_API_KEY', type: 'key' },
  url: 'https://api.deepseek.com/user/balance',
  consoleUrl: 'https://platform.deepseek.com/top_up',
  setup: {},
  parseKey(body) {
    return parseBalanceInfos(body)
  },
  /** Peak / off-peak windows come from the daily scraped pricing page. */
  meta(row, state) {
    if (state.schedules?.deepseek) row.peakSchedule = state.schedules.deepseek
  },
  async setupHint({ key }) {
    const result = await getJson(this.url, key)
    return result.ok ? { ok: true } : { ok: false, message: result.error }
  },
}