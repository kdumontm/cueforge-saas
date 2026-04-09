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
