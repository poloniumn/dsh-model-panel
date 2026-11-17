/**
 * Everything the two feature chunks share: keys, dictionaries, the balance
 * store, formatting, and the quota/schedule maths.
 *
 * Loaded first by the entry point, so the later chunks can pull it with a
 * plain synchronous require() — a chunk factory cannot await.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-panel',
  chunk: 'client.shared.js',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore, Fragment } = React;

    const NS = 'model-panel';
    const SLOT = 'conversation.input.model';
    const PRIORITY = -5;
    const K_EFFORTS = 'dsh-model-panel.efforts';
    const K_OFF = 'dsh-model-panel.off';
    const K_COLLAPSED = 'dsh-model-panel.collapsed';
    // Last answered balance rows, drawn before the host answers. A cold start
    // used to paint an empty card for seconds; the previous numbers are a
    // better first frame than nothing.
    const K_LAST_BALANCE = 'dsh-model-panel.last-balance';
    const BALANCE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
    const STATE_ENDPOINT = '/dsh-model-panel/state.json';
    const SETTINGS_ENDPOINT = '/dsh-model-panel/settings.json';
    const SECRET_ENDPOINT = '/dsh-model-panel/secret.json';
    const LOGIN_ENDPOINT = '/dsh-model-panel/login.json';
    const SUBAGENT_ENDPOINT = '/dsh-model-panel/subagent.json';

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
      groupDiscountHint: '本组内有模型处于折扣时段，倍率按模型逐行标注',
      windowUsage: '{l} 已用 {p}',
      odNeedControl: '需要控制键才能读用量',
      odBalance: 'OpenDesign 钱包余额',
      setControlKey: '控制键',
      setControlPlaceholder: '粘贴控制键（vela_ctrl_…）',
      setWorkspacePlaceholder: '工作区 ID（留空则自动读取）',
      setOptional: '可选',
      setNeedControl: 'OpenDesign 用量只对控制键开放，运行时密钥只能调用模型。',
      setOdLogin: '浏览器登录，自动拿到控制键',
      setOdWaiting: '等待浏览器批准：在打开的页面里输入下面的代码',
      setOdOpen: '打开批准页面',
      setOdExpired: '这次批准已过期，重新发起一次',
      setOdLinked: '已拿到控制键并写入凭据库',
      setOdRestart: '重新发起',
      setOdCancel: '取消登录',
      setPasteHint: '直接粘贴整段 Cookie 头，或 Cookie-Editor「Export As: JSON」的全部内容',
      setPasteLoaded: '已读入粘贴内容',
      setPasteEmpty: '没有读到内容，重新粘贴一次',
      setImported: '已导入 {n} 条 Cookie',
      setFiltered: '（另有 {n} 条属于其他站点，已略过）',
      ofmCredits: '剩余积分',
      ofmToken: '剩余 Token',
      ofmDollars: '剩余余额（USD）',
      ofmQuota: '剩余配额',
      ofmAccounts: '已查询 {n} 个账号',
      ofmFailed: '积分查询失败',
      subagent: '启用子任务',
      subagentOn: '本会话允许创建子智能体',
      subagentOff: '本会话已禁止创建子智能体',
      subagentUnknown: '无法读取开关状态',
      subagentFailed: '切换子任务开关失败',
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
      setSaved: '已保存，Cookie 可用',
      setCleared: '已清除。',
      setFailed: '保存失败',
      setPlaceholder: '粘贴整段 Cookie 头，或 Cookie-Editor「Export As: JSON」的全部内容',
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
      groupDiscountHint: 'Some models in this group are discounted right now — each row carries its own rate',
      windowUsage: '{l} used {p}',
      odNeedControl: 'Control key required for usage',
      odBalance: 'OpenDesign wallet balance',
      setControlKey: 'Control key',
      setControlPlaceholder: 'Paste the control key (vela_ctrl_…)',
      setWorkspacePlaceholder: 'Workspace id (read automatically when empty)',
      setOptional: 'optional',
      setNeedControl: 'OpenDesign usage is only readable with a control key; the runtime key can only call models.',
      setOdLogin: 'Sign in with a browser to mint the control key',
      setOdWaiting: 'Waiting for approval: enter this code on the page that opened',
      setOdOpen: 'Open the approval page',
      setOdExpired: 'This approval expired — start another one',
      setOdLinked: 'Control key received and stored',
      setOdRestart: 'Start over',
      setOdCancel: 'Cancel sign-in',
      setPasteHint: 'Paste the whole Cookie header, or everything Cookie-Editor “Export As: JSON” gives you',
      setPasteLoaded: 'Pasted content loaded',
      setPasteEmpty: 'Nothing was read — paste it again',
      setImported: '{n} cookies imported',
      setFiltered: ' ({n} more belong to other sites and were skipped)',
      ofmCredits: 'Credits left',
      ofmToken: 'Tokens left',
      ofmDollars: 'Balance left (USD)',
      ofmQuota: 'Quota left',
      ofmAccounts: '{n} accounts queried',
      ofmFailed: 'Credit lookup failed',
      subagent: 'Enable subagents',
      subagentOn: 'This session may create subagents',
      subagentOff: 'This session is blocked from creating subagents',
      subagentUnknown: 'Toggle state unavailable',
      subagentFailed: 'Could not change the subagent switch',
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
      setPlaceholder: 'Paste the whole Cookie header, or everything Cookie-Editor “Export As: JSON” gives you',
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
            // The host answered from its own last state while it collects a
            // fresh one; ask again shortly.
            stale: data.stale === true,
          };
        })
        .catch(() => null);
    }

    /** Rows from the previous session, so the first frame is never empty. */
    function savedBalance() {
      const saved = loadLS(K_LAST_BALANCE, null);
      if (!saved || !Array.isArray(saved.rows)) return null;
      if (!Number.isFinite(saved.at) || Date.now() - saved.at > BALANCE_MAX_AGE_MS) return null;
      return { rows: saved.rows, thirdParty: Array.isArray(saved.thirdParty) ? saved.thirdParty : [] };
    }

    function rememberBalance(rows, thirdParty) {
      saveLS(K_LAST_BALANCE, { at: Date.now(), rows, thirdParty });
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
          // A stale answer must not be cached: the follow-up request in ~700 ms
          // has to reach the host again, not read this same object back.
          balanceCache = {
            at: data.stale ? 0 : Date.now(),
            rows: data.rows,
            thirdParty: data.thirdParty,
          };
          if (!data.stale) rememberBalance(data.rows, data.thirdParty);
          return data;
        }
        return { rows: balanceCache.rows || [], thirdParty: balanceCache.thirdParty || [] };
      });
    }

    // ---------- shared request helpers ----------

    /**
     * Fire a loader and swallow its rejection. Three call sites (mount effect,
     * open effect, retry button) used to hand-roll this; one helper keeps a
     * failed background load from surfacing as an unhandled rejection.
     */
    function kick(load) {
      if (typeof load !== 'function') return;
      try {
        const p = load();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {
        /* ignore */
      }
    }

    /**
     * One JSON round-trip. `errorKey` names the field this endpoint reports
     * failures under — the secret and login routes answer with `error`/`message`
     * respectively, and the settings page renders whichever it got.
     */
    async function requestJson(url, options) {
      const opts = options || {};
      const errorKey = opts.errorKey === 'message' ? 'message' : 'error';
      const init = { cache: 'no-store' };
      if (opts.method) init.method = opts.method;
      if (opts.payload !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(opts.payload);
      }
      try {
        const res = await fetch(url, init);
        const body = await res.json().catch(() => null);
        if (!body || typeof body !== 'object') {
          const shaped = { ok: false };
          shaped[errorKey] = 'HTTP ' + res.status;
          return shaped;
        }
        return body;
      } catch (err) {
        const shaped = { ok: false };
        shaped[errorKey] = String((err && err.message) || err);
        return shaped;
      }
    }

    // ---------- per-session subagent switch ----------

    function sessionQuery(sessionId) {
      return sessionId ? '?session=' + encodeURIComponent(String(sessionId)) : '';
    }

    async function loadSubagent(sessionId) {
      const body = await requestJson(SUBAGENT_ENDPOINT + sessionQuery(sessionId));
      if (!body || body.ok !== true || typeof body.enabled !== 'boolean') return null;
      return body.enabled;
    }

    async function setSubagent(sessionId, enabled) {
      const body = await requestJson(SUBAGENT_ENDPOINT, {
        method: 'POST',
        payload: { enabled: enabled === true, sessionId: sessionId || '' },
      });
      if (!body || body.ok !== true || typeof body.enabled !== 'boolean') {
        return { ok: false, enabled: null, error: String((body && (body.error || body.message)) || 'failed') };
      }
      return { ok: true, enabled: body.enabled, error: '' };
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

    /** '00:00-08:00' for the peak windows a row publishes, or an empty string. */
    function scheduleLabel(now, row) {
      const schedule = row && row.peakSchedule;
      const windows = Array.isArray(schedule && schedule.windows) ? schedule.windows : [];
      const parts = [];
      for (const win of windows) {
        const range = { startMinute: Number(win && win.startMinute), endMinute: Number(win && win.endMinute) };
        if (!Number.isFinite(range.startMinute) || !Number.isFinite(range.endMinute)) continue;
        if (range.startMinute === range.endMinute) continue;
        parts.push(windowLabel(range));
      }
      return parts.join(' / ');
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

    /** Same fold as `normalizeModelKey` in lib/qwen-discount.js (the client cannot import ESM). */
    function normModelKey(value) {
      return String(value == null ? '' : value)
        .toLowerCase()
        .replace(/[\s._-]+/g, '')
        .replace(/\d{2,4}$/, '');
    }

    /** The night window plus its badge groups while the window is open. */
    function nightState(now, row) {
      const win = windowRange(row);
      if (!win) return null;
      if (!inWindow(beijingMinutes(now), win.startMinute, win.endMinute)) return null;
      const badges = Array.isArray(row.nightBadges) ? row.nightBadges : [];
      return { win, note: windowLabel(win), badges };
    }

    /**
     * `4` → `0.4`, `4.5` → `0.45`, `45` → `0.45`, `0.4` → `0.4`.
     *
     * An unreadable discount returns null: a guessed multiplier on a model row
     * is worse than no chip at all.
     */
    function badgeRate(badge) {
      const value = Number(badge && badge.discount);
      if (!Number.isFinite(value) || value <= 0) return null;
      const rate = value < 1 ? value : value >= 10 ? value / 100 : value / 10;
      return String(Math.round(rate * 1000) / 1000);
    }

    /** A badge may carry its own window; null means "inherit the provider's". */
    function badgeWindow(badge) {
      const win = badge && badge.window;
      if (!win) return null;
      const startMinute = Number(win.startHour) * 60 + Number(win.startMinute || 0);
      const endMinute = Number(win.endHour) * 60 + Number(win.endMinute || 0);
      if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || startMinute === endMinute) return null;
      return { startMinute: startMinute, endMinute: endMinute };
    }

    /**
     * The badge group that covers `model`, or null.
     *
     * The catalog advertises the discount per model, and a window may hold
     * several groups (4 折 for Qwen3.8, 5 折 for DeepSeek-V4). A profile id
     * rarely equals the catalog id (`deepseek-v4.1-flash-1017` vs
     * `DeepSeek-V4.1-Flash`), so ids are compared exactly first, then as folded
     * keys, then against the display names an older cache carried. A group that
     * lists no model at all applies to everything (MiMo ships exactly that).
     */
    function badgeFor(night, model) {
      if (!night || !Array.isArray(night.badges) || !night.badges.length) return null;
      const id = String(model && model.id != null ? model.id : '');
      const key = normModelKey(id);
      for (const badge of night.badges) {
        if (Array.isArray(badge && badge.ids) && badge.ids.indexOf(id) >= 0) return badge;
      }
      for (const badge of night.badges) {
        if (badge && Array.isArray(badge.keys) && badge.keys.indexOf(key) >= 0) return badge;
      }
      for (const badge of night.badges) {
        const names = badge && Array.isArray(badge.models) ? badge.models : null;
        if (names && names.map(normModelKey).indexOf(key) >= 0) return badge;
      }
      // Last resort before the wildcard: a folded key that is a prefix of the
      // other side (`deepseekv41flash` contains-then-extends `deepseekv41flash1017`).
      // The longest shared prefix wins; two groups claiming the same length
      // cancel out, because an ambiguous match must show nothing rather than
      // pick a favourite.
      let prefixHit = null;
      let prefixLen = 0;
      let ambiguous = false;
      for (const badge of night.badges) {
        const keys = Array.isArray(badge && badge.keys) ? badge.keys : [];
        for (const candidate of keys) {
          if (!candidate || !key || candidate.length <= 3) continue;
          if (!key.startsWith(candidate) && !candidate.startsWith(key)) continue;
          const span = Math.min(key.length, candidate.length);
          if (span > prefixLen) {
            prefixLen = span;
            prefixHit = badge;
            ambiguous = false;
          } else if (span === prefixLen && badge !== prefixHit) {
            ambiguous = true;
          }
        }
      }
      if (prefixHit && !ambiguous && prefixLen >= 6) return prefixHit;
      for (const badge of night.badges) {
        const bare = badge
          && (!Array.isArray(badge.ids) || !badge.ids.length)
          && (!Array.isArray(badge.keys) || !badge.keys.length)
          && (!Array.isArray(badge.models) || !badge.models.length);
        if (bare) return badge;
      }
      return null;
    }

    /** The multiplier that applies to one model right now, or null. */
    function modelDiscount(now, row, model) {
      if (!row) return null;
      const id = String(row.id || '');
      if (id === 'deepseek' || id === 'deepseek-account') {
        if (isPeak(now, row) !== false) return null;
        const label = scheduleLabel(now, row);
        return { rate: '0.5', note: label, windowLabel: label, rates: ['0.5'] };
      }
      const night = nightState(now, row);
      if (!night) return null;
      if (!night.badges.length) return null;
      const badge = badgeFor(night, model);
      if (!badge) return null;
      const rate = badgeRate(badge);
      if (!rate) return null;
      // A group can advertise its own window (a later window than the provider
      // default). Saying "0.4x" outside that window would be a lie.
      const own = badgeWindow(badge);
      if (own && !inWindow(beijingMinutes(now), own.startMinute, own.endMinute)) return null;
      const label = own ? windowLabel(own) : night.note;
      return { rate: rate, note: label, windowLabel: label, rates: [rate] };
    }

    /**
     * Whether any model in this provider is discounted right now.
     *
     * Deliberately a boolean, never a number: one provider can hold several
     * groups (`4 折` Qwen3.8, `5 折` DeepSeek-V4) and printing one of them in
     * the header misquotes the others. The header only says "something in
     * here is cheaper"; the rate is printed on every model row.
     */
    function groupHasDiscount(now, row, list) {
      if (!row) return false;
      const id = String(row.id || '');
      if (id === 'deepseek' || id === 'deepseek-account') return modelDiscount(now, row, null) !== null;
      const night = nightState(now, row);
      if (!night) return false;
      if (!Array.isArray(list) || !list.length) return modelDiscount(now, row, null) !== null;
      for (const model of list) {
        if (modelDiscount(now, row, model)) return true;
      }
      return false;
    }

    /** Hover text for one model's chip: its own rate plus the window it covers. */
    function modelDiscountTitle(t, disc) {
      if (!disc || !disc.rate) return undefined;
      const tail = disc.rate + 'x';
      const label = disc.windowLabel || disc.note || '';
      return label ? label + ' · ' + tail : tr(t, 'offPeak') + ' · ' + tail;
    }

    /**
     * One bar per usage window, capped at `max` (a plan can publish 5-hour,
     * weekly and monthly pools at once). Windows without a readable
     * percentage are skipped rather than drawn empty.
     */
    function windowBars(row, t, max) {
      const windows = Array.isArray(row && row.windows) ? row.windows : [];
      const out = [];
      for (const win of windows) {
        if (out.length >= max) break;
        const pct = Number.isFinite(win && win.remainPct) ? win.remainPct : null;
        if (pct === null) continue;
        const clamped = Math.max(0, Math.min(100, pct));
        const label = String((win && win.label) || '');
        out.push(
          h(
            'span',
            {
              key: label + out.length,
              className: 'dshmp-wbar',
              title: tr(t, 'windowUsage', { l: label || 'window', p: pctText(clamped) }),
            },
            label ? h('span', { className: 'dshmp-wtag' }, label) : null,
            h(
              'span',
              { className: 'dshmp-bar dshmp-bar-sm' },
              h('span', {
                className: 'dshmp-bar-fill' + (clamped < 20 ? ' low' : ''),
                style: { width: clamped + '%' },
              })
            ),
            h('span', { className: 'dshmp-pct' }, Math.round(clamped) + '%')
          )
        );
      }
      // A plan row without windows falls back to its single top-level bar.
      if (!out.length && Number.isFinite(row && row.remainPct)) {
        const clamped = Math.max(0, Math.min(100, row.remainPct));
        out.push(
          h(
            'span',
            { key: 'single', className: 'dshmp-wbar' },
            h(
              'span',
              { className: 'dshmp-bar' },
              h('span', {
                className: 'dshmp-bar-fill' + (clamped < 20 ? ' low' : ''),
                style: { width: clamped + '%' },
              })
            ),
            h('span', { className: 'dshmp-pct' }, Math.round(clamped) + '%')
          )
        );
      }
      return out;
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
    return {
      NS, SLOT, PRIORITY, K_EFFORTS, K_OFF, K_COLLAPSED, K_LAST_BALANCE, BALANCE_MAX_AGE_MS, STATE_ENDPOINT, SETTINGS_ENDPOINT, SECRET_ENDPOINT, LOGIN_ENDPOINT, SUBAGENT_ENDPOINT, zh, en, tr, loadLS, saveLS, hasLS, loadObject, loadStringArray, fetchState, savedBalance, rememberBalance, loadBalance, kick, requestJson, sessionQuery, loadSubagent, setSubagent, money, compact, pctText, ofmLabel, creditLabel, foldKey, creditFor, groupRank, orderGroups, toDate, beijingMinutes, beijingWeekday, inWindow, isPeak, scheduleLabel, windowRange, windowLabel, normModelKey, nightState, badgeRate, badgeWindow, badgeFor, modelDiscount, groupHasDiscount, modelDiscountTitle, windowBars, matchBalanceRow, reasoningOf, offLevelOf, stepsOf, defaultNonOff, findModel, rawEffort, effortNameOf, triggerText, errorText, ThinkingToggle, EffortSlider,
    };
  },
});
