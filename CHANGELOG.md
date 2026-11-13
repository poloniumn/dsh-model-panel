# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
