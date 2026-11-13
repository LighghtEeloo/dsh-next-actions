# dsh-next-actions

> Suggested next actions under DeepSeek Harness replies — clicking one fills the input, never sends.
> DSH Web/Desktop 插件：在回复下方显示 1–3 条「下一步建议」，点击只填入输入框。

**状态：v0.1.4（npm 包：[dsh-next-actions](https://www.npmjs.com/package/dsh-next-actions)）。** 设计与理念见 [`DESIGN.md`](DESIGN.md)，版本记录见 [`CHANGELOG.md`](CHANGELOG.md)。

## 安装

要求 DSH 0.2.2-rc.1 或更高版本；Host 需要支持 Web Client（Desktop 与 Web 均可）。

```sh
dsh plugin --profile desktop add dsh-next-actions
```

也可以让 agent 用 `plugin_manager` 的 `install_bundle` 安装同名 bundle，或在 Web 侧栏的 Plugins 页面里选中它。装好后重启 DSH。

本地开发时用 `link:` 安装本目录：

```sh
dsh plugin --profile desktop add link:/path/to/dsh-next-actions
```

## 功能

- 一两句上下文 + 最多 3 个建议按钮；卡片随会话保存，刷新与回放后仍在。
- 按钮文字完整显示，过长时换行；标签宽度上限 80 列（中日韩文字与全角符号按 2 列计，约 80 个拉丁字符或 40 个中文字符），超限时请模型缩短后重新调用，显示时从不截断。
- 卡片得到回应后折叠成一行，列出用过的建议；点击可展开，当前卡片保持展开。折叠与展开带过渡动画，自动折叠同样有。
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
assets/promo/       宣传短片：源文件、封面与渲染脚本（成片不入库，不随 npm 发布）
```

## 开发

```sh
node --test         # 测试
npm pack --dry-run  # 打包检查
```

安装/卸载用 `plugin_manager` 的 `install_bundle` / `remove_bundle`；验证使用假 `DSH_HOME`。
Host 改动需重启 DSH，Client 改动需刷新页面。

## 发布

改 `package.json` 版本与 `CHANGELOG.md` 后：

```sh
node --test
npm pack --dry-run
git tag -a v<version> -m "v<version>"
git push origin main --tags
npm publish --access public
npm view dsh-next-actions version   # 确认 latest 指向新版本
```

发布后用假 `DSH_HOME` 从 registry 装一次；本机 `link:` 安装不需要切换。

关闭功能：在 profile 的 `cordis.patch.yml` 写

```yaml
- id: dsh-next-actions
  name: 'dsh-next-actions'
  config: { enabled: false }
```

## 许可

MIT（见 [LICENSE](LICENSE)）。卡片外观参照 MIT 许可的 DSH 官方动作卡，归属说明见 [NOTICE](NOTICE)。非 DeepSeek 官方插件。
