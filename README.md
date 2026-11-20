> [**中文**] | [English](./README_EN.md)

<div align="center">

# dsh-model-panel

<picture>
  <source srcset="assets/banner.svg" type="image/svg+xml">
  <img src="images/banner.png" alt="dsh-model-panel" width="100%">
</picture>

[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-topic-0f172a?style=flat-square&logo=github)](https://github.com/topics/dsh-plugin)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](./LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-model-panel?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/dsh-model-panel)
[![npm downloads](https://img.shields.io/npm/dm/dsh-model-panel?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/dsh-model-panel)
[![Version](https://img.shields.io/badge/version-0.7.7-38bdf8?style=flat-square)](./package.json)
[![listed on dsh-market](https://img.shields.io/badge/market-listed-22c55e?style=flat-square&logo=github)](https://awesome-dsh-plugin.com/p/poloniumn/dsh-model-panel/)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Web%20Plugin-6366f1?style=flat-square)](https://github.com/topics/dsh-plugin)

**优雅的模型选择面板** —— 把输入框的模型选择位，换成一张可搜索的服务商 / 模型表格。

npm `0.7.7` 已发布 · 已收录 DeepSeek Harness 插件市场 · `dsh plugin --profile web add dsh-model-panel`

</div>

## 成果展示

<div align="center">

![模型面板主界面](images/panel-overview.png)

**表格面板主界面** — 搜索框 · 服务商分组树 · 逐模型折扣倍率（`0.5x` / `0.4x`）· 余额 / 套餐 / 渠道积分 · 思考开关与力度滑条 · 启用子任务开关

</div>

| 界面元素 | 说明 |
| --- | --- |
| 顶部搜索框 | 实时过滤服务商与模型，Enter 选中首项 |
| 服务商表头 | 余额（`¥0.11`）、套餐进度（`96%`）、OpenDesign 的 `$1.00` 与 5-hour / Weekly 双窗口同屏；按住 Ctrl（Mac 上 ⌘）时服务商名变成带下划线的链接，单击即在默认浏览器打开该服务商的控制台 |
| 模型行 | 思考开关 + 思考强度滑条（High 等档位）+ 一键重置 |
| 折扣倍率 chip | 只标在模型行（`0.5x` / `0.4x`），不在低价时段内则该行不显示；表头只变浅绿、不写倍率 |
| 面板末行 | 本会话「启用子任务」开关，关掉即拒绝 `subagent` / `subagent_oar` |

> **关于各服务商的余额显示**：作者订阅的服务商有限，无法逐一实测每一家的余额与用量接口，部分服务商（尤其是新接入或近期改过接口的）可能出现余额、套餐进度、渠道积分显示不准、缺项甚至完全不显示的情况，这属于正常。发现数字对不上时，欢迎直接提 [Issue](https://github.com/poloniumn/dsh-model-panel/issues) 或 PR —— 附上脱敏后的请求地址与响应字段，通常补齐一两个取值路径就能修好。 控制台链接本身是逐条实测过的：按住 Ctrl 打开的地址在 2026-11-20 全部返回 200（登录页跳转属正常），失效的七条已改成各家真实控制台路径。

## 功能特性

- **服务商分组树**：按 DSH 模型目录自身顺序排列，第三方渠道供能的服务商永远排在最后；折叠状态记在 localStorage（`dsh-model-panel.collapsed`），没有折叠记忆时只展开当前模型所在的组，当前模型行用品牌色渐变高亮。
- **即时搜索**：边输入边过滤服务商与模型，`Enter` 选中首个匹配项，↑/↓ 移动高亮。
- **折扣倍率只标在模型行**：处于低价时段时服务商表头变浅绿（**不写倍率数字**，同一时段各档不同），倍率按模型精确匹配——目录 id → 折叠键 → 显示名 → 折叠前缀，命中多个互斥档位则不显示。DeepSeek 空闲时段 `0.5x`（工作日 12:00–14:00 / 18:00–20:00 之外）；Qwen Token Plan 每晚 22:00–08:00 是 Qwen3.8 系列 `0.4x`、DeepSeek-V4 系列 `0.5x`；小米 Token Plan 每日 00:00–08:00 整组 `0.8x`。
- **逐模型思考开关与力度滑条**：同一行内固定宽度档位名、滑条与重置位。
- **余额、套餐与渠道积分同屏**：显示在每个服务商表头右侧，渠道积分按渠道名合并去重。
- **启用子任务开关（下拉框最底一行）**：默认开启；关掉后宿主的 `subagent` / `subagent_oar` 在本会话及其所有子会话中直接拒绝，状态记在根会话上并存在缓存目录的 `subagent-gate.json`，门禁 fail-open（读不到存储、没有 agent、非委派工具一律放行）。
- **余额显示设置页**：`设置 → 插件 → 余额显示` 单独成页，保存 API 密钥读不到的用量凭据（Qwen / MiMo 的控制台 Cookie；OpenDesign 的控制键 `vela_ctrl_…`，可选工作区 ID 与备选 Cookie）。
- **数据自读，链路干净**：浏览器端只请求 `GET /dsh-model-panel/state.json`，凭据只发往适配器自身声明的地址，仅限回环并带跨站校验，缓存 60 秒、失败不报错；**首屏不等网络**——先用上次结果（`localStorage` + 宿主 `last-state.json`）画出折扣与额度，回 `stale: true` 时 700 ms 后再取真数。

## 安装方法

已在 npm 与插件市场上架，任选一种：

| 渠道 | 地址 |
| --- | --- |
| npm | `dsh-model-panel`（最新 `0.7.7`）— <https://www.npmjs.com/package/dsh-model-panel> |
| 插件市场页 | <https://awesome-dsh-plugin.com/p/poloniumn/dsh-model-panel/> |
| 市场索引 | `https://awesome-dsh-plugin.com/index.json`（镜像 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`） |

**方式一：插件市场 / 命令行（推荐）**

1. 在 Harness UI 的插件页搜索 `dsh-model-panel`，或直接执行：

   ```bash
   dsh plugin --profile web add dsh-model-panel
   ```

2. 重启 `dsh web`。

列表由 `awesome-dsh-plugin.com/plugins.json` 驱动，`dshmarket` 每次打开都会向源站校验一次；仓库合并后最迟一个 nightly 周期（约三小时）内可见。

> 官方宿主的「插件 → 发现」默认不带索引源。要在那里看到本插件，先 `管理索引源 → 添加` 一条 `https://awesome-dsh-plugin.com/index.json`。

**方式二：npm 安装**

1. 在 web profile 目录执行：

   ```bash
   npm install dsh-model-panel
   ```

2. 在该 profile 的 `package.json` 里登记 bundle：

   ```json
   "dsh": { "profile": { "bundles": ["dsh-model-panel"] } }
   ```

3. 重启 Harness 后生效；升级只需 `npm update dsh-model-panel` 再重启。

**方式三：插件管理器（本地目录）**

1. 打开 Harness UI 的插件管理器：`plugin_manager → install_bundle`
2. `target` 填入本仓库目录的绝对路径（或在 web profile 的 `dependencies` 里写 `"dsh-model-panel": "file:C:/path/to/dsh-model-panel"`）
3. 首次安装可通过 HMR 直接激活；替换已安装副本需重启 Harness 加载新的 JS 模块代。

## 使用方法

安装后，输入框原有的模型选择位被替换为表格面板：

- **搜索**：直接输入文字过滤服务商与模型，`Enter` 选中第一个匹配项，↑/↓ 移动高亮。
- **折叠/展开**：点击服务商表头切换分组，状态自动记忆，下次打开保持一致。
- **思考开关**：每个模型行内可单独开关思考（`dsh-model-panel.off`）。
- **力度滑条**：调节 reasoning effort（`dsh-model-panel.efforts`），`重置` 恢复默认。
- **余额 / 套餐 / 渠道积分**：显示在服务商表头右侧；渠道未配置账号时显示「剩余 0」，查询失败时显示「查询失败」。

### 余额显示（额外凭据）

有些用量只存在于已登录的控制台或需要控制键，API 密钥读不到，于是单独开了一页：每一行都是「点开 → 粘贴 → 保存并测试 → 立即回读」，失效会提示重新粘贴，「清除」从本机凭据库删掉。页面顶部常驻两段说明——第一段讲怎么粘（推荐装 Cookie-Editor 这类浏览器扩展，在控制台直接「Export As: JSON」整段粘进来，不必手工按 F12 去找 Cookie），第二段讲效果边界：作者订阅的服务商有限，某家的余额、套餐进度或渠道积分显示不准、缺项甚至完全不显示都属于正常，遇到就提 Issue 或 PR。OpenDesign 的运行时密钥（`sk-amr-…`）只能调用模型，它的 `/api/v1/wallet/balance` 等接口全部 401，所以必须单独配控制键；控制键不用去网页找——点那一栏的「浏览器登录」，插件向 `cli/device-authorizations` 申请 6 位码并自动打开 `open-design.ai/cloud/cli/activate`，批准后当场写入凭据库并回填工作区 ID（120 秒过期，可重新发起）。

所有 Cookie 走同一套粘贴口径：直接粘 `name=value; …`，或粘 Cookie-Editor「Export As: JSON」的整段内容（原生数组、`{"cookies":[…]}` / `{"data":[…]}` 包裹、Netscape `cookies.txt`、纯 `{name: value}` 映射都认）。`domain` 落在该服务商域名后缀下的优先，一条都对不上时整段照用；空值、超期与含 `;` / 换行的值会被丢掉。凭据只写入本机 DSH 凭据库，不落插件配置、日志或浏览器存储，也不回显。

| 服务商 | 凭据 | 必填 | 读到的内容 |
| --- | --- | --- | --- |
| Qwen Token Plan | 控制台 Cookie：直接粘贴 Cookie 头，或 Cookie-Editor「Export As: JSON」的整段内容 | 是 | 套餐档位、月度用量百分比、周期结束时间 |
| MiMo Token Plan | 同上（粘贴口径完全一致） | 是 | 钱包余额、计划总量 / 本月用量、周期结束时间 |
| OpenDesign | 控制键 `vela_ctrl_…`（在设置页点「浏览器登录」自动获取） | 二选一 | 钱包余额（USD）、Coding Plan 的 5 小时 / 7 天窗口用量 |
| OpenDesign | 工作区 ID | 不用填 | 保存控制键时自动回填（`/api/v1/workspaces/current`）；也可手动指定 |
| OpenDesign | 控制台 Cookie | 二选一 | 与控制键等效：拿不到控制键时用控制台会话顶替 |

## 配置说明

| 项 | 说明 |
| --- | --- |
| 依赖服务 | `conversation.input.model` 模型位及各插槽（`dsh-client-ui-slots`、`dsh-client-locale`、`dsh-client-ui-model-selection`、`dsh-api-session-controller`），宿主需提供可注册精确路由的 `webServer` |
| 可选集成 | `dsh-connect`（WorkBuddy / Trae / Qoder 渠道积分）、Our Free Model（EAC 路由积分）——不安装不影响面板渲染 |
| 数据接口 | `GET /dsh-model-panel/state.json`，仅回环、带跨站校验、缓存 60 秒 |
| 设置页接口 | `GET /dsh-model-panel/settings.json`（已存凭据与其解锁的用量）、`POST /dsh-model-panel/secret.json`（`{id, ref, action:'save'|'clear', value}`；`ref` 省略时按 `id` 定位），同样仅回环 |
| 凭据名 | `QWEN_TOKEN_PLAN_COOKIE`（Qwen 控制台会话）、`OPENDESIGN_CONTROL_KEY`（控制键）、`OPENDESIGN_WORKSPACE_ID`（工作区）、`OPENDESIGN_CONSOLE_COOKIE`（控制台 Cookie） |
| 本地存储 | `dsh-model-panel.collapsed`（折叠状态）、`dsh-model-panel.off`（思考开关）、`dsh-model-panel.efforts`（力度） |
| 客户端结构 | `client.js` 是入口，按需加载四个 chunk：`client.shared.js`（词典 / 存储 / 格式化 / 控件）、`client.panel.js`（模型面板）、`client.settings.js`（设置页与座位降级边界）、`client.css.js`（样式）。样式由入口一次性挂到 `<head>`，不参与每次渲染的 vdom 比对 |

**开发自检**：

```bash
npm run check   # 宿主半端 + 入口与四个 chunk 的 node --check
npm test        # test/run.mjs，无依赖、无网络
```

## 许可证

MIT © poloniumn — 详见 [LICENSE](./LICENSE)。

---

欢迎通过 [dsh-plugin 话题](https://github.com/topics/dsh-plugin) 发现更多 DeepSeek Harness 插件。
