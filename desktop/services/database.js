'use strict';
const path = require('path');
const { app } = require('electron');

let db = null;

function getDb() {
  if (db) return db;
  const Database = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'cueforge.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path   TEXT NOT NULL UNIQUE,
      file_name   TEXT NOT NULL,
      title       TEXT,
      artist      TEXT,
      album       TEXT,
      duration    REAL,
      bpm         REAL,
      key_name    TEXT,
      energy      REAL,
      cue_points  TEXT,
      waveform    TEXT,
      format      TEXT,
      file_size   INTEGER,
      analyzed    INTEGER DEFAULT 0,
      date_added  TEXT DEFAULT (datetime('now')),
      date_analyzed TEXT
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
      track_id    INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      position    INTEGER,
      PRIMARY KEY (playlist_id, track_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // ─── Migrations sync cloud ─────────────────────────────
  // Ajouter les colonnes de sync si elles n'existent pas
  const cols = db.prepare("PRAGMA table_info(tracks)").all().map(c => c.name);
  if (!cols.includes('remote_id')) {
    db.exec(`
      ALTER TABLE tracks ADD COLUMN remote_id   INTEGER;
      ALTER TABLE tracks ADD COLUMN dirty       INTEGER DEFAULT 0;
      ALTER TABLE tracks ADD COLUMN synced_at   TEXT;
      ALTER TABLE tracks ADD COLUMN deleted     INTEGER DEFAULT 0;
    `);
  }

  const plCols = db.prepare("PRAGMA table_info(playlists)").all().map(c => c.name);
  if (!plCols.includes('remote_id')) {
    db.exec(`
      ALTER TABLE playlists ADD COLUMN remote_id   INTEGER;
      ALTER TABLE playlists ADD COLUMN dirty       INTEGER DEFAULT 0;
      ALTER TABLE playlists ADD COLUMN synced_at   TEXT;
    `);
  }
}

// ─── Tracks ────────────────────────────────────────────
function upsertTrack(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO tracks (file_path, file_name, title, artist, album, duration, format, file_size)
    VALUES (@file_path, @file_name, @title, @artist, @album, @duration, @format, @file_size)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      duration = excluded.duration,
      format = excluded.format,
      file_size = excluded.file_size
  `);
  const info = stmt.run(data);
  return info.lastInsertRowid || db.prepare('SELECT id FROM tracks WHERE file_path = ?').get(data.file_path).id;
}

function updateAnalysis(id, data) {
  const db = getDb();
  db.prepare(`
    UPDATE tracks SET
      bpm = @bpm,
      key_name = @key_name,
      energy = @energy,
      cue_points = @cue_points,
      analyzed = 1,
      date_analyzed = datetime('now')
    WHERE id = @id
  `).run({ ...data, id });
}

function getAllTracks() {
  return getDb().prepare('SELECT * FROM tracks ORDER BY date_added DESC').all();
}

function getTrack(id) {
  return getDb().prepare('SELECT * FROM tracks WHERE id = ?').get(id);
}

function getTrackByPath(filePath) {
  return getDb().prepare('SELECT * FROM tracks WHERE file_path = ?').get(filePath);
}

function deleteTrack(id) {
  getDb().prepare('DELETE FROM tracks WHERE id = ?').run(id);
}

function searchTracks(query) {
  const like = `%${query}%`;
  return getDb().prepare(`
    SELECT * FROM tracks WHERE file_name LIKE ? OR title LIKE ? OR artist LIKE ?
    ORDER BY date_added DESC
  `).all(like, like, like);
}

// ─── Settings ──────────────────────────────────────────
function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

// ─── Sync helpers ─────────────────────────────────────────
function getDirtyTracks() {
  return getDb().prepare('SELECT * FROM tracks WHERE dirty = 1 AND deleted = 0').all();
}

function getDeletedTracks() {
  return getDb().prepare('SELECT * FROM tracks WHERE deleted = 1 AND remote_id IS NOT NULL').all();
}

function setRemoteId(localId, remoteId) {
  getDb().prepare('UPDATE tracks SET remote_id = ?, dirty = 0, synced_at = datetime(\'now\') WHERE id = ?').run(remoteId, localId);
}

function markSynced(localId) {
  getDb().prepare('UPDATE tracks SET dirty = 0, synced_at = datetime(\'now\') WHERE id = ?').run(localId);
}

function markDirty(localId) {
  getDb().prepare('UPDATE tracks SET dirty = 1 WHERE id = ?').run(localId);
}

function softDeleteTrack(id) {
  getDb().prepare('UPDATE tracks SET deleted = 1, dirty = 1 WHERE id = ?').run(id);
}

function purgeDeleted() {
  getDb().prepare('DELETE FROM tracks WHERE deleted = 1').run();
}

function getTrackByRemoteId(remoteId) {
  return getDb().prepare('SELECT * FROM tracks WHERE remote_id = ?').get(remoteId);
}

function upsertFromRemote(data) {
  const db = getDb();
  const existing = data.remote_id ? db.prepare('SELECT id FROM tracks WHERE remote_id = ?').get(data.remote_id) : null;
  if (existing) {
    db.prepare(`
      UPDATE tracks SET title = ?, artist = ?, album = ?, duration = ?, bpm = ?,
        key_name = ?, energy = ?, format = ?, analyzed = ?, synced_at = datetime('now'), dirty = 0
      WHERE id = ?
    `).run(data.title, data.artist, data.album, data.duration, data.bpm,
           data.key_name, data.energy, data.format, data.analyzed ? 1 : 0, existing.id);
    return existing.id;
  }
  const info = db.prepare(`
    INSERT INTO tracks (file_path, file_name, title, artist, album, duration, bpm, key_name,
      energy, format, file_size, analyzed, remote_id, dirty, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
  `).run(data.file_path || `remote:${data.remote_id}`, data.file_name || data.title || 'Unknown',
         data.title, data.artist, data.album, data.duration, data.bpm, data.key_name,
         data.energy, data.format, data.file_size || 0, data.analyzed ? 1 : 0, data.remote_id);
  return info.lastInsertRowid;
}

// ─── Playlists sync ──────────────────────────────────────
function getAllPlaylists() {
  return getDb().prepare('SELECT * FROM playlists ORDER BY created_at DESC').all();
}

function getPlaylist(id) {
  const pl = getDb().prepare('SELECT * FROM playlists WHERE id = ?').get(id);
  if (!pl) return null;
  pl.tracks = getDb().prepare(`
    SELECT t.*, pt.position FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ? ORDER BY pt.position
  `).all(id);
  return pl;
}

function createPlaylist(name) {
  const info = getDb().prepare('INSERT INTO playlists (name, dirty) VALUES (?, 1)').run(name);
  return info.lastInsertRowid;
}

function deletePlaylist(id) {
  getDb().prepare('DELETE FROM playlists WHERE id = ?').run(id);
}

function addTrackToPlaylist(playlistId, trackId, position) {
  const pos = position ?? (getDb().prepare('SELECT MAX(position) as m FROM playlist_tracks WHERE playlist_id = ?').get(playlistId)?.m || 0) + 1;
  getDb().prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)').run(playlistId, trackId, pos);
  getDb().prepare('UPDATE playlists SET dirty = 1 WHERE id = ?').run(playlistId);
}

function removeTrackFromPlaylist(playlistId, trackId) {
  getDb().prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackId);
  getDb().prepare('UPDATE playlists SET dirty = 1 WHERE id = ?').run(playlistId);
}

module.exports = {
  getDb, upsertTrack, updateAnalysis, getAllTracks, getTrack,
  getTrackByPath, deleteTrack, searchTracks, getSetting, setSetting,
  // Sync
  getDirtyTracks, getDeletedTracks, setRemoteId, markSynced, markDirty,
  softDeleteTrack, purgeDeleted, getTrackByRemoteId, upsertFromRemote,
  // Playlists
  getAllPlaylists, getPlaylist, createPlaylist, deletePlaylist,
  addTrackToPlaylist, removeTrackFromPlaylist,
};
