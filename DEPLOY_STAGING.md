# Staging CueForge — guide déploiement

> Objectif : avoir un env **staging** isolé (backend + frontend) pour tester le design v4 et toute nouvelle feature **avant** de pusher en prod.

## Principe

| Branche | Env | URL (Railway) | Rôle |
|--|--|--|--|
| `main` | production | `cueforge-saas-production.up.railway.app` | Clients réels, données réelles |
| `staging` | staging | `<staging-backend>.up.railway.app` + `<staging-frontend>.up.railway.app` | Preview v4, QA, tests de bout en bout |

Les deux environnements utilisent le **même code** mais des variables d'env et une DB différentes.

## Ce qui est déjà en place sur la branche `staging`

- Tous les fichiers de la branche `main`
- Les 9 écrans v4 en HTML statique dans `frontend/public/v4/`
- Une page hub Next.js à `/v4` (`frontend/app/v4/page.tsx`) qui liste les 9 écrans
- Un composant `<StagingBanner />` qui s'affiche **uniquement** si :
  - `NEXT_PUBLIC_ENV=staging` est défini, OU
  - le hostname contient « staging », « preview » ou « test »
- Un `railway.staging.toml` (voir plus bas) pour config backend staging

## Étapes Railway (UI — à faire une fois)

### 1. Service backend staging

1. Railway → projet CueForge → **+ New** → **GitHub Repo** → `kdumontm/cueforge-saas`
2. Name : `cueforge-backend-staging`
3. Branch : `staging`
4. Build : Dockerfile `backend/Dockerfile`
5. Variables d'env (copier depuis le service prod et adapter) :
   - `DATABASE_URL` → **nouvelle DB Postgres** (clic + New → Postgres dans le même projet, puis reference)
   - `ENVIRONMENT=staging`
   - `DIAGNOSTICS_KEY` → même valeur que prod OK pour pouvoir diagnostiquer
   - `REDIS_URL` → si on veut Redis, même procédure, sinon skip
   - Secrets API externes : AcoustID/Spotify/MusicBrainz/iTunes → **même clés que prod** (read-only)
   - Storage R2 : **nouveau bucket** `cueforge-audio-staging` pour ne pas polluer la prod
6. Deploy

### 2. Service frontend staging

1. Railway → **+ New** → **GitHub Repo** → `kdumontm/cueforge-saas`
2. Name : `cueforge-frontend-staging`
3. Branch : `staging`
4. Root directory : `frontend`
5. Build : nixpacks auto (le `frontend/nixpacks.toml` existant fait `npm run build` + `npm start`)
6. Variables d'env :
   - `BACKEND_INTERNAL_URL` → URL du service backend staging créé à l'étape 1
   - `NEXT_PUBLIC_ENV=staging` ← c'est cette var qui active la bannière jaune
   - `NEXT_PUBLIC_API_URL` → URL backend staging
7. Deploy

### 3. Vérif finale

Une fois les deux services up :

- Ouvre `https://<staging-frontend>.up.railway.app/v4` → tu dois voir la page hub avec les 9 cartes + la bannière jaune « Staging — environnement de test » en haut
- Clique sur « Analyze » → `/v4/analyze.html` doit s'ouvrir avec tout le design interactif
- Ouvre `https://<staging-frontend>.up.railway.app/` → la prod UI s'affiche normalement **avec la bannière jaune** (= on est bien en staging)

## Workflow quotidien

```bash
# nouveau dev sur staging
git checkout staging
# ... code ...
git commit -am "feat: ..."
git push origin staging
# → Railway auto-deploy staging uniquement, prod intouchée

# quand tout est validé, merge vers prod
git checkout main
git merge staging
git push origin main
# → Railway auto-deploy prod
```

## Coûts

- Backend staging : 1 service Railway (~5€/mois sleep quand inactif)
- Postgres staging : 1 DB Railway (~5€/mois)
- Frontend staging : 1 service Railway (~5€/mois)
- Total : **~15€/mois** pour un env de test complet isolé de la prod

Si le budget est un blocker, alternative 0€ :
- Deploy le frontend staging sur **Vercel** (gratuit tier hobby), connecté à la branche `staging`
- Pas de backend staging dédié → le frontend staging pointe sur le backend prod en lecture seule (risqué pour les mutations)

## Rollback

Si un bug staging est accidentellement mergé dans prod :

```bash
git checkout main
git revert <sha-buggy>
git push origin main
```

Railway redéploie prod avec la version précédente.
