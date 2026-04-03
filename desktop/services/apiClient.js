'use strict';
/**
 * apiClient.js — Client API complet pour CueForge Desktop
 * Miroir de frontend/lib/api.ts (web) — même base URL, mêmes endpoints.
 * Utilise le token stocké dans la DB locale (settings.auth_token).
 */

const { getSetting } = require('./database');

const API_URL = 'https://cueforge-saas-production.up.railway.app/api/v1';
const TIMEOUT = 15000; // 15s par défaut
const UPLOAD_TIMEOUT = 120000; // 2 min pour les uploads

// ─── Helpers ─────────────────────────────────────────────────

function authHeaders(extra = {}) {
  const token = getSetting('auth_token');
  if (!token) throw new Error('Non connecté');
  return { Authorization: `Bearer ${token}`, ...extra };
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

async function request(endpoint, options = {}, timeout = TIMEOUT) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...jsonHeaders(), ...(options.headers || {}) },
    signal: AbortSignal.timeout(timeout),
  });
  if (res.status === 401) {
    const err = new Error('Session expirée');
    err.code = 'TOKEN_EXPIRED';
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Erreur ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  // Pour les exports XML/texte/binaire
  return res;
}

async function requestText(endpoint, options = {}) {
  const res = await request(endpoint, options);
  if (res instanceof Response) return res.text();
  return JSON.stringify(res);
}

async function requestBlob(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Erreur ${res.status}`);
  }
  return res.blob();
}

async function uploadFormData(endpoint, formData, timeout = UPLOAD_TIMEOUT) {
  const url = `${API_URL}${endpoint}`;
  const token = getSetting('auth_token');
  if (!token) throw new Error('Non connecté');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Erreur ${res.status}`);
  }
  return res.json();
}


// ═══════════════════════════════════════════════════════════════
// ████  TRACKS  ████
// ═══════════════════════════════════════════════════════════════

const tracks = {
  /** Upload un fichier audio */
  upload(filePath) {
    const fs = require('fs');
    const path = require('path');
    const { FormData, File } = require('undici');
    const buf = fs.readFileSync(filePath);
    const file = new File([buf], path.basename(filePath));
    const form = new FormData();
    form.append('file', file);
    return uploadFormData('/tracks/upload', form);
  },

  /** Liste des tracks avec pagination */
  list(page = 1, limit = 50) {
    return request(`/tracks?page=${page}&limit=${limit}`);
  },

  /** Détail d'une track */
  get(trackId) {
    return request(`/tracks/${trackId}`);
  },

  /** Mise à jour metadata */
  update(trackId, data) {
    return request(`/tracks/${trackId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Supprimer une track */
  delete(trackId) {
    return request(`/tracks/${trackId}`, { method: 'DELETE' });
  },

  /** URL audio pour lecture */
  audioUrl(trackId) {
    return request(`/tracks/${trackId}/audio`);
  },

  // ── Analyse & Identification ──

  analyze(trackId) {
    return request(`/tracks/${trackId}/analyze`, { method: 'POST' });
  },

  cleanTitle(trackId) {
    return request(`/tracks/${trackId}/clean-title`, { method: 'POST' });
  },

  parseRemix(trackId) {
    return request(`/tracks/${trackId}/parse-remix`, { method: 'POST' });
  },

  detectGenre(trackId) {
    return request(`/tracks/${trackId}/detect-genre`, { method: 'POST' });
  },

  identify(trackId) {
    return request(`/tracks/${trackId}/identify`, { method: 'POST' });
  },

  identifySearch(trackId) {
    return request(`/tracks/${trackId}/identify/search`, { method: 'POST' });
  },

  spotifyLookup(trackId) {
    return request(`/tracks/${trackId}/spotify-lookup`, { method: 'POST' });
  },

  spotifyApply(trackId) {
    return request(`/tracks/${trackId}/spotify-apply`, { method: 'POST' });
  },

  fixTags(trackId) {
    return request(`/tracks/${trackId}/fix-tags`, { method: 'POST' });
  },

  // ── Compatibilité harmonique ──

  compatible(trackId, limit = 10) {
    return request(`/tracks/${trackId}/compatible?limit=${limit}`);
  },

  // ── Historique de lecture ──

  recordPlay(trackId, context = 'desktop') {
    return request(`/tracks/${trackId}/play`, {
      method: 'POST',
      body: JSON.stringify({ context }),
    });
  },

  getHistory(trackId) {
    return request(`/tracks/${trackId}/history`);
  },

  clearHistory() {
    return request('/tracks/history', { method: 'DELETE' });
  },

  // ── Beatgrid ──

  getBeatgrid(trackId) {
    return request(`/tracks/${trackId}/beatgrid`);
  },

  updateBeatgrid(trackId, data) {
    return request(`/tracks/${trackId}/beatgrid`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // ── Organisation ──

  updateMetadata(trackId, data) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== null) params.append(k, v);
    }
    return request(`/tracks/${trackId}/metadata?${params.toString()}`, { method: 'PATCH' });
  },

  getCategories() {
    return request('/tracks/categories');
  },

  getTags() {
    return request('/tracks/tags');
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  CUE POINTS  ████
// ═══════════════════════════════════════════════════════════════

const cues = {
  /** Liste des cue points d'une track */
  list(trackId) {
    return request(`/cues/${trackId}/points`);
  },

  /** Créer un cue point */
  create(trackId, data) {
    return request(`/cues/${trackId}/points`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Mettre à jour un cue point */
  update(cueId, data) {
    return request(`/cues/points/${cueId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Supprimer un cue point */
  delete(cueId) {
    return request(`/cues/points/${cueId}`, { method: 'DELETE' });
  },

  /** Copier les cues d'une autre track */
  copyCues(trackId, sourceTrackId, includeLoops = true) {
    return request(`/cues/${trackId}/copy-cues`, {
      method: 'POST',
      body: JSON.stringify({ source_track_id: sourceTrackId, include_loops: includeLoops }),
    });
  },

  /** Générer des cues automatiquement (IA) */
  generate(trackId) {
    return request(`/cues/${trackId}/generate`, { method: 'POST' });
  },

  /** Analyse complète d'une track */
  getAnalysis(trackId) {
    return request(`/cues/${trackId}/analysis`);
  },

  // ── Rules ──

  getRules(trackId) {
    return request(`/cues/${trackId}/rules`);
  },

  createRule(trackId, data) {
    return request(`/cues/${trackId}/rules`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateRule(trackId, ruleId, data) {
    return request(`/cues/${trackId}/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteRule(trackId, ruleId) {
    return request(`/cues/${trackId}/rules/${ruleId}`, { method: 'DELETE' });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  HOT CUES  ████
// ═══════════════════════════════════════════════════════════════

const hotCues = {
  list(trackId) {
    return request(`/tracks/${trackId}/hot-cues`);
  },

  create(trackId, data) {
    return request(`/tracks/${trackId}/hot-cues`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(trackId, cueId, data) {
    return request(`/tracks/${trackId}/hot-cues/${cueId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(trackId, cueId) {
    return request(`/tracks/${trackId}/hot-cues/${cueId}`, { method: 'DELETE' });
  },

  reorder(trackId, items) {
    return request(`/tracks/${trackId}/hot-cues/reorder`, {
      method: 'POST',
      body: JSON.stringify(items),
    });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  LOOPS  ████
// ═══════════════════════════════════════════════════════════════

const loops = {
  list(trackId) {
    return request(`/cues/${trackId}/loops`);
  },

  create(trackId, data) {
    return request(`/cues/${trackId}/loops`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(loopId, data) {
    return request(`/cues/loops/${loopId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(loopId) {
    return request(`/cues/loops/${loopId}`, { method: 'DELETE' });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  WAVEFORMS  ████
// ═══════════════════════════════════════════════════════════════

const waveforms = {
  get(trackId) {
    return request(`/waveforms/${trackId}`);
  },

  generate(trackId) {
    return request(`/waveforms/${trackId}/generate`, { method: 'POST' });
  },

  regenerate(trackId) {
    return request(`/waveforms/${trackId}/regenerate`, { method: 'POST' });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  PLAYLISTS  ████
// ═══════════════════════════════════════════════════════════════

const playlists = {
  list(parentId = null) {
    const qs = parentId ? `?parent_id=${parentId}` : '';
    return request(`/playlists${qs}`);
  },

  get(playlistId) {
    return request(`/playlists/${playlistId}`);
  },

  create(data) {
    return request('/playlists', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(playlistId, data) {
    return request(`/playlists/${playlistId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(playlistId) {
    return request(`/playlists/${playlistId}`, { method: 'DELETE' });
  },

  addTracks(playlistId, trackIds) {
    return request(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ track_ids: trackIds }),
    });
  },

  removeTrack(playlistId, trackId) {
    return request(`/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' });
  },

  reorder(playlistId, items) {
    return request(`/playlists/${playlistId}/reorder`, {
      method: 'POST',
      body: JSON.stringify(items),
    });
  },

  duplicate(playlistId) {
    return request(`/playlists/${playlistId}/duplicate`, { method: 'POST' });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  SMART CRATES  ████
// ═══════════════════════════════════════════════════════════════

const crates = {
  list() {
    return request('/crates');
  },

  get(crateId) {
    return request(`/crates/${crateId}`);
  },

  create(data) {
    return request('/crates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(crateId, data) {
    return request(`/crates/${crateId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(crateId) {
    return request(`/crates/${crateId}`, { method: 'DELETE' });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  DJ SETS  ████
// ═══════════════════════════════════════════════════════════════

const sets = {
  list() {
    return request('/sets');
  },

  get(setId) {
    return request(`/sets/${setId}`);
  },

  create(data) {
    return request('/sets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(setId, data) {
    return request(`/sets/${setId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(setId) {
    return request(`/sets/${setId}`, { method: 'DELETE' });
  },

  addTrack(setId, data) {
    return request(`/sets/${setId}/tracks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeTrack(setId, trackId) {
    return request(`/sets/${setId}/tracks/${trackId}`, { method: 'DELETE' });
  },

  reorder(setId, items) {
    return request(`/sets/${setId}/reorder`, {
      method: 'POST',
      body: JSON.stringify(items),
    });
  },

  suggestNext(setId, limit = 5) {
    return request(`/sets/${setId}/suggest-next?limit=${limit}`);
  },

  getStats(setId) {
    return request(`/sets/${setId}/stats`);
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  ANALYTICS  ████
// ═══════════════════════════════════════════════════════════════

const analytics = {
  get() {
    return request('/analytics');
  },

  recordPlay(trackId) {
    return request(`/analytics/${trackId}/play`, { method: 'POST' });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  EXPORT  ████
// ═══════════════════════════════════════════════════════════════

const exportApi = {
  rekordbox(trackId) {
    return requestText(`/export/${trackId}/rekordbox`);
  },

  rekordboxJson(trackId) {
    return request(`/export/${trackId}/rekordbox/json`);
  },

  rekordboxBatch(trackIds, playlistName = 'CueForge Export') {
    return requestText('/export/rekordbox/batch', {
      method: 'POST',
      body: JSON.stringify({ track_ids: trackIds, playlist_name: playlistName }),
    });
  },

  rekordboxAll(playlistName = 'CueForge Library') {
    return requestText(`/export/rekordbox/all?playlist_name=${encodeURIComponent(playlistName)}`);
  },

  serato(trackId) {
    return requestBlob(`/export/${trackId}/serato`);
  },

  playlistM3u(playlistId) {
    return requestText(`/export/playlist/${playlistId}/m3u`);
  },

  setRekordbox(setId) {
    return requestText(`/export/set/${setId}/rekordbox`);
  },

  setM3u(setId) {
    return requestText(`/export/set/${setId}/m3u`);
  },

  allFormats(trackId) {
    return request(`/export/${trackId}/all`);
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  IMPORT DJ  ████
// ═══════════════════════════════════════════════════════════════

const importDj = {
  rekordbox(filePath) {
    const fs = require('fs');
    const path = require('path');
    const { FormData, File } = require('undici');
    const buf = fs.readFileSync(filePath);
    const file = new File([buf], path.basename(filePath));
    const form = new FormData();
    form.append('file', file);
    return uploadFormData('/import/rekordbox', form);
  },

  serato(filePath) {
    const fs = require('fs');
    const path = require('path');
    const { FormData, File } = require('undici');
    const buf = fs.readFileSync(filePath);
    const file = new File([buf], path.basename(filePath));
    const form = new FormData();
    form.append('file', file);
    return uploadFormData('/import/serato', form);
  },

  traktor(filePath) {
    const fs = require('fs');
    const path = require('path');
    const { FormData, File } = require('undici');
    const buf = fs.readFileSync(filePath);
    const file = new File([buf], path.basename(filePath));
    const form = new FormData();
    form.append('file', file);
    return uploadFormData('/import/traktor', form);
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  ADVANCED (Stems, Duplicates, Auto-cues)  ████
// ═══════════════════════════════════════════════════════════════

const advanced = {
  stemsCheck() {
    return request('/advanced/stems/check');
  },

  stemsStart(trackId) {
    return request(`/advanced/stems/${trackId}`, { method: 'POST' });
  },

  stemsStatus(trackId) {
    return request(`/advanced/stems/${trackId}/status`);
  },

  stemFile(trackId, stemName) {
    return requestBlob(`/advanced/stems/${trackId}/file/${stemName}`);
  },

  duplicates(method = 'title', threshold = 0.8) {
    return request(`/advanced/duplicates?method=${method}&threshold=${threshold}`);
  },

  autoCues(trackId, style = 'standard') {
    return request(`/advanced/auto-cues/${trackId}?style=${style}`, { method: 'POST' });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  MIX ANALYZER  ████
// ═══════════════════════════════════════════════════════════════

const mixAnalyzer = {
  upload(filePath) {
    const fs = require('fs');
    const path = require('path');
    const { FormData, File } = require('undici');
    const buf = fs.readFileSync(filePath);
    const file = new File([buf], path.basename(filePath));
    const form = new FormData();
    form.append('file', file);
    return uploadFormData('/mix-analyzer/upload', form);
  },

  getStatus(jobId) {
    return request(`/mix-analyzer/${jobId}`);
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  BILLING  ████
// ═══════════════════════════════════════════════════════════════

const billing = {
  getPlans() {
    return request('/billing/plans');
  },

  getCurrent() {
    return request('/billing/current');
  },

  getUsage() {
    return request('/billing/usage');
  },

  subscribe(planId, interval = 'month') {
    return request('/billing/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId, interval }),
    });
  },

  getPortalUrl() {
    return request('/billing/portal', { method: 'POST' });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  DOWNLOADS (Desktop App Updates)  ████
// ═══════════════════════════════════════════════════════════════

const downloads = {
  getInfo() {
    return request('/downloads');
  },

  getConfig() {
    return request('/downloads/config');
  },

  updateConfig(data) {
    return request('/downloads/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};


// ═══════════════════════════════════════════════════════════════
// ████  MODULE EXPORTS  ████
// ═══════════════════════════════════════════════════════════════

module.exports = {
  API_URL,
  tracks,
  cues,
  hotCues,
  loops,
  waveforms,
  playlists,
  crates,
  sets,
  analytics,
  export: exportApi,
  import: importDj,
  advanced,
  mixAnalyzer,
  billing,
  downloads,
};
