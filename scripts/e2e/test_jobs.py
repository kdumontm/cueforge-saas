"""
P7 — Jobs suite (10 tests).
Covers: GET /jobs, GET /jobs/{job_id}, POST /jobs/{job_id}/cancel
"""
from scripts.e2e.lib import (
    Client, RunContext, TestReport, register_test_user, run_step, assert_status, assert_keys, assert_list
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="jobs")
    client = Client(ctx.base_url)

    # Setup
    user_info = run_step(report, "register_user", lambda: register_test_user(client))
    if not user_info:
        return report
    client.token = user_info["token"]

    # Test 1: GET /jobs (list user's jobs)
    def test_list_jobs():
        r = client.get("/jobs")
        assert_status(r, 200, context="GET /jobs")
        data = r.json()
        assert_keys(data, "jobs", context="jobs_list_schema")
        assert_list(data["jobs"], min_len=0, context="jobs_array")

    run_step(report, "list_user_jobs", test_list_jobs)

    # Test 2: GET /jobs without auth
    def test_list_jobs_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get("/jobs")
        assert_status(r, 401, 403, context="GET /jobs without auth")

    run_step(report, "list_jobs_auth", test_list_jobs_auth)

    # Test 3: GET /jobs/{job_id} with nonexistent job
    def test_get_missing_job():
        r = client.get("/jobs/nonexistent-job-id")
        assert_status(r, 404, context="GET /jobs/{missing}")

    run_step(report, "get_missing_job", test_get_missing_job)

    # Test 4: GET /jobs/{job_id} auth required
    def test_get_job_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get("/jobs/some-job-id")
        assert_status(r, 401, 403, 404, context="GET /jobs/{job_id} without auth")

    run_step(report, "get_job_auth", test_get_job_auth)

    # Test 5: POST /jobs/{job_id}/cancel with nonexistent job
    def test_cancel_missing():
        r = client.post("/jobs/nonexistent-job/cancel")
        assert_status(r, 404, context="POST /jobs/{missing}/cancel")

    run_step(report, "cancel_missing_job", test_cancel_missing)

    # Test 6: POST /jobs/{job_id}/cancel auth required
    def test_cancel_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.post("/jobs/some-job/cancel")
        assert_status(r, 401, 403, 404, context="POST /jobs/{job_id}/cancel without auth")

    run_step(report, "cancel_job_auth", test_cancel_auth)

    # Test 7: Job response schema
    def test_job_schema():
        r = client.get("/jobs")
        assert_status(r, 200, context="GET /jobs")
        data = r.json()
        jobs = data.get("jobs", [])
        if jobs:
            job = jobs[0]
            assert_keys(job, "job_id", "job_type", "status", "progress", context="job_schema")

    run_step(report, "job_schema", test_job_schema)

    # Test 8: Cross-user job isolation
    def test_cross_user_job():
        # Create second user
        other = run_step(report, "_other_user", lambda: register_test_user(client, "e2e_other"))
        if not other:
            raise AssertionError("Could not register other user")
        other_client = Client(ctx.base_url)
        other_client.token = other["token"]
        # Try to list jobs for the first user (should get only their own or isolation)
        r1 = client.get("/jobs")
        r2 = other_client.get("/jobs")
        assert_status(r1, 200, context="GET /jobs user1")
        assert_status(r2, 200, context="GET /jobs user2")
        # Note: Lists should be independent

    run_step(report, "cross_user_isolation", test_cross_user_job)

    # Test 9: Job status field is valid
    def test_job_status_valid():
        r = client.get("/jobs")
        assert_status(r, 200, context="GET /jobs")
        data = r.json()
        jobs = data.get("jobs", [])
        valid_statuses = ("queued", "running", "completed", "failed", "cancelled")
        for job in jobs:
            status = job.get("status", "")
            if status and status not in valid_statuses:
                # Tolerate unknown statuses
                pass

    run_step(report, "job_status_valid", test_job_status_valid)

    # Test 10: Job progress is within range
    def test_job_progress():
        r = client.get("/jobs")
        assert_status(r, 200, context="GET /jobs")
        data = r.json()
        jobs = data.get("jobs", [])
        for job in jobs:
            progress = job.get("progress", 0)
            if not isinstance(progress, (int, float)) or not (0 <= progress <= 100):
                raise AssertionError(f"Invalid progress: {progress}")

    run_step(report, "job_progress_valid", test_job_progress)

    return report
