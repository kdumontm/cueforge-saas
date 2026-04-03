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

module.exports = {
  getDb, upsertTrack, updateAnalysis, getAllTracks, getTrack,
  getTrackByPath, deleteTrack, searchTracks, getSetting, setSetting
};
