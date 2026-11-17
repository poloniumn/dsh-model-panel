/**
 * The model seat: trigger button, portaled dropdown, provider groups, and the
 * per-session switch rows (including 启用子任务, the last row in the menu).
 *
 * Split out of the single client.js 0.6 line; styles stay in client.css.js and
 * keys/helpers in client.shared.js.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-panel',
  chunk: 'client.panel.js',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore, Fragment } = React;

    let ReactDOM = null;
    try {
      ReactDOM = require('react-dom');
    } catch (e) {
      ReactDOM = null;
    }

    const {
      EffortSlider, K_COLLAPSED, K_EFFORTS, K_OFF, LABEL_SLOT, ThinkingToggle, creditFor, creditLabel, defaultNonOff, errorText, findModel, groupHasDiscount, hasLS, kick, loadBalance, loadObject, loadStringArray, loadSubagent, matchBalanceRow, modelDiscount, modelDiscountTitle, money, offLevelOf, orderGroups, rawEffort, reasoningOf, saveLS, savedBalance, setSubagent, stepsOf, tr, triggerText, windowBars,
    } = require('dsh-model-panel/client.shared.js');


    function ModelPanel(props) {
      const { available, directory, load, select, locked, t: tRaw, renderSlot, sessionId } = props;
      // The slot kit normally injects `t`; never let a missing translator crash
      // the seat — fall back to the key itself.
      const t = typeof tRaw === 'function' ? tRaw : (key) => String(key);

      const emptyStore = useRef(null);
      if (!emptyStore.current) {
        emptyStore.current = {
          subscribe: () => () => {},
          getSnapshot: () => EMPTY_SNAP,
        };
      }
      const store =
        directory && typeof directory.getSnapshot === 'function' && typeof directory.subscribe === 'function'
          ? directory
          : emptyStore.current;
      const state = useSyncExternalStore(
        (fn) => store.subscribe(fn),
        () => store.getSnapshot() || EMPTY_SNAP
      );

      const [open, setOpen] = useState(false);
      const [query, setQuery] = useState('');
      const [error, setError] = useState('');
      const [pos, setPos] = useState(null);
      // One localStorage read feeds both seeds: the last answered balance
      // carries the rows and the third-party list, and parsing it twice was
      // pure cost on the first frame.
      const seedRef = useRef(null);
      if (seedRef.current === null) seedRef.current = savedBalance() || { rows: null, thirdParty: [] };
      const [balanceRows, setBalanceRows] = useState(seedRef.current.rows);
      const [thirdParty, setThirdParty] = useState(seedRef.current.thirdParty);
      // Peak/night badges are time-derived. A one-minute tick keeps them honest
      // without allocating a Date on every render pass.
      const [nowKey, setNowKey] = useState(() => Date.now());
      // Group ids already known to be channel-fed. A credit lookup that fails on
      // a later poll must not move a provider back up the list.
      const thirdSeen = useRef(new Set());
      const [efforts, setEfforts] = useState(() => loadObject(K_EFFORTS));
      const [offKeys, setOffKeys] = useState(() => {
        const set = {};
        for (const key of loadStringArray(K_OFF)) set[key] = true;
        return set;
      });
      const [collapsed, setCollapsed] = useState(() => {
        const set = {};
        for (const key of loadStringArray(K_COLLAPSED)) set[key] = true;
        return set;
      });

      const triggerRef = useRef(null);
      const panelRef = useRef(null);
      const actingRef = useRef(false);

      // `null` means "not read yet": the switch renders disabled rather than
      // pretending the session allows delegation.
      const [subagentOn, setSubagentOn] = useState(null);
      const [subagentBusy, setSubagentBusy] = useState(false);

      const busy = Boolean(state.pending);
      const guard = !available || Boolean(locked) || busy;

      useEffect(() => {
        kick(load);
      }, [load]);

      const close = useCallback((restoreFocus) => {
        setOpen(false);
        setQuery('');
        setError('');
        if (restoreFocus && triggerRef.current) {
          try {
            triggerRef.current.focus();
          } catch (e) {
            /* ignore */
          }
        }
      }, []);

      const updatePos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setPos({
          right: Math.max(12, window.innerWidth - rect.right),
          bottom: Math.max(12, window.innerHeight - rect.top + 8),
        });
      }, []);

      useEffect(() => {
        if (!open) return undefined;
        updatePos();
        kick(load);
        let alive = true;
        let again = null;
        // The host can answer from its last state while it refreshes; one
        // more request shortly after brings the new numbers without the user
        // waiting for the whole provider sweep on an empty card.
        const apply = (data) => {
          if (!alive) return;
          setBalanceRows(data.rows);
          setThirdParty(data.thirdParty || []);
          if (data.stale && again === null) {
            again = setTimeout(() => {
              again = null;
              loadBalance().then(apply);
            }, 700);
          }
        };
        loadBalance().then(apply);
        // The switch has its own endpoint: it is a session setting, not one of
        // the balance rows, and a failure must not blank the model list.
        if (available && sessionId) {
          loadSubagent(sessionId).then((value) => {
            if (alive) setSubagentOn(value);
          });
        }
        // Peak / night-discount badges are clock-derived; ticking once a minute
        // while the menu is open is enough to keep them correct.
        const tick = setInterval(() => setNowKey(Date.now()), 60_000);
        const onTick = () => setNowKey(Date.now());
        window.addEventListener('focus', onTick);
        const onResize = () => updatePos();
        const onScroll = () => updatePos();
        const onKey = (e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            close(true);
          }
        };
        const onDown = (e) => {
          const target = e.target;
          if (panelRef.current && panelRef.current.contains(target)) return;
          if (triggerRef.current && triggerRef.current.contains(target)) return;
          close(false);
        };
        window.addEventListener('resize', onResize);
        document.addEventListener('scroll', onScroll, true);
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('mousedown', onDown, true);
        return () => {
          alive = false;
          if (again) clearTimeout(again);
          clearInterval(tick);
          window.removeEventListener('focus', onTick);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('scroll', onScroll, true);
          document.removeEventListener('keydown', onKey, true);
          document.removeEventListener('mousedown', onDown, true);
        };
      }, [open, updatePos, close, load, available, sessionId]);

      /**
       * Flip the session's delegation switch. The row updates first and rolls
       * back if the host rejects it, so a slow write never feels unresponsive.
       */
      const toggleSubagent = useCallback(() => {
        if (!sessionId || subagentBusy) return;
        const next = subagentOn !== true;
        setSubagentOn(next);
        setSubagentBusy(true);
        setSubagent(sessionId, next).then(
          (res) => {
            setSubagentBusy(false);
            if (res && res.ok) {
              setSubagentOn(res.enabled);
              return;
            }
            setSubagentOn(!next);
            setError(tr(t, 'subagentFailed') + (res && res.error ? ': ' + res.error : ''));
          },
          (err) => {
            setSubagentBusy(false);
            setSubagentOn(!next);
            setError(errorText(err, t));
          }
        );
      }, [sessionId, subagentOn, subagentBusy, t]);

      const isCurrent = useCallback(
        (g, m) => Boolean(state.current && state.current.provider === g.id && state.current.model === m.id),
        [state.current]
      );

      const submitEffort = useCallback(
        (g, m, levelId) => {
          const payload = { provider: g.id, model: m.id };
          if (levelId) payload.reasoningEffort = levelId;
          return select(payload).then(
            (res) => {
              if (res && res.ok === false) setError(errorText(res.error, t));
            },
            (err) => setError(errorText(err, t))
          );
        },
        [select, t]
      );

      const commitLevel = useCallback(
        (g, m, levelId) => {
          const key = g.id + '/' + m.id;
          const next = Object.assign({}, efforts);
          next[key] = levelId;
          setEfforts(next);
          saveLS(K_EFFORTS, next);
          if (isCurrent(g, m) && available && !locked) submitEffort(g, m, levelId);
        },
        [efforts, isCurrent, available, locked, submitEffort]
      );

      const resetLevel = useCallback(
        (g, m) => {
          const key = g.id + '/' + m.id;
          const next = Object.assign({}, efforts);
          delete next[key];
          setEfforts(next);
          saveLS(K_EFFORTS, next);
          const nextOff = Object.assign({}, offKeys);
          if (nextOff[key]) {
            delete nextOff[key];
            setOffKeys(nextOff);
            saveLS(K_OFF, Object.keys(nextOff));
          }
          const r = reasoningOf(m);
          const steps = stepsOf(r, r && offLevelOf(r) && offLevelOf(r).id);
          const levelId = (r && r.defaultEffort) || (steps.length ? steps[0].id : null);
          if (isCurrent(g, m) && available && !locked) submitEffort(g, m, levelId);
        },
        [efforts, offKeys, isCurrent, available, locked, submitEffort]
      );

      const commitThinking = useCallback(
        (g, m, on) => {
          const key = g.id + '/' + m.id;
          const next = Object.assign({}, offKeys);
          if (on) delete next[key];
          else next[key] = true;
          setOffKeys(next);
          saveLS(K_OFF, Object.keys(next));
          if (isCurrent(g, m) && available && !locked) {
            const r = reasoningOf(m);
            const off = offLevelOf(r);
            let levelId = null;
            if (on) {
              const steps = stepsOf(r, off && off.id);
              levelId = efforts[key] || defaultNonOff(r, off && off.id) || (steps.length ? steps[0].id : null);
            } else if (off) {
              levelId = off.id;
            }
            if (levelId) submitEffort(g, m, levelId);
          }
        },
        [offKeys, isCurrent, available, locked, efforts, submitEffort]
      );

      const choose = useCallback(
        (g, m) => {
          if (guard || actingRef.current) return;
          const key = g.id + '/' + m.id;
          const r = reasoningOf(m);
          const off = offLevelOf(r);
          const steps = stepsOf(r, off && off.id);
          const isCur = isCurrent(g, m);
          const raw = rawEffort({ state, key, isCurrent: isCur, model: m, efforts, offKeys, offId: off && off.id, steps });
          if (isCur && state.current && state.current.reasoningEffort && raw === state.current.reasoningEffort) {
            close(false);
            return;
          }
          actingRef.current = true;
          setError('');
          const payload = { provider: g.id, model: m.id };
          if (r && raw) payload.reasoningEffort = raw;
          const done = (res) => {
            actingRef.current = false;
            if (res && res.ok === false) {
              setError(errorText(res.error, t));
              return;
            }
            close(false);
          };
          try {
            const p = select(payload);
            if (p && typeof p.then === 'function')
              p.then(done, (err) => {
                actingRef.current = false;
                setError(errorText(err, t));
              });
            else done(p);
          } catch (err) {
            actingRef.current = false;
            setError(errorText(err, t));
          }
        },
        [guard, state, efforts, offKeys, isCurrent, select, close, t]
      );

      const toggleCollapsed = useCallback((groupId) => {
        setCollapsed((prev) => {
          const next = Object.assign({}, prev);
          if (next[groupId]) delete next[groupId];
          else next[groupId] = true;
          saveLS(K_COLLAPSED, Object.keys(next));
          return next;
        });
      }, []);

      // Provider boxes are rebuilt only when their inputs change: the model
      // catalogue, the search term, the fold set, or the third-party credits.
      const now = useMemo(() => new Date(nowKey), [nowKey]);
      const layout = useMemo(() => {
        const groups = Array.isArray(state.groups) ? state.groups : [];
        const needle = query.trim().toLowerCase();
        const visible = [];
        for (const g of groups) {
          if (!g) continue;
          const models = Array.isArray(g.models) ? g.models : [];
          const gLabel = String(g.name || g.id || '').toLowerCase();
          const providerHit = Boolean(needle) && gLabel.indexOf(needle) >= 0;
          let list = models;
          if (needle && !providerHit) {
            list = models.filter((m) => {
              if (!m) return false;
              const label = String(m.name || m.id || '').toLowerCase();
              return label.indexOf(needle) >= 0;
            });
            if (!list.length) continue;
          }
          const expanded = needle ? true : !collapsed[g.id];
          visible.push({ g, list, expanded, count: models.length });
        }

        // A provider fed by a third-party channel sinks to the bottom of the
        // list; everything else keeps the order the directory ships. `thirdSeen`
        // is learning state: once a group is known to be channel-fed it stays
        // there even if a later credit lookup fails.
        const thirdGroups = thirdSeen.current;
        const groupKey = (g) => String((g && (g.id || g.name)) || '');
        for (const entry of visible) {
          if (creditFor(entry.g, thirdParty)) thirdGroups.add(groupKey(entry.g));
        }
        const ordered = orderGroups(visible, (g) => thirdGroups.has(groupKey(g)));

        const firstMatch = [];
        if (needle) {
          for (const entry of ordered) {
            if (!entry.expanded || !entry.list.length) continue;
            firstMatch.push({ g: entry.g, m: entry.list[0] });
            break;
          }
        }
        return { groups, visible, ordered, firstMatch };
      }, [state.groups, query, collapsed, thirdParty]);
      const { groups, visible, ordered, firstMatch } = layout;

      const currentModel = useMemo(
        () => (state.current ? findModel(groups, state.current.provider, state.current.model) : null),
        [groups, state.current]
      );

      // Every fold change is persisted, so this only fires when there is no
      // memory yet (first run, cleared storage): the panel seeds itself with
      // everything folded except the provider that owns the current model.
      const seededRef = useRef(false);
      useEffect(() => {
        if (seededRef.current) return;
        const list = Array.isArray(state.groups) ? state.groups : [];
        if (!list.length) return;
        seededRef.current = true;
        if (hasLS(K_COLLAPSED)) return;
        const cur = String((state.current && state.current.provider) || '');
        const next = {};
        for (const g of list) {
          const id = String((g && g.id) || '');
          if (id && id !== cur) next[id] = true;
        }
        saveLS(K_COLLAPSED, Object.keys(next));
        setCollapsed(next);
      }, [state.groups, state.current]);

      // Opening the panel re-opens the provider that holds the current model;
      // every other provider keeps whatever the user last chose.
      const revealCurrent = useCallback(() => {
        setCollapsed((prev) => {
          const cur = String((state.current && state.current.provider) || '');
          if (!cur || !prev[cur]) return prev;
          const next = Object.assign({}, prev);
          delete next[cur];
          saveLS(K_COLLAPSED, Object.keys(next));
          return next;
        });
      }, [state]);

      const openPanel = () => {
        if (!available) return;
        setError('');
        if (!open) revealCurrent();
        setOpen((v) => !v);
      };

      const triggerLabel = (() => {
        const text = triggerText(state, t);
        if (renderSlot && state.current) {
          try {
            const node = renderSlot(
              LABEL_SLOT,
              { provider: state.current.provider, model: state.current.model, placement: 'trigger', selected: true },
              { fallback: h('span', null, text) }
            );
            if (node) return node;
          } catch (e) {
            /* fall through */
          }
        }
        return h('span', null, text);
      })();

      const trigger = h(
        'button',
        {
          ref: triggerRef,
          type: 'button',
          className: 'dshmp-trigger',
          disabled: !available,
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          onClick: openPanel,
        },
        busy ? h('span', { className: 'dshmp-spin', 'aria-hidden': 'true' }) : null,
        h('span', { className: 'dshmp-trigger-name' }, triggerLabel),
        h('span', { className: 'dshmp-chev', 'aria-hidden': 'true' }, '▾')
      );

      // Provider box: header (sticky) + money/plan info + model rows.
      // Third-party credits are merged into the provider header they belong to;
      // a channel with no matching provider is simply not drawn.
      const thirdByEntry = useMemo(() => {
        const map = new Map();
        const claimed = new Set();
        for (const entry of ordered) {
          const item = creditFor(entry.g, thirdParty);
          if (item && !claimed.has(item)) {
            map.set(entry, item);
            claimed.add(item);
          }
        }
        return map;
      }, [ordered, thirdParty]);

      const boxes = useMemo(() => ordered.map((entry, entryIndex) => {
        const g = entry.g;
        const row = matchBalanceRow(balanceRows, g);
        // The header hint covers the provider's whole catalogue, so a search
        // filter does not make the discount chip flicker.
        // Only a yes/no signal: the rate itself belongs on each model row.
        const discounted = groupHasDiscount(now, row, Array.isArray(g.models) ? g.models : entry.list);
        const credit = thirdByEntry.get(entry) || null;

        let info = null;
        if (row && row.status === 'ok') {
          if ((row.kind === 'money' || row.kind === 'account') && Number.isFinite(row.amount)) {
            // A wallet can also publish plan windows (OpenDesign: USD balance
            // plus 5-hour and 7-day coding-plan quotas). Both are drawn — the
            // balance as money, the windows as their own bars.
            const bars = windowBars(row, t, 2);
            info = h(
              'span',
              {
                className: 'dshmp-plan',
                title: row.id === 'opendesign' ? t('odBalance') : row.label || undefined,
              },
              h('span', { className: 'dshmp-money' }, money(row.amount, row.currency)),
              bars.length ? h('span', { className: 'dshmp-plans' }, bars) : null
            );
          } else if (row.kind === 'plan') {
            const bars = windowBars(row, t, 3);
            if (bars.length) {
              info = h(
                'span',
                { className: 'dshmp-plan', title: row.label || undefined },
                h('span', { className: 'dshmp-plans' }, bars)
              );
            }
          }
        } else if (row && row.status !== 'console') {
          // A row that exists but has no number says why on hover instead of
          // silently rendering nothing (a missing key, an expired cookie, a
          // vendor error). A credential that cannot read usage at all — an
          // OpenDesign runtime key with no control key — says so in words, in
          // the reader's own language.
          const needControl = row.status === 'no-control-key';
          info = h(
            'span',
            {
              className: 'dshmp-money dshmp-muted' + (needControl ? ' dshmp-note' : ''),
              title: needControl ? t('setNeedControl') : row.detail || row.status || undefined,
            },
            needControl ? t('odNeedControl') : '—'
          );
        }

        const rows = [];
        if (entry.expanded) {
          entry.list.forEach((m, i) => {
            if (!m) return;
            const key = g.id + '/' + m.id;
            const r = reasoningOf(m);
            const off = offLevelOf(r);
            const steps = stepsOf(r, off && off.id);
            const isCur = isCurrent(g, m);
            const rowDiscount = modelDiscount(now, row, m);
            const raw = rawEffort({ state, key, isCurrent: isCur, model: m, efforts, offKeys, offId: off && off.id, steps });
            const isOff = Boolean(off && raw === off.id);
            const nameText = m.name || m.id;
            let nameNode = h('span', { className: 'dshmp-name' }, nameText);
            if (renderSlot) {
              try {
                const node = renderSlot(
                  LABEL_SLOT,
                  { provider: g.id, model: m.id, placement: 'option', selected: isCur },
                  { fallback: nameNode }
                );
                if (node) nameNode = node;
              } catch (e) {
                /* keep plain name */
              }
            }
            rows.push(
              h(
                'div',
                {
                  key: key,
                  className:
                    'dshmp-row' +
                    (isCur ? ' current' : '') +
                    (busy ? ' busy' : '') +
                    (i % 2 === 1 ? ' alt' : '') +
                    (i === entry.list.length - 1 ? ' last' : ''),
                  role: 'button',
                  tabIndex: 0,
                  title: m.description || undefined,
                  'aria-current': isCur ? 'true' : undefined,
                  onClick: () => choose(g, m),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      choose(g, m);
                    }
                  },
                },
                h(
                  'span',
                  { className: 'dshmp-namewrap' },
                  nameNode,
                  rowDiscount
                    ? h('span', { className: 'dshmp-mult', title: modelDiscountTitle(t, rowDiscount) }, rowDiscount.rate + 'x')
                    : null
                ),
                h(
                  'span',
                  { className: 'dshmp-cell' },
                  h(ThinkingToggle, {
                    supported: Boolean(off),
                    on: Boolean(off) && !isOff,
                    disabled: guard,
                    label: t('colThinking'),
                    onToggle: (next) => commitThinking(g, m, next),
                  })
                ),
                h(
                  'span',
                  { className: 'dshmp-cell dshmp-cell-effort' },
                  h(EffortSlider, {
                    steps: steps,
                    valueId: raw,
                    isOff: isOff,
                    offName: off ? off.name : '',
                    disabled: guard || isOff || !steps.length,
                    ariaLabel: t('colEffort'),
                    t: t,
                    onCommit: (levelId) => commitLevel(g, m, levelId),
                    onReset: r ? () => resetLevel(g, m) : null,
                  })
                )
              )
            );
          });
        }

        return h(
          'div',
          {
            key: 'g:' + (g.id || entryIndex),
            className: 'dshmp-pgroup' + (discounted ? ' discount' : ''),
            title: discounted ? t('groupDiscountHint') : undefined,
          },
          h(
            'div',
            {
              className: 'dshmp-phead',
              role: 'button',
              tabIndex: 0,
              'aria-expanded': entry.expanded ? 'true' : 'false',
              onClick: () => toggleCollapsed(g.id),
              onKeyDown: (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleCollapsed(g.id);
                }
              },
            },
            h('span', { className: 'dshmp-arrow' + (entry.expanded ? ' open' : ''), 'aria-hidden': 'true' }, '▸'),
            h('span', { className: 'dshmp-pname' }, g.name || g.id),
            h(
              'span',
              { className: 'dshmp-pinfo' },
              // No aggregated rate here on purpose: the same window can hold
              // several groups (4 折 Qwen3.8, 5 折 DeepSeek-V4), so any single
              // number in the header would misquote the rest of the catalogue.
              credit
                ? h('span', { className: 'dshmp-pthird', title: credit.kind || undefined }, creditLabel(credit, t))
                : null,
              info
            ),
            h('span', { className: 'dshmp-pcount' }, tr(t, 'count', { n: entry.count }))
          ),
          rows
        );
      }), [
        ordered,
        balanceRows,
        now,
        thirdByEntry,
        state,
        efforts,
        offKeys,
        isCurrent,
        choose,
        commitThinking,
        commitLevel,
        resetLevel,
        toggleCollapsed,
        guard,
        busy,
        available,
        t,
        renderSlot,
      ]);

      let body;
      if (!groups.length && state.error) {
        body = h(
          'div',
          { className: 'dshmp-empty' },
          h('div', null, t('loadFailed')),
          h(
            'button',
            {
              type: 'button',
              className: 'dshmp-retry',
              onClick: () => kick(load),
            },
            t('retry')
          )
        );
      } else if (!groups.length) {
        body = h('div', { className: 'dshmp-empty' }, t('loading'));
      } else if (!visible.length) {
        body = h('div', { className: 'dshmp-empty' }, t('noMatch'));
      } else {
        body = boxes;
      }

      const failures = Array.isArray(state.failures) ? state.failures : [];
      const failureNodes = failures.length
        ? failures.map((f, i) =>
            h(
              'div',
              { key: 'f:' + ((f && f.id) || i), className: 'dshmp-fail' },
              '⚠ ' + ((f && (f.name || f.id)) || '') + (f && f.message ? ': ' + f.message : '')
            )
          )
        : null;

      // Last row of the dropdown, drawn after the model list: the session's
      // delegation switch. A subagent seat never shows it (that session cannot
      // spawn children of its own beyond the host's depth limit anyway).
      const subagentRow =
        available && sessionId
          ? h(
              'div',
              { className: 'dshmp-opts' },
              h('span', { className: 'dshmp-optlabel' }, tr(t, 'subagent')),
              h(
                'span',
                { className: 'dshmp-optsub' },
                subagentOn === null ? tr(t, 'subagentUnknown') : tr(t, subagentOn ? 'subagentOn' : 'subagentOff')
              ),
              h(ThinkingToggle, {
                supported: true,
                on: subagentOn === true,
                disabled: subagentOn === null || subagentBusy || Boolean(locked),
                onToggle: toggleSubagent,
                label: tr(t, 'subagent'),
              })
            )
          : null;

      const panelInner = h(
        Fragment,
        null,
        error ? h('div', { className: 'dshmp-msg', role: 'alert' }, error) : null,
        h(
          'div',
          { className: 'dshmp-searchrow' },
          h('input', {
            ref: (el) => {
              if (el && open && document.activeElement !== el && !query) {
                try {
                  el.focus();
                } catch (e) {
                  /* ignore */
                }
              }
            },
            type: 'text',
            className: 'dshmp-search',
            placeholder: t('search'),
            'aria-label': t('search'),
            value: query,
            autoFocus: true,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (firstMatch.length) choose(firstMatch[0].g, firstMatch[0].m);
              }
            },
          })
        ),
        h(
          'div',
          { className: 'dshmp-head', 'aria-hidden': 'true' },
          h('span', null, t('colModel')),
          h('span', { className: 'dshmp-cell' }, t('colThinking')),
          h('span', { className: 'dshmp-cell' }, t('colEffort'))
        ),
        h('div', { className: 'dshmp-body' }, body, failureNodes),
        subagentRow
      );

      const panel = open
        ? h(
            'div',
            {
              ref: panelRef,
              className: 'dshmp-panel',
              role: 'dialog',
              'aria-label': t('panelLabel'),
              style: {
                right: (pos ? pos.right : 12) + 'px',
                bottom: (pos ? pos.bottom : 12) + 'px',
                visibility: pos ? 'visible' : 'hidden',
              },
            },
            panelInner
          )
        : null;

      const portaled =
        panel && ReactDOM && typeof ReactDOM.createPortal === 'function'
          ? ReactDOM.createPortal(panel, document.body)
          : panel;

      return h(Fragment, null, trigger, portaled);
    }

    const EMPTY_SNAP = {
      current: null,
      routable: null,
      groups: [],
      failures: [],
      status: 'idle',
      pending: null,
      error: null,
      retainedEffort: null,
    };

    return { ModelPanel, EMPTY_SNAP };
  },
});
