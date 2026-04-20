/**
 * Design Tokens — CueForge
 * Palette, espacement, typographie, ombres, radii.
 * Source unique pour tous les composants UI.
 */

/* ─────────────────────────────────────────────────────────────────────────
   PALETTE DE COULEURS
   ───────────────────────────────────────────────────────────────────────── */

export const palette = {
  // Primaire : violet vibrant (signature CueForge)
  primary: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7", // couleur principale
    600: "#9333ea",
    700: "#7e22ce",
    800: "#6b21a8",
    900: "#581c87",
  },

  // Secondaire : cyan (complémentaire, pour accents)
  secondary: {
    50: "#f0f9ff",
    100: "#e0f2fe",
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#06b6d4", // couleur secondaire
    600: "#0891b2",
    700: "#0e7490",
    800: "#155e75",
    900: "#164e63",
  },

  // Teintes neutres (texte, fonds, bordures)
  neutral: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280", // texte moyen
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  // Succès (vert)
  success: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#145231",
  },

  // Avertissement (orange)
  warning: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
  },

  // Danger (rouge)
  danger: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
  },

  // Info (bleu)
  info: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
  },

  // Teintes spéciales
  white: "#ffffff",
  black: "#000000",
  transparent: "transparent",
};

/* ─────────────────────────────────────────────────────────────────────────
   ESPACEMENTS (Échelle modulaire 8px base)
   ───────────────────────────────────────────────────────────────────────── */

export const spacing = {
  0: "0",
  1: "0.25rem", // 4px
  2: "0.5rem", // 8px
  3: "0.75rem", // 12px
  4: "1rem", // 16px
  5: "1.25rem", // 20px
  6: "1.5rem", // 24px
  8: "2rem", // 32px
  10: "2.5rem", // 40px
  12: "3rem", // 48px
  16: "4rem", // 64px
  20: "5rem", // 80px
  24: "6rem", // 96px
  32: "8rem", // 128px
};

/* ─────────────────────────────────────────────────────────────────────────
   RAYONS DE BORDURE (Progression douce)
   ───────────────────────────────────────────────────────────────────────── */

export const radius = {
  none: "0",
  sm: "0.25rem", // 4px
  md: "0.375rem", // 6px
  lg: "0.5rem", // 8px
  xl: "0.75rem", // 12px
  "2xl": "1rem", // 16px
  full: "9999px",
};

/* ─────────────────────────────────────────────────────────────────────────
   OMBRES
   ───────────────────────────────────────────────────────────────────────── */

export const shadows = {
  none: "none",
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
  inset: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)",
};

/* ─────────────────────────────────────────────────────────────────────────
   TYPOGRAPHIE (Échelle modulaire 1.125)
   ───────────────────────────────────────────────────────────────────────── */

export const typography = {
  // Tailles
  sizes: {
    xs: { size: "0.75rem", lineHeight: "1rem" }, // 12px
    sm: { size: "0.875rem", lineHeight: "1.25rem" }, // 14px
    base: { size: "1rem", lineHeight: "1.5rem" }, // 16px
    lg: { size: "1.125rem", lineHeight: "1.75rem" }, // 18px
    xl: { size: "1.25rem", lineHeight: "1.75rem" }, // 20px
    "2xl": { size: "1.5rem", lineHeight: "2rem" }, // 24px
    "3xl": { size: "1.875rem", lineHeight: "2.25rem" }, // 30px
    "4xl": { size: "2.25rem", lineHeight: "2.5rem" }, // 36px
  },

  // Graisses
  weights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Variantes sémantiques
  variants: {
    h1: {
      size: "2.25rem",
      lineHeight: "2.5rem",
      weight: 700,
      letterSpacing: "-0.02em",
    },
    h2: {
      size: "1.875rem",
      lineHeight: "2.25rem",
      weight: 700,
      letterSpacing: "-0.01em",
    },
    h3: {
      size: "1.5rem",
      lineHeight: "2rem",
      weight: 600,
      letterSpacing: "-0.01em",
    },
    h4: {
      size: "1.25rem",
      lineHeight: "1.75rem",
      weight: 600,
    },
    body: {
      size: "1rem",
      lineHeight: "1.5rem",
      weight: 400,
    },
    label: {
      size: "0.875rem",
      lineHeight: "1.25rem",
      weight: 500,
    },
    caption: {
      size: "0.75rem",
      lineHeight: "1rem",
      weight: 400,
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   TRANSITIONS
   ───────────────────────────────────────────────────────────────────────── */

export const transitions = {
  fast: "150ms ease-in-out",
  base: "200ms ease-in-out",
  slow: "300ms ease-in-out",
};

/* ─────────────────────────────────────────────────────────────────────────
   RUPTURES DE RESPONSIVE (Breakpoints Tailwind)
   ───────────────────────────────────────────────────────────────────────── */

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
};

/* ─────────────────────────────────────────────────────────────────────────
   SÉMANTIQUE : couleurs contextuelles (basées sur palette)
   ───────────────────────────────────────────────────────────────────────── */

export const semantic = {
  // Texte
  text: {
    primary: palette.neutral[900],
    secondary: palette.neutral[600],
    tertiary: palette.neutral[500],
    muted: palette.neutral[400],
    inverse: palette.white,
  },

  // Fonds
  bg: {
    primary: palette.white,
    secondary: palette.neutral[50],
    tertiary: palette.neutral[100],
    muted: palette.neutral[200],
  },

  // Bordures
  border: {
    primary: palette.neutral[300],
    secondary: palette.neutral[200],
    muted: palette.neutral[100],
  },

  // États interactifs
  interactive: {
    hover: palette.primary[100],
    focus: palette.primary[200],
    active: palette.primary[600],
    disabled: palette.neutral[200],
  },

  // Sémantique colorée
  success: palette.success[600],
  warning: palette.warning[600],
  danger: palette.danger[600],
  info: palette.info[600],
};

/* ─────────────────────────────────────────────────────────────────────────
   Exports unifiés pour consommation facile
   ───────────────────────────────────────────────────────────────────────── */

export const tokens = {
  palette,
  spacing,
  radius,
  shadows,
  typography,
  transitions,
  breakpoints,
  semantic,
};

export default tokens;
