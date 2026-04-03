// ── Translations FR / EN ───────────────────────────────────────────────────────
export type Lang = 'fr' | 'en';

export const t: Record<string, Record<Lang, string>> = {
  // TopBar
  'topbar.import':        { fr: 'Import',          en: 'Import' },
  'topbar.export':        { fr: 'Export',           en: 'Export' },
  'topbar.auto':          { fr: 'Auto',             en: 'Auto' },
  'topbar.search':        { fr: 'Rechercher...',    en: 'Search...' },
  'topbar.to_analyze':    { fr: 'à analyser',       en: 'to analyze' },

  // Sidebar
  'sidebar.library':      { fr: 'Bibliothèque',     en: 'Library' },
  'sidebar.playlists':    { fr: 'Playlists',        en: 'Playlists' },
  'sidebar.upload':       { fr: 'Importer',         en: 'Upload' },
  'sidebar.export':       { fr: 'Exporter',         en: 'Export' },
  'sidebar.settings':     { fr: 'Réglages',         en: 'Settings' },
  'sidebar.gig_prep':     { fr: 'Gig Prep',         en: 'Gig Prep' },

  // Track list
  'tracks.title':         { fr: 'Titre',            en: 'Title' },
  'tracks.artist':        { fr: 'Artiste',          en: 'Artist' },
  'tracks.bpm':           { fr: 'BPM',              en: 'BPM' },
  'tracks.key':           { fr: 'Clé',              en: 'Key' },
  'tracks.duration':      { fr: 'Durée',            en: 'Duration' },
  'tracks.genre':         { fr: 'Genre',            en: 'Genre' },
  'tracks.energy':        { fr: 'Énergie',          en: 'Energy' },
  'tracks.no_tracks':     { fr: 'Aucun morceau',    en: 'No tracks' },
  'tracks.import_hint':   { fr: 'Importe des fichiers audio pour commencer', en: 'Import audio files to get started' },

  // Cues tab
  'cues.add_at':          { fr: 'Cue @',            en: 'Cue @' },
  'cues.no_cue':          { fr: 'Aucun cue — positionne le playhead puis clique le bouton', en: 'No cues — position the playhead then click the button' },

  // EQ tab
  'eq.low':               { fr: 'BASSE',            en: 'LOW' },
  'eq.mid':               { fr: 'MID',              en: 'MID' },
  'eq.high':              { fr: 'AIGU',             en: 'HIGH' },

  // Player
  'player.analyze':       { fr: 'Analyser',         en: 'Analyze' },
  'player.loop':          { fr: 'Loop',             en: 'Loop' },

  // Tabs
  'tab.cues':             { fr: 'Cues',             en: 'Cues' },
  'tab.beatgrid':         { fr: 'BeatGrid',         en: 'BeatGrid' },
  'tab.eq':               { fr: 'EQ',               en: 'EQ' },
  'tab.stems':            { fr: 'Stems',            en: 'Stems' },
  'tab.fx':               { fr: 'FX',               en: 'FX' },
  'tab.mix':              { fr: 'Mix',              en: 'Mix' },
  'tab.info':             { fr: 'Info',             en: 'Info' },
  'tab.history':          { fr: 'Historique',       en: 'History' },

  // General
  'general.save':         { fr: 'Sauvegarder',      en: 'Save' },
  'general.cancel':       { fr: 'Annuler',          en: 'Cancel' },
  'general.delete':       { fr: 'Supprimer',        en: 'Delete' },
  'general.edit':         { fr: 'Modifier',         en: 'Edit' },
  'general.add':          { fr: 'Ajouter',          en: 'Add' },
  'general.close':        { fr: 'Fermer',           en: 'Close' },
  'general.loading':      { fr: 'Chargement...',    en: 'Loading...' },
  'general.no_selection': { fr: 'Sélectionne un morceau', en: 'Select a track' },
};

export function tr(key: string, lang: Lang): string {
  return t[key]?.[lang] ?? t[key]?.['fr'] ?? key;
}
