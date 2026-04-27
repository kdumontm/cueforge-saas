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
