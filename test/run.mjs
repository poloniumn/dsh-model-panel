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
// The host half is assembled from ./lib (rows / collect / snapshot / routes),
// so behaviour assertions scan the whole surface, not just the entry point.
const hostSrc = [
  'index.js',
  'lib/rows.js',
  'lib/collect.js',
  'lib/snapshot.js',
  'lib/routes.js',
  'lib/subagent-gate.js',
]
  .map((rel) => read(rel))
  .join('\n')
// The browser half is one entry plus four package-local chunks, so the
// contract assertions scan the assembled surface, not just the entry file.
const clientChunks = ['client.shared.js', 'client.css.js', 'client.panel.js', 'client.settings.js']
const clientSrc = [read('client.js'), ...clientChunks.map((rel) => read(rel))].join('\n')
const entrySrc = read('client.js')
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
ok('collect takes the loopback base', /async function collect\(base = null\)/.test(hostSrc))
ok('handleState passes the loopback base', hostSrc.includes('snapshot(loopbackBase(req.headers && req.headers.host))'))
// A cold process must not make the user wait for the whole provider sweep.
ok('a stale window is declared', /const STALE_TTL_MS = 30 \* 60_000/.test(hostSrc))
ok('the last state is read back from disk', /function readDiagnostics\(\)/.test(hostSrc))
ok('a seeded answer is flagged stale', /return Promise\.resolve\(\{ ...seed\.state, stale: true \}\)/.test(hostSrc))
ok('an in-flight refresh wins over the seed', /if \(inflight\) return inflight[\s\S]*const seed = cache/.test(hostSrc))
ok('concurrent third-party fetch', /Promise\.all\(\[\s*\n?\s*fetchThirdParty\(base\),\s*\n?\s*ofmCredits\.readAll\(\)/.test(hostSrc))
ok('merges third-party rows by name', /const seen = new Set\(connected\.map/.test(hostSrc))
ok('returns thirdParty', /return \{ ok: true, updatedAt: Date\.now\(\), rows: visible, thirdParty \}/.test(hostSrc))
ok('no other plugin endpoint is referenced', !indexSrc.includes('/dsh-balance'))

// ----------------------------------------------------------- browser half
console.log('\n[client.js wiring]')
ok('one endpoint, served by this plugin', clientSrc.includes("const STATE_ENDPOINT = '/dsh-model-panel/state.json'"))
ok('no balance-display endpoint', !clientSrc.includes('/dsh-balance'))
ok('fetchState reads rows + thirdParty', /thirdParty: Array\.isArray\(data\.thirdParty\) \? data\.thirdParty : \[\]/.test(clientSrc))
ok('balance cache keeps thirdParty', /thirdParty: data\.thirdParty,/.test(clientSrc))
ok('a stale answer is not cached', /at: data\.stale \? 0 : Date\.now\(\),/.test(clientSrc))
ok('the panel seeds itself from the last answer once', /seedRef\.current === null\) seedRef\.current = savedBalance\(\) \|\| \{ rows: null, thirdParty: \[\] \};/.test(clientSrc))
ok('stale answers are re-asked once', /if \(data\.stale && again === null\)/.test(clientSrc))
ok('the re-ask is cancelled on close', /if \(again\) clearTimeout\(again\);/.test(clientSrc))
ok('thirdParty state is declared', /const \[thirdParty, setThirdParty\] = useState\(/.test(clientSrc))
ok('loadBalance sets both', /setBalanceRows\(data\.rows\);\s*\n\s*setThirdParty\(data\.thirdParty \|\| \[\]\)/.test(clientSrc))
ok('provider order honours declared ranks', clientSrc.includes('function groupRank(group)') && clientSrc.includes('function orderGroups(entries, isThird)'))
ok('third-party providers sink to the bottom', /ordered = orderGroups\(visible,/.test(clientSrc))

console.log('\n[client.js CSS]')
// The count column is content-sized now: a row can carry two or three usage
// windows (5-hour + weekly + monthly), which a fixed 72px would clip.
ok('header is a grid with a content-sized count column', /\.dshmp-phead\{[^}]*display:grid[^}]*grid-template-columns:14px minmax\(0,1fr\) max-content minmax\(52px,max-content\)/.test(clientSrc))
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

// ------------------------------------------------------------ discount chips
console.log('\n[lib/qwen-discount.js]')
const qd = await import(url.pathToFileURL(path.join(ROOT, 'lib/qwen-discount.js')).href)

// The live catalogue shape: `auto` and Qwen3.8 fall in the 4 折 group, the
// DeepSeek-V4 ids in the 5 折 one, and a promotion without a night window
// ("限时2折") must stay out of both.
const CATALOG = [
  { modelId: 'auto', name: '{"zh-CN":"Auto"}', badgeLabel: '限时夜间4折', badgeDescription: '每晚 22:00 - 次日 08:00 期间调用模型，Credits 消耗低至 4 折。' },
  { modelId: 'qwen3.8-max', name: '{"zh-CN":"Qwen3.8-Max"}', badgeLabel: '限时夜间4折', badgeDescription: '每晚 22:00 - 次日 08:00 期间调用模型，Credits 消耗低至 4 折。' },
  { modelId: 'qwen3.8-flash', name: '{"zh-CN":"Qwen3.8-Flash"}', badgeLabel: '限时夜间4折', badgeDescription: '每晚 22:00 - 次日 08:00 期间调用模型，Credits 消耗低至 4 折。' },
  { modelId: 'qwen3.7-plus', name: '{"zh-CN":"Qwen3.7-Plus"}' },
  { modelId: 'deepseek-v4.1-flash-1017', name: '{"zh-CN":"DeepSeek-V4.1-Flash-1017"}', badgeLabel: '限时夜间 5 折', badgeDescription: '每晚 22:00 - 次日 08:00 期间调用模型，Credits 消耗低至 5 折。' },
  { modelId: 'deepseek-v4-pro-0813', name: '{"zh-CN":"DeepSeek-V4-Pro-0813"}', badgeLabel: '限时夜间5折', badgeDescription: '限时夜间优惠：每晚 22:00 - 次日 08:00 期间调用模型，Credits 消耗低至 5 折。' },
  { modelId: 'qwen4-max-preview', name: '{"zh-CN":"Qwen4.0-Max-Preview"}', badgeLabel: '限时2折', badgeDescription: 'Credits消耗限时2折' },
  { modelId: 'decision-model-preview', name: '{"zh-CN":"decision-model-preview"}', badgeLabel: '限时免费', badgeDescription: '面向高频业务判断的结构化决策模型。' },
]

const badges = qd.parseBadges(CATALOG)
eq('parseBadges groups by discount', badges.map((b) => b.discount), ['4', '5'])
eq('parseBadges keeps the whole 4 折 group', badges[0].ids, ['auto', 'qwen3.8-max', 'qwen3.8-flash'])
eq('parseBadges keeps the whole 5 折 group', badges[1].ids, ['deepseek-v4.1-flash-1017', 'deepseek-v4-pro-0813'])
ok('parseBadges does not collapse a group to "auto"', badges[0].ids.length > 1 && badges[0].ids.indexOf('auto') >= 0)
ok('parseBadges ranks ids as folded keys', badges[0].keys.indexOf('qwen38flash') >= 0)
ok('parseBadges drops a promotion with no night window', badges.every((b) => b.ids.every((id) => id !== 'qwen4-max-preview')))
eq('parseBadges reads the shared window', qd.parseWindow(CATALOG), { startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 })
eq('parseBadges keeps a per-group window', badges[0].window, { startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 })
eq('parseBadges carries the matched rate', badges.map((b) => b.rate), ['0.4', '0.5'])

// `N 折` → multiplier, and an unreadable badge stays null instead of a guess.
eq('badgeRate reads 4 折', qd.badgeRate('4'), '0.4')
eq('badgeRate reads a half discount', qd.badgeRate('4.5'), '0.45')
eq('badgeRate reads a percentage discount', qd.badgeRate('45'), '0.45')
eq('badgeRate passes a multiplier through', qd.badgeRate('0.4'), '0.4')
eq('badgeRate refuses an empty discount', qd.badgeRate(''), null)

// Two groups can publish different windows; each keeps its own copy.
const splitWindow = qd.parseBadges([
  { modelId: 'a', badgeDescription: '每晚 22:00 - 次日 08:00 低至 4 折' },
  { modelId: 'b', badgeDescription: '每晚 23:00 - 次日 07:00 低至 5 折' },
])
eq('per-group windows stay separate', splitWindow.map((b) => b.window && b.window.startHour), [22, 23])
eq('upgradeBadges derives a rate for an old cache', qd.upgradeBadges([{ discount: '4' }])[0].rate, '0.4')
eq('upgradeBadges leaves an unknown window null', qd.upgradeBadges([{ discount: '4' }])[0].window, null)
eq('upgradeBadges keeps a stored window', qd.upgradeBadges([{ discount: '4', window: { startHour: 20, startMinute: 0, endHour: 8, endMinute: 0 } }])[0].window.startHour, 20)

eq('normalizeModelKey folds a revision suffix', qd.normalizeModelKey('deepseek-v4.1-flash-1017'), qd.normalizeModelKey('deepseek-v4.1-flash'))
eq('normalizeModelKey folds case and separators', qd.normalizeModelKey('DeepSeek-V4-Pro'), qd.normalizeModelKey('deepseek-v4-pro-0813'))
eq('normalizeModelKey folds a display name', qd.normalizeModelKey('Qwen3.8-Flash'), 'qwen38flash')
ok('normalizeModelKey keeps Auto distinct from a Qwen id', qd.normalizeModelKey('Auto') !== qd.normalizeModelKey('qwen3.8-flash'))

const lifted = qd.upgradeBadges([{ discount: '5', models: ['DeepSeek-V4.1-Flash'] }, { discount: '4', models: ['Auto'] }])
eq('upgradeBadges keeps the discount', lifted.map((b) => b.discount), ['5', '4'])
eq('upgradeBadges folds legacy names into keys', lifted[0].keys, ['deepseekv41flash'])
eq('upgradeBadges leaves an id list empty', lifted[0].ids, [])
eq('upgradeBadges folds the legacy auto name', lifted[1].keys, ['auto'])

console.log('\n[client.js discount chips]')
ok('client folds ids with the library fold', clientSrc.includes('function normModelKey(value)'))
ok('client derives the night state once', clientSrc.includes('function nightState(now, row)'))
ok('client resolves a badge per model', clientSrc.includes('function badgeFor(night, model)'))
ok('client exposes a per-model multiplier', clientSrc.includes('function modelDiscount(now, row, model)'))
ok('client no longer reads only the first badge', !clientSrc.includes('row.nightBadges[0]'))
ok('client matches every row on its own', clientSrc.includes('const rowDiscount = modelDiscount(now, row, m);'))

// The header must never quote one group's rate for the whole provider: the
// same window can hold 4 折 and 5 折 groups at once.
ok('client asks only whether the group is discounted', clientSrc.includes('function groupHasDiscount(now, row, list)'))
ok('client header uses the boolean signal', clientSrc.includes('const discounted = groupHasDiscount(now, row, Array.isArray(g.models) ? g.models : entry.list)'))
ok('client no longer aggregates rates', !clientSrc.includes('function groupDiscount('))
ok('client no longer joins rates into one line', !clientSrc.includes("rates.map((r) => r + 'x').join(' / ')"))
ok('client drops the provider header chip', !clientSrc.includes('dshmp-mult-head'))
ok('client drops the header chip style', !clientSrc.includes('.dshmp-mult-head{'))
ok('client keeps the per-model chip', clientSrc.includes("className: 'dshmp-mult'"))
ok('client titles each model chip with its own rate', clientSrc.includes('function modelDiscountTitle(t, disc)'))
ok('client refuses an unreadable discount instead of guessing', /if \(!rate\) return null;/.test(clientSrc))
ok('client honours a per-group window', clientSrc.includes('function badgeWindow(badge)'))
ok('client matches a drifted id by folded prefix', clientSrc.includes('prefixHit && !ambiguous && prefixLen >= 6'))

// Multi-window usage: a plan can publish 5-hour and weekly pools, a wallet
// (OpenDesign) can publish both plus a USD balance.
ok('client draws one bar per usage window', clientSrc.includes('function windowBars(row, t, max)'))
ok('client renders wallet money beside its windows', clientSrc.includes('h(\'span\', { className: \'dshmp-money\' }, money(row.amount, row.currency))'))
ok('client styles the small window bar', clientSrc.includes('.dshmp-bar-sm{'))

// ------------------------------------------------ cookie-only usage settings
console.log('\n[lib/cookie-import.js]')
const cookieImport = await import(url.pathToFileURL(path.join(ROOT, 'lib/cookie-import.js')).href)

// A Cookie-Editor JSON export is the normal way a console cookie arrives:
// only the provider's own domains survive, expired and empty entries do not.
const editorExport = JSON.stringify([
  { domain: '.qianwenai.com', name: 'login_ticket', value: 'abc123', expirationDate: 1800000000 },
  { domain: '.qianwenai.com', name: 'csrf', value: 'c1', expirationDate: 1800000000 },
  { domain: '.aliyun.com', name: 'cna', value: 'XYZ=', session: true },
  { domain: '.example.com', name: 'tracker', value: 'nope', expirationDate: 1800000000 },
  { domain: '.qianwenai.com', name: 'expired', value: 'old', expirationDate: 1000000000 },
  { domain: '.qianwenai.com', name: 'blank', value: '', expirationDate: 1800000000 },
])
const parsedEditor = cookieImport.parseCookieExport(editorExport, {
  providerDomains: cookieImport.domainFilterFor('qwen-token-plan-cn'),
})
eq('a JSON export is recognised', parsedEditor.format, 'json')
eq('only the provider cookies reach the header', parsedEditor.cookie, 'login_ticket=abc123; csrf=c1; cna=XYZ=')
eq('the count is the header size', parsedEditor.count, 3)
ok('a foreign domain is dropped', !parsedEditor.cookie.includes('tracker'))
ok('an expired cookie is dropped', !parsedEditor.cookie.includes('expired'))
ok('the import reports it was filtered', parsedEditor.filtered === true)
eq('the foreign cookie is counted as filtered out', parsedEditor.filteredOut, 1)

// With nothing matching, the whole file is used: a wrong cookie is ignored by
// the gateway, an empty header is a silent failure.
const noMatch = cookieImport.parseCookieExport(
  JSON.stringify([{ domain: '.somewhere.example', name: 'k', value: 'v' }]),
  { providerDomains: ['qianwenai.com'] }
)
eq('an unmatched export still yields a header', noMatch.cookie, 'k=v')
ok('an unmatched export is not flagged as filtered', noMatch.filtered === false)

// EditThisCookie wraps its array; some exporters write a plain name→value map.
eq(
  'a wrapped export is unwrapped',
  cookieImport.parseCookieExport(JSON.stringify({ cookies: [{ domain: 'open-design.ai', name: 'vela', value: 's3' }] }), { providerDomains: ['open-design.ai'] }).cookie,
  'vela=s3'
)
eq('a plain map is accepted', cookieImport.parseCookieExport(JSON.stringify({ sid: 'a', uid: 'b' })).cookie, 'sid=a; uid=b')

// Netscape cookies.txt, including the #HttpOnly_ prefix browsers write.
const netscape = [
  '# Netscape HTTP Cookie File',
  '#HttpOnly_.qianwenai.com\ttrue\t/\ttrue\t1800000000\tlogin_ticket\ttabbed',
  '.qianwenai.com\tfalse\t/\tfalse\t1800000000\tcsrf\tc2',
].join('\n')
eq(
  'a cookies.txt export is recognised',
  cookieImport.parseCookieExport(netscape, { providerDomains: ['qianwenai.com'] }).cookie,
  'login_ticket=tabbed; csrf=c2'
)

// A header that is already correct passes through unchanged, and junk says why.
eq('a header passes through', cookieImport.parseCookieExport('cookie: a=1;b=2').cookie, 'a=1; b=2')
eq('an empty value is refused', cookieImport.parseCookieExport('').reason, 'empty')
eq('an export with no usable cookie is refused', cookieImport.parseCookieExport(JSON.stringify([{ name: 'x', value: '' }])).reason, 'no-cookies')
eq('qwen has its own domains', cookieImport.domainFilterFor('qwen-token-plan-cn').length > 0, true)
eq('an unknown provider has none', cookieImport.domainFilterFor('nobody').length, 0)
eq('mimo has its own domains', cookieImport.domainFilterFor('xiaomi-token-plan-cn').length > 0, true)

// A paste with no domain at all — the common case for `{name: value}` text —
// must still produce a header instead of an empty one.
eq('a domainless export is kept whole', cookieImport.parseCookieExport('{"a":"1","b":"2"}').cookie, 'a=1; b=2')

console.log('\n[lib/cookie-setup.js]')
const cookieSetup = await import(url.pathToFileURL(path.join(ROOT, 'lib/cookie-setup.js')).href)
const registry = await import(url.pathToFileURL(path.join(ROOT, 'lib/registry.js')).href)
eq('settings page lists both console cookies', cookieSetup.COOKIE_PROVIDER_IDS, ['qwen-token-plan-cn', 'xiaomi-token-plan-cn'])
eq('settings page lists the OpenDesign extras', cookieSetup.EXTRA_PROVIDERS.map((e) => e.ref), ['OPENDESIGN_CONTROL_KEY', 'OPENDESIGN_WORKSPACE_ID', 'OPENDESIGN_CONSOLE_COOKIE'])

const store = new Map()
const fakeSecrets = {
  read: async (ref) => store.get(ref) || null,
  write: async (ref, value) => { store.set(ref, value) },
  clear: async (ref) => { store.delete(ref); return true },
}
const adapters = registry.createAdapterSet({ cacheDir: path.join(HERE, '.tmp-cache') })
const setup = cookieSetup.createCookieSetup({ adapters, secrets: fakeSecrets })
const initial = await setup.list()
// Every cookie-secret adapter takes a row, declared order first, so a new
// cookie vendor in the registry needs no edit here.
eq('every row is offered (2 cookies + 3 extras)', initial.length, 5)
eq(
  'the cookie rows come first, in declared order',
  initial.filter((e) => e.type === 'cookie' && !e.group).map((e) => e.id),
  ['qwen-token-plan-cn', 'xiaomi-token-plan-cn']
)
const qwenEntry = initial.find((e) => e.ref === 'QWEN_TOKEN_PLAN_COOKIE')
const keyEntry = initial.find((e) => e.ref === 'OPENDESIGN_CONTROL_KEY')
const wsEntry = initial.find((e) => e.ref === 'OPENDESIGN_WORKSPACE_ID')
ok('the qwen cookie row exists', Boolean(qwenEntry))
eq('qwen row id', qwenEntry.id, 'qwen-token-plan-cn')
eq('qwen row is unset', qwenEntry.set, false)
ok('qwen row carries a console link', /^https:\/\//.test(String(qwenEntry.consoleUrl)))
eq('the control-key row is a key', keyEntry.type, 'key')
eq('the control-key row is required', keyEntry.optional, false)
ok('the control-key row is grouped under OpenDesign', /OpenDesign/.test(String(keyEntry.groupLabel)))
eq('the workspace row is optional', wsEntry.optional, true)

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

// A control key is an opaque token: short or whitespace-bearing input is
// refused, and a valid one is stored under its own ref (never the model key).
const badKey = await setup.save('opendesign', 'abc', 'OPENDESIGN_CONTROL_KEY')
eq('a short control key is rejected', badKey.ok, false)
ok('the rejection names the control key', /control key/i.test(String(badKey.error)))
const od = adapters.get('opendesign')
od.validateControlKey = async () => ({ ok: true, workspaceId: 'ws_test' })
const goodKey = await setup.save('opendesign', 'vela_ctrl_abcdef123456', 'OPENDESIGN_CONTROL_KEY')
eq('a control key is stored', goodKey.ok, true)
eq('the control key went to its own ref', store.get('OPENDESIGN_CONTROL_KEY'), 'vela_ctrl_abcdef123456')
ok('the model key was not written', !store.has('OPENDESIGN_API_KEY'))
eq('a named workspace is filled in automatically', store.get('OPENDESIGN_WORKSPACE_ID'), 'ws_test')
ok('the control key is never echoed', !JSON.stringify(goodKey).includes('vela_ctrl_abcdef123456'))

const clearedKey = await setup.clear('opendesign', 'OPENDESIGN_CONTROL_KEY')
eq('clear removes the control key', clearedKey.cleared, true)
eq('clear reports the control key as unset', clearedKey.entry.set, false)

store.set('QWEN_TOKEN_PLAN_COOKIE', 'stale=1')
const cleared = await setup.clear('qwen-token-plan-cn')
eq('clear removes the cookie', cleared.cleared, true)
eq('clear reports the entry as unset', cleared.entry.set, false)

console.log('\n[lib/cookie-setup.js] extras group usage')

// A stored control key must show the numbers it unlocks on the settings card.
// Before this probe the card said "已配置" and "未取到用量" at the same time,
// which reads as "the sign-in did not work" even though the panel row was fine.
const stubSecrets = {
  read: async (ref) => stubStore.get(ref) || null,
  write: async (ref, value) => { stubStore.set(ref, value); return true },
  clear: async (ref) => stubStore.delete(ref),
}
const stubStore = new Map([
  ['OPENDESIGN_API_KEY', 'sk-amr-stub'],
  ['OPENDESIGN_CONTROL_KEY', 'vela_ctrl_stub_1234'],
  ['OPENDESIGN_WORKSPACE_ID', 'ws_stub'],
])
let stubProbes = 0
let stubWorkspace = 'ws_stub'
const stubAdapter = {
  id: 'opendesign',
  label: 'OpenDesign',
  consoleUrl: 'https://open-design.ai',
  secret: {
    ref: 'OPENDESIGN_API_KEY',
    type: 'key',
    extras: [{ ref: 'OPENDESIGN_CONTROL_KEY', as: 'controlKey' }, { ref: 'OPENDESIGN_WORKSPACE_ID', as: 'workspaceId' }],
  },
  validateControlKey: async (key) => {
    if (key !== 'vela_ctrl_stub_1234' && key !== 'vela_ctrl_stub_5678') return { ok: false, message: 'nope' }
    return { ok: true, workspaceId: 'ws_from_key', message: 'ok' }
  },
  fetchSecret: async (key, ctx) => {
    stubProbes += 1
    const extras = (ctx && ctx.extras) || {}
    if (!extras.controlKey) return { status: 'no-control-key' }
    stubWorkspace = extras.workspaceId || stubWorkspace
    return {
      status: 'ok',
      kind: 'money',
      currency: 'USD',
      plan: 'go',
      amount: 3.5,
      workspaceId: stubWorkspace,
      windows: [
        { label: '5-hour', usedPct: 10, remainPct: 90, resetAt: null },
        { label: 'Weekly', usedPct: 20, remainPct: 80, resetAt: null },
      ],
      notes: ['Coding plan'],
    }
  },
}
const stubAdapters = { get: (id) => (id === 'opendesign' ? stubAdapter : null), all: [] }
const stubSetup = cookieSetup.createCookieSetup({ adapters: stubAdapters, secrets: stubSecrets })
const stubList = await stubSetup.list()
const controlRow = stubList.find((e) => e.ref === 'OPENDESIGN_CONTROL_KEY')
const wsRow = stubList.find((e) => e.ref === 'OPENDESIGN_WORKSPACE_ID')
eq('the control-key row reports what it unlocked', controlRow.amount, 3.5)
eq('the control-key row reports the plan', controlRow.plan, 'go')
eq('the control-key row reports both windows', controlRow.windows.map((w) => w.label), ['5-hour', 'Weekly'])
ok('the control-key row carries readable percentages', controlRow.windows.every((w) => Number.isFinite(w.remainPct)))
eq('the workspace row stays a plain field', wsRow.amount, undefined)
eq('the probe reads the workspace id from the sibling row', controlRow.workspaceId, 'ws_stub')
eq('one probe per list call', stubProbes, 1)
const cachedList = await stubSetup.list()
eq('a second list inside the ttl reuses the probe', stubProbes, 1)
eq('the cached list still has the numbers', cachedList.find((e) => e.ref === 'OPENDESIGN_CONTROL_KEY').amount, 3.5)

// Saving a new key drops both probes: the card must show the new account, not
// the numbers from the key it replaced.
const stubSaved = await stubSetup.save('opendesign', 'vela_ctrl_stub_5678', 'OPENDESIGN_CONTROL_KEY')
eq('a saved control key reports usage straight away', stubSaved.entry.amount, 3.5)
eq('a saved control key is validated', stubSaved.validation.ok, true)
eq('the save triggered a fresh probe', stubProbes, 2)
eq('the workspace is still the stored one', stubStore.get('OPENDESIGN_WORKSPACE_ID'), 'ws_stub')
const clearedStub = await stubSetup.clear('opendesign', 'OPENDESIGN_CONTROL_KEY')
eq('clearing the key empties the row', clearedStub.entry.set, false)
ok('the group probe is forgotten with the key', stubSetup.invalidate('OPENDESIGN_CONTROL_KEY') === undefined)


console.log('\n[lib/providers/opendesign.js]')
const odModule = await import(url.pathToFileURL(path.join(ROOT, 'lib/providers/opendesign.js')).href)

// Contract shapes from packages/contracts/src/api/collab.ts: credits are
// strings, 18000s is a 5-hour pool and 604800s is a weekly one.
const preflightBody = {
  schemaVersion: 1,
  workspaceId: 'ws_1',
  generatedAt: '2026-11-14T00:00:00Z',
  balanceUsd: '12.50',
  funding: 'coding_plan',
  codingPlan: {
    eligible: true,
    tier: 'go',
    windows: [
      { policyId: 'p5h', durationSeconds: 18000, resetMode: 'anchored_recurring', usedCredits: '5', limitCredits: '18', remainingCredits: '13', resetsAt: '2026-11-14T12:00:00Z' },
      { policyId: 'p7d', durationSeconds: 604800, resetMode: 'anchored_recurring', usedCredits: '10', limitCredits: '55', remainingCredits: '45', resetsAt: '2026-11-20T00:00:00Z' },
      { policyId: 'empty', durationSeconds: 18000, usedCredits: '0', limitCredits: '0', remainingCredits: '0' },
    ],
  },
}
const pre = odModule.parsePreflight(preflightBody)
eq('preflight reads the plan tier', pre.tier, 'go')
eq('preflight reads the funding source', pre.funding, 'coding_plan')
eq('preflight reads the wallet balance', pre.balanceUsd, 12.5)
eq('preflight labels an 18000s pool as 5-hour', pre.windows.map((w) => w.label), ['5-hour', 'Weekly'])
eq('preflight computes a percentage from string credits', Math.round(pre.windows[0].usedPct), 28)
ok('preflight drops a window with no limit', pre.windows.length === 2)
ok('preflight reads a reset time', Number.isFinite(pre.windows[0].resetAt))
eq('a wallet balance parses out of a string', odModule.parseWallet({ balanceUsd: '9.99' }).balanceUsd, 9.99)
eq('a balance that is absent stays null', odModule.parseWallet({}), null)
eq('a summary reads its tier', odModule.parseSummary({ membershipTier: 'plus', subscriptionStatus: 'active' }).membershipTier, 'plus')
eq('a summary without fields is null', odModule.parseSummary({}), null)
eq('a workspace id is read', odModule.parseWorkspace({ workspaceId: 'ws_9' }).workspaceId, 'ws_9')
eq('a nested workspace is read', odModule.parseWorkspace({ workspace: { workspaceId: 'ws_8' } }).workspaceId, 'ws_8')
eq('the adapter keeps the model key as its secret', odModule.default.secret.ref, 'OPENDESIGN_API_KEY')
eq('the adapter asks for three extras', odModule.default.secret.extras.map((e) => e.ref), ['OPENDESIGN_CONTROL_KEY', 'OPENDESIGN_WORKSPACE_ID', 'OPENDESIGN_CONSOLE_COOKIE'])
eq('the control key is exposed as controlKey', odModule.default.secret.extras[0].as, 'controlKey')
ok('the adapter declares a control-key validator', typeof odModule.default.validateControlKey === 'function')

// Three billing endpoints, three independent answers: asking serially cost
// seconds on the first paint.
ok('the billing endpoints are asked in parallel', /const \[preflight, wallet, summary\] = await Promise\.all\(/.test(
  read('lib/providers/opendesign.js')
))

// A runtime key is the wrong credential for billing: the adapter must say so
// instead of reporting a zero balance.
const noControl = await odModule.default.fetchSecret('sk-amr-x', { auth: 'key', extras: {} })
eq('a missing control key is reported as such', noControl.status, 'no-control-key')
ok('the detail explains which credential is needed', /控制键|Cookie/.test(String(noControl.detail)))
ok('a missing control key is not a zero balance', noControl.amount === undefined)

console.log('\n[lib/opendesign-login.js]')
const odLogin = await import(url.pathToFileURL(path.join(ROOT, 'lib/opendesign-login.js')).href)

// The device-authorization contract, measured against the live control plane
// on 2026-11-14: POST returns 201 with deviceId/userCode/deviceSecret and a
// 120-second window; the token endpoint answers 200 with status "pending"
// until a browser approves the code, then hands back `controlKey`.
const startedBody = {
  deviceId: 'dev_1',
  userCode: 'JHP98X',
  status: 'pending',
  expiresAt: '2026-11-14T11:12:00.000Z',
  deviceSecret: 'sec_1',
  activationUrl: 'https://open-design.ai/cloud/cli/activate?deviceId=dev_1&userCode=JHP98X',
  pollIntervalSeconds: 2,
}
const pendingBody = { deviceId: 'dev_1', userCode: 'JHP98X', status: 'pending', controlKeyId: null, controlKey: null, runtimeKey: null, user: null }
const grantedBody = { deviceId: 'dev_1', status: 'approved', controlKey: 'vela_ctrl_abcdef123456', runtimeKey: 'sk-amr_xyz', user: { email: 'me@example.com' } }

const auth = odLogin.parseAuthorization(startedBody, 1000)
eq('an authorization keeps its device id', auth.deviceId, 'dev_1')
eq('an authorization keeps its user code', auth.userCode, 'JHP98X')
eq('an authorization keeps its secret', auth.deviceSecret, 'sec_1')
eq('the poll interval is read in milliseconds', auth.intervalMs, 2000)
ok('the approval link is passed through unchanged', auth.activationUrl.startsWith('https://open-design.ai/cloud/cli/activate'))
ok('the window expires in the future', auth.until > auth.startedAt)
eq('a body without a device id is refused', odLogin.parseAuthorization({ userCode: 'A' }, 1000), null)
eq('a body without a secret is refused', odLogin.parseAuthorization({ deviceId: 'd', userCode: 'A' }, 1000), null)
const noUrl = odLogin.parseAuthorization({ deviceId: 'd', deviceSecret: 's', userCode: 'ABCDEF' }, 1000)
ok('a missing activation link falls back to the console', noUrl.activationUrl.includes('/cloud/cli/activate?userCode=ABCDEF'))
const noInterval = odLogin.parseAuthorization({ deviceId: 'd', deviceSecret: 's', userCode: 'A' }, 1000)
eq('a missing poll interval falls back to 2s', noInterval.intervalMs, 2000)
const noExpiry = odLogin.parseAuthorization({ deviceId: 'd', deviceSecret: 's', userCode: 'A' }, 1000)
ok('a missing expiry still yields a 10-minute window', noExpiry.until - noExpiry.startedAt === odLogin.MAX_WAIT_MS)

eq('a control key is recognised', odLogin.looksLikeControlKey('vela_ctrl_abcdef123456'), true)
eq('a sentence is not a control key', odLogin.looksLikeControlKey('paste the key here'), false)
eq('an empty string is not a control key', odLogin.looksLikeControlKey(''), false)

eq('a pending answer reads as pending', odLogin.readAnswer({ ok: true, status: 200, body: pendingBody }).state, 'pending')
const grant = odLogin.readAnswer({ ok: true, status: 200, body: grantedBody })
eq('an approved answer carries the control key', grant.grant.controlKey, 'vela_ctrl_abcdef123456')
eq('an approved answer carries the account email', grant.grant.email, 'me@example.com')
eq('a denied approval reads as an error', odLogin.readAnswer({ ok: true, status: 200, body: { status: 'denied' } }).reason, 'denied')
eq('a 404 reads as expired', odLogin.readAnswer({ ok: false, status: 404 }).reason, 'expired')
eq('a 401 reads as rejected', odLogin.readAnswer({ ok: false, status: 401 }).reason, 'rejected')
eq('a 503 stays pending — the user may have approved already', odLogin.readAnswer({ ok: false, status: 503 }).state, 'pending')
eq('an approved answer without a usable key is not a grant', odLogin.readAnswer({ ok: true, status: 200, body: { status: 'approved' } }).state, 'pending')

// The whole flow against a scripted control plane: start, two pending polls,
// then the grant. No timer of its own — the page drives every poll.
const loginStore = new Map()
const loginSecrets = {
  read: async (key) => loginStore.get(key) || null,
  write: async (key, value) => { loginStore.set(key, value); return true },
  clear: async (key) => loginStore.delete(key),
}
let calls = 0
const scripted = async (href, options) => {
  calls += 1
  if (href.endsWith('/cli/device-authorizations')) {
    const body = JSON.parse(String(options && options.body))
    eq('the start request names a CLI version', typeof body.cliVersion, 'string')
    eq('the start request names this host', body.host, 'probe-host')
    return { ok: true, status: 201, body: startedBody }
  }
  if (calls <= 2) return { ok: true, status: 200, body: pendingBody }
  return { ok: true, status: 200, body: grantedBody }
}
let now = 1000
const deviceLogin = odLogin.createDeviceLogin({
  secrets: loginSecrets,
  fetchJson: scripted,
  hostName: 'probe-host',
  product: 'dsh-model-panel/0.6.0',
  clock: () => now,
})
const st0 = await deviceLogin.snapshot()
eq('a fresh login is idle', st0.state, 'idle')
const st1 = await deviceLogin.start()
eq('a started login is pending', st1.state, 'pending')
eq('the page gets the code to show', st1.userCode, 'JHP98X')
ok('the page gets a link to open', st1.activationUrl.includes('/cloud/cli/activate'))
const early = await deviceLogin.status()
eq('a poll before the interval is not sent', calls, 1)
eq('the early poll still reports pending', early.state, 'pending')
now += 2000
const st2 = await deviceLogin.status()
eq('the first due poll is sent', calls, 2)
eq('an unapproved poll stays pending', st2.state, 'pending')
now += 2000
const st3 = await deviceLogin.status()
eq('the approved poll grants', st3.state, 'granted')
eq('the control key lands in the credential store', loginStore.get('OPENDESIGN_CONTROL_KEY'), 'vela_ctrl_abcdef123456')
ok('the grant response never echoes the key', st3.controlKey === undefined && st3.state === 'granted')
now += 2000
const st4 = await deviceLogin.status()
eq('a granted login stops polling', calls, 3)
const cancelled = deviceLogin.cancel()
eq('cancel forgets the pending authorization', cancelled.state, 'idle')
ok('cancel leaves the stored key alone', loginStore.get('OPENDESIGN_CONTROL_KEY') === 'vela_ctrl_abcdef123456')

// A service that answers 503 four times in a row is reported, not swallowed.
const downLogin = odLogin.createDeviceLogin({
  secrets: loginSecrets,
  fetchJson: async () => ({ ok: false, status: 503, error: 'HTTP 503' }),
  hostName: 'probe-host',
  product: 'dsh-model-panel/0.6.0',
  clock: () => 200000,
})
const down = await downLogin.start()
eq('a control plane that stays down is an error', down.state, 'error')
ok('the error names the status', /503/.test(String(down.message)))

console.log('\n[lib/opendesign-login-route.js]')
const odRoute = await import(url.pathToFileURL(path.join(ROOT, 'lib/opendesign-login-route.js')).href)
ok('the route exposes a handler factory', typeof odRoute.createLoginHandler === 'function')

// The handler is the only door to the state machine, so its fence is tested
// with a stub request/response pair rather than by trusting the wiring.
function fakeRequest(body, headers, method) {
  const text = body === undefined ? '' : JSON.stringify(body)
  const req = {
    method: method || 'POST',
    headers: headers || { host: '127.0.0.1:3088' },
    [Symbol.asyncIterator]: async function* () {
      if (text) yield Buffer.from(text)
    },
  }
  return req
}
function fakeResponse() {
  const out = { status: 0, body: '', ended: false }
  return {
    out,
    writeHead(status) { out.status = status },
    end(chunk) { out.body = chunk ? String(chunk) : ''; out.ended = true },
  }
}
const routeStore = new Map()
const routeSecrets = {
  read: async (k) => routeStore.get(k) || null,
  write: async (k, v) => { routeStore.set(k, v); return true },
  clear: async (k) => routeStore.delete(k),
}
const routeLogin = odLogin.createDeviceLogin({
  secrets: routeSecrets,
  fetchJson: async () => ({ ok: true, status: 201, body: startedBody }),
  hostName: 'route-host',
  product: 'dsh-model-panel/0.6.0',
  clock: () => 5000,
})
const handler = odRoute.createLoginHandler({ login: routeLogin, denied: (req) => (req.headers.host === 'evil.example' ? 403 : 0) })

const r405 = fakeResponse()
await handler(fakeRequest(undefined, { host: '127.0.0.1:3088' }, 'GET'), r405)
eq('a GET is refused', r405.out.status, 405)
const r403 = fakeResponse()
await handler(fakeRequest({ action: 'start' }, { host: 'evil.example' }), r403)
eq('a foreign host is refused by the host guard', r403.out.status, 403)
const r400 = fakeResponse()
await handler(fakeRequest({ action: 'sign-in' }), r400)
eq('an unknown action is a 400', r400.out.status, 400)
ok('the 400 names the action it got', /sign-in/.test(r400.out.body))
const rBad = fakeResponse()
await handler(fakeRequest({}), rBad)
eq('a missing action is a 400', rBad.out.status, 400)
const rStart = fakeResponse()
await handler(fakeRequest({ action: 'start' }), rStart)
eq('a start is answered with 200', rStart.out.status, 200)
const startBody = JSON.parse(rStart.out.body)
eq('the start response carries the code', startBody.userCode, 'JHP98X')
ok('the start response never carries the device secret', JSON.stringify(startBody).indexOf('sec_1') === -1)
const rStatus = fakeResponse()
await handler(fakeRequest({ action: 'status' }), rStatus)
eq('a status while the interval has not elapsed stays pending', JSON.parse(rStatus.out.body).state, 'pending')
const rCancel = fakeResponse()
await handler(fakeRequest({ action: 'cancel' }), rCancel)
eq('cancel answers idle', JSON.parse(rCancel.out.body).state, 'idle')


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
ok('host rejects non-POST secret writes', hostSrc.includes("req.method !== 'POST'"))

// ------------------------------------------------------- subagent switch
console.log('\n[subagent switch]')
ok('the gate module exists', exists('lib/subagent-gate.js'))
const gateMod = await import(url.pathToFileURL(path.join(ROOT, 'lib/subagent-gate.js')).href)
ok('the gate factory is exported', typeof gateMod.createSubagentGate === 'function')
ok('delegation tools are named', gateMod.DELEGATION_TOOLS.includes('subagent') && gateMod.DELEGATION_TOOLS.includes('subagent_oar'))
ok('host serves the subagent route', indexSrc.includes("SUBAGENT_ROUTE = '/dsh-model-panel/subagent.json'"))
ok('host installs the tool gate', indexSrc.includes('tools.guard'))
ok('host gates through the injected tools service', /ctx\.inject\(\['tools'\]/.test(indexSrc))
ok('client talks to the subagent route', clientSrc.includes("const SUBAGENT_ENDPOINT = '/dsh-model-panel/subagent.json'"))
ok('the switch row has its own class', clientSrc.includes("className: 'dshmp-opts'"))
ok('the switch row is styled', /\.dshmp-opts\{/.test(clientSrc))
for (const key of ['subagent', 'subagentOn', 'subagentOff', 'subagentUnknown', 'subagentFailed']) {
  ok('dictionary carries ' + key, clientSrc.includes(key + ': '))
}
ok('the switch closes the dropdown body', /dshmp-body' \}, body, failureNodes\),/.test(clientSrc))

// The switch stores beside the other plugin state, not inside the session log.
const gateDir = fs.mkdtempSync(path.join(ROOT, '.gate-test-'))
const fakeSessions = {
  map: { root: { header: { id: 'root' } }, child: { header: { id: 'child', parentSession: 'root' } } },
  get: (id) => fakeSessions.map[id],
}
const gate = gateMod.createSubagentGate({ cacheDir: gateDir, get: (name) => (name === 'sessions' ? fakeSessions : null) })
eq('a fresh session allows subagents', gate.state('root').enabled, true)
eq('a fresh session reports the default', gate.state('root').source, 'default')
eq('the gate lets a delegation through by default', gate.guard({ name: 'subagent', agent: { session: { header: { id: 'root' } } } }), undefined)
eq('a session with no agent passes', gate.guard({ name: 'subagent' }), undefined)
eq('an unrelated tool passes', gate.guard({ name: 'bash', agent: { session: { header: { id: 'root' } } } }), undefined)
const offRes = gate.setEnabled('root', false)
eq('the switch stores the off state', offRes.ok, true)
eq('the off state is readable back', gate.state('root').enabled, false)
eq('the off state comes from the store', gate.state('root').source, 'store')
ok('a blocked delegation explains itself', typeof gate.guard({ name: 'subagent', agent: { session: { header: { id: 'root' } } } }) === 'string')
eq('a child inherits the root decision', gate.state('child').enabled, false)
eq('a non-delegation tool still runs', gate.guard({ name: 'bash', agent: { session: { header: { id: 'root' } } } }), undefined)
gate.setEnabled('root', true)
eq('the switch turns back on', gate.state('root').enabled, true)
eq('the gate reopens', gate.guard({ name: 'subagent', agent: { session: { header: { id: 'root' } } } }), undefined)
fs.rmSync(gateDir, { recursive: true, force: true })

// ------------------------------------------------------- route contracts
// The four endpoints share one fence and one error wrapper, so the wrapper is
// exercised against a stub server rather than trusting the wiring.
console.log('\n[lib/routes.js]')
const routesMod = await import(url.pathToFileURL(path.join(ROOT, 'lib/routes.js')).href)
ok('the fence factory is exported', typeof routesMod.createFence === 'function')
ok('the handler wrapper is exported', typeof routesMod.fenced === 'function')
ok('the subagent route factory is exported', typeof routesMod.createSubagentRoute === 'function')

const routeFence = routesMod.createFence({ get: () => null })
eq('a loopback request passes the fence', routeFence(fakeRequest(undefined, { host: '127.0.0.1:3088' })), null)
eq('a LAN host is refused', routeFence(fakeRequest(undefined, { host: '192.168.1.9:3088' })), 403)
eq('a foreign origin is refused', routeFence(fakeRequest(undefined, { host: '127.0.0.1:3088', origin: 'https://evil.example' })), 403)
eq('a cross-site fetch is refused', routeFence(fakeRequest(undefined, { host: '127.0.0.1:3088', 'sec-fetch-site': 'cross-site' })), 403)
const rejectionless = { 'connection.requestRejection': undefined }
const strictFence = routesMod.createFence({ get: () => ({ requestRejection: () => 405 }) })
eq('a host-level rejection code is forwarded', strictFence(fakeRequest(undefined, { host: '127.0.0.1:3088' })), 405)
ok('a null connection service is tolerated', routeFence(fakeRequest(undefined, { host: '127.0.0.1:3088' })) === null && rejectionless['connection.requestRejection'] === undefined)

const snapStub = async () => ({ ok: true, updatedAt: 7, rows: [], thirdParty: [] })
const cookieStub = {
  list: async () => [{ id: 'opendesign', ref: 'OPENDESIGN_CONTROL_KEY' }],
  save: async (id, value) => ({ ok: Boolean(value), id }),
  clear: async (id) => ({ ok: true, id }),
}
const routeHandlers = routesMod.createRoutes({ snapshot: snapStub, cookieSetup: cookieStub })

const okRes = fakeResponse()
await routesMod.fenced(routeFence, routeHandlers.handleState)(fakeRequest(undefined, { host: '127.0.0.1:3088' }, 'GET'), okRes)
eq('state answers 200', okRes.out.status, 200)
ok('state body is json', okRes.out.body.includes('"ok":true'))
const crossRes = fakeResponse()
await routesMod.fenced(routeFence, routeHandlers.handleState)(fakeRequest(undefined, { host: '127.0.0.1:3088', origin: 'https://evil.example' }, 'GET'), crossRes)
eq('state is fenced before the handler runs', crossRes.out.status, 403)

const brokenRes = fakeResponse()
const boom = routesMod.fenced(routeFence, async () => { throw new Error('kaboom') })
await boom(fakeRequest(undefined, { host: '127.0.0.1:3088' }, 'GET'), brokenRes)
eq('a thrown handler becomes 500', brokenRes.out.status, 500)
ok('the 500 names the failure', brokenRes.out.body.includes('kaboom'))

const setRes = fakeResponse()
await routeHandlers.handleSettings(fakeRequest(undefined, { host: '127.0.0.1:3088' }, 'POST'), setRes)
eq('settings refuses a write method', setRes.out.status, 405)
const setGet = fakeResponse()
await routeHandlers.handleSettings(fakeRequest(undefined, { host: '127.0.0.1:3088' }, 'GET'), setGet)
eq('settings lists entries', setGet.out.status, 200)
ok('settings reports the total', setGet.out.body.includes('"total":1'))

const secGet = fakeResponse()
await routeHandlers.handleSecret(fakeRequest(undefined, { host: '127.0.0.1:3088' }, 'GET'), secGet)
eq('secret refuses a read method', secGet.out.status, 405)
const secBad = fakeResponse()
await routeHandlers.handleSecret(fakeRequest({ nope: true }, { host: '127.0.0.1:3088' }), secBad)
eq('secret refuses a body without a value', secBad.out.status, 400)
const secSave = fakeResponse()
await routeHandlers.handleSecret(fakeRequest({ id: 'opendesign', value: 'cookie' }, { host: '127.0.0.1:3088' }), secSave)
eq('secret stores a value', secSave.out.status, 200)

const gateRoute = routesMod.createSubagentRoute({ gate })
const swGet = fakeResponse()
await gateRoute.handleSubagent(fakeRequest(undefined, { host: '127.0.0.1:3088' }, 'GET'), swGet)
ok('the switch reads a state object', swGet.out.body.includes('"enabled":true'))
const swPost = fakeResponse()
await gateRoute.handleSubagent(fakeRequest({ enabled: false, sessionId: 'root' }, { host: '127.0.0.1:3088' }), swPost)
ok('the switch accepts a boolean', swPost.out.body.includes('"enabled":false'))
const swBad = fakeResponse()
await gateRoute.handleSubagent(fakeRequest({ enabled: 'no' }, { host: '127.0.0.1:3088' }), swBad)
eq('the switch rejects a non-boolean', swBad.out.status, 400)
await gate.setEnabled('root', true)

// ------------------------------------------------------------- client chunks
// The browser half is loaded as package-local chunks: the loader only accepts
// files named client.*.js, the entry can only await them through
// require.async('./client.<name>.js'), and a chunk factory cannot await — so
// the dependency order is part of the contract, not an implementation detail.
console.log('\n[client chunks]')
const CHUNK_NAMES = clientChunks
const CHUNK_SHAPE = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/
for (const name of CHUNK_NAMES) {
  ok('chunk name is loadable: ' + name, CHUNK_SHAPE.test(name))
  ok('chunk ships with the package: ' + name, exists(name))
  const src = read(name)
  ok('chunk registers itself: ' + name, src.includes("chunk: '" + name + "'"))
  ok('chunk names the owner package: ' + name, src.includes("id: 'dsh-model-panel'"))
  ok('chunk factory returns its exports: ' + name, /return \{/.test(src))
}
ok('the entry awaits every chunk', CHUNK_NAMES.every((name) => entrySrc.includes("./" + name)))
ok('the shared chunk loads first', entrySrc.indexOf('./client.shared.js') < entrySrc.indexOf('./client.panel.js'))
ok('the panel chunk precedes the settings chunk that imports it', entrySrc.indexOf('./client.panel.js') < entrySrc.indexOf('./client.settings.js'))
ok('the stylesheet chunk is loaded last', entrySrc.indexOf('./client.css.js') > entrySrc.indexOf('./client.panel.js'))
ok('the entry is small enough to be an entry', entrySrc.split(/\r?\n/).length < 200)
ok('the entry keeps no dictionary of its own', !entrySrc.includes('pickModel:'))
ok('the entry mounts the stylesheet by element id', entrySrc.includes('dsh-model-panel-styles') && entrySrc.includes('document.getElementById(STYLE_ID)'))
ok('the stylesheet is written once, not returned as a vnode', !entrySrc.includes("h('style'"))
ok('a chunk revision marker exists', /const CHUNK_REV = '\d/.test(entrySrc))
// The host derives the chunk cache key from client.js metadata only, so a
// release must move the marker with the version or a browser keeps the old
// chunk for a year (max-age=31536000, immutable).
const chunkRev = entrySrc.match(/const CHUNK_REV = '([^']+)'/)[1]
ok('the chunk revision tracks the release', chunkRev === pkg.version || chunkRev.startsWith(pkg.version + '.'))
ok('the stylesheet lives in its own chunk', read('client.css.js').includes('const CSS = `') && read('client.css.js').trim().endsWith('});'))
ok('no chunk re-declares the CSS', CHUNK_NAMES.filter((n) => n !== 'client.css.js').every((n) => !read(n).includes('dshmp-trigger{')))
ok('the settings chunk imports the panel seat', read('client.settings.js').includes("require('dsh-model-panel/client.panel.js')"))
ok('no chunk imports itself', CHUNK_NAMES.every((n) => !read(n).includes('client/' + n)))

// The dropdown closes with the subagent switch: it must stay the last child
// of the panel body, after the failure notices.
const panelSrc = read('client.panel.js')
const innerStart = panelSrc.indexOf('const panelInner')
const innerEnd = panelSrc.indexOf('function ', innerStart + 10)
const innerBody = panelSrc.slice(innerStart, innerEnd < 0 ? undefined : innerEnd)
// The dropdown closes with the switch: it is the last argument of the
// Fragment right after the scrolling body (and its failure notices).
const subagentTail = /h\('div', \{ className: 'dshmp-body' \}, body, failureNodes\),\s*subagentRow\s*\n?\s*\)/
ok('the switch row is the last child of the panel body', subagentTail.test(innerBody))
ok('the failure notices stay above the switch', innerBody.indexOf('failureNodes') < innerBody.indexOf('subagentRow'))
ok('the panel memoizes its provider layout', panelSrc.includes('const layout = useMemo('))
ok('the panel memoizes its credit map', panelSrc.includes('const thirdByEntry = useMemo('))
ok('the panel memoizes its model rows', panelSrc.includes('const boxes = useMemo('))
ok('the clock behind the badges is state, not a per-render Date', panelSrc.includes('const [nowKey, setNowKey] = useState(') && panelSrc.includes('useMemo(() => new Date(nowKey), [nowKey])'))
ok('the seed is read from storage once', panelSrc.includes('if (seedRef.current === null) seedRef.current = savedBalance()'))
ok('the badges refresh on a minute tick', panelSrc.includes('setInterval(() => setNowKey(Date.now()), 60_000)'))
ok('the ticker is cleared on close', panelSrc.includes('clearInterval(tick)'))
ok('useMemo is imported from react', /const \{[^}]*useMemo[^}]*\} = React/.test(clientSrc))
// -------------------------------------------------------------- client boot
// Assemble the real chunk graph in memory: the loader contract is the one
// thing unit checks cannot see, so every chunk is executed against a stub
// __ModuleLoader__ and the entry is asked to register both slots.
console.log('\n[client boot]')
const booted = []
const loader = { load(registration) { booted.push(registration) } }
for (const name of ['client.shared.js', 'client.css.js', 'client.panel.js', 'client.settings.js', 'client.js']) {
  const source = read(name)
  new Function('window', source)({ __ModuleLoader__: loader })
}
eq('every chunk plus the entry registered', booted.length, 5)
ok('one registration is the un-chunked entry', booted.filter((r) => r.chunk === undefined).length === 1)
eq('the entry keeps the package id', booted[0].id, 'dsh-model-panel')
const factoryFor = (name) => booted.find((r) => (r.chunk || 'client.js') === name)
const reactStub = {
  createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {},
  useRef: (v) => ({ current: v }), useCallback: (f) => f, useMemo: (f) => f(),
  useSyncExternalStore: () => null, Fragment: 'fragment', Component: class {},
}
const requireTable = new Map()
function makeRequire() {
  const req = (spec) => {
    if (spec === 'react') return reactStub
    if (spec === 'react-dom') throw new Error('react-dom absent')
    if (requireTable.has(spec)) return requireTable.get(spec)
    const registration = booted.find((r) => 'dsh-model-panel/' + r.chunk === spec)
    if (!registration) throw new Error('module table miss: ' + spec)
    const exportsOf = registration.factory(makeRequire())
    requireTable.set(spec, exportsOf)
    return exportsOf
  }
  req.asset = () => ''
  req.async = async (relative) => req('dsh-model-panel/' + relative.slice(2))
  return req
}
const plugin = factoryFor('client.js').factory(makeRequire())
eq('the entry exports an apply', typeof plugin.apply, 'function')
eq('the entry declares its services', plugin.inject, ['slots', 'locale', 'sessions'])

const seats = []
const slotServices = {
  inject(name, run) { run() },
  register(definition, component) { seats.push({ definition, component }) },
}
const scope = { get: (name) => (name === 'slots' ? slotServices : null) }
await plugin.apply({ get: () => null, inject: (names, run) => run(scope) })

const sharedTable = requireTable.get('dsh-model-panel/client.shared.js')
eq('the shared chunk answers the dictionary', typeof sharedTable.zh.setTitle, 'string')
for (const name of ['savedBalance', 'loadBalance', 'creditFor', 'orderGroups', 'ThinkingToggle', 'EffortSlider']) {
  ok('the shared chunk exports ' + name, name in sharedTable)
}
const cssTable = requireTable.get('dsh-model-panel/client.css.js')
ok('the css chunk carries the rules', cssTable.CSS.includes('.dshmp-trigger{') && cssTable.CSS.includes('.dshmp-opts{'))
const panelTable = requireTable.get('dsh-model-panel/client.panel.js')
eq('the panel chunk exports the seat', typeof panelTable.ModelPanel, 'function')
const settingsTable = requireTable.get('dsh-model-panel/client.settings.js')
eq('the settings chunk exports the boundary', typeof settingsTable.SeatBoundary, 'function')
eq('the settings chunk exports the tab', typeof settingsTable.CookieUsageTab, 'function')
eq('both slots are contributed', seats.length, 2)
const seatRow = seats.find((row) => row.definition.name === 'conversation.input.model')
eq('the model seat keeps priority -5', seatRow.definition.priority, -5)
eq('the model seat draws the native label slot', Object.keys(seatRow.definition.children)[0], 'conversation.input.model.label')
eq('a crashed seat degrades to the boundary', seatRow.component, settingsTable.SeatBoundary)
const settingsRow = seats.find((row) => row.definition.name === 'settings.plugins.tab')
eq('the settings tab keeps its id', settingsRow.definition.id, 'dsh-model-panel')
eq('the settings tab renders the cookie form', settingsRow.component, settingsTable.CookieUsageTab)
ok('the seat props resolve a session', typeof seatRow.definition.inject('session-1'), 'object')
ok('a missing directory still yields props', seatRow.definition.inject('session-1').available === false)

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
