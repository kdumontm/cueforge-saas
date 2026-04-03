'use strict';
/**
 * CueForge Desktop — Main App Engine
 * Matches web prototype 1:1
 */

// ═══════════════════════════════════════════════════════════════════════════
// DATA — Exact match with web prototype
// ═══════════════════════════════════════════════════════════════════════════

const HOT_CUE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];
const HOT_CUE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const CAMELOT = [
  { n: '1A', key: 'Am', color: '#4a9eff' },   { n: '1B', key: 'C', color: '#6ab4ff' },
  { n: '2A', key: 'Em', color: '#4ecdc4' },   { n: '2B', key: 'G', color: '#6ee4da' },
  { n: '3A', key: 'Bm', color: '#45b7d1' },   { n: '3B', key: 'D', color: '#63cddf' },
  { n: '4A', key: 'F#m', color: '#96ceb4' },  { n: '4B', key: 'A', color: '#a8dcc5' },
  { n: '5A', key: 'C#m', color: '#88d8a3' },  { n: '5B', key: 'E', color: '#9de8b5' },
  { n: '6A', key: 'G#m', color: '#a8e6cf' },  { n: '6B', key: 'B', color: '#b8f0dd' },
  { n: '7A', key: 'Ebm', color: '#ffd93d' },  { n: '7B', key: 'F#', color: '#ffe566' },
  { n: '8A', key: 'Bbm', color: '#ffb347' },  { n: '8B', key: 'Db', color: '#ffc566' },
  { n: '9A', key: 'Fm', color: '#ff8c69' },   { n: '9B', key: 'Ab', color: '#ffa085' },
  { n: '10A', key: 'Cm', color: '#ff6b9d' },  { n: '10B', key: 'Eb', color: '#ff85b0' },
  { n: '11A', key: 'Gm', color: '#c589e8' },  { n: '11B', key: 'Bb', color: '#d4a0f0' },
  { n: '12A', key: 'Dm', color: '#a390f0' },  { n: '12B', key: 'F', color: '#b8a8f8' },
];

const MOCK_TRACKS = [
  { id: 1, title: 'Shed My Skin', artist: 'Ben Böhmer', genre: 'Melodic House', bpm: 124, key: '6A', energy: 72, duration: '6:42', rating: 5, tags: ['peak', 'vocal'], analyzed: true, color: '#22c55e' },
  { id: 2, title: 'Lost Highway', artist: 'Stephan Bodzin', genre: 'Techno', bpm: 134, key: '10B', energy: 88, duration: '8:15', rating: 4, tags: ['dark', 'peak'], analyzed: true, color: '#ef4444' },
  { id: 3, title: 'Equinox', artist: 'Solomun', genre: 'Deep House', bpm: 122, key: '3A', energy: 65, duration: '7:30', rating: 4, tags: ['warmup'], analyzed: true, color: '#3b82f6' },
  { id: 4, title: 'Disco Volante', artist: 'ANNA', genre: 'Techno', bpm: 136, key: '8A', energy: 91, duration: '7:05', rating: 5, tags: ['peak', 'dark'], analyzed: true, color: '#ef4444' },
  { id: 5, title: 'Dreamer', artist: 'Tale Of Us', genre: 'Melodic House', bpm: 120, key: '1A', energy: 58, duration: '9:10', rating: 3, tags: ['warmup', 'vocal'], analyzed: true, color: '#06b6d4' },
  { id: 6, title: 'Bangalore', artist: 'Bicep', genre: 'House', bpm: 128, key: '4B', energy: 80, duration: '5:55', rating: 4, tags: ['festival'], analyzed: true, color: '#f97316' },
  { id: 7, title: 'New Track 01.flac', artist: 'Unknown', genre: '—', bpm: null, key: null, energy: null, duration: '5:20', rating: 0, tags: [], analyzed: false, color: null },
  { id: 8, title: 'New Track 02.wav', artist: 'Unknown', genre: '—', bpm: null, key: null, energy: null, duration: '7:45', rating: 0, tags: [], analyzed: false, color: null },
];

const SET_BUILDER_TRACKS = [
  { id: 1, title: 'Dreamer', artist: 'Tale Of Us', bpm: 120, key: '1A', duration: '9:10', energy: 58, color: '#06b6d4', startMin: 0 },
  { id: 3, title: 'Equinox', artist: 'Solomun', bpm: 122, key: '3A', duration: '7:30', energy: 65, color: '#3b82f6', startMin: 9 },
  { id: 1, title: 'Shed My Skin', artist: 'Ben Böhmer', bpm: 124, key: '6A', duration: '6:42', energy: 72, color: '#22c55e', startMin: 17 },
  { id: 6, title: 'Bangalore', artist: 'Bicep', bpm: 128, key: '4B', duration: '5:55', energy: 80, color: '#f97316', startMin: 24 },
  { id: 2, title: 'Lost Highway', artist: 'Stephan Bodzin', bpm: 134, key: '10B', duration: '8:15', energy: 88, color: '#ef4444', startMin: 30 },
  { id: 4, title: 'Disco Volante', artist: 'ANNA', bpm: 136, key: '8A', duration: '7:05', energy: 91, color: '#ef4444', startMin: 38 },
];

const EXPORT_FORMATS = [
  { id: 'rekordbox', name: 'Rekordbox XML', icon: '🔵', desc: 'Pioneer DJ — CDJ/XDJ/DDJ', popular: true },
  { id: 'serato', name: 'Serato DJ', icon: '🟢', desc: 'Serato DJ Pro / Lite', popular: false },
  { id: 'traktor', name: 'Traktor NML', icon: '🟠', desc: 'Native Instruments Traktor', popular: false },
  { id: 'engine', name: 'Engine DJ', icon: '⚫', desc: 'Denon DJ SC6000 / Prime', popular: false },
  { id: 'virtualdj', name: 'VirtualDJ', icon: '🔴', desc: 'VirtualDJ 2023+', popular: false },
  { id: 'm3u', name: 'Playlist M3U', icon: '📋', desc: 'Format universel', popular: false },
  { id: 'csv', name: 'Tracklist CSV', icon: '📊', desc: 'Excel, Sheets, Notion', popular: false },
  { id: 'id3', name: 'Tags ID3 (fichiers)', icon: '🏷️', desc: 'Écrire dans le fichier audio', popular: true },
];

const DEFAULT_HOT_CUES = [
  { slot: 0, time: '0:32', label: 'Intro' },
  { slot: 2, time: '1:45', label: 'Drop' },
  { slot: 4, time: '4:10', label: 'Break' },
  { slot: 6, time: '5:55', label: 'Outro' },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getKeyColor(key) {
  const found = CAMELOT.find(c => c.n === key);
  return found ? found.color : '#64748b';
}

function getCompatibleKeys(n) {
  if (!n) return [];
  const num = parseInt(n);
  const mode = n.includes('A') ? 'A' : 'B';
  return [
    n,
    `${num === 12 ? 1 : num + 1}${mode}`,
    `${num === 1 ? 12 : num - 1}${mode}`,
    `${num}${mode === 'A' ? 'B' : 'A'}`,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SVG GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

function generateWaveformSVG(height, overview, hotCues) {
  const bars = overview ? 200 : 120;
  const progress = 0.35;
  // Use seeded random for consistent look
  const seed = overview ? 42 : 77;
  const rng = (i) => Math.abs(Math.sin(i * 0.73 + seed) * 0.5 + Math.sin(i * 1.2 + seed * 2) * 0.3);

  let rects = '';
  for (let i = 0; i < bars; i++) {
    const h = overview
      ? rng(i) * height * 0.7 + height * 0.1
      : (Math.sin(i * 0.3) * 0.4 + 0.6) * height * 0.85;
    const isPlayed = i / bars < progress;
    const mid = height / 2;
    const low = (Math.sin(i * 0.8 + 1) * 0.5 + 0.5) * h * 0.4;
    const mid2 = (Math.sin(i * 0.5 + 0.5) * 0.5 + 0.5) * h * 0.35;
    const high = h - low - mid2;
    const x = (i / bars * 100).toFixed(2);
    const w = (100 / bars * 0.6).toFixed(2);

    rects += `<rect x="${x}%" y="${(mid - h / 2).toFixed(1)}" width="${w}%" height="${low.toFixed(1)}" fill="${isPlayed ? '#ef444488' : '#ef444440'}"/>`;
    rects += `<rect x="${x}%" y="${(mid - h / 2 + low).toFixed(1)}" width="${w}%" height="${mid2.toFixed(1)}" fill="${isPlayed ? '#22c55e88' : '#22c55e40'}"/>`;
    rects += `<rect x="${x}%" y="${(mid - h / 2 + low + mid2).toFixed(1)}" width="${w}%" height="${high.toFixed(1)}" fill="${isPlayed ? '#3b82f688' : '#3b82f640'}"/>`;
  }

  // Playhead
  if (!overview) {
    rects += `<line x1="${progress * 100}%" y1="0" x2="${progress * 100}%" y2="${height}" stroke="white" stroke-width="1.5" opacity="0.9"/>`;
    // Hot cue markers
    if (hotCues) {
      const positions = [8, 26, 61, 88];
      hotCues.forEach((c, idx) => {
        const pct = positions[idx] || 30;
        rects += `<line x1="${pct}%" y1="0" x2="${pct}%" y2="${height}" stroke="${HOT_CUE_COLORS[c.slot]}" stroke-width="1.5" opacity="0.85"/>`;
      });
    }
  }

  return `<svg width="100%" height="${height}" viewBox="0 0 ${bars} ${height}" preserveAspectRatio="none">${rects}</svg>`;
}

function generateBeatgridLines(count) {
  let html = '';
  for (let i = 0; i < count; i++) {
    const opacity = i % 4 === 0 ? '0.15' : '0.05';
    html += `<div class="beatgrid-line" style="left:${(i / count * 100).toFixed(2)}%;background:rgba(255,255,255,${opacity})"></div>`;
  }
  return html;
}

function generateCamelotWheelSVG(selectedKey) {
  const size = 200;
  const cx = size / 2, cy = size / 2;
  const outerR = 88, innerR = 55, textR_out = 75, textR_in = 43;
  const compatible = getCompatibleKeys(selectedKey);

  let paths = '';
  CAMELOT.forEach(item => {
    const isOuter = item.n.includes('B');
    const num = parseInt(item.n);
    const angle = ((num - 1) / 12) * 2 * Math.PI - Math.PI / 2;
    const r = isOuter ? outerR : innerR;
    const textR = isOuter ? textR_out : textR_in;
    const slice = (2 * Math.PI) / 12;
    const startAngle = angle - slice / 2;
    const endAngle = angle + slice / 2;
    const gap = 0.04;
    const x1 = cx + (r - 14) * Math.cos(startAngle + gap);
    const y1 = cy + (r - 14) * Math.sin(startAngle + gap);
    const x2 = cx + (r + 14) * Math.cos(startAngle + gap);
    const y2 = cy + (r + 14) * Math.sin(startAngle + gap);
    const x3 = cx + (r + 14) * Math.cos(endAngle - gap);
    const y3 = cy + (r + 14) * Math.sin(endAngle - gap);
    const x4 = cx + (r - 14) * Math.cos(endAngle - gap);
    const y4 = cy + (r - 14) * Math.sin(endAngle - gap);
    const isSelected = item.n === selectedKey;
    const isCompat = compatible.includes(item.n);
    const tx = cx + textR * Math.cos(angle);
    const ty = cy + textR * Math.sin(angle);

    const fill = isSelected ? item.color : isCompat ? item.color + '70' : item.color + '30';
    const stroke = isSelected ? 'white' : isCompat ? item.color + '90' : 'transparent';
    const sw = isSelected ? 2 : 1;
    const fs = isSelected ? 9 : 8;
    const fw = isSelected ? 700 : 500;
    const textFill = isSelected || isCompat ? 'white' : 'rgba(255,255,255,0.5)';

    paths += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)} A ${r + 14} ${r + 14} 0 0 1 ${x3.toFixed(1)} ${y3.toFixed(1)} L ${x4.toFixed(1)} ${y4.toFixed(1)} A ${r - 14} ${r - 14} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" style="cursor:pointer"/>`;
    paths += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="${fw}" fill="${textFill}" font-family="'JetBrains Mono',monospace">${item.n}</text>`;
  });

  // Center
  const keyColor = getKeyColor(selectedKey);
  paths += `<circle cx="${cx}" cy="${cy}" r="28" fill="#1a1a2e" stroke="#252540" stroke-width="1"/>`;
  paths += `<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="#f1f5f9" font-family="Inter,sans-serif">Camelot</text>`;
  paths += `<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="12" font-weight="700" fill="${keyColor}" font-family="'JetBrains Mono',monospace">${selectedKey || '—'}</text>`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════

const CueForgeApp = {
  currentPage: 'dashboard',
  selectedTrack: MOCK_TRACKS[0],
  activeTab: 'cues',
  isPlaying: false,
  hotCues: [...DEFAULT_HOT_CUES],
  showFilters: false,

  // Page titles
  pageTitles: {
    dashboard: { title: 'Dashboard', sub: 'Prépare et analyse tes sets' },
    setbuilder: { title: 'Set Builder', sub: 'Construis et planifie tes sets' },
    upload: { title: 'Importer', sub: 'Ajoute des tracks à ta bibliothèque' },
    export: { title: 'Exporter', sub: 'Exporte vers ton logiciel DJ' },
    settings: { title: 'Réglages', sub: 'Paramètres de ton compte' },
    admin: { title: 'Admin', sub: 'Panneau d\'administration' },
  },

  init() {
    this.renderWaveforms();
    this.renderHotCues();
    this.renderTrackList();
    this.renderTabContent('cues');
    this.renderExportPage();
    this.renderSetBuilderPage();
    this.bindNavigation();
    this.bindTabs();
    this.bindPlayer();
    this.bindFilters();
    if (typeof initSettingsAdmin === 'function') initSettingsAdmin();
  },

  // ── Navigation ──────────────────────────────────────────────────────
  bindNavigation() {
    // Nav items
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', () => this.switchPage(el.dataset.page));
    });
    // Crate items
    document.querySelectorAll('.nav-item[data-crate], .crate-item[data-crate], .playlist-item[data-crate]').forEach(el => {
      el.addEventListener('click', () => {
        this.switchPage('dashboard');
        // Highlight active crate
        document.querySelectorAll('.crate-item, .playlist-item, .nav-item[data-crate]').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
      });
    });
    // Settings button in footer
    document.querySelector('.sidebar-settings-btn')?.addEventListener('click', () => this.switchPage('settings'));
  },

  switchPage(page) {
    this.currentPage = page;

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Update topbar
    const info = this.pageTitles[page] || this.pageTitles.dashboard;
    document.getElementById('topbarTitle').textContent = info.title;
    document.getElementById('topbarSubtitle').textContent = info.sub;

    // Switch view
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
    const viewMap = {
      dashboard: 'viewDashboard',
      setbuilder: 'viewSetBuilder',
      upload: 'viewUpload',
      export: 'viewExport',
      settings: 'viewSettings',
      admin: 'viewAdmin',
    };
    const viewId = viewMap[page];
    if (viewId) document.getElementById(viewId)?.classList.add('active');
  },

  // ── Waveforms ───────────────────────────────────────────────────────
  renderWaveforms() {
    document.getElementById('waveformOverview').innerHTML = generateWaveformSVG(32, true);
    const detail = document.getElementById('waveformDetail');
    detail.innerHTML = generateWaveformSVG(80, false, this.hotCues) + generateBeatgridLines(32);
  },

  // ── Hot Cues ────────────────────────────────────────────────────────
  renderHotCues() {
    const row = document.getElementById('hotcuesRow');
    let html = '<span class="hotcues-label">HOT CUES</span>';
    HOT_CUE_LABELS.forEach((label, i) => {
      const cue = this.hotCues.find(c => c.slot === i);
      if (cue) {
        html += `<button class="hotcue-btn" style="background:${HOT_CUE_COLORS[i]};color:white">
          <div class="hc-letter">${label}</div>
          <div class="hc-time">${cue.time}</div>
        </button>`;
      } else {
        html += `<button class="hotcue-btn empty"><div class="hc-letter">${label}</div></button>`;
      }
    });
    row.innerHTML = html;
  },

  // ── Player ──────────────────────────────────────────────────────────
  bindPlayer() {
    document.getElementById('btnPlay').addEventListener('click', () => {
      this.isPlaying = !this.isPlaying;
      document.getElementById('btnPlay').textContent = this.isPlaying ? '⏸' : '▶';
    });
  },

  updatePlayerCard(track) {
    this.selectedTrack = track;
    document.getElementById('playerTitle').textContent = track.title;
    document.getElementById('playerArtist').textContent = `${track.artist} · ${track.genre}`;

    const art = document.getElementById('playerArt');
    const c = track.color || '#1a1a2e';
    art.style.background = c + '30';
    art.style.border = `1px solid ${c}40`;

    // Badges
    const badges = document.getElementById('playerBadges');
    let bhtml = '';
    if (track.bpm) bhtml += `<span class="badge badge-cyan">${track.bpm} BPM</span>`;
    if (track.key) {
      const kc = getKeyColor(track.key);
      bhtml += `<span class="key-badge" style="background:${kc}25;color:${kc};border:1px solid ${kc}40">${track.key}</span>`;
    }
    if (track.energy) {
      bhtml += `<div class="energy-bar-container"><div class="energy-bar-bg"><div class="energy-bar-fill" style="width:${track.energy}%"></div></div><span class="energy-bar-val">${track.energy}</span></div>`;
    }
    badges.innerHTML = bhtml;

    // Re-render waveforms and tabs
    this.renderWaveforms();
    this.renderTabContent(this.activeTab);
  },

  // ── Track List ──────────────────────────────────────────────────────
  renderTrackList(tracks) {
    const list = tracks || MOCK_TRACKS;
    const container = document.getElementById('trackRows');
    document.getElementById('trackCount').textContent = list.length;

    let html = '';
    list.forEach(t => {
      const selected = this.selectedTrack?.id === t.id ? ' selected' : '';
      html += `<div class="track-row${selected}" data-track-id="${t.id}">`;

      // Status
      html += `<div class="track-status">${t.analyzed
        ? '<span class="track-status-ok">✓</span>'
        : '<span class="track-status-pending" title="Cliquer pour analyser">⚡</span>'}</div>`;

      // Title
      html += `<div class="track-title-cell"><div class="track-title">${t.title}</div><div class="track-artist">${t.artist}</div></div>`;

      // BPM
      html += `<div>${t.bpm
        ? `<span class="track-bpm">${t.bpm}</span>`
        : '<button class="track-bpm-analyze">Analyser</button>'}</div>`;

      // Key
      if (t.key) {
        const kc = getKeyColor(t.key);
        html += `<div><span class="key-badge" style="background:${kc}25;color:${kc};border:1px solid ${kc}40">${t.key}</span></div>`;
      } else {
        html += '<div><span style="color:var(--text-muted)">—</span></div>';
      }

      // Energy
      if (t.energy) {
        html += `<div><div class="energy-mini"><div class="energy-mini-bar"><div class="energy-mini-fill" style="width:${t.energy}%"></div></div></div></div>`;
      } else {
        html += '<div><span style="color:var(--text-muted)">—</span></div>';
      }

      // Duration
      html += `<div class="track-duration">${t.duration}</div>`;

      // Genre
      html += `<div class="track-genre">${t.genre}</div>`;

      // Rating
      html += '<div class="track-rating">';
      for (let s = 0; s < 5; s++) {
        html += `<span class="star ${s < t.rating ? 'star-on' : 'star-off'}">★</span>`;
      }
      html += '</div>';

      // Tags
      html += '<div>';
      if (t.tags.length > 0) {
        html += `<span class="track-tag">#${t.tags[0]}</span>`;
      }
      html += '</div>';

      html += '</div>';
    });

    container.innerHTML = html;

    // Bind row clicks
    container.querySelectorAll('.track-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.dataset.trackId);
        const track = MOCK_TRACKS.find(t => t.id === id);
        if (track) {
          container.querySelectorAll('.track-row').forEach(r => r.classList.remove('selected'));
          row.classList.add('selected');
          this.updatePlayerCard(track);
        }
      });
    });
  },

  bindFilters() {
    document.getElementById('btnFilters')?.addEventListener('click', () => {
      this.showFilters = !this.showFilters;
      const panel = document.getElementById('filterPanel');
      const btn = document.getElementById('btnFilters');
      panel.classList.toggle('show', this.showFilters);
      btn.classList.toggle('active', this.showFilters);
      if (this.showFilters && !panel.innerHTML) {
        this.renderFilterPanel();
      }
    });

    // Search
    document.getElementById('trackSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = MOCK_TRACKS.filter(t =>
        t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.genre.toLowerCase().includes(q)
      );
      this.renderTrackList(filtered);
    });
  },

  renderFilterPanel() {
    const panel = document.getElementById('filterPanel');
    panel.innerHTML = `
      <div class="filter-group">
        <div class="filter-label">BPM: 100–145</div>
        <div class="filter-chips">
          ${[100, 110, 120, 125, 128, 130, 135, 140, 145].map(bpm =>
            `<button class="filter-chip active">${bpm}</button>`
          ).join('')}
        </div>
      </div>
      <div>
        <div class="filter-label">Tonalité</div>
        <div class="filter-chips">
          ${['Am', 'Em', 'Bm', 'Dm'].map(k => `<button class="filter-chip">${k}</button>`).join('')}
        </div>
      </div>
      <div>
        <div class="filter-label">Genre</div>
        <div class="filter-chips">
          ${['Techno', 'House', 'Melodic'].map(g => `<button class="filter-chip">${g}</button>`).join('')}
        </div>
      </div>
      <div>
        <div class="filter-label">Énergie: 0–100</div>
        <div style="display:flex;gap:4px;align-items:center">
          <div style="width:80px;height:5px;border-radius:3px;background:var(--border-default);position:relative">
            <div style="position:absolute;left:0;right:0;top:0;bottom:0;background:var(--accent);border-radius:3px"></div>
          </div>
          <button class="btn-ghost" style="font-size:10px;padding:2px 8px">Reset</button>
        </div>
      </div>
    `;
  },

  // ── Tabs ─────────────────────────────────────────────────────────────
  bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        this.activeTab = tab;
        const paneMap = { cues: 'tabCues', beatgrid: 'tabBeatgrid', stems: 'tabStems', eq: 'tabEq', fx: 'tabFx', mix: 'tabMix', playlists: 'tabPlaylists', stats: 'tabStats', history: 'tabHistory' };
        document.getElementById(paneMap[tab])?.classList.add('active');
        this.renderTabContent(tab);
      });
    });
  },

  renderTabContent(tab) {
    const t = this.selectedTrack;
    const renderers = {
      cues: () => this.renderCuesTab(),
      beatgrid: () => this.renderBeatgridTab(),
      stems: () => this.renderStemsTab(),
      eq: () => this.renderEqTab(),
      fx: () => this.renderFxTab(),
      mix: () => this.renderMixTab(),
      playlists: () => this.renderPlaylistsTab(),
      stats: () => this.renderStatsTab(),
      history: () => this.renderHistoryTab(),
    };
    if (renderers[tab]) renderers[tab]();
  },

  renderCuesTab() {
    const el = document.getElementById('tabCues');
    let html = `
      <div class="section-header">
        <div class="section-title">Hot Cues — ${this.selectedTrack?.title || ''}</div>
        <div class="section-actions">
          <button class="btn-ghost">⬆️ Auto-détecter</button>
          <button class="btn-primary" style="font-size:11px;padding:4px 10px">+ Ajouter cue</button>
        </div>
      </div>
      <div class="cues-grid">`;

    HOT_CUE_LABELS.forEach((label, i) => {
      const cue = this.hotCues.find(c => c.slot === i);
      const borderColor = cue ? HOT_CUE_COLORS[i] + '50' : 'var(--border-subtle)';
      const bgColor = cue ? HOT_CUE_COLORS[i] + '10' : 'var(--bg-elevated)';
      const badgeBg = cue ? HOT_CUE_COLORS[i] : 'var(--bg-primary)';
      const badgeBorder = cue ? HOT_CUE_COLORS[i] : 'var(--border-default)';
      const badgeColor = cue ? 'white' : 'var(--text-muted)';

      html += `<div class="cue-slot" style="border:1px solid ${borderColor};background:${bgColor}">
        <div class="cue-slot-badge" style="background:${badgeBg};border:1px solid ${badgeBorder};color:${badgeColor}">${label}</div>`;
      if (cue) {
        html += `<div class="cue-slot-info"><div class="cue-slot-time">${cue.time}</div><div class="cue-slot-label">${cue.label}</div></div>
          <button class="cue-slot-edit">✏️</button>`;
      } else {
        html += `<div class="cue-slot-empty">Vide — Cliquer pour poser</div>`;
      }
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
  },

  renderBeatgridTab() {
    const el = document.getElementById('tabBeatgrid');
    const bpm = this.selectedTrack?.bpm || 0;
    el.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">Beatgrid Editor</div>
          <div class="section-subtitle">Corrige le grid manuellement pour un mix parfait</div>
        </div>
        <div class="section-actions">
          <button class="btn-ghost">⟳ Re-analyser</button>
          <button class="btn-ghost">÷2 BPM</button>
          <button class="btn-ghost">×2 BPM</button>
        </div>
      </div>
      <div style="background:var(--bg-primary);border-radius:9px;padding:12px 16px;margin-bottom:12px;position:relative;height:80px;overflow:hidden">
        ${generateWaveformSVG(80, false)}
        ${Array.from({length: 32}, (_, i) => {
          const w = i % 4 === 0 ? 2 : 1;
          const bg = i % 4 === 0 ? 'rgba(37,99,235,0.6)' : 'rgba(37,99,235,0.2)';
          const label = i % 4 === 0 ? `<div style="position:absolute;top:2px;left:3px;font-size:9px;color:#2563eb;font-family:var(--mono)">${Math.floor(i/4)+1}</div>` : '';
          return `<div style="position:absolute;top:0;bottom:0;left:${(i/32*100).toFixed(1)}%;width:${w}px;background:${bg};cursor:pointer">${label}</div>`;
        }).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:16px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--text-muted)">BPM détecté:</span>
          <span style="font-size:18px;font-weight:700;color:var(--text-primary);font-family:var(--mono)">${bpm}</span>
        </div>
        <div style="display:flex;gap:4px">
          ${['−0.5', '−0.1', '+0.1', '+0.5'].map(v =>
            `<button style="padding:4px 8px;border-radius:6px;border:1px solid var(--border-default);background:var(--bg-elevated);color:var(--text-primary);font-size:13px;cursor:pointer;font-family:var(--mono)">${v}</button>`
          ).join('')}
        </div>
        <button class="btn-success">✓ Confirmer le grid</button>
      </div>`;
  },

  renderStemsTab() {
    const el = document.getElementById('tabStems');
    const stems = [
      { id: 'vocals', label: 'Voix', icon: '🎤', color: '#ec4899' },
      { id: 'drums', label: 'Drums', icon: '🥁', color: '#f97316' },
      { id: 'bass', label: 'Basse', icon: '🎸', color: '#22c55e' },
      { id: 'melody', label: 'Mélodie', icon: '🎹', color: '#3b82f6' },
    ];

    el.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">Stem Separation</div>
          <div class="section-subtitle">Isoler ou muter chaque élément du track</div>
        </div>
        <button class="btn-primary" style="font-size:11px;padding:4px 10px">⚡ Séparer les stems</button>
      </div>
      <div class="stems-grid">
        ${stems.map(s => {
          let bars = '';
          for (let i = 0; i < 50; i++) {
            const h = Math.abs(Math.sin(i * 0.5 + s.id.length)) * 18 + 3;
            bars += `<rect x="${i * 2}" y="${(24 - h) / 2}" width="1.5" height="${h}" fill="${s.color}80"/>`;
          }
          return `<div class="stem-card" style="border:1px solid ${s.color}40;background:${s.color}10">
            <div class="stem-header">
              <div class="stem-left"><span class="stem-icon">${s.icon}</span><span class="stem-name">${s.label}</span></div>
              <div class="stem-btns">
                <button class="stem-btn" style="border:1px solid ${s.color}50;background:${s.color}20;color:${s.color}">S</button>
                <button class="stem-btn" style="border:1px solid var(--border-default);background:transparent;color:var(--text-muted)">M</button>
              </div>
            </div>
            <div class="stem-wave"><svg width="100%" height="24" viewBox="0 0 100 24">${bars}</svg></div>
          </div>`;
        }).join('')}
      </div>`;
  },

  renderEqTab() {
    const el = document.getElementById('tabEq');
    const bands = [
      { label: 'LOW', freq: '32Hz-512Hz', val: 0 },
      { label: 'MID', freq: '512Hz-8kHz', val: 2 },
      { label: 'HIGH', freq: '8kHz-20kHz', val: -1 },
    ];
    el.innerHTML = `<div class="eq-container">
      ${bands.map(b => {
        const fillColor = b.val > 0 ? 'var(--accent-success)' : 'var(--accent-error)';
        const fillH = Math.abs(b.val) * 8;
        return `<div class="eq-band">
          <span class="eq-value">${b.val > 0 ? '+' : ''}${b.val}</span>
          <div class="eq-slider">
            <div class="eq-fill" style="height:${fillH}%;background:${fillColor}"></div>
            <div class="eq-center"></div>
          </div>
          <span class="eq-label">${b.label}</span>
          <span class="eq-freq">${b.freq}</span>
        </div>`;
      }).join('')}
    </div>`;
  },

  renderFxTab() {
    const el = document.getElementById('tabFx');
    const effects = [
      { name: 'Reverb', active: false }, { name: 'Delay', active: true }, { name: 'Flanger', active: false },
      { name: 'Phaser', active: false }, { name: 'Filter', active: true }, { name: 'Bitcrusher', active: false },
      { name: 'Chorus', active: false }, { name: 'Tremolo', active: false },
    ];
    el.innerHTML = `
      <div class="section-title" style="margin-bottom:12px">Effets Audio</div>
      <div class="fx-grid">
        ${effects.map(e =>
          `<button class="fx-btn ${e.active ? 'active' : 'inactive'}">${e.name}</button>`
        ).join('')}
      </div>`;
  },

  renderMixTab() {
    const el = document.getElementById('tabMix');
    const key = this.selectedTrack?.key;
    const compatible = MOCK_TRACKS.filter(t => t.analyzed && t.id !== this.selectedTrack?.id);

    el.innerHTML = `<div class="mix-container">
      <div class="mix-wheel-area">
        <div class="mix-wheel-label">Roue de Camelot</div>
        ${generateCamelotWheelSVG(key)}
      </div>
      <div class="mix-compat-list">
        <div class="mix-compat-title">Tracks compatibles avec ${key || '—'}</div>
        ${compatible.slice(0, 5).map(t => {
          const score = t.key === key ? 100 : Math.floor(Math.random() * 40 + 55);
          const scoreColor = score > 85 ? 'var(--accent-success)' : score > 70 ? 'var(--accent-warning)' : 'var(--accent-error)';
          const kc = getKeyColor(t.key);
          return `<div class="mix-compat-row">
            <div class="mix-compat-bar" style="background:${scoreColor}"></div>
            <div class="mix-compat-info">
              <div class="mix-compat-name">${t.title}</div>
              <div class="mix-compat-artist">${t.artist}</div>
            </div>
            <span class="key-badge" style="background:${kc}25;color:${kc};border:1px solid ${kc}40">${t.key}</span>
            <span class="badge badge-cyan">${t.bpm}</span>
            <span class="mix-compat-score" style="color:${scoreColor}">${score}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  },

  renderPlaylistsTab() {
    const el = document.getElementById('tabPlaylists');
    const playlists = [
      { label: 'Set Berghain 2024', count: 12 },
      { label: 'Outdoor Summer', count: 8 },
    ];
    el.innerHTML = `
      <div class="section-header">
        <div class="section-title">Mes Playlists</div>
        <button class="btn-primary" style="font-size:11px;padding:4px 10px">+ Nouvelle playlist</button>
      </div>
      ${playlists.map(p => `<div class="playlist-row">
        <span class="playlist-row-icon">💿</span>
        <div class="playlist-row-info">
          <div class="playlist-row-name">${p.label}</div>
          <div class="playlist-row-count">${p.count} tracks</div>
        </div>
        <button class="btn-ghost">Ouvrir</button>
      </div>`).join('')}`;
  },

  renderStatsTab() {
    const el = document.getElementById('tabStats');
    const analyzed = MOCK_TRACKS.filter(t => t.analyzed).length;
    const stats = [
      { label: 'Total tracks', value: MOCK_TRACKS.length, icon: '🎵' },
      { label: 'Analysés', value: analyzed, icon: '✅' },
      { label: 'BPM moyen', value: '127', icon: '⚡' },
      { label: 'Genres', value: '4', icon: '🎨' },
    ];
    const bpmBars = [20, 35, 80, 100, 75, 45, 30];
    const bpmLabels = ['115', '118', '122', '126', '130', '134', '138'];

    el.innerHTML = `
      <div class="stats-grid">
        ${stats.map(s => `<div class="stat-card">
          <div class="stat-icon">${s.icon}</div>
          <div class="stat-value">${s.value}</div>
          <div class="stat-label">${s.label}</div>
        </div>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Distribution BPM</div>
      <div class="bpm-histogram">
        ${bpmBars.map(h => `<div class="bpm-bar" style="height:${h}%;background:rgba(37,99,235,0.4)"></div>`).join('')}
      </div>
      <div class="bpm-labels">
        ${bpmLabels.map(l => `<span class="bpm-label">${l}</span>`).join('')}
      </div>`;
  },

  renderHistoryTab() {
    const el = document.getElementById('tabHistory');
    const tracks = MOCK_TRACKS.slice(0, 5).reverse();
    el.innerHTML = `
      <div class="section-title" style="margin-bottom:10px">Historique de lecture</div>
      ${tracks.map((t, i) => `<div class="history-row">
        <span class="history-num">${i + 1}</span>
        <div class="history-info">
          <div class="history-title">${t.title}</div>
          <div class="history-sub">${t.artist} · Il y a ${(i + 1) * 8} min</div>
        </div>
        ${t.bpm ? `<span class="badge badge-cyan">${t.bpm}</span>` : ''}
      </div>`).join('')}`;
  },

  // ── Export Page ──────────────────────────────────────────────────────
  renderExportPage() {
    const grid = document.getElementById('exportGrid');
    grid.innerHTML = EXPORT_FORMATS.map(f => `
      <div class="export-card">
        ${f.popular ? '<span class="export-card-popular">POPULAIRE</span>' : ''}
        <span class="export-card-icon">${f.icon}</span>
        <div class="export-card-info">
          <div class="export-card-name">${f.name}</div>
          <div class="export-card-desc">${f.desc}</div>
        </div>
        <button class="btn-primary" style="font-size:11px;padding:4px 10px">Exporter</button>
      </div>
    `).join('');
  },

  // ── Set Builder Page ────────────────────────────────────────────────
  renderSetBuilderPage() {
    const el = document.getElementById('setBuilderContent');
    const stats = [
      { label: 'Durée totale', value: '~48 min' },
      { label: 'BPM de départ', value: '120' },
      { label: 'BPM final', value: '136' },
      { label: 'Transitions', value: '5' },
    ];

    // Energy curve SVG
    const points = SET_BUILDER_TRACKS.map((t, i) =>
      `${(i / (SET_BUILDER_TRACKS.length - 1)) * 600},${60 - (t.energy / 100) * 50}`
    ).join(' L ');

    const dots = SET_BUILDER_TRACKS.map((t, i) => {
      const color = t.energy < 65 ? '#22c55e' : t.energy < 80 ? '#eab308' : '#ef4444';
      return `<circle cx="${(i / (SET_BUILDER_TRACKS.length - 1)) * 600}" cy="${60 - (t.energy / 100) * 50}" r="4" fill="${color}"/>`;
    }).join('');

    const gradStops = SET_BUILDER_TRACKS.map((t, i) => {
      const color = t.energy < 65 ? '#22c55e' : t.energy < 80 ? '#eab308' : '#ef4444';
      return `<stop offset="${(i / (SET_BUILDER_TRACKS.length - 1) * 100).toFixed(0)}%" stop-color="${color}" stop-opacity="0.8"/>`;
    }).join('');

    // Timeline blocks
    const blocks = SET_BUILDER_TRACKS.map(t => {
      const start = (t.startMin / 48) * 100;
      const dur = parseInt(t.duration.split(':')[0]);
      const width = (dur / 48) * 100;
      return `<div class="timeline-block" style="left:${start}%;width:${width}%;background:${t.color}50;border:1px solid ${t.color}80">
        <span class="timeline-block-label">${t.title}</span>
      </div>`;
    }).join('');

    // Track list
    const trackList = SET_BUILDER_TRACKS.map((t, i) => {
      const kc = getKeyColor(t.key);
      const delta = i < SET_BUILDER_TRACKS.length - 1
        ? `<span class="set-track-delta">→ ${Math.abs(SET_BUILDER_TRACKS[i + 1].bpm - t.bpm)} BPM</span>` : '';
      return `<div class="set-track-row">
        <span class="set-track-num">${i + 1}</span>
        <div class="set-track-color" style="background:${t.color}"></div>
        <div class="set-track-info">
          <div class="set-track-title">${t.title}</div>
          <div class="set-track-artist">${t.artist}</div>
        </div>
        <span class="set-track-time">${t.startMin}:00</span>
        <span class="badge badge-cyan">${t.bpm}</span>
        <span class="key-badge" style="background:${kc}25;color:${kc};border:1px solid ${kc}40">${t.key}</span>
        ${delta}
        <button class="set-track-more">⋮</button>
      </div>`;
    }).join('');

    el.innerHTML = `
      <!-- Stats -->
      <div class="setbuilder-stats">
        ${stats.map(s => `<div class="setbuilder-stat-card">
          <div class="setbuilder-stat-label">${s.label}</div>
          <div class="setbuilder-stat-value">${s.value}</div>
        </div>`).join('')}
      </div>

      <!-- Energy Curve -->
      <div class="setbuilder-section">
        <div class="setbuilder-section-title">Courbe d'énergie du set</div>
        <div class="energy-curve">
          <svg width="100%" height="60" viewBox="0 0 600 60" preserveAspectRatio="none">
            <defs><linearGradient id="energyGrad" x1="0" y1="0" x2="1" y2="0">${gradStops}</linearGradient></defs>
            <path d="M ${points}" fill="none" stroke="url(#energyGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            ${dots}
          </svg>
        </div>
      </div>

      <!-- Timeline -->
      <div class="setbuilder-section">
        <div class="section-header">
          <div class="setbuilder-section-title" style="margin:0">Timeline du set</div>
          <div class="section-actions">
            <button class="btn-ghost">⬆️ Ajouter track</button>
            <button class="btn-ghost">🤖 Suggérer suite</button>
            <button class="btn-primary" style="font-size:11px;padding:4px 10px">⬇️ Exporter tracklist</button>
          </div>
        </div>
        <div class="timeline-ruler">
          ${Array.from({length: 10}, (_, i) => `<div class="timeline-mark">${i * 5}min</div>`).join('')}
        </div>
        <div class="timeline-bar">${blocks}</div>
        <div style="margin-top:12px">${trackList}</div>
      </div>`;
  },
};
