"""一次性遷移:替沒有 archive 欄位的 share 補上,並送存 Wayback。

用法: python migrate_archive.py <posts_dir>
只插入 archive 那一行,其他內容一個位元組都不動;跑第二次不會有任何改動。
"""

import json
import sys
from pathlib import Path

from share import archive_url, save_to_wayback


def migrate(posts_dir, save=save_to_wayback):
    changed = []
    for path in sorted(Path(posts_dir).glob("*.md")):
        text = path.read_text(encoding="utf-8")
        head, sep, rest = text.partition("\n---\n")
        if not text.startswith("---\n") or not sep:
            continue
        lines = head.split("\n")
        if any(line.startswith("archive: ") for line in lines):
            continue
        idx = next((i for i, line in enumerate(lines) if line.startswith("link: ")), None)
        if idx is None:
            continue
        link = json.loads(lines[idx][len("link: "):])
        error = save(link)
        if error:
            print(f"{path.name}: 送存 Wayback 失敗({error}),仍寫入 archive 欄位")
        lines.insert(idx + 1, "archive: " + json.dumps(archive_url(link), ensure_ascii=False))
        path.write_text("\n".join(lines) + sep + rest, encoding="utf-8")
        changed.append(path)
    return changed


if __name__ == "__main__":
    for p in migrate(sys.argv[1]):
        print(f"已補上 archive:{p.name}")
