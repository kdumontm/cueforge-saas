// @ts-nocheck
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload, Music2, Loader2, CheckCircle2, XCircle, Download, Trash2, Clock,
  Activity, Hash, Disc3, ChevronDown, ChevronUp, ExternalLink, User, Tag,
  Calendar, AlbumIcon, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Search, MoreVertical, Zap, Wand2, Type, Disc, RefreshCw, Star, Filter,
  Grid3X3, List as ListIcon, Check, X, Music, Headphones, ArrowUpDown, Folder,
  ZoomIn, ZoomOut, CheckSquare, Square, AlertTriangle, Sparkles, Image,
  SlidersHorizontal, ListMusic, Copy, BarChart3, Compass, FolderSearch, Lightbulb, PenSquare, LayoutGrid, ChevronLeft, ChevronRight, Palette, Eye, Layers, GitBranch, RotateCcw, Settings, Shield, Lock, Unlock, Crown
} from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, exportRekordbox, listTracks, deleteTrack, getTrack, createCuePoint, deleteCuePoint, getTrackCuePoints, getCurrentUser } from '@/lib/api';
import type { Track, CuePoint } from '@/types';
import { CUE_COLORS as CUE_COLOR_MAP } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────
const CAMELOT_WHEEL: Record<string, string> = {
  'C': '8B', 'Am': '8A', 'G': '9B', 'Em': '9A', 'D': '10B', 'Bm': '10A',
  'A': '11B', 'F#m': '11A', 'E': '12B', 'C#m': '12A', 'B': '1B', 'G#m': '1A',
  'F#': '2B', 'Ebm': '2A', 'Db': '3B', 'Bbm': '3A', 'Ab': '4B', 'Fm': '4A',
  'Eb': '5B', 'Cm': '5A', 'Bb': '6B', 'Gm': '6A', 'F': '7B', 'Dm': '7A',
  'C#': '3B', 'D#m': '2A', 'G#': '4B', 'A#': '6B', 'D#': '5B',
};

function toCamelot(key: string | null | undefined): string {
  if (!key) return '\u2014';
  return CAMELOT_WHEEL[key] || key;
}

function isMixCompatible(trackA, trackB) {
  if (!trackA || !trackB || !trackA.analysis || !trackB.analysis) return false;
  const bpmA = trackA.analysis.bpm;
  const bpmB = trackB.analysis.bpm;
  if (!bpmA || !bpmB) return false;
  const bpmRatio = Math.abs(bpmA - bpmB) / Math.max(bpmA, bpmB);
  const halfRatio = Math.abs(bpmA - bpmB * 2) / Math.max(bpmA, bpmB * 2);
  const doubleRatio = Math.abs(bpmA * 2 - bpmB) / Math.max(bpmA * 2, bpmB);
  const bpmOk = bpmRatio < 0.06 || halfRatio < 0.06 || doubleRatio < 0.06;
  if (!bpmOk) return false;
  const keyA = toCamelot(trackA.analysis.key);
  const keyB = toCamelot(trackB.analysis.key);
  if (keyA === '\u2014' || keyB === '\u2014') return bpmOk;
  return getCompatibleKeys(keyA).includes(keyB);
}

function getCompatibleKeys(camelotKey) {
  if (!camelotKey) return [];
  const match = camelotKey.match(/(\d+)([AB])/);
  if (!match) return [];
  const num = parseInt(match[1]);
  const letter = match[2];
  const other = letter === 'A' ? 'B' : 'A';
  return [
    camelotKey,
    num + other,
    ((num % 12) + 1) + letter,
    ((num - 2 + 12) % 12 + 1) + letter,
  ];
}

function msToTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function generateCuePointsFromAnalysis(analysis: any): Array<{label: string; position: number; color: string}> {
  const SECTION_COLORS: Record<string, string> = {
    INTRO: '#ef4444', DROP: '#f97316', PHRASE: '#22c55e',
    OUTRO: '#f472b6', BUILDUP: '#eab308', BREAKDOWN: '#8b5cf6',
    VERSE: '#06b6d4', CHORUS: '#ec4899', BRIDGE: '#a855f7'
  };
  const cues: Array<{label: string; position: number; color: string}> = [];
  if (analysis?.sections?.length > 0) {
    const labelCounts: Record<string, number> = {};
    analysis.sections.forEach((sec: any) => {
      const baseLabel = (sec.label || 'CUE').toUpperCase();
      labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
      const count = labelCounts[baseLabel];
      const label = count > 1 ? baseLabel + ' ' + count : baseLabel;
      cues.push({
        label,
        position: sec.start,
        color: SECTION_COLORS[baseLabel] || '#6b7280'
      });
    });
  } else if (analysis?.drop_positions?.length > 0) {
    analysis.drop_positions.forEach((ms: number, i: number) => {
      cues.push({
        label: 'DROP ' + (i + 1),
        position: ms / 1000,
        color: '#f97316'
      });
    });
  }
  return cues;
}

function energyToRating(energy: number | null | undefined): string {
  if (energy == null) return '\u2014';
  return String(Math.min(10, Math.max(1, Math.round(energy * 10))));
}

function energyToLabel(energy: number | null | undefined): string {
  if (energy == null) return 'N/A';
  if (energy < 0.25) return 'Calm';
  if (energy < 0.5) return 'Moderate';
  if (energy < 0.75) return 'Energetic';
  return 'Intense';
}

function energyToColor(energy: number | null | undefined): string {
  if (energy == null) return 'rgb(107,114,128)';
  if (energy < 0.25) return 'rgb(34,197,94)';
  if (energy < 0.5) return 'rgb(234,179,8)';
  if (energy < 0.75) return 'rgb(249,115,22)';
  return 'rgb(239,68,68)';
}

const CAMELOT_MAP: Record<string, string> = {
  'C': '8B', 'Cm': '5A', 'C#': '3B', 'C#m': '12A',
  'D': '10B', 'Dm': '7A', 'D#': '5B', 'D#m': '2A',
  'E': '12B', 'Em': '9A', 'F': '7B', 'Fm': '4A',
  'F#': '2B', 'F#m': '11A', 'G': '9B', 'Gm': '6A',
  'G#': '4B', 'G#m': '1A', 'A': '11B', 'Am': '8A',
  'A#': '6B', 'A#m': '3A', 'B': '1B', 'Bm': '10A',
  'Db': '3B', 'Dbm': '12A', 'Eb': '5B', 'Ebm': '2A',
  'Gb': '2B', 'Gbm': '11A', 'Ab': '4B', 'Abm': '1A',
  'Bb': '6B', 'Bbm': '3A',
};

function keyCamelot(key: string): string {
  return CAMELOT_MAP[key] || '';
}

function mixScore(key1: string, bpm1: number, key2: string, bpm2: number) {
  const bpmDiff = Math.abs(bpm1 - bpm2);
  let bpmS = bpmDiff <= 0.5 ? 50 : bpmDiff <= 2 ? 45 : bpmDiff <= 5 ? 35 : Math.max(0, 25 - bpmDiff);
  const c1 = CAMELOT_MAP[key1] || '', c2 = CAMELOT_MAP[key2] || '';
  let keyS = 25;
  if (c1 && c2) {
    if (c1 === c2) keyS = 50;
    else {
      const n1 = parseInt(c1), l1 = c1.slice(-1), n2 = parseInt(c2), l2 = c2.slice(-1);
      if (l1 === l2) { const d = Math.min(Math.abs(n1 - n2), 12 - Math.abs(n1 - n2)); keyS = d === 1 ? 45 : d === 2 ? 30 : 15; }
      else if (n1 === n2) keyS = 40;
      else keyS = 15;
    }
  }
  const total = bpmS + keyS;
  return { total, verdict: total >= 90 ? 'Perfect' : total >= 75 ? 'Great' : total >= 60 ? 'Good' : total >= 40 ? 'OK' : 'Risky' };
}

async function filterBand(buf: AudioBuffer, type: BiquadFilterType, freq: number, freq2?: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, buf.length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (freq2) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = freq; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq2; lp.Q.value = 0.7;
    src.connect(hp).connect(lp).connect(ctx.destination);
  } else {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.7;
    src.connect(f).connect(ctx.destination);
  }
  src.start(0);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

async function computeRGBWaveform(buf: AudioBuffer, numBars = 1200): Promise<{r:number,g:number,b:number}[]> {
  const [lowBand, midBand, highBand] = await Promise.all([
    filterBand(buf, 'lowpass', 200),
    filterBand(buf, 'bandpass', 200, 4000),
    filterBand(buf, 'highpass', 4000),
  ]);
  const segLen = Math.floor(buf.length / numBars);
  const rawColors: {lo:number,mi:number,hi:number}[] = [];
  let maxLo = 0, maxMi = 0, maxHi = 0;
  for (let i = 0; i < numBars; i++) {
    const s = i * segLen, e = Math.min(s + segLen, buf.length);
    let le = 0, me = 0, he = 0;
    for (let j = s; j < e; j++) { le += lowBand[j]*lowBand[j]; me += midBand[j]*midBand[j]; he += highBand[j]*highBand[j]; }
    const n = e - s || 1;
    le = Math.sqrt(le/n); me = Math.sqrt(me/n); he = Math.sqrt(he/n);
    maxLo = Math.max(maxLo, le); maxMi = Math.max(maxMi, me); maxHi = Math.max(maxHi, he);
    rawColors.push({ lo: le, mi: me, hi: he });
  }
  return rawColors.map(c => {
    const lo = c.lo / (maxLo || 1);
    const mi = c.mi / (maxMi || 1);
    const hi = c.hi / (maxHi || 1);
    const r = Math.min(255, Math.floor(lo * 220 + mi * 60));
    const g = Math.min(255, Math.floor(mi * 200 + hi * 50 + lo * 25));
    const b = Math.min(255, Math.floor(hi * 240 + mi * 30));
    return { r: Math.max(25, r), g: Math.max(15, g), b: Math.max(35, b) };
  });
}

const TR: Record<string, Record<string, string>> = {
  fr: {
    titre: 'Titre', artiste: 'Artiste', album: 'Album', genre: 'Genre', annee: 'Année', commentaire: 'Commentaire',
    annuler: 'Annuler', ajouter: 'Ajouter', enregistrer: 'Enregistrer', supprimer: 'Supprimer',
    notes_dj: 'Notes DJ', date_ajout: "Date d'ajout", duree: 'Durée', note: 'Note',
    toutes_cles: 'Toutes les clés', tous_genres: 'Tous les genres', trier_par: 'Trier par',
    reinit_filtres: 'Réinitialiser les filtres', effacer: 'Effacer', reinitialiser: 'Réinitialiser',
    appliquer_track: 'Appliquer au morceau', connecter_audio: 'Connecter Audio',
    taux: 'Taux', profondeur: 'Profondeur',
    fx_bientot: 'Traitement FX temps réel bientôt disponible',
    select_effet_params: "Sélectionner un effet pour ajuster les paramètres",
    assistant_mix: 'Assistant de Mix', playlists: 'Playlists',
    pas_cue_points: 'Pas encore de cue points. Analysez le morceau ou ajoutez manuellement.',
    select_effet: "Sélectionner un effet",
    cles_compatibles: 'Clés compatibles (Camelot)',
    morceaux_compatibles: 'Morceaux compatibles',
    aucun_compatible: 'Aucun morceau compatible trouvé dans votre bibliothèque.',
    ajoutez_analyses: "Ajoutez plus de morceaux analysés pour voir les suggestions d'harmonic mixing.",
    pas_playlists: 'Pas encore de playlists',
    flux_energie: "Énergie Flow", debut: 'Début', fin: 'Fin',
    playlists_intelligentes: 'Playlists intelligentes', auto_generees: 'Auto-générées',
    ajoutez_playlists: 'Ajoutez des morceaux pour générer des playlists intelligentes',
    par_energie: 'Par énergie', par_bpm: 'Par BPM', par_genre: 'Par genre',
    aucun_joue: 'Aucun morceau joué', aucune_donnee_genre: 'Aucune donnée de genre disponible',
    analysez_flux: "Analysez les morceaux pour voir le flux d'énergie",
    bpm_bas: 'BPM bas', bpm_eleve: 'BPM élevé',
    total_morceaux: 'Total morceaux', analyses: 'Analysés', bpm_moyen: 'BPM moyen',
    cle_principale: 'Clé principale', energie_moyenne: 'Énergie moyenne',
    aucun_doublon: 'Aucun doublon trouvé. Cliquez sur scanner pour vérifier.',
    artistes: 'Artistes', distribution_genres: 'Distribution des genres',
    distribution_bpm: 'Distribution des BPM', distribution_cles: 'Distribution des clés (Camelot)',
    repartition_genres: 'Répartition des genres', aucune_donnee_genre2: 'Aucune donnée de genre',
    distribution_cles2: 'Distribution des clés', aucune_donnee_cle: 'Aucune donnée de clé',
    champ: 'Champ', nouvelle_valeur: 'Nouvelle valeur',
    regles_harmonic: 'Règles de mix harmonique',
    aucun_match_cles: 'Aucun morceau ne correspond à ces clés dans votre bibliothèque.',
    chemin_dossier: 'Chemin du dossier', parcourir: 'Parcourir',
    fichiers_surveilles: 'Fichiers surveillés', auto_importes: 'Auto importés',
    parametres: 'Paramètres', formats_supportes: 'Formats supportés',
    ajouter_morceaux: 'Ajouter plus de morceaux',
    modifier_metadata: 'Modifier les métadonnées', exporter_xml: 'Exporter XML',
    exporter_rekordbox: 'Exporter tout vers Rekordbox', exporter_serato: 'Exporter tout vers Serato',
    exporter_traktor: 'Exporter tout vers Traktor', exporter_virtualdj: 'Exporter tout vers VirtualDJ',
    exporter_csv: 'Exporter tout en CSV',
    ajouter_cue: '+ Ajouter Cue', en_lecture: 'En lecture',
    energie: 'ÉNERGIE', morceaux_tab: 'MORCEAUX',
    haute_energie: 'Haute énergie', couleur_cue: 'Couleur du Cue',
    rechercher: 'Rechercher par titre, artiste...',
    selectionne: 'sélectionné', deselect: 'Désélect.',
    analyser_audio: 'Analyser Audio', raccourcis_clavier: 'Raccourcis clavier',
    historique: 'HISTORIQUE', statistiques: 'Statistiques de la collection',
    morceaux_label: 'Morceaux', genres_label: 'Genres',
    aucun_historique: 'Aucun historique encore.',
    clique_track: 'Cliquez sur un morceau dans la liste pour commencer',
    mix_tab: 'MIX', cues_tab: 'CUES', eq_tab: 'EQ', fx_tab: 'FX',
    playlists_tab: 'PLAYLISTS', historique_tab: 'HISTORIQUE',
    recherche_cours: 'Recherche en cours...', infos_actuelles: 'Informations actuelles',
    batch_edit: 'Modification en lot', scanner_doublons: 'Scanner les doublons',
    importer_dossier: 'Importer un dossier',
    double_click_edit: 'Double-cliquez pour modifier',
    not_analyzed: 'Non analysé',
    filter_sort: 'Filtrer & Trier',
    quick_label: 'Rapide :',
    expand_panel: 'Agrandir le panneau',
    no_cue_points: 'Pas encore de cue points. Analysez le morceau ou ajoutez manuellement.',
    copy_txt: 'Copier TXT',
    analyzing: 'Analyse en cours...',
    upload: 'Importer',
    export_btn: 'Exporter',
    export_csv: 'Exporter CSV',
    all: 'Tous',
    filters: 'Filtres',
    auto_analyze_on: 'Auto-Analyse ON',
    auto_analyze_off: 'Auto-Analyse OFF',
    search_placeholder: 'Rechercher...',
    no_tracks: 'Aucun morceau',
    select_all: 'Tout sélectionner',
    deselect_all: 'Tout désélectionner',
    delete_selected: 'Supprimer la sélection',
    tracks_selected: 'morceaux sélectionnés',
    loading: 'Chargement...',
    keyboard_shortcuts: 'Raccourcis clavier',
    close: 'Fermer',
    stats: 'Statistiques',
  },
  en: {
    titre: 'Title', artiste: 'Artist', album: 'Album', genre: 'Genre', annee: 'Year', commentaire: 'Comment',
    annuler: 'Cancel', ajouter: 'Add', enregistrer: 'Save', supprimer: 'Delete',
    notes_dj: 'DJ Notes', date_ajout: 'Date Added', duree: 'Duration', note: 'Rating',
    toutes_cles: 'All Keys', tous_genres: 'All Genres', trier_par: 'Sort by',
    reinit_filtres: 'Clear filters', effacer: 'Clear', reinitialiser: 'Reset',
    appliquer_track: 'Apply to Track', connecter_audio: 'Connect Audio',
    taux: 'Rate', profondeur: 'Depth',
    fx_bientot: 'Real-time FX processing coming soon',
    select_effet_params: 'Select an effect to adjust parameters',
    assistant_mix: 'Mix Assistant', playlists: 'Playlists',
    pas_cue_points: 'No cue points yet. Analyze the track or add manually.',
    select_effet: 'Select an effect',
    cles_compatibles: 'Compatible Keys (Camelot)',
    morceaux_compatibles: 'Matching Tracks',
    aucun_compatible: 'No compatible tracks found in your library.',
    ajoutez_analyses: 'Add more analyzed tracks to see harmonic mixing suggestions.',
    pas_playlists: 'No playlists yet',
    flux_energie: 'Energy Flow', debut: 'Start', fin: 'End',
    playlists_intelligentes: 'Smart Playlists', auto_generees: 'Auto-generated',
    ajoutez_playlists: 'Add tracks to generate smart playlists',
    par_energie: 'By Energy', par_bpm: 'By BPM', par_genre: 'By Genre',
    aucun_joue: 'No tracks played yet', aucune_donnee_genre: 'No genre data available',
    analysez_flux: 'Analyze tracks to see energy flow',
    bpm_bas: 'Low BPM', bpm_eleve: 'High BPM',
    total_morceaux: 'Total Tracks', analyses: 'Analyzed', bpm_moyen: 'Avg BPM',
    cle_principale: 'Top Key', energie_moyenne: 'Avg Energy',
    aucun_doublon: 'No duplicates found. Click scan to check.',
    artistes: 'Artists', distribution_genres: 'Genre Distribution',
    distribution_bpm: 'BPM Distribution', distribution_cles: 'Key Distribution (Camelot)',
    repartition_genres: 'Genre Breakdown', aucune_donnee_genre2: 'No genre data',
    distribution_cles2: 'Key Distribution', aucune_donnee_cle: 'No key data',
    champ: 'Field', nouvelle_valeur: 'New Value',
    regles_harmonic: 'Harmonic Mixing Rules',
    aucun_match_cles: 'No tracks in library match these keys.',
    chemin_dossier: 'Folder Path', parcourir: 'Browse',
    fichiers_surveilles: 'Files Watching', auto_importes: 'Auto Imported',
    parametres: 'Settings', formats_supportes: 'Supported formats',
    ajouter_morceaux: 'Add more tracks',
    modifier_metadata: 'Edit Metadata', exporter_xml: 'Export XML',
    exporter_rekordbox: 'Export All to Rekordbox', exporter_serato: 'Export All to Serato',
    exporter_traktor: 'Export All to Traktor', exporter_virtualdj: 'Export All to VirtualDJ',
    exporter_csv: 'Export All to CSV',
    ajouter_cue: '+ Add Cue', en_lecture: 'Now Playing',
    energie: 'ENERGY', morceaux_tab: 'TRACKS',
    haute_energie: 'High Energy', couleur_cue: 'Cue Color',
    rechercher: 'Search by title, artist...',
    selectionne: 'selected', deselect: 'Deselect',
    analyser_audio: 'Analyze Audio', raccourcis_clavier: 'Keyboard Shortcuts',
    historique: 'HISTORY', statistiques: 'Collection Statistics',
    morceaux_label: 'Tracks', genres_label: 'Genres',
    aucun_historique: 'No history yet.',
    clique_track: 'Click a track in the list to start',
    mix_tab: 'MIX', cues_tab: 'CUES', eq_tab: 'EQ', fx_tab: 'FX',
    playlists_tab: 'PLAYLISTS', historique_tab: 'HISTORY',
    recherche_cours: 'Searching...', infos_actuelles: 'Current information',
    batch_edit: 'Batch Edit', scanner_doublons: 'Scan Duplicates',
    importer_dossier: 'Import Folder',
    double_click_edit: 'Double-click to edit',
    not_analyzed: 'Not analyzed',
    filter_sort: 'Filter & Sort',
    quick_label: 'Quick:',
    expand_panel: 'Expand panel',
    no_cue_points: 'No cue points yet. Analyze the track',
    copy_txt: 'Copy TXT',
    analyzing: 'Analyzing...',
    upload: 'Upload',
    export_btn: 'Export',
    export_csv: 'Export CSV',
    all: 'All',
    filters: 'Filters',
    auto_analyze_on: 'Auto-Analyze ON',
    auto_analyze_off: 'Auto-Analyze OFF',
    search_placeholder: 'Search...',
    no_tracks: 'No tracks',
    select_all: 'Select all',
    deselect_all: 'Deselect all',
    delete_selected: 'Delete selected',
    tracks_selected: 'tracks selected',
    loading: 'Loading...',
    keyboard_shortcuts: 'Keyboard shortcuts',
    close: 'Close',
    stats: 'Stats',
  },
};

// ── Main useDashboard Hook ────────────────────────────────────────────────

export function useDashboard() {
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('cueforge_token') : null;
  const token = getToken();

  // ── Core Track State ──
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── Toast Notifications ──
  const [toasts, setToasts] = useState<{id: number; msg: string; type: 'success' | 'error' | 'info'}[]>([]);
  const toastIdRef = useRef(0);

  // ── Player State ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // ── Upload State ──
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{current: number; total: number} | null>(null);

  // ── Analysis State ──
  const [analyzing, setAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');

  // ── UI State ──
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Sorting & Filtering ──
  const [sortBy, setSortBy] = useState<'date' | 'bpm' | 'key' | 'title' | 'energy' | 'genre' | 'duration' | 'rating'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterBpmMin, setFilterBpmMin] = useState<number>(0);
  const [filterBpmMax, setFilterBpmMax] = useState<number>(999);
  const [filterEnergyMin, setFilterEnergyMin] = useState<number>(0);
  const [filterEnergyMax, setFilterEnergyMax] = useState<number>(100);
  const [filterKey, setFilterKey] = useState<string>('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [filterRating, setFilterRating] = useState<number>(0);
  const [bpmMin, setBpmMin] = useState<number>(0);
  const [bpmMax, setBpmMax] = useState<number>(300);
  const [showFilters, setShowFilters] = useState(false);
  const [showCompatibleOnly, setShowCompatibleOnly] = useState(false);

  // ── Column Filters ──
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [colFilterTitle, setColFilterTitle] = useState('');
  const [colFilterArtist, setColFilterArtist] = useState('');
  const [colFilterGenre, setColFilterGenre] = useState('');
  const [colFilterKey, setColFilterKey] = useState('');
  const [colFilterBpmMin, setColFilterBpmMin] = useState('');
  const [colFilterBpmMax, setColFilterBpmMax] = useState('');
  const [colFilterEnergyMin, setColFilterEnergyMin] = useState('');
  const [colFilterEnergyMax, setColFilterEnergyMax] = useState('');

  // ── Column Visibility ──
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    artist: true, album: false, genre: true, bpm: true, key: true, energy: true, duration: true
  });
  const [showColSettings, setShowColSettings] = useState(false);

  // ── Context Menu ──
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; track: Track } | null>(null);

  // ── Metadata Panel ──
  const [metadataPanel, setMetadataPanel] = useState<Track | null>(null);
  const [metadataSuggestions, setMetadataSuggestions] = useState<Record<string, string> | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [organizerTrack, setOrganizerTrack] = useState<Track | null>(null);

  // ── Waveform & Zoom ──
  const [zoomLevel, setZoomLevel] = useState(1);
  const [waveformReady, setWaveformReady] = useState(false);
  const [waveformZoom, setWaveformZoom] = useState<number>(1);
  const [waveformTheme, setWaveformTheme] = useState<string>('neon');

  // ── Loop State ──
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);

  // ── User & Plan Features ──
  const [currentUser, setCurrentUser] = useState<{id:number;email:string;name?:string;subscription_plan:string;is_admin:boolean;tracks_today:number}|null>(null);
  const [planFeatures, setPlanFeatures] = useState<Record<string, Record<string, boolean>>>({});
  const [featureLabels, setFeatureLabels] = useState<Record<string, string>>({});

  // ── Cue Points & Editing ──
  const [showAddCue, setShowAddCue] = useState(false);
  const [newCueName, setNewCueName] = useState('');
  const [newCuePos, setNewCuePos] = useState('');
  const [newCueType, setNewCueType] = useState('hot_cue');
  const [newCueColor, setNewCueColor] = useState('blue');

  // ── Mix Panel ──
  const [showMixPanel, setShowMixPanel] = useState(false);
  const [bpmTapTimes, setBpmTapTimes] = useState<number[]>([]);
  const [bpmTapResult, setBpmTapResult] = useState<number | null>(null);
  const [showBpmTap, setShowBpmTap] = useState(false);

  // ── Play History ──
  const [playHistory, setPlayHistory] = useState<{trackId: number; timestamp: number}[]>([]);
  const [mixLog, setMixLog] = useState<{fromId: number; toId: number; score: number; timestamp: number}[]>([]);

  // ── Track Metadata ──
  const [trackNotes, setTrackNotes] = useState<Record<number, string>>({});
  const [trackRatings, setTrackRatings] = useState<Record<number, number>>({});
  const [trackColors, setTrackColors] = useState<Record<number, string>>({});

  // ── Sets & Lists ──
  const [setLists, setSetLists] = useState<{name: string; trackIds: number[]}[]>([]);
  const [activeSetList, setActiveSetList] = useState<number>(-1);
  const [newSetListName, setNewSetListName] = useState('');

  // ── Favorites ──
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // ── EQ & FX ──
  const [eqLow, setEqLow] = useState(50);
  const [eqMid, setEqMid] = useState(50);
  const [eqHigh, setEqHigh] = useState(50);
  const [eqValues, setEqValues] = useState({ low: 0, mid: 0, high: 0 });
  const [activeFx, setActiveFx] = useState('');
  const [fxWet, setFxWet] = useState(30);
  const [fxParams, setFxParams] = useState<Record<string, number>>({ reverb: 0, delay: 0, filterLP: 20000, filterHP: 20, flanger: 0, phaser: 0, distortion: 0, compressor: 0 });
  const [eqConnected, setEqConnected] = useState(false);

  // ── Master Controls ──
  const [masterGain, setMasterGain] = useState(80);
  const [crossfader, setCrossfader] = useState(50);
  const [pitchShift, setPitchShift] = useState(0);

  // ── UI Features ──
  const [showHistory, setShowHistory] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [showBeatGrid, setShowBeatGrid] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── Language ──
  const [lang, setLang] = useState<string>('fr');
  const t = (k: string) => TR[lang]?.[k] || k;

  // ── Bulk Operations ──
  const [showBulkGenre, setShowBulkGenre] = useState(false);
  const [bulkGenreValue, setBulkGenreValue] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // ── Auto-Analysis ──
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  // ── Smart Playlists & Advanced ──
  const [showSmartPlaylist, setShowSmartPlaylist] = useState(false);
  const [smartRules, setSmartRules] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState('rekordbox');
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchField, setBatchField] = useState('genre');
  const [batchValue, setBatchValue] = useState('');
  const [showCamelotWheel, setShowCamelotWheel] = useState(false);
  const [selectedWheelKey, setSelectedWheelKey] = useState<string | null>(null);
  const [showPlanAdmin, setShowPlanAdmin] = useState(false);
  const [showWatchFolder, setShowWatchFolder] = useState(false);
  const [watchFolderPath, setWatchFolderPath] = useState('');

  // ── Inline Editing ──
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditField, setInlineEditField] = useState('');
  const [inlineEditValue, setInlineEditValue] = useState('');

  // ── DJ Set Timer ──
  const [setTimerDuration, setSetTimerDuration] = useState(3600);
  const [setTimerRemaining, setSetTimerRemaining] = useState(0);
  const [setTimerRunning, setSetTimerRunning] = useState(false);
  const [showSetTimer, setShowSetTimer] = useState(false);

  // ── Tap Tempo ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState<Record<string, boolean>>({});
  const [showTapTempo, setShowTapTempo] = useState(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [tapBpm, setTapBpm] = useState<number>(0);

  // ── Session Notes ──
  const [showSessionNotes, setShowSessionNotes] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');

  // ── DJ History & Playlists ──
  const [djHistory, setDjHistory] = useState([]);
  const [playlists, setPlaylists] = useState({});
  const [currentPlaylist, setCurrentPlaylist] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // ── Mix Suggestions ──
  const [showMixSuggestions, setShowMixSuggestions] = useState(false);
  const [showAnalyzed, setShowAnalyzed] = useState(false);
  const [selectedForMix, setSelectedForMix] = useState(null);

  // ── Grid & Layout ──
  const [gridView, setGridView] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState('cues');
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  const [showModuleView, setShowModuleView] = useState(false);

  // ── Cue Colors ──
  const [cueColors, setCueColors] = useState<Record<number, string>>({});
  const [colorPickerCue, setColorPickerCue] = useState<number | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState<{x: number, y: number}>({x: 0, y: 0});

  // ── Metadata Editing ──
  const [showEditMeta, setShowEditMeta] = useState(false);
  const [editForm, setEditForm] = useState({title:'',artist:'',album:'',genre:'',year:0,comment:''});
  const [savingMeta, setSavingMeta] = useState(false);

  // ── UI Modules ──
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<string>('eq');

  // ── Refs ──
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const regionsRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spectralColorsRef = useRef<{r:number,g:number,b:number}[] | null>(null);
  const loopRegionRef = useRef<any>(null);
  const loopActiveRef = useRef(false);
  const loopInRef = useRef<number | null>(null);
  const loopOutRef = useRef<number | null>(null);
  const dragCountRef = useRef(0);
  const lastClickedIdxRef = useRef<number>(-1);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const prevSelectedRef = useRef<any>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── EQ/FX Web Audio API Refs ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // ── UI Previewing ──
  const [previewingTrackId, setPreviewingTrackId] = useState<number | null>(null);

  // ── Constants ──
  const WAVEFORM_THEMES: Record<string, { wave: string; progress: string; label: string; cursor: string; gradient?: boolean }> = {
    neon: { wave: '#7c3aed', progress: 'rgba(124,58,237,0.45)', cursor: '#ffffff', label: 'Néon', gradient: true },
    sunset: { wave: '#f97316', progress: 'rgba(249,115,22,0.45)', cursor: '#ffffff', label: 'Sunset', gradient: true },
    ocean: { wave: '#06b6d4', progress: 'rgba(6,182,212,0.45)', cursor: '#ffffff', label: 'Océan', gradient: true },
    forest: { wave: '#22c55e', progress: 'rgba(34,197,94,0.45)', cursor: '#ffffff', label: 'Forêt', gradient: true },
    fire: { wave: '#ef4444', progress: 'rgba(239,68,68,0.45)', cursor: '#ffffff', label: 'Feu', gradient: true },
    aurora: { wave: '#a855f7', progress: 'rgba(168,85,247,0.45)', cursor: '#ffffff', label: 'Aurora', gradient: true },
  };

  const REKORDBOX_COLORS = [
    { name: "Red", hex: "#E13535" },
    { name: "Orange", hex: "#FF8C00" },
    { name: "Yellow", hex: "#E2D420" },
    { name: "Green", hex: "#1DB954" },
    { name: "Aqua", hex: "#21C8DE" },
    { name: "Blue", hex: "#2B7FFF" },
    { name: "Purple", hex: "#A855F7" },
    { name: "Pink", hex: "#FF69B4" },
  ];

  const CUE_TYPE_COLORS: Record<string, string> = {
    hot_cue: '#e11d48', loop: '#0891b2', fade_in: '#16a34a', fade_out: '#ea580c',
    load: '#ca8a04', phrase: '#2563eb', drop: '#e11d48', section: '#7c3aed',
  };

  const CONTEXT_ACTIONS = [
    { label: 'Analyser Audio (BPM/Key/Cues)', icon: Zap, action: 'analyze' },
    { label: 'Rechercher Metadata (Spotify)', icon: Sparkles, action: 'analyze_metadata' },
    { label: 'Générer les Cue Points', icon: Disc3, action: 'cue_points', separator: true },
    { label: 'Organiser (Catégorie/Tags)', icon: Folder, action: 'organize', separator: true },
    { label: 'Export Rekordbox XML', icon: Download, action: 'export_rekordbox' },
    { label: 'Supprimer', icon: Trash2, action: 'delete', separator: true },
  ];

  // ── Toast Notifications ──
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-4), { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Load Tracks ──
  const loadTracks = useCallback(async () => {
    try {
      setTracksLoading(true);
      const data = await listTracks(1, 100);
      setTracks(data.tracks);
    } catch {} finally { setTracksLoading(false); }
  }, []);

  // ── Fetch User & Plan Features ──
  useEffect(() => {
    const fetchUserAndFeatures = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        const token = localStorage.getItem('cueforge_token');
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const res = await fetch(apiBase + '/admin/plan-features', { headers: { 'Authorization': 'Bearer ' + token } });
        if (res.ok) {
          const data = await res.json();
          setPlanFeatures(data.features || {});
          setFeatureLabels(data.feature_labels || {});
        }
      } catch (e) { console.error('Failed to fetch user/features:', e); }
    };
    fetchUserAndFeatures();
  }, []);

  const isFeatureEnabled = useCallback((featureName: string) => {
    if (!currentUser) return true;
    const plan = currentUser.subscription_plan || 'free';
    return planFeatures[plan]?.[featureName] ?? true;
  }, [currentUser, planFeatures]);

  const togglePlanFeature = useCallback(async (planName: string, featureName: string, enabled: boolean) => {
    try {
      const token = localStorage.getItem('cueforge_token');
      if (!token) return;
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const res = await fetch(apiBase + '/admin/plan-features/' + planName + '/' + featureName, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ is_enabled: enabled })
      });
      if (res.ok) {
        setPlanFeatures(prev => ({ ...prev, [planName]: { ...prev[planName], [featureName]: enabled } }));
      }
    } catch (e) { console.error('Failed to toggle feature:', e); }
  }, []);

  const resetPlanFeatures = useCallback(async () => {
    try {
      const token = localStorage.getItem('cueforge_token');
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const res = await fetch(apiBase + '/admin/plan-features/reset', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        setPlanFeatures(data.features || {});
        setFeatureLabels(data.feature_labels || {});
      }
    } catch (e) { console.error('Failed to reset features:', e); }
  }, []);

  // ── Loop Syncing ──
  useEffect(() => { loopActiveRef.current = loopActive; }, [loopActive]);
  useEffect(() => { loopInRef.current = loopIn; }, [loopIn]);
  useEffect(() => { loopOutRef.current = loopOut; }, [loopOut]);

  useEffect(() => {
    setLoopIn(null);
    setLoopOut(null);
    setLoopActive(false);
    if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
  }, [selectedTrack]);

  // ── Column Visibility Persistence ──
  useEffect(() => {
    try { const s = localStorage.getItem('cueforge_columns'); if (s) setVisibleCols(JSON.parse(s)); } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('cueforge_columns', JSON.stringify(visibleCols));
  }, [visibleCols]);

  const gridTemplate = useMemo(() => {
    return ['28px', '2fr', visibleCols.artist ? '1.2fr' : '0px', visibleCols.album ? '1fr' : '0px', visibleCols.genre ? '0.8fr' : '0px', visibleCols.bpm ? '60px' : '0px', visibleCols.key ? '45px' : '0px', visibleCols.energy ? '45px' : '0px', visibleCols.duration ? '60px' : '0px', '50px', '30px'].join(' ');
  }, [visibleCols]);

  const toggleCol = (col: string) => setVisibleCols(prev => ({ ...prev, [col]: !prev[col] }));

  // ── Column Settings Close Handler ──
  useEffect(() => {
    if (!showColSettings) return;
    const handler = () => setShowColSettings(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showColSettings]);

  // ── Track Play History & Mix Transitions ──
  useEffect(() => {
    if (selectedTrack) {
      setPlayHistory(prev => [{trackId: selectedTrack.id, timestamp: Date.now()}, ...prev].slice(0, 50));
      if (prevSelectedRef.current && prevSelectedRef.current.id !== selectedTrack.id && prevSelectedRef.current.analysis?.key && selectedTrack.analysis?.key) {
        const score = mixScore(prevSelectedRef.current.analysis.key, prevSelectedRef.current.analysis.bpm || 0, selectedTrack.analysis.key, selectedTrack.analysis.bpm || 0);
        setMixLog(prev => [{fromId: prevSelectedRef.current.id, toId: selectedTrack.id, score: score.total, timestamp: Date.now()}, ...prev].slice(0, 100));
      }
      prevSelectedRef.current = selectedTrack;
    }
  }, [selectedTrack?.id]);

  // ── Hidden Columns CSS ──
  useEffect(() => {
    const style = document.createElement('style');
    const rules: string[] = [];
    const positions: Record<string, number> = { genre: 3, bpm: 4, key: 5, energy: 6, duration: 7 };
    Object.entries(positions).forEach(([col, pos]) => {
      if (!visibleCols[col as keyof typeof visibleCols]) {
        rules.push(`.track-grid > :nth-child(${pos}) { min-width: 0 !important; overflow: hidden !important; padding: 0 !important; }`);
      }
    });
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
    return () => style.remove();
  }, [visibleCols]);

  // ── Bulk Genre Update ──
  const bulkUpdateGenre = async () => {
    if (!bulkGenreValue.trim() || selectedIds.size === 0) return;
    setBulkUpdating(true);
    const token = localStorage.getItem('cueforge_token');
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    let updated = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch(apiBase + '/tracks/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ genre: bulkGenreValue.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          setTracks(prev => prev.map(t => t.id === data.id ? data : t));
          updated++;
        }
      } catch {}
    }
    setBulkUpdating(false);
    setShowBulkGenre(false);
    setBulkGenreValue('');
    showToast(updated + ' morceau' + (updated > 1 ? 'x' : '') + ' mis à jour', 'success');
  };

  // ── Favorites Persistence ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cueforge_favorites');
      if (saved) setFavoriteIds(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  useEffect(() => {
    if (favoriteIds.size > 0) {
      localStorage.setItem('cueforge_favorites', JSON.stringify([...favoriteIds]));
    } else {
      localStorage.removeItem('cueforge_favorites');
    }
  }, [favoriteIds]);

  const toggleFavorite = (id: number) => {
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Audio Preview Cleanup ──
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // ── Drag & Drop Handlers ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCountRef.current = 0;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || f.name.match(/\.(mp3|wav|flac|aac|ogg|m4a|aif|aiff)$/i));
    if (files.length === 0) { showToast('Aucun fichier audio détecté', 'error'); return; }
    setUploading(true);
    showToast(`Upload de ${files.length} fichier(s)...`, 'info');
    try {
      setUploadProgress({current: 0, total: files.length});
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({current: i + 1, total: files.length});
        await uploadTrack(files[i]);
      }
      setUploadProgress(null);
      showToast(`${files.length} fichier(s) uploadé(s)`, 'success');
      loadTracks();
    } catch (err) { showToast('Erreur lors de l\'upload', 'error'); }
    setUploading(false);
  }, [showToast, loadTracks]);

  // ── File Handling ──
  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.name.match(/\.(mp3|wav|flac|aiff|aif|m4a|ogg)$/i)) {
        setError(`Format non supporté: ${file.name}`);
        continue;
      }
      const existingDupe = tracks.find(t =>
        (t.original_filename || '').toLowerCase() === file.name.toLowerCase() ||
        (t.title || '').toLowerCase() === file.name.replace(/\.[^.]+$/, '').toLowerCase()
      );
      if (existingDupe) {
        showToast('Doublon détecté : "' + file.name + '" existe déjà dans votre bibliothèque', 'error');
        continue;
      }
      setError('');
      setUploading(true);
      setBatchProgress(`Upload: ${file.name}...`);
      try {
        const uploaded = await uploadTrack(file);
        setBatchProgress('');
        setUploading(false);
        loadTracks();
        showToast('Track uploadé avec succès', 'success');
        if (!selectedTrack) setSelectedTrack(uploaded);
        if (autoAnalyze && uploaded?.id) {
          showToast('Analyse automatique en cours...', 'info');
          (async () => {
            try {
              await analyzeTrack(uploaded.id);
              await pollTrackUntilDone(uploaded.id);
              loadTracks();
              const fresh = await getTrack(uploaded.id);
              if (fresh) setSelectedTrack(fresh);
              showToast('Analyse terminée avec succès', 'success');
            } catch (e) {
              console.error('Auto-analyze failed:', e);
              showToast('Analyse automatique échouée', 'error');
            }
          })();
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erreur inattendue');
        showToast('Erreur lors de l\'upload', 'error');
        setUploading(false);
        setBatchProgress('');
      }
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length) handleFiles(e.target.files);
  }

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, []);

  // ── Batch Analysis ──
  async function batchAnalyzeAudio(trackIds: number[]) {
    if (trackIds.length === 0) return;
    setAnalyzing(true);
    let done = 0;
    for (const id of trackIds) {
      setBatchProgress(`Analyse audio ${done + 1}/${trackIds.length}...`);
      try {
        await analyzeTrack(id);
        await pollTrackUntilDone(id);
      } catch {}
      done++;
    }
    setBatchProgress('');
    setAnalyzing(false);
    loadTracks();
    if (selectedTrack && trackIds.includes(selectedTrack.id)) {
      try {
        const fresh = await getTrack(selectedTrack.id);
        setSelectedTrack(fresh);
      } catch {}
    }
  }

  async function batchAnalyzeMetadata(trackIds: number[]) {
    if (trackIds.length === 0) return;
    setAnalyzing(true);
    let done = 0;
    for (const id of trackIds) {
      setBatchProgress(`Recherche metadata ${done + 1}/${trackIds.length}...`);
      try {
        await analyzeTrack(id);
        await pollTrackUntilDone(id);
      } catch {}
      done++;
    }
    setBatchProgress('');
    setAnalyzing(false);
    loadTracks();
    if (selectedTrack && trackIds.includes(selectedTrack.id)) {
      try {
        const fresh = await getTrack(selectedTrack.id);
        setSelectedTrack(fresh);
      } catch {}
    }
  }

  // ── Context Menu Handler ──
  async function handleCtxAction(action: string, track: Track) {
    setCtxMenu(null);
    switch (action) {
      case 'analyze':
        batchAnalyzeAudio([track.id]);
        break;
      case 'analyze_metadata':
        setMetadataPanel(track);
        setMetadataSuggestions(null);
        launchSpotifySearch(track);
        break;
      case 'cue_points':
        setAnalyzing(true);
        setBatchProgress('Génération des cue points...');
        try {
          await analyzeTrack(track.id);
          const done = await pollTrackUntilDone(track.id);
          setSelectedTrack(done);
          showToast('Analyse terminée', 'success');
          loadTracks();
        } catch {}
        setAnalyzing(false);
        setBatchProgress('');
        break;
      case 'organize':
        setOrganizerTrack(track);
        break;
      case 'export_rekordbox':
        try {
          await exportRekordbox(track.id);
          showToast('Export Rekordbox XML téléchargé', 'success');
        } catch { showToast('Erreur export Rekordbox', 'error'); }
        break;
      case 'delete':
        if (!confirm('Supprimer ce morceau ?')) return;
        try {
          await deleteTrack(track.id);
          if (selectedTrack?.id === track.id) setSelectedTrack(null);
          selectedIds.delete(track.id);
          setSelectedIds(new Set(selectedIds));
          showToast('Track supprimé', 'success');
          loadTracks();
        } catch {}
        break;
    }
  }

  // ── Spotify Search ──
  async function launchSpotifySearch(track: Track) {
    setMetadataLoading(true);
    setMetadataSuggestions(null);
    try {
      await analyzeTrack(track.id);
      const result = await pollTrackUntilDone(track.id);
      const suggestions: Record<string, string> = {};
      if (result.artist && result.artist !== track.artist) suggestions['artist'] = result.artist;
      if (result.title && result.title !== track.title) suggestions['title'] = result.title;
      if (result.album && result.album !== track.album) suggestions['album'] = result.album;
      if (result.genre && result.genre !== track.genre) suggestions['genre'] = result.genre;
      if (result.artwork_url) suggestions['artwork_url'] = result.artwork_url;
      if (result.spotify_url) suggestions['spotify_url'] = result.spotify_url;
      if (result.year && result.year !== track.year) suggestions['year'] = String(result.year);
      setMetadataSuggestions(suggestions);
      setMetadataPanel(result);
      loadTracks();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Recherche metadata échouée');
    }
    setMetadataLoading(false);
  }

  // ── Metadata Editing ──
  const openEditMeta = () => {
    if (!selectedTrack) return;
    setEditForm({
      title: selectedTrack.title || selectedTrack.original_filename || '',
      artist: selectedTrack.artist || '',
      album: selectedTrack.album || '',
      genre: selectedTrack.genre || '',
      year: selectedTrack.year || 0,
      comment: selectedTrack.comment || '',
    });
    setShowEditMeta(true);
  };

  const saveMetadata = async () => {
    if (!selectedTrack || !token) return;
    setSavingMeta(true);
    try {
      const body = {};
      if (editForm.title) body.title = editForm.title;
      if (editForm.artist) body.artist = editForm.artist;
      if (editForm.album) body.album = editForm.album;
      if (editForm.genre) body.genre = editForm.genre;
      if (editForm.year) body.year = editForm.year;
      if (editForm.comment) body.comment = editForm.comment;
      const res = await fetch(API + '/tracks/' + selectedTrack.id, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setTracks((prev) => prev.map((t) => t.id === updated.id ? updated : t));
        setSelectedTrack(updated);
        setShowEditMeta(false);
      }
    } catch(e) { console.error(e); }
    setSavingMeta(false);
  };

  // ── Export Functions ──
  const exportRekordboxXML = async (trackId) => {
    if (!token) return;
    try {
      const res = await fetch(API + '/export/' + trackId + '/rekordbox', {
        headers: {'Authorization':'Bearer '+token},
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (selectedTrack?.title || 'track') + '_rekordbox.xml';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch(e) { console.error(e); }
  };

  const exportAllRekordboxXML = async () => {
    if (!token) return;
    try {
      const res = await fetch(API + '/export/rekordbox/all', {
        headers: {'Authorization':'Bearer '+token},
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'CueForge_Library_rekordbox.xml';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch(e) { console.error(e); }
  };

  const handleExportTracklist = function(format) {
    if (!filteredTracks || filteredTracks.length === 0) return;
    var lines = [];
    if (format === 'csv') {
      lines.push('Title,Artist,BPM,Key,Genre,Energy');
      filteredTracks.forEach(function(t) {
        var bpm = t.analysis ? (t.analysis.bpm || '') : '';
        var key = t.analysis ? (t.analysis.key || '') : '';
        var energy = t.analysis ? Math.round((t.analysis.energy || 0) * 100) : '';
        lines.push('"' + (t.title || '').replace(/"/g, '""') + '","' + (t.artist || '').replace(/"/g, '""') + '",' + bpm + ',' + key + ',"' + (t.genre || '') + '",' + energy);
      });
    } else {
      filteredTracks.forEach(function(t, i) {
        var bpm = t.analysis ? (t.analysis.bpm ? ' [' + Math.round(t.analysis.bpm) + ' BPM]' : '') : '';
        var key = t.analysis ? (t.analysis.key ? ' (' + t.analysis.key + ')' : '') : '';
        lines.push((i + 1) + '. ' + (t.artist || 'Unknown') + ' - ' + (t.title || t.filename) + bpm + key);
      });
    }
    var blob = new Blob([lines.join('\n')], { type: format === 'csv' ? 'text/csv' : 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tracklist_' + new Date().toISOString().slice(0, 10) + (format === 'csv' ? '.csv' : '.txt');
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Track Ratings ──
  const setRating = (trackId: number, rating: number) => {
    setTrackRatings(prev => ({ ...prev, [trackId]: prev[trackId] === rating ? 0 : rating }));
  };

  // ── Re-analyze Track ──
  const reanalyzeTrack = async (trackId) => {
    try {
      const resp = await fetch(API + '/tracks/' + trackId + '/analyze', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (resp.ok) {
        setTracks(prev => prev.map(t => t.id === trackId ? {...t, status: 'analyzing'} : t));
      }
    } catch(e) { console.error('Re-analyze failed:', e); }
  };

  const getDefaultCueColor = (index: number) => {
    const defaults = ["#E13535", "#FF8C00", "#E2D420", "#1DB954", "#21C8DE", "#2B7FFF", "#A855F7", "#FF69B4"];
    return defaults[index % defaults.length];
  };

  const getCueColor = (cueId: number, index: number) => {
    return cueColors[cueId] || getDefaultCueColor(index);
  };

  // ── Waveform Initialization ──
  useEffect(() => {
    if (typeof window === 'undefined' || !waveformRef.current) return;
    let ws: any = null;
    let destroyed = false;

    async function initWavesurfer() {
      const WaveSurfer = (await import('wavesurfer.js')).default;
      const RegionsPlugin = (await import('wavesurfer.js/dist/plugins/regions.esm.js')).default;

      if (destroyed) return;

      const regions = RegionsPlugin.create();
      regionsRef.current = regions;

      ws = WaveSurfer.create({
        container: waveformRef.current!,
        cursorColor: '#ffffff',
        cursorWidth: 2,
        height: 128,
        normalize: true,
        fillParent: true,
        minPxPerSec: 1,
        autoScroll: true,
        autoCenter: true,
        interact: true,
        dragToSeek: true,
        hideScrollbar: false,
        barWidth: 0,
        barGap: 0,
        barRadius: 0,
        plugins: [regions],
        waveColor: WAVEFORM_THEMES[waveformTheme].wave,
        progressColor: WAVEFORM_THEMES[waveformTheme].progress,
        renderFunction: (peaks: any, ctx: CanvasRenderingContext2D) => {
          const colors = spectralColorsRef.current;
          const { width, height } = ctx.canvas;
          const ch = peaks[0] as Float32Array;
          if (!ch || ch.length === 0) return;
          const mid = height / 2;
          ctx.clearRect(0, 0, width, height);
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, mid);
          ctx.lineTo(width, mid);
          ctx.stroke();
          const totalSamples = ch.length / 2;
          for (let x = 0; x < width; x++) {
            const sampleIdx = Math.min(Math.floor((x / width) * totalSamples) * 2, ch.length - 2);
            let amp = 0;
            for (let s = -1; s <= 1; s++) {
              const si = Math.max(0, Math.min(ch.length - 2, sampleIdx + s * 2));
              amp = Math.max(amp, Math.abs(ch[si] || 0), Math.abs(ch[si + 1] || 0));
            }
            const barH = Math.max(1, amp * mid * 0.92);
            const ci = colors ? Math.min(Math.floor((x / width) * colors.length), colors.length - 1) : -1;
            const c = ci >= 0 && colors ? colors[ci] : { r: 124, g: 58, b: 237 };
            const brightness = 0.55 + amp * 0.45;
            const r = Math.min(255, Math.round(c.r * brightness));
            const g = Math.min(255, Math.round(c.g * brightness));
            const b = Math.min(255, Math.round(c.b * brightness));
            ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
            ctx.fillRect(x, mid - barH, 1, barH);
            ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.45)';
            ctx.fillRect(x, mid, 1, barH * 0.75);
          }
        },
      });

      ws.on('play', () => { if (!destroyed) setIsPlaying(true); });
      ws.on('pause', () => { if (!destroyed) setIsPlaying(false); });
      ws.on('timeupdate', (t: number) => {
        if (destroyed) return;
        setCurrentTime(t);
        if (loopActiveRef.current && typeof loopInRef.current === 'number' && typeof loopOutRef.current === 'number' && loopInRef.current < loopOutRef.current && t >= loopOutRef.current) {
          const dur = ws.getDuration();
          if (dur > 0) ws.seekTo(loopInRef.current / dur);
        }
      });
      ws.on('ready', () => {
        if (!destroyed) {
          setDuration(ws.getDuration());
          setWaveformReady(true);
        }
      });

      ws.on('error', (err: any) => {
        console.warn('WaveSurfer error (non-fatal):', err);
      });

      wavesurferRef.current = ws;
    }

    initWavesurfer();
    return () => {
      destroyed = true;
      if (ws) ws.destroy();
    };
  }, []);

  // ── EQ Setup ──
  const connectEQ = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws || eqConnected) return;
    try {
      const media = ws.getMediaElement();
      if (!media) return;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaElementSource(media);
      sourceNodeRef.current = source;
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf'; low.frequency.value = 320; low.gain.value = 0;
      eqLowRef.current = low;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.5; mid.gain.value = 0;
      eqMidRef.current = mid;
      const high = ctx.createBiquadFilter();
      high.type = 'highshelf'; high.frequency.value = 3200; high.gain.value = 0;
      eqHighRef.current = high;
      source.connect(low).connect(mid).connect(high).connect(ctx.destination);
      setEqConnected(true);
    } catch(e) { console.warn('EQ connect failed:', e); }
  }, [eqConnected]);

  const updateEQ = useCallback((band: 'low' | 'mid' | 'high', value: number) => {
    setEqValues(prev => ({ ...prev, [band]: value }));
    const ref = band === 'low' ? eqLowRef : band === 'mid' ? eqMidRef : eqHighRef;
    if (ref.current) ref.current.gain.value = value;
  }, []);

  // ── Zoom Handler ──
  function handleZoom(direction: 'in' | 'out') {
    if (!wavesurferRef.current) return;
    const ws = wavesurferRef.current;
    let newZoom = zoomLevel;
    if (direction === 'in') {
      newZoom = Math.min(zoomLevel * 1.5, 500);
    } else {
      newZoom = Math.max(zoomLevel / 1.5, 1);
    }
    setZoomLevel(newZoom);
    try { ws.zoom(newZoom); } catch {}
    ws.options.autoScroll = newZoom > 1;
    ws.options.autoCenter = newZoom > 1;
  }

  // ── Wheel Zoom ──
  useEffect(() => {
    const container = waveformRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const ws = wavesurferRef.current;
      if (!ws) return;
      const dir = e.deltaY < 0 ? 'in' : 'out';
      handleZoom(dir);
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, [zoomLevel]);

  // ── Load Track Into Waveform ──
  useEffect(() => {
    if (!selectedTrack || !wavesurferRef.current) return;
    const ws = wavesurferRef.current;
    const regions = regionsRef.current;

    if (loadAbortRef.current) loadAbortRef.current.abort();
    const abortController = new AbortController();
    loadAbortRef.current = abortController;

    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    spectralColorsRef.current = null;
    setZoomLevel(1);
    setWaveformReady(false);
    try { ws.zoom(1); } catch {}

    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + (
      (process.env.NEXT_PUBLIC_API_URL || '').endsWith('/api/v1') ? '' : '/api/v1'
    );
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('cueforge_token') : '';
    const audioUrl = `${apiUrl}/tracks/${selectedTrack.id}/audio?format=ogg&token=${authToken}`;
    const trackId = selectedTrack.id;

    (async () => {
      try {
        const response = await fetch(audioUrl, { signal: abortController.signal });
        if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);

        if (abortController.signal.aborted) return;

        const arrayBuffer = await response.arrayBuffer();
        if (abortController.signal.aborted) return;

        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        const blob = new Blob([arrayBuffer], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);
        currentBlobUrlRef.current = blobUrl;

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        await audioCtx.resume();
        const bufferCopy = arrayBuffer.slice(0);
        const decoded = await audioCtx.decodeAudioData(bufferCopy);

        if (abortController.signal.aborted) {
          URL.revokeObjectURL(blobUrl);
          currentBlobUrlRef.current = null;
          audioCtx.close();
          return;
        }

        const ch0 = decoded.getChannelData(0);
        const ch1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : ch0;

        try {
          const rgbColors = await computeRGBWaveform(decoded);
          if (!abortController.signal.aborted) {
            spectralColorsRef.current = rgbColors;
          }
        } catch (e) { console.warn('RGB waveform computation failed:', e); }

        if (abortController.signal.aborted) {
          URL.revokeObjectURL(blobUrl);
          currentBlobUrlRef.current = null;
          audioCtx.close();
          return;
        }

        ws.load(blobUrl, [ch0, ch1], decoded.duration);
        audioCtx.close();
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to load track audio:', err);
        if (!abortController.signal.aborted) {
          try { ws.load(audioUrl); } catch (e2) { console.error('Fallback load also failed:', e2); }
        }
      }
    })();

    ws.once('decode', () => {
      if (!regions || abortController.signal.aborted) return;
      regions.clearRegions();

      selectedTrack.cue_points?.forEach((cue: CuePoint, i: number) => {
        const color = CUE_COLOR_MAP[cue.color as keyof typeof CUE_COLOR_MAP] || '#2563eb';
        if (cue.end_position_ms) {
          regions.addRegion({
            start: cue.position_ms / 1000,
            end: cue.end_position_ms / 1000,
            content: cue.name,
            color: color + '30',
            drag: false,
            resize: false,
          });
        } else {
          regions.addRegion({
            start: cue.position_ms / 1000,
            content: `${i + 1} ${cue.name}`,
            color: color + '90',
          });
        }
      });

      selectedTrack.analysis?.sections?.forEach((sec: any) => {
        const sColors = { INTRO: 'rgba(59,130,246,0.35)', VERSE: 'rgba(34,197,94,0.35)', CHORUS: 'rgba(234,179,8,0.35)', BUILD: 'rgba(249,115,22,0.35)', DROP: 'rgba(239,68,68,0.35)', BREAK: 'rgba(6,182,212,0.35)', OUTRO: 'rgba(139,92,246,0.35)' } as Record<string, string>;
        regions.addRegion({
          start: sec.start,
          content: sec.label,
          color: sColors[sec.label] || 'rgba(107,114,128,0.35)',
        });
      });

      if (!selectedTrack.analysis?.sections?.length && selectedTrack.analysis?.drop_positions?.length) {
        selectedTrack.analysis.drop_positions.forEach((ms: number, i: number) => {
          regions.addRegion({
            start: ms / 1000,
            content: 'DROP ' + (i + 1),
            color: 'rgba(239,68,68,0.35)',
          });
        });
      }
    });

    return () => {
      abortController.abort();
    };
  }, [selectedTrack]);

  // ── Waveform Theme Change ──
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    const theme = WAVEFORM_THEMES[waveformTheme];
    if (!theme) return;
    try {
      ws.setOptions({
        waveColor: theme.wave,
        progressColor: theme.progress,
      });
    } catch (e) { console.warn('Theme update failed:', e); }
  }, [waveformTheme]);

  // ── Filtered Tracks ──
  const filtered = tracks
    .filter(t => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.original_filename.toLowerCase().includes(q) ||
        t.title?.toLowerCase().includes(q) ||
        t.artist?.toLowerCase().includes(q) ||
        t.genre?.toLowerCase().includes(q)
      );
    })
    .filter(t => !showFavoritesOnly || favoriteIds.has(t.id))
    .filter(t => {
      if (colFilterTitle && !(t.title || t.original_filename || '').toLowerCase().includes(colFilterTitle.toLowerCase())) return false;
      if (colFilterArtist && !(t.artist || '').toLowerCase().includes(colFilterArtist.toLowerCase())) return false;
      if (colFilterGenre && (t.genre || '') !== colFilterGenre) return false;
      if (colFilterKey && (t.analysis?.key || '') !== colFilterKey) return false;
      if (colFilterBpmMin && (t.analysis?.bpm || 0) < parseFloat(colFilterBpmMin)) return false;
      if (colFilterBpmMax && (t.analysis?.bpm || 999) > parseFloat(colFilterBpmMax)) return false;
      if (colFilterEnergyMin && ((t.analysis?.energy || 0) * 100) < parseFloat(colFilterEnergyMin)) return false;
      if (colFilterEnergyMax && ((t.analysis?.energy || 0) * 100) > parseFloat(colFilterEnergyMax)) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'bpm': return dir * ((a.analysis?.bpm || 0) - (b.analysis?.bpm || 0));
        case 'key': return dir * ((toCamelot(a.analysis?.key) || '').localeCompare(toCamelot(b.analysis?.key) || ''));
        case 'title': return dir * ((a.title || a.original_filename).localeCompare(b.title || b.original_filename));
        case 'artist': return dir * ((a.artist || '').localeCompare(b.artist || ''));
        case 'album': return dir * ((a.album || '').localeCompare(b.album || ''));
        case 'energy': return dir * ((a.analysis?.energy || 0) - (b.analysis?.energy || 0));
        case 'genre': return dir * ((a.genre || '').localeCompare(b.genre || ''));
        case 'duration': return dir * ((a.analysis?.duration_ms || a.duration_ms || 0) - (b.analysis?.duration_ms || b.duration_ms || 0));
        default: return dir * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
    });

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        if (selectedIds.size === filtered.length) {
          setSelectedIds(new Set());
        } else {
          setSelectedIds(new Set(filtered.map(t => t.id)));
        }
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutsModal(p => !p);
      }

      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      if (e.key === ' ' && !isInput) {
        e.preventDefault();
        if (wavesurferRef.current) wavesurferRef.current.playPause();
      }

      if (e.key === 'ArrowDown' && !isInput) {
        e.preventDefault();
        const idx = tracks.findIndex(t => t.id === selectedTrack?.id);
        if (idx < tracks.length - 1) setSelectedTrack(tracks[idx + 1]);
      }

      if (e.key === 'ArrowUp' && !isInput) {
        e.preventDefault();
        const idx = tracks.findIndex(t => t.id === selectedTrack?.id);
        if (idx > 0) setSelectedTrack(tracks[idx - 1]);
      }

      if (['1','2','3','4','5'].includes(e.key) && !isInput && selectedTrack) {
        const star = parseInt(e.key);
        setTrackRatings(prev => ({...prev, [selectedTrack.id]: prev[selectedTrack.id] === star ? 0 : star}));
      }

      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setSelectedIds(new Set());
      }

      if (e.key === 'ArrowLeft' && !isInput) {
        e.preventDefault();
        if (wavesurferRef.current) wavesurferRef.current.skip(-5);
      }

      if (e.key === 'ArrowRight' && !isInput) {
        e.preventDefault();
        if (wavesurferRef.current) wavesurferRef.current.skip(5);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedTrack, tracks, filtered, wavesurferRef]);

  // ── Player Controls ──
  function togglePlay() {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.playPause();
  }

  function skipBack() {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.skip(-5);
  }

  function skipForward() {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.skip(5);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (wavesurferRef.current) wavesurferRef.current.setVolume(next ? 0 : volume);
  }

  // ── Multi-select Toggle ──
  function toggleSelect(trackId: number, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (e.ctrlKey || e.metaKey) {
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
    } else {
      if (next.has(trackId) && next.size === 1) next.clear();
      else { next.clear(); next.add(trackId); }
    }
    setSelectedIds(next);
  }

  // ── Tap Tempo Keyboard ──
  useEffect(function() {
    if (!showTapTempo) return;
    function handleKeyDown(e) {
      if (e.code === "Space" || e.key === "t" || e.key === "T") {
        e.preventDefault();
        var now = Date.now();
        setTapTimes(function(prev) {
          if (prev.length > 0 && now - prev[prev.length - 1] > 3000) return [now];
          return prev.concat([now]).slice(-8);
        });
      }
      if (e.key === "Escape") setShowTapTempo(false);
      if (e.key === "r" || e.key === "R") setTapTimes([]);
    }
    window.addEventListener("keydown", handleKeyDown);
    return function() { window.removeEventListener("keydown", handleKeyDown); };
  }, [showTapTempo]);

  // ── Session Notes Persistence ──
  useEffect(function() {
    var saved = localStorage.getItem("cueforge_session_notes");
    if (saved) setSessionNotes(saved);
  }, []);

  useEffect(function() {
    localStorage.setItem("cueforge_session_notes", sessionNotes);
  }, [sessionNotes]);

  // ── DJ Set Timer ──
  useEffect(() => {
    if (!setTimerRunning || setTimerRemaining <= 0) return;
    const interval = setInterval(() => {
      setSetTimerRemaining(function(prev) {
        if (prev <= 1) { setSetTimerRunning(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [setTimerRunning, setTimerRemaining]);

  // ── Waveform Zoom Effect ──
  useEffect(() => {
    if (!wavesurferRef.current) return;
    const ws = wavesurferRef.current;
    const pxPerSec = waveformZoom <= 1 ? 1 : Math.max(1, waveformZoom * 20);
    try { ws.zoom(pxPerSec); } catch (e) {}
    setZoomLevel(pxPerSec);
    ws.options.autoScroll = pxPerSec > 1;
    ws.options.autoCenter = pxPerSec > 1;
  }, [waveformZoom]);

  // ── Additional Keyboard Handlers ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const ws = wavesurferRef.current;
      if (!ws) return;

      if (e.key === '?') { setShowShortcuts(prev => !prev); return; }

      switch (e.code) {
        case 'ArrowLeft':
          if (wavesurferRef.current) wavesurferRef.current.skip(-5);
          e.preventDefault();
          break;
        case 'ArrowRight':
          if (wavesurferRef.current) wavesurferRef.current.skip(5);
          e.preventDefault();
          break;
        case 'KeyM':
          {
            const next = !muted;
            setMuted(next);
            if (wavesurferRef.current) wavesurferRef.current.setVolume(next ? 0 : volume);
            break;
          }
        case 'Equal':
        case 'NumpadAdd':
          {
            const r = Math.min(2.0, playbackRate + 0.05);
            setPlaybackRate(r);
            if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(r);
            e.preventDefault();
            break;
          }
        case 'Minus':
        case 'NumpadSubtract':
          {
            const r = Math.max(0.5, playbackRate - 0.05);
            setPlaybackRate(r);
            if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(r);
            e.preventDefault();
            break;
          }
        case 'Digit0':
        case 'Numpad0':
          {
            setPlaybackRate(1.0);
            if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(1.0);
            e.preventDefault();
            break;
          }
        case 'Space':
          e.preventDefault();
          ws.playPause();
          break;
        case 'KeyL':
          if (loopIn !== null && loopOut !== null) {
            setLoopActive(prev => !prev);
          } else if (loopIn === null) {
            setLoopIn(ws.getCurrentTime());
          } else {
            setLoopOut(ws.getCurrentTime());
            setLoopActive(true);
          }
          break;
        case 'Escape':
          setLoopIn(null);
          setLoopOut(null);
          setLoopActive(false);
          if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
          break;
        case 'BracketLeft':
          setLoopIn(ws.getCurrentTime());
          break;
        case 'BracketRight':
          setLoopOut(ws.getCurrentTime());
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loopIn, loopOut, loopActive, muted, volume, playbackRate]);

  // ── Load Tracks on Mount ──
  useEffect(() => { loadTracks(); }, []);

  // ── Hash Navigation ──
  useEffect(() => {
    function handleHash() {
      const hash = window.location.hash;
      if (hash === '#upload') {
        setTimeout(() => fileRef.current?.click(), 100);
      } else if (hash === '#export') {
        setShowExport(true);
      } else if (hash === '#library') {
        const el = document.getElementById('library-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // ── Filtered Tracks (Apply BPM/Key/Energy Filters) ──
  const filteredTracks = filtered.filter(t => {
    const bpm = t.analysis?.bpm || 0;
    if (filterBpmMin > 0 && bpm < filterBpmMin) return false;
    if (filterBpmMax < 999 && bpm > filterBpmMax) return false;
    if (filterKey && t.analysis?.key !== filterKey) return false;
    if (filterGenre && t.genre !== filterGenre) return false;
    const energy = Math.round((t.analysis?.energy || 0) * 100);
    if (filterEnergyMin > 0 && energy < filterEnergyMin) return false;
    if (filterEnergyMax < 100 && energy > filterEnergyMax) return false;
    if (filterColor && trackColors[t.id] !== filterColor) return false;
    if (filterRating > 0 && (trackRatings[t.id] || 0) < filterRating) return false;
    if (bpmMin > 0 && t.bpm < bpmMin) return false;
    if (bpmMax < 300 && t.bpm > bpmMax) return false;
    if (showCompatibleOnly && selectedTrack && selectedTrack.analysis?.key && t.id !== selectedTrack.id) {
      const selCamelot = toCamelot(selectedTrack.analysis.key);
      const trackCamelot = toCamelot(t.analysis?.key || '');
      if (selCamelot && trackCamelot && !getCompatibleKeys(selCamelot).includes(trackCamelot)) return false;
    }
    return true;
  });

  // ── Track Compatibility ──
  const getTrackCompat = (t: any) => {
    if (!selectedTrack?.analysis?.bpm || !t?.analysis?.bpm) return null;
    return mixScore(
      selectedTrack.analysis.key || '', selectedTrack.analysis.bpm,
      t.analysis.key || '', t.analysis.bpm
    );
  };

  // ── Sorted Filtered Tracks ──
  const sortedFilteredTracks = [...(typeof filteredTracks !== 'undefined' ? filteredTracks : [])].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'bpm') return dir * ((a.analysis?.bpm || 0) - (b.analysis?.bpm || 0));
    if (sortBy === 'key') return dir * ((a.analysis?.key || '').localeCompare(b.analysis?.key || ''));
    if (sortBy === 'title') return dir * ((a.title || '').localeCompare(b.title || ''));
    if (sortBy === 'genre') return dir * ((a.analysis?.genre || '').localeCompare(b.analysis?.genre || ''));
    if (sortBy === 'energy') return dir * ((a.analysis?.energy || 0) - (b.analysis?.energy || 0));
    if (sortBy === 'duration') return dir * ((a.analysis?.duration || 0) - (b.analysis?.duration || 0));
    if (sortBy === 'rating') return dir * ((trackRatings[b.id] || 0) - (trackRatings[a.id] || 0));
    return dir * (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  });

  // ── Track List Navigation ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!filteredTracks.length) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = selectedTrack ? filteredTracks.findIndex(t => t.id === selectedTrack.id) : -1;
        let newIdx: number;
        if (e.key === 'ArrowDown') {
          newIdx = currentIdx < filteredTracks.length - 1 ? currentIdx + 1 : 0;
        } else {
          newIdx = currentIdx > 0 ? currentIdx - 1 : filteredTracks.length - 1;
        }
        setSelectedTrack(filteredTracks[newIdx]);
        setTimeout(() => {
          const row = document.querySelector(`[data-track-id="${filteredTracks[newIdx].id}"]`);
          row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);
      }

      if (e.key === ' ' && selectedTrack) {
        e.preventDefault();
        const audio = document.querySelector('audio');
        if (audio) { audio.paused ? audio.play() : audio.pause(); setIsPlaying(!audio.paused); }
      }

      if (e.key === 'Delete' && selectedTrack) {
        e.preventDefault();
        deleteTrack(selectedTrack.id).then(() => { loadTracks(); setSelectedTrack(null); showToast('Track supprimé', 'success'); });
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }

      if (e.key === 'Escape') {
        if (searchQuery) { setSearchQuery(''); }
        (document.activeElement as HTMLElement)?.blur();
      }

      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        if (selectedTrack && selectedTrack.analysis?.key && selectedTrack.analysis?.bpm) {
          let bestTrack = null;
          let bestScore = -1;
          filteredTracks.forEach(t => {
            if (t.id === selectedTrack.id || !t.analysis?.key || !t.analysis?.bpm) return;
            const score = mixScore(selectedTrack.analysis.key, selectedTrack.analysis.bpm, t.analysis.key, t.analysis.bpm);
            if (score.total > bestScore) { bestScore = score.total; bestTrack = t; }
          });
          if (bestTrack) { setSelectedTrack(bestTrack); }
        }
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setShowBpmTap(prev => !prev);
      }

      if (e.key === 'c' || e.key === 'C') {
        if (selectedTrack) {
          e.preventDefault();
          setShowCompatibleOnly(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrack, filteredTracks, searchQuery]);

  // ── Compute loading states ──
  const isLoading = uploading || analyzing;
  const selectedCount = selectedIds.size;

  // ── Column sort handler ──
  const handleHeaderSort = useCallback((col: typeof sortBy) => {
    if (sortBy === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(col); setSortDir('asc'); }
  }, [sortBy]);

  // Return all hook state and functions
  return {
    // Core track data
    tracks, setTracks, selectedTrack, setSelectedTrack, tracksLoading, selectedIds, setSelectedIds,

    // Toasts
    toasts, showToast,

    // Player state
    isPlaying, setIsPlaying, currentTime, setCurrentTime, duration, setDuration,
    volume, setVolume, muted, setMuted, playbackRate, setPlaybackRate,

    // Upload & UI
    uploading, isDragging, uploadProgress, analyzing, batchProgress, error, dragOver,
    searchQuery, setSearchQuery, sortBy, setSortBy, sortDir, setSortDir,

    // Filters
    filterBpmMin, setFilterBpmMin, filterBpmMax, setFilterBpmMax,
    filterEnergyMin, setFilterEnergyMin, filterEnergyMax, setFilterEnergyMax,
    filterKey, setFilterKey, filterGenre, setFilterGenre, filterColor, setFilterColor,
    filterRating, setFilterRating, bpmMin, setBpmMin, bpmMax, setBpmMax, showFilters, setShowFilters,
    showCompatibleOnly, setShowCompatibleOnly,

    // Column filters & visibility
    showColumnFilters, setShowColumnFilters,
    colFilterTitle, setColFilterTitle, colFilterArtist, setColFilterArtist,
    colFilterGenre, setColFilterGenre, colFilterKey, setColFilterKey,
    colFilterBpmMin, setColFilterBpmMin, colFilterBpmMax, setColFilterBpmMax,
    colFilterEnergyMin, setColFilterEnergyMin, colFilterEnergyMax, setColFilterEnergyMax,
    visibleCols, setVisibleCols, toggleCol, gridTemplate, showColSettings, setShowColSettings,

    // Context menu
    ctxMenu, setCtxMenu,

    // Metadata
    metadataPanel, setMetadataPanel, metadataSuggestions, metadataLoading, organizerTrack, setOrganizerTrack,

    // Waveform
    waveformRef, wavesurferRef, regionsRef, zoomLevel, setZoomLevel, waveformReady,
    waveformZoom, setWaveformZoom, waveformTheme, setWaveformTheme,

    // Loop
    loopIn, setLoopIn, loopOut, setLoopOut, loopActive, setLoopActive,

    // User & plan
    currentUser, planFeatures, featureLabels, isFeatureEnabled, togglePlanFeature, resetPlanFeatures,

    // Cues
    showAddCue, setShowAddCue, newCueName, setNewCueName, newCuePos, setNewCuePos,
    newCueType, setNewCueType, newCueColor, setNewCueColor, cueColors, setCueColors,
    colorPickerCue, setColorPickerCue, colorPickerPos, setColorPickerPos,

    // Mix
    showMixPanel, setShowMixPanel, bpmTapTimes, setBpmTapTimes, bpmTapResult, setBpmTapResult,
    showBpmTap, setShowBpmTap,

    // History
    playHistory, mixLog, djHistory, setDjHistory,

    // Track metadata
    trackNotes, setTrackNotes, trackRatings, setTrackRatings, trackColors, setTrackColors,

    // Sets & playlists
    setLists, setSetLists, activeSetList, setActiveSetList, newSetListName, setNewSetListName,
    playlists, setPlaylists, currentPlaylist, setCurrentPlaylist,

    // Favorites
    favoriteIds, showFavoritesOnly, setShowFavoritesOnly, toggleFavorite,

    // EQ & FX
    eqLow, setEqLow, eqMid, setEqMid, eqHigh, setEqHigh, eqValues, fxParams, setFxParams,
    activeFx, setActiveFx, fxWet, setFxWet, eqConnected, updateEQ, connectEQ,
    masterGain, setMasterGain, crossfader, setCrossfader, pitchShift, setPitchShift,

    // UI
    showHistory, setShowHistory, showShortcutsModal, setShowShortcutsModal,
    showShortcuts, setShowShortcuts, showRemainingTime, setShowRemainingTime,
    showBeatGrid, setShowBeatGrid, showNotes, setShowNotes,

    // Language & i18n
    lang, setLang, t, TR,

    // Bulk operations
    showBulkGenre, setShowBulkGenre, bulkGenreValue, setBulkGenreValue, bulkUpdating, bulkUpdateGenre,
    autoAnalyze, setAutoAnalyze,

    // Advanced features
    showSmartPlaylist, setShowSmartPlaylist, smartRules, setSmartRules,
    showDuplicates, setShowDuplicates, duplicateGroups, setDuplicateGroups,
    showStats, setShowStats, showExport, setShowExport, exportFormat, setExportFormat,
    showBatchEdit, setShowBatchEdit, batchField, setBatchField, batchValue, setBatchValue,
    showCamelotWheel, setShowCamelotWheel, selectedWheelKey, setSelectedWheelKey,
    showPlanAdmin, setShowPlanAdmin, showWatchFolder, setShowWatchFolder, watchFolderPath, setWatchFolderPath,

    // Inline editing
    inlineEditId, setInlineEditId, inlineEditField, setInlineEditField, inlineEditValue, setInlineEditValue,

    // DJ Set Timer
    setTimerDuration, setSetTimerDuration, setTimerRemaining, setSetTimerRemaining,
    setTimerRunning, setSetTimerRunning, showSetTimer, setShowSetTimer,

    // Tap tempo
    sidebarCollapsed, setSidebarCollapsed, showTapTempo, setShowTapTempo, tapTimes, setTapTimes, tapBpm, setTapBpm,

    // Session notes
    showSessionNotes, setShowSessionNotes, sessionNotes, setSessionNotes,

    // Mix suggestions
    showMixSuggestions, setShowMixSuggestions, showAnalyzed, setShowAnalyzed, selectedForMix, setSelectedForMix,

    // Grid & layout
    gridView, setGridView, activeBottomTab, setActiveBottomTab, rightPanelExpanded, setRightPanelExpanded,
    showModuleView, setShowModuleView, activeModule, setActiveModule, rightPanel, setRightPanel,

    // Metadata editing
    showEditMeta, setShowEditMeta, editForm, setEditForm, savingMeta,

    // Preview
    previewingTrackId, setPreviewingTrackId,

    // Refs
    fileRef, searchInputRef, loopRegionRef, dragCountRef, lastClickedIdxRef, previewAudioRef,

    // Constants
    WAVEFORM_THEMES, REKORDBOX_COLORS, CUE_TYPE_COLORS, CONTEXT_ACTIONS,

    // Functions
    loadTracks, handleFiles, handleFileSelect, handleFileDrop,
    batchAnalyzeAudio, batchAnalyzeMetadata, handleCtxAction, launchSpotifySearch,
    openEditMeta, saveMetadata, exportRekordboxXML, exportAllRekordboxXML, handleExportTracklist,
    togglePlay, skipBack, skipForward, toggleMute, toggleSelect, handleDragEnter, handleDragLeave, handleDragOver, handleDrop,
    setRating, reanalyzeTrack, getDefaultCueColor, getCueColor, handleZoom, connectEQ, updateEQ,
    getTrackCompat, handleHeaderSort,

    // Computed values
    filtered, filteredTracks, sortedFilteredTracks, isLoading, selectedCount,
  };
}
