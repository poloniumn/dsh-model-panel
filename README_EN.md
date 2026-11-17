> [中文](./README.md) | [**English**]

<div align="center">

# dsh-model-panel

<picture>
  <source srcset="assets/banner.svg" type="image/svg+xml">
  <img src="images/banner.png" alt="dsh-model-panel" width="100%">
</picture>

[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-topic-0f172a?style=flat-square&logo=github)](https://github.com/topics/dsh-plugin)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](./LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-model-panel?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/dsh-model-panel)
[![Version](https://img.shields.io/badge/version-0.7.4-38bdf8?style=flat-square)](./package.json)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Web%20Plugin-6366f1?style=flat-square)](https://github.com/topics/dsh-plugin)

**An elegant model panel** — it replaces the composer's model seat with a searchable provider / model table.

</div>

## Screenshots

<div align="center">

![Model panel main view](images/panel-overview.png)

**The table panel** — search box · provider tree · per-model discount chips (`0.5x` / `0.4x`) · balance / plan / channel credits · thinking toggle and effort slider · the subagent switch

</div>

| UI element | What it does |
| --- | --- |
| Search box | Filters providers and models live; Enter picks the first match |
| Provider header | Balance (`¥0.11`), plan progress (`96%`), and the OpenDesign wallet at `$1.00` with its 5-hour / Weekly windows on one line |
| Model row | Thinking toggle + effort slider (High etc.) + one-click reset |
| Discount chip | Drawn on model rows only (`0.5x` / `0.4x`); outside the window the row stays unmarked, and the header only turns green without a number |
| Last row | The per-session 启用子任务 switch; off means `subagent` / `subagent_oar` refuse in this session |

> 📷 Screenshots live in `images/`; the main view is `panel-overview.png`. When both a light and a dark shot are kept, name them `<scene>-<view>.png`.

## Features

- **Provider tree**: drawn in the model directory's own order, with collapse state remembered in localStorage (`dsh-model-panel.collapsed`). When every group declares a numeric rank (`order` / `seq` / `index` / `position` / `rank`) that rank is honoured; a partial rank list is ignored so the list is never half-reshuffled.
- **Third-party channels sink to the bottom**: a provider fed by a third-party channel is always drawn after the plain ones.
- **Focus on open**: with no saved fold state (first run) only the provider holding the current model is expanded and the rest start folded; after that your own expand/collapse choices are remembered, and opening the panel just re-opens the current model's provider. The selected row is highlighted with a brand-colour gradient.
- **Discount multiplier, matched per model (never per provider)**: while a low-price window is active the provider header turns soft green and shows **no multiplier at all** — one window can hold several different rates, so any single number in the header is wrong. The multiplier is drawn on the model rows only.
  - Match order: exact catalog id → folded key (lower-cased, separators stripped, 2–4 digit suffix removed) → display name from an older cache → folded prefix (`deepseek-v4.1-flash` vs `deepseek-v4.1-flash-1017`) → whole-group fallback when the group carries no model list. If two conflicting groups both match, nothing is drawn — missing beats wrong.
  - Each group carries its own window (`22:00 - 08:00` and the like); outside that window the row stays unmarked.
  - DeepSeek off-peak: `0.5x` (outside the weekday 12:00–14:00 and 18:00–20:00 peak windows).
  - Qwen Token Plan, 22:00–08:00 Beijing time: `0.4x` for the Qwen3.8 models and `0.5x` for the DeepSeek-V4 ones, with `Auto` in the 0.4 group. A catalog id that differs from the profile id (`DeepSeek-V4.1-Flash` vs `deepseek-v4.1-flash-1017`) still lands in the right group, and a model outside the night promotion — such as `qwen4-max-preview` with its limited-time 2 折 — stays uncoloured.
  - MiMo Token Plan, 00:00–08:00 daily: `0.8x` for the whole group.
- **Per-model thinking toggle & effort slider**: one line with a fixed-width level name, the slider, and a reset slot that keeps the slider the same length with or without the button.
- **Live balance & plan rows** in each provider's header.
- **Channel credits side by side**, merged by channel name.
- **A per-session subagent switch, on the last row of the dropdown**: the panel closes with an 启用子任务 row (on by default). Switching it off makes the host's delegation tools (`subagent`, `subagent_oar`) refuse inside this session and every child of it; the decision is keyed by the root session, so a child cannot overrule its parent, and it lives in `subagent-gate.json` in the host cache directory rather than in the session log. The gate is installed through `tools.guard` and fails open — an unreadable store, a missing agent, or any non-delegation tool passes untouched.
- **Balance settings tab**: `Settings → Plugins → Balance display` is its own page. It stores the credentials that API keys cannot replace:
  - Qwen Token Plan: the console cookie (flow unchanged).
  - OpenDesign: a **control key** (`vela_ctrl_…`, required), a workspace id (optional, filled in automatically when the control key is saved) and a console cookie (optional fallback). OpenDesign's runtime key (`sk-amr-…`) can only call models — measured: `/api/v1/wallet/balance` and friends all answer 401, and `/v1/chat/completions` carries no quota header.
- **Self-read data path**: the browser half requests exactly one endpoint, `GET /dsh-model-panel/state.json`; credentials only ever go to the URL each adapter declares, the route is loopback-only with cross-site checks, cached for 60 s, and never rejects. **The first paint never waits for the network**: the panel draws the previous answer immediately (browser `localStorage` plus the host's `last-state.json`) and, when the host replies `stale: true`, asks again 700 ms later for the fresh numbers — a cold start no longer sits on an empty card for the whole provider sweep.

> ⚠️ The author can only subscribe to a limited set of providers. Balance / usage figures for some of them — console-cookie endpoints in particular — may still be wrong. If you hit a display bug like that, a PR is very welcome, or open an issue with the raw response.

## Installation

This package is a DSH Cordis bundle (Web plugin). Either path works:

**Option A — npm (recommended)**

1. Inside the web profile directory:

   ```bash
   npm install dsh-model-panel
   ```

   (Package page: [npmjs.com/package/dsh-model-panel](https://www.npmjs.com/package/dsh-model-panel))

2. Register the bundle in that profile's `package.json`:

   ```json
   "dsh": { "profile": { "bundles": ["dsh-model-panel"] } }
   ```

3. Restart the Harness. To upgrade later: `npm update dsh-model-panel`, then restart.

**Option B — Plugin Manager**

1. Open `plugin_manager → install_bundle` in the Harness UI.
2. Set `target` to the absolute path of this repository directory.
3. A first install can activate through HMR; replacing an already installed copy needs a Harness restart to load a fresh JavaScript module generation.

**Option C — Write it into the web profile manually**

1. Add the package to the web profile's `package.json` under `dependencies`:

   ```json
   "dsh-model-panel": "file:C:/path/to/dsh-model-panel"
   ```

2. Register the package name in that same `package.json` under `dsh.profile.bundles` — the bundle's own patch is expanded from there, so no hand-written `cordis.patch.yml` entry is needed:

   ```json
   "dsh": {
     "profile": {
       "bundles": ["dsh-model-panel"]
     }
   }
   ```

3. Restart the Harness to activate it.

## Usage

Once installed, the composer's original model seat is replaced by the table panel:

- **Search**: type to filter providers and models; `Enter` selects the first match, ↑/↓ moves the highlight.
- **Collapse / expand**: click a provider header; the state is remembered between sessions.
- **Thinking toggle**: enable or disable thinking per model (`dsh-model-panel.off`).
- **Effort slider**: adjust reasoning effort (`dsh-model-panel.efforts`); the reset slot restores the default.
- **Balance / plan / channel credits** appear in the provider header's right cluster; a channel with no configured account shows a zero balance, and a failed lookup shows a query failure instead of hiding the row.

### Balance display (extra credentials)

Some usage only exists behind a logged-in console or behind a control key, and API keys cannot read it, so it gets a page of its own. Every row is the same loop — open it, paste, **Save and test**, and the usage is read back at once (plan name, progress bar, period end). An expired credential says so and asks for a new one; **Clear** removes it from the local credential store.

| Provider | Credential | Required | What it reads |
| --- | --- | --- | --- |
| Qwen Token Plan | console cookie: paste the header, or the whole Cookie-Editor *Export As: JSON* text | yes | plan tier, monthly usage percentage, period end |
| MiMo Token Plan | the same paste, identical wording | yes | wallet balance, plan total and month-to-date usage, period end |
| OpenDesign | control key `vela_ctrl_…` (the panel can mint one via "Sign in with a browser") | yes | wallet balance in USD, the Coding Plan 5-hour and 7-day windows — read on this row itself, together with the workspace id and cookie beside it |
| OpenDesign | workspace id | no | omitted, it is discovered from `/api/v1/workspaces/current`; a control key save fills it in |
| OpenDesign | console cookie | no | fallback authentication when there is no control key |

OpenDesign's **runtime key** (`sk-amr-…`, the one used for inference) cannot read any allowance: `amr-api.open-design.ai/api/v1/wallet/balance`, `billing/summary` and `workspaces/current` all answer 401, and the model endpoint `amr-link.open-design.ai/v1/chat/completions` sends no quota header. A control key is therefore stored separately from the inference key.

**You do not have to hunt for the control key in a web page.** It is minted by the CLI device-authorization flow (`vela login`): the row in the panel has a "Sign in with a browser" button, the plugin asks `amr-api.open-design.ai/api/v1/cli/device-authorizations` for a 6-character code, opens `open-design.ai/cloud/cli/activate`, and polls every 2 seconds while you type the code and approve. The moment it is approved the control key lands in the local credential store and the workspace id is filled in too. The code expires after 120 seconds — "Restart" issues a new one, and closing the page mid-approval is harmless: the next poll still collects the key. Pasting the control key by hand keeps working.

**You do not have to copy cookies by hand, and there is no file to export.** Press *Export As: JSON* in Cookie-Editor and paste the whole JSON straight into the box (a plain `name=value; name2=value2` header still works too). On save it becomes a request header: a native JSON array, a `{"cookies":[…]}` / `{"data":[…]}` wrapper, a Netscape `cookies.txt` (including the `#HttpOnly_` prefix) and a plain `{name: value}` map are all understood.

Cookies whose `domain` sits under the provider's own suffixes are preferred (Qwen: `qianwenai.com` / `aliyun.com` / `aliyuncs.com`; MiMo: `xiaomimimo.com` / `mi.com`; OpenDesign: `open-design.ai`); when none matches, the whole paste is used — a few extra cookies are harmless, an empty header is not. Empty values, expired ones (`expirationDate` in the past and not a session cookie) and values holding `;` or a newline are dropped, and a duplicate name keeps the last occurrence. The save reports how many cookies went in, plus how many were filtered out.

Every cookie-based module follows the same rule: the Qwen Token Plan, the MiMo Token Plan and OpenDesign's fallback console cookie all take one pasted export.

Credentials go to the local DSH credential store only — never to the plugin config, logs or browser storage, and they are never echoed back. A protocol that has not been measured stays off this page.

## Configuration

| Item | Details |
| --- | --- |
| Requirements | the `conversation.input.model` seat and its slots (`dsh-client-ui-slots`, `dsh-client-locale`, `dsh-client-ui-model-selection`, `dsh-api-session-controller`); the host must expose a `webServer` able to register an exact route |
| Optional integrations | `dsh-connect` (WorkBuddy / Trae / Qoder channel credits), Our Free Model (EAC router credits) — neither is required; a missing source contributes nothing |
| Data endpoint | `GET /dsh-model-panel/state.json` — loopback-only, cross-site checked, 60 s cache |
| Settings endpoints | `GET /dsh-model-panel/settings.json` (stored credentials and the usage they unlock), `POST /dsh-model-panel/secret.json` (`{id, ref, action:'save'|'clear', value}`; `ref` is resolved from `id` when omitted) — loopback-only as well |
| Secret names | `QWEN_TOKEN_PLAN_COOKIE` (Qwen console session), `OPENDESIGN_CONTROL_KEY` (control key), `OPENDESIGN_WORKSPACE_ID` (workspace), `OPENDESIGN_CONSOLE_COOKIE` (console cookie) |
| Local storage | `dsh-model-panel.collapsed` (collapse state), `dsh-model-panel.off` (thinking toggle), `dsh-model-panel.efforts` (effort level) |
| Client layout | `client.js` is the entry and loads four chunks on demand: `client.shared.js` (dictionary / storage / formatting / controls), `client.panel.js` (the model panel), `client.settings.js` (settings tab and seat boundary), `client.css.js` (styles). Styles are mounted into `<head>` once, so they never take part in per-render vdom diffs |

**Development self-checks**:

```bash
npm run check   # node --check on the host half plus the entry and its four chunks
npm test        # test/run.mjs — no dependencies, no network
```

## License

MIT © poloniumn — see [LICENSE](./LICENSE).

---

Discover more DeepSeek Harness plugins through the [dsh-plugin topic](https://github.com/topics/dsh-plugin).
