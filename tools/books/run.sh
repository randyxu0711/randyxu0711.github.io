#!/usr/bin/env bash
# 更新書單:從 Goodreads 匯出 CSV 後執行。CSV 含私人資料,只放在 books/(已 gitignore)。
# 用法: bash tools/books/run.sh [CSV 路徑,預設 books/goodreads_library_export.csv]
set -euo pipefail
csv="${1:-books/goodreads_library_export.csv}"
dir="$(cd "$(dirname "$csv")" && pwd)"
docker run --rm -v "$PWD":/w -v "$dir":/in:ro -w /w python:3.12-slim bash -c \
  "pip install -q pillow && python tools/books/books.py /in/$(basename "$csv") _data"
git status --short _data/books.json _data/book_covers.json
