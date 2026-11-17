import { num, parseBalanceInfos } from '../util.js'

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
    return parseBalanceInfos(
      body,
      (info) => num(info.total_available) ?? num(info.cash_balance) ?? num(info.balance) ?? num(info.total_balance)
    )
  },
}