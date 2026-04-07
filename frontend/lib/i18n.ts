// ── Translations FR / EN ───────────────────────────────────────────────────────
export type Lang = 'fr' | 'en';

export const t: Record<string, Record<Lang, string>> = {
  // TopBar
  'topbar.import':            { fr: 'Import',                en: 'Import' },
  'topbar.export':            { fr: 'Export',                en: 'Export' },
  'topbar.auto':              { fr: 'Auto',                  en: 'Auto' },
  'topbar.search':            { fr: 'Rechercher...',         en: 'Search...' },
  'topbar.to_analyze':        { fr: 'à analyser',            en: 'to analyze' },

  // Sidebar
  'sidebar.library':          { fr: 'Bibliothèque',          en: 'Library' },
  'sidebar.dashboard':        { fr: 'Dashboard',             en: 'Dashboard' },
  'sidebar.stats':            { fr: 'Statistiques',          en: 'Statistics' },
  'sidebar.set_builder':      { fr: 'Set Builder',           en: 'Set Builder' },
  'sidebar.mix_compatible':   { fr: 'Mix compatible',        en: 'Compatible Mix' },
  'sidebar.playlists':        { fr: 'Playlists',             en: 'Playlists' },
  'sidebar.smart_crates':     { fr: 'Smart Crates',          en: 'Smart Crates' },
  'sidebar.gig_prep':         { fr: 'Prépa Gig',             en: 'Gig Prep' },
  'sidebar.dj_tools':         { fr: 'Outils DJ',             en: 'DJ Tools' },
  'sidebar.upload':           { fr: 'Importer',              en: 'Upload' },
  'sidebar.export':           { fr: 'Exporter',              en: 'Export' },
  'sidebar.desktop_app':      { fr: 'App Desktop',           en: 'Desktop App' },
  'sidebar.referrals':        { fr: 'Inviter',               en: 'Invite' },
  'sidebar.settings':         { fr: 'Réglages',              en: 'Settings' },
  'sidebar.admin':            { fr: 'Admin',                 en: 'Admin' },
  'sidebar.logout':           { fr: 'Déconnexion',           en: 'Logout' },
  'sidebar.new_playlist':     { fr: 'Nouvelle playlist...',  en: 'New playlist...' },
  'sidebar.create':           { fr: 'Créer',                 en: 'Create' },
  'sidebar.activity':         { fr: 'Historique',            en: 'Activity' },
  'sidebar.favorites':        { fr: 'Favoris',               en: 'Favorites' },
  'sidebar.duplicates':       { fr: 'Doublons',              en: 'Duplicates' },

  // Track list
  'tracks.title':             { fr: 'Titre',                 en: 'Title' },
  'tracks.artist':            { fr: 'Artiste',               en: 'Artist' },
  'tracks.bpm':               { fr: 'BPM',                   en: 'BPM' },
  'tracks.key':               { fr: 'Tonalité',              en: 'Key' },
  'tracks.mix':               { fr: 'Mix',                   en: 'Mix' },
  'tracks.duration':          { fr: 'Durée',                 en: 'Duration' },
  'tracks.genre':             { fr: 'Genre',                 en: 'Genre' },
  'tracks.energy':            { fr: 'Énergie',               en: 'Energy' },
  'tracks.rating':            { fr: 'Note',                  en: 'Rating' },
  'tracks.no_tracks':         { fr: 'Aucun morceau',         en: 'No tracks' },
  'tracks.import_hint':       { fr: 'Commencez par importer vos pistes audio', en: 'Start by importing your audio tracks' },
  'tracks.search':            { fr: 'Rechercher par titre, artiste, genre…', en: 'Search by title, artist, genre…' },
  'tracks.sort_date':         { fr: 'Date',                  en: 'Date' },
  'tracks.sort_bpm':          { fr: 'BPM',                   en: 'BPM' },
  'tracks.sort_key':          { fr: 'Tonalité',              en: 'Key' },
  'tracks.sort_title':        { fr: 'Titre',                 en: 'Title' },
  'tracks.sort_energy':       { fr: 'Énergie',               en: 'Energy' },
  'tracks.sort_genre':        { fr: 'Genre',                 en: 'Genre' },
  'tracks.sort_duration':     { fr: 'Durée',                 en: 'Duration' },
  'tracks.sort_rating':       { fr: 'Note',                  en: 'Rating' },
  'tracks.analyzed_only':     { fr: 'Analysés uniquement',   en: 'Analyzed only' },
  'tracks.favorites_only':    { fr: 'Favoris uniquement',    en: 'Favorites only' },
  'tracks.files':             { fr: 'fichiers',              en: 'files' },
  'tracks.selected':          { fr: 'sélectionné(s)',        en: 'selected' },

  // Cues tab
  'cues.add_at':              { fr: 'Cue @',                 en: 'Cue @' },
  'cues.no_cue':              { fr: 'Aucun cue — positionne le playhead puis clique le bouton', en: 'No cues — position the playhead and click the button' },
  'cues.select_track':        { fr: 'Sélectionne un morceau', en: 'Select a track' },
  'cues.advanced':            { fr: 'Options avancées',      en: 'Advanced options' },
  'cues.add_type':            { fr: 'Ajouter',               en: 'Add' },
  'cues.slot':                { fr: 'Slot',                  en: 'Slot' },
  'cues.loop_duration':       { fr: 'Durée loop',            en: 'Loop duration' },
  'cues.preview':             { fr: 'Pré-écouter (5s)',      en: 'Preview (5s)' },
  'cues.delete':              { fr: 'Supprimer',             en: 'Delete' },

  // CUE types
  'cue_type.hot_cue':         { fr: 'Hot Cue',               en: 'Hot Cue' },
  'cue_type.loop':            { fr: 'Loop',                  en: 'Loop' },
  'cue_type.fade_in':         { fr: 'Fade In',               en: 'Fade In' },
  'cue_type.fade_out':        { fr: 'Fade Out',              en: 'Fade Out' },
  'cue_type.drop':            { fr: 'Drop',                  en: 'Drop' },
  'cue_type.phrase':          { fr: 'Phrase',                en: 'Phrase' },
  'cue_type.section':         { fr: 'Section',               en: 'Section' },
  'cue_type.load':            { fr: 'Load Point',            en: 'Load Point' },

  // FX tab
  'fx.reset_all':             { fr: 'Réinitialiser tous les FX', en: 'Reset all FX' },

  // EQ tab
  'eq.low':                   { fr: 'BASSE',                 en: 'LOW' },
  'eq.mid':                   { fr: 'MID',                   en: 'MID' },
  'eq.high':                  { fr: 'AIGU',                  en: 'HIGH' },

  // Player
  'player.analyze':           { fr: 'Analyser',              en: 'Analyze' },
  'player.loop':              { fr: 'Loop',                  en: 'Loop' },
  'player.play':              { fr: 'Lecture',                en: 'Play' },
  'player.pause':             { fr: 'Pause',                 en: 'Pause' },

  // Tabs
  'tab.cues':                 { fr: 'Cues',                  en: 'Cues' },
  'tab.beatgrid':             { fr: 'Grid',                  en: 'Grid' },
  'tab.eq':                   { fr: 'EQ',                    en: 'EQ' },
  'tab.stems':                { fr: 'Stems',                 en: 'Stems' },
  'tab.fx':                   { fr: 'FX',                    en: 'FX' },
  'tab.mix':                  { fr: 'Mix',                   en: 'Mix' },
  'tab.info':                 { fr: 'Info',                  en: 'Info' },
  'tab.history':              { fr: 'Historique',             en: 'History' },
  'tab.compare':              { fr: 'VS',                    en: 'VS' },
  'tab.playlists':            { fr: 'Listes',                en: 'Lists' },
  'tab.stats':                { fr: 'Stats',                 en: 'Stats' },
  'tab.notes':                { fr: 'Notes',                 en: 'Notes' },

  // Upload
  'upload.drag_here':         { fr: 'Glisse tes fichiers audio ici', en: 'Drag your audio files here' },
  'upload.formats':           { fr: 'MP3, WAV, FLAC, AIFF, OGG, M4A', en: 'MP3, WAV, FLAC, AIFF, OGG, M4A' },
  'upload.browse':            { fr: 'Parcourir',             en: 'Browse' },
  'upload.desktop_import':    { fr: 'Importer depuis l\'ordinateur', en: 'Import from computer' },
  'upload.start':             { fr: 'Uploader',              en: 'Upload' },
  'upload.uploading':         { fr: 'Upload en cours…',      en: 'Uploading…' },
  'upload.done':              { fr: 'terminé',               en: 'done' },
  'upload.error':             { fr: 'Erreur',                en: 'Error' },
  'upload.file_error':        { fr: 'Erreur lors de la sélection des fichiers', en: 'Error selecting files' },

  // Analysis
  'analysis.in_progress':     { fr: 'Analyse en cours',      en: 'Analyzing' },
  'analysis.local':           { fr: 'LOCAL',                 en: 'LOCAL' },
  'analysis.cloud':           { fr: 'CLOUD',                 en: 'CLOUD' },
  'analysis.done':            { fr: 'Analyse terminée',      en: 'Analysis complete' },
  'analysis.decoding':        { fr: 'Décodage audio…',       en: 'Decoding audio…' },
  'analysis.preparing':       { fr: 'Préparation des données…', en: 'Preparing data…' },
  'analysis.bpm':             { fr: 'Détection du BPM…',     en: 'Detecting BPM…' },
  'analysis.beat_grid':       { fr: 'Grille de beats…',      en: 'Beat grid…' },
  'analysis.energy_profile':  { fr: 'Profil d\'énergie…',    en: 'Energy profile…' },
  'analysis.drops_phrases':   { fr: 'Détection drops & phrases…', en: 'Detecting drops & phrases…' },
  'analysis.sections':        { fr: 'Détection des sections…', en: 'Detecting sections…' },
  'analysis.key':             { fr: 'Analyse de la tonalité…', en: 'Analyzing key…' },
  'analysis.energy':          { fr: 'Calcul de l\'énergie…', en: 'Computing energy…' },
  'analysis.cue_points':      { fr: 'Génération des cue points…', en: 'Generating cue points…' },
  'analysis.finalizing':      { fr: 'Finalisation…',          en: 'Finalizing…' },

  // Export
  'export.rekordbox':         { fr: 'Rekordbox',             en: 'Rekordbox' },
  'export.serato':            { fr: 'Serato',                en: 'Serato' },
  'export.traktor':           { fr: 'Traktor',               en: 'Traktor' },
  'export.m3u':               { fr: 'Playlist M3U',          en: 'M3U Playlist' },
  'export.success':           { fr: 'Export réussi',         en: 'Export successful' },
  'export.error':             { fr: 'Erreur d\'export',      en: 'Export error' },

  // Compare tab
  'compare.title':            { fr: 'Comparaison',           en: 'Comparison' },
  'compare.select':           { fr: 'Choisir un morceau à comparer…', en: 'Choose a track to compare…' },
  'compare.compatibility':    { fr: 'Compatibilité mix',     en: 'Mix compatibility' },
  'compare.best_matches':     { fr: 'Meilleurs matchs',      en: 'Best matches' },
  'compare.excellent':        { fr: 'Excellent',             en: 'Excellent' },
  'compare.good':             { fr: 'Bon',                   en: 'Good' },
  'compare.possible':         { fr: 'Possible',              en: 'Possible' },
  'compare.risky':            { fr: 'Risqué',                en: 'Risky' },

  // Context menu
  'ctx.reanalyze':            { fr: 'Re-analyser',           en: 'Re-analyze' },
  'ctx.copy_title':           { fr: 'Copier le titre',       en: 'Copy title' },
  'ctx.add_tag':              { fr: 'Ajouter un tag',        en: 'Add tag' },
  'ctx.add_fav':              { fr: 'Ajouter aux favoris',   en: 'Add to favorites' },
  'ctx.remove_fav':           { fr: 'Retirer des favoris',   en: 'Remove from favorites' },
  'ctx.reveal_finder':        { fr: 'Révéler dans le Finder', en: 'Reveal in Finder' },
  'ctx.export_rekordbox':     { fr: 'Exporter Rekordbox',    en: 'Export Rekordbox' },
  'ctx.export_serato':        { fr: 'Exporter Serato',       en: 'Export Serato' },
  'ctx.delete':               { fr: 'Supprimer',             en: 'Delete' },

  // Toast messages
  'toast.imported':           { fr: 'importé',               en: 'imported' },
  'toast.analyzed':           { fr: 'analysé !',             en: 'analyzed!' },
  'toast.analysis_error':     { fr: 'Erreur analyse',        en: 'Analysis error' },
  'toast.deleted':            { fr: 'Supprimé',              en: 'Deleted' },
  'toast.cue_created':        { fr: 'Cue point créé',        en: 'Cue point created' },
  'toast.cue_error':          { fr: 'Erreur création cue point', en: 'Error creating cue point' },
  'toast.cue_deleted':        { fr: 'Cue point supprimé',    en: 'Cue point deleted' },
  'toast.saved':              { fr: 'Sauvegardé',            en: 'Saved' },
  'toast.error':              { fr: 'Erreur',                en: 'Error' },
  'toast.duplicate_removed':  { fr: 'Doublon supprimé',      en: 'Duplicate removed' },

  // Onboarding
  'onboard.welcome':          { fr: 'Bienvenue sur CueForge !', en: 'Welcome to CueForge!' },
  'onboard.skip':             { fr: 'Passer le tour',        en: 'Skip tour' },
  'onboard.next':             { fr: 'Suivant',               en: 'Next' },
  'onboard.prev':             { fr: 'Précédent',             en: 'Previous' },
  'onboard.go':               { fr: 'C\'est parti !',        en: 'Let\'s go!' },

  // Dashboard
  'dashboard.title':          { fr: 'Dashboard',             en: 'Dashboard' },
  'dashboard.subtitle':       { fr: 'Analyse et prépare tes sets', en: 'Analyze and prepare your sets' },
  'dashboard.demo':           { fr: 'Mode demo',             en: 'Demo mode' },
  'dashboard.demo_hint':      { fr: 'Importe tes tracks pour commencer l\'analyse !', en: 'Import your tracks to start analyzing!' },
  'dashboard.import':         { fr: 'Importer',              en: 'Import' },

  // General
  'general.save':             { fr: 'Sauvegarder',           en: 'Save' },
  'general.cancel':           { fr: 'Annuler',               en: 'Cancel' },
  'general.delete':           { fr: 'Supprimer',             en: 'Delete' },
  'general.edit':             { fr: 'Modifier',              en: 'Edit' },
  'general.add':              { fr: 'Ajouter',               en: 'Add' },
  'general.close':            { fr: 'Fermer',                en: 'Close' },
  'general.loading':          { fr: 'Chargement...',         en: 'Loading...' },
  'general.no_selection':     { fr: 'Sélectionne un morceau', en: 'Select a track' },
  'general.confirm_delete':   { fr: 'Confirmer la suppression ?', en: 'Confirm deletion?' },
  'general.yes':              { fr: 'Oui',                   en: 'Yes' },
  'general.no':               { fr: 'Non',                   en: 'No' },
};

export function tr(key: string, lang: Lang): string {
  return t[key]?.[lang] ?? t[key]?.['fr'] ?? key;
}
