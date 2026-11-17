/**
 * The registration glue and the Settings → Plugins → Balance display tab:
 * owner props for the model seat, the crash boundary, and the cookie form.
 *
 * Split out of the single client.js 0.6 line.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-panel',
  chunk: 'client.settings.js',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const { SETTINGS_ENDPOINT, SECRET_ENDPOINT, LOGIN_ENDPOINT, zh, en, tr, requestJson, money, pctText, errorText } =
      require('dsh-model-panel/client.shared.js');
    const { ModelPanel } = require('dsh-model-panel/client.panel.js');


    function ownerProps(scope, sessionId) {
      const get = (name) => {
        try {
          if (scope && typeof scope.get === 'function') {
            const value = scope.get(name);
            if (value) return value;
          }
        } catch (e) {
          /* fall through */
        }
        return scope ? scope[name] : null;
      };
      const sessions = get('sessions');
      const resolver = get('modelDirectories');
      let available = true;
      if (sessions && typeof sessions.subagentAddress === 'function') {
        try {
          available = sessions.subagentAddress(sessionId) === void 0;
        } catch (e) {
          available = false;
        }
      }
      let directory = null;
      if (resolver && typeof resolver.directoryFor === 'function') {
        try {
          directory = resolver.directoryFor(sessionId);
        } catch (e) {
          directory = null;
        }
      }
      if (!directory) {
        return {
          available: false,
          sessionId,
          directory: null,
          load: () => {},
          select: () => Promise.resolve({ ok: false, error: 'no-directory' }),
        };
      }
      return {
        available,
        sessionId,
        directory: directory.store,
        load: () => {
          try {
            const p = directory.load();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (e) {
            /* ignore */
          }
        },
        select: (selection) => {
          try {
            return Promise.resolve(directory.select(selection));
          } catch (e) {
            return Promise.reject(e);
          }
        },
      };
    }

    /** Safety net: a render crash must degrade to a retry button, never blank
     *  the model seat (our priority -5 entry shadows the shipped selector, so a
     *  white crash would leave the composer with no way to pick a model). */
    class SeatBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { crashed: false, errorText: '' };
      }
      static getDerivedStateFromError(error) {
        return {
          crashed: true,
          errorText: String((error && error.message) || error || 'unknown error'),
        };
      }
      componentDidCatch(error) {
        try {
          console.warn('[dsh-model-panel] seat render crashed:', error);
        } catch (e) {
          /* logging is best-effort */
        }
      }
      render() {
        if (this.state.crashed) {
          return h(
            'button',
            {
              type: 'button',
              className: 'dshmp-trigger',
              title: 'dsh-model-panel 渲染错误（点击重试）：' + this.state.errorText,
              onClick: () => this.setState({ crashed: false, errorText: '' }),
            },
            h(
              'span',
              { className: 'dshmp-trigger-name' },
              '⚠ dsh-model-panel（点击重试）：' + this.state.errorText
            )
          );
        }
        return h(ModelPanel, this.props);
      }
    }

    // ---------- cookie-backed usage (Settings → Plugins → Balance display) ----------

    /** Tab title without a translator: the host may call label() with no args. */
    function tabTitle() {
      let lang = '';
      try {
        lang = String(document.documentElement.lang || navigator.language || '');
      } catch (e) {
        lang = '';
      }
      return /^zh/i.test(lang) ? zh.setTitle : en.setTitle;
    }

    /** The stored cookies plus the usage each one unlocks. Never mutating. */
    async function settingsRequest() {
      const body = await requestJson(SETTINGS_ENDPOINT);
      if (!body || typeof body !== 'object' || body.ok === false) {
        throw new Error(String((body && body.error) || 'settings failed'));
      }
      return Array.isArray(body.entries) ? body.entries : [];
    }

    async function secretRequest(id, action, value, ref) {
      // `ref` selects the exact credential row: one provider can own several
      // (OpenDesign: control key, workspace id, console cookie).
      const payload = { id: id, action: action };
      if (value !== undefined) payload.value = value;
      if (ref) payload.ref = ref;
      return requestJson(SECRET_ENDPOINT, { method: 'POST', payload: payload, errorKey: 'error' });
    }

    /**
     * One request to the sign-in route: `start`, `status` or `cancel`.
     *
     * The host owns the device authorization; the page only carries the code
     * and the cadence, so a closed settings tab stops the polling by itself.
     */
    async function loginRequest(action) {
      return requestJson(LOGIN_ENDPOINT, { method: 'POST', payload: { action: action }, errorKey: 'message' });
    }

    function dayText(value) {
      const ms = Number(value);
      if (!Number.isFinite(ms) || ms <= 0) return '';
      try {
        return new Date(ms).toLocaleDateString();
      } catch (e) {
        return '';
      }
    }

    /** What a stored cookie bought us: plan name, used bar, period end. */
    function usageLine(entry, t) {
      if (!entry.set) return null;
      if (entry.status === 'error') {
        const detail = String(entry.detail || '');
        const expired = /expired|401|403|notlogined|登录/i.test(detail);
        return h('div', { className: 'dshmp-set-usage err' }, expired ? t('setExpired') : detail || t('setHidden'));
      }
      if (typeof entry.amount === 'number' && Number.isFinite(entry.amount)) {
        // A wallet (OpenDesign) reports money rather than a percentage.
        const bars = (Array.isArray(entry.windows) ? entry.windows : []).filter((win) => Number.isFinite(win && win.remainPct));
        return h(
          'div',
          { className: 'dshmp-set-usage' },
          h('span', { className: 'dshmp-set-plan' }, money(entry.amount, entry.currency)),
          bars.length
            ? h(
                'span',
                { className: 'dshmp-set-wins' },
                bars.map((win, index) =>
                  h(
                    'span',
                    { key: String(win.label || index), className: 'dshmp-set-win' },
                    h('span', { className: 'dshmp-set-wlabel' }, String(win.label || '')),
                    h('span', { className: 'dshmp-set-pct' }, pctText(Math.max(0, Math.min(100, 100 - win.remainPct))))
                  )
                )
              )
            : null
        );
      }
      const used = Number.isFinite(entry.usedPct) ? Math.max(0, Math.min(100, entry.usedPct)) : null;
      const until = dayText(entry.endAt);
      return h(
        'div',
        { className: 'dshmp-set-usage' },
        entry.plan ? h('span', { className: 'dshmp-set-plan' }, String(entry.plan)) : null,
        used === null
          ? null
          : h(
              'span',
              { className: 'dshmp-set-bar', title: tr(t, 'setUsed', { p: pctText(used) }) },
              h('span', {
                className: 'dshmp-set-bar-fill' + (used >= 90 ? ' low' : ''),
                style: { width: used + '%' },
              })
            ),
        used === null ? null : h('span', { className: 'dshmp-set-pct' }, pctText(used)),
        until ? h('span', { className: 'dshmp-set-until' }, tr(t, 'setUntil', { d: until })) : null,
        used === null && !entry.plan && !until
          ? h('span', { className: 'dshmp-set-until' }, t('setHidden'))
          : null
      );
    }

    /**
     * The Settings page. Scope is deliberately one thing: cookies that unlock
     * usage no API key can read. Nothing here touches a key endpoint, and the
     * pasted value never goes back to the browser after it is saved.
     */
    function CookieUsageTab(props) {
      const t = typeof (props && props.t) === 'function' ? props.t : (key) => String(key);
      const [entries, setEntries] = useState(null);
      const [error, setError] = useState('');
      const [editing, setEditing] = useState('');
      const [draft, setDraft] = useState('');
      const [busy, setBusy] = useState('');
      const [note, setNote] = useState(null);
      const [drop, setDrop] = useState(false);
      // OpenDesign's control key comes from a browser approval, not from a
      // paste. This is the pending authorization, if any, and the id of the
      // provider whose "sign in" button is spinning.
      const [login, setLogin] = useState(null);
      const [loginBusy, setLoginBusy] = useState('');

      const load = useCallback(() => {
        setError('');
        settingsRequest()
          .then((list) => setEntries(list))
          .catch((err) => {
            setError(String((err && err.message) || err));
            setEntries([]);
          });
      }, []);
      useEffect(load, [load]);

      /**
       * Poll the pending approval while one is live.
       *
       * The cadence comes from the service (2 s by default) and the host
       * refuses polls that arrive early, so an interval here is harmless: a
       * click on "sign in" is what starts it, and leaving the page cancels the
       * timer without leaving anything running on the host.
       */
      useEffect(() => {
        if (!login || login.state !== 'pending') return undefined;
        const tick = setInterval(() => {
          loginRequest('status')
            .then((body) => {
              if (!body || body.state === 'idle') return;
              setLogin(body);
              if (body.state === 'granted') {
                setNote({ ok: true, text: t('setOdLinked') });
                load();
              }
            })
            .catch(() => {});
        }, Math.max(1000, Number(login.intervalMs) || 2000));
        return () => clearInterval(tick);
      }, [login && login.state, login && login.deviceId, login && login.intervalMs]);

      /** Open the approval page and start polling, or report why not. */
      async function startLogin() {
        setLoginBusy('opendesign');
        setNote(null);
        const body = await loginRequest('start');
        setLoginBusy('');
        if (!body || body.ok === false || body.state === 'error') {
          setNote({ ok: false, text: (body && body.message) || t('setFailed') });
          setLogin(body && body.state ? body : null);
          return;
        }
        setLogin(body);
        if (body.activationUrl && typeof window !== 'undefined') {
          try {
            window.open(body.activationUrl, '_blank', 'noreferrer noopener');
          } catch (e) {
            /* the link is printed below either way */
          }
        }
      }

      async function cancelLogin() {
        setLoginBusy('opendesign');
        const body = await loginRequest('cancel');
        setLoginBusy('');
        setLogin(body || null);
      }

      function merge(entry) {
        if (!entry) return;
        setEntries((prev) => (prev || []).map((item) => (item.ref === entry.ref ? Object.assign({}, item, entry) : item)));
      }

      async function save(entry) {
        setBusy(entry.ref);
        setNote(null);
        const body = await secretRequest(entry.id, 'save', draft, entry.ref);
        setBusy('');
        if (body.ok) {
          merge(body.entry);
          setEditing('');
          setDraft('');
          const plan = body.entry && body.entry.plan ? ' · ' + body.entry.plan : '';
          // An imported cookies file reports how many cookies reached the
          // header, so a filtered export is visible rather than silent.
          let got = '';
          if (body.imported && body.imported.count) {
            got = ' · ' + tr(t, 'setImported', { n: String(body.imported.count) });
            const aside = Number(body.imported.filteredOut) || 0;
            if (aside > 0) got += tr(t, 'setFiltered', { n: String(aside) });
          }
          setNote({ ok: true, text: t('setSaved') + plan + got });
        } else {
          setNote({ ok: false, text: body.error || t('setFailed') });
        }
      }

      /**
       * Fill the draft from a dropped file. Pasting is the documented path;
       * dropping one is only here so an export already on disk is not wasted.
       */
      function loadFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || '').trim();
          if (!text) {
            setNote({ ok: false, text: t('setPasteEmpty') });
            return;
          }
          setDraft(text);
          setNote({ ok: true, text: t('setPasteLoaded') });
        };
        reader.onerror = () => setNote({ ok: false, text: t('setPasteEmpty') });
        reader.readAsText(file);
      }

      async function clear(entry) {
        setBusy(entry.ref);
        setNote(null);
        const body = await secretRequest(entry.id, 'clear', undefined, entry.ref);
        setBusy('');
        if (body.ok) {
          merge(body.entry);
          setNote({ ok: true, text: t('setCleared') });
        } else {
          setNote({ ok: false, text: body.error || t('setFailed') });
        }
      }

      function renderCard(entry) {
        const open = editing === entry.ref;
        const working = busy === entry.ref;
        return h(
          'div',
          { className: 'dshmp-set-card', key: entry.ref },
          h(
            'div',
            { className: 'dshmp-set-top' },
            h('span', { className: 'dshmp-set-name' }, String(entry.label || entry.id)),
            entry.optional ? h('span', { className: 'dshmp-set-opt' }, t('setOptional')) : null,
            h(
              'span',
              { className: 'dshmp-set-pill' + (entry.set ? ' on' : '') },
              entry.set ? t('setStored') : t('setMissing')
            )
          ),
          h(
            'div',
            { className: 'dshmp-set-meta' },
            h('code', null, String(entry.ref || '')),
            entry.consoleUrl
              ? h(
                  'a',
                  { href: entry.consoleUrl, target: '_blank', rel: 'noreferrer noopener' },
                  t('setConsole')
                )
              : null
          ),
          entry.hint ? h('div', { className: 'dshmp-set-hint' }, String(entry.hint)) : null,
          usageLine(entry, t),
          entry.id === 'opendesign' && entry.type === 'key'
            ? h(
                'div',
                { className: 'dshmp-set-login' },
                login && login.state === 'pending' && login.userCode
                  ? h(
                      'div',
                      { className: 'dshmp-set-loginbox' },
                      h('span', { className: 'dshmp-set-logintip' }, t('setOdWaiting')),
                      h('code', { className: 'dshmp-set-code' }, String(login.userCode)),
                      login.activationUrl
                        ? h(
                            'a',
                            { href: login.activationUrl, target: '_blank', rel: 'noreferrer noopener' },
                            t('setOdOpen')
                          )
                        : null,
                      h(
                        'button',
                        { type: 'button', className: 'dshmp-set-btn', onClick: cancelLogin },
                        t('setOdCancel')
                      )
                    )
                  : null,
                login && login.state === 'error'
                  ? h('div', { className: 'dshmp-set-loginnerr' }, (login.message || t('setOdExpired')))
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshmp-set-btn primary',
                    disabled: loginBusy === entry.id || (login && login.state === 'pending'),
                    onClick: startLogin,
                  },
                  login && login.state === 'error' ? t('setOdRestart') : t('setOdLogin')
                )
              )
            : null,
          open
            ? h(
                'div',
                { className: 'dshmp-set-form' },
                h('textarea', {
                  className: 'dshmp-set-input' + (drop ? ' over' : ''),
                  rows: entry.type === 'cookie' ? 6 : 1,
                  spellCheck: false,
                  placeholder: entry.placeholder || (entry.type === 'key' ? t('setControlPlaceholder') : entry.type === 'text' ? t('setWorkspacePlaceholder') : t('setPlaceholder')),
                  value: draft,
                  onChange: (event) => setDraft(event.target.value),
                  // Paste only: the export *is* text. A dropped file is accepted
                  // as a convenience, but nothing on the page asks for one.
                  onDragOver:
                    entry.type === 'cookie'
                      ? (event) => {
                          event.preventDefault();
                          setDrop(true);
                        }
                      : undefined,
                  onDragLeave: entry.type === 'cookie' ? () => setDrop(false) : undefined,
                  onDrop:
                    entry.type === 'cookie'
                      ? (event) => {
                          event.preventDefault();
                          setDrop(false);
                          const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
                          loadFile(file);
                        }
                      : undefined,
                }),
                entry.type === 'cookie'
                  ? h('div', { className: 'dshmp-set-pastehint' }, t('setPasteHint'))
                  : null,
                h(
                  'div',
                  { className: 'dshmp-set-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshmp-set-btn primary',
                      disabled: working || !draft.trim(),
                      onClick: () => save(entry),
                    },
                    working ? t('setSaving') : t('setSave')
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshmp-set-btn',
                      onClick: () => {
                        setEditing('');
                        setDraft('');
                      },
                    },
                    t('setCancel')
                  )
                )
              )
            : h(
                'div',
                { className: 'dshmp-set-actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshmp-set-btn primary',
                    onClick: () => {
                      setEditing(entry.ref);
                      setDraft('');
                      setNote(null);
                    },
                  },
                  entry.set ? t('setUpdate') : t('setAdd')
                ),
                entry.set
                  ? h(
                      'button',
                      { type: 'button', className: 'dshmp-set-btn', disabled: working, onClick: () => clear(entry) },
                      t('setClear')
                    )
                  : null
              )
        );
      }

      /**
       * Draw the rows in the order the host returned them, printing a group
       * label whenever a row names a provider different from the previous one
       * (OpenDesign owns three rows; Qwen owns one).
       */
      function renderRows(list) {
        const out = [];
        let lastGroup = null;
        for (const entry of list) {
          const group = entry.group ? String(entry.groupLabel || entry.group) : null;
          if (group && group !== lastGroup) {
            out.push(h('div', { className: 'dshmp-set-group', key: 'g:' + group }, group));
            lastGroup = group;
          }
          out.push(renderCard(entry));
        }
        return out;
      }

      return h(
        'div',
        { className: 'dshmp-set' },
        h(
          'div',
          { className: 'dshmp-set-head' },
          h('div', { className: 'dshmp-set-title' }, t('setTitle')),
          h('div', { className: 'dshmp-set-sub' }, t('setSubtitle'))
        ),
        error
          ? h(
              'div',
              { className: 'dshmp-set-err' },
              t('setErr') + ': ' + error,
              h('button', { type: 'button', className: 'dshmp-set-btn', onClick: load }, t('setRetry'))
            )
          : null,
        note ? h('div', { className: 'dshmp-set-note' + (note.ok ? '' : ' bad') }, note.text) : null,
        entries === null ? h('div', { className: 'dshmp-set-empty' }, t('loading')) : null,
        entries && entries.length === 0 ? h('div', { className: 'dshmp-set-empty' }, t('setNone')) : null,
        entries ? renderRows(entries) : null,
        h('div', { className: 'dshmp-set-foot' }, t('setFoot'))
      );
    }

    return { ownerProps, SeatBoundary, tabTitle, dayText, usageLine, CookieUsageTab };
  },
});
