'use strict';
/**
 * CueForge DJ Tools — Desktop Edition
 * Tap Tempo, Camelot Wheel, Energy Flow, Gig Prep, Crate Digger, Quick Notes
 */

// ═══════════════════════════════════════════════════════════════════════════
// CAMELOT DATA
// ═══════════════════════════════════════════════════════════════════════════
const CAMELOT = [
  { code: '1A',  note: 'Ab min', color: '#ef4444' },
  { code: '1B',  note: 'B maj',  color: '#ef4444' },
  { code: '2A',  note: 'Eb min', color: '#f97316' },
  { code: '2B',  note: 'F# maj', color: '#f97316' },
  { code: '3A',  note: 'Bb min', color: '#f59e0b' },
  { code: '3B',  note: 'Db maj', color: '#f59e0b' },
  { code: '4A',  note: 'F min',  color: '#eab308' },
  { code: '4B',  note: 'Ab maj', color: '#eab308' },
  { code: '5A',  note: 'C min',  color: '#84cc16' },
  { code: '5B',  note: 'Eb maj', color: '#84cc16' },
  { code: '6A',  note: 'G min',  color: '#22c55e' },
  { code: '6B',  note: 'Bb maj', color: '#22c55e' },
  { code: '7A',  note: 'D min',  color: '#10b981' },
  { code: '7B',  note: 'F maj',  color: '#10b981' },
  { code: '8A',  note: 'A min',  color: '#14b8a6' },
  { code: '8B',  note: 'C maj',  color: '#14b8a6' },
  { code: '9A',  note: 'E min',  color: '#06b6d4' },
  { code: '9B',  note: 'G maj',  color: '#06b6d4' },
  { code: '10A', note: 'B min',  color: '#3b82f6' },
  { code: '10B', note: 'D maj',  color: '#3b82f6' },
  { code: '11A', note: 'F# min', color: '#6366f1' },
  { code: '11B', note: 'A maj',  color: '#6366f1' },
  { code: '12A', note: 'Db min', color: '#8b5cf6' },
  { code: '12B', note: 'E maj',  color: '#8b5cf6' },
];

function getCompatibleKeys(code) {
  const num = parseInt(code);
  const letter = code.slice(-1);
  const otherLetter = letter === 'A' ? 'B' : 'A';
  const prev = ((num - 2 + 12) % 12) + 1;
  const next = (num % 12) + 1;
  return [
    code,                        // same key
    `${num}${otherLetter}`,      // relative major/minor
    `${prev}${letter}`,          // -1
    `${next}${letter}`,          // +1
  ];
}

function keyToCamelot(keyStr) {
  if (!keyStr) return null;
  const k = keyStr.trim();
  // Already camelot?
  if (/^\d{1,2}[AB]$/i.test(k)) return k.toUpperCase();
  // Find by note name
  const found = CAMELOT.find(c => c.note.toLowerCase() === k.toLowerCase());
  return found ? found.code : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. TAP TEMPO
// ═══════════════════════════════════════════════════════════════════════════
const TapTempo = {
  taps: [],
  timeout: null,

  init() {
    const area = document.getElementById('tapArea');
    area.addEventListener('click', () => this.tap());
    document.getElementById('tapReset').addEventListener('click', () => this.reset());

    document.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
        // Only if tap tempo view is visible
        if (document.getElementById('viewTapTempo')?.classList.contains('active')) {
          e.preventDefault();
          this.tap();
        }
      }
    });
  },

  tap() {
    const now = performance.now();
    this.taps.push(now);
    if (this.taps.length > 12) this.taps.shift();

    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.reset(), 3000);

    const area = document.getElementById('tapArea');
    area.classList.remove('pulse');
    void area.offsetWidth; // reflow
    area.classList.add('pulse');

    this.update();
  },

  update() {
    const count = this.taps.length;
    document.getElementById('tapCount').textContent = `${count} tap${count > 1 ? 's' : ''}`;

    if (count < 2) {
      document.getElementById('tapArea').textContent = '—';
      document.getElementById('tapHalf').textContent = '—';
      document.getElementById('tapNormal').textContent = '—';
      document.getElementById('tapDouble').textContent = '—';
      return;
    }

    const intervals = [];
    for (let i = 1; i < count; i++) {
      intervals.push(this.taps[i] - this.taps[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avg * 10) / 10;

    document.getElementById('tapArea').textContent = bpm.toFixed(1);
    document.getElementById('tapHalf').textContent = (bpm / 2).toFixed(1);
    document.getElementById('tapNormal').textContent = bpm.toFixed(1);
    document.getElementById('tapDouble').textContent = (bpm * 2).toFixed(1);
  },

  reset() {
    this.taps = [];
    clearTimeout(this.timeout);
    document.getElementById('tapArea').textContent = '—';
    document.getElementById('tapHalf').textContent = '—';
    document.getElementById('tapNormal').textContent = '—';
    document.getElementById('tapDouble').textContent = '—';
    document.getElementById('tapCount').textContent = '0 taps';
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. CAMELOT WHEEL
// ═══════════════════════════════════════════════════════════════════════════
const CamelotWheel = {
  selected: null,

  init() {
    this.render();
  },

  render() {
    const grid = document.getElementById('camelotGrid');
    // Build a grid: rows = numbers 1-12, columns = A and B
    let html = '<div style="display:grid;grid-template-columns:repeat(4,auto);gap:4px;justify-content:center">';
    html += '<div style="color:#666;font-size:10px;text-align:center;padding:4px">#</div>';
    html += '<div style="color:#666;font-size:10px;text-align:center;padding:4px">Minor (A)</div>';
    html += '<div style="color:#666;font-size:10px;text-align:center;padding:4px">Major (B)</div>';
    html += '<div style="color:#666;font-size:10px;text-align:center;padding:4px">Note</div>';

    for (let n = 1; n <= 12; n++) {
      const a = CAMELOT.find(c => c.code === `${n}A`);
      const b = CAMELOT.find(c => c.code === `${n}B`);

      html += `<div style="color:#666;font-size:11px;display:flex;align-items:center;justify-content:center">${n}</div>`;
      html += `<div class="camelot-key-cell" data-key="${a.code}" style="background:${a.color}33;color:${a.color}">${a.code}</div>`;
      html += `<div class="camelot-key-cell" data-key="${b.code}" style="background:${b.color}33;color:${b.color}">${b.code}</div>`;
      html += `<div style="color:#888;font-size:10px;display:flex;align-items:center;padding-left:6px">${a.note} / ${b.note}</div>`;
    }
    html += '</div>';
    grid.innerHTML = html;

    grid.querySelectorAll('.camelot-key-cell').forEach(el => {
      el.addEventListener('click', () => this.select(el.dataset.key));
    });
  },

  select(key) {
    this.selected = key === this.selected ? null : key;
    const compat = this.selected ? getCompatibleKeys(this.selected) : [];
    const info = document.getElementById('camelotInfo');

    // Update cell highlights
    document.querySelectorAll('.camelot-key-cell').forEach(el => {
      el.classList.remove('selected', 'compatible');
      if (el.dataset.key === this.selected) el.classList.add('selected');
      else if (compat.includes(el.dataset.key)) el.classList.add('compatible');
    });

    if (!this.selected) {
      info.innerHTML = '<div style="color:#888;font-size:13px">Clique sur une tonalité pour voir les clés compatibles.</div>';
      return;
    }

    const keyData = CAMELOT.find(c => c.code === key);
    let html = `<div class="tool-card-title" style="font-size:16px;color:${keyData.color}">${key} — ${keyData.note}</div>`;
    html += '<div style="margin-top:10px;font-size:12px;color:#aaa">Clés compatibles :</div>';
    html += '<div class="camelot-compat-list">';
    compat.forEach(k => {
      const d = CAMELOT.find(c => c.code === k);
      if (d) {
        html += `<span class="camelot-compat-item" style="background:${d.color}22;color:${d.color}">${d.code} ${d.note}</span>`;
      }
    });
    html += '</div>';

    // Count tracks per key from the library
    if (typeof state !== 'undefined' && state.tracks.length > 0) {
      const counts = {};
      compat.forEach(k => { counts[k] = 0; });
      state.tracks.forEach(t => {
        const ck = keyToCamelot(t.key_name);
        if (ck && counts[ck] !== undefined) counts[ck]++;
      });
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      html += `<div style="margin-top:14px;color:#666;font-size:12px">${total} piste${total > 1 ? 's' : ''} compatible${total > 1 ? 's' : ''} dans ta bibliothèque</div>`;
    }

    info.innerHTML = html;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. ENERGY FLOW
// ═══════════════════════════════════════════════════════════════════════════
const EnergyFlow = {
  init() {},

  render(tracks) {
    const chart = document.getElementById('energyChart');
    const stats = document.getElementById('energyStats');

    if (!tracks || tracks.length === 0) {
      chart.innerHTML = '<div style="color:#666;font-size:13px;padding:40px;text-align:center">Importe et analyse des pistes pour voir leur énergie.</div>';
      stats.innerHTML = '';
      return;
    }

    // Filter tracks with energy
    const withEnergy = tracks.filter(t => t.energy != null && t.energy > 0);
    if (withEnergy.length === 0) {
      chart.innerHTML = '<div style="color:#666;font-size:13px;padding:40px;text-align:center">Aucune piste analysée avec énergie.</div>';
      stats.innerHTML = '';
      return;
    }

    // Energy levels
    const levels = [
      { name: 'Ambient', emoji: '🌙', max: 20, color: '#6366f1' },
      { name: 'Chill',   emoji: '🌊', max: 40, color: '#06b6d4' },
      { name: 'Warm',    emoji: '☀️', max: 60, color: '#eab308' },
      { name: 'Hot',     emoji: '🔥', max: 80, color: '#f97316' },
      { name: 'Peak',    emoji: '⚡', max: 100, color: '#ef4444' },
    ];

    function getLevel(e) {
      return levels.find(l => e <= l.max) || levels[4];
    }

    // Build bars
    let barsHtml = '';
    withEnergy.forEach((t, i) => {
      const e = Math.min(100, Math.max(1, Math.round(t.energy)));
      const level = getLevel(e);
      const title = t.title || t.original_filename || 'Track';
      const artist = t.artist || '';
      barsHtml += `<div class="energy-bar" style="height:${e}%;background:${level.color}">
        <div class="energy-bar-tooltip">${level.emoji} ${title}${artist ? ' — ' + artist : ''}<br>${e}% — ${level.name}</div>
      </div>`;
    });
    chart.innerHTML = barsHtml;

    // Stats
    const energies = withEnergy.map(t => t.energy);
    const avg = Math.round(energies.reduce((a, b) => a + b, 0) / energies.length);

    let maxBuild = 0, maxDrop = 0;
    for (let i = 1; i < energies.length; i++) {
      const delta = energies[i] - energies[i - 1];
      if (delta > maxBuild) maxBuild = delta;
      if (delta < maxDrop) maxDrop = delta;
    }

    const avgLevel = getLevel(avg);
    stats.innerHTML = `
      <div class="energy-stat"><div class="energy-stat-label">Pistes</div><div class="energy-stat-value">${withEnergy.length}</div></div>
      <div class="energy-stat"><div class="energy-stat-label">Énergie moy.</div><div class="energy-stat-value">${avgLevel.emoji} ${avg}%</div></div>
      <div class="energy-stat"><div class="energy-stat-label">Plus gros build</div><div class="energy-stat-value" style="color:#22c55e">+${Math.round(maxBuild)}</div></div>
      <div class="energy-stat"><div class="energy-stat-label">Plus gros drop</div><div class="energy-stat-value" style="color:#ef4444">${Math.round(maxDrop)}</div></div>
    `;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. GIG PREP
// ═══════════════════════════════════════════════════════════════════════════
const GigPrep = {
  gigs: [],
  activeGigId: null,
  STORAGE_KEY: 'cueforge_gig_preps',

  defaultChecklist: {
    'Matériel 🎧': [
      'Clé USB (backup)', 'Casque DJ', 'Câbles audio (RCA/Jack)',
      'Laptop chargé', 'Carte son', 'Adaptateurs'
    ],
    'Musique 🎵': [
      'Playlists prêtes', 'Cue points définis', 'BPM range vérifié',
      'Tracks de backup', 'Transitions préparées'
    ],
    'Logistique 📍': [
      'Adresse du lieu', 'Heure du soundcheck', 'Contact organisateur',
      'Technical rider envoyé', 'Parking / accès'
    ],
    'Avant le set 🎚️': [
      'Test son', 'Niveaux de volume', 'Retour casque OK',
      'Téléphone en silencieux'
    ]
  },

  init() {
    this.load();
  },

  load() {
    try {
      this.gigs = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch { this.gigs = []; }
    if (this.gigs.length > 0 && !this.activeGigId) {
      this.activeGigId = this.gigs[0].id;
    }
  },

  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.gigs));
  },

  createGig(name) {
    const gig = {
      id: Date.now().toString(),
      name: name || 'Nouveau gig',
      date: '',
      venue: '',
      categories: {}
    };
    for (const [cat, items] of Object.entries(this.defaultChecklist)) {
      gig.categories[cat] = items.map(text => ({ text, done: false }));
    }
    this.gigs.unshift(gig);
    this.activeGigId = gig.id;
    this.save();
    this.render();
  },

  deleteGig(id) {
    this.gigs = this.gigs.filter(g => g.id !== id);
    if (this.activeGigId === id) {
      this.activeGigId = this.gigs[0]?.id || null;
    }
    this.save();
    this.render();
  },

  render() {
    const listEl = document.getElementById('gigList');
    const contentEl = document.getElementById('gigContent');

    // Gig chips
    let chipsHtml = this.gigs.map(g => {
      const active = g.id === this.activeGigId ? 'active' : '';
      return `<div class="gig-chip ${active}" data-gig="${g.id}">${g.name}</div>`;
    }).join('');
    chipsHtml += '<div class="gig-chip add" id="addGigChip">+ Nouveau</div>';
    listEl.innerHTML = chipsHtml;

    // Chip events
    listEl.querySelectorAll('.gig-chip[data-gig]').forEach(el => {
      el.addEventListener('click', () => {
        this.activeGigId = el.dataset.gig;
        this.render();
      });
    });
    document.getElementById('addGigChip').addEventListener('click', () => {
      const name = prompt('Nom du gig :');
      if (name) this.createGig(name);
    });

    const gig = this.gigs.find(g => g.id === this.activeGigId);
    if (!gig) {
      contentEl.innerHTML = '<div class="tool-card" style="text-align:center;color:#666;padding:40px">Crée ton premier gig pour commencer !</div>';
      return;
    }

    // Progress
    let total = 0, done = 0;
    for (const items of Object.values(gig.categories)) {
      total += items.length;
      done += items.filter(i => i.done).length;
    }
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const progressColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';

    let html = '<div class="tool-card">';
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">`;
    html += `<div style="font-size:16px;font-weight:700;color:#fff">${gig.name}</div>`;
    html += `<div style="display:flex;gap:8px;align-items:center">`;
    html += `<span style="font-size:12px;color:${progressColor};font-weight:700">${pct}%</span>`;
    html += `<button onclick="GigPrep.deleteGig('${gig.id}')" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px" title="Supprimer">🗑</button>`;
    html += `</div></div>`;
    html += `<div class="gig-progress"><div class="gig-progress-fill" style="width:${pct}%;background:${progressColor}"></div></div>`;

    // Categories
    for (const [cat, items] of Object.entries(gig.categories)) {
      const catDone = items.filter(i => i.done).length;
      html += `<div class="checklist-category">`;
      html += `<div class="checklist-cat-header">${cat} <span style="color:#666;font-size:11px;font-weight:400">(${catDone}/${items.length})</span></div>`;
      html += `<div class="checklist-items">`;
      items.forEach((item, idx) => {
        html += `<div class="checklist-item ${item.done ? 'done' : ''}">
          <input type="checkbox" ${item.done ? 'checked' : ''} onchange="GigPrep.toggleItem('${gig.id}','${cat}',${idx})">
          <span>${item.text}</span>
          <span class="del-item" onclick="GigPrep.removeItem('${gig.id}','${cat}',${idx})">✕</span>
        </div>`;
      });
      html += `</div>`;
      html += `<div class="add-item-row">
        <input class="add-item-input" placeholder="Ajouter un item…" data-cat="${cat}" data-gig="${gig.id}" onkeydown="if(event.key==='Enter')GigPrep.addItem(this)">
        <button class="add-item-btn" onclick="GigPrep.addItem(this.previousElementSibling)">+</button>
      </div>`;
      html += `</div>`;
    }
    html += '</div>';
    contentEl.innerHTML = html;
  },

  toggleItem(gigId, cat, idx) {
    const gig = this.gigs.find(g => g.id === gigId);
    if (gig) {
      gig.categories[cat][idx].done = !gig.categories[cat][idx].done;
      this.save();
      this.render();
    }
  },

  removeItem(gigId, cat, idx) {
    const gig = this.gigs.find(g => g.id === gigId);
    if (gig) {
      gig.categories[cat].splice(idx, 1);
      this.save();
      this.render();
    }
  },

  addItem(input) {
    const text = input.value.trim();
    if (!text) return;
    const gig = this.gigs.find(g => g.id === input.dataset.gig);
    if (gig) {
      gig.categories[input.dataset.cat].push({ text, done: false });
      input.value = '';
      this.save();
      this.render();
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. CRATE DIGGER
// ═══════════════════════════════════════════════════════════════════════════
const CrateDigger = {
  mode: 'random',
  digCount: 0,

  init() {
    document.querySelectorAll('.dig-mode').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.dig-mode').forEach(m => m.classList.remove('active'));
        el.classList.add('active');
        this.mode = el.dataset.mode;
      });
    });
    document.getElementById('digBtn').addEventListener('click', () => this.dig());
  },

  dig() {
    const tracks = typeof state !== 'undefined' ? state.tracks : [];
    if (tracks.length === 0) {
      document.getElementById('digResults').innerHTML = '<div style="color:#666;font-size:13px">Importe des pistes d\'abord !</div>';
      return;
    }

    this.digCount++;
    let results = [];

    switch (this.mode) {
      case 'random':
        results = this.shuffle(tracks).slice(0, 5);
        break;
      case 'energy':
        results = this.energyJourney(tracks);
        break;
      case 'genre':
        results = this.genreExplore(tracks);
        break;
      case 'gems':
        results = this.hiddenGems(tracks);
        break;
    }

    this.renderResults(results);
  },

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  energyJourney(tracks) {
    const bands = [
      { min: 0, max: 25 },
      { min: 25, max: 50 },
      { min: 50, max: 70 },
      { min: 70, max: 85 },
      { min: 85, max: 100 },
    ];
    const results = [];
    for (const band of bands) {
      const pool = tracks.filter(t => {
        const e = t.energy || 0;
        return e >= band.min && e < band.max;
      });
      if (pool.length > 0) {
        results.push(pool[Math.floor(Math.random() * pool.length)]);
      }
    }
    return results;
  },

  genreExplore(tracks) {
    const genreMap = {};
    tracks.forEach(t => {
      const g = t.genre || 'Unknown';
      if (!genreMap[g]) genreMap[g] = [];
      genreMap[g].push(t);
    });
    // Sort by rarest genre first
    const sorted = Object.entries(genreMap).sort((a, b) => a[1].length - b[1].length);
    const results = [];
    for (const [, pool] of sorted) {
      if (results.length >= 5) break;
      results.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return results;
  },

  hiddenGems(tracks) {
    // Prioritize low play count + high rated (but we don't have play_count in desktop, so random with analysis)
    const analyzed = tracks.filter(t => t.bpm && t.key_name);
    const pool = analyzed.length > 5 ? analyzed : tracks;
    return this.shuffle(pool).slice(0, 5);
  },

  renderResults(results) {
    const el = document.getElementById('digResults');
    if (results.length === 0) {
      el.innerHTML = '<div style="color:#666;font-size:13px">Pas de résultats pour ce mode. Essaie un autre !</div>';
      return;
    }

    el.innerHTML = results.map(t => {
      const title = t.title || t.original_filename || 'Track';
      const artist = t.artist || '—';
      const bpm = t.bpm ? t.bpm.toFixed(1) : '—';
      const key = t.key_name || '—';
      const energy = t.energy || 0;
      const eColor = energy > 70 ? '#ef4444' : energy > 40 ? '#eab308' : '#06b6d4';

      return `<div class="dig-result" data-track-id="${t.id}">
        <div style="font-size:18px">💿</div>
        <div class="dig-result-info">
          <div class="dig-result-title">${title}</div>
          <div class="dig-result-artist">${artist}</div>
        </div>
        <div class="dig-result-meta">
          <span>${bpm} BPM</span>
          <span>${key}</span>
        </div>
        <div class="dig-result-energy"><div class="dig-result-energy-fill" style="width:${energy}%;background:${eColor}"></div></div>
      </div>`;
    }).join('');
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. QUICK NOTES
// ═══════════════════════════════════════════════════════════════════════════
const QuickNotes = {
  notes: [],
  currentColor: '#fbbf24',
  STORAGE_KEY: 'cueforge_quick_notes',

  init() {
    this.load();

    // Color selection
    document.querySelectorAll('.note-color-dot').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.note-color-dot').forEach(d => d.classList.remove('active'));
        el.classList.add('active');
        this.currentColor = el.dataset.color;
      });
    });

    // Add note
    document.getElementById('noteAddBtn').addEventListener('click', () => this.addNote());
    document.getElementById('noteInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addNote();
    });

    // Search
    document.getElementById('noteSearch').addEventListener('input', () => this.render());
  },

  load() {
    try {
      this.notes = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch { this.notes = []; }
  },

  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.notes));
  },

  addNote() {
    const input = document.getElementById('noteInput');
    const text = input.value.trim();
    if (!text) return;

    this.notes.unshift({
      id: Date.now().toString(),
      text,
      color: this.currentColor,
      pinned: false,
      createdAt: Date.now(),
    });
    input.value = '';
    this.save();
    this.render();
  },

  togglePin(id) {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      note.pinned = !note.pinned;
      this.save();
      this.render();
    }
  },

  deleteNote(id) {
    this.notes = this.notes.filter(n => n.id !== id);
    this.save();
    this.render();
  },

  timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'à l\'instant';
    if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `il y a ${Math.floor(diff / 3600000)}h`;
    return `il y a ${Math.floor(diff / 86400000)}j`;
  },

  render() {
    const search = (document.getElementById('noteSearch')?.value || '').toLowerCase();
    const list = document.getElementById('notesList');

    let filtered = this.notes;
    if (search) {
      filtered = filtered.filter(n => n.text.toLowerCase().includes(search));
    }
    // Pinned first
    filtered.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    if (filtered.length === 0) {
      list.innerHTML = '<div style="color:#666;font-size:12px;text-align:center;padding:20px">Aucune note.</div>';
      return;
    }

    list.innerHTML = filtered.map(n => `
      <div class="note-card" style="background:${n.color}11;border-color:${n.color}">
        <span class="note-pin ${n.pinned ? 'pinned' : ''}" onclick="QuickNotes.togglePin('${n.id}')">${n.pinned ? '📌' : '📍'}</span>
        <span class="note-del" onclick="QuickNotes.deleteNote('${n.id}')">✕</span>
        <div style="color:#ddd">${n.text}</div>
        <div class="note-time">${this.timeAgo(n.createdAt)}</div>
      </div>
    `).join('');
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 7. EXPORT MULTI-FORMAT
// ═══════════════════════════════════════════════════════════════════════════
const MultiExport = {
  exportM3U(tracks) {
    let content = '#EXTM3U\n';
    tracks.forEach(t => {
      const duration = Math.round(t.duration || 0);
      const title = t.title || t.original_filename || 'Unknown';
      const artist = t.artist || 'Unknown';
      content += `#EXTINF:${duration},${artist} - ${title}\n`;
      content += `${t.file_path}\n`;
    });
    return content;
  },

  exportCSV(tracks) {
    const headers = ['Titre', 'Artiste', 'Album', 'BPM', 'Tonalité', 'Énergie', 'Durée (s)', 'Format', 'Chemin'];
    let csv = headers.join(',') + '\n';
    tracks.forEach(t => {
      const row = [
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${(t.artist || '').replace(/"/g, '""')}"`,
        `"${(t.album || '').replace(/"/g, '""')}"`,
        t.bpm ? t.bpm.toFixed(1) : '',
        `"${t.key_name || ''}"`,
        t.energy ? Math.round(t.energy) : '',
        t.duration ? Math.round(t.duration) : '',
        `"${t.format || ''}"`,
        `"${(t.file_path || '').replace(/"/g, '""')}"`,
      ];
      csv += row.join(',') + '\n';
    });
    return csv;
  },

  exportJSON(tracks) {
    const data = tracks.map(t => ({
      title: t.title || null,
      artist: t.artist || null,
      album: t.album || null,
      bpm: t.bpm || null,
      key: t.key_name || null,
      energy: t.energy || null,
      duration: t.duration || null,
      format: t.format || null,
      file_path: t.file_path || null,
      cue_points: t.cue_points || null,
    }));
    return JSON.stringify(data, null, 2);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
const ViewManager = {
  currentView: 'library',

  viewMap: {
    'library':      null,  // default content area
    'files':        null,
    'tap-tempo':    'viewTapTempo',
    'camelot':      'viewCamelot',
    'energy-flow':  'viewEnergyFlow',
    'gig-prep':     'viewGigPrep',
    'crate-digger': 'viewCrateDigger',
    'notes':        'viewNotes',
    'account':      'viewAccount',
    'settings':     'viewSettings',
    'admin':        'viewAdmin',
  },

  init() {
    document.querySelectorAll('.sidebar-item[data-view]').forEach(el => {
      el.addEventListener('click', () => this.switchTo(el.dataset.view));
    });
  },

  switchTo(view) {
    this.currentView = view;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-item[data-view]').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    // Hide all tool views
    document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));

    // Hide or show default content (topbar, contentArea, detailPanel)
    const defaultEls = ['contentArea', 'detailPanel'];
    const topbar = document.querySelector('.topbar');
    const panelId = this.viewMap[view];

    if (panelId) {
      // Show tool view, hide default
      defaultEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      if (topbar) topbar.style.display = 'none';
      document.getElementById(panelId).classList.add('active');

      // Init specific tools when shown
      if (view === 'energy-flow') EnergyFlow.render(typeof state !== 'undefined' ? state.tracks : []);
      if (view === 'gig-prep') GigPrep.render();
      if (view === 'notes') QuickNotes.render();

      // Settings / Admin data loading
      if (typeof onViewSwitch === 'function') onViewSwitch(view);
    } else {
      // Show default content
      defaultEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
      });
      if (topbar) topbar.style.display = '';
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INIT ALL TOOLS
// ═══════════════════════════════════════════════════════════════════════════
function initDJTools() {
  ViewManager.init();
  TapTempo.init();
  CamelotWheel.init();
  EnergyFlow.init();
  GigPrep.init();
  CrateDigger.init();
  QuickNotes.init();
}
