/**
 * Row building: the credential -> fetch -> parse chain for one provider.
 *
 * Split out of index.js so the entry point only assembles modules. Every row
 * is produced by an adapter, so nothing here knows about the profile: the
 * caller hands over the enabled ids and their metadata.
 */
import { errorState, getJson, num } from './util.js'

/**
 * Every name a key may be stored under, in priority order. Some vendors have
 * two accepted ref names (e.g. OpenCode Go's dedicated key and the Zen key),
 * and a profile can rename its key through `apiKeyEnv`. Names are tried one
 * at a time against the credential store — never merged across sources.
 * Cookies stay pinned to their own console ref.
 */
export function secretRefCandidates(secret, profileRef) {
  if (!secret || secret.type === 'account') return []
  if (secret.type === 'cookie') {
    const out = [{ ref: secret.ref, auth: 'cookie' }]
    for (const fallback of secret.fallbacks || []) {
      const ref = fallback && fallback.ref
      if (!ref || out.some((item) => item.ref === ref)) continue
      out.push({ ref, auth: fallback.auth || 'key' })
    }
    return out
  }
  const out = []
  const push = (ref) => {
    if (ref && !out.some((item) => item.ref === ref)) out.push({ ref, auth: 'key' })
  }
  push(profileRef)
  push(secret.ref)
  for (const alias of secret.aliases || []) push(alias)
  return out
}

/**
 * Resolve an adapter's secondary credentials (`secret.extras`).
 *
 * Some vendors split one account across two credentials: the runtime key
 * calls the model, a control key (or console cookie) reads billing. The
 * model key can never be reused for billing, so these are separate refs,
 * resolved here and handed to `fetchSecret` as `ctx.extras`. A ref that is
 * neither stored nor in the environment resolves to `undefined` — an
 * optional extra is simply absent, it is never faked.
 *
 * @returns {Promise<Record<string, string>>} keyed by `extra.as || extra.ref`
 */
export async function resolveExtras(extras, secrets) {
  const list = (Array.isArray(extras) ? extras : []).filter((extra) => extra && extra.ref)
  // Every extra is an independent lookup against the same store; resolving
  // them one by one only added latency to the rows that need two credentials.
  const values = await Promise.all(list.map((extra) => readExtra(extra.ref, secrets)))
  const out = {}
  list.forEach((extra, index) => {
    const name = extra.as || extra.ref
    const value = values[index]
    if (value) out[name] = value
    else if (!extra.optional) out[name + 'Missing'] = true
  })
  return out
}

/** Stored credential first, then the environment; trimmed, never faked. */
async function readExtra(ref, secrets) {
  let value = null
  try {
    value = await secrets.read(ref)
  } catch {
    value = null
  }
  if (!value) {
    const fromEnv = process.env[ref]
    if (fromEnv && String(fromEnv).trim()) value = String(fromEnv).trim()
  }
  return value || null
}

/**
 * First candidate that resolves wins, in candidate order, which is why the
 * probe collects all reads before deciding instead of short-circuiting.
 * @returns {Promise<{ref, auth, secret, source}|null>}
 */
async function probeCredential(candidates, secrets) {
  const reads = await Promise.all(
    candidates.map(async (candidate) => {
      let value = null
      try {
        value = await secrets.read(candidate.ref)
      } catch {
        value = null
      }
      return value || null
    })
  )
  for (let i = 0; i < candidates.length; i++) {
    if (reads[i]) return { ref: candidates[i].ref, auth: candidates[i].auth, secret: reads[i], source: 'secrets' }
  }
  // A route may also carry its key in the process environment.
  for (const candidate of candidates) {
    const fromEnv = process.env[candidate.ref]
    if (fromEnv && String(fromEnv).trim()) {
      return { ref: candidate.ref, auth: candidate.auth, secret: String(fromEnv).trim(), source: 'env' }
    }
  }
  return null
}

/** Per-id overrides (label, order, console url, secret) folded into one shape. */
export function adapterMeta(adapter, id, meta) {
  return {
    kind: adapter.kind || 'console',
    label: (adapter.labelFor && adapter.labelFor(id)) || adapter.label || meta.displayName || id,
    order: (adapter.orderFor && adapter.orderFor(id)) ?? adapter.order ?? 60,
    consoleUrl: (adapter.consoleUrlFor && adapter.consoleUrlFor(id)) ?? adapter.consoleUrl ?? null,
    secret: (adapter.secretFor && adapter.secretFor(id)) ?? adapter.secret ?? null,
  }
}

/** A provider this plugin has no adapter for: a console link only. */
export function fallbackRow(id, meta) {
  return {
    id,
    kind: 'console',
    label: (meta && meta.displayName) || id,
    order: 60,
    consoleUrl: null,
    status: 'console',
    keyRef: (meta && meta.keyRef) || null,
  }
}

export function createRows({ adapters, secrets, get }) {
  const adapterFor = (id) => (adapters && typeof adapters.get === 'function' ? adapters.get(id) : null)
  const account = () => {
    try {
      return get('deepseekAccount')
    } catch {
      return null
    }
  }

  /** Build one row for one provider. Never throws. */
  async function buildRow(id, meta) {
    try {
      const adapter = adapterFor(id)
      if (!adapter) return fallbackRow(id, meta)
      const shaped = adapterMeta(adapter, id, meta)
      const row = {
        id,
        kind: shaped.kind,
        label: shaped.label,
        order: shaped.order,
        consoleUrl: shaped.consoleUrl,
        status: 'console',
        keyRef: shaped.secret?.ref || null,
      }

      // The login-backed wallet needs no credential of its own.
      if (shaped.secret?.type === 'account') {
        try {
          return {
            ...row,
            ...(await adapter.fetchSecret(shaped.secret, { account: account() })),
          }
        } catch (err) {
          return { ...row, status: 'error', detail: String((err && err.message) || err).slice(0, 160) }
        }
      }

      if (row.kind === 'console' || !shaped.secret?.ref) return row

      // Cookie-backed adapters read their own console cookie, NOT the model
      // router's `apiKeyEnv`. Key-backed adapters may follow the rename, but
      // only when it actually resolves.
      const candidates = secretRefCandidates(shaped.secret, meta.keyRef)
      // The provider id itself names a credential ref the DSH client writes when
      // the route has no explicit `apiKeyEnv` (kimi-coding -> KIMI_CODING_API_KEY).
      // Last resort, so an explicit profile ref still wins.
      if (shaped.secret.type !== 'cookie') {
        const canonical = String(id).toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY'
        if (!candidates.some((item) => item.ref === canonical)) candidates.push({ ref: canonical, auth: 'key' })
      }
      // Candidate lookup and the secondary credentials are independent reads
      // against the same store, so they run together instead of stacking
      // three sequential await loops on the hot path of every row.
      const [credential, extras] = await Promise.all([
        probeCredential(candidates, secrets),
        shaped.secret?.extras ? resolveExtras(shaped.secret.extras, secrets) : Promise.resolve({}),
      ])
      const ref = credential ? credential.ref : candidates[0] ? candidates[0].ref : shaped.secret.ref
      const auth = credential ? credential.auth : candidates[0] ? candidates[0].auth : 'key'
      const secret = credential ? credential.secret : null
      // Where the credential came from — diagnostics only, never rendered.
      const secretSource = credential ? credential.source : null

      if (!secret && !Object.keys(extras).length) {
        return { ...row, status: 'no-key', keyRef: ref, secretSource }
      }

      if (typeof adapter.fetchSecret === 'function') {
        const result = await adapter.fetchSecret(secret, { account: account(), row, auth, extras })
        return { ...row, ...result, secretSource }
      }
      const result = await getJson((adapter.urlFor && adapter.urlFor(id)) || adapter.url, secret)
      if (!result.ok) return { ...row, ...errorState(result.error), secretSource }
      if (row.kind === 'plan') {
        const plan = adapter.parsePlan(result.body)
        if (!plan || (plan.usedPct === null && !Array.isArray(plan.windows))) {
          return { ...row, status: 'error', detail: 'unexpected plan payload' }
        }
        return { ...row, ...plan, status: 'ok', secretSource }
      }
      const balance = adapter.parseKey(result.body)
      if (!balance || num(balance.amount) === null) {
        return { ...row, status: 'error', detail: 'unexpected balance payload' }
      }
      return { ...row, status: 'ok', ...balance, secretSource }
    } catch (err) {
      return {
        id,
        kind: 'console',
        label: (meta && meta.displayName) || id,
        order: 60,
        consoleUrl: null,
        status: 'error',
        detail: String((err && err.message) || err).slice(0, 160),
      }
    }
  }

  return { buildRow, adapterFor }
}
