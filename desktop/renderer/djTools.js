'use strict';
/**
 * CueForge Desktop — V2.5.5 Full rewrite
 * Vanilla JS for Electron desktop app — pixel-perfect match with DashboardV2.tsx
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const HOT_CUE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];
const HOT_CUE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const CUE_TYPES = [
  { value: 'hot_cue', label: 'Hot Cue', icon: '🎯', color: '#22c55e' },
  { value: 'loop', label: 'Loop', icon: '🔁', color: '#3b82f6' },
  { value: 'fade_in', label: 'Fade In', icon: '⬆️', color: '#f59e0b' },
  { value: 'fade_out', label: 'Fade Out', icon: '⬇️', color: '#f97316' },
  { value: 'drop', label: 'Drop', icon: '💥', color: '#ef4444' },
  { value: 'phrase', label: 'Phrase', icon: '🎵', color: '#8b5cf6' },
  { value: 'section', label: 'Section', icon: '📍', color: '#06b6d4' },
  { value: 'load', label: 'Load Point', icon: '📌', color: '#ec4899' },
];

const CAMELOT = [
  { n: '1A', key: 'Am', color: '#4a9eff' }, { n: '1B', key: 'C', color: '#6ab4ff' },
  { n: '2A', key: 'Em', color: '#4ecdc4' }, { n: '2B', key: 'G', color: '#6ee4da' },
  { n: '3A', key: 'Bm', color: '#45b7d1' }, { n: '3B', key: 'D', color: '#63cddf' },
  { n: '4A', key: 'F#m', color: '#96ceb4' }, { n: '4B', key: 'A', color: '#a8dcc5' },
  { n: '5A', key: 'C#m', color: '#88d8a3' }, { n: '5B', key: 'E', color: '#9de8b5' },
  { n: '6A', key: 'G#m', color: '#a8e6cf' }, { n: '6B', key: 'B', color: '#b8f0dd' },
  { n: '7A', key: 'Ebm', color: '#ffd93d' }, { n: '7B', key: 'F#', color: '#ffe566' },
  { n: '8A', key: 'Bbm', color: '#ffb347' }, { n: '8B', key: 'Db', color: '#ffc566' },
  { n: '9A', key: 'Fm', color: '#ff8c69' }, { n: '9B', key: 'Ab', color: '#ffa085' },
  { n: '10A', key: 'Cm', color: '#ff6b9d' }, { n: '10B', key: 'Eb', color: '#ff85b0' },
  { n: '11A', key: 'Gm', color: '#c589e8' }, { n: '11B', key: 'Bb', color: '#d4a0f0' },
  { n: '12A', key: 'Dm', color: '#a390f0' }, { n: '12B', key: 'F', color: '#b8a8f8' },
];

const EXPORT_FORMATS = [
  { id: 'rekordbox', label: 'Rekordbox XML', desc: 'Compatible Pioneer DJ', color: '#06b6d4', icon: '🎧' },
  { id: 'csv', label: 'CSV Tracklist', desc: 'Titre, Artiste, BPM, Key…', color: '#10b981', icon: '📊' },
  { id: 'txt', label: 'Tracklist TXT', desc: 'Format texte numéroté', color: '#8b5cf6', icon: '📝' },
  { id: 'serato', label: 'Serato Crates', desc: 'Compatible Serato DJ Pro', color: '#f97316', icon: '💿' },
  { id: 'm3u', label: 'Playlist M3U', desc: 'Format M3U universel', color: '#ec4899', icon: '📁' },
  { id: 'json', label: 'JSON (sauvegarde)', desc: 'Export complet avec métadonnées', color: '#3b82f6', icon: '🗄️' },
];

function getKeyColor(key) {
  if (!key) return '#64748b';
  const c = CAMELOT.find(c => c.n === key || c.key === key);
  return c ? c.color : '#64748b';
}

function formatTime(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function formatTimeMs(ms) {
  return formatTime(ms / 1000);
}

// Handle both seconds and milliseconds automatically
function formatDuration(value) {
  if (!value) return '0:00';
  // If value > 3600 (1 hour in seconds), assume it's milliseconds
  if (typeof value === 'number' && value > 3600) {
    return formatTime(value / 1000);
  }
  return formatTime(value);
}

function parseDuration(d) {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  const parts = d.split(':');
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════
const MOCK_TRACKS = [
  { id: 1, title: 'Shed My Skin', artist: 'Ben Böhmer', genre: 'Melodic House', bpm: 124, key: '6A', energy: 72, duration: '6:42', rating: 5, tags: ['peak', 'vocal'], analyzed: true, color: '#22c55e', cuePoints: [
    { id: 1, name: 'Intro', position_ms: 0, color: '#22c55e', cue_type: 'hot_cue', number: 0 },
    { id: 2, name: 'Drop', position_ms: 96000, color: '#ef4444', cue_type: 'drop', number: 1 },
    { id: 3, name: 'Break', position_ms: 192000, color: '#3b82f6', cue_type: 'hot_cue', number: 2 },
    { id: 4, name: 'Loop A', position_ms: 240000, color: '#8b5cf6', cue_type: 'loop', number: 3, end_position_ms: 248000 },
  ] },
  { id: 2, title: 'Lost Highway', artist: 'Stephan Bodzin', genre: 'Techno', bpm: 134, key: '10B', energy: 88, duration: '8:15', rating: 4, tags: ['dark', 'peak'], analyzed: true, color: '#ef4444', cuePoints: [] },
  { id: 3, title: 'Equinox', artist: 'Solomun', genre: 'Deep House', bpm: 122, key: '3A', energy: 65, duration: '7:30', rating: 4, tags: ['warmup'], analyzed: true, color: '#3b82f6', cuePoints: [] },
  { id: 4, title: 'Disco Volante', artist: 'ANNA', genre: 'Techno', bpm: 136, key: '8A', energy: 91, duration: '7:05', rating: 5, tags: ['peak', 'dark'], analyzed: true, color: '#ef4444', cuePoints: [] },
  { id: 5, title: 'Dreamer', artist: 'Tale Of Us', genre: 'Melodic House', bpm: 120, key: '1A', energy: 58, duration: '9:10', rating: 3, tags: ['warmup', 'vocal'], analyzed: true, color: '#06b6d4', cuePoints: [] },
  { id: 6, title: 'Afterlife', artist: 'Anyma', genre: 'Progressive House', bpm: 128, key: '5B', energy: 78, duration: '6:55', rating: 5, tags: ['peak'], analyzed: true, color: '#8b5cf6', cuePoints: [] },
  { id: 7, title: 'Nox', artist: 'Recondite', genre: 'Minimal', bpm: 126, key: '9A', energy: 52, duration: '7:20', rating: 3, tags: ['warmup'], analyzed: true, color: '#f97316', cuePoints: [] },
  { id: 8, title: 'Opus', artist: 'Eric Prydz', genre: 'Progressive House', bpm: 126, key: '12B', energy: 85, duration: '9:26', rating: 5, tags: ['peak', 'anthem'], analyzed: true, color: '#a390f0', cuePoints: [] },
];

// ═══════════════════════════════════════════════════════════════════════════
// SVG GENERATORS
// ═══════════════════════════════════════════════════════════════════════════
function generateWaveformSVG(width, height, color1 = '#2563eb', color2 = '#3b82f6', color3 = '#60a5fa') {
  const bars = Math.floor(width / 3);
  let paths = '';
  // Spectral colors: red (low freq) -> orange -> yellow -> green (mid) -> cyan -> blue -> purple (high freq)
  const spectralColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'];

  for (let i = 0; i < bars; i++) {
    const x = i * 3;
    const h1 = (Math.sin(i * 0.15) * 0.4 + 0.5) * height * 0.4 + Math.random() * height * 0.1;
    const h2 = (Math.cos(i * 0.2) * 0.3 + 0.4) * height * 0.3 + Math.random() * height * 0.08;
    const h3 = (Math.sin(i * 0.25 + 1) * 0.2 + 0.3) * height * 0.2 + Math.random() * height * 0.05;
    const y1 = height / 2 - h1 / 2;
    const y2 = height / 2 - h2 / 2;
    const y3 = height / 2 - h3 / 2;

    // Use spectral color based on bar position (frequency distribution)
    const colorIndex = Math.floor((i / bars) * spectralColors.length);
    const spectralColor = spectralColors[Math.min(colorIndex, spectralColors.length - 1)];

    // High frequencies (purple/blue) - thin outer bars
    paths += `<rect x="${x}" y="${y3}" width="2" height="${h3}" fill="${spectralColor}" opacity="0.4" rx="1"/>`;
    // Mid frequencies (green/cyan) - middle bars
    paths += `<rect x="${x}" y="${y2}" width="2" height="${h2}" fill="${spectralColor}" opacity="0.6" rx="1"/>`;
    // Low frequencies (red/orange) - main bars
    paths += `<rect x="${x}" y="${y1}" width="2" height="${h1}" fill="${spectralColor}" opacity="0.8" rx="1"/>`;
  }
  return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${paths}</svg>`;
}

function generateCamelotWheelSVG(activeKey) {
  const cx = 160, cy = 160, R = 140, r = 100;
  let svg = `<svg width="320" height="320" viewBox="0 0 320 320">`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  CAMELOT.forEach((item, i) => {
    const isOuter = item.n.endsWith('B');
    const num = parseInt(item.n) - 1;
    const angle = (num * 30 - 90) * Math.PI / 180;
    const radius = isOuter ? (R + r) / 2 + 18 : (r) / 2 + 20;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const isActive = item.n === activeKey || item.key === activeKey;
    const fontSize = isActive ? 11 : 9;
    const weight = isActive ? 800 : 500;
    const opacity = isActive ? 1 : 0.6;
    svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"
      font-size="${fontSize}" font-weight="${weight}" fill="${item.color}" opacity="${opacity}"
      font-family="Inter, sans-serif">${item.n}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
// CUEFORGE APP — Main application object
// ═══════════════════════════════════════════════════════════════════════════
const CueForgeApp = {
  tracks: [],
  selectedTrack: null,
  selectedTrackIndex: -1,
  playingTrackId: null,
  favoriteIds: new Set(),
  playlists: [],
  sortBy: 'date',
  searchQuery: '',
  viewMode: 'list',
  zoom: 1,
  loopIn: null,
  loopOut: null,
  loopActive: false,
  playbackRate: 1,
  bpmTolerance: 6,
  sessionNotes: '',
  // Filter state
  filters: { bpmMin: '', bpmMax: '', keys: [], genre: '', energyMin: 0, energyMax: 100, analyzedOnly: false, favoritesOnly: false },
  // Set Builder state
  sets: [],
  activeSetId: null,

  // ═══════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════
  init() {
    this.tracks = MOCK_TRACKS.slice();
    this.updateAnalysisBadge();
    this.loadRealTracks();
    this.initFilterPanel();
    this.renderTrackList();
    this.renderAllTabs();
    this.renderPages();
    this.renderControlsRow();
    this.renderHotCues();
    this.bindEvents();
  },

  // ═══════════════════════════════════════════════════════════
  // LOAD REAL TRACKS FROM DB
  // ═══════════════════════════════════════════════════════════
  async loadRealTracks() {
    try {
      // Utiliser le dataLayer hybride (cloud + local automatique)
      if (window.cueforge?.data?.tracks?.list) {
        const result = await window.cueforge.data.tracks.list();
        const items = result?.data?.items || result?.data?.tracks || result?.data || [];
        const dbTracks = Array.isArray(items) ? items : [];
        if (dbTracks.length > 0) {
          const mapped = dbTracks.map(t => ({
            id: t.remote_id || t.id,
            localId: t.id,
            title: t.title || t.filename || 'Sans titre',
            artist: t.artist || 'Artiste inconnu',
            genre: t.genre || '',
            bpm: t.bpm || t.analysis?.bpm || null,
            key: t.key || t.key_name || t.musical_key || t.analysis?.key || null,
            energy: t.energy || t.energy_level || t.analysis?.energy || null,
            duration: t.duration || (t.analysis?.duration_ms ? formatTime(t.analysis.duration_ms / 1000) : '0:00'),
            rating: t.rating || 0,
            tags: t.tags || [],
            analyzed: t.analyzed !== false,
            color: t.color || null,
            filePath: t.file_path || t.filePath,
            cuePoints: t.cuePoints || [],
          }));
          this.tracks = mapped;
          this.updateAnalysisBadge();
          this.renderTrackList();
          const src = result?.source === 'cloud' ? '☁️' : '💾';
          showToast(`${src} ${mapped.length} tracks chargées`, 'success');
        }
      } else if (window.cueforge?.getTracks) {
        // Fallback legacy SQLite
        const dbTracks = await window.cueforge.getTracks();
        if (dbTracks && dbTracks.length > 0) {
          const mapped = dbTracks.map(t => ({
            id: t.id,
            title: t.title || t.filename || 'Sans titre',
            artist: t.artist || 'Artiste inconnu',
            genre: t.genre || '',
            bpm: t.bpm || null,
            key: t.key || t.key_name || null,
            energy: t.energy || null,
            duration: t.duration || '0:00',
            rating: t.rating || 0,
            tags: t.tags || [],
            analyzed: t.analyzed !== false,
            color: t.color || null,
            filePath: t.file_path || t.filePath,
            cuePoints: t.cuePoints || [],
          }));
          this.tracks = mapped;
          this.updateAnalysisBadge();
          this.renderTrackList();
          showToast(`💾 ${mapped.length} tracks chargées (local)`, 'success');
        }
      }
    } catch (e) {
      console.warn('Could not load tracks:', e);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // IMPORT FILES
  // ═══════════════════════════════════════════════════════════
  async importFiles() {
    try {
      if (!window.cueforge?.openFileDialog) {
        showToast('Import non disponible — vérifiez que l\'app est bien lancée', 'error');
        return;
      }
      const files = await window.cueforge.openFileDialog();
      if (!files || files.length === 0) return;
      showToast(`Import de ${files.length} fichier(s) en cours…`, 'info');

      let imported = 0;
      let errors = 0;

      for (const filePath of files) {
        try {
          // 1. Extraire le nom de fichier comme fallback
          const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
          const baseName = fileName.replace(/\.[^.]+$/, '') || 'Sans titre';

          // 2. Lire les métadonnées (non-bloquant si ça échoue)
          let meta = {};
          try {
            if (window.cueforge?.readMetadata) {
              meta = await window.cueforge.readMetadata(filePath) || {};
              if (meta.error) {
                console.warn('Metadata read error for', fileName, ':', meta.error);
                meta = {}; // Continuer quand même avec les données basiques
              }
            }
          } catch (metaErr) {
            console.warn('Metadata exception for', fileName, ':', metaErr);
            meta = {};
          }

          const trackTitle = meta.title || baseName;
          const trackArtist = meta.artist || 'Artiste inconnu';

          // 3. Sauvegarder via dataLayer hybride OU legacy
          let trackResult = null;
          try {
            if (window.cueforge?.data?.tracks?.upload) {
              const result = await window.cueforge.data.tracks.upload(filePath);
              trackResult = result?.data;
              if (result?.cloudError) {
                console.warn('Cloud upload failed (saved locally):', result.cloudError);
              }
            } else if (window.cueforge?.upsertTrack) {
              const localId = await window.cueforge.upsertTrack({
                file_path: filePath,
                file_name: fileName,
                title: trackTitle,
                artist: trackArtist,
                album: meta.album || '',
                bpm: meta.bpm || null,
                key: meta.key || null,
                duration: meta.duration ? formatDuration(meta.duration) : '0:00',
                format: meta.format || fileName.split('.').pop()?.toUpperCase() || '',
                file_size: meta.fileSize || 0,
              });
              trackResult = { id: localId, title: trackTitle, artist: trackArtist };
            }
          } catch (uploadErr) {
            console.warn('Upload/save error for', fileName, ':', uploadErr);
            // Même si la sauvegarde échoue, on ajoute quand même en mémoire
            trackResult = { id: Date.now(), title: trackTitle, artist: trackArtist };
          }

          // 4. Ajouter au tableau local (toujours, même si DB a échoué)
          const newTrack = {
            id: trackResult?.remote_id || trackResult?.id || Date.now(),
            localId: trackResult?.id || null,
            title: trackResult?.title || trackTitle,
            artist: trackResult?.artist || trackArtist,
            genre: trackResult?.genre || meta.genre || '',
            bpm: trackResult?.bpm || meta.bpm || null,
            key: trackResult?.key_name || trackResult?.key || meta.key || null,
            energy: trackResult?.energy || null,
            duration: meta.duration ? formatDuration(meta.duration) : (trackResult?.duration || '0:00'),
            rating: 0, tags: [], analyzed: false, color: null,
            filePath, cuePoints: [],
          };

          // Éviter les doublons (même fichier déjà importé)
          if (!this.tracks.find(t => t.filePath === filePath)) {
            this.tracks.push(newTrack);
            imported++;
          } else {
            console.warn('Track déjà dans la bibliothèque:', fileName);
          }

        } catch (err) {
          errors++;
          console.error('Import failed for', filePath, ':', err);
        }
      }

      // 5. Mettre à jour l'UI
      this.renderTrackList();
      this.updateFilterGenres();

      // 6. Feedback utilisateur précis
      if (imported > 0 && errors === 0) {
        showToast(`${imported} fichier(s) importé(s) avec succès`, 'success');
      } else if (imported > 0 && errors > 0) {
        showToast(`${imported} importé(s), ${errors} en erreur`, 'warning');
      } else if (errors > 0) {
        showToast(`Échec de l'import (${errors} erreur${errors > 1 ? 's' : ''})`, 'error');
      } else {
        showToast('Aucun nouveau fichier à importer', 'info');
      }

    } catch (e) {
      console.error('Import global error:', e);
      showToast(`Erreur d'import : ${e.message || 'inconnue'}`, 'error');
    }
  },

  // ═══════════════════════════════════════════════════════════
  // SELECT TRACK
  // ═══════════════════════════════════════════════════════════
  selectTrack(trackId) {
    const idx = this.tracks.findIndex(t => t.id === trackId);
    if (idx === -1) return;
    this.selectedTrack = this.tracks[idx];
    this.selectedTrackIndex = idx;
    this.playingTrackId = trackId;
    this.loopIn = null;
    this.loopOut = null;
    this.loopActive = false;
    this.zoom = 1;
    this.playbackRate = 1;
    this.updatePlayerCard();
    this.renderHotCues();
    this.renderControlsRow();
    this.renderAllTabs();
    this.highlightTrackRow(trackId);
  },

  selectPrevTrack() {
    if (this.tracks.length === 0) return;
    const newIdx = Math.max(0, this.selectedTrackIndex - 1);
    this.selectTrack(this.tracks[newIdx].id);
  },

  selectNextTrack() {
    if (this.tracks.length === 0) return;
    const newIdx = Math.min(this.tracks.length - 1, this.selectedTrackIndex + 1);
    this.selectTrack(this.tracks[newIdx].id);
  },

  // ═══════════════════════════════════════════════════════════
  // UPDATE PLAYER CARD
  // ═══════════════════════════════════════════════════════════
  updatePlayerCard() {
    const track = this.selectedTrack;
    const emptyCard = document.getElementById('playerCard');
    const filledCard = document.getElementById('playerCardFilled');

    if (!track) {
      if (emptyCard) emptyCard.style.display = '';
      if (filledCard) filledCard.style.display = 'none';
      return;
    }

    if (emptyCard) emptyCard.style.display = 'none';
    if (filledCard) filledCard.style.display = '';

    // Art
    const art = document.getElementById('playerArt');
    if (art) {
      art.style.background = track.color ? track.color + '30' : 'var(--bg-elevated)';
      art.style.border = `1px solid ${track.color || 'var(--border-default)'}40`;
      art.textContent = '🎵';
    }

    // Title / Subtitle
    const title = document.getElementById('playerTitle');
    const subtitle = document.getElementById('playerSubtitle');
    if (title) title.textContent = track.title;
    if (subtitle) subtitle.textContent = track.artist + (track.genre ? ` · ${track.genre}` : '');

    // Badges
    const badges = document.getElementById('playerBadges');
    if (badges) {
      let html = '';
      if (track.bpm) {
        html += `<span class="badge-bpm">${typeof track.bpm === 'number' ? track.bpm.toFixed(1) : track.bpm} BPM</span>`;
      }
      if (track.key) {
        const kc = getKeyColor(track.key);
        html += `<span class="badge-key" style="background:${kc}20;color:${kc};border:1px solid ${kc}40">${track.key}</span>`;
      }
      if (track.energy != null) {
        const pct = Math.min(100, Math.max(0, track.energy));
        const ec = pct > 70 ? '#ef4444' : pct > 40 ? '#eab308' : '#22c55e';
        html += `<span class="energy-bar-container">
          <span class="energy-bar"><span class="energy-bar-fill" style="width:${pct}%"></span></span>
          <span class="energy-value" style="color:${ec}">${pct}</span>
        </span>`;
      }
      badges.innerHTML = html;
    }

    // Waveform with spectral colors
    const overview = document.getElementById('waveformOverview');
    const detail = document.getElementById('waveformDetail');
    if (overview) overview.innerHTML = generateWaveformSVG(800, 56);
    if (detail) detail.innerHTML = generateWaveformSVG(800, 90);
  },

  // ═══════════════════════════════════════════════════════════
  // RENDER HOT CUES
  // ═══════════════════════════════════════════════════════════
  renderHotCues() {
    const row = document.getElementById('hotcuesRow');
    if (!row) return;
    const cues = this.selectedTrack?.cuePoints || [];
    let html = '<span class="hotcues-label">HOT CUES</span>';
    for (let i = 0; i < 8; i++) {
      const cue = cues.find(c => (c.number ?? 0) === i) || cues[i];
      const color = cue ? HOT_CUE_COLORS[i] : 'var(--bg-elevated)';
      const textColor = cue ? 'white' : 'var(--text-muted)';
      const opacity = cue ? '1' : '0.5';
      const isLoop = cue?.cue_type === 'loop';
      const timeStr = cue?.position_ms ? formatTimeMs(cue.position_ms) : '';
      const title = cue ? `${isLoop ? '🔁 Loop' : '🎯 Cue'} ${cue.name || HOT_CUE_LABELS[i]} @ ${timeStr}` : `Slot ${HOT_CUE_LABELS[i]} vide`;
      html += `<button class="hotcue-btn" style="background:${color};color:${textColor};opacity:${opacity}"
        ${!cue ? 'disabled' : ''} data-cue-index="${i}" title="${title}">
        <div style="display:flex;align-items:center;justify-content:center;gap:2px">
          ${isLoop ? '<span style="font-size:8px">🔁</span>' : ''}
          <span>${HOT_CUE_LABELS[i]}</span>
        </div>
        ${cue ? `<div class="hotcue-time">${timeStr}</div>` : ''}
      </button>`;
    }
    row.innerHTML = html;
  },

  // ═══════════════════════════════════════════════════════════
  // RENDER CONTROLS ROW (Loop, Zoom, Rate, Theme)
  // ═══════════════════════════════════════════════════════════
  renderControlsRow() {
    const row = document.getElementById('controlsRow');
    if (!row) return;
    const loopInClass = this.loopIn !== null ? 'ctrl-btn active-blue' : 'ctrl-btn';
    const loopActiveClass = this.loopActive ? 'ctrl-btn active-green' : 'ctrl-btn';
    const loopOutClass = this.loopOut !== null ? 'ctrl-btn active-orange' : 'ctrl-btn';
    const loopDisabled = this.loopIn === null || this.loopOut === null ? 'disabled' : '';
    const rateClass = this.playbackRate !== 1 ? 'ctrl-btn active-purple' : 'ctrl-btn';

    let html = `
      <button class="${loopInClass}" id="btnLoopIn" title="Set Loop IN">IN</button>
      <button class="${loopActiveClass}" id="btnLoopToggle" ${loopDisabled} title="Toggle Loop">🔁 LOOP</button>
      <button class="${loopOutClass}" id="btnLoopOut" title="Set Loop OUT">OUT</button>
    `;
    if (this.loopIn !== null && this.loopOut !== null) {
      html += `<span class="ctrl-label" style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${formatTime(this.loopIn)} → ${formatTime(this.loopOut)}</span>`;
    }
    html += '<span class="ctrl-spacer"></span>';

    // Tap Tempo
    html += `<button class="ctrl-btn" id="btnTapTempo" title="Tap Tempo" style="color:#fbbf24;font-size:10px">🥁 TAP</button>`;

    // Playback Rate
    html += `<button class="${rateClass}" id="btnRate" title="Playback Rate" style="font-size:10px">${this.playbackRate}×</button>`;

    // Zoom
    html += '<span class="ctrl-label">Zoom:</span>';
    [0.5, 1, 2, 4].forEach(z => {
      const cls = z === this.zoom ? 'zoom-btn active' : 'zoom-btn';
      html += `<button class="${cls}" data-zoom="${z}">${z}×</button>`;
    });

    row.innerHTML = html;

    // Bind zoom buttons
    row.querySelectorAll('[data-zoom]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.zoom = parseFloat(btn.dataset.zoom);
        this.renderControlsRow();
      });
    });

    // Loop buttons
    row.querySelector('#btnLoopIn')?.addEventListener('click', () => {
      this.loopIn = this.loopIn === null ? 0 : null;
      this.renderControlsRow();
    });
    row.querySelector('#btnLoopOut')?.addEventListener('click', () => {
      this.loopOut = this.loopOut === null ? 30 : null;
      this.renderControlsRow();
    });
    row.querySelector('#btnLoopToggle')?.addEventListener('click', () => {
      this.loopActive = !this.loopActive;
      this.renderControlsRow();
    });
  },

  // ═══════════════════════════════════════════════════════════
  // FILTER PANEL
  // ═══════════════════════════════════════════════════════════
  initFilterPanel() {
    const grid = document.getElementById('filterKeyGrid');
    if (grid) {
      grid.innerHTML = CAMELOT.map(c =>
        `<button class="filter-key-btn" data-key="${c.n}" style="--kc:${c.color}" title="${c.key}">${c.n}</button>`
      ).join('');
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-key-btn');
        if (!btn) return;
        const key = btn.dataset.key;
        const idx = this.filters.keys.indexOf(key);
        if (idx >= 0) { this.filters.keys.splice(idx, 1); btn.classList.remove('active'); }
        else { this.filters.keys.push(key); btn.classList.add('active'); }
        btn.style.background = btn.classList.contains('active') ? btn.style.getPropertyValue('--kc') + '33' : '';
        btn.style.color = btn.classList.contains('active') ? btn.style.getPropertyValue('--kc') : '';
        btn.style.borderColor = btn.classList.contains('active') ? btn.style.getPropertyValue('--kc') : '';
        this.updateFilterBadge();
        this.renderTrackList();
      });
    }
    // Toggle
    document.getElementById('filterToggleBtn')?.addEventListener('click', () => {
      const panel = document.getElementById('filterPanel');
      panel?.classList.toggle('open');
      document.getElementById('filterToggleBtn')?.classList.toggle('active', panel?.classList.contains('open'));
    });
    // BPM inputs
    ['filterBpmMin', 'filterBpmMax'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        this.filters[id === 'filterBpmMin' ? 'bpmMin' : 'bpmMax'] = e.target.value;
        this.updateFilterBadge();
        this.renderTrackList();
      });
    });
    // Genre select
    document.getElementById('filterGenre')?.addEventListener('change', (e) => {
      this.filters.genre = e.target.value;
      this.updateFilterBadge();
      this.renderTrackList();
    });
    // Energy range
    document.getElementById('filterEnergyMin')?.addEventListener('input', (e) => {
      this.filters.energyMin = parseInt(e.target.value);
      document.getElementById('filterEnergyMinVal').textContent = e.target.value;
      this.updateFilterBadge();
      this.renderTrackList();
    });
    document.getElementById('filterEnergyMax')?.addEventListener('input', (e) => {
      this.filters.energyMax = parseInt(e.target.value);
      document.getElementById('filterEnergyMaxVal').textContent = e.target.value;
      this.updateFilterBadge();
      this.renderTrackList();
    });
    // Checkboxes
    document.getElementById('filterAnalyzed')?.addEventListener('change', (e) => {
      this.filters.analyzedOnly = e.target.checked;
      this.updateFilterBadge();
      this.renderTrackList();
    });
    document.getElementById('filterFavorites')?.addEventListener('change', (e) => {
      this.filters.favoritesOnly = e.target.checked;
      this.updateFilterBadge();
      this.renderTrackList();
    });
    // Reset
    document.getElementById('filterResetBtn')?.addEventListener('click', () => {
      this.filters = { bpmMin: '', bpmMax: '', keys: [], genre: '', energyMin: 0, energyMax: 100, analyzedOnly: false, favoritesOnly: false };
      document.getElementById('filterBpmMin').value = '';
      document.getElementById('filterBpmMax').value = '';
      document.getElementById('filterGenre').value = '';
      document.getElementById('filterEnergyMin').value = 0;
      document.getElementById('filterEnergyMax').value = 100;
      document.getElementById('filterEnergyMinVal').textContent = '0';
      document.getElementById('filterEnergyMaxVal').textContent = '100';
      document.getElementById('filterAnalyzed').checked = false;
      document.getElementById('filterFavorites').checked = false;
      document.querySelectorAll('.filter-key-btn').forEach(b => { b.classList.remove('active'); b.style.background = ''; b.style.color = ''; b.style.borderColor = ''; });
      this.updateFilterBadge();
      this.renderTrackList();
    });
    // Populate genres
    this.updateFilterGenres();
  },

  updateFilterGenres() {
    const sel = document.getElementById('filterGenre');
    if (!sel) return;
    const genres = [...new Set(this.tracks.map(t => t.genre).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Tous</option>' + genres.map(g => `<option value="${g}">${g}</option>`).join('');
  },

  updateFilterBadge() {
    const f = this.filters;
    let count = 0;
    if (f.bpmMin) count++;
    if (f.bpmMax) count++;
    if (f.keys.length) count++;
    if (f.genre) count++;
    if (f.energyMin > 0 || f.energyMax < 100) count++;
    if (f.analyzedOnly) count++;
    if (f.favoritesOnly) count++;
    const badge = document.getElementById('filterBadge');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? '' : 'none'; }
    document.getElementById('filterToggleBtn')?.classList.toggle('active', count > 0 || document.getElementById('filterPanel')?.classList.contains('open'));
  },

  updateAnalysisBadge() {
    const unanalyzedCount = this.tracks.filter(t => !t.analyzed).length;
    const btn = document.getElementById('btnAnalyzeAll');
    const label = document.getElementById('unanalyzedCountLabel');
    if (label) label.textContent = unanalyzedCount;
    if (btn) {
      if (unanalyzedCount > 0) {
        btn.style.display = 'flex';
      } else {
        btn.style.display = 'none';
      }
    }
  },

  getFilteredTracks() {
    let filtered = [...this.tracks];
    // Search
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.genre && t.genre.toLowerCase().includes(q))
      );
    }
    // Filters
    const f = this.filters;
    if (f.bpmMin) filtered = filtered.filter(t => t.bpm && t.bpm >= parseFloat(f.bpmMin));
    if (f.bpmMax) filtered = filtered.filter(t => t.bpm && t.bpm <= parseFloat(f.bpmMax));
    if (f.keys.length > 0) {
      filtered = filtered.filter(t => {
        if (!t.key) return false;
        const cam = CAMELOT.find(c => c.n === t.key || c.key === t.key);
        return cam ? f.keys.includes(cam.n) : false;
      });
    }
    if (f.genre) filtered = filtered.filter(t => t.genre === f.genre);
    if (f.energyMin > 0) filtered = filtered.filter(t => t.energy != null && t.energy >= f.energyMin);
    if (f.energyMax < 100) filtered = filtered.filter(t => t.energy != null && t.energy <= f.energyMax);
    if (f.analyzedOnly) filtered = filtered.filter(t => t.analyzed);
    if (f.favoritesOnly) filtered = filtered.filter(t => this.favoriteIds.has(t.id));
    // Sort
    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'bpm': return (b.bpm || 0) - (a.bpm || 0);
        case 'key': return (a.key || '').localeCompare(b.key || '');
        case 'title': return a.title.localeCompare(b.title);
        case 'energy': return (b.energy || 0) - (a.energy || 0);
        case 'genre': return (a.genre || '').localeCompare(b.genre || '');
        case 'duration': return parseDuration(b.duration) - parseDuration(a.duration);
        case 'rating': return (b.rating || 0) - (a.rating || 0);
        default: return (b.id || 0) - (a.id || 0);
      }
    });
    return filtered;
  },

  // ═══════════════════════════════════════════════════════════
  // RENDER TRACK LIST
  // ═══════════════════════════════════════════════════════════
  renderTrackList() {
    const rows = document.getElementById('trackRows');
    const countEl = document.getElementById('trackCount');
    if (!rows) return;

    const filtered = this.getFilteredTracks();
    const headers = document.querySelector('.tracklist-headers');

    if (countEl) {
      countEl.textContent = `${filtered.length} morceau${filtered.length !== 1 ? 'x' : ''}${filtered.length !== this.tracks.length ? ` (${this.tracks.length} total)` : ''}`;
    }

    if (filtered.length === 0) {
      rows.innerHTML = `<div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="8" y="14" width="48" height="36" rx="4" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/><circle cx="32" cy="32" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.5"/><path d="M30 28v8l6-4z" fill="currentColor" opacity="0.5"/></svg>
        <div><h3>Aucun morceau</h3><p>Commencez par importer vos pistes audio pour construire votre bibliothèque</p></div>
        <button class="btn-primary" onclick="CueForgeApp.importFiles()">Importer des tracks</button>
      </div>`;
      if (headers) headers.style.display = 'none';
      return;
    }

    // Grid View
    if (this.viewMode === 'grid') {
      if (headers) headers.style.display = 'none';
      rows.className = 'tracklist-grid';
      rows.innerHTML = filtered.map((track) => {
        const isSelected = this.selectedTrack?.id === track.id;
        const isPlaying = this.playingTrackId === track.id;
        const isFav = this.favoriteIds.has(track.id);
        const keyColor = getKeyColor(track.key);
        const eColor = track.energy >= 80 ? '#ef4444' : track.energy >= 60 ? '#f59e0b' : track.energy >= 40 ? '#22c55e' : '#3b82f6';
        return `<div class="track-card${isSelected ? ' selected' : ''}${isPlaying ? ' playing' : ''}" data-track-id="${track.id}">
          <div class="track-card-art" style="background:linear-gradient(135deg, ${keyColor}15, ${keyColor}05)">
            <div class="track-card-art-icon">&#x266b;</div>
            <div class="track-card-eq">${isPlaying ? '<div class="eq-bars"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div>' : ''}</div>
          </div>
          <div class="track-card-body">
            <div class="track-card-title">${track.title}</div>
            <div class="track-card-artist">${track.artist}</div>
            <div class="track-card-badges">
              ${track.bpm ? `<span class="track-card-bpm">${Math.round(track.bpm)}</span>` : ''}
              ${track.key ? `<span class="track-card-key" style="background:${keyColor}22;color:${keyColor}">${track.key}</span>` : ''}
              ${track.energy != null ? `<div class="track-card-energy"><div class="track-card-energy-fill" style="width:${track.energy}%;background:${eColor}"></div></div>` : ''}
            </div>
            <div class="track-card-footer">
              <span class="track-card-genre">${track.genre || ''}</span>
              <button class="track-card-fav${isFav ? ' active' : ''}" data-fav-id="${track.id}">${isFav ? '★' : '☆'}</button>
            </div>
          </div>
        </div>`;
      }).join('');
      // Bind grid events
      rows.querySelectorAll('.track-card').forEach(card => {
        const trackId = parseInt(card.dataset.trackId);
        card.addEventListener('click', (e) => { if (!e.target.closest('.track-card-fav')) this.selectTrack(trackId); });
        card.addEventListener('dblclick', () => this.selectTrack(trackId));
      });
      rows.querySelectorAll('.track-card-fav').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.favId);
          if (this.favoriteIds.has(id)) this.favoriteIds.delete(id); else this.favoriteIds.add(id);
          this.renderTrackList();
        });
      });
      return;
    }

    // List View
    if (headers) headers.style.display = '';
    rows.className = 'tracklist-rows';

    let html = '';
    filtered.forEach((track, index) => {
      const isSelected = this.selectedTrack?.id === track.id;
      const isPlaying = this.playingTrackId === track.id;
      const isFav = this.favoriteIds.has(track.id);
      const selectedClass = isSelected ? ' selected' : '';
      const playingClass = isPlaying ? ' playing' : '';
      const keyColor = getKeyColor(track.key);

      html += `<div class="track-row${selectedClass}${playingClass}" data-track-id="${track.id}">
        <div class="track-index">
          ${track.color ? `<span class="track-color-dot" style="background:${track.color}"></span>` : ''}
          ${index + 1}
        </div>
        <div class="track-play-col">
          ${isPlaying ? '<div class="eq-bars"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div>' : ''}
        </div>
        <div class="track-title-col">
          <div class="track-title">${track.title}</div>
          <div class="track-artist">${track.artist}</div>
        </div>
        <div class="track-bpm">${track.bpm ? Math.round(track.bpm) : '—'}</div>
        <div>${track.key ? `<span class="track-key-badge" style="background:${keyColor}33;color:${keyColor}">${track.key}</span>` : '<span style="font-size:12px;color:var(--text-secondary)">—</span>'}</div>
        <div>${track.energy != null ? `<div class="track-energy-bar"><div class="track-energy-fill" style="width:${track.energy}%"></div></div>` : '<span style="font-size:12px;color:var(--text-secondary)">—</span>'}</div>
        <div class="track-genre">${track.genre || '—'}</div>
        <div class="track-duration">${track.duration || '—'}</div>
        <div class="track-rating" data-track-id="${track.id}">
          ${[1,2,3,4,5].map(s => `<button class="star-btn${s <= (track.rating || 0) ? ' filled' : ''}" data-star="${s}">★</button>`).join('')}
        </div>
        <div class="track-actions">
          <button class="track-actions-btn" data-actions-track="${track.id}" title="Actions">⋮</button>
          <div class="actions-dropdown" id="actions-${track.id}">
            <button class="actions-item" data-action="analyze" data-id="${track.id}">⚡ Re-analyser</button>
            <button class="actions-item" data-action="copy" data-id="${track.id}">📋 Copier le titre</button>
            <button class="actions-item" data-action="fav" data-id="${track.id}">${isFav ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button>
            <button class="actions-item" data-action="export-rek" data-id="${track.id}">📥 Export Rekordbox</button>
            <button class="actions-item danger" data-action="delete" data-id="${track.id}">🗑️ Supprimer</button>
          </div>
        </div>
      </div>`;
    });

    rows.innerHTML = html;

    // Bind row events
    rows.querySelectorAll('.track-row').forEach(row => {
      const trackId = parseInt(row.dataset.trackId);
      row.addEventListener('click', (e) => {
        if (e.target.closest('.track-actions-btn') || e.target.closest('.actions-dropdown') || e.target.closest('.star-btn')) return;
        this.selectTrack(trackId);
      });
      row.addEventListener('dblclick', () => this.selectTrack(trackId));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, trackId);
      });
    });

    // Bind star ratings
    rows.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rating = parseInt(btn.dataset.star);
        const trackEl = btn.closest('.track-rating');
        const trackId = parseInt(trackEl.dataset.trackId);
        const track = this.tracks.find(t => t.id === trackId);
        if (track) { track.rating = rating; this.renderTrackList(); }
      });
    });

    // Bind actions menu
    rows.querySelectorAll('.track-actions-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.actionsTrack;
        const dropdown = document.getElementById(`actions-${trackId}`);
        document.querySelectorAll('.actions-dropdown.show').forEach(d => d.classList.remove('show'));
        dropdown?.classList.toggle('show');
      });
    });

    // Bind action items
    rows.querySelectorAll('.actions-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        const id = parseInt(item.dataset.id);
        document.querySelectorAll('.actions-dropdown.show').forEach(d => d.classList.remove('show'));
        switch (action) {
          case 'copy':
            const t = this.tracks.find(t => t.id === id);
            if (t) navigator.clipboard?.writeText(t.title);
            showToast('Titre copié', 'success');
            break;
          case 'fav':
            if (this.favoriteIds.has(id)) this.favoriteIds.delete(id);
            else this.favoriteIds.add(id);
            this.renderTrackList();
            break;
          case 'delete':
            this.tracks = this.tracks.filter(t => t.id !== id);
            if (this.selectedTrack?.id === id) { this.selectedTrack = null; this.updatePlayerCard(); }
            this.renderTrackList();
            showToast('Track supprimée', 'success');
            break;
          case 'export-rek':
            this.exportRekordbox([id]);
            break;
        }
      });
    });
  },

  highlightTrackRow(trackId) {
    document.querySelectorAll('.track-row').forEach(row => {
      row.classList.toggle('selected', parseInt(row.dataset.trackId) === trackId);
    });
  },

  // ═══════════════════════════════════════════════════════════
  // CONTEXT MENU
  // ═══════════════════════════════════════════════════════════
  showContextMenu(e, trackId) {
    const menu = document.getElementById('contextMenu');
    if (!menu) return;
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;
    menu.innerHTML = `
      <button class="context-item" data-ctx="analyze">⚡ Analyze</button>
      <button class="context-item" data-ctx="export-rek">📥 Export Rekordbox XML</button>
      <button class="context-item" data-ctx="export-csv">📊 Export CSV</button>
      <button class="context-item" data-ctx="copy">📋 Copier le titre</button>
      <button class="context-item danger" data-ctx="delete">🗑️ Supprimer</button>
    `;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.add('show');

    menu.querySelectorAll('.context-item').forEach(item => {
      item.addEventListener('click', () => {
        menu.classList.remove('show');
        switch (item.dataset.ctx) {
          case 'copy': navigator.clipboard?.writeText(track.title); showToast('Copié', 'success'); break;
          case 'delete':
            this.tracks = this.tracks.filter(t => t.id !== trackId);
            if (this.selectedTrack?.id === trackId) { this.selectedTrack = null; this.updatePlayerCard(); }
            this.renderTrackList();
            showToast('Track supprimée', 'success');
            break;
          case 'export-rek': this.exportRekordbox([trackId]); break;
        }
      });
    });
  },

  // ═══════════════════════════════════════════════════════════
  // RENDER ALL TABS
  // ═══════════════════════════════════════════════════════════
  renderAllTabs() {
    this.renderCuesTab();
    this.renderBeatgridTab();
    this.renderStemsTab();
    this.renderEqTab();
    this.renderFxTab();
    this.renderMixTab();
    this.renderPlaylistsTab();
    this.renderStatsTab();
    this.renderHistoryTab();
    this.renderNotesTab();
  },

  // ─── Cues Tab ───────────────────────────────────────────
  renderCuesTab() {
    const pane = document.getElementById('cuesPane');
    if (!pane) return;
    const track = this.selectedTrack;
    const cues = track?.cuePoints || [];

    if (!track) {
      pane.innerHTML = '<div class="tab-placeholder"><span class="tab-placeholder-icon">🎯</span>Sélectionne un morceau</div>';
      return;
    }

    const maxMs = Math.max(1, ...cues.map(c => c.position_ms || 0), parseDuration(track.duration) * 1000);

    // Auto-generate button
    const autoGenHtml = `<div class="cue-auto-gen-area">
      <button class="cue-auto-gen-btn" id="btnAutoGenCues">✨ Auto-générer les cue points</button>
    </div>`;

    // Timeline
    let timelineHtml = '';
    if (cues.length > 0) {
      let barsHtml = '';
      for (let i = 0; i < 80; i++) {
        const h = 3 + Math.sin(i * 0.35) * 10 + Math.cos(i * 0.65) * 5 + Math.sin(i * 1.2) * 3;
        barsHtml += `<div class="cues-timeline-bar" style="height:${Math.max(2, Math.abs(h))}px"></div>`;
      }
      let markersHtml = '';
      cues.forEach(cue => {
        const pct = Math.min(97, Math.max(1, ((cue.position_ms || 0) / maxMs) * 100));
        const color = cue.color || '#22c55e';
        markersHtml += `<div class="cue-marker" style="left:${pct}%;background:${color}" title="${cue.name || 'Cue'}">
          <div class="cue-marker-triangle" style="border-top:6px solid ${color}"></div>
        </div>`;
      });
      timelineHtml = `<div class="cues-timeline"><div class="cues-timeline-bars">${barsHtml}</div>${markersHtml}</div>`;
    }

    // Add button
    const addHtml = `<div class="cue-add-area">
      <button class="cue-quick-add" id="cueQuickAdd">⚡ Cue @ 0:00</button>
    </div>`;

    // Cue list
    let listHtml = '';
    if (cues.length === 0) {
      listHtml = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">Aucun cue — utilise le bouton Auto-générer ou ajoute manuellement</div>';
    } else {
      listHtml = '<div class="cue-list">';
      cues.forEach((cue, idx) => {
        const typeInfo = CUE_TYPES.find(t => t.value === (cue.cue_type || 'hot_cue')) || CUE_TYPES[0];
        const color = cue.color || typeInfo.color;
        const label = HOT_CUE_LABELS[cue.number ?? idx] || String(idx);
        const isLoop = cue.cue_type === 'loop';
        listHtml += `<div class="cue-list-item" style="border-left-color:${color};background:linear-gradient(90deg,${color}0a,transparent 60%)">
          <span style="font-size:10px;color:var(--text-muted);opacity:0.4">⠿</span>
          <div class="cue-badge" style="background:${color}20;border:1.5px solid ${color}60;color:${color}">${label}</div>
          <span class="cue-type-pill" style="background:${typeInfo.color}15;border:1px solid ${typeInfo.color}25">${typeInfo.icon}</span>
          <div class="cue-info">
            <div class="cue-name">${cue.name || typeInfo.label + ' ' + (idx + 1)}</div>
            <div class="cue-time-label" style="color:${color}cc">${formatTimeMs(cue.position_ms || 0)}${isLoop && cue.end_position_ms ? ` <span style="color:#60a5fa">→ ${formatTimeMs(cue.end_position_ms)}</span>` : ''}</div>
          </div>
          <div class="cue-glow-dot" style="background:${color};box-shadow:0 0 3px ${color}80"></div>
          <button class="cue-delete-btn" data-cue-id="${cue.id}" title="Supprimer">🗑</button>
        </div>`;
      });
      listHtml += '</div>';
    }

    // Legend
    const legendHtml = `<div class="cue-legend">${CUE_TYPES.slice(0, 5).map(t =>
      `<span class="cue-legend-pill" style="background:${t.color}12;border:1px solid ${t.color}25;color:${t.color}cc">${t.icon} ${t.label}</span>`
    ).join('')}</div>`;

    pane.innerHTML = autoGenHtml + timelineHtml + addHtml + listHtml + legendHtml;
  },

  // ─── Beatgrid Tab ───────────────────────────────────────
  renderBeatgridTab() {
    const pane = document.getElementById('beatgridPane');
    if (!pane) return;
    const track = this.selectedTrack;
    if (!track) { pane.innerHTML = '<div class="tab-placeholder"><span class="tab-placeholder-icon">📐</span>Sélectionne un morceau</div>'; return; }
    pane.innerHTML = `<div style="padding:16px">
      <div style="margin-bottom:12px;font-size:14px;font-weight:600;color:var(--text-primary)">Beatgrid — ${track.title}</div>
      <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:12px;padding:16px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">BPM détecté</div>
        <div style="font-size:28px;font-weight:800;color:var(--accent);font-family:var(--font-mono)">${track.bpm ? track.bpm.toFixed(1) : '—'}</div>
      </div>
      <div style="height:40px;background:rgba(0,0,0,0.3);border-radius:8px;position:relative;overflow:hidden">
        ${Array.from({length: 32}, (_, i) => `<div style="position:absolute;left:${i * 3.125}%;top:0;bottom:0;width:1px;background:${i % 4 === 0 ? 'rgba(37,99,235,0.6)' : 'rgba(255,255,255,0.1)'}"></div>`).join('')}
      </div>
    </div>`;
  },

  // ─── Stems Tab ──────────────────────────────────────────
  renderStemsTab() {
    const pane = document.getElementById('stemsPane');
    if (!pane) return;
    if (!this.selectedTrack) { pane.innerHTML = '<div class="tab-placeholder"><span class="tab-placeholder-icon">🎚️</span>Sélectionne un morceau</div>'; return; }
    const stems = [
      { name: 'Vocals', icon: '🎤', color: '#ec4899' },
      { name: 'Drums', icon: '🥁', color: '#f59e0b' },
      { name: 'Bass', icon: '🎸', color: '#22c55e' },
      { name: 'Other', icon: '🎹', color: '#8b5cf6' },
    ];
    pane.innerHTML = `<div style="padding:16px;display:flex;flex-direction:column;gap:8px">
      ${stems.map(s => `<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:10px">
        <span style="font-size:20px">${s.icon}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${s.name}</div>
          <div style="height:20px;background:rgba(0,0,0,0.3);border-radius:4px;margin-top:4px;overflow:hidden">
            ${generateWaveformSVG(400, 20, s.color, s.color + '80', s.color + '40')}
          </div>
        </div>
        <button class="ctrl-btn" style="font-size:12px">M</button>
        <button class="ctrl-btn" style="font-size:12px">S</button>
      </div>`).join('')}
    </div>`;
  },

  // ─── EQ Tab ─────────────────────────────────────────────
  renderEqTab() {
    const pane = document.getElementById('eqPane');
    if (!pane) return;
    if (!this.selectedTrack) { pane.innerHTML = '<div class="tab-placeholder"><span class="tab-placeholder-icon">🎛️</span>Sélectionne un morceau</div>'; return; }
    const bands = [
      { name: 'Low', freq: '80 Hz', color: '#ef4444', value: 0 },
      { name: 'Mid', freq: '1 kHz', color: '#eab308', value: 0 },
      { name: 'High', freq: '12 kHz', color: '#22c55e', value: 0 },
    ];
    pane.innerHTML = `<div style="padding:16px;display:flex;gap:24px;justify-content:center;align-items:flex-end;height:100%">
      ${bands.map(b => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <div style="font-size:11px;font-weight:600;color:${b.color}">${b.name}</div>
        <div style="width:40px;height:180px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:8px;position:relative">
          <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:2px;height:60%;background:${b.color}40;border-radius:1px"></div>
          <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:20px;height:8px;background:${b.color};border-radius:4px;cursor:pointer;box-shadow:0 0 8px ${b.color}40"></div>
        </div>
        <div style="font-size:10px;color:var(--text-muted)">${b.freq}</div>
        <div style="font-size:11px;font-weight:600;color:var(--text-primary);font-family:var(--font-mono)">${b.value > 0 ? '+' : ''}${b.value} dB</div>
      </div>`).join('')}
    </div>`;
  },

  // ─── FX Tab ─────────────────────────────────────────────
  renderFxTab() {
    const pane = document.getElementById('fxPane');
    if (!pane) return;
    if (!this.selectedTrack) { pane.innerHTML = '<div class="tab-placeholder"><span class="tab-placeholder-icon">✨</span>Sélectionne un morceau</div>'; return; }
    const effects = [
      { name: 'Reverb', icon: '🌊', color: '#3b82f6' },
      { name: 'Delay', icon: '🔄', color: '#8b5cf6' },
      { name: 'Filter', icon: '🎚️', color: '#06b6d4' },
      { name: 'Phaser', icon: '💫', color: '#ec4899' },
    ];
    pane.innerHTML = `<div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${effects.map(fx => `<div style="padding:16px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:12px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">${fx.icon}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">${fx.name}</div>
        <div style="width:60px;height:60px;border-radius:50%;border:3px solid ${fx.color}40;margin:0 auto;display:flex;align-items:center;justify-content:center">
          <span style="font-size:14px;font-weight:700;color:${fx.color};font-family:var(--font-mono)">0%</span>
        </div>
      </div>`).join('')}
    </div>`;
  },

  // ─── Mix Tab ────────────────────────────────────────────
  renderMixTab() {
    const pane = document.getElementById('mixPane');
    if (!pane) return;
    const track = this.selectedTrack;
    if (!track) { pane.innerHTML = '<div class="tab-placeholder"><span class="tab-placeholder-icon">🎧</span>Sélectionne un morceau pour voir les tracks compatibles</div>'; return; }

    const keyColor = getKeyColor(track.key);
    const bpm = track.bpm || 0;

    // Find compatible tracks
    const compatible = this.tracks
      .filter(t => t.id !== track.id && t.key && t.bpm)
      .filter(t => {
        const tolerance = (this.bpmTolerance / 100) * bpm;
        return Math.abs(bpm - t.bpm) <= tolerance;
      })
      .map(t => ({ track: t, score: Math.round(100 - Math.abs(bpm - t.bpm) * 2) }))
      .sort((a, b) => b.score - a.score);

    let html = `
      <div class="mix-current">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Morceau actuel</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="padding:4px 12px;border-radius:8px;font-weight:700;font-size:14px;color:white;background:${keyColor}">${track.key || '—'}</span>
          <span style="font-size:14px;font-family:var(--font-mono);color:var(--text-primary)">${bpm.toFixed(1)} BPM</span>
        </div>
      </div>
      <div class="mix-tolerance">
        <div style="font-size:14px;font-weight:600;color:var(--text-secondary)">Tolérance BPM: ±${this.bpmTolerance}%</div>
        <input type="range" min="0" max="20" value="${this.bpmTolerance}" id="bpmToleranceSlider">
        <div style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:4px">±${((this.bpmTolerance / 100) * bpm).toFixed(1)} BPM</div>
      </div>
      <div class="mix-results">
        <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Morceaux compatibles (${compatible.length})</div>
        ${compatible.length === 0 ? '<p style="font-size:14px;color:var(--text-muted);padding:12px">Aucun morceau compatible</p>' :
          compatible.map(({ track: t, score }) => `<button class="mix-track-card" data-mix-track="${t.id}">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
              <span style="padding:4px 8px;border-radius:8px;font-weight:700;font-size:12px;color:white;background:${getKeyColor(t.key)}">${t.key}</span>
              <span style="font-size:14px;font-family:var(--font-mono);color:var(--text-primary)">${t.bpm?.toFixed(1)} BPM</span>
            </div>
            <div style="font-size:14px;color:var(--text-secondary)">${t.title}</div>
            <div style="font-size:12px;color:var(--text-muted)">${t.artist}</div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-top:8px">
              <span>Compatibilité</span><span>${score}%</span>
            </div>
            <div class="mix-score-bar"><div class="mix-score-fill" style="width:${score}%"></div></div>
          </button>`).join('')}
      </div>
    `;
    pane.innerHTML = html;

    // Bind tolerance slider
    pane.querySelector('#bpmToleranceSlider')?.addEventListener('input', (e) => {
      this.bpmTolerance = parseInt(e.target.value);
      this.renderMixTab();
    });

    // Bind track clicks
    pane.querySelectorAll('[data-mix-track]').forEach(btn => {
      btn.addEventListener('click', () => this.selectTrack(parseInt(btn.dataset.mixTrack)));
    });
  },

  // ─── Playlists Tab ──────────────────────────────────────
  renderPlaylistsTab() {
    const pane = document.getElementById('playlistsPane');
    if (!pane) return;
    pane.innerHTML = `<div style="padding:16px">
      <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Playlists</div>
      ${this.playlists.length === 0 ?
        '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">Aucune playlist — crée-en une depuis la sidebar</div>' :
        this.playlists.map(pl => `<div style="padding:10px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:8px;margin-bottom:8px;cursor:pointer">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${pl.name}</div>
          <div style="font-size:12px;color:var(--text-muted)">${pl.count || 0} tracks</div>
        </div>`).join('')
      }
    </div>`;
  },

  // ─── Stats Tab (enrichi — parité web) ───────────────────
  renderStatsTab() {
    const pane = document.getElementById('statsPane');
    if (!pane) return;
    const tracks = this.tracks;
    const total = tracks.length;
    if (total === 0) {
      pane.innerHTML = `<div class="empty-state">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none"><rect x="6" y="24" width="8" height="26" rx="2" fill="currentColor" opacity="0.2"/><rect x="18" y="16" width="8" height="34" rx="2" fill="currentColor" opacity="0.3"/><rect x="30" y="8" width="8" height="42" rx="2" fill="currentColor" opacity="0.4"/><rect x="42" y="20" width="8" height="30" rx="2" fill="currentColor" opacity="0.25"/></svg>
        <h3>Pas de statistiques</h3><p>Importez des morceaux pour voir vos analytics</p>
      </div>`;
      return;
    }
    const analyzed = tracks.filter(t => t.analyzed).length;
    const bpms = tracks.filter(t => t.bpm).map(t => t.bpm);
    const avgBpm = bpms.length ? (bpms.reduce((a, b) => a + b, 0) / bpms.length).toFixed(1) : '—';
    const energies = tracks.filter(t => t.energy != null).map(t => t.energy);
    const avgEnergy = energies.length ? (energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(0) : '—';
    const totalSec = tracks.reduce((s, t) => s + parseDuration(t.duration), 0);
    const totalDur = totalSec > 3600 ? `${Math.floor(totalSec/3600)}h ${Math.floor((totalSec%3600)/60)}m` : `${Math.floor(totalSec/60)}m`;

    // BPM histogram (5-increment buckets)
    const bpmBuckets = {};
    bpms.forEach(b => { const bucket = Math.floor(b / 5) * 5; bpmBuckets[bucket] = (bpmBuckets[bucket] || 0) + 1; });
    const bpmEntries = Object.entries(bpmBuckets).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    const bpmMax = Math.max(...bpmEntries.map(e => e[1]), 1);

    // Energy distribution (4 buckets)
    const eBuckets = { 'Chill (0-30)': 0, 'Medium (31-60)': 0, 'High (61-80)': 0, 'Peak (81-100)': 0 };
    const eColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
    energies.forEach(e => { if (e <= 30) eBuckets['Chill (0-30)']++; else if (e <= 60) eBuckets['Medium (31-60)']++; else if (e <= 80) eBuckets['High (61-80)']++; else eBuckets['Peak (81-100)']++; });
    const eMax = Math.max(...Object.values(eBuckets), 1);

    // Genre distribution (top 8)
    const genres = {};
    tracks.forEach(t => { if (t.genre) genres[t.genre] = (genres[t.genre] || 0) + 1; });
    const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const genreMax = topGenres.length ? topGenres[0][1] : 1;

    // Key distribution (top 12)
    const keys = {};
    tracks.forEach(t => { if (t.key) keys[t.key] = (keys[t.key] || 0) + 1; });
    const topKeys = Object.entries(keys).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const keyMax = topKeys.length ? topKeys[0][1] : 1;

    // Tags cloud
    const tags = {};
    tracks.forEach(t => { (t.tags || []).forEach(tag => { tags[tag] = (tags[tag] || 0) + 1; }); });
    const tagEntries = Object.entries(tags).sort((a, b) => b[1] - a[1]);
    const tagMax = tagEntries.length ? tagEntries[0][1] : 1;

    // Rating distribution
    const ratings = [0, 0, 0, 0, 0];
    tracks.forEach(t => { if (t.rating >= 1 && t.rating <= 5) ratings[t.rating - 1]++; });
    const ratingMax = Math.max(...ratings, 1);

    pane.innerHTML = `<div class="stats-container">
      <div class="stats-cards">
        <div class="stats-card"><div class="stats-card-icon" style="color:var(--accent)">&#x266b;</div><div class="stats-card-value" style="color:var(--accent)">${total}</div><div class="stats-card-label">Morceaux</div></div>
        <div class="stats-card"><div class="stats-card-icon" style="color:#06b6d4">&#x2693;</div><div class="stats-card-value" style="color:#06b6d4">${avgBpm}</div><div class="stats-card-label">BPM moyen</div></div>
        <div class="stats-card"><div class="stats-card-icon" style="color:#f59e0b">&#x26a1;</div><div class="stats-card-value" style="color:#f59e0b">${avgEnergy}%</div><div class="stats-card-label">Énergie moy.</div></div>
        <div class="stats-card"><div class="stats-card-icon" style="color:#8b5cf6">&#x23f1;</div><div class="stats-card-value" style="color:#8b5cf6">${totalDur}</div><div class="stats-card-label">Durée totale</div></div>
      </div>
      <div class="stats-grid">
        <div class="stats-section"><div class="stats-section-title">Distribution BPM</div>
          ${bpmEntries.map(([b, c]) => `<div class="stats-bar-row"><span class="stats-bar-label">${b}</span><div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(c/bpmMax)*100}%;background:var(--accent)"><span class="stats-bar-count">${c}</span></div></div></div>`).join('')}
        </div>
        <div class="stats-section"><div class="stats-section-title">Distribution Énergie</div>
          ${Object.entries(eBuckets).map(([label, count], i) => `<div class="stats-bar-row"><span class="stats-bar-label" style="min-width:80px;font-size:10px">${label}</span><div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(count/eMax)*100}%;background:${eColors[i]}"><span class="stats-bar-count">${count}</span></div></div></div>`).join('')}
        </div>
        <div class="stats-section"><div class="stats-section-title">Top Genres</div>
          ${topGenres.map(([g, c]) => `<div class="stats-bar-row"><span class="stats-bar-label" style="min-width:90px;font-size:10px;text-align:left">${g}</span><div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(c/genreMax)*100}%;background:#8b5cf6"><span class="stats-bar-count">${c}</span></div></div></div>`).join('')}
          ${topGenres.length === 0 ? '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:8px">Aucun genre</div>' : ''}
        </div>
        <div class="stats-section"><div class="stats-section-title">Distribution Tonalité</div>
          ${topKeys.map(([k, c]) => {
            const kc = getKeyColor(k);
            return `<div class="stats-bar-row"><span class="stats-bar-label" style="color:${kc}">${k}</span><div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(c/keyMax)*100}%;background:${kc}"><span class="stats-bar-count">${c}</span></div></div></div>`;
          }).join('')}
        </div>
      </div>
      ${tagEntries.length > 0 ? `<div class="stats-section"><div class="stats-section-title">Tags</div><div class="stats-tags-cloud">
        ${tagEntries.map(([tag, count]) => `<span class="stats-tag" style="opacity:${0.4 + 0.6 * (count/tagMax)}">${tag} (${count})</span>`).join('')}
      </div></div>` : ''}
      <div class="stats-section"><div class="stats-section-title">Évaluations</div>
        ${[5,4,3,2,1].map(star => `<div class="stats-rating-row">
          <span class="stats-rating-stars">${'★'.repeat(star)}${'☆'.repeat(5-star)}</span>
          <div class="stats-rating-bar"><div class="stats-rating-fill" style="width:${(ratings[star-1]/ratingMax)*100}%"></div></div>
          <span class="stats-rating-count">${ratings[star-1]}</span>
        </div>`).join('')}
      </div>
    </div>`;
  },

  // ─── History Tab ────────────────────────────────────────
  renderHistoryTab() {
    const pane = document.getElementById('historyPane');
    if (!pane) return;
    pane.innerHTML = '<div class="tab-placeholder"><span class="tab-placeholder-icon">📜</span>Historique de lecture — Joue des morceaux pour commencer</div>';
  },

  // ─── Notes Tab ──────────────────────────────────────────
  renderNotesTab() {
    const pane = document.getElementById('notesPane');
    if (!pane) return;
    pane.innerHTML = `<div style="display:flex;flex-direction:column;height:100%;padding:12px;gap:8px">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Notes de session</div>
      <textarea id="sessionNotesArea" placeholder="Tes notes, idées, setlist, observations…"
        style="flex:1;min-height:200px;padding:8px;border-radius:8px;background:var(--bg-primary);border:1px solid var(--border-default);font-size:12px;color:var(--text-primary);outline:none;resize:none;line-height:1.6;font-family:var(--font-main)">${this.sessionNotes}</textarea>
      <div style="display:flex;gap:8px">
        <button class="ctrl-btn" id="clearNotes">Effacer</button>
        <button class="ctrl-btn" id="exportNotes">⬇ Export</button>
        <span style="margin-left:auto;font-size:10px;color:var(--text-muted);align-self:flex-end" id="notesCharCount">${this.sessionNotes.length} car.</span>
      </div>
    </div>`;

    const area = pane.querySelector('#sessionNotesArea');
    const charCount = pane.querySelector('#notesCharCount');
    area?.addEventListener('input', () => {
      this.sessionNotes = area.value;
      if (charCount) charCount.textContent = area.value.length + ' car.';
    });
    pane.querySelector('#clearNotes')?.addEventListener('click', () => {
      this.sessionNotes = '';
      if (area) area.value = '';
      if (charCount) charCount.textContent = '0 car.';
    });
    pane.querySelector('#exportNotes')?.addEventListener('click', async () => {
      if (window.cueforge?.saveTextFile) {
        await window.cueforge.saveTextFile(this.sessionNotes, 'notes-session.txt', 'Text', 'txt');
        showToast('Notes exportées', 'success');
      }
    });
  },

  // ═══════════════════════════════════════════════════════════
  // RENDER PAGES (Set Builder, Upload, Export)
  // ═══════════════════════════════════════════════════════════
  renderPages() {
    this.renderSetBuilderPage();
    this.renderUploadPage();
    this.renderExportPage();
  },

  renderSetBuilderPage() {
    const el = document.getElementById('setBuilderContent');
    if (!el) return;

    // Load sets from localStorage or init
    if (!this.sets.length) {
      const saved = localStorage.getItem('cf_sets');
      if (saved) { try { this.sets = JSON.parse(saved); } catch(e) {} }
    }

    const activeSet = this.sets.find(s => s.id === this.activeSetId);
    const setTracks = activeSet ? activeSet.trackIds.map(id => this.tracks.find(t => t.id === id)).filter(Boolean) : [];

    // Header with tabs
    el.innerHTML = `
      <div class="page-header">
        <div class="page-header-icon" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6)">&#x266b;</div>
        <div class="page-header-text">
          <div class="page-header-title">Set Builder</div>
          <div class="page-header-desc">Construis et planifie tes sets DJ</div>
        </div>
        <div class="page-header-actions">
          <button class="btn-secondary" id="sbAddTrackBtn">+ Ajouter des tracks</button>
          ${activeSet ? `<button class="btn-secondary" id="sbExportBtn">&#x2b07; Exporter</button>` : ''}
        </div>
      </div>
      <div class="sb-tabs" id="sbTabs">
        ${this.sets.map(s => `<button class="sb-tab${s.id === this.activeSetId ? ' active' : ''}" data-set-id="${s.id}">${s.name}</button>`).join('')}
        <button class="sb-tab-add" id="sbNewSet" title="Nouveau set">+</button>
      </div>
      <div class="sb-container" id="sbBody"></div>
    `;

    const body = el.querySelector('#sbBody');

    if (!activeSet) {
      body.innerHTML = `<div class="sb-empty-drop">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="20" stroke="currentColor" stroke-width="2" fill="none" opacity="0.2"/><path d="M28 20v16M20 28h16" stroke="currentColor" stroke-width="2" opacity="0.4"/></svg>
        <div style="font-size:15px;font-weight:600;margin-top:8px">Crée ton premier set</div>
        <div style="font-size:12px;margin-top:4px">Clique sur + pour commencer</div>
      </div>`;
    } else {
      // Stats header
      const totalDur = setTracks.reduce((s, t) => s + parseDuration(t.duration), 0);
      const durStr = totalDur > 3600 ? `${Math.floor(totalDur/3600)}h${Math.floor((totalDur%3600)/60)}m` : `${Math.floor(totalDur/60)}m`;
      const bpms = setTracks.filter(t => t.bpm).map(t => t.bpm);
      const bpmRange = bpms.length ? `${Math.min(...bpms).toFixed(0)}–${Math.max(...bpms).toFixed(0)}` : '—';

      // Compute transitions
      const transitions = [];
      for (let i = 0; i < setTracks.length - 1; i++) {
        const a = setTracks[i], b = setTracks[i + 1];
        const bpmDiff = Math.abs((a.bpm || 0) - (b.bpm || 0));
        const keyCompat = this._keyCompatibility(a.key, b.key);
        const score = Math.max(0, 100 - bpmDiff * 3 - (keyCompat === 'perfect' ? 0 : keyCompat === 'compatible' ? 15 : 40));
        transitions.push({ bpmDiff, keyCompat, score });
      }
      const avgScore = transitions.length ? Math.round(transitions.reduce((s, t) => s + t.score, 0) / transitions.length) : 0;

      body.innerHTML = `
        <div class="sb-header">
          <div class="sb-header-stats">
            <div class="sb-stat"><div class="sb-stat-value">${setTracks.length}</div><div class="sb-stat-label">Tracks</div></div>
            <div class="sb-stat"><div class="sb-stat-value">${durStr}</div><div class="sb-stat-label">Durée</div></div>
            <div class="sb-stat"><div class="sb-stat-value">${bpmRange}</div><div class="sb-stat-label">BPM</div></div>
            <div class="sb-stat"><div class="sb-stat-value" style="color:${avgScore >= 70 ? '#22c55e' : avgScore >= 40 ? '#f59e0b' : '#ef4444'}">${avgScore}%</div><div class="sb-stat-label">Mix Score</div></div>
          </div>
          <div class="sb-actions">
            <button class="btn-secondary" style="color:#ef4444;border-color:rgba(239,68,68,0.3)" id="sbDeleteSet">Supprimer</button>
          </div>
        </div>
        ${setTracks.length > 0 ? `<div class="sb-energy-curve"><div class="sb-energy-title">Courbe d'énergie</div>
          <svg width="100%" height="60" viewBox="0 0 ${setTracks.length * 60} 60" preserveAspectRatio="none">
            ${setTracks.map((t, i) => {
              const e = t.energy || 0;
              const h = (e / 100) * 50;
              const col = e >= 80 ? '#ef4444' : e >= 60 ? '#f59e0b' : e >= 40 ? '#22c55e' : '#3b82f6';
              return `<rect x="${i * 60 + 5}" y="${55 - h}" width="50" height="${h}" rx="4" fill="${col}" opacity="0.6"/>`;
            }).join('')}
          </svg>
        </div>` : ''}
        <div class="sb-tracklist" id="sbTrackList">
          ${setTracks.length === 0 ? `<div style="padding:32px;text-align:center;color:var(--text-muted)">
            <div style="font-size:14px;font-weight:600">Set vide</div>
            <div style="font-size:12px;margin-top:4px">Ajoute des tracks depuis ta bibliothèque</div>
          </div>` : ''}
          ${setTracks.map((track, i) => {
            const keyColor = getKeyColor(track.key);
            const eColor = track.energy >= 80 ? '#ef4444' : track.energy >= 60 ? '#f59e0b' : track.energy >= 40 ? '#22c55e' : '#3b82f6';
            let transHtml = '';
            if (i < transitions.length) {
              const tr = transitions[i];
              const cls = tr.score >= 70 ? 'sb-transition-good' : tr.score >= 40 ? 'sb-transition-ok' : 'sb-transition-bad';
              transHtml = `<div class="sb-transition">
                <div class="sb-transition-line"></div>
                <span class="sb-transition-badge ${cls}">BPM ${tr.bpmDiff > 0 ? ('+' + tr.bpmDiff.toFixed(0)) : '0'}</span>
                <span class="sb-transition-badge ${cls}">${tr.keyCompat}</span>
                <span class="sb-transition-badge ${cls}">${tr.score}%</span>
                <div class="sb-transition-line"></div>
              </div>`;
            }
            return `<div class="sb-track-row" data-sb-idx="${i}">
              <span class="sb-track-grip">&#x2630;</span>
              <span class="sb-track-pos">${i + 1}</span>
              <div class="sb-track-info"><div class="sb-track-title">${track.title}</div><div class="sb-track-artist">${track.artist}</div></div>
              <span class="sb-track-bpm">${track.bpm ? Math.round(track.bpm) : '—'}</span>
              ${track.key ? `<span class="sb-track-key" style="background:${keyColor}22;color:${keyColor}">${track.key}</span>` : '<span style="color:var(--text-muted)">—</span>'}
              <div class="sb-track-energy"><div class="sb-track-energy-fill" style="width:${track.energy || 0}%;background:${eColor}"></div></div>
              <span class="sb-track-duration">${track.duration || '—'}</span>
              <button class="sb-track-remove" data-remove-idx="${i}" title="Retirer">&#x2715;</button>
            </div>${transHtml}`;
          }).join('')}
        </div>
        ${setTracks.length > 0 && this.tracks.length > setTracks.length ? this._renderSbSuggestions(setTracks) : ''}
      `;
    }

    // Bind Set Builder events
    el.querySelectorAll('.sb-tab[data-set-id]').forEach(tab => {
      tab.addEventListener('click', () => { this.activeSetId = parseInt(tab.dataset.setId); this.renderSetBuilderPage(); });
    });
    el.querySelector('#sbNewSet')?.addEventListener('click', async () => {
      const name = typeof promptModal === 'function' ? await promptModal('Nom du set', 'Mon Set') : prompt('Nom du set', 'Mon Set');
      if (!name) return;
      const id = Date.now();
      this.sets.push({ id, name, trackIds: [] });
      this.activeSetId = id;
      this._saveSets();
      this.renderSetBuilderPage();
    });
    el.querySelector('#sbDeleteSet')?.addEventListener('click', async () => {
      const ok = typeof confirmModal === 'function' ? await confirmModal('Supprimer ce set ?') : confirm('Supprimer ce set ?');
      if (!ok) return;
      this.sets = this.sets.filter(s => s.id !== this.activeSetId);
      this.activeSetId = this.sets.length ? this.sets[0].id : null;
      this._saveSets();
      this.renderSetBuilderPage();
    });
    el.querySelectorAll('.sb-track-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.removeIdx);
        if (activeSet) { activeSet.trackIds.splice(idx, 1); this._saveSets(); this.renderSetBuilderPage(); }
      });
    });
    el.querySelector('#sbAddTrackBtn')?.addEventListener('click', () => this._showTrackPicker());
    el.querySelector('#sbExportBtn')?.addEventListener('click', () => {
      if (activeSet) this.exportRekordbox(activeSet.trackIds);
    });
    el.querySelectorAll('.sb-suggestion-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.dataset.trackId);
        if (activeSet && !activeSet.trackIds.includes(id)) {
          activeSet.trackIds.push(id);
          this._saveSets();
          this.renderSetBuilderPage();
        }
      });
    });
  },

  _saveSets() { localStorage.setItem('cf_sets', JSON.stringify(this.sets)); },

  _keyCompatibility(k1, k2) {
    if (!k1 || !k2) return 'unknown';
    const c1 = CAMELOT.find(c => c.n === k1 || c.key === k1);
    const c2 = CAMELOT.find(c => c.n === k2 || c.key === k2);
    if (!c1 || !c2) return 'unknown';
    const n1 = parseInt(c1.n), n2 = parseInt(c2.n);
    const l1 = c1.n.slice(-1), l2 = c2.n.slice(-1);
    if (c1.n === c2.n) return 'perfect';
    if (l1 === l2 && (Math.abs(n1 - n2) === 1 || Math.abs(n1 - n2) === 11)) return 'compatible';
    if (n1 === n2 && l1 !== l2) return 'compatible';
    return 'clash';
  },

  _renderSbSuggestions(setTracks) {
    const last = setTracks[setTracks.length - 1];
    if (!last) return '';
    const usedIds = new Set(setTracks.map(t => t.id));
    const scored = this.tracks
      .filter(t => !usedIds.has(t.id))
      .map(t => {
        const bpmDiff = Math.abs((last.bpm || 0) - (t.bpm || 0));
        const keyCompat = this._keyCompatibility(last.key, t.key);
        const score = Math.max(0, 100 - bpmDiff * 3 - (keyCompat === 'perfect' ? 0 : keyCompat === 'compatible' ? 15 : 40));
        return { ...t, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (!scored.length) return '';
    return `<div class="sb-suggestions"><div class="sb-suggestions-title">Suggestions (après ${last.title})</div>
      ${scored.map(t => {
        const sc = t.score >= 70 ? '#22c55e' : t.score >= 40 ? '#f59e0b' : '#ef4444';
        return `<div class="sb-suggestion-row" data-track-id="${t.id}">
          <div class="sb-suggestion-score" style="background:${sc}22;color:${sc}">${t.score}</div>
          <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div><div style="font-size:11px;color:var(--text-secondary)">${t.artist}</div></div>
          <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${t.bpm ? Math.round(t.bpm) : '—'}</span>
          ${t.key ? `<span class="sb-track-key" style="background:${getKeyColor(t.key)}22;color:${getKeyColor(t.key)}">${t.key}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  },

  _showTrackPicker() {
    const activeSet = this.sets.find(s => s.id === this.activeSetId);
    if (!activeSet) { showToast('Crée un set d\'abord', 'info'); return; }
    // Create a modal picker
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    const usedIds = new Set(activeSet.trackIds);
    const available = this.tracks.filter(t => !usedIds.has(t.id));
    overlay.innerHTML = `<div class="modal-dialog" style="max-width:500px;max-height:70vh;display:flex;flex-direction:column">
      <div class="modal-title">Ajouter des tracks</div>
      <input type="text" id="pickerSearch" placeholder="Rechercher…" style="padding:8px;border-radius:6px;border:1px solid var(--border-default);background:var(--bg-primary);color:var(--text-primary);font-size:13px;outline:none;margin-bottom:8px">
      <div id="pickerList" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:2px">
        ${available.map(t => `<div class="sb-suggestion-row" data-pick-id="${t.id}" style="cursor:pointer">
          <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;color:var(--text-primary)">${t.title}</div><div style="font-size:11px;color:var(--text-secondary)">${t.artist}</div></div>
          <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${t.bpm ? Math.round(t.bpm) : ''}</span>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn-secondary modal-cancel" style="flex:1">Fermer</button></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#pickerSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      overlay.querySelectorAll('[data-pick-id]').forEach(row => {
        const title = row.querySelector('div div:first-child')?.textContent.toLowerCase() || '';
        row.style.display = title.includes(q) ? '' : 'none';
      });
    });
    overlay.querySelectorAll('[data-pick-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.dataset.pickId);
        activeSet.trackIds.push(id);
        row.remove();
        this._saveSets();
        this.renderSetBuilderPage();
      });
    });
  },

  renderUploadPage() {
    const el = document.getElementById('uploadContent');
    if (!el) return;
    el.innerHTML = `
      <div class="page-title">Importer</div>
      <div class="page-desc">Ajoute des tracks à ta bibliothèque</div>
      <div class="card">
        <div style="border:2px dashed var(--border-default);border-radius:14px;padding:48px;text-align:center;cursor:pointer" id="uploadDropZone">
          <div style="font-size:48px;margin-bottom:12px;opacity:0.3">&#x2b06;</div>
          <div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Glisse tes fichiers audio ici</div>
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">MP3, WAV, FLAC, M4A, AIFF, OGG</div>
          <button class="import-btn" style="padding:10px 24px;border-radius:10px;background:var(--accent);color:white;font-size:14px;font-weight:600;border:none;cursor:pointer" onclick="CueForgeApp.importFiles()">
            📁 Parcourir les fichiers
          </button>
        </div>
      </div>
    `;
  },

  renderExportPage() {
    const el = document.getElementById('exportContent');
    if (!el) return;
    el.innerHTML = `
      <div class="page-title">Exporter</div>
      <div class="page-desc">Exporte ta bibliothèque vers ton logiciel DJ</div>
      <div class="card">
        <div class="card-title">📥 Formats d'export</div>
        <div class="card-grid">
          ${EXPORT_FORMATS.map(f => `<div class="card-item" data-export="${f.id}">
            <div class="card-item-icon" style="background:${f.color}15;border:1px solid ${f.color}30">
              <span>${f.icon}</span>
            </div>
            <div>
              <div class="card-item-label">${f.label}</div>
              <div class="card-item-desc">${f.desc}</div>
            </div>
          </div>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:16px">${this.tracks.length} morceaux dans la bibliothèque</div>
      </div>
    `;

    // Bind export buttons
    el.querySelectorAll('[data-export]').forEach(item => {
      item.addEventListener('click', () => {
        const fmt = item.dataset.export;
        switch (fmt) {
          case 'rekordbox': this.exportRekordbox(); break;
          case 'csv': this.exportCSV(); break;
          case 'txt': this.exportTXT(); break;
          case 'serato': this.exportSerato(); break;
          default: showToast(`Export ${fmt} bientôt disponible`, 'info'); break;
        }
      });
    });
  },

  // ═══════════════════════════════════════════════════════════
  // EXPORT FUNCTIONS
  // ═══════════════════════════════════════════════════════════
  async exportRekordbox(trackIds) {
    try {
      // 1. Essayer l'export cloud (XML complet depuis l'API)
      if (window.cueforge?.api?.export?.rekordboxBatch && trackIds?.length) {
        const xml = await window.cueforge.api.export.rekordboxBatch(trackIds);
        if (xml) {
          await window.cueforge.saveTextFile(xml, 'CueForge_Rekordbox.xml', 'Rekordbox XML', 'xml');
          showToast('☁️ Rekordbox XML exporté', 'success');
          return;
        }
      }
      if (window.cueforge?.api?.export?.rekordboxAll && !trackIds) {
        const xml = await window.cueforge.api.export.rekordboxAll();
        if (xml) {
          await window.cueforge.saveTextFile(xml, 'CueForge_Rekordbox.xml', 'Rekordbox XML', 'xml');
          showToast('☁️ Rekordbox XML exporté', 'success');
          return;
        }
      }
      // 2. Fallback local
      if (window.cueforge?.exportRekordbox) {
        const result = await window.cueforge.exportRekordbox(trackIds || null);
        if (result) showToast('💾 Rekordbox XML exporté (local)', 'success');
      } else {
        showToast('Export Rekordbox non disponible', 'error');
      }
    } catch (e) {
      // Fallback local en cas d'erreur cloud
      try {
        if (window.cueforge?.exportRekordbox) {
          const result = await window.cueforge.exportRekordbox(trackIds || null);
          if (result) showToast('💾 Rekordbox XML exporté (local)', 'success');
          return;
        }
      } catch {}
      showToast('Erreur export Rekordbox', 'error');
    }
  },

  async exportSerato() {
    try {
      // Serato : toujours export local (fichier .crate)
      if (window.cueforge?.exportSerato) {
        const result = await window.cueforge.exportSerato(null);
        if (result) showToast('Serato export OK', 'success');
      }
    } catch (e) { showToast('Erreur export Serato', 'error'); }
  },

  async exportCSV() {
    const lines = ['Titre,Artiste,BPM,Tonalité,Genre,Énergie,Durée'];
    this.tracks.forEach(t => {
      lines.push(`"${t.title}","${t.artist}",${t.bpm||''},${t.key||''},"${t.genre||''}",${t.energy||''},${t.duration||''}`);
    });
    if (window.cueforge?.saveTextFile) {
      await window.cueforge.saveTextFile(lines.join('\n'), 'CueForge_Tracklist.csv', 'CSV', 'csv');
      showToast('CSV exporté', 'success');
    }
  },

  async exportTXT() {
    const lines = this.tracks.map((t, i) => `${i + 1}. ${t.artist} — ${t.title} [${t.bpm || '?'} BPM / ${t.key || '?'}]`);
    if (window.cueforge?.saveTextFile) {
      await window.cueforge.saveTextFile(lines.join('\n'), 'CueForge_Tracklist.txt', 'Text', 'txt');
      showToast('TXT exporté', 'success');
    }
  },

  // ═══════════════════════════════════════════════════════════
  // PLAYLIST MANAGEMENT
  // ═══════════════════════════════════════════════════════════
  createPlaylist(name) {
    const pl = { id: 'playlist_' + Date.now(), name, count: 0, tracks: [] };
    this.playlists.push(pl);
    this.renderPlaylistsSidebar();
    this.renderPlaylistsTab();
    showToast(`Playlist "${name}" créée`, 'success');
  },

  deletePlaylist(playlistId) {
    this.playlists = this.playlists.filter(p => p.id !== playlistId);
    this.renderPlaylistsSidebar();
    this.renderPlaylistsTab();
    showToast('Playlist supprimée', 'success');
  },

  renderPlaylistsSidebar() {
    const list = document.getElementById('playlistsList');
    if (!list) return;
    list.innerHTML = this.playlists.map(pl => `
      <div class="playlist-item" data-playlist="${pl.id}">
        <div class="playlist-left">
          <span class="playlist-icon">🎵</span>
          <span class="playlist-name">${pl.name}</span>
        </div>
        <div class="playlist-right">
          <span class="playlist-count">${pl.count}</span>
          <button class="playlist-delete" data-delete-playlist="${pl.id}" title="Supprimer">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.playlist-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePlaylist(btn.dataset.deletePlaylist);
      });
    });
  },

  // ═══════════════════════════════════════════════════════════
  // BIND EVENTS
  // ═══════════════════════════════════════════════════════════
  bindEvents() {
    // Sort
    document.getElementById('trackSort')?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.renderTrackList();
    });

    // Search
    document.getElementById('trackSearch')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderTrackList();
    });

    // View toggle (list/grid)
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.viewMode = btn.dataset.view;
        this.renderTrackList();
      });
    });

    // Global search
    document.getElementById('globalSearch')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      document.getElementById('trackSearch').value = e.target.value;
      this.renderTrackList();
    });

    // Prev/Next track
    document.getElementById('btnPrevTrack')?.addEventListener('click', () => this.selectPrevTrack());
    document.getElementById('btnNextTrack')?.addEventListener('click', () => this.selectNextTrack());

    // Drag & drop on window
    const dropOverlay = document.getElementById('dropOverlay');
    let dragCounter = 0;
    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dropOverlay) dropOverlay.classList.add('show');
    });
    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && dropOverlay) { dropOverlay.classList.remove('show'); dragCounter = 0; }
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (dropOverlay) dropOverlay.classList.remove('show');
      const files = Array.from(e.dataTransfer?.files || []);
      const audioPaths = files.map(f => f.path).filter(Boolean);
      if (audioPaths.length > 0) {
        // Réutiliser le même flow robuste que importFiles via openFileDialog interne
        showToast(`Import de ${audioPaths.length} fichier(s) en cours…`, 'info');
        let imported = 0;
        for (const filePath of audioPaths) {
          try {
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
            const baseName = fileName.replace(/\.[^.]+$/, '') || 'Sans titre';
            let meta = {};
            try { meta = await window.cueforge?.readMetadata(filePath) || {}; if (meta.error) meta = {}; } catch { meta = {}; }
            let trackResult = null;
            try {
              if (window.cueforge?.data?.tracks?.upload) {
                const result = await window.cueforge.data.tracks.upload(filePath);
                trackResult = result?.data;
              } else if (window.cueforge?.upsertTrack) {
                const localId = await window.cueforge.upsertTrack({ file_path: filePath, file_name: fileName, title: meta.title || baseName, artist: meta.artist || 'Artiste inconnu', album: meta.album || '', bpm: meta.bpm, key: meta.key, duration: meta.duration ? formatDuration(meta.duration) : '0:00', format: meta.format || '', file_size: meta.fileSize || 0 });
                trackResult = { id: localId, title: meta.title || baseName, artist: meta.artist || 'Artiste inconnu' };
              }
            } catch { trackResult = { id: Date.now(), title: meta.title || baseName, artist: meta.artist || 'Artiste inconnu' }; }
            if (!this.tracks.find(t => t.filePath === filePath)) {
              this.tracks.push({ id: trackResult?.remote_id || trackResult?.id || Date.now(), localId: trackResult?.id, title: trackResult?.title || meta.title || baseName, artist: trackResult?.artist || meta.artist || 'Artiste inconnu', genre: meta.genre || '', bpm: meta.bpm || null, key: meta.key || null, energy: null, duration: meta.duration ? formatDuration(meta.duration) : '0:00', rating: 0, tags: [], analyzed: false, color: null, filePath, cuePoints: [] });
              imported++;
            }
          } catch (err) { console.warn('Drop import error:', err); }
        }
        this.renderTrackList();
        this.updateFilterGenres();
        showToast(imported > 0 ? `${imported} fichier(s) importé(s)` : 'Aucun nouveau fichier importé', imported > 0 ? 'success' : 'info');
      }
    });

    // Library filters
    document.querySelectorAll('[data-lib]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-lib]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Could filter tracks by library section here
      });
    });

    // Crate items
    document.querySelectorAll('[data-crate]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-crate]').forEach(b => b.classList.remove('active'));
        btn.classList.toggle('active');
      });
    });
  },
};
