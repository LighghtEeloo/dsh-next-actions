# dsh-next-actions

> Suggested next steps under DeepSeek Harness replies — clicking one fills the input, never sends.
> DSH Web/Desktop 插件：在最新一条回复下方显示 1–3 条「下一步建议」，点击只填入输入框。

**状态：v0.1.0，本地 `link:` 安装试用，未公开发布。** 设计见 [`docs/design.md`](docs/design.md)。

## 功能

- 一两句上下文 + 最多 3 个建议按钮；只在最新一轮显示，继续对话后自然消失。
- 空草稿直接填入；已有草稿时在光标处插入（保留 `@` 引用，⌘Z 撤销）；永不自动发送。
- 危险建议带 ⚠ 标记，同样只填入。
- 工具过程组里一行记录；子代理不注册工具；Host 配置 `enabled: false` 时零常驻 token。
- 兼容 PTC（`run_code`）会话。

## 结构

```text
index.js            Host：工具 + 根 agent 常驻提示 + enabled 门控
lib/normalize.js    参数规范化（Host 与 Client 共用）
src/client.js       Client 模板：Definition、卡片、过程行
src/styles.js       卡片与过程行 CSS
client.js           构建产物（勿手改）
cordis.patch.yml    插件行 patch
test/               node --test
```

## 开发

```sh
node --test                            # 测试
node scripts/build-client.mjs          # 重建 client.js
node scripts/build-client.mjs --check  # 检查 client.js 是否最新
npm pack --dry-run                     # 打包检查
```

安装/卸载用 `plugin_manager` 的 `install_bundle` / `remove_bundle`；验证使用假 `DSH_HOME`。
Host 改动需重启 DSH，Client 改动需刷新页面。

关闭功能：在 profile 的 `cordis.patch.yml` 写

```yaml
- id: dsh-next-actions
  name: '@local/dsh-next-actions'
  config: { enabled: false }
```

## 许可

许可证未定；卡片外观参照 MIT 许可的 DSH 官方动作卡。非 DeepSeek 官方插件。
