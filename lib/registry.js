/**
 * Provider adapter registry.
 *
 * Adding a vendor means writing ONE object in `lib/providers/` (or one entry
 * in the `vendors.js` catalogue) and listing it here. Nothing else in the
 * plugin knows vendor names.
 *
 * Adapter shape
 * -------------
 *   id            string   provider id, exactly as it appears in the DSH
 *                          `llm-pi-ai` `providers` record. Extra ids can point
 *                          at the same adapter through `aliases`.
 *   aliases       string[] optional extra DSH provider ids handled by it
 *   label         string   short vendor name shown in the card
 *   kind          'money' | 'plan' | 'console' | 'account'
 *   order         number   sort position within its section
 *   secret        object   what the vendor needs:
 *                    { ref: 'VENDOR_API_KEY', type: 'key' }      API key
 *                    { ref: 'VENDOR_COOKIE',  type: 'cookie' }   console cookie
 *                    { type: 'account' }                         DSH login
 *                    `aliases: [...]` on a key lists other accepted ref names,
 *                    tried one at a time by the host (no cross-source merge).
 *   consoleUrl    string   where the vendor dashboard lives (row link)
 *
 *   fetchSecret   async (secret, ctx) => result | null
 *                 result = { status: 'ok' | 'expired' | 'error', detail?, ...row }
 *                 May also return `kind`, `windows` and `notes` to reshape the
 *                 row (e.g. a subscription probe falling back to a wallet).
 *                 Return null to fall through to the generic key path.
 *   parseKey      (body) => { amount, currency, bonus? }   for kind 'money'
 *   bonus         boolean  whether `amount` already includes the bonus
 *   windows       boolean  plan rows: render `windows[]` as one bar each
 *   meta          (row) => extra display metadata (schedules, badges…)
 *   setup         object   presence means "offer a setup form for this secret";
 *                          `consoleUrl` overrides the row's console link.
 *                          `label` / `ref` are NOT read here — the setup row
 *                          takes them from `label` and `secret.ref`.
 *
 * The generic paths (key → GET url → parseKey, key → GET url → parsePlan)
 * cover most vendors, so an adapter is usually 10–20 lines.
 */
import deepseek from './providers/deepseek.js'
import xiaomiApi from './providers/xiaomi-api.js'
import mimoPlan from './providers/mimo-plan.js'
import qwenPlan from './providers/qwen-plan.js'
import opencodeGo from './providers/opencode-go.js'
import moonshot from './providers/moonshot.js'
import glmCoding, { zaiInternational } from './providers/glm-coding.js'
import openrouter from './providers/openrouter.js'
import deepseekAccount from './providers/deepseek-account.js'
import { VENDORS } from './providers/vendors.js'

// The first nine entries are the hand-written adapters; the vendor catalogue
// is appended so adapter order here stays stable for existing installs.
const ALL = [
  deepseekAccount,
  deepseek,
  xiaomiApi,
  mimoPlan,
  qwenPlan,
  opencodeGo,
  moonshot,
  glmCoding,
  openrouter,
  ...VENDORS,
  zaiInternational,
]

/**
 * Build the adapter list, expanding factories. An adapter with a `create`
 * property is a factory rather than a finished object: it lets a vendor hold
 * per-install state (caches, scraped schedules) while this file stays static.
 */
export function buildAdapters(options = {}) {
  const built = []
  for (const entry of ALL) {
    if (!entry) { console.warn('[dsh-model-panel] skipping empty adapter entry'); continue }
    // `create` is a factory marker; a finished adapter never carries it.
    const adapter = typeof entry.create === 'function' ? { ...entry, ...entry.create(options) } : entry
    const { create, ...rest } = adapter
    built.push(rest)
  }
  return built
}

/** Module-level adapters usable without an install (handles, order checks). */
export const BASE_ADAPTERS = buildAdapters()

/** DSH provider id → adapter. */
export const ADAPTERS = new Map()
/** Adapters that carry their own secret, in setup-page order. */
export const SETUP_ADAPTERS = []

export function adapterFor(id) {
  return ADAPTERS.get(id) || null
}

function install(adapter) {
  ADAPTERS.set(adapter.id, adapter)
  for (const alias of adapter.aliases || []) ADAPTERS.set(alias, adapter)
  const secret = adapter.secret
  if (!secret || secret.type === 'account') return
  // A cookie is re-copied from the console, so it always takes a slot; a key
  // is only asked for when the vendor documents how to get one.
  if (!adapter.setup && secret.type !== 'cookie') return
  if (SETUP_ADAPTERS.some((other) => other.secret.ref === secret.ref)) return
  SETUP_ADAPTERS.push(adapter)
}

for (const adapter of buildAdapters()) install(adapter)

/**
 * A fresh adapter set for one install: factories get their own options, so the
 * Qwen discount cache and the scraped schedules never leak between instances.
 */
export function createAdapterSet(options = {}) {
  const list = buildAdapters(options)
  const byId = new Map()
  for (const adapter of list) {
    byId.set(adapter.id, adapter)
    for (const alias of adapter.aliases || []) byId.set(alias, adapter)
  }
  return {
    all: list,
    get: (id) => byId.get(id) || null,
  }
}