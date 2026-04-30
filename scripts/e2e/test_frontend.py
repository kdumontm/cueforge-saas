"""
E2E frontend suite.

Smoke-tests static HTML pages served by the Next.js frontend:
- GET /v4/*.html pages (index, library, analyze, sets, upload, admin, settings, etc.)
- GET /sw.js (Service Worker)
- GET /v4/api.js, /v4/shared.js, /v4/transitions.css, /v4/transitions.js
- GET /robots.txt, /sitemap.xml, /favicon.ico
- Vérifie status 200 + content-type correct
- Vérifie absence d'erreur visible
- Vérifie que assets 404 retournent vraiment 404 (pas page blanche)
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    run_step, assert_status, DEFAULT_FRONT_URL,
)


V4_PAGES = [
    "/v4/index.html",
    "/v4/library.html",
    "/v4/analyze.html",
    "/v4/sets.html",
    "/v4/upload.html",
    "/v4/admin.html",
    "/v4/settings.html",
    "/v4/blog.html",
    "/v4/changelog.html",
    "/v4/billing.html",
    "/v4/onboarding.html",
]

ASSETS = [
    "/sw.js",
    "/v4/api.js",
    "/v4/shared.js",
    "/v4/transitions.css",
    "/v4/transitions.js",
]

META_ASSETS = [
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.ico",
]


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="frontend")
    front_base = getattr(ctx, "front_url", None) or DEFAULT_FRONT_URL
    client = Client(front_base, api_prefix="")

    # Test v4 HTML pages
    for page in V4_PAGES:
        def _check_page(_path=page):
            r = client.get(_path, timeout=20)
            assert_status(r, 200, context=f"GET {_path}")
            body = r.text or ""
            if "Application error" in body or "client-side exception" in body:
                raise AssertionError(f"frontend error marker found in {_path}")
            # Verify it has a title
            if "<title>" not in body:
                raise AssertionError(f"{_path} missing <title> tag")
        run_step(report, f"v4 page: {page}", _check_page)

    # Test asset files
    for asset in ASSETS:
        def _check_asset(_path=asset):
            r = client.get(_path, timeout=20)
            assert_status(r, 200, context=f"GET {_path}")
            if len(r.text or "") < 10:
                raise AssertionError(f"{_path} suspiciously small ({len(r.text)} bytes)")
        run_step(report, f"asset: {asset}", _check_asset)

    # Test meta assets (may 404)
    for asset in META_ASSETS:
        def _check_meta(_path=asset):
            r = client.get(_path, timeout=20)
            # 200 if present, 404 if not — both are acceptable
            if r.status_code not in (200, 404):
                raise AssertionError(f"{_path} unexpected {r.status_code}")
        run_step(report, f"meta asset: {asset}", _check_meta)

    # Test that a truly missing asset returns 404 (not fallback to /404)
    def _missing_asset():
        r = client.get("/v4/nonexistent-xyz-asset.js", timeout=20)
        if r.status_code != 404:
            raise AssertionError(f"missing asset should return 404, got {r.status_code}")
    run_step(report, "missing asset → 404", _missing_asset)

    # Test Service Worker content-type
    def _sw_content_type():
        r = client.get("/sw.js", timeout=20)
        if r.status_code == 200:
            ct = r.headers.get("content-type", "")
            if "javascript" not in ct.lower():
                raise AssertionError(f"sw.js has wrong content-type: {ct}")
    run_step(report, "sw.js has JS content-type", _sw_content_type)

    return report
