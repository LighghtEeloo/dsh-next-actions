# dsh-next-actions

> Suggested next steps under DeepSeek Harness replies — clicking a suggestion fills the input, not sends.
> 一个 DSH Web/Desktop 插件：在完成的回复下方显示「下一步建议」卡片，点击只把指令填入输入框。

**状态：v0.1.0，本地开发/试用中，尚未公开发布。** 发布前阻断项与改进顺序见
[`docs/audit/2026-11-09/REMEDIATION-PLAN.md`](docs/audit/2026-11-09/REMEDIATION-PLAN.md)。
本 README 为仓库整理版；面向插件市场的正式 README（EN+zh、截图、成本披露、许可）属于审计 P0-4。

## 功能

- 回复结束后的「下一步建议」卡片：1–2 句上下文 + 可点击建议（默认展示 3 条，其余收进「还有 N 条」；设置可改 1–6 或 Auto）。
- 点击建议 = 只填入输入框，永不自动发送；「已填入」标记按当前草稿重新派生，编辑/清空/刷新后不误报。
- 布局：预览默认收起、悬停/聚焦时显示「将填入」；每个 chip 最多一个内联标记（推荐 / 已填入 / ⚠需确认）；
  忽略/恢复为带文字的 ghost 按钮；草稿冲突显示「将填入」与「当前草稿」对比，追加为主操作且只填入不发送。
- 建议由模型在同一次收尾调用里给出（无额外模型调用）；常驻根 agent 提示段保证 compact / 重启后仍会触发。
- 危险动作：模型标记 + 本地中英词表升级为「需确认」；危险建议只填入、永不自动发送。
- 官方动作卡同款外观 + 工具过程组一行式记录。
- 子代理会话不注册工具、不显示卡片；Host `enabled:false` 时 0 常驻 token。
- 兼容 PTC（programmatic tool calling / `run_code`）会话：工具作为 PTC SDK binding 调用，客户端从 `tool/ptc-dispatch` 的 meta 折叠出同一张卡片，与 native `tool/result.meta` 共用展示契约。

## 安装与开发

本地开发安装（当前 desktop profile 以 `link:` 方式装入本目录）：

- 通过 `plugin_manager` 的 `install_bundle` 安装本目录的绝对路径；
- 卸载用 `remove_bundle`；Host/Client 改动后需重启 DSH（Client 需刷新页面）。

开发命令（Node ≥ 20）：

```sh
node --test                          # 207 tests
node scripts/build-client.mjs        # 从 src/ + lib/view-model.js 重建 client.js
node scripts/build-client.mjs --check
```

## 仓库结构

```text
.
├── index.js                 Host 半：suggest_next_steps 工具 + 根 agent 提示段 + enabled 门控
├── client.js                构建产物：单文件 Web client bundle（勿手改）
├── src/                     client bundle 源码（client.js 模板 + styles）
├── lib/normalize.js         Host 纯逻辑（参数规范化 / meta）
├── lib/view-model.js        Client 纯逻辑（数据折叠 / 展示 / 草稿冲突 / 设置）
├── test/                    node --test 单测（Host、client 纯逻辑、Definition、build）
├── cordis.patch.yml         插件行 patch（enabled 配置）
├── locale/                  插件管理器显示文案（en/zh）
├── scripts/build-client.mjs 零依赖构建
├── docs/
│   ├── design/              产品形态稿 + 技术方案（历史设计）
│   └── audit/2026-11-09/    发布前审计报告 + 改进计划
├── DEVELOPMENT.md           原开发日志（历史记录，非用户文档）
└── README.md                本文件
```

## 文档

- 产品形态：[docs/design/next-step-suggestions-prd.md](docs/design/next-step-suggestions-prd.md)
- 技术方案：[docs/design/next-step-suggestions-tech.md](docs/design/next-step-suggestions-tech.md)
- 2026-11-09 发布审计：[docs/audit/2026-11-09/README.md](docs/audit/2026-11-09/README.md)
- 按审计改进的计划：[docs/audit/2026-11-09/REMEDIATION-PLAN.md](docs/audit/2026-11-09/REMEDIATION-PLAN.md)
- 开发日志：[DEVELOPMENT.md](DEVELOPMENT.md)

## 兼容性与许可

- 实测环境：DSH Desktop `0.2.2-rc.1`（Web/Desktop UI；CLI/headless 不显示卡片）。
- PTC 预设（`agent-preset-registry.selectedDefault: ptc`）数据链路已实测：`suggest_next_steps` 作为 `run_code` 生成的 SDK binding 调用，`tool/ptc-dispatch.meta` 能折叠出与 native 相同的 turn data（2026-11-10 用真实 PTC 会话日志重放确认）；卡片渲染复用 native 同一路径，改后需刷新页面复验 GUI。PTC 下嵌套调用结果不进入模型上下文（模型只看到 `run_code` 外层结果），不影响卡片与过程行。
- 尚未声明 `engines.dsh` / `dsh.manifestVersion`（审计 P0-3）。
- 许可证未定；当前 `package.json` 无 `license` 字段。审计建议 MIT + `THIRD_PARTY_NOTICES`
  （卡片外观抄自 MIT 许可的 DSH 官方动作卡）。在许可证确定前，默认保留所有权利。
- 非 DeepSeek 官方插件；未使用 DeepSeek 商标/标识。
