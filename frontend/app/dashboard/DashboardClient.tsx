// @ts-nocheck
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload, Music2, Loader2, CheckCircle2, XCircle, Download, Trash2, Clock,
  Activity, Hash, Disc3, ChevronDown, ChevronUp, ExternalLink, User, Tag,
  Calendar, AlbumIcon, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Search, MoreVertical, Zap, Wand2, Type, Disc, RefreshCw, Star, Filter,
  Grid3X3, List as ListIcon, Check, X, Music, Headphones, ArrowUpDown, Folder,
  ZoomIn, ZoomOut, CheckSquare, Square, AlertTriangle, Sparkles, Image
, SlidersHorizontal, ListMusic, Copy, BarChart3, Compass, FolderSearch, Lightbulb, PenSquare, LayoutGrid, ChevronLeft, ChevronRight, Palette, Eye, Layers, GitBranch, RotateCcw, Settings, Shield, Lock, Unlock, Crown} from 'lucide-react';
import { uploadTrack, analyzeTrack, pollTrackUntilDone, exportRekordbox, listTracks, deleteTrack, getTrack, createCuePoint, deleteCuePoint, getTrackCuePoints, getCurrentUser } from '@/lib/api';
import type { Track, CuePoint } from '@/types';
import TrackOrganizer from '@/components/TrackOrganizer';
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

// Harmonic mixing: compatible Camelot keys (same, +/-1, relative major/minor)
function getCompatibleKeys(camelotKey) {
  if (!camelotKey) return [];
  const match = camelotKey.match(/(\d+)([AB])/);
  if (!match) return [];
  const num = parseInt(match[1]);
  const letter = match[2];
  const other = letter === 'A' ? 'B' : 'A';
  return [
    camelotKey,
    num + other,                              // relative major/minor
    ((num % 12) + 1) + letter,                // +1 semitone
    ((num - 2 + 12) % 12 + 1) + letter,      // -1 semitone
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

// Auto-generate cue points from analysis sections/drops
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

const CUE_TYPE_COLORS: Record<string, string> = {
  hot_cue: '#e11d48', loop: '#0891b2', fade_in: '#16a34a', fade_out: '#ea580c',
  load: '#ca8a04', phrase: '#2563eb', drop: '#e11d48', section: '#7c3aed',
};

// ── Camelot Wheel System (Harmonic Mixing) ────────────────────────────────
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

// ── BPM Tap Tempo utility ─────────────────────────────────────────────────
const tapTimesRef = { current: [] as number[] };


// ── RGB DJ Waveform: Frequency-band spectral analysis (Rekordbox-style) ──
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

// ─────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────
// --- i18n Translations ---
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

export default function DashboardPage() {
  // ── State ─────────────────────────────────────────────────────────────
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [toasts, setToasts] = useState<{id: number; msg: string; type: 'success' | 'error' | 'info'}[]>([]);
  const toastIdRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{current: number; total: number} | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'bpm' | 'key' | 'title' | 'energy' | 'genre' | 'duration' | 'rating'>('date');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; track: Track } | null>(null);
  const [metadataPanel, setMetadataPanel] = useState<Track | null>(null);
  const [metadataSuggestions, setMetadataSuggestions] = useState<Record<string, string> | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [organizerTrack, setOrganizerTrack] = useState<Track | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [waveformReady, setWaveformReady] = useState(false);
  // ── New feature states ──
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);

  // Sync loop refs for timeupdate callback
  // ── User & plan feature states (must be before callbacks that reference them) ──
  const [currentUser, setCurrentUser] = useState<{id:number;email:string;name?:string;subscription_plan:string;is_admin:boolean;tracks_today:number}|null>(null);
  const [planFeatures, setPlanFeatures] = useState<Record<string, Record<string, boolean>>>({});
  const [featureLabels, setFeatureLabels] = useState<Record<string, string>>({});

  // ── Fetch current user & plan features on mount ──
  useEffect(() => {
    const fetchUserAndFeatures = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        // Fetch plan features matrix
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

  // ── Helper: check if feature is enabled for current user's plan ──
  const isFeatureEnabled = useCallback((featureName: string) => {
    if (!currentUser) return true; // default allow while loading
    const plan = currentUser.subscription_plan || 'free';
    return planFeatures[plan]?.[featureName] ?? true;
  }, [currentUser, planFeatures]);

  // ── Toggle plan feature (admin only) ──
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

  // ── Reset plan features to defaults (admin only) ──
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

  useEffect(() => { loopActiveRef.current = loopActive; }, [loopActive]);
  useEffect(() => { loopInRef.current = loopIn; }, [loopIn]);
  useEffect(() => { loopOutRef.current = loopOut; }, [loopOut]);

  // Reset loop when track changes
  useEffect(() => {
    setLoopIn(null);
    setLoopOut(null);
    setLoopActive(false);
    if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
  }, [selectedTrack]);
  const [showAddCue, setShowAddCue] = useState(false);
  const [newCueName, setNewCueName] = useState('');
  const [newCuePos, setNewCuePos] = useState('');
  const [newCueType, setNewCueType] = useState('hot_cue');
  const [newCueColor, setNewCueColor] = useState('blue');
  const [showMixPanel, setShowMixPanel] = useState(false);
  const [filterBpmMin, setFilterBpmMin] = useState<number>(0);
  const [filterBpmMax, setFilterBpmMax] = useState<number>(999);
  const [filterEnergyMin, setFilterEnergyMin] = useState<number>(0);
  const [filterEnergyMax, setFilterEnergyMax] = useState<number>(100);
  const [filterKey, setFilterKey] = useState<string>('');
  const [showCompatibleOnly, setShowCompatibleOnly] = useState(false);
  const [bpmTapTimes, setBpmTapTimes] = useState<number[]>([]);
  const [bpmTapResult, setBpmTapResult] = useState<number | null>(null);
  const [showBpmTap, setShowBpmTap] = useState(false);
  const [playHistory, setPlayHistory] = useState<{trackId: number; timestamp: number}[]>([]);
  const [mixLog, setMixLog] = useState<{fromId: number; toId: number; score: number; timestamp: number}[]>([]);
  const [filterGenre, setFilterGenre] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const loopRegionRef = useRef<any>(null);
  const [waveformZoom, setWaveformZoom] = useState<number>(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Toast notification system ──
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-4), { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── Column header sort toggle ──
  const handleHeaderSort = useCallback((col: typeof sortBy) => {
    if (sortBy === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(col); setSortDir('asc'); }
  }, [sortBy]);

  // Exporter la tracklist filtrée en CSV
  var handleExportTracklist = function(format) {
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

  // ── Drag & Drop Upload ──
  const dragCountRef = useRef(0);
  const lastClickedIdxRef = useRef<number>(-1);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingTrackId, setPreviewingTrackId] = useState<number | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [lang, setLang] = useState<string>('fr');
  const t = (k: string) => TR[lang]?.[k] || k;
  const [showBulkGenre, setShowBulkGenre] = useState(false);
  const [bulkGenreValue, setBulkGenreValue] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const setRating = (trackId: number, rating: number) => {
    setTrackRatings(prev => ({ ...prev, [trackId]: prev[trackId] === rating ? 0 : rating }));
  };


  // Column filters
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [colFilterTitle, setColFilterTitle] = useState('');
  const [colFilterArtist, setColFilterArtist] = useState('');
  const [colFilterGenre, setColFilterGenre] = useState('');
  const [colFilterKey, setColFilterKey] = useState('');
  const [colFilterBpmMin, setColFilterBpmMin] = useState('');
  const [colFilterBpmMax, setColFilterBpmMax] = useState('');
  const [colFilterEnergyMin, setColFilterEnergyMin] = useState('');
  const [colFilterEnergyMax, setColFilterEnergyMax] = useState('');
  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({ artist: true, album: false, genre: true, bpm: true, key: true, energy: true, duration: true });
  const [showColSettings, setShowColSettings] = useState(false);

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

  // Close column settings on outside click
  useEffect(() => {
    if (!showColSettings) return;
    const handler = () => setShowColSettings(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showColSettings]);

  // Track play history and mix transitions
  const prevSelectedRef = useRef<any>(null);
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

    // Dynamic CSS for hidden columns - only min-width:0 on cells in 0px tracks
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


  // Load favorites from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cueforge_favorites');
      if (saved) setFavoriteIds(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  // Save favorites to localStorage
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

  
  // Cleanup audio preview on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

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
    if (files.length === 0) { showToast('Aucun fichier audio d\u00e9tect\u00e9', 'error'); return; }
    setUploading(true);
    showToast(`Upload de ${files.length} fichier(s)...`, 'info');
    try {
      setUploadProgress({current: 0, total: files.length});
      for (let i = 0; i < files.length; i++) { 
        setUploadProgress({current: i + 1, total: files.length});
        await uploadTrack(files[i]); 
      }
      setUploadProgress(null);
      showToast(`${files.length} fichier(s) upload\u00e9(s)`, 'success');
      loadTracks();
    } catch (err) { showToast('Erreur lors de l\'upload', 'error'); }
    setUploading(false);
  }, [showToast, loadTracks]);
  const [showBeatGrid, setShowBeatGrid] = useState(false);
  const [trackNotes, setTrackNotes] = useState<Record<number, string>>({});
  const [trackRatings, setTrackRatings] = useState<Record<number, number>>({});
  const [trackColors, setTrackColors] = useState<Record<number, string>>({});
  const [setLists, setSetLists] = useState<{name: string; trackIds: number[]}[]>([]);
  const [activeSetList, setActiveSetList] = useState<number>(-1);
  const [newSetListName, setNewSetListName] = useState('');
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [tapBpm, setTapBpm] = useState<number>(0);
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [filterRating, setFilterRating] = useState<number>(0);
  const [bpmMin, setBpmMin] = useState<number>(0);
  const [bpmMax, setBpmMax] = useState<number>(300);
  const [transitionNotes, setTransitionNotes] = useState<Record<string, string>>({});
  const [showNotes, setShowNotes] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const [waveformTheme, setWaveformTheme] = useState<string>('neon');
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [eqLow, setEqLow] = useState(50);
  const [eqMid, setEqMid] = useState(50);
  const [eqHigh, setEqHigh] = useState(50);
  const [activeFx, setActiveFx] = useState('');
  const [fxWet, setFxWet] = useState(30);
  const [masterGain, setMasterGain] = useState(80);
  const [crossfader, setCrossfader] = useState(50);
  const [pitchShift, setPitchShift] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [djHistory, setDjHistory] = useState([]);
  const [playlists, setPlaylists] = useState({});
  const [currentPlaylist, setCurrentPlaylist] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // Smart Playlist & Advanced Features State
  const [showSmartPlaylist, setShowSmartPlaylist] = useState(false);
  const [smartRules, setSmartRules] = useState([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState('rekordbox');
  const [batchSelected, setBatchSelected] = useState([]);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchField, setBatchField] = useState('genre');
  const [batchValue, setBatchValue] = useState('');
  const [showCamelotWheel, setShowCamelotWheel] = useState(false);
  const [selectedWheelKey, setSelectedWheelKey] = useState<string | null>(null);
  const [showPlanAdmin, setShowPlanAdmin] = useState(false);
  const [showWatchFolder, setShowWatchFolder] = useState(false);
  const [watchFolderPath, setWatchFolderPath] = useState('');
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditField, setInlineEditField] = useState('');
  const [inlineEditValue, setInlineEditValue] = useState('');
  // DJ Set Timer state
  const [setTimerDuration, setSetTimerDuration] = useState(3600);
  const [setTimerRemaining, setSetTimerRemaining] = useState(0);
  const [setTimerRunning, setSetTimerRunning] = useState(false);
  const [showSetTimer, setShowSetTimer] = useState(false);
  // Tap Tempo state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<Record<string, boolean>>({});
  const [showTapTempo, setShowTapTempo] = useState(false);
  // Session Notes state
  const [showSessionNotes, setShowSessionNotes] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');

  // Tap Tempo keyboard shortcut (Space or T to tap when modal open)
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

  // Persist session notes to localStorage
  useEffect(function() {
    var saved = localStorage.getItem("cueforge_session_notes");
    if (saved) setSessionNotes(saved);
  }, []);
  useEffect(function() {
    localStorage.setItem("cueforge_session_notes", sessionNotes);
  }, [sessionNotes]);

  // DJ Set Timer countdown effect
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
  const [showMixSuggestions, setShowMixSuggestions] = useState(false);
  const [showAnalyzed, setShowAnalyzed] = useState(false);
  const [selectedForMix, setSelectedForMix] = useState(null);
  const [gridView, setGridView] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState('cues');
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  const [showModuleView, setShowModuleView] = useState(false);
  const [cueColors, setCueColors] = useState<Record<number, string>>({});
  const [colorPickerCue, setColorPickerCue] = useState<number | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState<{x: number, y: number}>({x: 0, y: 0});

  // Rekordbox-style cue colors
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

  // Default cue colors by index (Rekordbox convention)
  const getDefaultCueColor = (index: number) => {
    const defaults = ["#E13535", "#FF8C00", "#E2D420", "#1DB954", "#21C8DE", "#2B7FFF", "#A855F7", "#FF69B4"];
    return defaults[index % defaults.length];
  };

  // ── Re-analyze a track ──
  const reanalyzeTrack = async (trackId) => {
    try {
      const resp = await fetch(API + '/tracks/' + trackId + '/analyze', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (resp.ok) {
        // Update track status locally
        setTracks(prev => prev.map(t => t.id === trackId ? {...t, status: 'analyzing'} : t));
      }
    } catch(e) { console.error('Re-analyze failed:', e); }
  };

  const getCueColor = (cueId: number, index: number) => {
    return cueColors[cueId] || getDefaultCueColor(index);
  };
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<string>('eq');

  const waveformRef = useRef<HTMLDivElement>(null);
  const [showEditMeta, setShowEditMeta] = useState(false);
  const [editForm, setEditForm] = useState({title:'',artist:'',album:'',genre:'',year:0,comment:''});
  const [savingMeta, setSavingMeta] = useState(false);

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

  const exportRekordbox = async (trackId) => {
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

  const exportAllRekordbox = async () => {
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
  }

;


  const wavesurferRef = useRef<any>(null);
  const loopActiveRef = useRef(false);
  const loopInRef = useRef<number | null>(null);
  const loopOutRef = useRef<number | null>(null);
  const regionsRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spectralColorsRef = useRef<{r:number,g:number,b:number}[] | null>(null);
  // ── EQ / FX Web Audio API ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [eqValues, setEqValues] = useState({ low: 0, mid: 0, high: 0 });
  const [fxParams, setFxParams] = useState<Record<string, number>>({ reverb: 0, delay: 0, filterLP: 20000, filterHP: 20, flanger: 0, phaser: 0, distortion: 0, compressor: 0 });
  const [eqConnected, setEqConnected] = useState(false);


  // ── Load tracks on mount ──────────────────────────────────────────────
  useEffect(() => { loadTracks(); }, []);

  async function loadTracks() {
    try {
      setTracksLoading(true);
      const data = await listTracks(1, 100);
      setTracks(data.tracks);
    } catch {} finally { setTracksLoading(false); }
  }

  // ── Track blob URL cleanup ref ──
  const currentBlobUrlRef = useRef<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);

  // ── Wavesurfer init (ALWAYS render the div, never unmount it) ────────
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
            // Draw center line
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, mid);
            ctx.lineTo(width, mid);
            ctx.stroke();
            const totalSamples = ch.length / 2;
            // Draw filled waveform - Lexicon style (1px per column, mirrored)
            for (let x = 0; x < width; x++) {
              const sampleIdx = Math.min(Math.floor((x / width) * totalSamples) * 2, ch.length - 2);
              // Use max of nearby samples for smoother look
              let amp = 0;
              for (let s = -1; s <= 1; s++) {
                const si = Math.max(0, Math.min(ch.length - 2, sampleIdx + s * 2));
                amp = Math.max(amp, Math.abs(ch[si] || 0), Math.abs(ch[si + 1] || 0));
              }
              const barH = Math.max(1, amp * mid * 0.92);
              // Color from spectral data
              const ci = colors ? Math.min(Math.floor((x / width) * colors.length), colors.length - 1) : -1;
              const c = ci >= 0 && colors ? colors[ci] : { r: 124, g: 58, b: 237 };
              const brightness = 0.55 + amp * 0.45;
              const r = Math.min(255, Math.round(c.r * brightness));
              const g = Math.min(255, Math.round(c.g * brightness));
              const b = Math.min(255, Math.round(c.b * brightness));
              // Top half (main waveform)
              ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
              ctx.fillRect(x, mid - barH, 1, barH);
              // Bottom half (mirror, dimmer)
              ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.45)';
              ctx.fillRect(x, mid, 1, barH * 0.75);
            }
          },
        })

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

      // Suppress non-critical media element errors (blob playback quirks)
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



  // ── EQ Web Audio API Setup ──
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

  // ── Zoom handler ──────────────────────────────────────────────────────
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

  // Wheel zoom listener on waveform
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

    // ── Load track into waveform ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedTrack || !wavesurferRef.current) return;
    const ws = wavesurferRef.current;
    const regions = regionsRef.current;

    // Abort previous load if still in progress
    if (loadAbortRef.current) loadAbortRef.current.abort();
    const abortController = new AbortController();
    loadAbortRef.current = abortController;

    // Revoke previous blob URL to prevent memory leak
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    // Reset spectral colors for new track
    spectralColorsRef.current = null;

    setZoomLevel(1);
    setWaveformReady(false);
    try { ws.zoom(1); } catch {}

    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + (
      (process.env.NEXT_PUBLIC_API_URL || '').endsWith('/api/v1') ? '' : '/api/v1'
    );
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('cueforge_token') : '';
    const audioUrl = `${apiUrl}/tracks/${selectedTrack.id}/audio?token=${authToken}`;

    // Capture track ref for stale check
    const trackId = selectedTrack.id;

    // Pre-decode audio and pass peaks to WaveSurfer (bypasses media element issues)
    (async () => {
      try {
        const response = await fetch(audioUrl, { signal: abortController.signal });
        if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);

        // Check if this load was cancelled (user switched tracks)
        if (abortController.signal.aborted) return;

        const arrayBuffer = await response.arrayBuffer();
        if (abortController.signal.aborted) return;

        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        const blob = new Blob([arrayBuffer], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);
        currentBlobUrlRef.current = blobUrl;

        // Decode audio via AudioContext (reliable even when <audio> element fails)
        // Use .slice(0) to create a copy since decodeAudioData detaches the buffer
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

        // Extract peaks for waveform rendering
        const ch0 = decoded.getChannelData(0);
        const ch1 = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : ch0;

        // Compute RGB spectral colors for the custom renderFunction
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

        // Load with pre-computed peaks - waveform renders immediately with RGB colors
        ws.load(blobUrl, [ch0, ch1], decoded.duration);

        audioCtx.close();
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // Normal: user switched tracks
        console.error('Failed to load track audio:', err);
        // Fallback: try standard ws.load (will use <audio> element)
        if (!abortController.signal.aborted) {
          try { ws.load(audioUrl); } catch (e2) { console.error('Fallback load also failed:', e2); }
        }
      }
    })();

    // Add cue point regions once waveform is decoded
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

      // Use sections for labeled cue markers instead of just drops
      selectedTrack.analysis?.sections?.forEach((sec: any) => {
        const sColors = { INTRO: 'rgba(59,130,246,0.35)', VERSE: 'rgba(34,197,94,0.35)', CHORUS: 'rgba(234,179,8,0.35)', BUILD: 'rgba(249,115,22,0.35)', DROP: 'rgba(239,68,68,0.35)', BREAK: 'rgba(6,182,212,0.35)', OUTRO: 'rgba(139,92,246,0.35)' } as Record<string, string>;
        regions.addRegion({
          start: sec.start,
          content: sec.label,
          color: sColors[sec.label] || 'rgba(107,114,128,0.35)',
        });
      });
      // Fallback: if no sections, use drop_positions
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

    // Cleanup: abort fetch if track changes before load completes
    return () => {
      abortController.abort();
    };
  }, [selectedTrack]);

  // ── Waveform theme change (redraw only, no audio reload) ──
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

  // ── Filtered + sorted tracks ──────────────────────────────────────────
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
          case 'title': return dir * ((a.title || a.original_filename).localeCompare(b.title || b.original_filename)); case 'artist': return dir * ((a.artist || '').localeCompare(b.artist || '')); case 'album': return dir * ((a.album || '').localeCompare(b.album || ''));
          case 'energy': return dir * ((a.analysis?.energy || 0) - (b.analysis?.energy || 0));
          case 'genre': return dir * ((a.genre || '').localeCompare(b.genre || ''));
          case 'duration': return dir * ((a.analysis?.duration_ms || a.duration_ms || 0) - (b.analysis?.duration_ms || b.duration_ms || 0));
          default: return dir * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
      });

  // ── Keyboard shortcuts (Ctrl+A) ─────────────────────────────────────
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
      // Space = play/pause
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      if (e.key === ' ' && !isInput) {
        e.preventDefault();
        if (wavesurferRef.current) wavesurferRef.current.playPause();
      }
      // Arrow Up/Down = navigate tracks
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
      // 1-5 = rate selected track
      if (['1','2','3','4','5'].includes(e.key) && !isInput && selectedTrack) {
        const star = parseInt(e.key);
        setTrackRatings(prev => ({...prev, [selectedTrack.id]: prev[selectedTrack.id] === star ? 0 : star}));
      }
      // Escape = deselect
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setSelectedIds(new Set());
      }
      // ArrowLeft/Right → seek 5s
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

  // ── Player controls ───────────────────────────────────────────────────
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

  // ── Multi-select toggle ────────────────────────────────────────────────
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

  // ── File handling ─────────────────────────────────────────────────────
  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.name.match(/\.(mp3|wav|flac|aiff|aif|m4a|ogg)$/i)) {
        setError(`Format non supporté: ${file.name}`);
        continue;
      }
      // Duplicate detection
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
        // Auto-analyze after upload
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

  // ── Batch Analyze Audio (BPM, Key, Cues) ────────────────────────────
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
    // Refresh selected track if it was analyzed
    if (selectedTrack && trackIds.includes(selectedTrack.id)) {
      try {
        const fresh = await getTrack(selectedTrack.id);
        setSelectedTrack(fresh);
      } catch {}
    }
  }

  // ── Batch Analyze Metadata (Spotify, Genre, Cover) ───────────────────
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

  // ── Context menu handler ──────────────────────────────────────────────
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
          const blob = await exportRekordbox(track.id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `cueforge_${track.id}.xml`;
          a.click();
            showToast('Export Rekordbox XML téléchargé', 'success');
          URL.revokeObjectURL(url);
        } catch {}
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

  // ── Spotify search for metadata panel ─────────────────────────────────
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
      // Update the panel track with fresh data
      setMetadataPanel(result);
      loadTracks();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Recherche metadata échouée');
    }
    setMetadataLoading(false);
  }

  const isLoading = uploading || analyzing;
  const selectedCount = selectedIds.size;

  // ── Context Menu Actions ────────────────────────────────────────────
  const CONTEXT_ACTIONS = [
    { label: 'Analyser Audio (BPM/Key/Cues)', icon: <Zap size={14} />, action: 'analyze' },
    { label: 'Rechercher Metadata (Spotify)', icon: <Sparkles size={14} />, action: 'analyze_metadata' },
    { label: 'Générer les Cue Points', icon: <Disc3 size={14} />, action: 'cue_points', separator: true },
    { label: 'Organiser (Catégorie/Tags)', icon: <Folder size={14} />, action: 'organize', separator: true },
    { label: 'Export Rekordbox XML', icon: <Download size={14} />, action: 'export_rekordbox' },
    { label: 'Supprimer', icon: <Trash2 size={14} />, action: 'delete', separator: true },
  ];

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  // Computed: filtered + sorted tracks

  const filteredTracks = filtered.filter(t => {
    const bpm = t.analysis?.bpm || 0;
    if (filterBpmMin > 0 && bpm < filterBpmMin) return false;
    if (filterBpmMax < 999 && bpm > filterBpmMax) return false;
    if (filterKey && t.analysis?.key !== filterKey) return false;
    if (filterGenre && t.genre !== filterGenre) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(t.title || '').toLowerCase().includes(q) && !(t.artist || '').toLowerCase().includes(q) && !(t.filename || '').toLowerCase().includes(q)) return false;
    }
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



  // Keyboard navigation for track list
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
        // Auto-scroll to selected row
        setTimeout(() => {
          const row = document.querySelector(`[data-track-id="${filteredTracks[newIdx].id}"]`);
          row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);
      }
      // Space = play/pause
      if (e.key === ' ' && selectedTrack) {
        e.preventDefault();
        const audio = document.querySelector('audio');
        if (audio) { audio.paused ? audio.play() : audio.pause(); setIsPlaying(!audio.paused); }
      }
      // Delete = remove track
      if (e.key === 'Delete' && selectedTrack) {
        e.preventDefault();
        deleteTrack(selectedTrack.id).then(() => { loadTracks(); setSelectedTrack(null); showToast('Track supprimé', 'success'); });
      }
      // Ctrl+F = focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      // Escape = clear search / blur
      if (e.key === 'Escape') {
        if (searchQuery) { setSearchQuery(''); }
        (document.activeElement as HTMLElement)?.blur();
      }

      // Q = Quick Mix (jump to best matching track)
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
      // T = Toggle BPM Tap tool
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setShowBpmTap(prev => !prev);
      }
      // C = Toggle compatible-only filter
      if (e.key === 'c' || e.key === 'C') {
        if (selectedTrack) {
          e.preventDefault();
          setShowCompatibleOnly(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrack, filteredTracks]);

  const getTrackCompat = (t: any) => {
    if (!selectedTrack?.analysis?.bpm || !t?.analysis?.bpm) return null;
    return mixScore(
      selectedTrack.analysis.key || '', selectedTrack.analysis.bpm,
      t.analysis.key || '', t.analysis.bpm
    );
  };

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

  // ── Keyboard Shortcuts ──────────────────────────────────────────────────
  
  // Waveform zoom effect
  useEffect(() => {
    if (!wavesurferRef.current) return;
    const ws = wavesurferRef.current;
    const pxPerSec = waveformZoom <= 1 ? 1 : Math.max(1, waveformZoom * 20);
    try { ws.zoom(pxPerSec); } catch (e) {}
    setZoomLevel(pxPerSec);
    ws.options.autoScroll = pxPerSec > 1;
    ws.options.autoCenter = pxPerSec > 1;
  }, [waveformZoom]);

  // Sort tracks

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const ws = wavesurferRef.current;
      if (!ws) return;
      if (e.key === '?') { setShowShortcuts(prev => !prev); return; }
      switch (e.code) {
        case 'ArrowLeft': if (wavesurferRef.current) wavesurferRef.current.skip(-5); e.preventDefault(); break;
          case 'ArrowRight': if (wavesurferRef.current) wavesurferRef.current.skip(5); e.preventDefault(); break;
          case 'KeyM': { const next = !muted; setMuted(next); if (wavesurferRef.current) wavesurferRef.current.setVolume(next ? 0 : volume); break; }
          case 'Equal': case 'NumpadAdd': { const r = Math.min(2.0, playbackRate + 0.05); setPlaybackRate(r); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(r); e.preventDefault(); break; }
          case 'Minus': case 'NumpadSubtract': { const r = Math.max(0.5, playbackRate - 0.05); setPlaybackRate(r); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(r); e.preventDefault(); break; }
          case 'Digit0': case 'Numpad0': { setPlaybackRate(1.0); if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(1.0); e.preventDefault(); break; }
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
          setLoopIn(null); setLoopOut(null); setLoopActive(false);
          if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
          break;
        case 'BracketLeft':
          setLoopIn(ws.getCurrentTime());
          break;
        case 'BracketRight':
          setLoopOut(ws.getCurrentTime());
          if (loopIn !== null) setLoopActive(true);
          break;
        default:
          if (e.code.startsWith('Digit')) {
            const num = parseInt(e.code.replace('Digit', '')) - 1;
            if (selectedTrack?.cue_points?.[num]) {
              const pos = selectedTrack.cue_points[num].position_ms / 1000;
              ws.seekTo(pos / ws.getDuration());
            }
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrack, loopIn, loopOut, showShortcuts, muted, volume, playbackRate]);

  // ── Loop playback logic ─────────────────────────────────────────────────
  useEffect(() => {
    const ws = wavesurferRef.current;
    const regions = regionsRef.current;
    // Always clean up old region first
    if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
    if (!ws || !loopActive || loopIn === null || loopOut === null || loopIn >= loopOut) return;
    // Add visual loop region on waveform
    if (regions) {
      loopRegionRef.current = regions.addRegion({
        start: loopIn,
        end: loopOut,
        color: 'rgba(236,72,153,0.18)',
        drag: true,
        resize: true,
      });
      // Update loop points when user drags/resizes region
      loopRegionRef.current.on('update-end', () => {
        const r = loopRegionRef.current;
        if (r) { setLoopIn(r.start); setLoopOut(r.end); }
      });
    }
    // Seeking is handled by ref-based timeupdate in ws init - no duplicate needed
    return () => {
      if (loopRegionRef.current) { try { loopRegionRef.current.remove(); } catch {} loopRegionRef.current = null; }
    };
  }, [loopActive, loopIn, loopOut]);




  return (
    <div className="flex w-full h-[calc(100vh-3.5rem)] relative" onClick={() => setCtxMenu(null)} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* ── Drag & Drop Overlay ── */}
      {isDragging && (
        <div className="absolute inset-0 z-[9998] bg-cyan-500/10 backdrop-blur-sm border-2 border-dashed border-cyan-400/60 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-cyan-400">
            <Upload size={48} className="animate-bounce" />
            <span className="text-lg font-semibold">Dépose tes fichiers audio ici</span>
            <span className="text-sm text-cyan-400/60">MP3, WAV, FLAC, AAC, OGG, M4A, AIF</span>
          </div>
        </div>
      )}

      {/* Global styles */}
      <style dangerouslySetInnerHTML={{ __html: "@keyframes eqBar { 0%,100% { height: 3px; } 50% { height: 12px; } } .eq-bar { display: inline-block; width: 2px; margin: 0 0.5px; border-radius: 1px; animation: eqBar 0.4s ease infinite; } .eq-bar:nth-child(1) { animation-delay: 0s; } .eq-bar:nth-child(2) { animation-delay: 0.15s; } .eq-bar:nth-child(3) { animation-delay: 0.3s; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 3px; } ::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.5); }" }} />

      {/* Metadata Edit Modal */}
      {showEditMeta && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowEditMeta(false)}>
          <div className="bg-[var(--bg-card)] rounded-xl p-6 w-full max-w-md border border-[var(--border-default)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Edit Track Metadata</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">{t("titre")}</label>
                <input type="text" value={editForm.title} onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">{t("artiste")}</label>
                <input type="text" value={editForm.artist} onChange={(e) => setEditForm({...editForm, artist: e.target.value})}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">{t("album")}</label>
                <input type="text" value={editForm.album} onChange={(e) => setEditForm({...editForm, album: e.target.value})}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">{t("genre")}</label>
                  <input type="text" value={editForm.genre} onChange={(e) => setEditForm({...editForm, genre: e.target.value})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
                <div className="w-20">
                  <label className="text-xs text-[var(--text-secondary)] block mb-1">{t("annee")}</label>
                  <input type="number" value={editForm.year || ''} onChange={(e) => setEditForm({...editForm, year: parseInt(e.target.value) || 0})}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] block mb-1">{t("commentaire")}</label>
                <textarea value={editForm.comment} onChange={(e) => setEditForm({...editForm, comment: e.target.value})}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-2 text-[var(--text-primary)] text-sm focus:border-cyan-500 focus:outline-none h-16 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditMeta(false)} className="flex-1 px-4 py-2 bg-[var(--bg-hover)] hover:bg-gray-500 rounded text-sm text-[var(--text-primary)] font-medium">{t("annuler")}</button>
              <button onClick={saveMetadata} disabled={savingMeta}
                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm text-white font-bold disabled:opacity-50">
                {savingMeta ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CENTER CONTENT - NO LEFT SIDEBAR */}
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0 p-5 gap-3">

        {/* ── PLAYER CARD ── */}
        {selectedTrack && (
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4">
            {/* Title + controls + analysis badges inline */}
            <div className="flex items-center gap-3 mb-3">
              {/* Play button */}
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center flex-shrink-0 transition-colors"
                title="Play/Pause">
                {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>

              {/* Skip buttons */}
              <button onClick={() => { const idx = tracks.findIndex(t => t.id === selectedTrack.id); if (idx > 0) setSelectedTrack(tracks[idx - 1]); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer" title="Previous">
                <SkipBack size={14} />
              </button>
              <button onClick={() => { const idx = tracks.findIndex(t => t.id === selectedTrack.id); if (idx < tracks.length - 1) setSelectedTrack(tracks[idx + 1]); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer" title="Next">
                <SkipForward size={14} />
              </button>

              {/* Track title + artist */}
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{selectedTrack.title || selectedTrack.original_filename}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{selectedTrack.artist || 'Artiste inconnu'}</p>
              </div>

              {/* Analysis badges inline */}
              <div className="flex gap-1.5 ml-auto flex-wrap flex-shrink-0">
                {selectedTrack.analysis?.bpm && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-[10px]">
                    <Activity size={10} className="text-cyan-400" />
                    <span className="font-mono font-bold text-cyan-400">{selectedTrack.analysis.bpm.toFixed(1)}</span>
                    <span className="text-cyan-400/60">BPM</span>
                  </div>
                )}
                {selectedTrack.analysis?.key && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px]">
                    <Music2 size={10} className="text-blue-400" />
                    <span className="font-mono font-bold text-blue-400">{toCamelot(selectedTrack.analysis.key)}</span>
                  </div>
                )}
                {selectedTrack.analysis?.energy != null && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px]" style={{ background: energyToColor(selectedTrack.analysis.energy) + '15', borderColor: energyToColor(selectedTrack.analysis.energy) + '50', borderWidth: '1px' }}>
                    <Zap size={10} style={{ color: energyToColor(selectedTrack.analysis.energy) }} />
                    <span className="font-mono font-bold" style={{ color: energyToColor(selectedTrack.analysis.energy) }}>{energyToRating(selectedTrack.analysis.energy)}</span>
                    <span style={{ color: energyToColor(selectedTrack.analysis.energy), fontSize: '8px' }}>/{energyToLabel(selectedTrack.analysis.energy)}</span>
                  </div>
                )}
                {selectedTrack.duration && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-500/10 border border-gray-500/20 text-[10px]">
                    <Clock size={10} className="text-gray-400" />
                    <span className="font-mono text-gray-400">{msToTime(selectedTrack.duration * 1000)}</span>
                  </div>
                )}
                {selectedTrack.cue_points && selectedTrack.cue_points.length > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-pink-500/10 border border-pink-500/20 text-[10px]">
                    <Layers size={10} className="text-pink-400" />
                    <span className="font-mono font-bold text-pink-400">{selectedTrack.cue_points.length}</span>
                  </div>
                )}
              </div>

              {/* Player extras: playback rate, volume */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[10px] font-mono text-[var(--text-muted)]">{playbackRate}x</span>
                <button onClick={() => setMuted(!muted)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title={muted ? 'Unmute' : 'Mute'}>
                  {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
              </div>
            </div>

            {/* Waveform container */}
            <div className="relative w-full rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]/40 overflow-hidden" style={{ height: 110 }} onWheel={(e) => { e.preventDefault(); if (e.deltaY < 0) setWaveformZoom((z) => Math.min(20, z + 1)); else setWaveformZoom((z) => Math.max(1, z - 1)); }}>
              {/* Waveform toolbar */}
              <div className="flex items-center justify-between mb-1 p-1">
                <div className="flex items-center gap-1">
                  <button onClick={() => setWaveformZoom(Math.max(1, waveformZoom - 1))} className="p-0.5 rounded bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" title="Zoom Out">
                    <ZoomOut size={12} />
                  </button>
                  <span className="text-[9px] text-[var(--text-muted)] min-w-[25px] text-center">{waveformZoom}x</span>
                  <button onClick={() => setWaveformZoom(Math.min(20, waveformZoom + 1))} className="p-0.5 rounded bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" title="Zoom In">
                    <ZoomIn size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowBeatGrid(!showBeatGrid)} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${showBeatGrid ? 'bg-purple-500/30 text-cyan-400/80 border border-purple-500/50' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                    <Grid3X3 size={10} /> Beat
                  </button>
                  <button onClick={() => setShowNotes(!showNotes)} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${showNotes ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                    Notes
                  </button>
                  <button onClick={() => setShowShortcuts(!showShortcuts)} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-[var(--text-muted)] hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors" title="Keyboard shortcuts">
                    <span className="font-bold">?</span>
                  </button>
                </div>
              </div>

              {/* Waveform content */}
              <div className="relative w-full h-full">
                <div ref={waveformRef} className="w-full h-full" style={{ overflow: 'hidden' }} />
                
                {/* Beat Grid Overlay */}
                {showBeatGrid && selectedTrack?.analysis?.bpm && duration > 0 && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
                    {(() => {
                      const bpm = selectedTrack.analysis.bpm;
                      const beatDuration = 60 / bpm;
                      const barDuration = beatDuration * 4;
                      const totalBars = Math.ceil(duration / barDuration);
                      const lines = [];
                      for (let i = 0; i <= totalBars; i++) {
                        const pct = (i * barDuration / duration) * 100;
                        if (pct > 100) break;
                        const isPhrase = i % 8 === 0;
                        const is4Bar = i % 4 === 0;
                        lines.push(
                          <div key={i} className="absolute top-0 bottom-0" style={{
                            left: pct + '%',
                            width: isPhrase ? '2px' : is4Bar ? '1.5px' : '1px',
                            background: isPhrase ? 'rgba(6,182,212,0.5)' : is4Bar ? 'rgba(6,182,212,0.25)' : 'rgba(148,163,184,0.12)',
                          }} />
                        );
                      }
                      return lines;
                    })()}
                  </div>
                )}

                {/* Cue Point Markers Overlay */}
                {selectedTrack?.cue_points && duration > 0 && (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
                    {selectedTrack.cue_points.map((cue, i) => {
                      const timeMs = cue.position_ms || (cue.time ? cue.time * 1000 : 0);
                      if (!timeMs) return null;
                      const pct = (timeMs / (duration * 1000)) * 100;
                      if (pct < 0 || pct > 100) return null;
                      const color = getCueColor(cue.id, i);
                      return (
                        <div key={cue.id || i} className="absolute top-0" style={{ left: pct + '%', transform: 'translateX(-50%)' }}>
                          <div style={{ width: 2, height: '100%', backgroundColor: color, opacity: 0.6 }} />
                          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-white px-0.5 rounded-sm" style={{ backgroundColor: color }}>{i + 1}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Loop Region */}
                {loopIn !== null && loopOut !== null && duration > 0 && (
                  <div className="absolute top-0 bottom-0 pointer-events-none" style={{
                    left: (loopIn / duration) * 100 + '%',
                    width: ((loopOut - loopIn) / duration) * 100 + '%',
                    backgroundColor: 'rgba(34,197,94,0.15)',
                    borderLeft: '2px solid rgb(34,197,94)',
                    borderRight: '2px solid rgb(34,197,94)',
                  }} />
                )}
              </div>
            </div>

            {/* Time display and controls */}
            <div className="flex items-center justify-between mt-2 text-[10px] font-mono text-[var(--text-secondary)]">
              <span>{msToTime(currentTime * 1000)}</span>
              <span onClick={() => setShowRemainingTime(!showRemainingTime)} className="cursor-pointer hover:text-cyan-400 transition-colors">
                {showRemainingTime ? `-${msToTime(Math.max(0, (duration - currentTime)) * 1000)}` : msToTime(duration * 1000)}
              </span>
            </div>

            {/* Loop controls */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => {
                  if (!loopIn) {
                    setLoopIn(currentTime);
                  } else if (!loopOut) {
                    setLoopOut(currentTime);
                    setLoopActive(true);
                  } else {
                    setLoopIn(null);
                    setLoopOut(null);
                    setLoopActive(false);
                  }
                }}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${loopActive ? 'bg-green-500/30 text-green-300 border border-green-500/50' : 'bg-[var(--bg-hover)] text-[var(--text-primary)]'}`}
              >
                {!loopIn ? 'Loop In' : !loopOut ? 'Loop Out' : 'Clear Loop'}
              </button>
              {loopIn !== null && loopOut !== null && (
                <div className="text-[9px] text-[var(--text-muted)] font-mono">
                  {msToTime(loopIn * 1000)} → {msToTime(loopOut * 1000)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BOTTOM TABS ── */}
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden flex-1 flex flex-col">
          {/* Tab buttons */}
          <div className="flex gap-1 p-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] overflow-x-auto">
            {[
              { id: 'cues', label: 'Cues', icon: Layers },
              { id: 'eq', label: 'EQ', icon: SlidersHorizontal },
              { id: 'fx', label: 'FX', icon: Sparkles },
              { id: 'mix', label: 'Mix', icon: Compass },
              { id: 'playlists', label: 'Playlists', icon: Folder },
              { id: 'stats', label: 'Stats', icon: BarChart3 },
              { id: 'history', label: 'History', icon: Clock },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveBottomTab(tab.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                  activeBottomTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <tab.icon size={12} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 p-4 overflow-y-auto">
            {activeBottomTab === 'cues' && selectedTrack && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">Cue Points ({selectedTrack?.cue_points?.length || 0})</div>
                  <button onClick={() => setShowAddCue(!showAddCue)} className="text-[10px] px-2 py-1 rounded bg-blue-600/30 text-blue-400 border border-blue-500/50 hover:bg-blue-600/50 transition-colors">
                    + Add
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedTrack?.cue_points?.map((cue, i) => (
                    <div key={cue.id || i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]/40 text-[10px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getCueColor(cue.id, i) }} />
                        <div className="min-w-0">
                          <p className="font-mono font-bold truncate" style={{ color: getCueColor(cue.id, i) }}>{cue.label || `CUE ${i + 1}`}</p>
                          <p className="text-[9px] text-[var(--text-muted)]">{msToTime((cue.position_ms || (cue.time ? cue.time * 1000 : 0)))}</p>
                        </div>
                      </div>
                      <button onClick={() => deleteCuePoint(selectedTrack.id, cue.id)} className="text-red-500/60 hover:text-red-500 transition-colors" title="Delete">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeBottomTab === 'eq' && (
              <div>
                <div className="text-sm font-semibold text-cyan-400 mb-4">3-Band Equalizer</div>
                <div className="flex gap-8">
                  {[
                    { label: 'LOW', value: eqLow, set: setEqLow, color: 'rgb(239, 68, 68)' },
                    { label: 'MID', value: eqMid, set: setEqMid, color: 'rgb(245, 158, 11)' },
                    { label: 'HIGH', value: eqHigh, set: setEqHigh, color: 'rgb(6, 182, 212)' },
                  ].map((band) => (
                    <div key={band.label} className="text-center">
                      <div className="w-10 h-20 bg-[var(--bg-hover)] rounded-lg relative m-auto mb-2 cursor-pointer" onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const newVal = Math.round(((r.bottom - e.clientY) / r.height) * 24 - 12);
                        band.set(Math.max(-12, Math.min(12, newVal)));
                      }}>
                        <div className="absolute bottom-1/2 left-1 right-1 h-1 rounded-full" style={{ backgroundColor: band.color, transform: `translateY(${(band.value / 24) * 100}%)` }} />
                        <div className="absolute bottom-1/2 left-1 right-1 h-px bg-[var(--border-default)]" />
                      </div>
                      <p className="font-mono text-[11px] font-bold" style={{ color: band.color }}>{band.value > 0 ? '+' : ''}{band.value}dB</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{band.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                  <div className="text-[10px] text-[var(--text-muted)] mb-2">Playback Rate</div>
                  <div className="flex gap-2 mb-3">
                    {[0.75, 1, 1.25, 1.5].map((r) => (
                      <button key={r} onClick={() => setPlaybackRate(r)} className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${playbackRate === r ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                        {r}x
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setEqLow(50); setEqMid(50); setEqHigh(50); setPlaybackRate(1); }} className="px-2 py-1 rounded text-[10px] font-medium bg-orange-500/30 text-orange-400 border border-orange-500/50 hover:bg-orange-500/50 transition-colors w-full">
                    <RotateCcw size={10} className="inline mr-1" /> Reset
                  </button>
                </div>
              </div>
            )}

            {activeBottomTab === 'fx' && (
              <div>
                <div className="text-sm font-semibold text-purple-400 mb-4">Effects</div>
                <div className="grid grid-cols-2 gap-3">
                  {['Reverb', 'Delay', 'Flanger', 'Phaser', 'Lo-Pass', 'Hi-Pass', 'Bitcrush'].map((fx) => (
                    <div key={fx} className="p-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]/40 cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors text-center">
                      <p className="text-[11px] font-medium text-[var(--text-primary)]">{fx}</p>
                      <div className="w-full h-1 bg-[var(--bg-primary)] rounded-full mt-2">
                        <div className="w-0 h-full bg-purple-500 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeBottomTab === 'mix' && (
              <div>
                <div className="text-sm font-semibold text-cyan-400 mb-3">Mix Assistant</div>
                {selectedTrack?.analysis && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-[var(--text-muted)]">Key:</span>
                      <span className="px-2 py-1 rounded bg-blue-600/30 text-blue-400 font-mono font-bold">{toCamelot(selectedTrack.analysis.key)}</span>
                    </div>
                    <div className="text-[9px] text-[var(--text-muted)]">
                      Compatible: {getCompatibleKeys(toCamelot(selectedTrack.analysis.key || '')).join(', ')}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {tracks.filter(t => t.id !== selectedTrack?.id && t.analysis?.bpm).map((t) => {
                    const compatible = selectedTrack && isMixCompatible(selectedTrack, t);
                    return (
                      <div key={t.id} onClick={() => setSelectedTrack(t)} className={`p-2 rounded-lg cursor-pointer transition-colors ${compatible ? 'bg-green-500/10 border border-green-500/30' : 'bg-[var(--bg-hover)] border border-[var(--border-subtle)]/40'}`}>
                        <p className="text-[11px] font-semibold text-[var(--text-primary)]">{t.title}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">{t.artist} · {t.analysis?.bpm.toFixed(1)} BPM · {toCamelot(t.analysis?.key || '')}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeBottomTab === 'playlists' && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div className="text-sm font-semibold text-cyan-400">Playlists</div>
                  <button className="text-[10px] px-2 py-1 rounded bg-blue-600/30 text-blue-400 border border-blue-500/50 hover:bg-blue-600/50 transition-colors">
                    + New
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] text-center py-4">No playlists yet</p>
              </div>
            )}

            {activeBottomTab === 'stats' && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Tracks', value: tracks.length, color: 'blue' },
                  { label: 'Analyzed', value: tracks.filter(t => t.analysis?.bpm).length, color: 'green' },
                  { label: 'Avg BPM', value: Math.round(tracks.filter(t => t.analysis?.bpm).reduce((a, t) => a + t.analysis!.bpm!, 0) / Math.max(1, tracks.filter(t => t.analysis?.bpm).length)), color: 'cyan' },
                  { label: 'Genres', value: new Set(tracks.map(t => t.genre)).size, color: 'purple' },
                ].map((s, i) => (
                  <div key={i} className="p-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)]/40 text-center">
                    <p className={`text-lg font-bold font-mono text-${s.color}-400`}>{s.value}</p>
                    <p className="text-[9px] text-[var(--text-muted)]">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {activeBottomTab === 'history' && (
              <div>
                <div className="text-sm font-semibold text-cyan-400 mb-3">Playback History</div>
                {tracks.slice(0, 5).map((t, i) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[10px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[var(--text-muted)]">#{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text-primary)] truncate">{t.title}</p>
                        <p className="text-[9px] text-[var(--text-muted)] truncate">{t.artist}</p>
                      </div>
                    </div>
                    {t.analysis?.bpm && (
                      <span className="font-mono text-cyan-400">{t.analysis.bpm.toFixed(1)} BPM</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── TRACK LIST ── */}
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-base font-bold text-[var(--text-primary)]">Tracks ({tracks.length})</h2>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-colors flex items-center gap-1">
                  <Upload size={12} /> Upload
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex-1">
                <Search size={12} className="text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search tracks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
              </div>
              <button onClick={() => setGridView(!gridView)} className={`px-2 py-1.5 rounded-lg text-[11px] transition-colors ${gridView ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`} title="Toggle view">
                {gridView ? <ListIcon size={12} /> : <Grid3X3 size={12} />}
              </button>
            </div>
          </div>

          <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(50vh)' }}>
            {gridView ? (
              <div className="grid grid-cols-4 gap-3">
                {tracks.map((track) => (
                  <div key={track.id} onClick={() => setSelectedTrack(track)} className={`p-3 rounded-lg cursor-pointer transition-colors border ${selectedTrack?.id === track.id ? 'bg-blue-500/10 border-blue-500/30' : 'bg-[var(--bg-hover)] border-[var(--border-subtle)]/40 hover:bg-[var(--bg-elevated)]'}`}>
                    <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center mb-2">
                      <Music size={20} className="text-[var(--text-muted)]" />
                    </div>
                    <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{track.title || track.original_filename}</p>
                    <p className="text-[9px] text-[var(--text-muted)] truncate">{track.artist || 'Unknown'}</p>
                    <div className="flex gap-1 mt-2">
                      {track.analysis?.bpm && (
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">{track.analysis.bpm.toFixed(1)}</span>
                      )}
                      {track.analysis?.key && (
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">{toCamelot(track.analysis.key)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0">
                {/* List header */}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-subtle)]/40 mb-1">
                  <div className="col-span-1"></div>
                  <div className="col-span-5">Title</div>
                  <div className="col-span-2 text-center">BPM</div>
                  <div className="col-span-2 text-center">Key</div>
                  <div className="col-span-2 text-center">Energy</div>
                </div>
                {/* List rows */}
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    onClick={() => setSelectedTrack(track)}
                    className={`grid grid-cols-12 gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors border mb-1 ${
                      selectedTrack?.id === track.id
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-[var(--bg-hover)]/50 border-[var(--border-subtle)]/40 hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <div className="col-span-1 flex items-center">
                      {track.analysis?.bpm ? (
                        <CheckCircle2 size={12} className="text-green-400" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-[var(--border-default)]" />
                      )}
                    </div>
                    <div className="col-span-5 min-w-0">
                      <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{track.title || track.original_filename}</p>
                      <p className="text-[9px] text-[var(--text-muted)] truncate">{track.artist || 'Unknown'}</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-[11px] font-mono text-[var(--text-primary)]">{track.analysis?.bpm?.toFixed(1) || '—'}</p>
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-[10px] font-mono text-[var(--text-secondary)]">{toCamelot(track.analysis?.key)}</p>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      {track.analysis?.energy != null && (
                        <div className="w-8 h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                          <div className="h-full" style={{ width: `${Math.min(100, (track.analysis.energy / 10) * 100)}%`, backgroundColor: energyToColor(track.analysis.energy) }} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* File input */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,.aif"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[var(--bg-card)] rounded-xl p-6 w-full max-w-md border border-[var(--border-default)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Keyboard Shortcuts</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {[
                ['Space', 'Play/Pause'],
                ['Left/Right', 'Seek ±5s'],
                ['[/]', 'Loop In/Out'],
                ['M', 'Mute'],
                ['L', 'Toggle Loop'],
                ['0', 'Go to Start'],
                ['+/-', 'Zoom'],
                ['?', 'Show This Menu'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--bg-elevated)]/50">
                  <kbd className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-cyan-400 font-mono text-xs border border-[var(--border-default)]">{key}</kbd>
                  <span className="text-sm text-[var(--text-secondary)]">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
