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

// -------- Global keyboard --------
document.addEventListener('keydown', (e)=>{
  const isTyping = /input|textarea/i.test(document.activeElement?.tagName||'');
  if(isTyping) return;
  // ⌘K or Ctrl+K — palette
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='k'){
    e.preventDefault();
    const pal = document.querySelector('[data-palette]');
    if(pal){ pal.classList.toggle('open'); }
    else { toast('Command palette — ⌘K','info'); }
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

// -------- Top-nav avatar (real user) + logout on click --------
(async function(){
  try {
    if(typeof api === 'undefined' || !api.isAuthed || !api.isAuthed()) return;
    const avBtns = document.querySelectorAll('.avatar');
    if(avBtns.length === 0) return;
    const me = await api.me();
    const name = me.name || '';
    const email = me.email || '';
    let initials = '??';
    if(name.trim()){
      const parts = name.trim().split(/\s+/).slice(0,2);
      initials = parts.map(p => p[0]).join('').toUpperCase();
    } else if(email){
      initials = email.slice(0,2).toUpperCase();
    }
    avBtns.forEach(btn=>{
      btn.textContent = initials;
      btn.title = email || name;
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        const current = btn.getAttribute('data-menu-open');
        if(current === '1'){ btn.setAttribute('data-menu-open','0'); return; }
        // Simple : 1er clic = va vers settings, 2e = logout (via long-press alternative)
        // Plus simple : redirige vers /settings
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
