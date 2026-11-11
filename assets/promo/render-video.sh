#!/usr/bin/env bash
# render-video.sh — 把「时间 → 画面」的 HTML 动画逐帧渲染成 PNG / MP4。
#
# HTML 约定：页面里有一行 `window.__T = null; /*FRAME_T*/`，脚本逐帧把 null 换成时间（秒），
# 页面在加载时同步渲染该时刻；总时长取页面 cue sheet 里的 "duration"。每帧截图由同目录的
# render-html.sh 完成；音轨由同目录的 soundtrack.mjs 按同一份 cue sheet 合成，ffmpeg 编码并合流。
#
# 用法:
#   render-video.sh stills     <page.html> <out-dir> <t>...   # 指定时刻静帧 → <out-dir>/t<t>.png
#   render-video.sh video      <page.html> <out.mp4> [fps=30]  # 逐帧渲染 + 音轨
#   render-video.sh soundtrack <page.html> <video.mp4>         # 只重新合成音轨并替换，画面原样复制
#
# 环境变量:
#   W, H     设计尺寸（CSS px，默认 960×540；render-html.sh 固定 DSF 2 → 1920×1080）
#   JOBS     并行渲染数（默认 6）
#   CRF      x264 质量（默认 16）
#   AUDIO    设为 0 时 video 输出无声视频（默认 1，需要 node）
#   RENDER   覆盖截图脚本路径（默认同目录的 render-html.sh）

set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
RENDER=${RENDER:-$HERE/render-html.sh}
W=${W:-960}
H=${H:-540}
JOBS=${JOBS:-6}
CRF=${CRF:-16}

die() { printf 'render-video: %s\n' "$*" >&2; exit 1; }
[ "$#" -ge 3 ] || die "usage: $0 stills <page.html> <out-dir> <t>... | video <page.html> <out.mp4> [fps] | soundtrack <page.html> <video.mp4>"

MODE=$1 PAGE=$2 DEST=$3
shift 3
[ -f "$PAGE" ] || die "page not found: $PAGE"
grep -q '/\*FRAME_T\*/' "$PAGE" || die "page lacks the FRAME_T marker: $PAGE"
DUR=$(sed -n 's/^ *"duration": *\([0-9.]*\).*/\1/p' "$PAGE" | head -n 1)
[ -n "$DUR" ] || die "page cue sheet lacks \"duration\": $PAGE"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/promo-frames.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/html" "$WORK/png"

# frame <name> <t>: write one per-frame page with the time baked in.
frame() {
  sed "s|window.__T = null; /\*FRAME_T\*/|window.__T = $2;|" "$PAGE" >"$WORK/html/$1.html"
}

# Render every page in $WORK/html in parallel into $WORK/png.
render_all() {
  [ -x "$RENDER" ] || die "missing $RENDER"
  export RENDER W H WORK
  find "$WORK/html" -name '*.html' -print0 |
    xargs -0 -P "$JOBS" -I{} sh -c 'n=$(basename "{}" .html); "$RENDER" "{}" "$WORK/png/$n.png" "$W" "$H" >/dev/null'
}

case $MODE in
  stills)
    [ "$#" -ge 1 ] || die "stills needs at least one time"
    mkdir -p "$DEST"
    for t in "$@"; do frame "t$t" "$t"; done
    render_all
    for t in "$@"; do mv "$WORK/png/t$t.png" "$DEST/t$t.png"; done
    printf '%s\n' "$DEST"
    ;;
  video)
    FPS=${1:-30}
    N=$(awk -v d="$DUR" -v f="$FPS" 'BEGIN { printf "%d", d * f + 0.5 }')
    for ((i = 0; i < N; i++)); do
      frame "$(printf 'f%05d' "$i")" "$(awk -v i="$i" -v f="$FPS" 'BEGIN { printf "%.5f", i / f }')"
    done
    start=$(date +%s)
    render_all
    got=$(find "$WORK/png" -name '*.png' | wc -l | tr -d ' ')
    [ "$got" -eq "$N" ] || die "rendered $got of $N frames"
    printf 'render-video: %s frames (%ss) in %ss\n' "$N" "$DUR" "$(($(date +%s) - start))" >&2
    if [ "${AUDIO:-1}" = 0 ]; then
      ffmpeg -loglevel error -y -framerate "$FPS" -i "$WORK/png/f%05d.png" \
        -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -movflags +faststart "$DEST"
    else
      node "$HERE/soundtrack.mjs" "$PAGE" "$WORK/soundtrack.wav"
      ffmpeg -loglevel error -y -framerate "$FPS" -i "$WORK/png/f%05d.png" -i "$WORK/soundtrack.wav" \
        -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -c:a aac -b:a 192k \
        -t "$DUR" -movflags +faststart "$DEST"
    fi
    printf '%s\n' "$DEST"
    ;;
  soundtrack)
    [ -f "$DEST" ] || die "video not found: $DEST"
    node "$HERE/soundtrack.mjs" "$PAGE" "$WORK/soundtrack.wav"
    ffmpeg -loglevel error -y -i "$DEST" -i "$WORK/soundtrack.wav" -map 0:v:0 -map 1:a:0 \
      -c:v copy -c:a aac -b:a 192k -t "$DUR" -movflags +faststart "$WORK/remux.mp4"
    mv "$WORK/remux.mp4" "$DEST"
    printf '%s\n' "$DEST"
    ;;
  *) die "unknown mode: $MODE" ;;
esac
