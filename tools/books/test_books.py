import json
from pathlib import Path

import pytest

import books

FIX = Path(__file__).parent / "fixtures"


def rows():
    return books.parse_csv((FIX / "goodreads_export.csv").read_bytes())


# --- parse / select -----------------------------------------------------------

def test_fixture_keeps_real_export_format():
    raw = (FIX / "goodreads_export.csv").read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf") and b"\r\n" in raw


def test_parse_csv_handles_bom_crlf_and_quoted_commas():
    r = rows()
    assert r[0]["Book Id"] == "23361794"
    assert r[0]["My Review"].startswith("讀完很久")
    assert '"家族"' in r[0]["My Review"]


def test_select_keeps_only_read_and_not_hidden():
    ids = [b["id"] for b in books.select(rows(), "hide")]
    assert ids == ["23361794", "111", "444", "555"]


def test_select_never_outputs_private_notes_or_review():
    out = json.dumps(books.select(rows(), "hide"), ensure_ascii=False)
    for secret in ("SECRET-NOTE", "PRIVATE-B", "讀完很久"):
        assert secret not in out


def test_select_shapes_fields():
    b = books.select(rows(), "hide")[0]
    assert b == {
        "id": "23361794", "title": "百年孤寂", "author": "加布列.賈西亞.馬奎斯",
        "rating": 5, "pages": 416, "read": "2024-03-02", "added": "2024-03-05",
        "shelves": ["latin-american"], "url": "https://www.goodreads.com/book/show/23361794",
        "cover": None, "color": None, "ink": None, "ratio": None, "read_count": 1,
    }


def test_select_empty_pages_and_dates_become_none():
    b = next(x for x in books.select(rows(), "hide") if x["id"] == "444")
    assert b["pages"] is None and b["read"] is None and b["rating"] == 0


def test_select_hide_shelf_name_is_configurable():
    ids = [b["id"] for b in books.select(rows(), "scifi")]
    assert "222" not in ids


# --- sort ---------------------------------------------------------------------

def test_sort_by_rating_then_read_desc_then_added_desc():
    out = books.sort_books(books.select(rows(), "hide"))
    assert [b["id"] for b in out] == ["23361794", "555", "111", "444"]


# --- covers -------------------------------------------------------------------

def test_extract_cover_reads_og_image():
    html = (FIX / "book_page.html").read_text(encoding="utf-8")
    assert books.extract_cover(html).endswith("/23361794.jpg")


def test_extract_cover_ignores_goodreads_placeholder():
    html = '<meta property="og:image" content="https://s.gr-assets.com/assets/nophoto/book/111x148.png">'
    assert books.extract_cover(html) is None


def test_ink_for_picks_readable_text_color():
    assert books.ink_for("#e8e4dc") == "#1c1a17"
    assert books.ink_for("#2b2b2b") == "#f7f3ea"


def test_dominant_color_of_solid_image():
    PIL = pytest.importorskip("PIL.Image")
    import io
    buf = io.BytesIO()
    PIL.new("RGB", (20, 30), (122, 59, 31)).save(buf, "PNG")
    assert books.dominant_color(buf.getvalue()) == "#7a3b1f"


def test_fill_covers_uses_cache_and_skips_fetching():
    bs = books.select(rows(), "hide")
    cache = {b["id"]: {"cover": "https://c/" + b["id"], "color": "#7a3b1f", "ratio": 0.66} for b in bs}
    n = books.fill_covers(bs, cache, fetch_page=pytest.fail, fetch_image=pytest.fail, sleep=lambda s: None)
    assert n == 0
    assert bs[0]["cover"] == "https://c/23361794" and bs[0]["ink"] == "#f7f3ea"


def test_fill_covers_fetches_missing_and_caches_success():
    bs = [b for b in books.select(rows(), "hide") if b["id"] == "23361794"]
    cache = {}
    html = (FIX / "book_page.html").read_text(encoding="utf-8")
    n = books.fill_covers(bs, cache, fetch_page=lambda i: html,
                          fetch_image=lambda u: b"img", sleep=lambda s: None,
                          color=lambda data: "#123456", measure=lambda data: 0.66)
    assert n == 1
    assert cache["23361794"] == {"cover": bs[0]["cover"], "color": "#123456", "ratio": 0.66}


def test_fill_covers_does_not_cache_failures():
    bs = [b for b in books.select(rows(), "hide") if b["id"] == "111"]
    cache = {}

    def boom(i):
        raise OSError("blocked")
    n = books.fill_covers(bs, cache, fetch_page=boom, fetch_image=pytest.fail, sleep=lambda s: None)
    assert n == 1 and cache == {} and bs[0]["cover"] is None


# --- main ---------------------------------------------------------------------

def test_run_writes_both_json_files(tmp_path):
    books.run(FIX / "goodreads_export.csv", tmp_path, hide_shelf="hide",
              fetch_page=lambda i: "", fetch_image=pytest.fail, sleep=lambda s: None)
    data = json.loads((tmp_path / "books.json").read_text(encoding="utf-8"))
    assert [b["id"] for b in data] == ["23361794", "555", "111", "444"]
    assert json.loads((tmp_path / "book_covers.json").read_text(encoding="utf-8")) == {}
    for secret in ("SECRET-NOTE", "PRIVATE-B", "讀完很久"):
        assert secret not in (tmp_path / "books.json").read_text(encoding="utf-8")


# --- 真實匯出檔的格式 ---------------------------------------------------------

def test_select_accepts_decimal_ratings_and_pages_from_real_export():
    """2026 年 Goodreads 匯出的評分是 "4.0" 這種格式,不是 "4"。"""
    row = {"Book Id": "11438", "Title": "T", "Author": "A", "My Rating": "4.0", "Number of Pages": "159.0",
           "Date Read": "2025/01/01", "Date Added": "2026/10/07", "Bookshelves": "", "Exclusive Shelf": "read"}
    b = books.select([row], "hide")[0]
    assert b["rating"] == 4 and b["pages"] == 159


# --- 3D 書架要的資料:封面比例、讀過幾次 -------------------------------------------

def test_select_read_count_defaults_to_one_for_read_books():
    row = {"Book Id": "1", "Title": "T", "Author": "A", "My Rating": "4", "Exclusive Shelf": "read", "Read Count": "3"}
    assert books.select([row], "hide")[0]["read_count"] == 3
    row["Read Count"] = ""
    assert books.select([row], "hide")[0]["read_count"] == 1   # 在 read 書架上至少讀過一次


def test_cover_ratio_of_image():
    PIL = pytest.importorskip("PIL.Image")
    import io
    buf = io.BytesIO()
    PIL.new("RGB", (200, 300), (1, 2, 3)).save(buf, "PNG")
    assert books.cover_ratio(buf.getvalue()) == 0.667


def test_fill_covers_records_ratio():
    bs = [b for b in books.select(rows(), "hide") if b["id"] == "23361794"]
    cache = {}
    html = (FIX / "book_page.html").read_text(encoding="utf-8")
    books.fill_covers(bs, cache, fetch_page=lambda i: html, fetch_image=lambda u: b"img",
                      sleep=lambda s: None, color=lambda d: "#123456", measure=lambda d: 0.65)
    assert cache["23361794"]["ratio"] == 0.65 and bs[0]["ratio"] == 0.65


def test_fill_covers_backfills_ratio_without_refetching_page():
    """舊快取只有封面網址與主色:只重抓圖片量比例,不再碰 Goodreads 書頁。"""
    bs = [b for b in books.select(rows(), "hide") if b["id"] == "23361794"]
    cache = {"23361794": {"cover": "https://c/x.jpg", "color": "#7a3b1f"}}
    n = books.fill_covers(bs, cache, fetch_page=pytest.fail, fetch_image=lambda u: b"img",
                          sleep=lambda s: None, measure=lambda d: 0.7)
    assert n == 1 and cache["23361794"]["ratio"] == 0.7 and bs[0]["ratio"] == 0.7
    assert books.fill_covers(bs, cache, fetch_page=pytest.fail, fetch_image=pytest.fail, sleep=lambda s: None) == 0
