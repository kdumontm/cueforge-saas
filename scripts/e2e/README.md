# CueForge E2E

Suite de tests end-to-end pour CueForge, exécutables à la demande contre Railway (prod) ou localhost.

## Lancer tous les E2E

```bash
# Tout sur prod Railway
python3 scripts/e2e/run_all.py

# Avec admin (active la suite admin)
python3 scripts/e2e/run_all.py --admin=kenin:kenin33

# Avec diagnostics key (active la suite health+diagnostics)
python3 scripts/e2e/run_all.py \
  --admin=kenin:kenin33 \
  --diag-key="$CUEFORGE_DIAG_KEY"

# Just some suites
python3 scripts/e2e/run_all.py --only=auth,tracks

# Skip frontend (long à cause de Fastly CDN)
python3 scripts/e2e/run_all.py --exclude=frontend

# Local dev
python3 scripts/e2e/run_all.py --url=http://localhost:8000
```

## Suites disponibles

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
| `admin`   | `/admin/users`, `/admin/stats/full-dashboard`, bulk-delete cascade     | **Oui**      |

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
