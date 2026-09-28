/* ══════════════════════════════════════════════════════════════════
   GITHUB TOKEN — add-on engine
   Installs a global interceptor on fetch() and XMLHttpRequest the moment
   this script runs, so EVERY request to GitHub's API — from the editor or
   from any other add-on, present or future — is sent with your token.
   Nothing per-add-on is registered: it matches on the destination host,
   so new GitHub calls are picked up automatically.

   Covered:  api.github.com, uploads.github.com   → Authorization header
             raw.githubusercontent.com (GET)      → rerouted through the
               authenticated Contents API; if that fails the original
               request is replayed untouched, so nothing can break.
   Not coverable from JS: <img>/<script>/<link> tag loads (browsers can't
   attach headers to those).
═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(window.__ghTokenAddon) return;

  var SELF_SRC = '';
  try{ SELF_SRC = (document.currentScript && document.currentScript.src) || ''; }catch(e){}

  var STORAGE_KEY = 'gt_addon_state_v1';
  var DEFAULTS = { enabled:true, token:'', overrideOthers:true, rerouteRaw:true };
  var state = loadState();

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  var stats = { total:0, ok:0, fail:0, tokenReqs:0, rerouted:0, fallbacks:0, inflight:0, byCaller:{}, log:[], times:[] };
  var meter = { resources:{} };
  var auth  = { status: 'none' };   // none | checking | valid | limited | invalid | error
  var seq = 0, refreshing = false, lastRefresh = 0, invalidToasted = false;
  var els = {};

  /* ══════════════════ state ══════════════════ */
  function loadState(){
    var s; try{ s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }catch(e){ s = null; }
    return Object.assign({}, DEFAULTS, s || {});
  }
  function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} }
  function tokenActive(){ return !!(state.enabled && state.token); }
  function mode(){ return tokenActive() ? 'token' : 'anon'; }
  function cleanToken(s){
    return String(s || '').trim().replace(/^(bearer|token)\s+/i,'').replace(/^["']+|["']+$/g,'').trim();
  }
  function tokenType(t){
    if(/^github_pat_/.test(t)) return 'Fine-grained';
    if(/^ghp_/.test(t)) return 'Classic';
    if(/^(gho_|ghu_|ghs_|ghr_)/.test(t)) return 'OAuth / App';
    return 'Token';
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmt(n){ return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString() : '—'; }
  function toast(msg, type){ if(typeof window.showToast === 'function') window.showToast(msg, type || 'info'); }

  /* ══════════════════ host matching ══════════════════ */
  function classify(urlStr){
    var u; try{ u = new URL(urlStr, location.href); }catch(e){ return null; }
    if(u.protocol !== 'https:') return null;
    var h = u.hostname.toLowerCase();
    if(h === 'api.github.com' || h === 'uploads.github.com') return { kind:'api', url:u };
    if(h === 'raw.githubusercontent.com') return { kind:'raw', url:u };
    return null;
  }
  // /owner/repo/<branch>/<path>  |  /owner/repo/refs/heads/<branch>/<path>
  function rawToApi(u){
    var parts = u.pathname.split('/').filter(Boolean);
    if(parts.length < 4) return null;
    var owner = parts[0], repo = parts[1], ref, rest;
    if(parts[2] === 'refs' && (parts[3] === 'heads' || parts[3] === 'tags') && parts.length >= 6){ ref = parts[4]; rest = parts.slice(5); }
    else { ref = parts[2]; rest = parts.slice(3); }
    if(!rest.length) return null;
    return 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + rest.join('/') + '?ref=' + encodeURIComponent(decodeURIComponent(ref));
  }

  /* ══════════════════ who is calling? (best effort) ══════════════════ */
  function detectCaller(){
    try{
      var lines = (new Error().stack || '').split('\n');
      var page = location.origin + location.pathname;
      for(var i = 1; i < lines.length; i++){
        var m = lines[i].match(/((?:https?|blob):[^\s)]+?):\d+:\d+/);
        if(!m) continue;
        var src = m[1];
        if(src === SELF_SRC) continue;
        var clean = src.split('#')[0].split('?')[0];
        if(clean === page || clean === location.href.split('#')[0].split('?')[0]) return 'Editor';
        var a = clean.match(/\/sca\/([^\/]+)\//);
        if(a) return a[1];
        try{
          var u = new URL(clean);
          if(u.origin !== location.origin) return u.hostname;
          return u.pathname.split('/').pop() || 'Editor';
        }catch(e){ return 'Unknown'; }
      }
    }catch(e){}
    return 'Unknown';
  }

  /* ══════════════════ bookkeeping ══════════════════ */
  function beginRec(method, c, caller, useToken, own){
    var rec = { id:++seq, t:Date.now(), t0:performance.now(), method:method, host:c.url.hostname,
                path:c.url.pathname + c.url.search, full:c.url.href, caller:caller,
                useToken:useToken, own:!!own, rerouted:false, fallback:false, status:0, ms:0, done:false, err:false };
    stats.total++; stats.inflight++;
    if(useToken) stats.tokenReqs++;
    stats.byCaller[caller] = (stats.byCaller[caller] || 0) + 1;
    stats.log.unshift(rec); if(stats.log.length > 40) stats.log.length = 40;
    stats.times.push(rec.t);
    var cut = rec.t - 300000; while(stats.times.length && stats.times[0] < cut) stats.times.shift();
    scheduleRender();
    return rec;
  }
  function endRec(rec, status, aborted){
    if(rec.done) return;
    rec.done = true; rec.status = status || 0; rec.ms = Math.round(performance.now() - rec.t0);
    stats.inflight = Math.max(0, stats.inflight - 1);
    if(aborted){ rec.aborted = true; }
    else if(status && status < 400) stats.ok++;
    else { stats.fail++; rec.err = true; }
    scheduleRender();
  }
  function perMinute(){
    var cut = Date.now() - 60000, n = 0;
    for(var i = stats.times.length - 1; i >= 0 && stats.times[i] >= cut; i--) n++;
    return n;
  }
  function updateMeter(useToken, resource, limit, remaining, reset){
    if((useToken ? 'token' : 'anon') !== mode()) return;      // ignore responses from the other auth mode
    if(!isFinite(limit) || !isFinite(remaining)) return;
    meter.resources[resource || 'core'] = { limit:limit, remaining:remaining, reset:reset };
  }
  function noteHeaders(get, rec){
    try{
      var lim = get('x-ratelimit-limit'); if(lim === null || lim === undefined) return;
      updateMeter(rec.useToken, get('x-ratelimit-resource') || 'core', +lim, +get('x-ratelimit-remaining'), +get('x-ratelimit-reset'));
      var sc = get('x-oauth-scopes');
      if(sc !== null && sc !== undefined && rec.useToken && auth.status === 'valid') auth.scopes = sc;
    }catch(e){}
  }
  function markTokenInvalid(){
    auth = { status:'invalid' };
    if(!invalidToasted){ invalidToasted = true; toast('GitHub rejected your token — requests are falling back to anonymous', 'error'); }
    scheduleRender();
  }

  /* ══════════════════ fetch interceptor ══════════════════ */
  function isAbort(err){ return !!err && (err.name === 'AbortError'); }

  function gtFetch(input, init){
    var p;
    try{
      var isReq = (typeof Request !== 'undefined') && (input instanceof Request);
      var urlStr = isReq ? input.url : String((input && input.href) || input);
      var c = classify(urlStr);
      if(c){
        p = { isReq:isReq, c:c, urlStr:urlStr,
              method: String((init && init.method) || (isReq && input.method) || 'GET').toUpperCase(),
              headers: new Headers((init && init.headers) || (isReq ? input.headers : undefined)) };
      }
    }catch(e){ p = null; }
    if(!p) return nativeFetch(input, init);

    var ownAuth = p.headers.has('authorization');
    var useToken = tokenActive() && p.c.kind === 'api' && (state.overrideOthers || !ownAuth);
    var idem = (p.method === 'GET' || p.method === 'HEAD');
    var reroute = null;
    if(p.c.kind === 'raw' && tokenActive() && state.rerouteRaw && idem && (state.overrideOthers || !ownAuth)) reroute = rawToApi(p.c.url);
    var rec = beginRec(p.method, p.c, detectCaller(), useToken || !!reroute, ownAuth && !useToken && !reroute);

    function go(url, withToken, accept){
      var h = new Headers(p.headers);
      if(withToken) h.set('Authorization', 'Bearer ' + state.token);
      if(accept) h.set('Accept', accept);
      var ni = Object.assign({}, init || {}, { headers:h });
      if(url){ if(p.isReq && !ni.signal) ni.signal = input.signal; return nativeFetch(url, ni); }
      return nativeFetch(input, ni);
    }
    function original(){ return nativeFetch(input, init); }

    var attempt;
    if(reroute){
      rec.rerouted = true; stats.rerouted++;
      attempt = go(reroute, true, 'application/vnd.github.raw+json').then(function(res){
        noteHeaders(function(k){ return res.headers.get(k); }, rec);
        if(res.ok) return res;
        if(res.status === 401) markTokenInvalid();
        rec.fallback = true; rec.useToken = false; stats.fallbacks++;
        return original();
      }, function(err){
        if(isAbort(err)) throw err;
        rec.fallback = true; rec.useToken = false; stats.fallbacks++;
        return original();
      });
    } else {
      attempt = go(null, useToken, null).then(function(res){
        noteHeaders(function(k){ return res.headers.get(k); }, rec);
        if(res.status === 401 && useToken && idem){
          markTokenInvalid();
          rec.fallback = true; rec.useToken = false; stats.fallbacks++;
          var h = new Headers(p.headers); h.delete('authorization');
          return nativeFetch(p.isReq ? input : p.urlStr, Object.assign({}, init || {}, { headers:h }));
        }
        if(res.status === 401 && useToken) markTokenInvalid();
        return res;
      });
    }
    return attempt.then(function(res){ endRec(rec, res.status); return res; },
                        function(err){ endRec(rec, 0, isAbort(err)); throw err; });
  }
  if(nativeFetch) window.fetch = gtFetch;

  /* ══════════════════ XMLHttpRequest interceptor ══════════════════ */
  (function patchXHR(){
    if(typeof XMLHttpRequest === 'undefined') return;
    var XP = XMLHttpRequest.prototype;
    var nOpen = XP.open, nSend = XP.send, nSet = XP.setRequestHeader;
    XP.open = function(method, url){
      try{
        var c = classify(String(url));
        this.__gt = c ? { method:String(method || 'GET').toUpperCase(), c:c, ownAuth:false } : null;
      }catch(e){ this.__gt = null; }
      return nOpen.apply(this, arguments);
    };
    XP.setRequestHeader = function(name, value){
      var g = this.__gt;
      if(g && g.c.kind === 'api' && /^authorization$/i.test(name)){
        g.ownAuth = true;
        if(tokenActive() && state.overrideOthers) return;     // drop theirs, ours is added at send()
      }
      return nSet.apply(this, arguments);
    };
    XP.send = function(){
      var g = this.__gt;
      if(g){
        try{
          var useToken = tokenActive() && g.c.kind === 'api' && (state.overrideOthers || !g.ownAuth);
          if(useToken) nSet.call(this, 'Authorization', 'Bearer ' + state.token);
          var rec = beginRec(g.method, g.c, detectCaller(), useToken, g.ownAuth && !useToken);
          var xhr = this, aborted = false;
          xhr.addEventListener('abort', function(){ aborted = true; });
          xhr.addEventListener('loadend', function(){
            if(xhr.status){
              noteHeaders(function(k){ try{ return xhr.getResponseHeader(k); }catch(e){ return null; } }, rec);
              if(xhr.status === 401 && useToken) markTokenInvalid();
            }
            endRec(rec, xhr.status, aborted);
          });
        }catch(e){}
      }
      return nSend.apply(this, arguments);
    };
  })();

  /* ══════════════════ token verify + rate-limit polling (not counted, not logged) ══════════════════ */
  function verifyToken(){
    if(!state.token || !nativeFetch){ auth = { status:'none' }; scheduleRender(); return Promise.resolve(); }
    var tok = state.token;
    auth = { status:'checking' }; scheduleRender();
    return nativeFetch('https://api.github.com/user', { headers:{ Authorization:'Bearer ' + tok } }).then(function(r){
      if(tok !== state.token) return;
      var scopes = r.headers.get('x-oauth-scopes');
      if(r.status === 401){ invalidToasted = false; markTokenInvalid(); return; }
      invalidToasted = false;
      if(r.ok){
        return r.json().then(function(u){
          if(tok !== state.token) return;
          auth = { status:'valid', login:u.login, name:u.name, avatar:u.avatar_url, scopes:scopes, type:tokenType(tok) };
        });
      }
      auth = { status:'limited', type:tokenType(tok), scopes:scopes, code:r.status };
    }).catch(function(){ if(tok === state.token) auth = { status:'error' }; })
      .then(function(){ scheduleRender(); });
  }
  function refreshRate(){
    if(refreshing || !nativeFetch) return Promise.resolve();
    refreshing = true; lastRefresh = Date.now();
    var m = mode();
    var headers = (m === 'token') ? { Authorization:'Bearer ' + state.token } : {};
    return nativeFetch('https://api.github.com/rate_limit', { headers:headers }).then(function(r){
      if(r.status === 401 && m === 'token'){ markTokenInvalid(); return; }
      return r.json().then(function(j){
        if(m !== mode()) return;
        var res = (j && j.resources) || {};
        Object.keys(res).forEach(function(k){
          var x = res[k]; if(x && x.limit) meter.resources[k] = { limit:x.limit, remaining:x.remaining, reset:x.reset };
        });
      });
    }).catch(function(){}).then(function(){ refreshing = false; scheduleRender(); });
  }
  function resetMeter(){ meter.resources = {}; scheduleRender(); refreshRate(); }

  /* ══════════════════ rendering ══════════════════ */
  var raf = 0;
  function scheduleRender(){
    if(raf) return;
    raf = (window.requestAnimationFrame || setTimeout)(function(){ raf = 0; render(); });
  }
  function primary(){
    var r = meter.resources;
    return r.core || r[Object.keys(r)[0]] || null;
  }
  function ratioClass(m){
    if(!m) return '';
    if(m.remaining <= 0) return 'out';
    return (m.remaining / m.limit) <= 0.2 ? 'low' : 'ok';
  }
  function fmtCountdown(sec){
    if(sec <= 0) return 'Resetting…';
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return 'Resets in ' + (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (s < 10 ? '0' : '') + s;
  }
  function modalOpen(){ return els.modal && els.modal.classList.contains('open'); }

  function render(){
    if(!els.pill) return;
    var m = primary(), cls = 'gt-pill', txt, sub;
    if(auth.status === 'invalid'){ txt = 'Invalid'; cls += ' gt-bad'; }
    else if(!state.token){ txt = m ? 'Anon ' + fmt(m.remaining) : 'No token'; if(m) cls += ' gt-' + ratioClass(m); }
    else if(!state.enabled){ txt = 'Off'; }
    else if(m){ txt = fmt(m.remaining); cls += ' gt-' + ratioClass(m); }
    else { txt = '…'; }
    els.pill.className = cls; els.pill.textContent = txt;

    if(!state.token) sub = 'Add a token to lift the rate limit';
    else if(!state.enabled) sub = 'Paused — requests go out anonymously';
    else if(auth.status === 'invalid') sub = 'Token rejected by GitHub';
    else sub = 'Routing via ' + (auth.login ? '@' + auth.login : 'your token');
    els.sbSub.textContent = sub;
    els.enableToggle.checked = !!state.enabled;
    els.mini.textContent = fmt(stats.total) + ' requests · ' + stats.inflight + ' in flight · ' + perMinute() + '/min';

    if(modalOpen()) renderModal(m);
  }

  function renderStatus(){
    var h = '', a = auth;
    if(!state.token) h = 'No token saved.';
    else if(a.status === 'checking') h = 'Verifying…';
    else if(a.status === 'valid'){
      if(a.avatar && /^https:\/\//.test(a.avatar)) h += '<img src="' + esc(a.avatar) + '" alt=""/>';
      h += '<span class="gt-good">Verified</span> as <b>@' + esc(a.login || '') + '</b> · ' + esc(a.type || 'Token');
      if(a.scopes) h += ' · scopes: ' + esc(a.scopes);
    }
    else if(a.status === 'limited') h = '<span class="gt-warn">Token accepted</span> (profile not readable — HTTP ' + esc(a.code) + ') · ' + esc(a.type || 'Token');
    else if(a.status === 'invalid') h = '<span class="gt-err">GitHub rejected this token.</span> Check it or generate a new one.';
    else if(a.status === 'error') h = '<span class="gt-warn">Couldn\'t reach GitHub to verify.</span> The token is saved.';
    els.status.innerHTML = h;
  }

  function renderModal(m){
    renderStatus();
    // meter
    els.remain.textContent = m ? fmt(m.remaining) : '—';
    els.limit.textContent = m ? '/ ' + fmt(m.limit) + (state.token && state.enabled ? '' : ' (anonymous)') : '';
    var pct = m ? Math.max(0, Math.min(100, m.remaining / m.limit * 100)) : 0;
    els.barFill.style.width = pct + '%';
    els.barFill.className = 'gt-bar-fill' + (ratioClass(m) === 'low' ? ' gt-low' : ratioClass(m) === 'out' ? ' gt-out' : '');
    renderCountdown(m);
    var chips = '';
    ['search','graphql','code_search'].forEach(function(k){
      var r = meter.resources[k]; if(r) chips += '<span class="gt-chip">' + k.replace('_',' ') + ' ' + fmt(r.remaining) + '/' + fmt(r.limit) + '</span>';
    });
    els.resChips.innerHTML = chips;
    // grid
    function card(n, l, c){ return '<div class="gt-stat ' + (c || '') + '"><div class="gt-stat-n">' + fmt(n) + '</div><div class="gt-stat-l">' + l + '</div></div>'; }
    els.grid.innerHTML = card(stats.total, 'Requests') + card(stats.tokenReqs, 'Via token', 'gt-hl') + card(perMinute(), 'Last minute') +
      card(stats.fail, 'Failed', stats.fail ? 'gt-bad' : '') + card(stats.rerouted, 'Raw rerouted') + card(stats.inflight, 'In flight');
    // sources
    var names = Object.keys(stats.byCaller).sort(function(a,b){ return stats.byCaller[b] - stats.byCaller[a]; });
    els.sources.innerHTML = names.length
      ? names.map(function(n){ return '<div class="gt-src">' + esc(n) + '<span>' + fmt(stats.byCaller[n]) + '</span></div>'; }).join('')
      : '<div class="gt-empty">Nothing yet — GitHub calls from the editor or add-ons show up here.</div>';
    // log
    els.log.innerHTML = stats.log.length ? stats.log.slice(0, 14).map(function(r){
      var dot = !r.done ? 'gt-wait' : (r.err ? 'gt-fail' : 'gt-ok');
      var tag = r.rerouted && !r.fallback ? '<span class="gt-tag">REROUTED</span>'
              : r.useToken ? '<span class="gt-tag">TOKEN</span>'
              : r.own ? '<span class="gt-tag gt-anon">OWN</span>' : '<span class="gt-tag gt-anon">ANON</span>';
      var path = (r.host === 'raw.githubusercontent.com' ? 'raw' : '') + r.path;
      return '<div class="gt-row" title="' + esc(r.full) + '"><span class="gt-dot ' + dot + '"></span><span class="gt-meth">' + esc(r.method) + '</span>' +
        '<span class="gt-path">' + esc(path) + '</span>' + tag + '<span class="gt-meta">' + esc(r.caller) + ' · ' + (r.done ? (r.aborted ? 'aborted' : (r.status || 'err')) : '…') +
        (r.done ? '<span class="gt-ms"> · ' + r.ms + 'ms</span>' : '') + '</span></div>';
    }).join('') : '<div class="gt-log-empty">No requests yet.</div>';
    els.overrideToggle.checked = !!state.overrideOthers;
    els.rawToggle.checked = !!state.rerouteRaw;
  }
  function renderCountdown(m){
    if(!els.reset) return;
    if(!m || !m.reset){ els.reset.textContent = ''; return; }
    var left = Math.round(m.reset - Date.now() / 1000);
    els.reset.textContent = fmtCountdown(left);
    if(left <= 0 && Date.now() - lastRefresh > 5000) refreshRate();
  }

  /* ══════════════════ sidebar + wiring ══════════════════ */
  function insertSidebarSection(){
    var sidebar = document.getElementById('sidebar');
    var tpl = document.getElementById('gtSidebarTpl');
    if(!sidebar || !tpl || document.getElementById('gtSbSection')) return;
    var node = tpl.content.firstElementChild.cloneNode(true);
    var collapseBtn = sidebar.querySelector('.collapse-btn');
    if(collapseBtn) sidebar.insertBefore(node, collapseBtn); else sidebar.appendChild(node);
  }
  function cache(){
    var g = function(id){ return document.getElementById(id); };
    els = { header:g('gtHeader'), chevron:g('gtChevron'), dropdown:g('gtDropdown'), pill:g('gtPill'), sbSub:g('gtSbSub'),
      enableToggle:g('gtEnableToggle'), mini:g('gtMini'), openBtn:g('gtOpenBtn'), modal:g('githubTokenMdl'),
      tokenInput:g('gtTokenInput'), pasteBtn:g('gtPasteBtn'), showBtn:g('gtShowBtn'), saveBtn:g('gtSaveBtn'), clearBtn:g('gtClearBtn'), status:g('gtStatus'),
      remain:g('gtRemain'), limit:g('gtLimit'), reset:g('gtReset'), barFill:g('gtBarFill'), resChips:g('gtResChips'),
      grid:g('gtGrid'), sources:g('gtSources'), log:g('gtLog'), resetCountersBtn:g('gtResetCountersBtn'),
      overrideToggle:g('gtOverrideToggle'), rawToggle:g('gtRawToggle'), resetBtn:g('gtResetBtn') };
  }
  function openModal(){
    els.tokenInput.value = state.token || '';
    els.tokenInput.type = 'password';
    if(typeof window.openMdl === 'function') window.openMdl('githubTokenMdl');
    render();
    if(Date.now() - lastRefresh > 10000) refreshRate();
  }
  function saveToken(){
    var t = cleanToken(els.tokenInput.value);
    if(!t){ toast('Paste a GitHub token first', 'error'); return; }
    if(!/^[A-Za-z0-9_\-\.]+$/.test(t)){ toast('That doesn\'t look like a valid token', 'error'); return; }
    state.token = t; state.enabled = true; invalidToasted = false;
    saveState(); els.tokenInput.value = t;
    resetMeter(); verifyToken();
    toast('Token saved — GitHub requests now use it', 'success');
  }
  function wire(){
    els.header.addEventListener('click', function(){
      var open = !els.dropdown.classList.contains('open');
      els.dropdown.classList.toggle('open', open); els.chevron.classList.toggle('open', open);
    });
    els.enableToggle.addEventListener('change', function(){
      state.enabled = this.checked; saveState(); resetMeter();
    });
    els.openBtn.addEventListener('click', openModal);
    els.showBtn.addEventListener('click', function(){
      var show = els.tokenInput.type === 'password';
      els.tokenInput.type = show ? 'text' : 'password';
      this.querySelector('.material-symbols-outlined').textContent = show ? 'visibility_off' : 'visibility';
    });
    els.pasteBtn.addEventListener('click', function(){
      if(navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText().then(function(text){
          if(!text){ toast('Clipboard is empty', 'error'); return; }
          els.tokenInput.value = cleanToken(text);
          els.tokenInput.type = 'text';
          els.showBtn.querySelector('.material-symbols-outlined').textContent = 'visibility_off';
          els.tokenInput.focus();
        }, function(){ toast('Clipboard access was blocked — paste manually (long-press or Ctrl+V)', 'error'); });
      } else {
        els.tokenInput.focus();
        toast('Clipboard access isn\'t available here — paste manually', 'error');
      }
    });
    els.saveBtn.addEventListener('click', saveToken);
    els.tokenInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); saveToken(); } });
    els.clearBtn.addEventListener('click', function(){
      state.token = ''; auth = { status:'none' }; saveState(); els.tokenInput.value = '';
      resetMeter(); toast('Token removed', 'info');
    });
    els.overrideToggle.addEventListener('change', function(){ state.overrideOthers = this.checked; saveState(); });
    els.rawToggle.addEventListener('change', function(){ state.rerouteRaw = this.checked; saveState(); });
    els.resetCountersBtn.addEventListener('click', function(){
      stats = { total:0, ok:0, fail:0, tokenReqs:0, rerouted:0, fallbacks:0, inflight:0, byCaller:{}, log:[], times:[] };
      render();
    });
    els.resetBtn.addEventListener('click', function(){
      state.enabled = true; state.overrideOthers = true; state.rerouteRaw = true; saveState();
      render(); toast('Options reset (token kept)', 'info');
    });
    // keep other tabs in sync
    window.addEventListener('storage', function(e){
      if(e.key !== STORAGE_KEY) return;
      state = loadState(); if(els.tokenInput) els.tokenInput.value = state.token || '';
      resetMeter(); verifyToken();
    });
    // live countdown + slow poll of /rate_limit (free — doesn't consume quota)
    setInterval(function(){
      if(modalOpen()){ renderCountdown(primary()); }
    }, 1000);
    setInterval(function(){
      if(!document.hidden && (tokenActive() || modalOpen())) refreshRate();
      scheduleRender();
    }, 60000);
  }

  function init(){
    insertSidebarSection();
    cache();
    if(!els.pill || !els.modal) return;      // markup didn't load — interceptor still works
    wire();
    render();
    if(state.token) verifyToken();
    setTimeout(refreshRate, 600);
  }

  window.__ghTokenAddon = {
    version: '1.0.0',
    stats: function(){ return { total:stats.total, ok:stats.ok, failed:stats.fail, viaToken:stats.tokenReqs,
                                remaining: (primary() || {}).remaining, limit: (primary() || {}).limit }; },
    refresh: refreshRate
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
