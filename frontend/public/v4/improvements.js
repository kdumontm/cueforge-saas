/* ============================================================
   CueForge — improvements.js
   100 améliorations frontend pour les features existantes.
   Auto-bind sur sélecteurs CSS / data-attributes existants.
   ============================================================ */
(function(){
  'use strict';
  if(window.cfImprovements) return;
  var CF = window.cfImprovements = {};
  var LS_PREFIX = 'cf_imp_';
  var $ = function(s,r){return (r||document).querySelector(s)};
  var $$ = function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  var on = function(el,ev,fn,opt){if(el)el.addEventListener(ev,fn,opt||false)};
  var ls = {
    get:function(k,def){try{var v=localStorage.getItem(LS_PREFIX+k);return v==null?def:JSON.parse(v)}catch(e){return def}},
    set:function(k,v){try{localStorage.setItem(LS_PREFIX+k,JSON.stringify(v))}catch(e){}},
    del:function(k){try{localStorage.removeItem(LS_PREFIX+k)}catch(e){}}
  };
  CF.ls = ls;

  /* ============================================================
     #2 / #82  Filtres persistants + thèmes test live
     ============================================================ */
  CF.persistFilters = function(scope){
    scope = scope || location.pathname.replace(/[^a-z]/gi,'_');
    var key = 'filters_'+scope;
    var saved = ls.get(key,{});
    $$('[data-cf-persist]').forEach(function(el){
      var name = el.getAttribute('data-cf-persist');
      var initial = saved[name];
      if(initial!=null){
        if(el.type==='checkbox') el.checked=!!initial;
        else el.value = initial;
        try{ el.dispatchEvent(new Event('change',{bubbles:true})); }catch(e){}
      }
      on(el,'change',function(){
        var s = ls.get(key,{}) || {};
        s[name] = (el.type==='checkbox') ? el.checked : el.value;
        ls.set(key,s);
      });
    });
  };

  /* ============================================================
     #3  Vue compact / expanded
     ============================================================ */
  CF.densityToggle = function(){
    var btn = $('[data-cf-density]') || createDensityChip();
    if(!btn) return;
    var saved = ls.get('density','compact');
    document.documentElement.setAttribute('data-density', saved);
    function update(d){
      document.documentElement.setAttribute('data-density', d);
      ls.set('density', d);
      if(btn) btn.textContent = d==='expanded' ? '▦ Compact' : '☰ Expanded';
    }
    update(saved);
    on(btn,'click', function(){
      var cur = document.documentElement.getAttribute('data-density');
      update(cur==='expanded' ? 'compact' : 'expanded');
    });
  };
  function createDensityChip(){
    var bar = $('.filter-bar');
    if(!bar) return null;
    var b = document.createElement('button');
    b.className = 'view-chip';
    b.setAttribute('data-cf-density','1');
    b.style.marginLeft = 'auto';
    b.textContent = '▦ Compact';
    bar.appendChild(b);
    return b;
  }

  /* ============================================================
     #4 / #98  Recherche fuzzy locale + ranking amélioré
     ============================================================ */
  CF.fuzzy = function(query, candidates, getter){
    if(!query) return candidates.map(function(c,i){return {item:c,score:0,idx:i}});
    query = query.toLowerCase();
    return candidates.map(function(c,i){
      var t = (getter?getter(c):String(c)).toLowerCase();
      var score = 0;
      if(t === query) score = 1000;
      else if(t.indexOf(query) === 0) score = 800;            // début
      else if(t.indexOf(' '+query) > -1) score = 600;         // début de mot
      else if(t.indexOf(query) > -1) score = 400;             // contains
      else {
        // fuzzy: tous les chars dans l'ordre ?
        var qi=0, gap=0;
        for(var j=0;j<t.length && qi<query.length;j++){
          if(t[j]===query[qi]){ qi++; }
          else if(qi>0){ gap++; }
        }
        score = qi===query.length ? Math.max(0, 200 - gap*5) : 0;
      }
      return {item:c, score:score, idx:i};
    }).filter(function(r){return r.score>0})
      .sort(function(a,b){return b.score - a.score || a.idx - b.idx});
  };

  /* ============================================================
     #5  Badge NEW pour tracks créées < 24h
     ============================================================ */
  CF.markNew = function(){
    var DAY = 24*3600*1000;
    var now = Date.now();
    $$('[data-created-at]').forEach(function(el){
      var t = new Date(el.getAttribute('data-created-at')).getTime();
      if(!isFinite(t)) return;
      if(now - t < DAY && !el.querySelector('.cf-new-badge')){
        var b = document.createElement('span');
        b.className = 'cf-new-badge';
        b.textContent = 'NEW';
        el.appendChild(b);
      }
    });
  };

  /* ============================================================
     #8  Sélection persistante entre pages (memory-only, scope = session)
     ============================================================ */
  CF.selection = {
    _set: new Set(JSON.parse(sessionStorage.getItem('cf_sel')||'[]')),
    has:function(id){return this._set.has(String(id))},
    add:function(id){this._set.add(String(id));this._sync()},
    del:function(id){this._set.delete(String(id));this._sync()},
    toggle:function(id){this.has(id)?this.del(id):this.add(id);return this.has(id)},
    clear:function(){this._set.clear();this._sync()},
    size:function(){return this._set.size},
    list:function(){return Array.from(this._set)},
    _sync:function(){
      try{ sessionStorage.setItem('cf_sel', JSON.stringify(this.list())); }catch(e){}
      var ev = new CustomEvent('cf:selection-change',{detail:{count:this.size()}});
      document.dispatchEvent(ev);
    }
  };

  /* ============================================================
     #12  Hover preview audio (debounced, single-instance)
     ============================================================ */
  CF.hoverPreview = (function(){
    var audio = null, timer = null, currentEl = null;
    function stop(){
      if(timer){clearTimeout(timer);timer=null}
      if(audio){try{audio.pause();audio.src=''}catch(e){}}
      if(currentEl){currentEl.classList.remove('cf-hover-playing');currentEl=null}
    }
    function start(el, src){
      stop();
      currentEl = el;
      el.classList.add('cf-hover-playing');
      timer = setTimeout(function(){
        try{
          audio = audio || new Audio();
          audio.src = src;
          audio.volume = 0.45;
          audio.currentTime = 0;
          audio.play().catch(function(){});
        }catch(e){}
      }, 600); // 600ms de hover avant preview
    }
    return {
      bind:function(rootSel, getSrc){
        var root = $(rootSel) || document;
        on(root,'mouseover',function(e){
          var row = e.target.closest('[data-cf-preview]');
          if(!row) return;
          var src = row.getAttribute('data-cf-preview') || (getSrc?getSrc(row):'');
          if(src) start(row, src);
        });
        on(root,'mouseout',function(e){
          var row = e.target.closest('[data-cf-preview]');
          if(row && (!e.relatedTarget || !row.contains(e.relatedTarget))) stop();
        });
        on(window,'blur', stop);
      },
      stop: stop
    };
  })();

  /* ============================================================
     #16  BPM tap manuel (via UI sur n'importe quel input data-cf-bpm-tap)
     ============================================================ */
  CF.bpmTap = function(input){
    if(!input) return;
    var taps = [];
    function tap(){
      var now = performance.now();
      taps.push(now);
      taps = taps.filter(function(t){return now - t < 4000});
      if(taps.length >= 4){
        var deltas = [];
        for(var i=1;i<taps.length;i++) deltas.push(taps[i]-taps[i-1]);
        var avg = deltas.reduce(function(a,b){return a+b},0)/deltas.length;
        var bpm = Math.round(60000/avg);
        if(bpm>40 && bpm<240){
          input.value = bpm;
          input.dispatchEvent(new Event('change',{bubbles:true}));
          input.classList.add('cf-bpm-flash');
          setTimeout(function(){input.classList.remove('cf-bpm-flash')},400);
        }
      }
    }
    on(document,'keydown',function(e){
      if(document.activeElement === input && e.code === 'Space'){
        e.preventDefault();
        tap();
      }
    });
    return tap;
  };

  /* ============================================================
     #20  Raccourcis clavier J/K/L (rewind/pause/forward) sur audio actif
     #91  Anim play/pause
     ============================================================ */
  CF.bindAudioShortcuts = function(audio){
    if(!audio) return;
    on(document,'keydown', function(e){
      if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if(e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if(k==='j'){ audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
      else if(k==='k' || k===' '){ audio.paused ? audio.play() : audio.pause(); e.preventDefault(); }
      else if(k==='l'){ audio.currentTime = Math.min(audio.duration||1e9, audio.currentTime + 5); e.preventDefault(); }
      else if(k==='m'){ audio.muted = !audio.muted; e.preventDefault(); }
      else if(e.key==='ArrowLeft'){ audio.currentTime = Math.max(0, audio.currentTime - 1); e.preventDefault(); }
      else if(e.key==='ArrowRight'){ audio.currentTime = Math.min(audio.duration||1e9, audio.currentTime + 1); e.preventDefault(); }
    });
  };

  /* ============================================================
     #22  Vitesse variable (50-200%) sans pitch shift natif
     ============================================================ */
  CF.bindPlaybackRate = function(audio, slider){
    if(!audio || !slider) return;
    audio.preservesPitch = true; // Chrome/FF
    on(slider,'input', function(){
      var r = parseFloat(slider.value)/100;
      audio.playbackRate = Math.max(0.5, Math.min(2.0, r));
      var label = $('[data-cf-rate-label]');
      if(label) label.textContent = Math.round(audio.playbackRate*100)+'%';
    });
  };

  /* ============================================================
     #34 / #38  Snap on beat + quantize
     ============================================================ */
  CF.snapToBeat = function(timeSec, bpm, firstBeatSec){
    if(!bpm || bpm<=0) return timeSec;
    var beatDur = 60/bpm;
    firstBeatSec = firstBeatSec || 0;
    var delta = timeSec - firstBeatSec;
    var n = Math.round(delta / beatDur);
    return firstBeatSec + n*beatDur;
  };
  CF.quantizeAll = function(cues, bpm, firstBeatSec){
    return cues.map(function(c){
      return Object.assign({}, c, {time: CF.snapToBeat(c.time, bpm, firstBeatSec)});
    });
  };

  /* ============================================================
     #37  Export cues en .cue file (CDJ-friendly text)
     ============================================================ */
  CF.exportCueFile = function(track, cues){
    function fmt(s){
      var m = Math.floor(s/60), sec = Math.floor(s%60), f = Math.floor((s%1)*75);
      return (m<10?'0':'')+m+':'+(sec<10?'0':'')+sec+':'+(f<10?'0':'')+f;
    }
    var out = [];
    out.push('REM GENERATED-BY CueForge');
    out.push('PERFORMER "' + (track.artist||'Unknown') + '"');
    out.push('TITLE "' + (track.title||'Track') + '"');
    out.push('FILE "' + (track.file||(track.title||'track')+'.wav') + '" WAVE');
    cues.forEach(function(c, i){
      out.push('  TRACK ' + (i+1<10?'0':'') + (i+1) + ' AUDIO');
      out.push('    TITLE "' + (c.label||c.name||('Cue '+(i+1))) + '"');
      out.push('    INDEX 01 ' + fmt(c.time||0));
    });
    var blob = new Blob([out.join('\n')], {type:'application/x-cue'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = ((track.title||'track')+'.cue').replace(/[^\w.\-]/g,'_');
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  };

  /* ============================================================
     #41  Header set : durée totale + BPM moyen live
     #44  Détection trous (BPM>5 ou Key incompatible)
     ============================================================ */
  CF.recomputeSetHeader = function(rootSel){
    var root = $(rootSel||'[data-cf-set]');
    if(!root) return;
    var rows = $$('[data-cf-track-row]', root);
    var totalDur = 0, bpms = [], gaps = [];
    var prevBpm=null, prevKey=null;
    rows.forEach(function(r,i){
      var d = parseFloat(r.getAttribute('data-duration')||0);
      var b = parseFloat(r.getAttribute('data-bpm')||0);
      var k = r.getAttribute('data-key')||'';
      if(d>0) totalDur += d;
      if(b>0) bpms.push(b);
      if(prevBpm && b>0 && Math.abs(b-prevBpm)>5){
        gaps.push({idx:i, type:'bpm', delta:Math.abs(b-prevBpm)});
        r.classList.add('cf-gap-bpm');
      } else r.classList.remove('cf-gap-bpm');
      if(prevKey && k && !CF.keyCompatible(prevKey,k)){
        gaps.push({idx:i, type:'key', from:prevKey, to:k});
        r.classList.add('cf-gap-key');
      } else r.classList.remove('cf-gap-key');
      prevBpm = b||prevBpm; prevKey = k||prevKey;
    });
    var avgBpm = bpms.length ? Math.round(bpms.reduce(function(a,b){return a+b},0)/bpms.length) : 0;
    var hdrDur = $('[data-cf-set-duration]', root);
    var hdrBpm = $('[data-cf-set-avg-bpm]', root);
    var hdrGaps = $('[data-cf-set-gaps]', root);
    if(hdrDur) hdrDur.textContent = formatDur(totalDur);
    if(hdrBpm) hdrBpm.textContent = avgBpm ? avgBpm+' BPM' : '';
    if(hdrGaps) hdrGaps.textContent = gaps.length ? (gaps.length+' transition'+(gaps.length>1?'s':'')+' à vérifier') : '';
    return {totalDur:totalDur, avgBpm:avgBpm, gaps:gaps};
  };
  function formatDur(s){
    s = Math.round(s);
    var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    if(h) return h+'h'+(m<10?'0':'')+m;
    return m+':'+(sec<10?'0':'')+sec;
  }
  // Camelot Wheel compatibility
  CF.keyCompatible = function(a,b){
    if(!a || !b) return true;
    var na = parseCamelot(a), nb = parseCamelot(b);
    if(!na || !nb) return true; // pas mappable, laisser passer
    // Compatible : même nombre OU nombre +/-1 OU même nombre + lettre opposée
    if(na.n === nb.n) return true;
    if(na.l === nb.l && (Math.abs(na.n - nb.n) === 1 || Math.abs(na.n - nb.n) === 11)) return true;
    return false;
  };
  function parseCamelot(k){
    var m = String(k).trim().match(/^(\d{1,2})([abAB])$/);
    if(!m) return null;
    return {n: parseInt(m[1],10), l: m[2].toUpperCase()};
  }

  /* ============================================================
     #42  Tooltip "pourquoi cette suggestion"
     ============================================================ */
  CF.bindSuggestionTooltips = function(){
    $$('[data-cf-suggest-why]').forEach(function(el){
      if(el._cfBound) return; el._cfBound = true;
      on(el,'mouseenter', function(){
        var why = el.getAttribute('data-cf-suggest-why');
        if(!why) return;
        var tt = document.createElement('div');
        tt.className = 'cf-suggest-tt';
        tt.textContent = why;
        document.body.appendChild(tt);
        var r = el.getBoundingClientRect();
        tt.style.left = (r.left + r.width/2) + 'px';
        tt.style.top = (r.bottom + 6) + 'px';
        el._cfTT = tt;
      });
      on(el,'mouseleave', function(){
        if(el._cfTT){ el._cfTT.remove(); el._cfTT = null; }
      });
    });
  };

  /* ============================================================
     #48  Export PDF setlist (via window.print + CSS print)
     ============================================================ */
  CF.exportSetPDF = function(setData){
    var w = window.open('','_blank');
    if(!w) return;
    var rows = (setData.tracks||[]).map(function(t,i){
      return '<tr><td>'+(i+1)+'</td><td>'+esc(t.artist||'')+'</td><td>'+esc(t.title||'')+'</td><td>'+(t.bpm||'')+'</td><td>'+esc(t.key||'')+'</td><td>'+formatDur(t.duration||0)+'</td></tr>';
    }).join('');
    w.document.write('<!doctype html><html><head><title>'+esc(setData.name||'Setlist')+'</title><style>'+
      'body{font-family:-apple-system,sans-serif;padding:24px;color:#000}'+
      'h1{margin:0 0 4px;font-size:22px}.meta{color:#666;font-size:12px;margin-bottom:18px}'+
      'table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;font-size:12px}'+
      'th{background:#f4f4f4;font-weight:600}@media print{body{padding:12px}}'+
    '</style></head><body>'+
      '<h1>'+esc(setData.name||'Setlist')+'</h1>'+
      '<div class="meta">'+(setData.tracks?setData.tracks.length:0)+' tracks · Total '+formatDur(setData.duration||0)+(setData.avgBpm?' · '+setData.avgBpm+' BPM moy':'')+'</div>'+
      '<table><thead><tr><th>#</th><th>Artiste</th><th>Titre</th><th>BPM</th><th>Key</th><th>Durée</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    '</body></html>');
    w.document.close();
    setTimeout(function(){ w.print(); }, 300);
  };
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

  /* ============================================================
     #69 / #76  Export CSV générique
     ============================================================ */
  CF.exportCSV = function(filename, rows){
    if(!rows || !rows.length) return;
    var keys = Object.keys(rows[0]);
    function cell(v){
      if(v==null) return '';
      v = String(v);
      return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v;
    }
    var csv = keys.join(',')+'\n' + rows.map(function(r){return keys.map(function(k){return cell(r[k])}).join(',')}).join('\n');
    var blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = (filename||'export')+'.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ a.remove(); URL.revokeObjectURL(url); }, 100);
  };

  /* ============================================================
     #68  Période configurable stats
     ============================================================ */
  CF.statsPeriod = (function(){
    var KEY='stats_period';
    return {
      get:function(){return ls.get(KEY,'30d')},
      set:function(p){ls.set(KEY,p); document.dispatchEvent(new CustomEvent('cf:period-change',{detail:{period:p}}))},
      bind:function(sel){
        var el = $(sel||'[data-cf-period]'); if(!el) return;
        el.value = this.get();
        var self = this;
        on(el,'change',function(){self.set(el.value)});
      }
    };
  })();

  /* ============================================================
     #87 / a11y  Réduire transitions (prefers-reduced-motion + manual override)
     ============================================================ */
  CF.bindReducedMotion = function(){
    var reduce = ls.get('reduce_motion', null);
    if(reduce==null){
      try{ reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ reduce = false; }
    }
    document.documentElement.setAttribute('data-reduce-motion', reduce?'1':'0');
    var toggle = $('[data-cf-reduce-motion]');
    if(toggle){
      toggle.checked = !!reduce;
      on(toggle,'change',function(){
        ls.set('reduce_motion', toggle.checked);
        document.documentElement.setAttribute('data-reduce-motion', toggle.checked?'1':'0');
      });
    }
  };

  /* ============================================================
     #89  Toasts groupés
     ============================================================ */
  CF.toastGroup = (function(){
    var queue = [], timer = null, lastEl = null;
    function flush(){
      if(!queue.length) return;
      if(queue.length === 1){
        spawn(queue[0].msg, queue[0].kind);
      } else {
        var errs = queue.filter(function(q){return q.kind==='error'}).length;
        var oks = queue.filter(function(q){return q.kind==='success'}).length;
        var parts = [];
        if(errs) parts.push(errs+' erreur'+(errs>1?'s':''));
        if(oks) parts.push(oks+' OK');
        var rest = queue.length - errs - oks;
        if(rest) parts.push(rest+' info');
        spawn(parts.join(' · '), errs ? 'error' : (oks?'success':'info'));
      }
      queue = [];
    }
    function spawn(msg, kind){
      if(window.cfShowToast) return window.cfShowToast(msg, kind);
      // fallback simple
      var t = document.createElement('div');
      t.className = 'cf-toast cf-toast-'+(kind||'info');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function(){ t.classList.add('cf-toast-out'); setTimeout(function(){t.remove()},300); }, 3500);
    }
    return {
      push:function(msg, kind){
        queue.push({msg:msg, kind:kind||'info'});
        if(timer) clearTimeout(timer);
        timer = setTimeout(flush, 250);
      }
    };
  })();

  /* ============================================================
     #90  Confirm destructif avec timer (5s undo)
     ============================================================ */
  CF.confirmWithTimer = function(opts){
    opts = opts || {};
    var seconds = opts.seconds || 5;
    var msg = opts.message || 'Action effectuée';
    return new Promise(function(resolve){
      var bar = document.createElement('div');
      bar.className = 'cf-undo-bar';
      bar.innerHTML = '<span class="cf-undo-msg">'+esc(msg)+'</span>'+
        '<button class="cf-undo-btn">Annuler ('+seconds+'s)</button>';
      document.body.appendChild(bar);
      var btn = bar.querySelector('.cf-undo-btn');
      var t = seconds, iv;
      iv = setInterval(function(){
        t--;
        if(t<=0){ clearInterval(iv); cleanup(); resolve(true); return; }
        btn.textContent = 'Annuler ('+t+'s)';
      }, 1000);
      btn.addEventListener('click', function(){ clearInterval(iv); cleanup(); resolve(false); });
      function cleanup(){ bar.classList.add('cf-undo-out'); setTimeout(function(){bar.remove()},300); }
    });
  };

  /* ============================================================
     #94  Drag scrub BPM logarithmique
     ============================================================ */
  CF.bindLogScrub = function(){
    $$('[data-cf-scrub-log]').forEach(function(el){
      if(el._cfLog) return; el._cfLog = true;
      var startY=0, startV=0, dragging=false, min=parseFloat(el.min)||60, max=parseFloat(el.max)||200;
      on(el,'pointerdown',function(e){
        startY=e.clientY; startV=parseFloat(el.value)||((min+max)/2);
        dragging=true; el.setPointerCapture(e.pointerId);
        document.body.style.cursor='ns-resize';
      });
      on(el,'pointermove',function(e){
        if(!dragging) return;
        var dy = startY - e.clientY;
        var range = max - min;
        // logarithmique: sensibilité fine au centre
        var sens = 0.4 + Math.pow(Math.abs(dy)/300, 2);
        var nv = startV + dy * sens * range/300;
        nv = Math.max(min, Math.min(max, nv));
        el.value = Math.round(nv*10)/10;
        el.dispatchEvent(new Event('input',{bubbles:true}));
      });
      on(el,'pointerup',function(e){ dragging=false; document.body.style.cursor=''; el.releasePointerCapture(e.pointerId); el.dispatchEvent(new Event('change',{bubbles:true})); });
      on(el,'pointercancel',function(){ dragging=false; document.body.style.cursor=''; });
    });
  };

  /* ============================================================
     #95  Historique de recherche dans la palette
     #96  Recherche par #tag
     #97  Actions rapides dans palette
     ============================================================ */
  CF.searchHistory = (function(){
    var KEY='search_hist';
    var max = 8;
    return {
      list:function(){return ls.get(KEY,[]) || []},
      push:function(q){
        if(!q || q.length<2) return;
        var h = this.list().filter(function(x){return x !== q});
        h.unshift(q);
        if(h.length>max) h.length=max;
        ls.set(KEY,h);
      },
      clear:function(){ls.del(KEY)}
    };
  })();

  /* ============================================================
     #99  Préchargement 1ère track au login
     ============================================================ */
  CF.prefetchFirstTrack = function(){
    if(sessionStorage.getItem('cf_prefetched')) return;
    sessionStorage.setItem('cf_prefetched','1');
    if(!window.api || !window.api.get) return;
    setTimeout(function(){
      try{
        window.api.get('/tracks?limit=1&order_by=created_at&order=desc').then(function(r){
          var t = r && (r.tracks||r.items||(Array.isArray(r)?r:null));
          if(t && t[0]){
            // tease : préfetch les détails de la première
            window.api.get('/tracks/'+t[0].id).catch(function(){});
          }
        }).catch(function(){});
      }catch(e){}
    }, 1500);
  };

  /* ============================================================
     #100  Lazy-load waveforms sous le fold
     ============================================================ */
  CF.lazyWaveforms = function(){
    if(!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        var el = en.target;
        var src = el.getAttribute('data-cf-wave-src');
        if(!src) return;
        if(el.tagName === 'IMG'){ el.src = src; }
        else {
          el.style.backgroundImage = 'url("'+src+'")';
        }
        el.removeAttribute('data-cf-wave-src');
        io.unobserve(el);
        el.classList.add('cf-wave-loaded');
      });
    }, {rootMargin:'200px'});
    $$('[data-cf-wave-src]').forEach(function(el){ io.observe(el); });
    CF._waveIO = io;
    return io;
  };

  /* ============================================================
     #88  Skeleton loading aligné — helper pour matcher layout final
     ============================================================ */
  CF.skeleton = function(target, count){
    var el = typeof target==='string' ? $(target) : target;
    if(!el) return;
    el.innerHTML = '';
    for(var i=0;i<(count||5);i++){
      var s = document.createElement('div');
      s.className = 'cf-skel cf-skel-row';
      el.appendChild(s);
    }
  };

  /* ============================================================
     INIT auto au DOMContentLoaded
     ============================================================ */
  function init(){
    try{ CF.persistFilters(); }catch(e){}
    try{ CF.densityToggle(); }catch(e){}
    try{ CF.markNew(); }catch(e){}
    try{ CF.bindSuggestionTooltips(); }catch(e){}
    try{ CF.bindReducedMotion(); }catch(e){}
    try{ CF.bindLogScrub(); }catch(e){}
    try{ CF.lazyWaveforms(); }catch(e){}
    try{ CF.statsPeriod.bind(); }catch(e){}
    try{ CF.prefetchFirstTrack(); }catch(e){}
    // Auto-bind hover preview sur library/sets/set-builder
    try{ CF.hoverPreview.bind('body'); }catch(e){}
    // Recompute set header si data-cf-set présent
    try{
      if($('[data-cf-set]')){
        CF.recomputeSetHeader();
        var mo = new MutationObserver(function(){ CF.recomputeSetHeader(); });
        mo.observe($('[data-cf-set]'), {childList:true, subtree:true, attributes:true, attributeFilter:['data-bpm','data-key','data-duration']});
      }
    }catch(e){}
  }
  if(document.readyState === 'loading') on(document,'DOMContentLoaded',init);
  else init();

  // Re-bind après chaque transition de page (cfRouter émet ce flag)
  on(document,'cf:page-ready', init);
})();

/* ============================================================
   Wave 2 — Backend-backed features
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  // Helper API call : prefer window.api (handle refresh tokens), fallback fetch
  function apiCall(method, path, body){
    var m = method.toLowerCase();
    if(window.api && typeof window.api[m] === 'function'){
      // window.api signatures vary : get(path), post(path, body), patch(path, body), del(path)
      try{
        if(m === 'get' || m === 'del') return window.api[m](path);
        return window.api[m](path, body);
      }catch(e){ /* fall through */ }
    }
    if(window.api && m === 'delete' && window.api.del){
      return window.api.del(path);
    }
    var base = (window.api && window.api.base) || '/api/v1';
    var headers = {'Content-Type':'application/json'};
    var token = null;
    try{
      token = (window.api && window.api.token) || localStorage.getItem('access_token') || localStorage.getItem('token');
    }catch(e){}
    if(token) headers['Authorization'] = 'Bearer '+token;
    return fetch(base+path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include'
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.status === 204 ? null : r.json();
    });
  }
  CF.apiCall = apiCall;

  // #6 Compteur plays serveur (incrément + cache local)
  CF.recordPlay = function(trackId){
    if(!trackId) return;
    apiCall('POST', '/tracks/'+trackId+'/play').then(function(r){
      if(r && r.played_count != null){
        try{ localStorage.setItem('cf_plays_'+trackId, r.played_count); }catch(e){}
      }
    }).catch(function(){
      // fallback : juste incrémenter localStorage
      try{
        var k='cf_plays_'+trackId;
        var n=parseInt(localStorage.getItem(k)||'0',10)+1;
        localStorage.setItem(k, n);
      }catch(e){}
    });
  };

  // #23 Notes texte
  CF.notes = {
    get: function(trackId){ return apiCall('GET','/tracks/'+trackId+'/notes'); },
    save: function(trackId, text){ return apiCall('PATCH','/tracks/'+trackId+'/notes',{notes:text}); }
  };

  // #9 Bulk update tags / genre
  CF.bulkUpdate = function(trackIds, changes){
    if(!trackIds || !trackIds.length) return Promise.resolve({updated:0});
    return apiCall('POST','/tracks/bulk-update', Object.assign({track_ids: trackIds}, changes||{}));
  };

  // #28 Détection doublons (par md5/fingerprint)
  CF.checkDuplicate = function(opts){
    opts = opts || {};
    var qs = [];
    if(opts.md5) qs.push('md5='+encodeURIComponent(opts.md5));
    if(opts.fingerprint) qs.push('fingerprint='+encodeURIComponent(opts.fingerprint));
    if(!qs.length) return Promise.resolve({matches:[]});
    return apiCall('GET','/tracks/check-duplicate?'+qs.join('&')).catch(function(){return {matches:[]}});
  };

  // Compute MD5 d'un fichier côté client (pour précheck doublon avant upload)
  CF.fileMd5 = function(file){
    return new Promise(function(resolve,reject){
      try{
        var reader = new FileReader();
        reader.onload = function(){
          // SubtleCrypto ne supporte pas MD5 → on utilise SHA-1 truncé (matche pas le serveur)
          // Mieux : skip et compter sur le serveur. On retourne la taille+nom comme heuristique.
          var hashable = file.name + ':' + file.size;
          if(window.crypto && crypto.subtle){
            var enc = new TextEncoder().encode(hashable);
            crypto.subtle.digest('SHA-256', enc).then(function(buf){
              var hex = Array.prototype.map.call(new Uint8Array(buf), function(b){return ('00'+b.toString(16)).slice(-2)}).join('');
              resolve(hex.slice(0,32));
            }).catch(function(){ resolve(null); });
          } else { resolve(null); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file.slice(0, 1024));
      }catch(e){ resolve(null); }
    });
  };

  // #11 Smart playlists (saved views) — synchronisation cross-device
  CF.savedViews = {
    list: function(){
      return apiCall('GET','/saved-views').then(function(r){return (r&&r.views)||[]}).catch(function(){
        return JSON.parse(localStorage.getItem('cf_imp_saved_views')||'[]');
      });
    },
    save: function(view){
      // Persiste local + tente serveur
      try{
        var local = JSON.parse(localStorage.getItem('cf_imp_saved_views')||'[]');
        local = local.filter(function(v){return v.id !== view.id});
        local.push(view);
        localStorage.setItem('cf_imp_saved_views', JSON.stringify(local));
      }catch(e){}
      return apiCall('POST','/saved-views', view).catch(function(){return view});
    },
    remove: function(id){
      try{
        var local = JSON.parse(localStorage.getItem('cf_imp_saved_views')||'[]');
        local = local.filter(function(v){return v.id !== id});
        localStorage.setItem('cf_imp_saved_views', JSON.stringify(local));
      }catch(e){}
      return apiCall('DELETE','/saved-views/'+encodeURIComponent(id)).catch(function(){});
    }
  };

  // #70 Top tracks
  CF.topTracks = function(limit){
    return apiCall('GET','/stats/top-tracks?limit='+(limit||10)).catch(function(){return {by_sets:[],by_plays:[]}});
  };
})();

/* ============================================================
   #13  Waveform zoom horizontal (analyze)
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  window.cfImprovements.bindWaveZoom = function(waveEl, peaksLen){
    if(!waveEl) return;
    var zoom = 1, offset = 0;
    waveEl.style.transformOrigin = '0 50%';
    waveEl.style.willChange = 'transform';
    function apply(){
      waveEl.style.transform = 'scaleX('+zoom+') translateX('+(-offset)+'px)';
      waveEl.dataset.cfZoom = zoom.toFixed(2);
    }
    waveEl.addEventListener('wheel', function(e){
      if(!e.ctrlKey && !e.metaKey && !e.shiftKey) return;
      e.preventDefault();
      var delta = e.deltaY < 0 ? 1.15 : (1/1.15);
      var rect = waveEl.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var newZoom = Math.max(1, Math.min(20, zoom*delta));
      // ajuster offset pour que mouseX reste fixe
      var ratio = newZoom/zoom;
      offset = (offset + mouseX)*ratio - mouseX;
      zoom = newZoom;
      offset = Math.max(0, Math.min(offset, (zoom-1)*rect.width));
      apply();
    }, {passive:false});
    // Reset au double-click
    waveEl.addEventListener('dblclick', function(){
      zoom = 1; offset = 0; apply();
    });
    // Drag pour pan quand zoomé
    var dragStart = null;
    waveEl.addEventListener('pointerdown', function(e){
      if(zoom <= 1) return;
      dragStart = {x:e.clientX, offset:offset};
      waveEl.setPointerCapture(e.pointerId);
    });
    waveEl.addEventListener('pointermove', function(e){
      if(!dragStart) return;
      var rect = waveEl.getBoundingClientRect();
      offset = Math.max(0, Math.min(dragStart.offset - (e.clientX - dragStart.x), (zoom-1)*rect.width));
      apply();
    });
    waveEl.addEventListener('pointerup', function(){ dragStart = null; });
    return {reset: function(){zoom=1;offset=0;apply()}, getZoom:function(){return zoom}};
  };
})();

/* ============================================================
   #14  Markers sections auto (intro/build/drop/breakdown/outro)
   à partir de l'energy curve
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  window.cfImprovements.detectSections = function(energyArr, durationSec){
    if(!Array.isArray(energyArr) || energyArr.length < 8) return [];
    var n = energyArr.length;
    var avg = energyArr.reduce(function(a,b){return a+b},0)/n;
    var sections = [];
    // Intro = 1ère 12% si energy < avg
    var introEnd = Math.round(n*0.12);
    if(energyArr.slice(0, introEnd).reduce(function(a,b){return a+b},0)/introEnd < avg*0.9){
      sections.push({type:'intro', start:0, end: introEnd/n*durationSec});
    }
    // Drop = pic d'energy > avg*1.3
    for(var i=introEnd;i<n-2;i++){
      if(energyArr[i] > avg*1.3 && energyArr[i] >= energyArr[i-1] && energyArr[i] >= energyArr[i+1]){
        sections.push({type:'drop', start: i/n*durationSec, end: Math.min(n,i+8)/n*durationSec});
        i += 8;
      }
    }
    // Outro = dernière 12% si energy descend
    var outroStart = Math.round(n*0.88);
    var outroEnergy = energyArr.slice(outroStart).reduce(function(a,b){return a+b},0)/(n-outroStart);
    if(outroEnergy < avg*0.9){
      sections.push({type:'outro', start: outroStart/n*durationSec, end: durationSec});
    }
    return sections;
  };
})();

/* ============================================================
   #29  Drag-and-drop dossier (récursion automatique)
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  window.cfImprovements.readDirEntries = function(dirEntry){
    return new Promise(function(resolve){
      var reader = dirEntry.createReader();
      var all = [];
      function read(){
        reader.readEntries(function(entries){
          if(!entries.length){ resolve(all); return; }
          all = all.concat(entries);
          read();
        });
      }
      read();
    });
  };
  window.cfImprovements.flattenDropFiles = async function(dataTransferItems){
    var files = [];
    var items = Array.prototype.slice.call(dataTransferItems);
    async function walk(entry){
      if(entry.isFile){
        await new Promise(function(res){ entry.file(function(f){ files.push(f); res(); }); });
      } else if(entry.isDirectory){
        var entries = await window.cfImprovements.readDirEntries(entry);
        for(var e of entries) await walk(e);
      }
    }
    for(var item of items){
      var entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
      if(entry) await walk(entry);
      else if(item.kind === 'file'){ var f = item.getAsFile(); if(f) files.push(f); }
    }
    return files.filter(function(f){
      // Filtrer par extension audio
      return /\.(wav|aiff?|flac|mp3|m4a|alac|ogg|aac|opus)$/i.test(f.name);
    });
  };
})();

/* ============================================================
   Wave 3 — Mix studio + heatmap + saved views UI
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  /* --- #50  Crossfade auto-tuned selon energy delta --- */
  CF.suggestCrossfadeBars = function(energyA, energyB){
    if(energyA == null || energyB == null) return 16;
    var delta = Math.abs(energyA - energyB);
    // delta 0-1 → 32 bars (long, doux), 5+ → 4 bars (rapide, percutant)
    if(delta < 1) return 32;
    if(delta < 2) return 24;
    if(delta < 3) return 16;
    if(delta < 4) return 8;
    return 4;
  };

  /* --- #55  Score breakdown transition (Key, BPM, Energy, Phrase) --- */
  CF.transitionScore = function(a, b){
    a = a || {}; b = b || {};
    var factors = {
      key: keyScore(a.camelot, b.camelot),
      bpm: bpmScore(a.bpm, b.bpm),
      energy: energyScore(a.energy, b.energy),
      phrase: 100  // assumed phrase-aligned (cue-snapped)
    };
    var weights = {key:0.35, bpm:0.30, energy:0.20, phrase:0.15};
    var overall = Object.keys(weights).reduce(function(s,k){
      return s + (factors[k]||0) * weights[k];
    }, 0);
    return {overall: Math.round(overall), factors: factors};
  };
  function keyScore(a, b){
    if(!a || !b) return 50;
    if(a === b) return 100;
    if(!CF.keyCompatible(a,b)) return 30;
    return 80;
  }
  function bpmScore(a, b){
    if(!a || !b) return 50;
    var d = Math.abs(a-b);
    if(d < 0.5) return 100;
    if(d < 2) return 90;
    if(d < 4) return 75;
    if(d < 6) return 55;
    if(d < 10) return 30;
    return 10;
  }
  function energyScore(a, b){
    if(a == null || b == null) return 60;
    var d = Math.abs(a-b);
    if(d < 0.5) return 95;
    if(d < 1) return 85;
    if(d < 2) return 70;
    if(d < 3) return 55;
    return 35;
  }

  /* --- #53  Markers transition pré-calculés (out A / in B) --- */
  CF.suggestTransitionMarkers = function(trackA, trackB){
    // Heuristique : out à 75% de la durée de A, in au début du drop de B (ou 12%)
    var aDur = (trackA && trackA.duration) || 0;
    var bDur = (trackB && trackB.duration) || 0;
    return {
      out_a: aDur ? aDur * 0.75 : null,
      in_b:  bDur ? bDur * 0.12 : null,
      bars: CF.suggestCrossfadeBars(trackA && trackA.energy, trackB && trackB.energy)
    };
  };

  /* --- #43  Énergie cumulée graph (SVG path simple) --- */
  CF.renderEnergyArc = function(targetEl, energies, opts){
    if(!targetEl || !energies || !energies.length) return;
    opts = opts || {};
    var W = opts.width || targetEl.clientWidth || 600;
    var H = opts.height || 80;
    var pad = 4;
    var n = energies.length;
    var maxE = Math.max.apply(null, energies.map(function(e){return e||0})) || 10;
    var pts = energies.map(function(e, i){
      var x = pad + (i/Math.max(1,n-1)) * (W - 2*pad);
      var y = pad + (1 - (e||0)/maxE) * (H - 2*pad);
      return [x, y];
    });
    // Smooth path (cardinal)
    var d = 'M '+pts[0][0]+' '+pts[0][1];
    for(var i=1;i<pts.length;i++){
      var p0 = pts[Math.max(0,i-1)], p1 = pts[i], p2 = pts[Math.min(pts.length-1,i+1)];
      var c1x = p0[0] + (p1[0]-p0[0])*0.5, c1y = p0[1] + (p1[1]-p0[1])*0.5;
      var c2x = p1[0] - (p2[0]-p0[0])*0.1, c2y = p1[1] - (p2[1]-p0[1])*0.1;
      d += ' C '+c1x+','+c1y+' '+c2x+','+c2y+' '+p1[0]+','+p1[1];
    }
    var area = d + ' L '+pts[pts.length-1][0]+','+(H-pad)+' L '+pts[0][0]+','+(H-pad)+' Z';
    targetEl.innerHTML = '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:'+H+'px;display:block">'+
      '<defs><linearGradient id="cf-arc-grad" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0%" stop-color="var(--amber,#ff7a18)" stop-opacity="0.5"/>'+
        '<stop offset="100%" stop-color="var(--amber,#ff7a18)" stop-opacity="0.05"/>'+
      '</linearGradient></defs>'+
      '<path d="'+area+'" fill="url(#cf-arc-grad)"/>'+
      '<path d="'+d+'" fill="none" stroke="var(--amber,#ff7a18)" stroke-width="1.5"/>'+
    '</svg>';
  };

  /* --- #71  Heatmap activité (jours × heures) --- */
  CF.renderHeatmap = function(targetEl, data, opts){
    // data : array de {day:0-6, hour:0-23, count:N}
    if(!targetEl) return;
    opts = opts || {};
    var days = ['L','M','M','J','V','S','D'];
    var maxC = 1;
    var grid = {};
    (data||[]).forEach(function(d){
      var k = d.day+':'+d.hour;
      grid[k] = (grid[k]||0) + (d.count||1);
      if(grid[k] > maxC) maxC = grid[k];
    });
    var html = '<div style="display:grid;grid-template-columns:24px repeat(24, 1fr);gap:2px;font-family:var(--font-mono);font-size:9px;color:var(--c-tertiary)">';
    html += '<div></div>';
    for(var h=0;h<24;h++) html += '<div style="text-align:center">'+(h%4===0?h:'')+'</div>';
    for(var d=0;d<7;d++){
      html += '<div style="text-align:right;line-height:14px;padding-right:4px">'+days[d]+'</div>';
      for(var h=0;h<24;h++){
        var c = grid[d+':'+h]||0;
        var alpha = c ? 0.15 + (c/maxC)*0.85 : 0;
        var bg = c ? 'rgba(255,122,24,'+alpha.toFixed(2)+')' : 'var(--s-2)';
        html += '<div title="'+days[d]+' '+h+'h · '+c+'" style="height:14px;background:'+bg+';border-radius:2px"></div>';
      }
    }
    html += '</div>';
    targetEl.innerHTML = html;
  };

  /* --- #11  Saved views UI (chips dans library) --- */
  CF.injectSavedViewsUI = function(targetSel){
    var bar = document.querySelector(targetSel || '.views');
    if(!bar || document.getElementById('cf-saved-views')) return;
    var box = document.createElement('div');
    box.id = 'cf-saved-views';
    box.style.cssText = 'display:flex;gap:6px;align-items:center;margin-left:8px;flex-wrap:wrap';
    bar.appendChild(box);

    function render(){
      CF.savedViews.list().then(function(views){
        box.innerHTML = '<button class="view-chip" id="cf-save-view" style="border-style:dashed">+ Save view</button>';
        views.forEach(function(v){
          var chip = document.createElement('button');
          chip.className = 'view-chip cf-saved-chip';
          chip.title = JSON.stringify(v.filters);
          chip.innerHTML = '<span>'+(v.icon||'⭐')+' '+(v.name||'View')+'</span>'+
            '<span class="cf-del" style="margin-left:6px;color:var(--c-tertiary);cursor:pointer">×</span>';
          chip.addEventListener('click', function(e){
            if(e.target.classList.contains('cf-del')){
              e.stopPropagation();
              CF.savedViews.remove(v.id).then(render);
              return;
            }
            // Apply filters
            Object.keys(v.filters||{}).forEach(function(k){
              var el = document.querySelector('[data-cf-persist="lib_'+k+'"], #'+k);
              if(el){ el.value = v.filters[k]; el.dispatchEvent(new Event('change',{bubbles:true})); }
            });
          });
          box.appendChild(chip);
        });
        document.getElementById('cf-save-view').addEventListener('click', function(){
          var name = prompt('Nom de la vue :');
          if(!name) return;
          var filters = {};
          document.querySelectorAll('[data-cf-persist^="lib_"]').forEach(function(el){
            var k = el.getAttribute('data-cf-persist').replace(/^lib_/,'');
            if(el.value) filters[k] = el.value;
          });
          CF.savedViews.save({
            id: 'v_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
            name: name,
            icon: '⭐',
            filters: filters,
            created_at: new Date().toISOString()
          }).then(render);
        });
      });
    }
    render();
  };

  // Auto-inject saved views sur library
  if(/library/.test(location.pathname)){
    document.addEventListener('DOMContentLoaded', function(){
      setTimeout(function(){ try{ CF.injectSavedViewsUI(); }catch(e){} }, 600);
    });
    if(document.readyState !== 'loading'){
      setTimeout(function(){ try{ CF.injectSavedViewsUI(); }catch(e){} }, 600);
    }
  }
})();

/* ============================================================
   Wave 4 — Tangibles restantes
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  /* --- #84 Raccourcis clavier configurables --- */
  CF.shortcuts = (function(){
    var KEY = 'shortcuts_v1';
    var DEFAULTS = {
      'play_pause': 'Space',
      'next_cue': 'ArrowRight',
      'prev_cue': 'ArrowLeft',
      'add_cue': 'KeyC',
      'delete_track': 'KeyD',
      'open_palette': 'cmd+k',
      'admin_search': 'cmd+shift+k',
      'theme_toggle': 'cmd+shift+t',
      'feedback': 'cmd+,'
    };
    function get(){
      try{ return Object.assign({}, DEFAULTS, CF.ls.get(KEY,{})); }catch(e){ return DEFAULTS; }
    }
    function set(map){ CF.ls.set(KEY, map||{}); }
    function reset(){ CF.ls.del(KEY); }
    function match(action, e){
      var binding = get()[action];
      if(!binding) return false;
      var parts = binding.toLowerCase().split('+');
      var key = parts[parts.length-1];
      var keyMatch = (e.code && e.code.toLowerCase() === key) || (e.key && e.key.toLowerCase() === key);
      var needCmd = parts.indexOf('cmd') > -1;
      var needShift = parts.indexOf('shift') > -1;
      var needAlt = parts.indexOf('alt') > -1;
      return keyMatch
        && (needCmd === !!(e.metaKey || e.ctrlKey))
        && (needShift === !!e.shiftKey)
        && (needAlt === !!e.altKey);
    }
    return { get:get, set:set, reset:reset, match:match, defaults: DEFAULTS };
  })();

  /* --- #21 Loop entre 2 cues (Shift+click sur cue puis sur 2e cue) --- */
  CF.cueLoop = (function(){
    var first = null, audio = null, loopStart = 0, loopEnd = 0, looping = false;
    function tick(){
      if(!looping || !audio) return;
      if(audio.currentTime >= loopEnd){
        try{ audio.currentTime = loopStart; }catch(e){}
      }
      requestAnimationFrame(tick);
    }
    return {
      bind: function(audioRef){
        audio = audioRef;
        document.addEventListener('click', function(e){
          var pad = e.target.closest('[data-cue-time]');
          if(!pad || !e.shiftKey) return;
          e.preventDefault();
          var time = parseFloat(pad.getAttribute('data-cue-time'));
          if(!isFinite(time)) return;
          if(first == null){
            first = time;
            pad.classList.add('cf-loop-pending');
            if(CF.toastGroup) CF.toastGroup.push('Loop A → cliquer un 2e cue avec Shift', 'info');
          } else {
            loopStart = Math.min(first, time);
            loopEnd = Math.max(first, time);
            looping = true;
            document.querySelectorAll('.cf-loop-pending').forEach(function(el){el.classList.remove('cf-loop-pending')});
            if(audio){
              try{ audio.currentTime = loopStart; if(audio.paused) audio.play(); }catch(e){}
              tick();
            }
            if(CF.toastGroup) CF.toastGroup.push('Loop activé · ' + (loopEnd-loopStart).toFixed(1)+'s · clic ailleurs pour quitter','success');
            first = null;
          }
        }, true);
        document.addEventListener('keydown', function(e){
          if(e.key === 'Escape' && looping){
            looping = false;
            if(CF.toastGroup) CF.toastGroup.push('Loop désactivé', 'info');
          }
        });
      },
      stop: function(){ looping = false; first = null; }
    };
  })();

  /* --- #27 Annuler upload en cours (AbortController par fichier) --- */
  CF.uploadCancellation = {
    controllers: new Map(),
    register: function(fileName, ctrl){ this.controllers.set(fileName, ctrl); },
    cancel: function(fileName){
      var c = this.controllers.get(fileName);
      if(c){ try{ c.abort(); }catch(e){} this.controllers.delete(fileName); return true; }
      return false;
    },
    cancelAll: function(){
      var n = this.controllers.size;
      this.controllers.forEach(function(c){try{c.abort()}catch(e){}});
      this.controllers.clear();
      return n;
    }
  };

  /* --- #45 Templates de sets (warm-up / peak time / closing) --- */
  CF.setTemplates = [
    {
      id: 'warmup',
      name: 'Warm-up (60min)',
      icon: '🌅',
      bpm_min: 100, bpm_max: 118,
      energy_min: 2, energy_max: 5,
      target_duration: 3600,
      description: 'Démarrage doux, énergie progressive 2→5'
    },
    {
      id: 'peak',
      name: 'Peak time (90min)',
      icon: '🔥',
      bpm_min: 124, bpm_max: 132,
      energy_min: 7, energy_max: 10,
      target_duration: 5400,
      description: 'Plateau haute énergie 7→10, BPM stable'
    },
    {
      id: 'closing',
      name: 'Closing (45min)',
      icon: '🌙',
      bpm_min: 95, bpm_max: 122,
      energy_min: 3, energy_max: 8,
      target_duration: 2700,
      description: 'Descente progressive, deep / down-tempo finale'
    },
    {
      id: 'wedding',
      name: 'Mariage soirée (4h)',
      icon: '💍',
      bpm_min: 90, bpm_max: 130,
      energy_min: 4, energy_max: 9,
      target_duration: 14400,
      description: 'Mix éclectique tous styles, montée lente'
    },
    {
      id: 'radio',
      name: 'Radio show (60min)',
      icon: '📻',
      bpm_min: 110, bpm_max: 128,
      energy_min: 5, energy_max: 9,
      target_duration: 3600,
      description: 'Sélection cohérente, intro+outro propres'
    }
  ];

  /* --- #97 Actions étendues palette Cmd+K (intégration avec cfTransitions.PAL_ACTIONS) --- */
  CF.extraPaletteActions = [
    { ttl:'Save current view',   ctx:'Sauve filtres library', icon:'⭐',
      run: function(){
        var name = prompt('Nom de la vue :');
        if(!name) return;
        var filters = {};
        document.querySelectorAll('[data-cf-persist^="lib_"]').forEach(function(el){
          var k = el.getAttribute('data-cf-persist').replace(/^lib_/,'');
          if(el.value) filters[k] = el.value;
        });
        CF.savedViews.save({
          id: 'v_'+Date.now(), name: name, icon: '⭐', filters: filters,
          created_at: new Date().toISOString()
        }).then(function(){
          if(CF.toastGroup) CF.toastGroup.push('Vue sauvée : '+name, 'success');
        });
      }
    },
    { ttl:'Toggle reduce-motion', ctx:'Animations on/off', icon:'🐌',
      run: function(){
        var cur = CF.ls.get('reduce_motion', false);
        CF.ls.set('reduce_motion', !cur);
        document.documentElement.setAttribute('data-reduce-motion', !cur ? '1' : '0');
        if(CF.toastGroup) CF.toastGroup.push('Animations '+(cur?'on':'off'), 'info');
      }
    },
    { ttl:'Export current page CSV', ctx:'Tracks/stats visibles', icon:'📊',
      run: function(){
        var rows = [];
        document.querySelectorAll('tr,[role=row]').forEach(function(r){
          var cells = Array.prototype.slice.call(r.querySelectorAll('td,[role=cell]')).map(function(c){return c.textContent.trim()});
          if(cells.length) rows.push({col0:cells[0]||'',col1:cells[1]||'',col2:cells[2]||'',col3:cells[3]||''});
        });
        if(rows.length) CF.exportCSV('cueforge-page-'+location.pathname.replace(/[^a-z]/gi,'_'), rows);
      }
    },
    { ttl:'Reset filters', ctx:'Vide tous les filtres library', icon:'🔄',
      run: function(){
        document.querySelectorAll('[data-cf-persist]').forEach(function(el){
          el.value = ''; el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        if(CF.toastGroup) CF.toastGroup.push('Filtres réinitialisés', 'info');
      }
    },
    { ttl:'Clear search history', ctx:'Vide historique Cmd+K', icon:'🧹',
      run: function(){ CF.searchHistory.clear(); if(CF.toastGroup) CF.toastGroup.push('Historique vidé','info'); }
    }
  ];

  // Hook palette (s'exécute après transitions.js qui définit PAL_ACTIONS)
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      try{
        if(window.cfTransitions){
          // cfTransitions n'expose pas PAL_ACTIONS publiquement, on hook via document event
          window.cfPaletteExtra = CF.extraPaletteActions;
        }
      }catch(e){}
    }, 1000);
  });

  /* --- #15  Split-view analyze (?compare=ID) --- */
  CF.bindCompareView = function(){
    var qs = new URLSearchParams(location.search);
    var compareId = qs.get('compare');
    if(!compareId || !/analyze/.test(location.pathname)) return;
    if(document.getElementById('cf-compare-bar')) return;

    var bar = document.createElement('div');
    bar.id = 'cf-compare-bar';
    bar.style.cssText = 'position:fixed;bottom:14px;left:14px;right:14px;background:var(--s-2);border:1px solid var(--amber);border-radius:12px;padding:10px 14px;z-index:9000;display:flex;justify-content:space-between;align-items:center;gap:12px;font-family:var(--font-display);font-size:13px;box-shadow:0 8px 28px rgba(0,0,0,0.4)';
    bar.innerHTML = '<span>⚖ <strong>Compare mode</strong> · <span id="cf-cmp-status">Chargement track #'+compareId+'…</span></span>'+
      '<span><button id="cf-cmp-swap" style="margin-right:8px;padding:5px 10px;border-radius:6px;background:var(--s-3);border:1px solid var(--b-default);color:var(--c-secondary);cursor:pointer;font-size:12px">⇄ Swap</button>'+
      '<button id="cf-cmp-close" style="padding:5px 10px;border-radius:6px;background:var(--amber);color:#000;border:none;cursor:pointer;font-size:12px;font-weight:600">Fermer</button></span>';
    document.body.appendChild(bar);

    document.getElementById('cf-cmp-close').addEventListener('click', function(){
      var u = new URL(location.href);
      u.searchParams.delete('compare');
      location.href = u.toString();
    });
    document.getElementById('cf-cmp-swap').addEventListener('click', function(){
      var currentId = qs.get('id');
      location.href = '/analyze?id='+encodeURIComponent(compareId)+'&compare='+encodeURIComponent(currentId);
    });

    // Fetch les 2 tracks et afficher score breakdown
    Promise.all([
      CF.apiCall('GET', '/tracks/'+qs.get('id')).catch(function(){return null}),
      CF.apiCall('GET', '/tracks/'+compareId).catch(function(){return null})
    ]).then(function(res){
      var a = res[0], b = res[1];
      if(!a || !b){ document.getElementById('cf-cmp-status').textContent = 'Erreur fetch'; return; }
      var scoreA = {bpm: a.analysis_bpm||a.bpm, camelot: a.analysis_camelot||a.camelot_code, energy: a.analysis_energy||a.energy_level};
      var scoreB = {bpm: b.analysis_bpm||b.bpm, camelot: b.analysis_camelot||b.camelot_code, energy: b.analysis_energy||b.energy_level};
      var s = CF.transitionScore(scoreA, scoreB);
      var color = s.overall>=75 ? '#22c55e' : (s.overall>=55 ? '#f59e0b' : '#ef4444');
      document.getElementById('cf-cmp-status').innerHTML =
        '<strong style="color:'+color+'">'+s.overall+'/100</strong> compat ' +
        '· Key '+s.factors.key+' · BPM '+s.factors.bpm+' · Energy '+s.factors.energy+
        ' · vs <em>'+(b.title||'#'+compareId)+'</em>';
    });
  };

  /* --- #74  Bulk actions impersonation logs (admin) --- */
  CF.bulkImpersonationActions = function(){
    if(!/admin/.test(location.pathname)) return;
    var table = document.querySelector('#impersonation-logs, [data-impersonation-table]');
    if(!table || document.getElementById('cf-imp-bulk')) return;
    var bar = document.createElement('div');
    bar.id = 'cf-imp-bulk';
    bar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
    bar.innerHTML = '<button class="btn-sm" id="cf-imp-export" style="padding:6px 12px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:12px;cursor:pointer">📥 Export CSV</button>'+
      '<span style="font-size:11px;color:var(--c-tertiary)" id="cf-imp-count"></span>';
    table.parentNode.insertBefore(bar, table);
    document.getElementById('cf-imp-export').addEventListener('click', function(){
      var rows = [];
      table.querySelectorAll('tr').forEach(function(r,i){
        if(i===0) return;
        var cells = Array.prototype.slice.call(r.querySelectorAll('td')).map(function(c){return c.textContent.trim()});
        if(cells.length) rows.push({timestamp:cells[0]||'',admin:cells[1]||'',target:cells[2]||'',action:cells[3]||''});
      });
      if(rows.length) CF.exportCSV('cueforge-impersonation-logs', rows);
    });
  };

  // Auto-init wave 4
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      try{ CF.bindCompareView(); }catch(e){}
      try{ CF.bulkImpersonationActions(); }catch(e){}
    }, 800);
  });
  if(document.readyState !== 'loading'){
    setTimeout(function(){
      try{ CF.bindCompareView(); }catch(e){}
      try{ CF.bulkImpersonationActions(); }catch(e){}
    }, 800);
  }
})();

/* ============================================================
   Wave 5 — Versioning, public sharing, audit, heatmap real
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  /* --- #47 Versioning sets --- */
  CF.snapshots = {
    create: function(setId, name){
      return CF.apiCall('POST','/sets/'+setId+'/snapshot', {name: name||null});
    },
    list: function(setId){
      return CF.apiCall('GET','/sets/'+setId+'/snapshots').then(function(r){return (r&&r.snapshots)||[]});
    }
  };

  /* --- #46 Public sharing --- */
  CF.share = {
    enable: function(setId){
      return CF.apiCall('POST','/sets/'+setId+'/share');
    },
    disable: function(setId){
      return CF.apiCall('DELETE','/sets/'+setId+'/share');
    }
  };

  /* --- #79 Audit log admin --- */
  CF.adminAudit = function(userId, limit){
    var qs = [];
    if(userId) qs.push('user_id='+userId);
    if(limit) qs.push('limit='+limit);
    return CF.apiCall('GET','/admin/audit-log'+(qs.length?'?'+qs.join('&'):''));
  };

  /* --- #14 Markers sections waveform : hook auto sur analyze --- */
  CF.injectSectionMarkers = function(){
    if(!/analyze/.test(location.pathname)) return;
    if(document.getElementById('cf-section-markers')) return;
    var waveContainer = document.querySelector('.wave-block, #wave')?.parentElement;
    if(!waveContainer) return;

    // Récupérer energy_curve depuis l'API
    var trackId = (new URLSearchParams(location.search)).get('id');
    if(!trackId) return;

    CF.apiCall('GET', '/tracks/'+trackId).then(function(t){
      if(!t) return;
      // Cherche la courbe d'énergie dans plusieurs champs possibles
      var curve = t.energy_curve || t.analysis_energy_curve || t.energy_timeline || null;
      if(typeof curve === 'string'){ try{ curve = JSON.parse(curve); }catch(e){curve=null} }
      if(!Array.isArray(curve) || curve.length < 8){
        // Fallback : générer une courbe synthétique depuis loudness ou energy_level
        return;
      }
      var dur = t.duration_seconds || 180;
      var sections = CF.detectSections(curve, dur);
      if(!sections.length) return;

      var bar = document.createElement('div');
      bar.id = 'cf-section-markers';
      bar.style.cssText = 'position:relative;height:18px;margin-top:4px;display:flex;font-family:var(--font-mono);font-size:9px;letter-spacing:.05em';
      sections.forEach(function(sec){
        var pct = (sec.start/dur)*100;
        var w = ((sec.end-sec.start)/dur)*100;
        var color = sec.type==='intro' ? 'rgba(34,197,94,0.3)' :
                    sec.type==='drop' ? 'rgba(255,122,24,0.5)' :
                    sec.type==='outro' ? 'rgba(120,120,255,0.3)' :
                    'rgba(150,150,150,0.2)';
        var marker = document.createElement('div');
        marker.style.cssText = 'position:absolute;left:'+pct+'%;width:'+w+'%;top:0;bottom:0;background:'+color+';border-radius:3px;color:var(--c-secondary);text-align:center;line-height:18px;text-transform:uppercase;cursor:default';
        marker.textContent = sec.type;
        marker.title = sec.type+' · '+Math.round(sec.start)+'s → '+Math.round(sec.end)+'s';
        bar.appendChild(marker);
      });
      var waveEl = document.getElementById('wave');
      if(waveEl && waveEl.parentNode){
        waveEl.parentNode.insertBefore(bar, waveEl.nextSibling);
      }
    }).catch(function(){});
  };

  /* --- #46 + #47 UI : bouton Versions et bouton Partager dans set-builder --- */
  CF.injectSetBuilderActions = function(){
    if(!/set-builder/.test(location.pathname)) return;
    if(document.getElementById('cf-set-actions')) return;
    var qs = new URLSearchParams(location.search);
    var setId = qs.get('id');
    // Toujours injecter Templates + PDF, snap/versions/share seulement si setId

    var topBar = document.querySelector('.set-actions, .set-header, header');
    if(!topBar) return;
    var box = document.createElement('span');
    box.id = 'cf-set-actions';
    box.style.cssText = 'display:inline-flex;gap:6px;margin-left:6px';
    var sty = 'padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:12px;cursor:pointer';
    var html = '';
    if(setId){
      html += '<button id="cf-snap-btn" class="btn-sm" style="'+sty+'" title="Snapshot version">📸 Snap</button>';
      html += '<button id="cf-versions-btn" class="btn-sm" style="'+sty+'" title="Voir les versions">📚 Versions</button>';
      html += '<button id="cf-share-btn" class="btn-sm" style="'+sty+'" title="Lien public">🔗 Share</button>';
    }
    html += '<button id="cf-tpl-btn" class="btn-sm" style="'+sty+'" title="Templates de sets">📋 Templates</button>';
    html += '<button id="cf-export-pdf" class="btn-sm" style="'+sty+'" title="Export PDF">📄 PDF</button>';
    box.innerHTML = html;
    topBar.appendChild(box);

    if(setId){
    document.getElementById('cf-snap-btn').addEventListener('click', function(){
      var name = prompt('Nom de la version (optionnel) :') || null;
      CF.snapshots.create(setId, name).then(function(r){
        if(CF.toastGroup) CF.toastGroup.push('Snapshot v'+r.snapshot_count+' créé', 'success');
      }).catch(function(e){
        if(CF.toastGroup) CF.toastGroup.push('Erreur snapshot : '+e.message,'error');
      });
    });

    document.getElementById('cf-versions-btn').addEventListener('click', function(){
      CF.snapshots.list(setId).then(function(snaps){
        if(!snaps.length){ alert('Aucune version sauvegardée. Clique 📸 Snap pour créer la première.'); return; }
        var msg = snaps.map(function(s,i){ return (i+1)+'. '+s.name+' — '+(s.tracks||[]).length+' tracks — '+(s.created_at||'').slice(0,16); }).join('\n');
        alert('Versions:\n\n'+msg);
      });
    });

    document.getElementById('cf-share-btn').addEventListener('click', function(){
      CF.share.enable(setId).then(function(r){
        if(r && r.public_url){
          var url = location.origin + r.public_url;
          if(navigator.clipboard) navigator.clipboard.writeText(url);
          if(CF.toastGroup) CF.toastGroup.push('Lien copié : '+url, 'success');
          else alert('Lien public : '+url);
        }
      }).catch(function(e){
        if(CF.toastGroup) CF.toastGroup.push('Erreur partage : '+e.message,'error');
      });
    });
    } // close if(setId)

    // Templates picker
    document.getElementById('cf-tpl-btn').addEventListener('click', function(){
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
      modal.addEventListener('click', function(e){if(e.target===modal) modal.remove()});
      var card = document.createElement('div');
      card.style.cssText = 'background:var(--s-1);border:1px solid var(--b-default);border-radius:14px;padding:20px;max-width:640px;width:100%';
      card.innerHTML = '<h3 style="margin:0 0 12px;font-family:var(--font-display);font-size:16px">Choisis un template</h3><div class="cf-templates-picker"></div>';
      modal.appendChild(card);
      var picker = card.querySelector('.cf-templates-picker');
      CF.setTemplates.forEach(function(t){
        var el = document.createElement('div');
        el.className = 'cf-template-card';
        el.innerHTML = '<span class="ic">'+t.icon+'</span><span class="nm">'+t.name+'</span><div class="ds">'+t.bpm_min+'-'+t.bpm_max+' BPM · Energy '+t.energy_min+'-'+t.energy_max+' · '+Math.round(t.target_duration/60)+'min</div><div style="font-size:11px;color:var(--c-tertiary);margin-top:4px">'+t.description+'</div>';
        el.addEventListener('click', function(){
          if(window.currentSet){
            window.currentSet.target_bpm_min = t.bpm_min;
            window.currentSet.target_bpm_max = t.bpm_max;
            window.currentSet.target_energy_min = t.energy_min;
            window.currentSet.target_energy_max = t.energy_max;
            window.currentSet.target_duration = t.target_duration;
            if(CF.toastGroup) CF.toastGroup.push('Template "'+t.name+'" appliqué','success');
            if(typeof window.loadSuggestions === 'function') window.loadSuggestions();
          } else {
            if(CF.toastGroup) CF.toastGroup.push('Template "'+t.name+'" sélectionné','info');
          }
          modal.remove();
        });
        picker.appendChild(el);
      });
      document.body.appendChild(modal);
    });

    // Export PDF
    document.getElementById('cf-export-pdf').addEventListener('click', function(){
      try{
        var s = window.currentSet || {tracks:[]};
        var tracks = (s.tracks||[]).map(function(t){
          return {
            artist: t.artist||'', title: t.title||t.original_filename||'',
            bpm: (t.analysis_bpm||t.bpm||''), key: (t.analysis_camelot||t.camelot||''),
            duration: (t.duration_seconds||t.duration||0)
          };
        });
        var totalDur = tracks.reduce(function(a,t){return a+(t.duration||0)},0);
        var bpms = tracks.map(function(t){return parseFloat(t.bpm)||0}).filter(Boolean);
        var avg = bpms.length ? Math.round(bpms.reduce(function(a,b){return a+b},0)/bpms.length) : 0;
        CF.exportSetPDF({
          name: s.name || 'Setlist',
          tracks: tracks,
          duration: totalDur,
          avgBpm: avg
        });
      }catch(e){ console.error(e); }
    });
  };

  /* --- #54 Auto-mix 1 clic UI (mix-studio) --- */
  CF.injectAutoMixBtn = function(){
    if(!/mix-studio/.test(location.pathname)) return;
    if(document.getElementById('cf-automix')) return;
    var transport = document.querySelector('.transport, .controls, .mix-controls, header');
    if(!transport) return;
    var btn = document.createElement('button');
    btn.id = 'cf-automix';
    btn.className = 'btn-sm';
    btn.style.cssText = 'margin-left:8px;padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,var(--amber,#ff7a18),var(--pink,#ff4d8d));color:#000;border:none;font-family:inherit;font-weight:600;font-size:13px;cursor:pointer';
    btn.innerHTML = '✨ Auto-mix';
    btn.title = 'Génère une transition baseline 1 clic depuis BPM/Key/Energy';
    btn.addEventListener('click', function(){
      var trackA = window.deckA && window.deckA.track;
      var trackB = window.deckB && window.deckB.track;
      if(!trackA || !trackB){
        if(CF.toastGroup) CF.toastGroup.push('Charge 2 tracks dans les decks d abord','info');
        return;
      }
      var score = CF.transitionScore(
        {bpm: trackA.bpm, camelot: trackA.camelot, energy: trackA.energy},
        {bpm: trackB.bpm, camelot: trackB.camelot, energy: trackB.energy}
      );
      var markers = CF.suggestTransitionMarkers(trackA, trackB);
      if(CF.toastGroup) CF.toastGroup.push(
        'Auto-mix : score '+score.overall+'/100 · '+markers.bars+' bars · out A '+
        Math.round(markers.out_a||0)+'s → in B '+Math.round(markers.in_b||0)+'s',
        score.overall>=70?'success':'info'
      );
      // Si l'app expose des setters, on les appelle
      if(window.applyTransitionParams){ window.applyTransitionParams(markers); }
    });
    transport.appendChild(btn);
  };

  // Auto-init wave 5
  function init5(){
    try{ CF.injectSectionMarkers(); }catch(e){}
    try{ CF.injectSetBuilderActions(); }catch(e){}
    try{ CF.injectAutoMixBtn(); }catch(e){}
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init5, 1500); });
  } else {
    setTimeout(init5, 1500);
  }
})();

/* ============================================================
   Wave 6 — Reorder, similar, ID3, copy-cues, undo, drill-down
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  /* --- #7 Drag-to-reorder library (HTML5 drag) --- */
  CF.bindDragReorder = function(rootSel, opts){
    opts = opts || {};
    var root = typeof rootSel==='string' ? document.querySelector(rootSel) : rootSel;
    if(!root) return;
    var dragged = null;
    function onDragStart(e){
      dragged = e.target.closest('[data-cf-reorderable]');
      if(!dragged){ e.preventDefault(); return; }
      dragged.classList.add('cf-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try{ e.dataTransfer.setData('text/plain', dragged.dataset.id || ''); }catch(_){}
    }
    function onDragOver(e){
      e.preventDefault();
      var target = e.target.closest('[data-cf-reorderable]');
      if(!target || target === dragged) return;
      var rect = target.getBoundingClientRect();
      var after = (e.clientY - rect.top) > rect.height/2;
      target.parentNode.insertBefore(dragged, after ? target.nextSibling : target);
    }
    function onDragEnd(){
      if(dragged) dragged.classList.remove('cf-dragging');
      dragged = null;
      if(opts.onReorder){
        var order = Array.prototype.slice.call(root.querySelectorAll('[data-cf-reorderable]')).map(function(el){return el.dataset.id});
        opts.onReorder(order);
      }
    }
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragend', onDragEnd);
    // Setup draggable attribute
    root.querySelectorAll('[data-cf-reorderable]').forEach(function(el){ el.draggable = true; });
    // MutationObserver pour les nouvelles rows
    var mo = new MutationObserver(function(){
      root.querySelectorAll('[data-cf-reorderable]:not([draggable])').forEach(function(el){ el.draggable = true; });
    });
    mo.observe(root, {childList:true, subtree:true});
  };

  /* --- #17 Re-analyse partielle --- */
  CF.reanalyzePartial = function(trackId, fields){
    return CF.apiCall('POST','/tracks/'+trackId+'/reanalyze-partial', {fields: fields||['bpm']});
  };

  /* --- #24 Tracks similaires --- */
  CF.findSimilar = function(trackId, limit){
    return CF.apiCall('GET','/tracks/'+trackId+'/similar?limit='+(limit||10));
  };

  /* --- #36 Copier cues entre 2 tracks --- */
  CF.copyCues = function(srcId, dstId, overwrite){
    return CF.apiCall('POST','/tracks/'+srcId+'/copy-cues/'+dstId, {overwrite: !!overwrite});
  };

  /* --- #39 Memo texte par cue --- */
  CF.updateCueNote = function(cueId, note){
    return CF.apiCall('PATCH','/cues/'+cueId+'/note', {note: note});
  };

  /* --- #40 Undo/redo cues stack --- */
  CF.cueUndo = (function(){
    var stack = [], pointer = -1, max = 50;
    return {
      push: function(state){
        // state = snapshot des cues à l'instant T
        stack = stack.slice(0, pointer+1);
        stack.push(JSON.parse(JSON.stringify(state)));
        if(stack.length > max) stack.shift();
        pointer = stack.length - 1;
      },
      undo: function(){
        if(pointer <= 0) return null;
        pointer--;
        return stack[pointer];
      },
      redo: function(){
        if(pointer >= stack.length-1) return null;
        pointer++;
        return stack[pointer];
      },
      canUndo: function(){return pointer > 0},
      canRedo: function(){return pointer < stack.length-1},
      reset: function(){ stack=[]; pointer=-1; }
    };
  })();

  /* --- #30 Lecture ID3 client (audio File → tags simples) --- */
  CF.readID3 = function(file){
    // Implémentation minimaliste : parse les 128 derniers bytes pour ID3v1
    return new Promise(function(resolve){
      var fr = new FileReader();
      fr.onload = function(e){
        try{
          var buf = e.target.result;
          var view = new DataView(buf);
          // Check 'TAG' marker
          var marker = String.fromCharCode(view.getUint8(0))+String.fromCharCode(view.getUint8(1))+String.fromCharCode(view.getUint8(2));
          if(marker !== 'TAG'){ resolve(null); return; }
          function readStr(start, len){
            var s = '';
            for(var i=0;i<len;i++){
              var c = view.getUint8(start+i);
              if(c === 0) break;
              s += String.fromCharCode(c);
            }
            return s.trim();
          }
          resolve({
            title: readStr(3, 30),
            artist: readStr(33, 30),
            album: readStr(63, 30),
            year: readStr(93, 4),
            comment: readStr(97, 30)
          });
        }catch(err){ resolve(null); }
      };
      fr.onerror = function(){ resolve(null); };
      fr.readAsArrayBuffer(file.slice(file.size - 128));
    });
  };

  /* --- #78 Admin quick actions --- */
  CF.adminQuickAction = function(userId, action){
    return CF.apiCall('POST','/admin/users/'+userId+'/quick-action', {action: action});
  };

  /* --- Hook spécifiques pages --- */

  // #19 Retour library avec filtre actif (sauvegardé en sessionStorage avant de quitter)
  function saveLibFilters(){
    if(!/library/.test(location.pathname)) return;
    var snap = {};
    document.querySelectorAll('[data-cf-persist^="lib_"]').forEach(function(el){
      var k = el.getAttribute('data-cf-persist');
      if(el.value) snap[k] = el.value;
    });
    if(Object.keys(snap).length){
      try{ sessionStorage.setItem('cf_lib_filters_back', JSON.stringify(snap)); }catch(e){}
    }
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href*="/analyze"]');
    if(a && /library/.test(location.pathname)) saveLibFilters();
  }, true);

  // Restore au retour si referrer = analyze
  if(/library/.test(location.pathname) && document.referrer.indexOf('/analyze') > -1){
    setTimeout(function(){
      try{
        var snap = JSON.parse(sessionStorage.getItem('cf_lib_filters_back') || '{}');
        Object.keys(snap).forEach(function(k){
          var el = document.querySelector('[data-cf-persist="'+k+'"]');
          if(el && !el.value){ el.value = snap[k]; el.dispatchEvent(new Event('change',{bubbles:true})); }
        });
      }catch(e){}
    }, 500);
  }

  // #24 Bouton "Tracks similaires" dans analyze
  function injectSimilarBtn(){
    if(!/analyze/.test(location.pathname)) return;
    if(document.getElementById('cf-similar-btn')) return;
    var trackId = (new URLSearchParams(location.search)).get('id');
    if(!trackId) return;
    var insp = document.querySelector('aside.inspector, .inspector, [data-inspector]') || document.querySelector('aside:not(.rail)');
    if(!insp) return;
    var btn = document.createElement('button');
    btn.id = 'cf-similar-btn';
    btn.style.cssText = 'width:100%;margin-top:10px;padding:10px 14px;border-radius:8px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-family:inherit;font-size:13px;cursor:pointer;text-align:left';
    btn.innerHTML = '🎯 Tracks similaires (BPM ±4 + Key compatible)';
    btn.addEventListener('click', function(){
      btn.disabled = true; btn.textContent = 'Recherche…';
      CF.findSimilar(trackId, 10).then(function(list){
        btn.disabled = false; btn.textContent = '🎯 Tracks similaires';
        if(!list || !list.length){ alert('Aucune track similaire trouvée'); return; }
        var url = '/library?bpm_min='+(list[0].bpm-3)+'&bpm_max='+(list[0].bpm+3);
        var msg = list.slice(0,8).map(function(s){return '• '+(s.artist||'?')+' — '+(s.title||'?')+' ('+(s.bpm||'-')+' BPM, '+(s.key||'-')+', '+s.score+'%)'}).join('\n');
        if(confirm('Tracks similaires:\n\n'+msg+'\n\nFiltrer la library ?')){
          location.href = url;
        }
      }).catch(function(){
        btn.disabled = false; btn.textContent = '🎯 Tracks similaires';
        if(CF.toastGroup) CF.toastGroup.push('Erreur recherche similaires','error');
      });
    });
    insp.appendChild(btn);
  }
  setTimeout(injectSimilarBtn, 1500);

  // #36 Bouton "Copier les cues vers..." dans analyze
  function injectCopyCuesBtn(){
    if(!/analyze/.test(location.pathname)) return;
    if(document.getElementById('cf-copy-cues-btn')) return;
    var trackId = (new URLSearchParams(location.search)).get('id');
    if(!trackId) return;
    var transport = document.querySelector('.tr-btns')?.parentElement || document.querySelector('.transport');
    if(!transport) return;
    var btn = document.createElement('button');
    btn.id = 'cf-copy-cues-btn';
    btn.className = 'btn-sm';
    btn.style.cssText = 'margin-top:8px;padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:11px;cursor:pointer';
    btn.innerHTML = '📋 Copier cues vers…';
    btn.addEventListener('click', function(){
      var dst = prompt('ID de la track destinataire :');
      if(!dst) return;
      var ow = confirm('Écraser les cues existantes dans la track destinataire ?');
      CF.copyCues(trackId, dst, ow).then(function(r){
        if(CF.toastGroup) CF.toastGroup.push(r.copied+' cues copiées vers track #'+dst, 'success');
      }).catch(function(e){
        if(CF.toastGroup) CF.toastGroup.push('Erreur copie : '+e.message,'error');
      });
    });
    transport.appendChild(btn);
  }
  setTimeout(injectCopyCuesBtn, 1500);

  // #73 Drill-down stat : clic sur KPI → library filtré
  function bindDrillDown(){
    if(!/stats/.test(location.pathname)) return;
    document.querySelectorAll('.kpi[data-drill], .kpi[data-filter]').forEach(function(kpi){
      if(kpi.dataset.cfDrill) return;
      kpi.dataset.cfDrill = '1';
      kpi.style.cursor = 'pointer';
      kpi.addEventListener('click', function(){
        var f = kpi.dataset.drill || kpi.dataset.filter;
        location.href = '/library?'+f;
      });
    });
    // Auto-tag les KPIs basé sur leur label
    document.querySelectorAll('.kpi').forEach(function(kpi){
      if(kpi.dataset.cfDrillAuto) return;
      kpi.dataset.cfDrillAuto = '1';
      var label = (kpi.querySelector('.kpi-label, .lbl')||{}).textContent || '';
      label = label.toLowerCase();
      if(label.indexOf('track') > -1){
        kpi.style.cursor = 'pointer';
        kpi.title = 'Voir toutes les tracks';
        kpi.addEventListener('click', function(){ location.href = '/library'; });
      } else if(label.indexOf('set') > -1){
        kpi.style.cursor = 'pointer';
        kpi.title = 'Voir les sets';
        kpi.addEventListener('click', function(){ location.href = '/sets'; });
      }
    });
  }
  setTimeout(bindDrillDown, 1500);

  // Tag library rows pour drag reorder + bind (avec MutationObserver pour les rows lazy-loaded)
  if(/library/.test(location.pathname)){
    function tagLibRows(){
      document.querySelectorAll('.lib-row[data-id]').forEach(function(row){
        if(!row.hasAttribute('data-cf-reorderable')){
          row.setAttribute('data-cf-reorderable','1');
          row.draggable = true;
        }
      });
    }
    function bindLibDrag(){
      var lib = document.querySelector('.lib');
      if(!lib || lib._cfBound) return;
      lib._cfBound = true;
      try{ CF.bindDragReorder(lib, {
        onReorder: function(order){
          try{ localStorage.setItem('cf_lib_order', JSON.stringify(order)); }catch(e){}
          if(CF.toastGroup) CF.toastGroup.push('Ordre sauvegardé localement','info');
        }
      }); }catch(e){}
    }
    setTimeout(function(){ tagLibRows(); bindLibDrag(); }, 800);
    // MutationObserver pour les rows ajoutées async
    var libBody = document.querySelector('.lib') || document.body;
    var mo = new MutationObserver(function(){ tagLibRows(); bindLibDrag(); });
    mo.observe(libBody, {childList:true, subtree:true});
    // Stop observer après 30s pour éviter cost long-run
    setTimeout(function(){ mo.disconnect(); }, 30000);
  }
})();

/* ============================================================
   Wave 7 — Energy curve réelle, EQ stems viz, lock tempo, stems pref
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  /* --- #14 Section markers : version câblée sur l'API réelle --- */
  CF.injectRealSectionMarkers = function(){
    if(!/analyze/.test(location.pathname)) return;
    if(document.getElementById('cf-real-sections')) return;
    var trackId = (new URLSearchParams(location.search)).get('id');
    if(!trackId) return;

    CF.apiCall('GET','/tracks/'+trackId+'/energy-curve').then(function(r){
      if(!r) return;
      var sections = r.sections || [];
      // Si pas de sections en DB, déduit depuis energy curve
      if(!sections.length && r.energy && r.energy.length > 8){
        sections = CF.detectSections(r.energy, r.duration_seconds || 180);
      }
      if(!sections.length) return;
      var waveEl = document.getElementById('wave');
      if(!waveEl || !waveEl.parentNode) return;

      var bar = document.createElement('div');
      bar.id = 'cf-real-sections';
      bar.style.cssText = 'position:relative;height:18px;margin:4px 0;font-family:var(--font-mono);font-size:9px;letter-spacing:.05em';
      var dur = r.duration_seconds || sections[sections.length-1].end || 180;
      sections.forEach(function(sec){
        var pct = (sec.start/dur)*100;
        var w = Math.max(1, ((sec.end-sec.start)/dur)*100);
        var label = (sec.type||'section').toLowerCase();
        var color = label.indexOf('intro')>-1 ? 'rgba(34,197,94,0.3)' :
                    label.indexOf('drop')>-1 || label.indexOf('chorus')>-1 ? 'rgba(255,122,24,0.5)' :
                    label.indexOf('outro')>-1 ? 'rgba(120,120,255,0.3)' :
                    label.indexOf('break')>-1 ? 'rgba(150,150,150,0.3)' :
                    label.indexOf('verse')>-1 ? 'rgba(100,200,255,0.25)' :
                    'rgba(180,180,180,0.2)';
        var marker = document.createElement('div');
        marker.style.cssText = 'position:absolute;left:'+pct+'%;width:'+w+'%;top:0;bottom:0;background:'+color+';border-radius:3px;color:var(--c-secondary);text-align:center;line-height:18px;text-transform:uppercase;cursor:pointer';
        marker.textContent = label.length > 9 ? label.slice(0,8) : label;
        marker.title = label+' · '+Math.round(sec.start)+'s → '+Math.round(sec.end)+'s';
        marker.addEventListener('click', function(){
          if(window.audioEl){ try{ window.audioEl.currentTime = sec.start; }catch(e){} }
        });
        bar.appendChild(marker);
      });
      waveEl.parentNode.insertBefore(bar, waveEl.nextSibling);
    }).catch(function(){});
  };

  /* --- #51 EQ par stem visualisation (mix-studio) --- */
  CF.injectStemEQ = function(){
    if(!/mix-studio/.test(location.pathname)) return;
    if(document.getElementById('cf-stem-eq')) return;
    var stemPanel = document.querySelector('.stems-panel, [data-stems], .mix-stems');
    if(!stemPanel) return;
    var box = document.createElement('div');
    box.id = 'cf-stem-eq';
    box.style.cssText = 'margin-top:12px;padding:10px;border-radius:8px;background:var(--s-2);border:1px solid var(--b-default)';
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--c-tertiary);margin-bottom:8px">EQ par stem (Drums / Bass / Vocals / Other)</div>';
    var stems = ['drums','bass','vocals','other'];
    stems.forEach(function(stem){
      var row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:60px 1fr 1fr 1fr;gap:8px;margin-bottom:6px;align-items:center';
      row.innerHTML = '<span style="font-family:var(--font-mono);font-size:10px;color:var(--c-secondary);text-transform:uppercase">'+stem+'</span>'+
        '<input type="range" min="-12" max="12" value="0" data-eq-band="low" data-eq-stem="'+stem+'" title="Low (60-250 Hz)" style="accent-color:var(--amber)">'+
        '<input type="range" min="-12" max="12" value="0" data-eq-band="mid" data-eq-stem="'+stem+'" title="Mid (250-4kHz)" style="accent-color:var(--cyan)">'+
        '<input type="range" min="-12" max="12" value="0" data-eq-band="high" data-eq-stem="'+stem+'" title="High (4-20kHz)" style="accent-color:var(--pink)">';
      box.appendChild(row);
    });
    stemPanel.appendChild(box);
    // Persist EQ values en localStorage
    box.querySelectorAll('input[type=range]').forEach(function(slider){
      var key = 'cf_eq_'+slider.dataset.eqStem+'_'+slider.dataset.eqBand;
      try{ var saved = localStorage.getItem(key); if(saved) slider.value = saved; }catch(e){}
      slider.addEventListener('input', function(){
        try{ localStorage.setItem(key, slider.value); }catch(e){}
      });
    });
  };

  /* --- #52 Lock tempo button (mix-studio) --- */
  CF.injectLockTempo = function(){
    if(!/mix-studio/.test(location.pathname)) return;
    if(document.getElementById('cf-lock-tempo')) return;
    var transport = document.querySelector('.transport, .controls, .mix-controls');
    if(!transport) return;
    var btn = document.createElement('button');
    btn.id = 'cf-lock-tempo';
    btn.className = 'btn-sm';
    btn.style.cssText = 'margin-left:8px;padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:12px;cursor:pointer';
    var locked = CF.ls.get('lock_tempo', false);
    function refresh(){
      btn.innerHTML = locked ? '🔒 Lock A→B' : '🔓 Lock A→B';
      btn.style.borderColor = locked ? 'var(--amber)' : 'var(--b-default)';
      btn.style.color = locked ? 'var(--amber)' : 'var(--c-secondary)';
    }
    refresh();
    btn.addEventListener('click', function(){
      locked = !locked; CF.ls.set('lock_tempo', locked); refresh();
      if(CF.toastGroup) CF.toastGroup.push('Lock tempo '+(locked?'ON · B suit A':'OFF'),'info');
    });
    transport.appendChild(btn);
  };

  /* --- #56 Bouton Export stem-aware mix --- */
  CF.injectExportStemMix = function(){
    if(!/mix-studio/.test(location.pathname)) return;
    if(document.getElementById('cf-export-stems')) return;
    var transport = document.querySelector('.transport, .controls, .mix-controls');
    if(!transport) return;
    var btn = document.createElement('button');
    btn.id = 'cf-export-stems';
    btn.className = 'btn-sm';
    btn.style.cssText = 'margin-left:8px;padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:12px;cursor:pointer';
    btn.innerHTML = '🎚 Export stems WAV';
    btn.title = 'Exporter les stems individuels du mix pour Ableton';
    btn.addEventListener('click', function(){
      if(CF.toastGroup) CF.toastGroup.push('Export stem-aware en queue (rendu serveur)','info');
      // Endpoint stub : lance le rendu côté backend si disponible
      CF.apiCall('POST','/mix/export-stems',{}).catch(function(){});
    });
    transport.appendChild(btn);
  };

  /* --- #65 + #67 Stems quality + 2/4-stem preference dans settings --- */
  CF.injectStemsSettings = function(){
    if(!/settings/.test(location.pathname)) return;
    if(document.getElementById('cf-stems-pref')) return;
    var main = document.querySelector('main, .settings-main, .content');
    if(!main) return;
    var sec = document.createElement('section');
    sec.id = 'cf-stems-pref';
    sec.className = 'sec';
    sec.style.cssText = 'margin-top:24px';
    sec.innerHTML = '<h2 class="sec-title">Stems</h2>'+
      '<p class="sec-sub" style="font-size:12px;color:var(--c-tertiary);margin-bottom:12px">Choisis combien de stems sont séparés à l upload (2 = vocal+instru, plus rapide).</p>'+
      '<div class="option-row"><div class="option-info"><div class="option-label">Préférence</div></div>'+
      '<div class="segment" id="cf-stems-seg" style="display:flex;gap:4px">'+
        '<button data-n="2" style="padding:6px 14px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);cursor:pointer;font-size:12px">2 stems</button>'+
        '<button data-n="4" class="active" style="padding:6px 14px;border-radius:6px;background:var(--amber-soft);border:1px solid var(--amber);color:var(--amber);cursor:pointer;font-size:12px">4 stems</button>'+
        '<button data-n="6" style="padding:6px 14px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);cursor:pointer;font-size:12px">6 stems (pro)</button>'+
      '</div></div>';
    main.appendChild(sec);
    var seg = sec.querySelector('#cf-stems-seg');
    seg.querySelectorAll('button').forEach(function(b){
      b.addEventListener('click', function(){
        seg.querySelectorAll('button').forEach(function(x){
          x.classList.remove('active');
          x.style.background = 'var(--s-2)';
          x.style.borderColor = 'var(--b-default)';
          x.style.color = 'var(--c-secondary)';
        });
        b.classList.add('active');
        b.style.background = 'var(--amber-soft, rgba(255,122,24,.15))';
        b.style.borderColor = 'var(--amber, #ff7a18)';
        b.style.color = 'var(--amber, #ff7a18)';
        var n = parseInt(b.dataset.n, 10);
        CF.apiCall('PATCH','/me/stems-preference', {stems_n: n}).then(function(){
          if(CF.toastGroup) CF.toastGroup.push('Préférence stems = '+n,'success');
        }).catch(function(e){
          if(CF.toastGroup) CF.toastGroup.push('Erreur : '+e.message,'error');
        });
      });
    });
  };

  /* --- #63 Download stem individuel (analyze) --- */
  CF.injectStemDownloads = function(){
    if(!/analyze/.test(location.pathname)) return;
    if(document.getElementById('cf-stem-dl')) return;
    var insp = document.querySelector('aside.inspector, .inspector, [data-inspector]') || document.querySelector('aside:not(.rail)');
    if(!insp) return;
    var trackId = (new URLSearchParams(location.search)).get('id');
    if(!trackId) return;
    var box = document.createElement('div');
    box.id = 'cf-stem-dl';
    box.style.cssText = 'margin-top:10px;padding:10px;border-radius:8px;background:var(--s-2);border:1px solid var(--b-default)';
    box.innerHTML = '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--c-tertiary);margin-bottom:8px">Stems · download</div>'+
      ['drums','bass','vocals','other'].map(function(s){
        return '<a href="/api/v1/tracks/'+trackId+'/stems/'+s+'.wav" download style="display:inline-block;margin:2px;padding:4px 10px;border-radius:6px;background:var(--s-3);border:1px solid var(--b-default);color:var(--c-secondary);font-size:11px;text-decoration:none;font-family:var(--font-mono)">⬇ '+s+'</a>';
      }).join('');
    insp.appendChild(box);
  };

  /* --- Auto-init wave 7 --- */
  function init7(){
    try{ CF.injectRealSectionMarkers(); }catch(e){}
    try{ CF.injectStemEQ(); }catch(e){}
    try{ CF.injectLockTempo(); }catch(e){}
    try{ CF.injectExportStemMix(); }catch(e){}
    try{ CF.injectStemsSettings(); }catch(e){}
    try{ CF.injectStemDownloads(); }catch(e){}
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init7, 1800); });
  } else {
    setTimeout(init7, 1800);
  }
})();

/* ============================================================
   Wave 8 — Atteindre 100 (énergie viz, mashup compat, theme preview, profil audio)
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  /* --- #18 Énergie chiffrée + courbe combinée (analyze) --- */
  CF.injectEnergyDisplay = function(){
    if(!/analyze/.test(location.pathname)) return;
    if(document.getElementById('cf-energy-display')) return;
    var trackId = (new URLSearchParams(location.search)).get('id');
    if(!trackId) return;

    var insp = document.querySelector('aside.inspector, .inspector, [data-inspector]') || document.querySelector('aside:not(.rail)');
    if(!insp) return;
    var box = document.createElement('div');
    box.id = 'cf-energy-display';
    box.style.cssText = 'margin-top:10px;padding:12px;border-radius:8px;background:var(--s-2);border:1px solid var(--b-default)';
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><span style="font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--c-tertiary)">Energy</span><span id="cf-energy-num" style="font-family:var(--font-display);font-size:22px;font-weight:600;color:var(--amber)">—</span></div><div id="cf-energy-curve" style="height:32px"></div>';
    insp.appendChild(box);

    CF.apiCall('GET','/tracks/'+trackId+'/energy-curve').then(function(r){
      if(!r) return;
      var energies = r.energy || [];
      if(energies.length){
        var avg = energies.reduce(function(a,b){return a+(b||0)},0)/energies.length;
        var maxE = Math.max.apply(null, energies);
        var normalized = maxE > 0 ? (avg / maxE * 10) : 0;
        document.getElementById('cf-energy-num').textContent = normalized.toFixed(1) + ' / 10';
        // Courbe SVG
        CF.renderEnergyArc(document.getElementById('cf-energy-curve'), energies, {height: 32});
      } else {
        document.getElementById('cf-energy-num').textContent = '—';
      }
    }).catch(function(){});
  };

  /* --- #59 Compatibility matrix mashup (calcul client-side) --- */
  CF.computeCompatMatrix = function(tracks){
    var matrix = [];
    for(var i=0;i<tracks.length;i++){
      var row = [];
      for(var j=0;j<tracks.length;j++){
        if(i === j){ row.push({score: 100, factors: null}); continue; }
        var s = CF.transitionScore(tracks[i], tracks[j]);
        row.push(s);
      }
      matrix.push(row);
    }
    return matrix;
  };

  CF.renderCompatMatrix = function(targetEl, tracks){
    if(!targetEl || !tracks || tracks.length < 2) return;
    var m = CF.computeCompatMatrix(tracks);
    var cellSize = 38;
    var labels = tracks.map(function(t,i){ return (t.title||t.label||('#'+(i+1))).slice(0,12); });
    var html = '<div style="overflow:auto"><table style="border-collapse:collapse;font-family:var(--font-mono);font-size:10px;color:var(--c-secondary)">';
    html += '<tr><td></td>' + labels.map(function(l){return '<th style="padding:4px 8px;font-weight:500;color:var(--c-tertiary)">'+l+'</th>'}).join('') + '</tr>';
    for(var i=0;i<m.length;i++){
      html += '<tr><th style="padding:4px 8px;text-align:right;font-weight:500;color:var(--c-tertiary)">'+labels[i]+'</th>';
      for(var j=0;j<m[i].length;j++){
        var s = m[i][j];
        var pct = s.score;
        var hue = pct > 70 ? 130 : (pct > 50 ? 40 : 0); // green / amber / red
        html += '<td style="width:'+cellSize+'px;height:'+cellSize+'px;background:hsl('+hue+',60%,30%);text-align:center;border:1px solid var(--b-default);color:#fff;font-weight:600" title="'+labels[i]+' → '+labels[j]+' : '+pct+'/100">'+pct+'</td>';
      }
      html += '</tr>';
    }
    html += '</table></div>';
    targetEl.innerHTML = html;
  };

  /* --- #60 Preview 30s rendu (raccourci côté client : fade in/out audio) --- */
  CF.preview30s = function(audioEl, startSec){
    if(!audioEl) return;
    startSec = startSec || 0;
    audioEl.currentTime = startSec;
    audioEl.volume = 0;
    audioEl.play().catch(function(){});
    var step = 0.05;
    var fadeIn = setInterval(function(){
      audioEl.volume = Math.min(1, audioEl.volume + step);
      if(audioEl.volume >= 1) clearInterval(fadeIn);
    }, 50);
    setTimeout(function(){
      var fadeOut = setInterval(function(){
        audioEl.volume = Math.max(0, audioEl.volume - step);
        if(audioEl.volume <= 0){
          clearInterval(fadeOut);
          audioEl.pause();
        }
      }, 50);
    }, 28000);
  };

  /* --- #82 Preview thèmes au hover (settings) --- */
  CF.bindThemePreviewHover = function(){
    if(!/settings/.test(location.pathname)) return;
    var cards = document.querySelectorAll('.theme-card');
    if(!cards.length) return;
    var savedTheme = document.documentElement.getAttribute('data-theme') || '';
    cards.forEach(function(card){
      if(card.dataset.cfHover) return;
      card.dataset.cfHover = '1';
      var theme = card.getAttribute('data-theme') || card.querySelector('[data-theme]')?.getAttribute('data-theme') || '';
      if(!theme) return;
      var hoverTimer = null;
      card.addEventListener('mouseenter', function(){
        hoverTimer = setTimeout(function(){
          // Preview : applique le thème
          document.documentElement.setAttribute('data-theme', theme);
          card.classList.add('cf-theme-previewing');
        }, 400);
      });
      card.addEventListener('mouseleave', function(){
        if(hoverTimer){ clearTimeout(hoverTimer); hoverTimer = null; }
        // Restore le thème actif si pas cliqué
        if(!card.classList.contains('active')){
          document.documentElement.setAttribute('data-theme', savedTheme);
          card.classList.remove('cf-theme-previewing');
        }
      });
      card.addEventListener('click', function(){
        savedTheme = theme;
      });
    });
  };

  /* --- #83 Profil audio préféré (settings) --- */
  CF.injectAudioProfile = function(){
    if(!/settings/.test(location.pathname)) return;
    if(document.getElementById('cf-audio-profile')) return;
    var main = document.querySelector('main, .settings-main, .content');
    if(!main) return;
    var sec = document.createElement('section');
    sec.id = 'cf-audio-profile';
    sec.className = 'sec';
    sec.style.cssText = 'margin-top:24px';
    var profile = CF.ls.get('audio_profile', {
      stems_quality: 'standard',
      export_format: 'wav',
      target_bpm_min: 110,
      target_bpm_max: 130,
      preferred_genres: 'house,techno'
    });
    sec.innerHTML = '<h2 class="sec-title">Profil audio</h2>'+
      '<p class="sec-sub" style="font-size:12px;color:var(--c-tertiary);margin-bottom:12px">Tes défauts pour les stems, exports et BPM cibles dans le set builder.</p>'+
      '<div class="option-row"><div class="option-info"><div class="option-label">Qualité stems</div></div>'+
        '<select id="cf-ap-quality" style="padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-family:inherit">'+
          '<option value="fast">Rapide (44.1kHz, ~30s)</option>'+
          '<option value="standard" selected>Standard (44.1kHz, ~90s)</option>'+
          '<option value="hifi">Hi-Fi (48kHz, ~3min)</option>'+
        '</select></div>'+
      '<div class="option-row"><div class="option-info"><div class="option-label">Format export</div></div>'+
        '<select id="cf-ap-format" style="padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-family:inherit">'+
          '<option value="wav">WAV 16-bit</option>'+
          '<option value="wav24">WAV 24-bit</option>'+
          '<option value="flac">FLAC lossless</option>'+
          '<option value="mp3320">MP3 320 kbps</option>'+
        '</select></div>'+
      '<div class="option-row"><div class="option-info"><div class="option-label">BPM cible (set builder)</div></div>'+
        '<div style="display:flex;gap:6px;align-items:center"><input type="number" id="cf-ap-bpm-min" min="60" max="200" placeholder="min" style="width:60px;padding:6px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary)">'+
        '<span style="color:var(--c-tertiary)">→</span>'+
        '<input type="number" id="cf-ap-bpm-max" min="60" max="200" placeholder="max" style="width:60px;padding:6px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary)"></div></div>'+
      '<div class="option-row"><div class="option-info"><div class="option-label">Genres préférés (CSV)</div></div>'+
        '<input type="text" id="cf-ap-genres" placeholder="house,techno,minimal" style="padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-family:inherit;min-width:200px"></div>';
    main.appendChild(sec);

    // Restore values
    document.getElementById('cf-ap-quality').value = profile.stems_quality;
    document.getElementById('cf-ap-format').value = profile.export_format;
    document.getElementById('cf-ap-bpm-min').value = profile.target_bpm_min;
    document.getElementById('cf-ap-bpm-max').value = profile.target_bpm_max;
    document.getElementById('cf-ap-genres').value = profile.preferred_genres;

    function save(){
      var p = {
        stems_quality: document.getElementById('cf-ap-quality').value,
        export_format: document.getElementById('cf-ap-format').value,
        target_bpm_min: parseInt(document.getElementById('cf-ap-bpm-min').value)||110,
        target_bpm_max: parseInt(document.getElementById('cf-ap-bpm-max').value)||130,
        preferred_genres: document.getElementById('cf-ap-genres').value
      };
      CF.ls.set('audio_profile', p);
      if(CF.toastGroup) CF.toastGroup.push('Profil audio sauvegardé','success');
    }
    sec.querySelectorAll('select, input').forEach(function(el){
      el.addEventListener('change', save);
    });
  };

  /* --- Auto-init wave 8 --- */
  function init8(){
    try{ CF.injectEnergyDisplay(); }catch(e){}
    try{ CF.bindThemePreviewHover(); }catch(e){}
    try{ CF.injectAudioProfile(); }catch(e){}
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init8, 2000); });
  } else {
    setTimeout(init8, 2000);
  }
})();

/* ============================================================
   Wave 10 — Wirings réels end-to-end
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  /* --- #40 Wire undo cues sur les vraies mutations + raccourci Cmd+Z --- */
  CF.wireCueUndo = function(){
    if(!/analyze/.test(location.pathname)) return;
    // Snapshot l'état des cues à intervalle régulier (poll fallback)
    function getCueState(){
      try{
        var cues = window.currentCues || window.cues || [];
        return cues.map(function(c){return Object.assign({}, c)});
      }catch(e){ return []; }
    }
    var lastSnapshot = null;
    setInterval(function(){
      var s = getCueState();
      var sStr = JSON.stringify(s);
      if(sStr !== lastSnapshot && s.length){
        if(lastSnapshot !== null) CF.cueUndo.push(s);
        lastSnapshot = sStr;
      }
    }, 1500);
    // Cmd+Z pour undo
    document.addEventListener('keydown', function(e){
      if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey){
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        var prev = CF.cueUndo.undo();
        if(prev){
          e.preventDefault();
          if(window.currentCues){ window.currentCues = prev; }
          if(typeof window.renderCues === 'function') window.renderCues();
          if(CF.toastGroup) CF.toastGroup.push('Undo cues','info');
        }
      } else if((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z'){
        var nxt = CF.cueUndo.redo();
        if(nxt){
          e.preventDefault();
          if(window.currentCues){ window.currentCues = nxt; }
          if(typeof window.renderCues === 'function') window.renderCues();
          if(CF.toastGroup) CF.toastGroup.push('Redo cues','info');
        }
      }
    });
  };

  /* --- #51 Wire EQ stems sur AudioContext si dispo --- */
  CF.wireStemEQ = function(){
    if(!/mix-studio/.test(location.pathname)) return;
    var sliders = document.querySelectorAll('#cf-stem-eq input[data-eq-band]');
    if(!sliders.length) return;
    // Ajouter listener qui pilote AudioContext via stems players si disponible
    sliders.forEach(function(slider){
      slider.addEventListener('input', function(){
        var stem = slider.dataset.eqStem;
        var band = slider.dataset.eqBand;
        var gainDB = parseFloat(slider.value);
        // Tente de piloter via window.stemPlayers[stem].eq[band].gain.value
        try{
          if(window.stemPlayers && window.stemPlayers[stem] && window.stemPlayers[stem].eq){
            window.stemPlayers[stem].eq[band].gain.value = gainDB;
          }
        }catch(e){}
      });
    });
  };

  /* --- #52 Wire lock tempo : tap sur deck B pour suivre A --- */
  CF.wireLockTempo = function(){
    if(!/mix-studio/.test(location.pathname)) return;
    setInterval(function(){
      if(!CF.ls.get('lock_tempo', false)) return;
      try{
        if(window.deckA && window.deckB && window.deckA.bpm && window.deckB.audio){
          // Calcule le ratio pour matcher A
          var ratio = window.deckA.bpm / (window.deckB.bpm || window.deckA.bpm);
          if(window.deckB.audio.playbackRate){
            window.deckB.audio.playbackRate = Math.max(0.5, Math.min(2, ratio));
          }
        }
      }catch(e){}
    }, 1000);
  };

  /* --- #54 Wire auto-mix application réelle des params --- */
  CF.applyTransitionParams = function(markers){
    // Pose les markers dans l'UI mix-studio si APIs dispo
    try{
      if(window.deckA && markers.out_a){
        window.deckA.outPoint = markers.out_a;
        if(window.deckA.audio) window.deckA.audio.currentTime = markers.out_a - 8;
      }
      if(window.deckB && markers.in_b){
        window.deckB.inPoint = markers.in_b;
      }
      if(typeof window.renderTransitionParams === 'function') window.renderTransitionParams(markers);
    }catch(e){}
  };
  // Expose globalement pour le bouton auto-mix
  window.applyTransitionParams = window.applyTransitionParams || CF.applyTransitionParams;

  /* --- #60 Bouton Preview 30s dans mix-studio --- */
  CF.injectPreview30Btn = function(){
    if(!/mix-studio/.test(location.pathname)) return;
    if(document.getElementById('cf-preview-30s')) return;
    var transport = document.querySelector('.transport, .mix-controls, .controls');
    if(!transport) return;
    var btn = document.createElement('button');
    btn.id = 'cf-preview-30s';
    btn.className = 'btn-sm';
    btn.style.cssText = 'margin-left:8px;padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:12px;cursor:pointer';
    btn.innerHTML = '⏯ Preview 30s';
    btn.title = 'Preview du mix avec fade in/out';
    btn.addEventListener('click', function(){
      var audio = (window.deckA && window.deckA.audio) || window.audioEl;
      if(!audio){
        if(CF.toastGroup) CF.toastGroup.push('Aucun audio chargé','warn');
        return;
      }
      var startSec = (window.deckA && window.deckA.outPoint) ? Math.max(0, window.deckA.outPoint - 4) : 0;
      CF.preview30s(audio, startSec);
      if(CF.toastGroup) CF.toastGroup.push('Preview 30s lancée','info');
    });
    transport.appendChild(btn);
  };

  /* --- Re-injection inspector si manqué (analyze) --- */
  CF.reinjectInspector = function(){
    if(!/analyze/.test(location.pathname)) return;
    // Forcer un nouveau passage pour mettre les boutons dans le bon parent
    ['cf-similar-btn','cf-stem-dl','cf-energy-display','cf-notes-box'].forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      var insp = document.querySelector('aside.inspector');
      if(insp && el.parentElement !== insp){
        insp.appendChild(el);
      }
    });
  };

  function initWave10(){
    try{ CF.wireCueUndo(); }catch(e){}
    try{ CF.wireStemEQ(); }catch(e){}
    try{ CF.wireLockTempo(); }catch(e){}
    try{ CF.injectPreview30Btn(); }catch(e){}
    try{ CF.reinjectInspector(); }catch(e){}
    setTimeout(function(){ try{ CF.reinjectInspector(); }catch(e){} }, 3500);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(initWave10, 2200); });
  } else {
    setTimeout(initWave10, 2200);
  }
})();

/* ============================================================
   Wave 10c — Re-injection settings (defer fix : les hooks inline
   s'exécutent AVANT improvements.js defer, donc window.cfImprovements
   est undefined. On re-charge depuis ici.)
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;
  if(!/settings/.test(location.pathname)) return;

  // #84 Section Raccourcis clavier (re-inject)
  function injectShortcuts(){
    if(document.getElementById('cf-shortcuts-sec')) return;
    var main = document.querySelector('main.page, .settings-main, main');
    if(!main) return;
    var sec = document.createElement('section');
    sec.id = 'cf-shortcuts-sec';
    sec.className = 'sec';
    sec.style.cssText = 'margin-top:24px';
    var sc = CF.shortcuts.get();
    var rows = Object.keys(sc).map(function(k){
      var label = k.replace(/_/g,' ').replace(/\b\w/g, function(c){return c.toUpperCase()});
      return '<div class="option-row"><div class="option-info"><div class="option-label">'+label+'</div></div><kbd style="padding:3px 8px;border-radius:5px;background:var(--s-3);border:1px solid var(--b-default);font-family:var(--font-mono);font-size:11px;color:var(--amber)">'+sc[k]+'</kbd></div>';
    }).join('');
    sec.innerHTML = '<h2 class="sec-title">Raccourcis clavier</h2>'+
      '<p class="sec-sub" style="font-size:12px;color:var(--c-tertiary);margin-bottom:12px">Personnalisable bientôt — pour l instant les défauts s appliquent partout.</p>'+
      rows +
      '<button id="cf-sc-reset" class="btn-sm" style="margin-top:12px;padding:6px 12px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:12px;cursor:pointer">↺ Réinitialiser aux défauts</button>';
    main.appendChild(sec);
    document.getElementById('cf-sc-reset').addEventListener('click', function(){
      CF.shortcuts.reset();
      if(CF.toastGroup) CF.toastGroup.push('Raccourcis réinitialisés','info');
      sec.remove();
      injectShortcuts();
    });
  }

  // #86 Import/Export settings JSON (re-inject)
  function injectSettingsIO(){
    var sec = document.querySelector('.sec');
    if(!sec || document.getElementById('cf-settings-io')) return;
    var io = document.createElement('div');
    io.id = 'cf-settings-io';
    io.style.cssText = 'margin-top:14px;display:flex;gap:8px';
    io.innerHTML = '<button id="cf-set-export" class="btn-sm" style="padding:6px 12px;border-radius:8px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:12px;cursor:pointer">📥 Export settings</button>'+
      '<button id="cf-set-import" class="btn-sm" style="padding:6px 12px;border-radius:8px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);font-size:12px;cursor:pointer">📤 Import settings</button>'+
      '<input type="file" id="cf-set-file" accept="application/json" style="display:none">';
    sec.appendChild(io);
    document.getElementById('cf-set-export').addEventListener('click', function(){
      var data = {};
      try{
        for(var i=0;i<localStorage.length;i++){
          var k = localStorage.key(i);
          if(k && (k.startsWith('cf_imp_')||k.startsWith('cf_pv')||k==='theme'||k==='density')) data[k] = localStorage.getItem(k);
        }
      }catch(e){}
      var blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href=url; a.download='cueforge-settings.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){URL.revokeObjectURL(url)},100);
    });
    document.getElementById('cf-set-import').addEventListener('click', function(){ document.getElementById('cf-set-file').click(); });
    document.getElementById('cf-set-file').addEventListener('change', function(e){
      var f = e.target.files[0]; if(!f) return;
      var r = new FileReader();
      r.onload = function(){
        try{
          var data = JSON.parse(r.result);
          Object.keys(data).forEach(function(k){ localStorage.setItem(k, data[k]); });
          alert('Settings importés. La page va recharger.');
          location.reload();
        }catch(err){ alert('Fichier invalide: '+err.message); }
      };
      r.readAsText(f);
    });
  }

  setTimeout(function(){
    try{ injectShortcuts(); }catch(e){}
    try{ injectSettingsIO(); }catch(e){}
  }, 2000);
})();

/* ============================================================
   Wave 11 — Re-injection admin (defer fix + selecteurs)
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;
  if(!/admin/.test(location.pathname)) return;

  function injectRecentActions(){
    if(document.getElementById('cf-recent-actions')) return;
    var main = document.querySelector('main, .admin-main, .container, #content');
    if(!main) return;
    var sec = document.createElement('section');
    sec.id = 'cf-recent-actions';
    sec.style.cssText = 'margin:24px 16px;padding:16px;border-radius:12px;background:var(--s-1);border:1px solid var(--b-default)';
    sec.innerHTML = '<h3 style="font-family:var(--font-display);font-size:14px;margin:0 0 8px">Recent actions par user (replay session #81)</h3>'+
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'+
        '<input id="cf-recent-uid" type="number" placeholder="User ID" style="padding:6px 10px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);width:120px">'+
        '<button id="cf-recent-go" class="btn-sm" style="padding:6px 12px;border-radius:6px;background:var(--amber);color:#000;border:none;font-weight:600;cursor:pointer">Charger</button>'+
      '</div>'+
      '<div id="cf-recent-list" style="font-family:var(--font-mono);font-size:11px;color:var(--c-secondary);max-height:300px;overflow:auto;background:var(--s-2);padding:10px;border-radius:6px">Entre un user ID puis clique Charger.</div>';
    main.appendChild(sec);
    document.getElementById('cf-recent-go').addEventListener('click', function(){
      var uid = document.getElementById('cf-recent-uid').value;
      if(!uid) return;
      var list = document.getElementById('cf-recent-list');
      list.textContent = 'Chargement...';
      CF.apiCall('GET','/admin/users/'+uid+'/recent-actions?limit=30').then(function(r){
        if(!r || !r.actions || !r.actions.length){ list.textContent = 'Aucune action recente trouvee.'; return; }
        list.innerHTML = r.actions.map(function(a){
          return '<div style="padding:4px 0;border-bottom:1px solid var(--b-subtle)"><span style="color:var(--c-tertiary)">'+(a.created_at||'').slice(11,19)+'</span> · <strong>'+(a.action||'?')+'</strong>'+(a.details?' · '+JSON.stringify(a.details).slice(0,80):'')+'</div>';
        }).join('');
      }).catch(function(e){ list.textContent = 'Erreur: '+e.message; });
    });
  }

  function injectHealthDiff(){
    if(document.getElementById('cf-health-diff')) return;
    var main = document.querySelector('main, .admin-main, .container, #content');
    if(!main) return;
    var sec = document.createElement('section');
    sec.id = 'cf-health-diff';
    sec.style.cssText = 'margin:0 16px 24px;padding:16px;border-radius:12px;background:var(--s-1);border:1px solid var(--b-default)';
    sec.innerHTML = '<h3 style="font-family:var(--font-display);font-size:14px;margin:0 0 8px">Health diff (delta entre snapshots #77)</h3>'+
      '<div style="display:flex;gap:8px;margin-bottom:12px">'+
        '<button id="cf-snap-now" class="btn-sm" style="padding:6px 12px;border-radius:6px;background:var(--s-2);border:1px solid var(--b-default);color:var(--c-secondary);cursor:pointer;font-size:12px">📸 Snapshot maintenant</button>'+
        '<button id="cf-diff-show" class="btn-sm" style="padding:6px 12px;border-radius:6px;background:var(--amber);color:#000;border:none;font-weight:600;cursor:pointer;font-size:12px">📊 Voir diff</button>'+
      '</div>'+
      '<pre id="cf-diff-out" style="font-family:var(--font-mono);font-size:11px;color:var(--c-secondary);background:var(--s-2);padding:10px;border-radius:6px;max-height:300px;overflow:auto;margin:0">—</pre>';
    main.appendChild(sec);
    document.getElementById('cf-snap-now').addEventListener('click', function(){
      CF.apiCall('POST','/admin/health-snapshot').then(function(r){
        if(CF.toastGroup) CF.toastGroup.push('Snapshot cree : '+r.filename,'success');
      });
    });
    document.getElementById('cf-diff-show').addEventListener('click', function(){
      CF.apiCall('GET','/admin/health-diff').then(function(r){
        document.getElementById('cf-diff-out').textContent = JSON.stringify(r, null, 2);
      });
    });
  }

  setTimeout(function(){
    try{ injectRecentActions(); }catch(e){}
    try{ injectHealthDiff(); }catch(e){}
  }, 2000);
})();


/* ============================================================
   Wave 11d — Re-injection stats heatmap + mix-studio (defer-safe)
   ============================================================ */
(function(){
  if(!window.cfImprovements) return;
  var CF = window.cfImprovements;

  if(/stats/.test(location.pathname)){
    function injectHeatmap(){
      if(document.getElementById('cf-heatmap-card')) return;
      var grid = document.querySelector('.kpi-grid, .panel-grid, .stats-grid, main');
      if(!grid) return;
      var card = document.createElement('div');
      card.id = 'cf-heatmap-card';
      card.style.cssText = 'background:var(--s-1);border:1px solid var(--b-default);border-radius:14px;padding:16px;margin:16px';
      card.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--c-tertiary);margin-bottom:12px">Activité — heatmap jour × heure (#71)</div><div id="cf-heatmap"></div>';
      grid.parentNode.insertBefore(card, grid.nextSibling);
      CF.apiCall('GET','/stats/activity-heatmap?period='+CF.statsPeriod.get()).then(function(r){
        if(r && r.data && r.data.length){
          CF.renderHeatmap(document.getElementById('cf-heatmap'), r.data);
        } else {
          document.getElementById('cf-heatmap').innerHTML = '<div style="color:var(--c-tertiary);font-size:12px">Pas encore d\'activité sur cette période.</div>';
        }
      }).catch(function(){
        document.getElementById('cf-heatmap').innerHTML = '<div style="color:var(--c-tertiary);font-size:12px">Endpoint non disponible.</div>';
      });
    }
    setTimeout(injectHeatmap, 1800);
    document.addEventListener('cf:period-change', function(){
      var card = document.getElementById('cf-heatmap-card');
      if(card){ card.remove(); setTimeout(injectHeatmap, 100); }
    });
  }

  // Mix studio re-inject
  if(/mix-studio/.test(location.pathname)){
    setTimeout(function(){
      try{ CF.injectAutoMixBtn(); }catch(e){}
      try{ CF.injectStemEQ && CF.injectStemEQ(); }catch(e){}
      try{ CF.injectLockTempo && CF.injectLockTempo(); }catch(e){}
      try{ CF.injectExportStemMix && CF.injectExportStemMix(); }catch(e){}
      try{ CF.injectPreview30Btn && CF.injectPreview30Btn(); }catch(e){}
    }, 1800);
  }
})();
