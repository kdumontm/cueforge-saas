/**
 * TrackCue v4 — helper API pour les pages HTML statiques.
 *
 * Gère le token JWT stocké dans localStorage par la partie Next.js
 * (clé = 'trackcue_token'), injecte le header Authorization et propose
 * des raccourcis pour les endpoints les plus courants.
 *
 * Usage :
 *   const user = await api.me();
 *   const tracks = await api.tracks({ limit: 100 });
 *   api.requireAuth();               // redirect → /login si pas loggé
 */
(function(){
  const TOKEN_KEY   = 'trackcue_token';
  const REFRESH_KEY = 'trackcue_refresh';
  const BASE        = '/api/v1';

  function getToken(){ try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function getRefresh(){ try { return localStorage.getItem(REFRESH_KEY) || ''; } catch { return ''; } }
  function setToken(t){ try { localStorage.setItem(TOKEN_KEY, t); } catch {} }
  function clearAuth(){ try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY); } catch {} }

  async function refreshToken(){
    const rt = getRefresh();
    if(!rt) return false;
    try {
      const r = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if(!r.ok) return false;
      const d = await r.json();
      if(d && d.access_token){ setToken(d.access_token); return true; }
      return false;
    } catch { return false; }
  }

  async function request(path, opts={}, retry=true){
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const headers = Object.assign({}, opts.headers || {});
    const tok = getToken();
    if(tok) headers['Authorization'] = `Bearer ${tok}`;
    if(opts.json !== undefined){
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }
    const r = await fetch(url, Object.assign({ credentials: 'include' }, opts, { headers }));
    if(r.status === 401 && retry){
      const ok = await refreshToken();
      if(ok) return request(path, opts, false);
    }
    if(!r.ok){
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); msg = j.detail || j.message || msg; } catch {}
      const err = new Error(msg); err.status = r.status; throw err;
    }
    const ct = r.headers.get('content-type') || '';
    if(ct.includes('application/json')) return r.json();
    return r.text();
  }

  const api = {
    BASE,
    token: getToken,
    isAuthed(){ return !!getToken(); },
    requireAuth(){
      if(!getToken()){
        const here = location.pathname + location.search;
        location.href = '/login?next=' + encodeURIComponent(here);
        return false;
      }
      return true;
    },
    logout(){ clearAuth(); location.href = '/'; },

    get(path, params){
      if(params){
        const q = new URLSearchParams();
        Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && v!=='') q.append(k, v); });
        const qs = q.toString();
        if(qs) path += (path.includes('?')?'&':'?') + qs;
      }
      return request(path);
    },
    post(path, json){ return request(path, { method:'POST', json }); },
    patch(path, json){ return request(path, { method:'PATCH', json }); },
    del(path){ return request(path, { method:'DELETE' }); },

    /* ------ raccourcis ------ */
    me()            { return request('/auth/me'); },
    tracks(p={})    { return api.get('/tracks', p); },
    track(id)       { return api.get(`/tracks/${id}`); },
    stats()         { return api.get('/stats/overview'); },
    adminOverview() { return api.get('/admin/stats/overview'); },
    adminUsers(p={}){ return api.get('/admin/stats/users-activity', p); },
    sets(p={})      { return api.get('/sets', p); },
    playlists(p={}) { return api.get('/playlists', p); },
    compare(a,b)    { return api.get('/compare', { track_a_id: a, track_b_id: b }); },
    recoSimilar(id) { return api.post(`/recommendation/similar/${id}`, { limit: 20 }); },
    uploadTrack(file, onProgress){
      return new Promise((resolve, reject)=>{
        const fd = new FormData();
        fd.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE}/tracks/upload`);
        const tok = getToken();
        if(tok) xhr.setRequestHeader('Authorization', `Bearer ${tok}`);
        xhr.upload.onprogress = (e)=>{ if(onProgress && e.lengthComputable) onProgress(e.loaded/e.total); };
        xhr.onload = ()=>{
          try {
            const d = JSON.parse(xhr.responseText);
            if(xhr.status >= 200 && xhr.status < 300) resolve(d);
            else reject(new Error(d.detail || `HTTP ${xhr.status}`));
          } catch { reject(new Error(`HTTP ${xhr.status}`)); }
        };
        xhr.onerror = ()=> reject(new Error('Network error'));
        xhr.send(fd);
      });
    },
  };

  /* ------ formatters utilitaires ------ */
  const fmt = {
    num(n){ if(n==null||isNaN(n)) return '—'; return Number(n).toLocaleString('fr-FR'); },
    pct(n, digits=1){ if(n==null||isNaN(n)) return '—'; return (Number(n)*100).toFixed(digits)+'%'; },
    dur(s){ if(!s||isNaN(s)) return '—'; const m = Math.floor(s/60), sec = Math.floor(s%60); return `${m}:${String(sec).padStart(2,'0')}`; },
    date(s){ if(!s) return '—'; try { return new Date(s).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',year:'2-digit'}); } catch { return s; } },
    relDate(s){
      if(!s) return '—';
      const d = new Date(s); const now = new Date();
      const diff = (now - d)/1000;
      if(diff<60) return 'à l\'instant';
      if(diff<3600) return Math.floor(diff/60)+'min';
      if(diff<86400) return Math.floor(diff/3600)+'h';
      if(diff<2592000) return Math.floor(diff/86400)+'j';
      return d.toLocaleDateString('fr-FR', {day:'2-digit',month:'short'});
    },
    bpm(b){ return (b==null||isNaN(b)) ? '—' : Number(b).toFixed(1); },
    camelot(k){ return k || '—'; },
    money(c, cur='EUR'){ if(c==null||isNaN(c)) return '—'; return (c/100).toLocaleString('fr-FR',{style:'currency',currency:cur,minimumFractionDigits:0}); },
  };

  window.api = api;
  window.fmt = fmt;
})();
