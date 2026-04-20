/**
 * Types Mashup — Partagés entre tous les composants mashup
 *
 * Définitions :
 * - FavoriteMashup : données d'un mashup en favoris
 * - MashupFilters : état des filtres du panneau Idea
 * - TrackSummary : résumé d'un track (nom, artist, key, energy, BPM)
 * - CompatibilityScore : score de compatibilité Camelot (0-100)
 */

/** Résumé d'un track pour affichage */
export interface TrackSummary {
  id: string;
  title: string;
  artist: string;
  camelotKey?: string; // ex: "9A", "5B"
  energy?: number; // 1-10
  bpm?: number;
  spotifyUrl?: string;
}

/** Score de compatibilité Camelot */
export interface CompatibilityScore {
  score: number; // 0-100
  isCompatible: boolean; // true si ≥ 80
  reason?: string; // ex: "Perfect match", "Adjacent keys", "No match"
}

/** Mashup en favoris */
export interface FavoriteMashup {
  id: string;
  trackA: TrackSummary;
  trackB: TrackSummary;
  rating: number; // 1-5
  compatibilityScore: CompatibilityScore;
  createdAt: string; // ISO 8601
  updatedAt?: string;
}

/** État des filtres du panneau Idea Filters */
export interface MashupFilters {
  energyRange: [number, number]; // [min, max] 1-10
  bpmRange: [number, number]; // [min, max]
  playlistId?: string; // filtrer par playlist
  compatKey?: string; // filtrer par clé Camelot (ex: "9A")
}
