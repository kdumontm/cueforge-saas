/**
 * Accessibility utilities (points 691-700)
 * Screen reader support, keyboard navigation, ARIA, focus management
 */

/**
 * Announce to screen readers
 * Adds a message to a live region that's read aloud
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  if (typeof document === 'undefined') return;

  let region = document.getElementById('a11y-announcement-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'a11y-announcement-region';
    region.setAttribute('aria-live', priority);
    region.setAttribute('aria-atomic', 'true');
    region.className =
      'sr-only absolute -inset-full w-full h-full overflow-hidden whitespace-nowrap border-0 p-0 m-0';
    document.body.appendChild(region);
  }

  // Update aria-live and priority
  region.setAttribute('aria-live', priority);

  // Clear and set message
  region.textContent = '';
  region.textContent = message;

  // Clear after announcement
  setTimeout(() => {
    if (region) region.textContent = '';
  }, 1000);
}

/**
 * Format BPM for screen readers (point 691)
 * "120 beats per minute" not just "120"
 */
export function announceBPM(bpm: number) {
  announce(`${bpm} beats per minute`, 'polite');
}

/**
 * Announce playback position
 * "Playing at 1 minute 30 seconds"
 */
export function announcePlaybackPosition(ms: number) {
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / 60000);
  const timeStr = `${min}:${String(sec).padStart(2, '0')}`;
  announce(`Playing at ${timeStr}`, 'polite');
}

/**
 * Announce cue creation/deletion
 */
export function announceCue(action: 'created' | 'deleted', name: string, position: string) {
  const msg =
    action === 'created' ? `Cue "${name}" created at ${position}` : `Cue "${name}" deleted`;
  announce(msg, 'assertive');
}

/**
 * Create keyboard navigation for lists
 * Handles arrow keys, Enter, Escape
 */
export function createKeyboardNavigation(
  items: { id: string; element: HTMLElement }[],
  options: {
    onSelect?: (id: string) => void;
    onEscape?: () => void;
    loop?: boolean;
  } = {},
) {
  const { onSelect, onEscape, loop = true } = options;
  let currentIndex = 0;

  const focusItem = (index: number) => {
    let nextIndex = index;
    if (loop) {
      nextIndex = (index + items.length) % items.length;
    } else {
      nextIndex = Math.max(0, Math.min(index, items.length - 1));
    }

    const item = items[nextIndex];
    if (item) {
      item.element.focus();
      currentIndex = nextIndex;
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        focusItem(currentIndex - 1);
        break;

      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        focusItem(currentIndex + 1);
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        const item = items[currentIndex];
        if (item && onSelect) {
          onSelect(item.id);
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (onEscape) onEscape();
        break;

      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;

      case 'End':
        e.preventDefault();
        focusItem(items.length - 1);
        break;
    }
  };

  return {
    focusItem,
    handleKeyDown,
    attach: (container: HTMLElement) => {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    },
  };
}

/**
 * Manage focus within a modal/tab
 * Traps focus so Tab/Shift+Tab cycle within the container
 */
export function createFocusTrap(container: HTMLElement) {
  const focusableElements = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift+Tab: go to previous
      if (document.activeElement === firstElement) {
        lastElement?.focus();
        e.preventDefault();
      }
    } else {
      // Tab: go to next
      if (document.activeElement === lastElement) {
        firstElement?.focus();
        e.preventDefault();
      }
    }
  };

  container.addEventListener('keydown', handleKeyDown);

  // Auto-focus first focusable element
  if (firstElement) {
    setTimeout(() => firstElement.focus(), 0);
  }

  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Skip link utility
 * Allows keyboard users to jump to main content
 */
export function createSkipLink(targetId: string) {
  const a = document.createElement('a');
  a.href = `#${targetId}`;
  a.className =
    'skip-link sr-only absolute top-0 left-0 z-50 px-2 py-1 bg-black text-white focus:not-sr-only';
  a.textContent = 'Skip to main content';

  document.body.insertBefore(a, document.body.firstChild);
}

/**
 * Get contrast ratio for accessibility (WCAG)
 * Used to check if waveform colors meet AA/AAA standards
 */
export function getContrastRatio(rgb1: string, rgb2: string): number {
  // Simple RGB parser
  const parseRgb = (rgb: string) => {
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) };
  };

  const c1 = parseRgb(rgb1);
  const c2 = parseRgb(rgb2);

  // Calculate luminance
  const getLum = (c: { r: number; g: number; b: number }) => {
    const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255].map((val) => {
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const lum1 = getLum(c1);
  const lum2 = getLum(c2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * High-contrast waveform color for accessibility (point 691-700)
 */
export function getHighContrastColor(baseColor: string): string {
  // If contrast with white bg < 4.5:1, darken significantly
  const ratio = getContrastRatio(baseColor, 'rgb(255,255,255)');
  if (ratio < 4.5) {
    // Darken by 30%
    const match = baseColor.match(/\d+/g);
    if (match && match.length >= 3) {
      const [r, g, b] = match.map((x) => Math.max(0, parseInt(x) - 76)); // -30% brightness
      return `rgb(${r},${g},${b})`;
    }
  }
  return baseColor;
}
