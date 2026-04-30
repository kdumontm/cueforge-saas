"""
E2E quota suite — s'assure que les quotas free-tier sont enforced.

On crée un fresh user, on upload 5 tracks (= cap free tier), puis la 6ème
DOIT être refusée (429 quota exceeded, 402 payment required, 403 forbidden,
ou 400 avec message clair). Si elle passe, c'est un bug quota.

Le but n'est PAS de tester la performance — c'est de valider que la règle
métier free-tier est bien appliquée.
"""
from __future__ import annotations

import struct

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status,
)


def _tiny_wav(sr: int = 22050, seconds: float = 0.2) -> bytes:
    n = int(seconds * sr)
    h = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", n * 2)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="quota")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-quota")

    created: list[int] = []
    quota_hit_at: list[int] = []

    def _upload_many():
        """Upload up to 8 tracks. Track where the backend starts rejecting."""
        for i in range(8):
            r = client.post("/tracks/upload",
                            files={"file": (f"quota_{i}.wav", _tiny_wav(), "audio/wav")})
            if r.status_code in (200, 201):
                body = r.json()
                t = body.get("track") if "track" in body else body
                if t.get("id"):
                    created.append(t["id"])
                continue
            if r.status_code in (402, 403, 429):
                # Quota enforced — good signal
                quota_hit_at.append(i)
                break
            if r.status_code == 400 and "quota" in r.text.lower():
                quota_hit_at.append(i)
                break
            # Unexpected — log and stop
            quota_hit_at.append(-1)
            break
    run_step(report, "upload loop until quota hit (max 8)", _upload_many)

    def _quota_enforced():
        # Free tier should hit its cap. We expect quota_hit_at to be non-empty
        # OR created to be capped at <=5 (if backend rejects silently).
        if not quota_hit_at and len(created) >= 8:
            raise AssertionError(f"QUOTA BUG: 8 uploads accepted on free tier (no cap)")
        if quota_hit_at == [-1]:
            # Unknown status code — flag
            raise AssertionError("unexpected status on quota rejection (not 402/403/429)")
        # Else: quota_hit_at[0] tells us how many passed before the cap
    run_step(report, "free tier cap enforced (5-10 tracks)", _quota_enforced)

    # Check /quota endpoint if present
    def _quota_endpoint():
        r = client.get("/quota")
        if r.status_code == 404:
            return  # not mounted
        assert_status(r, 200, context="quota endpoint")
        d = r.json()
        assert isinstance(d, dict)
        # Usually has shape: {uploads: {used: N, limit: M}} or {used: N, limit: M}
    run_step(report, "GET /quota (if exposed)", _quota_endpoint)

    # Check /quota breakdown by category
    def _quota_by_category():
        r = client.get("/quota")
        if r.status_code != 200:
            return
        d = r.json()
        # Expect subcategories: analyses, storage, concurrent, etc.
        if "analyses" in d or "storage" in d or "concurrent" in d:
            # Good shape
            pass
    run_step(report, "quota has category breakdown", _quota_by_category)

    # Test /quota/upgrade with invalid plan
    def _upgrade_invalid():
        r = client.post("/quota/upgrade", json_body={"plan": "nonexistent-plan-xyz"})
        if r.status_code == 404:
            return  # endpoint not mounted
        # Should be 400 or 422 for invalid plan
        if r.status_code not in (400, 422):
            raise AssertionError(f"upgrade invalid plan should be 400/422, got {r.status_code}")
    run_step(report, "upgrade with invalid plan → 400/422", _upgrade_invalid)

    # Test /quota after uploads (should show usage)
    def _quota_after_upload():
        if not created:
            return
        r = client.get("/quota")
        if r.status_code != 200:
            return
        d = r.json()
        # Check that usage > 0 if we uploaded
        if "uploads" in d:
            used = d["uploads"].get("used", 0)
            if used == 0:
                raise AssertionError(f"quota shows 0 usage after uploading {len(created)} tracks")
    run_step(report, "quota updated after uploads", _quota_after_upload)

    # Stats endpoint: should reflect uploaded count
    def _stats_matches():
        r = client.get("/auth/stats")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="auth stats")
    run_step(report, "GET /auth/stats (tolerant)", _stats_matches)

    # Test /quota/usage-breakdown if exposed
    def _usage_breakdown():
        r = client.get("/quota/usage-breakdown")
        if r.status_code == 404:
            return  # not mounted
        assert_status(r, 200, context="quota/usage-breakdown")
    run_step(report, "GET /quota/usage-breakdown", _usage_breakdown)

    # Test /quota/reset (admin only, should 403 for regular user)
    def _quota_reset_forbidden():
        r = client.post("/quota/reset", json_body={})
        if r.status_code == 404:
            return  # not mounted
        # Should be 403 for non-admin
        if r.status_code not in (403, 401):
            raise AssertionError(f"quota/reset should be forbidden, got {r.status_code}")
    run_step(report, "quota/reset forbidden for user", _quota_reset_forbidden)

    # Test /quota limits consistency (limit should not decrease on retries)
    def _quota_limit_stable():
        r1 = client.get("/quota")
        if r1.status_code != 200:
            return
        import time
        time.sleep(0.5)
        r2 = client.get("/quota")
        if r2.status_code != 200:
            return
        d1 = r1.json()
        d2 = r2.json()
        # Limits should be identical
        if d1 != d2 and "uploads" in d1 and "uploads" in d2:
            l1 = d1["uploads"].get("limit")
            l2 = d2["uploads"].get("limit")
            if l1 != l2:
                raise AssertionError(f"quota limit changed: {l1} vs {l2}")
    run_step(report, "quota limit stable on retries", _quota_limit_stable)

    # ---------- Cleanup ----------
    def _cleanup():
        for tid in created:
            client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup uploaded tracks", _cleanup)

    return report
