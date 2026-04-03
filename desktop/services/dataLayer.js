'use strict';
/**
 * dataLayer.js — Couche de données hybride Local SQLite + API Cloud
 *
 * Stratégie :
 *   ONLINE  → API cloud en priorité, cache local mis à jour
 *   OFFLINE → SQLite local, changements marqués "dirty" pour sync ultérieure
 *
 * Le renderer appelle toujours les mêmes méthodes (via IPC),
 * cette couche décide automatiquement d'où viennent les données.
 */

const db = require('./database');
const api = require('./apiClient');
const { getSetting } = db;

// ─── Helpers ─────────────────────────────────────────────

let _online = true; // statut réseau estimé

function isAuthenticated() {
  return !!getSetting('auth_token');
}

function isOnline() {
  return _online && isAuthenticated();
}

/** Tester la connectivité (un simple GET /auth/me) */
async function checkConnectivity() {
  if (!isAuthenticated()) { _online = false; return false; }
  try {
    await api.tracks.list(1, 1);
    _online = true;
  } catch {
    _online = false;
  }
  return _online;
}

function setOnline(val) { _online = !!val; }

// ═══════════════════════════════════════════════════════════
// ████  TRACKS  ████
// ═══════════════════════════════════════════════════════════

const tracks = {
  /**
   * Récupérer toutes les tracks.
   * ONLINE  → fetch cloud, merge dans SQLite local, retourner le tout
   * OFFLINE → retourner le cache SQLite
   */
  async list(page = 1, limit = 200) {
    if (isOnline()) {
      try {
        const remote = await api.tracks.list(page, limit);
        // Stocker/mettre à jour en local
        const items = remote.items || remote.tracks || remote;
        if (Array.isArray(items)) {
          for (const t of items) {
            db.upsertFromRemote({
              remote_id: t.id,
              file_path: t.file_path || `remote:${t.id}`,
              file_name: t.file_name || t.title || 'Unknown',
              title: t.title,
              artist: t.artist,
              album: t.album,
              duration: t.duration,
              bpm: t.bpm,
              key_name: t.key || t.key_name || t.musical_key,
              energy: t.energy || t.energy_level,
              format: t.format,
              file_size: t.file_size,
              analyzed: t.analyzed,
            });
          }
        }
        return { source: 'cloud', data: remote };
      } catch (err) {
        _online = false;
        // Fallback local
      }
    }
    const local = db.getAllTracks().filter(t => !t.deleted);
    return { source: 'local', data: local };
  },

  /** Détail d'un track */
  async get(trackId) {
    if (isOnline()) {
      try {
        const remote = await api.tracks.get(trackId);
        return { source: 'cloud', data: remote };
      } catch { /* fallback */ }
    }
    // trackId peut être un remote_id ou un local id
    const local = db.getTrack(trackId) || db.getTrackByRemoteId(trackId);
    return { source: 'local', data: local };
  },

  /** Upload un fichier : envoie au cloud + sauvegarde locale */
  async upload(filePath) {
    const path = require('path');
    const fs = require('fs');
    const stat = fs.statSync(filePath);

    // Toujours sauvegarder localement d'abord
    const localId = db.upsertTrack({
      file_path: filePath,
      file_name: path.basename(filePath),
      title: path.basename(filePath, path.extname(filePath)),
      artist: null,
      album: null,
      duration: 0,
      format: path.extname(filePath).slice(1).toUpperCase(),
      file_size: stat.size,
    });
    db.markDirty(localId);

    // Si online, upload vers le cloud
    if (isOnline()) {
      try {
        const remote = await api.tracks.upload(filePath);
        const remoteId = remote.id || remote.track_id;
        if (remoteId) db.setRemoteId(localId, remoteId);
        return { source: 'cloud', data: remote, localId };
      } catch (err) {
        // Upload cloud échoué — reste en local "dirty" pour sync plus tard
        return { source: 'local', data: db.getTrack(localId), localId, cloudError: err.message };
      }
    }
    return { source: 'local', data: db.getTrack(localId), localId };
  },

  /** Mettre à jour un track */
  async update(trackId, data) {
    if (isOnline()) {
      try {
        const remote = await api.tracks.update(trackId, data);
        // Mettre à jour le cache local aussi
        const local = db.getTrackByRemoteId(trackId);
        if (local) {
          db.markSynced(local.id);
        }
        return { source: 'cloud', data: remote };
      } catch { /* fallback */ }
    }
    // Mise à jour locale — marquer dirty
    const local = db.getTrack(trackId) || db.getTrackByRemoteId(trackId);
    if (local) {
      // Update simple en local
      const d = db.getDb();
      const fields = [];
      const vals = [];
      for (const [k, v] of Object.entries(data)) {
        if (['title', 'artist', 'album', 'bpm', 'key_name', 'energy'].includes(k)) {
          fields.push(`${k} = ?`);
          vals.push(v);
        }
      }
      if (fields.length) {
        vals.push(local.id);
        d.prepare(`UPDATE tracks SET ${fields.join(', ')}, dirty = 1 WHERE id = ?`).run(...vals);
      }
      return { source: 'local', data: db.getTrack(local.id) };
    }
    throw new Error('Track non trouvé');
  },

  /** Supprimer un track */
  async delete(trackId) {
    if (isOnline()) {
      try {
        await api.tracks.delete(trackId);
        // Purger le cache local
        const local = db.getTrackByRemoteId(trackId);
        if (local) db.deleteTrack(local.id);
        return { source: 'cloud', success: true };
      } catch { /* fallback */ }
    }
    // Soft-delete local pour sync ultérieure
    const local = db.getTrack(trackId) || db.getTrackByRemoteId(trackId);
    if (local) {
      if (local.remote_id) {
        db.softDeleteTrack(local.id);
      } else {
        db.deleteTrack(local.id); // Jamais sync → supprimer directement
      }
    }
    return { source: 'local', success: true };
  },

  /** Analyser un track */
  async analyze(trackId) {
    if (isOnline()) {
      try {
        return { source: 'cloud', data: await api.tracks.analyze(trackId) };
      } catch { /* fallback local analysis via renderer */ }
    }
    return { source: 'local', data: null, message: 'Analyse locale uniquement' };
  },

  /** Identifier un track */
  async identify(trackId) {
    if (!isOnline()) throw new Error('Identification nécessite une connexion internet');
    return { source: 'cloud', data: await api.tracks.identify(trackId) };
  },

  /** Recherche Spotify */
  async spotifyLookup(trackId) {
    if (!isOnline()) throw new Error('Spotify nécessite une connexion internet');
    return { source: 'cloud', data: await api.tracks.spotifyLookup(trackId) };
  },

  async spotifyApply(trackId) {
    if (!isOnline()) throw new Error('Spotify nécessite une connexion internet');
    return { source: 'cloud', data: await api.tracks.spotifyApply(trackId) };
  },

  /** Tracks compatibles harmoniquement */
  async compatible(trackId, limit = 10) {
    if (isOnline()) {
      try {
        return { source: 'cloud', data: await api.tracks.compatible(trackId, limit) };
      } catch { /* fallback */ }
    }
    // Fallback local simple : même tonalité
    const track = db.getTrack(trackId) || db.getTrackByRemoteId(trackId);
    if (!track || !track.key_name) return { source: 'local', data: [] };
    const all = db.getAllTracks().filter(t => t.id !== track.id && t.key_name === track.key_name);
    return { source: 'local', data: all.slice(0, limit) };
  },

  /** Recherche locale + cloud */
  async search(query) {
    const local = db.searchTracks(query);
    if (isOnline()) {
      try {
        // L'API n'a pas de endpoint search dédié, on utilise list
        // Les résultats locaux sont souvent suffisants
      } catch { /* ok */ }
    }
    return { source: 'local', data: local };
  },

  // Proxy direct vers cloud pour les features qui n'ont pas de sens en local
  cleanTitle:    (id) => isOnline() ? api.tracks.cleanTitle(id) : Promise.reject(new Error('Offline')),
  parseRemix:    (id) => isOnline() ? api.tracks.parseRemix(id) : Promise.reject(new Error('Offline')),
  detectGenre:   (id) => isOnline() ? api.tracks.detectGenre(id) : Promise.reject(new Error('Offline')),
  fixTags:       (id) => isOnline() ? api.tracks.fixTags(id) : Promise.reject(new Error('Offline')),
  identifySearch:(id) => isOnline() ? api.tracks.identifySearch(id) : Promise.reject(new Error('Offline')),
  recordPlay:    (id, ctx) => isOnline() ? api.tracks.recordPlay(id, ctx) : Promise.resolve(null),
  getHistory:    (id) => isOnline() ? api.tracks.getHistory(id) : Promise.resolve([]),
  clearHistory:  ()   => isOnline() ? api.tracks.clearHistory() : Promise.resolve(null),
  audioUrl:      (id) => isOnline() ? api.tracks.audioUrl(id) : Promise.resolve(null),
  getBeatgrid:   (id) => isOnline() ? api.tracks.getBeatgrid(id) : Promise.resolve(null),
  updateBeatgrid:(id, d) => isOnline() ? api.tracks.updateBeatgrid(id, d) : Promise.resolve(null),
  updateMetadata:(id, d) => isOnline() ? api.tracks.updateMetadata(id, d) : Promise.resolve(null),
  getCategories: ()   => isOnline() ? api.tracks.getCategories() : Promise.resolve([]),
  getTags:       ()   => isOnline() ? api.tracks.getTags() : Promise.resolve([]),
};


// ═══════════════════════════════════════════════════════════
// ████  PLAYLISTS  ████
// ═══════════════════════════════════════════════════════════

const playlists = {
  async list() {
    if (isOnline()) {
      try { return { source: 'cloud', data: await api.playlists.list() }; } catch { /* fallback */ }
    }
    return { source: 'local', data: db.getAllPlaylists() };
  },

  async get(id) {
    if (isOnline()) {
      try { return { source: 'cloud', data: await api.playlists.get(id) }; } catch { /* fallback */ }
    }
    return { source: 'local', data: db.getPlaylist(id) };
  },

  async create(data) {
    const name = typeof data === 'string' ? data : data.name;
    const localId = db.createPlaylist(name);
    if (isOnline()) {
      try {
        const remote = await api.playlists.create(typeof data === 'string' ? { name } : data);
        // Stocker le remote_id
        const remoteId = remote.id;
        if (remoteId) {
          db.getDb().prepare('UPDATE playlists SET remote_id = ?, dirty = 0, synced_at = datetime(\'now\') WHERE id = ?').run(remoteId, localId);
        }
        return { source: 'cloud', data: remote, localId };
      } catch { /* reste local */ }
    }
    return { source: 'local', data: db.getPlaylist(localId), localId };
  },

  async delete(id) {
    if (isOnline()) {
      try {
        await api.playlists.delete(id);
        // Aussi supprimer local si existe
        const d = db.getDb();
        const local = d.prepare('SELECT id FROM playlists WHERE remote_id = ?').get(id);
        if (local) db.deletePlaylist(local.id);
        return { source: 'cloud', success: true };
      } catch { /* fallback */ }
    }
    db.deletePlaylist(id);
    return { source: 'local', success: true };
  },

  // Proxy cloud direct
  update:      (id, data)       => isOnline() ? api.playlists.update(id, data) : Promise.reject(new Error('Offline')),
  addTracks:   (id, trackIds)   => isOnline() ? api.playlists.addTracks(id, trackIds) : Promise.reject(new Error('Offline')),
  removeTrack: (id, trackId)    => isOnline() ? api.playlists.removeTrack(id, trackId) : Promise.reject(new Error('Offline')),
  reorder:     (id, items)      => isOnline() ? api.playlists.reorder(id, items) : Promise.reject(new Error('Offline')),
  duplicate:   (id)             => isOnline() ? api.playlists.duplicate(id) : Promise.reject(new Error('Offline')),
};


// ═══════════════════════════════════════════════════════════
// ████  SYNC ENGINE  ████
// ═══════════════════════════════════════════════════════════

const sync = {
  /** Obtenir le statut de synchronisation */
  getStatus() {
    const dirty = db.getDirtyTracks();
    const deleted = db.getDeletedTracks();
    return {
      online: _online,
      authenticated: isAuthenticated(),
      pendingUploads: dirty.filter(t => !t.remote_id).length,
      pendingUpdates: dirty.filter(t => t.remote_id).length,
      pendingDeletes: deleted.length,
      total: dirty.length + deleted.length,
    };
  },

  /** Synchroniser tout (push local → cloud) */
  async pushAll() {
    if (!isOnline()) throw new Error('Pas de connexion');

    const results = { uploaded: 0, updated: 0, deleted: 0, errors: [] };

    // 1. Upload des tracks sans remote_id
    const newTracks = db.getDirtyTracks().filter(t => !t.remote_id);
    for (const t of newTracks) {
      try {
        if (t.file_path && !t.file_path.startsWith('remote:')) {
          const remote = await api.tracks.upload(t.file_path);
          db.setRemoteId(t.id, remote.id || remote.track_id);
          results.uploaded++;
        }
      } catch (err) {
        results.errors.push({ trackId: t.id, error: err.message });
      }
    }

    // 2. Sync des tracks modifiées (avec remote_id)
    const modified = db.getDirtyTracks().filter(t => t.remote_id);
    for (const t of modified) {
      try {
        await api.tracks.update(t.remote_id, {
          title: t.title,
          artist: t.artist,
          album: t.album,
          bpm: t.bpm,
          key: t.key_name,
        });
        db.markSynced(t.id);
        results.updated++;
      } catch (err) {
        results.errors.push({ trackId: t.id, error: err.message });
      }
    }

    // 3. Supprimer les tracks marquées deleted
    const deleted = db.getDeletedTracks();
    for (const t of deleted) {
      try {
        await api.tracks.delete(t.remote_id);
        db.deleteTrack(t.id); // Purger en local après suppression cloud
        results.deleted++;
      } catch (err) {
        results.errors.push({ trackId: t.id, error: err.message });
      }
    }

    return results;
  },

  /** Tirer les données cloud → local (pull) */
  async pullAll() {
    if (!isOnline()) throw new Error('Pas de connexion');

    let page = 1;
    let total = 0;
    let hasMore = true;

    while (hasMore) {
      const remote = await api.tracks.list(page, 100);
      const items = remote.items || remote.tracks || remote;
      if (!Array.isArray(items) || items.length === 0) break;

      for (const t of items) {
        db.upsertFromRemote({
          remote_id: t.id,
          file_path: t.file_path || `remote:${t.id}`,
          file_name: t.file_name || t.title || 'Unknown',
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: t.duration,
          bpm: t.bpm,
          key_name: t.key || t.key_name || t.musical_key,
          energy: t.energy || t.energy_level,
          format: t.format,
          file_size: t.file_size,
          analyzed: t.analyzed,
        });
        total++;
      }

      hasMore = items.length === 100;
      page++;
    }

    return { pulled: total };
  },

  /** Full sync : push puis pull */
  async fullSync() {
    const pushResult = await sync.pushAll();
    const pullResult = await sync.pullAll();
    return { push: pushResult, pull: pullResult };
  },
};


// ═══════════════════════════════════════════════════════════
// ████  PROXY DIRECT (cloud-only features)  ████
// ═══════════════════════════════════════════════════════════

// Ces modules n'ont pas d'équivalent local — proxy direct vers l'API
const cues       = api.cues;
const hotCues    = api.hotCues;
const loops      = api.loops;
const waveforms  = api.waveforms;
const crates     = api.crates;
const sets       = api.sets;
const analytics  = api.analytics;
const exportApi  = api.export;
const importDj   = api.import;
const advanced   = api.advanced;
const mixAnalyzer= api.mixAnalyzer;
const billing    = api.billing;


// ═══════════════════════════════════════════════════════════
// ████  MODULE EXPORTS  ████
// ═══════════════════════════════════════════════════════════

module.exports = {
  // Status & config
  isOnline,
  isAuthenticated,
  checkConnectivity,
  setOnline,

  // Hybride local + cloud
  tracks,
  playlists,

  // Sync engine
  sync,

  // Cloud-only (proxy direct)
  cues,
  hotCues,
  loops,
  waveforms,
  crates,
  sets,
  analytics,
  export: exportApi,
  import: importDj,
  advanced,
  mixAnalyzer,
  billing,
};
