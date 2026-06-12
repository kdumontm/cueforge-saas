/* ============================================================
   TrackCue V4 — Transitions runtime
   - View Transitions API (cross-page) avec fallback fade
   - Top progress bar pendant la nav
   - Ripple sur boutons
   - Stagger reveal (IntersectionObserver)
   - KPI counter animé
   ============================================================ */
(function(){
  'use strict';

  // Skip si l'utilisateur préfère reduced motion
  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------- 1. Page-enter : on retire la classe au load -------- */
  document.documentElement.classList.add('cf-page-enter');
  window.addEventListener('pageshow', function(){
    document.documentElement.classList.remove('cf-page-leave');
  });

  /* -------- 2. Top progress bar (route loader) -------- */
  function makeProgress(){
    var bar = document.createElement('div');
    bar.className = 'cf-progress';
    document.body.appendChild(bar);
    var w = 0, raf;
    function tick(){
      w = Math.min(w + (90 - w) * 0.06, 90);
      bar.style.width = w + '%';
      raf = requestAnimationFrame(tick);
    }
    tick();
    return {
      done: function(){
        cancelAnimationFrame(raf);
        bar.style.width = '100%';
        bar.classList.add('done');
        setTimeout(function(){ bar.remove(); }, 320);
      },
      cancel: function(){
        cancelAnimationFrame(raf);
        bar.remove();
      }
    };
  }

  /* -------- 3. Soft page transition sur nav interne -------- */
  function isInternalNav(a){
    if(!a || !a.href) return false;
    if(a.target && a.target !== '_self') return false;
    if(a.hasAttribute('download')) return false;
    if(a.dataset.noTransition === '1') return false;
    var url;
    try{ url = new URL(a.href, location.href); }catch(e){ return false; }
    if(url.origin !== location.origin) return false;
    if(url.pathname === location.pathname && url.hash) return false; // ancre
    if(/^(mailto:|tel:|javascript:)/i.test(a.getAttribute('href')||'')) return false;
    return true;
  }

  document.addEventListener('click', function(e){
    if(prefersReduced) return;
    if(e.defaultPrevented) return;
    if(e.button !== 0) return;
    if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a');
    if(!isInternalNav(a)) return;

    // Si l'API supporte View Transitions, on laisse le navigateur faire
    // (notre CSS ::view-transition-* prend le relais).
    // Sinon, on déclenche un fade out manuel + nav après 220ms.
    if('startViewTransition' in document){
      // Le navigateur prend en charge la transition automatiquement
      // (avec @view-transition{navigation:auto}).
      makeProgress(); // visuel sympa pendant le fetch
      return;
    }

    e.preventDefault();
    var href = a.href;
    var prog = makeProgress();
    document.documentElement.classList.add('cf-page-leave');
    setTimeout(function(){
      prog.done();
      window.location.href = href;
    }, 220);
  });

  // Si l'utilisateur revient (back/forward), nettoie l'état
  window.addEventListener('popstate', function(){
    document.documentElement.classList.remove('cf-page-leave');
  });

  /* -------- 4. Ripple effect sur boutons -------- */
  document.addEventListener('pointerdown', function(e){
    if(prefersReduced) return;
    var btn = e.target.closest('button, .btn, .button, [role="button"], a.btn, a.button');
    if(!btn) return;
    if(btn.disabled) return;
    // Skip si parent a déjà un comportement custom
    if(btn.dataset.noRipple === '1') return;

    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 1.1;
    var x = (e.clientX || (rect.left + rect.width/2)) - rect.left - size/2;
    var y = (e.clientY || (rect.top + rect.height/2)) - rect.top - size/2;

    // S'assurer que le bouton est position:relative + overflow:hidden
    var cs = getComputedStyle(btn);
    if(cs.position === 'static') btn.style.position = 'relative';
    if(cs.overflow !== 'hidden') btn.style.overflow = 'hidden';

    var r = document.createElement('span');
    r.className = 'cf-ripple';
    r.style.width = r.style.height = size + 'px';
    r.style.left = x + 'px';
    r.style.top  = y + 'px';
    btn.appendChild(r);
    setTimeout(function(){ r.remove(); }, 700);
  }, { passive: true });

  /* -------- 5. Stagger reveal (IntersectionObserver) -------- */
  function observeReveals(root){
    if(prefersReduced) return;
    if(!('IntersectionObserver' in window)) return;
    var nodes = (root || document).querySelectorAll(
      '.cf-reveal, .card, .tile, .kpi-card, .set-card, .track-card'
    );
    if(!nodes.length) return;

    // Auto-attribue .cf-reveal aux cards si pas déjà présent
    var sets = {};
    nodes.forEach(function(n, idx){
      if(!n.classList.contains('cf-reveal')) n.classList.add('cf-reveal');
      // index dans la fratrie pour stagger
      var parent = n.parentNode;
      var key = parent && parent.dataset ? (parent.dataset.cfKey || (parent.dataset.cfKey = 'p' + (Math.random()*1e6|0))) : 'root';
      sets[key] = (sets[key]||0);
      n.style.setProperty('--i', sets[key]);
      sets[key]++;
    });

    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){
          en.target.classList.add('cf-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    nodes.forEach(function(n){ io.observe(n); });
  }

  /* -------- 6. KPI counter animé (data-cf-count="1234") -------- */
  function animateCounters(){
    if(prefersReduced) return;
    var els = document.querySelectorAll('[data-cf-count]');
    els.forEach(function(el){
      var target = parseFloat(el.dataset.cfCount);
      if(isNaN(target)) return;
      var dur = parseInt(el.dataset.cfCountDur || '900', 10);
      var decimals = (el.dataset.cfCount.split('.')[1] || '').length;
      var start = performance.now();
      function step(t){
        var p = Math.min(1, (t - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        var v = target * eased;
        el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('fr-FR');
        if(p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /* -------- 7. Helper : .cf-loading sur form submit -------- */
  document.addEventListener('submit', function(e){
    var form = e.target;
    if(!form || form.dataset.cfNoLoading === '1') return;
    var btn = form.querySelector('button[type="submit"], input[type="submit"], .btn-submit');
    if(btn) btn.classList.add('cf-loading');
    // Sécurité : retire après 8s si on est encore là
    setTimeout(function(){ btn && btn.classList.remove('cf-loading'); }, 8000);
  });

  /* -------- 8. Init -------- */
  function init(){
    observeReveals(document);
    animateCounters();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-scan après mutations (nouvelles cards injectées par api.js)
  if('MutationObserver' in window){
    var debTimer;
    var mo = new MutationObserver(function(){
      clearTimeout(debTimer);
      debTimer = setTimeout(function(){ observeReveals(document); }, 120);
    });
    mo.observe(document.body || document.documentElement, { childList:true, subtree:true });
  }

  // Expose API minimale pour autres scripts
  window.cfTransitions = {
    setLoading: function(el, on){
      if(!el) return;
      el.classList.toggle('cf-loading', on !== false);
    },
    reveal: function(root){ observeReveals(root); },
    progress: makeProgress
  };

})();

/* ============================================================
   Pack 1-6 — UX premium runtime (2026-04-27)
   ============================================================ */
(function(){
  'use strict';
  if(window.__cfPacksLoaded) return;
  window.__cfPacksLoaded = true;

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------- PACK 1 — Track morph library → analyze -------- */
  // On /library : intercepte le clic sur .lib-row et tag les éléments AVANT la nav
  // pour que le browser cross-doc VT API matche les noms côté /analyze.
  function tagSourceForMorph(row){
    if(!row) return;
    var cover = row.querySelector('.lib-cover');
    var title = row.querySelector('.lib-t .n');
    var bpm   = row.querySelector('.lib-bpm');
    if(cover) cover.style.viewTransitionName = 'cf-track-cover';
    if(title) title.style.viewTransitionName = 'cf-track-title';
    if(bpm)   bpm.style.viewTransitionName   = 'cf-track-bpm';
  }
  document.addEventListener('click', function(e){
    if(prefersReduced) return;
    var row = e.target.closest('.lib-row');
    if(!row) return;
    // On ne tag que si la cible n'est pas une action interne (boutons, checkbox)
    if(e.target.closest('.lib-actions, .chk, [data-a]')) return;
    tagSourceForMorph(row);
  }, true); // capture phase pour devancer le handler row.click

  // Sur /analyze : tag le hero avec les mêmes noms
  function tagAnalyzeHero(){
    if(prefersReduced) return;
    if(!/\/analyze(\.|\?|$)/.test(location.pathname + location.search)) return;
    var cover = document.querySelector('.thero-cover');
    var title = document.getElementById('thero-title');
    var bpm   = document.getElementById('thero-bpm');
    if(cover) cover.style.viewTransitionName = 'cf-track-cover';
    if(title) title.style.viewTransitionName = 'cf-track-title';
    if(bpm)   bpm.style.viewTransitionName   = 'cf-track-bpm';
  }

  /* -------- PACK 2 — Waveform reveal sweep -------- */
  function revealWaveforms(root){
    if(prefersReduced) return;
    var nodes = (root || document).querySelectorAll(
      '.waveform, .wave-container, .wave-canvas, [data-wave-reveal], .stems-wave, canvas.wave, canvas.waveform'
    );
    nodes.forEach(function(n){
      if(n.dataset.cfWaveReveal === '1') return;
      // Skip s'il n'est pas encore visible (pas de taille)
      if(!n.offsetWidth) return;
      n.dataset.cfWaveReveal = '1';
      n.classList.remove('cf-wave-reveal'); // restart anim si déjà présent
      // force reflow
      void n.offsetWidth;
      n.classList.add('cf-wave-reveal');
      setTimeout(function(){ n.classList.remove('cf-wave-reveal'); }, 1200);
    });
  }

  /* -------- PACK 3 — Magnetic CTAs + hero parallax -------- */
  function bindMagnetic(btn){
    if(btn.__cfMag) return;
    btn.__cfMag = true;
    btn.classList.add('cf-magnetic');
    var rect;
    function onMove(e){
      rect = btn.getBoundingClientRect();
      var cx = rect.left + rect.width/2;
      var cy = rect.top  + rect.height/2;
      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      var dist = Math.hypot(dx, dy);
      var radius = Math.max(rect.width, rect.height) * 1.2;
      if(dist > radius){
        btn.style.transform = '';
        return;
      }
      var pull = 0.22;
      btn.style.transform = 'translate3d(' + (dx*pull) + 'px,' + (dy*pull) + 'px,0)';
    }
    function onLeave(){ btn.style.transform = ''; }
    document.addEventListener('mousemove', onMove);
    btn.addEventListener('mouseleave', onLeave);
  }
  function initMagnetic(){
    if(prefersReduced) return;
    if(matchMedia('(pointer: coarse)').matches) return; // skip touch
    document.querySelectorAll(
      '.hero .btn-primary, .hero-actions .btn-primary, [data-magnetic], .pricing .btn-primary, .cf-magnetic'
    ).forEach(bindMagnetic);
  }
  function initParallax(){
    if(prefersReduced) return;
    if(matchMedia('(pointer: coarse)').matches) return;
    var heroes = document.querySelectorAll('.hero');
    if(!heroes.length) return;
    document.addEventListener('mousemove', function(e){
      heroes.forEach(function(h){
        var r = h.getBoundingClientRect();
        // skip si hors viewport vertical
        if(r.bottom < 0 || r.top > window.innerHeight) return;
        var nx = ((e.clientX - r.left) / r.width  - 0.5) * 2;  // -1..1
        var ny = ((e.clientY - r.top)  / r.height - 0.5) * 2;
        h.style.setProperty('--cf-px', (nx * 12).toFixed(1));
        h.style.setProperty('--cf-py', (ny * 8).toFixed(1));
      });
    }, { passive:true });
  }

  /* -------- PACK 4 — Sliding tab indicator (FLIP) -------- */
  function initSlidingTabs(){
    if(prefersReduced) return;
    // Conteneurs candidats : groupes de view-chip / tab-btn / nav-item siblings
    var candidates = [];
    var groups = document.querySelectorAll('#views, .views, .tabs, .tool-group, .nav-tabs, .seg, [data-cf-tabs]');
    groups.forEach(function(g){
      if(g.querySelector('.view-chip, [class*="tab-btn"], .nav-item, [role="tab"], [data-tab]')){
        candidates.push(g);
      }
    });
    candidates.forEach(setupTabHost);
  }
  function setupTabHost(host){
    if(host.__cfTabs) return;
    host.__cfTabs = true;
    host.classList.add('cf-tabs-host');
    if(getComputedStyle(host).position === 'static') host.style.position = 'relative';

    var bar = document.createElement('span');
    bar.className = 'cf-tabs-track';
    bar.style.opacity = '0';
    host.appendChild(bar);

    function getActive(){
      return host.querySelector(
        '.view-chip.active, [role="tab"][aria-selected="true"], .nav-item.active, ' +
        '.nav-item[aria-current="page"], .tab.active, .tab-btn.active, [data-tab].active, ' +
        '.tool-btn.active'
      );
    }
    function moveTo(el){
      if(!el){ bar.style.opacity = '0'; return; }
      var hostRect = host.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      var x = r.left - hostRect.left + 12;
      var w = Math.max(8, r.width - 24);
      bar.style.opacity = '1';
      bar.style.transform = 'translate3d(' + x + 'px, 0, 0)';
      bar.style.width = w + 'px';
    }
    moveTo(getActive());

    // Re-position après tout changement DOM ou clic
    host.addEventListener('click', function(){
      requestAnimationFrame(function(){ moveTo(getActive()); });
      setTimeout(function(){ moveTo(getActive()); }, 60);
    });
    new MutationObserver(function(){ moveTo(getActive()); })
      .observe(host, { subtree:true, attributes:true, attributeFilter:['class','aria-selected','aria-current'] });
    window.addEventListener('resize', function(){ moveTo(getActive()); });
  }

  /* -------- PACK 5 — Play button → EQ bars morph -------- */
  function morphPlayButton(btn, playing){
    if(!btn) return;
    if(playing){
      if(!btn.querySelector('.cf-eq')){
        var eq = document.createElement('span');
        eq.className = 'cf-eq';
        eq.innerHTML = '<span></span><span></span><span></span>';
        btn.appendChild(eq);
      }
      btn.classList.add('cf-playing');
    } else {
      var eqEl = btn.querySelector('.cf-eq');
      if(eqEl) eqEl.remove();
      btn.classList.remove('cf-playing');
    }
  }
  // Watch for elements gaining class .playing or attr data-playing="1"
  function scanPlayButtons(){
    document.querySelectorAll('.play, [data-play], .play-btn').forEach(function(btn){
      var on = btn.classList.contains('playing') ||
               btn.dataset.playing === '1' ||
               (btn.parentElement && btn.parentElement.classList.contains('playing'));
      var was = btn.classList.contains('cf-playing');
      if(on && !was) morphPlayButton(btn, true);
      else if(!on && was) morphPlayButton(btn, false);
    });
  }
  // Expose API pour que le reste du code l'appelle
  window.cfTransitions = window.cfTransitions || {};
  window.cfTransitions.setPlaying = function(btn, on){ morphPlayButton(btn, on); };

  /* -------- PACK 6 — Hot cue ripple + glow pulse -------- */
  // Watch pour les nouveaux .cue-marker injectés
  function pulseCue(marker){
    if(!marker) return;
    marker.classList.remove('cf-cue-pulse');
    void marker.offsetWidth;
    marker.classList.add('cf-cue-pulse');
    // Couleur héritée du tip pour le glow
    var tip = marker.querySelector('.cue-tip');
    if(tip){
      var color = getComputedStyle(tip).backgroundColor;
      marker.style.color = color;
    }
    setTimeout(function(){ marker.classList.remove('cf-cue-pulse'); }, 760);
  }
  function spawnCueRipple(host, x, color){
    if(!host) return;
    var r = document.createElement('span');
    r.className = 'cf-cue-ripple';
    r.style.left = x + 'px';
    r.style.top  = '50%';
    r.style.color = color || 'var(--amber, #ff7a18)';
    r.style.background = 'radial-gradient(circle, ' + (color||'var(--amber,#ff7a18)') + ' 0%, transparent 70%)';
    if(getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(r);
    setTimeout(function(){ r.remove(); }, 800);
  }
  // MutationObserver pour détecter les nouveaux markers cue posés
  function watchCues(){
    var canvas = document.querySelector('.canvas, .wave-container, .waveform-host, [data-wave-host]');
    if(!canvas) return;
    var mo = new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(n.nodeType === 1 && n.classList && n.classList.contains('cue-marker')){
            // Pulse + ripple à la position
            pulseCue(n);
            var rect = canvas.getBoundingClientRect();
            var nrect = n.getBoundingClientRect();
            var x = nrect.left - rect.left + nrect.width/2;
            var color = (n.querySelector('.cue-tip') && getComputedStyle(n.querySelector('.cue-tip')).backgroundColor) || 'var(--amber)';
            spawnCueRipple(canvas, x, color);
          }
        });
      });
    });
    mo.observe(canvas, { childList:true, subtree:true });
  }
  // Expose API publique
  window.cfTransitions.pulseCue = pulseCue;
  window.cfTransitions.cueRipple = spawnCueRipple;

  /* -------- INIT all packs -------- */
  function initAll(){
    tagAnalyzeHero();
    revealWaveforms(document);
    initMagnetic();
    initParallax();
    initSlidingTabs();
    scanPlayButtons();
    watchCues();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
  // Re-scan au prochain frame après injection de contenu (api.js / fetch)
  if('MutationObserver' in window){
    var t;
    new MutationObserver(function(){
      clearTimeout(t);
      t = setTimeout(function(){
        revealWaveforms(document);
        initMagnetic();
        scanPlayButtons();
      }, 180);
    }).observe(document.body || document.documentElement, { childList:true, subtree:true });
  }

  // Re-scan attribute changes (.playing class flips)
  if('MutationObserver' in window){
    new MutationObserver(scanPlayButtons).observe(
      document.body || document.documentElement,
      { subtree:true, attributes:true, attributeFilter:['class','data-playing'] }
    );
  }
})();

/* ============================================================
   BATCH 2 — 8 features premium runtime (2026-04-27)
   A: Cmd+K palette · B: Spotlight · C: Scroll-hero ·
   D: Theme wipe · E: Skeleton morph · F: Confetti BPM ·
   G: Number scrub · H: Achievement toasts
   ============================================================ */
(function(){
  'use strict';
  if(window.__cfBatch2Loaded) return;
  window.__cfBatch2Loaded = true;

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia &&
    window.matchMedia('(pointer: coarse)').matches;

  var CF = window.cfTransitions = window.cfTransitions || {};

  /* ============================================================
     A. Cmd+K Command Palette
     ============================================================ */
  var PAL_PAGES = [
    { ttl:'Library',     ctx:'Toutes tes tracks',    href:'/v4/library.html',     icon:'🎵', kbd:'G L' },
    { ttl:'Analyze',     ctx:'Détail track + cues',   href:'/v4/analyze.html',     icon:'🎧', kbd:'G A' },
    { ttl:'Set Builder', ctx:'Construire un set',     href:'/v4/set-builder.html', icon:'💿', kbd:'G S' },
    { ttl:'Mix Studio',  ctx:'Mashup MIK-style',      href:'/v4/mix-studio.html',  icon:'🎚️', kbd:'G M' },
    { ttl:'Stats',       ctx:'Tes statistiques',      href:'/v4/stats.html',       icon:'📊', kbd:'G T' },
    { ttl:'Settings',    ctx:'Préférences + thème',   href:'/v4/settings.html',    icon:'⚙️', kbd:'G P' },
    { ttl:'Upload',      ctx:'Drop un fichier',       href:'/v4/upload.html',      icon:'⬆️', kbd:'⌘ U' },
    { ttl:'Pricing',     ctx:'Plans & abonnement',    href:'/v4/pricing.html',     icon:'💎' },
    { ttl:'Admin',       ctx:'Console admin',          href:'/v4/admin.html',       icon:'🛡️' },
    { ttl:'Billing',     ctx:'Facturation',           href:'/v4/billing.html',     icon:'💳' },
    { ttl:'Onboarding',  ctx:'Guide démarrage',       href:'/v4/onboarding.html',  icon:'🚀' },
    { ttl:'Compatible',  ctx:'Tracks compatibles',    href:'/v4/compatible.html',  icon:'🔗' },
    { ttl:'Blog',        ctx:'Articles & nouveautés',  href:'/v4/blog.html',        icon:'📝' },
    { ttl:'Docs',        ctx:'Documentation',          href:'/v4/docs.html',        icon:'📚' },
    { ttl:'Changelog',   ctx:'Historique des versions', href:'/v4/changelog.html',  icon:'🗒️' },
    { ttl:'Download',    ctx:'App desktop',            href:'/v4/download.html',    icon:'💻' }
  ];
  var PAL_ACTIONS = [
    { ttl:'Switch theme',     ctx:'Dark / Light',     run:function(e){ CF.themeWipe(e); }, icon:'🌗', kbd:'⌘⇧T' },
    { ttl:'Lancer une analyse', ctx:'Upload + analyse', href:'/v4/upload.html',  icon:'⚡' },
    { ttl:'Achievement test',   ctx:'Demo toast',       run:function(){ CF.achievement('🎵','Test achievement','Cmd+K marche'); }, icon:'⭐' }
  ];

  var paletteEl = null, paletteInput = null, paletteList = null;
  var palItems = [], palActive = 0;

  function buildPalette(){
    if(paletteEl) return;
    paletteEl = document.createElement('div');
    paletteEl.className = 'cf-palette-overlay';
    paletteEl.innerHTML =
      '<div class="cf-palette" onclick="event.stopPropagation()">' +
        '<input class="cf-palette-input" placeholder="Cherche une page, une action…">' +
        '<div class="cf-palette-list"></div>' +
      '</div>';
    document.body.appendChild(paletteEl);
    paletteInput = paletteEl.querySelector('.cf-palette-input');
    paletteList  = paletteEl.querySelector('.cf-palette-list');
    paletteEl.addEventListener('click', function(e){ if(e.target===paletteEl) closePalette(); });
    paletteInput.addEventListener('input', function(){ renderPalette(paletteInput.value); });
  }

  function renderPalette(q){
    q = (q||'').toLowerCase().trim();
    paletteList.innerHTML = '';
    palItems = []; palActive = 0;

    function section(name, list, icon){
      var matches = list.filter(function(i){
        return !q || i.ttl.toLowerCase().indexOf(q)>=0 || (i.ctx||'').toLowerCase().indexOf(q)>=0;
      });
      if(!matches.length) return;
      var h = document.createElement('div'); h.className='cf-palette-section'; h.textContent=name;
      paletteList.appendChild(h);
      matches.forEach(function(i){
        var el = document.createElement('div'); el.className='cf-palette-item';
        el.innerHTML =
          '<div class="ico">'+(i.icon||icon)+'</div>' +
          '<div><div class="ttl"></div><div class="ctx"></div></div>' +
          (i.kbd ? '<span class="kbd">'+i.kbd+'</span>' : '');
        el.querySelector('.ttl').textContent = i.ttl;
        el.querySelector('.ctx').textContent = i.ctx || '';
        el.addEventListener('click', function(e){
          if(i.run){ i.run(e); closePalette(); }
          else if(i.href){ closePalette(); location.href = i.href; }
        });
        paletteList.appendChild(el);
        palItems.push(el);
      });
    }
    section('Pages',   PAL_PAGES,   '📄');
    section('Actions', PAL_ACTIONS, '⚡');

    if(!palItems.length){
      paletteList.innerHTML = '<div style="padding:32px;text-align:center;color:var(--c-tertiary);font-size:13px">Aucun résultat pour "'+q+'"</div>';
    } else {
      palItems[0].classList.add('active');
    }
  }

  function openPalette(){
    buildPalette();
    paletteEl.classList.add('open');
    paletteInput.value=''; paletteInput.focus();
    renderPalette('');
  }
  function closePalette(){
    if(paletteEl) paletteEl.classList.remove('open');
  }

  document.addEventListener('keydown', function(e){
    var key = (e.key||'').toLowerCase();
    if((e.metaKey||e.ctrlKey) && key==='k'){
      e.preventDefault();
      paletteEl && paletteEl.classList.contains('open') ? closePalette() : openPalette();
      return;
    }
    if(!paletteEl || !paletteEl.classList.contains('open')) return;
    if(e.key==='Escape'){ closePalette(); return; }
    if(e.key==='ArrowDown' || e.key==='ArrowUp'){
      e.preventDefault();
      if(!palItems.length) return;
      palItems[palActive] && palItems[palActive].classList.remove('active');
      palActive = (palActive + (e.key==='ArrowDown'?1:-1) + palItems.length) % palItems.length;
      palItems[palActive].classList.add('active');
      palItems[palActive].scrollIntoView({block:'nearest'});
      return;
    }
    if(e.key==='Enter' && palItems[palActive]){ palItems[palActive].click(); }
  });

  CF.openPalette = openPalette;
  CF.closePalette = closePalette;
  CF.addPaletteItem = function(item, section){
    var bucket = section==='actions' ? PAL_ACTIONS : PAL_PAGES;
    bucket.push(item);
  };

  /* ============================================================
     B. Cursor spotlight
     ============================================================ */
  function bindSpot(host){
    if(host.__cfSpot) return; host.__cfSpot = true;
    host.classList.add('cf-spot-host');
    host.addEventListener('mousemove', function(e){
      var r = host.getBoundingClientRect();
      host.style.setProperty('--cf-mx', (e.clientX - r.left) + 'px');
      host.style.setProperty('--cf-my', (e.clientY - r.top) + 'px');
      host.classList.add('cf-spot-active');
    });
    host.addEventListener('mouseleave', function(){
      host.classList.remove('cf-spot-active');
    });
  }
  function initSpot(){
    if(prefersReduced || coarse) return;
    document.querySelectorAll('.hero, [data-cf-spot]').forEach(bindSpot);
  }

  /* ============================================================
     C. Scroll-driven hero (subtle)
     ============================================================ */
  function initScrollHero(){
    if(prefersReduced) return;
    var hero = document.querySelector('.hero');
    if(!hero) return;
    var h1 = hero.querySelector('h1');
    var blobs = hero.querySelectorAll('.hero-blob, [data-cf-blob]');
    if(!h1 && !blobs.length) return;
    function onScroll(){
      var r = hero.getBoundingClientRect();
      // progress 0 (top of viewport) → 1 (bottom of hero leaves view)
      var p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height)));
      if(h1){
        h1.style.transform = 'translateY(' + (p * -22) + 'px) scale(' + (1 - p*.04) + ')';
        h1.style.opacity = String(1 - p*.5);
      }
      blobs.forEach(function(b, i){
        var dir = i%2 ? -1 : 1;
        b.style.transform = 'translate(' + (p*40*dir) + 'px,' + (p*-30) + 'px)';
      });
    }
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();
  }

  /* ============================================================
     D. Theme switch radial wipe
     ============================================================ */
  CF.themeWipe = function(eventOrXY, toTheme){
    if(prefersReduced){
      // Just toggle without animation
      var cur = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = toTheme || (cur==='light' ? '' : 'light');
      return;
    }
    var x, y;
    if(eventOrXY && eventOrXY.clientX != null){
      x = eventOrXY.clientX; y = eventOrXY.clientY;
    } else if(eventOrXY && eventOrXY.x != null){
      x = eventOrXY.x; y = eventOrXY.y;
    } else {
      x = window.innerWidth/2; y = 50;
    }
    var overlay = document.createElement('div');
    overlay.className = 'cf-wipe-overlay';
    overlay.style.setProperty('--cf-wx', (x/window.innerWidth*100) + '%');
    overlay.style.setProperty('--cf-wy', (y/window.innerHeight*100) + '%');
    document.body.appendChild(overlay);
    setTimeout(function(){
      var cur = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = toTheme || (cur==='light' ? '' : 'light');
      try{ localStorage.setItem('cf_theme', document.documentElement.dataset.theme || 'dark'); }catch(e){}
    }, 320);
    setTimeout(function(){ overlay.remove(); }, 880);
  };
  // Auto-hook : intercept clicks on theme toggle buttons (any element with [data-theme-toggle])
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-theme-toggle], [data-cf-theme]');
    if(!t) return;
    e.preventDefault();
    e.stopPropagation();
    CF.themeWipe(e);
  }, true);

  /* ============================================================
     E. Skeleton → content morph
     ============================================================ */
  CF.morphSkeleton = function(el, content){
    if(!el) return;
    if(prefersReduced){
      if(typeof content === 'string') el.innerHTML = content;
      else if(content instanceof Node){ el.innerHTML=''; el.appendChild(content); }
      return;
    }
    el.classList.add('cf-morph-out');
    setTimeout(function(){
      el.classList.remove('cf-morph-out');
      if(typeof content === 'string'){ el.innerHTML = content; }
      else if(content instanceof Node){ el.innerHTML=''; el.appendChild(content); }
      el.classList.add('cf-morph-in');
      setTimeout(function(){ el.classList.remove('cf-morph-in'); }, 700);
    }, 600);
  };

  /* ============================================================
     F. Confetti BPM-synced
     ============================================================ */
  var CONF_COLORS = ['#ff7a18','#ff2e6b','#8b5cf6','#5ee0ff','#f4f1ec'];
  CF.confetti = function(opts){
    if(prefersReduced) return;
    opts = opts || {};
    var bpm = opts.bpm || 128;
    var beats = opts.beats || 6;
    var origin = opts.origin || null; // {x,y} ou null = centre haut
    var scoped = opts.host || null;   // élément où injecter (sinon body)
    var beatMs = 60000 / bpm;

    var canvas = document.createElement('div');
    canvas.className = 'cf-confetti-canvas' + (scoped ? ' scoped' : '');
    if(scoped){
      if(getComputedStyle(scoped).position === 'static') scoped.style.position = 'relative';
      scoped.appendChild(canvas);
    } else {
      document.body.appendChild(canvas);
    }
    var rect = (scoped || document.body).getBoundingClientRect();
    var cx = origin ? origin.x : rect.width/2;
    var cy = origin ? origin.y : rect.height * 0.4;

    var beat = 0;
    function pop(){
      if(beat++ >= beats){
        setTimeout(function(){ canvas.remove(); }, 2400);
        return;
      }
      var n = 14 + (beat===1 ? 6 : 0); // premier beat plus dense
      for(var i=0;i<n;i++){
        var p = document.createElement('div');
        p.className = 'cf-confetti-piece';
        p.style.left = (cx + (Math.random()-.5)*40) + 'px';
        p.style.top  = cy + 'px';
        p.style.background = CONF_COLORS[Math.floor(Math.random()*CONF_COLORS.length)];
        p.style.setProperty('--cf-tx', ((Math.random()-.5)*420) + 'px');
        p.style.setProperty('--cf-ty', (Math.random()*200 + 120) + 'px');
        p.style.setProperty('--cf-tr', (Math.random()*720 - 360) + 'deg');
        p.style.setProperty('--cf-dur', (1800 + Math.random()*900) + 'ms');
        canvas.appendChild(p);
        (function(node){ setTimeout(function(){ node.remove(); }, 2700); })(p);
      }
      setTimeout(pop, beatMs);
    }
    pop();
  };

  /* ============================================================
     G. Number scrub on [data-cf-scrub] inputs
     ============================================================ */
  function bindScrub(el){
    if(el.__cfScrub) return; el.__cfScrub = true;
    el.classList.add('cf-scrub');
    var min = parseFloat(el.dataset.cfMin || el.min || '0');
    var max = parseFloat(el.dataset.cfMax || el.max || '999');
    var step = parseFloat(el.dataset.cfStep || el.step || '1');
    var decimals = parseInt(el.dataset.cfDecimals || ((step+'').split('.')[1]||'').length || '0', 10);
    var dragging=false, startY=0, startVal=0;

    el.addEventListener('pointerdown', function(e){
      if(e.button !== 0) return;
      dragging=true; startY=e.clientY;
      startVal = parseFloat(el.value || el.textContent || '0') || 0;
      el.classList.add('cf-scrubbing');
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      document.body.style.cursor='ns-resize';
      e.preventDefault();
    });
    el.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var dy = startY - e.clientY;
      var mult = e.shiftKey ? 5 : (e.altKey ? .25 : 1);
      var v = startVal + (dy/4) * step * mult;
      v = Math.max(min, Math.min(max, v));
      v = Math.round(v/step) * step;
      var formatted = v.toFixed(decimals);
      if('value' in el) el.value = formatted;
      else el.textContent = formatted;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    function stop(){
      dragging=false;
      el.classList.remove('cf-scrubbing');
      document.body.style.cursor='';
    }
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  }
  function initScrub(){
    if(prefersReduced || coarse) return;
    document.querySelectorAll('[data-cf-scrub]').forEach(bindScrub);
  }
  CF.scrub = bindScrub;

  /* ============================================================
     H. Achievement toasts
     ============================================================ */
  function ensureAchFeed(){
    var feed = document.querySelector('.cf-ach-feed');
    if(feed) return feed;
    feed = document.createElement('div');
    feed.className = 'cf-ach-feed';
    document.body.appendChild(feed);
    return feed;
  }
  CF.achievement = function(icon, title, ctx, opts){
    opts = opts || {};
    var feed = ensureAchFeed();
    var t = document.createElement('div');
    t.className = 'cf-ach';
    t.innerHTML =
      '<div class="badge"></div>' +
      '<div><div class="ttl"></div><div class="ctx"></div></div>';
    t.querySelector('.badge').textContent = icon || '⭐';
    t.querySelector('.ttl').textContent = title || 'Achievement';
    t.querySelector('.ctx').textContent = ctx || '';
    feed.appendChild(t);

    // Cap to 4 visible
    while(feed.children.length > 4){
      var old = feed.firstElementChild;
      old.classList.add('leaving');
      setTimeout(function(n){ return function(){ n.remove(); }; }(old), 300);
    }
    var dur = opts.duration || 5000;
    setTimeout(function(){
      if(t.parentNode){ t.classList.add('leaving'); setTimeout(function(){ t.remove(); }, 300); }
    }, dur);
    return t;
  };

  /* ============================================================
     INIT
     ============================================================ */
  function initBatch2(){
    initSpot();
    initScrollHero();
    initScrub();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initBatch2);
  } else {
    initBatch2();
  }
  // Re-scan on mutations (new spotlight hosts / scrub inputs injected later)
  if('MutationObserver' in window){
    var t;
    new MutationObserver(function(){
      clearTimeout(t);
      t = setTimeout(function(){ initSpot(); initScrub(); }, 200);
    }).observe(document.body || document.documentElement, { childList:true, subtree:true });
  }
})();
