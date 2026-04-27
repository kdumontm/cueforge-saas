# CueForge — Instructions pour Claude

## Git Setup (obligatoire en début de session)
Le token GitHub est stocké dans la mémoire utilisateur (memory `reference_cueforge_tokens.md`) — Claude doit le récupérer depuis là, pas le committer dans ce fichier.

```bash
git config --global credential.helper store
# Remplacer GH_TOKEN par la valeur en mémoire (reference_cueforge_tokens.md → GitHub PAT)
printf "https://kdumontm:GH_TOKEN@github.com\n" > ~/.git-credentials
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

## Lancer tous les E2E

Si Kevin dit "lance tous les E2E", "fait tous les E2E", "run les tests", etc. → lancer le runner complet :

```bash
cd /sessions/*/cueforge* 2>/dev/null || git clone https://github.com/kdumontm/cueforge-saas /tmp/cueforge && cd /tmp/cueforge
python3 scripts/e2e/run_all.py --admin=kenin:kenin33
```

Ça exécute 9 suites (`health`, `frontend`, `auth`, `tracks`, `analyze`, `library`, `sets`, `mashup`, `admin`) contre Railway prod. Exit 0 = tout pass, Exit 1 = au moins un fail.

Flags utiles :
- `--only=auth,tracks` pour cibler quelques suites
- `--exclude=frontend` pour skip (Fastly CDN latence)
- `--url=http://localhost:8000` pour taper local
- `--diag-key="$CUEFORGE_DIAG_KEY"` pour activer les diagnostics

Détails complets dans `scripts/e2e/README.md`.

**Règle** : si une suite échoue, lire les détails dans le summary, corriger le bug (backend si c'est un vrai bug, test si c'est un mismatch de schéma), commit + push, et relancer. On ne considère pas fini tant que c'est pas vert.

## Lancer les E2E browser (Chrome MCP)

Si Kevin dit "lance les E2E browser", "lance les E2E Chrome", "test navigateur", etc. :

1. Vérifier que l'extension Chrome MCP est connectée (`mcp__Claude_in_Chrome__*` dispo).
2. Ouvrir `scripts/e2e_browser/PLAYBOOK.md` et exécuter les 10 scénarios un par un via les tools Chrome MCP.
3. Produire un rapport markdown à la fin (N/M pass par scénario + screenshots des fails).

Les E2E browser couvrent ce que la suite API ne voit PAS :
- Clics réels sur les boutons (dead buttons)
- Rendu JS (waveform, cues, lecteur audio)
- Cache Service Worker + Fastly CDN
- UX flows (login→redirect→upload→cue→export)
- Thèmes, contextmenu, raccourcis clavier (Cmd+<)

**Règle** : si Chrome MCP n'est pas installé, demander à Kevin de l'installer avant de continuer. Ne jamais fallback sur computer-use pour cette tâche (trop lent + moins précis).

## Stack technique
- **Backend** : FastAPI + SQLAlchemy + PostgreSQL (Railway)
- **Frontend** : Next.js 14 + TypeScript + Tailwind
- **Services d'identification** : AcoustID → MusicBrainz → iTunes → Spotify → Last.fm
- **Déploiement** : Railway (backend + frontend + DB dans le même projet)

## Vérification post-modification (obligatoire)

Après chaque fonction modifiée ou ajoutée, Claude **doit** vérifier lui-même son travail :

1. **Tester localement** : lancer le code / les tests pertinents pour valider que la modification fonctionne (pas d'erreurs d'import, de syntaxe, de logique)
2. **Commit + push** vers Railway
3. **Vérifier sur Railway** : appeler l'endpoint ou checker les logs Railway pour confirmer que le déploiement est OK et que la fonction tourne correctement en production
4. **Tester la fonction en live** : faire un appel réel à la fonction/route modifiée sur l'URL Railway et vérifier la réponse

**Règle** : ne JAMAIS considérer une modification comme terminée tant que les étapes 1→4 ne sont pas passées. Si une étape échoue, corriger et recommencer le cycle.

## Règles
- Langue: français
- Ne JAMAIS demander à Kevin de toucher Terminal ou copier-coller des commandes
- Commit et push en autonomie totale
- Être action-oriented: coder d'abord, expliquer après
- Toujours commiter avec un message clair en français décrivant le "pourquoi"

## Pages v4 (frontend/public/v4/) — système obligatoire à respecter

CueForge utilise un système de **page transitions directionnelles** style iOS / Stripe. Chaque page v4 doit respecter ce pattern, sinon les transitions deviennent incohérentes.

### Quand tu crées ou ajoutes une nouvelle page v4

**1. Inclusions obligatoires dans le `<head>`** (copier le pattern d'une page existante comme `library.html`) :
- Auto-update version (script en haut qui purge SW si version change)
- `<link rel="preload" href="/v4/api.js?v=...">`
- `<link rel="preload" href="/v4/shared.js?v=...">`
- `<link rel="stylesheet" href="/v4/shared.css?v=...">`
- `<link rel="stylesheet" href="/v4/transitions.css?v=20260427-tx4">`
- `<link rel="stylesheet" href="/v4/transitions-pack3.css?v=20260427-tx4">`

**2. Inclusions obligatoires avant `</body>`** :
- `<script src="/v4/api.js?v=..."></script>`
- `<script src="/v4/shared.js?v=..."></script>`
- `<script src="/v4/transitions.js?v=20260427-tx4" defer></script>`
- `<script src="/v4/transitions-pack3.js?v=20260427-tx4" defer></script>`

**3. Bumper le cache après chaque modif de transitions.css/js ou pack3** :
```bash
cd frontend/public/v4
NEW="20260427-tx5"  # incrément
for f in *.html; do sed -i "s/v=20260427-tx4/v=$NEW/g" "$f"; done
# Bumper aussi sw.js : trackcue-vN → trackcue-v(N+1)
```

**4. Enregistrer la page dans `cfRouter` ROUTE_ORDER** (dans `transitions.js` quand le moteur sera codé en prod) :

| Niveau | Type | Exemples actuels |
|---|---|---|
| **level: 1** + flow propre | Pages racines | library, set-builder, mix-studio, stats, settings, admin, upload, pricing, billing, blog, docs, changelog |
| **level: 2** | Détail enfant d'une racine | analyze (parent: library), admin/users/* (parent: admin) |
| **level: 1, flow: N** aligné | Étape d'un workflow | set-builder (flow: 1) → mix-studio (flow: 2) |

**5. Ajouter la page à la palette Cmd+K** dans `transitions.js` array `PAL_PAGES` :
```js
{ ttl:'Mon-titre', ctx:'Description courte', href:'/v4/ma-page.html', icon:'🎵', kbd:'G X' }
```

**6. Tester l'arrivée de la page dans la palette** (`⌘K` après deploy) avant de considérer la page "livrée".

### Direction du glass selon la nav (auto-calculée par cfRouter)
- `to.level > from.level` → **DOWN** (drill-down, on rentre dans le détail)
- `to.level < from.level` → **UP** (back-up, retour parent)
- même level, `to.flow > from.flow` → **RIGHT** (next dans le workflow)
- même level, `to.flow < from.flow` → **LEFT** (back dans le workflow)
- même level, flows non liés → fade simple sans direction (Linear Whisper-style)
- `history.back()` détecté → toujours UP ou LEFT (inverser la direction par défaut)

### Pour pages lourdes (>800ms typique : analyze, library 1000+ tracks)
Utiliser le fallback **Frosted Hold** (batch 5 #04) : si fetch dépasse 800ms, le glass directionnel passe en mode hold avec backdrop-filter blur(14px) + brightness(0.55) + trait amber pulsant central, jusqu'à fetch fini (max 2.5s, sinon erreur).

### Conventions data-attributes (pour features cf-tr3-* et auto-bind)
- `data-vt-track="{id}"` sur les éléments à morpher entre library row et analyze hero (déjà géré par batch 1)
- `data-cf-spot` pour activer le cursor spotlight (déjà sur `.hero`)
- `data-theme-toggle` sur le bouton de thème pour activer le wipe radial
- `data-cf-scrub` sur les inputs BPM/Key/Energy pour activer le drag scrub
- `data-cf-tr3="X"` ou `class="cf-tr3-X"` pour activer une transition pack3 spécifique

### Référence visuelle
- Demo lab batch 6 : `ux-demos-batch6-glass-directional.html` dans le dossier projet (montre les 4 directions + smart routing)
- Demo lab batch 5 : `ux-demos-batch5-page-transitions-pro.html` (10 styles premium)

**Règle** : si Claude crée une nouvelle page v4 sans suivre ce pattern (inclusions + ROUTE_ORDER + palette), considérer la tâche comme INCOMPLÈTE et finir le wiring avant de commit.
