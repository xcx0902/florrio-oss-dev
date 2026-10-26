#!/bin/bash
# 从 https://static.florr.io/old/ 抓取原始站点文件到 upstream/
#
# Legacy Florr.io 是 M28 停运后保留在对象存储上的静态快照，
# 没有目录列表，所以文件名在这里显式列出。
#
# 用法： bash tools/fetch-upstream.sh [输出目录]
#   默认输出到 ./upstream

set -euo pipefail

BASE="https://static.florr.io/old"
DEST="${1:-upstream}"
cd "$(dirname "$0")/.."
mkdir -p "$DEST"

# index.html（入口）、client.js + client.wasm（客户端，Emscripten）、
# sp_server.js + sp_server.wasm（服务端模拟核心，客户端以 Web Worker 方式拉起它实现单机）
FILES="
index.html
client.js
client.wasm
sp_server.js
sp_server.wasm
manifest.json
favicon.ico
favicon-16x16.png
favicon-32x32.png
apple-touch-icon.png
android-chrome-192x192.png
android-chrome-512x512.png
"

echo "拉取 $BASE/ -> $DEST/"
fail=0
for f in $FILES; do
  code=$(curl -sS -m 120 --retry 3 --retry-delay 2 -o "$DEST/$f" -w '%{http_code}' "$BASE/$f" || echo "000")
  size=$(wc -c < "$DEST/$f" | tr -d ' ')
  if [ "$code" != "200" ] || [ "$size" = "0" ]; then
    echo "  [失败] $f  http=$code  bytes=$size"
    fail=1
  else
    printf '  [ok]   %-30s %8s bytes\n' "$f" "$size"
  fi
done

# 字体（web/fonts/）不在本脚本范围内：原页面从 Google Fonts 取 Ubuntu:700，
# 仓库里已经存了一份本地化的子集。需要重新抓取时：
#   curl -H 'User-Agent: Mozilla/5.0 ...' 'https://fonts.googleapis.com/css?family=Ubuntu:700'
# 把返回的 @font-face 里的 woff2 逐个下载，并把 url() 改成文件名即可。

echo
if [ "$fail" = "0" ]; then
  echo "完成。upstream/ 为原样快照；web/ 为本地可玩版本（见 README 的改动清单）。"
else
  echo "部分文件下载失败，请检查网络后重试。" >&2
  exit 1
fi
