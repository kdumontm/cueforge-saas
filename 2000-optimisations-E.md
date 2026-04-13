# CueForge — 2000 Optimisations
## Section E — UX/UI Design & Expérience Utilisateur (Points 1251-1650)

---

## Onboarding & First Run (1251-1290)

1251. **Interactive Tutorial System** — Tutoriel pas-à-pas intégré sans vidéo, guidant l'utilisateur à travers chaque étape d'analyse de track avec des tooltips contextuels et des actions simulées.

1252. **Progress Wizard UI** — Barre de progression visuelle montrant les étapes d'onboarding complétées (import → analyse → édition → export) avec jump-to-step possible.

1253. **First Track Analysis Guided Flow** — Workflow guidé pour la première analyse, mettant en surbrillance les éléments clés et désactivant les options avancées jusqu'à la fin.

1254. **Feature Discovery Tooltips** — Tooltips intelligentes apparaissant au moment optimal pendant l'onboarding, présentant une nouvelle fonctionnalité sans bloquer le workflow.

1255. **Empty State Design – Dashboard** — État vide attrayant montrant des illustrations, des boutons CTA clairs et un lien vers la première analyse guidée.

1256. **Empty State Design – Playlists** — Design spécifique pour l'absence de playlist, avec bouton flottant et raccourci clavier mis en évidence.

1257. **Sample Track Included** — Piste d'exemple pré-chargée pour tester immédiatement les fonctionnalités sans avoir besoin d'importer sa propre musique.

1258. **Quick-Start Presets by DJ Level** — Presets de configuration rapide adaptés au niveau du DJ (débutant/intermédiaire/expert) avec paramètres pré-configurés.

1259. **Contextual Help Button** — Bouton d'aide flottant contextuel accessible partout, affichant des réponses basées sur la vue actuelle.

1260. **Keyboard Shortcut Cheatsheet Modal** — Modal affichable au démarrage listant les 20 raccourcis clavier essentiels avec émoticônes et images mnémoniques.

1261. **Achievement System for Learning** — Badges/achievements débloqués en complétant des jalons (première analyse, 10 tracks analysées, création d'une playlist, etc.).

1262. **Onboarding Progress Persistence** — Progression sauvegardée localement, permettant de reprendre l'onboarding partiellement avec option "Skip" visible.

1263. **Guided Import Flow** — Assistant d'importation détaillé expliquant les formats supportés, la taille maximale et les paramètres de qualité.

1264. **Feature Walkthrough Video Alternatives** — Microanimations et GIF animés à la place de vidéos lourdes, expliquant chaque feature en 5-10 secondes.

1265. **Post-Onboarding Nudges** — Messages contextuels doux incitant à explorer les features avancées (stems, mix view, export options) après les premières 5 analyses.

1266. **Confirmation of Understanding** — Petits quiz ou boutons de confirmation pendant l'onboarding vérifiant que l'utilisateur comprend avant de passer à l'étape suivante.

1267. **Onboarding Customization** — Option pour sauter certaines étapes ou accélérer le tutoriel pour les utilisateurs expérimentés.

1268. **Getting Started Checklist** — Checklist visible dans le sidebar indiquant les tâches d'onboarding complétées (import ✓ analyse ✓ création de preset ✓).

1269. **Tooltips Dismissal Tracking** — Système de badge "dismiss" sur les tooltips avec option "Don't show again for this feature" et "Reset all tooltips" dans les paramètres.

1270. **First Login Celebration** — Écran de bienvenue léger avec animation confetti subtile, statistiques vides stylisées et encouragement à importer la première track.

1271. **Onboarding Accessibility Mode** — Mode spécifique pour l'onboarding avec focus sur la lisibilité, tailles de police augmentées et descriptions détaillées en texte.

1272. **Language Selector on Onboarding** — Choix de langue avant le tutoriel avec traductions complètes pour français/anglais/espagnol.

1273. **Mobile Onboarding Adaptation** — Version allégée du tutoriel sur mobile, adaptée aux écrans petits avec navigation par swipe.

1274. **Guided Feature Tours** — Tours guidés pour features spécifiques (stems, mixing, waveform editing) accessibles depuis un menu "Learn" dédié.

1275. **Skip with Consequences Modal** — Modal light avertissant que le skip du tutoriel limite les notifications d'aide, avec option de relancer plus tard.

1276. **Onboarding Analytics Dashboard** — Suivi interne des étapes abandonnées pour optimiser le flux d'onboarding futur.

1277. **Welcome Video Alternative – Interactive Slideshow** — Slideshow interactif (plutôt qu'une vidéo) avec navigation par boutons et text descriptions.

1278. **Contextual Onboarding Variations** — Tutoriels adaptés au type d'utilisateur (DJ live, producteur, podcast engineer, etc.) détecté via questionnaire rapide.

1279. **Help Overlay Library** — Banque réutilisable d'overlays d'aide (tooltip, popover, modal, banner) appliquée uniformément dans l'onboarding.

1280. **Graduation from Onboarding** — État final de l'onboarding célébrant la complétion et affichant "You're ready!" avant de retourner au dashboard.

---

## Dashboard Layout (1291-1340)

1281. **Responsive Grid System** — Grille responsive (mobile: 1 col, tablet: 2 cols, desktop: 4 cols) ajustant le layout du dashboard automatiquement.

1282. **Sidebar Collapsible Toggle** — Bouton de toggle sidebar réduisant la navigation latérale à des icônes, libérant de l'espace pour le contenu principal.

1283. **Drag-and-Drop Tab Reorder** — Onglets du dashboard réordonnables par drag-drop, avec persistence locale de l'ordre préféré.

1284. **Split View for 2 Tracks** — Mode vue divisée (50/50 ou 60/40) affichant 2 tracks côte à côte pour la comparaison directe.

1285. **Fullscreen Player Mode** — Bouton fullscreen agrandissant le player waveform jusqu'à remplir la fenêtre, idéal pour les DJ sur scène.

1286. **Mini-Player Floating Mode** — Lecteur flottant en bas-droit permettant une écoute en arrière-plan tout en navigant dans le dashboard.

1287. **Quick-Access Toolbar** — Barre d'outils fixe en haut du dashboard avec boutons rapides (Import, Play, Pause, Export, Settings).

1288. **Breadcrumb Navigation** — Fil d'Ariane naviguant Dashboard > Playlist > Track > Cue, facilitant le retour aux niveaux antérieurs.

1289. **Workspace Persistence** — État du workspace sauvegardé (onglets ouverts, splits, scrolls, sélections) et restauré au reload de la page.

1290. **Multi-Window Support** — Possibilité d'ouvrir plusieurs windows/tabs du dashboard sans conflits de session ou synchronisation d'état.

1291. **Auto-Save Layout Snapshot** — Snapshots automatiques du layout actualisés toutes les 30 secondes pour recovery sans interruption.

1292. **Customizable Dashboard Widgets** — Widgets (tracks récents, playlists, notifications) ajoutables/supprimables/réordonnables librement.

1293. **Light/Dark Mode Toggle** — Bouton de toggle dans l'header pour passer du mode clair au mode sombre avec persistence.

1294. **Keyboard-Only Navigation** — Navigation entière possible au clavier (Tab, Arrow Keys, Enter) sans souris sur le dashboard.

1295. **Focus Indicator Visible** — Indicateurs de focus visibles et distincts sur tous les éléments interactifs pour l'accessibilité.

1296. **Compact vs Spacious Layout** — Deux modes de densité visuelle (compact pour plus d'infos, spacious pour moins de fatigue visuelle).

1297. **Dashboard Search Bar Sticky** — Barre de recherche sticky au top, toujours accessible même en scrollant dans les tracks.

1298. **Notification Center Accessible** — Centre de notification dédié accessible depuis le header, regroupant toutes les alertes et messages.

1299. **User Profile Menu** — Menu déroulant dans le header affichant profil, paramètres, aide et logout.

1300. **Undo/Redo Top-Level** — Buttons Undo/Redo visibles dans la toolbar pour annuler les dernières actions au niveau du dashboard.

---

## Track List UX (1341-1400)

1301. **Multi-Column Sorting** — Tri sur plusieurs colonnes simultanément (primary: BPM, secondary: Key) avec indicateurs visuels d'ordre.

1302. **Advanced Filters UI** — Panneau de filtrage avancé avec sliders BPM, sélecteurs Key, dropdowns Genre et Energy avec preview du compte résultant.

1303. **Saved Filter Presets** — Boutons pour sauvegarder/charger des filtres préférés (e.g., "House 120-130 BPM", "Melodic Minor Key").

1304. **Bulk Operations Toolbar** — Barre d'outils contextuelle pour opérations en masse (delete, export, add to playlist) lorsque des tracks multiples sont sélectionnées.

1305. **Drag-and-Drop Track Ordering** — Réordonner les tracks dans la liste par drag-drop sans limitation de déplacement.

1306. **Column Customization Panel** — Panneau permettant de choisir quelles colonnes afficher (BPM, Key, Genre, Energy, Duration, etc.).

1307. **Inline Editing – BPM** — Double-cliquer sur la colonne BPM pour éditer directement la valeur inline sans modal.

1308. **Inline Editing – Key** — Double-cliquer sur la colonne Key pour changer la tonalité inline avec autocomplétion des tonalités valides.

1309. **Inline Editing – Genre** — Double-cliquer sur Genre pour éditer inline avec suggestions de genres existants.

1310. **Track Grouping by Genre** — Option pour regrouper les tracks par Genre avec en-têtes de groupe collapsibles.

1311. **Track Grouping by BPM Range** — Regrouper les tracks par gamme BPM (0-100, 100-120, 120-140, 140+) avec sections pliables.

1312. **Track Grouping by Key** — Regroupement par tonalité avec sections pour majeur/mineur et tri par compatibilité harmonique.

1313. **Search Suggestions** — Suggestions autocomplète lors de la saisie dans la barre de recherche basées sur noms de tracks, artistes et genres.

1314. **Recent Searches Memory** — Affichage des 10 dernières recherches avec option de les relancer d'un clic.

1315. **Infinite Scroll with Virtual List** — Scroll infini optimisé avec virtualisation pour listes de 1000+ tracks sans ralentissements.

1316. **Track Row Hover Actions** — Actions contextuelles (play, edit, delete) apparaissant au hover sur une track.

1317. **Selection Checkbox Toggle** — Checkboxes pour la sélection multi-track avec "Select All" et "Clear Selection" en haut de liste.

1318. **Track Preview on Hover** — Lecteur micro inline au hover affichant 5-10 secondes du début de la track.

1319. **Keyboard Shortcuts for Selection** — Shift+Arrow pour sélectionner plages, Ctrl+A pour tout sélectionner, Delete pour supprimer batch.

1320. **Context Menu on Track Row** — Menu contexte (clic-droit) offrant play, edit, export, delete, copy metadata, add to playlist.

1321. **Tracks Status Indicator** — Icône de statut (analyzed, pending, error) visible rapidement pour chaque track.

1322. **Last Analyzed Date Column** — Affiche la date/heure de la dernière analyse permettant d'identifier les tracks obsolètes.

1323. **Track Duration Column** — Affiche la durée totale, utile pour les DJ planifiant des sets.

1324. **Energy Level Visualization** — Colonne énergie affichée avec barre colorée (rouge: élevée, jaune: moyenne, vert: basse).

1325. **BPM Range Filter with Slider** — Slider dual-thumb pour filtrer les tracks par gamme BPM (e.g., 110-130).

1326. **Key Compatibility Highlights** — Rows de tracks harmoniquement compatibles avec la sélection actuelle en surbrillance.

1327. **Export Multiple Tracks** — Sélectionner plusieurs tracks et exporter en batch (CSV, JSON, ou fichiers audio zip).

1328. **Duplicate Track Detection** — Algorithme détectant les doublons (même titre/artiste) avec notification et merge option.

1329. **Track Comparison Side-by-Side** — Sélectionner 2 tracks pour afficher leurs détails côte à côte pour comparaison directe.

1330. **Sort Indicator Icons** — Icônes claires (↑↓) sur les colonnes triables, changeant visuellement lors du tri.

---

## Waveform UX (1401-1450)

1331. **Pinch-to-Zoom on Trackpad** — Geste pinch sur trackpad pour zoomer/dézoomer fluidement sur la waveform (comme Google Maps).

1332. **Smooth Zoom Transitions** — Animations lisses lors du zoom in/out, pas de transitions brusques ou scintillantes.

1333. **Zoom Presets Buttons** — Boutons "Overview" (waveform entière), "Bars" (4 barres visibles), "Beats" (1 barre) pour zoom rapide.

1334. **Zoom-to-Selection** — Cliquer un bouton "Zoom to Selection" remplissant la vue avec la plage sélectionnée uniquement.

1335. **Waveform Comparison Overlay** — Mode affichant 2 waveforms superposées (semi-transparentes, couleurs différentes) pour comparer tracks.

1336. **Spectrum/Frequency View Toggle** — Bouton pour basculer entre waveform amplitude et vue spectrogram colorée par fréquence.

1337. **Energy Heatmap Overlay** — Overlay visuelle affichant les zones haute/basse énergie en couleur chaude/froide sur la waveform.

1338. **Loudness Curve Overlay** — Courbe LUFS/loudness visible en overlay transparent montrant les pics de volume relatifs.

1339. **Cue Snap Indicators** — Marqueurs subtils affichant les cue points qui "snapperaient" sur les beats si activé.

1340. **Beat Number Overlay** — Numéros de beats (1, 2, 3, 4, 1, 2, 3, 4…) affichés au-dessus de la waveform pour orientation rapide.

1341. **Playhead Vertical Line** — Ligne de lecture vertical semi-transparente suivant la position courante avec label temps.

1342. **Time Ruler Above Waveform** — Règle temporelle en haut montrant minutes:secondes avec graduations pour beats.

1343. **BPM Grid Overlay** — Grille alignée sur le BPM visible/masquable aide à visualiser les bars et beats alignés.

1344. **Frequency Range Highlighting** — Sélectionner une plage fréquence (e.g., basses 0-250Hz) et voir la région correspondante surbrillancée.

1345. **Stereo Waveform Display** — Affichage dual-channel (gauche/droite stéréo) avec waveforms empilées pour voir les différences L/R.

1346. **Mono Waveform Toggle** — Bouton pour forcer l'affichage en mono (combinaison L+R) pour simplifier la vue.

1347. **Peak Hold Indicators** — Marqueurs légers montrant les pics de volume pour repérer rapidement les sections chaudes.

1348. **Waveform Export as Image** — Exporter la waveform actuellement affichée (avec overlays) en PNG/SVG haute résolution.

1349. **Zoom Reset Button** — Bouton rapide pour revenir au zoom par défaut (vue complète) en un clic.

1350. **Mouse Wheel Zoom** — Scroll souris pour zoomer, avec sensibilité configurable dans les paramètres.

---

## Cue Points UX (1451-1510)

1351. **Drag Cues on Waveform** — Cues pointeurs draggables directement sur la waveform pour repositionner sans menu.

1352. **Right-Click Context Menu on Cue** — Menu contexte au clic-droit sur un cue (edit, delete, copy, move to beat, set color).

1353. **Cue Naming Inline Edit** — Double-cliquer sur le label d'un cue pour éditer son nom directement inline.

1354. **Cue Color Quick Picker** — Palette de 8-10 couleurs apparaissant au clic-droit pour changer la couleur instantanément.

1355. **Cue Copy/Paste Between Tracks** — Copier les cues d'une track et les coller dans une autre avec offset temporel optionnel.

1356. **Cue Templates Save/Load** — Sauvegarder une configuration de cues (positions relatives) et la charger sur d'autres tracks.

1357. **Cue Notes Inline** — Petit champ texte éditable au cue permettant des annotations (e.g., "break 1", "drop 2", "vocal start").

1358. **Cue Photo Marker** — Capture automatique d'une "photo" du waveform à la position du cue pour identification visuelle rapide.

1359. **Undo/Redo for Cue Operations** — Chaque ajout/suppression/modification de cue peut être annulée via Ctrl+Z.

1360. **Batch Cue Edit** — Sélectionner plusieurs cues et appliquer des modifications en masse (couleur, décalage temporel, suppression).

1361. **Cue Snap to Beat** — Option pour que les cues se "snapent" automatiquement au beat le plus proche au placement.

1362. **Cue Snap to Bar** — Cues s'alignent sur les barres (beat 1) si cette option est activée.

1363. **Cue Grid View** — Vue tabulaire listant tous les cues avec colonnes (Time, Name, Color, Notes) triables et éditables.

1364. **Cue Shortcuts Bar** — Barre flottante avec boutons rapides "Add Cue", "Next Cue", "Prev Cue", "Delete Cue" et leurs raccourcis visibles.

1365. **Cue Type Selection** — Types de cues prédéfinis (intro, drop, build, bridge, outro, etc.) avec icônes pour identification rapide.

1366. **Smart Cue Suggestions** — Algorithme suggerant des positions de cues automatiques basées sur l'énergie/beats/structure.

1367. **Cue Color Legend** — Légende visible des couleurs et leurs significations (rouge=drop, jaune=build, etc.).

1368. **Hover Tooltip on Cue** — Au survol d'un cue, affiche son temps, son nom et ses notes dans une tooltip.

1369. **Cue Keyboard Navigation** — Flèches gauche/droite pour naviguer entre cues, Space pour jouer depuis le cue sélectionné.

1370. **Cue List Panel Dockable** — Panneau latéral dock/undock listant tous les cues avec double-clic pour sauter.

1371. **Waveform Cue Overlay Count** — Badge sur chaque cue montrant le numéro d'ordre (1, 2, 3…) pour référence rapide.

1372. **Cue Move Markers** — Après drag d'un cue, afficher brièvement l'ancienne position (transparente) et la nouvelle avec animation de mouvement.

1373. **Cue Quantization Lock** — Option de "lock" empêchant un cue de bouger s'il est accidentellement draggé.

1374. **Multi-Select Cues** — Shift+clic pour sélectionner plusieurs cues d'un coup et les traiter en lot.

1375. **Cue Color Theme Sync** — Appliquer une palette de couleur globale à tous les cues (e.g., "pastel", "neon", "muted").

---

## Player & Playback UX (1511-1560)

1376. **A/B Loop with Visual Markers** — Marqueurs A (entrée) et B (sortie) visibles sur la waveform, avec barre surlignée pour la boucle.

1377. **Speed Control 0.5x-2x** — Slider ou input tempo permettant la lecture ralentie/accélérée sans changement de pitch.

1378. **Pitch Control (-12 to +12 semitones)** — Contrôle de pitch indépendant du tempo pour transposition.

1379. **Loop Length Presets** — Boutons rapides (1, 2, 4, 8, 16 bars) pour créer des boucles de longueur standard.

1380. **Tap Tempo with Visual Feedback** — Bouton "Tap Tempo" cliquable X fois pour auto-détecter le tempo avec feedback visuel (barre de progression).

1381. **EQ Kill Switches** — 3 boutons on/off pour couper rapidement les basses, mids, aigus (imitant un mixer DJ physique).

1382. **Crossfader Between 2 Decks** — Slider horizontal fading entre 2 decks chargés (gauche/droite) pour transition fluide.

1383. **Vinyl Mode – Scratch Simulation** — Mode "vinyle" avec friction simulée et scratch possible via accélération/décélération du playhead.

1384. **Beat-Sync Between 2 Tracks** — Bouton "Sync" alignant automatiquement le tempo du deck 2 sur le deck 1.

1385. **Auto-Mix Preview** — Bouton "Preview Mix" lisant les 30 secondes finales du deck 1 + premières 30 secondes du deck 2 en crossfade.

1386. **Loop Recording** — Enregistrer une boucle répétée sur le deck 2 pour layering live (fondations pour futur décupla).

1387. **Cue Point Jump on Playhead** — Cliquer sur un cue point pour sauter instantanément la lecture à cette position.

1388. **Play/Pause Position Memory** — La lecture reprend à partir de la position exacte si on pause/resume (pas reset au début).

1389. **Playback Speed Indicator** — Affichage clairement du tempo actuel (BPM) en temps réel et du ratio de vitesse (e.g., "120 BPM, 1.0x").

1390. **Master Volume Slider** — Contrôle du volume master avec volume meter affichant les niveaux dB en temps réel.

1391. **Headphone Cue Preview** — Bouton pour écouter le prochain deck via un casque (simulation) sans affecter le mix principal.

1392. **Waveform Playhead Scrubbing** — Cliquer sur la waveform pour sauter le playhead à cette position, avec dragging possible.

1393. **Rewind/Forward Buttons** — Boutons ⏪/⏩ pour reculer/avancer rapidement (par défaut 5 sec, configurable).

1394. **Skip to Next/Previous Track** — Boutons dédiés pour passer à la track suivante/précédente de la playlist.

1395. **Repeat Mode Toggle** — Modes Off, One (boucle track), All (boucle playlist) avec icônes distinctes.

1396. **Shuffle Mode Toggle** — Bouton for lancer la lecture aléatoire des tracks avec icône distinctive.

1397. **Visualization Background** — Visualiseur audio animé en arrière-plan du player changeant selon la fréquence/énergie.

1398. **Mini Spectrogram in Playhead** — Petit spectrogram coloré sous la waveform montrant les fréquences actuelles pendant la lecture.

1399. **Loud Peak Warning** — Indicateur visuel (alerte rouge) si le volume approche du clipping.

1400. **Playhead Speed Animation** — La ligne playhead s'anime légèrement (blur motion) pour indiquer la vitesse de lecture.

---

## Stems UX (1561-1600)

1401. **Solo/Mute Toggle Animation** — Boutons Solo/Mute avec animation subtile (icône rotate, couleur change) pour indiquer l'état.

1402. **Stem Volume Automation Curves Visible** — Graphique affichant la courbe de volume au fil du temps pour chaque stem, éditable par clic.

1403. **Stem Waveform Color Intensity by Energy** — Couleur de la waveform de chaque stem varie (plus vive = plus énergique) pour vision rapide.

1404. **Stem Comparison View Before/After** — Vue dual affichant la waveform du stem avant/après effect pour comparer l'impact.

1405. **Stem Export Preview** — Avant d'exporter un stem, afficher un preview du fichier résultant (durée, codec, qualité).

1406. **Stem Effects Per-Stem** — Appliquer des effects (reverb, delay, EQ, compression) spécifiques à un stem sans affecter les autres.

1407. **Stem Pattern Visualization** — Affichage du pattern de répétition d'un stem (si répétitif) avec visualisation des barres alignées.

1408. **Stem Rhythm Notation** — Notation musicale simplifiée (notation de rhythm) montrant les notes/beats des stems mélodiques/percussifs.

1409. **Stem Remix Mode** — Mode spécialisé affichant tous les stems dans un mix de remix avec faders de volume individuels pour chacun.

1410. **Stem DJ Performance Mode** — Vue optimisée pour les DJ montrant les stems de manière minimaliste avec touches rapides pour solo/mute.

1411. **Stem Folder Organization** — Grouper les stems par catégorie (drums, melody, bass, fx) avec expand/collapse.

1412. **Stem Rename Inline Edit** — Double-cliquer sur le nom du stem pour le renommer directement.

1413. **Stem Color Assignment** — Assigner une couleur à chaque stem pour identification visuelle rapide (drums=rouge, bass=bleu, etc.).

1414. **Stem Level Meter** — Petit VU-mètre affichant le niveau de chaque stem en temps réel pendant la lecture.

1415. **Stem Pan Control** — Slider pan (L/R) pour chaque stem pour créer de la largeur stéréo.

1416. **Stem Mute Shortcut Keys** — Touches rapides (1, 2, 3, 4) pour mute/unmute les stems en direct.

1417. **Stem Solo Chain** — Mode où le solo d'un stem inclut automatiquement les stems dépendants (e.g., bass soloed implique aussi les drums).

1418. **Stem Fade In/Out Controls** — Contrôles dédiés pour fade in/out rapides (0.5s, 1s, 2s) de chaque stem.

1419. **Stem Crossfade Between Versions** — Si plusieurs versions de stems existent, crossfader entre elles.

1420. **Stem Metadata Display** — Afficher les infos du stem (codec, sample rate, bitrate, durée) dans un panneau détails.

---

## Mix & Playlist UX (1601-1650)

1421. **Drag-and-Drop Playlist Builder** — Créer/éditer une playlist par drag-drop des tracks depuis la liste vers la vue playlist.

1422. **Visual Energy Curve for Set** — Graphique montrant la courbe d'énergie du set complet (abscisse: temps, ordonnée: énergie estimée).

1423. **Key Compatibility Indicators on Playlist** — Icones/badges montrant si chaque paire consécutive de tracks est harmoniquement compatible.

1424. **Automatic Set Order Suggestions** — Bouton "Auto-Order" suggérant un ordre optimal basé sur BPM, Key et Energy avec confirmation avant application.

1425. **Transition Point Markers Between Tracks** — Marques visuelles (transition markers) montrant les points de transition suggérés entre tracks.

1426. **Set Duration Calculator** — Affichage automatique de la durée totale du set et estimation du temps par track pour planning.

1427. **Gap Analysis Between Tracks** — Détecte et affiche les "gaps" de BPM ou Key entre tracks consécutives (e.g., "Jump: 120→140 BPM").

1428. **Print Setlist with Notes** — Export imprimable du setlist (PDF) avec temps, BPM, Key, notes personnelles pour référence sur scène.

1429. **Share Setlist as Link** — Générer un lien public/privé partageant le setlist avec un autre DJ (read-only ou editable).

1430. **Collaborative Playlist Editing** — Multi-utilisateurs peuvent éditer la même playlist simultanément (fondations pour future collab).

1431. **Playlist Duplicate** — Bouton pour cloner une playlist entière avec toutes les tracks, cues et notes.

1432. **Playlist Template Save** — Sauvegarder une structure de playlist vide (sans tracks, juste structure) comme template.

1433. **Playlist Template Load** — Charger un template et remplir rapidement avec des tracks.

1434. **Reorder Tracks in Playlist** — Drag-drop pour réordonner les tracks dans la playlist, avec undo/redo.

1435. **Track Removal from Playlist** — Supprimer une track du playlist sans supprimer le fichier source.

1436. **Bulk Add to Playlist** — Sélectionner plusieurs tracks dans la liste et les ajouter d'un coup à la playlist.

1437. **Playlist Notes/Description** — Champ texte pour ajouter des notes globales au playlist (thème, event, notes générales).

1438. **Playlist Cover Image** — Upload une image de cover pour le playlist, affichée en thumbnail.

1439. **Playlist Genre Tags** — Tags multi-sélectionnables pour catégoriser le playlist (house, techno, hip-hop, etc.).

1440. **Playlist Difficulty Rating** — Slider 1-5 étoiles indiquant la complexité/skill requise pour mixer le setlist.

1441. **Track Swap in Playlist** — Drag-drop rapide pour swapper 2 tracks de position sans les retirer.

1442. **Playlist Timeline View** — Vue timeline montrant les tracks comme blocs avec hauteur/couleur représentant énergie/BPM.

1443. **Playlist Transition Suggestions** — IA suggérant les meilleures transitions possibles entre paires de tracks du playlist.

1444. **Estimated Mix Duration** — Calcul estimé du temps total pour mixer le setlist (durée tracks + transition buffer).

1445. **Set Difficulty Indicator** — Algo estimant la difficulté globale du setlist basée sur les transitions et les changements.

1446. **Playlist Export Formats** — Exporter en CSV, JSON, PDF, ou fichier M3U pour utilisateurs externes.

1447. **Playlist Import from File** — Importer un setlist depuis un fichier (CSV, M3U, JSON) avec mapping de colonnes.

1448. **Playlist Archive/Restore** — Archiver les anciens playlists (masqués mais conservés) avec option de restore.

1449. **Playlist Search/Filter** — Recherche rapide dans le playlist par titre track, artiste ou genre.

1450. **Playlist Sort Options** — Trier le playlist par BPM, Key, Energy, Durée, ou ordre d'ajout avec reverse option.

---

**FIN DE LA SECTION E — 400 points exactement (1251-1650)**
