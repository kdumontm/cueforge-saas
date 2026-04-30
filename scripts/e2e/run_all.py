#!/usr/bin/env python3
"""
CueForge E2E master runner.

Usage:
    python3 scripts/e2e/run_all.py                         # all suites on Railway prod
    python3 scripts/e2e/run_all.py --only=auth,tracks      # just these
    python3 scripts/e2e/run_all.py --exclude=frontend      # skip one
    python3 scripts/e2e/run_all.py --url=http://localhost:8000
    python3 scripts/e2e/run_all.py --admin=kenin:kenin33   # enables admin suite

Environment:
    CUEFORGE_BASE_URL     — backend URL (default: Railway prod)
    CUEFORGE_FRONT_URL    — frontend URL (default: v4 on Railway)
    CUEFORGE_ADMIN_USER   — admin identifier (enables admin suite)
    CUEFORGE_ADMIN_PASS   — admin password
    CUEFORGE_DIAG_KEY     — DIAGNOSTICS_KEY for /diagnostics/* suite
    NO_COLOR=1            — disable ANSI colors
    E2E_TRACEBACK=1       — verbose tracebacks on failure

Exit code: 0 if all pass, 1 if any suite failed.
"""
from __future__ import annotations

import argparse
import importlib
import os
import sys
import time
from pathlib import Path

# Make sure "scripts.e2e.*" is importable when running this file directly
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.e2e.lib import (  # noqa: E402
    RunContext, TestReport,
    DEFAULT_BASE_URL, DEFAULT_FRONT_URL,
    print_suite_header, print_result_line, print_summary,
    bold, cyan, green, red, yellow, gray,
)


SUITES_ORDER = [
    # Core
    ("health",    "scripts.e2e.test_health"),
    ("frontend",  "scripts.e2e.test_frontend"),
    ("auth",      "scripts.e2e.test_auth"),
    ("tracks",    "scripts.e2e.test_tracks"),
    ("analyze",   "scripts.e2e.test_analyze"),
    ("library",   "scripts.e2e.test_library"),
    ("sets",      "scripts.e2e.test_sets"),
    ("mashup",    "scripts.e2e.test_mashup"),
    # P1 — core features
    ("playlists", "scripts.e2e.test_playlists"),
    ("crates",    "scripts.e2e.test_crates"),
    ("exports",   "scripts.e2e.test_exports"),
    ("waveforms", "scripts.e2e.test_waveforms"),
    ("hot_cues",  "scripts.e2e.test_hot_cues"),
    ("sharing",   "scripts.e2e.test_sharing"),
    ("compare",   "scripts.e2e.test_compare"),
    # P2 — security
    ("negative",    "scripts.e2e.test_negative"),
    ("permissions", "scripts.e2e.test_permissions"),
    ("quota",       "scripts.e2e.test_quota"),
    ("rate_limit",  "scripts.e2e.test_rate_limit"),
    # P3 — audio avancé
    ("audio_advanced", "scripts.e2e.test_audio_advanced"),
    ("fingerprint",    "scripts.e2e.test_fingerprint"),
    ("recommendation", "scripts.e2e.test_recommendation"),
    # P4 — account
    ("account",     "scripts.e2e.test_account"),
    # P5 — business
    ("billing",        "scripts.e2e.test_billing"),
    ("organization",   "scripts.e2e.test_organization"),
    ("cue_ai",         "scripts.e2e.test_cue_ai"),
    ("cue_templates",  "scripts.e2e.test_cue_templates"),
    ("blog",           "scripts.e2e.test_blog"),
    ("user_stats",     "scripts.e2e.test_user_stats"),
    ("activity",       "scripts.e2e.test_activity"),
    # P6 — flows bout-en-bout
    ("flows",       "scripts.e2e.test_flows"),
    # UX — widget feedback
    ("feedback-widget", "scripts.e2e.test_feedback_widget"),
    # P7 — infra / audio avancé
    ("audio_quality",     "scripts.e2e.test_audio_quality"),
    ("bpm_key_advanced",  "scripts.e2e.test_bpm_key_advanced"),
    ("mix_analyzer",      "scripts.e2e.test_mix_analyzer"),
    ("dj_import",         "scripts.e2e.test_dj_import"),
    ("jobs",              "scripts.e2e.test_jobs"),
    ("monitoring",        "scripts.e2e.test_monitoring"),
    ("advanced",          "scripts.e2e.test_advanced"),
    ("analytics",         "scripts.e2e.test_analytics"),
    ("devops",            "scripts.e2e.test_devops"),
    # Admin (core + extended)
    ("admin",           "scripts.e2e.test_admin"),
    ("admin_extended",  "scripts.e2e.test_admin_extended"),
]


def parse_args():
    p = argparse.ArgumentParser(description="CueForge E2E runner")
    p.add_argument("--url", default=os.environ.get("CUEFORGE_BASE_URL", DEFAULT_BASE_URL),
                   help="Backend base URL")
    p.add_argument("--front", default=os.environ.get("CUEFORGE_FRONT_URL", DEFAULT_FRONT_URL),
                   help="Frontend base URL")
    p.add_argument("--only", default="",
                   help="Comma-separated list of suites to run (e.g. auth,tracks)")
    p.add_argument("--exclude", default="",
                   help="Comma-separated list of suites to skip")
    p.add_argument("--admin", default="",
                   help="admin creds as 'identifier:password' (shortcut)")
    p.add_argument("--diag-key", default=os.environ.get("CUEFORGE_DIAG_KEY", ""),
                   help="DIAGNOSTICS_KEY for diagnostics endpoints")
    p.add_argument("--list", action="store_true", help="List available suites and exit")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if args.list:
        print(bold("Available suites:"))
        for name, _ in SUITES_ORDER:
            print(f"  - {name}")
        return 0

    # Build ctx
    ctx = RunContext(base_url=args.url)
    # Non-dataclass attribute for frontend URL (lib.py doesn't know about front)
    ctx.front_url = args.front  # type: ignore[attr-defined]

    # Admin creds: CLI > env vars
    admin_env_u = os.environ.get("CUEFORGE_ADMIN_USER")
    admin_env_p = os.environ.get("CUEFORGE_ADMIN_PASS")
    if args.admin and ":" in args.admin:
        u, _, pw = args.admin.partition(":")
        ctx.admin_identifier = u
        ctx.admin_password = pw
    elif admin_env_u and admin_env_p:
        ctx.admin_identifier = admin_env_u
        ctx.admin_password = admin_env_p

    ctx.diagnostics_key = args.diag_key or None

    # Filter suites
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    excl = {s.strip() for s in args.exclude.split(",") if s.strip()}
    suites = [(n, m) for n, m in SUITES_ORDER if (not only or n in only) and n not in excl]

    if not suites:
        print(red("No suites selected."))
        return 1

    print(bold(cyan("CueForge E2E Runner")))
    print(gray(f"  backend:   {args.url}"))
    print(gray(f"  frontend:  {args.front}"))
    print(gray(f"  admin:     {'yes' if ctx.admin_identifier else 'no'}"))
    print(gray(f"  diag key:  {'yes' if ctx.diagnostics_key else 'no'}"))
    print(gray(f"  suites:    {', '.join(n for n, _ in suites)}"))

    reports: list[TestReport] = []
    t_start = time.time()

    # Space out suites so Railway's 1-2 workers don't saturate.
    # Tunable via CUEFORGE_SUITE_DELAY_MS (default: 5000ms).
    # Railway budget 0€ = ~1 worker, a full sequential run of ~350 tests
    # can otherwise hammer DB connections / sqlalchemy sessions.
    suite_delay_ms = int(os.environ.get("CUEFORGE_SUITE_DELAY_MS", "5000"))

    for i, (name, mod_path) in enumerate(suites):
        if i > 0 and suite_delay_ms > 0:
            time.sleep(suite_delay_ms / 1000.0)
        print_suite_header(name)
        try:
            mod = importlib.import_module(mod_path)
        except Exception as e:
            r = TestReport(suite=name)
            r.add("import suite", "fail", 0, f"{type(e).__name__}: {e}")
            reports.append(r)
            print_result_line(r.results[-1])
            continue
        try:
            report = mod.run(ctx)
        except Exception as e:
            # Suite crashed (e.g. 502 before any test_step could run)
            report = TestReport(suite=name)
            detail = f"{type(e).__name__}: {e}"
            if os.environ.get("E2E_TRACEBACK") == "1":
                import traceback as _tb
                detail += "\n" + _tb.format_exc()
            report.add("suite crashed", "fail", 0, detail)
        reports.append(report)
        for line in report.results:
            print_result_line(line)

    print_summary(reports)
    print(gray(f"\nTotal wall time: {int((time.time() - t_start) * 1000)}ms"))

    return 0 if all(r.ok for r in reports) else 1


if __name__ == "__main__":
    sys.exit(main())
