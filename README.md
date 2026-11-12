> [**中文**] | [English](./README_EN.md)

<div align="center">

# dsh-model-panel

<picture>
  <source srcset="assets/banner.svg" type="image/svg+xml">
  <img src="images/banner.png" alt="dsh-model-panel" width="100%">
</picture>

[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-topic-0f172a?style=flat-square&logo=github)](https://github.com/topics/dsh-plugin)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.3.0-38bdf8?style=flat-square)](./package.json)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Web%20Plugin-6366f1?style=flat-square)](https://github.com/topics/dsh-plugin)

**优雅的模型选择面板** —— 把输入框的模型选择位，换成一张可搜索的服务商 / 模型表格。

</div>

## 功能特性

- **服务商分组树**：按 DSH 模型目录自身顺序排列，折叠状态记忆在 localStorage（`dsh-model-panel.collapsed`）；当所有分组都声明了数值排名（`order` / `seq` / `index` / `position` / `rank`）时按排名排序，部分排名会被忽略，列表永不错乱。
- **第三方渠道自动沉底**：由第三方渠道供能的服务商永远排在普通服务商之后。
- **即时搜索**：`Enter` 选中首个匹配项，方向键移动高亮。
- **逐模型思考开关与力度滑条**：同一行内固定宽度档位名、滑条与重置位，有无重置按钮滑条长度一致。
- **实时余额与套餐行**：显示在每个服务商表头右侧。
- **渠道积分同屏展示**：按渠道名合并去重，与余额、套餐并列显示。
- **余额显示设置页**：`设置 → 插件 → 余额显示` 单独成页，只保存浏览器 Cookie，用来显示 API 密钥读不到的用量（当前支持 Qwen Token Plan），不发起任何密钥请求。
- **数据自读，链路干净**：浏览器端只请求一个接口 `GET /dsh-model-panel/state.json`，凭据只发往各适配器自身声明的地址，接口仅限回环访问并带跨站校验，缓存 60 秒、失败不报错。

> ⚠️ 由于作者的订阅与购买能力有限，个别服务商（尤其是需要控制台 Cookie 的用量接口）的余额 / 用量数字仍可能存在 bug。遇到这类显示问题欢迎直接提交 PR 修掉，或开 issue 附上接口返回。

## 安装方法

本插件是 DSH Cordis Bundle（Web 插件），任选其一：

**方式一：插件管理器（推荐）**

1. 打开 Harness UI 的插件管理器：`plugin_manager → install_bundle`
2. `target` 填入本仓库目录的绝对路径
3. 首次安装可通过 HMR 直接激活；替换已安装副本需重启 Harness 加载新的 JS 模块代。

**方式二：手动写入 web profile**

1. 在 web profile 的 `package.json` 的 `dependencies` 中添加本包：

   ```json
   "dsh-model-panel": "file:C:/path/to/dsh-model-panel"
   ```

2. 在同一个 `package.json` 的 `dsh.profile.bundles` 数组里登记包名（bundle 自带的 patch 会随之展开，不需要手写 `cordis.patch.yml`）：

   ```json
   "dsh": {
     "profile": {
       "bundles": ["dsh-model-panel"]
     }
   }
   ```

3. 重启 Harness 后生效。

## 使用方法

安装后，输入框原有的模型选择位被替换为表格面板：

- **搜索**：直接输入文字过滤服务商与模型，`Enter` 选中第一个匹配项，↑/↓ 移动高亮。
- **折叠/展开**：点击服务商表头切换分组，状态自动记忆，下次打开保持一致。
- **思考开关**：每个模型行内可单独开关思考（`dsh-model-panel.off`）。
- **力度滑条**：调节 reasoning effort（`dsh-model-panel.efforts`），`重置` 恢复默认。
- **余额 / 套餐 / 渠道积分**：显示在服务商表头右侧；渠道未配置账号时显示「剩余 0」，查询失败时显示「查询失败」。

### 余额显示（Cookie 用量）

有些用量只存在于已登录的控制台，API 密钥读不到，于是单独开了一页：

1. 打开 `设置 → 插件 → 余额显示`。
2. 点「配置 Cookie」，把控制台请求头里的整段 Cookie（`name=value; name2=value2`）粘贴进去，点「保存并测试」。
3. 保存后立即回读用量：套餐名、已用百分比进度条、周期结束时间；Cookie 失效会直接提示重新粘贴。
4. 「清除」会把该 Cookie 从本机凭据库删掉。

Cookie 只写入本机 DSH 凭据库，不写入插件配置、日志或浏览器存储，也不会回显。当前只开放已验证的服务商（Qwen Token Plan）；其他服务商的 Cookie 协议尚在实测，未确认的不会出现在该页。

## 配置说明

| 项 | 说明 |
| --- | --- |
| 依赖服务 | `conversation.input.model` 模型位及各插槽（`dsh-client-ui-slots`、`dsh-client-locale`、`dsh-client-ui-model-selection`、`dsh-api-session-controller`），宿主需提供可注册精确路由的 `webServer` |
| 可选集成 | `dsh-connect`（WorkBuddy / Trae / Qoder 渠道积分）、Our Free Model（EAC 路由积分）——不安装不影响面板渲染 |
| 数据接口 | `GET /dsh-model-panel/state.json`，仅回环、带跨站校验、缓存 60 秒 |
| 设置页接口 | `GET /dsh-model-panel/settings.json`（已存 Cookie 与其解锁的用量）、`POST /dsh-model-panel/secret.json`（`{id, action:'save'|'clear', value}`），同样仅回环 |
| Cookie 凭据名 | `QWEN_TOKEN_PLAN_COOKIE`（Qwen Token Plan 控制台会话） |
| 本地存储 | `dsh-model-panel.collapsed`（折叠状态）、`dsh-model-panel.off`（思考开关）、`dsh-model-panel.efforts`（力度） |

**开发自检**：

```bash
npm run check   # 两个半端的 node --check
npm test        # test/run.mjs，无依赖、无网络
```

## 成果展示

<div align="center">

![模型面板主界面](images/panel-overview.png)

**表格面板主界面** — 搜索框 · 服务商分组树 · 余额/套餐/渠道积分 · 逐模型思考开关与力度滑条

</div>

| 界面元素 | 说明 |
| --- | --- |
| 顶部搜索框 | 实时过滤服务商与模型，Enter 选中首项 |
| 服务商表头 | 余额（¥9.75）、套餐进度（2%）、渠道积分与模型数同屏 |
| 模型行 | 思考开关 + 思考强度滑条（High 等档位）+ 一键重置 |

> 📷 截图统一放在 `images/` 目录，命名 `<场景>-<视图>.png`，浅色与深色主题各存一张。

## 许可证

MIT © poloniumn — 详见 [LICENSE](./LICENSE)。

---

欢迎通过 [dsh-plugin 话题](https://github.com/topics/dsh-plugin) 发现更多 DeepSeek Harness 插件。
