# CueForge Desktop — Feuille de route

## Pourquoi une version desktop ?

Le web SaaS est limité par le serveur Railway (CPU partagé, RAM limitée, pas de stockage persistant).
Une version desktop change la donne :
- Demucs tourne sur **la machine du client** (Mac M2 = ~45s, GPU Nvidia = ~20-30s)
- Les stems et fichiers audio sont stockés **localement** (pas de `/tmp` éphémère)
- **Zéro coût serveur** pour les opérations lourdes (Demucs, analyse audio)
- Utilisation **offline** possible

---

## Stack recommandée

### Framework desktop : **Electron**
- Réutilise le frontend Next.js tel quel (WebView Chromium)
- Bundler Python facilement avec PyInstaller
- Large communauté, packaging Mac (.dmg) + Windows (.exe) bien documenté
- Alternative plus légère : **Tauri** (Rust backend, bundle plus petit, mais apprendre Rust)

### Architecture cible

```
CueForge Desktop
├── Electron shell           → gère la fenêtre, menus OS, accès fichiers
├── Next.js WebView          → frontend actuel (INCHANGÉ)
├── FastAPI local (port 8000) → backend actuel (INCHANGÉ ou légèrement adapté)
└── Python bundlé (PyInstaller) → Demucs + toute la stack audio
```

### Modèle Demucs pour desktop
Sur desktop, revenir à **`htdemucs`** (meilleure qualité) puisque la machine du client
est bien plus puissante que Railway CPU :
- Mac M2/M3 : ~45 secondes (MPS/Neural Engine)
- PC avec GPU Nvidia : ~20-30 secondes (CUDA)
- PC CPU Intel/AMD récent : ~3-5 minutes

Le web reste sur **`mdx_extra_q`** (rapide sur CPU serveur).

---

## Ce qui doit être adapté

### Backend (minimal)
| Changement | Raison |
|---|---|
| `STEMS_DIR` → chemin local OS (`~/CueForge/stems/`) | `/tmp` n'est pas persistant |
| `UPLOAD_DIR` → chemin local OS (`~/CueForge/audio/`) | Fichiers restent en local |
| `DATABASE_URL` → SQLite local au lieu de PostgreSQL Railway | Pas de DB distante |
| Supprimer authentification JWT (optionnel) | App mono-utilisateur |
| Port 8000 lancé par Electron au démarrage | FastAPI = processus enfant |

### Frontend (minimal)
| Changement | Raison |
|---|---|
| `NEXT_PUBLIC_API_URL` → `http://localhost:8000/api/v1` | API locale |
| Supprimer pages login/register (optionnel) | App locale = pas de compte |
| Ajouter sélecteur de dossier audio (Electron dialog) | Accès fichiers OS |

### Electron shell (nouveau)
- Lancer FastAPI au démarrage (`child_process.spawn`)
- Attendre que l'API réponde avant d'afficher la WebView
- Gérer l'arrêt propre de FastAPI à la fermeture
- Menus natifs (Fichier, Édition, À propos)
- Drag & drop de fichiers depuis le Finder/Explorer

---

## Étapes de développement

**Semaine 1 — Scaffold Electron**
- Créer `desktop/` à la racine du repo
- Electron wrapper qui lance FastAPI + ouvre Next.js en WebView
- Tester avec le backend actuel

**Semaine 2 — Adapter le stockage local**
- Remplacer paths Railway par chemins OS (`app.getPath('userData')`)
- Migrer de PostgreSQL vers SQLite pour le mode desktop
- Variables d'environnement desktop vs web

**Semaine 3 — Packaging**
- PyInstaller pour bundler Python + dépendances
- `electron-builder` pour générer `.dmg` (Mac) et `.exe` (Windows)
- Auto-updater (electron-updater)

---

## Modèle de distribution

| Version | Stemps | Stockage | Coût |
|---|---|---|---|
| Web SaaS | mdx_extra_q, serveur, 5-8 min | Railway (éphémère) | Abonnement mensuel |
| Desktop Pro | htdemucs, local, 30s-5min | Machine client (illimité) | Licence unique ou abonnement premium |

Le desktop peut devenir le plan **"Studio"** — prix plus élevé, mais zéro coût marginal
pour toi (pas de serveur GPU à payer).

---

## Références utiles

- [Electron + Python (PyInstaller)](https://github.com/fyears/electron-python-example)
- [electron-builder](https://www.electron.build/)
- [Tauri (alternative Rust)](https://tauri.app/)
- [Demucs MPS (Mac M-series)](https://github.com/facebookresearch/demucs#mac-m1)
