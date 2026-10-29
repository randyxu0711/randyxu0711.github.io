"""Issue → 書單加一本書。由 .github/workflows/book.yml 呼叫。規格:docs/books-issue.md

用法: python add_book.py <data_dir>
讀 GITHUB_EVENT_PATH;把留言寫到 $RUNNER_TEMP/book-comment.md、標題寫到 book-title.txt,
status(published / published_needs_fix / needs_fix / removed / skip)寫進 GITHUB_OUTPUT。
書目從 Goodreads 書頁的 JSON-LD 取得(/book/show/ 是 robots.txt 允許的路徑);封面主色用 books.py 的函式。
作者不在 _data/authors.yml 時,用表單手填的「作者國家」補一筆(依作者所屬的文學圈,不查網路)。
"""

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import books

TZ = ZoneInfo("Asia/Taipei")
# 要跟 .github/ISSUE_TEMPLATE/book.yml 的 label 一字不差
LABELS = {"Goodreads 網址": "url", "評分": "rating", "中文書名": "title_zh", "中文作者": "author_zh",
          "作者國家": "country"}
BOOK_URL = re.compile(r"^https?://(?:www\.)?goodreads\.com/(?:[a-z]{2}/)?book/show/(\d+)", re.I)
LD_JSON = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S | re.I)


def parse_issue_body(body):
    """Issue Form 的 body 是「### 標籤\n\n值」一段段接起來;空的選填欄是 _No response_。"""
    fields = {v: "" for v in LABELS.values()}
    for chunk in re.split(r"^### ", (body or "").replace("\r\n", "\n"), flags=re.M)[1:]:
        label, _, value = chunk.partition("\n")
        key = LABELS.get(label.strip())
        value = value.strip()
        if key and value != "_No response_":
            fields[key] = value
    return fields


def book_id(url):
    m = BOOK_URL.match((url or "").strip())
    return m.group(1) if m else None


def rating(raw):
    raw = (raw or "").strip()
    return int(raw) if raw in ("1", "2", "3", "4", "5") else 0


def _find_book(node):
    if isinstance(node, list):
        return next((b for b in map(_find_book, node) if b), None)
    if isinstance(node, dict):
        if node.get("@type") == "Book":
            return node
        return _find_book(node.get("@graph"))
    return None


def parse_book_page(html):
    """讀 JSON-LD 的 Book:書名、第一位作者、頁數、封面。讀不到回 None。"""
    for raw in LD_JSON.findall(html or ""):
        try:
            book = _find_book(json.loads(raw))
        except ValueError:
            continue
        if not book or not book.get("name"):
            continue
        author = book.get("author")
        if isinstance(author, list):
            author = author[0] if author else {}
        pages = book.get("numberOfPages")
        image = book.get("image")
        return {
            "title": book["name"].strip(),
            "author": ((author or {}).get("name") or "").strip(),
            "pages": int(pages) if isinstance(pages, (int, float)) or str(pages or "").isdigit() else None,
            "cover": image if isinstance(image, str) and image.startswith("https://") else None,
        }
    return None


# --- books_zh.yml:以文字逐塊編輯,保留檔頭與其他條目的註解 ---------------------------

ZH_KEY = re.compile(r'^"?(\d+)"?\s*:')


def _zh_blocks(text):
    """把檔案切成 [(id 或 None, 行們)];id 為 None 的是檔頭(註解、空行)。"""
    blocks, cur_id, cur = [], None, []
    for line in text.splitlines(keepends=True):
        m = ZH_KEY.match(line)
        if m:
            blocks.append((cur_id, cur))
            cur_id, cur = m.group(1), []
        cur.append(line)
    blocks.append((cur_id, cur))
    return blocks


def zh_upsert(text, bid, title, author, issue):
    kept = "".join("".join(lines) for k, lines in _zh_blocks(text) if k != bid)
    if kept and not kept.endswith("\n"):
        kept += "\n"
    block = f'"{bid}":\n'
    if title:
        block += f"  title: {json.dumps(title, ensure_ascii=False)}\n"
    if author:
        block += f"  author: {json.dumps(author, ensure_ascii=False)}\n"
    block += f"  issue: {issue}\n"
    return kept + block


def zh_remove_issue(text, issue):
    mark = re.compile(rf"^\s+issue:\s*{issue}\s*$", re.M)
    return "".join("".join(lines) for k, lines in _zh_blocks(text) if not (k and mark.search("".join(lines))))


# --- 作者國家:geo.yml 只讀 countries 那段;authors.yml 逐塊編輯,其他條目一個字都不動 ------------

GEO_COUNTRY = re.compile(r'^  "?([^":]+?)"?:\s*\{(.*)\}\s*$')
ADD_GEO = "先在 `_data/geo.yml` 的 `countries` 加這一國(中文名 `zh`、次區域 `subregion`、位置 `at`、`qid`),再編輯 issue 重跑。"
NO_COUNTRY = "沒填(新作者;地圖上不會有這本,要補就編輯 issue 填「作者國家」)。"


def geo_countries(text):
    """{英文國名: {"zh", "qid"}}。"""
    out, inside = {}, False
    for line in text.splitlines():
        if re.match(r"^[^\s#]", line):
            inside = line.startswith("countries:")
            continue
        m = GEO_COUNTRY.match(line) if inside else None
        if m:
            zh = re.search(r"\bzh:\s*([^,}]+)", m.group(2))
            qid = re.search(r"\bqid:\s*(Q\d+)", m.group(2))
            out[m.group(1)] = {"zh": zh.group(1).strip() if zh else m.group(1), "qid": qid.group(1) if qid else None}
    return out


def authors_upsert(text, name, fields, issue):
    kept = books.authors_remove_issue(text, issue)
    if kept and not kept.endswith("\n"):
        kept += "\n"
    block = json.dumps(name, ensure_ascii=False) + ":\n"
    for k, v in fields.items():
        block += f"  {k}: {json.dumps(v, ensure_ascii=False)}\n"
    return kept + block + f"  issue: {issue}\n"


def resolve_country(form, countries, issue):
    """回傳 (要寫進 authors.yml 的欄位或 None, 留言裡「作者國家」那一格, 是否要人修)。"""
    if not form.strip():
        return None, NO_COUNTRY, False
    want = form.strip().casefold()
    key = next((k for k, c in countries.items() if want in (k.casefold(), c["zh"].casefold())), None)
    if not key:
        return None, f"填的「{form.strip()}」不在 `_data/geo.yml`。{ADD_GEO}", True
    return {"literature": key, "basis": f"issue #{issue}"}, f"{countries[key]['zh']}(表單)", False


def known_country(name, entries, countries):
    a = entries[name]
    a = entries.get(a.get("counts_as")) or a
    lit = a.get("literature") or ""
    return f"{(countries.get(lit) or {}).get('zh') or lit}(已在名單)"


# --- 事件 -----------------------------------------------------------------------

@dataclass
class Result:
    status: str
    comment: str = ""
    title: str = ""


def _load(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def _dump(path, items):
    path.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _read(path):
    return path.read_text(encoding="utf-8") if path.exists() else ""


def handle(event, data_dir, fetch_page=books.fetch_page, fetch_image=books.fetch_image, color=books.dominant_color,
           measure=books.cover_ratio):
    action, issue = event["action"], event["issue"]
    n = issue["number"]
    d = Path(data_dir)
    added_p, books_p, zh_p = d / "books_added.json", d / "books.json", d / "books_zh.yml"
    authors_p = d / "authors.yml"

    if action == "closed" and issue.get("state_reason") == "not_planned":
        added = _load(added_p, [])
        all_books = _load(books_p, [])
        zh = zh_p.read_text(encoding="utf-8") if zh_p.exists() else ""
        new_added = [b for b in added if b.get("issue") != n]
        new_books = [b for b in all_books if b.get("issue") != n]
        new_zh = zh_remove_issue(zh, n)
        authors = _read(authors_p)
        new_authors = books.authors_remove_issue(authors, n)
        if (new_added, new_books, new_zh, new_authors) == (added, all_books, zh, authors):
            return Result("skip")
        _dump(added_p, new_added)
        _dump(books_p, new_books)
        if zh_p.exists():
            zh_p.write_text(new_zh, encoding="utf-8")
        if new_authors != authors:
            authors_p.write_text(new_authors, encoding="utf-8")
        return Result("removed", "已從書架撤下。")

    if action not in ("opened", "edited"):
        return Result("skip")

    f = parse_issue_body(issue.get("body"))
    bid = book_id(f["url"])
    if not bid:
        return Result("needs_fix", f"沒有加入。網址要是 Goodreads 的書頁,像 `https://www.goodreads.com/book/show/11438`,"
                                   f"現在是:`{f['url'] or '(空白)'}`。\n\n編輯這個 issue 修正後會自動重跑。")
    try:
        info = parse_book_page(fetch_page(bid))
    except Exception as e:  # 網路錯誤種類太多,一律回報
        return Result("needs_fix", f"沒有加入。抓不到 Goodreads 書頁({e or type(e).__name__})。"
                                   "過一陣子編輯這個 issue(隨便改個字再存)就會重跑。")
    if not info:
        return Result("needs_fix", "沒有加入。Goodreads 書頁上讀不到書目資料,可能是頁面格式改了。"
                                   "確認網址是書頁後,編輯 issue 重跑。")

    hue = ratio = None
    if info["cover"]:
        try:
            data = fetch_image(info["cover"])
            hue, ratio = color(data), measure(data)
        except Exception:  # 封面抓不到不擋,書架會用書名排的備用封面
            hue = ratio = None
    when = datetime.fromisoformat(issue["created_at"].replace("Z", "+00:00")).astimezone(TZ)
    entry = {
        "id": bid, "title": info["title"], "author": info["author"], "rating": rating(f["rating"]),
        "pages": info["pages"], "read": when.date().isoformat(), "added": when.date().isoformat(), "shelves": [],
        "url": books.BOOK_URL.format(bid), "cover": info["cover"], "color": hue,
        "ink": books.ink_for(hue) if hue else None, "ratio": ratio, "read_count": 1, "issue": n,
    }
    _dump(added_p, [b for b in _load(added_p, []) if b.get("issue") != n and b["id"] != bid] + [entry])
    _dump(books_p, books.sort_books([b for b in _load(books_p, []) if b["id"] != bid and b.get("issue") != n] + [entry]))
    if f["title_zh"] or f["author_zh"]:
        zh = zh_p.read_text(encoding="utf-8") if zh_p.exists() else ""
        zh_p.write_text(zh_upsert(zh, bid, f["title_zh"], f["author_zh"], n), encoding="utf-8")

    countries = geo_countries(_read(d / "geo.yml"))
    authors = _read(authors_p)
    rest = books.authors_remove_issue(authors, n)
    entries = books.author_entries(rest)
    known = info["author"] in entries
    fields, fix = None, False
    if known:
        country = known_country(info["author"], entries, countries)
    else:
        fields, country, fix = resolve_country(f["country"], countries, n)
    new_authors = authors_upsert(rest, info["author"], fields, n) if fields else rest
    if new_authors != authors:
        authors_p.write_text(new_authors, encoding="utf-8")

    stars = "★" * entry["rating"] if entry["rating"] else "未評分"
    lines = ["已加到書架(約一分鐘後可見)", "",
             f"- **書名**:{info['title']}" + (f"(中文:{f['title_zh']})" if f["title_zh"] else ""),
             f"- **作者**:{info['author'] or '(無)'}" + (f"(中文:{f['author_zh']})" if f["author_zh"] else ""),
             f"- **頁數**:{info['pages'] or '(無)'}",
             f"- **評分**:{stars}",
             f"- **作者國家**:{country}",
             f"- **封面**:{info['cover'] or '(無,會用書名排的備用封面)'}"]
    if info["cover"]:
        lines += ["", f'<img src="{info["cover"]}" width="120">']
    lines += ["", "<details><summary>要修改或撤下</summary>", "",
              "**修改**:編輯這個 issue 最上面那則內文(issue 關了也能編輯),改 `### 欄位` 底下那一行,存檔後會自動重跑、"
              "覆蓋這本書並重新部署,這裡會再留一則確認。",
              "",
              "| 欄位 | 怎麼改 |", "| --- | --- |",
              "| 評分 | 填 `1`～`5` 的數字;其他寫法(★、「4 星」)都算未評分 |",
              "| 中文書名 / 中文作者 | 填新的譯名會取代舊的;兩欄都清空不會刪掉已有的譯名 |",
              "| 作者國家 | 只在作者還不在名單時用得到;上面標「已在名單」的,改這欄沒有作用 |",
              "",
              "**改不了的**:書名、作者、頁數、封面每次重跑都重新從 Goodreads 書頁抓;"
              "讀完日期固定是開 issue 那天,閱讀次數是 1。",
              "",
              "**撤下**:把 issue 關成 not planned。",
              "",
              "**Goodreads 也要評分**:這本出現在匯出的 CSV 之後,書單以 CSV 為準,這個 issue 的內容就不再用到。",
              "</details>"]
    if fix:
        lines[0] = "已加到書架(約一分鐘後可見),但作者國家對不到,補上之前地圖上不會有這本"
        return Result("published_needs_fix", "\n".join(lines), info["title"])
    return Result("published", "\n".join(lines), info["title"])


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    r = handle(event, sys.argv[1])
    Path(os.environ["RUNNER_TEMP"], "book-comment.md").write_text(r.comment, encoding="utf-8")
    Path(os.environ["RUNNER_TEMP"], "book-title.txt").write_text(("書:" + r.title)[:200], encoding="utf-8")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        out.write(f"status={r.status}\n")
    print(f"issue #{event['issue']['number']} {event['action']} → {r.status}")


if __name__ == "__main__":
    main()
