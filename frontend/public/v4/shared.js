/* TrackCue V4 — shared interactions */

// -------- Auto-update Service Worker (force reload quand nouvelle version dispo) --------
// 🔴 2026-04-27 — Kevin se plaignait de ne pas voir les modifs après deploy parce que
// le browser ne checke la nouvelle version du SW que toutes les 24h par défaut.
// Solution :
//   1. Au load : force le SW à check si une nouvelle version est dispo
//   2. Poll toutes les 60s pendant la session
//   3. Quand le nouveau SW prend le contrôle (controllerchange) → reload auto la page
// Combiné avec sw.js qui fait skipWaiting() + clients.claim() → modifs visibles
// immédiatement après chaque deploy, sans hard reload manuel.
(function autoUpdateSW(){
  if (!('serviceWorker' in navigator)) return;
  let _refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (_refreshing) return;
    _refreshing = true;
    window.location.reload();
  });
  function checkUpdate(){
    navigator.serviceWorker.getRegistration()
      .then(function(reg){ if (reg) reg.update(); })
      .catch(function(){});
  }
  // Au load (avec delay pour pas bloquer le rendu initial)
  setTimeout(checkUpdate, 1000);
  // Polling pendant la session : check toutes les 60s
  setInterval(checkUpdate, 60 * 1000);
  // Aussi : check quand l'onglet redevient visible (focus)
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'visible') checkUpdate();
  });
})();

// -------- Layout editor loader (admin-only, toutes les pages) --------
// Charge /v4/layout-editor.js en async pour permettre à Kevin de redimensionner /
// cacher / réordonner les blocs de n'importe quelle page v4 (Ctrl+Shift+E ou ?edit=1).
// Stockage 100% localStorage : seul son navigateur voit les overrides.
(function loadLayoutEditor(){
  try {
    const s = document.createElement('script');
    s.src = '/v4/layout-editor.js?v=20260423-v1';
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
  } catch(_){}
})();

// -------- Theme + accent boot (toutes les pages) --------
// Lit trackcue_settings_v1 et applique data-theme + --amber AVANT tout render.
// Sans ce boot, switcher de thème dans /settings ne se voyait jamais ailleurs.
(function bootTheme(){
  try {
    const raw = localStorage.getItem('trackcue_settings_v1');
    if(!raw) return;
    const s = JSON.parse(raw) || {};
    if(s.theme){
      const slug = String(s.theme).toLowerCase().replace(/\s+/g,'-');
      document.documentElement.setAttribute('data-theme', slug);
    }
    if(s.accent){
      // accent peut être "#ff7a18" ou "rgb(255, 122, 24)" — les 2 marchent en CSS var
      document.documentElement.style.setProperty('--amber', s.accent);
    }
  } catch(_) { /* localStorage indispo (SSR / privacy) → on ignore */ }
})();

// -------- Density boot (compacte/normale/confortable) --------
// Lit trackcue_settings_v1 et applique data-density sur <html> AVANT tout render.
// Sans ce boot, la densité ne persiste pas après reload ou nav vers autre page.
(function bootDensity(){
  try {
    const raw = localStorage.getItem('trackcue_settings_v1');
    if(!raw) return;
    const s = JSON.parse(raw) || {};
    if(s.seg_densite_dinterface){
      // Récupère la valeur du segment densité (ex: "Compacte", "Normale", "Confortable")
      const slug = String(s.seg_densite_dinterface).toLowerCase().replace(/\s+/g,'');
      document.documentElement.setAttribute('data-density', slug);
    }
  } catch(_) { /* localStorage indispo → on ignore */ }
})();

// -------- Toast --------
(function(){
  if(document.querySelector('.toast-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'toast-wrap';
  document.body.appendChild(wrap);
  window.toast = function(msg, type='info'){
    const t = document.createElement('div');
    t.className = 'toast '+type;
    t.innerHTML = `<span class="chip-dot" style="color:currentColor"></span><span>${msg}</span>`;
    wrap.appendChild(t);
    setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),260); }, 2400);
  };
})();

// -------- Active nav highlight --------
(function(){
  // normalise : '/' = home, '/analyze' = analyze, '/v4/xxx.html' fallback legacy
  const path = location.pathname.toLowerCase().replace(/\/$/,'') || '/';
  const legacy = (path.split('/').pop() || '').replace(/\.html$/,'');
  document.querySelectorAll('.topnav-links a').forEach(a=>{
    const href = (a.getAttribute('href')||'').toLowerCase().replace(/\/$/,'');
    const match =
      href === path ||                              // /analyze === /analyze
      (href === '/' && (path === '' || path === '/')) || // home
      (href !== '/' && href !== '' && path.startsWith(href + '/')) || // sub-page
      (legacy && href === '/' + legacy);             // fallback
    if(match){ a.classList.add('active'); }
  });
})();

// -------- Inline Search overlay (replace blocking prompt) --------
(function createSearchOverlay(){
  if(document.getElementById('tc-search-overlay')) return;
  // Attendre que document.body soit prêt (important pour SPA avec chargement async)
  if(!document.body){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', createSearchOverlay);
    } else {
      setTimeout(createSearchOverlay, 10);
    }
    return;
  }

  const el = document.createElement('div');
  el.id = 'tc-search-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(10,8,14,.72);backdrop-filter:blur(8px);display:none;align-items:flex-start;justify-content:center;z-index:9999;padding-top:18vh';
  el.innerHTML = `
    <div style="width:min(560px,92vw);background:linear-gradient(180deg,#1a1822,#12111a);border:1px solid rgba(255,255,255,.08);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);padding:18px 20px">
      <div style="display:flex;align-items:center;gap:10px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#ffba7a;flex-shrink:0"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="tc-search-input" type="text" placeholder="Rechercher un track, artiste, genre…" style="flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:16px;font-family:inherit" autocomplete="off" spellcheck="false" />
        <kbd style="font-family:var(--font-mono,monospace);font-size:10px;color:rgba(255,255,255,.4);padding:3px 6px;border:1px solid rgba(255,255,255,.12);border-radius:4px">ESC</kbd>
      </div>
      <div style="margin-top:12px;font-size:11.5px;color:rgba(255,255,255,.4);font-family:var(--font-mono,monospace)">Enter → ouvre la library filtrée</div>
    </div>
  `;
  document.body.appendChild(el);
  const input = el.querySelector('#tc-search-input');
  function open(){
    el.style.display = 'flex';
    setTimeout(()=>input.focus(), 30);
  }
  function close(){
    el.style.display = 'none';
    input.value = '';
  }
  el.addEventListener('click', (e)=>{ if(e.target === el) close(); });
  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){ close(); }
    else if(e.key === 'Enter'){
      const q = input.value.trim();
      if(q){ location.href = '/library?q=' + encodeURIComponent(q); }
      else { close(); }
    }
  });
  window.__tcSearch = { open, close };
})();

// -------- Global keyboard --------
document.addEventListener('keydown', (e)=>{
  const isTyping = /input|textarea/i.test(document.activeElement?.tagName||'');
  // ⌘K or Ctrl+K — palette (works even when typing, to refocus search)
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='k'){
    e.preventDefault();
    const pal = document.querySelector('[data-palette]');
    if(pal){ pal.classList.toggle('open'); }
    else if(window.__tcSearch){ window.__tcSearch.open(); }
    return;
  }
  if(isTyping) return;
  // ESC closes search overlay from anywhere
  if(e.key === 'Escape' && window.__tcSearch){
    const el = document.getElementById('tc-search-overlay');
    if(el && el.style.display === 'flex'){ window.__tcSearch.close(); }
  }
});

// -------- Pressable ripple (subtle) --------
document.addEventListener('click', (e)=>{
  const el = e.target.closest('.btn, .pressable, .chip');
  if(!el) return;
  const rect = el.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.style.cssText = `position:absolute;inset:0;pointer-events:none;border-radius:inherit;overflow:hidden`;
  const dot = document.createElement('span');
  const size = Math.max(rect.width,rect.height)*1.8;
  dot.style.cssText = `position:absolute;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.18),transparent 60%);opacity:0;transform:scale(.3);transition:opacity .45s ease,transform .45s ease`;
  ripple.appendChild(dot);
  el.style.position = el.style.position || 'relative';
  el.appendChild(ripple);
  requestAnimationFrame(()=>{dot.style.opacity='1';dot.style.transform='scale(1)'});
  setTimeout(()=>ripple.remove(),500);
});

// -------- Find button (⌘K) — délégation d'événements au niveau du document --------
// Utilise event delegation pour que ça marche même après navigation SPA
document.addEventListener('click', (e) => {
  // Remonte jusqu'au button/a le plus proche
  const btn = e.target.closest('button, a');
  if (!btn) return;
  // Vérifie si c'est le bouton Find
  const isFindBtn = /find/i.test(btn.textContent || '') && btn.closest('.topnav-actions');
  if (!isFindBtn) return;
  e.preventDefault();
  if(window.__tcSearch) window.__tcSearch.open();
}, true); // Utilise la phase de capture pour intercepter avant les autres listeners

// -------- Top-nav avatar + upload + notifications + admin gating (dépend de api) --------
(async function(){
  try {
    if(typeof api === 'undefined') return;
    const authed = api.isAuthed && api.isAuthed();

    // Admin link visibility : masquer pour les non-admins
    const adminLinks = document.querySelectorAll('.topnav-links a[href="/admin"], .topnav-links a[href="/v4/admin.html"]');

    // Upload button (top-right) — le bouton "+ Upload"
    document.querySelectorAll('.topnav-actions .btn-primary').forEach(btn => {
      if(/upload/i.test(btn.textContent || '')){
        btn.addEventListener('click', (e) => { e.preventDefault(); location.href = '/upload'; });
      }
    });

    // Notifications icon
    document.querySelectorAll('.topnav-actions [data-tt^="Notifications"], .topnav-actions [data-tt*="notif"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const n = await api.get('/notifications', {limit: 10});
          const items = (n && (n.items || n.notifications || (Array.isArray(n) ? n : []))) || [];
          if(items.length === 0){ toast('Aucune notification', 'info'); return; }
          toast(`${items.length} notification${items.length>1?'s':''} — voir dans Settings`, 'info');
          setTimeout(()=>location.href = '/settings', 1200);
        } catch(err){
          toast('Notifications indisponibles', 'warn');
        }
      });
    });

    if(!authed){
      // pas loggé : cache le lien admin et les boutons qui dépendent de l'user
      adminLinks.forEach(a => a.style.display = 'none');
      return;
    }

    const avBtns = document.querySelectorAll('.avatar');
    const me = await api.me().catch(() => null);
    if(!me){ return; }

    const name = me.name || '';
    const email = me.email || '';
    let initials = '??';
    if(name.trim()){
      const parts = name.trim().split(/\s+/).slice(0,2);
      initials = parts.map(p => p[0]).join('').toUpperCase();
    } else if(email){
      initials = email.slice(0,2).toUpperCase();
    }

    // Cache le lien Admin si user non-admin
    if(!me.is_admin){
      adminLinks.forEach(a => a.style.display = 'none');
    }

    avBtns.forEach(btn=>{
      btn.textContent = initials;
      btn.title = email || name;
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        window.__tcOpenUserMenu(btn, { name, email, isAdmin: !!me.is_admin });
      });
    });
  } catch {}
})();

// -------- User menu (dropdown sous l'avatar) --------
window.__tcOpenUserMenu = function(anchor, userInfo){
  // Si déjà ouvert, on ferme
  const existing = document.querySelector('.user-menu');
  if(existing){ existing.remove(); anchor.setAttribute('aria-expanded', 'false'); return; }

  const { name, email, isAdmin } = userInfo || {};

  const menu = document.createElement('div');
  menu.className = 'user-menu';
  menu.setAttribute('role', 'menu');

  const displayName = (name && name.trim()) || (email ? email.split('@')[0] : 'Compte');
  const safeEmail = email || '';

  menu.innerHTML = `
    <div class="user-menu-head">
      <div class="user-menu-name">${escapeHtml(displayName)}</div>
      ${safeEmail ? `<div class="user-menu-email">${escapeHtml(safeEmail)}</div>` : ''}
    </div>
    <div class="user-menu-sep"></div>
    <a href="/settings" role="menuitem" class="user-menu-item" data-action="settings">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
      <span>Settings</span>
    </a>
    ${isAdmin ? `<a href="/admin" role="menuitem" class="user-menu-item" data-action="admin">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z"/></svg>
      <span>Admin</span>
    </a>` : ''}
    <a href="/upload" role="menuitem" class="user-menu-item" data-action="upload">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <span>Upload</span>
    </a>
    <div class="user-menu-sep"></div>
    <button type="button" role="menuitem" class="user-menu-item user-menu-item-danger" data-action="logout">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      <span>Se déconnecter</span>
    </button>
  `;

  // Placé hors-écran d'abord pour mesurer sans flash
  menu.style.top = '-9999px';
  menu.style.left = '-9999px';
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);

  // Positionnement viewport-aware (flip + clamp)
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const gap = 8;
    const margin = 8;

    // Par défaut : sous l'ancre, aligné à droite
    let top = r.bottom + gap;
    let left = r.right - mw;

    // Flip au-dessus si pas de place en bas ET plus de place en haut
    const spaceBelow = vh - r.bottom - gap;
    const spaceAbove = r.top - gap;
    if (mh > spaceBelow && spaceAbove > spaceBelow) {
      top = r.top - mh - gap;
    }

    // Clamp horizontal dans le viewport
    if (left + mw > vw - margin) left = vw - mw - margin;
    if (left < margin) left = margin;

    // Clamp vertical dans le viewport
    if (top < margin) top = margin;
    if (top + mh > vh - margin) top = Math.max(margin, vh - mh - margin);

    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    menu.style.visibility = 'visible';
  };
  requestAnimationFrame(place);

  anchor.setAttribute('aria-expanded', 'true');

  // Click outside / Escape → close
  const close = ()=>{
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
  };
  const onDocClick = (ev)=>{
    if(menu.contains(ev.target)) return;
    if(anchor.contains(ev.target)) return;
    close();
  };
  const onKey = (ev)=>{ if(ev.key === 'Escape') close(); };
  setTimeout(()=>{
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
  }, 0);

  // Actions
  menu.addEventListener('click', (ev)=>{
    const item = ev.target.closest('[data-action]');
    if(!item) return;
    const action = item.getAttribute('data-action');
    if(action === 'logout'){
      ev.preventDefault();
      close();
      try {
        if(typeof api !== 'undefined' && api.logout) api.logout();
        else { localStorage.removeItem('tc_token'); location.href = '/'; }
      } catch { location.href = '/'; }
    }
    // Les autres items sont des <a href> → navigation native
  });
};

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// -------- Seeded random for deterministic waveforms --------
window.seededRand = function(seed){let x=Math.sin(seed)*10000;return x-Math.floor(x)};

// -------- PERF #2.4: Prefetch topnav links on hover --------
// Quand l'utilisateur survole un lien du topnav > 60ms, on déclenche un fetch
// de la page en arrière-plan. Le browser met en cache la réponse, le clic est
// instantané. No-op si déjà visité récemment ou pas de connexion.
(function initHoverPrefetch(){
  if(!('IntersectionObserver' in window)) return;
  const prefetched = new Set();
  let hoverTimer = null;

  function prefetchUrl(url){
    if(prefetched.has(url)) return;
    prefetched.add(url);
    // Utilise <link rel="prefetch"> : léger, honoré par tous les browsers récents.
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'document';
    document.head.appendChild(link);
  }

  function setupHoverPrefetch(){
    const links = document.querySelectorAll('.topnav-links a, .topnav-actions a');
    links.forEach(a => {
      const href = a.getAttribute('href') || '';
      // Ne prefetcher que les URLs internes relatives ou même origine
      if(!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      if(href.startsWith('http://') || href.startsWith('https://')){
        try {
          const u = new URL(href);
          if(u.origin !== location.origin) return;
        } catch { return; }
      }
      a.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => prefetchUrl(href), 60);
      });
      a.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimer);
      });
      // Également sur touchstart pour mobile (anticipe le tap)
      a.addEventListener('touchstart', () => prefetchUrl(href), { passive: true });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupHoverPrefetch);
  } else {
    setupHoverPrefetch();
  }
})();

// -------- Feedback widget (bulle en bas-droite, toutes les pages v4) --------
// - User loggé standard → envoie vers POST /feedback
// - User admin → toggle "💬 Feedback" vs "🛠️ Note admin" (scope=admin)
// - Anonyme → envoie vers POST /feedback sans token (backend autorise user_id=null)
(function feedbackWidget(){
  if(typeof window === 'undefined') return;
  // Ne pas afficher sur les pages publiques de login / register / reset
  const path = (location.pathname || '').toLowerCase();
  const HIDE_ON = ['/login','/register','/reset-password','/verify-email','/v4/login.html','/v4/register.html'];
  if(HIDE_ON.some(p => path === p || path.endsWith(p))) return;
  if(document.getElementById('tc-fb-bubble')) return;

  function mount(){
    if(!document.body){
      if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
      else setTimeout(mount, 30);
      return;
    }
    if(document.getElementById('tc-fb-bubble')) return;

    const style = document.createElement('style');
    style.textContent = `
      #tc-fb-bubble{position:fixed !important;right:18px !important;bottom:18px !important;z-index:999;width:44px;height:44px;border-radius:50%;
        background:linear-gradient(135deg,#8b5cf6,#a855f7);border:none;cursor:pointer;color:#fff;
        box-shadow:0 10px 30px rgba(139,92,246,.35);display:flex;align-items:center;justify-content:center;
        transition:transform .18s ease, box-shadow .18s ease}
      #tc-fb-bubble:hover{transform:scale(1.08);box-shadow:0 14px 36px rgba(139,92,246,.55)}
      #tc-fb-bubble svg{width:20px;height:20px}
      #tc-fb-panel{position:fixed;right:18px;bottom:72px;z-index:1000;width:min(340px,92vw);
        background:linear-gradient(180deg,#1b1825,#12111a);color:#fff;border:1px solid rgba(255,255,255,.1);
        border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;font-family:inherit;
        display:none}
      #tc-fb-panel.open{display:block;animation:tcfbin .2s ease}
      @keyframes tcfbin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      #tc-fb-panel .hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
      #tc-fb-panel .hd b{font-size:13px;font-weight:600}
      #tc-fb-panel .hd button.x{background:transparent;border:none;color:#8a8895;cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;border-radius:6px}
      #tc-fb-panel .hd button.x:hover{color:#fff;background:rgba(255,255,255,.06)}
      #tc-fb-panel .tabs{display:flex;gap:6px;padding:10px 12px 4px 12px}
      #tc-fb-panel .tabs button{flex:1;padding:7px 10px;font-size:11.5px;font-weight:600;border-radius:8px;
        background:transparent;color:#9b98a6;border:1px solid rgba(255,255,255,.08);cursor:pointer;transition:all .15s}
      #tc-fb-panel .tabs button.on{background:rgba(139,92,246,.18);color:#c9bff5;border-color:rgba(139,92,246,.45)}
      #tc-fb-panel .body{padding:10px 14px 14px 14px}
      #tc-fb-panel .types{display:flex;gap:6px;margin-bottom:8px}
      #tc-fb-panel .types button{flex:1;padding:6px 8px;font-size:11px;border-radius:8px;
        background:transparent;border:1px solid rgba(255,255,255,.1);color:#b8b5c3;cursor:pointer}
      #tc-fb-panel .types button.on{background:rgba(139,92,246,.18);color:#c9bff5;border-color:rgba(139,92,246,.45)}
      #tc-fb-panel input.subj,
      #tc-fb-panel textarea.msg{width:100%;background:rgba(10,8,14,.6);border:1px solid rgba(255,255,255,.08);
        border-radius:10px;color:#fff;font-family:inherit;font-size:12.5px;padding:8px 10px;outline:none;box-sizing:border-box}
      #tc-fb-panel textarea.msg{resize:vertical;min-height:72px}
      #tc-fb-panel input.subj:focus, #tc-fb-panel textarea.msg:focus{border-color:#a855f7}
      #tc-fb-panel .field-label{font-size:10.5px;color:#7a7886;text-transform:uppercase;letter-spacing:.05em;margin:6px 0 4px 0}
      #tc-fb-panel .rating{display:flex;align-items:center;gap:8px;font-size:11px;color:#7a7886;margin:10px 0}
      #tc-fb-panel .rating button{background:transparent;border:1px solid rgba(255,255,255,.08);color:#9b98a6;
        cursor:pointer;border-radius:7px;width:28px;height:26px;display:inline-flex;align-items:center;justify-content:center}
      #tc-fb-panel .rating button.on[data-r="up"]{background:rgba(16,185,129,.15);color:#6ee7b7;border-color:rgba(16,185,129,.35)}
      #tc-fb-panel .rating button.on[data-r="down"]{background:rgba(239,68,68,.15);color:#fca5a5;border-color:rgba(239,68,68,.35)}
      #tc-fb-panel .submit{width:100%;margin-top:6px;padding:9px;font-size:12.5px;font-weight:600;
        background:linear-gradient(135deg,#8b5cf6,#a855f7);border:none;color:#fff;border-radius:10px;cursor:pointer}
      #tc-fb-panel .submit:disabled{opacity:.4;cursor:not-allowed}
      #tc-fb-panel .done{padding:22px 16px;text-align:center}
      #tc-fb-panel .done .big{font-size:28px;margin-bottom:4px}
      #tc-fb-panel .admin-hint{font-size:10.5px;color:#8a87a0;margin:4px 0 8px 0;font-style:italic}
      #tc-fb-panel .shot{margin:8px 0 2px 0;display:flex;align-items:center;gap:8px;font-size:11px;color:#9b98a6}
      #tc-fb-panel .shot input[type=checkbox]{accent-color:#a855f7;width:14px;height:14px;cursor:pointer}
      #tc-fb-panel .shot .status{font-size:10.5px;color:#7a7886;margin-left:auto}
      #tc-fb-panel .shot-preview{margin:6px 0 4px 0;border:1px solid rgba(255,255,255,.08);border-radius:8px;
        overflow:hidden;max-height:110px;background:rgba(10,8,14,.5);display:none}
      #tc-fb-panel .shot-preview img{width:100%;height:110px;object-fit:cover;object-position:top;display:block}
      #tc-fb-panel .shot-preview.ready{display:block}
      #tc-fb-panel .shot-crop-btn{background:transparent;border:1px solid rgba(255,255,255,.12);color:#b8b5c3;
        cursor:pointer;border-radius:7px;padding:3px 8px;font-size:10.5px;font-family:inherit}
      #tc-fb-panel .shot-crop-btn:hover{background:rgba(139,92,246,.18);border-color:rgba(139,92,246,.35);color:#c9bff5}
      #tc-fb-panel .shot-crop-btn:disabled{opacity:.4;cursor:not-allowed}
      /* Overlay crop plein écran */
      #tc-fb-crop-overlay{position:fixed;inset:0;z-index:10000;cursor:crosshair;
        background:rgba(0,0,0,.35);user-select:none;display:none}
      #tc-fb-crop-overlay.on{display:block}
      #tc-fb-crop-overlay .hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);
        background:rgba(18,17,26,.95);color:#fff;padding:10px 18px;border-radius:10px;font-size:12.5px;
        font-family:inherit;border:1px solid rgba(139,92,246,.4);box-shadow:0 8px 30px rgba(0,0,0,.5)}
      #tc-fb-crop-overlay .hint b{color:#c9bff5}
      #tc-fb-crop-overlay .hint .esc{opacity:.7;font-size:11px;margin-left:8px}
      #tc-fb-crop-rect{position:fixed;border:2px solid #a855f7;background:rgba(168,85,247,.12);
        box-shadow:0 0 0 100000px rgba(0,0,0,.45);pointer-events:none;display:none}
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'tc-fb-bubble';
    btn.setAttribute('aria-label', "Envoyer un feedback");
    btn.title = "Envoyer un feedback";
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'tc-fb-panel';
    panel.innerHTML = `
      <div class="hd">
        <b>💬 Ton avis <span style="font-size:10px;color:#7a7886;font-weight:400;margin-left:4px">⌘&lt;</span></b>
        <button type="button" class="x" aria-label="Fermer">×</button>
      </div>
      <div class="tabs" id="tcfb-tabs">
        <button type="button" data-scope="user" class="on">💬 Feedback</button>
        <button type="button" data-scope="admin">🛠️ Note admin</button>
      </div>
      <div class="body">
        <div id="tcfb-form">
          <div class="field-label" style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:#9b98a6">
            📍 <span id="tcfb-page-path" style="font-family:var(--font-mono);font-size:11px;color:#b8b5c3"></span>
          </div>
          <div class="admin-hint" id="tcfb-admin-hint" style="display:none">
            Note interne — visible uniquement dans /admin#fb. Pas d'email envoyé.
          </div>
          <div class="types" id="tcfb-types">
            <button type="button" data-t="bug">🐛 Bug</button>
            <button type="button" data-t="feature" class="on">💡 Idée</button>
            <button type="button" data-t="other">💬 Autre</button>
          </div>
          <div class="field-label" id="tcfb-subj-label" style="display:none">Sujet</div>
          <input class="subj" id="tcfb-subj" type="text" placeholder="Ex: DELETE user échoue si fichier manquant" style="display:none" />
          <div class="field-label">Message</div>
          <textarea class="msg" id="tcfb-msg" placeholder="Décris ton idée, le bug ou ton retour…" rows="3"></textarea>
          <div class="shot">
            <input type="checkbox" id="tcfb-shot-chk" checked />
            <label for="tcfb-shot-chk" style="cursor:pointer">📸 Joindre un screenshot</label>
            <button type="button" id="tcfb-shot-crop" class="shot-crop-btn" title="Sélectionner une zone">✂️ Zone</button>
            <span class="status" id="tcfb-shot-status"></span>
          </div>
          <div class="shot-preview" id="tcfb-shot-preview"><img id="tcfb-shot-img" alt="" /></div>
          <div class="rating" id="tcfb-rating">
            <span>Ton expérience :</span>
            <button type="button" data-r="up" title="👍">👍</button>
            <button type="button" data-r="down" title="👎">👎</button>
          </div>
          <button type="button" class="submit" id="tcfb-submit" disabled>Envoyer</button>
        </div>
        <div id="tcfb-done" class="done" style="display:none">
          <div class="big">🎉</div>
          <div style="font-size:13px;font-weight:600">Merci pour ton retour !</div>
          <div style="font-size:11.5px;color:#8a87a0;margin-top:4px" id="tcfb-done-msg">On prend en compte chaque feedback.</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // State
    let scope = 'user';      // user | admin
    let type = 'feature';    // bug | feature | other
    let rating = null;       // up | down | null
    let sending = false;
    let isAdmin = false;
    let capturedShot = null; // data URL (jpeg) du screenshot capturé au moment où on ouvre le panel
    let shotCapturing = false;
    let shotLibPromise = null;

    const $ = s => panel.querySelector(s);
    const msgEl = $('#tcfb-msg');
    const subjEl = $('#tcfb-subj');
    const subjLab = $('#tcfb-subj-label');
    const submitBtn = $('#tcfb-submit');
    const doneEl = $('#tcfb-done');
    const formEl = $('#tcfb-form');
    const tabsEl = $('#tcfb-tabs');
    const adminHint = $('#tcfb-admin-hint');
    const ratingEl = $('#tcfb-rating');
    const shotChk = $('#tcfb-shot-chk');
    const shotStatus = $('#tcfb-shot-status');
    const shotPreview = $('#tcfb-shot-preview');
    const shotImg = $('#tcfb-shot-img');

    // Charge html2canvas à la demande (CDN), une seule fois.
    function loadHtml2Canvas(){
      if(window.html2canvas) return Promise.resolve(window.html2canvas);
      if(shotLibPromise) return shotLibPromise;
      shotLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.async = true;
        s.onload = () => resolve(window.html2canvas);
        s.onerror = () => reject(new Error('Impossible de charger html2canvas'));
        document.head.appendChild(s);
      });
      return shotLibPromise;
    }

    // Capture l'écran AVANT d'ouvrir le panel (le bubble et le panel ne doivent
    // PAS figurer dans le screenshot — l'admin veut voir la page que l'user regardait).
    async function captureScreenshot(){
      if(shotCapturing) return;
      shotCapturing = true;
      shotStatus.textContent = '⏳ Capture…';
      try {
        const h2c = await loadHtml2Canvas();
        // On masque temporairement la bulle + le panel pour ne pas les capturer
        btn.style.visibility = 'hidden';
        panel.style.visibility = 'hidden';
        const opts = {
          backgroundColor: null,
          scale: Math.min(1, (window.devicePixelRatio || 1) * 0.6),
          logging: false,
          useCORS: true,
          allowTaint: true,
          // On ne capture que le viewport, pas toute la page (rapide + image plus petite)
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          width: window.innerWidth,
          height: window.innerHeight,
          x: window.scrollX,
          y: window.scrollY,
        };
        const canvas = await h2c(document.body, opts);
        btn.style.visibility = '';
        panel.style.visibility = '';

        // Rescale si trop grand (cap ~1280px de large) et encode en JPEG 0.55 (compression agressive)
        const MAX_W = 1280;
        let outCanvas = canvas;
        if(canvas.width > MAX_W){
          const ratio = MAX_W / canvas.width;
          const c2 = document.createElement('canvas');
          c2.width = MAX_W;
          c2.height = Math.round(canvas.height * ratio);
          const ctx = c2.getContext('2d');
          ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
          outCanvas = c2;
        }
        const dataUrl = outCanvas.toDataURL('image/jpeg', 0.55);
        // Garde-fou taille: frontend refuse > 400KB, backend refuse > 900KB
        if(dataUrl.length > 400_000){
          capturedShot = null;
          shotStatus.textContent = '⚠️ image trop lourd';
        } else {
          capturedShot = dataUrl;
          shotImg.src = dataUrl;
          shotPreview.classList.add('ready');
          shotStatus.textContent = `✓ ${Math.round(dataUrl.length/1024)} KB`;
        }
      } catch(err){
        btn.style.visibility = '';
        panel.style.visibility = '';
        capturedShot = null;
        shotStatus.textContent = '⚠️ échec capture';
        console.warn('[feedback] screenshot failed', err);
      } finally {
        shotCapturing = false;
      }
    }

    shotChk.addEventListener('change', () => {
      if(!shotChk.checked){
        capturedShot = null;
        shotPreview.classList.remove('ready');
        shotStatus.textContent = 'désactivé';
      } else {
        shotStatus.textContent = '';
        if(!capturedShot) captureScreenshot();
      }
    });

    // ── Mode "sélection de zone" ───────────────────────────
    // 1. Fermer le panel, afficher overlay plein écran avec hint
    // 2. User drag-select un rectangle
    // 3. Capture html2canvas avec bounds ciblés (window coordinates)
    // 4. Remplace capturedShot et montre preview
    const cropBtn = $('#tcfb-shot-crop');
    let cropping = false;
    let cropState = null; // {startX, startY, rect}

    function cropOverlayEl(){
      let ov = document.getElementById('tc-fb-crop-overlay');
      if(ov) return ov;
      ov = document.createElement('div');
      ov.id = 'tc-fb-crop-overlay';
      ov.innerHTML = `
        <div class="hint">✂️ <b>Dessine un rectangle</b> sur la zone à capturer <span class="esc">· Echap pour annuler</span></div>
        <div id="tc-fb-crop-rect"></div>
      `;
      document.body.appendChild(ov);
      return ov;
    }

    async function doCaptureRegion(x, y, w, h){
      shotStatus.textContent = '⏳ Capture zone…';
      try {
        const h2c = await loadHtml2Canvas();
        btn.style.visibility = 'hidden';
        panel.style.visibility = 'hidden';
        const canvas = await h2c(document.body, {
          backgroundColor: null,
          scale: Math.min(1, (window.devicePixelRatio || 1) * 0.75),
          logging: false,
          useCORS: true,
          allowTaint: true,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          x: window.scrollX + x,
          y: window.scrollY + y,
          width: w,
          height: h,
        });
        btn.style.visibility = '';
        panel.style.visibility = '';

        const MAX_W = 1280;
        let outCanvas = canvas;
        if(canvas.width > MAX_W){
          const ratio = MAX_W / canvas.width;
          const c2 = document.createElement('canvas');
          c2.width = MAX_W;
          c2.height = Math.round(canvas.height * ratio);
          c2.getContext('2d').drawImage(canvas, 0, 0, c2.width, c2.height);
          outCanvas = c2;
        }
        const dataUrl = outCanvas.toDataURL('image/jpeg', 0.55);
        if(dataUrl.length > 400_000){
          capturedShot = null;
          shotStatus.textContent = '⚠️ image trop lourd';
        } else {
          capturedShot = dataUrl;
          shotImg.src = dataUrl;
          shotPreview.classList.add('ready');
          shotChk.checked = true;
          shotStatus.textContent = `✂️ ${Math.round(dataUrl.length/1024)} KB`;
        }
      } catch(err){
        btn.style.visibility = '';
        panel.style.visibility = '';
        shotStatus.textContent = '⚠️ échec capture zone';
        console.warn('[feedback] region capture failed', err);
      }
    }

    function endCrop(){
      cropping = false;
      const ov = document.getElementById('tc-fb-crop-overlay');
      if(ov) ov.classList.remove('on');
      document.removeEventListener('mousedown', onCropDown, true);
      document.removeEventListener('mousemove', onCropMove, true);
      document.removeEventListener('mouseup', onCropUp, true);
      document.removeEventListener('keydown', onCropKey, true);
      panel.classList.add('open');
    }

    function onCropKey(e){
      if(e.key === 'Escape'){ endCrop(); }
    }

    function onCropDown(e){
      if(!cropping) return;
      e.preventDefault(); e.stopPropagation();
      cropState = { startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY, dragging: true };
      const rect = document.getElementById('tc-fb-crop-rect');
      if(rect){
        rect.style.display = 'block';
        rect.style.left = e.clientX + 'px';
        rect.style.top = e.clientY + 'px';
        rect.style.width = '0px';
        rect.style.height = '0px';
      }
    }

    function onCropMove(e){
      if(!cropping || !cropState || !cropState.dragging) return;
      e.preventDefault(); e.stopPropagation();
      cropState.endX = e.clientX;
      cropState.endY = e.clientY;
      const rect = document.getElementById('tc-fb-crop-rect');
      if(!rect) return;
      const x = Math.min(cropState.startX, cropState.endX);
      const y = Math.min(cropState.startY, cropState.endY);
      const w = Math.abs(cropState.endX - cropState.startX);
      const h = Math.abs(cropState.endY - cropState.startY);
      rect.style.left = x + 'px';
      rect.style.top = y + 'px';
      rect.style.width = w + 'px';
      rect.style.height = h + 'px';
    }

    async function onCropUp(e){
      if(!cropping || !cropState) return;
      e.preventDefault(); e.stopPropagation();
      cropState.dragging = false;
      const x = Math.min(cropState.startX, cropState.endX);
      const y = Math.min(cropState.startY, cropState.endY);
      const w = Math.abs(cropState.endX - cropState.startX);
      const h = Math.abs(cropState.endY - cropState.startY);
      endCrop();
      // Trop petit → ignorer
      if(w < 12 || h < 12){
        shotStatus.textContent = 'zone trop petite';
        return;
      }
      await doCaptureRegion(x, y, w, h);
    }

    cropBtn.addEventListener('click', () => {
      if(cropping) return;
      cropping = true;
      cropState = null;
      // Ferme le panel pour ne pas qu'il gêne la sélection
      panel.classList.remove('open');
      const ov = cropOverlayEl();
      // Reset le rectangle
      const rect = document.getElementById('tc-fb-crop-rect');
      if(rect){ rect.style.display = 'none'; }
      ov.classList.add('on');
      document.addEventListener('mousedown', onCropDown, true);
      document.addEventListener('mousemove', onCropMove, true);
      document.addEventListener('mouseup', onCropUp, true);
      document.addEventListener('keydown', onCropKey, true);
    });

    function updateSubmit(){
      submitBtn.disabled = sending || !msgEl.value.trim();
    }
    msgEl.addEventListener('input', updateSubmit);

    // Types selector
    $('#tcfb-types').querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        type = b.dataset.t;
        $('#tcfb-types').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        saveDraft();
      });
    });

    // Rating selector
    ratingEl.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        rating = (rating === b.dataset.r) ? null : b.dataset.r;
        ratingEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', rating && x.dataset.r === rating));
        saveDraft();
      });
    });

    // Tabs (scope)
    tabsEl.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        scope = b.dataset.scope;
        tabsEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        applyScope();
        saveDraft();
      });
    });

    function applyScope(){
      const isAdminNote = scope === 'admin';
      adminHint.style.display = isAdminNote ? 'block' : 'none';
      subjLab.style.display = isAdminNote ? 'block' : 'none';
      subjEl.style.display = isAdminNote ? 'block' : 'none';
      ratingEl.style.display = isAdminNote ? 'none' : 'flex';
      // Les notes admin sont plutôt "bug" par défaut, les feedbacks user plutôt "feature"
      const defaultType = isAdminNote ? 'bug' : 'feature';
      type = defaultType;
      $('#tcfb-types').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.t === defaultType));
      msgEl.placeholder = isAdminNote
        ? "Ex: Quand je supprime un track, l'UI redirige vers /upload…"
        : "Décris ton idée, le bug ou ton retour…";
    }

    // Open/close
    btn.addEventListener('click', async () => {
      const isOpen = panel.classList.contains('open');
      if(isOpen){ panel.classList.remove('open'); return; }

      // Afficher le chemin de la page courante
      const currentPath = (location.pathname + location.search).slice(0, 100);
      const pagePathEl = $('#tcfb-page-path');
      if(pagePathEl) pagePathEl.textContent = currentPath || '/';

      // Reset état du screenshot pour cette nouvelle session
      capturedShot = null;
      shotPreview.classList.remove('ready');
      shotImg.src = '';

      // Restaurer le brouillon depuis localStorage
      loadDraft();

      // Capture AVANT d'afficher le panel (hide bubble + capture + show panel)
      if(shotChk.checked){
        await captureScreenshot();
      } else {
        shotStatus.textContent = 'désactivé';
      }

      panel.classList.add('open');

      // Lazy-detect admin status via api.me() (évite un appel si pas besoin)
      if(!isAdmin && window.api && typeof api.me === 'function'){
        api.me().then(me => {
          if(me && me.is_admin){
            isAdmin = true;
            tabsEl.style.display = 'flex';
            // Si admin, initier le widget en mode admin directement
            scope = 'admin';
            tabsEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.scope === 'admin'));
            applyScope();
          }
        }).catch(() => {});
      } else if(isAdmin){
        // Si déjà détecté comme admin, afficher les onglets et mettre en mode admin
        tabsEl.style.display = 'flex';
        scope = 'admin';
        tabsEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.scope === 'admin'));
        applyScope();
      }
      setTimeout(() => msgEl.focus(), 60);
    });
    $('button.x').addEventListener('click', () => panel.classList.remove('open'));

    // Close on ESC
    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && panel.classList.contains('open')) panel.classList.remove('open');
    });

    // Raccourci clavier : Cmd/Ctrl + <  → ouvrir le widget
    // Sur AZERTY-FR la touche "<" est à gauche du Z (pas de Shift requis).
    // e.key vaut "<" quand la touche produit "<", on match donc sur la valeur.
    document.addEventListener('keydown', e => {
      const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if(!mod) return;
      // Match "<" ou ">" (au cas où layout différent) — e.key est la valeur finale
      if(e.key === '<' || e.key === '>'){
        e.preventDefault();
        e.stopPropagation();
        btn.click();
      }
    }, true);

    // Retry avec backoff exponentiel (2s, 5s)
    async function retryWithBackoff(fn, maxRetries = 2) {
      let lastErr;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastErr = err;
          if (attempt < maxRetries) {
            const delay = attempt === 0 ? 2000 : 5000;
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      throw lastErr;
    }

    // Brouillon localStorage
    const DRAFT_KEY = 'tcfb_draft_v1';
    function saveDraft() {
      try {
        const draft = {
          message: msgEl.value,
          subject: subjEl.value,
          type: type,
          rating: rating,
          scope: scope,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch(_) { /* localStorage indispo → no-op */ }
    }
    function loadDraft() {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if(!raw) return;
        const draft = JSON.parse(raw);
        if(draft.message) msgEl.value = draft.message;
        if(draft.subject) subjEl.value = draft.subject;
        if(draft.type) {
          type = draft.type;
          $('#tcfb-types').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.t === type));
        }
        if(draft.rating) {
          rating = draft.rating;
          ratingEl.querySelectorAll('button').forEach(x => x.classList.toggle('on', rating && x.dataset.r === rating));
        }
        updateSubmit();
      } catch(_) { /* JSON parse error → no-op */ }
    }
    function clearDraft() {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch(_) {}
    }

    // Auto-save brouillon lors de chaque modification
    msgEl.addEventListener('input', saveDraft);
    subjEl.addEventListener('input', saveDraft);

    // Submit — pessimiste : attendre le succès avant de clear/close
    submitBtn.addEventListener('click', async () => {
      const message = msgEl.value.trim();
      if(!message) return;
      if(sending) return; // Évite les double-clics

      sending = true;
      updateSubmit();
      submitBtn.textContent = 'Envoi…';
      const subject = subjEl.value.trim();
      const page_url = (location.pathname + location.search).slice(0, 500);
      const screenshot = (shotChk.checked && capturedShot) ? capturedShot : null;

      try {
        // Construire le body
        let body = { type, message };
        if(scope === 'admin'){
          body.subject = subject;
        } else {
          if(rating) body.rating = rating;
          if(subject) body.subject = subject;
        }
        if(screenshot) body.screenshot = screenshot;
        if(page_url) body.page_url = page_url;

        // Envoyer avec retry auto (2s, 5s) — transparent pour l'user
        const endpoint = scope === 'admin' ? '/feedback/admin-note' : '/feedback';
        await retryWithBackoff(async () => {
          if(scope === 'admin'){
            await window.api.post(endpoint, body);
          } else {
            await window.api.post(endpoint, body);
          }
        });

        // Succès HTTP 200 : clear + close + toast vert
        msgEl.value = '';
        subjEl.value = '';
        rating = null;
        ratingEl.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        capturedShot = null;
        shotPreview.classList.remove('ready');
        shotImg.src = '';
        clearDraft();

        const successMsg = scope === 'admin' ? 'Note admin enregistrée ✓' : 'Feedback reçu, merci ✓';
        if(typeof toast === 'function') toast(successMsg, 'info');

        // Afficher "done" puis fermer après 1.2s
        formEl.style.display = 'none';
        doneEl.style.display = 'block';
        setTimeout(() => {
          formEl.style.display = '';
          doneEl.style.display = 'none';
          panel.classList.remove('open');
        }, 1200);
      } catch(err){
        // Erreur HTTP ou timeout : garder le texte, modale ouverte, button redevient cliquable
        const errMsg = err.message || String(err);
        const statusCode = err.status || err.statusCode || '';
        const displayMsg = statusCode ? `Erreur (${statusCode}), ton message est conservé` : `Erreur : ${errMsg}`;
        if(typeof toast === 'function') toast(displayMsg, 'error');
        console.warn('[feedback] send failed', err);
        // Message + screenshot + modale restent ouverts pour retry
      } finally {
        sending = false;
        submitBtn.textContent = 'Envoyer';
        updateSubmit();
      }
    });

    applyScope();
  }

  mount();
})();

// -------- Build waveform --------
window.buildWave = function(el, count, seed, opts={}){
  if(!el) return;
  el.innerHTML = '';
  const cls = opts.class || 'wbar';
  const activeIdx = opts.active ?? -1;
  const progress = opts.progress ?? 0;
  for(let i=0;i<count;i++){
    const r1 = seededRand(seed+i*0.31);
    const r2 = seededRand(seed+i*0.17+99);
    const phrase = Math.floor(i/(count/8));
    const envelope = opts.envelope ? opts.envelope(i/count,phrase) : (0.3+0.7*Math.pow(0.5+0.5*Math.sin(i*.1),1.3));
    const h = Math.min(1, (0.15 + r1*0.55 + r2*0.3) * envelope);
    const b = document.createElement('div');
    b.className = cls;
    b.style.height = (h*100)+'%';
    if(i <= progress*count) b.classList.add('played');
    if(i === activeIdx) b.classList.add('active');
    el.appendChild(b);
  }
};
