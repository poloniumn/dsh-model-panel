window.__ModuleLoader__.load({
  id: 'dsh-model-panel',
  factory(require) {
    'use strict';
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useSyncExternalStore, Fragment } = React;

    let ReactDOM = null;
    try {
      ReactDOM = require('react-dom');
    } catch (e) {
      ReactDOM = null;
    }

    const NS = 'model-panel';
    const SLOT = 'conversation.input.model';
    const LABEL_SLOT = 'conversation.input.model.label';
    const PRIORITY = -5;
    const K_EFFORTS = 'dsh-model-panel.efforts';
    const K_OFF = 'dsh-model-panel.off';
    const K_COLLAPSED = 'dsh-model-panel.collapsed';
    const STATE_ENDPOINT = '/dsh-model-panel/state.json';
    const SETTINGS_ENDPOINT = '/dsh-model-panel/settings.json';
    const SECRET_ENDPOINT = '/dsh-model-panel/secret.json';

    const zh = {
      search: '搜索模型或服务商',
      pickModel: '选择模型',
      colModel: '模型',
      colThinking: '思考',
      colEffort: '思考强度',
      noMatch: '没有匹配的模型',
      loading: '加载中…',
      loadFailed: '加载失败',
      retry: '重试',
      selectFailed: '选择模型失败',
      panelLabel: '模型选择',
      count: '{n} 个模型',
      reset: '恢复默认档位',
      offPeak: '空闲时段（半价）',
      ofmCredits: '剩余积分',
      ofmToken: '剩余 Token',
      ofmDollars: '剩余余额（USD）',
      ofmQuota: '剩余配额',
      ofmAccounts: '已查询 {n} 个账号',
      ofmFailed: '积分查询失败',
      setTitle: '余额显示',
      setSubtitle: '有些用量只存在于已登录的控制台，API 密钥读不到。这里只保存浏览器 Cookie，不发起任何密钥请求。',
      setNone: '没有需要 Cookie 的服务商。',
      setStored: '已配置',
      setMissing: '未配置',
      setConsole: '打开控制台',
      setAdd: '配置 Cookie',
      setUpdate: '更新 Cookie',
      setClear: '清除',
      setSave: '保存并测试',
      setSaving: '测试中…',
      setCancel: '取消',
      setSaved: '已保存，Cookie 可用。',
      setCleared: '已清除。',
      setFailed: '保存失败',
      setPlaceholder: '粘贴控制台请求头里的整段 Cookie（name=value; name2=value2）',
      setFoot: 'Cookie 只写入本机 DSH 凭据库，不写入插件配置、日志或浏览器存储。',
      setUsed: '已用 {p}',
      setUntil: '至 {d}',
      setExpired: 'Cookie 已失效，请重新粘贴。',
      setErr: '读取失败',
      setRetry: '重试',
      setHidden: '未取到用量',
    };
    const en = {
      search: 'Search models or providers',
      pickModel: 'Pick a model',
      colModel: 'Model',
      colThinking: 'Thinking',
      colEffort: 'Effort',
      noMatch: 'No matching models',
      loading: 'Loading…',
      loadFailed: 'Load failed',
      retry: 'Retry',
      selectFailed: 'Failed to select model',
      panelLabel: 'Model picker',
      count: '{n} models',
      reset: 'Reset to default',
      offPeak: 'Off-peak (half price)',
      ofmCredits: 'Credits left',
      ofmToken: 'Tokens left',
      ofmDollars: 'Balance left (USD)',
      ofmQuota: 'Quota left',
      ofmAccounts: '{n} accounts queried',
      ofmFailed: 'Credit lookup failed',
      setTitle: 'Balance display',
      setSubtitle: 'Some usage numbers only exist behind a signed-in console — no API key can read them. This page stores a browser cookie and makes no key-based request.',
      setNone: 'No provider needs a cookie right now.',
      setStored: 'Configured',
      setMissing: 'Not configured',
      setConsole: 'Open console',
      setAdd: 'Add cookie',
      setUpdate: 'Update cookie',
      setClear: 'Clear',
      setSave: 'Save and test',
      setSaving: 'Testing…',
      setCancel: 'Cancel',
      setSaved: 'Saved — the cookie works.',
      setCleared: 'Cleared.',
      setFailed: 'Save failed',
      setPlaceholder: 'Paste the console Cookie header (name=value; name2=value2)',
      setFoot: 'The cookie is written to the local DSH credential store only — never to plugin config, logs or browser storage.',
      setUsed: '{p} used',
      setUntil: 'until {d}',
      setExpired: 'The cookie expired — paste a fresh one.',
      setErr: 'Read failed',
      setRetry: 'Retry',
      setHidden: 'No usage yet',
    };

    function tr(t, key, params) {
      let text = typeof t === 'function' ? t(key) : String(key);
      if (params) {
        for (const k of Object.keys(params)) {
          text = text.split('{' + k + '}').join(String(params[k]));
        }
      }
      return text;
    }

    // ---------- storage ----------

    function loadLS(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw == null) return fallback;
        const value = JSON.parse(raw);
        return value == null ? fallback : value;
      } catch (e) {
        return fallback;
      }
    }

    function saveLS(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* quota or private mode */
      }
    }

    /** True when the key was ever written — distinguishes "[]" from "never set". */
    function hasLS(key) {
      try {
        return window.localStorage.getItem(key) !== null;
      } catch (e) {
        return false;
      }
    }

    function loadObject(key) {
      const value = loadLS(key, {});
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function loadStringArray(key) {
      const value = loadLS(key, []);
      return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
    }

    // ---------- balance (served entirely by this plugin's own host half) ----------

    let balanceCache = { at: 0, rows: null, thirdParty: [] };

    function fetchState(url) {
      return fetch(url, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (!data || !data.ok) return null;
          return {
            rows: Array.isArray(data.rows) ? data.rows : [],
            thirdParty: Array.isArray(data.thirdParty) ? data.thirdParty : [],
          };
        })
        .catch(() => null);
    }

    // One source only: this plugin's own host half. It ships the provider
    // adapters, so the panel keeps working with no other plugin installed.
    function loadBalance() {
      const fresh = balanceCache.rows && Date.now() - balanceCache.at < 60_000;
      if (fresh) {
        return Promise.resolve({ rows: balanceCache.rows, thirdParty: balanceCache.thirdParty });
      }
      return fetchState(STATE_ENDPOINT).then((data) => {
        if (data) {
          balanceCache = { at: Date.now(), rows: data.rows, thirdParty: data.thirdParty };
          return data;
        }
        return { rows: balanceCache.rows || [], thirdParty: balanceCache.thirdParty || [] };
      });
    }

    function money(amount, currency) {
      const sym = String(currency || 'CNY').toUpperCase() === 'USD' ? '$' : '¥';
      return sym + Number(amount).toFixed(2);
    }

    // ---------- third-party channels (dsh-connect + Our Free Model EAC router) ----------

    /** 1.2K / 3.4M —— same abbreviation habit as the Our Free Model card. */
    function compact(value) {
      const raw = Number(value);
      const n = Number.isFinite(raw) ? raw : 0;
      const abs = Math.abs(n);
      if (abs >= 1_000_000) return (n / 1e6).toFixed(abs >= 10_000_000 ? 0 : 1) + 'M';
      if (abs >= 1000) return (n / 1000).toFixed(abs >= 10_000 ? 0 : 1) + 'K';
      // Small channel balances (12.5 credits) must not be rounded away.
      if (!Number.isInteger(n)) return String(Math.round(n * 10) / 10);
      return String(n);
    }

    function pctText(value) {
      return Number.isFinite(value)
        ? Math.round(Math.max(0, Math.min(100, value)) * 10) / 10 + '%'
        : '--';
    }

    /**
     * The right-hand text of an EAC router row is assembled locally (the host
     * never guesses a language). Units stay as reported — credits, tokens, USD
     * and quota are never converted into one another.
     */
    function ofmLabel(item, t) {
      if (item.ok === false) return t('ofmFailed');
      if (item.unit === 'dollars') {
        return Number.isFinite(item.amount) ? t('ofmDollars') + ' ' + money(item.amount, 'USD') : t('ofmFailed');
      }
      if (item.unit === 'quota') {
        // Gemini's total is a sum of percentages, not a balance; there is no bar
        // to carry it, so the ratio itself has to be spelled out.
        return Number.isFinite(item.remainPct)
          ? t('ofmQuota') + ' ' + pctText(item.remainPct)
          : (item.accounts > 0 ? tr(t, 'ofmAccounts', { n: item.accounts }) : t('ofmFailed'));
      }
      const head = item.unit === 'token' ? t('ofmToken') : t('ofmCredits');
      if (Number.isFinite(item.amount)) return head + ' ' + compact(item.amount);
      if (Number.isFinite(item.remainPct)) return head + ' ' + pctText(item.remainPct);
      return t('ofmFailed');
    }

    /** The remaining balance of one channel, as text. Units are never converted. */
    function creditLabel(item, t) {
      if (!item) return '';
      if (item.source === 'ofm') return ofmLabel(item, t);
      if (item.label) {
        return Number.isFinite(item.value) ? item.label + ' ' + compact(item.value) : item.label;
      }
      return Number.isFinite(item.remainPct) ? pctText(item.remainPct) : '';
    }

    /**
     * `ofm-loomy` → `loomy`, `Qoder CN` → `qodercn` — the keys a provider may
     * answer to. Only whitespace, punctuation and symbols are dropped: letters
     * (CJK included) survive, so `Qoder 中国版` stays distinct from `Qoder`
     * instead of collapsing onto the same key.
     */
    function foldKey(value) {
      return String(value == null ? '' : value)
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, '');
    }

    /**
     * The third-party channel that belongs to this provider group, or null. The
     * credits are drawn inside the provider header, so a channel has to be
     * matched to a provider first; an unmatched channel still gets its own line.
     */
    function creditFor(group, items) {
      if (!group || !Array.isArray(items) || !items.length) return null;
      const keys = [group.id, group.name].map(foldKey).filter(Boolean);
      if (!keys.length) return null;
      for (const item of items) {
        if (!item) continue;
        const candidates = [foldKey(item.id), foldKey(item.name)].filter(Boolean);
        for (const key of keys) {
          if (candidates.some((c) => c === key || c === 'ofm' + key)) return item;
        }
      }
      return null;
    }

    /**
     * The provider order the model directory declares, or null when it declares
     * none. Only numbers count: a string such as "anthropic" is not a rank.
     */
    function groupRank(group) {
      if (!group) return null;
      const fields = [group.order, group.seq, group.index, group.position, group.rank];
      for (const value of fields) if (Number.isFinite(value)) return value;
      return null;
    }

    /**
     * Provider boxes in DSH's own order, with third-party channel providers
     * always last. Stable: a group that declares no rank keeps its array slot,
     * and the whole sort falls back to the array order unless every group
     * carries a rank — a partial rank list would otherwise reshuffle the list.
     */
    function orderGroups(entries, isThird) {
      const list = Array.isArray(entries) ? entries : [];
      const claimsThird = typeof isThird === 'function' ? isThird : () => false;
      const everyRanked = list.length > 0 && list.every((entry) => groupRank(entry && entry.g) !== null);
      return list
        .map((entry, index) => ({
          entry,
          index,
          third: Boolean(claimsThird(entry && entry.g)),
          rank: groupRank(entry && entry.g),
        }))
        .sort((a, b) => {
          if (a.third !== b.third) return a.third ? 1 : -1;
          if (everyRanked && a.rank !== b.rank) return a.rank - b.rank;
          return a.index - b.index;
        })
        .map((slot) => slot.entry);
    }

    /** Accepts a Date or an epoch-milliseconds number. */
    function toDate(now) {
      if (now instanceof Date) return now;
      const n = Number(now);
      return Number.isFinite(n) ? new Date(n) : new Date();
    }

    /** Beijing-time minutes since midnight — the schedules are Beijing-local. */
    function beijingMinutes(now) {
      const d0 = toDate(now);
      const utcMs = d0.getTime() + d0.getTimezoneOffset() * 60000;
      const d = new Date(utcMs + 8 * 3600000);
      return d.getHours() * 60 + d.getMinutes();
    }

    function beijingWeekday(now) {
      const d0 = toDate(now);
      const utcMs = d0.getTime() + d0.getTimezoneOffset() * 60000;
      return new Date(utcMs + 8 * 3600000).getDay();
    }

    /** True inside [start, end) — wraps past midnight when end <= start. */
    function inWindow(minutes, start, end) {
      if (start === end) return false;
      return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    }

    /** A row carrying `peakSchedule` is in peak state inside those windows. */
    function isPeak(now, row) {
      const schedule = row && row.peakSchedule;
      if (!schedule) return null;
      if (Array.isArray(schedule.weekdays) && schedule.weekdays.length
        && !schedule.weekdays.includes(beijingWeekday(now))) return false;
      const minutes = beijingMinutes(now);
      return (schedule.windows || []).some((win) => inWindow(minutes, win.startMinute, win.endMinute));
    }

    /** Rows that carry a night window: {startMinute, endMinute} in Beijing time. */
    function windowRange(row) {
      const win = row && row.nightWindow;
      if (!win) return null;
      const startMinute = Number(win.startHour) * 60 + Number(win.startMinute || 0);
      const endMinute = Number(win.endHour) * 60 + Number(win.endMinute || 0);
      if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || startMinute === endMinute) return null;
      return { startMinute, endMinute };
    }

    function windowLabel(win) {
      const pad = (n) => String(n).padStart(2, '0');
      const from = pad(Math.floor(win.startMinute / 60)) + ':' + pad(win.startMinute % 60);
      const to = pad(Math.floor(win.endMinute / 60)) + ':' + pad(win.endMinute % 60);
      return from + '-' + to;
    }

    /**
     * Price multiplier in effect right now — DeepSeek off-peak is 0.5x, the
     * token plans discount inside their night window (0.8x MiMo, 0.4x Qwen).
     * Returns null when the provider is at full price.
     */
    function discountState(now, row) {
      if (!row) return null;
      const id = String(row.id || '');
      if (id === 'deepseek' || id === 'deepseek-account') {
        return isPeak(now, row) === false ? { rate: '0.5', note: '', models: [] } : null;
      }
      const win = windowRange(row);
      if (!win) return null;
      if (!inWindow(beijingMinutes(now), win.startMinute, win.endMinute)) return null;
      // rows listing explicit models only discount those models
      let discount = NaN;
      let models = [];
      if (Array.isArray(row.nightBadges) && row.nightBadges.length) {
        const badge = row.nightBadges[0] || {};
        discount = Number(badge.discount);
        if (Array.isArray(badge.models)) models = badge.models.map((x) => String(x));
      }
      if (!Number.isFinite(discount) || discount <= 0) discount = 8;
      const rate = discount >= 10 ? discount / 100 : discount / 10;
      return { rate: String(Math.round(rate * 100) / 100), note: windowLabel(win), models };
    }

    function discountTitle(t, disc) {
      if (!disc) return undefined;
      const tail = disc.rate + 'x';
      return disc.note ? disc.note + ' · ' + tail : tr(t, 'offPeak') + ' · ' + tail;
    }

    function matchBalanceRow(rows, group) {
      if (!rows || !rows.length) return null;
      const gid = String(group.id || '');
      const gname = String(group.name || '').toLowerCase();
      for (const row of rows) {
        if (!row) continue;
        if (String(row.id || '') === gid) return row;
      }
      for (const row of rows) {
        if (!row) continue;
        if (String(row.label || '').toLowerCase() === gname) return row;
      }
      return null;
    }

    // ---------- model helpers ----------

    function reasoningOf(model) {
      const r = model && model.reasoning;
      if (!r || !Array.isArray(r.efforts) || r.efforts.length === 0) return null;
      return r;
    }

    function offLevelOf(r) {
      if (!r) return null;
      for (const level of r.efforts) {
        if (level && level.id === 'off') return level;
      }
      return null;
    }

    function stepsOf(r, offId) {
      if (!r) return [];
      return r.efforts.filter((level) => level && level.id !== offId);
    }

    function defaultNonOff(r, offId) {
      const def = r && r.defaultEffort;
      return def && def !== offId ? def : null;
    }

    function findModel(groups, provider, model) {
      if (!Array.isArray(groups)) return null;
      for (const g of groups) {
        if (!g || g.id !== provider) continue;
        const models = Array.isArray(g.models) ? g.models : [];
        for (const m of models) {
          if (m && m.id === model) return { g, m };
        }
        return null;
      }
      return null;
    }

    // Effective effort for a row: live session value wins for the current
    // model, otherwise the saved off-flag, then the saved level, then the
    // adapter default, then the first non-off step.
    function rawEffort(args) {
      const { state, key, isCurrent, model, efforts, offKeys, offId, steps } = args;
      if (isCurrent && state.current && state.current.reasoningEffort) {
        return state.current.reasoningEffort;
      }
      if (offKeys[key]) return offId;
      const stored = efforts[key];
      if (stored) return stored;
      const r = reasoningOf(model);
      const def = defaultNonOff(r, offId);
      if (def) return def;
      return steps.length ? steps[0].id : null;
    }

    function effortNameOf(state, t) {
      const cur = state.current;
      if (!cur) return null;
      const found = findModel(state.groups, cur.provider, cur.model);
      if (found) {
        const r = reasoningOf(found.m);
        if (r) {
          const want = cur.reasoningEffort || r.defaultEffort;
          const level = r.efforts.find((l) => l && l.id === want);
          if (level) return level.name;
          return want || null;
        }
        return null;
      }
      if (state.retainedEffort) return state.retainedEffort;
      return null;
    }

    function triggerText(state, t) {
      const cur = state.current;
      if (!cur) return t('pickModel');
      const found = findModel(state.groups, cur.provider, cur.model);
      const name = (found && (found.m.name || found.m.id)) || cur.model;
      const suffix = effortNameOf(state, t);
      return suffix ? name + ' · ' + suffix : name;
    }

    function errorText(error, t) {
      if (typeof error === 'string' && error) return error;
      if (error && typeof error.message === 'string' && error.message) return error.message;
      if (error && typeof error.code === 'string' && error.code) return error.code;
      return t('selectFailed');
    }

    // ---------- pieces ----------

    function ThinkingToggle(props) {
      const { supported, on, disabled, onToggle, label } = props;
      if (!supported) {
        return h('span', { className: 'dshmp-dash', 'aria-hidden': 'true' }, '-');
      }
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': on ? 'true' : 'false',
          'aria-label': label,
          className: 'dshmp-toggle' + (on ? ' on' : ''),
          disabled: disabled,
          onClick: (e) => {
            e.stopPropagation();
            onToggle(!on);
          },
          onPointerDown: (e) => e.stopPropagation(),
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
          },
        },
        h('span', { className: 'dshmp-knob' })
      );
    }

    /** Codex-style effort card: gradient level name, description, stardust slider. */
    function EffortSlider(props) {
      const { steps, valueId, isOff, offName, disabled, onCommit, onReset, ariaLabel, t } = props;
      let idx = 0;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].id === valueId) {
          idx = i;
          break;
        }
      }
      const [drag, setDrag] = useState(idx);
      const lastValue = useRef(valueId);
      const inputRef = useRef(null);
      const stepsRef = useRef(steps);
      const commitRef = useRef(onCommit);
      stepsRef.current = steps;
      commitRef.current = onCommit;

      useEffect(() => {
        if (lastValue.current === valueId) return;
        lastValue.current = valueId;
        let next = 0;
        const list = stepsRef.current;
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === valueId) {
            next = i;
            break;
          }
        }
        setDrag(next);
      }, [valueId]);

      useEffect(() => {
        const el = inputRef.current;
        if (!el) return undefined;
        const onChange = () => {
          const i = Number(el.value);
          const level = stepsRef.current[i];
          if (level) commitRef.current(level.id);
        };
        el.addEventListener('change', onChange);
        return () => el.removeEventListener('change', onChange);
      }, [steps.length]);

      // All hooks above run unconditionally (React requires a constant hook
      // count per instance); only then may this row render the dash.
      if (!steps.length) {
        return h('span', { className: 'dshmp-dash', 'aria-hidden': 'true' }, '-');
      }

      const max = steps.length - 1;
      const shown = Math.min(Math.max(drag, 0), max);
      const level = isOff ? null : steps[shown];
      const name = isOff ? offName || '' : level ? level.name : '';
      const desc = !isOff && level && level.description ? level.description : '';
      // One line, three slots: a fixed-width label, the slider, and a reset slot
      // that is reserved even when there is no button — otherwise the slider
      // would change length whenever the level name (or the reset button) does.
      return h(
        'div',
        { className: 'dshmp-effort-card' },
        h(
          'div',
          { className: 'dshmp-effort-side' },
          h(
            'div',
            { className: 'dshmp-effort-name' + (isOff ? ' off' : ''), title: desc || name || undefined },
            name
          )
        ),
        h('input', {
          ref: inputRef,
          type: 'range',
          min: '0',
          max: String(max),
          step: '1',
          value: String(shown),
          disabled: disabled,
          className: 'dshmp-range',
          'aria-label': ariaLabel,
          title: !isOff && level && level.description ? level.description : name,
          onChange: (e) => setDrag(Number(e.target.value)),
          onPointerDown: (e) => e.stopPropagation(),
          onClick: (e) => e.stopPropagation(),
          onKeyDown: (e) => e.stopPropagation(),
        }),
        onReset
          ? h(
              'button',
              {
                type: 'button',
                className: 'dshmp-reset',
                title: tr(t, 'reset'),
                'aria-label': tr(t, 'reset'),
                onClick: (e) => {
                  e.stopPropagation();
                  onReset();
                },
                onPointerDown: (e) => e.stopPropagation(),
              },
              '↻'
            )
          : h('span', { className: 'dshmp-reset-slot', 'aria-hidden': 'true' })
      );
    }

    // ---------- panel ----------

    function ModelPanel(props) {
      const { available, directory, load, select, locked, t: tRaw, renderSlot } = props;
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
      const [balanceRows, setBalanceRows] = useState(null);
      const [thirdParty, setThirdParty] = useState([]);
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

      const busy = Boolean(state.pending);
      const guard = !available || Boolean(locked) || busy;

      useEffect(() => {
        if (typeof load === 'function') {
          try {
            const p = load();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (e) {
            /* ignore */
          }
        }
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
        if (typeof load === 'function') {
          try {
            const p = load();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (e) {
            /* ignore */
          }
        }
        let alive = true;
        loadBalance().then((data) => {
          if (!alive) return;
          setBalanceRows(data.rows);
          setThirdParty(data.thirdParty || []);
        });
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
          window.removeEventListener('resize', onResize);
          window.removeEventListener('scroll', onScroll, true);
          document.removeEventListener('keydown', onKey, true);
          document.removeEventListener('mousedown', onDown, true);
        };
      }, [open, updatePos, close, load]);

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

      // Build the provider boxes and their model rows.
      const groups = Array.isArray(state.groups) ? state.groups : [];
      const needle = query.trim().toLowerCase();
      const now = new Date();
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

      // A provider fed by a third-party channel sinks to the bottom of the list;
      // everything else keeps the order the model directory ships.
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

      const currentModel = state.current
        ? findModel(groups, state.current.provider, state.current.model)
        : null;

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
      const thirdByEntry = new Map();
      const claimedThird = new Set();
      for (const entry of ordered) {
        const item = creditFor(entry.g, thirdParty);
        if (item && !claimedThird.has(item)) {
          thirdByEntry.set(entry, item);
          claimedThird.add(item);
        }
      }

      const boxes = ordered.map((entry, entryIndex) => {
        const g = entry.g;
        const row = matchBalanceRow(balanceRows, g);
        const discount = discountState(now, row);
        const credit = thirdByEntry.get(entry) || null;

        let info = null;
        if (row && row.status === 'ok') {
          if ((row.kind === 'money' || row.kind === 'account') && Number.isFinite(row.amount)) {
            info = h(
              'span',
              { className: 'dshmp-money', title: row.label || undefined },
              money(row.amount, row.currency)
            );
          } else if (row.kind === 'plan') {
            let pct = Number.isFinite(row.remainPct) ? row.remainPct : null;
            if (pct === null && Array.isArray(row.windows) && row.windows.length) {
              const win = row.windows[0];
              pct = Number.isFinite(win && win.remainPct) ? win.remainPct : null;
            }
            if (pct !== null) {
              const clamped = Math.max(0, Math.min(100, pct));
              info = h(
                'span',
                { className: 'dshmp-plan', title: row.label || undefined },
                h(
                  'span',
                  { className: 'dshmp-bar' },
                  h('span', {
                    className: 'dshmp-bar-fill' + (clamped < 20 ? ' low' : ''),
                    style: { width: clamped + '%' },
                  })
                ),
                h('span', { className: 'dshmp-pct' }, Math.round(clamped) + '%')
              );
            }
          }
        } else if (row && row.status !== 'console') {
          // A row that exists but has no number says why on hover instead of
          // silently rendering nothing (a missing key, an expired cookie, a
          // vendor error).
          info = h(
            'span',
            {
              className: 'dshmp-money dshmp-muted',
              title: row.detail || row.status || undefined,
            },
            '—'
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
            const models = discount && Array.isArray(discount.models) ? discount.models : [];
            const rowDiscount = discount && (!models.length || models.indexOf(String(m.id)) >= 0) ? discount : null;
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
                    ? h('span', { className: 'dshmp-mult', title: discountTitle(t, rowDiscount) }, rowDiscount.rate + 'x')
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
            className: 'dshmp-pgroup' + (discount ? ' discount' : ''),
            title: discountTitle(t, discount),
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
              credit
                ? h('span', { className: 'dshmp-pthird', title: credit.kind || undefined }, creditLabel(credit, t))
                : null,
              info
            ),
            h('span', { className: 'dshmp-pcount' }, tr(t, 'count', { n: entry.count }))
          ),
          rows
        );
      });

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
              onClick: () => {
                if (typeof load === 'function') {
                  try {
                    const p = load();
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                  } catch (e) {
                    /* ignore */
                  }
                }
              },
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
        h('div', { className: 'dshmp-body' }, body, failureNodes)
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

      return h(Fragment, null, h('style', null, CSS), trigger, portaled);
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

    // ---------- registration ----------

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
          directory: null,
          load: () => {},
          select: () => Promise.resolve({ ok: false, error: 'no-directory' }),
        };
      }
      return {
        available,
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
      const res = await fetch(SETTINGS_ENDPOINT, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!body || typeof body !== 'object') throw new Error('HTTP ' + res.status);
      if (body.ok === false) throw new Error(String(body.error || 'settings failed'));
      return Array.isArray(body.entries) ? body.entries : [];
    }

    async function secretRequest(id, action, value) {
      const payload = { id: id, action: action };
      if (value !== undefined) payload.value = value;
      try {
        const res = await fetch(SECRET_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        return body && typeof body === 'object' ? body : { ok: false, error: 'HTTP ' + res.status };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
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

      function merge(entry) {
        if (!entry) return;
        setEntries((prev) => (prev || []).map((item) => (item.ref === entry.ref ? Object.assign({}, item, entry) : item)));
      }

      async function save(entry) {
        setBusy(entry.ref);
        setNote(null);
        const body = await secretRequest(entry.id, 'save', draft);
        setBusy('');
        if (body.ok) {
          merge(body.entry);
          setEditing('');
          setDraft('');
          const plan = body.entry && body.entry.plan ? ' · ' + body.entry.plan : '';
          setNote({ ok: true, text: t('setSaved') + plan });
        } else {
          setNote({ ok: false, text: body.error || t('setFailed') });
        }
      }

      async function clear(entry) {
        setBusy(entry.ref);
        setNote(null);
        const body = await secretRequest(entry.id, 'clear');
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
          usageLine(entry, t),
          open
            ? h(
                'div',
                { className: 'dshmp-set-form' },
                h('textarea', {
                  className: 'dshmp-set-input',
                  rows: 3,
                  spellCheck: false,
                  placeholder: t('setPlaceholder'),
                  value: draft,
                  onChange: (event) => setDraft(event.target.value),
                }),
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

      return h(
        'div',
        { className: 'dshmp-set' },
        h('style', null, CSS),
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
        (entries || []).map(renderCard),
        h('div', { className: 'dshmp-set-foot' }, t('setFoot'))
      );
    }

    function apply(ctx) {
      let locale = null;
      try {
        locale = (typeof ctx.get === 'function' && ctx.get('locale')) || ctx.locale;
        if (locale && typeof locale.register === 'function') {
          locale.register(NS, { zh, en });
          if (typeof locale.bind === 'function') locale.bind(NS);
        }
      } catch (e) {
        /* locale optional */
      }
      /** Translator for surfaces the host does not bind (the settings tab). */
      const localT = (key) => {
        let active = '';
        try {
          if (locale && typeof locale.getLocale === 'function') active = String(locale.getLocale() || '');
          else if (locale && typeof locale.getSnapshot === 'function') {
            const snap = locale.getSnapshot();
            active = String((snap && snap.active) || '');
          }
        } catch (e) {
          active = '';
        }
        if (!active) {
          try {
            active = String(document.documentElement.lang || navigator.language || '');
          } catch (e) {
            active = '';
          }
        }
        const dict = /^en/i.test(active) ? en : zh;
        return dict[key] !== undefined ? dict[key] : key;
      };
      ctx.inject(['slots', 'modelDirectories'], (scope) => {
        const slots =
          (scope && typeof scope.get === 'function' && scope.get('slots')) || (scope && scope.slots);
        if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return;
        try {
          slots.inject(SLOT, () =>
            slots.register(
              {
                name: SLOT,
                label: 'dsh-model-panel',
                priority: PRIORITY,
                locale: NS,
                children: {
                  [LABEL_SLOT]: { kind: 'single', scope: 'session', inline: true },
                },
                inject: (sessionId) => ownerProps(scope, sessionId),
              },
              SeatBoundary
            )
          );
        } catch (e) {
          console.warn('[dsh-model-panel] failed to register model seat:', e);
        }
        // Settings → Plugins → Balance display. One localized page for the
        // vendors whose usage only a console cookie can read.
        try {
          slots.inject('settings.plugins.tab', () =>
            slots.register(
              {
                name: 'settings.plugins.tab',
                id: 'dsh-model-panel',
                order: 55,
                label: () => localT('setTitle'),
                locale: NS,
                inject: () => ({ t: localT }),
              },
              CookieUsageTab
            )
          );
        } catch (e) {
          console.warn('[dsh-model-panel] failed to register settings tab:', e);
        }
      });
    }

    const CSS = `
.dshmp-trigger{display:inline-flex;align-items:center;gap:6px;height:28px;max-width:360px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-size:12px;cursor:pointer;transition:background .12s,border-color .12s;}
.dshmp-trigger:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#ececec);}
.dshmp-trigger:disabled{opacity:.55;cursor:default;}
.dshmp-trigger-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-chev{font-size:9px;color:var(--dsw-alias-label-tertiary,#999);transform:rotate(-90deg);transition:transform .15s;}
.dshmp-trigger[aria-expanded="true"] .dshmp-chev{transform:none;}
.dshmp-spin{width:11px;height:11px;flex:none;border:2px solid var(--dsw-alias-border-l2,#d0d0d0);border-top-color:var(--dsw-alias-brand-primary,#4a7cff);border-radius:50%;animation:dshmp-rot .8s linear infinite;}
@keyframes dshmp-rot{to{transform:rotate(360deg);}}
.dshmp-panel{position:fixed;z-index:1000;width:min(680px,calc(100vw - 24px));max-height:min(72vh,620px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden;font-size:13px;color:var(--dsw-alias-label-primary,#333);}
.dshmp-msg{padding:8px 12px;font-size:12px;color:var(--dsw-alias-state-error-primary,#d93025);border-bottom:1px solid var(--dsw-alias-border-l1,#e6e6e6);}
.dshmp-searchrow{padding:10px 12px 8px;}
.dshmp-search{width:100%;box-sizing:border-box;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-size:13px;outline:none;}
.dshmp-search:focus{border-color:var(--dsw-alias-brand-primary,#4a7cff);}
.dshmp-search::placeholder{color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-head{display:grid;grid-template-columns:minmax(0,1fr) 64px 250px;gap:10px;padding:4px 16px 8px;color:var(--dsw-alias-label-tertiary,#999);font-size:11px;}
.dshmp-body{flex:1;min-height:0;overflow-y:auto;padding:0 10px 10px;}
.dshmp-pgroup{margin:8px 2px;border:1px solid var(--dsw-alias-border-l1,#e6e6e6);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);overflow:visible;}
.dshmp-pgroup.discount{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 92%,#22c55e);border-color:color-mix(in srgb,var(--dsw-alias-border-l1,#e6e6e6) 55%,#22c55e);}
.dshmp-phead{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:14px minmax(0,1fr) max-content 72px;column-gap:8px;align-items:center;padding:11px 14px;border-radius:10px 10px 0 0;background:inherit;cursor:pointer;user-select:none;}
.dshmp-pgroup:not(:has(.dshmp-row)) .dshmp-phead{border-radius:10px;}
.dshmp-phead:hover{background:var(--dsw-alias-bg-layer-1,#f5f5f5);}
.dshmp-pgroup.discount .dshmp-phead:hover{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#f5f5f5) 88%,#22c55e);}
.dshmp-phead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4a7cff);outline-offset:-2px;}
.dshmp-arrow{font-size:11px;width:12px;flex:none;color:var(--dsw-alias-label-tertiary,#999);transition:transform .12s;}
.dshmp-arrow.open{transform:rotate(90deg);}
.dshmp-pname{font-size:15px;font-weight:600;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-pthird{flex:none;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums;}
.dshmp-pcount{display:inline-flex;align-items:center;justify-self:stretch;height:20px;box-sizing:border-box;padding:0 0 0 8px;font-size:12px;line-height:1;color:var(--dsw-alias-label-tertiary,#999);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dshmp-pinfo{display:flex;align-items:center;gap:8px;justify-self:end;min-width:0;}
.dshmp-money{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#333);font-variant-numeric:tabular-nums;}
.dshmp-muted{font-weight:400;color:var(--dsw-alias-label-tertiary,#999);opacity:.75;cursor:help;}
.dshmp-plan{display:inline-flex;align-items:center;gap:8px;}
.dshmp-bar{width:84px;height:6px;border-radius:3px;background:var(--dsw-alias-border-l2,#d0d0d0);overflow:hidden;}
.dshmp-bar-fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary,#4a7cff);transition:width .2s;}
.dshmp-bar-fill.low{background:var(--dsw-alias-state-error-primary,#d93025);}
.dshmp-pct{font-size:12px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums;min-width:34px;text-align:right;}
.dshmp-row{display:grid;grid-template-columns:minmax(0,1fr) 64px 250px;gap:9px;align-items:center;padding:6px 14px 6px 30px;cursor:pointer;border-left:2px solid transparent;outline:none;}
.dshmp-row.alt{background:rgba(128,128,128,.055);}
.dshmp-row.last{border-radius:0 0 10px 10px;}
.dshmp-row:hover{background:var(--dsw-alias-bg-layer-1,#f5f5f5);}
.dshmp-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4a7cff);outline-offset:-2px;}
.dshmp-row.current{background:linear-gradient(90deg,color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 18%,transparent),color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 6%,transparent));border-left-color:var(--dsw-alias-brand-primary,#4a7cff);border-left-width:3px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 16%,transparent);}
.dshmp-row.current .dshmp-name{font-weight:600;color:var(--dsw-alias-brand-primary,#4a7cff);}
.dshmp-row.current:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 20%,transparent);}
.dshmp-row.busy{opacity:.5;pointer-events:none;}
.dshmp-namewrap{display:flex;align-items:center;gap:6px;min-width:0;}
.dshmp-name{display:block;flex:1 1 auto;min-width:0;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-mult{flex:none;padding:0 5px;border-radius:5px;font-size:10.5px;font-weight:700;line-height:15px;letter-spacing:.2px;color:#15803d;background:color-mix(in srgb,#22c55e 15%,transparent);border:1px solid color-mix(in srgb,#22c55e 40%,transparent);font-variant-numeric:tabular-nums;}
.dshmp-cell{display:flex;justify-content:center;align-items:center;min-width:0;}
.dshmp-cell-effort{align-items:center;}
.dshmp-dash{color:var(--dsw-alias-label-tertiary,#999);text-align:center;}
.dshmp-toggle{position:relative;width:34px;height:19px;flex:none;padding:0;border:none;border-radius:10px;background:var(--dsw-alias-border-l2,#d0d0d0);cursor:pointer;transition:background .12s;}
.dshmp-toggle:disabled{opacity:.5;cursor:default;}
.dshmp-toggle.on{background:var(--dsw-alias-brand-primary,#4a7cff);}
.dshmp-knob{position:absolute;top:2.5px;left:2.5px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:transform .12s;}
.dshmp-toggle.on .dshmp-knob{transform:translateX(15px);}
.dshmp-effort-card{position:relative;display:flex;flex-direction:row;align-items:center;gap:6px;width:100%;height:30px;box-sizing:border-box;padding:0 6px 0 7px;border-radius:8px;background:rgba(128,128,128,.08);}
.dshmp-effort-side{display:flex;flex-direction:row;align-items:center;flex:none;width:44px;min-width:0;overflow:hidden;}
.dshmp-reset{position:static;flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:1;cursor:pointer;opacity:.45;transition:opacity .12s;}
.dshmp-reset-slot{display:block;flex:none;width:18px;height:18px;}
.dshmp-effort-card:hover .dshmp-reset{opacity:1;}
.dshmp-reset:hover{background:var(--dsw-alias-bg-layer-2,#ececec);color:var(--dsw-alias-label-primary,#333);}
.dshmp-effort-name{display:block;font-size:11.5px;font-weight:700;text-align:left;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:linear-gradient(90deg,#4c7dff,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent;}
.dshmp-effort-name.off{background:none;-webkit-background-clip:border-box;background-clip:border-box;color:var(--dsw-alias-label-tertiary,#999);font-weight:600;}
.dshmp-range{-webkit-appearance:none;appearance:none;display:block;flex:1 1 auto;min-width:0;height:20px;margin:0;border:none;border-radius:8px;cursor:pointer;outline:none;background-color:transparent;background-image:radial-gradient(1.5px 1.5px at 9% 32%,rgba(255,255,255,.95),rgba(255,255,255,0)),radial-gradient(1.2px 1.2px at 23% 68%,rgba(255,255,255,.85),rgba(255,255,255,0)),radial-gradient(1.5px 1.5px at 37% 30%,rgba(255,255,255,.9),rgba(255,255,255,0)),radial-gradient(1.1px 1.1px at 51% 72%,rgba(255,255,255,.8),rgba(255,255,255,0)),radial-gradient(1.4px 1.4px at 65% 36%,rgba(255,255,255,.9),rgba(255,255,255,0)),radial-gradient(1.2px 1.2px at 79% 64%,rgba(255,255,255,.85),rgba(255,255,255,0)),radial-gradient(1.5px 1.5px at 92% 33%,rgba(255,255,255,.9),rgba(255,255,255,0)),linear-gradient(90deg,#4c7dff 0%,#6a5cff 55%,#8b5cf6 100%);}
.dshmp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:none;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer;}
.dshmp-range::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:none;box-shadow:0 2px 6px rgba(0,0,0,.35);cursor:pointer;}
.dshmp-range::-moz-range-track{background:transparent;}
.dshmp-range:disabled{opacity:.55;cursor:default;}
.dshmp-empty{padding:22px 12px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-retry{margin-top:10px;height:28px;padding:0 14px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-size:12px;cursor:pointer;}
.dshmp-retry:hover{background:var(--dsw-alias-bg-layer-2,#ececec);}
.dshmp-fail{margin:8px 2px 0;padding:7px 12px;font-size:11.5px;color:var(--dsw-alias-state-error-primary,#d93025);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#d93025) 35%,transparent);border-radius:8px;}
/* Settings → Plugins → Balance display: cookie-only usage. */
.dshmp-set{padding:4px 2px 18px;font-size:13px;color:var(--dsw-alias-label-primary,#333);}
.dshmp-set-head{margin-bottom:14px;}
.dshmp-set-title{font-size:15px;font-weight:600;margin-bottom:4px;}
.dshmp-set-sub{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary,#666);max-width:64ch;}
.dshmp-set-card{margin-bottom:10px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1,#e6e6e6);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);}
.dshmp-set-top{display:flex;align-items:center;gap:10px;}
.dshmp-set-name{font-size:14px;font-weight:600;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-set-pill{flex:none;font-size:11px;line-height:1;padding:4px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-pill.on{color:var(--dsw-alias-brand-primary,#4a7cff);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 10%,transparent);}
.dshmp-set-meta{display:flex;align-items:center;gap:10px;margin-top:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-meta code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-secondary,#666);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-set-meta a{flex:none;color:var(--dsw-alias-brand-primary,#4a7cff);text-decoration:none;}
.dshmp-set-meta a:hover{text-decoration:underline;}
.dshmp-set-usage{display:flex;align-items:center;gap:10px;margin-top:9px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);font-variant-numeric:tabular-nums;}
.dshmp-set-usage.err{color:var(--dsw-alias-state-error-primary,#d93025);}
.dshmp-set-plan{font-weight:600;color:var(--dsw-alias-label-primary,#333);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dshmp-set-bar{flex:none;width:120px;height:6px;border-radius:3px;background:var(--dsw-alias-border-l2,#d0d0d0);overflow:hidden;}
.dshmp-set-bar-fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary,#4a7cff);transition:width .2s;}
.dshmp-set-bar-fill.low{background:var(--dsw-alias-state-error-primary,#d93025);}
.dshmp-set-pct{min-width:40px;}
.dshmp-set-until{color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-form{margin-top:10px;}
.dshmp-set-input{width:100%;box-sizing:border-box;min-height:62px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.5;outline:none;resize:vertical;}
.dshmp-set-input:focus{border-color:var(--dsw-alias-brand-primary,#4a7cff);}
.dshmp-set-actions{display:flex;gap:8px;margin-top:9px;}
.dshmp-set-btn{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#333);font-size:12px;cursor:pointer;transition:background .12s,border-color .12s;}
.dshmp-set-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#ececec);}
.dshmp-set-btn:disabled{opacity:.55;cursor:default;}
.dshmp-set-btn.primary{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7cff) 16%,transparent);color:var(--dsw-alias-brand-primary,#4a7cff);font-weight:600;}
.dshmp-set-err{display:flex;align-items:center;gap:10px;margin:0 0 10px;padding:8px 12px;font-size:12px;color:var(--dsw-alias-state-error-primary,#d93025);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#d93025) 35%,transparent);border-radius:8px;}
.dshmp-set-note{margin:0 0 10px;font-size:12px;color:var(--dsw-alias-label-secondary,#666);}
.dshmp-set-note.bad{color:var(--dsw-alias-state-error-primary,#d93025);}
.dshmp-set-empty{padding:16px 2px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);}
.dshmp-set-foot{margin-top:12px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#999);}
`;

    const inject = ['slots', 'locale', 'sessions'];

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
