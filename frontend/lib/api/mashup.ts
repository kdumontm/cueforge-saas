/**
 * Client API Mashup Studio
 *
 * Gère les requêtes vers les endpoints /api/v1/mashup/
 * - Suggestions de pistes compatibles
 * - Création/modification de mashups
 * - Gestion des favoris
 */

import { getToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

// ── Types ──────────────────────────────────────────────────────────────

/**
 * Score de compatibilité harmonique, BPM et énergie entre deux pistes.
 */
export interface CompatibilityScore {
  /** Compatibilité harmonique (0-1) */
  harmonic: number;
  /** Différence BPM normalisée (0-1) */
  bpm_delta: number;
  /** Différence d'énergie absolue (0-10) */
  energy_delta: number;
  /** Score global (0-1) */
  overall: number;
  /** Raisons lisibles de compatibilité */
  reasons: string[];
}

/**
 * Résumé d'une piste (info métadonnées essentielles).
 */
export interface TrackSummary {
  id: number;
  title: string;
  artist: string;
  key?: string; // Camelot code e.g. "8A"
  bpm?: number;
  duration?: number; // en ms
  energy?: number; // 0-10
  artwork_url?: string;
}

/**
 * Suggestion de mashup : piste + score de compatibilité.
 */
export interface MashupSuggestion {
  track_id: number;
  track_title: string;
  track_artist: string;
  track_bpm?: number;
  track_energy?: number;
  track_key?: string;
  track_duration?: number; // optionnel, ajouté si backend l'envoie
  track_artwork_url?: string; // optionnel
  compatibility: CompatibilityScore;
}

/**
 * Filtre de suggestions de mashup.
 */
export interface MashupFilters {
  energy_min?: number;
  energy_max?: number;
  bpm_max_delta?: number;
  playlist_id?: string;
  require_harmonic?: boolean;
  limit?: number;
}

/**
 * Créer un mashup.
 */
export interface MashupCreateInput {
  track_a_id: number;
  track_b_id: number;
  pitch_semitones?: number;
  loop_a_in?: number;
  loop_a_out?: number;
  loop_b_in?: number;
  loop_b_out?: number;
  rating?: number;
  notes?: string;
}

/**
 * Modifier un mashup existant.
 */
export interface MashupUpdateInput {
  pitch_semitones?: number;
  loop_a_in?: number;
  loop_a_out?: number;
  loop_b_in?: number;
  loop_b_out?: number;
  rating?: number;
  notes?: string;
}

/**
 * Mashup complet (réponse API).
 */
export interface Mashup {
  id: number;
  user_id: number;
  track_a_id: number;
  track_b_id: number;
  pitch_semitones: number;
  loop_a_in?: number;
  loop_a_out?: number;
  loop_b_in?: number;
  loop_b_out?: number;
  rating?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Favori de mashup.
 */
export interface FavoriteMashup {
  id: number;
  user_id: number;
  mashup_id: number;
  created_at: string;
}

// ── API Client ─────────────────────────────────────────────────────────

/**
 * Récupère les suggestions de pistes compatibles pour un mashup.
 *
 * @param trackId ID de la piste source (Deck A)
 * @param filters Critères de filtrage optionnels
 * @returns Promesse résolue avec la liste des suggestions
 */
export async function fetchMashupSuggestions(
  trackId: number,
  filters?: MashupFilters
): Promise<MashupSuggestion[]> {
  const token = getToken();
  const params = new URLSearchParams();

  params.set('track_id', trackId.toString());
  if (filters?.energy_min !== undefined) params.set('energy_min', filters.energy_min.toString());
  if (filters?.energy_max !== undefined) params.set('energy_max', filters.energy_max.toString());
  if (filters?.bpm_max_delta !== undefined) params.set('bpm_max_delta', filters.bpm_max_delta.toString());
  if (filters?.playlist_id) params.set('playlist_id', filters.playlist_id);
  if (filters?.require_harmonic !== undefined) params.set('require_harmonic', String(filters.require_harmonic));
  if (filters?.limit) params.set('limit', filters.limit.toString());

  const url = `${API_URL}/mashup/suggest?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new Error(`Erreur suggestions mashup: ${error}`);
  }

  return response.json();
}

/**
 * Crée un nouveau mashup.
 *
 * @param data Données du mashup à créer
 * @returns Promesse résolue avec le mashup créé
 */
export async function createMashup(data: MashupCreateInput): Promise<Mashup> {
  const token = getToken();
  if (!token) throw new Error('Non authentifié');

  const response = await fetch(`${API_URL}/mashup/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new Error(`Erreur création mashup: ${error}`);
  }

  return response.json();
}

/**
 * Récupère un mashup par ID.
 *
 * @param id ID du mashup
 * @returns Promesse résolue avec le mashup
 */
export async function getMashup(id: number): Promise<Mashup> {
  const token = getToken();

  const response = await fetch(`${API_URL}/mashup/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    },
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new Error(`Erreur récupération mashup: ${error}`);
  }

  return response.json();
}

/**
 * Modifie un mashup existant.
 *
 * @param id ID du mashup
 * @param patch Champs à modifier
 * @returns Promesse résolue avec le mashup modifié
 */
export async function updateMashup(id: number, patch: MashupUpdateInput): Promise<Mashup> {
  const token = getToken();
  if (!token) throw new Error('Non authentifié');

  const response = await fetch(`${API_URL}/mashup/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new Error(`Erreur modification mashup: ${error}`);
  }

  return response.json();
}

/**
 * Supprime un mashup.
 *
 * @param id ID du mashup
 */
export async function deleteMashup(id: number): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Non authentifié');

  const response = await fetch(`${API_URL}/mashup/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new Error(`Erreur suppression mashup: ${error}`);
  }
}

/**
 * Ajoute un mashup aux favoris.
 *
 * @param mashupId ID du mashup
 * @returns Promesse résolue avec le favori créé
 */
export async function favoriteMashup(mashupId: number): Promise<FavoriteMashup> {
  const token = getToken();
  if (!token) throw new Error('Non authentifié');

  const response = await fetch(`${API_URL}/mashup/${mashupId}/favorite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new Error(`Erreur ajout favori: ${error}`);
  }

  return response.json();
}

/**
 * Retire un mashup des favoris.
 *
 * @param mashupId ID du mashup
 */
export async function unfavoriteMashup(mashupId: number): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('Non authentifié');

  const response = await fetch(`${API_URL}/mashup/${mashupId}/favorite`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new Error(`Erreur suppression favori: ${error}`);
  }
}

/**
 * Liste les mashups favoris de l'utilisateur.
 *
 * @returns Promesse résolue avec la liste des mashups favoris
 */
export async function listFavoriteMashups(): Promise<Mashup[]> {
  const token = getToken();
  if (!token) throw new Error('Non authentifié');

  const response = await fetch(`${API_URL}/mashup/favorites`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw new Error(`Erreur récupération favoris: ${error}`);
  }

  return response.json();
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Parse une réponse d'erreur API.
 */
async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.detail || JSON.stringify(data);
  } catch {
    return response.statusText || 'Erreur inconnue';
  }
}
