import { num, pick } from '../util.js'

/** `{balance_infos:[{currency,total_available,cash_balance,…}]}` */
function parseBalanceInfos(body) {
  const infos = Array.isArray(pick(body, 'balance_infos')) ? body.balance_infos : []
  const info = infos.find((it) => it && String(it.currency || '').toUpperCase() === 'CNY') || infos[0]
  if (!info || typeof info !== 'object') return null
  const amount = num(info.total_available) ?? num(info.cash_balance) ?? num(info.balance) ?? num(info.total_balance)
  if (amount === null) return null
  return {
    amount,
    currency: String(info.currency || 'CNY').toUpperCase(),
    bonus: num(info.granted_balance),
  }
}

/** MiMo pay-as-you-go wallet (API-key based, separate from the Token Plan). */
export default {
  id: 'xiaomi',
  label: 'Xiaomi MIMO',
  kind: 'money',
  order: 20,
  secret: { ref: 'XIAOMI_API_KEY', type: 'key' },
  url: 'https://api.xiaomimimo.com/v1/platform/balance',
  consoleUrl: 'https://platform.xiaomimimo.com/console/balance',
  setup: {},
  parseKey(body) {
    return parseBalanceInfos(body)
  },
}