/**
 * Collection: which providers become rows, in what order, plus the third-party
 * credit channels that ride along.
 *
 * Split out of index.js. Everything it needs is handed in by the entry point,
 * so it holds no module-level state and can be exercised directly.
 */
export function createCollect({ adapters, rows, get, schedules, fetchThirdParty, ofmCredits }) {
  // One resolver, owned by the row builder: both halves must agree on what an
  // id maps to, and it used to be declared twice.
  const adapterFor = rows.adapterFor

  /**
   * Live provider ids from the profile's llm-pi-ai config, with displayName /
   * apiKeyEnv renames applied. Same semantics as the adapters under ./lib/providers.
   */
  function enabledProviders() {
    const ids = new Map()
    try {
      const editor = get('configEditor')
      const rows_ = (editor && typeof editor.configuration === 'function' && editor.configuration()) || []
      for (const entry of rows_) {
        const entryName = String((entry && (entry.name || entry.id)) || '')
        if (!entryName.includes('llm-pi-ai')) continue
        for (const layer of [entry && entry.inherited, entry && entry.override, entry && entry.config]) {
          const providers = layer && layer.providers
          if (!providers || typeof providers !== 'object') continue
          for (const [id, profile] of Object.entries(providers)) {
            if (!id) continue
            if (profile && profile.disabled === true) {
              ids.delete(id)
              continue
            }
            const previous = ids.get(id) || {}
            const displayName =
              typeof profile?.displayName === 'string' && profile.displayName.trim()
                ? profile.displayName.trim()
                : previous.displayName
            const keyRef =
              typeof profile?.apiKeyEnv === 'string' && profile.apiKeyEnv.trim()
                ? profile.apiKeyEnv.trim()
                : previous.keyRef
            ids.set(id, { displayName, keyRef })
          }
        }
      }
    } catch {
      /* config unreadable: no enabled rows */
    }
    return ids
  }

  async function collect(base = null) {
    const enabled = enabledProviders()

    // Every ported adapter is a data source — not only the currently enabled
    // ones. Enabled ids win so a row keeps the profile's provider id (the
    // catalog group id) even when that id is an adapter alias.
    const ids = new Map()
    // Which adapters an enabled id already resolves to. Rebuilt as ids grow,
    // so the covered test is one hash lookup instead of a scan per adapter.
    const covered = new Set()
    for (const [id, meta] of enabled) {
      ids.set(id, meta)
      const adapter = adapterFor(id)
      if (adapter) covered.add(adapter)
    }
    for (const adapter of adapters.all) {
      if (ids.has(adapter.id) || covered.has(adapter)) continue
      // The login-backed wallet only exists while the DSH login is stored.
      if (adapter.secret?.type === 'account') {
        try {
          if (typeof adapter.available === 'function' && !(await adapter.available(get('deepseekAccount')))) {
            continue
          }
        } catch {
          continue
        }
      }
      ids.set(adapter.id, {})
      covered.add(adapter)
    }

    // The peak/off-peak schedule is metadata for the rows, not an input to
    // building them, so it is fetched while the rows are in flight.
    const [built, scheduleState] = await Promise.all([
      Promise.all([...ids.entries()].map(([id, meta]) => rows.buildRow(id, meta))),
      schedules.current().catch(() => null),
    ])

    // One DeepSeek row: when the login-backed wallet answers, a keyed row that
    // has no key of its own is redundant.
    const accountRow = built.find((row) => row.id === 'deepseek-account')
    const rows_ = built.filter((row) => {
      if (row.id !== 'deepseek') return true
      return !(accountRow && accountRow.status === 'ok' && row.status === 'no-key')
    })

    // An empty wallet says nothing the user needs to see; a negative balance
    // (owed) still does.
    const visible = rows_.filter(
      (row) => !((row.kind === 'money' || row.kind === 'account') && row.status === 'ok' && row.amount === 0)
    )

    // Adapter metadata (DeepSeek peak schedule for the off-peak green wash).
    const state = { schedules: scheduleState }
    for (const row of visible) {
      const adapter = adapterFor(row.id)
      if (adapter && typeof adapter.meta === 'function') {
        try {
          adapter.meta(row, state)
        } catch {
          /* metadata is cosmetic */
        }
      }
    }

    visible.sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)))

    // Two independent third-party sources, merged by name (case-insensitive) so
    // one channel that both plugins can see is not drawn twice.
    const [connected, ofm] = await Promise.all([
      fetchThirdParty(base),
      ofmCredits.readAll().catch(() => []),
    ])
    const thirdParty = [...connected]
    const seen = new Set(connected.map((row) => String(row.name || '').trim().toLowerCase()))
    for (const row of ofm) {
      const key = String(row.name || '').trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      thirdParty.push(row)
    }

    return { ok: true, updatedAt: Date.now(), rows: visible, thirdParty }
  }

  return { collect, enabledProviders }
}
