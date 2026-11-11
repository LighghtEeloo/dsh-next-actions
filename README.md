# dsh-next-actions

> Suggested next actions under DeepSeek Harness replies — clicking one fills the input, never sends.
> DSH Web/Desktop 插件：在回复下方显示 1–3 条「下一步建议」，点击只填入输入框。

**状态：v0.1.0，本地 `link:` 安装试用，未公开发布。** 设计与理念见 [`DESIGN.md`](DESIGN.md)。

## 功能

- 一两句上下文 + 最多 3 个建议按钮；卡片随会话保存，刷新与回放后仍在。
- 推荐项置顶并带 ✦ 与品牌色描边；下一条消息里有整行与某条建议一致 → 实勾，改后发送 → 铅笔（从会话日志里的文本推断，手动输入相近内容也会被标记）。
- 空草稿直接填入；已有草稿时在光标处插入（保留 `@` 引用，⌘Z 撤销）；永不自动发送。
- 危险建议带 ⚠ 标记，同样只填入。
- 工具过程组里一行记录；子代理不注册工具；Host 配置 `enabled: false` 时零常驻 token。
- 兼容 PTC（`run_code`）会话。

## 结构

```text
index.js            Host：工具 + 根 agent 常驻提示 + enabled 门控
lib/normalize.js    参数规范化，结果写入 tool/result.meta
client.js           Client（手写单文件）：Definition、卡片、过程行与 CSS
cordis.patch.yml    插件行 patch
test/               node --test
```

## 开发

```sh
node --test         # 测试
npm pack --dry-run  # 打包检查
```

安装/卸载用 `plugin_manager` 的 `install_bundle` / `remove_bundle`；验证使用假 `DSH_HOME`。
Host 改动需重启 DSH，Client 改动需刷新页面。

关闭功能：在 profile 的 `cordis.patch.yml` 写

```yaml
- id: dsh-next-actions
  name: '@local/dsh-next-actions'
  config: { enabled: false }
```

## 待实机确认

- `insertText` 在含 `@` 引用的草稿里插入的位置与撤销行为（失败时退回 `setDraft` 追加，引用会变成纯文本）。
- 0.2.2-rc.1 的 `useChat` 快照提供 `timeline.turns` 及其 `data`，`user/message.content` 为文本块数组。
- 「已使用」标记在翻页加载旧历史后、两个会话并排时仍落在正确的卡片上（`next-actions-sent` 按引擎解析的 location 归轮）。
- 改后发送的阈值（有序 Dice ≥ 0.6、指令至少 4 个字）在真实消息上的误标与漏标情况。
- `turn.end.time` 的格式（决定只有刚结束的卡片才播放展开动画）。

## 许可

许可证未定；卡片外观参照 MIT 许可的 DSH 官方动作卡。非 DeepSeek 官方插件。
