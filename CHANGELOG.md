# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.0 — 2026-11-11

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
