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
  for (let i = 0; i < bars; i++) {
    const x = i * 3;
    const h1 = (Math.sin(i * 0.15) * 0.4 + 0.5) * height * 0.4 + Math.random() * height * 0.1;
    const h2 = (Math.cos(i * 0.2) * 0.3 + 0.4) * height * 0.3 + Math.random() * height * 0.08;
    const h3 = (Math.sin(i * 0.25 + 1) * 0.2 + 0.3) * height * 0.2 + Math.random() * height * 0.05;
    const y1 = height / 2 - h1 / 2;
    const y2 = height / 2 - h2 / 2;
    const y3 = height / 2 - h3 / 2;
    paths += `<rect x="${x}" y="${y3}" width="2" height="${h3}" fill="${color3}" opacity="0.4" rx="1"/>`;
    paths += `<rect x="${x}" y="${y2}" width="2" height="${h2}" fill="${color2}" opacity="0.6" rx="1"/>`;
    paths += `<rect x="${x}" y="${y1}" width="2" height="${h1}" fill="${color1}" opacity="0.8" rx="1"/>`;
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
  zoom: 1,
  loopIn: null,
  loopOut: null,
  loopActive: false,
  playbackRate: 1,
  bpmTolerance: 6,
  sessionNotes: '',

  // ═══════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════
  init() {
    this.tracks = MOCK_TRACKS.slice();
    this.loadRealTracks();
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
      if (!window.cueforge?.getTracks) return;
      const dbTracks = await window.cueforge.getTracks();
      if (dbTracks && dbTracks.length > 0) {
        const mapped = dbTracks.map(t => ({
          id: t.id,
          title: t.title || t.filename || 'Sans titre',
          artist: t.artist || 'Artiste inconnu',
          genre: t.genre || '',
          bpm: t.bpm || t.analysis?.bpm || null,
          key: t.key || t.analysis?.key || null,
          energy: t.energy || t.analysis?.energy || null,
          duration: t.duration || (t.analysis?.duration_ms ? formatTime(t.analysis.duration_ms / 1000) : '0:00'),
          rating: t.rating || 0,
          tags: t.tags || [],
          analyzed: t.analyzed !== false,
          color: t.color || null,
          filePath: t.file_path || t.filePath,
          cuePoints: t.cuePoints || [],
        }));
        this.tracks = mapped;
        this.renderTrackList();
        showToast(`${mapped.length} tracks chargées`, 'success');
      }
    } catch (e) {
      console.warn('Could not load tracks from DB:', e);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // IMPORT FILES
  // ═══════════════════════════════════════════════════════════
  async importFiles() {
    try {
      if (!window.cueforge?.openFileDialog) {
        showToast('Import non disponible', 'error');
        return;
      }
      const files = await window.cueforge.openFileDialog();
      if (!files || files.length === 0) return;
      showToast(`Import de ${files.length} fichier(s)…`, 'info');
      for (const filePath of files) {
        try {
          const meta = await window.cueforge.readMetadata(filePath);
          if (meta.error) continue;
          const track = await window.cueforge.upsertTrack({
            file_path: filePath,
            title: meta.title || filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Sans titre',
            artist: meta.artist || 'Artiste inconnu',
            album: meta.album || '',
            bpm: meta.bpm,
            key: meta.key,
            duration: meta.duration ? formatTime(meta.duration) : '0:00',
            format: meta.format,
            file_size: meta.fileSize,
          });
          if (track) {
            this.tracks.push({
              id: track.id || Date.now(),
              title: track.title || meta.title || 'Sans titre',
              artist: track.artist || meta.artist || 'Artiste inconnu',
              genre: '', bpm: meta.bpm, key: meta.key,
              energy: null, duration: meta.duration ? formatTime(meta.duration) : '0:00',
              rating: 0, tags: [], analyzed: false, color: null,
              filePath, cuePoints: [],
            });
          }
        } catch (err) { console.warn('Import error for', filePath, err); }
      }
      this.renderTrackList();
      showToast(`${files.length} fichier(s) importé(s)`, 'success');
    } catch (e) {
      showToast('Erreur import', 'error');
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

    // Waveform
    const overview = document.getElementById('waveformOverview');
    const detail = document.getElementById('waveformDetail');
    if (overview) overview.innerHTML = generateWaveformSVG(800, 56, track.color || '#2563eb', '#3b82f680', '#60a5fa60');
    if (detail) detail.innerHTML = generateWaveformSVG(800, 90, track.color || '#2563eb', '#3b82f6', '#60a5fa');
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
  // RENDER TRACK LIST
  // ═══════════════════════════════════════════════════════════
  renderTrackList() {
    const rows = document.getElementById('trackRows');
    const countEl = document.getElementById('trackCount');
    if (!rows) return;

    let filtered = [...this.tracks];

    // Search filter
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.genre && t.genre.toLowerCase().includes(q))
      );
    }

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

    if (countEl) {
      countEl.textContent = `${filtered.length} morceau${filtered.length !== 1 ? 'x' : ''}${filtered.length !== this.tracks.length ? ` (${this.tracks.length} total)` : ''}`;
    }

    if (filtered.length === 0) {
      rows.innerHTML = `<div class="tracklist-empty">
        <div class="tracklist-empty-icon">&#x2b06;</div>
        <div><h3>Aucun morceau</h3><p>Commencez par importer vos pistes audio</p></div>
        <button class="import-btn" onclick="CueForgeApp.importFiles()">Importer des tracks</button>
      </div>`;
      return;
    }

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
      listHtml = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px">Aucun cue — positionne le playhead puis clique le bouton</div>';
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

    pane.innerHTML = timelineHtml + addHtml + listHtml + legendHtml;
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

  // ─── Stats Tab ──────────────────────────────────────────
  renderStatsTab() {
    const pane = document.getElementById('statsPane');
    if (!pane) return;
    const total = this.tracks.length;
    const analyzed = this.tracks.filter(t => t.analyzed).length;
    const avgBpm = total > 0 ? (this.tracks.reduce((s, t) => s + (t.bpm || 0), 0) / total).toFixed(1) : 0;
    const genres = {};
    this.tracks.forEach(t => { if (t.genre) genres[t.genre] = (genres[t.genre] || 0) + 1; });
    const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 5);

    pane.innerHTML = `<div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="card" style="margin:0"><div class="card-title">📊 Bibliothèque</div>
        <div style="font-size:28px;font-weight:800;color:var(--accent)">${total}</div>
        <div style="font-size:12px;color:var(--text-muted)">morceaux • ${analyzed} analysés</div>
      </div>
      <div class="card" style="margin:0"><div class="card-title">🎵 BPM Moyen</div>
        <div style="font-size:28px;font-weight:800;color:#06b6d4;font-family:var(--font-mono)">${avgBpm}</div>
      </div>
      <div class="card" style="grid-column:span 2;margin:0"><div class="card-title">🎶 Top Genres</div>
        ${topGenres.map(([g, c]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle)">
          <span style="font-size:13px;color:var(--text-primary)">${g}</span>
          <span style="font-size:13px;color:var(--text-muted);font-family:var(--font-mono)">${c}</span>
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
    el.innerHTML = `
      <div class="page-title">Set Builder</div>
      <div class="page-desc">Construis et planifie tes sets DJ</div>
      <div class="card">
        <div class="card-title">🎵 Tracks de ta bibliothèque</div>
        <div style="color:var(--text-muted);font-size:13px">Glisse des tracks ici depuis ta bibliothèque pour construire ton set.</div>
        <div style="border:2px dashed var(--border-default);border-radius:12px;padding:32px;text-align:center;margin-top:12px;color:var(--text-muted)">
          <div style="font-size:32px;margin-bottom:8px;opacity:0.3">🎵</div>
          <div style="font-size:14px;font-weight:600">Drop tes tracks ici</div>
          <div style="font-size:12px;margin-top:4px">ou retourne au Dashboard pour sélectionner des morceaux</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">📐 Camelot Wheel</div>
        <div style="display:flex;justify-content:center">
          ${generateCamelotWheelSVG(this.selectedTrack?.key)}
        </div>
      </div>
    `;
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
      if (window.cueforge?.exportRekordbox) {
        const result = await window.cueforge.exportRekordbox(trackIds || null);
        if (result) showToast('Rekordbox XML exporté', 'success');
      } else {
        showToast('Export Rekordbox non disponible', 'error');
      }
    } catch (e) { showToast('Erreur export Rekordbox', 'error'); }
  },

  async exportSerato() {
    try {
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
      if (files.length > 0) {
        showToast(`Import de ${files.length} fichier(s)…`, 'info');
        // Files dropped from Finder have a path property
        for (const file of files) {
          if (file.path) {
            try {
              const meta = await window.cueforge?.readMetadata(file.path);
              if (meta && !meta.error) {
                const track = await window.cueforge?.upsertTrack({
                  file_path: file.path,
                  title: meta.title || file.name.replace(/\.[^.]+$/, ''),
                  artist: meta.artist || 'Artiste inconnu',
                  bpm: meta.bpm, key: meta.key,
                  duration: meta.duration ? formatTime(meta.duration) : '0:00',
                });
                this.tracks.push({
                  id: track?.id || Date.now(), title: meta.title || file.name,
                  artist: meta.artist || 'Artiste inconnu', genre: '', bpm: meta.bpm,
                  key: meta.key, energy: null, duration: meta.duration ? formatTime(meta.duration) : '0:00',
                  rating: 0, tags: [], analyzed: false, color: null,
                  filePath: file.path, cuePoints: [],
                });
              }
            } catch (err) { console.warn('Drop import error:', err); }
          }
        }
        this.renderTrackList();
        showToast(`${files.length} fichier(s) importé(s)`, 'success');
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
