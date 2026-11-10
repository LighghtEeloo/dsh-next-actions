# 2026-11-09 发布前审计 — dsh-next-actions v0.1.0

四份独立审计的结论与证据索引。方法：只读源码 + 读取当前安装的 DSH 0.2.2-rc.1 asar +
隔离假 DSH_HOME 安装实测 + 真实会话日志/API 契约仿真。未重启 DSH、未修改真实 profile。

## 结论

| 领域 | 报告 | 结论 |
|---|---|---|
| Host 半 | [host/FINDINGS.md](host/FINDINGS.md) | **close**：实现成熟；2 个 P1（英文危险词表、描述/文档「永不发送」声明），其余 P2/P3。 |
| Client 半 | [client/FINDINGS.md](client/FINDINGS.md) | **not ready**：3 个发布阻断（Definition 空 state 崩溃、发布身份、Send 模式不一致）。 |
| 发布工程 | [release/FINDINGS.md](release/FINDINGS.md) | **not ready**：6 个 P0（身份/许可/engines/README/仓库流程/成本披露）；安装链路已实测通过。 |
| 市场/命名/许可 | [market/FINDINGS.md](market/FINDINGS.md) | **close**：微品类拥挤但差异化真实；P0 = 无许可/身份，P1 = 工具名冲突、命名混淆、公开 repo/上架路径。 |

综合：**功能已到 RC 水平，公开发布还差 P0**；建议先做 0.1.0-rc.1，而不是直接发正式版。
改进任务与验收命令见 [REMEDIATION-PLAN.md](REMEDIATION-PLAN.md)。

## 关键证据

- 181/181 tests；`build-client.mjs --check` 通过；npm pack = 40.5 kB / 10 files；fake DSH_HOME 安装/升级/卸载通过
  （[release/test-scripts/](release/test-scripts/)）。
- Host 真实代码仿真挂载 → 门控 → 装配 → 卸载/重载（[host/gather/](host/gather/)，S1–S9）。
- Client Definition 崩溃复现脚本（[client/evidence/def-harness.mjs](client/evidence/def-harness.mjs)）。
- 市场快照（2026-11-09）：awesome-dsh-plugin 列 9,714 个 repo、其中 4,985 个 npm 包；
  npm 上 `dsh-next-actions` 可用（404），相邻已存在 `dsh-nextsteps` / `dsh-next-steps` 等。
- 当前运行中的 app 仍加载旧版 Host（需重启加载本目录的最终文件），因此「最终构建实机验收」仍是未完成项。

> 备注：审计证据脚本按 2026-11-09 的审计环境原样保存，可能依赖当时的 `/tmp` 解包产物（asar 解包、semver 副本等），
> 不是可独立重复的测试套件。为避免 `node --test` 把审计脚本误收集为测试文件，
> `release/test-scripts/engines-preflight-test.mjs` 已更名为 `engines-preflight.mjs`（报告中的路径已同步）。

## 路径迁移说明

本目录由 workspace 的 `research/release-audit/<area>/` 整体迁入；报告正文里出现的
`research/release-audit/<area>/...` 即本目录下的 `<area>/...`。设计文档同理：原
`design/next-step-suggestions-*.md` 现在位于 [../../design/](../../design/)。
