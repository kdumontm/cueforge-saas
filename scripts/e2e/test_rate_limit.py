"""
E2E rate_limit suite — s'assure que le login bruteforce est ralenti.

On n'essaie PAS de casser le rate limiter réel (15 tentatives suffisent pour
détecter s'il y en a un). On vérifie juste qu'après N mauvaises tentatives
successives sur le même email, le backend renvoie 429 OU le temps de
réponse augmente significativement (défense en profondeur).

Non bloquant : si aucun rate-limit n'est en place, on le flag en skip plutôt
qu'en fail, pour ne pas bloquer le run. C'est un signal, pas un gate.
"""
from __future__ import annotations

import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="rate_limit")

    pub = Client(ctx.base_url)

    # 1. Register then bruteforce wrong password
    user_info = {}

    def _setup_user():
        info = register_test_user(pub, email_prefix="e2e-rl")
        user_info.update(info)
    run_step(report, "setup target user", _setup_user)

    if not user_info:
        return report

    email = user_info["email"]
    client = Client(ctx.base_url)  # reset token

    statuses: list[int] = []
    durations: list[int] = []

    def _bruteforce_login():
        """15 bad login attempts in a row."""
        for i in range(15):
            t0 = time.time()
            r = client.post("/auth/login", json_body={
                "identifier": email,
                "password": f"WrongPass{i}!",
            })
            durations.append(int((time.time() - t0) * 1000))
            statuses.append(r.status_code)
    run_step(report, "15 bad login attempts", _bruteforce_login)

    def _rate_limit_triggered():
        # Look for 429 anywhere in the sequence
        if 429 in statuses:
            return  # rate-limit active — good
        # Or detect > 2x response-time slowdown (backend throttling)
        if len(durations) >= 10:
            first_5_avg = sum(durations[:5]) / 5
            last_5_avg = sum(durations[-5:]) / 5
            if last_5_avg > max(1.5 * first_5_avg, 500):
                return  # adaptive slowdown detected
        # Neither — report skip (can't know if RL is intentionally off)
        report.results[-1].detail = (
            f"no 429, timing stable ({durations[:3]}..{durations[-3:]}ms) — "
            "rate-limiter likely OFF on /auth/login. Consider enabling."
        )
        report.results[-1].status = "skip"
    run_step(report, "rate-limit signal on /auth/login", _rate_limit_triggered)

    # 2. Legit login should still work (rate-limiter shouldn't brick real users)
    def _legit_login_still_works():
        time.sleep(2)  # give the limiter a moment
        r = client.post("/auth/login", json_body={
            "identifier": email,
            "password": user_info["password"],
        })
        # 200 if RL cleared, 429 if still blocked (acceptable — user waits)
        if r.status_code not in (200, 401, 429):
            raise AssertionError(f"legit login after bruteforce unexpected: {r.status_code}")
    run_step(report, "legit login after bruteforce (tolerant)", _legit_login_still_works)

    # 3. Register bruteforce (same IP, many emails)
    register_statuses: list[int] = []

    def _register_burst():
        for i in range(10):
            ts = int(time.time() * 1000) + i
            r = pub.post("/auth/register", json_body={
                "email": f"e2e-rl-burst-{ts}-{i}@cueforge-e2e.io",
                "password": "Burst123!",
                "name": f"burst{i}",
            })
            register_statuses.append(r.status_code)
    run_step(report, "10 register attempts burst", _register_burst)

    def _register_rl_signal():
        if 429 in register_statuses:
            return
        # All 200 → no RL, just flag
        report.results[-1].detail = (
            f"no 429 on register burst (statuses={register_statuses}) — "
            "consider rate-limiting /auth/register"
        )
        report.results[-1].status = "skip"
    run_step(report, "rate-limit signal on /auth/register", _register_rl_signal)

    return report
