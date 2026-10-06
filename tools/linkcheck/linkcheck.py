"""每週檢查 share 的原文還連不連得到。純 stdlib。

用法: python linkcheck.py <posts_dir> <state_json>
404 / 410 / DNS 失敗算一次 strike,連續兩次才算失效;403 / 429 / 5xx / 逾時不算。
有改動時在 GITHUB_OUTPUT 寫 changed=true。
"""

import json
import os
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "Mozilla/5.0 (compatible; ShareBot/1.0; +https://randyxu0711.github.io)"
GONE = {404, 410}
DEAD_AFTER = 2


def check(url, opener=urllib.request.urlopen):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with opener(req, timeout=20):
            return "ok"
    except urllib.error.HTTPError as e:
        return "dead" if e.code in GONE else "unknown"
    except urllib.error.URLError as e:
        return "dead" if isinstance(e.reason, socket.gaierror) else "unknown"
    except Exception:  # 其他網路狀況一律當作不確定,不算 strike
        return "unknown"


def step(entry, result):
    if result == "ok":
        return None
    if result == "unknown":
        return entry
    strikes = (entry or {}).get("strikes", 0) + 1
    return {"strikes": strikes, "dead": strikes >= DEAD_AFTER}


def read_posts(posts_dir):
    """回傳 [(issue, link)]。front matter 是 share.py 寫的 `key: <json>` 格式。"""
    out = []
    for path in sorted(Path(posts_dir).glob("*.md")):
        fm = {}
        head = path.read_text(encoding="utf-8").split("\n---\n", 1)[0]
        for line in head.splitlines()[1:]:
            key, sep, value = line.partition(": ")
            if sep and key in ("issue", "link"):
                fm[key] = json.loads(value)
        if "issue" in fm and "link" in fm:
            out.append((str(fm["issue"]), fm["link"]))
    return out


def run(posts_dir, state_path, check=check):
    state_path = Path(state_path)
    old = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    new = {}
    for issue, link in read_posts(posts_dir):
        entry = step(old.get(issue), check(link))
        if entry:
            new[issue] = entry
    changed = new != old
    if changed or not state_path.exists():   # 第一次執行建立空檔,但沒有實質改動就不算 changed
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(new, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                              encoding="utf-8")
    return changed


def main():
    changed = run(sys.argv[1], sys.argv[2])
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"changed={'true' if changed else 'false'}\n")
    print("changed" if changed else "no change")


if __name__ == "__main__":
    main()
