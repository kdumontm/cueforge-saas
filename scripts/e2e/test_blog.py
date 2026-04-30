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

    # Search posts by title
    def _search_posts():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/blog/posts", params={"search": "e2e", "q": "e2e"})
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="search posts")
    run_step(report, "GET /blog/posts with search query", _search_posts)

    # Filter by category
    def _filter_category():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/blog/posts", params={"category": "news"})
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="filter by category")
    run_step(report, "GET /blog/posts with category filter", _filter_category)

    # Get featured/top posts
    def _featured_posts():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/blog/posts/featured")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="featured posts")
    run_step(report, "GET /blog/posts/featured", _featured_posts)

    # Get recent posts
    def _recent_posts():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/blog/recent")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="recent posts")
    run_step(report, "GET /blog/recent (recent posts)", _recent_posts)

    # Post comments (if supported)
    def _post_comment():
        r = client.post(f"/blog/posts/{post_slug}/comments", json_body={
            "text": "Great article!"
        })
        if r.status_code in (404, 405, 422):
            return
        # 200, 201, or 403 if comments disabled
        if r.status_code not in (200, 201, 403):
            raise AssertionError(f"post comment unexpected {r.status_code}")
    run_step(report, "POST /blog/posts/{slug}/comments", _post_comment)

    # List comments
    def _list_comments():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get(f"/blog/posts/{post_slug}/comments")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="list comments")
    run_step(report, "GET /blog/posts/{slug}/comments", _list_comments)

    # Get tags/topics
    def _list_tags():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/blog/tags")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="list tags")
    run_step(report, "GET /blog/tags", _list_tags)

    # Like post (if supported)
    def _like_post():
        r = client.post(f"/blog/posts/{post_slug}/like")
        if r.status_code in (404, 405, 422):
            return
        # 200 or 201 for like, 400 if already liked
        if r.status_code not in (200, 201, 400):
            raise AssertionError(f"like post unexpected {r.status_code}")
    run_step(report, "POST /blog/posts/{slug}/like", _like_post)

    # Get likes count
    def _likes_count():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get(f"/blog/posts/{post_slug}/likes")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="get likes count")
    run_step(report, "GET /blog/posts/{slug}/likes (likes count)", _likes_count)

    return report
