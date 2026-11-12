/**
 * Self-check suite: host helpers, browser-half contracts, release hygiene.
 *
 *   node test/run.mjs        (or: npm test)
 *
 * No dependencies, no network, no Harness runtime — every assertion reads the
 * files in this package and calls the pure helpers exported by ./lib.
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(ROOT, rel))

let failures = 0
function ok(label, cond, extra) {
  if (cond) console.log('  ok   ' + label)
  else {
    failures += 1
    console.log('  FAIL ' + label + (extra === undefined ? '' : ' → ' + extra))
  }
}
function eq(label, got, want) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  ok(label + ' = ' + w, g === w, g)
}

const pkg = JSON.parse(read('package.json'))
const indexSrc = read('index.js')
const clientSrc = read('client.js')
const readme = read('README.md')

// ---------------------------------------------------------------- host libs
console.log('\n[lib/ofm-credits.js]')
const ofm = await import(url.pathToFileURL(path.join(ROOT, 'lib/ofm-credits.js')).href)
eq('OFM_CHANNELS length', ofm.OFM_CHANNELS.length, 10)
ok('channel ids are unique', new Set(ofm.OFM_CHANNELS.map((c) => c.id)).size === 10)
ok('channel names are unique', new Set(ofm.OFM_CHANNELS.map((c) => c.name)).size === 10)
eq('unit vocabulary size', new Set(ofm.OFM_CHANNELS.map((c) => c.unit)).size, 4)

const bucket = (total, remaining, active = true) => ({ balance: { packages: [{ active, total, remaining }] } })
eq('capacityPercent: no usable bucket', ofm.capacityPercent([]), null)
eq('capacityPercent: ignores total<=0', ofm.capacityPercent([bucket(0, 5)]), null)
eq('capacityPercent: ignores out-of-range remaining', ofm.capacityPercent([bucket(100, 150)]), null)
eq('capacityPercent: 50 of 100', ofm.capacityPercent([bucket(100, 50)]), 50)
eq('capacityPercent: sums across accounts', ofm.capacityPercent([bucket(400, 100), bucket(600, 150)]), 25)

const creditsChannel = ofm.OFM_CHANNELS.find((c) => c.unit === 'credits')
const quotaChannel = ofm.OFM_CHANNELS.find((c) => c.unit === 'quota')

const emptyRow = ofm.mapOfmChannel(creditsChannel, { accounts: [] })
ok('empty channel still yields a row', Boolean(emptyRow))
eq('empty channel reports 0', emptyRow.amount, 0)
eq('empty channel is not a failure', emptyRow.ok, true)
eq('empty channel is flagged', emptyRow.empty, true)
eq('empty channel keeps its id', emptyRow.id, 'ofm-' + creditsChannel.id)
eq('empty channel keeps its name', emptyRow.name, creditsChannel.name)

const emptyQuota = ofm.mapOfmChannel(quotaChannel, { accounts: [] })
eq('empty quota suppresses the amount', emptyQuota.amount, null)
eq('empty quota reports 0%', emptyQuota.remainPct, 0)

const measured = ofm.mapOfmChannel(creditsChannel, { accounts: [{ balance: { total: 500 } }, { balance: { total: 250 } }] })
eq('measured channel sums its accounts', measured.amount, 750)
eq('measured channel counts accounts', measured.accounts, 2)
eq('measured channel is ok', measured.ok, true)
ok('measured channel carries no empty flag', measured.empty === undefined)

console.log('\n[lib/third-party.js]')
const third = await import(url.pathToFileURL(path.join(ROOT, 'lib/third-party.js')).href)
eq('connect status path', third.CONNECT_STATUS_PATH, '/plugins/dsh-connect/status')
const mapped = third.mapChannels({
  channels: [
    { id: 'qoder', displayName: 'Qoder', state: 'signed-in', kind: 'ide', credits: { label: '积分', value: 12, progress: 0.5 } },
    { id: 'trae', state: 'signed-out', credits: { value: 99 } },
    { id: '', state: 'signed-in' },
  ],
})
eq('signed-out and nameless channels are dropped', mapped.length, 1)
eq('channel keeps its label', mapped[0].label, '积分')
eq('channel progress becomes a percentage', mapped[0].remainPct, 50)
eq('channel value survives', mapped[0].value, 12)
eq('no base means no request', await third.fetchThirdParty(null), [])

// ------------------------------------------------------------- host wiring
console.log('\n[index.js wiring]')
ok('registers its own state route', indexSrc.includes("const ROUTE = '/dsh-model-panel/state.json'"))
ok('injects webServer', /export const inject = \['webServer'\]/.test(indexSrc))
ok('imports loopbackBase', /import \{[^}]*loopbackBase[^}]*\} from '\.\/lib\/http\.js'/.test(indexSrc))
ok('imports fetchThirdParty', indexSrc.includes("from './lib/third-party.js'"))
ok('imports createOfmCredits', indexSrc.includes("from './lib/ofm-credits.js'"))
ok('creates the OFM reader', /createOfmCredits\(\{ get: \(key\) => get\(key\) \}\)/.test(indexSrc))
ok('disposes the OFM reader on teardown', /ctx\.effect\(\(\) => \(\) => \{[\s\S]*ofmCredits\.dispose\(\)/.test(indexSrc))
ok('collect takes the loopback base', /async function collect\(base = null\)/.test(indexSrc))
ok('handleState passes the loopback base', indexSrc.includes('snapshot(loopbackBase(req.headers && req.headers.host))'))
ok('concurrent third-party fetch', /Promise\.all\(\[\s*\n?\s*fetchThirdParty\(base\),\s*\n?\s*ofmCredits\.readAll\(\)/.test(indexSrc))
ok('merges third-party rows by name', /const seen = new Set\(connected\.map/.test(indexSrc))
ok('returns thirdParty', /return \{ ok: true, updatedAt: Date\.now\(\), rows: visible, thirdParty \}/.test(indexSrc))
ok('no other plugin endpoint is referenced', !indexSrc.includes('/dsh-balance'))

// ----------------------------------------------------------- browser half
console.log('\n[client.js wiring]')
ok('one endpoint, served by this plugin', clientSrc.includes("const STATE_ENDPOINT = '/dsh-model-panel/state.json'"))
ok('no balance-display endpoint', !clientSrc.includes('/dsh-balance'))
ok('fetchState reads rows + thirdParty', /thirdParty: Array\.isArray\(data\.thirdParty\) \? data\.thirdParty : \[\]/.test(clientSrc))
ok('balance cache keeps thirdParty', /balanceCache = \{ at: Date\.now\(\), rows: data\.rows, thirdParty: data\.thirdParty \}/.test(clientSrc))
ok('thirdParty state is declared', /const \[thirdParty, setThirdParty\] = useState\(\[\]\)/.test(clientSrc))
ok('loadBalance sets both', /setBalanceRows\(data\.rows\);\s*\n\s*setThirdParty\(data\.thirdParty \|\| \[\]\)/.test(clientSrc))
ok('provider order honours declared ranks', clientSrc.includes('function groupRank(group)') && clientSrc.includes('function orderGroups(entries, isThird)'))
ok('third-party providers sink to the bottom', /ordered = orderGroups\(visible,/.test(clientSrc))

console.log('\n[client.js CSS]')
ok('header is a grid with a fixed count column', /\.dshmp-phead\{[^}]*display:grid[^}]*grid-template-columns:14px minmax\(0,1fr\) max-content 72px/.test(clientSrc))
ok('count cell centres its text vertically', /\.dshmp-pcount\{[^}]*display:inline-flex[^}]*align-items:center[^}]*height:20px/.test(clientSrc))
ok('count cell is left aligned inside its column', /\.dshmp-pcount\{[^}]*padding:0 0 0 8px/.test(clientSrc))
ok('info cluster ends the flexible track', /\.dshmp-pinfo\{[^}]*justify-self:end/.test(clientSrc))
ok('provider name shrinks instead of squeezing the badge', /\.dshmp-pname\{[^}]*flex:1 1 auto[^}]*min-width:0/.test(clientSrc))
ok('credit badge has no percentage width', !/\.dshmp-pthird\{[^}]*max-width:\d+%/.test(clientSrc))
ok('credit badge keeps a pixel cap', /\.dshmp-pthird\{[^}]*max-width:220px/.test(clientSrc))
ok('no separate third-party box', !clientSrc.includes('.dshmp-pgroup.third'))
ok('no third-party progress bar', !clientSrc.includes('.dshmp-thirdbar{'))
ok('effort slider keeps a fixed label slot', clientSrc.includes("{ className: 'dshmp-effort-side' }"))
ok('effort slider reserves the reset slot', clientSrc.includes("className: 'dshmp-reset-slot'"))

console.log('\n[client.js markup order]')
const markCount = clientSrc.indexOf("{ className: 'dshmp-pcount' }")
const markInfo = clientSrc.indexOf("{ className: 'dshmp-pinfo' }")
const markName = clientSrc.indexOf("{ className: 'dshmp-pname' }")
const markCredit = clientSrc.indexOf("className: 'dshmp-pthird'")
ok('count cell is the last column', markCount > markInfo && markInfo > markName)
ok('credit badge sits inside the info cluster', markCredit > markInfo)

// ------------------------------------------------ cookie-only usage settings
console.log('\n[lib/cookie-setup.js]')
const cookieSetup = await import(url.pathToFileURL(path.join(ROOT, 'lib/cookie-setup.js')).href)
const registry = await import(url.pathToFileURL(path.join(ROOT, 'lib/registry.js')).href)
eq('settings page lists qwen only', cookieSetup.COOKIE_PROVIDER_IDS, ['qwen-token-plan-cn'])

const store = new Map()
const fakeSecrets = {
  read: async (ref) => store.get(ref) || null,
  write: async (ref, value) => { store.set(ref, value) },
  clear: async (ref) => { store.delete(ref); return true },
}
const adapters = registry.createAdapterSet({ cacheDir: path.join(HERE, '.tmp-cache') })
const setup = cookieSetup.createCookieSetup({ adapters, secrets: fakeSecrets })
const initial = await setup.list()
eq('one entry is offered', initial.length, 1)
eq('entry id', initial[0].id, 'qwen-token-plan-cn')
eq('entry is unset', initial[0].set, false)
eq('reference is the qwen console cookie', initial[0].ref, 'QWEN_TOKEN_PLAN_COOKIE')
ok('entry carries a console link', /^https:\/\//.test(String(initial[0].consoleUrl)))

const rejected = await setup.save('qwen-token-plan-cn', 'abc')
eq('a non-cookie is rejected', rejected.ok, false)
ok('the rejection names the expected shape', /cookie/i.test(String(rejected.error)))
eq('nothing was stored', store.size, 0)

const qwen = adapters.get('qwen-token-plan-cn')
qwen.validate = async () => ({ ok: true, plan: 'Lite' })
qwen.fetchSecret = async () => ({ status: 'ok', plan: 'Lite', usedPct: 12.5, endAt: 1_800_000_000_000 })
const saved = await setup.save('qwen-token-plan-cn', 'Cookie: a=1; b=2')
eq('a cookie is stored', saved.ok, true)
eq('the stored value is normalised', store.get('QWEN_TOKEN_PLAN_COOKIE'), 'a=1; b=2')
eq('save reports the plan it unlocked', saved.entry.plan, 'Lite')
eq('save reports used percentage', saved.entry.usedPct, 12.5)
ok('save never echoes the value', !JSON.stringify(saved).includes('a=1; b=2'))

store.set('QWEN_TOKEN_PLAN_COOKIE', 'stale=1')
const cleared = await setup.clear('qwen-token-plan-cn')
eq('clear removes the cookie', cleared.cleared, true)
eq('clear reports the entry as unset', cleared.entry.set, false)
eq('the store is empty again', store.size, 0)

console.log('\n[lib/providers/deepseek-account.js]')
const account = (await import(url.pathToFileURL(path.join(ROOT, 'lib/providers/deepseek-account.js')).href)).default
eq('account adapter id', account.id, 'deepseek-account')
const wallet = {
  getBalance: async () => ({
    status: 'ready',
    value: [{ currency: 'USD', balance: '1.00' }, { currency: 'CNY', balance: '12.50' }],
    bonusWallets: [{ currency: 'CNY', balance: '3.00' }],
  }),
}
const walletRow = await account.fetchSecret({}, { account: wallet })
eq('wallets are never summed across currencies', walletRow.amount, 15.5)
eq('the yuan wallet wins', walletRow.currency, 'CNY')
eq('the granted part is reported apart', walletRow.bonus, 3)
const signedOut = await account.fetchSecret({}, { account: { getBalance: async () => ({ status: 'signed-out' }) } })
ok('a signed-out login is not an error row', signedOut.status !== 'ok')

console.log('\n[settings tab]')
ok('client registers the balance settings tab', clientSrc.includes("slots.inject('settings.plugins.tab'"))
ok('client labels the tab from the dictionary', clientSrc.includes("localT('setTitle')"))
ok('client posts the cookie to the secret route', clientSrc.includes('SECRET_ENDPOINT'))
ok('host serves the settings route', indexSrc.includes("SETTINGS_ROUTE = '/dsh-model-panel/settings.json'"))
ok('host serves the secret route', indexSrc.includes("SECRET_ROUTE = '/dsh-model-panel/secret.json'"))
ok('host rejects non-POST secret writes', indexSrc.includes("req.method !== 'POST'"))

// --------------------------------------------------------- release hygiene
console.log('\n[release]')
ok('MIT licence present', exists('LICENSE') && read('LICENSE').startsWith('MIT License'))
ok('package declares MIT', pkg.license === 'MIT')
ok('bundle patch exists', exists(pkg.dsh.bundle.patch))
ok('patch inserts this plugin', read(pkg.dsh.bundle.patch).includes('id: dsh-model-panel'))
ok('icon exists', exists('icon.svg') && read('icon.svg').includes('<svg'))
ok('README exists', readme.length > 500)
ok('README documents the install path', /install_bundle/.test(readme))
for (const entry of pkg.files) {
  if (entry === 'lib') ok('files: lib/ directory ships', exists('lib'))
  else if (entry.includes('*')) ok('files: ' + entry + ' matches something', fs.readdirSync(path.join(ROOT, path.dirname(entry))).length > 0)
  else ok('files: ' + entry + ' exists', exists(entry))
}
for (const target of Object.values(pkg.exports)) {
  if (target.includes('*')) continue
  ok('exports target exists: ' + target, exists(target))
}
const en = JSON.parse(read('locale/en.json'))
const zh = JSON.parse(read('locale/zh.json'))
ok('locale en title', Boolean(en.meta && en.meta.title && en.meta.description))
ok('locale zh title', Boolean(zh.meta && zh.meta.title && zh.meta.description))
ok('locale titles differ (one is translated)', en.meta.title !== zh.meta.title)
ok('CHANGELOG exists', exists('CHANGELOG.md'))
ok('CHANGELOG documents this version', read('CHANGELOG.md').includes('## ' + pkg.version))
eq('version is a semver triple', /^\d+\.\d+\.\d+$/.test(pkg.version), true)

console.log('')
if (failures) {
  console.log(failures + ' FAILURES')
  process.exit(1)
}
console.log('ALL PASS')
