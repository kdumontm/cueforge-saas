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
  'sidebar.mashup':           { fr: 'Mashup Studio',         en: 'Mashup Studio' },
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

  // ── Smart Crates ──────────────────────────────────────────
  'crates.smart_crates':      { fr: 'Smart Crates',          en: 'Smart Crates' },
  'crates.new':               { fr: '+ Nouveau crate',       en: '+ New crate' },
  'crates.empty':             { fr: 'Aucun smart crate',     en: 'No smart crates' },

  // ── Import / Export ───────────────────────────────────────
  'import.title':             { fr: 'Importer',              en: 'Import' },
  'import.drop_hint':         { fr: 'Déposer des fichiers audio ici', en: 'Drop audio files here' },
  'export.title':             { fr: 'Exporter',              en: 'Export' },
  'export.format':            { fr: 'Format',                en: 'Format' },

  // ── Settings ──────────────────────────────────────────────
  'settings.title':           { fr: 'Réglages',              en: 'Settings' },
  'settings.language':        { fr: 'Langue',                en: 'Language' },
  'settings.theme':           { fr: 'Thème',                 en: 'Theme' },
  'settings.notifications':   { fr: 'Notifications',         en: 'Notifications' },
  'settings.save':            { fr: 'Sauvegarder',           en: 'Save' },

  // ── Error Boundary ────────────────────────────────────────
  'error.boundary_title':     { fr: 'Oups, une erreur est survenue', en: 'Oops, something went wrong' },
  'error.boundary_reload':    { fr: 'Recharger la page',     en: 'Reload the page' },

  // ── Toast messages ────────────────────────────────────────
  'toast.cue_created':        { fr: 'Cue point créé',        en: 'Cue point created' },
  'toast.cue_deleted':        { fr: 'Cue point supprimé',    en: 'Cue point deleted' },
  'toast.cue_error':          { fr: 'Erreur cue point',      en: 'Cue point error' },
  'toast.deleted':            { fr: 'Supprimé',              en: 'Deleted' },
  'toast.analyzed':           { fr: 'analysé ✓',             en: 'analyzed ✓' },
  'toast.analysis_error':     { fr: 'Erreur d\'analyse',     en: 'Analysis error' },

  // ── Login ─────────────────────────────────────────────────
  'login.invalid_credentials': { fr: 'Identifiant ou mot de passe incorrect', en: 'Invalid username or password' },
  'login.email_not_verified': { fr: 'Email non vérifié. Entre ton email ci-dessous pour recevoir un nouveau lien.', en: 'Email not verified. Enter your email below to receive a new link.' },
  'login.connection_failed':  { fr: 'Connexion échouée',     en: 'Login failed' },

  // ── Dashboard actions ──────────────────────────────────────
  'dashboard.clear_library':  { fr: 'Vider la bibliothèque', en: 'Clear library' },
  'dashboard.reanalyze_all':  { fr: 'Ré-analyser tout (BPM v2)', en: 'Re-analyze all (BPM v2)' },

  // ── Common / Actions ──────────────────────────────────────
  // ── Context menu (TrackRow) ──────────────────────────────
  'ctx.reanalyze':            { fr: 'Réanalyser',            en: 'Re-analyze' },
  'ctx.copy_title':           { fr: 'Copier le titre',       en: 'Copy title' },
  'ctx.add_tag':              { fr: 'Ajouter un tag',        en: 'Add tag' },
  'ctx.add_fav':              { fr: 'Ajouter aux favoris',   en: 'Add to favorites' },
  'ctx.remove_fav':           { fr: 'Retirer des favoris',   en: 'Remove from favorites' },
  'ctx.delete':               { fr: 'Supprimer',             en: 'Delete' },
  'ctx.reveal_finder':        { fr: 'Voir dans le Finder',   en: 'Reveal in Finder' },
  'ctx.export_rekordbox':     { fr: 'Exporter Rekordbox',    en: 'Export Rekordbox' },
  'ctx.export_serato':        { fr: 'Exporter Serato',       en: 'Export Serato' },
  'ctx.identify':             { fr: 'Identifier',            en: 'Identify' },
  'ctx.identifying':          { fr: 'Identification…',       en: 'Identifying…' },

  'common.save':              { fr: 'Sauvegarder',           en: 'Save' },
  'common.cancel':            { fr: 'Annuler',               en: 'Cancel' },
  'common.delete':            { fr: 'Supprimer',             en: 'Delete' },
  'common.edit':              { fr: 'Modifier',              en: 'Edit' },
  'common.close':             { fr: 'Fermer',                en: 'Close' },
  'common.loading':           { fr: 'Chargement…',           en: 'Loading…' },
  'common.error':             { fr: 'Erreur',                en: 'Error' },
  'common.success':           { fr: 'Succès',                en: 'Success' },
  'common.confirm':           { fr: 'Confirmer',             en: 'Confirm' },
  'common.back':              { fr: 'Retour',                en: 'Back' },
};

export function tr(key: string, lang: Lang): string {
  return t[key]?.[lang] ?? t[key]?.['fr'] ?? key;
}

/**
 * I18n Manager for formatting and localization
 */
export class I18nManager {
  private locale: Locale = 'en';
  private translations: Map<Locale, Record<string, string>> = new Map();

  constructor(locale: Locale = 'en') {
    this.locale = locale;
    this.initializeTranslations();
  }

  private initializeTranslations(): void {
    this.translations.set('en', {
      'cue.add': 'Add Cue',
      'cue.remove': 'Remove Cue',
      'player.play': 'Play',
      'player.pause': 'Pause',
      'player.stop': 'Stop',
    });

    this.translations.set('fr', {
      'cue.add': 'Ajouter un cue',
      'cue.remove': 'Supprimer le cue',
      'player.play': 'Lecture',
      'player.pause': 'Pause',
      'player.stop': 'Arrêt',
    });

    this.translations.set('es', {
      'cue.add': 'Agregar señal',
      'cue.remove': 'Eliminar señal',
      'player.play': 'Reproducir',
      'player.pause': 'Pausa',
      'player.stop': 'Detener',
    });

    this.translations.set('de', {
      'cue.add': 'Cue hinzufügen',
      'cue.remove': 'Cue entfernen',
      'player.play': 'Abspielen',
      'player.pause': 'Pause',
      'player.stop': 'Stopp',
    });

    this.translations.set('ja', {
      'cue.add': 'キューを追加',
      'cue.remove': 'キューを削除',
      'player.play': '再生',
      'player.pause': '一時停止',
      'player.stop': '停止',
    });

    this.translations.set('zh', {
      'cue.add': '添加提示点',
      'cue.remove': '删除提示点',
      'player.play': '播放',
      'player.pause': '暂停',
      'player.stop': '停止',
    });
  }

  /**
   * Format number according to locale (points 1221-1250)
   */
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    const formatter = new Intl.NumberFormat(this.locale, options);
    return formatter.format(value);
  }

  /**
   * Format date according to locale
   */
  formatDate(
    date: Date | string,
    options?: Intl.DateTimeFormatOptions
  ): string {
    const formatter = new Intl.DateTimeFormat(this.locale, options);
    return formatter.format(new Date(date));
  }

  /**
   * Format duration (mm:ss.ms)
   */
  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Format BPM (ex: "128.00")
   */
  formatBPM(bpm: number): string {
    return this.formatNumber(bpm, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Format musical key (Camelot or Musical notation)
   */
  formatKey(key: string, system: 'camelot' | 'musical' = 'musical'): string {
    if (system === 'camelot') {
      const camelotMap: Record<string, string> = {
        'C': '8B', 'G': '9B', 'D': '10B', 'A': '11B', 'E': '12B',
        'B': '1B', 'F#': '2B', 'C#': '3B', 'G#': '4B', 'D#': '5B',
        'A#': '6B', 'F': '7B', 'Cm': '5A', 'Gm': '6A', 'Dm': '7A',
        'Am': '8A', 'Em': '9A', 'Bm': '10A', 'F#m': '11A', 'C#m': '12A',
        'G#m': '1A', 'D#m': '2A', 'A#m': '3A', 'Fm': '4A',
      };
      return camelotMap[key] || key;
    }

    return key;
  }

  /**
   * Pluralize string based on count and locale
   */
  pluralize(word: string, count: number): string {
    if (count === 1) return word;

    if (this.locale === 'en') {
      if (word.endsWith('y')) {
        return word.slice(0, -1) + 'ies';
      }
      if (word.endsWith('s') || word.endsWith('x')) {
        return word + 'es';
      }
      return word + 's';
    }

    if (this.locale === 'fr') {
      if (word.endsWith('al')) {
        return word.slice(0, -2) + 'aux';
      }
      if (word.endsWith('eau') || word.endsWith('eu')) {
        return word;
      }
      return word + 's';
    }

    return word;
  }

  /**
   * Get text direction (LTR/RTL) for current locale
   */
  getDirection(): 'ltr' | 'rtl' {
    const rtlLocales = ['ar', 'he', 'fa', 'ur'];
    return rtlLocales.includes(this.locale) ? 'rtl' : 'ltr';
  }

  /**
   * Get translation for key
   */
  t(key: string, defaultValue?: string): string {
    const dict = this.translations.get(this.locale);
    return dict?.[key] || defaultValue || key;
  }

  /**
   * Set locale
   */
  setLocale(locale: Locale): void {
    this.locale = locale;
    document.documentElement.lang = locale;
    document.documentElement.dir = this.getDirection();
  }

  /**
   * Get current locale
   */
  getLocale(): Locale {
    return this.locale;
  }

  /**
   * Add translations
   */
  addTranslations(locale: Locale, translations: Record<string, string>): void {
    const existing = this.translations.get(locale) || {};
    this.translations.set(locale, { ...existing, ...translations });
  }
}

/**
 * Accessibility Manager (points 1231-1250)
 */
export class AccessibilityManager {
  /**
   * Announce message to screen readers via aria-live region
   */
  static announceToScreenReader(
    message: string,
    priority: 'polite' | 'assertive' = 'polite'
  ): void {
    let liveRegion = document.getElementById('a11y-announcer');

    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'a11y-announcer';
      liveRegion.setAttribute('aria-live', priority);
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.setAttribute('class', 'sr-only');
      document.body.appendChild(liveRegion);
    }

    liveRegion.setAttribute('aria-live', priority);
    liveRegion.textContent = message;

    setTimeout(() => {
      liveRegion!.textContent = '';
    }, 1000);
  }

  /**
   * Trap focus within modal/dialog
   */
  static trapFocus(container: HTMLElement): (() => void) {
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          event.preventDefault();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }

  /**
   * Add skip to main content link
   */
  static addSkipNavigation(mainContentId: string): void {
    const skipLink = document.createElement('a');
    skipLink.href = `#${mainContentId}`;
    skipLink.textContent = 'Skip to main content';
    skipLink.setAttribute('class', 'skip-nav-link');
    skipLink.style.position = 'absolute';
    skipLink.style.top = '-40px';
    skipLink.style.left = '0';
    skipLink.style.zIndex = '100';

    skipLink.addEventListener('focus', () => {
      skipLink.style.top = '0';
    });

    skipLink.addEventListener('blur', () => {
      skipLink.style.top = '-40px';
    });

    document.body.insertBefore(skipLink, document.body.firstChild);
  }

  /**
   * Check if user prefers reduced motion
   */
  static prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Apply reduced motion styles
   */
  static applyReducedMotion(): void {
    if (this.prefersReducedMotion()) {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Check if user prefers high contrast (prefers-contrast)
   */
  static prefersHighContrast(): boolean {
    return window.matchMedia('(prefers-contrast: more)').matches;
  }

  /**
   * Watch for contrast preference changes
   */
  static onContrastChange(callback: (prefers: boolean) => void): (() => void) {
    const mediaQuery = window.matchMedia('(prefers-contrast: more)');
    const handler = (e: MediaQueryListEvent) => {
      callback(e.matches);
    };

    mediaQuery.addEventListener('change', handler);

    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }

  /**
   * Watch for reduced motion preference changes
   */
  static onMotionChange(callback: (prefers: boolean) => void): (() => void) {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => {
      callback(e.matches);
    };

    mediaQuery.addEventListener('change', handler);

    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }

  /**
   * Ensure keyboard accessibility on element
   */
  static ensureKeyboardAccessible(element: HTMLElement): void {
    if (!element.hasAttribute('tabindex')) {
      if (
        !['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(
          element.tagName
        )
      ) {
        element.setAttribute('tabindex', '0');
      }
    }

    if (element.onclick || element.getAttribute('role') === 'button') {
      element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          element.click();
          e.preventDefault();
        }
      });
    }
  }

  /**
   * Set ARIA label
   */
  static setAriaLabel(element: HTMLElement, label: string): void {
    element.setAttribute('aria-label', label);
  }

  /**
   * Set ARIA description
   */
  static setAriaDescription(element: HTMLElement, description: string): void {
    const descId = `aria-desc-${Math.random().toString(36).slice(2)}`;
    const descElement = document.createElement('div');
    descElement.id = descId;
    descElement.textContent = description;
    descElement.style.display = 'none';

    element.parentNode?.insertBefore(descElement, element.nextSibling);
    element.setAttribute('aria-describedby', descId);
  }

  /**
   * Mark element as required
   */
  static markRequired(element: HTMLElement): void {
    element.setAttribute('aria-required', 'true');
    const label = element.getAttribute('aria-label');
    if (label) {
      element.setAttribute('aria-label', `${label} (required)`);
    }
  }

  /**
   * Set loading state
   */
  static setLoading(element: HTMLElement, isLoading: boolean): void {
    element.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    if (isLoading) {
      element.setAttribute('aria-label', `${element.getAttribute('aria-label')} (loading)`);
    }
  }
}

export default { I18nManager, AccessibilityManager };
