/**
 * i18n & Accessibility Manager - Points 1221-1250
 * Internationalization, formatting, and accessibility utilities
 */

// ── Translations FR / EN ───────────────────────────────────────────────────────
export type Lang = 'fr' | 'en';
export type Locale = 'en' | 'fr' | 'es' | 'de' | 'ja' | 'zh';

export const t: Record<string, Record<Lang, string>> = {
  // ── TopBar ────────────────────────────────────────────────
  'topbar.import':            { fr: 'Import',                en: 'Import' },
  'topbar.export':            { fr: 'Export',                en: 'Export' },
  'topbar.auto':              { fr: 'Auto-analyse',          en: 'Auto-analyze' },
  'topbar.search':            { fr: 'Rechercher…',           en: 'Search…' },
  'topbar.to_analyze':        { fr: 'à analyser',            en: 'to analyze' },

  // ── Sidebar ───────────────────────────────────────────────
  'sidebar.dashboard':        { fr: 'Dashboard',             en: 'Dashboard' },
  'sidebar.library':          { fr: 'Bibliothèque',          en: 'Library' },
  'sidebar.stats':            { fr: 'Statistiques',          en: 'Statistics' },
  'sidebar.favorites':        { fr: 'Favoris',               en: 'Favorites' },
  'sidebar.set_builder':      { fr: 'Set Builder',           en: 'Set Builder' },
  'sidebar.duplicates':       { fr: 'Doublons',              en: 'Duplicates' },
  'sidebar.mix_compatible':   { fr: 'Mix compatible',        en: 'Compatible Mix' },
  'sidebar.playlists':        { fr: 'Playlists',             en: 'Playlists' },
  'sidebar.smart_crates':     { fr: 'Smart Crates',          en: 'Smart Crates' },
  'sidebar.gig_prep':         { fr: 'Prép. gig',             en: 'Gig Prep' },
  'sidebar.activity':         { fr: 'Activité',              en: 'Activity' },
  'sidebar.dj_tools':         { fr: 'Outils DJ',             en: 'DJ Tools' },
  'sidebar.upload':           { fr: 'Importer',              en: 'Upload' },
  'sidebar.export':           { fr: 'Exporter',              en: 'Export' },
  'sidebar.desktop_app':      { fr: 'App Desktop',           en: 'Desktop App' },
  'sidebar.referrals':        { fr: 'Parrainage',            en: 'Referrals' },
  'sidebar.settings':         { fr: 'Réglages',              en: 'Settings' },
  'sidebar.admin':            { fr: 'Admin',                 en: 'Admin' },
  'sidebar.logout':           { fr: 'Déconnexion',           en: 'Logout' },
  'sidebar.new_playlist':     { fr: 'Nouvelle playlist',     en: 'New playlist' },
  'sidebar.create':           { fr: 'Créer',                 en: 'Create' },

  // ── Tabs ──────────────────────────────────────────────────
  'tab.info':                 { fr: 'Info',                  en: 'Info' },
  'tab.cues':                 { fr: 'Cues',                  en: 'Cues' },
  'tab.beatgrid':             { fr: 'Beatgrid',              en: 'Beatgrid' },
  'tab.mix':                  { fr: 'Mix',                   en: 'Mix' },
  'tab.eq':                   { fr: 'EQ',                    en: 'EQ' },
  'tab.fx':                   { fr: 'FX',                    en: 'FX' },
  'tab.stems':                { fr: 'Stems',                 en: 'Stems' },
  'tab.compare':              { fr: 'Compare',               en: 'Compare' },
  'tab.playlists':            { fr: 'Playlists',             en: 'Playlists' },
  'tab.stats':                { fr: 'Stats',                 en: 'Stats' },
  'tab.notes':                { fr: 'Notes',                 en: 'Notes' },
  'tab.playlistBuilder':      { fr: 'Builder',               en: 'Builder' },
  'tab.settings':             { fr: 'Réglages',              en: 'Settings' },

  // ── Tracks / TrackList ────────────────────────────────────
  'tracks.title':             { fr: 'Titre',                 en: 'Title' },
  'tracks.bpm':               { fr: 'BPM',                   en: 'BPM' },
  'tracks.key':               { fr: 'Key',                   en: 'Key' },
  'tracks.mix':               { fr: 'Mix',                   en: 'Mix' },
  'tracks.energy':            { fr: 'Énergie',               en: 'Energy' },
  'tracks.genre':             { fr: 'Genre',                 en: 'Genre' },
  'tracks.duration':          { fr: 'Durée',                 en: 'Duration' },
  'tracks.search':            { fr: 'Rechercher…',           en: 'Search…' },
  'tracks.no_tracks':         { fr: 'Aucun morceau',         en: 'No tracks' },
  'tracks.files':             { fr: 'morceaux',              en: 'tracks' },
  'tracks.import_hint':       { fr: 'Importe tes fichiers audio pour commencer', en: 'Import your audio files to get started' },
  'tracks.analyzed_only':     { fr: 'Non analysés',          en: 'Unanalyzed' },
  'tracks.sort_date':         { fr: 'Date',                  en: 'Date' },
  'tracks.sort_bpm':          { fr: 'BPM',                   en: 'BPM' },
  'tracks.sort_key':          { fr: 'Tonalité',              en: 'Key' },
  'tracks.sort_title':        { fr: 'Titre',                 en: 'Title' },
  'tracks.sort_energy':       { fr: 'Énergie',               en: 'Energy' },
  'tracks.sort_genre':        { fr: 'Genre',                 en: 'Genre' },
  'tracks.sort_duration':     { fr: 'Durée',                 en: 'Duration' },
  'tracks.sort_rating':       { fr: 'Note',                  en: 'Rating' },

  // ── Cues ──────────────────────────────────────────────────
  'cues.add':                 { fr: 'Ajouter un cue',        en: 'Add Cue' },
  'cues.add_at':              { fr: 'Ajouter cue à',         en: 'Add cue at' },
  'cues.add_type':            { fr: 'Ajouter',               en: 'Add' },
  'cues.select_track':        { fr: 'Sélectionne un morceau pour voir les cue points', en: 'Select a track to view cue points' },
  'cues.no_cue':              { fr: 'Aucun cue point',       en: 'No cue points' },
  'cues.delete':              { fr: 'Supprimer',             en: 'Delete' },
  'cues.preview':             { fr: 'Pré-écouter',           en: 'Preview' },
  'cues.advanced':            { fr: 'Options avancées',      en: 'Advanced options' },
  'cues.loop_duration':       { fr: 'Durée du loop',         en: 'Loop duration' },
  'cues.slot':                { fr: 'Slot',                  en: 'Slot' },

  // ── Player ────────────────────────────────────────────────
  'player.play':              { fr: 'Lecture',                en: 'Play' },
  'player.pause':             { fr: 'Pause',                 en: 'Pause' },
  'player.stop':              { fr: 'Arrêt',                 en: 'Stop' },

  // ── Beatgrid ──────────────────────────────────────────────
  'beatgrid.select_track':    { fr: 'Sélectionne un morceau pour voir le beatgrid', en: 'Select a track to view the beatgrid' },
  'beatgrid.current_bpm':     { fr: 'BPM actuel',            en: 'Current BPM' },
  'beatgrid.locked':          { fr: 'Verrouillé',            en: 'Locked' },
  'beatgrid.unlocked':        { fr: 'Déverrouillé',          en: 'Unlocked' },
  'beatgrid.direct_bpm':      { fr: 'BPM direct',            en: 'Direct BPM' },
  'beatgrid.direct_placeholder': { fr: 'ex: 128.00',         en: 'e.g. 128.00' },
  'beatgrid.half':            { fr: '÷2',                    en: '÷2' },
  'beatgrid.double':          { fr: '×2',                    en: '×2' },
  'beatgrid.preview_title':   { fr: 'Aperçu grille',         en: 'Grid preview' },
  'beatgrid.bars_more':       { fr: '… +{count} mesures',    en: '… +{count} bars' },
  'beatgrid.downbeat_offset': { fr: 'Offset premier temps',  en: 'Downbeat offset' },
  'beatgrid.coarse_100':      { fr: '−100ms',                en: '−100ms' },
  'beatgrid.coarse_plus100':  { fr: '+100ms',                en: '+100ms' },
  'beatgrid.tap_tempo':       { fr: 'Tap Tempo',             en: 'Tap Tempo' },
  'beatgrid.tap_count':       { fr: '{count} taps',          en: '{count} taps' },
  'beatgrid.calculated':      { fr: 'BPM calculé',           en: 'Calculated BPM' },
  'beatgrid.taps':            { fr: '{count} taps',          en: '{count} taps' },
  'beatgrid.reset':           { fr: 'Reset',                 en: 'Reset' },
  'beatgrid.analysis_title':  { fr: 'Analyse du morceau',    en: 'Track analysis' },
  'beatgrid.duration':        { fr: 'Durée',                 en: 'Duration' },
  'beatgrid.bars':            { fr: 'Mesures',               en: 'Bars' },
  'beatgrid.beats':           { fr: 'Temps',                 en: 'Beats' },

  // ── EQ ────────────────────────────────────────────────────
  'eq.play_to_enable':        { fr: 'Lance la lecture pour activer', en: 'Play to enable' },
  'eq.reset':                 { fr: 'Reset EQ',              en: 'Reset EQ' },

  // ── FX ────────────────────────────────────────────────────
  'fx.reset_all':             { fr: 'Reset tous les FX',     en: 'Reset all FX' },

  // ── Stems ─────────────────────────────────────────────────
  'stems.select_track':       { fr: 'Sélectionne un morceau pour la séparation', en: 'Select a track for stem separation' },
  'stems.processing':         { fr: 'Séparation en cours…',  en: 'Separating stems…' },
  'stems.processing_info':    { fr: 'Analyse IA Demucs (~3-5 min)', en: 'AI Demucs analysis (~3-5 min)' },
  'stems.error_title':        { fr: 'Erreur de séparation',  en: 'Separation error' },
  'stems.error_default':      { fr: 'Erreur inconnue',       en: 'Unknown error' },
  'stems.retry':              { fr: 'Réessayer',             en: 'Retry' },
  'stems.hint':               { fr: 'Sépare les stems avec l\'IA Demucs', en: 'Separate stems with Demucs AI' },
  'stems.muted_tooltip':      { fr: 'Muet — clic pour activer', en: 'Muted — click to unmute' },
  'stems.active_tooltip':     { fr: 'Actif — clic pour couper', en: 'Active — click to mute' },
  'stems.complete':           { fr: 'Séparation terminée',   en: 'Separation complete' },
  'stems.download_all':       { fr: 'Télécharger {count} stems', en: 'Download {count} stems' },
  'stems.info':               { fr: 'Infos stems',           en: 'Stems info' },
  'stems.separate':           { fr: 'Séparer les stems',     en: 'Separate stems' },

  // ── Playlists ─────────────────────────────────────────────
  'playlists.new':            { fr: '+ Nouvelle playlist',   en: '+ New playlist' },
  'playlists.placeholder':    { fr: 'Nom de la playlist…',   en: 'Playlist name…' },
  'playlists.create':         { fr: 'Créer',                 en: 'Create' },
  'playlists.cancel':         { fr: 'Annuler',               en: 'Cancel' },
  'playlists.empty_title':    { fr: 'Aucune playlist',       en: 'No playlists' },
  'playlists.empty_subtitle': { fr: 'Crée ta première playlist pour organiser tes morceaux', en: 'Create your first playlist to organize your tracks' },
  'playlists.rename_hint':    { fr: 'Cliquer pour renommer', en: 'Click to rename' },
  'playlists.tracks_label':   { fr: '{count} morceau{plural}', en: '{count} track{plural}' },
  'playlists.delete_confirm': { fr: 'Confirmer',             en: 'Confirm' },
  'playlists.delete_tooltip': { fr: 'Supprimer cette playlist', en: 'Delete this playlist' },

  // ─�