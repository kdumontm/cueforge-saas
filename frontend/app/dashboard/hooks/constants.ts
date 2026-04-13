// @ts-nocheck
/**
 * Constantes UI du dashboard DJ.
 * Extraites de useDashboard.ts pour réduire la taille du hook principal.
 */

import {
  Zap, Sparkles, Disc3, Folder, Trash2,
} from 'lucide-react';

export const WAVEFORM_THEMES: Record<string, { wave: string; progress: string; label: string; cursor: string; gradient?: boolean }> = {
  neon: { wave: '#7c3aed', progress: 'rgba(124,58,237,0.45)', cursor: '#ffffff', label: 'Néon', gradient: true },
  sunset: { wave: '#f97316', progress: 'rgba(249,115,22,0.45)', cursor: '#ffffff', label: 'Sunset', gradient: true },
  ocean: { wave: '#06b6d4', progress: 'rgba(6,182,212,0.45)', cursor: '#ffffff', label: 'Océan', gradient: true },
  forest: { wave: '#22c55e', progress: 'rgba(34,197,94,0.45)', cursor: '#ffffff', label: 'Forêt', gradient: true },
  fire: { wave: '#ef4444', progress: 'rgba(239,68,68,0.45)', cursor: '#ffffff', label: 'Feu', gradient: true },
  aurora: { wave: '#a855f7', progress: 'rgba(168,85,247,0.45)', cursor: '#ffffff', label: 'Aurora', gradient: true },
};

export const REKORDBOX_COLORS = [
  { name: "Red", hex: "#E13535" },
  { name: "Orange", hex: "#FF8C00" },
  { name: "Yellow", hex: "#E2D420" },
  { name: "Green", hex: "#1DB954" },
  { name: "Aqua", hex: "#21C8DE" },
  { name: "Blue", hex: "#2B7FFF" },
  { name: "Purple", hex: "#A855F7" },
  { name: "Pink", hex: "#FF69B4" },
];

export const CUE_TYPE_COLORS: Record<string, string> = {
  hot_cue: '#e11d48', loop: '#0891b2', fade_in: '#16a34a', fade_out: '#ea580c',
  load: '#ca8a04', phrase: '#2563eb', drop: '#e11d48', section: '#7c3aed',
};

export const CONTEXT_ACTIONS = [
  { label: 'Analyser Audio (BPM/Key/Cues)', icon: Zap, action: 'analyze' },
  { label: 'Rechercher Metadata (Spotify)', icon: Sparkles, action: 'analyze_metadata' },
  { label: 'Générer les Cue Points', icon: Disc3, action: 'cue_points', separator: true },
  { label: 'Organiser (Catégorie/Tags)', icon: Folder, action: 'organize', separator: true },
  { label: 'Supprimer', icon: Trash2, action: 'delete', separator: true },
];
