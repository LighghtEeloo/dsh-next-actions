# 技术方案：DSH「下一步建议」本地插件 `@local/dsh-next-actions`

版本：v1.1（技术方案） ｜ 日期：2026-11-10 ｜ 状态：现行（P1 布局与移除 Send 模式已落地）
关联文档：产品形态稿 `design/next-step-suggestions-prd.md`（v0.9，行为与形态的唯一基准）
运行环境：DSH Desktop `0.2.2-rc.1`（`dsh --version`；asar 内 `dsh/package.json` 双重核对）
工作区：`/Users/arctic/Box/Terrace/deepseek-harness/default-workspace`
2026-11-10 更新：同步卡片 P1 布局（默认 3 条、按需预览、单内联标记、带文字忽略/恢复、冲突对比）与
彻底移除 Send 模式的实现；改动集中在 §1、§3.2、§6.3/§6.5/§6.6/§6.8、§9、§10、§13 与附录 A/D/F。
同日补记：冲突态动作并入状态行（`.dshns-statusbar-conflict`，删除独立 `.dshns-conflict-actions` 行），
冲突态与默认态高度差 ≤25px（748 列实测 24px）；改动集中在 §5.8、§6.3、§8、§9、§10、§11.3、§13、§14 与附录 A。

证据标记：**【V26】**=在**当前安装的 0.2.2-rc.1** asar/前端产物中直接核对；**【V21】**=本工作区 0.2.1-rc.2 解包语料（`research/app/`、`vendor/`，仅作对照）；**【官方规范】**=官方插件开发 skill 的明文规则；**【推断】**=合理推断，列入 §12 T0 验证。

> 证据工具：`research/live-asar.mjs`（本次会话新建；解析当前 `app.asar`，支持按路径列文件 / 按内容 grep / 读文件）。
> 关键产物：`dsh-web-frontend/dist/assets/index-BgUyXZcc.js`（shell，含 primitives 实现与冻结模块表）、
> `.../index-lh_YM6sT.css`（前端样式，含 primitives 精确 CSS）。

---

## 0. 结论先行（TL;DR）

1. **实现路线（一句话）**：一个本地 Host+Client 插件；Host 半**零 import**、注册一个纯函数工具
   `suggest_next_steps`（参数由模型给，`presentationMeta` 把**规范化后的建议**写进会话日志的
   `tool/result.meta`）；Client 半是一个**单文件、无构建依赖**的浏览器 bundle，注册
   `conversation.chat.turnTail` 卡片与 `tool.call.toolview` 过程组行；点击只调用
   `inputActions.setDraft()` 把指令**填入输入框**（bundle 内不存在 `submit` 调用；2026-11-10 移除 Send
   模式）；默认只显示 3 条建议、其余收进「还有 N 条」；刷新/回放/fork 由会话日志重建；
   用户状态（已填入/已忽略）只存 localStorage。

2. **六个关键决策**（都有证据支撑，见 §2/§3）：

| # | 决策 | 理由（证据） |
|---|---|---|
| D1 | **Host 零 import**，手写 `ToolDefinition` 纯对象（raw JSON Schema 参数） | `ctx.tools.register()` 只校验 `output.schema`/`render` 等少数项，plain object 完全合法【V26】；本机 profile 是 `link:` 安装，链接包解析不到 `@deepseek-ai/*`（`@local/dsh-side` 的零 import 先例）【V26】 |
| D2 | **建议数据走 `presentationMeta` → `tool/result.meta`**，不注册 Host Session projection | meta 是官方认可的"结构化展示通道"，随会话日志持久化，回放可重建【V26】；省掉 projection 的 duck-type schema 风险（目前仅 [L] 可行） |
| D3 | **Client 用 Conversation Definition 折叠出 Turn 数据**（`ctx.uiConversation.events.register`，官方 ui-schedule 同款），turnTail 条目读 `turn.data.get('next-steps')` | 官方 ui-schedule 用完全相同的客户端折叠方式发布 turn 级数据；外部插件可注册（ui-plan/ui-schedule 的 inject 先例）【V26】 |
| D4 | **UI 全部自绘照抄官方卡**，不 `require('@deepseek-ai/dsh-client-ui-primitives')` | 官方规范明文禁止外部插件 require Harness Client 包，要求"copy markup, CSS, and behavior, rename classes, keep only `--dsw-alias-*` tokens"【官方规范】；primitive 是否可 require 及全部精确 CSS 已提取（附录 A–C） |
| D5 | **点击 = 只填不发**（`inputActions.setDraft`），聚焦走 `ctx.get('conversation')?.input.shell(sessionId)?.focus()`（可选） | `setDraft` 是公开标准动作；`focus()` 不在 `inputActions` 上【V26】；"永不 submit"让误发成为不可能事件 |
| D6 | **无 Host 配置、无 Host 状态、无网络**：唯一真源是会话日志；可调项（条数等）是 client-local | 插件实践第一条"会话日志是唯一事实源"【官方规范】；Host 半无 Config 时 patch 的 config 原样透传（本项目不需要）【V26】 |

3. **硬指标**：零额外模型调用；工具声明常驻 token 预算 ≤ 370 tokens/请求（v4 实测 364；原目标 320 因字段级
   规则上移进 JSON Schema 而放宽，§5.7 有逐字符预算）；
   点击到填入 < 16ms；不新增进程、不联网、不写文件、不读凭据；工具调用默认不触发审批
   （`tools/pre-execute` 瀑布默认 allow【V26】；唯一例外是用户主动选择 Auto review 权限模式）。

4. **交付物**：13 个文件、约 2300–2900 行（含 600+ 行照抄 CSS/组件）；Host 单测 ~40 例、纯逻辑单测 ~35 例、
   手工 E2E 清单 18 条、视觉一致性清单 1 套；安装后一次重启 + 刷新页面即可验证。

5. **剩余 T0（实现前 0.5 天，均为"装插件后实测"）**：8 项，见 §12；每项都有明确判定标准与降级路径
   （最主要的是 `tool/result.meta` 到达客户端 Definition、`ctx.get('conversation')` 可达、
   `turn.data` 读写、官方卡视觉比对）。

---

## 1. 范围与约束

### 1.1 In scope（对应形态稿 v0.9 的 P0/P1）

- 回答末尾卡片：官方动作卡同款容器/折叠说明/控件/状态行（含右侧带文字忽略/恢复按钮）；无可见标题，上下文行前置品牌小标；
- 1–2 句上下文说明（防唐突），模型随建议一起生成；
- 1–6 条建议中默认展示 3 条，其余收进「还有 N 条」；设置可选 Auto（全部显示）或固定 1–6；推荐项用 primary 置顶并带「推荐」内联标记；
- 点击 = 完整指令填入输入框（不发送）；输入框已有内容时显示「将填入 / 当前草稿」对比 +「追加到末尾（primary）/ 替换 / 取消」；
- 危险建议（模型标记 + 本地词表）带「⚠ 需确认」内联标记与填入后的警示；
- 工具过程组一行式调用记录（标题 + 状态 + 摘要；异常可展开原因 +「查看调用」）；
- 预览默认收起，悬停/聚焦时在按钮行下方出现「将填入」+ 完整指令（两行 clamp）；
- 刷新/重启/回放/fork 后卡片与状态保留；
- 状态行右侧「暂不需要」→ 控件收起、状态行「已忽略」、按钮变「恢复建议」、卡片保留；
- 语言跟随用户对话；界面文案中英；
- 子代理/团队内部会话默认不渲染；
- P1：设置页（条数/重置 + Host 门控说明）、P1 布局（默认 3 条、按需预览、带文字忽略/恢复，2026-11-10）、本地统计（P2，暂不做）。

### 1.2 Out of scope（本版明确不做）

- 不做 Host Session projection（方案 B 的替代路线，留作升级路径）；
- 不做「点击直接发送」：2026-11-10 起彻底移除 Send 模式（点击行为设置、自动提交判断、冲突提交计划与「已发送」状态全部删除），点击只走 `setDraft`，bundle 内不存在 `submit` 路径；
- 不做「新会话建议」（形态稿 P2）；
- 不发布 npm、不提交社区索引；
- 不做服务端/远程同步（本地插件，单机浏览器状态）；
- 不修改模型系统提示、不接管权限、不注入 system prompt section。

### 1.3 硬约束（不达标即失败）

| 约束 | 标准 |
|---|---|
| 额外模型调用 | 0（建议在收尾那一次工具调用里生成；工具结果文字保持极短，见 §5.6） |
| 工具声明 token | ≤ 370 tokens/请求（v4 实测 364；实测口径：DeepSeek token meter ≈ 4 字符/token；预算明细 §5.7） |
| 工具往返 token | 调用参数 + 结果渲染文本 ≤ 120 tokens/轮 |
| 点击延迟 | 从点击到草稿可编辑 ≤ 16ms（纯同步 `setDraft`，无网络） |
| 自动发送 | 无 `submit()` 调用路径（2026-11-10 移除 Send 模式）；点击只写草稿，危险建议同样只填 |
| 正文污染 | 回答 Markdown 零改动；建议不进入模型可见正文 |
| 依赖面 | Host 零 `@deepseek-ai/*`/zod import；Client 单文件、无构建依赖、仅 `require('react')` |
| I/O | Host 工具零 I/O、零网络、零文件；不读凭据/其他会话 |

---

## 2. 平台事实（实现所依赖的已验证契约）

> 全部为【V26】，除特别标注；路径缩写：`P=` `dsh/node_modules/@deepseek-ai/`，`SH=` 前端 shell
> `dsh-web-frontend/dist/assets/index-BgUyXZcc.js`，`CSS=` `.../index-lh_YM6sT.css`。

### 2.1 客户端模块系统

| 事实 | 证据 |
|---|---|
| 插件 client bundle = 单文件经典脚本，唯一启动动作是 `window.__ModuleLoader__.load({id, factory(require){...}})`；`id` **必须等于包名**；执行 bundle 只注册工厂，副作用（含 CSS 注入）必须在 `factory` 内延迟到 материализation；无 JSX、无 TS，用 `React.createElement` | `P/dsh-cordis-client-runner/lib/client.js:309-338`、`SH:1`、`P/dsh-client-modules/README.md` |
| 浏览器可 `require` 的模块 = 冻结的 **共享模块表**：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit` | `SH:196`（函数 `YZ()` 原样返回该表） |
| 返回值的 `inject` 是 **cordis 服务名**（如 `slots`/`locale`/`conversation`/`uiConversation`/`sessions`）；`package.json` 的 `dsh.client.inject` 是**包名**（排序用）。`ctx.get(name)` 可绕过声明检查 | `RUNNER:485-504`、`P/dsh-client-modules/README.md` |
| **官方规范禁止**外部插件 `require('@deepseek-ai/dsh-client-ui-primitives')` 等 Harness Client 包，要求抄 markup/CSS/behavior、改类名前缀、只保留 `--dsw-alias-*` token | `SKILL/references/practices.md:35`、`verification.md:5` |
| 外部插件可以声明并注入这些服务：`slots`、`locale`、`uiConversation`、`sessions`、`conversation`（ui-plan/ui-schedule 先例） | `P/dsh-client-ui-plan/lib/client.js:720-731`、`P/dsh-client-ui-schedule/lib/client.js:19201-19214` |

### 2.2 插槽（slots）

| 事实 | 证据 |
|---|---|
| `conversation.chat.turnTail`：`kind:"list"`、`scope:"session"`；owner props **恰好** `{ turn: TurnLocation, seq: number, openFile }`；`order` 升序默认 0；用 `id` 注册（不是 key）；官方条目：deliverables/plan/action-cards 默认 0、schedule `order:20`；只有回合结束后才发布 | `RUNNER:3066-3127`、`P/dsh-client-ui-chat/lib/client.js:9030-9063`（`renderSlot("conversation.chat.turnTail",{turn,seq,openFile})`） |
| turnTail 条目拿到的标准 props（19 个）：`useRemoteAccess, useResource, useContextMenu, useWorkspaces, usePanelInfo, useSessions, useSessionStatus, useSessionRetainInfo, useSessionAccess, useWorkspaceAccess, useChat, useConversation, useInput, inputActions, useSession, sessionId, useProjection, useAccess, useTrajectory`；**没有祖先条目 props 继承**，公式 = owner props + 插槽级 inject + scope 标准 kit + 自己 entry 的 inject | `RUNNER:3094-3113`、`RUNNER:1947/2243` |
| `turn` 是 TurnLocation 对象：`turn.turn` 是数字；`turn.end`、`turn.data.get(key)` 可用（官方 ActionCardTail 即如此读 `turn-tail`/closing） | `P/dsh-client-ui-action-cards/lib/client.js:452-460`、`P/dsh-client-ui-chat/lib/client.js:9753-9759` |
| `tool.call.toolview`：keyed、`scope:"session"`、`key` = 工具 wire name；keyed 命中**替换**通用工具行；owner props `{phase:'preparing'|'start'|'result', block, callId, toolName, cwd, home, openFile, loadImage, inspect, useDisclosure}`；`block.args` 是惰性 args reader（`block.args.text('field')`），`block.content`/`block.isError`/`block.meta` 可用 | `RUNNER:7352-7398`、`P/dsh-client-ui-tool/lib/client.js:106,468`、`P/dsh-client-ui-action-cards/lib/client.js:583-621` |
| `settings.section`：root scope list，owner props 仅 `{close()}`；`settings.section.icon` 用相同 `id` 注册图标；settings 作用域**没有** session kit（拿不到 useInput/inputActions/useProjection） | `RUNNER:5754-5815` |

### 2.3 输入框（composer）

| 事实 | 证据 |
|---|---|
| `InputState = { draft, attachmentIds, draftRev, phase, claim?, occurrences, queue }`；`useInput(selector)` 可响应式读取；`draftRev` 只在草稿内容真正变化时 +1 | `P/dsh-client-ui-conversation/lib/client.js:16049-16059`、`:15436-15443` |
| `inputActions` 公开动作：`insertQuote, captureInsertion, insertText, setDraft, persistDraft, addAttachments, removeAttachment, pruneAttachments, submit`（`submit()` 固定 `"queue"`）；**没有 focus/notify** | `CONV:15369-15396` |
| `ctx.get('conversation')` 返回 ConversationController 服务；`conversation.input.shell(sessionId)` → `SessionInputShell`，其上有 `setDraft/insertText/notify(level,text)/focus()/submit(mode)`；`focus()` 经 Lexical，光标位置保持 | `CONV:4697-4721, 16231-16245, 15772-15794` |
| `setDraft`：整段替换草稿、清理占位符、换行分段、光标落末尾、并入撤销历史（不是独立可撤销步骤） | `CONV:15448-15463` |
| 建议核验 `ctx.get('conversation')?.input.shell(sessionId)` 在外部插件中可调用；`conversation` 服务已在官方包 inject 先例中出现 | `SCHED:19201-19214`【V26 结构】；实机可调性 → T0-4 |

### 2.4 工具链路与模型可见性

| 事实 | 证据 |
|---|---|
| `ctx.tools.register(definition, options?)` 只运行时校验：`output` 是对象且 `render` 是函数、`output.schema` 是受支持 raw JSON Schema、`timeoutMs` 正数、名字不是保留字 `run_code`；**plain object 完全合法**，无需 `defineTool` | `P/dsh-tools/lib/index.js:433-441` |
| `ToolDefinition` 字段：`name, description, parameters（raw JSON Schema）, output:{schema, render, presentationMeta?}, execute, projectContent?, finalizeContent?, timeoutMs?, isConcurrencySafe?, presentCall?, presentResult?, deferLoading?`；`parameters` 不会被注册时校验，只有 `output.schema` 会 | `P/dsh-tools/lib/index.js:311-360`、api-catalog `:9482/9546/9586` |
| 参数 raw JSON Schema 支持子集：对象/数组/字符串/数字/整数/布尔/null、`properties`/`required`/`additionalProperties`/`items`、scalar `enum`/`const`、exact-one `oneOf` | `P/dsh-tools/lib/shared-DTdn5dXO.js:24-34` |
| 执行结果：`execute` 返回 **lossless JSON value**，pipeline 用 `output.schema` 校验后再 `render(args, value)` 得到模型可见内容；`presentationMeta(args, value)` 的结果写入 `tool/result.meta`；**canonical value 不持久化** | `P/dsh-tools/lib/pipeline.js:699-731`、`:188-214` |
| 会话日志事件：`tool/call {turn, step, callId, name, arguments(string)}`、`tool/result {turn, step, message, error?, meta?}`；Compaction 可能修剪工具结果（meta 也随之丢失）→ 客户端需 args 兜底 | `api-catalog.js:8226`、`P/dsh-compaction-tool-result-pruner`（压缩存在） | 
| PTC 嵌套调用事件：`tool/ptc-dispatch-start {rootCallId, parentCallId, subCallId, name, arguments(对象)}` 与 `tool/ptc-dispatch`（追加 `isError`、`content`、可选 `meta`）；两者都没有 `turn`/`step`，`tool/call` 只记录外层 `run_code` | `P/dsh-tool-executor-ptc/lib/index.js:500-563`（0.2.2-rc.1） |
| Definition 的 `match(event)` 只收到原始事件；框架在 `start`/`update`/`buildLocationData` 的 Match 上附带 `location`（turn/step 或 session） | `P/dsh-client-ui-conversation/lib/client.js:2792-2811,2509-2515,3120-3129` |
| 官方 PTC-aware Definition 先例：显式匹配 `tool/ptc-dispatch-start`/`tool/ptc-dispatch`（ui-plan、ui-user-questions、ui-stats、ui-trajectory） | `P/dsh-client-ui-plan/lib/client.js:239-262,313-321`、`P/dsh-client-ui-user-questions/lib/client.js:1491-1550` |
| 审批：`tools/pre-execute` 瀑布**默认 `allow`**；0.2.2 唯一产出 `ask` 的是 Auto review（仅当用户选择 Auto 权限预设）；插件无法用定义字段声明"免审批" | `P/dsh-tools/lib/pipeline.js:386-390`、`P/dsh-experimental-auto-review/lib/index.js:565-599` |
| keyed `tool.call.toolview` 命中即替换通用行；`block.meta` 可读（内置行即读 meta） | `P/dsh-client-ui-tool/lib/client.js:106,468` |
| Host 半零 import 可行；无 `Config` 时 patch 行 config 原样传入 `apply`（本项目不需要 config） | `P/cordis/lib/index.js:245-250`、`plugins/dsh-side/index.js`（本机已装零 import 先例） |

### 2.5 Conversation Definition（客户端折叠会话日志）

| 事实 | 证据 |
|---|---|
| `ctx.uiConversation.events.register(def)` 是外部插件可用的客户端服务；官方 ui-schedule 用它发布 turn 级数据且没有 View 节点 | `SCHED:19257`、`SCHED:13210-13267` |
| Definition 形状：`{ kind, match(event), start(ctx,match), update(ctx,match), buildLocationData(ctx,scope,previous) }`；`match` 是函数（也支持按事件名映射的对象）；`buildLocationData` 返回 `{kind:'turn', turn, key, value}`，随后 turnTail 条目用 `turn.data.get(key)` 读取 | `SCHED:13210-13267`、`AC:452-460` |
| 官方 ui-schedule 折叠 `turn/start`、`tool/call`、`tool/result`（仅 `surfaceOp === "append"`，避免 replacement 副本重复计数）；`start/update` 必须返回新引用才重新发布 | `SCHED:13210-13267`、surface helper `SCHED:13102-13120` |
| 历史回放/fork：Definition 由会话事件驱动；官方设计声明回放可重建卡片 | `P/dsh-client-ui-schedule/lib/client.js` 注释（"Session-log replay reproduces the card"） |

### 2.6 官方动作卡（照抄基准）

| 事实 | 证据 |
|---|---|
| 卡框：`section.card[aria-label=title][data-action-card]`；body：`div.body > strong.title + FoldedText(brief) + status + footer`；尺寸/圆角/描边/token 见附录 A | `P/dsh-client-ui-action-cards/lib/client.js:400-560` |
| 折叠说明：`FOLD_WIDTH = 260` 拉丁字宽；宽字形（CJK/假名/谚文/全角）按 2 计；`Intl.Segmenter` 按 grapheme 切；超宽 → 截断 + "…" + ghost 小按钮「展开/收起」；从不改变全文 | 同上 `FoldedText` |
| dismiss：底部 footer `Button variant="ghost" size="sm"`，文案 `暂不需要 / Not now`；dismiss 后状态行显示 `已忽略 / Dismissed`，卡片保留 | 同上 FallbackBody；locale 字典 `AC:660-720` |
| 过程行：`tool.call.toolview` keyed `propose_action` → `div[data-tool=...][data-state]` > `DisclosureRow`；状态 `preparing|running|ok|error|stopped`；collapsedContent = 状态文案 + 标题摘要（单行省略）；仅「有原因」时可展开；展开 = 原因 `pre` 框 +「查看调用」按钮；行内无操作按钮；整行可点展开 | `AC:571-621`、`AC:562-567`（CSS） |
| primitive 结构：`Button`（variant/ size/ icon/ 原生 button props）、`DisclosureRow`（19 个 props，DOM/aria/键盘/chevron 行为）、`IconAppsAddOutlineRegular`（16 viewBox，使用 size=14） | `SH:132`、附录 B/C |
| 视觉样式字符串：Card.module.css、ProposeRow.module.css、Button/DisclosureRow/shimmer 类名与声明 | 附录 A/B（从 `SH`/`CSS` 原样抄录） |

---

## 3. 总体架构

### 3.1 架构图

```text
                        ┌──────────────── Host（零 import、无状态）────────────────┐
用户消息 ──► 模型 ─────►│ 工具 suggest_next_steps（纯函数）                          │
                        │   parameters: raw JSON Schema（context + suggestions[]）   │
                        │   execute: normalizeArgs → { shown, count }               │
                        │   presentationMeta: buildMeta → 规范化建议（写入日志 meta） │
                        └───────────────────────────┬───────────────────────────────┘
                                                    │ tool/call(arguments) + tool/result(content, meta)
                        ┌───────────────────────────▼───────────────────────────────┐
                        │ 会话日志（唯一事实源；刷新/回放/fork 都从这里重建）          │
                        └───────────────────────────┬───────────────────────────────┘
┌───────────────────────────────────────────────────▼──────────────────────────────────────────┐
│ Client（单文件 bundle，仅 require('react')）                                                   │
│  ① Conversation Definition（kind: next-steps）折叠本回合 tool/call+tool/result → turn.data     │
│  ② turnTail 条目（order -10）读 turn.data.get('next-steps') → 渲染官方同款卡片                 │
│  ③ tool.call.toolview（key: suggest_next_steps）→ 过程组一行式记录                             │
│  ④ 点击 → inputActions.setDraft(prompt)（+ 可选 shell.focus()）；已填入/已忽略 → localStorage   │
│  ⑤ P1 settings.section（条数/重置）                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流（一次回合）

1. 模型在收尾前调用 `suggest_next_steps`（参数：`context` + `suggestions[]`）。
2. Host `execute`：纯函数 `normalizeArgs` → `{ shown, count }`（校验失败/全空 → `shown:false`）。
   `presentationMeta`：`buildMeta` 产出规范化建议并写入 `tool/result.meta`（客户端展示的唯一结构化来源）。
3. `output.render` 给模型一句极短的确认（"Next steps shown below your answer (3). Do not restate them."）——
   模型不重复建议、不额外输出。
4. Client Conversation Definition 收到 `tool/call` + `tool/result`：优先读 `event.data.meta`；
   若 meta 缺失（历史压缩）→ 用 `tool/call.arguments` 做**保守兜底解析**。
5. turnTail 条目在 `turn.end` 后出现，读 `turn.data.get('next-steps')`：
   - 无数据 / 无 closing 文本 / 子代理会话 / 用户已忽略 → 不渲染；
   - 否则渲染官方同款卡片。
6. 点击建议 → `inputActions.setDraft`（草稿整段替换；空/本人未编辑时直接替换，否则出「将填入 / 当前草稿」对比 +「追加到末尾 / 替换 / 取消」，三种选择都只填入）。
7. 用户修改后自己发送。卡片状态行与按钮状态更新；「暂不需要」→ 状态行「已忽略」+ 控件收起，「恢复建议」还原。
8. 刷新页面 → 会话日志重放 → Definition 重建 turn data → 卡片与状态恢复（localStorage 补用户态）。

### 3.3 方案对比与取舍

| 维度 | 方案 A（本方案）：meta + 客户端 Definition | 方案 B：Host Session projection + `useProjection` | 方案 C：客户端扫描 `useChat` 节点 |
|---|---|---|---|
| Host 复杂度 | 最低（零 import、无状态） | 需注册 projection（duck-type schema 目前仅 [L]） | 零 |
| 数据规范化时机 | Host 一次（meta 落日志） | Host 一次（wire view） | 客户端重复实现规范化 |
| 刷新/回放/fork | 日志重建（meta 持久化） | 日志重建（projection 重放） | 依赖节点窗口，分页外不可见 |
| 依赖风险 | 低（只用已证实的 Definition/事件字段） | 中（wire 键类型声明、cache/parse 路径） | 中（节点内部结构非契约） |
| 官方先例 | ui-schedule（客户端 Definition 发布 turn data） | action-cards（官方 projection） | 社区插件常用 |
| 结论 | **采用** | 留作 v2 升级路径（若未来需要跨端/更强一致性） | 仅作为 Definition 的 fallback 数据源之一 |

### 3.4 为什么不用官方 action-cards 框架

官方 `actionCards` 是「一个固定工具 `propose_action` + 技能加载激活 + 每回合最多一张卡 + Remote `act` 决策」
的整包机制；我们的是**独立工具、独立卡片、点击只填输入框**，语义不同。强行复用会：
1) 与官方推荐卡争同一回合唯一卡片位；2) 需要 skill 加载才激活；3) 卡片动作走 Remote 决策而非发用户消息。
因此只**照抄其视觉与过程行写法**，不注册 kind、不挂 Remote。

---

## 4. 包结构与构建

### 4.1 文件清单

```text
plugins/dsh-next-actions/
├── package.json             # 清单（§4.2）
├── cordis.patch.yml         # 插入一行 Host 插件（§4.3）
├── index.js                 # Host 半：零 import；注册工具（§5）
├── lib/
│   ├── normalize.js         # 【Host/客户端共享的规范】纯函数：解析、清洗、去重、立场、危险词表、meta 构造
│   └── view-model.js        # 【客户端纯逻辑】meta→展示模型、args 兜底解析、草稿冲突状态机、卡片状态派生、hash/存储 key
├── src/
│   ├── client.js            # 客户端 bundle 源模板（无构建依赖，占位符内联 view-model；含 Settings 导航 16px 单色图标）
│   └── styles.js            # 照抄的 CSS 字符串（官方 Card/ProposeRow/Button/DisclosureRow/shimmer 改写前缀）
├── scripts/
│   └── build-client.mjs     # 零依赖构建：src/client.js + lib/view-model.js + src/styles.js → client.js
├── client.js                # 构建产物（提交到仓库；测试校验与源同步）
├── locale/
│   ├── en.json              # 插件管理展示 meta（title/description）
│   └── zh.json
├── icon.svg                 # 插件图标：官方 36×36 规格（透明底、三条递减建议条 + #67C7FE→#3F77D8 渐变、#41E1AC 星火）
├── design/icon-options/     # 图标候选（仅设计存档，不随包发布）
└── test/
    ├── normalize.test.mjs   # Host 纯函数单测（node:test）
    ├── tool.test.mjs        # 工具注册、根 agent 门控、常驻提示、Host config
    ├── view-model.test.mjs  # 客户端纯逻辑单测
    ├── card-state.test.mjs  # 卡片状态组合（filled/danger/预览/chip 标记/冲突）
    ├── definition.test.mjs  # native + PTC 的 turn data 折叠
    └── build.test.mjs       # 构建产物与源一致（node:test 调 build --check）
```

> **为什么有极小的构建步骤**：DSH 外部插件 client 必须是**单文件**浏览器 bundle（模块系统不支持相对
> require）。纯逻辑若两份维护必然漂移；因此把 `lib/view-model.js` 作为唯一源，由 30 行零依赖的
> `scripts/build-client.mjs` 内联进 `client.js`，并用 `build.test.mjs` 断言产物未过期。
> 没有 JSX/TS、没有 npm 依赖、没有 postinstall（安装时不会触发 build scripts）。

### 4.2 `package.json`（完整）

```json
{
  "name": "@local/dsh-next-actions",
  "version": "0.1.0",
  "private": true,
  "description": "Shows a card under completed replies with one or two sentences of context and clickable next steps that fill the input draft.",
  "icon": "./icon.svg",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": [
    "index.js",
    "client.js",
    "cordis.patch.yml",
    "lib/normalize.js",
    "lib/view-model.js",
    "locale/*.json",
    "icon.svg",
    "README.md"
  ],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-chat",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-tool"
      ]
    }
  }
}
```

> **命名（2026-11-09）**：包名定为 `@local/dsh-next-actions`（原名 `@local/dsh-next-steps` 与生态已有
> `dsh-nextsteps` 混淆；`@local/` 作用域不参与 npm，发布前再查重并确定最终品牌）。产品名仍是
> 「下一步建议 / Suggested next steps」；卡片自 2026-11-09 起不显示可见标题，仅保留同名 `aria-label`，
> i18n 命名空间 `nextSteps`，插槽 id 与 localStorage 前缀随包名更新。

- `dsh.client.inject` 是**包名**，只影响加载顺序（先有 chat/conversation/tool 的槽位声明，我们的
  `ctx.slots.inject` 回调才有 owner 可挂；即使顺序反了也会在声明出现时重放，这里只是稳妥）。
- 不声明 `engines.dsh`/peerDependencies（无 import → 无版本门禁需求）；README 里写明"在 0.2.2-rc.1 验证"。
- `files` 不含 `src/`、`scripts/`、`test/`（link: 安装不受 files 过滤，但发布/打包路径需要）。

### 4.3 `cordis.patch.yml`

```yaml
- insert:
    - id: dsh-next-actions
      name: '@local/dsh-next-actions'
```

无 `config`（Host 半没有 `Config` 导出；cordis 在无 Config 时把行内 config 原样透传，这里也不需要）。

### 4.4 构建脚本（零依赖）

```js
// scripts/build-client.mjs（~40 行）
import { readFileSync, writeFileSync } from 'node:fs'
const root = new URL('..', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const template = read('./src/client.js')
const viewModel = read('./lib/view-model.js').replace(/^export /gm, '')
const styles = read('./src/styles.js').replace(/^export /gm, '')
const out = template
  .replace('/* @inline:view-model */', viewModel)
  .replace('/* @inline:styles */', styles)
writeFileSync(new URL('./client.js', root), out)
if (process.argv.includes('--check')) {
  const current = read('./client.js')
  if (current !== out) { console.error('client.js is stale; run scripts/build-client.mjs'); process.exit(1) }
}
```

模板约定：`src/client.js` 以 `window.__ModuleLoader__.load({ id: '@local/dsh-next-actions', factory(require) { ... } })`
包裹；内联区在工厂内部实现；`client.js` 为提交产物（首次提交与每次修改后跑 `node scripts/build-client.mjs`）。

---

## 5. Host 半设计

### 5.1 导出形态（零 import、raw Host config、根 agent 门控）

```js
// index.js
import { buildMeta } from './lib/normalize.js'

export const name = '@local/dsh-next-actions'
export const inject = ['tools', 'systemPrompt', 'agents']

/** raw row config 默认值：无 Config schema（见下），Cordis 原样传 config。 */
const CONFIG_DEFAULTS = Object.freeze({ enabled: true })

export function apply(ctx, config) {
  if (!normalizeConfig(config).enabled) return          // Host 开关：不注册即零成本
  ctx.effect(
    () => ctx.tools.register(TOOL, { when: ({ agent }) => isRootAgent(ctx, agent) }),
    'dsh-next-actions: tool',
  )
  // …按根 agent 安装引导 section（§5.7.1）…
}

const TOOL = {
  name: 'suggest_next_steps',
  description: TOOL_DESCRIPTION,           // §5.4
  parameters: PARAMETERS,                  // §5.3（raw JSON Schema）
  output: {
    schema: OUTPUT_SCHEMA,                 // §5.5（raw JSON Schema）
    render: (_args, value) => value.shown
      ? [{ type: 'text', text: `Next steps shown below your answer (${value.count}). …` }]
      : [{ type: 'text', text: 'No card shown. Answer normally; do not mention this tool.' }],
    presentationMeta: (args) => buildMeta(args),   // §5.5 → tool/result.meta
  },
  execute(args) {
    const meta = buildMeta(args)            // 纯函数、零 I/O
    return { shown: meta.shown, count: meta.suggestions ? meta.suggestions.length : 0 }
  },
}
```

说明：
- `presentationMeta` 与 `execute` 都调同一个 `buildMeta`（纯函数），保证模型可见结果与客户端 meta 一致；
- `execute` **永不 throw**（坏参数 → `shown:false` + note；见 §5.6 的模型可见策略）；
- 不声明 `timeoutMs`（毫秒级完成）、不声明 `deferLoading`（工具需可见）；
- **根 agent `when`（P1，2026-11-09）**：`register(def, { when })` 的条件在每个 model step 求值一次，
  收到 `{ agent, modelSelection, signal }`；false 时该工具从 executor 描述、PTC bindings 和执行中整体
  消失 → 子代理请求不再付 364 tokens 声明。条件不得改注册/做工具工作；抛错会让该 step 准备失败
  （`TOOL_ACTIVATION_FAILED`），因此 `isRootAgent` 捕获异常并 fail-open（未知 agent 也放行），避免
  Harness 变化误伤工具。子代理跳过逻辑与既有 guidance 安装（仅根 agent）保持一致。
- **Host config `enabled`（P1，2026-11-09）**：包仍是零 import `link:` 安装，无法 import Schemastery
  导出 `Config`；Cordis 的 `resolveConfig` 在无 `Config` 时原样传 raw config，所以 `apply(ctx, config)`
  自己归一化。只有字面 `false` 视为关闭（缺省/畸形值都保持开启）；关闭时 **tool 与 section 都不注册**，
  请求级常驻从 ~507 → 0 tokens。配置入口是 profile user patch 层（id-targeted patch 替换整行 config，
  需重述 `name`），profile patch 被 HMR 监听；插件自己的 patch 声明默认 `config: { enabled: true }`。
  应用内表单暂不做：`dsh-settings` 的 form projection 需要真 Schemastery（`new z(schema.toJSON())`、
  `dict`/`meta`/`type`），linked 零依赖包拿不到；依赖化安装后可补 `Config` + `plugins.row.config` 页面。

### 5.2 命名与冲突

- 工具名 `suggest_next_steps`：不与官方 `propose_action`/`run_code` 冲突，keyed toolview 的 key 域是开放的；
- 插槽 id 使用 `'@local/dsh-next-actions'`（=包名，便于调试认领）；
- localStorage 前缀 `dsh-next-actions:v1:`；i18n 命名空间 `'nextSteps'`。

### 5.3 `parameters`（raw JSON Schema，模型可见）

```js
const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['context', 'suggestions'],
  properties: {
    context: {
      type: 'string',
      description: '≤120 chars: what was completed, then the options; never restate the answer.',
    },
    suggestions: {
      type: 'array',
      description: '1–3 (max 6); distinct angles, no near-synonyms or questions.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'prompt'],
        properties: {
          label: { type: 'string', description: 'Short imperative phrase, ≤16 chars, no ending punctuation.' },
          prompt: {
            type: 'string',
            description: 'Message the user could send as-is (≤500 chars); cite this turn\'s files/commands/decisions; never just "continue".',
          },
          stance: { type: 'string', description: 'verify | continue | push | pivot | optional (safe to skip)' },
          recommended: { type: 'boolean', description: 'Exactly one: your pick.' },
          danger: { type: 'boolean', description: 'Only destructive/irreversible/paid/permission-changing actions; never read-only.' },
        },
      },
    },
  },
}
```

- 约束（1–6 条、长度上限、stance 合法性、recommended ≤1、optional 压尾）**不依赖 schema 强制**，
  由 `normalize` 在 Host 侧执行（raw schema 子集能力有限，且模型违规也应有可预测降级）；
- **v4（2026-11-09）分工**：字段级质量规则（长度、角度、口吻、danger 边界）放在 schema description 里——
  这是模型生成参数时唯一会细读的位置；description 与常驻引导不再重复这些规则。代价是 schema 从 725
  增至 986 字符（+261 ≈ +65 tokens），计入 §5.7。

### 5.4 `description`（模型可见；英文，官方惯例）

```js
const TOOL_DESCRIPTION = [
  'Show 1–3 clickable next steps as a card under your reply; clicking a suggestion fills the message input.',
  'Call it once when this turn leaves follow-up work.',
  "Write labels and prompts in the user's language.",
  'Never list the same steps in your prose.',
].join(' ')
```

> 官方证据：工具 schema 只有英文；本地化通过"in the user's language"之类的句子实现（bash / PTC /
> action-cards / schedule 均如此）。【V26】

**v4（2026-11-09）四层分工**：description 只讲“是什么 + 一条显示硬规则”；“何时调用/何时跳过”见
§5.7.1 的常驻 section；字段级规则见 §5.3；“调用之后怎么写最终回答”见 §5.5 的 render 文本。这样同一条
规则只在一层付费，避免旧版三处重复 “never restate”。description 336 → 245 字符，但 schema 增加更多，
声明净增约 +45 tokens（见 §5.7）。

### 5.5 输出与 meta

```js
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['shown', 'count'],
  properties: { shown: { type: 'boolean' }, count: { type: 'integer' } },
}

/** 持久化到 tool/result.meta 的结构（客户端唯一结构化数据源） */
const META = {
  shown: true,
  context: '修复已完成，改动集中在 src/api。',
  suggestions: [{
    id: 'k3j9d2',            // djb2(prompt) → base36，稳定、可用于本地状态
    label: '跑一下测试',
    prompt: '跑一下测试（只跑 src/api 相关用例），把失败项列出来。',
    stance: 'verify',        // verify|continue|push|pivot|optional
    recommended: true,       // 最多一条
    danger: false,
  }],
  // shown:false 时：{ shown:false, note: 'No usable suggestions.' }
}
```

meta 大小上限：`context ≤ 120` 字、`label ≤ 40` 字、`prompt ≤ 500` 字、最多 6 条 → 最大约 4KB，
实际常见 1–1.5KB/回合。压缩（compaction）可能修剪工具结果 → meta 丢失时必须能由 `tool/call.arguments`
兜底重建（客户端 `modelFromArgs`，规则同 normalize 的保守子集）。

### 5.6 `lib/normalize.js` 规则（Host 唯一规范化实现）

```js
/** @typedef {{shown:boolean, context?:string,
 *   suggestions?:{id:string,label:string,prompt:string,stance:string,recommended?:true,danger?:true,
 *                 opensNewSession?:true}[], note?:string}} NextStepsMeta */

export const LIMITS = { maxSuggestions: 6, context: 120, label: 40, labelDisplay: 20, prompt: 500 }

export function buildMeta(rawArgs) { /* 纯函数；见下 */ }
```

规范化流水线（每一步均可单测）：

| 步骤 | 规则 | 违反时 |
|---|---|---|
| 1 解析 | `rawArgs` 必须是对象；`context` string；`suggestions` 数组 | `{shown:false, note:'invalid-arguments'}` |
| 2 context | trim、压缩连续空白、截断 120、去掉首尾引号；空 → 丢弃 | 空则 `shown:false, note:'missing-context'` |
| 3 条目清洗 | 每条：`label`/`prompt` 至少一个有内容；`label` trim+截断 40；`prompt` trim+截断 500；`prompt` 缺省时回退为 `label` | 空条目丢弃 |
| 4 去重 | 归一化（小写、压缩空白、去尾部标点）后按 `prompt` 去重；同 label 但不同 prompt 允许（不同角度） | 保留先出现者 |
| 5 立场 | `stance` ∈ 五档；显式合法 stance 同轮只留第一条 | 丢弃重复者（缺失/非法 stance 不占名额，见下） |
| 6 recommended | 只保留第一条 `recommended:true`；若它被 5 丢弃则顺延 | 多余忽略 |
| 7 danger | 模型 `danger===true` 或命中文/英风险词表（`rm -rf`、删除、清空、格式化、重置、force push、发布、部署、付费、授权、sudo、chmod、DROP TABLE 等）→ `danger:true` | 只升级不降级 |
| 8 上限 | 最多 6 条；`recommended` 与 `optional` 优先级保护 | 截断 |
| 9 计数 | `shown = suggestions.length > 0`；`count = suggestions.length` | — |
| 10 id | `id = base36(djb2(prompt))`，稳定、与顺序无关 | — |

实现细化（M1）：缺失或非法的 `stance` 仍回退为 `continue` **展示**，但**不占用立场唯一名额**——模型漏填
该字段时不会把卡片压成一条；只有显式且合法的 stance 才参与同轮去重。

模型可见策略（`output.render`）：
- `shown:true` → "Next steps shown below your answer (n). Now write the final answer: do not list or number them,
  keep at most one lead-in sentence, and do not call this tool again this turn."——tool result 是**最终回答前
  最后一次**模型可见指令，v4 把“写最终回答 / 不列举 / 不重复调用”的动作指令放在这里（60 → 173 字符，
  ≈ +28 tokens/次调用），比常驻提示更贴近决策点；
- `shown:false` → "No card shown. Answer normally; do not mention this tool."（**不抛错**：抛错会让模型道歉/重试，
  且过程行已有「未显示」+ 原因；这比官方"拒绝调用→错误结果"更轻，是我们有意的取舍，见 §8 风险）。

### 5.7 Token 预算（逐字符口径，4 字符≈1 token）

M1 实测口径（与单测同源）：`JSON.stringify({name, description, parameters}).length + JSON.stringify({schema}).length`，
4 字符≈1 token（官方 token meter 口径）。

| 项 | 实测字符 | tokens |
|---|---|---|
| 工具名 + description + parameters raw JSON Schema（v4） | 1,312 | ~328 |
| output schema（+ render 文案不计入 schema） | 144 | ~36 |
| **声明常驻合计（v4）** | **1,456** | **364**（调整后目标 ≤370 ✅） |
| 系统提示引导（常驻，按根 agent，v4） | 570 | ~143 |
| 一次调用的 arguments（示例 3 条） | ~250 | ~63 |
| 模型可见结果 render 文本（v4） | 173 | ~43 |
| 典型 `tool/result.meta`（3 条） | 323 | ~81（只进会话日志，**不进模型上下文**） |

> 第一版按设计稿原文字串实测为 1,653 字符 ≈ 413 tokens，超出预算；按 §5.7 的应急策略缩短 description 与
> 参数描述后降到 319。若后续再加规则，优先并入 description 而不是新增字段描述。
> meta 是 canonical value 之外的持久化展示数据，不占用模型请求 token。
> 2026-11-09 调用可靠性修复新增常驻 system prompt 引导 345 字符 ≈ 96 tokens（§5.7.1）；工具声明本身仍为
> 319 tokens，请求级常驻合计约 **415 tokens**。
> **2026-11-09 v4（四层分工）**：字段级规则上移 JSON Schema、触发规则客观化后，工具声明 319 → 364 tokens，
> 常驻引导 96 → 143，请求级常驻合计 **415 → 507（+92 tokens/请求）**；模型可见 result 22 → 43 tokens/次调用。
> 这是为“工作回合触发召回 + 卡片质量”明确接受的代价；P1 的省 token 路径（根 agent `when`、Host 开关、
> 延迟激活评估）见 §5.7.2：前两项已实现，第三项已评估。

工具执行与真实会话实测（2026-11-09，本机）：

| 指标 | 实测 |
|---|---|
| `buildMeta` 纯函数耗时 | **4.39 µs/call**（200k 次循环，≈228k calls/s） |
| 工具声明（v4） | 1,456 字符 ≈ **364 tokens**/请求 |
| 系统提示引导（常驻，v4） | 570 字符 ≈ **143 tokens**/请求 |
| 请求级常驻合计（v4） | **≈ 507 tokens**/请求（v3 为 415） |
| 真实调用 arguments（3 条建议） | 平均 482 字符 ≈ **121 tokens**/轮 |
| 模型可见 tool result content（v4） | 平均 173 字符 ≈ **43 tokens**/轮（无卡片时 57 ≈ 14） |
| 持久化 `tool/result.meta` | 平均 524 字符 ≈ 131 tokens（只进会话日志，**不进模型上下文**） |
| 额外模型调用 | **0** |

### 5.7.1 调用可靠性：常驻 system prompt 提示（2026-11-09）

**现象**：首次会话 compact 后，模型不再主动调用 `suggest_next_steps`（没有卡片，只剩正常回复）。工具声明与参数仍在请求里，`maxPerTurn` 只控制显示、不会自行产生建议；真正丢失的是会话里积累的“每次回复都调用”的使用习惯——compact 把它摘要掉了，而工具 description 只是可选参考材料。

**修法**：Host 走官方 prompt 扩展点注册常驻行为：

- `ctx.systemPrompt.section({ name, order, text })`，按**根 agent** 注册（`agent/created` → `agent.ctx.effect`，插件卸载时统一 dispose）；子代理跳过——卡片在子代理会话不渲染，提示只会白花 token。
- 名称 `tool:suggest-next-steps`；排序 `getSectionOrder('TOOL_REPORT') + 50`（该常量缺失时回退 2950）。
- 文本（v4，570 字符 ≈ 143 tokens/请求）：

  > Before your final answer, call suggest_next_steps once when this turn leaves real follow-up work: a task finished or advanced, tools ran, files changed, review or approval is due, or you were about to end with a list of next steps. Put those steps only in the card; the reply gets at most one lead-in sentence and never numbers or bullets them. Skip greetings, acknowledgements, pure knowledge answers, repeated cards, and turns that already asked a structured question. On a work turn when unsure, still call it with 2–3 safe options; on a trivial or social turn, skip.

**为什么不只改工具 description**：description 已是常驻预算的一部分，且模型把它当“可选能力”；system prompt section 是跨 compact 存活的“行为”，官方实践文档明确建议用 `ctx.systemPrompt.section()` 加提示。**代价**（v3 时）：请求级常驻 +96 tokens（总常驻约 415 tokens/请求），换来稳定调用率。第二版把触发面收窄到「确实有真实后续动作」的回复，寒暄/确认/纯知识问答一律跳过，宁缺毋滥（`If unsure, skip`）；第三版补上「回复本身就在列下一步清单」的场景——仍然调用工具、正文只留一句引子，避免模型在「回答即清单」的回合漏触发（而正文与卡片两边重复）。

**v4（2026-11-09）四层分工 + 客观触发**：提示词不再堆在一层，而是
`description`（能力 + 一条显示硬规则）/ 常驻 `section`（何时调用与跳过）/ JSON Schema 字段描述（怎么写得合格）/
tool result（调用后立刻“写最终回答，别列举、别再调用”）各管一件事，规则不重复付费。

- 触发条件从主观的 “real actions” 改成模型能自查的客观清单：**任务完成或推进、跑过工具、改过文件、
  有验证/审查/审批待办、或它本来打算以“下一步”清单结尾**；
- 原来的 `If unsure, skip` 拆成两档：**实质工作回合不确定 → 仍然调用（2–3 条稳妥选项）**；
  **琐碎/社交回合 → 跳过**，这样既不吵也不会把工作回合漏掉；
- 新增两条静音条件：只重复上一张卡片的回合、已经弹过结构化提问的回合，都不再调用；
- “回复即清单”的回合明确要求清单只出现在卡片里，正文最多一句引子、不得编号/列举。

代价与取舍：常驻引导 96 → 143 tokens、schema +65 tokens，请求级常驻合计 **415 → 507 tokens/请求**；
模型可见 result 从 22 → 43 tokens/次调用。换来的是工作回合的触发召回与卡片质量（字段规则终于对模型可见）。
下一步的补偿路径（不在本次范围）：子代理用 `when` 不注册工具（省 ~320 tokens/子代理请求）、Host 侧
enable 开关（关闭时同时不注册 tool + section）、以及把工具声明延迟到首次工具调用后（tool-addition，
V4 系 append-only 保持 KV cache）。

**已知取舍（P1 已解决一部分）**：v3 的「启用」开关是客户端 localStorage，Host 读不到——关闭后卡片不显示，但模型仍会按提示调用工具并付常驻 token。P1 ② 已把它搬到 Host config（§5.7.2）：关闭时 tool 与 section 都不注册（0 常驻），客户端开关随之移除、Settings 留只读提示。仍无应用内表单：linked 零依赖包不能导出真 Schemastery `Config`；依赖化安装后可补 Config + `plugins.row.config` 页面。

### 5.7.2 P1 token 门控（2026-11-09）

v4 常驻预算 = 工具声明 364 + 常驻引导 143 = **507 tokens/请求**。P1 加三个门控：

**① 根 agent `when`（已实现）**

- 机制：`ctx.tools.register(TOOL, { when: ({agent}) => isRootAgent(ctx, agent) })`。DSH 每个 model step
  求值一次；false 时该工具从 executor 描述、PTC bindings 与执行里整体消失。条件必须 observe
  cancellation、不得改注册或执行工具工作；抛错会让 step 准备失败（`TOOL_ACTIVATION_FAILED`）。
- 收益：子代理请求不再付 **364 tokens/请求** 的声明（常驻引导本就只装根 agent）。未知 agent、缺失/
  异常 registry 一律 fail-open，避免误伤工具。
- 测试：`tool.test.mjs` 的「tool registration admits root agents only」「broken root registry keeps
  the tool available」。

**② Host `enabled` config（已实现）**

- 机制：零 import 包不导出 `Config`，Cordis 原样传 raw row config；`normalizeConfig` 只把字面 `false`
  视为关闭。关闭时 `apply` 直接 return，tool 与 section 都不注册 → **0 tokens/请求**（相对 507）。
- 配置方式：profile 的 user patch 层（id-targeted patch 替换整行 config，需重述 `name`）：

  ```yaml
  # ~/.dsh/profiles/desktop/cordis.patch.yml
  - id: dsh-next-actions
    name: '@local/dsh-next-actions'
    config: { enabled: false }
  ```

  base bundle 在 launcher 提供 `profileContext` 时启用 HMR（shipped Web/Desktop 满足；headless/SDK 关闭），
  HMR 监听 profile patch 层：改这一行会就地重组合该行、不必整机重启；没有 HMR 的 profile 则在重启时生效。
  插件自己的 patch 声明默认 `{enabled:true}`。
- 客户端：localStorage 的 `enabled` 与 Settings 的 Switch 移除（无法再影响 Host 成本，留着只会误导），
  Settings 顶部改为只读 hostGate 提示；条数/点击/重置三项保留。
- 不做应用内表单的原因：`dsh-settings` 的表单投影需要真 Schemastery 语义（`new z(schema.toJSON())`、
  `dict`/`meta`/`type`、`~standard.validate`），linked 零依赖包 import 不到；依赖化安装后可导出
  `Config` + 注册 `plugins.bundle.config`/`plugins.row.config` 页面把开关放回 Plugins 页。
- 测试：`tool.test.mjs` 的「enabled=false registers nothing」「defaults and malformed values keep on」。

**③ 延迟激活（已评估，未实现）**

- 机制：同一个每-step `when` 可以把激活条件改成「该根 agent 在本会话已有工具结果」——用
  `ctx.on('tools/result')` 维护 per-agent 标记（WeakSet）；首次工具结果后的下一个 model step 起，
  tool 与 guidance 才出现。guidance 必须一起延迟，否则提示模型调用一个不存在的工具。
- KV cache：DSH 文档说明可见定义不变时前缀稳定；在声明 tool updates 的路由（如 V4.1-Flash）上，激活走
  append-only `tool-addition`（deferred declaration 引用该位置），**缓存前缀保留**；不支持 tool updates
  的路由在该 step 重写一次前缀。官方 `propose_action` 的 skill 触发激活就是这条路。
- 收益估算：首次工具结果前的每个请求省 507 tokens；纯问答会话永不激活 → 每请求 0（相对 507）；典型
  agentic 会话省首请求的 507；工具晚出现的长会话更多。收益集中在「按 R15 本来就不该出卡」的纯聊天
  会话，方向正确；而工作回合通常首请求就带工具，只省一次。
- 风险/取舍：非工具型工作回合（规划、解释、方案）会失去卡片；首次工具回合的最终回答依赖「中途激活的
  tool-addition / system section 更新被模型及时采纳」（action-cards 有先例；不支持对话内 system 消息的
  模型以 reminder 形式注入，需实测）；实现与测试复杂度中等（per-agent/session 状态、dispose 清理、
  两档激活的回归）。
- 建议：把 `activation: 'always' | 'after-tool'` 做成 raw Host config 字段（默认 `always`），实现后用
  20 个会话 A/B（出卡率、调用率、token/cache 统计）再决定是否改默认；同时评估
  `after-tool-or-second-turn` 这类混合档，弥补非工具工作回合。

### 5.8 Host 单测（`test/normalize.test.mjs`，node:test，零依赖）

覆盖：非对象/坏 JSON、空 context、context 截断、label/prompt 缺失与截断、重复 prompt、同立场、
recommended 冲突、danger 词表（中英）+ 模型标记、6 条上限、optional 压尾、id 稳定性与顺序无关、
`shown/count` 一致性、meta 与 execute 一致性（同一 `buildMeta`）。

M1 落地 **70 个测试**（`normalize.test.mjs` 55、`tool.test.mjs` 15）；M2 增加客户端纯逻辑与数据层测试，合计 **156 个**（`view-model.test.mjs` 62、`definition.test.mjs` 16、`build.test.mjs` 8），`node --test` 全绿。
v4（2026-11-09）提示词分层后 `tool.test.mjs` 增至 **27 个**（新增：description 只含能力与显示规则、schema
承载字段级规则、触发客观清单、两档不确定、重复/结构化提问静音、result 的“写最终回答”指令、分层归属
回归断言）；Host 测试 55 + 27 = **82**，全仓 `node --test` **175** 全绿。
P1（2026-11-09）token 门控新增 4 个 Host 用例（根 agent `when`、registry fail-open、`enabled:false` 不注册、
config 缺省/畸形值）→ `tool.test.mjs` **31**，Host 55 + 31 = **86**；客户端移除 enabled 后
`view-model.test.mjs` **68**、`build.test.mjs` **11**，全仓 `node --test` **181** 全绿。
2026-11-10 移除 Send 模式与 P1 布局：`view-model.test.mjs` 删除点击行为/自动提交/冲突提交计划相关用例，
`card-state.test.mjs` 改为验证状态优先级与 `deriveChipMarker` 单标记（danger > filled > recommended），
`build.test.mjs` 新增「无 Send 模式、无 `submit` 引用、无胶囊 Tag、无「可以不做」」断言；
全仓 `node --test` **206** 全绿。
2026-11-10 冲突态紧凑化：`build.test.mjs` 新增动作与状态同行契约断言（`dshns-statusbar-conflict`、
无 `dshns-conflict-actions`），全仓 `node --test` **207** 全绿。

---

## 6. Client 半详细设计

### 6.1 bundle 骨架与注入

```js
// src/client.js（模板；构建后为 client.js）
window.__ModuleLoader__.load({
  id: '@local/dsh-next-actions',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    /* @inline:view-model */
    /* @inline:styles */

    const NS = 'nextSteps'
    const PKG = '@local/dsh-next-actions'
    const TOOL_NAME = 'suggest_next_steps'
    const KEY = 'next-steps'
    const ORDER = -10

    function apply(ctx) {
      // 1) 字典
      ctx.effect(() => ctx.locale.register(NS, { en: enDict, zh: zhDict }), 'dsh-next-actions: locale')
      // 2) 样式（官方同款 CSS，类名前缀 dshns-；卸载即移除）
      ctx.effect(() => { const el = injectStyles(CSS); return () => el.remove() }, 'dsh-next-actions: styles')
      // 3) 本回合数据折叠（可选服务：拿不到 uiConversation 时静默降级，过程行仍可用）
      const uiConversation = ctx.get('uiConversation')
      if (uiConversation !== undefined) {
        ctx.effect(() => uiConversation.events.register(nextStepsDefinition), 'dsh-next-actions: definition')
      }
      // 4) 卡片
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail', id: PKG, order: ORDER, locale: NS,
      }, NextStepsCard))
      // 5) 过程组一行
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview', key: TOOL_NAME, locale: NS,
      }, ProcessRow))
      // 6) P1 设置（可选服务 uiConversation 不需要；仅 settings.section）
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: PKG, order: 60, label: () => t('settings.title'), locale: NS,
      }, SettingsSection))
    }

    return { inject: ['slots', 'locale', 'uiConversation'], apply }
  },
})
```

- **`uiConversation` 必须声明在 inject 里**：插件要等该服务就绪后再注册 Conversation Definition。
  早期版本用 `ctx.get('uiConversation')` 可选获取，冷启动时服务可能尚未就绪 → 跳过注册、不重试，
  表现为「重启 DSH 后卡片消失」（会话日志里的 meta 仍在）。现已改为声明式注入 + `ctx.uiConversation.events.register`，
  与官方 ui-plan/ui-schedule 的写法一致。`sessions`/`conversation` 仍用 `ctx.get(...)` 可选获取（聚焦失败不影响卡片）。
- bundle 顶层**无副作用**（只有 `ModuleLoader.load` 注册工厂）；CSS 在 `apply` 的 effect 里注入并可清理。

### 6.2 Conversation Definition（本回合数据折叠）

以下为结构示意（省略实现细节），完整实现见 `src/client.js`。

```js
const SURFACE_EVENT_TYPES = new Set(['system/message','developer/message','user/message','assistant/message','tool/result'])
const isSurfaceEvent = (e) => SURFACE_EVENT_TYPES.has(e.type) && e.surfaceOp !== undefined
const isAppendSurfaceEvent = (e) => isSurfaceEvent(e) && e.surfaceOp === 'append'

const RUN_CODE_TOOL = 'run_code'
const runCodeTurns = new Map()                 // run_code callId -> turn（有界 1024）

const nextStepsDefinition = {
  kind: KEY,                                   // 'next-steps'
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') {
      if (event.data.name === RUN_CODE_TOOL) rememberRunCodeTurn(event)   // dispatch 的 turn 来源
      if (event.data.name === TOOL_NAME) return { id: String(event.data.turn), role: 'update' }
      return null
    }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event))
      return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/ptc-dispatch-start' && event.data.name === TOOL_NAME) {
      const turn = ptcTurnOf(event)              // 经 rootCallId 查外层 run_code
      return turn === undefined ? null : { id: String(turn), role: 'start' }
    }
    if (event.type === 'tool/ptc-dispatch' && event.data.name === TOOL_NAME) {
      const turn = ptcTurnOf(event)
      return turn === undefined ? null : { id: String(turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {                // turn 优先取 Match.location，事件上的 turn 兜底
    const calls = new Map()
    if (match.event.type === 'tool/ptc-dispatch-start')
      calls.set(String(match.event.data.subCallId), {
        argsRaw: JSON.stringify(match.event.data.arguments ?? {}),
        seq: match.event.seq,
      })
    return { turn: matchTurn(match), calls, model: null }
  },
  update: (context, match) => {
    // tool/call 与 dispatch-start 记录调用参数；结果分支：
    //   native tool/result：event.data.meta（append 语义）
    //   PTC dispatch：event.data.meta / isError（无需 surfaceOp）
    // 权威 meta → parseMeta；缺失/损坏 → modelFromArgs(call.argsRaw)。
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined || context.state.model === null) return null
    // 发布 { kind:'turn', turn, key: KEY, value: { turn, model } }；值不变时复用 previous。
  },
}
```

- `isAppendSurfaceEvent` 只用于 native `tool/result`（复制官方 ui-schedule 的 append 语义，避免 replacement 副本重复计数）；PTC 的 `tool/ptc-dispatch` 没有 `surfaceOp`，由事件类型本身区分。
- **优先 meta**（Host 规范化的唯一权威），meta 丢失时用 args 兜底（`lib/view-model.js` 的 `modelFromArgs`，
  规则与 normalize 保持保守一致：trim/截断/去重/上限/立场合法化；危险词表常量复制一份）；PTC 的 args 是对象，记录时 `JSON.stringify` 成与 native 相同的字符串形态。
- `buildLocationData` 只在值变化时返回新引用（避免无意义发布）；新增空 state / 非法 turn 守卫，事件窗口从回合中间开始时返回 null 而不是抛错（覆盖审计 B1 的崩溃路径）。
- PTC 事件如何落到同一 turn 键见 §6.2.1；`run_code` 索引与 Match location 的分工也在该节说明。

### 6.2.1 PTC（`run_code`）兼容（2026-11-10）

PTC 预设把工具调用放进 `run_code` 程序：模型直接调用的只有 `run_code`，其余可见工具由 PTC executor 生成 SDK binding。插件 Host 半不变（工具照常注册、`when` 仍按 root agent 门控、`output.schema` 照常进入 PTC SDK 声明），缺的是客户端折叠层：嵌套调用记录的事件与 native 不同。

| 维度 | native | PTC |
|---|---|---|
| 调用事件 | `tool/call`，`arguments` 为 JSON 字符串 | `tool/ptc-dispatch-start`，`arguments` 为对象，调用 id 是 `subCallId` |
| 结果事件 | append 的 `tool/result`，`message` 包结果，`meta` 在事件上 | `tool/ptc-dispatch`，`meta`/`isError`/`content` 直接在 `data` 上，无 `surfaceOp` |
| turn | 事件带 `turn`/`step` | 事件不带；只有外层 `run_code` 的 `tool/call` 带 turn |
| Definition 可见 | `match(event)` 只有事件本身 | 同上；`start`/`update`/`buildLocationData` 的 Match 才有 `location` |

实现（`src/client.js`）：

1. `match` 同时匹配两种 transport，并用有界索引把 `run_code` callId 映射到 turn；dispatch 事件的 turn 键来自该索引（匹配函数在 0.2.2 只收到原始事件，拿不到 location）。
2. `start` 在窗口从 dispatch 开始时记录首个调用；`turn` 优先取 Match 的 `location`，回退事件上的 `turn`（直接调用 Definition 的测试与异常宿主都能工作）。
3. `update` 对 PTC 结果直接读 `event.data.meta`，`isError === true` 时忽略；meta 缺失时用 dispatch-start 记录的对象参数走与 native 相同的 `modelFromArgs` 兜底。
4. `buildLocationData` 增加空 state / 非法 turn 守卫，避免事件窗口从回合中间开始时抛错。

限制：

- 若宿主以非分页方式截出一个从 PTC dispatch 记录开始的窗口（外层 `run_code` 调用不在窗口内），该次 dispatch 没有 turn 索引，不会折叠；分页加载的切点是 `turn/start` 或消息记录边界，页面打开与实时 append 不受影响。
- PTC 下嵌套调用的模型可见结果只有程序返回值；插件 `output.render` 的"现在写最终回答"提示不进入模型上下文，卡片链路不受影响。
- meta 仍只进会话日志、不进模型上下文；与 native 相同。

验证：`test/definition.test.mjs` 以真实会话日志的事件 shape 覆盖 PTC 匹配、turn 解析、meta/args 兜底、`shown:false`、错误与 turn location；另用当前 PTC 会话日志重放真实 `tool/ptc-dispatch` 事件，确认 `turn.data.get('next-steps')` 发布 `shown:true` 模型。

### 6.3 turnTail 卡片

**注册**：`{ name:'conversation.chat.turnTail', id:'@local/dsh-next-actions', order:-10, locale:NS }`
→ props：owner `{turn, seq, openFile}` + 19 标准 props + `t`。

**门控（全部满足才渲染）**：
1. `turn.data.get(KEY)?.model?.shown === true`（Definition 已发布数据）；
2. `turn.end !== undefined` 且 `turn.data.get('turn-tail')?.closing != null`（官方 ActionCardTail 同规则：
   仅有文本回答结束的回合才显示）；
3. 子代理会话不渲染：`useSession((s) => s.subagent) == null`（官方 InputBar 同读法；若字段不可用 → T0-6 降级为配置）；
4. 用户已忽略 → 渲染卡片但控件收起、状态行「已忽略」、右侧「恢复建议」（不隐藏整卡，同官方 dismiss 后表现）。

**DOM（与官方卡逐项对齐）**：

```text
section.dshns-card[aria-label=标题][data-next-steps-card]
  div.dshns-body
    <FoldedText context>                    ← 官方同款折叠说明（FOLD_WIDTH=260，CJK 双宽）
      svg.dshns-mark                        ← 16px 品牌小标（列表+星火，实色填充，行首内联）
      text                                  ← 上下文行，13px/1.6 label-secondary
    div.dshns-controls                      ← 建议按钮（推荐 primary sm / 其余 ghost sm；默认 3 条）
      button.dshns-btn-primary/ghost.dshns-chip
        span.dshns-chip-label               ← 建议短标签（单行省略）
        span.dshns-marker                   ← 至多一个内联文本标记（推荐 / 已填入 / ⚠需确认）
      button.dshns-toggle「还有 N 条」      ← 官方同款 ghost 小按钮（Card .toggle 样式）；展开后显示「收起」
    div.dshns-preview[role=note]            ← 按需出现：悬停/聚焦时位于控件行下方
      span.dshns-preview-label「将填入」
      text                                  ← 该条完整指令，2 行 clamp
    div.dshns-conflict                      ← 仅冲突态：替代 controls + preview，只放对比框
      div.dshns-conflict-compare[role=note]
        p.dshns-conflict-line               ← span 标签「将填入」 + span 目标指令（单行省略）
        p.dshns-conflict-line               ← span 标签「当前草稿」 + span 草稿（单行省略）
    div.dshns-statusbar[.dshns-statusbar-conflict]  ← 一行：左侧状态文字 + 右侧状态动作
      p.dshns-status[role=status]           ← 已填入/冲突/已忽略/危险警示/输入框不可用（无文字时省略）
      button.dshns-btn-primary.sm「追加到末尾」  ← 仅冲突态；与状态文字同一行（窄列可换行）
      button.dshns-btn-ghost.sm「替换」          ← 仅冲突态
      button.dshns-btn-ghost.sm「取消」          ← 仅冲突态
      button.dshns-btn-ghost.sm.dshns-dismiss   ← 建议态：16px「−」图标 + 12px「暂不需要」（高 28px）
      button.dshns-btn-ghost.sm.dshns-restore   ← 已忽略态：16px「+」图标 + 12px「恢复建议」
```

> **2026-11-09 卡片改版（实机反馈）**：去掉可见标题 `strong.dshns-title`（`aria-label` 仍为「下一步建议」），
> 上下文成为第一行、行首内联 16px 品牌小标；上下文样式由 13px/1.7、`margin-top:8px` 调整为 13px/1.6、无上边距，
> body 上内边距 12→14px。小标用实色而非渐变，避免同页多卡共享 `id` 的 SVG defs 冲突。设置项「显示标题」随之移除。
>
> **2026-11-09 第二轮改版（v0.7）**：去掉 `footer.dshns-footer`，忽略动作改为 `div.dshns-statusbar` 右端的
> 28×28 ghost 图标按钮（16px 减号，`title`/`aria-label` 仍为「暂不需要」）。状态文字左对齐、减号右对齐；
> 只有建议态出现减号（冲突态只有文字）。卡片因此比官方卡少一条 footer、约矮 40px。
>
> **2026-11-09 第三轮改版（v0.8）**：减号的对偶操作——已忽略态在同一位置显示 28×28 加号
> （`dshns-restore`，`aria-label`「恢复建议」），点击把 `dismissed` 写回 `false`，控件、预览与状态恢复；
> 状态文字「已忽略」不消失，直到用户恢复。两个图标共用同一组 `.dshns-dismiss` / `.dshns-restore` 尺寸样式。
>
> **2026-11-10 第四轮改版（v0.9 / P1 布局）**：默认只显示 3 条（`DEFAULTS.maxPerTurn = 3`），其余进
> 「还有 N 条」；预览改为按需（`preview !== null` 才渲染，位于控件行下方，带 `preview.label`，2 行 clamp），
> 不再保留 56px 固定槽；chip 内状态收敛为 `deriveChipMarker` 的单标记（danger > filled > recommended，
> 移除 `dshns-tag` 与「可以不做」）；忽略/恢复改为 12px 文字 ghost 按钮（`width:auto`、`padding:0 8`）；
> 冲突态改为「将填入 / 当前草稿」对比框 + `appendPrimary`（追加到末尾，primary）；危险标记改用
> `--dsw-alias-state-warn-primary` 的 12px 警告图标（文字仍为 label-secondary）。Send 模式及其设置、
> 自动提交判断、冲突提交计划、「已发送」状态一并删除。
>
> **2026-11-10 冲突态紧凑化**：删除独立 `.dshns-conflict-actions` 行；冲突态的「追加到末尾（primary）/
> 替换 / 取消」由 `conflictActions` 交给 `.dshns-statusbar` 渲染，与状态文字「输入框已有内容」同一行
> （`.dshns-statusbar-conflict { margin-top:8px; flex-wrap:wrap; row-gap:8px }`），`.dshns-conflict`
> 只保留对比框。宽列 748px 实测默认 134px → 冲突 158px（差 24px，验收 ≤25px）；窄列换行情况待视觉证据实测。

**交互**：

```js
function onPick(suggestion) {
  if (!canWrite) return
  const applied = appliedRef.current
  const action = resolveDraftAction({
    draft,
    appliedPrompt: applied !== null && applied.owned === true ? applied.text : '',
  })
  if (action.kind === 'conflict') { setConflict(suggestion); setPreview(null); return }
  applyFill(suggestion.prompt, suggestion)          // 空草稿 / 本人未编辑 → 直接替换
}
function applyFill(text, suggestion, owned = true) {
  if (!canWrite) return
  const danger = suggestion.danger === true
  inputActions.setDraft(text)                       // 只填草稿；bundle 内不存在 submit 调用
  appliedRef.current = { id: suggestion.id, text, prompt: suggestion.prompt, danger, owned }
  const next = { ...turnState, filledId: suggestion.id }
  setTurnState(next); writeTurnState(sessionId, turnNumber, next)
  setConflict(null); setPreview(null)
  focusComposer(sessionId)                          // ctx.get('conversation')?.input.shell(sessionId)?.focus()，可选/容错
}
function onConflictChoice(choice) {
  if (conflict === null) return
  setConflict(null); setPreview(null)
  if (choice === 'cancel') return
  const merged = mergeDraft({ mode: choice, draft, prompt: conflict.prompt })  // append: draft.trimEnd() + '\n\n' + prompt
  if (merged === null) return
  applyFill(merged, conflict, choice === 'replace')  // 追加产生的合并草稿 owned=false，下次重新确认
}
function dismiss() {
  const next = { ...turnState, dismissed: true }
  setTurnState(next); writeTurnState(sessionId, turnNumber, next)
  setConflict(null); setPreview(null)
}
function restore() {
  const next = { ...turnState, dismissed: false }
  setTurnState(next); writeTurnState(sessionId, turnNumber, next)
  setConflict(null); setPreview(null)
}
```

细节：
- **草稿归属判定**用字符串相等（`draft === applied.text`），`draftRev` 作为辅助（T0-4 实测语义）；
  用户编辑过 → 草稿不相等 → 走冲突确认（不静默覆盖）。追加产生的合并草稿 `owned === false`，
  下次点击重新确认（不静默覆盖用户内容）。
- **点击永远只填入**：`applyFill` 只调用 `inputActions.setDraft` + `focusComposer`；bundle 内不存在
  `submit` 调用路径（2026-11-10 移除 Send 模式与点击行为设置，`build.test.mjs` 断言）。
- 危险建议：带「⚠ 需确认」内联标记；填入后状态行显示「该操作可能不可逆，请确认后发送」。
- **单内联标记**：`deriveChipMarker({ suggestion, filledId })` 按 danger > filled > recommended 只返回
  一个标记；`optional` stance 只影响排序，不生成标记；`dshns-tag` 胶囊与「可以不做」文案已移除。
- **按需预览**：只有 `mode === 'suggestions' && preview !== null` 时渲染 `div.dshns-preview[role=note]`，
  位于控件行下方；`preview` 由 chip 的 mouseenter/focus 设为该条 prompt、mouseleave/blur 清空，填入/
  冲突/忽略时也会清空。预览不是按钮，点击不触发填入；触屏无悬停，点建议直接填入。
- **默认 3 条 + 「还有 N 条」**：`DEFAULTS.maxPerTurn = 3`，`buildDisplay` 切片并给出 `moreCount`；
  「还有 N 条」展开为模型给的全部建议（最多 6），再点「收起」还原。
- 状态行右侧按钮：建议态「− 暂不需要」（忽略），已忽略态「+ 恢复建议」；两个方向都把 `dismissed`
  写入 localStorage 的 turn 状态，卡片保留。
- **冲突态**：`div.dshns-conflict` 只放对比框（目标指令与当前草稿各一行省略）；三个动作
  `appendPrimary`（primary）/`replace`/`cancel` 由状态行渲染（`conflictActions`），与「输入框已有内容」
  同一行（`.dshns-statusbar-conflict`，窄列可换行）；选择经 `mergeDraft` 合并后同样走 `applyFill`，只填入。
- 输入框不可写（`inputActions.setDraft` 缺失/禁用）时按钮禁用，状态行「输入框暂不可用」。
- 卡片不渲染时返回 `null`（不占空间）；历史轮次：同一组件按 turn 重新挂载，数据来自日志，状态来自 localStorage。

M3 实现注记（均可单测或代码审查）：
- **追加后的草稿视为用户内容**：`追加到末尾` 只是本次填入，下一次点击不再"静默替换"，而是重新走冲突确认；
  只有空草稿填入 / 纯替换（以及建议原样未改）才算"我们的草稿"。
- 输入框不可写（`inputActions.setDraft` 缺失或禁用）时，按钮禁用且状态行显示"输入框暂不可用"。
- **状态行优先级（2026-11-10 修订）**：输入框不可用 > 已忽略 > 冲突 > 已填入/危险警示；
  忽略后卡片保留但控件收起（同官方 dismiss），状态行右侧换成「恢复建议」。
- **冲突态高度（2026-11-10 紧凑化）**：动作与状态同行、无独立动作行；748 列实测默认 134px → 冲突
  158px（差 24px，验收 ≤25px）；窄列换行情况待视觉证据实测。
- **「已填入」/危险警示按草稿派生（2026-11-10 P0 修复）**：只有草稿仍等于本卡本次写入的文本，或刷新后
  仍等于该建议的 prompt 时，才显示 filled 标记与危险警示；编辑、清空、刷新后不保留误报。危险标记取自建议
  数据，因此持久化的 filledId + 匹配草稿在重载后仍能显示警示。对应纯逻辑集中在 `lib/view-model.js` 的
  `deriveActiveFill` / `deriveCardView` / `deriveChipMarker`，状态组合由 `test/card-state.test.mjs` 覆盖。
- 首屏默认显示 3 条（`DEFAULTS.maxPerTurn = 3`）；「还有 N 条」就地展开为完整 6 条，再点「收起」；
  设置选 Auto 时全部显示，不出现该入口。

**FoldedText**：照抄官方实现（`Intl.Segmenter` grapheme + 宽字形双宽 + 260 预算 + `…` + ghost 展开/收起），
类名改写为 `dshns-text/ dshns-toggle`。

### 6.4 过程组一行（`tool.call.toolview`）

注册 `{name:'tool.call.toolview', key:'suggest_next_steps', locale:NS}`；组件 props：
`{phase, block, callId, toolName, inspect, t}`（+ session 标准 props，本行不需要）。

**状态映射**（照抄官方 ProposeRow 的 `stateOf`，并扩展"成功但未显示"）：

```js
function stateOf(props) {
  if (props.phase === 'preparing') return 'preparing'
  if (props.phase === 'start') return 'running'
  if (props.block.error?.code === 'interrupted') return 'stopped'
  if (props.block.isError) return 'error'
  const meta = props.phase === 'result' ? safe(parseMeta(props.block.meta)) : null
  if (meta !== null && meta.shown === false) return 'error'   // 「未显示」：成功但无卡片；原因 = meta.note
  return 'ok'
}
const reason = props.phase === 'result'
  ? (props.block.isError ? textOf(props.block.content)
     : (safe(parseMeta(props.block.meta))?.shown === false ? parseMeta(props.block.meta).note ?? '' : ''))
  : ''
```

**渲染**（自绘官方同款 DisclosureRow，类名 `dshns-*`）：
- 外层 `div[data-tool="suggest_next_steps"][data-state]`；
- 行首 icon（官方 `apps-add-outline` 14px）+ 标题 `t('row.title')`（「下一步建议」）；
- `collapsedContent = span.summary > span{状态文案} + span.title{context 摘要（单行省略）}`
  （context 取 meta.context 或 `block.args.text('context')`，preparing 阶段可能为空）；
- `running = preparing|running`（启用 shimmer，照抄 TextShimmer 结构/样式）；
- `expandOnRowClick = reason !== ''`、`open = expanded && reason !== ''`、`keepContentWhenOpen = true`；
- 展开内容：`pre` 原因框（官方 ProposeRow 同款样式）+ `button.inspect`「查看调用」（`inspect?.()` 存在时）；
- 行内**不渲染**建议按钮。

M5 实现注记：
- 过程行状态统一由 `deriveProcessState` 推导（`preparing/running/ok/error/stopped`），"调用成功但 `shown:false`"
  映射为「未显示」，展开原因取 meta.note 并走 `noteToLocaleKey` 本地化；`isError` 时展开原因是结果文本。
- 摘要（collapsedContent）= 状态文案 + 本回合 context 片段（`meta.context` 或 `block.args.text('context')`），单行省略。
- 只有"有原因"时整行可展开/可键盘 Enter/Space；展开内容是官方同款 reason `pre` 框 +「查看调用」（`inspect` 存在时）。
- 官方 running 态的 **TextShimmer 已按官方实现复刻**：`TextShimmer`/`ShimmerText` + 上下文标记避免高亮层重复装饰，
  CSS（`dshns-shimmer-*`、两条 keyframes）照抄官方值，`prefers-reduced-motion` 下关闭装饰与动画；
  `running = preparing | running` 时作用于标题与摘要。

### 6.5 设置页（P1，紧随 MVP 之后）

**已实现（M6，2026-11-10 更新）**：`settings.section`（root scope，`id`=包名，`order:60`，`label` 走 locale）
渲染：每轮条数（**自动 / 1–6** 分段控件；默认 3，自动=显示模型本轮给出的全部有效建议）、
重置卡片状态（清理 `dsh-next-actions:v1:turn:*`）、"点击建议只会填入输入框，不会自动发送；危险建议会标记
「需确认」"说明，以及 P1 起顶部的只读 Host 门控提示（`settings.hostGate`：卡片总开关在插件 Host config，
关闭后不注册工具与提示词）。控件使用抄自官方的 SegmentedControl 的 markup/CSS（`dshns-segmented`）；
M6 的 Switch、点击行为行随客户端 `enabled` / Send 模式一并移除。设置写入 localStorage
（`dsh-next-actions:v1:settings`），下一轮生效；重置只清卡片状态，不动设置。设置分区无 session kit，
因此不依赖会话作用域。


注册 `{name:'settings.section', id:'@local/dsh-next-actions', order:60, label:()=>t('settings.title'), locale:NS}`；
root scope，只有 `{close}`，没有 session kit。

行（P1 后）：
| 行 | 控件 | 存储 |
|---|---|---|
| Host 门控提示 | 只读 `p.dshns-setting-note`（指向 profile patch 的 `enabled`） | —（Host config） |
| 每轮条数 | SegmentedControl「自动 + 1–6」（默认 3） | localStorage `maxPerTurn` |
| 重置卡片状态 | 文案按钮（清「已填入/已忽略」） | localStorage |
| 说明文字 | `p`（"点击建议只会填入输入框，不会自动发送；危险建议会标记「需确认」"） | — |

- 偏好纯 client-local（不跨浏览器）；设置变更**下一轮**生效（Host 返回值始终 1–6，客户端只做展示裁剪）；
- 控件样式从官方 primitive 抄（SegmentedControl 已落地；Switch 随客户端 `enabled` 移除、Tag 随 chip 胶囊移除，不再需要提取）。

### 6.6 i18n

`ctx.locale.register('nextSteps', { en, zh })` 在 `apply` 的 effect 中注册（en/zh 为 baseline，成对必需）；
slot 注册 `locale:NS` 后组件拿到 `t`。词表（§附录 D）：卡片 `aria-label`（不做可见标题）、更多/收起、暂不需要/恢复建议、
已填入/冲突/危险提示、「将填入」预览前缀、「将填入 / 当前草稿」对比标签、追加到末尾/替换/取消、推荐/已填入/需确认、
行状态（正在准备建议/正在生成建议/已生成/未显示/已中断）、查看调用、设置页文案、兜底上下文句。
包 `locale/{en,zh}.json` 仅放 `meta.title`/`meta.description`。

### 6.7 样式注入

```js
function injectStyles(css) {
  const el = document.createElement('style')
  el.dataset.plugin = PKG
  el.dataset.pluginCss = PKG + '/client.css'
  el.textContent = css
  document.head.appendChild(el)
  return el
}
```

- 所有类名前缀 `dshns-`，只引用 `--dsw-alias-*` / `--dsw-radius-*` / `--dsw-font-*` token（照抄值见附录 A/B）；
- 不自称官方类名（避免与官方卡样式冲突）；
- `apply` 的 effect 返回 remove，插件禁用/卸载即清理；
- 组件内不放全局样式；不替换 app root；不 append `document.body`。

### 6.8 本地状态（localStorage）

```text
dsh-next-actions:v1:settings            → { maxPerTurn: 3 }   (合法值 'auto' | 1–6；旧 `enabled` / 点击行为字段读取时丢弃)
dsh-next-actions:v1:turn:<sid>:<turn>   → { dismissed:boolean, filledId?:string }
dsh-next-actions:v1:stats               → { shown, clicked, filled, dismissed, since }   (P2)
```

- 卡片总开关不在 localStorage（P1 移到 Host config，见 §5.7.2）；key 含 sessionId + turn，状态只记建议 `id` 与 dismissed；只存小 JSON；
- `clampSettings` 只返回 `{ maxPerTurn }`：旧 JSON 里的 `enabled` 与点击行为字段在读取时被丢弃，下一次写入后不再存在（2026-11-10）；
- 读写 try/catch（隐私模式/配额）；版本前缀 `v1`，升级时清旧；
- 多标签页：`window.addEventListener('storage', ...)` 同步「已忽略」（P1）；
- 每会话最多保留 200 轮状态（LRU 裁剪）；不存任何建议正文/模型文本（meta 在会话日志里）。

### 6.9 场景过滤

- 子代理/团队内部会话：`useSession((s) => s.subagent) != null` → 卡片返回 `null`；
- 定时任务会话（若有）：按 session 来源字段判断，T0-6 确认字段名；无法判断则默认渲染（可接受）；
- 纯工具轮/中断/无文本回答：`turn.data.get('turn-tail')?.closing == null` → 不渲染（官方同规则）；
- 过程组行不受上述过滤（它就是工具调用记录）。

---

## 7. 契约汇总

### 7.1 工具契约

| 项 | 值 |
|---|---|
| name | `suggest_next_steps` |
| 参数 | `{context: string, suggestions: [{label, prompt, stance?, recommended?, danger?}]}`（1–6 条，raw JSON Schema 见 §5.3） |
| 返回值（canonical） | `{shown: boolean, count: integer}` |
| 模型可见 render | shown→`Next steps shown below your answer (N). Do not restate them.`；否则→`No next steps shown. Answer normally; do not mention this.` |
| `tool/result.meta` | `{shown, context?, suggestions?[{id,label,prompt,stance,recommended?,danger?}], note?}` |
| 副作用 | 无（纯函数、零 I/O、零网络） |
| 审批 | 默认 allow；Auto review 模式下会被模型审查（用户主动选择） |
| 错误 | 永不 throw；异常输入 → `shown:false` + note |

### 7.2 客户端数据契约

- Definition kind：`next-steps`；`turn.data.get('next-steps') = { turn, model }`；
- PTC transport：`tool/ptc-dispatch-start`/`tool/ptc-dispatch` 折叠进同一 `turn.data.get('next-steps')`；turn 由外层 `run_code` 调用索引 + Match location 解析，`meta` 与 native 同契约（§6.2.1）；
- `model` = 解析后的 meta：`{shown, context?, suggestions?, note?}`；
- turnTail props：`{turn: TurnLocation, seq, openFile}` + 19 标准 props（§2.2）；
- toolview props：`{phase, block, callId, toolName, inspect, ...}`；`block.meta` 可取；
- 客户端设置：`{ maxPerTurn: 3 | 'auto' | 1–6 }`；点击行为设置已不存在（2026-11-10）；
- localStorage schema 见 §6.8。

---

## 8. 错误处理与降级矩阵

| 情况 | 表现 | 降级 |
|---|---|---|
| 模型未调用工具 | 无卡片、无过程行；一切正常 | — |
| 参数非法/空/context 缺失 | `shown:false` + meta.note；无卡片；过程行「未显示」可展开原因 | — |
| `tool/result.meta` 丢失（压缩/旧日志） | Definition 用 `tool/call.arguments` 兜底解析（保守规则） | 若 args 也不可用 → 无卡片 |
| PTC `tool/ptc-dispatch` 缺 meta（压缩/旧日志） | 用 dispatch-start 记录的对象参数兜底解析（与 native 同一套保守规则） | 若 args 也不可用 → 无卡片 |
| 异常窗口从 PTC dispatch 记录开始（外层 `run_code` 调用不在窗口内） | 该次调用没有 turn 索引，不折叠 → 无卡片 | 分页切点在 `turn/start` 或消息边界，正常加载与实时 append 不产生该窗口 |
| 事件窗口从回合中间开始、没有 start Match | `buildLocationData` 返回 null，不抛错 | 不显示该轮卡片（审计 B1 修复） |
| `uiConversation` 服务不可用 | Definition 不注册；卡片不可用；**过程行仍工作**（toolview 不依赖它） | console.warn 一次 |
| `conversation` 服务不可用 | 仍可 `inputActions.setDraft`（标准 prop）；无自动聚焦 | 提示用户手动点输入框 |
| `inputActions` 缺失（非 session 作用域/异常宿主） | 卡片按钮禁用并提示 | 不应发生（turnTail 为 session scope） |
| 输入框已有内容 | 不覆盖，显示「将填入 / 当前草稿」对比；「追加到末尾/替换/取消」与状态文字同一行（无独立动作行） | 取消 = 不改；三种选择都只填入；冲突态高度差超预算时查 `.dshns-statusbar-conflict` 是否生效/是否换行 |
| 草稿被用户在别处修改 | 字符串比对发现不一致 → 冲突确认 | 同上 |
| 子代理会话 | 不渲染卡片 | 过程行仍显示 |
| 回合无文本回答/中断 | 不渲染卡片（closing 判定） | — |
| 用户点状态行「暂不需要」 | 控件收起、状态行「已忽略」、按钮变「恢复建议」、卡片保留 | localStorage 记录；重置入口在设置页 |
| 建议超过设置条数 | 客户端默认显示前 3 条，其余「还有 N 条」；Auto 时全部显示 | Host 始终 ≤6 |
| 危险建议 | 「⚠ 需确认」内联标记（警告图标用 `--dsw-alias-state-warn-primary`）；填入后警示；永不自动发送 | — |
| 内存/性能：长会话 | 每轮最多一张卡；Definition 仅折叠本工具事件（O(事件数)） | 卡片随轮次渲染，无全表重排 |
| 重启后「已忽略/已填入」标记 | 2026-11-09 实机：**设置项跨重启保留成功**（GUI URL 端口虽变化，Electron 页面分区仍保留了 localStorage）；卡片标记的跨重启复验未单独进行 | 若后续发现标记丢失：改用 Host 侧存储/自定义 RPC，或接受该限制 |
| 模板/构建漂移 | `test/build.test.mjs` 在 CI/提交前失败 | 跑 `node scripts/build-client.mjs` |

---

## 9. 安全与隐私

1. **零自动发送**：2026-11-10 起 Send 模式与点击行为设置已删除，bundle 内不存在 `submit` 引用（`build.test.mjs` 断言）；点击只写草稿 → 用户发送前必有人工确认。冲突态的三个动作（「追加到末尾 / 替换 / 取消」）同样只走 `setDraft`，紧凑布局不改变安全边界。
2. **零网络/零文件/零凭据**：Host 工具是纯函数；Client 不 fetch、不读 cookie/localStorage 之外的数据。
3. **模型输出不可信**：所有字段 trim/截断/白名单校验；danger 词表兜底；建议不进正文、不执行。
4. **注入面**：建议文本可能受不可信内容（网页/文件）影响；由于只填入草稿、不自动发送、不自动执行，
   风险收敛为"用户可能误点填入"，危险建议有显式警示。
5. **权限**：不申请审批扩展；默认 allow 由平台保证；不注册 `tools/pre-execute` 监听、不绕过 Auto review。
6. **数据**：meta 写入用户自己的会话日志（与工具结果同级别），不额外复制到别处；本地状态不含正文。
7. **卸载**：effect 清理字典/样式/slot/Definition；localStorage 残留由 key 前缀可识别（提供重置）。
8. **PTC 记录同属会话日志**：`tool/ptc-dispatch` 的 meta 与 native 的 `tool/result.meta` 走同一展示通道，不新增注入面；嵌套调用的 content 仅进日志，不进模型上下文。

---

## 10. 测试方案

### 10.1 单测（node:test，零依赖，`node --test`；在插件目录执行，Node ≥20 自动发现 `test/*.test.mjs`）

| 文件 | 覆盖 |
|---|---|
| `test/normalize.test.mjs` | §5.6 全部规则；meta/execute 一致性；id 稳定性；边界（6 条上限、空、坏类型） |
| `test/view-model.test.mjs` | `parseMeta` 防御（缺字段/超大/多余字段）；`modelFromArgs` 兜底；`buildDisplay`（默认 3 条/Auto/推荐顺序/optional 压尾）；草稿冲突状态机（空/本人草稿/用户编辑/追加）；`deriveChipMarker`；设置 clamp（无点击行为项）；storage key/hash；危险词表 |
| `test/card-state.test.mjs` | 卡片状态组合：filled 标记按草稿派生、danger 只在生效填入时出现、状态行优先级、预览回退、单标记优先级、冲突合并 |
| `test/definition.test.mjs` | Conversation Definition：native `tool/call`+`tool/result` 与 PTC `tool/ptc-dispatch-*` 两条链路的 match/fold/turn location；meta 优先与 args 兜底；空 state 守卫 |
| `test/build.test.mjs` | `client.js` 与 `src/*` 一致（`--check`）；模板内联区存在；无 Send 模式/`submit` 引用/胶囊 Tag/「可以不做」；冲突动作与状态同一行（`dshns-statusbar-conflict`，无 `dshns-conflict-actions`） |

### 10.2 手工 E2E（装插件后逐条执行，对应形态稿 §12）

1. 普通问答 → 过程组一行「下一步建议 · 已生成」；卡片出现在回答下方、官方卡上方；
2. 卡片与官方卡并排比较：宽度/圆角/描边/说明字号/说明折叠/按钮尺寸/状态行（两卡差异在标题、footer/状态行文字切换、按需预览三处）；
3. 点击建议 → 只填入输入框、不发送；光标在末尾；状态行「已填入输入框，可修改后发送」，chip 显示单个「已填入」标记；
4. 输入框已有文字 → 点击出「将填入 / 当前草稿」对比，状态行同一行出现「追加到末尾/替换/取消」；三种都验证且都只填入；量测冲突态与默认态高度差（748 列参考 24px，验收 ≤25px）；
5. 连续点不同建议（未编辑）→ 直接替换不询问；编辑后再点 → 出确认；
6. 危险建议 → 「⚠ 需确认」标记 + 填入后警示；任何操作都不会发送；
7. 默认显示 3 条，「还有 N 条」展开/收起；推荐在首位；可跳过类建议压尾但不显示标记；
8. hover/focus 出现「将填入」预览、移开收起，chip 行不位移；点击预览不填入；
9. 过程组行：折叠过程组后卡片仍可见；「未显示」可展开原因 +「查看调用」；
10. 状态行右侧「− 暂不需要」→ 控件收起 + 状态行「已忽略」+ 按钮变「+ 恢复建议」+ 卡片保留；再点它 → 控件与状态恢复；
11. 刷新页面/重启 DSH → 卡片、状态保留；
12. fork 会话 → 历史建议随历史显示；
13. 子代理/团队任务 → 内部轮次不显示卡片；
14. 纯工具轮/中断轮 → 不显示卡片；
15. 关闭插件（Plugins 页禁用）→ 卡片与过程行消失、无残留样式；
16. 重新启用 → 恢复；
17. 中英文界面/中英文对话 → 文案与建议语言正确；
18. 长会话 100+ 轮 → 滚动与渲染无明显卡顿；
19. PTC 预设会话：模型通过 `run_code` 调用 `suggest_next_steps` → `run_code` 过程组内出现「下一步建议 · 已生成」，回答下方出现卡片；刷新后卡片保留；
20. 分别用 native 与 PTC 预设的新会话各跑一轮 → 两种链路的卡片行为一致（内容、点击、忽略/恢复）。

### 10.3 视觉一致性核对（官方卡是活体基准，三处有意差异见 §6.3 注）

逐项对比 DOM/样式（用浏览器 DevTools 检查官方卡「个性化推荐」与我们的卡）：
- `.card` 等价类：border `.5px solid var(--dsw-alias-border-l2)`、`border-radius: var(--dsw-radius-lg)`、
  `background: var(--dsw-alias-bg-layer-1)`、`margin: 16px 0`、`overflow: hidden`、`font-family: var(--dsw-font-family)`；
- 官方 `.body` 内边距 `12px 20px 20px` / 本卡 `14px 20px 18px`；官方 `.title` 16px/500/1.5 / 本卡无标题；
  官方 `.text` 13px/1.7 secondary、margin-top 8 / 本卡 `.text` 13px/1.6、margin 0（品牌小标行首内联）；
- `.toggle` 展开按钮：height auto、min-height 24、padding-inline 0、font-size 12（两边相同）；
- 官方 `.status` 12px/1.6、margin-top 12；本卡 `.statusbar` 一行（margin-top 12、min-height 28），
  文字 12px/1.6、margin 0，右端 28px 高带文字切换（建议态 `.dshns-dismiss`「− 暂不需要」/ 忽略态
  `.dshns-restore`「+ 恢复建议」，12px 文字 + 16px 图标，padding 0 8）；
- 本卡扩展：`.dshns-marker` 11px/18、label-secondary（primary chip 内 inherit + opacity .78），
  `.dshns-warn` 12×12、`--dsw-alias-state-warn-primary`；`.dshns-preview` 12px/1.6、radius-sm、
  module 底、padding 6 10、2 行 clamp；`.dshns-conflict-compare` 12px/1.6、radius-sm、module 底、padding 8 10；
  对比框标签与预览前缀 11px、label-tertiary；
- 冲突态高度：748px 宽列用夹具/实机量 border-box 高度，默认 134px、冲突 158px（差 24px，验收 ≤25px）；
  `.dshns-statusbar-conflict` 生效（margin-top 8、flex-wrap wrap）、无独立 `.dshns-conflict-actions` 行；
  窄列（约 390px）动作换行后的高度按同一口径单独测量；
- 官方 `.footer` `justify-content:flex-end; gap:12px; margin-top:12px`；本卡已删除 footer；
- Button sm：height 28、font-size 12、padding 0 10、radius `--dsw-radius-sm`；primary/ghost 颜色 token 同官方；
- 过程行：row 高 `24px + var(--dsh-content-font-delta,0px)`、gap 8、margin-left 8、font-size 12；
  原因框 `--dsw-radius-lg` + `--dsw-alias-bg-layer-1` + padding 12 + 12px；inspect 链接 `--dsw-alias-link`。

### 10.4 预算测量

- token：在 DSH token meter / 会话统计里对比"启用 vs 禁用"插件前后同一提示的请求 token；
- 延迟：DevTools Performance 记录点击 → 输入框出现文本；
- meta 体积：会话日志 `tool/result.meta`（native）或 `tool/ptc-dispatch.meta`（PTC）序列化长度（常规 <1.5KB）。

---

## 11. 安装、调试与回滚

### 11.1 安装（后续阶段执行；本阶段不做）

1. 在 `plugins/dsh-next-actions/` 完成代码与测试（`node --test`、`node scripts/build-client.mjs --check`）；
2. 用 `plugin_manager` 的 `install_bundle` 安装**绝对目录**（不要手改 profile 文件）；本机 `link:` 安装
   不影响 Host（零 import），客户端单文件也不需要模块解析；
3. 安装后**重启 DSH**（替换已安装包必须重启；首次安装可能经 HMR 激活，但 client 代码刷新后最稳）；
4. 验证：
   - `cordis_inspect_query host Config.listConfigs {name:"@local/dsh-next-actions"}` → 行存在（无 Config 状态为 absent 属预期）；
   - `Slots.listSubTree {root:"conversation.chat.turnTail"}` → 含 `@local/dsh-next-actions`；
     `{root:"tool.call.toolview"}` → 含 key `suggest_next_steps`；
   - 发一轮普通问答，按 §10.2 执行。

### 11.2 开发回路

- Client 改动：改 `src/` → `node scripts/build-client.mjs` → **刷新页面**（本插件不是 dev watcher 构建产物，
  不要期望自动 HMR；若 DSH 侧有 watcher 则另说）；
- Host 改动：重启 DSH；
- 卸载：`plugin_manager` `remove_bundle` 或禁用；确认 slot/样式/工具无残留。

### 11.3 失败排查

| 症状 | 检查 |
|---|---|
| 插件 inactive | 安装错误、`dsh.client` 清单、`exports['./client']` 是否存在、重启 |
| 卡片不出现 | `turn.data.get('next-steps')` 是否有值（Definition 是否注册）；closing 判定；子代理过滤；`shown` |
| 过程行不出现/回退成通用行 | key 拼写/工具名是否一致（key 域开放，typo 不报错只是不渲染） |
| 填入无反应 | `inputActions` 是否拿到（session scope）；`setDraft` 是否被 frozen phase 拒绝 |
| 样式错位 | 类名前缀冲突、CSS 是否在 apply 中注入、token 是否存在 |
| 冲突态偏高/超出预算 | `.dshns-statusbar-conflict` 是否生效（margin-top 8、flex-wrap wrap）；动作是否换行；是否残留独立 `.dshns-conflict-actions` 行 |
| 模型不调用工具 | description 是否够清晰；Auto review 是否拦截；模型是否已有相似工具 |

---

## 12. T0 验证清单（实现前 / 安装后 0.5 天）

> 本阶段（不安装）已完成第 0 列的静态核对；标记 **[静态已证]** 的无需再验，其余需装一次插件。

| # | 待验证 | 当前状态 | 方法 | 判定标准 | 失败兜底 |
|---|---|---|---|---|---|
| T0-1 | `tool/result.meta` 能被客户端 Conversation Definition 读到 | [静态已证] 事件含 meta；客户端定义可折叠事件 | 装插件发一轮，Definition 里 console.log `match.event.data.meta` | 能拿到完整 meta | 用 `tool/call.arguments` 兜底（已内置路径） |
| T0-2 | turnTail 条目能读 `turn.data.get('next-steps')` | [静态已证] 官方 ActionCardTail/ui-schedule 同模式 | 卡片日志打印 turn.data keys | 有值且渲染 | 改用它法（keyedHooks/turnDataSource 或 useChat 扫描） |
| T0-3 | `ctx.get('conversation')?.input.shell(sessionId)?.focus()` 外部可用 | [结构已证] 服务字段公开；跨插件调用未文档化 | 卡片填入后调用 focus | 光标进入输入框 | 去掉 focus（仅 setDraft；提示用户点输入框） |
| T0-4 | `setDraft` 后 `draft`/`draftRev` 语义（是否 ours、编辑后变化） | [静态已证] 字段存在、rev 规则 | 点击 → 读 useInput；输入一个字符再读 | `draft===prompt` 且 rev 变化符合预期 | 仅用字符串相等判定（已实现） |
| T0-5 | 默认权限模式不弹审批 | [静态已证] 默认 allow；唯一 ask 源=Auto | 默认模式发一轮调用工具 | 无审批卡、无 `approval/asked` | 若弹：查 listeners；Auto 模式属预期 |
| T0-6 | 子代理会话识别 | [静态已证] `useSession(s=>s.subagent)` 官方读法 | 在子代理会话观察 | 卡片不渲染 | 改为设置开关/默认渲染 |
| T0-7 | 官方卡/过程行视觉比对（含 SegmentedControl 与状态行文字按钮的缺省样式） | 样式值已提取；卡片已按 2026-11-10 P1 布局复核 | DevTools 对比 + 截图 | 肉眼一致 | 先补提取（同 live-asar 方法）再对齐 |
| T0-8 | token 实测（声明+往返） | 预算见 §5.7 | token meter 前后对比 | ≤370/请求（v4 实测 364）、≤120/轮 | 优先压缩 schema 描述/引导文案 |
| T0-9 | 构建脚本与产物一致 | 待写 | `node --test test/build.test.mjs` | 通过 | — |
| T0-10 | 模型调用率与上下文质量 | 待装 | 20 轮普通任务统计 | 调用率 ≥90%，context 通顺、按钮可用 | 调 description / 加 system-prompt 短句（P2 备选） |

---

## 13. 实施顺序（无时间承诺，按依赖排序）

| 步骤 | 内容 | DoD |
|---|---|---|
| M0 | 脚手架：package.json / patch / locale / icon / 空 client / README | 装上后插件可见（无 UI），无报错 |
| M1 | Host：normalize.js + index.js + 单测 | `node --test` 全绿；工具可在会话中调用，meta 入日志 |
| M2 | Client 数据层：view-model.js + Definition + build 脚本 + 单测 | 刷新后可读到 turn data（console 验证） |
| M3 | 卡片静态渲染（照抄 CSS/结构）+ 视觉比对 | 除标题例外外与官方卡肉眼一致（T0-7） |
| M4 | 点击填入 + 冲突 + 暂不需要 + 状态行 + 预览 | 形态稿 §12 的 3/4/5/6/7/8/10 条通过 |
| M5 | 过程组一行 + 样式 | 过程行与官方同构；异常可展开 |
| M6 | 场景过滤 + 持久化 + 语言 | 子代理/刷新/fork/中英文通过 |
| M7 | 设置页（P1） | 条数/重置生效（点击行为 2026-11-10 移除） |
| M8 | E2E 全清单 + 预算测量 + README/交付说明 | §10.2 全绿，T0-8 达标 |

> **实现进度（2026-11-09，收尾）**：M0–M6、M8 完成；M7（Host 侧跨重启存储）**取消**——实机复验显示
> 设置项在重启后保留，暂不需要额外存储层。插件已以 link 方式安装进 desktop profile 并完成实机验证：
> ① 硬刷新后第 12/13 回合卡片均出现（会话日志回放）；② 悬停选项无布局抖动；③ Settings →「下一步建议」
> 四项设置均生效，重启后设置仍在。安装过程还发现并修复了两个真实问题：hover 预览块增删导致抖动（→固定
> 高度预览槽）、冷启动 `uiConversation` 未就绪导致 Definition 注册跳过（→声明式 inject）。
> `node --test` **156** 个测试全绿；`scripts/build-client.mjs --check` 通过；bundle 约 62 KB。
> 过程行 running 态 shimmer 已按官方 TextShimmer 复刻；每轮条数新增 **自动** 模式（默认，模型决定 1–6 条）；
> 点击行为新增 **填入 / 直接发送** 设置（默认填入，危险建议始终只填）。
> 仅剩一项实机复验（需要用户重启）：卡片「已忽略/已填入」标记是否跨重启保留。
>
> **2026-11-09 补充（compact 后不再触发）**：首次 compact 后模型停止调用工具（`maxPerTurn: auto` 只影响
> 显示、不会产生建议）。Host 增加按根 agent 注册的常驻 system prompt 引导（§5.7.1），子代理跳过，插件
> 卸载统一清理；`node --test` **165** 通过（引导相关 9 个用例）。第二版把引导收窄为「只在有真实后续动作时调用」。
> **需重启 DSH 生效**。
>
> **2026-11-09 卡片 v0.7**：忽略动作移入状态行右侧减号（`dshns-statusbar` + `dshns-dismiss`），删除 footer；
> 新增 `MinusIcon` 与构建断言；`node --test` **167** 通过（含新增的「回复即清单」引导用例）。
>
> **2026-11-09 卡片 v0.8**：加号恢复（`dshns-restore`、`PlusIcon`、`card.restore`），减号/加号互为逆操作；
> 构建断言扩展为同时校验两枚图标与「无 footer」。
>
> **2026-11-10 P1 布局 + 移除 Send**：默认展示 3 条 + 「还有 N 条」（`DEFAULTS.maxPerTurn = 3`，设置保留
> Auto）；删除 Send 模式、点击行为设置、自动提交与冲突提交判断、「已发送」状态及 `submit` 调用；新增
> `deriveChipMarker` 单内联标记（danger > filled > recommended，移除 Tag 胶囊与「可以不做」）；预览改为按需
> （`preview.label`、「将填入」、2 行 clamp，不再固定 56px）；忽略/恢复改带文字 ghost 按钮；冲突态改为
> 「将填入 / 当前草稿」对比 +「追加到末尾」primary；危险 token 修正为 `--dsw-alias-state-warn-primary`
> （警告图标用该色，文字仍 label-secondary）。`node --test` **206** 全绿，`scripts/build-client.mjs --check` 通过。
>
> **2026-11-10 冲突态紧凑化**：删除独立 `.dshns-conflict-actions` 行，冲突动作（`conflictActions`）与
> 状态文字同排（`.dshns-statusbar-conflict { margin-top:8px; flex-wrap:wrap; row-gap:8px }`）；宽列 748px
> 实测默认 134px → 冲突 158px（差 24px，验收 ≤25px），窄列待视觉证据实测。`build.test.mjs` 新增
> 「冲突动作与状态同一行」契约断言；`node --test` **207** 全绿，`scripts/build-client.mjs --check` 通过。

---

## 14. 风险与缓解

| # | 风险 | 等级 | 缓解/检测 |
|---|---|---|---|
| R1 | Conversation Definition / `turn.data` 是官方内部契约，升级可能变 | 中 | 官方先例两个包在用；升级跑回归；备选 useChat 扫描 |
| R2 | `presentationMeta` 在压缩时随结果被修剪 | 中 | args 兜底；E2E 造长会话验证 |
| R3 | 照抄的 CSS/组件随 DSH 升级漂移 | 中 | 附录记录来源版本与路径；升级时重新提取 diff |
| R4 | `focus()`/`shell()` 跨插件使用未文档化 | 低中 | 容错 try/catch；可不聚焦 |
| R5 | Auto review 模式多一次审查成本 | 低 | 设置页文案说明；不绕过 |
| R6 | 模型不调用工具/上下文质量差 | 中 | description 优化；20 轮统计；必要时 P2 加 system-prompt 短段 |
| R7 | 危险词表误报（如"删除注释"） | 低 | 只升级标记不阻断；用户可见「需确认」 |
| R8 | 单文件 bundle + 内联构建漂移 | 低 | `build --check` 测试 |
| R9 | link: 安装下 Host import 解析失败 | 已规避 | Host 零 import |
| R10 | 与官方卡同屏拥挤 | 中 | order -10 + 组数上限；视觉比对 |
| R11 | 按需预览在触屏不可见（无 hover；点击即填入） | 低 | 触屏以填入为主路径；预览定位为鼠标/键盘辅助；需要时可加常驻摘要 |
| R12 | 默认 3 条让 4–6 条建议需多点一次「还有 N 条」 | 低 | 默认高度稳定优先；设置 Auto 可恢复全显示 |
| R13 | 窄列（约 390px）冲突态动作换行，高度差可能超过 25px | 低 | 窄列按同一口径实测并更新视觉证据；超预算时压缩对比框行距或调整动作顺序 |

---

## 附录 A：官方 Card 卡框 CSS（原样抄录，改写前缀 `dshns-`）

来源：`P/dsh-client-ui-action-cards/lib/client.js:379`（CSS 字符串），0.2.2-rc.1。

```css
.dshns-card {
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  font-family: var(--dsw-font-family);
  color: var(--dsw-alias-label-primary);
  margin: 16px 0;
  overflow: hidden;
}
.dshns-body { padding: 14px 20px 18px; }
.dshns-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary);
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}
.dshns-mark {
  display: inline-block;
  vertical-align: -3px;
  margin-right: 6px;
}
.dshns-toggle {
  height: auto;
  min-height: 24px;
  margin: 8px 0 0;
  padding-inline: 0;
  font-size: 12px;
}
.dshns-statusbar {
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  min-height: 28px;
  display: flex;
}
.dshns-status {
  color: var(--dsw-alias-label-secondary);
  margin: 0 auto 0 0;
  font-size: 12px;
  line-height: 1.6;
}
.dshns-btn.dshns-dismiss,
.dshns-btn.dshns-restore {
  flex: none;
  width: auto;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  gap: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dshns-btn.dshns-dismiss:hover:not(:disabled),
.dshns-btn.dshns-restore:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}
```

官方附带的折叠说明实现（照抄逻辑，`FoldedText`）：
`FOLD_WIDTH = 260`；宽字形正则
`/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-｠￠-￦]/u`；
`Intl.Segmenter(undefined, { granularity: 'grapheme' })`；超宽截断 + `'…'`；展开/收起用 ghost sm 按钮。

本插件在官方卡框之外扩展的样式（2026-11-10，同样只用 `--dsw-*` token）：

```css
.dshns-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.dshns-chip { max-width: 100%; text-align: left; }
.dshns-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 每个 chip 至多一个内联标记；文字在前，颜色不是唯一线索 */
.dshns-marker { flex: none; margin-left: 2px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; white-space: nowrap; }
.dshns-btn-primary .dshns-marker { color: inherit; opacity: .78; }
.dshns-marker-danger { display: inline-flex; align-items: center; gap: 3px; }
.dshns-warn { flex: none; width: 12px; height: 12px; color: var(--dsw-alias-state-warn-primary); }
/* 按需预览：闲时不占位，出现在控件行下方 */
.dshns-preview { margin-top: 8px; padding: 6px 10px; border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, transparent)); color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; font-size: 12px; line-height: 1.6; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.dshns-preview-label { margin-right: 4px; color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 1.6; white-space: nowrap; }
/* 冲突：控件区只放目标指令 + 当前草稿对比；动作并入状态行 */
.dshns-conflict { margin-top: 12px; }
.dshns-conflict-compare { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2, transparent)); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
.dshns-conflict-line { display: flex; align-items: baseline; gap: 6px; min-width: 0; margin: 0; }
.dshns-conflict-label { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 1.6; white-space: nowrap; }
.dshns-conflict-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 冲突态状态行：状态文字与「追加到末尾/替换/取消」同一行，收紧上边距，冲突卡只比默认卡高约 24px */
.dshns-statusbar-conflict { margin-top: 8px; flex-wrap: wrap; row-gap: 8px; }
```

## 附录 B：官方过程行与 primitive CSS（原样抄录）

**ProposeRow**（`P/dsh-client-ui-action-cards/lib/client.js:555`）：

```css
.dshns-row-summary { min-width:0; color:inherit; align-items:center; gap:8px; margin-left:8px; font-size:12px; display:flex; }
.dshns-row-summary > :first-child { flex-shrink: 0; }
.dshns-row-title { text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.dshns-row-reason {
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap; overflow-wrap: anywhere;
  margin: 8px 0; padding: 12px; font-size: 12px;
}
.dshns-row-inspect {
  color: var(--dsw-alias-link); font: inherit; cursor: pointer;
  background: 0 0; border: none; align-self: flex-start; padding: 4px 0; font-size: 12px;
}
```

**Button**（`SH:123/132` + `CSS` 中 `_button_1ulci_2` 等规则）：

```css
.dshns-btn {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  gap: 4px; border: none; border-radius: var(--dsw-radius-md); cursor: pointer;
  font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary);
  background: transparent; padding: 0 14px;
}
.dshns-btn:disabled { cursor: not-allowed; opacity: .4; }
.dshns-btn-sm { height: 28px; font-size: 12px; line-height: 18px; padding: 0 10px; border-radius: var(--dsw-radius-sm); }
.dshns-btn-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.dshns-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dshns-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshns-btn-ghost:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.dshns-btn-icon { display: inline-flex; width: 16px; height: 16px; align-items: center; justify-content: center; }
```

**DisclosureRow**（`SH:123` + `CSS`）：

```css
.dshns-disc-root { display: flex; flex-direction: column; width: 100%; min-width: 0; }
.dshns-disc-header { display: flex; align-items: center; min-width: 0; }
.dshns-disc-header[data-has-accessory] { gap: 8px; }
.dshns-disc-header[data-has-accessory] .dshns-disc-row { flex: 0 1 auto; }
.dshns-disc-row {
  flex: 1 1 auto; position: relative; overflow: hidden; display: flex; align-items: center;
  height: calc(24px + var(--dsh-content-font-delta, 0px)); min-width: 0;
  color: var(--dsw-alias-label-tertiary); transition: color .1s ease;
}
.dshns-disc-row[data-expandable] { cursor: pointer; }
.dshns-disc-row:hover { color: var(--dsw-alias-label-secondary); }
.dshns-disc-leading {
  position: relative; flex: none; width: calc(16px + var(--dsh-content-font-delta, 0px));
  height: calc(16px + var(--dsh-content-font-delta, 0px)); display: inline-flex; align-items: center;
  justify-content: center; margin-right: 6px; padding: 0; border: none; background: none; color: inherit;
}
.dshns-disc-leading svg:not([data-state]) { width: calc(14px + var(--dsh-content-font-delta, 0px)); height: calc(14px + var(--dsh-content-font-delta, 0px)); }
button.dshns-disc-leading { cursor: pointer; }
.dshns-disc-iconIdle { display: inline-flex; opacity: 1; transition: opacity .1s ease; }
.dshns-disc-chevronHover { position: absolute; inset: 0; margin: auto; opacity: 0; transition: opacity .1s ease; }
.dshns-disc-row:hover .dshns-disc-iconIdle { opacity: 0; }
.dshns-disc-row:hover .dshns-disc-chevronHover { opacity: 1; }
.dshns-disc-title {
  flex: none; font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px)); color: inherit;
}
```

**TextShimmer（过程行 running 状态）；`SH:132` + `CSS` `1rdzk` 族**——实现时照抄结构与规则：
`root/content/text/decoration/sweep/highlight`，`position:relative; display:inline-grid; width:max-content`；
sweep 动画 1.5s steps(48) infinite；`prefers-reduced-motion` 下 `animation:none`。
（或先用纯文本 + 同款 class，T0-7 视觉比对后再决定是否启用 shimmer。）

## 附录 C：官方图标 SVG（内联，不用 `<use>`）

**`apps-add-outline`**（过程行 icon；官方用法 `size={14}`，regular stroke=1，16×16 viewBox）：

```html
<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"
  aria-hidden="true">
  <rect x="2.25" y="2.25" width="4" height="4" rx="1"></rect>
  <rect x="2.25" y="9.75" width="4" height="4" rx="1"></rect>
  <rect x="9.75" y="9.75" width="4" height="4" rx="1"></rect>
  <path d="M11.75 1.75v5M9.25 4.25h5"></path>
</svg>
```

**`chevron-down-outline`**（DisclosureRow 收起态；size 14）：

```html
<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke-width="1" aria-hidden="true">
  <path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6"
        stroke="currentColor"></path>
</svg>
```

**`chevron-up-outline`**（DisclosureRow 展开态；size 14）：

```html
<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke-width="1" aria-hidden="true">
  <path d="M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10"
        stroke="currentColor"></path>
</svg>
```

图标实现方式：组件接收 `{ size = 14, className }`，直接渲染上述 `<svg>`（官方 primitive 用 `<use>` 引用
shell 内 symbol；内联等价、且避免依赖冻结模块表）。

## 附录 D：文案字典（官方 frame 文案 + 本项目 key）

**直接采用官方 action-cards 文案**（en/zh，见 `P/dsh-client-ui-action-cards/lib/client.js:660-720`）：

| key | en | zh |
|---|---|---|
| expandBrief | Show more | 展开 |
| collapseBrief | Show less | 收起 |
| dismiss | Not now | 暂不需要 |
| dismissed | Dismissed | 已忽略 |
| row.inspect | Inspect call | 查看调用 |

**本项目新增 key（`nextSteps` namespace）**：

| key | en | zh |
|---|---|---|
| card.title | Suggested next steps | 下一步建议 |
| card.dismiss | Not now | 暂不需要 |
| card.restore | Restore suggestions | 恢复建议 |
| card.more | More ({n}) | 还有 {n} 条 |
| card.expand | Show more | 展开 |
| card.collapse | Show less | 收起 |
| chip.recommended | Recommended | 推荐 |
| chip.danger | Needs confirmation | 需确认 |
| chip.filled | Filled | 已填入 |
| preview.label | Will fill | 将填入 |
| status.filled | Filled into the input — review and send | 已填入输入框，可修改后发送 |
| status.danger | This may be irreversible — review before sending | 该操作可能不可逆，请确认后发送 |
| status.conflict | The input already has content | 输入框已有内容 |
| status.dismissed | Dismissed | 已忽略 |
| status.unavailable | The composer is unavailable | 输入框暂不可用 |
| conflict.compareTarget | Will fill | 将填入 |
| conflict.compareDraft | Current draft | 当前草稿 |
| conflict.appendPrimary | Append to draft | 追加到末尾 |
| conflict.replace | Replace | 替换 |
| conflict.cancel | Cancel | 取消 |
| row.title | Suggested next steps | 下一步建议 |
| row.preparing | Preparing suggestions | 正在准备建议 |
| row.running | Writing suggestions | 正在生成建议 |
| row.ok | Suggested | 已生成 |
| row.error | Not shown | 未显示 |
| row.stopped | Interrupted | 已中断 |
| row.inspect (reuse) | Inspect call | 查看调用 |
| fallback.context | Here are a few natural next steps. | 接下来可以： |
| settings.title | Next steps | 下一步建议 |
| settings.hostGate | Cards are controlled by the plugin Host config (profile cordis.patch.yml → dsh-next-actions → enabled). Turning it off removes the tool and the prompt guidance. | 卡片总开关已移到插件的 Host 配置（profile 的 cordis.patch.yml → dsh-next-actions → enabled）；关闭后不再注册工具与提示词。 |
| settings.maxPerTurn | Suggestions per reply | 每轮建议条数 |
| settings.auto | Auto | 自动 |
| settings.note | Clicking a suggestion only fills the input; nothing is sent automatically. Dangerous suggestions are marked “Needs confirmation”. | 点击建议只会填入输入框，不会自动发送；危险建议会标记「需确认」。 |
| settings.reset | Reset card states | 重置卡片状态 |
| settings.saved | Saved | 已保存 |
| settings.resetDone | Card states cleared | 卡片状态已清理 |
| settings.resetEmpty | Nothing to clear | 没有可清理的状态 |
| settings.storageUnavailable | Could not save in this browser | 当前浏览器无法保存 |

包元数据 `locale/en.json` / `zh.json`：

```json
{ "meta": { "title": "Suggested next steps",
  "description": "Shows a card under completed replies with one or two sentences of context and clickable next steps that fill the input draft." } }
```

```json
{ "meta": { "title": "下一步建议",
  "description": "在每条完成的回复下方显示一张卡片：一两句上下文，加上可点击的下一步建议；点击只会填入输入框，不会自动发送。" } }
```

## 附录 E：证据索引（关键结论 → 来源）

| 结论 | 来源 |
|---|---|
| 版本 0.2.2-rc.1；asar 路径 | `dsh/package.json`、`dsh --version` |
| Client bundle 协议 / 单文件 / 无 JSX / `require` 表 | `P/dsh-cordis-client-runner/lib/client.js:309-338, 485-504`；`SH:196`；`P/dsh-client-modules/README.md` |
| 禁止 require Harness Client 包（抄 markup/CSS） | `P/dsh-agent-preset/skills/cordis-plugin-development/references/practices.md:35`、`verification.md:5` |
| turnTail 槽位契约/props/order/occupants | `RUNNER:3066-3127`；`P/dsh-client-ui-chat/lib/client.js:9030-9063` |
| 19 个 session 标准 props；无祖先继承 | `RUNNER:3094-3113, 1947, 2243` |
| `turn` 是 TurnLocation（`.turn/.end/.data`） | `P/dsh-client-ui-action-cards/lib/client.js:452-460`；`CHAT:9753-9759` |
| toolview 契约 / keyed 替换 / `block.args/meta` | `RUNNER:7352-7398`；`P/dsh-client-ui-tool/lib/client.js:106,468` |
| `inputActions` 动作集 / 无 focus | `P/dsh-client-ui-conversation/lib/client.js:15369-15396` |
| shell `focus()/notify()/submit(mode)` | 同文件 `:15614, 15772-15794, 16231-16245` |
| `InputState` + `draftRev` | 同文件 `:16049-16059, 15436-15443` |
| `useInput`/`useProjection` 是标准 props | `RUNNER:3094-3113`；`AC:453-454` |
| Definition 注册 / ui-schedule 折叠模式 | `SCHED:13210-13267, 19257`；`PLAN:313-341, 720-792` |
| 卡框 / 折叠说明 / dismiss 行为 / 过程行 | `P/dsh-client-ui-action-cards/lib/client.js:378-720`、README |
| Button/DisclosureRow 实现与 CSS | `SH:123-132`；`CSS`（`_button_1ulci_*`、`_root_l4nv8_*` 等） |
| 图标 SVG / 尺寸 / stroke | `SH:132`（`Qv` 符号表 + `M()` 工厂） |
| 工具注册 plain object / raw JSON Schema / output.render / presentationMeta / meta 持久化 | `P/dsh-tools/lib/index.js:311-360, 433-441, 699-731`；`P/dsh-tools/lib/pipeline.js:188-214` |
| 审批默认 allow / 唯一 ask 源 | `P/dsh-tools/lib/pipeline.js:386-390`；`P/dsh-experimental-auto-review/lib/index.js:565-599` |
| 零 import 先例 / link: 安装解析 | 本工作区 `plugins/dsh-side/`、`BUILD-NOTES.md`；`~/.dsh/profiles/desktop/package.json` |
| settings.section 契约（root/{close}/icon） | `RUNNER:5754-5815` |
| locale 注册（en/zh baseline、`locale:`→`t`） | `P/dsh-client-locale/README.md`；`AC:850-873` |
| 官方动作卡 frame 与过程行完整代码 | `P/dsh-client-ui-action-cards/lib/client.js:378-720` |
| 前端 sheet / seed 模块表 | `SH:194-196`；`CSS` |

## 附录 F：未决问题（实现时收口）

1. `useProjection` 是否作为"未来方案 B"的备选（当前不依赖）；
2. `useSession((s)=>s.subagent)` 是否覆盖"团队任务内部会话"（T0-6）；
3. Auto review 模式下用户可见行为（仅文档说明，不阻断）；
4. 压缩策略是否会修剪 `tool/call.arguments`（影响兜底路径，E2E 造长会话验证）；
5. ~~是否需要把「点击直接发送」偏好加回~~ **已否决并移除**（2026-11-10）：点击永远只填入，不提供直发路径；
6. ~~官方 `Tag/Switch` 精确样式~~ 不再需要（2026-11-10：Tag 随 chip 胶囊移除，Switch 随客户端 `enabled` 移除）。
