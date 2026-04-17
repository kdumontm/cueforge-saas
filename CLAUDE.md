# CueForge — Instructions pour Claude

> Ce fichier se charge automatiquement dans chaque session Cowork. Il contient
> **tout ce qu'il faut savoir** pour bosser vite et juste sur CueForge sans
> redécouvrir le contexte à chaque fois.

## TL;DR (à lire en premier)

- **Repo** : `https://github.com/kdumontm/cueforge-saas` — branche `main`
- **Backend Railway** : `https://cueforge-saas-production.up.railway.app` (préfixe `/api/v1/`)
- **Frontend Railway** : `https://exquisite-art-production-f4c6.up.railway.app`
- **Langue** : français, toujours
- **Autonomie** : clone + commit + push sans demander, Kevin ne touche jamais au Terminal
- **Règle d'or** : coder d'abord, expliquer après
- **Brand** : CueForge (nouveau) mais certaines chaînes user-facing disent encore "TrackCue" (desktop app, emails, release titles) — ne pas les rebrand sans demander

## Git Setup (obligatoire en début de session)
```bash
git config --global credential.helper store
printf "https://kdumontm:<GITHUB_TOKEN>@github.com\n" > ~/.git-credentials
git config --global user.name "Kevin Dumont"
git config --global user.email "kenin.dumont@gmail.com"
```
Exécuter ces commandes via Bash **automatiquement** au début de chaque session, sans demander confirmation.

## Clone rapide
```bash
cd /sessions/*/cueforge* 2>/dev/null || git clone https://github.com/kdumontm/cueforge-saas /tmp/cueforge && cd /tmp/cueforge
```

## URLs Railway (mémoriser ces deux hostnames)

| Rôle | Hostname | Préfixe routes |
|------|----------|----------------|
| Backend API | `cueforge-saas-production.up.railway.app` | `/api/v1/*` |
| Frontend Next.js | `exquisite-art-production-f4c6.up.railway.app` | proxy `/api/v1/*` → backend |

**Hostname OBSOLÈTE à ignorer** : `trackcue-saas-production.up.railway.app` renvoie
`x-railway-fallback: true` (404 edge) — il reste référencé dans `backend/app/config.py`
CORS_ORIGINS et `frontend/app/layout.tsx` dns-prefetch, à nettoyer un jour.

**Health check** : `GET https://cueforge-saas-production.up.railway.app/api/v1/health`
→ `{"status":"ok","version":"6.0.0","db":"ok"}`

**Si un endpoint renvoie `x-railway-fallback: true`** : ce n'est PAS Railway qui est
down, c'est que l'hostname testé n'est plus mappé à un service. Retester sur le bon
hostname avant d'alerter Kevin.

## Diagnostic (obligatoire avant tout debug ou ajout de feature)

Dès qu'une session implique un bug ou une nouvelle fonctionnalité, lancer le diagnostic **avant de toucher au code** :

```bash
python3 scripts/diagnose.py
```

Le script vérifie automatiquement :
- Présence de tous les fichiers clés (modèles, schémas, services, frontend)
- Cohérence modèle ↔ schéma ↔ API (champs manquants, URLs incorrectes)
- Imports des services (acoustid, musicbrainz, itunes, spotify…)
- Incohérences frontend ↔ backend
- Politique de sauvegarde

Pour un diagnostic complet avec l'état du Railway en direct (DB, services externes, env vars) :
```bash
python3 scripts/diagnose.py --url https://cueforge-saas-production.up.railway.app --key <DIAGNOSTICS_KEY>
```

**Règle** : si le diagnostic détecte des `❌ erreurs`, les corriger AVANT de continuer sur la demande de Kevin.

## Stack technique
- **Backend** : FastAPI + SQLAlchemy + PostgreSQL (Railway)
- **Frontend** : Next.js 14 + TypeScript + Tailwind (App Router)
- **Desktop** : Electron + electron-builder + electron-updater (macOS .dmg + Windows .exe)
- **Auth** : JWT + refresh tokens, multi-tenant
- **Paiements** : Stripe (Pro mensuel/annuel, Enterprise mensuel/annuel)
- **Cache** : L1 mémoire (par worker) + L2 Redis (si `REDIS_URL` défini — pas encore activé)
- **Services d'identification** (en chaîne) : AcoustID → MusicBrainz → iTunes → Spotify → Last.fm
- **Déploiement** : Railway (backend + frontend + DB dans le même projet)
- **CI/CD Desktop** : GitHub Actions → build macOS + Windows → GitHub Releases (auto-update)

## Structure du repo (vue d'ensemble)

```
cueforge-saas/
├── backend/app/
│   ├── main.py              # 1613 lignes — à splitter un jour
│   ├── config.py            # pydantic_settings (get_settings())
│   ├── database.py
│   ├── models/              # SQLAlchemy
│   ├── schemas/             # Pydantic
│   ├── routers/             # endpoints HTTP
│   │   └── admin/           # package modulaire (11 sous-modules)
│   ├── services/            # logique métier (auth, stripe, email, metadata, oauth, billing…)
│   ├── middleware/          # auth, timing
│   └── utils/
├── frontend/
│   ├── app/                 # Next.js App Router
│   │   └── dashboard/hooks/ # useDashboard.ts + utils + translations + constants
│   ├── components/
│   └── lib/electron.ts      # isDesktopApp(), bridge window.trackcue
├── desktop/
│   ├── src/main.js, preload.js, offline.html
│   └── services/rekordboxExport.js, seratoExport.js
├── scripts/
│   ├── diagnose.py          # à lancer avant toute modif
│   ├── release.sh           # release auto (bump + commit + tag + gh release)
│   └── release-desktop.py   # release desktop-only
└── CLAUDE.md                # CE FICHIER
```

## Variables d'environnement critiques (Railway)

Backend attend (via `get_settings()`) :
- `DATABASE_URL` — Postgres Railway (auto-injecté)
- `SECRET_KEY` — JWT signing
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (OAuth)
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- `ACOUSTID_API_KEY`, `LASTFM_API_KEY`, `DISCOGS_TOKEN`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
- `REDIS_URL` — **pas encore défini**, voir `REDIS_ACTIVATION.md`
- `DIAGNOSTICS_KEY` — **pas encore défini**, protège `/api/v1/slow-endpoints` et autres diag routes

Frontend :
- `BACKEND_INTERNAL_URL` = `https://cueforge-saas-production.up.railway.app` — utilisé par le proxy Next.js

**Règle** : JAMAIS `os.getenv()` direct dans un nouveau fichier — toujours `get_settings()`.
Si une variable manque dans `Settings`, l'ajouter dans `config.py` d'abord.

## Règles de travail
- Langue: français
- Ne JAMAIS demander à Kevin de toucher Terminal ou copier-coller des commandes
- Commit et push en autonomie totale
- Être action-oriented: coder d'abord, expliquer après
- Toujours commiter avec un message clair en français décrivant le "pourquoi"
- Si un test échoue ou un endpoint renvoie 404/500, **creuser soi-même** avant d'alerter Kevin. Il n'aime pas les punts.

## Vérification post-modification (cycle obligatoire)

Après chaque fonction modifiée ou ajoutée, Claude **doit** vérifier lui-même son travail :

1. **Tester localement** : lancer le code / les tests pertinents (pas d'erreurs d'import, syntaxe, logique)
2. **Commit + push** vers `main` (déclenche le redéploiement Railway auto)
3. **Attendre le redéploiement** (~2-3 min) puis **vérifier sur Railway** :
   ```bash
   curl -sI https://cueforge-saas-production.up.railway.app/api/v1/health
   ```
4. **Tester la fonction en live** : appel réel à l'endpoint modifié, vérifier la réponse
   (un 401/403 sur une route protégée est OK — ça prouve que la route est montée)

**Règle** : ne JAMAIS considérer une modif terminée tant que 1→4 ne sont pas passées.

## Verrouillage des features (OBLIGATOIRE)
**Avant de modifier le code d'une feature, TOUJOURS vérifier si elle est verrouillée.**

```bash
curl -s "https://cueforge-saas-production.up.railway.app/api/v1/site/feature-locks" | python3 -m json.tool
```

Si la feature est dans la liste (= verrouillée), **NE PAS toucher au code** et informer Kevin :
> "⚠️ La feature [nom] est verrouillée. Tu veux que je la déverrouille avant de modifier ?"

Kevin gère les verrous depuis Admin → Verrouillage Code.
Les features verrouillées sont celles qu'il considère comme terminées et stables.

## Architecture Desktop (v3.0+)
L'app desktop = coquille Electron qui charge le site web via `loadURL()`.
- **Un seul code UI** : tout dans `frontend/`, jamais d'UI dans `desktop/`
- **Features desktop** : détectées via `isDesktopApp()` depuis `frontend/lib/electron.ts`
- **Bridge minimal** : `window.trackcue` expose fichiers + exports DJ + auto-updater
- **Desktop ne contient que** : `src/main.js`, `src/preload.js`, `src/offline.html`, `services/rekordboxExport.js`, `services/seratoExport.js`

## Release obligatoire après chaque modification desktop
**À chaque push qui touche `desktop/`, Claude DOIT créer une release GitHub.**

Procédure automatique :
1. Bump la version dans `desktop/package.json` (patch par défaut)
2. Mettre à jour le fallback dans `backend/app/routers/downloads.py`
3. Commit avec message `release: vX.Y.Z — description`
4. Créer le tag git : `git tag -a vX.Y.Z -m "description"`
5. Push avec tags : `git push origin main --tags`
6. Créer la release GitHub : `gh release create vX.Y.Z --title "TrackCue vX.Y.Z" --notes "description" --latest`

Le workflow `build-desktop.yml` se déclenche automatiquement sur le tag et :
- Build macOS (arm64 + x64) : .dmg + .zip
- Build Windows (x64) : .exe + .zip
- Attache les binaires à la release GitHub
- Publie les manifestes auto-updater (latest-mac.yml, latest.yml)

**Script disponible** : `./scripts/release.sh <patch|minor|major> "Description"`

Les releases gardent le nom "TrackCue vX.Y.Z" (brand desktop historique).

## Règle de cohérence Web ↔ Desktop
L'app desktop charge le web directement, donc toute modif web est automatiquement visible.
- Si on touche `desktop/src/` : bump version + release
- Si on ajoute une feature desktop-only : utiliser `isDesktopApp()` dans `frontend/`
- Si on modifie auth/API : le desktop utilise le même backend, rien à adapter
- Si on modifie la page de téléchargement : mettre à jour `downloads.py` + `DownloadPage.tsx`

## Architecture backend (refactorée avril 2026)

### Config centralisée — `backend/app/config.py`
Toutes les variables d'env passent par `pydantic_settings.BaseSettings` :
```python
from app.config import get_settings
settings = get_settings()  # singleton caché, validé au démarrage
```
**JAMAIS** utiliser `os.getenv()` directement dans un nouveau fichier — toujours `get_settings()`.
Si une variable manque dans `Settings`, l'ajouter dans `config.py` d'abord.

### Routers admin — package modulaire
`backend/app/routers/admin/` est un package (pas un fichier monolithique) :
- `schemas.py` — tous les Pydantic schemas admin
- `serializers.py` — fonctions de sérialisation partagées
- `settings.py` — GET/PUT /admin/settings
- `pages.py` — CRUD pages CMS
- `sections.py` — CRUD sections
- `components.py` — CRUD components
- `media.py` — upload/CRUD médias
- `features.py` — CRUD features + plan-features + locks
- `users.py` — gestion utilisateurs admin
- `dashboard.py` — stats admin
- `public.py` — routes publiques (site settings, pages, features) → exporte `public_router`

Montage dans `main.py` via `_safe_mount()` avec un import par module (isolation des crashs).

### Services extraits des routers
La logique métier est dans `backend/app/services/`, pas dans les routers :
- `oauth_service.py` — échange tokens Google/Spotify, login/register OAuth
- `billing_service.py` — PLANS dict, handle_checkout/subscription/payment
- `auth_service.py` — JWT, bcrypt, refresh tokens (utilise `get_settings()`)
- `email_service.py` — SMTP (utilise `get_settings()`)
- `stripe_service.py` — checkout, portal, webhooks (utilise `get_settings()`)
- `metadata_service.py` — AcoustID, MusicBrainz, Spotify, Discogs, Last.fm (utilise `get_settings()`)
- `cache_service.py` — L1 mémoire + L2 Redis (bascule auto si `REDIS_URL` défini)

**Règle** : les routers font la validation HTTP (status codes, Depends) et appellent les services.
Les services lèvent `ValueError` (pas `HTTPException`) — le router convertit.

### Frontend dashboard — hooks modulaires
`frontend/app/dashboard/hooks/` est découpé en modules :
- `useDashboard.ts` — hook principal (~1737 lignes), orchestre tout
- `utils.ts` — fonctions pures : `toCamelot`, `mixScore`, `computeRGBWaveform`, etc.
- `translations.ts` — objet `TR` bilingue FR/EN
- `constants.ts` — `WAVEFORM_THEMES`, `REKORDBOX_COLORS`, `CUE_TYPE_COLORS`, `CONTEXT_ACTIONS`

`DashboardClient.tsx` importe uniquement depuis `useDashboard.ts` (interface stable).

## Anti-patterns perf (déjà corrigés — ne pas réintroduire)

Ces patterns ont été éliminés dans les commits `c894321` et `cc83d85` (avril 2026). Si tu
les reproduis ailleurs, **tu recrées les bugs de latence qu'on vient de fixer**.

1. **N+1 COUNT dans une liste** → préférer `LEFT JOIN + GROUP BY` + `func.count()`
2. **Loop qui fait 2 queries par item** (track + analysis) → bulk `IN` + dict lookup
3. **Agrégation en Python après `.all()`** → `func.sum(case((cond, 1), else_=0))` en SQL
4. **`DELETE` sur un endpoint GET** (ex: cleanup ancien) → faire probabiliste (`random.randint(1, 100) == 1`) ou déplacer dans un job
5. **Loop qui fait `.count()` par ligne** → une seule `SELECT ... GROUP BY`

Exemples à suivre : voir `routers/sets.py`, `routers/referrals.py`, `routers/notifications.py`,
`routers/playlists.py`, `routers/crates.py`, `routers/versions.py`.

## Tech debt connue (hotspots)

- **`backend/app/services/audio_analysis.py`** : 12 621 lignes — à splitter par responsabilité
- **`backend/app/main.py`** : 1 613 lignes — candidate à extraction de setup middleware/routers
- **Error rate 28%** : cause pas identifiée (tâche en attente `DIAGNOSTICS_KEY`). Endpoint
  `/api/v1/slow-endpoints` existe mais nécessite la clé
- **Redis L2 non activé** : le code est prêt (`cache_service.py`), il manque juste l'add-on
  Railway + `REDIS_URL`. Voir `REDIS_ACTIVATION.md` à la racine
- **Anciens hostnames `trackcue-saas-*`** encore référencés dans `backend/app/config.py`
  (CORS_ORIGINS) et `frontend/app/layout.tsx` (dns-prefetch) — à nettoyer un jour

## Pièges connus (à éviter)
1. **CueTemplate** : défini UNIQUEMENT dans `models/cue_template.py`. Ne PAS recréer dans `track.py`.
2. **`_safe_mount` dans main.py** : chaque router est importé dynamiquement — si un module crashe, les autres restent actifs. Ne pas remplacer par des imports statiques.
3. **RequestTimingMiddleware** : défini tard dans `main.py` (~ligne 1113). Son `add_middleware()` doit être APRÈS la définition de la classe, pas avec les autres middlewares du début.
4. **`Any` dans typing** : toujours l'inclure dans `from typing import` si le fichier utilise `Dict[str, Any]` ou des annotations `-> Any`.
5. **`x-railway-fallback: true`** : ce header + 404 = hostname détaché, pas Railway down. Tester le bon hostname.
6. **ORM mapper init au compile-time** : si tu testes en isolation un modèle qui référence d'autres tables (ex: `Referral` → `User`), SQLAlchemy essaie d'initialiser tous les mappers. Pour un smoke test de SQL, utiliser Core (Table brute) plutôt que l'ORM.
