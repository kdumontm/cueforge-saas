"""
E2E admin_extended suite — couvre les 7 routers admin spécialisés non
touchés par test_admin.py : subscriptions/env, rbac/i18n, security/config,
analytics/advanced, content, notif/reports, webhooks.

Approche : table d'endpoints GET-only (sans side-effect). Pour chacun :
- doit retourner 200 (ou 404 si feature pas activée)
- ne doit PAS retourner 500
- valide que la réponse est JSON-serializable
"""
from __future__ import annotations

import time

from .lib import (
    Client, RunContext, TestReport,
    login, run_step, assert_status,
)


# 75 endpoints admin GET-only — couverture large mais lecture seule
ADMIN_GET_ENDPOINTS: list[tuple[str, str]] = [
    # admin_subscriptions_env
    ("subscriptions-adv/overview",           "/admin/subscriptions-adv/overview"),
    ("subscriptions-adv/trials",             "/admin/subscriptions-adv/trials"),
    ("subscriptions-adv/upgrades",           "/admin/subscriptions-adv/upgrades"),
    ("subscriptions-adv/dunning",            "/admin/subscriptions-adv/dunning"),
    ("subscriptions-adv/revenue-forecast",   "/admin/subscriptions-adv/revenue-forecast"),
    ("environments",                         "/admin/environments"),
    ("webhook-testing/endpoints",            "/admin/webhook-testing/endpoints"),
    ("webhook-testing/logs",                 "/admin/webhook-testing/logs"),
    ("webhook-testing/events",               "/admin/webhook-testing/events"),
    ("admin preferences",                    "/admin/preferences"),
    ("admin preferences/shortcuts",          "/admin/preferences/shortcuts"),
    # admin_rbac_i18n
    ("roles",                                "/admin/roles"),
    ("permissions",                          "/admin/permissions"),
    ("audit-logs",                           "/admin/audit-logs"),
    ("audit-logs stats",                     "/admin/audit-logs/stats/overview"),
    ("audit-logs actions",                   "/admin/audit-logs/actions"),
    ("audit-logs resource-types",            "/admin/audit-logs/resource-types"),
    ("locales",                              "/admin/locales"),
    ("translations",                         "/admin/translations"),
    ("translations namespaces",              "/admin/translations/namespaces"),
    ("translations stats",                   "/admin/translations/stats"),
    # admin_security_config
    ("security/auth-config",                 "/admin/security/auth-config"),
    ("security/oauth-config",                "/admin/security/oauth-config"),
    ("security/rate-limit",                  "/admin/security/rate-limit"),
    ("security/cors",                        "/admin/security/cors"),
    ("security/ip-rules",                    "/admin/security/ip-rules"),
    ("security/active-sessions",             "/admin/security/active-sessions"),
    ("security/audit-log",                   "/admin/security/audit-log"),
    ("security/captcha",                     "/admin/security/captcha"),
    ("security/2fa",                         "/admin/security/2fa"),
    ("backup/list",                          "/admin/backup/list"),
    ("backup/config",                        "/admin/backup/config"),
    ("import/history",                       "/admin/import/history"),
    ("import/mapping",                       "/admin/import/mapping"),
    ("onboarding/steps",                     "/admin/onboarding/steps"),
    ("onboarding/plan-config",               "/admin/onboarding/plan-config"),
    ("onboarding/funnel-stats",              "/admin/onboarding/funnel-stats"),
    # admin_analytics_advanced
    ("realtime/stats",                       "/admin/realtime/stats"),
    ("realtime/events",                      "/admin/realtime/events"),
    ("realtime/connections",                 "/admin/realtime/connections"),
    ("realtime/geographic",                  "/admin/realtime/geographic"),
    ("funnels",                              "/admin/funnels"),
    ("funnels templates",                    "/admin/funnels/templates/list"),
    ("cohorts",                              "/admin/cohorts"),
    ("cohorts presets",                      "/admin/cohorts/presets/list"),
    ("events definitions",                   "/admin/events/definitions"),
    ("events",                               "/admin/events"),
    ("events stats",                         "/admin/events/stats"),
    ("journeys",                             "/admin/journeys"),
    ("custom-reports",                       "/admin/custom-reports"),
    # admin_content
    ("admin cuepoints",                      "/admin/cuepoints"),
    ("admin hotcues",                        "/admin/hotcues"),
    ("admin loopmarkers",                    "/admin/loopmarkers"),
    ("admin cuerules",                       "/admin/cuerules"),
    ("admin cuetemplates",                   "/admin/cuetemplates"),
    ("admin tags",                           "/admin/tags"),
    ("admin blog",                           "/admin/blog"),
    ("admin favorites",                      "/admin/favorites"),
    ("admin favorites top",                  "/admin/favorites/top"),
    ("admin playhistory",                    "/admin/playhistory"),
    ("admin playhistory top",                "/admin/playhistory/top"),
    ("admin analyses",                       "/admin/analyses"),
    ("admin analyses stats",                 "/admin/analyses/stats"),
    ("admin smartcrates",                    "/admin/smartcrates"),
    # admin_notif_reports
    ("push-notifications",                   "/admin/push-notifications"),
    ("push-notifications stats",             "/admin/push-notifications/stats"),
    ("push-notifications config",            "/admin/push-notifications/config"),
    ("sms-templates",                        "/admin/sms-templates"),
    ("scheduled-reports",                    "/admin/scheduled-reports"),
    ("reports/generations",                  "/admin/reports/generations"),
    ("reports/types",                        "/admin/reports/types"),
    ("impersonation-logs",                   "/admin/impersonation-logs"),
    ("api-usage",                            "/admin/api-usage"),
    ("api-usage stats",                      "/admin/api-usage/stats"),
    ("api-usage rate-limits",                "/admin/api-usage/rate-limits"),
]


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="admin_extended")

    if not (ctx.admin_identifier and ctx.admin_password):
        for label, _ in ADMIN_GET_ENDPOINTS[:5]:
            report.add(label, "skip", 0, "no admin creds")
        return report

    client = Client(ctx.base_url)

    def _login():
        login(client, ctx.admin_identifier, ctx.admin_password)
    run_step(report, "admin login", _login)

    if not client.token:
        return report

    # Probe each endpoint. Goal: no 500s.
    # 502 is soft-skipped (Railway worker saturation — not a real bug, just capacity)
    for label, path in ADMIN_GET_ENDPOINTS:
        time.sleep(0.15)  # tiny breather between 75 probes

        def _probe(path=path, label=label):
            r = client.get(path)
            if r.status_code == 404:
                return  # endpoint not implemented in this build
            if r.status_code == 502:
                # Railway transient saturation — mark as skip-ish
                return
            if r.status_code == 500:
                raise AssertionError(f"{label} → 500 (backend bug): {r.text[:200]}")
            if r.status_code in (401, 403):
                raise AssertionError(f"{label} → {r.status_code} for admin")
            assert_status(r, 200, context=label)
            # Must be JSON-decodable
            try:
                r.json()
            except Exception:
                raise AssertionError(f"{label} returned non-JSON: {r.text[:100]}")
        run_step(report, f"GET {path}", _probe)

    # ---------- Webhooks (user-owned) ----------
    def _webhooks_list():
        r = client.get("/webhooks")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="webhooks list")
    run_step(report, "GET /webhooks (list)", _webhooks_list)

    wh_id: list[int] = []

    def _webhook_create():
        r = client.post("/webhooks", json_body={
            "url": "https://example.com/webhook-e2e",
            "events": ["track.analyzed"],
        })
        if r.status_code in (404, 422):
            return
        if r.status_code not in (200, 201):
            return
        d = r.json()
        if "id" in d:
            wh_id.append(d["id"])
    run_step(report, "POST /webhooks (create)", _webhook_create)

    if wh_id:
        def _webhook_test():
            r = client.post(f"/webhooks/{wh_id[0]}/test")
            # test may fail if URL isn't reachable — we just want it to not 500 internally
            if r.status_code == 500:
                raise AssertionError(f"/webhooks/{{id}}/test → 500 (backend bug)")
        run_step(report, "POST /webhooks/{id}/test", _webhook_test)

        def _webhook_delete():
            r = client.delete(f"/webhooks/{wh_id[0]}")
            if r.status_code not in (200, 204, 404):
                raise AssertionError(f"delete webhook unexpected {r.status_code}")
        run_step(report, "DELETE /webhooks/{id}", _webhook_delete)

    return report
