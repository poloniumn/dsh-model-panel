/**
 * Per-session "subagents on/off" switch: storage, the tool gate it drives, and
 * the handler behind its own JSON route.
 *
 * The host has no per-session delegation switch of its own — delegation is a
 * depth setting (dsh-tool-subagent's maxDepth, 0 forbidding it) applied to the
 * whole install. This module keeps the flag itself, keyed by ROOT session so a
 * child inherits what the root decided, and gates the delegation tools with
 * `tools.guard` (the same hook dsh-creation-recommendations uses).
 *
 * Default is ON: only an explicit "off" blocks anything, and every read path
 * fails open. A broken store must never take the host's tool chain with it.
 */
import path from 'node:path'

import { readJson, writeJson } from './cache.js'

/** Tools that create a subagent. Team-board tools are not delegation. */
export const DELEGATION_TOOLS = ['subagent', 'subagent_oar']

/** How long a stored decision stays relevant; default is "on", so expiry is free. */
const KEEP_MS = 30 * 24 * 60 * 60_000

const ROOT_REASON = '子任务已在此会话关闭（可在模型下拉框底部重新启用）'

/**
 * @param defaultFor - optional `(rootId) => ({enabled, source}) | null`; the
 *   configured default for a session that has no stored decision of its own.
 */
export function createSubagentGate({ cacheDir, get, toolNames, defaultFor }) {
  const file = path.join(cacheDir, 'subagent-gate.json')
  const names = Array.isArray(toolNames) && toolNames.length ? toolNames.map(String) : DELEGATION_TOOLS

  /** `{ version: 1, sessions: { [rootId]: { enabled, at } } }`; never throws. */
  function readStore() {
    const data = readJson(file)
    const sessions = data && typeof data.sessions === 'object' && data.sessions ? data.sessions : {}
    const out = {}
    const now = Date.now()
    for (const [id, value] of Object.entries(sessions)) {
      if (!id || !value || typeof value !== 'object') continue
      const at = Number(value.at)
      if (Number.isFinite(at) && now - at > KEEP_MS) continue
      if (value.enabled === true) out[id] = { enabled: true, at: Number.isFinite(at) ? at : now }
      else if (value.enabled === false) out[id] = { enabled: false, at: Number.isFinite(at) ? at : now }
    }
    return { version: 1, sessions: out }
  }

  function writeStore(store) {
    writeJson(file, store)
  }

  /** The root session of `sessionId`: a record there covers every child. */
  function rootOf(sessionId) {
    let id = sessionId ? String(sessionId) : ''
    if (!id) return ''
    const sessions = get('sessions')
    if (!sessions || typeof sessions.get !== 'function') return id
    for (let hop = 0; hop < 16; hop += 1) {
      let header = null
      try {
        const session = sessions.get(id)
        header = session && session.header ? session.header : null
      } catch {
        header = null
      }
      const parent = header && header.parentSession
      if (!parent || String(parent) === id) break
      id = String(parent)
    }
    return id
  }

  /**
   * The configured default for a session with no stored decision: the plugin
   * config says either one boolean for everything, or one per agent preset.
   */
  function configured(root) {
    if (typeof defaultFor !== 'function') return null
    try {
      const value = defaultFor(root)
      if (!value || typeof value.enabled !== 'boolean') return null
      return { enabled: value.enabled, source: String(value.source || 'config') }
    } catch {
      return null
    }
  }

  /** `{ enabled, source }` for one session; `source` tells stored from default. */
  function state(sessionId) {
    const root = rootOf(sessionId) || String(sessionId || '')
    if (!root) return { enabled: true, source: 'default', root: '' }
    const record = readStore().sessions[root]
    if (record) return { enabled: record.enabled, source: 'store', root }
    const fallback = configured(root)
    if (fallback) return { enabled: fallback.enabled, source: fallback.source, root }
    return { enabled: true, source: 'default', root }
  }

  function setEnabled(sessionId, enabled) {
    const root = rootOf(sessionId) || String(sessionId || '')
    if (!root) return { ok: false, error: 'no-session' }
    const store = readStore()
    store.sessions[root] = { enabled: enabled === true, at: Date.now() }
    return writeJson(file, store)
      ? { ok: true, enabled: store.sessions[root].enabled, source: 'store', root }
      : { ok: false, error: 'store-write-failed' }
  }

  /**
   * Tool gate: refuse a delegation tool when the calling agent's root session
   * has the switch off. Everything unknown (no agent, no session, unreadable
   * store) passes.
   */
  function guard(exec) {
    try {
      if (!exec || !exec.agent) return undefined
      if (!names.includes(String(exec.name || ''))) return undefined
      const header = exec.agent.session && exec.agent.session.header ? exec.agent.session.header : null
      const id = header && header.id ? String(header.id) : ''
      if (!id) return undefined
      if (state(id).enabled) return undefined
      return ROOT_REASON
    } catch {
      return undefined
    }
  }

  return { state, setEnabled, guard, rootOf, file }
}
