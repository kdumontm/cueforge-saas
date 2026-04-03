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

## Règle de cohérence Web ↔ Desktop (CRITIQUE)
**Toute modification du frontend web (Next.js) doit aussi être vérifiée/adaptée pour les apps desktop (Electron).**

Concrètement :
- Si on ajoute une nouvelle page/route : vérifier que la navigation fonctionne dans l'app Electron (pas de `window.open`, pas de redirections cassées)
- Si on modifie l'API backend (nouveaux endpoints, changements de schéma) : vérifier que l'app desktop consomme correctement les nouvelles données
- Si on change le système d'auth (token, localStorage) : adapter le preload.js de l'app desktop si nécessaire
- Si on ajoute des fonctionnalités utilisant des APIs navigateur spécifiques : prévoir un fallback ou une adaptation dans le contexte Electron (`window.cueforge.isDesktopApp`)
- Si on modifie la page de téléchargement ou la config des plans : mettre à jour le backend `downloads.py` ET le frontend `DownloadPage.tsx` pour les deux OS (macOS + Windows)
- Si on bumpe la version : mettre à jour `desktop/package.json` et déclencher le workflow `build-desktop.yml`

**Rappel** : l'app desktop wrap le site web via Electron, donc toute modif visible sur le web est automatiquement visible dans l'app. Mais les features natives (drag & drop, notifications, tray, offline) vivent dans `desktop/src/` et doivent être maintenues séparément.
