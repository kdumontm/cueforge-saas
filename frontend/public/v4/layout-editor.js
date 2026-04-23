/*
 * CueForge Layout Editor (admin-only, local)
 * ────────────────────────────────────────────
 * Permet à Kevin de redimensionner / cacher / réordonner n'importe quel bloc
 * de n'importe quelle page v4, sans toucher au code.
 *
 * Activation :
 *   - Bouton flottant "✏️" en bas-droite (visible après Ctrl+Shift+E)
 *   - Ou ?edit=1 dans l'URL
 *
 * Stockage : localStorage (clé cf_layout_v1)
 *   → 100% local au navigateur de Kevin, les autres users voient
 *     toujours le layout par défaut.
 *
 * Les overrides sont appliqués au chargement de chaque page.
 */
(function(){
  'use strict';

  const LS_KEY       = 'cf_layout_v1';
  const TOGGLE_KEY   = 'cf_layout_editor_enabled';   // affiche/cache le bouton
  const MIN_W        = 80;
  const MIN_H        = 40;
  const SNAP         = 8;
  const PAGE_KEY     = location.pathname.replace(/\/+$/,'') || '/';

  // ── Storage ──────────────────────────────────────────────────────────
  function loadAll(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveAll(data){
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
    catch(e){ console.warn('[layout-editor] save failed', e); }
  }
  function getPageData(){
    const all = loadAll();
    return all[PAGE_KEY] || {};
  }
  function setPageData(pageData){
    const all = loadAll();
    if(Object.keys(pageData).length === 0) delete all[PAGE_KEY];
    else all[PAGE_KEY] = pageData;
    saveAll(all);
  }

  // ── Sélecteur unique par élément ─────────────────────────────────────
  // On essaie id, puis data-*, puis chemin CSS court.
  function selectorOf(el){
    if(!el || el === document.body || el === document.documentElement) return null;
    if(el.id) return '#' + CSS.escape(el.id);
    if(el.dataset && el.dataset.sec) return `[data-sec="${CSS.escape(el.dataset.sec)}"]`;
    // chemin : tag + classe significative + index parmi siblings
    const parts = [];
    let cur = el;
    while(cur && cur !== document.body && parts.length < 6){
      let part = cur.tagName.toLowerCase();
      if(cur.classList.length){
        const c = Array.from(cur.classList).find(x => !/^(reveal|reveal-\d+|active|open|hidden)$/.test(x));
        if(c) part += '.' + CSS.escape(c);
      }
      const p = cur.parentElement;
      if(p){
        const sibs = Array.from(p.children).filter(s => s.tagName === cur.tagName);
        if(sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur)+1})`;
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  // ── Application des overrides (toujours, admin ou pas) ───────────────
  // Ça marche uniquement dans le navigateur où c'est stocké → Kevin-only.
  function applyOverrides(){
    const data = getPageData();
    Object.entries(data).forEach(([sel, ov]) => {
      try {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          if(ov.hidden){ el.style.display = 'none'; return; }
          if(ov.w) el.style.width = ov.w + 'px';
          if(ov.h) el.style.height = ov.h + 'px';
          if(ov.w || ov.h){
            el.style.boxSizing = 'border-box';
            el.style.maxWidth = 'none';
          }
        });
      } catch(_){ /* sélecteur invalide → on ignore */ }
    });
  }

  // ── UI editor ────────────────────────────────────────────────────────
  let editorActive = false;
  let hovered = null;
  let selected = null;
  let toolbar = null;
  let btnFloat = null;

  // CSS injecté une fois
  function injectCSS(){
    if(document.getElementById('cf-le-css')) return;
    const s = document.createElement('style');
    s.id = 'cf-le-css';
    s.textContent = `
      .cf-le-btn{
        position:fixed;right:16px;bottom:76px;z-index:99998;
        width:44px;height:44px;border-radius:22px;
        background:linear-gradient(135deg,#ff7a18,#ff4d8d);
        color:#fff;border:none;cursor:pointer;
        box-shadow:0 6px 20px rgba(255,122,24,.45);
        font-size:18px;display:flex;align-items:center;justify-content:center;
        transition:transform .2s;
      }
      .cf-le-btn:hover{transform:scale(1.08)}
      .cf-le-btn.active{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 6px 20px rgba(34,197,94,.45)}

      body.cf-le-on *[data-cf-editable]{outline-offset:-2px}
      body.cf-le-on .cf-le-hover{outline:2px dashed rgba(255,122,24,.8) !important;outline-offset:-2px}
      body.cf-le-on .cf-le-selected{outline:2px solid #ff7a18 !important;outline-offset:-2px;box-shadow:0 0 0 4px rgba(255,122,24,.15)}

      .cf-le-resize-handle{
        position:absolute;right:-6px;bottom:-6px;width:16px;height:16px;
        background:#ff7a18;border:2px solid #fff;border-radius:50%;
        cursor:nwse-resize;z-index:99997;box-shadow:0 2px 8px rgba(0,0,0,.3);
      }

      .cf-le-toolbar{
        position:fixed;z-index:99999;background:rgba(18,16,24,.95);
        border:1px solid rgba(255,255,255,.12);border-radius:10px;
        padding:6px;display:flex;gap:4px;align-items:center;
        box-shadow:0 12px 40px rgba(0,0,0,.6);backdrop-filter:blur(12px);
        font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;
      }
      .cf-le-toolbar button{
        background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);
        color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;
        font-size:12px;font-weight:600;white-space:nowrap;
      }
      .cf-le-toolbar button:hover{background:rgba(255,122,24,.25);border-color:#ff7a18}
      .cf-le-toolbar button.danger:hover{background:rgba(239,68,68,.25);border-color:#ef4444}
      .cf-le-toolbar .cf-le-label{color:#ff7a18;font-weight:700;padding:0 8px;font-size:11px;font-family:ui-monospace,monospace;max-width:220px;overflow:hidden;text-overflow:ellipsis}
      .cf-le-toolbar .sep{width:1px;height:20px;background:rgba(255,255,255,.12);margin:0 2px}

      .cf-le-help{
        position:fixed;left:16px;bottom:16px;z-index:99998;
        background:rgba(18,16,24,.95);color:#fff;padding:12px 16px;
        border-radius:10px;border:1px solid rgba(255,255,255,.12);
        font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;
        box-shadow:0 12px 40px rgba(0,0,0,.6);max-width:340px;line-height:1.6;
      }
      .cf-le-help kbd{background:rgba(255,255,255,.1);padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace;font-size:11px}
      .cf-le-help .tt{color:#ff7a18;font-weight:700;margin-bottom:6px;display:block}

      .cf-le-toast{
        position:fixed;top:20px;right:20px;z-index:100000;
        background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);
        color:#22c55e;padding:10px 16px;border-radius:10px;
        font-family:-apple-system,sans-serif;font-size:13px;font-weight:600;
        box-shadow:0 6px 20px rgba(0,0,0,.3);backdrop-filter:blur(12px);
        animation:cfLeSlide .3s ease;
      }
      @keyframes cfLeSlide{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}

      /* Flash vert bref quand on save */
      .cf-le-saved{animation:cfLeFlash .6s ease}
      @keyframes cfLeFlash{0%,100%{outline-color:#ff7a18}50%{outline-color:#22c55e}}
    `;
    document.head.appendChild(s);
  }

  function toast(msg){
    const t = document.createElement('div');
    t.className = 'cf-le-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ── Marque comme éditable tout ce qui est "bloc" (carte, section, etc.) ─
  function markEditables(){
    const targets = document.querySelectorAll([
      'main > *',
      '.card',
      '.kpi',
      '.admin-wrap > *',
      '.admin-main > *',
      '.kpi-row > *',
      'section',
      '.workspace > *',
      '.canvas > *',
      '.rail',
      '.rail-list',
      '.thero',
      '.toolbar',
    ].join(','));
    targets.forEach(el => {
      // on skip les élements trop petits ou les toolbars éditeur
      if(el.closest('.cf-le-toolbar, .cf-le-btn, .cf-le-help, .cf-le-toast')) return;
      if(el.dataset.cfEditable) return;
      el.dataset.cfEditable = '1';
    });
  }

  function onMouseOver(e){
    if(!editorActive) return;
    const el = e.target.closest('[data-cf-editable]');
    if(!el || el === selected) return;
    if(hovered && hovered !== selected) hovered.classList.remove('cf-le-hover');
    hovered = el;
    hovered.classList.add('cf-le-hover');
  }
  function onMouseOut(e){
    if(!editorActive) return;
    if(hovered && hovered !== selected){
      hovered.classList.remove('cf-le-hover');
      hovered = null;
    }
  }
  function onClick(e){
    if(!editorActive) return;
    const el = e.target.closest('[data-cf-editable]');
    if(el && !e.target.closest('.cf-le-toolbar, .cf-le-btn')){
      e.preventDefault();
      e.stopPropagation();
      select(el);
    }
  }

  function select(el){
    // Deselect previous
    if(selected) selected.classList.remove('cf-le-selected');
    // Remove old handle
    document.querySelectorAll('.cf-le-resize-handle').forEach(h => h.remove());
    selected = el;
    selected.classList.add('cf-le-selected');
    if(getComputedStyle(selected).position === 'static') selected.style.position = 'relative';
    // Resize handle
    const h = document.createElement('div');
    h.className = 'cf-le-resize-handle';
    h.addEventListener('mousedown', startResize);
    selected.appendChild(h);
    showToolbar();
  }
  function deselect(){
    if(selected){
      selected.classList.remove('cf-le-selected');
      selected.querySelectorAll('.cf-le-resize-handle').forEach(h => h.remove());
      selected = null;
    }
    if(toolbar){ toolbar.remove(); toolbar = null; }
  }

  // ── Resize par drag coin bas-droit ───────────────────────────────────
  function startResize(e){
    if(!selected) return;
    e.preventDefault(); e.stopPropagation();
    const rect = selected.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const startW = rect.width, startH = rect.height;
    function move(ev){
      let nw = Math.max(MIN_W, Math.round((startW + (ev.clientX - startX)) / SNAP) * SNAP);
      let nh = Math.max(MIN_H, Math.round((startH + (ev.clientY - startY)) / SNAP) * SNAP);
      selected.style.width  = nw + 'px';
      selected.style.height = nh + 'px';
      selected.style.maxWidth = 'none';
      selected.style.boxSizing = 'border-box';
      updateToolbarSize(nw, nh);
    }
    function up(){
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      persistSelected();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // ── Toolbar ──────────────────────────────────────────────────────────
  function showToolbar(){
    if(toolbar) toolbar.remove();
    toolbar = document.createElement('div');
    toolbar.className = 'cf-le-toolbar';
    const sel = selectorOf(selected) || '(inconnu)';
    const rect = selected.getBoundingClientRect();
    toolbar.innerHTML = `
      <span class="cf-le-label" title="${sel.replace(/"/g,'&quot;')}">${sel}</span>
      <span class="sep"></span>
      <button data-act="w-">-W</button>
      <button data-act="w+">+W</button>
      <button data-act="h-">-H</button>
      <button data-act="h+">+H</button>
      <span class="sep"></span>
      <button data-act="up">↑</button>
      <button data-act="down">↓</button>
      <span class="sep"></span>
      <button data-act="hide">👁 Cacher</button>
      <button data-act="reset" class="danger">↺ Reset</button>
      <button data-act="close">✕</button>
    `;
    document.body.appendChild(toolbar);
    // position au-dessus de l'élément si possible
    const tbRect = { w: 520, h: 38 };
    let x = rect.left, y = rect.top - tbRect.h - 8;
    if(y < 8) y = rect.bottom + 8;
    x = Math.max(8, Math.min(x, window.innerWidth - tbRect.w - 8));
    toolbar.style.left = x + 'px';
    toolbar.style.top  = y + 'px';
    toolbar.addEventListener('click', onToolbarClick);
    updateToolbarSize(rect.width, rect.height);
  }
  function updateToolbarSize(w, h){
    if(!toolbar) return;
    const lbl = toolbar.querySelector('.cf-le-label');
    if(!lbl) return;
    const sel = selectorOf(selected) || '';
    lbl.textContent = `${sel}  ·  ${Math.round(w)}×${Math.round(h)}`;
  }
  function onToolbarClick(e){
    const act = e.target.dataset.act;
    if(!act || !selected) return;
    const rect = selected.getBoundingClientRect();
    const STEP = 24;
    switch(act){
      case 'w+': selected.style.width = (rect.width  + STEP) + 'px'; break;
      case 'w-': selected.style.width = Math.max(MIN_W, rect.width  - STEP) + 'px'; break;
      case 'h+': selected.style.height= (rect.height + STEP) + 'px'; break;
      case 'h-': selected.style.height= Math.max(MIN_H, rect.height - STEP) + 'px'; break;
      case 'up': {
        const prev = selected.previousElementSibling;
        if(prev && prev.dataset.cfEditable) selected.parentNode.insertBefore(selected, prev);
        break;
      }
      case 'down': {
        const next = selected.nextElementSibling;
        if(next && next.dataset.cfEditable) selected.parentNode.insertBefore(next, selected);
        break;
      }
      case 'hide':
        selected.style.display = 'none';
        persistSelected();
        toast('Bloc caché (Reset pour l\'afficher)');
        return deselect();
      case 'reset':
        resetSelected();
        toast('Bloc remis par défaut');
        return deselect();
      case 'close':
        return deselect();
    }
    selected.style.maxWidth = 'none';
    selected.style.boxSizing = 'border-box';
    updateToolbarSize(selected.getBoundingClientRect().width, selected.getBoundingClientRect().height);
    persistSelected();
  }

  // ── Save / reset ─────────────────────────────────────────────────────
  function persistSelected(){
    if(!selected) return;
    const sel = selectorOf(selected);
    if(!sel) return;
    const data = getPageData();
    const rect = selected.getBoundingClientRect();
    const hidden = selected.style.display === 'none';
    data[sel] = {
      w: hidden ? (data[sel]?.w) : Math.round(rect.width),
      h: hidden ? (data[sel]?.h) : Math.round(rect.height),
      hidden,
    };
    setPageData(data);
    selected.classList.add('cf-le-saved');
    setTimeout(() => selected && selected.classList.remove('cf-le-saved'), 600);
  }
  function resetSelected(){
    if(!selected) return;
    const sel = selectorOf(selected);
    const data = getPageData();
    delete data[sel];
    setPageData(data);
    selected.style.width = '';
    selected.style.height = '';
    selected.style.display = '';
    selected.style.maxWidth = '';
  }
  function resetPage(){
    setPageData({});
    toast('Layout de cette page remis par défaut');
    setTimeout(() => location.reload(), 600);
  }

  // ── Floating button + help ───────────────────────────────────────────
  function ensureButton(){
    if(btnFloat) return;
    btnFloat = document.createElement('button');
    btnFloat.className = 'cf-le-btn';
    btnFloat.title = 'Éditeur de layout (admin)';
    btnFloat.innerHTML = '✏️';
    btnFloat.addEventListener('click', () => toggleEditor());
    document.body.appendChild(btnFloat);
  }
  function showHelp(){
    if(document.querySelector('.cf-le-help')) return;
    const h = document.createElement('div');
    h.className = 'cf-le-help';
    h.innerHTML = `
      <span class="tt">✏️ Éditeur de layout</span>
      Clique sur un bloc de la page pour le <b>redimensionner</b>, le <b>cacher</b>
      ou le <b>réordonner</b>. Tire le coin bas-droite orange pour resize à la souris.<br><br>
      <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> pour reset toute la page.<br>
      <kbd>Échap</kbd> pour sortir du mode édition.<br><br>
      <span style="color:#22c55e">Seul toi vois ces changements</span> (stockage local de ton navigateur).
    `;
    document.body.appendChild(h);
  }
  function hideHelp(){ document.querySelectorAll('.cf-le-help').forEach(x => x.remove()); }

  function toggleEditor(force){
    editorActive = typeof force === 'boolean' ? force : !editorActive;
    document.body.classList.toggle('cf-le-on', editorActive);
    if(btnFloat) btnFloat.classList.toggle('active', editorActive);
    if(editorActive){
      markEditables();
      showHelp();
      toast('Éditeur activé · clique un bloc pour l\'éditer');
    } else {
      hideHelp();
      deselect();
      if(hovered){ hovered.classList.remove('cf-le-hover'); hovered = null; }
    }
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  function boot(){
    // 1. Applique les overrides stockés (toujours — c'est par device)
    try { applyOverrides(); } catch(e){ console.warn('[layout-editor] apply failed', e); }

    // 2. Décide si on affiche le bouton éditeur :
    //    - ?edit=1 dans l'URL
    //    - OU flag localStorage (Ctrl+Shift+E le toggle)
    const urlEdit = /[?&]edit=1\b/.test(location.search);
    const flagOn = localStorage.getItem(TOGGLE_KEY) === '1';
    const showButton = urlEdit || flagOn;

    injectCSS();
    if(showButton){
      ensureButton();
      if(urlEdit) toggleEditor(true);
    }

    // Raccourci Ctrl+Shift+E = toggle bouton d'édition
    // Ctrl+Shift+R = reset page (uniquement si éditeur actif)
    // Échap = sortir du mode
    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if(mod && e.shiftKey && (e.key === 'E' || e.key === 'e')){
        e.preventDefault();
        const newFlag = localStorage.getItem(TOGGLE_KEY) === '1' ? '0' : '1';
        localStorage.setItem(TOGGLE_KEY, newFlag);
        if(newFlag === '1'){
          ensureButton();
          toggleEditor(true);
        } else {
          toggleEditor(false);
          if(btnFloat){ btnFloat.remove(); btnFloat = null; }
          toast('Éditeur désactivé');
        }
      } else if(mod && e.shiftKey && (e.key === 'R' || e.key === 'r') && editorActive){
        e.preventDefault();
        if(confirm('Reset TOUS les blocs de cette page ?')) resetPage();
      } else if(e.key === 'Escape' && editorActive){
        toggleEditor(false);
      }
    });

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout',  onMouseOut);
    document.addEventListener('click',     onClick, true);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
