import migrate_archive

POST = '''---
title: "T"
date: "2026-10-04 19:27:16 +0800"
link: "https://a.com/x"
source: "a.com"
tags: ["AI/LLM"]
issue: 1
render_with_liquid: false
---

[閱讀原文 →](https://a.com/x)
'''


def test_adds_archive_line_right_after_link(tmp_path):
    p = tmp_path / "2026-10-04-share-1.md"
    p.write_text(POST, encoding="utf-8")
    changed = migrate_archive.migrate(tmp_path, save=lambda u: None)
    assert changed == [p]
    lines = p.read_text(encoding="utf-8").splitlines()
    i = lines.index('link: "https://a.com/x"')
    assert lines[i + 1] == 'archive: "https://web.archive.org/web/https://a.com/x"'


def test_other_bytes_untouched(tmp_path):
    p = tmp_path / "2026-10-04-share-1.md"
    p.write_text(POST, encoding="utf-8")
    migrate_archive.migrate(tmp_path, save=lambda u: None)
    after = p.read_text(encoding="utf-8")
    assert after.replace('archive: "https://web.archive.org/web/https://a.com/x"\n', "") == POST


def test_second_run_changes_nothing_and_does_not_save(tmp_path):
    p = tmp_path / "2026-10-04-share-1.md"
    p.write_text(POST, encoding="utf-8")
    migrate_archive.migrate(tmp_path, save=lambda u: None)
    before = p.read_text(encoding="utf-8")
    calls = []
    assert migrate_archive.migrate(tmp_path, save=calls.append) == []
    assert calls == []
    assert p.read_text(encoding="utf-8") == before


def test_post_without_link_is_left_alone(tmp_path):
    p = tmp_path / "2026-10-04-share-2.md"
    p.write_text('---\ntitle: "x"\n---\n', encoding="utf-8")
    assert migrate_archive.migrate(tmp_path, save=lambda u: None) == []


def test_save_failure_still_writes_field(tmp_path):
    p = tmp_path / "2026-10-04-share-1.md"
    p.write_text(POST, encoding="utf-8")
    assert migrate_archive.migrate(tmp_path, save=lambda u: "HTTP 520") == [p]
    assert "archive:" in p.read_text(encoding="utf-8")
