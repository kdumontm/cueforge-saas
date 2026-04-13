/**
 * i18n & Accessibility Manager - Points 1221-1250
 * Internationalization, formatting, and accessibility utilities
 */

// ── Translations FR / EN ───────────────────────────────────────────────────────
export type Lang = 'fr' | 'en';
export type Locale = 'en' | 'fr' | 'es' | 'de' | 'ja' | 'zh';

export const t: Record<string, Record<Lang, string>> = {
  'topbar.import':            { fr: 'Import',                en: 'Import' },
  'topbar.export':            { fr: 'Export',                en: 'Export' },
  'sidebar.library':          { fr: 'Bibliothèque',          en: 'Library' },
  'tracks.title':             { fr: 'Titre',                 en: 'Title' },
  'cues.add':                 { fr: 'Ajouter un cue',        en: 'Add Cue' },
  'player.play':              { fr: 'Lecture',                en: 'Play' },
  'general.save':             { fr: 'Sauvegarder',           en: 'Save' },
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
