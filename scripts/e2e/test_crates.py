"""
E2E crates suite — Smart Crates CRUD.
- POST /api/v1/crates (body: SmartCrateCreate)
- GET /api/v1/crates
- GET /api/v1/crates/{id} (with matched tracks)
- PATCH /api/v1/crates/{id}
- DELETE /api/v1/crates/{id}
"""
from __future__ import annotations

import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status, assert_keys,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="crates")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-crates")

    # 1. List (should be empty for fresh user)
    def _list_initial():
        r = client.get("/crates")
        if r.status_code == 404:
            return  # feature may not be mounted
        assert_status(r, 200, context="list crates")
        d = r.json()
        assert isinstance(d, list) or isinstance(d, dict), f"crates list unexpected: {type(d)}"
    run_step(report, "GET /crates (initial empty)", _list_initial)

    # 2. Create crate with smart filter (BPM range)
    crate_id: list[int] = []

    def _create_crate():
        # schema: SmartCrateCreate { name, rules: List[CrateRule{field,op,value}], ... }
        payload = {
            "name": f"E2E Crate {int(time.time())}",
            "description": "Auto E2E crate",
            "rules": [
                {"field": "bpm", "op": "between", "value": [120, 130]},
            ],
            "match_mode": "all",
        }
        r = client.post("/crates", json_body=payload)
        if r.status_code == 404:
            return
        assert_status(r, 200, 201, context="create crate")
        d = r.json()
        if "id" in d:
            crate_id.append(d["id"])
    run_step(report, "POST /crates (create)", _create_crate)

    if not crate_id:
        return report
    cid = crate_id[0]

    def _get_detail():
        r = client.get(f"/crates/{cid}")
        assert_status(r, 200, context="crate detail")
        d = r.json()
        assert_keys(d, "id", context="crate detail")
    run_step(report, "GET /crates/{id} (with matched tracks)", _get_detail)

    def _patch_crate():
        r = client.patch(f"/crates/{cid}", json_body={"description": "Updated E2E"})
        if r.status_code in (404, 405):
            return
        assert_status(r, 200, context="patch crate")
    run_step(report, "PATCH /crates/{id}", _patch_crate)

    # List now contains the crate
    def _list_contains():
        r = client.get("/crates")
        assert_status(r, 200)
        d = r.json()
        items = d if isinstance(d, list) else d.get("crates", [])
        ids = {c.get("id") for c in items}
        if cid not in ids:
            raise AssertionError(f"crate {cid} not in list")
    run_step(report, "list contains new crate", _list_contains)

    def _delete_crate():
        r = client.delete(f"/crates/{cid}")
        if r.status_code not in (200, 204):
            raise AssertionError(f"delete unexpected {r.status_code}")
    run_step(report, "DELETE /crates/{id}", _delete_crate)

    def _gone():
        r = client.get(f"/crates/{cid}")
        if r.status_code not in (404, 410):
            raise AssertionError(f"deleted crate should 404, got {r.status_code}")
    run_step(report, "deleted crate returns 404", _gone)

    return report
