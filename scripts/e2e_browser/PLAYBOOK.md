# CueForge — Playbook E2E Browser (Chrome MCP)

> Ce playbook est orchestré par Claude via les tools `mcp__Claude_in_Chrome__*`.
> Il couvre ce que la suite API (`scripts/e2e/`) ne peut pas voir :
> clics réels, rendu JS, dead buttons, cache Service Worker, UX.

## Déclenchement

Quand Kevin dit **"lance les E2E browser"** ou **"lance les E2E Chrome"**, Claude doit :

1. Vérifier que l'extension Chrome MCP est connectée (sinon demander à Kevin de l'installer).
2. Ouvrir un onglet frais vers `https://exquisite-art-production-f4c6.up.railway.app`.
3. Exécuter chaque scénario ci-dessous dans l'ordre, **en marquant PASS / FAIL au fur et à mesure**.
4. À la fin, produire un rapport récapitulatif : N/M PASS, avec les détails des échecs.
5. Screenshot de chaque fail pour debug.

Pour les tâches Kevin → Claude, Claude utilise uniquement les outils Chrome MCP (pas de computer-use).

## Credentials de test

- **Admin** : `kenin` / `kenin33`
- **User jetable** : créer à la volée via `/register` avec email `e2e-browser-<ts>@cueforge-e2e.io` + password `E2eBrowser!2026`

---

## Scénarios

### S1 — Landing publique + navigation

**Objectif** : les pages publiques (`/`, `/pricing`, `/login`, `/register`) chargent, les CTAs marchent.

| Step | Action | Assertion |
|------|--------|-----------|
| 1.1 | Navigate `/` | Title contient "CueForge" OU logo visible |
| 1.2 | Click "Pricing" dans header | URL = `/pricing`, prix visibles |
| 1.3 | Click "Login" header | URL = `/login`, formulaire email+password visible |
| 1.4 | Click "Register" lien | URL = `/register`, formulaire 3 champs visible |

### S2 — Login + redirect

**Objectif** : login admin redirige vers dashboard.

| Step | Action | Assertion |
|------|--------|-----------|
| 2.1 | Go `/login` | Form visible |
| 2.2 | Fill email = `kenin` (l'admin s'identifie par username) | |
| 2.3 | Fill password = `kenin33` | |
| 2.4 | Click "Se connecter" | URL redirigée vers `/library` ou `/admin`, JWT en localStorage |
| 2.5 | Vérifier header : avatar/email user visible | `kenin.dumont@gmail.com` ou `kenin` |

### S3 — Library : upload + liste + contextmenu

**Objectif** : upload réel via `<input type=file>`, la track apparaît dans la grille.

| Step | Action | Assertion |
|------|--------|-----------|
| 3.1 | Go `/library` | Sidebar + grille visibles |
| 3.2 | Click bouton "+" (upload) | Input file declenché |
| 3.3 | Upload un WAV généré à la volée (2-3s silencieux) | Toast "Track ajoutée" visible |
| 3.4 | La nouvelle track apparaît en haut de la grille | Matching titre dans le DOM |
| 3.5 | Right-click sur la track → contextmenu | "Supprimer", "Dupliquer", "Ajouter au set" visibles |
| 3.6 | Click "Dupliquer" | 2e copie apparaît dans la grille |
| 3.7 | Right-click → Supprimer sur la copie | Modal confirm visible |
| 3.8 | Click "Confirmer" | Copie disparaît de la grille |

### S4 — Analyze : lecteur, waveform, cues, pads

**Objectif** : vérifier que la page `/analyze` est interactive (pas fake data).

| Step | Action | Assertion |
|------|--------|-----------|
| 4.1 | Click sur une track analysée → go `/analyze?id=X` | Waveform rendue (canvas visible + non-vide) |
| 4.2 | Click ▶ play | Audio joue (`getCurrentTime()` > 0 après 1s) |
| 4.3 | Click Stop | Audio pause |
| 4.4 | Click sur la waveform à un point X | Cursor déplacé à ce point |
| 4.5 | Double-click sur waveform à point Y | Cue créé au point Y, pad 1 s'illumine |
| 4.6 | Click pad 1 | Cursor saute au point Y |
| 4.7 | Click toolbar "Export" ou ⋯ → "Export Rekordbox" | Download déclenché OU toast "Export prêt" |
| 4.8 | Tester les thèmes : cycling 4 themes via /settings et retour /analyze | UI change de couleur, pas de flash blanc |

### S5 — Sets : création, ajout, export

**Objectif** : créer un set, ajouter des tracks, l'exporter.

| Step | Action | Assertion |
|------|--------|-----------|
| 5.1 | Go `/library` → click "Sets" | Liste des sets visible |
| 5.2 | Click "+ Nouveau set" | Modal visible, input name |
| 5.3 | Fill name = `E2E Browser Set` + click Créer | Modal ferme, set apparaît dans la liste |
| 5.4 | Click sur ce set | Page détail set (DropZone + liste tracks) |
| 5.5 | Drag 2 tracks depuis la library vers le set | Les 2 tracks apparaissent dans le set |
| 5.6 | Click "Exporter" → Rekordbox | Download ou lien téléchargement |
| 5.7 | Click "Supprimer set" → confirm | Set disparaît de la liste |

### S6 — Admin dashboard : stats réelles, tabs

**Objectif** : `/admin` affiche des vraies données, toutes les tabs chargent.

| Step | Action | Assertion |
|------|--------|-----------|
| 6.1 | Go `/admin` logged as kenin | KPIs affichés (users count > 0, tracks > 0) |
| 6.2 | Click onglet "Users" | Liste users visible, pas d'erreur 500 |
| 6.3 | Click onglet "Tracks" | Liste tracks admin visible |
| 6.4 | Click onglet "Subscriptions" | Data ou empty state, pas de crash |
| 6.5 | Click onglet "Analytics" | Charts ou empty state |
| 6.6 | Sélectionner un user + bulk actions → "Bulk Delete" | Modal "SUPPRIMER" nécessite de taper le mot |

### S7 — Feedback widget

**Objectif** : le widget feedback s'ouvre et envoie un feedback.

| Step | Action | Assertion |
|------|--------|-----------|
| 7.1 | Appuyer Cmd+< (Ctrl+<) | Widget feedback s'ouvre en overlay |
| 7.2 | Choisir type "Bug" | Sélection visible |
| 7.3 | Fill message "E2E browser test" | Textarea non vide |
| 7.4 | Click "Envoyer" | Widget ferme, toast success |
| 7.5 | Aller `/admin` → Feedback tab | Ce feedback apparaît en top |

### S8 — Service Worker / cache

**Objectif** : après un changement de version SW, l'ancien cache est purgé.

| Step | Action | Assertion |
|------|--------|-----------|
| 8.1 | Charger `/library` 2× | Premier = network, 2e = SW cache ou SWR |
| 8.2 | Vérifier devtools Application > Service Workers | SW actif, pas de stuck |
| 8.3 | Vérifier `Cache Storage` : pas de cache "trackcue-v3" (blacklist) | Seul "trackcue-v5" (ou supérieur) présent |
| 8.4 | Hard reload (Shift+R) → toujours fonctionnel | Pas de page blanche |

### S9 — Thèmes (regression 23/04)

**Objectif** : les 4 thèmes s'appliquent vraiment.

| Step | Action | Assertion |
|------|--------|-----------|
| 9.1 | Go `/settings` | Onglet thèmes visible |
| 9.2 | Pour chaque thème (Dark, Light, Ocean, Sunset) : click | La page change de couleurs visibles. `data-theme` attribute sur `<html>` change. |
| 9.3 | Reload page → thème choisi est persistant | `data-theme` reste, localStorage contient `theme=X` |

### S10 — Logout

**Objectif** : logout vide la session, protéger les pages auth.

| Step | Action | Assertion |
|------|--------|-----------|
| 10.1 | Click avatar → Se déconnecter | Redirigé vers `/` ou `/login` |
| 10.2 | localStorage ne contient plus le JWT | null |
| 10.3 | Tenter d'aller `/library` directement | Redirigé vers `/login` |

---

## Format de rapport attendu

À la fin de la session browser, Claude produit un rapport markdown :

```
## Browser E2E Report — 2026-04-23 12:34

✓ S1 Landing              — 4/4 pass
✓ S2 Login                — 5/5 pass
✗ S3 Library              — 6/8 pass  (3.5 dead button, 3.7 no modal)
  - 3.5: Right-click on track did not trigger contextmenu (screenshot: s3-5.png)
  - 3.7: Confirm modal did not appear (screenshot: s3-7.png)
✓ S4 Analyze              — 8/8 pass
...

TOTAL : 52/60 pass (86%)
```

En cas de failure, Claude prend un screenshot, log ce qui a été vu dans le DOM (via `read_page`),
et propose un fix (backend ou frontend).

---

## Helpers pour Claude

### Générer un WAV de test dans le browser

Claude peut injecter ce JS via `javascript_tool` pour créer un fichier à uploader :

```javascript
// Génère un WAV de 1s silencieux
function makeWav(seconds=1.0, sr=22050) {
  const n = Math.floor(seconds * sr);
  const buf = new ArrayBuffer(44 + n*2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c,i) => v.setUint8(o+i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36+n*2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr*2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n*2, true);
  return new File([buf], "e2e-browser.wav", {type:"audio/wav"});
}
// Puis injecter dans l'input file :
const input = document.querySelector('input[type="file"]');
const dt = new DataTransfer();
dt.items.add(makeWav());
input.files = dt.files;
input.dispatchEvent(new Event('change', {bubbles:true}));
```

### Créer un user jetable via JS fetch

```javascript
const email = `e2e-browser-${Date.now()}@cueforge-e2e.io`;
const res = await fetch('/api/v1/auth/register', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({email, password: 'E2eBrowser!2026', name: 'e2e-browser'})
});
const data = await res.json();
localStorage.setItem('access_token', data.access_token);
location.reload();
```

### Checker un élément avant de cliquer

```javascript
const btn = document.querySelector('#btn-upload');
return {
  exists: !!btn,
  disabled: btn?.disabled,
  visible: btn?.offsetParent !== null,
  text: btn?.textContent,
};
```

---

## Quand réutiliser le playbook

- **Chaque release majeure** de CueForge
- **Après un refactor frontend v4** (shared.js, api.js, sw.js)
- **Quand Kevin dit** "lance les E2E browser" / "test navigateur" / "test Chrome"

La suite API (`scripts/e2e/`) attrape les régressions backend ; ce playbook attrape les régressions frontend + UX.
