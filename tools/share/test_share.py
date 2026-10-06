import json
import re

import pytest

import share

FORM_BODY = """### 網址

https://example.com/post

### 心得

值得一讀,
第二行。

### 分類

AI/LLM, Tooling

### 標題(選填,抓錯時覆蓋)

_No response_
"""


# --- parse_issue_body ---------------------------------------------------------

def test_parse_issue_body_maps_labels_to_fields():
    f = share.parse_issue_body(FORM_BODY)
    assert f["url"] == "https://example.com/post"
    assert f["note"] == "值得一讀,\n第二行。"
    assert f["tags"] == ["AI/LLM", "Tooling"]
    assert f["title"] == ""


def test_parse_issue_body_treats_no_response_and_missing_as_empty():
    f = share.parse_issue_body("### 網址\n\nhttps://a.com\n")
    assert f == {"url": "https://a.com", "note": "", "tags": [], "title": ""}


def test_parse_issue_body_handles_none_and_crlf():
    assert share.parse_issue_body(None)["url"] == ""
    f = share.parse_issue_body("### 網址\r\n\r\nhttps://a.com\r\n")
    assert f["url"] == "https://a.com"


# --- validate_url -------------------------------------------------------------

@pytest.mark.parametrize("url", ["https://a.com/x", "http://a.com"])
def test_validate_url_accepts_http_and_https(url):
    assert share.validate_url(url) is None


@pytest.mark.parametrize("url", ["", "a.com", "ftp://a.com", "javascript:alert(1)", "https://"])
def test_validate_url_rejects_everything_else(url):
    assert share.validate_url(url)


# --- extract_meta -------------------------------------------------------------

def test_extract_meta_prefers_og_tags():
    html = """<html><head><title>Fallback</title>
    <meta property="og:title" content="OG &amp; Title">
    <meta property="og:description" content="OG desc">
    <meta name="description" content="plain desc">
    <meta property="og:image" content="/img/a.png">
    </head></html>"""
    m = share.extract_meta(html, "https://site.com/a/b")
    assert m == {"title": "OG & Title", "description": "OG desc",
                 "image": "https://site.com/img/a.png"}


def test_extract_meta_falls_back_to_title_and_meta_description():
    html = "<head><title>  Plain\n Title </title><meta name='description' content='d'></head>"
    m = share.extract_meta(html, "https://site.com")
    assert m == {"title": "Plain Title", "description": "d", "image": ""}


def test_extract_meta_drops_non_http_image():
    html = '<meta property="og:image" content="data:image/png;base64,xx">'
    assert share.extract_meta(html, "https://s.com")["image"] == ""


# --- build_post ---------------------------------------------------------------

META = {"title": "OG Title", "description": "desc", "image": "https://s.com/i.png"}


def front_matter(content):
    head = content.split("---\n")[1]
    out = {}
    for line in head.strip().splitlines():
        k, v = line.split(": ", 1)
        out[k] = json.loads(v)
    return out


def test_build_post_filename_is_stable_per_issue_and_local_date():
    fields = share.parse_issue_body(FORM_BODY)
    # 2026-10-04 20:00 UTC = 2026-10-05 04:00 Taipei
    name, _ = share.build_post(fields, META, 12, "2026-10-04T20:00:00Z")
    assert name == "2026-10-05-share-12.md"


def test_build_post_front_matter():
    fields = share.parse_issue_body(FORM_BODY)
    _, content = share.build_post(fields, META, 12, "2026-10-04T20:00:00Z")
    fm = front_matter(content)
    assert fm["title"] == "OG Title"
    assert fm["link"] == "https://example.com/post"
    assert fm["source"] == "example.com"
    assert fm["description"] == "desc"
    assert fm["image"] == "https://s.com/i.png"
    assert fm["note"] == "值得一讀,\n第二行。"
    assert fm["tags"] == ["AI/LLM", "Tooling"]
    assert fm["issue"] == 12
    assert fm["date"] == "2026-10-05 04:00:00 +0800"
    assert fm["render_with_liquid"] is False


def test_build_post_title_override_wins():
    fields = dict(share.parse_issue_body(FORM_BODY), title="Mine")
    _, content = share.build_post(fields, META, 1, "2026-10-04T00:00:00Z")
    assert front_matter(content)["title"] == "Mine"


def test_build_post_without_meta_uses_url_as_title_and_omits_empty_keys():
    fields = share.parse_issue_body("### 網址\n\nhttps://www.x.com/p\n")
    _, content = share.build_post(fields, share.EMPTY_META, 1, "2026-10-04T00:00:00Z")
    fm = front_matter(content)
    assert fm["title"] == "https://www.x.com/p"
    assert fm["source"] == "x.com"
    for k in ("description", "image", "note"):
        assert k not in fm
    assert fm["tags"] == []


def test_build_post_front_matter_survives_hostile_strings():
    fields = dict(share.parse_issue_body(FORM_BODY), note='a\n---\nb: "c"\n{{ site }}')
    meta = dict(META, title='x: "y" # z')
    _, content = share.build_post(fields, meta, 1, "2026-10-04T00:00:00Z")
    fm = front_matter(content)
    assert fm["title"] == 'x: "y" # z'
    assert fm["note"] == 'a\n---\nb: "c"\n{{ site }}'


# --- post_path_for_issue ------------------------------------------------------

def test_post_path_for_issue_finds_only_exact_issue(tmp_path):
    (tmp_path / "2026-10-01-share-1.md").write_text("x")
    (tmp_path / "2026-10-01-share-12.md").write_text("x")
    assert share.post_paths_for_issue(tmp_path, 1) == [tmp_path / "2026-10-01-share-1.md"]
    assert share.post_paths_for_issue(tmp_path, 3) == []


# --- handle (event → decision) ------------------------------------------------

def event(action, body=FORM_BODY, state_reason=None, number=7):
    return {"action": action, "issue": {
        "number": number, "body": body, "created_at": "2026-10-04T00:00:00Z",
        "state_reason": state_reason}}


def test_handle_publishes_and_writes_post(tmp_path):
    r = share.handle(event("opened"), tmp_path, fetch=lambda u: (META, None))
    assert r.status == "published"
    files = list(tmp_path.iterdir())
    assert [f.name for f in files] == ["2026-10-04-share-7.md"]
    assert "OG Title" in r.comment
    assert r.title == "OG Title"


def test_handle_title_override_and_fallback_to_url(tmp_path):
    body = FORM_BODY.replace("_No response_", "我的標題")
    r = share.handle(event("opened", body=body), tmp_path, fetch=lambda u: (META, None))
    assert r.title == "我的標題"
    r = share.handle(event("opened"), tmp_path, fetch=lambda u: (share.EMPTY_META, "HTTP 403"))
    assert r.title == "https://example.com/post"


def test_handle_edit_replaces_old_file_even_if_date_changed(tmp_path):
    (tmp_path / "2026-01-01-share-7.md").write_text("old")
    share.handle(event("edited"), tmp_path, fetch=lambda u: (META, None))
    assert [f.name for f in tmp_path.iterdir()] == ["2026-10-04-share-7.md"]


def test_handle_bad_url_needs_fix_and_writes_nothing(tmp_path):
    r = share.handle(event("opened", body="### 網址\n\nnot a url\n"), tmp_path,
                     fetch=lambda u: pytest.fail("must not fetch"))
    assert r.status == "needs_fix"
    assert "網址" in r.comment
    assert list(tmp_path.iterdir()) == []


def test_handle_fetch_failure_still_publishes_with_warning(tmp_path):
    r = share.handle(event("opened"), tmp_path, fetch=lambda u: (share.EMPTY_META, "HTTP 403"))
    assert r.status == "published"
    assert "HTTP 403" in r.comment and "標題" in r.comment


def test_handle_closed_not_planned_removes_post(tmp_path):
    (tmp_path / "2026-10-04-share-7.md").write_text("x")
    r = share.handle(event("closed", state_reason="not_planned"), tmp_path, fetch=None)
    assert r.status == "removed"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("action,reason", [("closed", "completed"), ("reopened", None),
                                           ("labeled", None)])
def test_handle_ignores_other_events(tmp_path, action, reason):
    (tmp_path / "2026-10-04-share-7.md").write_text("x")
    r = share.handle(event(action, state_reason=reason), tmp_path, fetch=None)
    assert r.status == "skip"
    assert len(list(tmp_path.iterdir())) == 1


# --- 守門:表單 label 改了,解析會整個靜默失效 -------------------------------------

def test_issue_form_labels_match_parser():
    from pathlib import Path
    form = Path(__file__).parents[2] / ".github/ISSUE_TEMPLATE/share.yml"
    labels = re.findall(r"^\s+label: (.+)$", form.read_text(encoding="utf-8"), flags=re.M)
    assert sorted(labels) == sorted(share.LABELS)


# --- archive ------------------------------------------------------------------

def test_build_post_writes_archive_url():
    fields = share.parse_issue_body(FORM_BODY)
    _, content = share.build_post(fields, META, 12, "2026-10-04T20:00:00Z")
    assert front_matter(content)["archive"] == "https://web.archive.org/web/https://example.com/post"


def test_handle_published_result_carries_link(tmp_path):
    r = share.handle(event("opened"), tmp_path, fetch=lambda u: (META, None))
    assert r.link == "https://example.com/post"


def test_archive_warning_empty_when_save_succeeds():
    assert share.archive_warning("https://a.com", save=lambda u: None) == ""


def test_archive_warning_explains_failure():
    msg = share.archive_warning("https://a.com", save=lambda u: "HTTP 520")
    assert "HTTP 520" in msg and "Wayback" in msg


def test_save_to_wayback_reports_errors_instead_of_raising():
    def boom(req, timeout):
        raise OSError("timed out")
    assert share.save_to_wayback("https://a.com", opener=boom) == "timed out"


def test_save_to_wayback_requests_save_endpoint():
    seen = {}

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake(req, timeout):
        seen["url"] = req.full_url
        return Resp()
    assert share.save_to_wayback("https://a.com/x?y=1", opener=fake) is None
    assert seen["url"] == "https://web.archive.org/save/https://a.com/x?y=1"
