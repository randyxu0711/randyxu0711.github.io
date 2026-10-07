"""Goodreads 匯出的 CSV → _data/books.json。

用法: python books.py <goodreads_library_export.csv> <data_dir> [hide_shelf]
- 只輸出 read 書架、且不在 hide_shelf 的書。
- 永遠不輸出 Private Notes 與 My Review。
- 封面從 Goodreads 書頁的 og:image 取得,只抓快取裡沒有的;成功的才進快取。
- 主色用 Pillow 算(只有這裡需要 Pillow)。
CSV 本身含私人資料,不要 commit(books/ 在 .gitignore)。
"""

import csv
import io
import json
import sys
import time
import urllib.request
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

USER_AGENT = "Mozilla/5.0 (compatible; ShareBot/1.0; +https://randyxu0711.github.io)"
BOOK_URL = "https://www.goodreads.com/book/show/{}"
INK_DARK, INK_LIGHT = "#1c1a17", "#f7f3ea"


def parse_csv(data: bytes):
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))


def _date(s):
    try:
        return datetime.strptime(s.strip(), "%Y/%m/%d").date().isoformat()
    except ValueError:
        return None


def _int(s):
    """"4"、"4.0" 都接受(新版匯出檔的評分是 "4.0");空白或不是數字回 None。"""
    try:
        return int(float((s or "").strip()))
    except ValueError:
        return None


def select(rows, hide_shelf):
    out = []
    for r in rows:
        shelves = [s.strip() for s in (r.get("Bookshelves") or "").split(",") if s.strip()]
        if (r.get("Exclusive Shelf") or "").strip() != "read" or hide_shelf in shelves:
            continue
        bid = r["Book Id"].strip()
        out.append({
            "id": bid,
            "title": r["Title"].strip(),
            "author": r["Author"].strip(),
            "rating": _int(r.get("My Rating")) or 0,
            "pages": _int(r.get("Number of Pages")),
            "read": _date(r.get("Date Read") or ""),
            "added": _date(r.get("Date Added") or ""),
            "shelves": shelves,
            "url": BOOK_URL.format(bid),
            "cover": None, "color": None, "ink": None,
        })
    return out


def sort_books(items):
    items = sorted(items, key=lambda b: b["added"] or "", reverse=True)
    items = sorted(items, key=lambda b: b["read"] or "", reverse=True)   # 沒有 read 的排在後面
    return sorted(items, key=lambda b: -b["rating"])


class _OgImage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.image = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and a.get("property") == "og:image" and self.image is None:
            self.image = (a.get("content") or "").strip() or None


def extract_cover(html):
    p = _OgImage()
    p.feed(html or "")
    if not p.image or "nophoto" in p.image or not p.image.startswith("https://"):
        return None
    return p.image


def dominant_color(data: bytes):
    from PIL import Image  # 只有這裡需要 Pillow
    img = Image.open(io.BytesIO(data)).convert("RGB").resize((1, 1), Image.Resampling.BOX)
    r, g, b = img.getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def ink_for(hex_color):
    n = int(hex_color[1:], 16)
    r, g, b = n >> 16 & 255, n >> 8 & 255, n & 255
    return INK_DARK if (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 else INK_LIGHT


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read(3_000_000)


def fetch_page(book_id):
    return _get(BOOK_URL.format(book_id)).decode("utf-8", errors="replace")


def fetch_image(url):
    return _get(url)


def fill_covers(items, cache, fetch_page=fetch_page, fetch_image=fetch_image,
                sleep=time.sleep, color=dominant_color):
    fetched = 0
    for b in items:
        hit = cache.get(b["id"])
        if hit is None:
            fetched += 1
            try:
                cover = extract_cover(fetch_page(b["id"]))
                hit = {"cover": cover, "color": color(fetch_image(cover)) if cover else None}
                if cover:
                    cache[b["id"]] = hit
            except Exception as e:  # 抓不到就先不放封面,下次再試
                print(f"{b['id']} {b['title']}:抓不到封面({e})")
                hit = None
            sleep(1)   # 對 Goodreads 客氣一點
        if hit:
            b["cover"], b["color"] = hit["cover"], hit["color"]
            b["ink"] = ink_for(hit["color"]) if hit["color"] else None
    return fetched


def run(csv_path, data_dir, hide_shelf="hide", **fetchers):
    data_dir = Path(data_dir)
    items = sort_books(select(parse_csv(Path(csv_path).read_bytes()), hide_shelf))
    cache_path = data_dir / "book_covers.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    fetched = fill_covers(items, cache, **fetchers)
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "books.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    cache_path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{len(items)} 本書,抓了 {fetched} 本的封面")


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2], *(sys.argv[3:4]))
