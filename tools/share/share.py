"""Issue → _posts/<date>-share-<n>.md。由 .github/workflows/share.yml 呼叫,純 stdlib。

用法: python share.py <posts_dir>
讀 GITHUB_EVENT_PATH;把留言寫到 $RUNNER_TEMP/share-comment.md,
把 status(published / needs_fix / removed / skip)寫進 GITHUB_OUTPUT。
"""

import json
import os
import re
import sys
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Taipei")
# 要跟 .github/ISSUE_TEMPLATE/share.yml 的 label 一字不差
LABELS = {"網址": "url", "心得": "note", "分類": "tags", "標題(選填,抓錯時覆蓋)": "title"}
EMPTY_META = {"title": "", "description": "", "image": ""}
MAX_BYTES = 1_500_000
USER_AGENT = "Mozilla/5.0 (compatible; ShareBot/1.0; +https://randyxu0711.github.io)"
ARCHIVE_PREFIX = "https://web.archive.org/web/"


def parse_issue_body(body):
    """Issue Form 的 body 是「### 標籤\n\n值」一段段接起來;空的選填欄是 _No response_。"""
    fields = {"url": "", "note": "", "tags": [], "title": ""}
    for chunk in re.split(r"^### ", (body or "").replace("\r\n", "\n"), flags=re.M)[1:]:
        label, _, value = chunk.partition("\n")
        key = LABELS.get(label.strip())
        value = value.strip()
        if not key or value == "_No response_":
            continue
        fields[key] = [t.strip() for t in value.split(",") if t.strip()] if key == "tags" else value
    return fields


def validate_url(url):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc:
        return f"網址看起來不對:`{url or '(空白)'}`。要是 http:// 或 https:// 開頭的完整網址。"
    return None


class _MetaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.title, self._in_title = {}, "", False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key and a.get("content") and key not in self.meta:
                self.meta[key] = a["content"].strip()
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def extract_meta(html, base_url):
    p = _MetaParser()
    p.feed(html)
    raw = p.meta.get("og:image", "")
    image = urljoin(base_url, raw) if raw else ""
    return {
        "title": p.meta.get("og:title") or " ".join(p.title.split()),
        "description": p.meta.get("og:description") or p.meta.get("description", ""),
        "image": image if urlparse(image).scheme in ("http", "https") else "",
    }


def fetch(url):
    """回傳 (meta, error)。抓不到不算失敗,交給呼叫端退回。"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=15) as r:
            charset = r.headers.get_content_charset() or "utf-8"
            html = r.read(MAX_BYTES).decode(charset, errors="replace")
            return extract_meta(html, r.geturl()), None
    except Exception as e:  # 網路錯誤種類太多,一律退回
        return EMPTY_META, str(e) or type(e).__name__


# 標題結尾的「 - 網站名」「 | Blog | 網站名」:分隔符號前後都要有空白(AG-UI、Trade-offs 這種字中的連字號不算)
_TITLE_SEP = re.compile(r"\s+[|\-–—]\s+")
_GENERIC_SUFFIX = {"blog", "news", "home"}


def clean_title(title, source):
    """og:title 結尾常帶網站名稱;跟來源網域重複的部分拿掉(卡片另外顯示來源)。整個標題就是網站名時保留。"""
    parts = (source or "").lower().split(".")
    key = re.sub(r"[^a-z0-9]", "", parts[-2]) if len(parts) >= 2 else ""
    while True:
        seps = list(_TITLE_SEP.finditer(title))
        if not seps:
            return title
        cut = seps[-1]
        tail = re.sub(r"[^a-z0-9]", "", title[cut.end():].lower())
        same_site = len(tail) >= 3 and key and (key in tail or tail in key)
        if not (same_site or tail in _GENERIC_SUFFIX):
            return title
        title = title[:cut.start()]


def _domain(url):
    host = urlparse(url).hostname or ""
    return host[4:] if host.startswith("www.") else host


def archive_url(link):
    """指向 Wayback 最新快照的固定網址;有沒有快照由 Wayback 決定。"""
    return ARCHIVE_PREFIX + link


def save_to_wayback(link, opener=urllib.request.urlopen):
    """請 Wayback 存一份。回傳 None 表示成功,否則回錯誤訊息;不丟例外,不擋發布。"""
    try:
        req = urllib.request.Request("https://web.archive.org/save/" + link,
                                     headers={"User-Agent": USER_AGENT})
        with opener(req, timeout=60):
            return None
    except Exception as e:  # 網路錯誤種類太多,一律回報
        return str(e) or type(e).__name__


def archive_warning(link, save=save_to_wayback):
    error = save(link)
    if not error:
        return ""
    return (f"\n\n注意:送存 Wayback Machine 失敗({error})。"
            "原文之後若失效,封存版可能沒有內容。")


def build_post(fields, meta, issue_number, created_at):
    when = datetime.fromisoformat(created_at.replace("Z", "+00:00")).astimezone(TZ)
    fm = {
        "title": fields["title"] or clean_title(meta["title"], _domain(fields["url"])) or fields["url"],
        "date": when.strftime("%Y-%m-%d %H:%M:%S %z"),
        "link": fields["url"],
        "archive": archive_url(fields["url"]),
        "source": _domain(fields["url"]),
        "description": meta["description"],
        "image": meta["image"],
        "note": fields["note"],
        "tags": fields["tags"],
        "issue": issue_number,
        # 心得是使用者輸入,不讓 Liquid 解析
        "render_with_liquid": False,
    }
    # JSON 字串/陣列是合法的 YAML flow scalar,不用自己處理跳脫
    head = "".join(f"{k}: {json.dumps(v, ensure_ascii=False)}\n"
                   for k, v in fm.items() if v not in ("", None))
    body = (fields["note"] + "\n\n" if fields["note"] else "") + f"[閱讀原文 →]({fields['url']})\n"
    return f"{when:%Y-%m-%d}-share-{issue_number}.md", f"---\n{head}---\n\n{body}"


def post_paths_for_issue(posts_dir, issue_number):
    return sorted(Path(posts_dir).glob(f"*-share-{issue_number}.md"))


@dataclass
class Result:
    status: str
    comment: str = ""
    title: str = ""
    link: str = ""


def handle(event, posts_dir, fetch=fetch):
    action, issue = event["action"], event["issue"]
    n = issue["number"]
    posts_dir = Path(posts_dir)

    if action == "closed" and issue.get("state_reason") == "not_planned":
        old = post_paths_for_issue(posts_dir, n)
        for p in old:
            p.unlink()
        return Result("removed", "已從網站撤下。") if old else Result("skip")

    if action not in ("opened", "edited"):
        return Result("skip")

    fields = parse_issue_body(issue.get("body"))
    error = validate_url(fields["url"])
    if error:
        return Result("needs_fix", f"沒有發布。{error}\n\n編輯這個 issue 修正後會自動重跑。")

    meta, fetch_error = fetch(fields["url"])
    name, content = build_post(fields, meta, n, issue["created_at"])
    for p in post_paths_for_issue(posts_dir, n):
        p.unlink()
    posts_dir.mkdir(parents=True, exist_ok=True)
    (posts_dir / name).write_text(content, encoding="utf-8")

    title = fields["title"] or clean_title(meta["title"], _domain(fields["url"])) or fields["url"]
    lines = ["已上線(約一分鐘後可見)", "",
             f"- **標題**:{title}",
             f"- **描述**:{meta['description'] or '(無)'}",
             f"- **縮圖**:{meta['image'] or '(無)'}"]
    if meta["image"]:
        lines += ["", f'<img src="{meta["image"]}" width="320">']
    if fetch_error:
        lines += ["", f"注意:抓不到原文資訊({fetch_error}),先用網址當標題。"
                      "可以編輯 issue 填「標題」欄位覆蓋。"]
    else:
        lines += ["", "抓錯了?編輯 issue 填「標題」欄位覆蓋即可。"]
    return Result("published", "\n".join(lines), title, fields["url"])


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    r = handle(event, sys.argv[1])
    if r.status == "published":
        r.comment += archive_warning(r.link)
    Path(os.environ["RUNNER_TEMP"], "share-comment.md").write_text(r.comment, encoding="utf-8")
    Path(os.environ["RUNNER_TEMP"], "share-title.txt").write_text(r.title[:200], encoding="utf-8")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        out.write(f"status={r.status}\n")
    print(f"issue #{event['issue']['number']} {event['action']} → {r.status}")


if __name__ == "__main__":
    main()
