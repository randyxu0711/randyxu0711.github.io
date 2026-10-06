import json
import socket
import urllib.error

import pytest

import linkcheck


def http_error(code):
    def opener(req, timeout):
        raise urllib.error.HTTPError(req.full_url, code, "x", {}, None)
    return opener


class Ok:
    def __enter__(self): return self
    def __exit__(self, *a): return False


# --- check --------------------------------------------------------------------

def test_check_ok():
    assert linkcheck.check("https://a.com", opener=lambda r, timeout: Ok()) == "ok"


@pytest.mark.parametrize("code", [404, 410])
def test_check_gone_is_dead(code):
    assert linkcheck.check("https://a.com", opener=http_error(code)) == "dead"


@pytest.mark.parametrize("code", [401, 403, 429, 500, 503])
def test_check_blocked_or_server_error_is_unknown(code):
    assert linkcheck.check("https://a.com", opener=http_error(code)) == "unknown"


def test_check_dns_failure_is_dead():
    def opener(req, timeout):
        raise urllib.error.URLError(socket.gaierror(-2, "Name or service not known"))
    assert linkcheck.check("https://gone.example", opener=opener) == "dead"


def test_check_timeout_is_unknown():
    def opener(req, timeout):
        raise urllib.error.URLError(TimeoutError("timed out"))
    assert linkcheck.check("https://a.com", opener=opener) == "unknown"


# --- step ---------------------------------------------------------------------

def test_one_strike_is_not_dead():
    assert linkcheck.step(None, "dead") == {"strikes": 1, "dead": False}


def test_two_strikes_is_dead():
    assert linkcheck.step({"strikes": 1, "dead": False}, "dead") == {"strikes": 2, "dead": True}


def test_ok_clears_entry():
    assert linkcheck.step({"strikes": 3, "dead": True}, "ok") is None


def test_unknown_keeps_entry():
    e = {"strikes": 1, "dead": False}
    assert linkcheck.step(e, "unknown") == e
    assert linkcheck.step(None, "unknown") is None


# --- run ----------------------------------------------------------------------

def post(tmp_path, n, link):
    (tmp_path / f"2026-10-0{n}-share-{n}.md").write_text(
        f'---\ntitle: "t"\nlink: "{link}"\nissue: {n}\n---\n', encoding="utf-8")


def test_run_writes_only_problem_posts(tmp_path):
    post(tmp_path, 1, "https://ok.com")
    post(tmp_path, 2, "https://gone.com")
    state = tmp_path / "linkcheck.json"
    results = {"https://ok.com": "ok", "https://gone.com": "dead"}
    assert linkcheck.run(tmp_path, state, check=results.get) is True
    assert json.loads(state.read_text()) == {"2": {"strikes": 1, "dead": False}}


def test_run_reports_no_change_when_nothing_changed(tmp_path):
    post(tmp_path, 1, "https://ok.com")
    state = tmp_path / "linkcheck.json"
    assert linkcheck.run(tmp_path, state, check=lambda u: "ok") is False
    assert linkcheck.run(tmp_path, state, check=lambda u: "ok") is False


def test_run_drops_entries_for_removed_posts(tmp_path):
    post(tmp_path, 1, "https://ok.com")
    state = tmp_path / "linkcheck.json"
    state.write_text(json.dumps({"9": {"strikes": 2, "dead": True}}))
    assert linkcheck.run(tmp_path, state, check=lambda u: "ok") is True
    assert json.loads(state.read_text()) == {}
