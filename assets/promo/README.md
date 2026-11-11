# 宣传短片

一支 17.5 秒的短片，不加字幕，靠界面本身讲清核心路径：看一眼 → 点一下 → 在输入框里改。
开头先打出又删掉「继续」，片尾用「别让「继续」代替你的思考。」收束。
本目录不随 npm 发布（`package.json` 的 `files` 只包含 `assets/*.svg`）；成片是生成物，不入库（`.gitignore` 忽略 `assets/promo/*.mp4`），
按下文「重新生成」渲染。

| 文件 | 内容 |
| --- | --- |
| `dsh-next-actions-promo.mp4` | 成片（生成物，不入库）：1920×1080，30fps，17.5 s，H.264 / yuv420p + AAC 48 kHz 立体声 |
| `poster.png` | 封面帧（t = 7.0 s，卡片出现、光标靠近推荐按钮） |
| `promo.html` | 动画源文件：画面是时间 `t` 的纯函数；`<script id="timeline">` 是共用的 cue sheet |
| `soundtrack.mjs` | 读同一份 cue sheet，合成配乐与界面音效 |
| `render-video.sh` | 逐帧注入时间、并行截图、合成音轨、用 ffmpeg 编码；也可只替换音轨 |
| `render-html.sh` | 单帧截图：Chrome headless，DSF 2，一次性临时 profile |

## 分镜

| 时间 | 画面 | 声音 |
| --- | --- | --- |
| 0.0–2.5 s | 开头：一个输入框，打出「继续」、发送键亮起，停顿后删掉；输入框落到窗口底部 | 铺底缓慢升起；按键声；归位时一阵风声 |
| 2.5–5.0 s | 窗口围绕输入框出现；助手回复逐字流出，说明修复已完成 | Fmaj7 电钢琴进入 |
| 5.0–7.5 s | 卡片展开：✦ 推荐、普通、⚠ 需确认；其余内容压暗 | 踩镲进入；三个按钮各一下轻敲 |
| 7.5–10.0 s | 光标点推荐按钮，指令落入输入框，发送键未触发 | 点击落在下拍前，底鼓、军鼓与低音进入；指令飞入有一声风声 |
| 10.0–12.5 s | 在指令后补一句，点发送 | 打字声；发送的点击与风声 |
| 12.5–14.4 s | 消息上屏，按钮的 ✦ 变为铅笔（改后发送） | 两下轻敲；鼓组收住，反向和弦吸入 |
| 14.375–17.5 s | 片尾：图标、名称、「别让「继续」代替你的思考。」、安装命令 | Fmaj9 落点与图标同时出现，随后淡出 |

卡片的颜色与图标沿用 `assets/card-preview.svg` 和 `client.js`；镜头只缩放窗口内容层，标题栏固定。

## Cue sheet

`promo.html` 里的 `<script id="timeline">` 是画面与声音共用的唯一时间表：

- `duration`：成片总长，`render-video.sh` 按它决定帧数和音轨长度。
- `bpm`：配乐速度；96 BPM 下一小节 2.5 s。
- `intro`：开头的绝对时间，`length` 为一小节，保证后面的段落仍落在小节线上。
- `scene`：聊天场景与片尾的时间，相对开头结束计时。

改动某个时间点后重新渲染，画面与音效一起跟随。

## 预览

浏览器直接打开 `promo.html` 即循环播放（无声）：空格暂停，←/→ 跳 0.5 s。URL 加 `?t=7` 显示该时刻的静帧。

## 重新生成

需要 macOS 上的 Google Chrome、ffmpeg 和 Node.js。

```sh
cd assets/promo
JOBS=8 ./render-video.sh video promo.html dsh-next-actions-promo.mp4        # 全部重渲染，约 2 分钟
./render-video.sh soundtrack promo.html dsh-next-actions-promo.mp4          # 只换音轨，几秒钟
./render-video.sh stills promo.html /tmp/promo-stills 7.0
cp /tmp/promo-stills/t7.0.png poster.png
node soundtrack.mjs promo.html /tmp/soundtrack.wav                           # 只试听音轨
```

`render-video.sh` 把 `promo.html` 里的 `window.__T = null; /*FRAME_T*/` 逐帧替换成时间，交给 `render-html.sh` 截图；
`video` 的可选参数是帧率（默认 30），`AUDIO=0` 时输出无声视频。逐帧页面、PNG 和音轨放在系统临时目录，脚本退出即删。

Chrome 无法在嵌套的 seatbelt 沙箱（例如 Claude Code 的 Bash 沙箱）里创建 socket 目录，渲染需在该沙箱外运行。
截图参数与钥匙串注意事项见 `render-html.sh` 头注释。

## 声音

风格是 lo-fi：温暖的电钢琴和弦、带摇摆的鼓组和圆润的低音，F 大调 I–iii–vi–IV–ii–V–I。
界面音效全部是无音高的轻敲、点击、按键和风声，不用铃音，避免和音乐抢耳朵。
小节线落在 2.5 / 5.0 / 7.5 / 10.0 / 12.5 s，与窗口出现、卡片出现、点击、打字、发送五个段落对齐。

`soundtrack.mjs` 只用正弦、FM、多相 BLEP 锯齿波和滤波噪声合成，自带 Freeverb 混响，电钢琴与铺底随底鼓轻微闪避；
不读取外部素材，同一输入输出按字节一致。母带按 RMS 定电平，软拐点限幅，峰值 −1 dBFS；成片实测约 −16.2 LUFS。

## 字体

页面声明 `lang="zh-CN"`，此时 `-apple-system` 解析为 PingFang，拉丁连字符会渲染成长横；`system-ui` 才落到 SF。
headless Chrome 也取不到 `SF Mono` / `ui-monospace`，同样回退到 PingFang，因此等宽字体用 Menlo。
