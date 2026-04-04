/**
 * pages.js — Logique des 5 nouvelles pages (Compatible, Playlists, Crates, Gig Prep, Tools)
 * Utilise window.cueforge.data.* (hybrid) et window.cueforge.api.* (cloud)
 */

// ═══════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════

const CAMELOT_COLORS = {
  '1A':'#e74c3c','1B':'#e74c3c','2A':'#e67e22','2B':'#e67e22',
  '3A':'#f1c40f','3B':'#f1c40f','4A':'#2ecc71','4B':'#2ecc71',
  '5A':'#1abc9c','5B':'#1abc9c','6A':'#3498db','6B':'#3498db',
  '7A':'#2980b9','7B':'#2980b9','8A':'#8e44ad','8B':'#8e44ad',
  '9A':'#9b59b6','9B':'#9b59b6','10A':'#e91e63','10B':'#e91e63',
  '11A':'#f06292','11B':'#f06292','12A':'#ef5350','12B':'#ef5350',
};
const CRATE_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#8b5cf6','#ec4899'];
const ENERGY_COLORS = ['#6366f1','#3b82f6','#22c55e','#f59e0b','#ef4444'];

function getKeyColor(key) {
  if (!key) return '#64748b';
  const clean = key.replace(/\s/g,'').toUpperCase();
  return CAMELOT_COLORS[clean] || '#64748b';
}
function getEnergyColor(e) {
  if (e == null) return '#64748b';
  if (e < 20) return ENERGY_COLORS[0];
  if (e < 40) return ENERGY_COLORS[1];
  if (e < 60) return ENERGY_COLORS[2];
  if (e < 80) return ENERGY_COLORS[3];
  return ENERGY_COLORS[4];
}
function toast(msg, type = 'info') {
  if (typeof showToast === 'function') return showToast(msg, type);
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const d = document.createElement('div');
  d.className = `toast ${type}`;
  d.setAttribute('role', 'alert');
  d.textContent = msg;
  c.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

// ── Modal Dialog System ────────────────────────────────────
function showModal({ title, message, inputPlaceholder, confirmLabel, danger, onConfirm, onCancel }) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const msgEl = document.getElementById('modalMessage');
  const inputEl = document.getElementById('modalInput');
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn = document.getElementById('modalCancel');
  if (!overlay) return;

  titleEl.textContent = title || '';
  msgEl.textContent = message || '';
  inputEl.style.display = inputPlaceholder ? 'block' : 'none';
  inputEl.value = '';
  if (inputPlaceholder) { inputEl.placeholder = inputPlaceholder; }
  confirmBtn.textContent = confirmLabel || 'OK';
  confirmBtn.className = `modal-btn ${danger ? 'modal-btn-danger' : 'modal-btn-confirm'}`;
  overlay.classList.add('show');

  // Focus management
  setTimeout(() => { inputPlaceholder ? inputEl.focus() : confirmBtn.focus(); }, 50);

  function close() {
    overlay.classList.remove('show');
    confirmBtn.onclick = null; cancelBtn.onclick = null;
    document.removeEventListener('keydown', keyHandler);
  }
  function keyHandler(e) {
    if (e.key === 'Escape') { close(); onCancel?.(); }
    if (e.key === 'Enter' && inputPlaceholder) { confirmBtn.click(); }
  }
  document.addEventListener('keydown', keyHandler);

  confirmBtn.onclick = () => { close(); onConfirm?.(inputEl.value); };
  cancelBtn.onclick = () => { close(); onCancel?.(); };
}

// Promise-based wrappers
function confirmModal(title, message, { danger = false, confirmLabel = 'Supprimer' } = {}) {
  return new Promise(resolve => {
    showModal({ title, message, danger, confirmLabel, onConfirm: () => resolve(true), onCancel: () => resolve(false) });
  });
}
function promptModal(title, message, placeholder) {
  return new Promise(resolve => {
    showModal({ title, message, inputPlaceholder: placeholder, confirmLabel: 'Créer', onConfirm: (v) => resolve(v?.trim() || null), onCancel: () => resolve(null) });
  });
}

// ── Loading State Helper ───────────────────────────────────
function showLoading(container, message = 'Chargement…') {
  if (!container) return;
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>${message}</span></div>`;
}

// ── Skeleton Loader Helper ─────────────────────────────────
function showSkeleton(container, count = 3) {
  if (!container) return;
  container.innerHTML = Array(count).fill('<div class="skeleton skeleton-card" style="margin-bottom:12px"></div>').join('');
}

let _allTracks = [];
async function ensureTracks() {
  if (_allTracks.length > 0) return _allTracks;
  try {
    const cf = window.cueforge;
    if (cf?.data?.tracks?.list) {
      const r = await cf.data.tracks.list();
      _allTracks = r?.data?.items || r?.data?.tracks || r?.data || r || [];
    } else if (cf?.getTracks) {
      _allTracks = await cf.getTracks() || [];
    }
  } catch (e) {
    console.warn('ensureTracks:', e);
    toast('Erreur chargement des tracks', 'error');
  }
  return _allTracks;
}

// Called when switching views
function onViewSwitch(view) {
  if (view === 'compatible') initCompatible();
  else if (view === 'playlists') initPlaylists();
  else if (view === 'crates') initCrates();
  else if (view === 'gigprep') initGigPrep();
  else if (view === 'tools') initTools();
}
// Make globally available
window.onViewSwitch = onViewSwitch;


// ═══════════════════════════════════════════════════════════════════════
// 1. MIX COMPATIBLE
// ═══════════════════════════════════════════════════════════════════════

let compatSelectedTrack = null;

async function initCompatible() {
  const tracks = await ensureTracks();
  const analyzed = tracks.filter(t => t.bpm || t.key_name || t.camelot);
  renderCompatDropdown(analyzed);
}

function renderCompatDropdown(tracks) {
  const list = document.getElementById('compatDropdownList');
  if (!list) return;
  list.innerHTML = tracks.map(t => {
    const id = t.remote_id || t.id;
    const bpm = t.bpm ? Math.round(t.bpm) : '—';
    const key = t.camelot || t.key_name || '';
    return `<button class="compat-dropdown-item" data-id="${id}">
      <span style="font-size:13px">&#x1f3b5;</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title || t.filename || 'Sans titre'}</span>
      <span class="track-meta">${bpm} · ${key}</span>
    </button>`;
  }).join('');

  // Selector toggle
  const btn = document.getElementById('compatSelectorBtn');
  const dropdown = document.getElementById('compatDropdown');
  btn.onclick = () => { dropdown.classList.toggle('show'); btn.classList.toggle('open'); };

  // Search filter
  const search = document.getElementById('compatSearchInput');
  if (search) {
    search.oninput = () => {
      const q = search.value.toLowerCase();
      list.querySelectorAll('.compat-dropdown-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    };
  }

  // Item click
  list.querySelectorAll('.compat-dropdown-item').forEach(item => {
    item.onclick = () => {
      const id = parseInt(item.dataset.id);
      const track = tracks.find(t => (t.remote_id || t.id) == id);
      if (track) selectCompatTrack(track);
      dropdown.classList.remove('show');
      btn.classList.remove('open');
    };
  });

  // Close on outside click + Escape
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.compat-selector')) {
      dropdown?.classList.remove('show');
      btn?.classList.remove('open');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdown?.classList.contains('show')) {
      dropdown.classList.remove('show');
      btn?.classList.remove('open');
      btn?.focus();
    }
  });
}

async function selectCompatTrack(track) {
  compatSelectedTrack = track;
  const label = document.getElementById('compatSelectedLabel');
  if (label) label.textContent = `${track.title || track.filename} — ${Math.round(track.bpm||0)} BPM · ${track.camelot||track.key_name||''}`;

  const area = document.getElementById('compatResultsArea');
  showLoading(area, 'Recherche des tracks compatibles…');

  try {
    const id = track.remote_id || track.id;
    let results = [];
    if (window.cueforge?.api?.tracks?.compatible) {
      const r = await window.cueforge.api.tracks.compatible(id, 20);
      results = r?.compatible || r?.data || r || [];
    } else if (window.cueforge?.data?.tracks?.compatible) {
      const r = await window.cueforge.data.tracks.compatible(id);
      results = r?.data || r || [];
    }
    renderCompatResults(results, track);
  } catch (e) {
    console.error('Compatible error:', e);
    area.innerHTML = '<div style="text-align:center;padding:32px;color:#ef4444">Erreur lors de la recherche</div>';
  }
}

function renderCompatResults(results, refTrack) {
  const area = document.getElementById('compatResultsArea');
  if (!results || results.length === 0) {
    area.innerHTML = `<div class="compat-empty"><div class="compat-empty-icon">&#x1f914;</div><p style="font-size:14px;color:var(--text-secondary)">Aucun track compatible trouvé</p></div>`;
    return;
  }

  let html = `<div class="compat-results">
    <div class="compat-results-header">
      <span class="icon">&#x26a1;</span>
      <span class="title">Tracks compatibles avec "${refTrack.title || refTrack.filename}"</span>
      <span class="count">${results.length} résultats</span>
    </div>
    <div class="compat-cols"><span>Track</span><span style="text-align:right">BPM</span><span>Camelot</span><span>Harmonie</span><span>Score</span></div>`;

  results.forEach(r => {
    const t = r.track || r;
    const score = r.score ?? r.compatibility_score ?? 0;
    const key = t.camelot || t.key_name || '';
    const bpm = t.bpm ? Math.round(t.bpm) : '—';
    const harmStars = r.harmonic_score ?? (score > 80 ? 3 : score > 50 ? 2 : 1);

    let scoreClass = 'score-risky', scoreLabel = 'Risqué';
    if (score >= 85) { scoreClass = 'score-excellent'; scoreLabel = 'Excellent'; }
    else if (score >= 65) { scoreClass = 'score-good'; scoreLabel = 'Bon'; }
    else if (score >= 40) { scoreClass = 'score-possible'; scoreLabel = 'Possible'; }

    const stars = [0,1,2].map(i => `<div class="compat-star ${i < harmStars ? 'filled' : 'empty'}"></div>`).join('');

    html += `<div class="compat-row">
      <div class="compat-track-info">
        <div class="compat-track-title">${t.title || t.filename || 'Sans titre'}</div>
        <div class="compat-track-artist">${t.artist || '—'}</div>
      </div>
      <div class="compat-bpm">${bpm}</div>
      <div><span class="compat-camelot" style="background:${getKeyColor(key)}">${key || '—'}</span></div>
      <div class="compat-stars">${stars}</div>
      <div><span class="score-badge ${scoreClass}">${scoreLabel} ${Math.round(score)}%</span></div>
    </div>`;
  });

  html += '</div>';
  area.innerHTML = html;
}


// ═══════════════════════════════════════════════════════════════════════
// 2. PLAYLISTS
// ═══════════════════════════════════════════════════════════════════════

let playlistsData = [];
let currentPlaylistId = null;

async function initPlaylists() {
  const grid = document.getElementById('playlistsGrid');
  showSkeleton(grid, 4);
  try {
    if (window.cueforge?.api?.playlists?.list) {
      const r = await window.cueforge.api.playlists.list();
      playlistsData = r?.data || r || [];
    } else if (window.cueforge?.data?.playlists?.list) {
      const r = await window.cueforge.data.playlists.list();
      playlistsData = r?.data || r || [];
    }
  } catch (e) {
    console.warn('initPlaylists:', e);
    toast('Impossible de charger les playlists', 'error');
    playlistsData = [];
  }

  currentPlaylistId = null;
  renderPlaylistsGrid();
  setupPlaylistEvents();
}

function renderPlaylistsGrid() {
  const grid = document.getElementById('playlistsGrid');
  const empty = document.getElementById('playlistsEmpty');
  const detail = document.getElementById('playlistDetailView');
  const count = document.getElementById('playlistsCount');

  if (detail) detail.classList.remove('active');
  if (count) count.textContent = playlistsData.length > 0 ? `(${playlistsData.length})` : '';

  if (!playlistsData.length) {
    if (grid) grid.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  if (grid) grid.style.display = '';
  if (empty) empty.style.display = 'none';

  grid.innerHTML = playlistsData.map(pl => {
    const count = pl.track_count ?? pl.tracks?.length ?? 0;
    return `<div class="playlist-card" data-id="${pl.id}">
      <div class="playlist-card-art">&#x1f3b6;</div>
      <div class="playlist-card-name">${pl.name || 'Sans nom'}</div>
      <div class="playlist-card-count">${count} track${count !== 1 ? 's' : ''}</div>
      <button class="playlist-card-menu" data-id="${pl.id}" title="Options">&#x22EE;</button>
    </div>`;
  }).join('');

  // Card clicks
  grid.querySelectorAll('.playlist-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.playlist-card-menu')) return;
      openPlaylistDetail(parseInt(card.dataset.id));
    });
  });

  // Menu clicks (delete)
  grid.querySelectorAll('.playlist-card-menu').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const pl = playlistsData.find(p => p.id === id);
      const ok = await confirmModal('Supprimer la playlist ?', `"${pl?.name || 'Playlist'}" sera définitivement supprimée.`, { danger: true });
      if (!ok) return;
      try {
        if (window.cueforge?.api?.playlists?.delete) await window.cueforge.api.playlists.delete(id);
        else if (window.cueforge?.data?.playlists?.delete) await window.cueforge.data.playlists.delete(id);
        toast('Playlist supprimée', 'success');
        initPlaylists();
      } catch (e) { toast('Erreur lors de la suppression', 'error'); }
    });
  });
}

async function openPlaylistDetail(id) {
  currentPlaylistId = id;
  const grid = document.getElementById('playlistsGrid');
  const detail = document.getElementById('playlistDetailView');
  const createForm = document.getElementById('playlistCreateForm');
  const empty = document.getElementById('playlistsEmpty');
  if (grid) grid.style.display = 'none';
  if (createForm) createForm.classList.remove('show');
  if (empty) empty.style.display = 'none';
  detail.classList.add('active');
  showLoading(detail, 'Chargement de la playlist…');

  let playlist = playlistsData.find(p => p.id === id);
  try {
    if (window.cueforge?.api?.playlists?.get) {
      const r = await window.cueforge.api.playlists.get(id);
      playlist = r?.data || r || playlist;
    }
  } catch (e) { /* use cached */ }

  const tracks = playlist?.tracks || [];
  detail.innerHTML = `
    <div class="playlist-detail-header">
      <button class="playlist-back-btn" id="playlistBackBtn">&#x2190;</button>
      <div class="playlist-detail-name">${playlist?.name || 'Playlist'}</div>
      <div class="playlist-track-count">${tracks.length} track${tracks.length !== 1 ? 's' : ''}</div>
    </div>
    ${tracks.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-muted)">Aucun track dans cette playlist.<br>Ajoute des tracks via le menu contextuel.</div>' :
    tracks.map((t, i) => `<div class="crate-track-row">
      <div class="crate-track-icon" style="background:${getKeyColor(t.camelot||t.key_name)}">${i+1}</div>
      <div class="crate-track-title">${t.title || t.filename || 'Sans titre'}</div>
      <div class="crate-track-artist">${t.artist || '—'}</div>
      <div class="crate-track-bpm">${t.bpm ? Math.round(t.bpm) : '—'}</div>
      ${t.camelot || t.key_name ? `<span class="crate-track-key" style="background:${getKeyColor(t.camelot||t.key_name)}">${t.camelot||t.key_name}</span>` : ''}
    </div>`).join('')}`;

  detail.classList.add('active');
  document.getElementById('playlistBackBtn')?.addEventListener('click', () => {
    detail.classList.remove('active');
    renderPlaylistsGrid();
  });
}

function setupPlaylistEvents() {
  // New playlist button (in page header)
  const newBtn = document.getElementById('newPlaylistPageBtn');
  const form = document.getElementById('playlistCreateForm');
  const input = document.getElementById('playlistCreateInput');
  const okBtn = document.getElementById('playlistCreateOk');
  const cancelBtn = document.getElementById('playlistCreateCancel');
  const emptyBtn = document.getElementById('playlistsEmptyBtn');

  const showForm = () => { form?.classList.add('show'); input?.focus(); };
  newBtn?.addEventListener('click', showForm);
  emptyBtn?.addEventListener('click', showForm);
  cancelBtn?.addEventListener('click', () => { form?.classList.remove('show'); if (input) input.value = ''; });

  const createPlaylist = async () => {
    const name = input?.value?.trim();
    if (!name) return;
    try {
      if (window.cueforge?.api?.playlists?.create) await window.cueforge.api.playlists.create({ name });
      else if (window.cueforge?.data?.playlists?.create) await window.cueforge.data.playlists.create(name);
      toast('Playlist créée', 'success');
      if (input) input.value = '';
      form?.classList.remove('show');
      initPlaylists();
    } catch (e) { toast('Erreur création', 'error'); }
  };
  okBtn?.addEventListener('click', createPlaylist);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createPlaylist();
    if (e.key === 'Escape') cancelBtn?.click();
  });
}


// ═══════════════════════════════════════════════════════════════════════
// 3. SMART CRATES
// ═══════════════════════════════════════════════════════════════════════

let cratesData = [];
let crateRules = [];

async function initCrates() {
  const list = document.getElementById('cratesList');
  showSkeleton(list, 3);
  try {
    if (window.cueforge?.api?.crates?.list) {
      const r = await window.cueforge.api.crates.list();
      cratesData = r?.data || r || [];
    }
  } catch (e) {
    console.warn('initCrates:', e);
    toast('Impossible de charger les Smart Crates', 'error');
    cratesData = [];
  }
  renderCratesList();
  setupCrateEvents();
}

function renderCratesList() {
  const list = document.getElementById('cratesList');
  const empty = document.getElementById('cratesEmpty');
  if (!cratesData.length) {
    if (list) list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  list.innerHTML = cratesData.map((c, i) => {
    const color = CRATE_COLORS[i % CRATE_COLORS.length];
    const rules = c.rules || [];
    const trackCount = c.track_count ?? c.tracks?.length ?? '?';
    const ruleTags = rules.map(r => {
      return `<span class="crate-rule-tag" style="background:${color}25;color:${color}">${r.field} ${r.operator} ${r.value}${r.value2 ? '–'+r.value2 : ''}</span>`;
    }).join('');

    return `<div class="crate-card" data-id="${c.id}">
      <div class="crate-card-header" data-id="${c.id}">
        <div class="crate-color-dot" style="background:${color}"></div>
        <div class="crate-card-name">${c.name || 'Sans nom'}</div>
        <div class="crate-card-meta">
          <span>${trackCount} tracks</span>
          <span>${rules.length} règle${rules.length !== 1 ? 's' : ''}</span>
        </div>
        <button class="crate-card-delete" data-id="${c.id}" title="Supprimer">&#x1f5d1;</button>
        <span class="crate-card-chevron">&#x25BE;</span>
      </div>
      ${ruleTags ? `<div class="crate-rule-tags">${ruleTags}</div>` : ''}
      <div class="crate-card-body" id="crateBody${c.id}">
        <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Clique pour charger les tracks…</div>
      </div>
    </div>`;
  }).join('');

  // Expand/collapse
  list.querySelectorAll('.crate-card-header').forEach(header => {
    header.addEventListener('click', async (e) => {
      if (e.target.closest('.crate-card-delete')) return;
      const card = header.closest('.crate-card');
      const wasExpanded = card.classList.contains('expanded');
      card.classList.toggle('expanded');
      if (!wasExpanded) await loadCrateTracks(parseInt(header.dataset.id));
    });
  });

  // Delete
  list.querySelectorAll('.crate-card-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const crate = cratesData.find(c => c.id === id);
      const ok = await confirmModal('Supprimer ce Smart Crate ?', `"${crate?.name || 'Crate'}" et ses règles seront supprimés.`, { danger: true });
      if (!ok) return;
      try {
        if (window.cueforge?.api?.crates?.delete) await window.cueforge.api.crates.delete(id);
        toast('Smart Crate supprimé', 'success');
        initCrates();
      } catch (e) { toast('Erreur lors de la suppression', 'error'); }
    });
  });
}

async function loadCrateTracks(crateId) {
  const body = document.getElementById('crateBody' + crateId);
  if (!body) return;
  showLoading(body, 'Chargement des tracks…');
  try {
    let crate;
    if (window.cueforge?.api?.crates?.get) {
      const r = await window.cueforge.api.crates.get(crateId);
      crate = r?.data || r;
    }
    const tracks = crate?.tracks || [];
    if (!tracks.length) {
      body.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Aucun track ne correspond aux règles</div>';
      return;
    }
    const color = CRATE_COLORS[(cratesData.findIndex(c => c.id === crateId)) % CRATE_COLORS.length];
    body.innerHTML = tracks.slice(0, 20).map((t, i) => `<div class="crate-track-row">
      <div class="crate-track-icon" style="background:${color}30;color:${color}">${i+1}</div>
      <div class="crate-track-title">${t.title || t.filename || 'Sans titre'}</div>
      <div class="crate-track-artist">${t.artist || '—'}</div>
      <div class="crate-track-bpm">${t.bpm ? Math.round(t.bpm) : '—'}</div>
      ${t.camelot||t.key_name ? `<span class="crate-track-key" style="background:${getKeyColor(t.camelot||t.key_name)}">${t.camelot||t.key_name}</span>` : ''}
    </div>`).join('');
  } catch (e) {
    body.innerHTML = '<div style="text-align:center;padding:16px;color:#ef4444;font-size:12px">Erreur chargement</div>';
  }
}

function setupCrateEvents() {
  const newBtn = document.getElementById('newCratePageBtn');
  const emptyBtn = document.getElementById('cratesEmptyBtn');
  const addCrateBtn = document.getElementById('addCrateBtn');
  const form = document.getElementById('crateCreateForm');
  const cancelBtn = document.getElementById('crateCreateCancel');
  const okBtn = document.getElementById('crateCreateOk');
  const addRuleBtn = document.getElementById('addRuleBtn');

  crateRules = [{ field: 'bpm', operator: 'between', value: '120', value2: '130' }];

  const showForm = () => { form?.classList.add('show'); renderRules(); };
  newBtn?.addEventListener('click', showForm);
  emptyBtn?.addEventListener('click', showForm);
  addCrateBtn?.addEventListener('click', showForm);
  cancelBtn?.addEventListener('click', () => { form?.classList.remove('show'); crateRules = []; });
  addRuleBtn?.addEventListener('click', () => {
    crateRules.push({ field: 'bpm', operator: '=', value: '' });
    renderRules();
  });

  okBtn?.addEventListener('click', async () => {
    const name = document.getElementById('crateNameInput')?.value?.trim();
    if (!name) return toast('Nom requis', 'error');
    if (!crateRules.length) return toast('Ajoute au moins une règle', 'error');
    try {
      if (window.cueforge?.api?.crates?.create) {
        await window.cueforge.api.crates.create({ name, rules: crateRules, match_mode: 'all' });
      }
      toast('Smart Crate créé', 'success');
      form?.classList.remove('show');
      document.getElementById('crateNameInput').value = '';
      crateRules = [];
      initCrates();
    } catch (e) { toast('Erreur création crate', 'error'); }
  });
}

function renderRules() {
  const container = document.getElementById('crateRulesContainer');
  if (!container) return;
  container.innerHTML = crateRules.map((r, i) => {
    const fields = ['bpm','energy','genre','artist','key','year','rating'].map(f =>
      `<option value="${f}" ${r.field===f?'selected':''}>${f.charAt(0).toUpperCase()+f.slice(1)}</option>`
    ).join('');
    const numField = ['bpm','energy','year','rating'].includes(r.field);
    const ops = numField
      ? ['=','>','>=','<','<=','between'].map(o => `<option value="${o}" ${r.operator===o?'selected':''}>${o}</option>`).join('')
      : ['=','contains','starts_with'].map(o => `<option value="${o}" ${r.operator===o?'selected':''}>${o}</option>`).join('');

    const valInput = r.operator === 'between'
      ? `<input type="number" value="${r.value||''}" data-idx="${i}" data-prop="value" placeholder="Min">
         <span style="color:var(--text-muted)">—</span>
         <input type="number" value="${r.value2||''}" data-idx="${i}" data-prop="value2" placeholder="Max">`
      : numField
        ? `<input type="number" value="${r.value||''}" data-idx="${i}" data-prop="value" placeholder="Valeur">`
        : `<input type="text" value="${r.value||''}" data-idx="${i}" data-prop="value" placeholder="Valeur">`;

    return `<div class="rule-row">
      <select data-idx="${i}" data-prop="field">${fields}</select>
      <select data-idx="${i}" data-prop="operator">${ops}</select>
      ${valInput}
      <button class="rule-delete-btn" data-idx="${i}">&#x2715;</button>
    </div>`;
  }).join('');

  // Bind events
  container.querySelectorAll('select, input').forEach(el => {
    const handler = () => {
      const idx = parseInt(el.dataset.idx);
      const prop = el.dataset.prop;
      crateRules[idx][prop] = el.value;
      if (prop === 'field' || prop === 'operator') renderRules(); // re-render for operator change
    };
    el.addEventListener('change', handler);
    if (el.tagName === 'INPUT') el.addEventListener('input', handler);
  });
  container.querySelectorAll('.rule-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      crateRules.splice(parseInt(btn.dataset.idx), 1);
      renderRules();
    });
  });
}


// ═══════════════════════════════════════════════════════════════════════
// 4. GIG PREP
// ═══════════════════════════════════════════════════════════════════════

let gigs = [];
let currentGigIdx = -1;

const DEFAULT_CHECKLIST = [
  { cat: '🎛️ Matériel', items: ['Casque DJ','Clés USB (x2)','Câbles RCA / Jack','Laptop + chargeur','Contrôleur / platines'] },
  { cat: '🎵 Musique', items: ['Préparer la playlist principale','Tracks de backup','Jingles / transitions','Vérifier les cue points'] },
  { cat: '🚗 Logistique', items: ['Confirmer l\'heure d\'arrivée','Vérifier l\'adresse','Transport du matériel','Repérer la cabine DJ'] },
  { cat: '🎧 Sur place', items: ['Soundcheck','Tester le monitoring','Régler les gains','Préparer le premier track'] },
];

function initGigPrep() {
  // Load from localStorage
  try { gigs = JSON.parse(localStorage.getItem('cueforge_gigs') || '[]'); } catch { gigs = []; }
  if (gigs.length > 0 && currentGigIdx < 0) currentGigIdx = 0;
  renderGigPrep();
}

function saveGigs() {
  localStorage.setItem('cueforge_gigs', JSON.stringify(gigs));
}

function renderGigPrep() {
  const tabsEl = document.getElementById('gigTabs');
  const content = document.getElementById('gigContent');
  const empty = document.getElementById('gigEmpty');

  if (!gigs.length) {
    if (tabsEl) tabsEl.innerHTML = '';
    if (empty) empty.style.display = '';
    // Hide active gig content
    const cards = content?.querySelectorAll('.gig-progress-card, .gig-info-card, .gig-checklist-card');
    cards?.forEach(c => c.remove());
    return;
  }
  if (empty) empty.style.display = 'none';

  // Tabs
  tabsEl.innerHTML = gigs.map((g, i) => {
    const checked = g.checklist.reduce((sum, cat) => sum + cat.items.filter(it => it.checked).length, 0);
    const total = g.checklist.reduce((sum, cat) => sum + cat.items.length, 0);
    return `<button class="gig-tab ${i === currentGigIdx ? 'active' : ''}" data-idx="${i}">
      <div class="gig-tab-name">${g.name || 'Gig'}</div>
      <div class="gig-tab-meta">${g.date || '—'} · ${checked}/${total}</div>
    </button>`;
  }).join('');
  tabsEl.querySelectorAll('.gig-tab').forEach(tab => {
    tab.onclick = () => { currentGigIdx = parseInt(tab.dataset.idx); renderGigPrep(); };
  });

  const gig = gigs[currentGigIdx];
  if (!gig) return;

  const checked = gig.checklist.reduce((sum, cat) => sum + cat.items.filter(it => it.checked).length, 0);
  const total = gig.checklist.reduce((sum, cat) => sum + cat.items.length, 0);
  const pct = total > 0 ? Math.round(checked / total * 100) : 0;
  let progressColor = 'linear-gradient(90deg,#7c3aed,#ec4899)';
  if (pct >= 100) progressColor = 'linear-gradient(90deg,#22c55e,#34d399)';
  else if (pct >= 75) progressColor = 'linear-gradient(90deg,#3b82f6,#60a5fa)';
  else if (pct >= 50) progressColor = 'linear-gradient(90deg,#f59e0b,#fbbf24)';

  // Remove previous dynamic content
  content.querySelectorAll('.gig-dynamic').forEach(c => c.remove());

  // Progress
  const progressHtml = `<div class="gig-progress-card gig-dynamic">
    <div class="gig-progress-title"><span>Progression</span><span class="gig-progress-pct" style="color:${pct >= 100 ? '#34d399' : 'var(--text-primary)'}">${pct}%</span></div>
    <div class="gig-progress-bar"><div class="gig-progress-fill" style="width:${pct}%;background:${progressColor}"></div></div>
    ${pct >= 100 ? '<p style="text-align:center;margin-top:8px;font-size:12px;color:#34d399">&#x2705; Prêt pour le gig !</p>' : ''}
  </div>`;

  // Info form
  const infoHtml = `<div class="gig-info-card gig-dynamic">
    <div class="gig-form-grid">
      <div class="gig-field"><label>Nom du gig</label><input type="text" value="${gig.name||''}" data-field="name"></div>
      <div class="gig-field"><label>Lieu</label><input type="text" value="${gig.venue||''}" data-field="venue"></div>
      <div class="gig-field"><label>Date</label><input type="date" value="${gig.date||''}" data-field="date"></div>
      <div class="gig-field"><label>Heure</label><input type="time" value="${gig.time||''}" data-field="time"></div>
    </div>
  </div>`;

  // Checklist
  let checklistHtml = '';
  gig.checklist.forEach((cat, ci) => {
    const catChecked = cat.items.filter(it => it.checked).length;
    const catTotal = cat.items.length;
    const allDone = catChecked === catTotal && catTotal > 0;
    checklistHtml += `<div class="gig-checklist-card gig-dynamic">
      <div class="gig-category-header expanded" data-cat="${ci}">
        <span class="gig-category-emoji">${cat.cat.split(' ')[0]}</span>
        <span class="gig-category-name">${cat.cat.split(' ').slice(1).join(' ')}</span>
        <span class="gig-category-badge ${allDone?'complete':''}">${catChecked}/${catTotal}</span>
        <span class="gig-category-chevron">&#x25B4;</span>
      </div>
      <div class="gig-category-items" style="display:block">
        ${cat.items.map((it, ii) => `<div class="gig-check-item ${it.checked?'checked':''}">
          <button class="gig-check-btn ${it.checked?'checked':''}" data-cat="${ci}" data-item="${ii}">${it.checked?'✓':''}</button>
          <span class="gig-check-label">${it.label || it}</span>
          <button class="gig-check-delete" data-cat="${ci}" data-item="${ii}">&#x2715;</button>
        </div>`).join('')}
        <button class="gig-add-item-btn" data-cat="${ci}">+ Ajouter un élément</button>
      </div>
    </div>`;
  });

  // Insert after empty (or at start of gigContent)
  const frag = document.createElement('div');
  frag.innerHTML = progressHtml + infoHtml + checklistHtml;
  Array.from(frag.children).forEach(child => content.appendChild(child));

  // Bind info form
  content.querySelectorAll('.gig-info-card input, .gig-info-card select').forEach(el => {
    el.addEventListener('change', () => {
      gig[el.dataset.field] = el.value;
      saveGigs();
      // Update tab
      renderGigPrep();
    });
  });

  // Bind checklist toggles
  content.querySelectorAll('.gig-check-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci = parseInt(btn.dataset.cat), ii = parseInt(btn.dataset.item);
      gig.checklist[ci].items[ii].checked = !gig.checklist[ci].items[ii].checked;
      saveGigs();
      renderGigPrep();
    });
  });

  // Bind delete checklist item
  content.querySelectorAll('.gig-check-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci = parseInt(btn.dataset.cat), ii = parseInt(btn.dataset.item);
      gig.checklist[ci].items.splice(ii, 1);
      saveGigs();
      renderGigPrep();
    });
  });

  // Bind add item
  content.querySelectorAll('.gig-add-item-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ci = parseInt(btn.dataset.cat);
      const catName = gig.checklist[ci].cat.split(' ').slice(1).join(' ');
      const label = await promptModal('Ajouter un élément', `Nouvel élément dans "${catName}"`, 'Ex: Vérifier les câbles…');
      if (!label) return;
      gig.checklist[ci].items.push({ label, checked: false });
      saveGigs();
      renderGigPrep();
    });
  });

  // Bind category collapse
  content.querySelectorAll('.gig-category-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.gig-add-item-btn')) return;
      header.classList.toggle('expanded');
      const items = header.nextElementSibling;
      if (items) items.style.display = header.classList.contains('expanded') ? 'block' : 'none';
    });
  });
}

function setupGigPrepEvents() {
  const createGig = async () => {
    const name = await promptModal('Nouveau Gig', 'Donne un nom à ton gig', 'Ex: Warehouse Party, Club XYZ…');
    if (!name) return;
    gigs.push({
      name,
      venue: '', date: '', time: '',
      checklist: DEFAULT_CHECKLIST.map(c => ({
        cat: c.cat,
        items: c.items.map(label => ({ label, checked: false }))
      }))
    });
    currentGigIdx = gigs.length - 1;
    saveGigs();
    renderGigPrep();
  };
  document.getElementById('newGigBtn')?.addEventListener('click', createGig);
  document.getElementById('gigEmptyBtn')?.addEventListener('click', createGig);
}
// Init gig events on DOMContentLoaded
document.addEventListener('DOMContentLoaded', setupGigPrepEvents);


// ═══════════════════════════════════════════════════════════════════════
// 5. DJ TOOLS
// ═══════════════════════════════════════════════════════════════════════

let toolsInitialized = false;

async function initTools() {
  if (toolsInitialized) return;
  toolsInitialized = true;
  initBpmTap();
  initCrateDigger();
  initQuickNotes();
  initHarmonicWheel();
  initEnergyFlow();
}

// ── BPM Tap Tempo ──────────────────────────────────────────
let bpmTaps = [];
let bpmResetTimer = null;

function initBpmTap() {
  const btn = document.getElementById('bpmTapBtn');
  const valueEl = document.getElementById('bpmValue');
  const labelEl = document.getElementById('bpmTapLabel');
  const countEl = document.getElementById('bpmTapCount');
  const halfEl = document.getElementById('bpmHalf');
  const normalEl = document.getElementById('bpmNormal');
  const doubleEl = document.getElementById('bpmDouble');
  const copyBtn = document.getElementById('bpmCopyBtn');
  const resetBtn = document.getElementById('bpmResetBtn');

  function tap() {
    const now = performance.now();
    bpmTaps.push(now);
    if (bpmTaps.length > 16) bpmTaps.shift();
    btn?.classList.add('active');
    setTimeout(() => btn?.classList.remove('active'), 100);

    clearTimeout(bpmResetTimer);
    bpmResetTimer = setTimeout(() => { bpmTaps = []; updateBpmDisplay(); }, 3000);

    updateBpmDisplay();
  }

  function updateBpmDisplay() {
    if (bpmTaps.length < 2) {
      if (valueEl) valueEl.textContent = 'TAP';
      if (labelEl) labelEl.textContent = `${bpmTaps.length} tap${bpmTaps.length !== 1 ? 's' : ''}`;
      if (countEl) countEl.textContent = `${bpmTaps.length} taps`;
      if (halfEl) halfEl.textContent = '—';
      if (normalEl) normalEl.textContent = '—';
      if (doubleEl) doubleEl.textContent = '—';
      return;
    }
    const intervals = [];
    for (let i = 1; i < bpmTaps.length; i++) intervals.push(bpmTaps[i] - bpmTaps[i-1]);
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avgInterval * 10) / 10;

    if (valueEl) valueEl.textContent = bpm.toFixed(1);
    if (labelEl) labelEl.textContent = 'BPM';
    if (countEl) countEl.textContent = `${bpmTaps.length} taps`;
    if (halfEl) halfEl.textContent = (bpm / 2).toFixed(1);
    if (normalEl) normalEl.textContent = bpm.toFixed(1);
    if (doubleEl) doubleEl.textContent = (bpm * 2).toFixed(1);
  }

  btn?.addEventListener('click', tap);
  window.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T') {
      // Only if tools page is active
      if (document.getElementById('viewTools')?.classList.contains('active')) tap();
    }
  });

  copyBtn?.addEventListener('click', () => {
    const v = valueEl?.textContent;
    if (v && v !== 'TAP') {
      navigator.clipboard?.writeText(v);
      toast('BPM copié !', 'success');
    }
  });

  resetBtn?.addEventListener('click', () => {
    bpmTaps = [];
    updateBpmDisplay();
  });
}

// ── Crate Digger ───────────────────────────────────────────
let digMode = 'random';
let digCountVal = 0;

function initCrateDigger() {
  const modes = document.getElementById('diggerModes');
  modes?.querySelectorAll('.digger-mode').forEach(m => {
    m.addEventListener('click', () => {
      modes.querySelectorAll('.digger-mode').forEach(b => b.classList.remove('active'));
      m.classList.add('active');
      digMode = m.dataset.mode;
    });
  });

  document.getElementById('digBtn')?.addEventListener('click', async () => {
    const tracks = await ensureTracks();
    if (!tracks.length) return toast('Aucun track à explorer', 'info');

    digCountVal++;
    document.getElementById('digCount').textContent = `${digCountVal} digs`;

    let suggestions = [];
    if (digMode === 'random') {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      suggestions = shuffled.slice(0, 5);
    } else if (digMode === 'energy') {
      const sorted = [...tracks].filter(t => t.energy != null).sort((a, b) => (a.energy||0) - (b.energy||0));
      const step = Math.max(1, Math.floor(sorted.length / 5));
      suggestions = [0, step, step*2, step*3, sorted.length-1].map(i => sorted[Math.min(i, sorted.length-1)]);
    } else if (digMode === 'genre') {
      const genres = [...new Set(tracks.map(t => t.genre).filter(Boolean))];
      const picked = genres.sort(() => Math.random() - 0.5).slice(0, 5);
      suggestions = picked.map(g => tracks.filter(t => t.genre === g).sort(() => Math.random() - 0.5)[0]).filter(Boolean);
    } else { // gems — low play count or least recent
      const sorted = [...tracks].sort((a, b) => (a.play_count||0) - (b.play_count||0));
      suggestions = sorted.slice(0, 5);
    }

    const resultsEl = document.getElementById('diggerResults');
    resultsEl.innerHTML = suggestions.map((t, i) => `<div class="digger-item">
      <div class="digger-num">${i+1}</div>
      <div class="digger-item-info">
        <div class="digger-item-title">${t.title || t.filename || 'Sans titre'}</div>
        <div class="digger-item-meta">${t.artist || '—'} · ${t.bpm ? Math.round(t.bpm)+' BPM' : ''} · ${t.camelot||t.key_name||''}</div>
      </div>
      ${t.energy != null ? `<div class="digger-energy-bar"><div class="digger-energy-fill" style="width:${t.energy}%"></div></div>` : ''}
    </div>`).join('');
  });
}

// ── Quick Notes ────────────────────────────────────────────
let notes = [];
let noteColor = '#eab308';

function initQuickNotes() {
  try { notes = JSON.parse(localStorage.getItem('cueforge_notes') || '[]'); } catch { notes = []; }
  updateNotesCount();
  renderNotes();

  document.getElementById('noteColors')?.querySelectorAll('.notes-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.notes-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      noteColor = btn.dataset.color;
    });
  });

  const addNote = () => {
    const input = document.getElementById('noteInput');
    const text = input?.value?.trim();
    if (!text) return;
    notes.unshift({ text, color: noteColor, time: Date.now(), pinned: false });
    localStorage.setItem('cueforge_notes', JSON.stringify(notes));
    input.value = '';
    updateNotesCount();
    renderNotes();
  };

  document.getElementById('noteAddBtn')?.addEventListener('click', addNote);
  document.getElementById('noteInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNote();
  });
}

function updateNotesCount() {
  const el = document.getElementById('notesCount');
  if (el) el.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
}

function renderNotes() {
  const list = document.getElementById('notesList');
  if (!list) return;
  const sorted = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.time - a.time);
  list.innerHTML = sorted.map((n, i) => {
    const ago = formatTimeAgo(n.time);
    return `<div class="note-item" style="border-left-color:${n.color}">
      <div class="note-text">${n.text}</div>
      <div class="note-time">${ago}</div>
      <button class="note-delete" data-idx="${notes.indexOf(n)}">&#x2715;</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.note-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      notes.splice(parseInt(btn.dataset.idx), 1);
      localStorage.setItem('cueforge_notes', JSON.stringify(notes));
      updateNotesCount();
      renderNotes();
    });
  });
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'à l\'instant';
  if (diff < 3600000) return `il y a ${Math.floor(diff/60000)} min`;
  if (diff < 86400000) return `il y a ${Math.floor(diff/3600000)}h`;
  return new Date(ts).toLocaleDateString('fr-FR');
}

// ── Harmonic Wheel ─────────────────────────────────────────

const CAMELOT_KEYS = [
  { num: 1, minor: 'Abm', major: 'B' },
  { num: 2, minor: 'Ebm', major: 'F#' },
  { num: 3, minor: 'Bbm', major: 'Db' },
  { num: 4, minor: 'Fm', major: 'Ab' },
  { num: 5, minor: 'Cm', major: 'Eb' },
  { num: 6, minor: 'Gm', major: 'Bb' },
  { num: 7, minor: 'Dm', major: 'F' },
  { num: 8, minor: 'Am', major: 'C' },
  { num: 9, minor: 'Em', major: 'G' },
  { num: 10, minor: 'Bm', major: 'D' },
  { num: 11, minor: 'F#m', major: 'A' },
  { num: 12, minor: 'Dbm', major: 'E' },
];

const WHEEL_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4',
  '#3b82f6','#6366f1','#8b5cf6','#a855f7','#ec4899','#f43f5e'
];

let selectedWheelKey = null;

function initHarmonicWheel() {
  drawWheel();
}

function drawWheel() {
  const svg = document.getElementById('harmonicWheelSvg');
  if (!svg) return;
  const cx = 150, cy = 150;
  const outerR = 140, innerR = 90, centerR = 50;
  const segments = 12;
  const angleStep = (2 * Math.PI) / segments;

  let paths = '';
  CAMELOT_KEYS.forEach((key, i) => {
    const startAngle = i * angleStep - Math.PI / 2;
    const endAngle = startAngle + angleStep;
    const color = WHEEL_COLORS[i];

    // Outer ring (Major - B)
    const outerPath = describeArc(cx, cy, innerR, outerR, startAngle, endAngle);
    const outerCode = `${key.num}B`;
    const outerSelected = selectedWheelKey === outerCode;
    paths += `<path d="${outerPath}" fill="${color}" opacity="${outerSelected ? 1 : 0.6}"
      stroke="${outerSelected ? 'white' : 'var(--bg-primary)'}" stroke-width="${outerSelected ? 2 : 1}"
      style="cursor:pointer" data-key="${outerCode}"/>`;

    // Inner ring (Minor - A)
    const innerPath = describeArc(cx, cy, centerR, innerR, startAngle, endAngle);
    const innerCode = `${key.num}A`;
    const innerSelected = selectedWheelKey === innerCode;
    paths += `<path d="${innerPath}" fill="${color}" opacity="${innerSelected ? 1 : 0.45}"
      stroke="${innerSelected ? 'white' : 'var(--bg-primary)'}" stroke-width="${innerSelected ? 2 : 1}"
      style="cursor:pointer" data-key="${innerCode}"/>`;

    // Labels
    const midAngle = startAngle + angleStep / 2;
    const outerLabelR = (innerR + outerR) / 2;
    const innerLabelR = (centerR + innerR) / 2;
    const outerX = cx + outerLabelR * Math.cos(midAngle);
    const outerY = cy + outerLabelR * Math.sin(midAngle);
    const innerX = cx + innerLabelR * Math.cos(midAngle);
    const innerY = cy + innerLabelR * Math.sin(midAngle);

    paths += `<text x="${outerX}" y="${outerY}" text-anchor="middle" dominant-baseline="central"
      fill="white" font-size="9" font-weight="700" font-family="var(--font-mono)" pointer-events="none">${outerCode}</text>`;
    paths += `<text x="${innerX}" y="${innerY}" text-anchor="middle" dominant-baseline="central"
      fill="white" font-size="8" font-weight="600" font-family="var(--font-mono)" pointer-events="none">${innerCode}</text>`;
  });

  // Center circle
  paths += `<circle cx="${cx}" cy="${cy}" r="${centerR}" fill="var(--bg-card)" stroke="var(--border-subtle)" stroke-width="1"/>`;
  paths += `<text x="${cx}" y="${cy-6}" text-anchor="middle" fill="var(--text-primary)" font-size="11" font-weight="700">Camelot</text>`;
  paths += `<text x="${cx}" y="${cy+8}" text-anchor="middle" fill="var(--text-muted)" font-size="8">Wheel</text>`;

  svg.innerHTML = paths;

  // Click handlers
  svg.querySelectorAll('path[data-key]').forEach(path => {
    path.addEventListener('click', () => {
      selectedWheelKey = selectedWheelKey === path.dataset.key ? null : path.dataset.key;
      drawWheel();
      updateWheelInfo();
    });
  });
}

function describeArc(cx, cy, innerR, outerR, startAngle, endAngle) {
  const x1 = cx + outerR * Math.cos(startAngle);
  const y1 = cy + outerR * Math.sin(startAngle);
  const x2 = cx + outerR * Math.cos(endAngle);
  const y2 = cy + outerR * Math.sin(endAngle);
  const x3 = cx + innerR * Math.cos(endAngle);
  const y3 = cy + innerR * Math.sin(endAngle);
  const x4 = cx + innerR * Math.cos(startAngle);
  const y4 = cy + innerR * Math.sin(startAngle);
  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`;
}

function updateWheelInfo() {
  const badge = document.getElementById('wheelKeyBadge');
  const info = document.getElementById('wheelInfo');
  if (selectedWheelKey) {
    if (badge) badge.innerHTML = `<span class="wheel-key-badge">${selectedWheelKey}</span>`;
    // Find compatible keys
    const num = parseInt(selectedWheelKey);
    const letter = selectedWheelKey.slice(-1);
    const compat = [];
    compat.push(`${num}${letter}`); // Same
    compat.push(`${((num) % 12) + 1}${letter}`); // +1
    compat.push(`${((num - 2 + 12) % 12) + 1}${letter}`); // -1
    compat.push(`${num}${letter === 'A' ? 'B' : 'A'}`); // Switch mode
    if (info) info.innerHTML = `<p style="font-size:12px;color:var(--text-secondary)">Compatible: <b style="color:var(--text-primary)">${compat.join(', ')}</b></p>`;
  } else {
    if (badge) badge.innerHTML = '';
    if (info) info.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">Clique sur une section pour voir les tonalités compatibles</p>';
  }
}

// ── Energy Flow ────────────────────────────────────────────

async function initEnergyFlow() {
  const tracks = await ensureTracks();
  const withEnergy = tracks.filter(t => t.energy != null).slice(0, 30);
  document.getElementById('energyTrackCount').textContent = `${withEnergy.length} tracks`;

  if (!withEnergy.length) return;

  const svg = document.getElementById('energyFlowSvg');
  if (!svg) return;

  const W = 800, H = 180, padL = 40, padR = 10, padT = 10, padB = 25;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const barW = Math.min(30, (plotW / withEnergy.length) * 0.7);
  const gap = (plotW - barW * withEnergy.length) / (withEnergy.length + 1);

  let svgContent = '';

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (i / 4) * plotH;
    svgContent += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="var(--border-subtle)" stroke-width="0.5"/>`;
    svgContent += `<text x="${padL-5}" y="${y+3}" text-anchor="end" fill="var(--text-muted)" font-size="8">${i*25}%</text>`;
  }

  // Bars
  const points = [];
  withEnergy.forEach((t, i) => {
    const energy = t.energy || 0;
    const barH = (energy / 100) * plotH;
    const x = padL + gap + i * (barW + gap);
    const y = padT + plotH - barH;
    const color = getEnergyColor(energy);

    svgContent += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${color}" opacity="0.8"/>`;
    points.push({ x: x + barW / 2, y });

    // X label (every other)
    if (i % 2 === 0 || withEnergy.length < 15) {
      svgContent += `<text x="${x + barW/2}" y="${H-5}" text-anchor="middle" fill="var(--text-muted)" font-size="7">${i+1}</text>`;
    }
  });

  // Flow line
  if (points.length > 1) {
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    svgContent += `<path d="${linePath}" fill="none" stroke="var(--text-primary)" stroke-width="1.5" opacity="0.5"/>`;
  }

  svg.innerHTML = svgContent;

  // Stats
  const energies = withEnergy.map(t => t.energy || 0);
  const avg = Math.round(energies.reduce((a, b) => a + b, 0) / energies.length);
  let maxBuild = 0, maxDrop = 0;
  for (let i = 1; i < energies.length; i++) {
    const diff = energies[i] - energies[i-1];
    if (diff > maxBuild) maxBuild = diff;
    if (-diff > maxDrop) maxDrop = -diff;
  }
  document.getElementById('energyAvg').textContent = `${avg}%`;
  document.getElementById('energyMaxBuild').textContent = `+${maxBuild}`;
  document.getElementById('energyMaxDrop').textContent = `-${maxDrop}`;
}


// ═══════════════════════════════════════════════════════════════════════
// SYNC INDICATOR
// ═══════════════════════════════════════════════════════════════════════

async function initSyncIndicator() {
  const indicator = document.getElementById('syncIndicator');
  const label = document.getElementById('syncLabel');
  const icon = document.getElementById('syncIcon');
  const btn = document.getElementById('syncBtn');

  async function checkStatus() {
    try {
      if (window.cueforge?.data?.isOnline) {
        const online = await window.cueforge.data.isOnline();
        indicator.className = 'sync-indicator ' + (online ? 'online' : 'offline');
        label.textContent = online ? 'Connecté' : 'Hors ligne';
      }
    } catch { /* ignore */ }
  }

  btn?.addEventListener('click', async () => {
    btn.classList.add('spinning');
    label.textContent = 'Synchronisation…';
    indicator.className = 'sync-indicator syncing';
    try {
      if (window.cueforge?.data?.syncFull) await window.cueforge.data.syncFull();
      toast('Synchronisation terminée', 'success');
      _allTracks = []; // Reset cache
    } catch (e) {
      toast('Erreur de sync', 'error');
    }
    btn.classList.remove('spinning');
    checkStatus();
  });

  checkStatus();
  setInterval(checkStatus, 30000);
}

// ═══════════════════════════════════════════════════════════════════════
// SIDEBAR SMART CRATES & PLAYLISTS (dynamic sidebar items)
// ═══════════════════════════════════════════════════════════════════════

async function loadSidebarCrates() {
  try {
    let crates = [];
    if (window.cueforge?.api?.crates?.list) {
      const r = await window.cueforge.api.crates.list();
      crates = r?.data || r || [];
    }
    const container = document.getElementById('smartCrates');
    if (!container) return;
    container.innerHTML = crates.slice(0, 8).map((c, i) => {
      const color = CRATE_COLORS[i % CRATE_COLORS.length];
      return `<button class="crate-item" data-crate-id="${c.id}">
        <span class="crate-dot" style="background:${color}"></span>
        <span class="crate-label">${c.name || 'Crate'}</span>
      </button>`;
    }).join('');
  } catch { /* ignore */ }
}

async function loadSidebarPlaylists() {
  try {
    let playlists = [];
    if (window.cueforge?.api?.playlists?.list) {
      const r = await window.cueforge.api.playlists.list();
      playlists = r?.data || r || [];
    } else if (window.cueforge?.data?.playlists?.list) {
      const r = await window.cueforge.data.playlists.list();
      playlists = r?.data || r || [];
    }
    const container = document.getElementById('playlistsList');
    if (!container) return;
    container.innerHTML = playlists.map(pl => {
      const count = pl.track_count ?? pl.tracks?.length ?? 0;
      return `<div class="playlist-item" data-playlist-id="${pl.id}">
        <div class="playlist-left">
          <span class="playlist-icon">&#x1f3b6;</span>
          <span class="playlist-name">${pl.name || 'Playlist'}</span>
        </div>
        <div class="playlist-right">
          <span class="playlist-count">${count}</span>
        </div>
      </div>`;
    }).join('');

    // Click to navigate to playlists page and open detail
    container.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelector('[data-nav="playlists"]')?.click();
        setTimeout(() => openPlaylistDetail(parseInt(item.dataset.playlistId)), 200);
      });
    });
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════
// INIT ON APP READY
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Delay sidebar data load until after app shows
  setTimeout(() => {
    initSyncIndicator();
    loadSidebarCrates();
    loadSidebarPlaylists();
  }, 1500);
});
