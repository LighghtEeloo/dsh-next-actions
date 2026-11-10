# 按审计改进的发布计划 — dsh-next-actions v0.1.0

> 目标：从当前「本地 link 安装、未公开发布」状态 → 可公开发布的 `0.1.0-rc.1` → 稳定 `0.1.0`。
> 依据：2026-11-09 四份审计报告（[host](host/FINDINGS.md) / [client](client/FINDINGS.md) /
> [release](release/FINDINGS.md) / [market](market/FINDINGS.md)）。
> 本文件只整理任务，不代表下列代码项已完成。

## 现状（2026-11-09）

- 质量基线：`node --test` 181/181；`node scripts/build-client.mjs --check` 通过；bundle 单文件、
  只 require `react`；Host 零 I/O/网络。
- 安装链路：`npm pack` 40.5 kB / 10 files；假 `DSH_HOME` 中 add / remove / 0.1.0→0.1.1 升级通过。
- 当前 desktop profile 仍是 `link:` 安装；运行中的 app 加载的是旧版 Host（重启后才会加载当前文件）。
- 未发布 npm、未提交社区索引；原技术稿 §1.2 的「不发布」范围决定已随本次发布计划失效，文档需同步。

## 用户决策项（阻塞后续改动，先定）

1. **最终包名**：建议 `dsh-next-actions`（npm registry 当前 404 可用）；备选 `dsh-safe-next-steps` /
   `dsh-next-step-card`。不使用 `dsh-next-steps`（已有同名/近义插件）。
2. **工具名**：已上架的 `dsh-next-steps` 也注册 `suggest_next_steps`，DSH 对重名工具会抛错；
   建议改为 `suggest_next_actions`，并同步常驻提示 section id / toolview key / 测试 / 文档。
3. **许可证**：建议 MIT（与 DSH 一致）；需要为自己代码加 `LICENSE`，并为抄自 MIT 官方卡的
   markup/CSS 加 `THIRD_PARTY_NOTICES`（DeepSeek MIT 版权+许可全文）。
4. **Send 模式去留**：保留（修复状态优先级与所有文案）或删除（回到「永不 submit」的不变量）。
5. **发布节奏**：先 `0.1.0-rc.1 --tag next`，还是等 DSH 0.2.2 稳定版再首次发布。

## P0-a 代码必修（估算 1–2 天）

- [ ] **B1 — Conversation Definition 空 state 崩溃**：`src/client.js` 的 `buildLocationData` 增加
      `context.state === undefined || context.state === null` 守卫；`test/definition.test.mjs` 增加
      start-less context 用例。证据：[client/FINDINGS.md](client/FINDINGS.md) §B1。
- [ ] **危险识别与安全承诺一致性**：扩充英文 `RISK_LEXICON`（`lib/normalize.js:36-50`）到中文词表
      parity（rm -r/-fr、git reset --hard、git clean -fd、delete/remove/reset/overwrite/wipe/kill/
      shutdown/permission/paid/billing/rollback/migrate/uninstall 等），并同步 `lib/view-model.js` 的
      客户端兜底副本；增加 Host/Client parity 测试 + 正负样本词表测试。
      证据：[host/FINDINGS.md](host/FINDINGS.md) P1-1。若保留 Send 模式，修 `status.sent` 不可达
      （`src/client.js:429-437`）并手动验证 setDraft→submit。
- [ ] **文案一致性**：`index.js` 工具描述「clicking fills the input」、README/技术稿「never sends /
      无 submit 路径」在 Send 模式下不成立；按最终决定改写 `index.js:32`、README（现 DEVELOPMENT.md）、
      tech §9。证据：[host/FINDINGS.md](host/FINDINGS.md) P1-2、[client/FINDINGS.md](client/FINDINGS.md) B3。
- [ ] 补测试：Definition 空 state、英文危险动作 battery、Host/Client 规则 parity、Send 状态优先级。
- [ ] P2 顺手项（可选）：`when` 条件改 `(context) => isRootAgent(ctx, context?.agent)`；`when` fail-open
      加 warn 日志；section 加 tool 可见性 scope check；修正 token 数字口径（实测 v4 声明 1,435 字符
      ≈501 tok PTC / ≈465 native；guidance 570 字符 ≈143 tok）。

## P0-b 发布身份与兼容声明（估算 0.5–1 天）

- [ ] 去掉 `private: true`、`@local` 作用域；`package.json` 增加 `repository` / `homepage` /
      `bugs` / `author` / `keywords`。
- [ ] 单一真源 bundle id：从 `package.json.name` 读取（或一个共享常量）生成 `src/client.js` 的
      `__ModuleLoader__.load({ id })`；重建 `client.js`；同步 `index.js` 的 `name`、`cordis.patch.yml`
      行名、3 处测试字面量；增加「bundle id === package.json.name === index.js name === patch name」测试。
      证据：[client/FINDINGS.md](client/FINDINGS.md) §B2、[release/FINDINGS.md](release/FINDINGS.md) P0-1。
- [ ] `dsh.manifestVersion: 1`；`engines.dsh: ">=0.2.2-0 <0.3.0"`（注意：朴素 `^0.2.2` 会被
      0.2.2-rc.1 预检拒绝；`>=0.2.2-0 <0.3.0` 已实测接受）。
- [ ] `dsh.client.inject` 增加 `@deepseek-ai/dsh-client-ui-settings`（`settings.section` 的 slot owner）。
- [ ] `LICENSE` + `THIRD_PARTY_NOTICES`（见用户决策项 3）；icon 原创性说明。
- [ ] 重新跑隔离安装/预检测试（fake DSH_HOME + `file:<tgz>`）。

## P0-c 文档与发布流程（估算 1–2 天，可与 P0-a/b 并行）

- [ ] 公开 README（EN + zh）：是什么/为什么、截图（真卡片 light+dark）、兼容表、安装/升级/卸载、
      **默认开启 ≈500 tokens/请求的成本与 0-token 关闭方式**、隐私（无网络/无遥测）、限制
      （Web/Desktop only、模型可能漏出卡、子代理无卡、视觉抄官方卡）、License + 署名、
      「非 DeepSeek 官方」声明。当前整理版 README 是过渡稿。
- [ ] 把当前 `DEVELOPMENT.md` 中的内部开发细节保留为开发文档；新增 `CHANGELOG.md`。
- [ ] git 仓库（本目录已完成初始化）；CI：`node --test`、`build-client.mjs --check`、
      `npm pack --dry-run` 文件清单检查、license 检查；`prepublishOnly` 守卫。
- [ ] 发布演练：scratch profil + 桌面 Plugins 页检查 metadata/icon/详情页；重启后按 PRD §12
      体验验收清单 + README 未复验项（跨重启标记、过程行 shimmer、Host gate HMR、M9 reveal）执行。
- [ ] 触发/质量矩阵：按 tech §T0-10 做 20 轮固定场景（期望触发/跳过），统计出卡率与正文是否复述；
      未达标前不要在文案中承诺「稳定触发」。
- [ ] 在 docs/audit/2026-11-09/ 下记录实机验收结果（可新建 live-check/ 目录）。

## P1（RC 后 / 或发布前顺手）

- [ ] 市场：公开 GitHub repo（≥1 天 + `dsh-plugin` topic + `dsh.bundle` 声明）→ 向
      awesome-dsh-plugin 提交一个 `data/plugins/<owner>__<repo>.yml` PR；npm 发布供应用内 Discover
      （应用内索引只收 npm 包）；listing 文案突出 fill-only / native card / compaction-proof。
- [ ] a11y：chip `aria-label` 保留「推荐/需确认」语义；冲突/忽略时焦点转移；settings segmented
      control 补齐 Home/End、focus-follow、aria-controls；More/collapse 加 aria-expanded/aria-controls。
- [ ] 修无效 token `--dsw-alias-state-warning-primary` → `--dsw-alias-state-warn-primary`（`src/styles.js:106`）。
- [ ] 清理死代码 / 随包 `__test` seam / 无效 identity 优化；`revealStartedRef` 重置；
      `readSettings` 的 localStorage try；fork 后标记（PRD §5.4）；en/zh 之外 5 个 locale 的显示元数据。
- [ ] 进程行与卡片在 meta 缺失时的一致性；预览槽 2 行截断与 500 字符 prompt 的产品取舍。
- [ ] 兼容策略：每次 DSH 升级的 smoke checklist、patch release 节奏、`engines.dsh` 收窄策略。
- [ ] 把审计证据脚本里的本机绝对路径（`/Users/arctic/...`、`/Applications/...`）在公开前脱敏。

## 验收命令（每步都跑）

```sh
cd plugins/dsh-next-actions
node --test
node scripts/build-client.mjs --check
npm pack --dry-run            # 检查 10 files / 40.5 kB 清单不意外变化
# 隔离安装（见 release/test-scripts/isolated-install-test.sh）
```

## 完成定义（DoD）

- P0-a/b/c 全部勾选，最终改名/重建产物在隔离 profile 安装成功；
- 桌面应用重启后走完 PRD §12 + 审计未复验项，无崩溃/无控制台错误；
- `0.1.0-rc.1 --tag next` 发布；2–4 周真实使用 + DSH 0.2.2 稳定版 smoke 后，再发 `0.1.0`；
- 上架 awesome-dsh-plugin 的 PR 已提交（repo 年龄/topic/描述合规）。
