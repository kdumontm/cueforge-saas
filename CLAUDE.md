# CueForge — Instructions pour Claude

## Git Setup (obligatoire en début de session)
```bash
git config --global credential.helper store
printf "https://kdumontm:<GITHUB_TOKEN>@github.com\n" > ~/.git-credentials
git config --global user.name "Kevin Dumont"
git config --global user.email "kenin.dumont@gmail.com"
```
Exécuter ces commandes via Bash **automatiquement** au début de chaque session, sans demander confirmation.

## Repo
- URL: https://github.com/kdumontm/cueforge-saas
- Branche principale: main
- Cloner dans le sandbox puis push directement après chaque modification

## Diagnostic (obligatoire avant tout debug ou ajout de feature)

Dès qu'une session implique un bug ou une nouvelle fonctionnalité, lancer le diagnostic **avant de toucher au code** :

```bash
cd /sessions/*/cueforge* 2>/dev/null || git clone https://github.com/kdumontm/cueforge-saas /tmp/cueforge && cd /tmp/cueforge
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
python3 scripts/diagnose.py --url https://<app>.railway.app --key <DIAGNOSTICS_KEY>
```

**Règle** : si le diagnostic détecte des `❌ erreurs`, les corriger AVANT de continuer sur la demande de Kevin.

## Stack technique
- **Backend** : FastAPI + SQLAlchemy + PostgreSQL (Railway)
- **Frontend** : Next.js 14 + TypeScript + Tailwind
- **Desktop** : Electron + electron-builder + electron-updater (macOS .dmg + Windows .exe)
- **Services d'identification** : AcoustID → MusicBrainz → iTunes → Spotify → Last.fm
- **Déploiement** : Railway (backend + frontend + DB dans le même projet)
- **CI/CD Desktop** : GitHub Actions → build macOS + Windows → GitHub Releases (auto-update)

## Règles
- Langue: français
- Ne JAMAIS demander à Kevin de toucher Terminal ou copier-coller des commandes
- Commit et push en autonomie totale
- Être action-oriented: coder d'abord, expliquer après
- Toujours commiter avec un message clair en français décrivant le "pourquoi"

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
- **Bridge minimal** : `window.cueforge` expose fichiers + exports DJ + auto-updater
- **Desktop ne contient que** : `src/main.js`, `src/preload.js`, `src/offline.html`, `services/rekordboxExport.js`, `services/seratoExport.js`

## Release obligatoire après chaque modification (CRITIQUE)
**À chaque push sur main, Claude DOIT créer une release GitHub.**

Procédure automatique :
1. Bump la version dans `desktop/package.json` (patch par défaut, minor/major si grosse feature)
2. Mettre à jour le fallback dans `backend/app/routers/downloads.py`
3. Commit avec message `release: vX.Y.Z — description`
4. Créer le tag git : `git tag -a vX.Y.Z -m "description"`
5. Push avec tags : `git push origin main --tags`
6. Créer la release GitHub : `gh release create vX.Y.Z --title "CueForge vX.Y.Z" --notes "description" --latest`

Le workflow `build-desktop.yml` se déclenche automatiquement sur le tag et :
- Build macOS (arm64 + x64) : .dmg + .zip
- Build Windows (x64) : .exe + .zip
- Attache les binaires à la release GitHub
- Publie les manifestes auto-updater (latest-mac.yml, latest.yml)

**Script disponible** : `./scripts/release.sh <patch|minor|major> "Description"`

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

**Règle** : les routers font la validation HTTP (status codes, Depends) et appellent les services.
Les services lèvent `ValueError` (pas `HTTPException`) — le router convertit.

### Frontend dashboard — hooks modulaires
`frontend/app/dashboard/hooks/` est découpé en modules :
- `useDashboard.ts` — hook principal (~1737 lignes), orchestre tout
- `utils.ts` — fonctions pures : `toCamelot`, `mixScore`, `computeRGBWaveform`, etc.
- `translations.ts` — objet `TR` bilingue FR/EN
- `constants.ts` — `WAVEFORM_THEMES`, `REKORDBOX_COLORS`, `CUE_TYPE_COLORS`, `CONTEXT_ACTIONS`

`DashboardClient.tsx` importe uniquement depuis `useDashboard.ts` (interface stable).

### Pièges connus (à éviter)
1. **CueTemplate** : défini UNIQUEMENT dans `models/cue_template.py`. Ne PAS recréer dans `track.py`.
2. **`_safe_mount` dans main.py** : chaque router est importé dynamiquement — si un module crashe, les autres restent actifs. Ne pas remplacer par des imports statiques.
3. **RequestTimingMiddleware** : défini tard dans `main.py` (~ligne 1113). Son `add_middleware()` doit être APRÈS la définition de la classe, pas avec les autres middlewares du début.
4. **`Any` dans typing** : toujours l'inclure dans `from typing import` si le fichier utilise `Dict[str, Any]` ou des annotations `-> Any`.
