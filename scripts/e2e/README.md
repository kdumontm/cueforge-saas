# CueForge E2E

Suite de tests end-to-end pour CueForge, exécutables à la demande contre Railway (prod) ou localhost.

**Total** : ~350 tests sur 22 suites.

## Lancer tous les E2E

```bash
# Tout sur prod Railway (avec throttling 5s/suite par défaut)
python3 scripts/e2e/run_all.py --admin=kenin:kenin33

# Pour Railway à budget 0€ (1-2 workers), on recommande 2 passes :
python3 scripts/e2e/run_all.py --only=health,frontend,auth,tracks,analyze,library,sets,mashup,playlists,crates --admin=kenin:kenin33
# (puis attendre 2 min)
python3 scripts/e2e/run_all.py --only=exports,waveforms,hot_cues,sharing,compare,negative,permissions,quota,rate_limit,audio_advanced,fingerprint,recommendation,account,flows,admin,admin_extended --admin=kenin:kenin33

# Avec diagnostics key (active la suite health+diagnostics)
python3 scripts/e2e/run_all.py \
  --admin=kenin:kenin33 \
  --diag-key="$CUEFORGE_DIAG_KEY"

# Juste quelques suites
python3 scripts/e2e/run_all.py --only=auth,tracks

# Throttling custom entre suites (default: 5000ms)
CUEFORGE_SUITE_DELAY_MS=10000 python3 scripts/e2e/run_all.py

# Local dev (pas de throttling nécessaire)
CUEFORGE_SUITE_DELAY_MS=0 python3 scripts/e2e/run_all.py --url=http://localhost:8000
```

## Suites disponibles

### Core (8 suites, ~75 tests)

| Suite     | Couverture                                                             | Admin requis |
|-----------|------------------------------------------------------------------------|--------------|
| `health`  | `/health`, `/api/v1/diagnostics/*`                                     | Non (key)    |
| `frontend`| Pages HTML v4 (`/`, `/login`, `/library`, `/analyze`, `/admin`…)       | Non          |
| `auth`    | register / login / refresh / me / logout / wrong password              | Non          |
| `tracks`  | CRUD tracks + duplicate + delete safety (shared r2_key)                | Non          |
| `analyze` | `/audio` Range, cues CRUD, analysis status                             | Non          |
| `library` | Pagination, search, tags CRUD, favorites                               | Non          |
| `sets`    | Sets CRUD + add/remove tracks + transition-score                       | Non          |
| `mashup`  | Mashup studio lifecycle (create → favorite → delete)                   | Non          |

### P1 — Features (7 suites, ~74 tests)

| Suite       | Couverture                                                 |
|-------------|------------------------------------------------------------|
| `playlists` | CRUD playlists + add/remove tracks + reorder + duplicate   |
| `crates`    | Smart crates CRUD avec règles BPM/genre/key                |
| `exports`   | 11 formats DJ (rekordbox, serato, traktor, …) + PDF + M3U  |
| `waveforms` | Generate/get/regenerate + binary waveform                  |
| `hot_cues`  | Pads 0-8, create/patch/delete/reorder                      |
| `sharing`   | Links publics + copy to account                            |
| `compare`   | Compare 2 tracks + edge cases                              |

### P2 — Sécurité (4 suites, ~42 tests)

| Suite         | Couverture                                           |
|---------------|------------------------------------------------------|
| `negative`    | Validation, 401/404/422, path traversal, SQL injection |
| `permissions` | User A ne voit JAMAIS les données de user B (14 checks) |
| `quota`       | Cap free-tier 5 tracks/jour bien appliqué             |
| `rate_limit`  | Bruteforce login ralenti (soft-skip si RL off)       |

### P3 — Audio avancé (3 suites, ~24 tests)

| Suite             | Couverture                                |
|-------------------|-------------------------------------------|
| `audio_advanced`  | analysis/advanced + groove + chords       |
| `fingerprint`     | Duplicates detection + merge tracks       |
| `recommendation`  | next-track, build-set, crate-builder      |

### P4 — Account (1 suite, ~18 tests)

`account` : profile, api_keys, 2fa, quota, notifications, referrals, feedback.

### P5 — Admin étendu (1 suite, ~80 endpoints)

`admin_extended` : 75 endpoints GET admin (subscriptions, rbac, security, analytics, content, notif_reports) + 4 webhooks CRUD. Admin requis.

### P6 — Flows bout-en-bout (1 suite, 26 étapes, 5 parcours)

`flows` : F1 analyze (upload→cue→export), F2 set (upload×3→add→transition→export M3U), F3 library (favorite+tag+search), F4 auth (register→login→me), F5 duplicate regression (r2_key partagé).

## Variables d'environnement

| Variable                   | Effet                                                     |
|----------------------------|-----------------------------------------------------------|
| `CUEFORGE_BASE_URL`        | Override backend URL (default: Railway prod)              |
| `CUEFORGE_FRONT_URL`       | Override frontend URL                                     |
| `CUEFORGE_ADMIN_USER`      | Active la suite admin                                     |
| `CUEFORGE_ADMIN_PASS`      | Password admin                                            |
| `CUEFORGE_DIAG_KEY`        | `X-Diagnostics-Key` pour la suite health                  |
| `CUEFORGE_SUITE_DELAY_MS`  | Délai entre suites (default 5000, 0 pour local)          |
| `NO_COLOR=1`               | Désactive les couleurs ANSI                               |
| `E2E_TRACEBACK=1`          | Traces complètes sur les échecs                           |

## E2E browser (Chrome MCP)

Pour les tests UI réels (clics, waveform, cues, drag-drop), voir `scripts/e2e_browser/PLAYBOOK.md`.
Orchestré par Claude via les tools `mcp__Claude_in_Chrome__*` — couvre ce que la suite HTTP ne peut pas voir (rendu JS, service worker, thèmes, contextmenu).

## Capacité Railway

Railway à budget 0€ = 1-2 workers. Un full run (~350 tests en séquence) génère trop de charge DB et les derniers tests voient des 502. Workarounds :
- Throttling par défaut : 5s entre suites (`CUEFORGE_SUITE_DELAY_MS`)
- Split en 2 passes (commande ci-dessus)
- Le 502 est retry-é automatiquement par la lib HTTP (backoff 0.8s→1.6s)

## Variables d'environnement

| Variable              | Effet                                                     |
|-----------------------|-----------------------------------------------------------|
| `CUEFORGE_BASE_URL`   | Override backend URL (default: Railway prod)              |
| `CUEFORGE_FRONT_URL`  | Override frontend URL                                     |
| `CUEFORGE_ADMIN_USER` | Active la suite admin                                     |
| `CUEFORGE_ADMIN_PASS` | Password admin                                            |
| `CUEFORGE_DIAG_KEY`   | `X-Diagnostics-Key` pour la suite health                  |
| `NO_COLOR=1`          | Désactive les couleurs ANSI                               |
| `E2E_TRACEBACK=1`     | Traces complètes sur les échecs                           |

## Philosophie

- **Isolation** : chaque suite qui upload des tracks crée son propre user jetable (`e2e-<suite>-<ts>-<uid>@cueforge-e2e.io`). Ça contourne le cap free-tier 5 tracks/jour qui autrement fait échouer les suites en cascade. Pas de pollution des données réelles.
- **Cleanup** : les tracks/sets/tags créés sont supprimés à la fin de chaque suite.
- **Tolérance** : les tests gèrent les variations de schéma (404 sur endpoints optionnels, shapes qui varient entre builds). Un `skip` est un signal, pas un échec.
- **Exit code** : `0` si tout passe, `1` si n'importe quelle suite échoue. Usable en CI.

## Ajouter une nouvelle suite

1. Créer `scripts/e2e/test_<nom>.py` avec une fonction `run(ctx: RunContext) -> TestReport`.
2. Utiliser `run_step(report, "label", fn)` pour chaque test.
3. Ajouter l'entrée dans `SUITES_ORDER` de `run_all.py`.

Exemple minimal :

```python
from .lib import Client, RunContext, TestReport, run_step, assert_status

def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="monfeature")
    client = Client(ctx.base_url)
    client.token = ctx.test_user_token  # réutilise le user partagé

    def _check():
        r = client.get("/mon-endpoint")
        assert_status(r, 200)
    run_step(report, "GET /mon-endpoint", _check)

    return report
```
