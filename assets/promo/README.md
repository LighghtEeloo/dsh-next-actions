# 宣传片

一支 45 秒的功能演示片：在一段连续的 DSH 对话里，把插件的每项能力演示一遍，每段配一行功能字幕。
界面按 DSH 0.2.2 的实际形态绘制：浅蓝用户气泡、完成后收起为「已完成，用时 …」的过程区、
回合尾部依次是改动文件卡、本插件卡片和消息动作行，输入框是带工具栏的圆角卡片。
本目录不随 npm 发布（`package.json` 的 `files` 只包含 `assets/*.svg`）；成片是生成物，不入库（`.gitignore` 忽略 `assets/promo/*.mp4`），
按下文「重新生成」渲染。

| 文件 | 内容 |
| --- | --- |
| `dsh-next-actions-promo.mp4` | 成片（生成物，不入库）：1920×1080，30fps，45 s，H.264 / yuv420p + AAC 48 kHz 立体声 |
| `poster.png` | 封面帧（t = 10.2 s，卡片推近，三条标注全部出现） |
| `promo.html` | 动画源文件：画面是时间 `t` 的纯函数；`<script id="timeline">` 是共用的 cue sheet |
| `soundtrack.mjs` | 读同一份 cue sheet，合成配乐与界面音效 |
| `render-video.sh` | 逐帧注入时间、并行截图、合成音轨、用 ffmpeg 编码；也可只替换音轨 |
| `render-html.sh` | 单帧截图：Chrome headless，DSF 2，一次性临时 profile |

## 分镜

每段的字幕陈述该段演示的行为，不加与功能无关的旁白。片尾标语「省下的是打字，不是思考。」交代分工：
建议替人备好措辞，要不要说、怎么说仍由人决定，对应「只填入、不发送」。

| 时间 | 字幕 | 画面 |
| --- | --- | --- |
| 0.0–2.5 s | — | 标题：图标、「下一步建议」、包名 |
| 2.5–7.5 s | 01 回合结束，回答末尾附上下一步建议 | 过程行依次出现，本插件一行「正在生成 → 已生成 · 3」；过程收起，回答流出，改动文件卡之后展开卡片，动作行在最下方 |
| 7.5–12.5 s | 02 一两句上下文，至多三条建议 | 镜头推近卡片、其余内容压暗；标注上下文、✦ 推荐、⚠ 风险；光标悬停推荐按钮，原生提示显示完整指令 |
| 12.5–15.0 s | 03 点一下：填入输入框 | 点推荐按钮，指令飞入输入框；发送键亮起但未触发 |
| 15.0–17.5 s | 04 末尾换行再点一条：另起一段接上 | 按 Shift + Enter，再点第二条，指令隔一个空行接在下一段 |
| 17.5–20.0 s | 05 在输入框里改，由你发送 | 在第二段末尾补一句，点发送 |
| 20.0–26.0 s | 06 发出后，卡片折叠成一行 | 卡片折叠为「▸ 下一步建议 · ✓ 跑一下测试 ✎ 补回归用例」；第二轮运行并出新卡片 |
| 26.0–30.0 s | 07 草稿里已有内容：在光标处插入 | 先输入带 `@list.ts` 引用的一句，再点推荐按钮，指令插在空行之后，引用保持原样 |
| 30.0–35.0 s | 08 历史卡片随时展开 | 向上滚动，点开第一张卡片的折叠行，按钮上显示 ✓ 与 ✎；再点收起 |
| 35.0–40.0 s | 09 跟随 DSH 的明暗主题与界面语言 | 暗色主题从右上角擦入；折叠行标题依次切换八种语言，字幕同步高亮当前语言 |
| 40.0–45.0 s | — | 片尾：图标、名称、「省下的是打字，不是思考。」、安装命令 |

片中演示的行为与插件实现一致：发出的消息由 `client.js` 的 `usageOf` 判定为「跑一下测试 = 原样发送、补回归用例 = 改后发送、推送到远端 = 未使用」；
换行信号与光标处插入分别对应 `consumeSignal` 与 `separatorFor` 的结果。改动脚本里的指令或发送文本时，先用这两个函数核对标记与拼接结果。
卡片、折叠行和过程行的尺寸、颜色与图标沿用 `client.js`；DSH 自身的界面元素取自 DSH 0.2.2 的主题 token 与组件样式。
镜头只缩放窗口内容层，标题栏固定；最大缩放以完整放下 560 px 的对话列为限。

## Cue sheet

`promo.html` 里的 `<script id="timeline">` 是画面与声音共用的唯一时间表，所有时间都是成片绝对时间（秒）：

- `duration`：成片总长，`render-video.sh` 按它决定帧数和音轨长度。
- `bpm`：配乐速度；96 BPM 下一小节 2.5 s，段落起点落在小节线上。
- 成对的值是 `[开始, 结束]`；`r1Chips` / `r2Chips` 是 `[第一个按钮, 间隔]`；`langs` 是 `[第一次切换, 间隔]`。
- `editKeys`、`draftKeys`、`draftKeys2` 逐个列出按键时刻，画面按它们逐字显示，音轨在同一时刻放按键声。

改动某个时间点后重新渲染，画面与音效一起跟随。

## 预览

浏览器直接打开 `promo.html` 即循环播放（无声）：空格暂停，←/→ 跳 0.5 s。URL 加 `?t=12` 显示该时刻的静帧。

## 重新生成

需要 macOS 上的 Google Chrome、ffmpeg 和 Node.js。

```sh
cd assets/promo
JOBS=10 ./render-video.sh video promo.html dsh-next-actions-promo.mp4       # 全部重渲染，约 5 分钟
./render-video.sh soundtrack promo.html dsh-next-actions-promo.mp4          # 只换音轨，几秒钟
./render-video.sh stills promo.html /tmp/promo-stills 10.2
cp /tmp/promo-stills/t10.2.png poster.png
node soundtrack.mjs promo.html /tmp/soundtrack.wav                           # 只试听音轨
```

`render-video.sh` 把 `promo.html` 里的 `window.__T = null; /*FRAME_T*/` 逐帧替换成时间，交给 `render-html.sh` 截图；
`video` 的可选参数是帧率（默认 30），`AUDIO=0` 时输出无声视频。逐帧页面、PNG 和音轨放在系统临时目录，脚本退出即删。

Chrome 无法在嵌套的 seatbelt 沙箱（例如 Claude Code 的 Bash 沙箱）里创建 socket 目录，渲染需在该沙箱外运行。
截图参数与钥匙串注意事项见 `render-html.sh` 头注释。

## 声音

风格是 lo-fi：温暖的电钢琴和弦、带摇摆的鼓组和圆润的低音，F 大调，Fmaj7–Am7–Dm9–Bbmaj7 四小节一循环，
片尾前转 Gm7 → C9sus4，落在 40.0 s 的 Fmaj9 上，与片尾图标同时出现。
编曲随段落推进：标题只有铺底，出卡时电钢琴与踩镲进入，第一次点击起完整鼓组与低音，明暗主题与语言一段鼓组退场。
界面音效全部是无音高的轻敲、点击、按键和风声，不用铃音，避免和音乐抢耳朵。

`soundtrack.mjs` 只用正弦、FM、多相 BLEP 锯齿波和滤波噪声合成，自带 Freeverb 混响，电钢琴与铺底随底鼓轻微闪避；
不读取外部素材，同一输入输出按字节一致。母带按 RMS 定电平，软拐点限幅，峰值不超过 −1 dBFS。

## 字体

页面声明 `lang="zh-CN"`，此时 `-apple-system` 解析为 PingFang，拉丁连字符会渲染成长横；`system-ui` 才落到 SF。
headless Chrome 也取不到 `SF Mono` / `ui-monospace`，同样回退到 PingFang，因此等宽字体用 Menlo。
