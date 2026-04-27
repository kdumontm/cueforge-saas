# Fix R2 Configuration — CueForge Backend on Railway

## Problème
Depuis le commit `6bdc610` (Dev BB), l'upload de tracks est devenu **atomique R2** : le fichier doit être uploadé vers Cloudflare R2 AVANT que la transaction DB ne soit commitée. Cela garantit l'intégrité en cas de crash ou redeploy.

Cependant, **en production (Railway)**, après ce fix, les uploads failent silencieusement :
- Les fichiers restent en `/app/uploads` local (éphémère)
- `r2_key` demeure `NULL` en DB
- Les tracks orphelines ne sont pas trouvées après redeploy
- Feedbacks **#39 #45 #47 #48** : "mon audio a disparu"

### Root cause
`r2_service.enabled()` retourne `False` en prod parce que **les env vars R2 ne sont pas configurées sur Railway**.

Le service R2 nécessite 4 env vars. Dès qu'une est absente, le service se désactive entièrement et on retombe sur le mode "legacy local", qui est:
1. **Instable** (éphémère sur Railway)
2. **Incompatible** avec le fix atomique Dev BB (qui s'attend à ce que R2 soit disponible)

---

## Diagnostic

Depuis le commit `8bcb7e3`, un nouvel endpoint diagnostic expose cet état :

```bash
DIAG_KEY="<ton DIAGNOSTICS_KEY Railway>"
curl -H "X-Diagnostics-Key: $DIAG_KEY" \
  https://cueforge-saas-production.up.railway.app/api/v1/diagnostics/r2-config | jq .
```

### Exemple réponse (R2 configuré ✅)
```json
{
  "r2_enabled": true,
  "env_vars": {
    "R2_ACCOUNT_ID": { "present": true, "length": 32 },
    "R2_ACCESS_KEY_ID": { "present": true, "length": 24 },
    "R2_SECRET_ACCESS_KEY": { "present": true, "length": 40 },
    "R2_BUCKET": { "present": true, "value": "cueforge-audio" }
  },
  "boto3_init": { "success": true, "error": null },
  "head_bucket_test": { "success": true, "endpoint": "https://...", "bucket": "cueforge-audio", "error": null },
  "summary": {
    "all_env_vars_present": true,
    "client_ready": true,
    "bucket_accessible": true
  }
}
```

### Exemple réponse (R2 manquant ❌)
```json
{
  "r2_enabled": false,
  "env_vars": {
    "R2_ACCOUNT_ID": { "present": false, "length": null },
    "R2_ACCESS_KEY_ID": { "present": false, "length": null },
    "R2_SECRET_ACCESS_KEY": { "present": false, "length": null },
    "R2_BUCKET": { "present": false, "value": null }
  },
  "boto3_init": { "success": false, "error": "R2 disabled: missing required env vars" },
  "head_bucket_test": { "success": false, "error": "R2 disabled" },
  "summary": {
    "all_env_vars_present": false,
    "client_ready": false,
    "bucket_accessible": false
  }
}
```

---

## Solution : Ajouter les env vars sur Railway

### 1. Accéder à la console Railway

- Ouvre https://railway.app
- Sélectionne le projet **CueForge**
- Clique sur le service **backend**
- Navigue vers l'onglet **Variables**

### 2. Ajouter les 4 env vars R2

Tu dois créer les variables suivantes. Les valeurs se trouvent dans ton **compte Cloudflare R2** (https://dash.cloudflare.com).

#### **R2_ACCOUNT_ID**
- **Valeur** : ID du compte Cloudflare (format: 32 caractères hex)
  - Trouve-le dans Cloudflare Dashboard → R2 → Settings → Account ID
  - Exemple: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
- **Coller** dans Railway `R2_ACCOUNT_ID = a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

#### **R2_ACCESS_KEY_ID**
- **Valeur** : Clé d'accès générée dans R2 API Tokens
  - Cloudflare Dashboard → R2 → Settings → API Tokens → Create API Token
  - Si un token existe déjà pour CueForge, réutilise sa clé d'accès
- **Coller** dans Railway `R2_ACCESS_KEY_ID = <ta_clé_accès_R2>`

#### **R2_SECRET_ACCESS_KEY**
- **Valeur** : Secret associé au token d'accès (révélé une seule fois lors de la création)
  - Si tu n'as pas conservé le secret, il faut générer un nouveau token dans Cloudflare
- **Coller** dans Railway `R2_SECRET_ACCESS_KEY = <ton_secret_R2>`

#### **R2_BUCKET**
- **Valeur** : Nom du bucket (selon la mémoire: `cueforge-audio`)
- **Coller** dans Railway `R2_BUCKET = cueforge-audio`

### 3. Sauvegarder sur Railway

Clique sur **Deploy** (ou **Save**) après avoir entré toutes les variables. Railway redéploiera le backend automatiquement (~3-5 minutes).

---

## Vérifier que le fix marche

Une fois le redeploy terminé, réexécute le diagnostic :

```bash
curl -H "X-Diagnostics-Key: $DIAG_KEY" \
  https://cueforge-saas-production.up.railway.app/api/v1/diagnostics/r2-config | jq '.summary'
```

Tu dois voir :
```json
{
  "all_env_vars_present": true,
  "client_ready": true,
  "bucket_accessible": true
}
```

Si c'est le cas, le fix est en place et les futurs uploads useront le chemin atomique R2 ! 🎉

---

## Après le fix

Dès que `r2_enabled=true` :
1. Les nouveaux uploads iront directement à R2 (`r2_key` sera set en DB)
2. Les fichiers locaux `/app/uploads` deviennent juste un cache éphémère (supprimé au redeploy)
3. Le fix Dev BB (commit `6bdc610`) est activé et fonctionne correctement

### Migration des fichiers existants (optionnel)

Si tu veux migrer les tracks avec `file_path` local (mais sans `r2_key`) vers R2, utilise :

```bash
curl -X POST -H "X-Diagnostics-Key: $DIAG_KEY" \
  "https://cueforge-saas-production.up.railway.app/api/v1/diagnostics/r2-migrate?dry_run=false&purge_local=true"
```

Cela uploadera tous les fichiers locaux orphelins vers R2 et les supprimera de `/app/uploads`.

---

## Checklist finale

- [ ] Variables R2 ajoutées sur Railway (4 env vars)
- [ ] Backend redéployé (attendre ~5 min)
- [ ] Diagnostic endpoint retourne `summary.all_env_vars_present=true`
- [ ] Test upload d'une nouvelle track → `r2_key` est set en DB
- [ ] Feedbacks #39 #45 #47 #48 marqués comme resolved

---

## Références

- **Endpoint diagnostic** : `GET /api/v1/diagnostics/r2-config` (protected by `X-Diagnostics-Key`)
- **Service R2** : `backend/app/services/r2_service.py`
- **Fix causant le problème** : Commit `6bdc610` (Dev BB, upload atomique)
- **Fix diagnostic** : Commit `8bcb7e3` (Dev DD, endpoint r2-config)
- **Feedbacks affectées** : #39, #45, #47, #48

