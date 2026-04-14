# TrackCue — 1000 Optimisations : Analyse Audio, Cues, BPM & Stems

Audit ultra-détaillé ciblant exclusivement le pipeline d'analyse audio.
Fichiers principaux : `audio_analysis.py`, `cue_generator.py`, `stem_analysis.py`, `stems_service.py`, `metadata_service.py`, `genre_detection.py`, `camelot.py`, `tracks.py`, `WaveSurferPlayer.tsx`, `CuesTab.tsx`, `BeatgridTab.tsx`, `StemsTab.tsx`.

---

## A. BPM DETECTION — PRÉCISION & VITESSE (1-100)

### Algorithme principal
1. **Pré-filtrage harmonique** : appliquer `librosa.effects.harmonic()` avant beat tracking pour isoler le signal tonal et réduire les faux positifs percussifs.
2. **Multi-résolution beat tracking** : lancer beat_this à 2 résolutions (hop_length=512 et 1024), voter sur le résultat pour robustesse.
3. **Onset pre-emphasis** : pondérer les onsets dans la bande 60-200 Hz (kick) avant le tracking pour les genres EDM.
4. **Consensus BPM** : si beat_this et madmom divergent de >2 BPM, lancer librosa en 3e arbitre et prendre la médiane.
5. **Cache du modèle beat_this** : charger le modèle une seule fois en singleton au startup, pas à chaque track.
6. **Cache du modèle madmom** : idem — RNNBeatProcessor est lourd à instancier.
7. **Batch inference beat_this** : si plusieurs tracks en queue, battre les inférences PyTorch (batch_size=4).
8. **Half-precision (FP16)** : utiliser `model.half()` sur beat_this pour 2× moins de mémoire et ~30% plus rapide sur CPU.
9. **ONNX export beat_this** : convertir le modèle PyTorch en ONNX Runtime pour 2-3× speedup CPU.
10. **Quantization INT8** : quantizer le modèle ONNX en INT8 pour encore 2× sur CPU sans perte de précision notable.
11. **Streaming inference** : charger l'audio par chunks de 30s et inférer incrémentalement au lieu de tout charger en RAM.
12. **Lazy loading audio** : ne charger que les 60 premières secondes pour la détection BPM (suffisant pour 99% des tracks).
13. **Downsample à 22050 Hz** avant beat tracking (au lieu de 44100) — la plupart des algos n'ont pas besoin de >22kHz.
14. **Mono conversion** : forcer mono dès le chargement pour diviser la RAM par 2.
15. **Memory-mapped audio** : utiliser `soundfile.read()` avec `dtype='float32'` et memory mapping pour les fichiers >100 MB.
16. **Onset strength pré-calculé** : calculer `librosa.onset.onset_strength()` une seule fois et le réutiliser dans beat tracking + drop detection.
17. **Vectoriser le calcul IBI** : remplacer la boucle Python par `np.diff(beats)` (déjà fait partiellement, vérifier partout).
18. **Éliminer les outliers IBI** : filtrer les IBIs >2× ou <0.5× la médiane avant de calculer le BPM.
19. **Weighted median IBI** : pondérer les IBIs par la force de l'onset correspondant.
20. **Octave error detection** : si BPM détecté est dans [60-70] ou [140-180] pour un track EDM, vérifier le double/moitié.
21. **Genre-aware BPM range** : si le genre est connu (Spotify/Discogs), restreindre la plage BPM attendue avant le tracking.
22. **Tempo tracking adaptatif** : pour les tracks à tempo variable, utiliser un tracking par fenêtre glissante de 30s.
23. **Confidence score BPM** : calculer un vrai score de confiance basé sur la variance des IBIs, pas juste un booléen.
24. **BPM histogram** : construire un histogramme des IBIs et prendre le pic le plus fort pour robustesse.
25. **Autocorrélation multi-échelle** : combiner autocorrélation à 3 échelles temporelles pour détecter le tempo dominant.

### Smart Rounding & Grid
26. **Rounding context-aware** : pour les tracks EDM (>120 BPM), arrondir plus agressivement (à 0.5 BPM) car les producteurs utilisent des BPM ronds.
27. **BPM snap to common values** : si le BPM est à ±0.3 d'un BPM "courant" (120, 124, 125, 126, 128, 130, 132, 140, 150, 160, 170, 174), snapper.
28. **Grid error metric** : exposer l'erreur moyenne de grid (ms) dans l'API pour que le frontend affiche la précision.
29. **Grid error par section** : calculer l'erreur de grid par section (intro/drop/outro) pour détecter les changements de tempo.
30. **Variable tempo grid** : si grid error >20ms, proposer une beat map avec BPM par section plutôt qu'un BPM global.
31. **Grid phase search parallélisé** : le micro-search de phase (±20ms en 1ms steps) peut être vectorisé avec numpy au lieu d'une boucle.
32. **Grid BPM search vectorisé** : le search ±0.30 BPM peut être fait en une seule opération matricielle.
33. **Grid binary search** : utiliser bisect pour snapper au downbeat le plus proche au lieu d'un scan linéaire.
34. **Beat interpolation** : pour les zones sans beats clairs (breakdowns), interpoler à partir du BPM global.
35. **Antialiasing de grid** : smoother les transitions de beat grid entre sections de tempo différent.

### Downbeat Detection
36. **Kick pattern recognition** : détecter le pattern "4-on-the-floor" (kick sur chaque beat) pour confirmer le downbeat en EDM.
37. **Snare on 2&4 detection** : détecter le snare/clap sur les beats 2 et 4 pour confirmer la métrique.
38. **Hi-hat pattern** : analyser le pattern de hi-hat (8th, 16th notes) pour valider la grid.
39. **Downbeat voting parallélisé** : les 3 signaux (onset, low-freq, spectral flux) peuvent être calculés en parallèle avec ThreadPoolExecutor.
40. **Downbeat from stems** : si les stems sont disponibles, utiliser le stem drums isolé pour une détection de downbeat 10× plus précise.
41. **Downbeat confidence** : score de confiance 0-1 basé sur l'unanimité des votants.
42. **Pre-chorus detection** : identifier les fills de batterie qui précèdent un downbeat de nouvelle section.
43. **Downbeat from structure** : utiliser les labels de section (allin1) pour confirmer que les downbeats tombent aux changements de section.
44. **Phase coherence check** : vérifier que la phase du downbeat est cohérente tout au long du track (pas de décalage progressif).
45. **Triplet detection** : détecter les sections en 3/4 ou 6/8 pour les tracks non-4/4.

### Fallback & Robustesse
46. **Timeout par méthode** : timeout de 10s pour beat_this, 15s pour madmom, 5s pour librosa (au lieu d'un seul timeout global).
47. **Graceful degradation** : si beat_this échoue, ne pas bloquer — enchaîner immédiatement sur madmom.
48. **Error recovery** : si toutes les méthodes échouent, retourner le BPM Spotify/MusicBrainz comme fallback.
49. **Out-of-memory protection** : vérifier la RAM disponible avant de charger le modèle beat_this (~500 MB).
50. **Corrupt file detection** : vérifier que l'audio n'est pas silencieux (RMS < -60dB) avant de lancer l'analyse.
51. **Minimum duration check** : rejeter les tracks <10s (pas assez de données pour un BPM fiable).
52. **Maximum duration optimization** : pour les tracks >10 min, analyser seulement les 5 premières minutes pour le BPM.
53. **Retry on transient failure** : retry automatique 1× si beat_this crash (OOM occasionnel).
54. **Progress reporting BPM** : envoyer le progress à 20%, 25%, 30%, 35% pendant les sous-étapes BPM au lieu d'un seul "BPM detection".
55. **Parallel BPM methods** : lancer beat_this et madmom en parallèle, prendre le premier qui finit avec un score acceptable.

### Métriques & Logging
56. **Log le temps de chaque méthode BPM** : beat_this_ms, madmom_ms, librosa_ms pour identifier les bottlenecks.
57. **Log la source BPM utilisée** : savoir quel % des tracks utilisent chaque méthode.
58. **A/B testing BPM** : comparer les BPM de toutes les méthodes dans les logs pour mesurer l'accuracy relative.
59. **BPM accuracy dashboard** : comparer les BPM détectés vs Spotify BPM pour mesurer la précision globale.
60. **Grid quality metric** : exporter la qualité de grid (erreur moyenne ms) dans les analytics.

### Optimisations numériques
61. **Utiliser float32** au lieu de float64 partout dans l'analyse audio (2× moins de RAM, même précision).
62. **Numpy vectorisation** : remplacer toute boucle Python sur des arrays audio par des opérations numpy.
63. **Scipy fftconvolve** : utiliser fftconvolve au lieu de convolve pour les kernels >64 samples.
64. **In-place operations** : utiliser `np.multiply(a, b, out=a)` au lieu de `a = a * b` pour éviter les allocations.
65. **Contiguous arrays** : s'assurer que tous les arrays sont C-contiguous avant les opérations scipy.
66. **Pre-allocate arrays** : pré-allouer les arrays de résultats au lieu de les construire par append.
67. **Numba JIT** : compiler les boucles critiques (grid search, IBI filtering) avec `@numba.jit(nopython=True)`.
68. **Cython pour les hot paths** : compiler les fonctions les plus appelées en Cython pour 10-50× speedup.
69. **SIMD via numpy** : s'assurer que numpy est compilé avec MKL/OpenBLAS pour exploiter les instructions SIMD.
70. **Chunk processing** : traiter l'audio par chunks de 10s pour rester dans le cache L2/L3 du CPU.

### Détection tempo variable
71. **Windowed BPM** : calculer le BPM par fenêtre de 15s avec overlap 50% pour détecter les variations.
72. **BPM change points** : détecter les points de changement de tempo avec un algorithme PELT ou Bayesian.
73. **Tempo curve smoothing** : lisser la courbe de tempo avec un filtre de Savitzky-Golay.
74. **Live set detection** : si la variance de tempo est >5%, marquer comme "live set" ou "DJ mix".
75. **Tempo ramp detection** : détecter les ralentissements/accélérations progressifs (common dans les intros/outros de DJ sets).

### Formats audio
76. **Opus support** : ajouter le décodage des fichiers .opus (format montant, meilleure compression que MP3).
77. **AIFF support** : vérifier que les fichiers AIFF (Apple) sont correctement décodés.
78. **M4A/AAC optimization** : utiliser ffmpeg pour décoder M4A avant librosa (plus rapide que la chaîne par défaut).
79. **FLAC streaming** : pour les FLAC >100 MB, décoder en streaming au lieu de tout charger.
80. **Metadata pre-read** : lire les tags mutagen avant l'analyse pour pré-remplir le BPM si disponible.

### Comparaison & Validation
81. **Cross-validation BPM** : comparer le BPM détecté avec celui de Spotify, MusicBrainz et les tags ID3.
82. **BPM confidence tier** : High (3 sources concordent), Medium (2 sources), Low (1 source).
83. **User feedback loop** : si un DJ corrige le BPM, logger la correction pour améliorer les modèles futurs.
84. **Regression tests BPM** : suite de 50 tracks avec BPM connu pour valider chaque modification du pipeline.
85. **Genre-specific accuracy** : mesurer la précision BPM par genre pour identifier les faiblesses.

### Micro-optimisations
86. **Eviter les copies audio** : passer des vues numpy au lieu de copies dans le pipeline.
87. **Release memory** : `del audio_data; gc.collect()` après chaque étape pour libérer la RAM.
88. **Lazy spectral features** : ne calculer les features spectrales que si nécessaire (pas si le BPM est déjà connu).
89. **Skip analysis si BPM tag fiable** : si le BPM tag ID3 est présent et cohérent avec Spotify, skip le beat tracking.
90. **Incremental analysis** : si seul le BPM a changé (user edit), ne pas re-analyser les cues/structure.

### Hardware optimisation
91. **GPU acceleration** : si CUDA disponible, utiliser le GPU pour beat_this (10× faster).
92. **Multi-core beat tracking** : paralléliser sur les cores CPU avec `torch.set_num_threads()`.
93. **Memory pool** : utiliser un pool de buffers audio pré-alloués pour éviter les allocations/deallocations.
94. **Disk cache** : cacher les features audio (onset_strength, MFCC, chroma) sur disque pour les re-analyses.
95. **SSD-aware loading** : si SSD détecté, charger l'audio en un seul read() au lieu de chunks.

### Edge cases
96. **Tracks a cappella** : détecter l'absence de percussions et utiliser l'onset tonal pour le BPM.
97. **Ambient/Drone** : détecter le manque de beats et retourner BPM=null avec une explication.
98. **Double-time confusion** : pour les tracks DnB (170), vérifier que ce n'est pas détecté comme 85 BPM.
99. **Polyrhythm detection** : détecter les sections polyrhythmiques et les marquer.
100. **Silence handling** : ignorer les silences (>0.5s) au début/fin du track avant l'analyse.

---

## B. CUE POINT GENERATION — INTELLIGENCE & PRÉCISION (101-250)

### Architecture de détection
101. **Pipeline parallèle cues** : lancer la détection de drops, phrases, sections en parallèle avec asyncio.gather().
102. **Cue generation lazy** : ne générer les cues qu'à la demande, pas systématiquement à chaque analyse.
103. **Cue templates par genre** : templates de cues différents selon le genre (EDM: intro/build/drop, Hip-Hop: verse/chorus/bridge).
104. **Cue priority queue** : scorer tous les candidats cues puis sélectionner les top 8 par priorité au lieu du pipeline séquentiel actuel.
105. **Cue confidence threshold** : ne créer un cue que si confidence >0.5 (éviter les faux positifs).
106. **Cue duplicate check** : vérifier qu'aucun cue n'est à <2s d'un autre avant d'en ajouter un.
107. **Max 8 cues enforcement** : s'assurer que le cap de 8 cues est appliqué partout (pas seulement en sortie).
108. **Cue spacing minimum** : espacement minimum de 4 bars entre les cues (BPM-adaptive).
109. **Cue type distribution** : s'assurer qu'il y a toujours au moins 1 intro et 1 outro cue.
110. **Re-generate cues** : bouton pour regénérer les cues sans re-analyser l'audio.

### Drop Detection
111. **Stem-enhanced drop detection** : utiliser les stems drums+bass pour une détection de drops 3× plus précise.
112. **Drop contrast calculation vectorisé** : remplacer le calcul de contraste par `scipy.ndimage.uniform_filter1d` partout.
113. **Multi-signal drop fusion** : combiner les 6 signaux (energy, onset, spectral flux, low-freq, centroid, RMS) avec des poids appris, pas hardcodés.
114. **Drop type classification** : classifier les drops en "big room", "minimal", "rolling", "breakdown" pour des cues plus descriptifs.
115. **False positive filtering** : filtrer les "drops" qui sont en fait des transitions douces (gradient <0.1).
116. **Drum onset for drops** : utiliser les onsets du stem drums pour confirmer les drops (kick pattern change).
117. **Bass onset for drops** : confirmer avec le stem bass (bassline entrée/sortie).
118. **Vocal absence confirmation** : un drop est plus probable si les vocals sont absents (breakdown → drop).
119. **Drop score normalization** : normaliser les scores de drop par la dynamique globale du track.
120. **Sub-drop detection** : détecter les "sub-drops" (petits drops dans un breakdown) distincts des drops principaux.
121. **Drop intensity classification** : classifier l'intensité (léger/moyen/fort) basé sur le contraste d'énergie.
122. **Pre-drop indicator** : marquer les 2 bars avant chaque drop comme "tension" pour le mixage.
123. **Drop decay analysis** : mesurer combien de temps l'énergie reste haute après le drop.
124. **Post-drop plateau** : identifier le plateau d'énergie post-drop pour savoir quand le track "cruise".
125. **Riser detection from stems** : utiliser le stem "other" pour détecter les risers/sweeps avant les drops.

### Structural Analysis
126. **SSM downsample adaptive** : adapter le facteur de downsample au nombre de beats (pas fixe à 300).
127. **SSM feature selection** : optimiser le mix de features (MFCC/chroma/contrast) par genre.
128. **SSM kernel size adaptive** : adapter la taille du checkerboard kernel au BPM (plus petit pour les BPM rapides).
129. **Hierarchical SSM** : calculer le SSM à 2 niveaux (bar-level et phrase-level) pour une structure plus robuste.
130. **SSM caching** : cacher la matrice SSM pour les re-analyses (le SSM est le plus coûteux).
131. **Section labeling from allin1** : utiliser les labels de allin1 (DL) en priorité quand disponibles.
132. **Section merging** : fusionner les sections trop courtes (<4 bars) avec la section adjacente.
133. **Section split** : splitter les sections trop longues (>64 bars) si l'énergie change significativement.
134. **Phrase boundary detection** : détecter les boundaries de phrases (typiquement 8 ou 16 bars en EDM).
135. **Phrase length statistics** : calculer la distribution des longueurs de phrases pour détecter les structures inhabituelles.
136. **Intro/Outro detection from energy** : utiliser la courbe d'énergie pour détecter l'intro (montée) et l'outro (descente).
137. **Intro/Outro from stems** : utiliser le stem drums pour détecter quand les drums entrent/sortent.
138. **Bridge detection** : détecter les bridges (énergie moyenne, pas de kick, souvent avec vocals).
139. **Chorus detection** : détecter les chorus (énergie haute, refrain récurrent) par auto-similarité.
140. **Verse detection** : détecter les verses (énergie moyenne-basse, progression harmonique).
141. **Build-up gradient analysis** : mesurer le gradient d'énergie dans chaque build-up pour scorer l'intensité.
142. **Build-up riser correlation** : corréler les risers détectés avec les builds pour confirmation.
143. **Breakdown depth** : mesurer la "profondeur" du breakdown (ratio énergie min/max).
144. **Section repetition detection** : détecter les sections qui se répètent (même pattern d'énergie).
145. **Section transition type** : classifier les transitions (cut, fade, riser, breakdown).

### Snap & Quantization
146. **4-bar snap obligatoire** : tous les cues devraient tomber sur des limites de 4 bars en EDM.
147. **8-bar snap pour intro/outro** : intro et outro devraient être sur des limites de 8 bars.
148. **16-bar snap pour drops** : les drops principaux tombent presque toujours sur des limites de 16 bars.
149. **Snap tolerance genre-aware** : tolerance de snap plus stricte pour Techno (1 bar), plus souple pour Hip-Hop (2 bars).
150. **Snap to nearest strong beat** : si pas de downbeat exact, snapper au beat avec le plus fort onset.
151. **Snap quality score** : bonus de confidence pour les cues qui tombent exactement sur un downbeat.
152. **Bar count validation** : vérifier que le nombre de bars entre les cues est un multiple de 4 (8, 16, 32).
153. **Grid-aligned cues** : s'assurer que tous les cues sont alignés sur la grid de beats détectée.
154. **Sub-beat precision** : pour les cues de type "hot cue" (DJ markers), permettre une précision sub-beat.
155. **Phase-aligned cues** : vérifier que les cues respectent la phase du downbeat (pas de décalage de 1/2/3 beats).

### Genre-specific cue strategies
156. **Techno template** : Intro (1st kick) → Build (16 bars before drop) → Drop → Breakdown → Drop 2 → Outro (drums exit).
157. **House template** : Intro → Verse → Build → Chorus → Breakdown → Chorus 2 → Outro.
158. **Trance template** : Intro → Build → Drop → Breakdown (long) → Build 2 → Drop 2 → Outro.
159. **DnB template** : Intro → Drop (fast, in 8 bars) → Breakdown → Drop 2 → Outro.
160. **Hip-Hop template** : Intro → Verse 1 → Chorus → Verse 2 → Chorus → Bridge → Outro.
161. **Ambient/Downtempo** : Intro → Theme A → Transition → Theme B → Reprise → Outro.
162. **Hardstyle template** : Intro → Anti-climax → Climax → Mid-intro → Climax 2 → Outro.
163. **Disco/Funk** : Intro → Groove → Breakdown → Groove 2 → Outro.
164. **Pop/Rock** : Intro → Verse → Pre-chorus → Chorus → Verse 2 → Chorus 2 → Bridge → Final Chorus → Outro.
165. **Genre fallback** : si genre inconnu, utiliser le template energy-based (le plus générique).

### Vocal cue detection
166. **Vocal start cue** : marquer le début de la première section vocale.
167. **Vocal-free zones** : marquer les zones sans vocals (meilleur pour mixer).
168. **Vocal chorus detection** : identifier les refrains vocaux (vocals + haute énergie).
169. **Vocal hooks** : détecter les hooks vocaux (courts motifs répétés) et les marquer.
170. **Ad-lib detection** : détecter les ad-libs/shouts courts distincts des vocals principaux.

### Cue naming
171. **Intelligent cue naming** : nommer les cues avec le context (ex: "Drop @127 BPM" au lieu de juste "Drop").
172. **Cue naming with bar count** : inclure le numéro de bar (ex: "Drop Bar 64").
173. **Cue naming with energy** : inclure le niveau d'énergie (ex: "High Energy Drop").
174. **Cue naming i18n** : supporter les noms de cues en français et anglais.
175. **Custom naming templates** : permettre aux DJs de définir leurs propres templates de nommage.

### Cue colors
176. **Rekordbox color compatibility** : vérifier que les couleurs hex sont compatibles avec Rekordbox.
177. **Serato color compatibility** : mapper les couleurs vers la palette Serato (16 couleurs).
178. **Traktor color compatibility** : mapper les couleurs vers la palette Traktor.
179. **High contrast colors** : s'assurer que les couleurs des cues sont distinguables sur fond sombre ET clair.
180. **Colorblind-safe palette** : proposer une palette alternative accessible aux daltoniens.

### Cue export/import
181. **Export cues vers Rekordbox XML** : inclure les cues dans l'export Rekordbox avec les bonnes positions.
182. **Export cues vers Serato** : convertir les cues au format Serato DJ markers.
183. **Export cues vers Traktor** : convertir les cues au format NML de Traktor.
184. **Import cues from Rekordbox** : parser les memory cues et hot cues du XML Rekordbox.
185. **Import cues from Serato** : parser les markers des fichiers Serato.
186. **Import cues from Traktor** : parser les cue points du NML Traktor.
187. **Cue position recalculation** : si le BPM change, recalculer les positions des cues pour maintenir l'alignement.
188. **Cue copy between tracks** : copier les cues relatifs (en bars) d'un track à un remix.
189. **Cue batch operations** : supprimer/déplacer/recolorer tous les cues d'un type en une opération.
190. **Cue version history** : garder l'historique des cues pour pouvoir revenir en arrière.

### Loop detection & generation
191. **Loop point detection** : détecter les zones "loopables" (énergie stable, pattern répétitif).
192. **Loop length optimization** : proposer la meilleure longueur de loop (4, 8, 16, 32 beats).
193. **Loop entry/exit smooth** : vérifier que l'entrée/sortie de loop est smooth (pas de click).
194. **Loop beat-aligned** : s'assurer que les loops commencent/finissent exactement sur un beat.
195. **Auto-loop suggestions** : suggérer 3-4 zones de loop par track avec un score de qualité.
196. **Loop crossfade analysis** : analyser si la fin du loop se raccorde bien avec le début.
197. **Infinite loop detection** : détecter les sections qui bouclent naturellement (minimal techno).
198. **Build loop** : suggérer un loop sur le build pour les DJs qui veulent "tenir" le moment.
199. **Drop loop** : suggérer un loop sur le drop principal pour les sets live.
200. **Vocal loop** : suggérer un loop sur un hook vocal.

### Scoring & Confidence
201. **Cue confidence calibration** : calibrer les scores pour que 0.5 soit vraiment "50% sûr".
202. **Energy-weighted confidence** : les cues dans les zones à haute énergie sont plus fiables.
203. **Stem-validated bonus** : +0.15 de confidence si les stems confirment le cue.
204. **Structure-validated bonus** : +0.15 si le cue tombe sur un changement de section confirmé.
205. **Multi-signal agreement bonus** : +0.10 si 4+ signaux sur 6 concordent pour un drop.
206. **User validation tracking** : tracker quels cues les DJs gardent/suppriment pour améliorer le scoring.
207. **Confidence display frontend** : afficher le score de confidence sous chaque cue dans l'UI.
208. **Low confidence warning** : avertir l'utilisateur si un cue a <0.5 de confidence.
209. **Auto-delete low confidence** : option pour ne garder que les cues avec confidence >0.7.
210. **Confidence histogram** : visualiser la distribution des confidences pour diagnostic.

### Performance cue generation
211. **Cue generation parallelism** : calculer les drops, sections, phrases en parallèle.
212. **Early exit** : si on a déjà 8 cues de haute confidence, arrêter la recherche.
213. **Incremental cue generation** : si les stems arrivent après l'analyse initiale, enrichir les cues existants.
214. **Cached cue features** : cacher les features utilisées pour la génération (onset_strength, energy_curve) pour la regénération.
215. **Lightweight cue recalc** : quand l'utilisateur change le BPM, recalculer les snaps sans refaire l'analyse complète.

### Edge cases cues
216. **DJ intro tracks** : tracks avec un long intro sans drop — cue seulement intro/phrase/outro.
217. **DJ tools** : tracks FX/risers — pas de cues structuraux, juste le début.
218. **Mashups** : tracks avec changements abrupts — détecter les transitions comme des cues.
219. **Live recordings** : bruit de foule, applaudissements — filtrer avant l'analyse.
220. **Fading tracks** : tracks qui fade out — détecter le fade et placer l'outro cue avant.
221. **Double drops** : deux drops consécutifs rapprochés (<8 bars) — ne marquer que le premier.
222. **False breakdown** : un court moment calme (<4 bars) qui n'est pas un vrai breakdown.
223. **Build without drop** : un build qui ne résout jamais (tension sans release).
224. **Silence mid-track** : un silence de >1s en milieu de track — ne pas le confondre avec un breakdown.
225. **Glitch/stutter** : patterns glitch/stutter ne sont pas des drops.

### Tests & Validation cues
226. **Cue regression suite** : 100 tracks annotées manuellement pour valider les cues générés.
227. **Cue A/B testing** : comparer les cues v4 vs v5 sur les mêmes tracks.
228. **Genre-specific test sets** : 10 tracks par genre pour valider les templates genre-specific.
229. **Cue precision metric** : % de cues à <500ms de la position "idéale" (annotée).
230. **Cue recall metric** : % de points importants (drops, intros) correctement détectés.
231. **False positive rate** : % de cues inutiles/incorrects générés.
232. **User satisfaction score** : % de cues gardés par les DJs (pas supprimés).
233. **Export compatibility test** : vérifier que les cues exportés s'importent correctement dans Rekordbox/Serato/Traktor.
234. **Round-trip test** : exporter les cues → importer dans DJ software → réimporter dans TrackCue → vérifier l'intégrité.
235. **Performance benchmark** : mesurer le temps de génération de cues pour 100 tracks.

### Cues API
236. **Batch cue creation** : endpoint pour créer plusieurs cues en une seule requête.
237. **Cue order persistence** : sauvegarder l'ordre personnalisé des cues (drag-and-drop du frontend).
238. **Cue lock** : possibilité de verrouiller un cue pour qu'il ne soit pas écrasé par une regénération.
239. **Cue groups** : grouper des cues (ex: "mix points" vs "structural points").
240. **Cue comments** : permettre aux DJs d'ajouter des notes à chaque cue.
241. **Cue timestamps** : tracker quand chaque cue a été créé/modifié.
242. **Cue source tracking** : savoir si un cue est auto-généré ou créé manuellement par le DJ.
243. **Cue sharing** : partager ses cues avec d'autres DJs.
244. **Cue merge** : fusionner les cues auto-générés avec les cues manuels sans doublons.
245. **Cue analytics** : quels types de cues sont les plus utilisés par les DJs.

### Cue UX améliorations
246. **Cue preview** : jouer 2s d'audio à partir du cue point quand on hover.
247. **Cue waveform zoom** : zoomer sur la zone autour du cue dans la waveform.
248. **Cue fine-tune slider** : slider ±100ms pour ajuster finement la position du cue.
249. **Cue type change** : changer le type d'un cue sans le supprimer.
250. **Cue keyboard shortcuts** : raccourcis clavier pour naviguer entre les cues (1-8).

---

## C. STEMS SEPARATION — QUALITÉ & PERFORMANCE (251-400)

### Modèle & Inférence
251. **Upgrade Demucs v4** : passer de mdx_extra_q à Demucs v4 (htdemucs) pour une meilleure qualité.
252. **Hybrid Transformer Demucs** : utiliser le modèle HT (Hybrid Transformer) pour les meilleurs résultats.
253. **6-stem model** : utiliser le modèle à 6 stems (vocals, drums, bass, guitar, piano, other) quand disponible.
254. **Model ensemble** : combiner 2 modèles (mdx_extra + htdemucs) et moyenner les stems.
255. **Stem quality selector** : permettre à l'utilisateur de choisir "rapide" (mdx) vs "qualité" (htdemucs).
256. **Model caching singleton** : charger le modèle Demucs une seule fois, le garder en mémoire.
257. **Model lazy loading** : ne charger le modèle que quand un utilisateur demande une séparation.
258. **Model warmup** : préchauffer le modèle au startup avec un silence de 1s pour éviter le cold start.
259. **ONNX Demucs** : convertir Demucs en ONNX pour 2× speedup CPU.
260. **TensorRT** : si GPU disponible, utiliser TensorRT pour 5-10× speedup.
261. **Quantized model** : quantizer le modèle en INT8 pour réduire la RAM et accélérer.
262. **Mixed precision** : utiliser FP16 pour l'inférence (torch.cuda.amp ou torch.cpu.amp).
263. **Batch stems** : si plusieurs tracks en queue, traiter les inférences en batch.

### Traitement audio
264. **Segment overlap tuning** : optimiser l'overlap (actuellement 0.25) — tester 0.1 pour plus de vitesse.
265. **Segment size tuning** : tester des segments de 20s au lieu de 30s pour réduire la RAM pic.
266. **Segment size adaptive** : segments plus courts pour les machines avec peu de RAM.
267. **Parallel segment processing** : traiter les segments en parallèle sur multi-core.
268. **Streaming separation** : commencer à retourner les stems dès que les premiers segments sont prêts.
269. **RAM monitoring** : surveiller la RAM en continu pendant la séparation, réduire les segments si nécessaire.
270. **Disk swap** : si la RAM est insuffisante, swapper les arrays intermédiaires sur disque.
271. **Chunk decompression** : décompresser l'audio par chunks au lieu de tout en RAM.
272. **Zero-copy** : minimiser les copies mémoire entre les étapes du pipeline.
273. **In-place normalization** : normaliser les stems in-place au lieu de créer des copies.

### Post-traitement stems
274. **Stem normalization** : normaliser chaque stem à -14 LUFS individuellement.
275. **Stem spectral cleanup** : appliquer un filtre passe-bas sur le stem drums (>15kHz inutile).
276. **Vocal de-reverb** : option pour enlever la reverb du stem vocal.
277. **Drum phase alignment** : aligner la phase du stem drums avec le signal original.
278. **Bass mono** : forcer le stem bass en mono (standard DJ/club).
279. **Stem loudness matching** : s'assurer que la somme des stems ≈ l'original en volume.
280. **Stem bleed reduction** : post-traitement pour réduire les fuites entre stems (ex: kick dans le bass stem).
281. **Stem fade** : ajouter un micro-fade (5ms) au début/fin de chaque stem pour éviter les clicks.
282. **Stem silence trim** : trimmer les silences au début/fin de chaque stem.
283. **Stem peak limiting** : limiter les peaks du stem vocal qui dépassent 0dBFS.

### Format & Export stems
284. **Stem format choice** : proposer WAV, FLAC, MP3, AAC pour l'export des stems.
285. **Stem bitrate choice** : 128, 192, 256, 320 kbps pour MP3.
286. **Stem sample rate** : 44100 ou 48000 Hz au choix.
287. **Stem bit depth** : 16-bit ou 24-bit pour WAV/FLAC.
288. **Native Instruments Stems** : export au format NI Stems (.stem.mp4) pour Traktor.
289. **Ableton export** : export compatible avec Ableton Live (WAV + ALS).
290. **DJ software stems** : format compatible avec Rekordbox, Serato, VirtualDJ stems.
291. **Stem ZIP download** : télécharger tous les stems dans un ZIP nommé proprement.
292. **Stem metadata** : inclure les tags dans chaque stem (artiste, titre + " - Drums/Vocals/etc.").
293. **Stem artwork** : inclure la pochette dans chaque stem MP3.

### Analyse des stems
294. **Drum pattern recognition** : classifier le pattern de batterie (4/4, breakbeat, half-time, etc.).
295. **Drum fill detection** : détecter les fills de batterie (transitions).
296. **Kick frequency** : mesurer la fréquence fondamentale du kick pour le mix harmonique.
297. **Snare type** : classifier le type de snare (clap, rimshot, acoustic, electronic).
298. **Hi-hat pattern** : détecter le pattern de hi-hat (closed, open, ride).
299. **Bass frequency range** : mesurer le range fréquentiel du bass (sub, mid-bass, etc.).
300. **Bass movement** : détecter les patterns de bassline (steady, moving, arpeggio).
301. **Vocal pitch range** : mesurer le range de pitch du vocal (tenor, alto, soprano).
302. **Vocal style** : classifier le style vocal (rap, chant, spoken word).
303. **Melody key confirmation** : utiliser le stem "other" pour confirmer/affiner la détection de tonalité.
304. **Melody instrument detection** : identifier les instruments dominants (synth, piano, guitar).
305. **Pad detection** : détecter les pads/textures atmosphériques dans le stem "other".

### Cross-stem analysis
306. **Stems → cue improvement** : utiliser les stems pour affiner les cues (drums enter → intro end).
307. **Stems → BPM improvement** : utiliser le stem drums isolé pour un BPM plus précis.
308. **Stems → structure improvement** : utiliser les changements inter-stems pour détecter les sections.
309. **Stems → energy curve improvement** : recalculer la courbe d'énergie per-stem pour un profil plus riche.
310. **Stems → mix analysis** : analyser la compatibilité de mix sur les stems individuels (bass clash, vocal overlap).
311. **Vocal-free mixing zones** : identifier les zones sans vocals pour le mixage (info essentielle pour DJs).
312. **Drum density curve** : courbe de densité de drums au fil du temps (utile pour les transitions).
313. **Bass energy curve** : courbe d'énergie du bass (utile pour le sound design du mix).
314. **Melody brightness curve** : courbe de brillance mélodique (détecte les builds/risers).
315. **Cross-stem correlation** : mesurer la corrélation entre les stems pour détecter les changements de texture.

### Performance stems
316. **Stem cache** : cacher les stems séparés sur disque pour ne pas les recalculer.
317. **Stem cache TTL** : garder les stems cachés pendant 30 jours (configurable).
318. **Stem cache cleanup** : nettoyer les stems cachés des tracks supprimées.
319. **Stem file size estimation** : estimer la taille des stems avant la séparation.
320. **Stem progress granulaire** : reporter le progress par segment (pas juste 0% → 100%).
321. **Stem cancel** : permettre à l'utilisateur d'annuler une séparation en cours.
322. **Stem retry automatique** : retry 1× si la séparation échoue (OOM transitoire).
323. **Stem priority queue** : les utilisateurs Pro/Premium ont la priorité dans la queue.
324. **Stem concurrency limit** : max 2 séparations simultanées par serveur (RAM).
325. **Stem queue visibility** : montrer la position dans la queue au frontend.

### Stem playback
326. **Stem playback sync** : synchroniser le playback de tous les stems avec le player principal.
327. **Stem volume individual** : volume séparé pour chaque stem (pas juste mute/unmute).
328. **Stem pan** : panning individuel par stem.
329. **Stem solo** : bouton solo (mute tout sauf ce stem).
330. **Stem A/B comparison** : comparer original vs stems en basculant.
331. **Stem EQ per-stem** : EQ individuel sur chaque stem.
332. **Stem FX per-stem** : appliquer des effets individuellement sur chaque stem.
333. **Stem mix export** : exporter le mix personnalisé (volumes/mutes) comme un nouveau fichier audio.
334. **Stem real-time toggle** : mute/unmute sans latence (pre-load tous les stems).
335. **Stem waveform per-stem** : waveform individuelle pour chaque stem.

### Stem analysis features
336. **Stem energy per section** : énergie de chaque stem par section pour un profil détaillé.
337. **Stem presence timeline** : timeline visuelle montrant quand chaque stem est actif.
338. **Stem blend zones** : identifier les zones où 2+ stems sont particulièrement bien mixés.
339. **Stem isolation quality** : score de qualité de séparation (ratio signal/bruit).
340. **Stem artifact detection** : détecter les artefacts de séparation (phasing, warbling).
341. **Stem comparison original** : mesurer la reconstruction error (somme des stems vs original).
342. **Stem spectral leakage** : mesurer les fuites spectrales entre les stems.
343. **Stem frequency overlap** : identifier les zones de chevauchement fréquentiel entre stems.

### Stem UX
344. **Stem processing animation** : animation de progress pendant la séparation (pas juste un spinner).
345. **Stem ETA** : estimation du temps restant basée sur la taille du fichier et la vitesse actuelle.
346. **Stem preview** : preview de 10s de chaque stem avant de télécharger.
347. **Stem comparison slider** : slider A/B pour comparer original vs séparé.
348. **Stem spectral view** : vue spectrogramme par stem.
349. **Stem mini-waveform** : mini-waveform par stem dans les cards de StemsTab.
350. **Stem download progress** : barre de progress pour les téléchargements de stems.

### Stem security & limits
351. **Stem duration limit** : max 10 min par track (protège contre les mixes DJ de 60 min).
352. **Stem file size limit** : max 200 MB par track d'entrée.
353. **Stem quota** : limite par plan (Free: 5 tracks/mois, Pro: 100, Premium: illimité).
354. **Stem rate limit** : max 3 séparations en queue par utilisateur.
355. **Stem storage quota** : max 5 GB de stems cachés par utilisateur (Free), 50 GB (Pro).

### Stem formats avancés
356. **Multi-track stems** : supporter les stems 6-pistes (vocals, drums, bass, guitar, piano, other).
357. **Stem from karaoke** : option pour créer une version karaoké (tout sauf vocals).
358. **Stem from instrumental** : option pour créer une version instrumentale.
359. **Stem from acapella** : option pour extraire uniquement les vocals.
360. **Custom stem groups** : permettre aux DJs de grouper des stems (ex: "rythme" = drums + bass).

### Edge cases stems
361. **Mono input** : gérer correctement les fichiers mono (dupliquer en stereo avant Demucs).
362. **Short tracks** : tracks <30s — utiliser un seul segment au lieu de multiples.
363. **Very long tracks** : tracks >10 min — forcer la troncature ou le traitement par parties.
364. **Low bitrate input** : MP3 128kbps — avertir que la qualité de séparation sera réduite.
365. **Noise-heavy tracks** : tracks avec beaucoup de bruit — adapter le seuil de détection.
366. **Live recordings** : enregistrements live avec bruit de foule — option pour filtrer.
367. **Podcast/speech** : ne pas lancer Demucs sur des fichiers non-musicaux.
368. **Stem of a stem** : empêcher la re-séparation d'un stem déjà séparé.
369. **Silence handling** : si un stem est entièrement silencieux, le signaler au lieu de créer un fichier vide.
370. **Corrupt audio** : détecter et signaler les fichiers audio corrompus avant la séparation.

### Tests stems
371. **Stem quality benchmark** : suite de 20 tracks avec stems de référence pour mesurer SDR/SIR/SAR.
372. **Stem speed benchmark** : mesurer le temps de séparation par durée de track.
373. **Stem RAM benchmark** : mesurer le pic de RAM par durée de track.
374. **Stem regression tests** : vérifier que les mises à jour de modèle n'empirent pas la qualité.
375. **Stem export tests** : vérifier la validité des fichiers stems exportés (decodable, correct length).
376. **Stem round-trip** : séparer → recombiner → comparer à l'original.
377. **Genre-specific stem tests** : tester la qualité par genre (EDM, Hip-Hop, Jazz, etc.).
378. **Stem A/B blind test** : interface pour évaluer la qualité en aveugle.
379. **Stem artifact regression** : tracker les artefacts (clics, distorsion) entre versions.
380. **Stem performance profiling** : profiler CPU/RAM à chaque étape du pipeline.

### Stem infrastructure
381. **Dedicated stem worker** : séparer le worker de stems du worker d'analyse principal.
382. **Stem queue Redis** : utiliser Redis comme broker pour la queue de stems (pas in-memory).
383. **Stem worker auto-scaling** : scaler les workers selon la charge.
384. **Stem GPU pool** : si GPU disponible, dédier un pool pour les séparations.
385. **Stem S3 storage** : stocker les stems sur S3/R2 au lieu du disque local.
386. **Stem CDN** : servir les stems via CDN pour des téléchargements rapides.
387. **Stem pre-warm** : pré-charger le modèle au startup du worker.
388. **Stem health check** : endpoint de santé pour le worker de stems.
389. **Stem metrics** : Prometheus metrics (queue_length, processing_time, error_rate).
390. **Stem alerting** : alertes si le temps de séparation dépasse 3 min ou si la queue grandit.

### Stem ML améliorations
391. **Fine-tuning** : fine-tuner le modèle Demucs sur de l'EDM pour de meilleurs résultats sur ce genre.
392. **Vocal model specialisé** : utiliser un modèle spécialisé pour les vocals (ex: MDX-Net).
393. **Drum model specialisé** : modèle spécialisé pour la séparation de drums.
394. **Post-processing ML** : réseau de post-traitement pour réduire les artefacts.
395. **Quality estimation** : prédire la qualité de séparation avant de lancer (basé sur le spectre du mix).
396. **Adaptive model selection** : choisir le meilleur modèle selon le genre/spectre du track.
397. **Multi-model fusion** : fusionner les résultats de 2+ modèles pour de meilleurs stems.
398. **Self-supervised improvement** : utiliser les corrections des DJs pour améliorer les modèles.
399. **Stem spectrogram mask** : visualiser le masque spectral appliqué par Demucs.
400. **Stem bleeding map** : carte de bleeding inter-stems pour le diagnostic.

---

## D. AUDIO ANALYSIS PIPELINE — ARCHITECTURE & VITESSE (401-550)

### Pipeline global
401. **Pipeline async** : rendre tout le pipeline async avec asyncio pour ne pas bloquer le event loop.
402. **Pipeline stages parallèles** : exécuter BPM, key, energy, structure en parallèle (pas séquentiellement).
403. **Pipeline DAG** : modéliser le pipeline comme un DAG de tâches avec dépendances.
404. **Pipeline streaming** : commencer à retourner les résultats dès qu'une étape est finie.
405. **Pipeline partial results** : si une étape échoue, retourner les résultats des étapes réussies.
406. **Pipeline retry** : retry individuel par étape (pas tout le pipeline).
407. **Pipeline cancel** : possibilité d'annuler une analyse en cours.
408. **Pipeline resume** : possibilité de reprendre une analyse interrompue.
409. **Pipeline priority** : Pro users analysés en priorité.
410. **Pipeline concurrency** : limiter à N analyses simultanées par serveur.

### Audio loading
411. **Audio decode parallel** : décoder l'audio dans un thread séparé pendant que le modèle charge.
412. **Audio memory map** : utiliser mmap pour les gros fichiers au lieu de les charger en RAM.
413. **Audio stream decode** : décoder en streaming (chunks) au lieu de tout d'un coup.
414. **Audio format detection** : détecter le format par magic bytes au lieu de l'extension.
415. **Audio validation rapide** : vérifier rapidement que le fichier est un audio valide avant l'analyse complète.
416. **Audio duration pre-read** : lire la durée sans décoder tout l'audio (header parsing).
417. **Audio resampling GPU** : si GPU disponible, utiliser torchaudio pour le resampling.
418. **Audio normalization** : normaliser le volume avant l'analyse pour des résultats cohérents.
419. **Audio silence trim** : trimmer les silences au début/fin avant l'analyse.
420. **Audio clipping detection** : détecter le clipping et le signaler.

### Feature extraction
421. **Shared feature computation** : calculer les features (STFT, mel-spectrogram, onset_strength) une seule fois et les réutiliser partout.
422. **Feature cache en mémoire** : cacher les features calculées pendant la durée de l'analyse.
423. **Feature cache sur disque** : option pour cacher les features sur disque pour les re-analyses.
424. **STFT pre-computed** : calculer le STFT une seule fois et en dériver mel, chroma, onset, etc.
425. **Mel-spectrogram optimisé** : utiliser `librosa.feature.melspectrogram(S=stft_mag)` au lieu de recalculer le STFT.
426. **Chroma from CQT** : calculer le chroma depuis le CQT pre-computed.
427. **Onset strength from mel** : calculer l'onset strength depuis le mel-spectrogram pre-computed.
428. **Feature matrix contiguous** : s'assurer que toutes les matrices de features sont C-contiguous.
429. **Feature matrix float32** : utiliser float32 au lieu de float64 pour toutes les features.
430. **Feature batch computation** : calculer toutes les features en un seul pass sur l'audio.

### Key detection
431. **Key detection from harmonic** : isoler le composant harmonique avant la détection de clé.
432. **Key detection from stems** : utiliser le stem "other" (sans drums) pour une meilleure détection.
433. **Key by section** : détecter la clé par section pour les tracks qui modulent.
434. **Key modulation detection** : détecter les changements de tonalité (modulations).
435. **Key confidence improvement** : améliorer le score de confiance par cross-validation des 3 méthodes.
436. **Key from bass** : utiliser le stem bass pour confirmer la fondamentale.
437. **Key from melody** : utiliser le stem "other" pour confirmer la mélodie.
438. **Key from Spotify** : cross-valider avec la clé Spotify si disponible.
439. **Key profile EDM** : profils de clé optimisés pour la musique électronique (plus de mineurs).
440. **Key cache** : cacher la clé détectée pour éviter de la recalculer lors d'une re-analyse.

### Energy analysis
441. **Energy curve high-res** : 1 point par beat (au lieu de par frame) pour une courbe plus smooth.
442. **Energy per-stem** : courbe d'énergie séparée par stem pour un profil plus riche.
443. **Energy normalization** : normaliser entre 0 et 1 sur l'ensemble du track.
444. **Energy smoothing** : lisser la courbe d'énergie avec un filtre médian pour réduire le bruit.
445. **Energy percentiles** : calculer les percentiles (p10, p25, p50, p75, p90) pour des seuils adaptatifs.
446. **Danceability score** : calculer un score de danceabilité basé sur la régularité rythmique et l'énergie.
447. **Energy dynamics** : mesurer la dynamique (ratio max/min d'énergie) pour classifier le track.
448. **Energy build rate** : mesurer la vitesse de montée d'énergie dans les builds.
449. **Energy drop rate** : mesurer la vitesse de chute d'énergie dans les breakdowns.
450. **Energy plateau detection** : détecter les plateaux d'énergie (zones stables).

### Loudness analysis
451. **True-peak detection** : mesurer le true-peak (intersample peaks) en plus du peak.
452. **Loudness per section** : mesurer le LUFS par section pour un profil de loudness.
453. **Loudness range DJ** : mesurer le range de loudness utile pour le gain matching en DJ.
454. **ReplayGain calculation** : calculer le gain de replay pour normaliser le volume entre tracks.
455. **Dynamic range compression detection** : détecter si le track est sur-compressé (loudness war).
456. **Crest factor** : mesurer le crest factor (peak/RMS) pour évaluer la dynamique.
457. **LUFS integrated streaming** : calculer le LUFS incrémentalement au lieu de tout en mémoire.
458. **K-weighting filter** : implémenter un vrai filtre K-weighting (ITU-R BS.1770-4) au lieu de l'approximation.
459. **Short-term LUFS** : calculer le LUFS 3-second en plus de l'intégré.
460. **Momentary LUFS** : calculer le LUFS 400ms pour une courbe de loudness fine.

### Spectral analysis
461. **Spectral centroid per section** : brillance par section pour classifier les timbres.
462. **Spectral bandwidth** : mesurer la largeur spectrale pour détecter les transitions.
463. **Spectral rolloff** : fréquence en dessous de laquelle 85% de l'énergie se concentre.
464. **Spectral flatness** : mesure de la "tonalité" vs "bruit" du signal.
465. **Spectral contrast bands** : contraste spectral par bande (6 bandes) pour le profil timbral.
466. **MFCC per section** : coefficients MFCC par section pour la similarité inter-sections.
467. **Chroma deviation** : mesurer la stabilité harmonique (utile pour les modulations).
468. **Sub-bass analysis** : analyse spécifique <60 Hz pour les genres bass-heavy.
469. **High-frequency content** : mesurer le contenu >10 kHz pour détecter les hi-hats/cymbales.
470. **Frequency balance** : ratio low/mid/high pour classifier le mixage.

### Waveform generation
471. **Waveform haute résolution** : 16000 points au lieu de 8000 pour les grands écrans.
472. **Waveform multi-résolution** : générer à 3 résolutions (800, 4000, 16000) pour le zoom.
473. **Waveform RGB** : pré-calculer les couleurs RGB spectrales côté serveur.
474. **Waveform binary format** : endpoint binaire (float16) au lieu de JSON pour 4× moins de données.
475. **Waveform compression** : gzip/brotli les données de waveform.
476. **Waveform streaming** : streamer la waveform pendant le chargement de la page.
477. **Waveform cache CDN** : cacher les waveforms sur CDN avec long TTL.
478. **Waveform delta update** : si seul le zoom change, ne pas re-télécharger toute la waveform.
479. **Waveform web worker** : calculer le rendu de la waveform dans un Web Worker.
480. **Waveform WebGL** : rendu de waveform en WebGL pour les très longues tracks.

### Metadata pipeline
481. **Metadata parallel fetch** : lancer Spotify/MusicBrainz/iTunes/Discogs/Last.fm en parallèle.
482. **Metadata cache Redis** : cacher les résultats metadata dans Redis (pas in-memory).
483. **Metadata fingerprint first** : lancer le fingerprinting AcoustID en premier (identifie le track).
484. **Metadata skip if complete** : si toutes les metadata sont déjà présentes, skip le pipeline.
485. **Metadata incremental** : ne chercher que les métadonnées manquantes.
486. **Metadata timeout par service** : timeout individuel par service (Spotify 5s, MusicBrainz 10s, etc.).
487. **Metadata circuit breaker** : circuit breaker par service (pas global).
488. **Metadata rate limit awareness** : respecter les rate limits de chaque API (MusicBrainz: 1 req/s).
489. **Metadata cache warmup** : pré-charger les métadonnées des tracks en batch.
490. **Metadata conflict resolution** : si Spotify et MusicBrainz donnent des BPM différents, choisir le plus fiable.

### Genre detection
491. **Genre from Spotify** : utiliser le genre Spotify en priorité (quand disponible).
492. **Genre from Discogs** : Discogs a les sous-genres les plus précis pour l'EDM.
493. **Genre from audio features** : classifier le genre depuis les features audio (BPM, énergie, spectre).
494. **Genre ML classifier** : entraîner un petit modèle ML (random forest) sur les features audio.
495. **Genre sub-classification** : classifier en sous-genre (ex: "Progressive Techno" au lieu de juste "Techno").
496. **Genre confidence improvement** : améliorer la confiance en croisant audio + metadata.
497. **Genre profiles update** : mettre à jour les profils de genre avec les BPM trends actuels.
498. **Genre from community** : permettre aux DJs de tagger le genre et utiliser pour le training.
499. **Multi-genre support** : supporter plusieurs genres par track (primary + secondary).
500. **Genre-aware analysis** : adapter les paramètres d'analyse selon le genre détecté.

### Analysis queue
501. **Queue persistent** : utiliser Redis/PostgreSQL comme queue (pas in-memory).
502. **Queue priority** : priority levels (urgent/normal/background).
503. **Queue deduplication** : ne pas re-analyser un track déjà en cours d'analyse.
504. **Queue position API** : endpoint pour connaître la position dans la queue.
505. **Queue ETA** : estimation du temps d'attente basée sur la queue actuelle.
506. **Queue batch scheduling** : si 10+ tracks arrivent, les scheduler en batch.
507. **Queue fair scheduling** : round-robin entre utilisateurs pour éviter qu'un seul user monopolise.
508. **Queue dead letter** : tracks qui échouent 3× vont dans une dead letter queue.
509. **Queue metrics** : longueur, latence, throughput de la queue.
510. **Queue auto-scaling** : ajouter des workers si la queue grandit.

### Analysis caching
511. **Result cache** : cacher les résultats d'analyse complets (pas juste les features).
512. **Incremental analysis** : si BPM corrigé, ne recalculer que les cues/grid.
513. **Feature reuse** : réutiliser les features d'une analyse précédente.
514. **Cache invalidation** : invalider le cache si le fichier audio change.
515. **Cache compression** : compresser les résultats cachés (JSON gzip).
516. **Cache TTL** : TTL de 30 jours pour les résultats d'analyse.
517. **Cache warmup** : pré-analyser les tracks populaires.
518. **Cache hit rate** : mesurer le taux de cache hit.
519. **Cache eviction** : LRU eviction quand le cache est plein.
520. **Cache distributed** : cache distribué pour multi-serveur.

### Monitoring & Observabilité
521. **Analysis duration histogram** : temps d'analyse par track (Prometheus histogram).
522. **Analysis success rate** : % d'analyses réussies vs échouées.
523. **Analysis error categories** : catégoriser les erreurs (OOM, timeout, corrupt file, etc.).
524. **Analysis throughput** : tracks analysés par heure/jour.
525. **Analysis bottleneck identification** : identifier quelle étape prend le plus de temps.
526. **Analysis resource usage** : CPU, RAM, IO par analyse.
527. **Analysis queue depth** : profondeur de la queue en temps réel.
528. **Analysis SLA** : temps d'analyse p50, p95, p99.
529. **Analysis alerting** : alertes si p95 > 60s ou error rate > 5%.
530. **Analysis dashboard** : dashboard Grafana pour le monitoring.

### Tests pipeline
531. **Pipeline integration tests** : test end-to-end avec de vrais fichiers audio.
532. **Pipeline unit tests** : test de chaque étape individuellement.
533. **Pipeline regression tests** : suite de 50 tracks avec résultats attendus.
534. **Pipeline performance tests** : benchmark de vitesse pour chaque étape.
535. **Pipeline memory tests** : mesurer le pic de RAM par étape.
536. **Pipeline stress tests** : 100 analyses simultanées.
537. **Pipeline chaos tests** : simuler des pannes (OOM, timeout, network) et vérifier le recovery.
538. **Pipeline accuracy tests** : mesurer la précision BPM/key/cues par genre.
539. **Pipeline compatibility tests** : tester avec tous les formats audio supportés.
540. **Pipeline version tests** : comparer les résultats entre versions du pipeline.

### Infrastructure pipeline
541. **Worker dédié analyse** : séparer le worker d'analyse du serveur API.
542. **Worker pool** : pool de workers avec load balancing.
543. **Worker health check** : endpoint de santé pour chaque worker.
544. **Worker auto-restart** : restart automatique si un worker crash.
545. **Worker graceful shutdown** : terminer l'analyse en cours avant de shutdown.
546. **Worker resource limits** : limiter CPU/RAM par worker (cgroups).
547. **Worker isolation** : isoler chaque analyse dans un processus séparé.
548. **Worker GPU scheduling** : scheduler les analyses GPU-intensive sur les workers GPU.
549. **Worker preemption** : preempt les analyses de basse priorité si un Pro user arrive.
550. **Worker metrics** : CPU/RAM/IO par worker en temps réel.

---

## E. FRONTEND AUDIO — WAVEFORM & PLAYER (551-700)

### WaveSurferPlayer performance
551. **Web Worker pour RGB** : calculer computeRGBWaveform() dans un Web Worker pour ne pas bloquer le UI.
552. **OffscreenCanvas** : utiliser OffscreenCanvas dans le Worker pour le pré-rendu.
553. **Waveform WebGL renderer** : remplacer le canvas 2D par WebGL pour 10× plus de barres.
554. **Waveform LOD (Level of Detail)** : résolution adaptative selon le zoom level.
555. **Waveform virtualisée** : ne rendre que la partie visible de la waveform.
556. **Waveform tile-based** : diviser la waveform en tiles et ne charger que les visibles.
557. **Waveform lazy decode** : ne décoder l'AudioBuffer que quand le track est sélectionné.
558. **Waveform peak cache** : cacher les peaks calculés dans IndexedDB pour un chargement instantané.
559. **Waveform pre-render** : pré-rendre la waveform pendant le téléchargement (progressive).
560. **Animation RAF optimisé** : ne pas re-render si le playhead n'a pas bougé de >1px.

### Canvas rendering
561. **Batch canvas operations** : grouper les opérations canvas (beginPath → fill une seule fois).
562. **Avoid canvas state changes** : minimiser les changements de fillStyle (grouper par couleur).
563. **Canvas pool** : pool de canvas pré-créés pour éviter les allocations.
564. **Canvas resolution adaptative** : réduire la résolution sur les petits écrans/basse batterie.
565. **requestIdleCallback** : utiliser requestIdleCallback pour le pré-rendu non-critique.
566. **Canvas composite operations** : utiliser globalCompositeOperation pour les effets au lieu de re-dessiner.
567. **ImageBitmap** : utiliser createImageBitmap pour le transfert efficace vers le canvas.
568. **Canvas layering** : séparer la waveform, les cues, et le playhead sur des canvas différents.
569. **Canvas dirty region** : ne redessiner que la région "dirty" (autour du playhead).
570. **Canvas double buffering** : double buffer pour éviter le flickering.

### Audio playback
571. **AudioContext singleton** : un seul AudioContext pour toute l'app.
572. **Audio preload** : pré-charger les premiers 10s du track suivant dans la playlist.
573. **Audio crossfade** : crossfade automatique entre les tracks.
574. **Audio gapless** : playback gapless pour les playlists.
575. **Audio offline** : cacher les tracks pour le playback offline (Service Worker).
576. **Audio buffer pool** : pool de buffers audio pré-alloués.
577. **Audio decode workers** : décoder l'audio dans des Web Workers.
578. **Audio low-latency** : configurer AudioContext pour basse latence (interactive mode).
579. **Audio sample-accurate** : scheduling sample-accurate pour les loops et cues.
580. **Audio resampling** : resampling client-side si le taux d'échantillonnage diffère.

### Cue point display
581. **Cue markers SVG optimisé** : utiliser un seul `<svg>` avec des `<line>` au lieu de `<div>` par cue.
582. **Cue click hitbox** : hitbox de 44px pour les cues (même si le marker est petit).
583. **Cue drag smooth** : smooth drag avec requestAnimationFrame et debounce de la sauvegarde.
584. **Cue snap visual** : feedback visuel quand un cue snappe sur un beat/downbeat.
585. **Cue tooltip optimisé** : tooltip lazy-rendered au hover (pas dans le DOM par défaut).
586. **Cue zoom detail** : montrer plus de détails quand on zoome sur un cue.
587. **Cue color picker** : color picker inline pour changer la couleur d'un cue.
588. **Cue type icon** : icône distinctive par type de cue (drop=⬇, intro=▶, etc.).
589. **Cue position display** : afficher la position en bars:beats en plus du temps.
590. **Cue keyboard navigation** : Tab/Shift+Tab pour naviguer entre les cues.

### Beatgrid display
591. **Beat lines performance** : ne dessiner que les downbeats dans l'overview (pas tous les beats).
592. **Beat lines LOD** : afficher tous les beats quand zoomé, seulement les downbeats quand dézoomé.
593. **Beat phase indicator** : indicateur visuel de la phase (1-2-3-4) dans le player.
594. **Beat counter** : compteur de bars/beats live pendant le playback.
595. **Beat flash** : flash subtil sur chaque downbeat pendant le playback.
596. **Beat confidence display** : colorer les beats selon la confiance (vert=sûr, jaune=incertain).
597. **Beat grid edit mode** : mode d'édition de la grid directement sur la waveform.
598. **Beat grid drag** : possibilité de drag la grid pour ajuster la phase.
599. **Beat grid zoom** : zoom fluide sur la grid avec scroll.
600. **Beat grid export** : exporter la grid au format Rekordbox/Serato.

### Stems UI
601. **Stems waveform stacked** : waveforms empilées (drums/bass/vocals/other) en vue stack.
602. **Stems spectro view** : spectrogramme par stem pour le diagnostic.
603. **Stems volume fader** : fader de volume vertical pour chaque stem (style console).
604. **Stems pan knob** : knob de panning rotatif par stem.
605. **Stems meter** : VU-mètre par stem en temps réel.
606. **Stems color coding** : couleurs cohérentes (drums=jaune, bass=violet, vocals=rouge, other=bleu).
607. **Stems mini-player** : mini-player avec les 4 stems visibles.
608. **Stems keyboard shortcuts** : D=mute drums, B=mute bass, V=mute vocals, O=mute other.
609. **Stems touch gestures** : swipe pour muter/démuter sur mobile.
610. **Stems A/B toggle** : bouton pour basculer rapidement entre original et stems.

### EQ & FX performance
611. **EQ Web Audio optimisé** : utiliser IIRFilterNode au lieu de BiquadFilterNode pour moins de latence.
612. **EQ preset switching** : changement de preset sans clic (cross-fade 10ms).
613. **FX chain GPU** : utiliser AudioWorklet (pas ScriptProcessorNode) pour les effets.
614. **FX parameter smoothing** : smooth les changements de paramètres pour éviter les clics.
615. **FX wet/dry mix** : contrôle wet/dry pour chaque effet.
616. **FX chain order** : possibilité de réordonner les effets dans la chaîne.
617. **FX bypass** : bypass individuel par effet.
618. **FX save preset** : sauvegarder des presets d'effets personnalisés.
619. **FX recall** : rappeler un preset sauvegardé.
620. **FX automation** : possibilité de programmer des changements d'effets dans le temps.

### Harmonic wheel & Mix
621. **Camelot wheel SVG optimisé** : utiliser un seul SVG au lieu de multiples éléments DOM.
622. **Camelot wheel interactive** : cliquer sur une case pour filtrer les tracks compatibles.
623. **Camelot wheel highlight** : mettre en surbrillance les clés compatibles avec la clé actuelle.
624. **Camelot wheel animation** : animation de rotation quand on change de track.
625. **Mix compatibility real-time** : calculer la compatibilité pendant le browse (pas au clic).
626. **Mix BPM range visualization** : visualiser le range de BPM compatible sur un slider.
627. **Mix energy matching** : visualiser le match d'énergie entre les tracks.
628. **Mix transition suggestions** : suggérer le meilleur point de mix entre deux tracks.
629. **Mix key shift** : montrer si un pitch shift serait bénéfique pour le mix.
630. **Mix history** : garder l'historique des mixes pour analyse.

### Energy Flow display
631. **Energy Flow SVG optimisé** : limiter à 50 tracks, ajouter scroll horizontal.
632. **Energy Flow canvas** : utiliser canvas au lieu de SVG pour >50 tracks.
633. **Energy Flow zoom** : zoom horizontal sur une section de la flow.
634. **Energy Flow color gradient** : gradient de couleur basé sur le niveau d'énergie.
635. **Energy Flow smooth transitions** : animations smooth quand l'ordre des tracks change.
636. **Energy Flow click-to-play** : cliquer sur un point pour jouer le track.
637. **Energy Flow tooltip** : tooltip avec les détails du track au hover.
638. **Energy Flow BPM overlay** : overlay du BPM sur la courbe d'énergie.
639. **Energy Flow key overlay** : overlay de la clé Camelot sur la courbe.
640. **Energy Flow export** : exporter le graphique d'énergie en image.

### Stats Tab
641. **Stats calculation memoized** : toutes les stats dans useMemo pour éviter les recalculs.
642. **Stats lazy loading** : ne calculer les stats que quand l'onglet est visible.
643. **Stats chart virtualized** : virtualiser les grands charts (>100 tracks).
644. **Stats chart SVG vs Canvas** : utiliser canvas pour les charts avec beaucoup de points.
645. **Stats export** : exporter les statistiques en CSV ou PDF.
646. **Stats comparison** : comparer les stats entre deux playlists ou deux périodes.
647. **Stats BPM distribution** : histogramme de la distribution des BPM dans la bibliothèque.
648. **Stats key distribution** : pie chart de la distribution des clés.
649. **Stats energy distribution** : histogramme de la distribution d'énergie.
650. **Stats genre distribution** : répartition des genres dans la bibliothèque.

### Performance générale frontend
651. **React.memo sur tous les composants tabs** : StemsTab, CuesTab, BeatgridTab, MixTab, etc.
652. **useCallback sur tous les handlers** : éviter les re-renders des composants enfants.
653. **Suspense lazy loading** : lazy loader tous les tabs avec React.lazy.
654. **Tab keep-alive** : garder les tabs montés (display:none) au lieu de les démonter.
655. **Intersection Observer** : ne rendre les composants hors-écran que quand ils sont visibles.
656. **Virtual list tracks** : virtualiser la liste de tracks (react-window ou tanstack-virtual).
657. **Debounce search** : debounce 300ms sur la recherche de tracks.
658. **Throttle scroll** : throttle les events de scroll à 16ms (60fps).
659. **Image lazy loading** : `loading="lazy"` sur toutes les pochettes.
660. **Font preload** : preload les fonts critiques (mono pour le BPM display).

### State management
661. **React Query optimistic updates** : updates optimistes pour les opérations fréquentes (cue add/delete).
662. **React Query invalidation ciblée** : invalider seulement les queries affectées, pas toutes.
663. **React Query prefetch** : prefetch le track suivant dans la liste.
664. **Zustand pour le player state** : store Zustand pour le state du player (position, playing, volume).
665. **Zustand pour les stems** : store séparé pour le state des stems (muted, volumes).
666. **Context splitting** : séparer les contexts (player, auth, tracks, stems) pour éviter les re-renders globaux.
667. **Selector pattern** : utiliser des selectors pour ne re-rendre que les composants qui dépendent du state changé.
668. **Immutable state** : utiliser immer ou structuredClone pour les mutations de state.
669. **State persistence** : persister le state du player (volume, EQ) dans localStorage.
670. **State sync** : synchroniser le state entre les onglets du navigateur.

### Network
671. **API response compression** : s'assurer que Brotli/GZip est actif sur toutes les réponses.
672. **API batch endpoints** : endpoint batch pour charger les analyses de plusieurs tracks en une requête.
673. **API pagination** : pagination pour les tracks avec >100 résultats.
674. **API GraphQL** : envisager GraphQL pour éviter le over-fetching des analyses.
675. **API WebSocket** : WebSocket pour les mises à jour en temps réel du player.
676. **API cache headers** : Cache-Control + ETag sur les endpoints d'analyse (données stables).
677. **API conditional requests** : If-None-Match pour les analyses (304 Not Modified).
678. **API response streaming** : streamer les grandes réponses (waveform, analyse complète).
679. **SSE reconnection** : reconnexion automatique du SSE avec exponential backoff.
680. **SSE heartbeat** : heartbeat toutes les 15s pour maintenir la connexion.

### Bundle & loading
681. **Code splitting par tab** : chaque tab dans son propre chunk.
682. **Tree shaking** : vérifier que les imports inutiles sont eliminés.
683. **Dynamic import** : import() pour les libs lourdes (d3, recharts) seulement quand nécessaires.
684. **Bundle analysis** : analyser le bundle avec next-bundle-analyzer.
685. **Minification** : vérifier que le JS est correctement minifié.
686. **CSS purge** : purger les classes Tailwind inutilisées.
687. **Image optimization** : next/image pour toutes les images.
688. **Font subsetting** : subsetter les fonts pour ne garder que les glyphes utilisés.
689. **Preload critical resources** : preload le JS/CSS du dashboard.
690. **Service Worker caching** : cache-first pour les assets statiques.

### Accessibility audio
691. **Screen reader BPM** : announcer le BPM détecté au screen reader.
692. **Keyboard player controls** : Space=play/pause, ←→=seek, ↑↓=volume.
693. **Cue keyboard nav** : 1-8 pour sauter aux cues.
694. **Stem keyboard controls** : D/B/V/O pour muter les stems.
695. **ARIA live regions** : aria-live sur le progress d'analyse et le BPM.
696. **Focus management** : focus automatique sur le player quand un track est sélectionné.
697. **Reduced motion** : respecter prefers-reduced-motion pour les animations.
698. **High contrast** : mode high contrast pour la waveform.
699. **Audio descriptions** : texte alternatif pour les visualisations audio.
700. **Tab order** : ordre de tabulation logique dans le dashboard.

---

## F. QUALITÉ AUDIO & TRAITEMENT SIGNAL (701-800)

### Analyse avancée
701. **Groove analysis** : mesurer le groove (swing, shuffle) du track.
702. **Syncopation detection** : détecter les patterns syncopés.
703. **Polyrhythm detection** : détecter les superpositions de rythmes.
704. **Meter detection** : détecter le mètre (4/4, 3/4, 6/8, 7/8, etc.).
705. **Time signature changes** : détecter les changements de mesure mid-track.
706. **Tempo stability score** : score 0-1 de stabilité du tempo.
707. **Rhythmic complexity** : mesurer la complexité rythmique (simple vs complexe).
708. **Swing amount** : quantifier le swing en pourcentage (50%=straight, 66%=swing).
709. **Ghost note detection** : détecter les ghost notes dans les patterns de batterie.
710. **Drum pattern similarity** : comparer les patterns de batterie entre tracks pour le matching.

### Analyse harmonique avancée
711. **Chord progression detection** : détecter la progression d'accords.
712. **Chord per beat** : un accord par beat ou par bar.
713. **Chord quality** : major, minor, diminished, augmented, suspended, etc.
714. **Harmonic rhythm** : vitesse de changement des accords.
715. **Tension/release mapping** : mapper les moments de tension et de résolution harmonique.
716. **Modulation paths** : détecter les modulations et leur type (relative, parallel, etc.).
717. **Melodic contour** : direction de la mélodie (ascending, descending, arch, etc.).
718. **Harmonic density** : nombre de notes simultanées (polyphonie).
719. **Scale detection** : détecter l'échelle utilisée (majeur, mineur, dorien, etc.).
720. **Key affinity matrix** : matrice de compatibilité harmonique entre tous les tracks.

### Analyse timbrale
721. **Brightness per section** : brillance spectrale par section.
722. **Warmth score** : score de "chaleur" du son (ratio low-mid / high).
723. **Roughness score** : rugosité perceptuelle du son.
724. **Sharpness score** : netteté perceptuelle.
725. **Spaciousness** : mesure de l'espace stéréo.
726. **Density** : densité sonore (nombre d'éléments simultanés).
727. **Texture type** : classification de texture (smooth, gritty, airy, etc.).
728. **Instrument detection** : identification des instruments principaux.
729. **Synthesis type** : classification du type de synthèse (analogique, FM, wavetable, etc.).
730. **Production quality score** : score de qualité de production basé sur les critères audio.

### Analyse dynamique
731. **Transient detection** : détecter les transitoires pour la précision des cues.
732. **Attack time** : mesurer le temps d'attaque des transitoires.
733. **Release time** : mesurer le temps de release.
734. **Envelope following** : suivre l'enveloppe dynamique du signal.
735. **Compression detection** : détecter le niveau de compression appliqué.
736. **Limiter detection** : détecter le limiting (brickwall).
737. **Clipping detection** : détecter les clips numériques.
738. **Noise floor** : mesurer le plancher de bruit.
739. **SNR** : ratio signal/bruit.
740. **Dynamic range classification** : classifier (compressed, normal, dynamic).

### Mix analysis
741. **Transition point scoring** : scorer les meilleurs points de transition entre deux tracks.
742. **Key transition path** : calculer le chemin harmonique optimal entre les clés.
743. **BPM transition feasibility** : évaluer si un mix entre deux BPM est possible (max ±8%).
744. **Energy curve matching** : matcher les courbes d'énergie pour un mix smooth.
745. **Bass frequency clash** : détecter les clashes de fréquences basses entre deux tracks.
746. **Vocal overlap prediction** : prédire les zones de chevauchement vocal.
747. **Drum pattern matching** : matcher les patterns de drums pour un transition beat-matched.
748. **Mix-in point suggestion** : suggérer le meilleur point d'entrée pour le mix.
749. **Mix-out point suggestion** : suggérer le meilleur point de sortie.
750. **Mix duration suggestion** : suggérer la durée optimale de la transition.

### Fingerprinting
751. **Audio fingerprint V2** : fingerprint basé sur les chroma + onset pour la déduplication.
752. **Remix detection** : détecter si un track est un remix d'un autre (similarité de fingerprint).
753. **Bootleg detection** : détecter les bootlegs/mashups (fingerprint partiel).
754. **Version detection** : détecter les différentes versions (radio, extended, club) d'un même track.
755. **Cover detection** : détecter les covers (même structure harmonique, timbre différent).
756. **Sample detection** : détecter les samples utilisés dans un track.
757. **Duplicate by audio** : détecter les doublons basés sur l'audio (pas le filename).
758. **Fingerprint storage** : stocker les fingerprints de manière compacte en DB.
759. **Fingerprint indexing** : indexer les fingerprints pour des recherches rapides.
760. **Fingerprint cross-reference** : cross-référencer avec les bases de données externes (AcoustID).

### Analyse perceptuelle
761. **Perceived loudness** : loudness perçue (pas juste les LUFS).
762. **Perceptual EQ** : courbe d'EQ perçue (avec pondération Fletcher-Munson).
763. **Mood detection** : détecter l'humeur (happy, sad, energetic, chill, dark, euphoric).
764. **Arousal-valence mapping** : mapper chaque track sur le modèle arousal-valence.
765. **Danceability ML** : modèle ML pour prédire la danceabilité.
766. **Energy perceived** : énergie perçue (pas juste RMS).
767. **Build anticipation** : mesurer l'anticipation dans les builds (tension perceptuelle).
768. **Drop impact** : mesurer l'impact perceptuel des drops.
769. **Groove feel** : classifier le feeling du groove (bouncy, driving, hypnotic, etc.).
770. **Vibe classification** : classifier le vibe global du track pour le tagging.

### Optimisations DSP
771. **FFT plan caching** : cacher les plans FFT pour les tailles récurrentes.
772. **Power-of-2 FFT** : s'assurer que les tailles FFT sont des puissances de 2.
773. **Windowing optimisé** : pré-calculer les fenêtres (Hann, Hamming) une seule fois.
774. **Overlap-add** : utiliser overlap-add pour le traitement par blocs.
775. **Decimation** : décimer le signal avant les analyses basse-fréquence.
776. **Upsampling** : sur-échantillonner pour les analyses haute-fréquence critiques.
777. **Filter design** : concevoir les filtres une seule fois avec scipy.signal.
778. **Biquad cascade** : utiliser des cascades de biquads pour les filtres complexes.
779. **Circular buffer** : utiliser des buffers circulaires pour le traitement en temps réel.
780. **SIMD operations** : utiliser les opérations SIMD de numpy pour le traitement vectorisé.

### Audio quality
781. **Lossless preference** : préférer les sources lossless (FLAC, WAV) pour l'analyse.
782. **Bitrate detection** : détecter le bitrate effectif (des MP3 320 peuvent être upsampled de 128).
783. **Codec detection** : détecter le codec utilisé (VBR/CBR/ABR).
784. **Spectral hole detection** : détecter les trous spectraux (signe d'un encodage lossy).
785. **Sample rate optimization** : analyser à la résolution optimale pour chaque feature.
786. **Dither** : ajouter du dither lors de la conversion de bit depth.
787. **Anti-aliasing** : filtres anti-aliasing corrects lors du resampling.
788. **Phase coherence** : vérifier la cohérence de phase stereo.
789. **DC offset removal** : enlever le DC offset avant l'analyse.
790. **Normalize peaks** : normaliser les peaks à -1dBFS avant l'analyse.

### Edge cases audio
791. **Multi-channel** : gérer correctement les fichiers multi-canaux (5.1, 7.1).
792. **Variable bitrate** : gérer les fichiers VBR correctement.
793. **DRM protected** : détecter et refuser les fichiers DRM.
794. **Corrupt headers** : gérer les fichiers avec des headers corrompus.
795. **Truncated files** : détecter et gérer les fichiers tronqués.
796. **Embedded artwork** : ne pas confondre l'artwork intégré avec des données audio.
797. **ID3v2 padding** : skip le padding ID3v2 correctement.
798. **Gapless info** : lire les infos de gapless playback (iTunes, LAME).
799. **ReplayGain tags** : lire/écrire les tags ReplayGain.
800. **BPM tag writeback** : écrire le BPM détecté dans les tags ID3 du fichier.

---

## G. EXPORT DJ — COMPATIBILITÉ & PRÉCISION (801-880)

### Rekordbox
801. **Rekordbox XML v2** : supporter le format Rekordbox XML 2.0.
802. **Rekordbox memory cues** : exporter correctement les memory cues (pas juste les hot cues).
803. **Rekordbox loops** : exporter les loops avec la longueur en beats.
804. **Rekordbox grid** : exporter le beat grid avec le BPM et l'offset.
805. **Rekordbox waveform data** : exporter les données de waveform si possible.
806. **Rekordbox playlists** : exporter la structure de playlists.
807. **Rekordbox color mapping** : mapper précisément les couleurs TrackCue → Rekordbox.
808. **Rekordbox rating** : exporter le rating (1-5 stars).
809. **Rekordbox comments** : exporter les commentaires/notes.
810. **Rekordbox key format** : exporter la clé au format Rekordbox (Open Key notation).

### Serato
811. **Serato DJ markers V2** : supporter le format Serato DJ Markers V2.
812. **Serato hot cues** : exporter les hot cues avec les bonnes couleurs.
813. **Serato loops** : exporter les loops avec les positions précises.
814. **Serato BPM lock** : exporter le BPM avec le flag "locked".
815. **Serato grid** : exporter le beat grid avec les downbeat positions.
816. **Serato crate structure** : exporter les crates/playlists Serato.
817. **Serato color palette** : mapper vers la palette de 16 couleurs Serato.
818. **Serato overview waveform** : exporter les données de waveform overview.
819. **Serato Flip** : supporter l'export des données Serato Flip si applicable.
820. **Serato stem support** : export compatible Serato DJ Pro stems.

### Traktor
821. **Traktor NML v2** : exporter au format NML version courante.
822. **Traktor cue points** : exporter les cue points avec les types corrects.
823. **Traktor loops** : exporter les loops avec les bonnes positions.
824. **Traktor beat grid** : exporter le grid avec le BPM et l'offset de phase.
825. **Traktor stripe** : exporter les données de waveform stripe.
826. **Traktor key** : exporter la clé au format Traktor (Open Key notation).
827. **Traktor playlists** : exporter la structure de playlists Traktor.
828. **Traktor musical key** : mapper les clés vers le format Musical Key de Traktor.
829. **Traktor comments** : exporter les commentaires.
830. **Traktor favorites** : exporter les favoris.

### VirtualDJ
831. **VDJ database** : exporter vers la base VirtualDJ.
832. **VDJ POI** : exporter les Points of Interest (cues VDJ).
833. **VDJ automix** : exporter les points de mix automatique.
834. **VDJ stem data** : export compatible VDJ stems.
835. **VDJ skin compatibility** : données compatibles avec les skins VDJ.

### Import DJ
836. **Import Rekordbox XML** : importer correctement les cues, grid, playlists depuis Rekordbox.
837. **Import Serato markers** : parser les marqueurs Serato depuis les tags des fichiers.
838. **Import Traktor NML** : parser le NML Traktor complètement.
839. **Import VirtualDJ** : importer depuis la base VirtualDJ.
840. **Import Engine DJ** : supporter l'import depuis Denon Engine DJ.
841. **Import conflict resolution** : si les cues importés sont différents des cues existants, proposer merge/replace/skip.
842. **Import validation** : valider que les positions importées sont dans la durée du track.
843. **Import batch** : importer une collection complète en batch.
844. **Import progress** : progress bar pour les imports volumineux.
845. **Import undo** : possibilité d'annuler un import.

### Cross-platform
846. **Bidirectional sync** : sync bidirectionnel avec Rekordbox/Serato/Traktor.
847. **Incremental sync** : ne synchroniser que les changements depuis la dernière sync.
848. **Conflict detection** : détecter les conflits de cues/grid entre les logiciels.
849. **Format auto-detect** : détecter automatiquement le format du fichier importé.
850. **USB export** : exporter directement vers une clé USB au format Rekordbox/Engine.
851. **Cloud sync** : synchroniser via le cloud entre les instances.
852. **Migration assistant** : assistant pour migrer d'un logiciel DJ à un autre.
853. **Export history** : garder l'historique des exports pour traçabilité.
854. **Export validation** : valider la cohérence de l'export avant de l'écrire.
855. **Export rollback** : possibilité de revenir à l'export précédent.

### Export audio
856. **Stem export NI format** : export au format Native Instruments STEM (.stem.mp4).
857. **Mixdown export** : exporter un mixdown avec les volumes/mutes de stems appliqués.
858. **Normalized export** : exporter avec le volume normalisé.
859. **Format conversion** : convertir entre formats audio (FLAC→MP3, WAV→AAC).
860. **Batch export** : exporter plusieurs tracks en batch.
861. **Export with tags** : inclure tous les tags TrackCue dans l'export audio.
862. **Export with cues in tags** : écrire les cues dans les tags du fichier audio (Serato markers).
863. **Export with BPM in tags** : écrire le BPM dans les tags ID3.
864. **Export with key in tags** : écrire la clé dans les tags.
865. **Export with artwork** : inclure la pochette dans les fichiers exportés.

### Export PDF/printable
866. **Setlist PDF** : exporter la setlist en PDF avec BPM, clé, cues.
867. **Cue sheet PDF** : exporter une feuille de cues par track.
868. **Waveform printable** : exporter la waveform en haute résolution pour impression.
869. **Track analysis report** : rapport complet d'analyse en PDF.
870. **Library stats PDF** : rapport statistique de la bibliothèque en PDF.

### Qualité des exports
871. **Export position precision** : précision milliseconde pour les positions de cues.
872. **Export BPM precision** : précision à 2 décimales pour le BPM.
873. **Export color accuracy** : conversion de couleur précise entre les palettes.
874. **Export encoding** : UTF-8 correct pour les caractères spéciaux (accents, émojis).
875. **Export XML validation** : valider le XML généré avec un schema.
876. **Export file size** : optimiser la taille des fichiers d'export.
877. **Export speed** : exporter 1000 tracks en <5 secondes.
878. **Export integrity check** : vérifier l'intégrité après écriture.
879. **Export backup** : backup automatique avant un export qui écrase.
880. **Export logging** : logger chaque export pour le debugging.

---

## H. MACHINE LEARNING & INTELLIGENCE (881-950)

### Apprentissage des corrections
881. **BPM correction learning** : apprendre des corrections BPM des DJs pour améliorer la détection.
882. **Cue correction learning** : apprendre des cues ajoutés/supprimés pour améliorer la génération.
883. **Key correction learning** : apprendre des corrections de clé.
884. **Genre correction learning** : apprendre des corrections de genre.
885. **User preference model** : modèle de préférences par utilisateur (aime les cues sur les drops vs les breaks).
886. **Genre model per user** : adapter la détection de genre aux préférences du DJ.
887. **Feedback collection** : interface pour noter la qualité des résultats d'analyse.
888. **A/B testing framework** : framework pour tester de nouvelles versions du pipeline.
889. **Model versioning** : versionner les modèles pour les rollbacks.
890. **Online learning** : mise à jour incrémentale des modèles avec les corrections.

### ML nouvelles features
891. **Vocal style classifier** : classifier le style vocal (rap, sing, spoken, fx).
892. **Instrument classifier** : classifier les instruments dominants.
893. **Production era classifier** : classifier l'ère de production (80s, 90s, 2000s, 2010s, 2020s).
894. **Club vs Radio classifier** : classifier si le track est un edit club ou radio.
895. **DJ tool classifier** : classifier si c'est un DJ tool (intro, acapella, FX).
896. **Crowd reaction predictor** : prédire la réaction de la foule (energy builder, peak time, cool down).
897. **Set position predictor** : prédire la position idéale dans un set (opener, peak, closer).
898. **Transition type recommender** : recommander le type de transition (blend, cut, echo, filter).
899. **BPM transition feasibility** : prédire si un mix entre deux BPM est smooth.
900. **Key transition path** : calculer le chemin harmonique optimal dans un set.

### Recommendation engine
901. **Next track recommendation** : recommander le prochain track basé sur BPM/key/energy.
902. **Set builder** : construire un set complet automatiquement avec les transitions.
903. **Genre flow** : suggestion de flow de genres pour un set (ex: deep house → tech house → techno).
904. **Energy arc** : suggestion d'arc d'énergie pour un set de 60 min.
905. **Key journey** : planifier un voyage harmonique à travers les clés.
906. **Mood journey** : planifier un voyage d'humeurs pour un set.
907. **Crowd-adaptive** : adapter les suggestions au type de crowd (warm-up, peak, after).
908. **Similar track finder** : trouver les tracks les plus similaires par audio features.
909. **Discovery mode** : suggérer des tracks de la bibliothèque jamais/rarement jouées.
910. **Crate builder** : construire des crates thématiques automatiquement.

### NLP & Metadata intelligence
911. **Title parsing** : parser les titres de tracks (artiste, featuring, remix, version).
912. **Remix artist extraction** : extraire l'artiste du remix depuis le titre.
913. **Featuring detection** : détecter les featurings depuis le titre.
914. **Version detection** : détecter la version (Original Mix, Extended, Radio Edit, etc.).
915. **Label detection** : détecter le label depuis les metadata ou les patterns de nom.
916. **Release year estimation** : estimer l'année de sortie si pas dans les metadata.
917. **Artist similarity** : calculer la similarité entre artistes basée sur leur discographie.
918. **Tag suggestion** : suggérer des tags basés sur les features audio.
919. **Description generation** : générer une description du track pour les notes DJ.
920. **Setlist name suggestion** : suggérer des noms pour les sets/playlists.

### Computer Vision (artwork)
921. **Artwork color extraction** : extraire la palette de couleurs de la pochette.
922. **Artwork style classification** : classifier le style de la pochette (minimalist, photo, abstract, etc.).
923. **Artwork text extraction** : OCR sur la pochette pour extraire le label/titre.
924. **Artwork similarity** : détecter les pochettes similaires (même artiste/label).
925. **Artwork generation** : générer une pochette placeholder basée sur les features audio.
926. **Artwork upscale** : upscaler les pochettes basse résolution avec un modèle ML.
927. **Artwork crop** : crop intelligent de la pochette pour différentes tailles.
928. **Artwork background** : extraire la couleur dominante pour le background du player.
929. **Artwork mood** : corréler le mood de la pochette avec le mood audio.
930. **Artwork CDN optimization** : servir les pochettes en WebP/AVIF avec CDN.

### Audio generation
931. **Loop generation** : générer des loops à partir d'un track (pour le beatmatching practice).
932. **Mashup suggestion** : suggérer des mashups basés sur la compatibilité audio.
933. **Transition generation** : générer des transitions automatiques entre deux tracks.
934. **Intro generation** : générer un intro DJ à partir d'un track (16 bars avec montée progressive).
935. **Outro generation** : générer un outro DJ (16 bars avec descente progressive).
936. **Acapella extraction** : extraction de vocals haute qualité pour les mashups.
937. **Instrumental extraction** : extraction instrumentale propre.
938. **Beat repeat** : générer des effets de beat repeat sur les drops.
939. **Filter sweep generation** : générer des sweeps de filtre pour les transitions.
940. **Riser generation** : générer des risers synthétiques pour les builds.

### Model serving
941. **Model serving API** : servir les modèles ML via une API séparée.
942. **Model A/B testing** : tester de nouveaux modèles sur un subset d'utilisateurs.
943. **Model rollback** : possibilité de rollback un modèle en cas de régression.
944. **Model monitoring** : monitorer les performances des modèles en production.
945. **Model caching** : cacher les modèles en mémoire pour éviter les cold starts.
946. **Model batching** : battre les inférences pour plusieurs tracks.
947. **Model GPU serving** : servir les modèles sur GPU quand disponible.
948. **Model quantization** : quantizer les modèles pour réduire la taille et la latence.
949. **Model distillation** : distiller les gros modèles en plus petits pour la production.
950. **Model ensemble serving** : servir des ensembles de modèles pour de meilleurs résultats.

---

## I. SÉCURITÉ, LIMITES & PRODUCTION (951-1000)

### Sécurité audio
951. **Audio file scanning** : scanner les fichiers audio pour les malwares intégrés.
952. **Audio bomb detection** : détecter les "audio bombs" (fichiers qui se décompressent en >10 GB).
953. **Audio metadata sanitization** : sanitizer les metadata pour éviter les injections.
954. **Audio path traversal** : s'assurer que les paths audio ne peuvent pas traverser le filesystem.
955. **Audio file size limit** : limiter la taille maximale des fichiers (500 MB).
956. **Audio duration limit** : limiter la durée maximale (60 min).
957. **Audio format whitelist** : accepter seulement les formats autorisés (MP3, WAV, FLAC, OGG, M4A, AIFF).
958. **Audio processing sandbox** : isoler le traitement audio dans un sandbox (conteneur ou processus).
959. **Audio temp file cleanup** : nettoyer les fichiers temporaires après l'analyse.
960. **Audio upload rate limit** : limiter le nombre d'uploads par utilisateur par heure.

### Limites & quotas
961. **Analysis quota par plan** : Free: 50/mois, Pro: 500, Premium: illimité.
962. **Concurrent analysis limit** : max 3 analyses simultanées par utilisateur.
963. **Storage quota** : quota de stockage audio par utilisateur par plan.
964. **Bandwidth quota** : quota de bande passante pour les téléchargements de stems.
965. **API rate limiting** : rate limits par endpoint d'analyse.
966. **Stem quota tracking** : tracker et afficher l'utilisation des quotas de stems.
967. **Quota alert** : alerter l'utilisateur quand il approche de son quota.
968. **Quota reset** : reset automatique des quotas en début de mois.
969. **Quota upgrade CTA** : CTA pour upgrader le plan quand le quota est atteint.
970. **Admin quota override** : possibilité pour les admins de modifier les quotas.

### Production hardening
971. **Circuit breaker par service** : circuit breaker individuel pour chaque service externe.
972. **Graceful degradation** : si l'analyse partielle échoue, retourner ce qui a réussi.
973. **Health check audio workers** : endpoint de santé pour les workers d'analyse.
974. **Readiness probe** : probe de readiness qui vérifie que les modèles sont chargés.
975. **Liveness probe** : probe de liveness qui vérifie que le worker répond.
976. **Resource limits** : limites CPU/RAM par conteneur d'analyse.
977. **Auto-scaling** : auto-scaling des workers selon la charge.
978. **Blue-green deployment** : déploiement blue-green pour les mises à jour des modèles.
979. **Canary releases** : releases canary pour tester les nouvelles versions du pipeline.
980. **Feature flags** : feature flags pour activer/désactiver des features d'analyse.

### Monitoring production
981. **Analysis latency P50/P95/P99** : métriques de latence d'analyse.
982. **Analysis error rate** : taux d'erreur par étape du pipeline.
983. **Analysis throughput** : nombre d'analyses par heure/jour.
984. **Queue depth** : profondeur de la queue d'analyse.
985. **Worker utilization** : % d'utilisation des workers.
986. **Model inference time** : temps d'inférence des modèles ML.
987. **Audio load time** : temps de chargement des fichiers audio.
988. **Feature extraction time** : temps d'extraction des features.
989. **Stem separation time** : temps de séparation des stems.
990. **Cache hit rate** : taux de cache hit pour les analyses/features.

### Data & Storage
991. **Analysis result compression** : compresser les résultats d'analyse en DB (JSONB compressed).
992. **Waveform binary storage** : stocker les waveforms en binaire au lieu de JSON.
993. **Beat positions compressed** : stocker les beat positions en delta-encoding compressé.
994. **Feature cleanup** : nettoyer les features temporaires après l'analyse.
995. **Orphan stems cleanup** : nettoyer les stems des tracks supprimées.
996. **DB vacuum** : VACUUM ANALYZE régulier sur les tables d'analyse.
997. **Partitioning** : partitionner la table TrackAnalysis par date pour les performances.
998. **Archive old analyses** : archiver les analyses >1 an vers un stockage froid.
999. **Backup verification** : vérifier régulièrement l'intégrité des backups.
1000. **Disaster recovery** : plan de disaster recovery pour les données d'analyse.

---

## RÉSUMÉ PAR PRIORITÉ

| Priorité | Catégorie | Points | Impact |
|----------|-----------|--------|--------|
| **P0** | BPM précision & robustesse | 1-25, 46-55 | Fondation de tout le pipeline |
| **P0** | Stems qualité & performance | 251-270, 316-325 | Feature clé, très lente |
| **P0** | Pipeline parallélisme | 401-410 | Vitesse globale ×3-5 |
| **P1** | Cue intelligence | 101-125, 156-165 | Valeur principale du produit |
| **P1** | Waveform performance | 551-570 | UX fluide |
| **P1** | Export DJ compatibility | 801-845 | Adoption par les DJs |
| **P2** | Analyse avancée | 701-770 | Différenciation compétitive |
| **P2** | ML features | 881-920 | Moat technologique |
| **P2** | Frontend audio UX | 581-650 | Polish du produit |
| **P3** | Production hardening | 951-1000 | Scalabilité |
| **P3** | Audio generation | 931-940 | Features futures |
