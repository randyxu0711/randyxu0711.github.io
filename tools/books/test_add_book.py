import json
import re
from pathlib import Path

import pytest

import add_book
import books

FIX = Path(__file__).parent / "fixtures"
PAGE = (FIX / "book_page_ld.html").read_text(encoding="utf-8")

FORM_BODY = """### Goodreads 網址

https://www.goodreads.com/book/show/11438.What_We_Talk_About?from_search=true

### 評分

4

### 中文書名

當我們討論愛情

### 中文作者

瑞蒙．卡佛
"""


def event(action, body=FORM_BODY, state_reason=None, number=21):
    return {"action": action, "issue": {
        "number": number, "body": body, "created_at": "2026-10-07T12:00:00Z",
        "state_reason": state_reason}}


def data_dir(tmp_path, books_json=None, zh_yml=None):
    d = tmp_path / "_data"
    d.mkdir()
    (d / "books.json").write_text(json.dumps(books_json or [], ensure_ascii=False), encoding="utf-8")
    if zh_yml is not None:
        (d / "books_zh.yml").write_text(zh_yml, encoding="utf-8")
    return d


FETCH_OK = dict(fetch_page=lambda i: PAGE, fetch_image=lambda u: b"img", color=lambda b: "#7a3b1f", measure=lambda b: 0.66)


# --- 表單 -----------------------------------------------------------------------

def test_parse_issue_body_maps_labels():
    f = add_book.parse_issue_body(FORM_BODY)
    assert f == {"url": "https://www.goodreads.com/book/show/11438.What_We_Talk_About?from_search=true",
                 "rating": "4", "title_zh": "當我們討論愛情", "author_zh": "瑞蒙．卡佛"}


def test_parse_issue_body_no_response_is_empty():
    f = add_book.parse_issue_body("### Goodreads 網址\n\nhttps://x\n\n### 評分\n\n_No response_\n")
    assert f["rating"] == "" and f["title_zh"] == ""


def test_issue_form_labels_match_parser():
    form = Path(__file__).parents[2] / ".github/ISSUE_TEMPLATE/book.yml"
    labels = re.findall(r"^\s+label: (.+)$", form.read_text(encoding="utf-8"), flags=re.M)
    assert sorted(labels) == sorted(add_book.LABELS)


def test_issue_form_name_is_at_least_three_chars():
    form = (Path(__file__).parents[2] / ".github/ISSUE_TEMPLATE/book.yml").read_text(encoding="utf-8")
    name = re.search(r"^name: (.+)$", form, flags=re.M).group(1).strip()
    assert len(name) >= 3   # 少於 3 字整個表單會靜默失效


# --- 網址與評分 -----------------------------------------------------------------

@pytest.mark.parametrize("url,bid", [
    ("https://www.goodreads.com/book/show/11438.What_We_Talk", "11438"),
    ("https://www.goodreads.com/book/show/16173237-x?ref=nav", "16173237"),
    ("http://goodreads.com/book/show/42", "42"),
    ("https://www.goodreads.com/en/book/show/58333", "58333"),
])
def test_book_id_from_url(url, bid):
    assert add_book.book_id(url) == bid


@pytest.mark.parametrize("url", ["", "https://www.goodreads.com/author/show/7363", "https://example.com/book/show/1",
                                 "goodreads.com/book/show/abc"])
def test_book_id_rejects_non_book_pages(url):
    assert add_book.book_id(url) is None


@pytest.mark.parametrize("raw,n", [("5", 5), ("1", 1), ("未評分", 0), ("", 0), ("x", 0)])
def test_rating(raw, n):
    assert add_book.rating(raw) == n


# --- 書頁 -----------------------------------------------------------------------

def test_parse_book_page_reads_json_ld():
    assert add_book.parse_book_page(PAGE) == {
        "title": "What We Talk About When We Talk About Love", "author": "Raymond Carver", "pages": 159,
        "cover": "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1475474209i/11438.jpg"}


def test_parse_book_page_without_json_ld_is_none():
    assert add_book.parse_book_page("<html><head></head></html>") is None


def test_parse_book_page_tolerates_missing_fields():
    page = '<script type="application/ld+json">{"@type":"Book","name":"T","author":{"name":"A"}}</script>'
    assert add_book.parse_book_page(page) == {"title": "T", "author": "A", "pages": None, "cover": None}


# --- 事件 -----------------------------------------------------------------------

def test_opened_adds_book_everywhere(tmp_path):
    d = data_dir(tmp_path, books_json=[{"id": "1", "title": "Old", "author": "X", "rating": 5, "pages": 10,
                                         "read": "2020-01-01", "added": None, "shelves": [], "url": "u",
                                         "cover": None, "color": None, "ink": None}], zh_yml="# 註解保留\n")
    r = add_book.handle(event("opened"), d, **FETCH_OK)
    assert r.status == "published" and r.title == "What We Talk About When We Talk About Love"
    added = json.loads((d / "books_added.json").read_text(encoding="utf-8"))
    assert added == [{"id": "11438", "title": "What We Talk About When We Talk About Love", "author": "Raymond Carver",
                      "rating": 4, "pages": 159, "read": None, "added": "2026-10-07", "shelves": [],
                      "url": "https://www.goodreads.com/book/show/11438",
                      "cover": added[0]["cover"], "color": "#7a3b1f", "ink": "#f7f3ea",
                      "ratio": 0.66, "read_count": 1, "issue": 21}]
    all_books = json.loads((d / "books.json").read_text(encoding="utf-8"))
    assert [b["id"] for b in all_books] == ["1", "11438"]          # 5★ 在前、4★ 在後
    zh = (d / "books_zh.yml").read_text(encoding="utf-8")
    assert zh.startswith("# 註解保留\n")
    assert books_zh(d)["11438"] == {"title": "當我們討論愛情", "author": "瑞蒙．卡佛", "issue": 21}
    assert "當我們討論愛情" in r.comment and "159" in r.comment


def books_zh(d):
    import yaml
    return yaml.safe_load((d / "books_zh.yml").read_text(encoding="utf-8")) or {}


def test_edited_replaces_same_issue(tmp_path):
    d = data_dir(tmp_path, zh_yml="")
    add_book.handle(event("opened"), d, **FETCH_OK)
    body = FORM_BODY.replace("\n4\n", "\n5\n").replace("當我們討論愛情", "當我們談論愛情")
    add_book.handle(event("edited", body=body), d, **FETCH_OK)
    added = json.loads((d / "books_added.json").read_text(encoding="utf-8"))
    assert len(added) == 1 and added[0]["rating"] == 5
    assert len(json.loads((d / "books.json").read_text(encoding="utf-8"))) == 1
    assert books_zh(d)["11438"]["title"] == "當我們談論愛情"


def test_no_chinese_fields_keeps_existing_zh_entry(tmp_path):
    d = data_dir(tmp_path, zh_yml='"11438":\n  title: "既有譯名"\n')
    body = FORM_BODY.replace("當我們討論愛情", "_No response_").replace("瑞蒙．卡佛", "_No response_")
    add_book.handle(event("opened", body=body), d, **FETCH_OK)
    assert books_zh(d)["11438"] == {"title": "既有譯名"}


def test_bad_url_needs_fix_and_writes_nothing(tmp_path):
    d = data_dir(tmp_path)
    body = FORM_BODY.replace("https://www.goodreads.com/book/show/11438.What_We_Talk_About?from_search=true", "https://example.com")
    r = add_book.handle(event("opened", body=body), d, fetch_page=lambda i: pytest.fail("must not fetch"))
    assert r.status == "needs_fix" and "Goodreads" in r.comment
    assert not (d / "books_added.json").exists()


def test_fetch_failure_needs_fix(tmp_path):
    d = data_dir(tmp_path)

    def boom(i):
        raise OSError("HTTP 503")
    r = add_book.handle(event("opened"), d, fetch_page=boom)
    assert r.status == "needs_fix" and "HTTP 503" in r.comment
    assert not (d / "books_added.json").exists()


def test_cover_failure_still_publishes(tmp_path):
    d = data_dir(tmp_path)

    def boom(u):
        raise OSError("timeout")
    r = add_book.handle(event("opened"), d, fetch_page=lambda i: PAGE, fetch_image=boom)
    assert r.status == "published"
    assert json.loads((d / "books_added.json").read_text(encoding="utf-8"))[0]["color"] is None


def test_closed_not_planned_removes_only_this_issue(tmp_path):
    csv_twin = {"id": "11438", "title": "From CSV", "author": "A", "rating": 3, "pages": 1, "read": None,
                "added": None, "shelves": [], "url": "u", "cover": None, "color": None, "ink": None}
    d = data_dir(tmp_path, books_json=[csv_twin], zh_yml='"999":\n  title: "別本"\n')
    add_book.handle(event("opened"), d, **FETCH_OK)
    r = add_book.handle(event("closed", state_reason="not_planned"), d)
    assert r.status == "removed"
    assert json.loads((d / "books_added.json").read_text(encoding="utf-8")) == []
    # issue 開的時候覆蓋了 books.json 裡那筆;撤下後只拿掉帶 issue 的,books.json 等下次 CSV 匯入再補回
    assert all(b.get("issue") != 21 for b in json.loads((d / "books.json").read_text(encoding="utf-8")))
    assert "11438" not in books_zh(d) and books_zh(d)["999"] == {"title": "別本"}


@pytest.mark.parametrize("action,reason", [("closed", "completed"), ("reopened", None), ("labeled", None)])
def test_other_events_skip(tmp_path, action, reason):
    d = data_dir(tmp_path)
    assert add_book.handle(event(action, state_reason=reason), d).status == "skip"


# --- books.py 合併 --------------------------------------------------------------

def test_csv_run_keeps_issue_books_and_csv_wins(tmp_path):
    d = tmp_path / "_data"
    d.mkdir()
    (d / "books_added.json").write_text(json.dumps([
        {"id": "23361794", "title": "From issue", "author": "A", "rating": 1, "pages": None, "read": None,
         "added": "2026-10-07", "shelves": [], "url": "u", "cover": None, "color": None, "ink": None, "issue": 3},
        {"id": "777", "title": "Only issue", "author": "B", "rating": 4, "pages": None, "read": None,
         "added": "2026-10-07", "shelves": [], "url": "u", "cover": None, "color": None, "ink": None, "issue": 4},
    ]), encoding="utf-8")
    books.run(FIX / "goodreads_export.csv", d, hide_shelf="hide",
              fetch_page=lambda i: "", fetch_image=pytest.fail, sleep=lambda s: None)
    out = {b["id"]: b for b in json.loads((d / "books.json").read_text(encoding="utf-8"))}
    assert out["23361794"]["title"] == "百年孤寂" and "issue" not in out["23361794"]   # CSV 優先
    assert out["777"]["title"] == "Only issue"                                       # issue 加的保留
