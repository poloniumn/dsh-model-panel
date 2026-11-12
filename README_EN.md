> [中文](./README.md) | [**English**]

<div align="center">

# dsh-model-panel

![banner](assets/banner.svg)

[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-topic-0f172a?style=flat-square&logo=github)](https://github.com/topics/dsh-plugin)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-38bdf8?style=flat-square)](./package.json)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Web%20Plugin-6366f1?style=flat-square)](https://github.com/topics/dsh-plugin)

**An elegant dialog-based plugin picker** — it replaces the composer's model seat with a searchable provider/model table.

</div>

## Features

- **Provider tree**: drawn in the model directory's own order, with collapse state remembered in localStorage (`dsh-model-panel.collapsed`). When every group declares a numeric rank (`order` / `seq` / `index` / `position` / `rank`) that rank is honoured; a partial rank list is ignored so the list is never half-reshuffled.
- **Third-party channels sink to the bottom**: a provider fed by a third-party channel is always drawn after the plain ones.
- **Instant search**: `Enter` picks the first match, arrow keys move the highlight.
- **Per-model thinking toggle & effort slider**: one line with a fixed-width level name, the slider, and a reset slot that keeps the slider the same length with or without the button.
- **Live balance & plan rows** in each provider's header.
- **Channel credits side by side**, merged by channel name.
- **Self-read data path**: the browser half requests exactly one endpoint, `GET /dsh-model-panel/state.json`; credentials only ever go to the URL each adapter declares, the route is loopback-only with cross-site checks, cached for 60 s, and never rejects.

## Installation

This package is a DSH Cordis bundle (Web plugin). Either path works:

**Option A — Plugin Manager (recommended)**

1. Open `plugin_manager → install_bundle` in the Harness UI.
2. Set `target` to the absolute path of this repository directory.
3. A first install can activate through HMR; replacing an already installed copy needs a Harness restart to load a fresh JavaScript module generation.

**Option B — Write it into the web profile manually**

1. Add the package to the web profile's `package.json` under `dependencies`:

   ```json
   "dsh-model-panel": "file:C:/path/to/dsh-model-panel"
   ```

2. Add the entry to the `insert` list of `cordis.patch.yml` (shipped with this plugin):

   ```yaml
   - insert:
       - id: dsh-model-panel
         name: dsh-model-panel
   ```

3. Restart the Harness to activate it.

## Usage

Once installed, the composer's original model seat is replaced by the table panel:

- **Search**: type to filter providers and models; `Enter` selects the first match, ↑/↓ moves the highlight.
- **Collapse / expand**: click a provider header; the state is remembered between sessions.
- **Thinking toggle**: enable or disable thinking per model (`dsh-model-panel.off`).
- **Effort slider**: adjust reasoning effort (`dsh-model-panel.efforts`); the reset slot restores the default.
- **Balance / plan / channel credits** appear in the provider header's right cluster; a channel with no configured account shows a zero balance, and a failed lookup shows a query failure instead of hiding the row.

## Configuration

| Item | Details |
| --- | --- |
| Requirements | the `conversation.input.model` seat and its slots (`dsh-client-ui-slots`, `dsh-client-locale`, `dsh-client-ui-model-selection`, `dsh-api-session-controller`); the host must expose a `webServer` able to register an exact route |
| Optional integrations | `dsh-connect` (WorkBuddy / Trae / Qoder channel credits), Our Free Model (EAC router credits) — neither is required; a missing source contributes nothing |
| Data endpoint | `GET /dsh-model-panel/state.json` — loopback-only, cross-site checked, 60 s cache |
| Local storage | `dsh-model-panel.collapsed` (collapse state), `dsh-model-panel.off` (thinking toggle), `dsh-model-panel.efforts` (effort level) |

**Development self-checks**:

```bash
npm run check   # node --check on both halves
npm test        # test/run.mjs — no dependencies, no network
```

## Screenshots

<div align="center">

![Model panel main view](images/panel-overview.png)

**The table panel** — search box · provider tree · balance / plan / channel credits · per-model thinking toggle and effort slider

</div>

| UI element | What it does |
| --- | --- |
| Search box | Filters providers and models live; Enter picks the first match |
| Provider header | Balance (¥9.75), plan progress (2%), channel credits and model count on one line |
| Model row | Thinking toggle + effort slider (High etc.) + one-click reset |

> 📷 Drop more screenshots into `images/` and I will extend this grid.

## License

MIT © poloniumn — see [LICENSE](./LICENSE).

---

Discover more DeepSeek Harness plugins through the [dsh-plugin topic](https://github.com/topics/dsh-plugin).
