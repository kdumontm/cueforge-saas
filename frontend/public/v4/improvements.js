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

  // Helper API call avec fallback silencieux
  function apiCall(method, path, body){
    var base = (window.api && window.api.base) || '/api/v1';
    var headers = {'Content-Type':'application/json'};
    var token = null;
    try{
      // shared.js stocke le token dans api ou localStorage
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
