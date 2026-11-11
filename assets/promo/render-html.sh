#!/usr/bin/env bash
# render-html.sh — 用本机 Google Chrome headless 把本地 HTML 渲染成 PNG。
#
# 复制自 DSH default-workspace 的 tools/render-html.sh（2026-11-11），供 render-video.sh 逐帧截图；
# 两处改动需同步。
#
# 背景（2026-11-10 排查结论，改脚本前先读）：
#   - DSH 的 bash 工具跑在 seatbelt 沙箱里。Chromium 自己的 sandbox 在嵌套环境里无法初始化
#     （"sandbox initialization failed: Operation not permitted"），所以必须 --no-sandbox；
#     进程仍继承 DSH 的文件沙箱，且本脚本只渲染本地 file://、禁止后台联网，风险面可控。
#   - macOS 上 Chrome 启动时会用登录钥匙串加密 profile。如果为了绕沙箱写盘而伪造 HOME，
#     钥匙串会“找不到”，系统会弹「Keychain Not Found — cannot be found to store "Chrome"」
#     （2026-11-09 上一轮事故的根因）。因此这里【保持真实 HOME】，只用 --use-mock-keychain
#     让 Chrome 完全不接触钥匙串。不要添加 HOME=... 或 security 相关操作。
#   - profile / cache / crash dumps 全部放在一次性临时目录，退出即删，不碰真实 Chrome 状态。
#
# 用法:
#   render-html.sh <input.html> <output.png> [width=1680] [height=700]
#
# 环境变量:
#   CHROME_BIN       覆盖 Chrome 可执行文件路径（默认系统安装的 Google Chrome）
#   RENDER_TIMEOUT   单次渲染超时秒数（默认 120）
#
# 约定:
#   - 只接受本地文件路径；拒绝 http(s):// 或 file:// URL 输入。
#   - 固定 device scale factor=2、sRGB、窗口尺寸；同一 HTML 两次渲染按字节可复现。
#   - 输出会校验非空且带 PNG 魔数；成功时 stdout 只打印输出文件的绝对路径。
#
# 示例:
#   render-html.sh /tmp/card.html /tmp/card.png 1680 700   # -> 3360x1400 PNG

set -euo pipefail

die() {
  printf 'render-html: %s\n' "$*" >&2
  exit 1
}

usage() {
  printf 'usage: %s <input.html> <output.png> [width=1680] [height=700]\n' "$0" >&2
}

[ "$#" -ge 2 ] || { usage; exit 64; }

IN=$1
OUT=$2
W=${3:-1680}
H=${4:-700}

case $IN in
  *://*) die "only local file paths are accepted, got URL: $IN" ;;
esac
[ -f "$IN" ] || die "input file not found: $IN"
[ -r "$IN" ] || die "input file not readable: $IN"

case $W in '' | *[!0-9]*) die "width must be a positive integer: $W" ;; esac
case $H in '' | *[!0-9]*) die "height must be a positive integer: $H" ;; esac
[ "$W" -gt 0 ] && [ "$H" -gt 0 ] || die "window size must be positive: ${W}x${H}"

IN="$(cd "$(dirname "$IN")" && pwd -P)/$(basename "$IN")"

OUT_DIR=$(dirname "$OUT")
[ -d "$OUT_DIR" ] || die "output directory not found: $OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd -P)"
OUT="${OUT_DIR}/$(basename "$OUT")"

CHROME=${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}
[ -x "$CHROME" ] || die "Chrome executable not found: $CHROME (override with CHROME_BIN)"

TIMEOUT=${RENDER_TIMEOUT:-120}
case $TIMEOUT in '' | *[!0-9]*) die "RENDER_TIMEOUT must be a positive integer: $TIMEOUT" ;; esac
[ "$TIMEOUT" -gt 0 ] || die "RENDER_TIMEOUT must be positive: $TIMEOUT"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/dsh-render.XXXXXX")
CHROME_PID=""

cleanup() {
  if [ -n "$CHROME_PID" ] && kill -0 "$CHROME_PID" 2>/dev/null; then
    kill -TERM "$CHROME_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

LOG="$WORK/chrome.log"
rm -f "$OUT"

# 说明：不设置 HOME。钥匙串由 --use-mock-keychain 跳过（见文件头）。
"$CHROME" \
  --headless=new \
  --no-sandbox \
  --use-mock-keychain \
  --disable-gpu \
  --hide-scrollbars \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-networking \
  --disable-component-update \
  --disable-sync \
  --disable-extensions \
  --disable-default-apps \
  --user-data-dir="$WORK/profile" \
  --disk-cache-dir="$WORK/cache" \
  --crash-dumps-dir="$WORK/crash" \
  --force-device-scale-factor=2 \
  --force-color-profile=srgb \
  --window-size="${W},${H}" \
  --screenshot="$OUT" \
  "file://${IN}" >"$LOG" 2>&1 &
CHROME_PID=$!

# 超时兜底：正常情况下 Chrome 1 秒内退出；若将来出现系统弹窗/回归，不能把 agent 永久挂住。
(
  sleep "$TIMEOUT"
  if kill -0 "$CHROME_PID" 2>/dev/null; then
    : >"$WORK/timed-out"
    kill -TERM "$CHROME_PID" 2>/dev/null || true
    sleep 2
    kill -KILL "$CHROME_PID" 2>/dev/null || true
  fi
) >/dev/null 2>&1 &
WATCHDOG_PID=$!

rc=0
wait "$CHROME_PID" 2>/dev/null || rc=$?
CHROME_PID=""
kill "$WATCHDOG_PID" 2>/dev/null || true
wait "$WATCHDOG_PID" 2>/dev/null || true

if [ -e "$WORK/timed-out" ]; then
  rm -f "$OUT"
  printf 'render-html: timed out after %ss, Chrome was killed.\n' "$TIMEOUT" >&2
  printf 'If a macOS keychain dialog was on screen: do NOT click "Reset To Defaults"; the script must never fake HOME.\n' >&2
  tail -n 20 "$LOG" >&2 || true
  exit 70
fi

if [ "$rc" -ne 0 ]; then
  rm -f "$OUT"
  printf 'render-html: Chrome exited with status %s\n' "$rc" >&2
  tail -n 20 "$LOG" >&2 || true
  exit 70
fi

if [ ! -s "$OUT" ]; then
  printf 'render-html: Chrome produced no output: %s\n' "$OUT" >&2
  tail -n 20 "$LOG" >&2 || true
  exit 70
fi

MAGIC=$(head -c 4 "$OUT" | od -An -tx1 | tr -d ' \n')
if [ "$MAGIC" != "89504e47" ]; then
  rm -f "$OUT"
  die "output is not a PNG: $OUT"
fi

printf '%s\n' "$OUT"
