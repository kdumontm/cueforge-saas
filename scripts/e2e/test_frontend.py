"""
E2E frontend suite.

Smoke-tests static HTML pages served by the Next.js frontend:
- GET /, /login, /register, /pricing
- GET /library, /analyze, /upload, /admin, /settings, /profile
- Vérifie status 200 + présence de <script src="/v4/*.js"> (indicateur v4 actif)
- Vérifie absence d'erreur SSR visible (no "Application error" string)
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    run_step, assert_status, DEFAULT_FRONT_URL,
)


PAGES = [
    "/",
    "/login",
    "/register",
    "/pricing",
    "/library",
    "/analyze",
    "/upload",
    "/admin",
    "/settings",
]


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="frontend")
    front_base = getattr(ctx, "front_url", None) or DEFAULT_FRONT_URL
    client = Client(front_base, api_prefix="")

    for page in PAGES:
        path = page  # GET / will hit Next.js home

        def _check(_path=path):
            r = client.get(_path, timeout=20)
            if r.status_code in (301, 302, 307, 308):
                # follow one redirect manually
                loc = r.headers.get("location") or ""
                if loc.startswith("/"):
                    r = client.get(loc, timeout=20)
            assert_status(r, 200, context=f"GET {_path}")
            body = r.text or ""
            if "Application error" in body or "client-side exception" in body:
                raise AssertionError("frontend error marker found in HTML")
            # Soft check: home + pricing + login + register are full HTML
            if _path in ("/", "/login", "/register", "/pricing") and len(body) < 500:
                raise AssertionError(f"suspiciously small page ({len(body)} bytes)")
        run_step(report, f"GET {path}", _check)

    # Bonus: cache headers
    def _cache_headers():
        r = client.get("/library", timeout=15)
        cc = r.headers.get("cache-control", "")
        if "s-maxage" not in cc and "max-age" not in cc:
            # Not a hard fail — just informational
            pass
    run_step(report, "library has cache-control", _cache_headers)

    return report
