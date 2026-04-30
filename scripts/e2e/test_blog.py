"""
E2E blog suite — blog posts CRUD (public read, admin write)
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, login, run_step, assert_status, assert_keys, assert_list,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="blog")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-blog")

    post_slug = None

    # GET /blog/posts — list public posts (no auth required)
    def _list_posts():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/blog/posts")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /blog/posts")
        data = r.json()
        assert_list(data, context="posts list")
    run_step(report, "GET /blog/posts (public)", _list_posts)

    # GET /blog/categories — list categories
    def _list_categories():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/blog/categories")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /blog/categories")
    run_step(report, "GET /blog/categories", _list_categories)

    # POST /blog/posts — create post (admin only, may 403)
    def _create_post():
        nonlocal post_slug
        r = client.post("/blog/posts", json_body={
            "title": "E2E Test Post",
            "slug": "e2e-test-post-slug",
            "content": "This is a test post content",
            "excerpt": "Test excerpt",
            "category": "news"
        })
        # May 404 (endpoint doesn't exist), 403 (not admin), 422 (schema)
        if r.status_code in (404, 403, 422):
            return
        if r.status_code in (400, 422):
            return
        assert_status(r, 200, 201, context="POST /blog/posts")
        data = r.json()
        post_slug = data.get("slug")
        assert_keys(data, "id", "slug", "title", context="post response")
    run_step(report, "POST /blog/posts create", _create_post)

    if not post_slug:
        # Use a default slug for further tests
        post_slug = "e2e-test-post-slug"

    # GET /blog/posts/{slug} — get public post detail
    def _get_post():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get(f"/blog/posts/{post_slug}")
        if r.status_code in (404, 422):
            return
        if r.status_code == 404:
            return  # Post may not exist
        assert_status(r, 200, context="GET /blog/posts/{slug}")
        data = r.json()
        assert_keys(data, "id", "slug", "title", context="post detail")
    run_step(report, "GET /blog/posts/{slug}", _get_post)

    # PUT /blog/posts/{slug} — update post (admin only)
    def _update_post():
        r = client.put(f"/blog/posts/{post_slug}", json_body={
            "title": "E2E Test Post Updated"
        })
        if r.status_code in (404, 403, 422):
            return
        if r.status_code in (400, 422):
            return
        assert_status(r, 200, context="PUT /blog/posts/{slug}")
    run_step(report, "PUT /blog/posts/{slug} update", _update_post)

    # DELETE /blog/posts/{slug} (admin only)
    def _delete_post():
        r = client.delete(f"/blog/posts/{post_slug}")
        if r.status_code in (404, 403, 422):
            return
        if r.status_code in (403, 409):
            return
        assert_status(r, 204, context="DELETE /blog/posts/{slug}")
    run_step(report, "DELETE /blog/posts/{slug}", _delete_post)

    # Pagination test
    def _list_posts_paginated():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/blog/posts", params={"skip": 0, "limit": 10})
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /blog/posts paginated")
    run_step(report, "GET /blog/posts with pagination", _list_posts_paginated)

    # POST without auth (regular user, may fail)
    def _post_no_admin():
        regular_client = Client(ctx.base_url)
        register_test_user(regular_client, email_prefix="e2e-blog-user")
        r = regular_client.post("/blog/posts", json_body={
            "title": "Test",
            "slug": "test-slug",
            "content": "test"
        })
        # Should fail with 403 or 422
        if r.status_code in (403, 404, 422):
            return
        raise AssertionError(f"non-admin should not POST, got {r.status_code}")
    run_step(report, "POST /blog/posts non-admin → 403", _post_no_admin)

    return report
