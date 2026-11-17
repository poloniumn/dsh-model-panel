import { getJson, num, parseBalanceInfos } from '../util.js'

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
    const row = parseBalanceInfos(body, (info) => num(info.total_balance) ?? num(info.cash_balance))
    if (!row) return null
    // A wallet that cannot pay is an action item (top up), not a zero balance:
    // keeping the note lets the card say why the number is not usable.
    return body.is_available === false ? { ...row, notes: ['余额不足，请充值'] } : row
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