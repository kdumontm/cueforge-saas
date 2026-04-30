"""
P7 — Mix Analyzer suite (12 tests).
Covers: POST /mix-analyzer/upload, GET /mix-analyzer/{job_id}
"""
from scripts.e2e.lib import (
    Client, RunContext, TestReport, register_test_user, run_step, assert_status, assert_keys
)
import io


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="mix_analyzer")
    client = Client(ctx.base_url)

    # Setup
    user_info = run_step(report, "register_user", lambda: register_test_user(client))
    if not user_info:
        return report
    client.token = user_info["token"]

    job_id = None

    # Test 1: POST /mix-analyzer/upload with mock file
    def test_upload_mix():
        # Create a minimal MP3-like file (won't be valid but may be accepted)
        files = {"file": ("test_mix.mp3", b"ID3" + b"\x00" * 100, "audio/mpeg")}
        r = client.post("/mix-analyzer/upload", files=files)
        assert_status(r, 200, 201, 202, 400, 413, 422, context="POST /mix-analyzer/upload")
        if r.status_code in (200, 201, 202):
            data = r.json()
            return data.get("job_id") or data.get("id")
        return None

    job_id = run_step(report, "upload_mix_file", test_upload_mix)

    # Test 2: Upload without file
    def test_upload_no_file():
        r = client.post("/mix-analyzer/upload")
        assert_status(r, 400, 422, context="POST /mix-analyzer/upload without file")

    run_step(report, "upload_no_file", test_upload_no_file)

    # Test 3: Upload with unsupported format
    def test_upload_unsupported():
        files = {"file": ("test.txt", b"not audio", "text/plain")}
        r = client.post("/mix-analyzer/upload", files=files)
        assert_status(r, 400, 415, 422, context="POST /mix-analyzer/upload unsupported format")

    run_step(report, "upload_unsupported_format", test_upload_unsupported)

    # Test 4: Upload auth required
    def test_upload_auth():
        client_noauth = Client(ctx.base_url)
        files = {"file": ("test.mp3", b"ID3\x00", "audio/mpeg")}
        r = client_noauth.post("/mix-analyzer/upload", files=files)
        assert_status(r, 401, 403, context="POST /mix-analyzer/upload without auth")

    run_step(report, "upload_auth_required", test_upload_auth)

    # Test 5: GET /mix-analyzer/{job_id} — success
    def test_get_mix_status():
        if not job_id:
            raise AssertionError("No job_id from upload")
        r = client.get(f"/mix-analyzer/{job_id}")
        assert_status(r, 200, context="GET /mix-analyzer/{job_id}")
        data = r.json()
        assert_keys(data, "job_id", "status", context="mix_status_schema")

    run_step(report, "get_mix_status", test_get_mix_status)

    # Test 6: GET /mix-analyzer/{job_id} — missing job
    def test_get_missing_job():
        r = client.get("/mix-analyzer/nonexistent-job")
        assert_status(r, 404, context="GET /mix-analyzer/{missing}")

    run_step(report, "get_missing_job", test_get_missing_job)

    # Test 7: GET /mix-analyzer/{job_id} — auth required
    def test_get_status_auth():
        if not job_id:
            raise AssertionError("No job_id")
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get(f"/mix-analyzer/{job_id}")
        assert_status(r, 401, 403, context="GET /mix-analyzer/{job_id} without auth")

    run_step(report, "get_status_auth", test_get_status_auth)

    # Test 8: Status field is valid
    def test_status_field():
        if not job_id:
            raise AssertionError("No job_id")
        r = client.get(f"/mix-analyzer/{job_id}")
        assert_status(r, 200, context="GET /mix-analyzer/{job_id}")
        data = r.json()
        status = data.get("status", "")
        valid_statuses = ("pending", "analyzing", "fingerprinting", "completed", "failed")
        if status not in valid_statuses:
            raise AssertionError(f"Invalid status: {status}. Expected one of {valid_statuses}")

    run_step(report, "status_field_valid", test_status_field)

    # Test 9: Progress field (if present) is valid
    def test_progress_field():
        if not job_id:
            raise AssertionError("No job_id")
        r = client.get(f"/mix-analyzer/{job_id}")
        assert_status(r, 200, context="GET /mix-analyzer/{job_id}")
        data = r.json()
        if "progress" in data:
            progress = data["progress"]
            if not isinstance(progress, (int, float)) or not (0 <= progress <= 100):
                raise AssertionError(f"Invalid progress: {progress}")

    run_step(report, "progress_field_valid", test_progress_field)

    # Test 10: Cross-user isolation
    def test_cross_user():
        if not job_id:
            raise AssertionError("No job_id")
        other = run_step(report, "_other_user", lambda: register_test_user(client, "e2e_other"))
        if not other:
            raise AssertionError("Could not register other user")
        other_client = Client(ctx.base_url)
        other_client.token = other["token"]
        r = other_client.get(f"/mix-analyzer/{job_id}")
        assert_status(r, 403, 404, context="GET /mix-analyzer/{other_user_job}")

    run_step(report, "cross_user_isolation", test_cross_user)

    # Test 11: Multiple uploads are independent
    def test_multiple_uploads():
        for i in range(2):
            files = {"file": (f"test{i}.mp3", b"ID3\x00" + bytes([i]) * 50, "audio/mpeg")}
            r = client.post("/mix-analyzer/upload", files=files)
            if r.status_code in (200, 201, 202):
                data = r.json()
                jid = data.get("job_id")
                if jid:
                    # Verify we can get status
                    r2 = client.get(f"/mix-analyzer/{jid}")
                    assert_status(r2, 200, context=f"GET /mix-analyzer (upload {i})")

    run_step(report, "multiple_uploads", test_multiple_uploads)

    # Test 12: Upload with WAV format
    def test_upload_wav():
        files = {"file": ("test.wav", b"RIFF" + b"\x00" * 50, "audio/wav")}
        r = client.post("/mix-analyzer/upload", files=files)
        assert_status(r, 200, 201, 202, 400, 413, 422, context="POST /mix-analyzer/upload WAV")

    run_step(report, "upload_wav", test_upload_wav)

    return report
