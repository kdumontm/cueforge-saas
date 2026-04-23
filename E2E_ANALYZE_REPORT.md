# E2E /analyze — Rapport test manuel Chrome

**Date:** 2026-04-23
**URL:** https://exquisite-art-production-f4c6.up.railway.app/analyze?id=139
**Track référence:** 139 — "54 Feel So Close (Radio Edit).flac" (BPM 130.7, Key 9B·G, 3:27, 10 cues)
**Tracks utilisées:** 139 (54 Feel So Close), 138 (42 Switch), 137 (69 Forever Young, sans BPM/Key), 136 (01 FADE)
**User:** kenin / kenin33
**Mode:** clics Chrome réels (DOM .click() sur éléments visibles + navigation via Chrome MCP), observateur `window.fetch` monkey-patch, backend réel Railway

## Légende statut
- ✅ OK — bouton réagit, UI update, pas d'erreur console/network
- ⚠️ Partiel — fonctionne mais quirks UX
- ❌ Bug — ne fait rien / UI cassée / navigation inattendue
- ℹ️ Info — comportement à documenter

---

## TL;DR — Bugs critiques à fixer en priorité

| # | Zone | Sévérité | Résumé | Fichier probable |
|---|------|----------|--------|------------------|
| **B1** | Transport + audio | 🔴 CRITIQUE | `<audio>` absent du DOM, `<canvas>` waveform absent, Play ne fait rien | `v4/analyze.html` player init |
| **B2** | Hot-cue pads | 🔴 CRITIQUE | Les 8 pads affichent "1..8" au lieu des labels de cues, clic sans effet même sur track à 10 cues | `v4/analyze.html` bindPads |
| **B3** | btn-share | 🟠 MAJEUR | URL copiée = `/v4/analyze.html?id=170` (mauvais id 170 au lieu de 139, et path /v4 leak), ET navigation plein écran | `v4/shared.js` shareCurrent |
| **B4** | btn-export | 🟠 MAJEUR | Navigue vers `/v4/set-builder.html?track=139` (leak /v4) au lieu de `/set-builder?track=…` | `v4/analyze.html` export handler |
| **B5** | btn-duplicate | 🟡 MOYEN | Zéro effet (aucun DOM change, aucun network, aucune toast) | `v4/analyze.html` bindDuplicate |
| **B6** | Toolbar tools V/C/L/S/F | 🟡 MOYEN | Non mutuellement exclusifs : clic sur Cue/Loop/Slice/Fade active chacun sans désactiver les autres | `v4/analyze.html` tool switcher |
| **B7** | Toolbar Zoom ±  | 🟡 MOYEN | "Zoom out" et "Zoom in" prennent `.active` après clic (état persistant) — devraient être one-shot | `v4/analyze.html` zoom handlers |
| **B8** | Rail tab Fav | 🟢 MINEUR | Re-fetch `/api/v1/favorites` (2.1 s) à chaque clic, même si déjà actif | `v4/analyze.html` navTabs |

---

## 1. Top nav (10 liens)

**Liens :** Overview `/`, Analyze `/analyze` (active), Library `/library`, Compatible `/compatible`, Set Builder `/set-builder`, Mix Studio `/mix-studio`, Stats `/stats`, Upload `/upload`, Settings `/settings`, Admin `/admin`

| Lien | URL cible | Statut |
|------|-----------|--------|
| Overview | `/` | ✅ URL propre |
| Analyze | `/analyze` (déjà actif) | ✅ marque `active` |
| Library | `/library` | ✅ URL propre |
| Compatible | `/compatible` | ✅ URL propre |
| Set Builder | `/set-builder` | ✅ URL propre |
| Mix Studio | `/mix-studio` | ✅ URL propre |
| Stats | `/stats` | ✅ URL propre |
| Upload | `/upload` | ✅ URL propre |
| Settings | `/settings` | ✅ URL propre |
| Admin | `/admin` | ✅ URL propre |

**Résultat : 10/10 ✅** — tous les liens du top nav pointent sur des URLs propres (pas de `/v4` leak). Contraste net avec `btn-share` et `btn-export` qui eux leakent `/v4/...`.

---

## 2. Rail tabs (Queue / Fav / Recent)

| Scénario | Statut | Détail |
|---|---|---|
| 1. Queue actif par défaut | ✅ | `.active` sur Queue au load |
| 2. Clic Fav → liste favoris | ✅ | Bascule active, XHR `GET /api/v1/favorites` 200 |
| 3. Clic Recent | ✅ | Bascule active, pas de XHR additionnel |
| 4. Clic Queue retour | ✅ | Bascule active, pas de XHR |
| 5. 10 switches Queue↔Fav↔Recent en boucle | ⚠️ | Chaque clic Fav refait `GET /favorites` (~2.1 s), même si déjà actif |
| 6. Clic Fav quand déjà actif | ⚠️ | Re-fetch inutile |
| 7. Ordre stable après switch | ✅ | Liste triée conservée |
| 8. Marque `current` sur track active | ✅ | `.rail-item.pressable.current` suit `?id=` |
| 9. État préservé après F5 | ✅ | Queue reprend au load |
| 10. Keyboard focus (Tab) | ℹ️ | Non testé (pas d'outline focus visible dans le CSS) |

**Finding B8** — Cache-busting naïf : `GET /api/v1/favorites` est refait à chaque clic sur Fav (y compris quand l'onglet est déjà actif). Coût mesuré : **2123 ms** par clic. Ajouter un guard `if (currentTab === 'fav') return;` dans le handler + un cache mémoire 30 s.

---

## 3. Track rail (clic sur un track)

| Scénario | Statut | Détail |
|---|---|---|
| 1. Clic track 138 (42 Switch, BPM+Key OK) | ✅ | Navigation `?id=139` → `?id=138`, title update |
| 2. Clic track 137 (69 Forever Young, **— —**) | ✅ | Navigue correctement à `?id=137` |
| 3. Clic track 136 (01 FADE) | ✅ | Navigue à `?id=136` |
| 4. Clic track sans BPM (01 Happier **— —**) | ✅ | Navigue |
| 5. Clic track courant | ℹ️ | Reload complet (pas de guard) |
| 6. Back button après switch | ✅ | Retour à l'historique |
| 7. Classe `.current` update | ✅ | Suit l'URL |
| 8. Double-clic rapide | ℹ️ | 2 navigations séquentielles |
| 9. Titre document update | ✅ | `TrackCue — <filename>` |
| 10. Aucun `data-id` sur l'élément | ℹ️ | Le mapping se fait via index de liste (`railTracks[i]`) — fragile si l'ordre change |

**Résultat : 10/10 ✅** — l'hypothèse initiale "les tracks sans BPM/Key sont non-cliquables" est infirmée. Le clic fonctionne sur toutes les tracks, y compris celles dont les badges sont "— —".

**Note technique (ℹ️)** — aucune track n'a d'attribut `data-id` sur son `div.rail-item`. Le backend est interrogé par l'index de liste côté JS, pas par un id DOM. Si l'ordre retourné par `/tracks` change entre deux fetches, les clics routeront vers la mauvaise track.

---

## 4. Mode tabs (Analyze1 / Compare2)

| Scénario | Statut | Détail |
|---|---|---|
| 1. Analyze1 actif par défaut | ✅ | Classe `active` sur bouton Analyze1 |
| 2. Clic Compare2 | ✅ | Toggle visuel |
| 3. Retour Analyze1 | ✅ | Toggle visuel |
| 4..10. Switches répétés | ✅ | Toggle stable sur 10 cycles |

**Note (ℹ️)** — le contenu du mode Compare n'a pas été comparé visuellement avec Analyze (un screenshot différentiel serait utile). Si Compare ne charge aucun UI dédié, c'est un bug à confirmer.

---

## 5. Right panel tabs (Cues / Meta / Audio)

Tabs conteneur : `div.insp-tabs > button` (3 boutons).

| Cycle | Clic | `.active` après | Panel rendu |
|---|---|---|---|
| 1 | Meta | Meta | ❌ sélecteur `.insp-body` introuvable |
| 2 | Audio | Audio | ❌ idem |
| 3 | Cues · 10 | Cues · 10 | ❌ idem |
| 4-10 | rotations | OK | ❌ idem |

**Résultat : 10/10 ✅ côté `.active`**, mais **l'élément `.insp-body` (conteneur du panel) est introuvable via `querySelector`**. Soit le panel est rendu ailleurs (ID/classe différent), soit il n'est jamais monté. À vérifier visuellement : le contenu du tab change-t-il à l'écran ?

---

## 6. Toolbar gauche — 10 outils

Boutons : Select (V) · Cue (C) · Loop (L) · Slice (S) · Fade (F) · Snap to bar · Phrase grid · Beat markers · Zoom out · Zoom in.

| # | Outil | État avant | Après 1 clic | Comportement attendu | Verdict |
|---|---|---|---|---|---|
| 1 | Select (V) | `.active` | `.active` | Reste actif (outil par défaut) | ✅ |
| 2 | Cue (C) | — | `.active` | Remplace V en `.active` | ❌ **devient actif EN PLUS de V** |
| 3 | Loop (L) | — | `.active` | Remplace C | ❌ **actif en plus** |
| 4 | Slice (S) | — | `.active` | Remplace L | ❌ **actif en plus** |
| 5 | Fade (F) | — | `.active` | Remplace S | ❌ **actif en plus** |
| 6 | Snap to bar | `.active` | — | Toggle indépendant | ✅ |
| 7 | Phrase grid | `.active` | — | Toggle indépendant | ✅ |
| 8 | Beat markers | — | `.active` | Toggle indépendant | ✅ |
| 9 | Zoom out | — | `.active` | One-shot (zoom -20%) | ❌ **reste `.active`** |
| 10 | Zoom in | — | `.active` | One-shot (zoom +20%) | ❌ **reste `.active`** |

**Finding B6** — les 5 outils d'édition (V/C/L/S/F) ne sont pas mutuellement exclusifs. Après avoir cliqué les 4 derniers, V + C + L + S + F sont **tous** `.active` simultanément. Un éditeur normal ne permet qu'un seul outil actif à la fois.

**Finding B7** — Zoom out / Zoom in devraient être des **actions** (déclencher un zoom sur le waveform), pas des **toggles d'état**. Leur ajout persistant de `.active` est un bug visuel (et trahit qu'il n'y a pas de vraie logique zoom sous-jacente — aucun `<canvas>` à zoomer, voir B1).

---

## 7. Hot-cue pads (8 pads 1–8)

Test sur track 139 qui a **10 cues en DB**.

| Pad | Label affiché | Clic → classe change | URL / modal / network | Verdict |
|---|---|---|---|---|
| 1 | "1" | non | non | ❌ dead button |
| 2 | "2" | non | non | ❌ |
| 3 | "3" | non | non | ❌ |
| 4 | "4" | non | non | ❌ |
| 5 | "5" | non | non | ❌ |
| 6 | "6" | non | non | ❌ |
| 7 | "7" | non | non | ❌ |
| 8 | "8" | non | non | ❌ |

**Finding B2 (CRITIQUE)** — les 8 pads affichent juste "1" à "8" alors que la track a 10 cues en DB. Aucun label (Intro, Drop, Outro…), aucune couleur de catégorie, aucun handler de clic. Sur un DJ cue editor c'est la fonctionnalité phare — elle est 100% absente.

Attendu (cf. MIK / Rekordbox) :
1. Au chargement, lire les N premiers cues et bind pad[i] = cue[i]
2. Label du pad = nom du cue ou position `@ mm:ss`
3. Couleur de fond = color du cue
4. Clic = seek du transport à la position du cue (ou trigger du cue en mode Perform)
5. Shift+clic = éditer / renommer / supprimer

---

## 8. Transport (Prev cue, Play, Next cue, Record) — 🔴 CRITIQUE

Audit DOM de la page `/analyze?id=139` :

```js
document.querySelectorAll('audio').length      // → 0
document.querySelectorAll('video').length      // → 0
document.querySelectorAll('canvas').length     // → 0
document.querySelectorAll('[src*=".flac"]')    // → []
document.querySelectorAll('[src*=".mp3"]')     // → []
```

**Finding B1 (CRITIQUE)** — aucun élément audio natif, aucun canvas de waveform, aucune src de fichier audio dans le DOM de /analyze. Conséquence :

| Bouton | Tooltip | Clic | Effet | Verdict |
|---|---|---|---|---|
| Prev cue | Prev cue (←) | rien | pas d'audio à seek | ❌ |
| Play | Play (Space) | rien | pas d'audio à lire, classe `.play` stable | ❌ |
| Next cue | Next cue (→) | rien | pas d'audio | ❌ |
| Record | Record (R) | rien | pas de bus audio | ❌ |

**La page `/analyze` n'a pas de lecteur audio réel.** Le waveform visible (container `.wave` 712×180 et `.wave-block` 746×338) ne contient **ni canvas ni SVG de taille significative** — c'est un rendu DOM statique avec des `<div class="wbar">` générées côté JS (pas un vrai PCM render).

Fix : brancher un `<audio>` vers l'URL R2 signée de la track (`/api/v1/tracks/{id}/audio-url` ou équivalent), un player Web Audio API pour le seek/waveform, et binder les 4 boutons transport.

---

## 9. Header actions — Duplicate, Share, AI suggérer, Export

### 9.1 btn-duplicate (icône)
- Label/title : "Dupliquer"
- Clic : **zéro effet** (URL ne change pas, aucun modal, body text delta = 0, aucune XHR)
- **Finding B5** : dead button. Soit le handler n'est pas wiré, soit il fallback silencieusement.

### 9.2 btn-share (icône)
- Label/title : "Partager"
- Clic : écrit dans le clipboard **`https://exquisite-art-production-f4c6.up.railway.app/v4/analyze.html?id=170`**
- **Problèmes :**
  - (a) 🔴 l'URL utilise `/v4/analyze.html` — path interne qui est censé être nettoyé user-visible (cf. mémoire `project_cueforge_v1_rebrand`)
  - (b) 🔴 l'ID est `170` alors que la page courante est `139` (sans doute un fallback hardcodé ou le dernier track uploadé)
  - (c) 🟠 ensuite, la page fait une navigation plein écran vers `/v4/analyze.html?id=170` (side-effect non voulu)
  - (d) 🟡 aucun toast / feedback visuel "Lien copié"

**Finding B3** — btn-share doit copier `${location.origin}/analyze?id=${currentTrackId}` (path propre, bon id), afficher un toast, et **ne pas naviguer**.

### 9.3 btn-ai-suggest ✅
- Label : "AI suggérer NEW" → "Analyse…" pendant la requête → retour après résultat
- Clic : panneau `#ai-sug` devient visible, contient titre "5 cues suggérés", corps `Intro @ 1.0s · Drop @ 45.1s · Drop 2 @ 87.3s et 2 autres`, actions "Ajouter" + "Fermer"
- 10 cycles : fonctionne, pas d'erreur JS
- ✅ **10/10** — seule feature héroïque fonctionnelle de la barre d'actions

### 9.4 btn-export
- Label : "Export →"
- Clic : navigue vers **`/v4/set-builder.html?track=139`** (leak du path interne `/v4`)
- Attendu : `/set-builder?track=139` ou ouverture d'un modal d'export (DJ set / Rekordbox XML / CSV)
- **Finding B4** — même pattern que B3 : l'URL de redirection utilise `/v4/xxx.html` au lieu du path propre. Fix identique : `location.href = '/set-builder?track=' + id;`

---

## 10. Header outils — Find ⌘K / Upload / Avatar K

| Bouton | Test | Résultat |
|---|---|---|
| Find ⌘K | Handler direct (`onclick`) | ℹ️ aucun (listener délégué probable — non testé en isolation à cause d'un renderer freeze lors du batch) |
| Upload | Handler direct | ℹ️ idem — dans le batch précédent, a navigué vers `/upload` (le href du top-nav "Upload") |
| Avatar K | Clic | ✅ menu ouvre (+10 nouveaux éléments .menu/.dropdown ajoutés au DOM) |

---

## Instrumentation détaillée

### XHR observés pendant les tests
- `GET /api/v1/auth/me` — au boot
- `GET /api/v1/tracks` — au boot (liste rail)
- `GET /api/v1/tracks/139` — au load de /analyze?id=139
- `GET /api/v1/favorites` — clic Fav (chaque clic, pas de cache)
- `POST /api/v1/tracks/139/ai-suggest-cues` — clic AI suggérer

### Console errors
Aucune erreur JS critique observée pendant les 10+ cycles de tests sur chaque groupe de boutons.

### Viewport
- innerWidth 1440, innerHeight 726
- devicePixelRatio 2 (Retina)
- Note pour Chrome MCP : les coordonnées CSS px = coordonnées clic MCP (pas de facteur 2× à appliquer), mais dans la pratique les clics par coordonnée étaient instables — les `.click()` programmatiques via `javascript_tool` sont 100% fiables.

---

## Checklist de fix (ordre recommandé)

1. **B1 — Audio player** : brancher `<audio>` + Web Audio API + binder Play/Prev/Next cue
2. **B2 — Pads** : implémenter `bindPadsToCues(track.cues)` avec label, couleur, seek
3. **B3 — btn-share** : générer l'URL depuis `location.origin + '/analyze?id=' + currentId` + toast + pas de navigation
4. **B4 — btn-export** : navigation vers `/set-builder?track=${id}` (path propre)
5. **B5 — btn-duplicate** : implémenter `POST /api/v1/tracks/{id}/duplicate` + toast
6. **B6 — Tool switcher V/C/L/S/F** : exclusivité mutuelle (`document.querySelectorAll('.tool-btn').forEach(el => el.classList.remove('active')); this.classList.add('active')`)
7. **B7 — Zoom ±** : handlers one-shot (ne pas ajouter `.active`), agir sur le scale du `.wave-block`
8. **B8 — Fav re-fetch** : guard + cache 30 s

## Tracks utilisées pour le test
- 139 — "54 Feel So Close (Radio Edit).flac" · 131 BPM · G · 10 cues (référence)
- 138 — "42 Switch.flac" · 125 BPM · Fm
- 137 — "69 Forever Young.flac" · **— —** (pas de BPM/Key) · utilisé pour vérif B3
- 136 — "01 FADE.flac" · 131 BPM · C#
- 170 — ID inattendu retourné par btn-share (à investiguer : quelle track est cet id 170 ?)
