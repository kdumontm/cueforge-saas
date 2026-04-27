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
