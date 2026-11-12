/**
 * Secrets: where a provider credential lives and how the setup page writes it.
 *
 * Every secret is a DSH credential reference (e.g. `QWEN_TOKEN_PLAN_COOKIE`).
 * The plugin only ever calls `credentials.resolve(ref)` for reading and
 * `credentials.set(ref, value)` for writing, so the value stays in the DSH
 * credential store (0600) and never enters this plugin's config, logs or the
 * browser.
 */

/** Strip a pasted `Cookie:` prefix and any line wrapping. */
export function normalizeCookie(value) {
  return String(value || '')
    .replace(/^\s*cookie\s*:\s*/i, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s*;\s*/g, '; ')
    .trim()
}

export function looksLikeCookie(value) {
  const text = normalizeCookie(value)
  return text.length > 4 && /[\w.-]+=[^;\s]+/.test(text)
}

/** Mask a secret for display: keep the ref, never the value. */
export function describeSecret(resolved) {
  if (!resolved) return { set: false }
  const value = typeof resolved === 'string' ? resolved : resolved.value
  if (!value) return { set: false }
  const text = String(value)
  return { set: true, hint: `${text.slice(0, 3)}…${text.slice(-2)} (${text.length})` }
}

export function createSecrets({ getService }) {
  function service() {
    const found = getService('credentials')
    if (!found || typeof found.resolve !== 'function') return null
    return found
  }

  async function read(ref) {
    if (!ref) return null
    const credentials = service()
    if (!credentials) return null
    try {
      const resolved = await credentials.resolve(ref)
      const value = resolved && (typeof resolved === 'string' ? resolved : resolved.value)
      if (!value) return null
      // A credential store may keep a folded `Cookie:` header as one string with
      // embedded line breaks; a header value must not.
      return String(value).replace(/[\r\n]+/g, ' ').trim() || null
    } catch {
      return null
    }
  }

  async function write(ref, value) {
    const credentials = service()
    if (!credentials || typeof credentials.set !== 'function') {
      throw new Error('credential store unavailable')
    }
    await credentials.set(ref, value)
  }

  async function clear(ref) {
    const credentials = service()
    if (!credentials || typeof credentials.unset !== 'function') return false
    try {
      await credentials.unset(ref)
      return true
    } catch {
      return false
    }
  }

  /** `{ [ref]: { set, hint } }` for the setup page — never the value itself. */
  async function status(refs) {
    const out = {}
    for (const ref of refs) {
      out[ref] = describeSecret(await read(ref))
    }
    return out
  }

  return { read, write, clear, status }
}