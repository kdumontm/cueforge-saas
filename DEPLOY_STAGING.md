# Staging CueForge — setup gratuit (Vercel)

> Objectif : tester le design v4 sur un vrai déploiement **sans coût supplémentaire**.

## Principe

| Branche | Env | Plateforme | Backend | Coût |
|--|--|--|--|--|
| `main` | production | Railway | `cueforge-saas-production.up.railway.app` | existant |
| `staging` | staging (preview v4) | **Vercel free tier** | réutilise backend prod (lecture) | **0 €** |

Vercel free tier (Hobby) offre : 100 GB bandwidth/mois, builds illimités sur branches non-main, HTTPS auto, preview URLs par push. Largement suffisant pour tester le v4.

## ⚠️ Règle importante — mutations

Le frontend staging pointe sur le **backend prod**. Les pages `/v4/*.html` sont 100% statiques (données fake, aucun appel API), donc **safe à 100%**. Mais les autres routes Next.js (`/dashboard`, `/login`, `/api/*`) qui tapent la vraie API vont **écrire dans la vraie DB prod** si tu fais des actions (upload, create set, etc.).

→ **Pour tester le v4 :** ouvre directement `/v4` et clique uniquement sur les liens v4. Safe.
→ **Pour tester des mutations :** attends qu'on ait les moyens de faire un backend staging dédié (~15€/mois), ou fais les tests en local avec un backend en `docker-compose up`.

## Setup Vercel (5 minutes)

### 1. Créer le projet Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository**
2. Choisir `kdumontm/cueforge-saas`
3. **Root directory** : `frontend`
4. **Framework Preset** : Next.js (auto-détecté)
5. **Production Branch** : `staging` ← très important, pas `main`
6. **Environment Variables** :
   - `NEXT_PUBLIC_ENV` = `staging`
   - `BACKEND_INTERNAL_URL` = `https://cueforge-saas-production.up.railway.app`
   - `NEXT_PUBLIC_API_URL` = `https://cueforge-saas-production.up.railway.app`
7. **Deploy**

Vercel va builder et te donner une URL du type `cueforge-saas.vercel.app` ou `cueforge-staging.vercel.app`.

### 2. Vérifs

- Ouvre `https://<ton-projet>.vercel.app/v4`
  → tu dois voir le hub des 9 écrans + la bannière jaune/rose « Staging — environnement de test » tout en haut
- Clique sur « Analyze », « Library », etc. → les pages v4 HTML s'ouvrent, interactions OK
- Ouvre `https://<ton-projet>.vercel.app/` → la page d'accueil prod s'affiche avec la bannière staging → on est bien en test

### 3. Workflow quotidien

```bash
# dev sur staging
git checkout staging
# ... code ...
git commit -am "..."
git push origin staging
# → Vercel auto-deploy staging en ~45s (URL preview stable)

# quand tout est bon, merge vers prod
git checkout main
git merge staging
git push origin main
# → Railway auto-deploy prod (inchangé)
```

### 4. Preview URLs par PR (bonus)

Vercel génère aussi une URL par push sur n'importe quelle branche (ex: `cueforge-staging-abc123.vercel.app`). Utile pour partager un aperçu d'une feature avant merge dans `staging`.

## Si un jour on veut un backend staging dédié (≠ 0€)

Quand le budget le permet, créer sur Railway :

1. Service backend `cueforge-backend-staging` connecté à la branche `staging`, Dockerfile `backend/Dockerfile`, nouvelle DB Postgres, env `ENVIRONMENT=staging` + bucket R2 `cueforge-audio-staging`
2. Mettre à jour les env Vercel : `BACKEND_INTERNAL_URL` + `NEXT_PUBLIC_API_URL` → nouveau backend staging
3. Coût : ~10€/mois (backend + DB)

Voir `railway.staging.toml` et `frontend/.env.staging.example` pour les templates de config.

## Rollback

Si une feature mergée casse la prod :

```bash
git checkout main
git revert <sha-buggy>
git push origin main
```

Railway redéploie prod automatiquement sur la version précédente.
