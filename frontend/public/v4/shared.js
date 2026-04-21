/* TrackCue V4 — shared interactions */

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
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        location.href = '/settings';
      });
    });
  } catch {}
})();

// -------- Seeded random for deterministic waveforms --------
window.seededRand = function(seed){let x=Math.sin(seed)*10000;return x-Math.floor(x)};

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
