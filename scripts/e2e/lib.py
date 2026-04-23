"""
Helpers communs pour les suites E2E CueForge.

Principes :
- Chaque suite est un module qui expose `run(ctx)` et retourne un TestReport.
- Le client HTTP centralise auth, retries légers, et compte les appels.
- L'isolation se fait via un user de test jetable (register → run → purge).
- L'admin est utilisé uniquement pour les suites qui ont explicitement besoin
  d'une vue admin (stats dashboard, users export, impersonation, etc.).
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable

try:
    import requests
except ImportError:  # pragma: no cover
    print("pip install requests --break-system-packages", file=sys.stderr)
    raise


# ---------- Couleurs terminal (désactivables si stdout n'est pas TTY) ----------
_USE_COLOR = sys.stdout.isatty() and os.environ.get("NO_COLOR") != "1"


def _c(code: str, s: str) -> str:
    return f"\033[{code}m{s}\033[0m" if _USE_COLOR else s


def green(s: str) -> str: return _c("32", s)
def red(s: str) -> str:   return _c("31", s)
def yellow(s: str) -> str: return _c("33", s)
def cyan(s: str) -> str:  return _c("36", s)
def gray(s: str) -> str:  return _c("90", s)
def bold(s: str) -> str:  return _c("1", s)


# ---------- Rapport ----------

@dataclass
class TestResult:
    name: str
    status: str  # "pass" | "fail" | "skip"
    duration_ms: int
    detail: str = ""


@dataclass
class TestReport:
    suite: str
    results: list[TestResult] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)

    def add(self, name: str, status: str, duration_ms: int, detail: str = ""):
        self.results.append(TestResult(name, status, duration_ms, detail))

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.status == "pass")

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if r.status == "fail")

    @property
    def skipped(self) -> int:
        return sum(1 for r in self.results if r.status == "skip")

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def ok(self) -> bool:
        return self.failed == 0

    @property
    def elapsed_ms(self) -> int:
        return int((time.time() - self.started_at) * 1000)


# ---------- Contexte de run ----------

@dataclass
class RunContext:
    """Shared state across suites."""
    base_url: str
    api_prefix: str = "/api/v1"
    admin_identifier: str | None = None
    admin_password: str | None = None
    diagnostics_key: str | None = None
    # Populated at runtime:
    admin_token: str | None = None
    test_user_token: str | None = None
    test_user_email: str | None = None
    test_user_id: int | None = None
    verbose: bool = False


DEFAULT_BASE_URL = os.environ.get(
    "CUEFORGE_BASE_URL",
    "https://cueforge-saas-production.up.railway.app",
)
DEFAULT_FRONT_URL = os.environ.get(
    "CUEFORGE_FRONT_URL",
    "https://exquisite-art-production-f4c6.up.railway.app",
)


# ---------- Client HTTP ----------

class Client:
    """Thin wrapper around requests with auth, JSON helpers, and call counting."""
    def __init__(self, base_url: str, api_prefix: str = "/api/v1"):
        self.base_url = base_url.rstrip("/")
        self.api_prefix = api_prefix
        self.token: str | None = None
        self.calls = 0
        self.session = requests.Session()

    def _url(self, path: str) -> str:
        if path.startswith("http"):
            return path
        if path.startswith("/api/"):
            return self.base_url + path
        return self.base_url + self.api_prefix + path

    def _headers(self, extra: dict | None = None) -> dict:
        h: dict = {"Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        if extra:
            h.update(extra)
        return h

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        params: dict | None = None,
        headers: dict | None = None,
        data: Any = None,
        files: Any = None,
        stream: bool = False,
        timeout: int = 30,
        retries: int = 2,
    ) -> requests.Response:
        """
        Send an HTTP request. Retries once on transient 502/503/504 and connection errors.
        """
        self.calls += 1
        kwargs: dict = {
            "headers": self._headers(headers),
            "timeout": timeout,
            "stream": stream,
        }
        if params:
            kwargs["params"] = params
        if json_body is not None:
            kwargs["json"] = json_body
        if data is not None:
            kwargs["data"] = data
        if files is not None:
            kwargs["files"] = files

        last_exc = None
        last_resp = None
        backoff = 0.8
        for attempt in range(retries + 1):
            try:
                resp = self.session.request(method, self._url(path), **kwargs)
                if resp.status_code in (502, 503, 504) and attempt < retries:
                    last_resp = resp
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                return resp
            except (requests.ConnectionError, requests.Timeout) as e:
                last_exc = e
                if attempt < retries:
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                raise
        if last_resp is not None:
            return last_resp
        if last_exc:
            raise last_exc
        raise RuntimeError("request exhausted retries with no response")

    # Shortcuts
    def get(self, path, **kw):    return self.request("GET", path, **kw)
    def post(self, path, **kw):   return self.request("POST", path, **kw)
    def put(self, path, **kw):    return self.request("PUT", path, **kw)
    def patch(self, path, **kw):  return self.request("PATCH", path, **kw)
    def delete(self, path, **kw): return self.request("DELETE", path, **kw)

    def json(self, method: str, path: str, **kw) -> Any:
        r = self.request(method, path, **kw)
        r.raise_for_status()
        if not r.content:
            return None
        return r.json()


# ---------- Auth helpers ----------

def login(client: Client, identifier: str, password: str) -> str:
    """Login, set token on client, return token."""
    r = client.post("/auth/login", json_body={"identifier": identifier, "password": password})
    if r.status_code != 200:
        raise AssertionError(f"login {identifier} failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    if not tok:
        raise AssertionError(f"login returned no token: {data}")
    client.token = tok
    return tok


def register_test_user(client: Client, email_prefix: str = "e2e") -> dict:
    """Register a fresh throwaway user. Returns {'email','password','user_id','token'}."""
    ts = int(time.time())
    uid = uuid.uuid4().hex[:6]
    email = f"{email_prefix}-{ts}-{uid}@cueforge-e2e.io"
    password = f"E2e!{uid}2026"
    payload = {
        "email": email,
        "password": password,
        "name": f"{email_prefix}_{ts}_{uid}",
    }
    r = client.post("/auth/register", json_body=payload)
    if r.status_code not in (200, 201):
        raise AssertionError(f"register failed: {r.status_code} {r.text[:300]}")
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    user = data.get("user") or {}
    if not tok:
        # Some APIs return user only; fallback to explicit login.
        tok = login(client, email, password)
    client.token = tok
    return {
        "email": email,
        "password": password,
        "user_id": user.get("id"),
        "token": tok,
    }


# ---------- Test decorator ----------

def run_step(report: TestReport, name: str, fn: Callable[[], Any], *, skip: bool = False, expect_fail: bool = False) -> Any:
    """
    Run a single test step. Returns the step's return value (or None on failure).
    Records result in report. Exceptions become 'fail'.
    If expect_fail=True, success means the callable raised.
    """
    if skip:
        report.add(name, "skip", 0, "skipped")
        return None
    t0 = time.time()
    try:
        out = fn()
        if expect_fail:
            report.add(name, "fail", int((time.time() - t0) * 1000),
                       "expected failure but succeeded")
            return None
        report.add(name, "pass", int((time.time() - t0) * 1000))
        return out
    except AssertionError as e:
        if expect_fail:
            report.add(name, "pass", int((time.time() - t0) * 1000), f"expected: {e}")
            return None
        report.add(name, "fail", int((time.time() - t0) * 1000), str(e))
        return None
    except Exception as e:
        detail = f"{type(e).__name__}: {e}"
        if os.environ.get("E2E_TRACEBACK") == "1":
            detail += "\n" + traceback.format_exc()
        report.add(name, "fail", int((time.time() - t0) * 1000), detail)
        return None


# ---------- Assertion helpers ----------

def assert_status(resp: requests.Response, *expected: int, context: str = ""):
    if resp.status_code not in expected:
        body = resp.text[:300] if resp.text else ""
        raise AssertionError(
            f"{context or resp.url} → got {resp.status_code}, expected {expected}. Body: {body}"
        )


def assert_keys(obj: dict, *keys: str, context: str = ""):
    if not isinstance(obj, dict):
        raise AssertionError(f"{context}: expected dict, got {type(obj).__name__}")
    missing = [k for k in keys if k not in obj]
    if missing:
        raise AssertionError(f"{context}: missing keys {missing} in {list(obj.keys())}")


def assert_list(obj: Any, *, min_len: int = 0, context: str = ""):
    if not isinstance(obj, list):
        raise AssertionError(f"{context}: expected list, got {type(obj).__name__}")
    if len(obj) < min_len:
        raise AssertionError(f"{context}: list too short ({len(obj)} < {min_len})")


# ---------- Print ----------

def print_suite_header(suite: str):
    print()
    print(bold(cyan(f"━━━ {suite} ")) + gray("━" * max(0, 60 - len(suite))))


def print_result_line(r: TestResult):
    if r.status == "pass":
        tag = green("  PASS ")
    elif r.status == "fail":
        tag = red("  FAIL ")
    else:
        tag = yellow("  SKIP ")
    dur = gray(f"({r.duration_ms}ms)")
    line = f"{tag} {r.name} {dur}"
    print(line)
    if r.status == "fail" and r.detail:
        for subline in r.detail.split("\n"):
            print(gray(f"         → {subline}"))


def print_summary(reports: list[TestReport]):
    total = sum(r.total for r in reports)
    passed = sum(r.passed for r in reports)
    failed = sum(r.failed for r in reports)
    skipped = sum(r.skipped for r in reports)
    total_ms = sum(r.elapsed_ms for r in reports)
    print()
    print(bold("═" * 60))
    print(bold("SUMMARY"))
    print(bold("═" * 60))
    for r in reports:
        status = green("✓") if r.ok else red("✗")
        line = f"  {status} {r.suite:.<30} {r.passed}/{r.total} pass  ({r.elapsed_ms}ms)"
        if r.failed:
            line += red(f"  — {r.failed} failed")
        if r.skipped:
            line += yellow(f"  — {r.skipped} skipped")
        print(line)
    print(bold("─" * 60))
    tag = green("ALL PASS") if failed == 0 else red(f"{failed} FAILED")
    print(bold(f"  {tag}  —  {passed}/{total} pass, {skipped} skip  ({total_ms}ms total)"))
    print(bold("═" * 60))
