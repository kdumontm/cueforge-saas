'use strict';
/**
 * CueForge Desktop — V2 Prototype Implementation
 * Vanilla JS for Electron desktop app (no React)
 */

// ═══════════════════════════════════════════════════════════════════════════
// DATA CONSTANTS — Must match V2 prototype EXACTLY
// ═══════════════════════════════════════════════════════════════════════════

const HOT_CUE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

const HOT_CUE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const CAMELOT = [
  { n: '1A', key: 'Am', color: '#4a9eff' },
  { n: '1B', key: 'C', color: '#6ab4ff' },
  { n: '2A', key: 'Em', color: '#4ecdc4' },
  { n: '2B', key: 'G', color: '#6ee4da' },
  { n: '3A', key: 'Bm', color: '#45b7d1' },
  { n: '3B', key: 'D', color: '#63cddf' },
  { n: '4A', key: 'F#m', color: '#96ceb4' },
  { n: '4B', key: 'A', color: '#a8dcc5' },
  { n: '5A', key: 'C#m', color: '#88d8a3' },
  { n: '5B', key: 'E', color: '#9de8b5' },
  { n: '6A', key: 'G#m', color: '#a8e6cf' },
  { n: '6B', key: 'B', color: '#b8f0dd' },
  { n: '7A', key: 'Ebm', color: '#ffd93d' },
  { n: '7B', key: 'F#', color: '#ffe566' },
  { n: '8A', key: 'Bbm', color: '#ffb347' },
  { n: '8B', key: 'Db', color: '#ffc566' },
  { n: '9A', key: 'Fm', color: '#ff8c69' },
  { n: '9B', key: 'Ab', color: '#ffa085' },
  { n: '10A', key: 'Cm', color: '#ff6b9d' },
  { n: '10B', key: 'Eb', color: '#ff85b0' },
  { n: '11A', key: 'Gm', color: '#c589e8' },
  { n: '11B', key: 'Bb', color: '#d4a0f0' },
  { n: '12A', key: 'Dm', color: '#a390f0' },
  { n: '12B', key: 'F', color: '#b8a8f8' },
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
// SVG GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

function generateWaveformSVG(height, overview = false, hotCues = []) {
  const bars = overview ? 200 : 120;
  const progress = 0.35;

  let svg = `<svg width="100%" height="${height}" viewBox="0 0 ${bars} ${height}" preserveAspectRatio="none">`;

  // Bars - 3-band frequency waveform
  for (let i = 0; i < bars; i++) {
    const h = overview
      ? Math.random() * height * 0.7 + height * 0.1
      : (Math.sin(i * 0.3) * 0.4 + 0.6) * height * 0.85;
    const isPlayed = i / bars < progress;
    const mid = height / 2;
    const low = (Math.sin(i * 0.8 + 1) * 0.5 + 0.5) * h * 0.4;
    const mid2 = (Math.sin(i * 0.5 + 0.5) * 0.5 + 0.5) * h * 0.35;
    const high = h - low - mid2;
    const x = i * (100 / bars) + '%';
    const w = (100 / bars) * 0.6 + '%';

    svg += `<g>`;
    svg += `<rect x="${x}" y="${mid - h / 2}" width="${w}" height="${low}" fill="${isPlayed ? '#ef444488' : '#ef444440'}" />`;
    svg += `<rect x="${x}" y="${mid - h / 2 + low}" width="${w}" height="${mid2}" fill="${isPlayed ? '#22c55e88' : '#22c55e40'}" />`;
    svg += `<rect x="${x}" y="${mid - h / 2 + low + mid2}" width="${w}" height="${high}" fill="${isPlayed ? '#3b82f688' : '#3b82f640'}" />`;
    svg += `</g>`;
  }

  // Playhead
  if (!overview) {
    svg += `<line x1="${progress * 100}%" y1="0" x2="${progress * 100}%" y2="${height}" stroke="white" stroke-width="1.5" opacity="0.9" />`;
  }

  // Hot cue markers on waveform
  if (!overview && hotCues.length > 0) {
    const positions = [8, 26, 61, 88];
    hotCues.forEach((cue, i) => {
      const pct = positions[i] || 30;
      svg += `<line x1="${pct}%" y1="0" x2="${pct}%" y2="${height}" stroke="${HOT_CUE_COLORS[cue.slot]}" stroke-width="1.5" opacity="0.85" />`;
    });
  }

  svg += `</svg>`;
  return svg;
}

function generateBeatgridLines(count = 32) {
  let html = '';
  for (let i = 0; i < count; i++) {
    const isStrong = i % 4 === 0;
    const opacity = isStrong ? 0.15 : 0.05;
    const width = isStrong ? 2 : 1;
    html += `<div style="position: absolute; top: 0; bottom: 0; left: ${(i / count) * 100}%; width: ${width}px; background: rgba(255,255,255,${opacity});"></div>`;
  }
  return html;
}

function generateCamelotWheelSVG(selectedKey) {
  const size = 200;
  const cx = size / 2, cy = size / 2;
  const outerR = 88, innerR = 55, textR_out = 75, textR_in = 43;

  const getCompatible = (n) => {
    if (!n) return [];
    const num = parseInt(n);
    const mode = n.includes('A') ? 'A' : 'B';
    return [
      n,
      `${num === 12 ? 1 : num + 1}${mode}`,
      `${num === 1 ? 12 : num - 1}${mode}`,
      `${num}${mode === 'A' ? 'B' : 'A'}`,
    ];
  };
  const compatible = getCompatible(selectedKey);

  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;

  CAMELOT.forEach((item) => {
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
    const strokeWidth = isSelected ? 2 : 1;

    svg += `<g>`;
    svg += `<path d="M ${x1} ${y1} L ${x2} ${y2} A ${r + 14} ${r + 14} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${r - 14} ${r - 14} 0 0 0 ${x1} ${y1}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    svg += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="${isSelected ? 9 : 8}" font-weight="${isSelected ? 700 : 500}" fill="${isSelected || isCompat ? 'white' : 'rgba(255,255,255,0.5)'}">${item.n}</text>`;
    svg += `</g>`;
  });

  // Center circle
  svg += `<circle cx="${cx}" cy="${cy}" r="28" fill="#1a1a2e" stroke="#252540" stroke-width="1" />`;
  svg += `<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="#f1f5f9">Camelot</text>`;
  const keyColor = CAMELOT.find(c => c.n === selectedKey)?.color || '#64748b';
  svg += `<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="12" font-weight="700" fill="${keyColor}">${selectedKey || '—'}</text>`;

  svg += `</svg>`;
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP OBJECT
// ═══════════════════════════════════════════════════════════════════════════

const CueForgeApp = {
  state: {
    currentPage: 'dashboard',
    selectedTrack: MOCK_TRACKS[0],
    activeTab: 'cues',
    isPlaying: false,
    hotCues: [...DEFAULT_HOT_CUES],
    showFilters: false,
    viewMode: 'list',
    sidebarCollapsed: false,
  },

  init() {
    this.updatePlayerCard(this.state.selectedTrack);
    this.renderWaveforms();
    this.renderHotCues();
    this.renderTimeLoop(this.state.selectedTrack);
    this.renderTrackList();
    this.renderAllTabs();
    this.renderPages();
    this.bindEvents();
  },

  bindEvents() {
    // Track selection (re-bound after renderTrackList)
    document.querySelectorAll('[data-track-id]').forEach(row => {
      row.addEventListener('click', (e) => {
        const trackId = parseInt(e.currentTarget.getAttribute('data-track-id'));
        const track = MOCK_TRACKS.find(t => t.id === trackId);
        if (track) {
          this.state.selectedTrack = track;
          this.updatePlayerCard(track);
          this.renderAllTabs();
          this.renderTrackList();
        }
      });
    });
  },

  // Render all tab panes at once (each pane has its own ID like cuesPane, beatgridPane, etc.)
  renderAllTabs() {
    const tabMap = {
      cues: this.renderCuesTab(),
      beatgrid: this.renderBeatgridTab(),
      stems: this.renderStemsTab(),
      eq: this.renderEqTab(),
      fx: this.renderFxTab(),
      mix: this.renderMixTab(),
      playlists: this.renderPlaylistsTab(),
      stats: this.renderStatsTab(),
      history: this.renderHistoryTab(),
    };
    Object.entries(tabMap).forEach(([tabId, html]) => {
      const pane = document.getElementById(tabId + 'Pane');
      if (pane) pane.innerHTML = html;
    });
  },

  // Render pages that are dynamically generated
  renderPages() {
    const exportEl = document.getElementById('exportContent');
    if (exportEl) exportEl.innerHTML = this.renderExportPage();

    const setBuilderEl = document.getElementById('setBuilderContent');
    if (setBuilderEl) setBuilderEl.innerHTML = this.renderSetBuilderPage();

    const uploadEl = document.getElementById('uploadContent');
    if (uploadEl) uploadEl.innerHTML = this.renderUploadPage();
  },

  renderWaveforms() {
    const overviewEl = document.querySelector('#waveformOverview');
    const detailEl = document.querySelector('#waveformDetail');

    if (overviewEl) {
      overviewEl.innerHTML = generateWaveformSVG(32, true);
    }

    if (detailEl) {
      detailEl.innerHTML = generateWaveformSVG(80, false, this.state.hotCues);
      // Add beatgrid lines
      detailEl.innerHTML += generateBeatgridLines(32);
    }
  },

  renderHotCues() {
    const container = document.querySelector('.hotcues-row');
    if (!container) return;

    let html = '<span style="font-size: 10px; color: var(--text-muted); margin-right: 4px; font-family: \'JetBrains Mono\', monospace;">HOT CUES</span>';

    HOT_CUE_LABELS.forEach((label, i) => {
      const cue = this.state.hotCues.find(c => c.slot === i);
      const bgColor = cue ? HOT_CUE_COLORS[i] : 'var(--bg-elevated)';
      const textColor = cue ? 'white' : 'var(--text-muted)';

      html += `
        <div style="flex: 1; min-width: 0;">
          <button style="
            width: 100%; padding: 5px 4px; border-radius: 7px; font-size: 10px;
            font-weight: 700; cursor: pointer; border: none;
            background: ${bgColor}; color: ${textColor};
            font-family: 'JetBrains Mono', monospace;
            transition: all 0.15s;
          ">
            <div>${label}</div>
            ${cue ? `<div style="font-size: 9px; opacity: 0.85; font-family: 'JetBrains Mono', monospace;">${cue.time}</div>` : ''}
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  renderTrackList() {
    const container = document.querySelector('#trackRows');
    if (!container) return;

    let html = `
      <div style="
        display: grid;
        grid-template-columns: 28px 1fr 80px 70px 60px 90px 70px 60px 60px;
        gap: 0;
        padding: 7px 16px;
        border-bottom: 1px solid var(--border-subtle);
      ">
    `;
    const headers = ['', 'TITRE', 'BPM', 'TONALITÉ', 'ÉNERGIE', 'DURÉE', 'GENRE', 'RATING', 'TAGS'];
    headers.forEach(h => {
      html += `<div style="font-size: 9px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; padding-right: 8px;">${h}</div>`;
    });
    html += `</div>`;

    MOCK_TRACKS.forEach(track => {
      const isSelected = this.state.selectedTrack?.id === track.id;
      html += `
        <div data-track-id="${track.id}" style="
          display: grid;
          grid-template-columns: 28px 1fr 80px 70px 60px 90px 70px 60px 60px;
          gap: 0;
          padding: 9px 16px;
          border-bottom: 1px solid var(--border-subtle);
          cursor: pointer;
          background: ${isSelected ? 'rgba(37,99,235,0.1)' : 'transparent'};
          transition: background 0.1s;
          align-items: center;
        ">
      `;

      // Col 1: Status
      html += `<div style="display: flex; align-items: center; justify-content: center;">`;
      if (track.analyzed) {
        html += `<span style="font-size: 13px; color: var(--accent-success);">✓</span>`;
      } else {
        html += `<span title="Analyser" style="font-size: 13px; color: var(--accent-warning); cursor: pointer;">⚡</span>`;
      }
      html += `</div>`;

      // Col 2: Title + Artist
      html += `<div style="min-width: 0; padding-right: 12px;">
        <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.title}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${track.artist}</div>
      </div>`;

      // Col 3: BPM
      html += `<div>`;
      if (track.bpm) {
        html += `<span style="font-size: 12px; font-weight: 600; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${track.bpm}</span>`;
      } else {
        html += `<button style="padding: 2px 7px; border-radius: 5px; border: 1px solid rgba(245,158,11,0.25); background: rgba(245,158,11,0.1); color: var(--accent-warning); font-size: 10px; cursor: pointer;">Analyser</button>`;
      }
      html += `</div>`;

      // Col 4: Key
      html += `<div>`;
      if (track.key) {
        const keyColor = CAMELOT.find(c => c.n === track.key)?.color || '#64748b';
        html += `<span style="display: inline-block; padding: 2px 8px; border-radius: 5px; background: ${keyColor}20; color: ${keyColor}; font-size: 10px; font-weight: 600;">${track.key}</span>`;
      } else {
        html += `<span style="color: var(--text-muted);">—</span>`;
      }
      html += `</div>`;

      // Col 5: Energy
      html += `<div>`;
      if (track.energy) {
        html += `<div style="display: flex; align-items: center; gap: 5px;">
          <div style="width: 36px; height: 4px; border-radius: 2px; background: var(--bg-elevated); overflow: hidden;">
            <div style="width: ${track.energy}%; height: 100%; background: linear-gradient(90deg, #22c55e, #eab308, #ef4444); border-radius: 2px;"></div>
          </div>
        </div>`;
      } else {
        html += `<span style="color: var(--text-muted);">—</span>`;
      }
      html += `</div>`;

      // Col 6: Duration
      html += `<div style="font-size: 12px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace;">${track.duration}</div>`;

      // Col 7: Genre
      html += `<div style="font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.genre}</div>`;

      // Col 8: Rating
      html += `<div style="font-size: 11px;">`;
      for (let j = 0; j < 5; j++) {
        const starColor = j < track.rating ? 'var(--accent-warning)' : 'var(--text-muted)';
        html += `<span style="color: ${starColor};">★</span>`;
      }
      html += `</div>`;

      // Col 9: Tags
      html += `<div style="display: flex; gap: 3px; flex-wrap: nowrap; overflow: hidden;">`;
      track.tags.slice(0, 1).forEach(tag => {
        html += `<span style="padding: 1px 5px; border-radius: 4px; font-size: 9px; background: var(--bg-elevated); color: var(--text-muted); border: 1px solid var(--border-default);">#${tag}</span>`;
      });
      html += `</div>`;

      html += `</div>`;
    });

    container.innerHTML = html;
    this.bindEvents();
  },

  updatePlayerCard(track) {
    if (!track) return;

    const titleEl = document.getElementById('playerTitle');
    const subtitleEl = document.getElementById('playerSubtitle');
    const badgesEl = document.getElementById('playerBadges');
    const artEl = document.getElementById('playerArt');

    if (titleEl) titleEl.textContent = track.title;
    if (subtitleEl) subtitleEl.textContent = `${track.artist} · ${track.genre}`;

    // Render badges (BPM + Key + Energy)
    if (badgesEl) {
      let badgesHtml = '';
      if (track.bpm) {
        badgesHtml += `<span class="badge badge-bpm">${track.bpm} BPM</span>`;
      }
      if (track.key) {
        const keyColor = CAMELOT.find(c => c.n === track.key)?.color || '#64748b';
        badgesHtml += `<span class="badge badge-key" style="background:${keyColor}22;color:${keyColor};border:1px solid ${keyColor}40">${track.key}</span>`;
      }
      if (track.energy) {
        badgesHtml += `
          <div style="display:flex;align-items:center;gap:5px;">
            <div class="energy-bar-outer"><div class="energy-bar-inner" style="width:${track.energy}%"></div></div>
            <span class="energy-label">${track.energy}</span>
          </div>`;
      }
      badgesEl.innerHTML = badgesHtml;
    }

    if (artEl && track.color) {
      artEl.style.background = track.color + '30';
      artEl.style.border = `1px solid ${track.color}40`;
    }

    this.renderWaveforms();
    this.renderHotCues();
    this.renderTimeLoop(track);
  },

  renderTimeLoop(track) {
    const container = document.getElementById('timeLoopRow');
    if (!container) return;

    const duration = track?.duration || '0:00';
    container.innerHTML = `
      <span class="time-current">2:21</span>
      <span class="time-remaining">−${duration}</span>
      <div style="flex:1"></div>
      <button class="btn-loop-ctrl btn-loop-in">IN</button>
      <button class="btn-loop-ctrl btn-loop-active">4 BARS</button>
      <button class="btn-loop-ctrl btn-loop-out">OUT</button>
      <div style="flex:1"></div>
      <span style="font-size:10px;color:var(--text-muted)">Zoom</span>
      <button class="btn-zoom">2x</button>
      <button class="btn-zoom active">4x</button>
      <button class="btn-zoom">8x</button>
      <button class="btn-zoom">16x</button>
      <span class="time-total">${duration}</span>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TAB RENDERERS
  // ─────────────────────────────────────────────────────────────────────────

  renderCuesTab() {
    let html = `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">Hot Cues — ${this.state.selectedTrack?.title || ''}</div>
          <div style="display: flex; gap: 6px;">
            <button style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-secondary); font-size: 12px; cursor: pointer;">⬆️ Auto-détecter</button>
            <button style="padding: 6px 12px; border-radius: 8px; border: none; background: var(--accent); color: white; font-size: 12px; font-weight: 600; cursor: pointer;">+ Ajouter cue</button>
          </div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
    `;

    HOT_CUE_LABELS.forEach((label, i) => {
      const cue = this.state.hotCues.find(c => c.slot === i);
      const borderColor = cue ? HOT_CUE_COLORS[i] + '50' : 'var(--border-subtle)';
      const bgColor = cue ? HOT_CUE_COLORS[i] + '10' : 'var(--bg-elevated)';

      html += `
        <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 9px; border: 1px solid ${borderColor}; background: ${bgColor};">
          <div style="
            width: 26px; height: 26px; border-radius: 6px;
            background: ${cue ? HOT_CUE_COLORS[i] : 'var(--bg-primary)'};
            border: 1px solid ${cue ? HOT_CUE_COLORS[i] : 'var(--border-default)'};
            display: flex; align-items: center; justify-content: center;
            font-size: 10px; font-weight: 700;
            color: ${cue ? 'white' : 'var(--text-muted)'};
            flex-shrink: 0;
          ">${label}</div>
      `;

      if (cue) {
        html += `
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${cue.time}</div>
            <div style="font-size: 10px; color: var(--text-secondary);">${cue.label}</div>
          </div>
          <button style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px;">✏️</button>
        `;
      } else {
        html += `<div style="font-size: 11px; color: var(--text-muted);">Vide — Cliquer pour poser</div>`;
      }

      html += `</div>`;
    });

    html += `</div>`;
    return html;
  },

  renderBeatgridTab() {
    let html = `
      <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">Beatgrid Editor</div>
          <div style="font-size: 11px; color: var(--text-muted);">Corrige le grid manuellement pour un mix parfait</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-secondary); font-size: 12px; cursor: pointer;">⟳ Re-analyser</button>
          <button style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-secondary); font-size: 12px; cursor: pointer;">÷2 BPM</button>
          <button style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-secondary); font-size: 12px; cursor: pointer;">×2 BPM</button>
        </div>
      </div>
      <div style="background: var(--bg-primary); border-radius: 9px; padding: 12px 16px; margin-bottom: 12px; position: relative; height: 80px; overflow: hidden;">
        ${generateWaveformSVG(80, false, this.state.hotCues)}
        ${generateBeatgridLines(32)}
      </div>
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11px; color: var(--text-muted);">BPM détecté:</span>
          <span style="font-size: 18px; font-weight: 700; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${this.state.selectedTrack?.bpm || '—'}</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-primary); font-size: 13px; font-family: 'JetBrains Mono', monospace; cursor: pointer;">−0.5</button>
          <button style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-primary); font-size: 13px; font-family: 'JetBrains Mono', monospace; cursor: pointer;">−0.1</button>
          <button style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-primary); font-size: 13px; font-family: 'JetBrains Mono', monospace; cursor: pointer;">+0.1</button>
          <button style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-primary); font-size: 13px; font-family: 'JetBrains Mono', monospace; cursor: pointer;">+0.5</button>
        </div>
        <button style="padding: 6px 12px; border-radius: 8px; border: none; background: var(--accent-success); color: white; font-size: 12px; font-weight: 600; cursor: pointer;">✓ Confirmer le grid</button>
      </div>
    `;
    return html;
  },

  renderStemsTab() {
    const stems = [
      { id: 'vocals', label: 'Voix', icon: '🎤', color: '#ec4899' },
      { id: 'drums', label: 'Drums', icon: '🥁', color: '#f97316' },
      { id: 'bass', label: 'Basse', icon: '🎸', color: '#22c55e' },
      { id: 'melody', label: 'Mélodie', icon: '🎹', color: '#3b82f6' },
    ];

    let html = `
      <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">Stem Separation</div>
          <div style="font-size: 11px; color: var(--text-muted);">Isoler ou muter chaque élément du track</div>
        </div>
        <button style="padding: 6px 12px; border-radius: 8px; border: none; background: var(--accent); color: white; font-size: 12px; font-weight: 600; cursor: pointer;">⚡ Séparer les stems</button>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
    `;

    stems.forEach(stem => {
      html += `
        <div style="border-radius: 10px; border: 1px solid ${stem.color}40; background: ${stem.color}10; padding: 10px 14px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">${stem.icon}</span>
              <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${stem.label}</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button style="padding: 2px 8px; border-radius: 5px; border: 1px solid ${stem.color}50; background: ${stem.color}20; color: ${stem.color}; font-size: 10px; font-weight: 700; cursor: pointer;">S</button>
              <button style="padding: 2px 8px; border-radius: 5px; border: 1px solid var(--border-default); background: transparent; color: var(--text-muted); font-size: 10px; cursor: pointer;">M</button>
            </div>
          </div>
          <div style="height: 24px; background: var(--bg-primary); border-radius: 5px; overflow: hidden;">
            <svg width="100%" height="24" viewBox="0 0 100 24">
              ${Array.from({ length: 50 }, (_, i) => {
                const h = Math.abs(Math.sin(i * 0.5 + stem.id.length)) * 18 + 3;
                return `<rect x="${i * 2}" y="${(24 - h) / 2}" width="1.5" height="${h}" fill="${stem.color}80" />`;
              }).join('')}
            </svg>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  },

  renderEqTab() {
    const bands = [
      { label: 'LOW', freq: '32Hz-512Hz', val: 0 },
      { label: 'MID', freq: '512Hz-8kHz', val: 2 },
      { label: 'HIGH', freq: '8kHz-20kHz', val: -1 },
    ];

    let html = `<div style="display: flex; gap: 24px; align-items: flex-end;">`;

    bands.forEach(band => {
      const barHeight = Math.abs(band.val) * 8;
      html += `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1;">
          <span style="font-size: 18px; font-weight: 700; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${band.val > 0 ? '+' : ''}${band.val}</span>
          <div style="width: 8px; height: 120px; background: var(--bg-elevated); border-radius: 4px; position: relative; overflow: hidden;">
            <div style="position: absolute; bottom: 50%; left: 0; right: 0; height: ${barHeight}%; background: ${band.val > 0 ? 'var(--accent-success)' : 'var(--accent-error)'}; border-radius: 4px;"></div>
            <div style="position: absolute; top: 49%; left: 0; right: 0; height: 2px; background: var(--border-strong);"></div>
          </div>
          <span style="font-size: 13px; font-weight: 700; color: var(--text-secondary);">${band.label}</span>
          <span style="font-size: 9px; color: var(--text-muted);">${band.freq}</span>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  },

  renderFxTab() {
    const effects = [
      { name: 'Reverb', active: false },
      { name: 'Delay', active: true },
      { name: 'Flanger', active: false },
      { name: 'Phaser', active: false },
      { name: 'Filter', active: true },
      { name: 'Bitcrusher', active: false },
      { name: 'Chorus', active: false },
      { name: 'Tremolo', active: false },
    ];

    let html = `
      <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Effets Audio</div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
    `;

    effects.forEach(effect => {
      const borderColor = effect.active ? `var(--accent-purple)60` : `var(--border-subtle)`;
      const bgColor = effect.active ? `var(--accent-purple)20` : `var(--bg-elevated)`;
      const textColor = effect.active ? `var(--accent-purple)` : `var(--text-secondary)`;
      const fontWeight = effect.active ? 600 : 400;

      html += `
        <button style="
          padding: 10px 8px; border-radius: 9px;
          border: 1px solid ${borderColor};
          background: ${bgColor};
          color: ${textColor};
          font-size: 12px;
          font-weight: ${fontWeight};
          cursor: pointer;
        ">${effect.name}</button>
      `;
    });

    html += `</div>`;
    return html;
  },

  renderMixTab() {
    const compatible = MOCK_TRACKS.filter(t => t.analyzed && t.id !== this.state.selectedTrack?.id);

    let html = `<div style="display: flex; gap: 20px;">`;

    // Camelot Wheel
    html += `
      <div style="flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">Roue de Camelot</div>
        ${generateCamelotWheelSVG(this.state.selectedTrack?.key)}
      </div>
    `;

    // Compatible tracks
    html += `
      <div style="flex: 1;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px;">Tracks compatibles avec ${this.state.selectedTrack?.key || '—'}</div>
    `;

    compatible.slice(0, 5).forEach(track => {
      const score = track.key === this.state.selectedTrack?.key ? 100 : Math.floor(Math.random() * 40 + 55);
      const barColor = score > 85 ? 'var(--accent-success)' : score > 70 ? 'var(--accent-warning)' : 'var(--accent-error)';

      html += `
        <div style="display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 9px; margin-bottom: 4px; background: var(--bg-elevated); cursor: pointer;">
          <div style="width: 4px; height: 30px; border-radius: 2px; background: ${barColor};"></div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.title}</div>
            <div style="font-size: 10px; color: var(--text-muted);">${track.artist}</div>
          </div>
          <span style="font-size: 10px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${score}%</span>
        </div>
      `;
    });

    html += `</div></div>`;
    return html;
  },

  renderPlaylistsTab() {
    let html = `
      <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
        <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">Playlists</div>
        <button style="padding: 6px 12px; border-radius: 8px; border: none; background: var(--accent); color: white; font-size: 12px; font-weight: 600; cursor: pointer;">+ Nouvelle playlist</button>
      </div>
    `;

    const playlists = [
      { id: 'p1', label: 'Set Berghain 2024', icon: '💿', count: 12 },
      { id: 'p2', label: 'Outdoor Summer', icon: '💿', count: 8 },
    ];

    playlists.forEach(pl => {
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 6px; background: var(--bg-elevated);">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
            <span style="font-size: 14px;">${pl.icon}</span>
            <span style="font-size: 13px; color: var(--text-secondary);">${pl.label}</span>
          </div>
          <span style="font-size: 10px; color: var(--text-muted);">${pl.count} tracks</span>
          <button style="padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-default); background: var(--bg-primary); color: var(--text-secondary); font-size: 11px; cursor: pointer; margin-left: 8px;">Ouvrir</button>
        </div>
      `;
    });

    return html;
  },

  renderStatsTab() {
    const analyzed = MOCK_TRACKS.filter(t => t.analyzed).length;
    const bpmValues = MOCK_TRACKS.filter(t => t.bpm).map(t => t.bpm);
    const avgBpm = Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length);

    let html = `
      <div style="margin-bottom: 12px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
    `;

    const stats = [
      { label: 'Total tracks', value: MOCK_TRACKS.length, icon: '🎵' },
      { label: 'Analysés', value: analyzed, icon: '✓' },
      { label: 'BPM moyen', value: avgBpm, icon: '🎯' },
      { label: 'Genres', value: new Set(MOCK_TRACKS.map(t => t.genre)).size, icon: '🏷️' },
    ];

    stats.forEach(stat => {
      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px 14px; text-align: center;">
          <div style="font-size: 18px; margin-bottom: 6px;">${stat.icon}</div>
          <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 4px;">${stat.label}</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${stat.value}</div>
        </div>
      `;
    });

    html += `</div>`;

    // BPM distribution histogram
    html += `
      <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px; margin-top: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px;">Distribution BPM</div>
        <div style="display: flex; align-items: flex-end; gap: 6px; height: 80px;">
          ${[100, 115, 130, 145].map((bpm, i) => {
            const count = MOCK_TRACKS.filter(t => t.bpm && t.bpm >= bpm - 5 && t.bpm < bpm + 5).length;
            const height = (count / MOCK_TRACKS.length) * 100;
            return `
              <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <div style="width: 100%; height: ${Math.max(height, 5)}px; background: var(--accent); border-radius: 3px;"></div>
                <span style="font-size: 9px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${bpm}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    return html;
  },

  renderHistoryTab() {
    let html = `
      <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Récemment écoutés</div>
    `;

    const recent = MOCK_TRACKS.filter(t => t.analyzed).slice(0, 5).reverse();

    recent.forEach((track, i) => {
      html += `
        <div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; background: var(--bg-elevated); border: 1px solid var(--border-subtle);">
          <span style="font-size: 12px; font-weight: 600; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; min-width: 20px;">${i + 1}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${track.title}</div>
            <div style="font-size: 10px; color: var(--text-muted);">${track.artist}</div>
          </div>
          <span style="font-size: 10px; color: var(--text-muted);">Il y a 2h</span>
          <span style="font-size: 10px; color: var(--text-muted); background: var(--bg-primary); padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace;">${track.bpm} BPM</span>
        </div>
      `;
    });

    return html;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE RENDERERS
  // ─────────────────────────────────────────────────────────────────────────

  renderExportPage() {
    let html = `<div style="padding: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">`;

    EXPORT_FORMATS.forEach(format => {
      html += `
        <div style="
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 16px 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 14px;
          position: relative;
        ">
          ${format.popular ? `<span style="position: absolute; top: 10px; right: 12px; font-size: 9px; padding: 2px 7px; border-radius: 5px; background: rgba(37,99,235,0.25); color: var(--accent); font-weight: 700;">POPULAIRE</span>` : ''}
          <span style="font-size: 28px;">${format.icon}</span>
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${format.name}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${format.desc}</div>
          </div>
          <button style="padding: 6px 12px; border-radius: 8px; border: none; background: var(--accent); color: white; font-size: 12px; font-weight: 600; cursor: pointer;">Exporter</button>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  },

  renderSetBuilderPage() {
    let html = `
      <div style="padding: 20px;">
        <div style="display: flex; gap: 12px; margin-bottom: 20px;">
    `;

    const stats = [
      { label: 'Durée totale', value: '~48 min' },
      { label: 'BPM de départ', value: '120' },
      { label: 'BPM final', value: '136' },
      { label: 'Transitions', value: '5' },
    ];

    stats.forEach(stat => {
      html += `
        <div style="flex: 1; background: var(--bg-card); border-radius: 10px; border: 1px solid var(--border-subtle); padding: 10px 16px;">
          <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 3px;">${stat.label}</div>
          <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); font-family: 'JetBrains Mono', monospace;">${stat.value}</div>
        </div>
      `;
    });

    html += `</div>`;

    // Energy curve
    html += `
      <div style="background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-subtle); padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px;">Courbe d'énergie du set</div>
        <div style="position: relative; height: 60px;">
          <svg width="100%" height="60" viewBox="0 0 600 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id="energyGrad" x1="0" y1="0" x2="1" y2="0">
                ${SET_BUILDER_TRACKS.map((t, i) => {
                  const stopColor = t.energy < 65 ? '#22c55e' : t.energy < 80 ? '#eab308' : '#ef4444';
                  const offset = (i / (SET_BUILDER_TRACKS.length - 1)) * 100;
                  return `<stop offset="${offset}%" stop-color="${stopColor}" stop-opacity="0.8" />`;
                }).join('')}
              </linearGradient>
            </defs>
            <path
              d="M ${SET_BUILDER_TRACKS.map((t, i) => `${(i / (SET_BUILDER_TRACKS.length - 1)) * 600},${60 - (t.energy / 100) * 50}`).join(' L ')}"
              fill="none"
              stroke="url(#energyGrad)"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            ${SET_BUILDER_TRACKS.map((t, i) => {
              const color = t.energy < 65 ? '#22c55e' : t.energy < 80 ? '#eab308' : '#ef4444';
              const cx = (i / (SET_BUILDER_TRACKS.length - 1)) * 600;
              const cy = 60 - (t.energy / 100) * 50;
              return `<circle cx="${cx}" cy="${cy}" r="4" fill="${color}" />`;
            }).join('')}
          </svg>
        </div>
      </div>

      <div style="background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-subtle); padding: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">Timeline du set</div>
          <div style="display: flex; gap: 6px;">
            <button style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-secondary); font-size: 12px; cursor: pointer;">⬆️ Ajouter track</button>
            <button style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-elevated); color: var(--text-secondary); font-size: 12px; cursor: pointer;">🤖 Suggérer suite</button>
            <button style="padding: 6px 12px; border-radius: 8px; border: none; background: var(--accent); color: white; font-size: 12px; font-weight: 600; cursor: pointer;">⬇️ Exporter tracklist</button>
          </div>
        </div>

        <div style="display: flex; border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px; margin-bottom: 8px;">
          ${Array.from({ length: 10 }, (_, i) => `
            <div style="flex: 1; font-size: 9px; color: var(--text-muted); text-align: center;">${i * 5}min</div>
          `).join('')}
        </div>

        <div style="position: relative; height: 48px; background: var(--bg-elevated); border-radius: 8px; overflow: hidden; margin-bottom: 12px;">
          ${SET_BUILDER_TRACKS.map((t, i) => {
            const start = (t.startMin / 48) * 100;
            const durationMin = parseInt(t.duration.split(':')[0]);
            const width = (durationMin / 48) * 100;
            return `
              <div style="
                position: absolute;
                left: ${start}%;
                width: ${width}%;
                top: 4px;
                bottom: 4px;
                border-radius: 6px;
                background: ${t.color}50;
                border: 1px solid ${t.color}80;
                display: flex;
                align-items: center;
                padding: 0 6px;
                cursor: grab;
                overflow: hidden;
              ">
                <span style="font-size: 9px; font-weight: 600; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.title}</span>
              </div>
            `;
          }).join('')}
        </div>

        <div style="margin-top: 12px;">
          ${SET_BUILDER_TRACKS.map((t, i) => {
            const keyColor = CAMELOT.find(c => c.n === t.key)?.color || '#64748b';
            return `
              <div style="display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; margin-bottom: 3px; background: var(--bg-elevated); cursor: pointer;">
                <span style="font-size: 11px; color: var(--text-muted); width: 20px; text-align: right; font-family: 'JetBrains Mono', monospace;">${i + 1}</span>
                <div style="width: 6px; height: 24px; border-radius: 3px; background: ${t.color};"></div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.title}</div>
                  <div style="font-size: 10px; color: var(--text-muted);">${t.artist}</div>
                </div>
                <span style="font-size: 10px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">${t.startMin}:00</span>
                <span style="font-size: 10px; color: var(--accent-cyan); background: var(--accent-cyan)20; padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace;">${t.bpm}</span>
                <span style="font-size: 10px; color: white; background: ${keyColor}; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${t.key}</span>
                ${i < SET_BUILDER_TRACKS.length - 1 ? `<span style="font-size: 10px; color: var(--accent);">→ ${Math.abs(SET_BUILDER_TRACKS[i + 1].bpm - t.bpm)} BPM</span>` : ''}
                <button style="background: none; border: none; cursor: pointer; color: var(--text-muted);">⋮</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    html += `</div>`;
    return html;
  },

  renderUploadPage() {
    let html = `
      <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
        <div style="
          border: 2px dashed rgba(37,99,235,0.37);
          border-radius: 16px;
          padding: 48px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          background: rgba(37,99,235,0.03);
          cursor: pointer;
        ">
          <div style="width: 64px; height: 64px; border-radius: 16px; background: rgba(37,99,235,0.12); display: flex; align-items: center; justify-content: center; font-size: 28px;">⬆️</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">Glisse tes fichiers ici</div>
          <div style="font-size: 13px; color: var(--text-muted);">MP3, WAV, FLAC, AIFF, OGG, M4A — jusqu'à 500 fichiers</div>
          <button style="padding: 10px 20px; border-radius: 8px; border: none; background: var(--accent); color: white; font-size: 14px; font-weight: 600; cursor: pointer;">Sélectionner des fichiers</button>
        </div>
        <div style="background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-subtle); padding: 16px;">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px;">Importer depuis</div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
            ${['📂 Dossier local', '🎵 Rekordbox XML', '🎵 Serato', '🎵 Traktor'].map(source => `
              <button style="
                padding: 12px 8px;
                border-radius: 10px;
                border: 1px solid var(--border-default);
                background: var(--bg-elevated);
                color: var(--text-secondary);
                font-size: 12px;
                cursor: pointer;
                font-weight: 500;
              ">${source}</button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    return html;
  },
};

// CueForgeApp.init() is called from index.html after login (via showApp → CueForgeApp.init())
