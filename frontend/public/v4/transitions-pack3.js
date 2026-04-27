/* ========================================
   TrackCue Transitions Pack 3 · JavaScript
   30 Advanced UX Transitions
   API: window.cfTr3
   IIFE + Guard | Opt-in binding | Idempotent
   Production-ready · isolated from batches 1-2
   ======================================== */

(function() {
  'use strict';

  // Guard against double-load
  if (window.__cfTr3Loaded) return;
  window.__cfTr3Loaded = true;

  // Shared state
  const state = {
    activeTilts: new WeakMap(),
    activeRepulse: null,
    globalMouseX: 0,
    globalMouseY: 0,
    scrolling: false,
  };

  // ===== HELPERS =====

  function forceReflow(el) {
    return el.offsetWidth;
  }

  function clearWillChange(el) {
    if (el) el.style.willChange = 'auto';
  }

  function handlePreferReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function handlePointerCoarse() {
    return window.matchMedia('(pointer: coarse)').matches;
  }

  // ===== PAGE TRANSITIONS (1-5) =====

  const pageTransitions = {
    'iris-zoom': function(opts = {}) {
      if (!opts.from || !opts.to) return;
      opts.duration = opts.duration || 600;

      const { from, to, origin = { x: 0.5, y: 0.5 }, onComplete } = opts;

      const exitEl = document.createElement('div');
      exitEl.className = 'cf-tr3-iris-page cf-tr3-exit';
      exitEl.style.cssText = `
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        clip-path: circle(100% at ${origin.x * 100}% ${origin.y * 100}%);
      `;
      exitEl.appendChild(from.cloneNode(true));

      const container = document.createElement('div');
      container.style.cssText = 'position: relative; width: 100%; height: 100%;';
      container.appendChild(exitEl);

      setTimeout(() => {
        const enterEl = document.createElement('div');
        enterEl.className = 'cf-tr3-iris-page cf-tr3-enter';
        enterEl.style.cssText = `
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          clip-path: circle(0% at ${origin.x * 100}% ${origin.y * 100}%);
          animation-delay: ${opts.duration / 2}ms;
        `;
        enterEl.appendChild(to.cloneNode(true));
        container.appendChild(enterEl);

        setTimeout(() => {
          container.remove();
          if (onComplete) onComplete();
        }, opts.duration * 2);
      }, opts.duration / 2);

      return container;
    },

    'curtain': function(opts = {}) {
      opts.duration = opts.duration || 800;
      const { from, to, onComplete } = opts;

      const curtain = document.createElement('div');
      curtain.style.cssText = 'position: relative; width: 100%; height: 100%;';

      const left = document.createElement('div');
      left.className = 'cf-tr3-curtain-left';
      left.style.cssText = 'position: absolute; top: 0; left: 0; width: 50%; height: 100%;';

      const right = document.createElement('div');
      right.className = 'cf-tr3-curtain-right';
      right.style.cssText = 'position: absolute; top: 0; right: 0; width: 50%; height: 100%;';

      curtain.appendChild(left);
      curtain.appendChild(right);

      const content = document.createElement('div');
      content.style.cssText = 'position: relative; z-index: 1;';
      content.appendChild(to.cloneNode(true));
      curtain.appendChild(content);

      setTimeout(() => {
        curtain.remove();
        if (onComplete) onComplete();
      }, opts.duration);

      return curtain;
    },

    'flip3d': function(opts = {}) {
      opts.duration = opts.duration || 800;
      const { from, to, onComplete } = opts;

      const card = document.createElement('div');
      card.className = 'cf-tr3-card-3d cf-tr3-flip';
      card.style.cssText = `
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        perspective: 1200px;
      `;
      card.appendChild(to.cloneNode(true));

      setTimeout(() => {
        card.remove();
        if (onComplete) onComplete();
      }, opts.duration);

      return card;
    },

    'cube': function(opts = {}) {
      opts.duration = opts.duration || 800;
      const { from, to, onComplete } = opts;

      const cube = document.createElement('div');
      cube.className = 'cf-tr3-cube-stage';
      cube.style.cssText = 'position: absolute; inset: 0; perspective: 1000px;';

      const face = document.createElement('div');
      face.className = 'cf-tr3-cube-face cf-tr3-active';
      face.style.cssText = 'position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;';
      face.appendChild(to.cloneNode(true));
      cube.appendChild(face);

      setTimeout(() => {
        cube.remove();
        if (onComplete) onComplete();
      }, opts.duration);

      return cube;
    },

    'glitch': function(opts = {}) {
      opts.duration = opts.duration || 400;
      const { from, to, onComplete } = opts;

      const glitch = document.createElement('div');
      glitch.className = 'cf-tr3-glitch-stage';
      glitch.style.cssText = 'position: relative; width: 100%; height: 100%;';

      const text = document.createElement('div');
      text.className = 'cf-tr3-glitch-text';
      text.appendChild(to.cloneNode(true));
      glitch.appendChild(text);

      const r = text.cloneNode(true);
      r.className = 'cf-tr3-glitch-r';
      r.style.cssText = 'position: absolute; left: 0; top: 0; color: rgba(255, 46, 107, 0.8);';
      glitch.appendChild(r);

      const g = text.cloneNode(true);
      g.className = 'cf-tr3-glitch-g';
      g.style.cssText = 'position: absolute; left: 0; top: 0; color: rgba(94, 224, 255, 0.8);';
      glitch.appendChild(g);

      const b = text.cloneNode(true);
      b.className = 'cf-tr3-glitch-b';
      b.style.cssText = 'position: absolute; left: 0; top: 0; color: rgba(255, 122, 24, 0.8);';
      glitch.appendChild(b);

      setTimeout(() => {
        glitch.remove();
        if (onComplete) onComplete();
      }, opts.duration);

      return glitch;
    }
  };

  // ===== ELEMENT ENTRANCE (6-10) =====

  function applyStagger(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-stagger');
  }

  function applyScaleSpring(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-scale-spring');
    el.addEventListener('animationend', () => clearWillChange(el), { once: true });
  }

  function applyMaskReveal(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    const content = document.createElement('div');
    content.className = 'cf-tr3-mask-reveal-content';
    content.innerHTML = el.innerHTML;
    el.innerHTML = '';
    el.classList.add('cf-tr3-mask-reveal');
    el.appendChild(content);
  }

  function applyBlurUp(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-blur-up');
    el.addEventListener('animationend', () => clearWillChange(el), { once: true });
  }

  function applyOrigami(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-origami');
    el.addEventListener('animationend', () => clearWillChange(el), { once: true });
  }

  // ===== TEXT EFFECTS (11-15) =====

  function applyTypewriter(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-typewriter');
  }

  function applyWords(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    const text = el.textContent;
    el.innerHTML = '';
    el.classList.add('cf-tr3-words');

    text.split(/\s+/).forEach(word => {
      const span = document.createElement('span');
      span.textContent = word;
      el.appendChild(span);
    });
  }

  function applyChars(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    const text = el.textContent;
    el.innerHTML = '';
    el.classList.add('cf-tr3-chars');

    [...text].forEach(char => {
      const span = document.createElement('span');
      span.textContent = char;
      el.appendChild(span);
    });
  }

  function applyMaskWave(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-mask-wave');
  }

  function applyCount(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    const count = el.getAttribute('data-cf-tr3-count') || '9999';
    el.innerHTML = '';
    el.classList.add('cf-tr3-count');

    [...String(count).padStart(4, '0')].forEach(digit => {
      const span = document.createElement('span');
      span.textContent = digit;
      el.appendChild(span);
    });
  }

  // ===== BUTTONS / MICRO-INTERACTIONS (16-20) =====

  function applyLiquid(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-liquid');
  }

  function applyRepulse(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    state.activeRepulse = el;

    const items = el.querySelectorAll('.cf-tr3-repulse-item');
    items.forEach(item => {
      if (!item.__cfTr3) {
        item.__cfTr3 = true;
        item.style.willChange = 'transform';
      }
    });
  }

  function applyGlowTrail(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-glow-trail');
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
  }

  function applyShake(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-shake');
    setTimeout(() => el.classList.remove('cf-tr3-shake'), 400);
  }

  function applySuccess(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-success');
  }

  // ===== LOADING / STATES (21-25) =====

  function applyBreath(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;
    el.classList.add('cf-tr3-breath');
  }

  function applyProgress(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    const progress = el.getAttribute('data-cf-tr3-progress') || '0.5';
    const numChildren = parseInt(progress * 4) || 1;

    el.innerHTML = '';
    for (let i = 0; i < numChildren; i++) {
      const marker = document.createElement('div');
      marker.style.background = 'currentColor';
      el.appendChild(marker);
    }
  }

  function applySpinCheck(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    el.classList.add('cf-tr3-spin-check');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 60 60');
    svg.style.cssText = 'width: 60px; height: 60px;';

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '30');
    circle.setAttribute('cy', '30');
    circle.setAttribute('r', '28');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('fill', 'none');
    circle.className = 'cf-tr3-spin-circle';
    circle.style.color = 'var(--cf-tr3-amber)';

    svg.appendChild(circle);
    el.appendChild(svg);
  }

  function applyDots(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    el.innerHTML = '';
    el.classList.add('cf-tr3-dots');

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: currentColor;
      `;
      el.appendChild(dot);
    }
  }

  function applyBrandReveal(el, text = 'TRACKCUE') {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    el.innerHTML = '';
    el.classList.add('cf-tr3-brand-reveal');

    [...text].forEach(char => {
      const span = document.createElement('span');
      span.textContent = char;
      el.appendChild(span);
    });
  }

  // ===== HOVER / SCROLL-DRIVEN (26-30) =====

  function applyTilt(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    el.classList.add('cf-tr3-tilt');
    el.style.willChange = 'transform';

    state.activeTilts.set(el, {
      x: 0,
      y: 0,
    });
  }

  function applyBorderDraw(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    el.classList.add('cf-tr3-border-draw');

    // Create border sides
    const v1 = document.createElement('div');
    v1.className = 'cf-tr3-border-v';
    v1.style.cssText = 'position: absolute; left: 0; top: 0; width: 2px; height: 0; background: currentColor;';
    el.appendChild(v1);

    const v2 = document.createElement('div');
    v2.className = 'cf-tr3-border-v';
    v2.style.cssText = 'position: absolute; right: 0; top: 0; width: 2px; height: 0; background: currentColor;';
    el.appendChild(v2);
  }

  function applyMarquee(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    el.classList.add('cf-tr3-marquee');

    const text = el.textContent;
    el.innerHTML = '';

    const marquee = document.createElement('div');
    marquee.textContent = text;
    marquee.style.cssText = `
      animation: cf-tr3-marquee-scroll 10s linear infinite;
      white-space: nowrap;
      will-change: transform;
      padding: 0 20px;
    `;

    el.appendChild(marquee);

    // Clone for seamless loop
    const clone = marquee.cloneNode(true);
    el.appendChild(clone);
  }

  function applyStickyHeader(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    el.classList.add('cf-tr3-sticky-shrink');

    const container = el.closest('[data-cf-tr3-sticky-container]') || el.parentElement;
    if (container && container.style.position !== 'relative') {
      container.style.position = 'relative';
    }
  }

  function applySnap(el) {
    if (el.__cfTr3) return;
    el.__cfTr3 = true;

    el.classList.add('cf-tr3-snap');
  }

  // ===== GLOBAL LISTENERS =====

  const observerConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-cf-tr3-progress', 'data-cf-tr3-count', 'data-cf-tr3-shake'] };
  let observerTimer;

  const observer = new MutationObserver((mutations) => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
      mutations.forEach(mut => {
        if (mut.type === 'attributes') {
          const el = mut.target;

          if (mut.attributeName === 'class') {
            // Element entrance (6-10)
            if (el.classList.contains('cf-tr3-stagger')) applyStagger(el);
            if (el.classList.contains('cf-tr3-scale-spring')) applyScaleSpring(el);
            if (el.classList.contains('cf-tr3-mask-reveal')) applyMaskReveal(el);
            if (el.classList.contains('cf-tr3-blur-up')) applyBlurUp(el);
            if (el.classList.contains('cf-tr3-origami')) applyOrigami(el);

            // Text effects (11-15)
            if (el.classList.contains('cf-tr3-typewriter')) applyTypewriter(el);
            if (el.classList.contains('cf-tr3-words')) applyWords(el);
            if (el.classList.contains('cf-tr3-chars')) applyChars(el);
            if (el.classList.contains('cf-tr3-mask-wave')) applyMaskWave(el);

            // Buttons / micro (16-20)
            if (el.classList.contains('cf-tr3-liquid')) applyLiquid(el);
            if (el.classList.contains('cf-tr3-repulse')) applyRepulse(el);
            if (el.classList.contains('cf-tr3-glow-trail')) applyGlowTrail(el);

            // Loading / states (21-25)
            if (el.classList.contains('cf-tr3-breath')) applyBreath(el);
            if (el.classList.contains('cf-tr3-spin-check')) applySpinCheck(el);
            if (el.classList.contains('cf-tr3-dots')) applyDots(el);
            if (el.classList.contains('cf-tr3-brand-reveal')) applyBrandReveal(el);

            // Hover / scroll (26-30)
            if (el.classList.contains('cf-tr3-tilt')) applyTilt(el);
            if (el.classList.contains('cf-tr3-border-draw')) applyBorderDraw(el);
            if (el.classList.contains('cf-tr3-marquee')) applyMarquee(el);
            if (el.classList.contains('cf-tr3-sticky-shrink')) applyStickyHeader(el);
            if (el.classList.contains('cf-tr3-snap')) applySnap(el);
          }

          if (mut.attributeName === 'data-cf-tr3-progress') applyProgress(el);
          if (mut.attributeName === 'data-cf-tr3-count') applyCount(el);
          if (mut.attributeName === 'data-cf-tr3-shake') applyShake(el);
        }

        if (mut.type === 'childList') {
          mut.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              // Check new element
              if (node.classList && node.classList.contains('cf-tr3-stagger')) applyStagger(node);
              if (node.classList && node.classList.contains('cf-tr3-scale-spring')) applyScaleSpring(node);
              if (node.classList && node.classList.contains('cf-tr3-chars')) applyChars(node);
              if (node.classList && node.classList.contains('cf-tr3-count')) applyCount(node);
              if (node.classList && node.classList.contains('cf-tr3-dots')) applyDots(node);
              if (node.classList && node.classList.contains('cf-tr3-tilt')) applyTilt(node);
            }
          });
        }
      });
    }, 200);
  });

  observer.observe(document.documentElement, observerConfig);

  // Global mousemove for 3D tilt + repulse
  document.addEventListener('mousemove', (e) => {
    if (handlePointerCoarse()) return;

    state.globalMouseX = e.clientX;
    state.globalMouseY = e.clientY;

    // 3D tilt
    document.querySelectorAll('.cf-tr3-tilt').forEach(el => {
      if (!el.__cfTr3Tilt) {
        el.__cfTr3Tilt = true;
      }

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rx = -(y - cy) / 10;
      const ry = (x - cx) / 10;

      el.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });

    // Repulse
    if (state.activeRepulse) {
      const zone = state.activeRepulse;
      const zoneRect = zone.getBoundingClientRect();
      const mx = e.clientX - zoneRect.left;
      const my = e.clientY - zoneRect.top;

      zone.querySelectorAll('.cf-tr3-repulse-item').forEach(particle => {
        const pRect = particle.getBoundingClientRect();
        const px = pRect.left - zoneRect.left + pRect.width / 2;
        const py = pRect.top - zoneRect.top + pRect.height / 2;
        const dx = px - mx;
        const dy = py - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = Math.max(0, 1 - dist / 100);
        const angle = Math.atan2(dy, dx);
        const tx = Math.cos(angle) * force * 30;
        const ty = Math.sin(angle) * force * 30;

        particle.style.transform = `translate(${tx}px, ${ty}px)`;
      });
    }
  }, { passive: true });

  // Global scroll for sticky header
  let scrollTimer;
  document.addEventListener('scroll', (e) => {
    state.scrolling = true;
    clearTimeout(scrollTimer);

    document.querySelectorAll('.cf-tr3-sticky-shrink').forEach(header => {
      const container = header.closest('[data-cf-tr3-sticky-container]') || header.parentElement;
      if (container) {
        const scrollTop = container.scrollTop || window.scrollY;
        if (scrollTop > 20) {
          header.classList.add('cf-tr3-shrunk');
        } else {
          header.classList.remove('cf-tr3-shrunk');
        }
      }
    });

    scrollTimer = setTimeout(() => {
      state.scrolling = false;
    }, 100);
  }, { passive: true });

  // ===== PUBLIC API =====

  window.cfTr3 = {
    // Page transitions (1-5)
    page: function(name, opts = {}) {
      if (pageTransitions[name]) {
        return pageTransitions[name](opts);
      }
    },

    // Element entrance (6-10)
    stagger: applyStagger,
    scaleSpring: applyScaleSpring,
    maskReveal: applyMaskReveal,
    blurUp: applyBlurUp,
    origami: applyOrigami,

    // Text effects (11-15)
    typewriter: applyTypewriter,
    words: applyWords,
    chars: applyChars,
    maskWave: applyMaskWave,
    count: applyCount,

    // Buttons / micro (16-20)
    liquid: applyLiquid,
    repulse: applyRepulse,
    glowTrail: applyGlowTrail,
    shake: applyShake,
    success: applySuccess,

    // Loading / states (21-25)
    breath: applyBreath,
    progress: applyProgress,
    spinCheck: applySpinCheck,
    dots: applyDots,
    brandReveal: applyBrandReveal,

    // Hover / scroll (26-30)
    tilt: applyTilt,
    borderDraw: applyBorderDraw,
    marquee: applyMarquee,
    stickyHeader: applyStickyHeader,
    snap: applySnap,

    // Utilities
    version: '3.0.0',
    cleanup: function() {
      observer.disconnect();
      document.removeEventListener('mousemove', arguments.callee);
      document.removeEventListener('scroll', arguments.callee);
    },
  };

  // Auto-init on elements with data attributes (optional progressive enhancement)
  window.addEventListener('DOMContentLoaded', () => {
    // Stagger
    document.querySelectorAll('[data-cf-tr3="stagger"]').forEach(applyStagger);

    // Chars
    document.querySelectorAll('[data-cf-tr3="chars"]').forEach(applyChars);

    // Count
    document.querySelectorAll('[data-cf-tr3-count]').forEach(applyCount);

    // Progress
    document.querySelectorAll('[data-cf-tr3-progress]').forEach(applyProgress);

    // Dots
    document.querySelectorAll('[data-cf-tr3="dots"]').forEach(applyDots);

    // Tilt
    document.querySelectorAll('[data-cf-tr3="tilt"]').forEach(applyTilt);

    // Marquee
    document.querySelectorAll('[data-cf-tr3="marquee"]').forEach(applyMarquee);

    // Sticky
    document.querySelectorAll('[data-cf-tr3="sticky"]').forEach(applyStickyHeader);

    // Snap
    document.querySelectorAll('[data-cf-tr3="snap"]').forEach(applySnap);
  });
})();
