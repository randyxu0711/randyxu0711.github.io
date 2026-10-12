"""Goodreads 匯出的 CSV → _data/books.json。

用法: python books.py <goodreads_library_export.csv> <data_dir> [hide_shelf]
- 只輸出 read 書架、且不在 hide_shelf 的書。
- 永遠不輸出 Private Notes 與 My Review。
- 封面先用 ISBN 組 Amazon CDN 網址(不碰 Goodreads),沒有 ISBN 或 Amazon 沒圖才抓 Goodreads 書頁的 og:image;
  只抓快取裡沒有的,成功的才進快取。
- 主色用 Pillow 算(只有這裡需要 Pillow)。
- 用 issue 加的書(_data/books_added.json)會合進來,同一本以 CSV 為準。
- _data/books_fix.json 修正 Goodreads 匯出不對的讀完日期與次數(id → {read, read_count})。
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
AMAZON_COVER = "https://m.media-amazon.com/images/P/{}.01.L.jpg"
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


def isbn10(row):
    """匯出檔的 ISBN 是 ="0140186476" 這種形式;沒有 ISBN-10 時由 978 開頭的 ISBN-13 換算。"""
    a = "".join(c for c in (row.get("ISBN") or "") if c.isdigit() or c == "X")
    if len(a) == 10:
        return a
    b = "".join(c for c in (row.get("ISBN13") or "") if c.isdigit())
    if len(b) == 13 and b.startswith("978"):
        core = b[3:12]
        d = (11 - sum((10 - i) * int(c) for i, c in enumerate(core)) % 11) % 11
        return core + ("X" if d == 10 else str(d))
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
            "cover": None, "color": None, "ink": None, "ratio": None,
            # 匯出檔只有「最近一次」的讀完日期加上次數;在 read 書架上至少讀過一次
            "read_count": _int(r.get("Read Count")) or 1,
            "_isbn10": isbn10(r),
        })
    return out


def apply_fixes(items, fixes):
    for b in items:
        fix = fixes.get(b["id"]) or {}
        for k in ("read", "read_count"):
            if k in fix:
                b[k] = fix[k]
    return items


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
    if not p.image or "nophoto" in p.image or "/assets/facebook/" in p.image or not p.image.startswith("https://"):
        return None
    return p.image


def dominant_color(data: bytes):
    from PIL import Image  # 只有這裡需要 Pillow
    img = Image.open(io.BytesIO(data)).convert("RGB").resize((1, 1), Image.Resampling.BOX)
    r, g, b = img.getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def cover_ratio(data: bytes):
    """封面的寬 / 高,3D 書架用來決定書的高度。"""
    from PIL import Image  # 只有這裡需要 Pillow
    w, h = Image.open(io.BytesIO(data)).size
    return round(w / h, 3)


def ink_for(hex_color):
    n = int(hex_color[1:], 16)
    r, g, b = n >> 16 & 255, n >> 8 & 255, n & 255
    return INK_DARK if (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 else INK_LIGHT


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read(3_000_000)


def fetch_page(book_id):
    html = _get(BOOK_URL.format(book_id)).decode("utf-8", errors="replace")
    if not html.strip():
        # Goodreads(AWS WAF)短時間請求太多時回 202 + 空白頁;當成錯誤,下次執行會重試
        raise RuntimeError("Goodreads 回了空白頁,可能是短時間請求太多被暫時擋下,過一陣子再跑一次")
    return html


def fetch_image(url):
    return _get(url)


def amazon_cover(isbn, fetch_image):
    """Amazon 沒有這本的圖時回 1×1 的佔位圖(幾十位元組);當成沒有。"""
    if not isbn:
        return None, None
    url = AMAZON_COVER.format(isbn)
    try:
        data = fetch_image(url)
    except Exception:
        return None, None
    return (url, data) if data and len(data) > 1000 else (None, None)


def fill_covers(items, cache, fetch_page=fetch_page, fetch_image=fetch_image,
                sleep=time.sleep, color=dominant_color, measure=cover_ratio):
    """回傳實際連網的次數。快取裡沒有的書先試 Amazon,再退回 Goodreads 書頁;舊快取缺比例的只重抓圖片。"""
    fetched = 0
    for b in items:
        hit = cache.get(b["id"])
        if hit is None:
            fetched += 1
            cover, data = amazon_cover(b.get("_isbn10"), fetch_image)
            used_goodreads = False
            try:
                if not cover:
                    used_goodreads = True
                    cover = extract_cover(fetch_page(b["id"]))
                    data = fetch_image(cover) if cover else None
                hit = {"cover": cover, "color": color(data) if data else None, "ratio": measure(data) if data else None}
                if cover:
                    cache[b["id"]] = hit
            except Exception as e:  # 抓不到就先不放封面,下次再試
                print(f"{b['id']} {b['title']}:抓不到封面({e})")
                hit = None
            if used_goodreads:
                sleep(3)   # 對 Goodreads 客氣一點:連抓幾十頁會被 AWS WAF 暫時擋下(回 202 空白頁)
        elif hit.get("cover") and "ratio" not in hit:
            fetched += 1
            try:
                hit["ratio"] = measure(fetch_image(hit["cover"]))
            except Exception as e:
                print(f"{b['id']} {b['title']}:量不到封面比例({e})")
        if hit:
            b["cover"], b["color"], b["ratio"] = hit["cover"], hit["color"], hit.get("ratio")
            b["ink"] = ink_for(hit["color"]) if hit["color"] else None
    return fetched


def run(csv_path, data_dir, hide_shelf="hide", **fetchers):
    data_dir = Path(data_dir)
    fix_path = data_dir / "books_fix.json"
    fixes = json.loads(fix_path.read_text(encoding="utf-8")) if fix_path.exists() else {}
    items = sort_books(apply_fixes(select(parse_csv(Path(csv_path).read_bytes()), hide_shelf), fixes))
    cache_path = data_dir / "book_covers.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    fetched = fill_covers(items, cache, **fetchers)
    # 用 issue 加的書(add_book.py)合進來:同一本以 CSV 為準,CSV 沒有的照樣保留
    added_path = data_dir / "books_added.json"
    added = json.loads(added_path.read_text(encoding="utf-8")) if added_path.exists() else []
    csv_ids = {b["id"] for b in items}
    items = sort_books(items + [b for b in added if b["id"] not in csv_ids])
    for b in items:
        b.pop("_isbn10", None)
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "books.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    cache_path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{len(items)} 本書,抓了 {fetched} 本的封面")


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2], *(sys.argv[3:4]))
