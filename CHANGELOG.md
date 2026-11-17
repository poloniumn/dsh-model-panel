# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.7.4 — 2026-11-18

### Changed

- **The panel no longer re-renders on every tick.** The badge clock is a minute
  identifier (`Math.floor(Date.now() / 60_000)`) instead of a raw timestamp, so
  the minute tick and a window focus inside the same minute compare equal and
  React bails out. The badge `Date` is rebuilt from that identifier, so the
  memo holds for the whole minute.
- **Dead exports are gone.** 24 host helpers lost their `export` keyword: each
  is only called by the file that defines it, and nothing outside `lib` ever
  imported them.
- **The shared client chunk exports only what its siblings consume.** 18
  helpers no other chunk imports are now private to `client.shared.js`; their
  bodies are unchanged and the shared maths still uses them internally.
- **The entry point no longer imports the HTTP helpers.** `loopbackBase`,
  `sendJson` and `sendEmpty` are used by `lib/routes.js` alone; the unused
  import and the unused `PANEL` chunk constant were removed.
- **`createRoutes` is called with the arguments it declares.** The extra
  `denied` argument was never destructured; the fence is still built by
  `createFence` inside the route module.
- **`parseBalanceInfos` is one helper.** DeepSeek and Xiaomi MIMO asked the
  same `{balance_infos:[…]}` question with a different amount-field priority;
  both now call `util.js` with their own preference and keep their exact output
  shape, including DeepSeek's top-up note.
- **React destructuring matches what each chunk uses.** `client.shared.js` no
  longer pulls `useCallback` / `useMemo` / `useSyncExternalStore` / `Fragment`;
  `client.settings.js` no longer pulls `useRef` / `Fragment`.
- **The published tarball ships no tests.** `test/` left the `files` whitelist:
  it still runs in CI from the repository and is not needed at install time.
- `README.md` / `README_EN.md`: the version badge says 0.7.4.

- **The showcase screenshot is the real panel again.** `images/panel-overview.png`
  was a 0.6-era shot with no discount chips, no plan progress and no subagent
  row. It now shows a live session: per-model `0.5x` / `0.4x` chips, a Qwen
  Token Plan at 96 %, the OpenDesign USD wallet with both windows, and the
  启用子任务 switch. Both READMEs follow it: the caption names the discount
  and switch rows, the UI table quotes the numbers actually on screen instead
  of the stale `¥9.75` / `2 %`, and the screenshot note no longer claims
  two themes are on disk when only the dark main view is.

### Fixed

- Both READMEs still carried a 0.7.2 version badge after the 0.7.3 release.

### Verified, left alone on purpose

- The host keeps its 60 s cache with in-flight de-duplication and its disk seed
  (`CACHE_TTL_MS` / `STALE_TTL_MS` / `DEGRADED_TTL_MS`), and the sweep already
  runs its independent reads concurrently — no serial hot path to flatten.
- `lib/util.js#getJson` (Bearer, one retry) and `lib/upstream.js#requestJson`
  (five auth modes, redirect refusal, 1 MiB cap) stay separate: merging them
  would touch eight files and lose semantics for no measurable gain.
- Every chunk unregisters its timers and listeners on teardown; the settings
  tab polls only while a login is pending.

## 0.7.3 — 2026-11-17

### Fixed

- **A restart no longer empties the panel.** Two defects stacked up here. The
  0.7.0 split assigned `const collect = createCollect({…})` while
  `lib/collect.js` returns `{ collect, enabledProviders }`, so
  `lib/snapshot.js` called a plain object and `state.json` answered
  `500 {"ok":false,"error":"collect is not a function"}`. The factory now
  destructures again, and `test/run.mjs` pins the shape.
- **A cold credential store is not a result.** The host mounts this plugin
  before `credentials` finishes loading, and every read then answers
  "nothing" — indistinguishable from "no key configured". The first sweep
  wrote such an all-keyless frame to `last-state.json` and parked it in the
  60s cache, so the panel kept drawing `no-key` rows long after the keys were
  readable. `lib/secrets.js` now exposes `available()`; `lib/collect.js`
  reports `degraded: true` when the store was not up; `lib/snapshot.js`
  keeps a degraded answer out of the cache (new `DEGRADED_TTL_MS = 0`), out
  of `last-state.json`, and out of the seed — an old all-keyless file is no
  longer replayed either.
- **The browser stops keeping an empty frame.** `client.shared.js` treats
  `degraded` like `stale`: no `balanceCache` entry, no
  `rememberBalance()` write, and the panel's open effect retries it
  (bounded at five attempts) instead of painting once and stopping.

### Tests

- **The cold start is asserted end to end.** A new `[cold credential store]`
  block runs three sweeps against a temporary cache directory, proves
  `DEGRADED_TTL_MS === 0`, proves a keyless `last-state.json` is refused as a
  seed, and checks that `available()` follows the service. A separate
  process-level run (mount with no `credentials`, then provide it) goes
  `degraded: true, 0 real rows` → `degraded: false, 1 real row`.
## 0.7.2 — 2026-11-17

### Fixed

- **The seat registers again.** `conversation.input.model` is a `single` slot
  whose child slots (`conversation.input.model.label` and
  `conversation.input.model.options`) are declared by the shipped model
  selector itself (`dsh-client-ui-model-selection` `src/client/index.ts:172-178`).
  Our entry declared `.label` a second time, so `SlotCore.register` threw
  `slot "conversation.input.model.label" is already declared` at
  `dsh-client-ui-slots` `lib/index.js:209-212`; the `try/catch` in the entry
  logged the failure and gave up, leaving the host's own selector in the cell.
  Registration no longer requests any child, which is also how priority -5
  shadows the shipped entry without touching its declarations.
- **Labels render without the native label slot.** The seat drew the trigger
  text and every option name through `renderSlot(LABEL_SLOT)`; a registration
  without that child is refused by `boundRenderSlot`
  (`dsh-client-ui-renderer` `src/client/scoped-slots.tsx:80-83`, which throws
  `SlotOwnershipError`), and the call was inside a `try` that silently fell
  through to plain text. The trigger and the option rows now build their own
  `<span>`, so the same text appears in every case, without a hidden failure
  path on each render.

### Tests

- **The boot test now enforces the real declaration rule.** The in-memory slot
  stub rejects a second declaration of any child key and pre-registers the
  shipped selector, which is exactly the composition the browser sees. The
  previous stub accepted anything, so the suite passed while the seat could
  never register.
- **The seat is asserted childless.** `the model seat declares no child slots`
  pins the fix; `our seat registers beside the shipped selector` proves the
  registration survives the shipped entry's arrival in either order.
## 0.7.1 — 2026-11-17

### Fixed

- **The model seat no longer dies at render.** `client.panel.js` reads the
  session store with `useSyncExternalStore`, but the chunk only pulled
  `useState/useEffect/useRef/useCallback/useMemo/Fragment` off `React`; the
  bare `ReferenceError: useSyncExternalStore is not defined` aborted the seat
  and the host fell back to its own selector. The hook is destructured now,
  so the dropdown renders again.

### Tests

- **Hooks and chunk imports are checked statically.** Every chunk plus the entry
  is scanned for `use*` calls and compared with the names destructured from
  `React`, and every symbol a chunk imports from `client.shared.js` must exist
  in the shared export table. `node --check` cannot see either failure mode:
  the first edition of this suite passed 414 assertions while the seat was
  broken, because a missing hook only fails at render time.
## 0.7.0 — 2026-11-17

### Added

- **Work that used to be serial now overlaps.** The host reads every credential
  candidate in parallel and stops at the first hit (`probeCredential`), the
  optional extras the same way, and no longer adds the schedule sweep, the two
  Qwen gateway calls or the Moonshot usage/account pair end to end. The
  diagnostics snapshot is written asynchronously and skipped when its content
  did not change, so a steady refresh stops rewriting an 8 KB JSON file on the
  request path.
- **`row.secretSource`.** Every row now reports which credential answered it
  (`secrets` service, `env`, or nothing) with the ref and auth kind, so a
  "why is this row empty" question is answerable from the state payload.
- **A configurable switch default.** `subagentDefault` takes a boolean or a
  per-preset map (`{ "preset": true, "*": false }`) resolved through
  `agentPresets.presetForSession`. A stored session value still wins, so an
  explicit click is never overridden by a config edit.
- **Route-level contracts in the test suite.** The fence, the error wrapper and
  the four handlers run against stub requests and responses, covering the 200,
  400, 403, 405 and 500 paths instead of only scanning source text.

### Changed

- **The browser half is one entry plus four package-local chunks.** `client.js`
  keeps the entry (locale registration, stylesheet mounting, two slot
  registrations) and pulls `client.shared.js`, `client.css.js`,
  `client.panel.js` and `client.settings.js` through `require.async`. The
  stylesheet goes into the document head once, behind a stable element id,
  instead of being re-diffed as a virtual node every render.
- **The panel derives its layout once per input change.** Provider boxes, the
  third-party credit map and the ordered model rows are `useMemo` results keyed
  by their inputs; the clock behind the peak/night badges is one state value
  refreshed by a minute tick and a window-focus event, so a render pass no
  longer allocates a `Date` or rebuilds the row list on every keystroke.
- **`planName` and `windowLabel` live in one place.** Two copies of the plan
  name table and three copies of the window-length label are collapsed into
  `lib/util.js` and `lib/upstream.js`.

### Removed

- `todayKey`, the exported `clampPct`, `hostIsLoopback` / `originIsLoopback`,
  and the exported `buildAdapters` — none had a caller outside its own module.
## 0.6.2 — 2026-11-17

### Added

- **A per-session subagent switch, on the last row of the model dropdown.**
  The panel's dropdown now closes with an 启用子任务 row: it shows whether the
  current session may delegate, and flipping it off makes the host's
  delegation tools (`subagent`, `subagent_oar`) refuse for that session and
  for every child of it. The flag is keyed by the *root* session, so a subagent
  cannot re-litigate what its parent decided, and it is stored in
  `subagent-gate.json` next to the other panel state — no session event the
  host would have to understand, no rebuild of the session log. The gate is
  installed through `tools.guard` and fails open: an unreadable store, a
  missing agent, or any non-delegation tool passes untouched.

### Changed

- **The host half is split by responsibility instead of kept in one file.**
  `index.js` went from 654 lines to 170 and now only assembles:
  `lib/rows.js` (credential resolution, one row per provider),
  `lib/collect.js` (which providers become rows, ordering, third-party
  channels), `lib/snapshot.js` (60 s cache, in-flight de-duplication, on-disk
  seed), `lib/routes.js` (the trust fence, one response wrapper, the JSON
  endpoints), `lib/subagent-gate.js` (the new switch and its tool gate). Every
  factory receives what it needs; nothing reaches into another module's state.
- **The three route handlers share one wrapper.** `handleState`,
  `handleSettings` and `handleSecret` used to each repeat the same
  try/catch plus 403 fence plus error-body spelling; `fenced(denied, handler)`
  is now the single place that decides.

### Removed

- `lib/baseline.js` (no caller), the `fileIn` / `removeJson` helpers in
  `lib/cache.js`, the second adapter construction in `lib/registry.js`
  (`BASE_ADAPTERS`, the module-level `ADAPTERS` map, `SETUP_ADAPTERS`,
  `adapterFor`, `install`), and `chooseSecretRef` in the entry point.
  `createAdapterSet` is the one way to build the adapter set now.
- Three copies of the same `load()` kick in `client.js` collapsed into
  `kick(load)`, and the three `fetch → json → validate` request wrappers
  collapsed into one `requestJson(url, options)` that keeps both error-key
  spellings (`error` for the cookie route, `message` for the login route).

### Tests

- The suite scans a composite host surface (`index.js` plus the `lib`
  modules) instead of the entry file alone, and the new `[subagent switch]`
  block exercises the gate as a pure unit: default-on, off, child inheritance,
  non-delegation pass-through, and the missing-agent pass-through.

## 0.6.1 — 2026-11-14

### Changed

- **The card paints from what it already knows instead of waiting for the
  network.** A cold Harness process had no state at all, so the first panel
  open ran the whole provider sweep in front of an empty card — measured at
  2.8 s on this machine, and the OpenDesign wallet alone took 3.7 s of it. Now
  the panel draws the last answered rows (kept in `localStorage` for the
  browser, `last-state.json` for the host) and, when the host answers with
  `stale: true`, asks again 700 ms later for the fresh numbers. Measured on
  the same machine: first paint 2 ms, fresh numbers 2.5 s, warm answer 0 ms.
- **OpenDesign asks its three billing endpoints at once.** Preflight (the
  Coding Plan windows), the wallet balance and the billing summary are
  independent answers; they used to be three sequential requests. The adapter's
  own probe dropped from 3.7 s to 0.57 s, and its per-request timeout from 12 s
  to 6 s so a wedged endpoint degrades instead of stalling the card.

### Fixed

- A stale answer is never written into the browser's 60 s cache, so the
  follow-up request really reaches the host instead of reading the same object
  back.

## 0.6.0 — 2026-11-14

### Added

- **OpenDesign's control key is minted in the browser, not hunted for in a
  console.** The key that unlocks wallet and Coding Plan usage is not shown on
  any page — the official CLI obtains it through a device authorization
  (`vela login`), so the panel now runs that same flow: one button asks
  `POST https://amr-api.open-design.ai/api/v1/cli/device-authorizations` for a
  6-character user code, opens `https://open-design.ai/cloud/cli/activate`,
  shows the code, and polls
  `POST …/cli/device-authorizations/{deviceId}/token` every
  `pollIntervalSeconds` until a browser approves it. The approved
  `controlKey` (`vela_ctrl_…`) is written straight into the credential store
  and the workspace id is re-read and backfilled; the response body never
  echoes the key back to the page (`lib/opendesign-login.js`).
- `POST /dsh-model-panel/login.json` (`{action: 'start' | 'status' | 'cancel'}`),
  loopback-only like the other routes, 64 KB body limit
  (`lib/opendesign-login-route.js`).
- The pending state shows the user code, a link to the approval page and a
  cancel button; a failed approval explains itself and offers "Restart".

### Fixed

- **The settings card said "已配置" and "未取到用量" at the same time.** An
  extras row (OpenDesign's control key, workspace id and console cookie)
  only reported whether a value was stored; the usage probe ran on the
  adapter's own secret row, which for OpenDesign is the model key — so a
  freshly minted control key looked like it had done nothing at all. The
  row that owns the group (`reports: true`) now resolves every sibling
  value, probes the adapter once per group with the same `extras` shape the
  panel uses, and shows the wallet balance plus the 5-hour / 7-day windows
  under the key. Saving, clearing or minting a value drops both the row
  cache and the group probe.

### Changed

- **The first poll waits one interval.** A request fired in the same
  millisecond the code was issued can only answer "pending" and buys an extra
  device round trip, so the loop starts one `pollIntervalSeconds` late.
- Transient control-plane failures (502/503/504 and 520–524) are retried four
  times with a 500 ms step before the login reports an error; 401 is
  `rejected` and 404/410 is `expired`, which is what a lapsed device
  authorization actually looks like.
- The authorization window is capped at ten minutes; the code itself expires
  after the 120 seconds the control plane advertises. Closing the approval tab
  is harmless — the next poll still collects an already-approved key.
- The control key can still be pasted by hand, so nothing that worked before
  stops working.

## 0.5.0 — 2026-11-14

### Added

- **A console cookie can be pasted as an export, not retyped as a header.**
  Copying a session out of the devtools by hand is tedious and easy to get
  wrong, but asking for a file is worse: Cookie-Editor's *Export As: JSON* is
  plain text, so the box takes it directly. A paste may be a Cookie-Editor
  array, a `{"cookies":[…]}` / `{"data":[…]}` wrapper, a Netscape
  `cookies.txt` (the `#HttpOnly_` prefix included) or a plain
  `{name: value}` map; every shape becomes one request header at save time
  (`lib/cookie-import.js`). A dropped file is still accepted as a shortcut, but
  nothing on the page asks for one.
- **One paste format for every cookie module.** The Qwen Token Plan and the
  MiMo Token Plan each take a cookie row, and OpenDesign's optional console
  cookie runs through the identical path — same parser, same wording, same
  feedback.
- **Cookie rows follow the registry.** The declared order
  (`COOKIE_PROVIDER_IDS`) comes first; any other adapter whose secret is a
  cookie is appended automatically, so a new cookie vendor needs no edit here.

### Changed

- **The provider's own cookies are preferred, never required.** A cookie whose
  `domain` sits under the provider's suffixes wins (`qianwenai.com` /
  `aliyun.com` / `aliyuncs.com` for Qwen, `xiaomimimo.com` / `mi.com` for MiMo,
  `open-design.ai` for OpenDesign). Empty values, cookies that expired
  (`expirationDate` in the past and not a session cookie) and values holding
  `;` or a newline are dropped; a repeated name keeps the last occurrence. When
  nothing matches, the whole paste is used: a few extra cookies are ignored by
  the gateway, an empty header would fail silently.
- `POST /dsh-model-panel/secret.json` accepts up to 512 KB, because a full
  browser export does not fit the previous 64 KB body limit.
- A save reports `imported` (`format`, `count`, `total`, `skipped`, `filtered`,
  `names`); the page shows *N cookies imported* and, separately, how many were
  filtered out.

### Fixed

- A paste that holds no usable cookie is refused with `no-cookies` instead of
  being stored as a malformed header.

## 0.4.4 — 2026-11-14

### Changed

- **The provider header no longer prints a discount multiplier.** A single
  window can hold several rates (Qwen's night window is `4 折` for the
  Qwen3.8 models and `5 折` for the DeepSeek-V4 ones), so whichever number
  the header picked was wrong for most of its rows. The header keeps the soft
  green tint and the hover hint; the multiplier itself is now drawn per model
  row only.
- **Every discount group carries its own rate and its own window.**
  `parseBadges` stores `rate` (`4 折` → `0.4`) and the `22:00 - 次日 08:00`
  span next to the model list, so a row can be marked only while its own
  window is open. The old `0.8x` default for a group with no readable rate is
  gone — an unparsable badge now shows nothing.
- **A model id family is matched by folded prefix.** `deepseek-v4.1-flash`
  and `deepseek-v4.1-flash-1017` are now the same family; a prefix shorter
  than six characters, or one that two groups claim, is rejected so a row is
  never marked with a guessed rate.
- **The discount cache refreshes during a window.** A cache is reused only
  while it is younger than six hours, so a discount changed mid-window is
  picked up instead of waiting for the next day.
- **Usage is drawn per window.** A plan row with several pools (5-hour,
  weekly, monthly) used to show one bar taken from the first window; it now
  shows one bar per pool, with the window name in front when there is room.

### Added

- **OpenDesign adapter with wallet balance and Coding Plan windows.**
  `/api/v1/workspaces/<id>/billing/preflight` supplies the 5-hour and 7-day
  credit pools, `/wallet/balance` the USD balance, `/billing/summary` the
  membership tier. Workspace ids are discovered from
  `/api/v1/workspaces/current` when they are not configured.
- **Extra credentials on the settings page.** A row can now store a key or a
  plain id next to the console cookies: OpenDesign asks for a control key
  (`vela_ctrl_…`), a workspace id and an optional console cookie. The save
  route takes an explicit `ref`, so one provider can own several credentials.
  A workspace id is filled in automatically when the control key validates.
- **Adapters can declare `extras`.** `secret.extras` entries are resolved from
  the credential store (then the environment) before `fetchSecret` runs, so an
  adapter that needs a second credential no longer has to reach for globals.

### Fixed

- **OpenDesign's runtime key is not a billing credential.** Measured against
  `amr-api.open-design.ai`, `sk-amr-…` answers 401 on every billing route and
  `amr-link.open-design.ai/v1/chat/completions` carries no quota header.
  A key with no control credential now reports `no-control-key` with an
  explanation instead of a zero balance.
## 0.4.3 — 2026-11-13

### Fixed

- **The night discount is matched per model, not per provider.** A Qwen token
  plan publishes two groups in one window — `4 折` for the Qwen3.8 models and
  `5 折` for the DeepSeek-V4 ones — and the panel used to read only the first
  group. `Auto` sits in that first group, so every model looked like the same
  group and the DeepSeek-V4 rows showed the wrong multiplier. Each row now
  resolves its own group.
- **Catalog ids are matched, not display names.** The catalog advertises
  `DeepSeek-V4.1-Flash` while the profile carries
  `deepseek-v4.1-flash-1017`, so the old exact-name test never matched and no
  row turned green. Ids are compared exactly, then as folded keys (case,
  spacing, separators and a trailing revision number removed), then against the
  display names an older cache carries.
- **A group no longer gets swallowed by `Auto`.** The first group used to
  collapse into a single wildcard that applied to everything.

### Added

- **A group-level chip in the provider header.** When a provider's models sit in
  several discount groups, the header shows the lowest multiplier it covers
  (`0.4x`), and the hover text lists every rate in the group
  (`22:00-08:00 · 0.4x / 0.5x`).

### Internal

- The discount cache carries `schema: 2`. A cache written by an older build is
  rejected and refetched immediately, and its `models` names are folded into the
  new per-group `ids`/`keys`/`names` shape when the fetch fails.
## 0.4.2 — 2026-11-13

### Fixed

- **A credential ref is now derived from the provider id.** Some routes store
  their key under the id's own uppercase name (`kimi-coding` →
  `KIMI_CODING_API_KEY`) without declaring `apiKeyEnv` in the profile; the row
  used to resolve nothing and render an empty header. The derived name is tried
  after the profile ref and the adapter's own refs, together with a
  `process.env` fallback.
- **An unresolved row says so.** A provider whose balance row is not `ok` now
  renders a muted `—` with the reason on hover (missing key, expired cookie,
  vendor error) instead of rendering nothing at all.

### Added

- **`last-state.json` diagnostics.** Every collected state is written to the
  plugin cache directory, so a row that shows no number can be inspected
  without opening the panel. Rows never contain credential values.

## 0.4.1 — 2026-11-13

### Fixed

- **Fold memory is real again.** 0.4.0 rewrote the fold set on every open, which
  made the persisted choice dead data. The focused seed now runs once — only
  when no fold state exists yet — and opening the panel merely re-opens the
  provider that owns the current model. Everything else keeps the state the user
  last set, and every fold change is written to
  `dsh-model-panel.collapsed` as before.

## 0.4.0 — 2026-11-13

### Added

- **Discount multiplier chips / 折扣倍率标记.** When a low-price window is live,
  the provider header turns soft green (same affordance DeepSeek already had) and
  the model name carries a small chip with the price multiplier:
  DeepSeek off-peak `0.5x`, Qwen Token Plan `0.4x` during 22:00–08:00 Beijing
  time, MiMo / xiaomi Token Plan `0.8x` during 00:00–08:00. Providers whose
  schedule lists explicit models only badge those models.

### Changed

- **Panel opens focused.** Every provider is folded when the panel opens except
  the one that owns the current model, and that provider is forced open even if
  it was collapsed before. Fold state from this pass is not written to
  localStorage, so a manual expand is never silently persisted over.
- **Current model is unmistakable.** The selected row uses a brand-colour
  gradient, a 3 px accent bar and a bolder brand-coloured name instead of the
  faint 11 % tint it used before.

## 0.3.0 — 2026-11-12

### Added

- **余额显示设置页 / balance display setting tab.** `设置 → 插件 → 余额显示`
  registers its own `settings.plugins.tab` contribution. It never touches an API
  key: it only stores a console cookie and renders the usage that keys cannot
  read (plan name, used-percentage bar, period end). Only verified providers are
  listed — Qwen Token Plan today; providers whose cookie protocol is still being
  measured stay hidden rather than guessing.
- Host routes `GET /dsh-model-panel/settings.json` and
  `POST /dsh-model-panel/secret.json` (`{id, action:'save'|'clear', value}`), both
  loopback-only like the existing state route. The cookie is normalised before it
  is stored, written to the DSH credential store only, and never echoed back.
- `images/banner.png` — a 1200×300 raster twin of the SVG banner, so the registry
  page shows an image instead of a broken link. READMEs use `<picture>`: the SVG
  on GitHub, the PNG everywhere else.

### Fixed

- **MiMo / xiaomi-token-plan-cn now reads the console like the console does.**
  The balance moved to `https://platform.xiaomimimo.com/api/v1` with the console
  cookie (`XIAOMI_TOKEN_PLAN_CN_COOKIE`), calling `/balance`,
  `/tokenPlan/detail` and `/tokenPlan/usage`, and reading `pool.percent` as an
  **already-used** ratio. The API-key path stays as a fallback.
- **DeepSeek account balance no longer adds different currencies together.**
  Wallets are bucketed by `currency`; CNY wins, otherwise the first currency
  seen, and bonus wallets are reported separately instead of being folded into
  the same number.
- `is_available === false` on the DeepSeek platform balance now surfaces
  「余额不足，请充值」 as a note instead of rendering a misleading 0.
## 0.2.1 — 2026-11-12

### Fixed

- `package.json` `author` now reads `poloniumn`, matching the `LICENSE` copyright
  holder instead of the unrelated name `YG`.
- `files` now ships `assets/`, `images/` and `README_EN.md`. The banner and the
  screenshot that `README.md` links to were left out of the tarball, so both
  images would have 404'd on the registry page while looking fine on GitHub.
- `npm run check` also syntax-checks `test/run.mjs`; CI previously covered only
  the two plugin halves.
- README (both languages) no longer calls this a "plugin picker" in its tagline —
  it is a model panel. The closing note that was addressed to an assistant was
  replaced with plain screenshot conventions.
- Installation option B now registers the package under `dsh.profile.bundles`,
  which is the mechanism a profile actually reads, instead of telling people to
  hand-write an `insert` block into `cordis.patch.yml`.
- The 0.2.0 section below was dated 2026-11-11; that release shipped on
  2026-11-12.

## 0.2.0 — 2026-11-12

### Changed

- **余额数据完全自给 / balance is fully self-hosted.** The browser half now
  only calls `/dsh-model-panel/state.json`. It no longer reads
  `/dsh-balance/state.json` first, so `dsh-balance-display` is not part of the
  data path any more — every provider adapter ships in `lib/`.
- The `X 个模型` counter is now a fixed 72 px column at the end of each provider
  header, vertically centred in a 20 px cell and left-aligned inside it, so the
  counts line up down the panel instead of trailing each provider name.

### Added

- `test/run.mjs` (`npm test`): host helpers, browser-half contracts and
  release-hygiene checks, with no dependencies and no network.
- `LICENSE` (MIT), `.gitignore`, this changelog and a GitHub Actions workflow.

## 0.1.7 — 2026-11-12

### Fixed

- A channel with no configured account (`accounts: []`) still produces a row
  with a zero balance, so a provider shows `剩余 0` instead of hiding the fact.
- Channel name normalisation keeps CJK letters, so `Qoder 中国版` no longer
  collapses onto `Qoder` and the two providers stop stealing each other's
  channel.
- A channel whose badge call fails is drawn as `查询失败` instead of vanishing.

## 0.1.6 — 2026-11-11

### Added

- Provider groups follow the model directory order; when every group declares a
  numeric rank (`order` / `seq` / `index` / `position` / `rank`) that rank wins,
  and a partial rank list is ignored rather than half-applied.
- Providers fed by a third-party channel always sink to the bottom of the list.

## 0.1.5 — 2026-11-11

### Fixed

- The channel credit badge no longer collapses to `剩…`: it uses a pixel cap
  instead of a percentage of an auto-sized parent, and the provider name shrinks
  instead of squeezing the right-hand cluster.

## 0.1.4 — 2026-11-11

### Changed

- Channel credits are drawn as plain text in the provider header's right-hand
  info cluster, next to that provider's balance, instead of a separate section.

## 0.1.3 — 2026-11-11

### Changed

- The effort slider sits on one line: a fixed-width level name, the slider, and
  a reset slot that keeps the slider the same length with or without the button.

## 0.1.2 — 2026-11-11

### Added

- Third-party channel credits (the `dsh-connect` status document plus Our Free
  Model's EAC router), merged by channel name.

## 0.1.0 — 2026-11-10

### Added

- First release: replaces the composer model seat with a table-style panel —
  provider tree with remembered collapse, model search, per-model thinking
  toggle, effort slider, and live balance / plan rows per provider.
