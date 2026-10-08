/* ══════════════════════════════════════════════════════════════════
   LAZY PAGES — add-on engine
   Lazy-loads the pages of big documents. Only a window of pages around
   the one you're reading is kept in the DOM; the rest are stashed in
   memory and swapped back in as you scroll (or in the background).

   How it stays safe with the host editor
   ─ loadData()    is wrapped: far-away pages are never parsed on open.
   ─ collectData() is wrapped: stashed pages are written back into the
                   serialized result, so saves/exports never lose them.
   ─ Export, print and find/replace load everything first (optional).
   ─ Lazy loading pauses during live collaboration.
═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var STORAGE_KEY = 'lp_addon_state_v1';

  var SOURCES = [
    {id:'scd',   label:'SCD file import',          icon:'upload_file'},
    {id:'drive', label:'Google Drive document',    icon:'add_to_drive'},
    {id:'local', label:'Saved / Recent document',  icon:'history'},
    {id:'link',  label:'Shared link or template',  icon:'link'}
  ];
  var SRC_MODES = [
    {v:'default', label:'Use rules'},
    {v:'lazy',    label:'Always lazy'},
    {v:'full',    label:'Load all'},
    {v:'ask',     label:'Ask me'}
  ];

  var DEFAULTS = {
    enabled:false,
    // loading window
    before:2, after:4, perFrame:2,
    // scroll loading
    loadOnScroll:true, scrollDelay:80,
    // unloading
    unloadFar:true, unloadMargin:3, maxLoaded:0, unloadDelay:1500,
    // auto load (background fill)
    autoLoad:false, autoBatch:2, autoIdle:800,
    // when lazy mode applies
    ruleMode:'always',          // always | above | below
    ruleThreshold:20,
    // what happens when a document opens, per source
    sources:{ scd:'default', drive:'default', local:'default', link:'default' },
    // safety / display
    loadAllBeforeActions:true, deferHF:false,
    showBadge:true, placeholderStyle:'skeleton', showLabel:true, tapToLoad:true
  };

  var state = loadState();

  var rt = {
    docLazy:false, docSource:'local', collab:false,
    q:[], raf:0, unT:0, autoT:0, scrollT:0,
    lastScroll:0, holdUntil:0, autoDone:false,
    hint:null, lockedSrcs:{}, globalLock:false,
    edited:new WeakMap(), stash:new WeakMap(), cur:0
  };
  var els = {};
  var ctrls = [];

  /* ══════════════════ helpers ══════════════════ */
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function toast(msg,type){ if(typeof window.showToast === 'function') try{ window.showToast(msg,type||'info'); }catch(e){} }
  function countWords(t){ t = String(t||'').trim(); return t ? t.split(/\s+/).length : 0; }
  function htmlWords(h){ return countWords(String(h||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ')); }
  function getPages(){ return Array.prototype.slice.call(document.querySelectorAll('#editorArea .page')); }
  function getPc(page){ return page.querySelector(':scope > .page-content'); }
  function getHdr(page){ return page.querySelector(':scope > .page-header-area'); }
  function getFtr(page){ return page.querySelector(':scope > .page-footer-area'); }
  function isUnloaded(page){ return page.classList.contains('lp-unloaded'); }
  function hostBodyBlocksLazy(){
    var c = document.body.classList;
    return c.contains('converter-mode') || c.contains('manage-mode');
  }

  function loadState(){
    var s; try{ s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }catch(e){ s = null; }
    var m = Object.assign({}, DEFAULTS, s || {});
    m.sources = Object.assign({}, DEFAULTS.sources, (s && s.sources) || {});
    return m;
  }
  function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} }

  /* Index of the page under the vertical middle of the viewport (binary search). */
  function indexAtMid(pages){
    var wrap = document.getElementById('editorAreaWrapper');
    if(!wrap || !pages.length) return 0;
    var wr = wrap.getBoundingClientRect(), mid = wr.top + wr.height/2;
    var lo = 0, hi = pages.length - 1;
    while(lo < hi){
      var m = (lo + hi + 1) >> 1;
      if(pages[m].getBoundingClientRect().top <= mid) lo = m; else hi = m - 1;
    }
    return lo;
  }
  function focusIndex(pages){
    var node = document.activeElement;
    var sel = window.getSelection && window.getSelection();
    var pg = node && node.closest ? node.closest('.page') : null;
    if(!pg && sel && sel.anchorNode){
      var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      pg = el && el.closest ? el.closest('.page') : null;
    }
    return pg ? pages.indexOf(pg) : -1;
  }

  /* ══════════════════ sidebar ══════════════════ */
  function insertSidebarSection(){
    var sidebar = document.getElementById('sidebar');
    var tpl = document.getElementById('lpSidebarTpl');
    if(!sidebar || !tpl || document.getElementById('lpSbSection')) return;
    var node = tpl.content.firstElementChild.cloneNode(true);
    var collapseBtn = sidebar.querySelector('.collapse-btn');
    if(collapseBtn) sidebar.insertBefore(node, collapseBtn); else sidebar.appendChild(node);
  }
  function toggleSbDropdown(){
    var open = !els.dropdown.classList.contains('open');
    els.dropdown.classList.toggle('open', open);
    els.chevron.classList.toggle('open', open);
  }

  /* ══════════════════ page stash / swap ══════════════════ */
  function ensurePlaceholder(page){
    var ph = page.querySelector(':scope > .lp-ph');
    if(ph) return ph;
    ph = document.createElement('div');
    ph.className = 'lp-ph';
    ph.setAttribute('contenteditable','false');
    var lines = '';
    for(var i=0;i<14;i++) lines += '<div class="lp-sk" style="width:' + (i%5===4 ? 55 : 100 - (i*7)%23) + '%"></div>';
    ph.innerHTML = '<div class="lp-sk-wrap">' + lines + '</div>' +
      '<div class="lp-ph-card"><span class="material-symbols-outlined">hourglass_top</span>' +
      '<div class="lp-ph-title">Page <span class="lp-ph-n"></span></div>' +
      '<div class="lp-ph-sub">Not loaded yet — tap to load</div></div>';
    ph.addEventListener('click', onPlaceholderClick);
    page.appendChild(ph);
    return ph;
  }
  function refreshLabels(){
    getPages().forEach(function(p,i){
      var n = p.querySelector(':scope > .lp-ph .lp-ph-n');
      if(n) n.textContent = (i+1);
    });
  }
  function onPlaceholderClick(e){
    if(!state.tapToLoad) return;
    e.stopPropagation();
    var page = this.parentNode;
    if(loadPage(page)){
      var pc = getPc(page);
      if(pc && typeof pc.focus === 'function') try{ pc.focus({preventScroll:true}); }catch(x){}
    }
    updateBadge();
  }

  /* Register a page as unloaded using a ready-made stash (used on open). */
  function markUnloaded(page, st){
    var pc = getPc(page); if(!pc) return false;
    rt.stash.set(page, st);
    pc.innerHTML = '';
    pc.setAttribute('contenteditable','false');
    page.classList.add('lp-unloaded');
    ensurePlaceholder(page);
    return true;
  }

  /* Swap a live page out for a placeholder. */
  function unloadPage(page){
    if(isUnloaded(page)) return false;
    var pc = getPc(page); if(!pc) return false;
    if(page.contains(document.activeElement)) return false;
    var t = rt.edited.get(page);
    if(t && Date.now() - t < 4000) return false;

    var st = { c: pc.innerHTML, ce: pc.getAttribute('contenteditable') || 'true', words: countWords(pc.textContent) };
    if(state.deferHF){
      var h = getHdr(page), f = getFtr(page);
      st.h = h ? h.innerHTML : null; st.f = f ? f.innerHTML : null;
      if(h) h.innerHTML = ''; if(f) f.innerHTML = '';
    }
    // remember which images were locked (their elements are about to be recreated)
    if(typeof S !== 'undefined' && S.lockedImgs){
      pc.querySelectorAll('img').forEach(function(img){
        if(S.lockedImgs.has(img)){ rt.lockedSrcs[img.src] = 1; S.lockedImgs.delete(img); }
      });
    }
    rt.stash.set(page, st);
    pc.innerHTML = '';
    pc.setAttribute('contenteditable','false');
    page.classList.add('lp-unloaded');
    ensurePlaceholder(page);
    return true;
  }

  /* Swap a placeholder back for the real content. */
  function loadPage(page){
    if(!isUnloaded(page)) return false;
    var st = rt.stash.get(page), pc = getPc(page);
    page.classList.remove('lp-unloaded');
    var ph = page.querySelector(':scope > .lp-ph'); if(ph) ph.remove();
    if(!st || !pc){ return false; }
    pc.innerHTML = st.c;
    pc.setAttribute('contenteditable', st.ce || 'true');
    if(st.h != null){ var h = getHdr(page); if(h) h.innerHTML = st.h; }
    if(st.f != null){ var f = getFtr(page); if(f) f.innerHTML = st.f; }
    rt.stash.delete(page);

    // re-attach the host's per-element behaviours (same set loadData wires)
    try{
      if(typeof wireImg === 'function') pc.querySelectorAll('img').forEach(wireImg);
      if(typeof wireFormField === 'function') pc.querySelectorAll('.fw-field').forEach(wireFormField);
      if(typeof wireBanner === 'function') pc.querySelectorAll('.sc-banner').forEach(wireBanner);
      if(typeof S !== 'undefined' && S.lockedImgs){
        pc.querySelectorAll('img').forEach(function(img){
          if(rt.globalLock || rt.lockedSrcs[img.src]){
            S.lockedImgs.add(img); img.classList.add('img-locked');
            img.title = 'Image locked -- hold to unlock';
          }
        });
      }
    }catch(e){ console.warn('[Lazy Pages] rewire failed', e); }
    try{ document.dispatchEvent(new CustomEvent('lazypages:pageloaded', {detail:{page:page}})); }catch(e){}
    return true;
  }

  function clearAllLazyState(){
    getPages().forEach(function(p){
      p.classList.remove('lp-unloaded');
      var ph = p.querySelector(':scope > .lp-ph'); if(ph) ph.remove();
      var pc = getPc(p);
      if(pc && pc.getAttribute('contenteditable') === 'false') pc.setAttribute('contenteditable','true');
    });
    rt.stash = new WeakMap();
  }

  /* ══════════════════ queueing / sync ══════════════════ */
  function queueLoad(pages){
    rt.q = rt.q.concat(pages);
    if(!rt.raf) rt.raf = requestAnimationFrame(pump);
  }
  function pump(){
    rt.raf = 0;
    var k = Math.max(1, state.perFrame);
    while(k-- > 0 && rt.q.length){
      var p = rt.q.shift();
      if(p.isConnected && isUnloaded(p)) loadPage(p);
    }
    if(rt.q.length) rt.raf = requestAnimationFrame(pump);
    updateBadge();
  }

  function loadAll(opts){
    opts = opts || {};
    rt.q = [];
    var n = 0;
    getPages().forEach(function(p){ if(isUnloaded(p) && loadPage(p)) n++; });
    if(opts.hold) rt.holdUntil = Date.now() + opts.hold;
    updateBadge();
    if(!opts.silent && n) toast('Loaded all ' + getPages().length + ' pages', 'success');
    return n;
  }

  function sync(opts){
    opts = opts || {};
    if(!rt.docLazy || !state.enabled) { updateBadge(); return; }
    var pages = getPages(), n = pages.length; if(!n) return;
    var cur = opts.index != null ? opts.index : indexAtMid(pages);
    rt.cur = cur;
    var lo = Math.max(0, cur - state.before), hi = Math.min(n-1, cur + state.after);

    if(state.loadOnScroll || opts.force){
      var want = [];
      for(var i=lo;i<=hi;i++) if(isUnloaded(pages[i])) want.push(i);
      want.sort(function(a,b){ return Math.abs(a-cur) - Math.abs(b-cur); });
      if(want.length) queueLoad(want.map(function(i){ return pages[i]; }));
    }
    if(state.loadOnScroll && state.unloadFar && !state.autoLoad) scheduleUnload();
    updateBadge();
  }

  function scheduleUnload(){
    clearTimeout(rt.unT);
    rt.unT = setTimeout(doUnload, Math.max(0, state.unloadDelay));
  }

  function doUnload(opts){
    opts = opts || {};
    if(!rt.docLazy) return;
    if(!opts.force && Date.now() < rt.holdUntil){ scheduleUnload(); return; }
    var pages = getPages(), n = pages.length;
    var cur = indexAtMid(pages);
    var lo = Math.max(0, cur - state.before), hi = Math.min(n-1, cur + state.after);
    var m = opts.force ? 0 : state.unloadMargin;
    var keepLo = lo - m, keepHi = hi + m;
    var fi = focusIndex(pages);
    var out = 0;

    pages.forEach(function(p,i){
      if(isUnloaded(p)) return;
      if(i >= keepLo && i <= keepHi) return;
      if(fi >= 0 && Math.abs(i - fi) <= 1) return;          // never next to the page being edited
      if(unloadPage(p)) out++;
    });

    // optional hard cap on loaded pages
    var cap = state.maxLoaded > 0 ? Math.max(state.maxLoaded, state.before + state.after + 1) : 0;
    if(cap && !opts.force){
      var loaded = [];
      pages.forEach(function(p,i){ if(!isUnloaded(p)) loaded.push(i); });
      if(loaded.length > cap){
        loaded.sort(function(a,b){ return Math.abs(b-cur) - Math.abs(a-cur); });
        for(var k=0;k<loaded.length && loaded.length - k > cap;k++){
          var idx = loaded[k];
          if(idx >= lo && idx <= hi) continue;
          if(fi >= 0 && Math.abs(idx - fi) <= 1) continue;
          if(unloadPage(pages[idx])) out++;
        }
      }
    }
    if(out) refreshLabels();
    updateBadge();
    return out;
  }

  /* ══════════════════ auto load (background fill) ══════════════════ */
  function startAuto(){
    clearTimeout(rt.autoT);
    if(!rt.docLazy || !state.autoLoad) return;
    rt.autoT = setTimeout(autoTick, 300);
  }
  function autoTick(){
    clearTimeout(rt.autoT);
    if(!rt.docLazy || !state.autoLoad) return;
    var idle = Date.now() - rt.lastScroll;
    if(idle < state.autoIdle){ rt.autoT = setTimeout(autoTick, state.autoIdle - idle + 20); return; }
    var pages = getPages(), cur = indexAtMid(pages), un = [];
    pages.forEach(function(p,i){ if(isUnloaded(p)) un.push(i); });
    if(!un.length){
      if(!rt.autoDone){ rt.autoDone = true; toast('Lazy Pages: every page is now loaded', 'success'); }
      return;
    }
    un.sort(function(a,b){ return Math.abs(a-cur) - Math.abs(b-cur); });
    un.slice(0, Math.max(1,state.autoBatch)).forEach(function(i){ loadPage(pages[i]); });
    updateBadge();
    rt.autoT = setTimeout(autoTick, 60);
  }

  /* ══════════════════ deciding whether a doc goes lazy ══════════════════ */
  function ruleOk(n){
    if(state.ruleMode === 'above') return n > state.ruleThreshold;
    if(state.ruleMode === 'below') return n < state.ruleThreshold;
    return true;
  }
  function decide(n, src, allowAsk){
    var mode = state.sources[src] || 'default';
    if(mode === 'full') return false;
    if(mode === 'lazy') return true;
    if(mode === 'ask' && allowAsk){
      var win = state.before + state.after + 1;
      return window.confirm('This document has ' + n + ' pages.\n\nOK  =  Lazy load (about ' + win + ' pages at a time, rest on demand)\nCancel  =  Load every page now');
    }
    return ruleOk(n);
  }
  function planFor(data, h){
    if(!state.enabled || rt.collab) return null;
    if(h.src === 'export' || hostBodyBlocksLazy()) return null;
    if(!data || !Array.isArray(data.pages)) return null;
    try{ if(typeof isLegacyFile === 'function' && isLegacyFile(data)) return null; }catch(e){}
    var n = data.pages.length;
    if(n <= state.before + state.after + 1) return null;       // nothing to save
    if(!decide(n, h.src, true)) return null;
    var cur = 0;
    if(h.keep){ cur = clamp(indexAtMid(getPages()), 0, n-1); }
    return { lo:Math.max(0, cur - state.before), hi:Math.min(n-1, cur + state.after), cur:cur };
  }

  /* ══════════════════ wrapping the host ══════════════════ */
  function wrapGlobal(name, make){
    var orig = window[name];
    if(typeof orig !== 'function' || orig.__lp) return false;
    var w = make(orig); w.__lp = true; window[name] = w; return true;
  }

  function consumeHint(){
    var h = rt.hint; rt.hint = null;
    if(h && Date.now() - h.at < 15000) return h;
    var drive = false;
    try{ drive = (typeof _currentDocIsLive !== 'undefined' && _currentDocIsLive && typeof _currentDocDriveId !== 'undefined' && !!_currentDocDriveId); }catch(e){}
    return { src: drive ? 'drive' : 'local', keep:false, at:Date.now() };
  }
  function hintWrap(name, src, keep){
    wrapGlobal(name, function(orig){
      return function(){ rt.hint = { src:src, keep:!!keep, at:Date.now() }; return orig.apply(this, arguments); };
    });
  }

  function resetForNewDoc(){
    clearTimeout(rt.unT); clearTimeout(rt.autoT);
    rt.q = []; rt.holdUntil = 0; rt.autoDone = false; rt.lockedSrcs = {}; rt.globalLock = false;
    clearAllLazyState();
  }

  function installLoadData(){
    wrapGlobal('loadData', function(orig){
      return function(data){
        var h = consumeHint();
        resetForNewDoc();
        rt.docSource = h.src;
        var plan = null;
        try{ plan = planFor(data, h); }catch(e){ console.warn('[Lazy Pages] planning failed, loading normally', e); plan = null; }

        if(!plan){
          rt.docLazy = false;
          var r0 = orig.apply(this, arguments);
          updateBadge();
          return r0;
        }

        // Hand the host a copy where far-away pages are empty strings: they are never parsed.
        var d = Object.assign({}, data);
        d.pages = data.pages.map(function(html,i){ return (i >= plan.lo && i <= plan.hi) ? html : ''; });
        if(state.deferHF){
          if(Array.isArray(data.headers)) d.headers = data.headers.map(function(x,i){ return (i >= plan.lo && i <= plan.hi) ? x : ''; });
          if(Array.isArray(data.footers)) d.footers = data.footers.map(function(x,i){ return (i >= plan.lo && i <= plan.hi) ? x : ''; });
        }
        var ret = orig.call(this, d);

        // Stash the real content of every page outside the window.
        var pages = getPages();
        rt.globalLock = !!(data.meta && data.meta.lockImages);
        ((data.settings && data.settings.lockedImageSrcs) || []).forEach(function(s){ rt.lockedSrcs[s] = 1; });
        var hidden = 0;
        pages.forEach(function(p,i){
          if(i >= plan.lo && i <= plan.hi) return;
          if(i >= data.pages.length) return;
          var st = { c:data.pages[i], ce:'true', words:htmlWords(data.pages[i]) };
          if(state.deferHF){
            st.h = data.headers && data.headers[i] != null ? data.headers[i] : null;
            st.f = data.footers && data.footers[i] != null ? data.footers[i] : null;
          }
          if(markUnloaded(p, st)) hidden++;
        });
        rt.docLazy = true;
        refreshLabels();
        updateBadge();
        startAuto();
        setTimeout(function(){ sync(); }, 250);
        toast('Lazy Pages: ' + (pages.length - hidden) + ' of ' + pages.length + ' pages loaded', 'info');
        return ret;
      };
    });
  }

  /* Saves/exports serialize pages from the DOM — put the stashed ones back in. */
  function installCollectData(){
    wrapGlobal('collectData', function(orig){
      return function(){
        var d = orig.apply(this, arguments);
        try{
          if(rt.docLazy && d && Array.isArray(d.pages)){
            var pcs = document.querySelectorAll('#editorArea .page-content');
            for(var i=0;i<pcs.length;i++){
              var page = pcs[i].closest('.page'); if(!page) continue;
              var st = rt.stash.get(page); if(!st) continue;
              d.pages[i] = st.c;
              if(st.h != null && Array.isArray(d.headers)) d.headers[i] = st.h;
              if(st.f != null && Array.isArray(d.footers)) d.footers[i] = st.f;
            }
          }
        }catch(e){ console.error('[Lazy Pages] could not merge stashed pages into save', e); }
        return d;
      };
    });
  }

  /* Word count: add the words of pages that are currently stashed. */
  function installWordCount(){
    wrapGlobal('updateWordCount', function(orig){
      return function(){
        var r = orig.apply(this, arguments);
        try{
          if(rt.docLazy){
            var el = document.getElementById('wordCount'); if(!el) return r;
            var m = /^(\d+)/.exec(el.textContent || ''); if(!m) return r;
            var extra = 0;
            getPages().forEach(function(p){ var st = rt.stash.get(p); if(st) extra += st.words || 0; });
            var total = parseInt(m[1],10) + extra;
            el.textContent = total + ' word' + (total !== 1 ? 's' : '');
          }
        }catch(e){}
        return r;
      };
    });
  }

  /* Anything that reads every page straight from the DOM gets everything loaded first. */
  function prepForTool(){
    if(!rt.docLazy || !state.loadAllBeforeActions) return;
    var any = getPages().some(isUnloaded);
    if(!any) return;
    toast('Lazy Pages: loading all pages for this action…', 'info');
    loadAll({silent:true, hold:90000});
  }
  function installToolHooks(){
    ['exportPDFNative','exportPDFStructured','exportPDF','exportDOCX','exportTXT','exportJPG',
     'exportTXTWithOpts','exportImgWithOpts','printDoc','doFind','doFindReplace'
    ].forEach(function(name){
      wrapGlobal(name, function(orig){ return function(){ prepForTool(); return orig.apply(this, arguments); }; });
    });
  }

  function installSourceHints(){
    hintWrap('recOpenDoc',          'local');
    hintWrap('finishImport',        'scd');
    hintWrap('collabImportBase',    'scd');
    hintWrap('loadTemplateFromHash','link');
    hintWrap('recOpenLiveDoc',      'drive');
    hintWrap('driveSyncLiveDoc',    'drive', true);   // re-sync keeps your reading position
    // export / convert pipelines need every page rendered
    hintWrap('convLoadForSelection','export');
    hintWrap('convRunUpdate',       'export');
    hintWrap('mngRun',              'export');
  }

  function installCollabHook(){
    var C = window.SCCollab;
    if(!C || C.__lp) return;
    ['startSession','joinSession'].forEach(function(k){
      var o = C[k]; if(typeof o !== 'function') return;
      C[k] = function(){ enterCollab(); return o.apply(this, arguments); };
    });
    var ol = C.leaveSession;
    if(typeof ol === 'function') C.leaveSession = function(){ var r = ol.apply(this, arguments); leaveCollab(); return r; };
    C.__lp = true;
  }
  function enterCollab(){
    if(rt.collab) return;
    rt.collab = true;
    if(rt.docLazy){ loadAll({silent:true}); rt.docLazy = false; toast('Lazy Pages paused during live collaboration', 'info'); }
    updateBadge();
  }
  function leaveCollab(){ rt.collab = false; updateBadge(); }

  /* ══════════════════ applying settings to the open document ══════════════════ */
  function evaluateCurrentDoc(){
    var pages = getPages(), n = pages.length;
    var win = state.before + state.after + 1;
    var want = state.enabled && !rt.collab && !hostBodyBlocksLazy() && n > win && decide(n, rt.docSource || 'local', false);
    if(want && !rt.docLazy){
      rt.docLazy = true; rt.holdUntil = 0; rt.autoDone = false;
      var cur = indexAtMid(pages);
      var lo = Math.max(0, cur - state.before), hi = Math.min(n-1, cur + state.after);
      var fi = focusIndex(pages);
      pages.forEach(function(p,i){
        if(i >= lo && i <= hi) return;
        if(fi >= 0 && Math.abs(i - fi) <= 1) return;
        unloadPage(p);
      });
      refreshLabels(); startAuto();
    } else if(!want && rt.docLazy){
      loadAll({silent:true}); rt.docLazy = false;
    } else if(want){
      sync({force:true}); startAuto();
    }
    updateBadge();
  }

  function setEnabled(v){
    state.enabled = !!v; saveState();
    if(els.enableToggle) els.enableToggle.checked = state.enabled;
    if(state.enabled){
      evaluateCurrentDoc();
      toast(rt.docLazy ? 'Lazy Pages on — ' + stats().loaded + ' of ' + stats().total + ' pages loaded'
                       : 'Lazy Pages on — applies to the next big document you open', 'success');
    } else {
      if(rt.docLazy){ loadAll({silent:true}); rt.docLazy = false; }
      toast('Lazy Pages off', 'info');
    }
    updateBadge();
  }

  /* ══════════════════ status / badge ══════════════════ */
  function stats(){
    var pages = getPages(), un = 0;
    pages.forEach(function(p){ if(isUnloaded(p)) un++; });
    return { total:pages.length, loaded:pages.length - un, unloaded:un, lazy:rt.docLazy };
  }
  function updateBadge(){
    if(!els.badge) return;
    var s = stats();
    var show = state.enabled && rt.docLazy && state.showBadge && !hostBodyBlocksLazy();
    els.badge.classList.toggle('lp-show', show);
    if(show) els.badgeText.textContent = s.loaded + ' / ' + s.total + ' pages loaded';
    if(els.status){
      var txt;
      if(!state.enabled) txt = 'Lazy Pages is off. ' + s.total + ' page' + (s.total===1?'':'s') + ' in this document.';
      else if(rt.collab) txt = 'Paused — live collaboration needs every page loaded.';
      else if(rt.docLazy) txt = 'Active on this document: ' + s.loaded + ' of ' + s.total + ' pages loaded (' + s.unloaded + ' deferred).';
      else txt = 'On, but this document is loaded in full (' + s.total + ' pages) — it didn\'t match your rules.';
      els.status.textContent = txt;
    }
  }

  /* ══════════════════ scroll wiring ══════════════════ */
  function onScroll(){
    rt.lastScroll = Date.now();
    if(!rt.docLazy) return;
    clearTimeout(rt.scrollT);
    rt.scrollT = setTimeout(function(){ sync(); if(state.autoLoad) startAuto(); }, Math.max(0, state.scrollDelay));
  }

  /* ══════════════════ modal UI ══════════════════ */
  function mk(parent, html){
    var d = document.createElement('div'); d.innerHTML = html;
    var el = d.firstElementChild; parent.appendChild(el); return el;
  }
  function addToggle(box, key, label, sub, dep, after){
    var el = mk(box, '<div class="aw-row lp-row"><div><div class="aw-row-label">' + label + '</div><div class="aw-row-sub">' + sub +
      '</div></div><label class="toggle-switch"><input type="checkbox"/><span class="toggle-slider"></span></label></div>');
    var inp = el.querySelector('input');
    inp.addEventListener('change', function(){ state[key] = this.checked; saveState(); if(after) after(); refreshDeps(); });
    ctrls.push({ el:el, dep:dep, sync:function(){ inp.checked = !!state[key]; } });
  }
  function addSlider(box, key, label, min, max, step, fmt, dep, after){
    var el = mk(box, '<div class="sm-row lp-row"><span class="lp-lbl">' + label + '</span><input type="range" class="sm-slider" min="' + min +
      '" max="' + max + '" step="' + step + '"/><span class="sm-val lp-val"></span></div>');
    var inp = el.querySelector('input'), val = el.querySelector('.lp-val');
    inp.addEventListener('input', function(){
      state[key] = parseFloat(this.value); val.textContent = fmt(state[key]);
      saveState(); if(after) after(); refreshDeps();
    });
    ctrls.push({ el:el, dep:dep, sync:function(){ inp.value = state[key]; val.textContent = fmt(state[key]); } });
  }
  function addChips(box, title, icon, options, get, set, dep, after){
    var el = mk(box, '<div class="tc-gesture-row lp-row"><div class="tc-gesture-title"><span class="material-symbols-outlined">' + icon + '</span>' + title +
      '</div><div class="scale-chip-row">' + options.map(function(o){ return '<div class="scale-chip lp-chip" data-val="' + o.v + '">' + esc(o.label) + '</div>'; }).join('') + '</div></div>');
    el.querySelectorAll('.lp-chip').forEach(function(c){
      c.addEventListener('click', function(){ set(c.dataset.val); saveState(); sync2(); if(after) after(); refreshDeps(); });
    });
    function sync2(){ el.querySelectorAll('.lp-chip').forEach(function(c){ c.classList.toggle('active', c.dataset.val === get()); }); }
    ctrls.push({ el:el, dep:dep, sync:sync2 });
  }
  function refreshDeps(){
    ctrls.forEach(function(c){ c.el.classList.toggle('lp-dim', !!c.dep && !c.dep()); });
  }
  function syncControls(){ ctrls.forEach(function(c){ if(c.sync) c.sync(); }); refreshDeps(); }
  function visuals(){
    var b = document.body;
    b.classList.toggle('lp-ph-min', state.placeholderStyle === 'minimal');
    b.classList.toggle('lp-ph-nolabel', !state.showLabel);
    b.classList.toggle('lp-tap-off', !state.tapToLoad);
    updateBadge();
  }
  function reapply(){ evaluateCurrentDoc(); }

  function buildModal(){
    var $ = function(id){ return document.getElementById(id); };
    var win = $('lpWindowBox'), scr = $('lpScrollBox'), unl = $('lpUnloadBox'), aut = $('lpAutoBox'),
        rul = $('lpRuleBox'), src = $('lpSourceBox'), saf = $('lpSafetyBox');
    var isScroll = function(){ return state.loadOnScroll; };
    var canUnload = function(){ return state.loadOnScroll && state.unloadFar && !state.autoLoad; };
    var num = function(u){ return function(v){ return v + (u||''); }; };

    addSlider(win,'before','Pages before',1,20,1,num(),null,sync);
    addSlider(win,'after','Pages after',1,30,1,num(),null,sync);
    addSlider(win,'perFrame','Load speed',1,10,1,function(v){ return v + '/frame'; });
    mk(win,'<div class="sc-hint" style="margin-top:2px">Pages kept loaded around the one you\'re reading. Minimum 1 each side so text that flows between pages always has a live neighbour.</div>');

    addToggle(scr,'loadOnScroll','Load while scrolling','Bring pages in as they come near the viewport', null, sync);
    addSlider(scr,'scrollDelay','Scroll delay',0,600,20,num('ms'),isScroll);
    mk(scr,'<div class="sc-hint" style="margin-top:2px">Off = pages only load when you tap them (or via Auto Load / Load all).</div>');

    addToggle(unl,'unloadFar','Unload distant pages','Free pages you\'ve scrolled far away from', function(){ return state.loadOnScroll && !state.autoLoad; });
    addSlider(unl,'unloadMargin','Keep margin',0,15,1,num(' pg'),canUnload);
    addSlider(unl,'maxLoaded','Max loaded',0,200,5,function(v){ return v ? v + ' pg' : 'No limit'; },canUnload);
    addSlider(unl,'unloadDelay','Unload delay',0,10000,250,function(v){ return (v/1000).toFixed(2).replace(/0$/,'') + 's'; },canUnload);
    mk(unl,'<div class="sc-hint" style="margin-top:2px">Pages you just edited, and the ones next to your cursor, are never unloaded.</div>');

    addToggle(aut,'autoLoad','Auto load','Quietly load the remaining pages in the background when you stop scrolling', null, function(){ startAuto(); sync(); });
    addSlider(aut,'autoBatch','Batch size',1,10,1,num(' pg'),function(){ return state.autoLoad; });
    addSlider(aut,'autoIdle','Idle wait',200,5000,100,num('ms'),function(){ return state.autoLoad; });
    mk(aut,'<div class="sc-hint" style="margin-top:2px">With Auto Load on, pages are never unloaded again (it would just fight the loader).</div>');

    addChips(rul,'Use lazy loading','tune',[
      {v:'always',label:'Always'},{v:'above',label:'Only if above N pages'},{v:'below',label:'Only if below N pages'}
    ], function(){ return state.ruleMode; }, function(v){ state.ruleMode = v; }, null, reapply);
    addSlider(rul,'ruleThreshold','Page count (N)',2,500,1,num(' pg'),function(){ return state.ruleMode !== 'always'; }, reapply);

    mk(src,'<div class="sc-hint" style="margin:0 0 8px">What happens when a document is opened. "Use rules" follows the page-count rule above.</div>');
    SOURCES.forEach(function(s){
      addChips(src, s.label, s.icon, SRC_MODES, function(){ return state.sources[s.id]; }, function(v){ state.sources[s.id] = v; });
    });

    addToggle(saf,'loadAllBeforeActions','Load all before export / print / find','Those tools read every page from the screen, so unloaded pages would be skipped');
    addToggle(saf,'deferHF','Defer headers & footers too','Also stash them (helps if headers hold large images)');
    addToggle(saf,'showBadge','Status badge','Small “9 / 120 pages loaded” pill while lazy mode is active', null, updateBadge);
    addToggle(saf,'tapToLoad','Tap placeholder to load','Tap an unloaded page to load it immediately', null, visuals);
    addToggle(saf,'showLabel','Placeholder label','Show “Page N · Not loaded yet” on unloaded pages', null, visuals);
    addChips(saf,'Placeholder style','view_agenda',[{v:'skeleton',label:'Skeleton'},{v:'minimal',label:'Minimal'}],
      function(){ return state.placeholderStyle; }, function(v){ state.placeholderStyle = v; }, null, visuals);

    syncControls();
  }

  function wireModal(){
    var $ = function(id){ return document.getElementById(id); };
    els.status = $('lpStatus');
    $('lpLoadAllBtn').addEventListener('click', function(){ if(!rt.docLazy){ toast('Nothing to load — lazy mode isn\'t active here','info'); return; } loadAll({hold:1e12}); });
    $('lpUnloadBtn').addEventListener('click', function(){
      if(!rt.docLazy){ toast('Lazy mode isn\'t active on this document','info'); return; }
      rt.holdUntil = 0; var n = doUnload({force:true}) || 0; toast('Unloaded ' + n + ' distant page' + (n===1?'':'s'),'info');
    });
    $('lpReapplyBtn').addEventListener('click', function(){ rt.holdUntil = 0; evaluateCurrentDoc(); toast(rt.docLazy ? 'Lazy mode applied' : 'Lazy mode doesn\'t apply to this document','info'); });
    $('lpResetBtn').addEventListener('click', function(){
      var en = state.enabled; state = JSON.parse(JSON.stringify(DEFAULTS)); state.enabled = en;
      saveState(); syncControls(); visuals(); reapply(); toast('Lazy Pages reset to defaults','info');
    });
  }

  /* ══════════════════ init ══════════════════ */
  function init(){
    insertSidebarSection();
    els.dropdown = document.getElementById('lpDropdown');
    els.chevron = document.getElementById('lpChevron');
    els.header = document.getElementById('lpHeader');
    els.enableToggle = document.getElementById('lpEnableToggle');
    els.modsBtn = document.getElementById('lpModsBtn');
    els.badge = document.getElementById('lpBadge');
    els.badgeText = document.getElementById('lpBadgeText');
    if(!els.enableToggle || !els.badge) return;     // markup didn't load — bail quietly

    els.enableToggle.checked = state.enabled;
    els.header.addEventListener('click', toggleSbDropdown);
    els.enableToggle.addEventListener('change', function(){ setEnabled(this.checked); });
    els.modsBtn.addEventListener('click', function(){
      syncControls(); updateBadge();
      if(typeof window.openMdl === 'function') window.openMdl('lazyPagesMdl');
    });
    els.badge.addEventListener('click', function(){ els.modsBtn.click(); });
    document.getElementById('lpBadgeAll').addEventListener('click', function(e){ e.stopPropagation(); loadAll({hold:1e12}); });

    buildModal(); wireModal(); visuals();

    // Hooks go in even when disabled: they check `state.enabled` at call time,
    // so flipping the switch needs no reload and the first doc open is covered.
    installLoadData();
    installCollectData();
    installWordCount();
    installSourceHints();
    installToolHooks();
    installCollabHook();

    var wrap = document.getElementById('editorAreaWrapper');
    if(wrap) wrap.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', function(){ if(rt.docLazy) sync(); });
    document.addEventListener('input', function(e){
      var t = e.target; var p = t && t.closest ? t.closest('.page') : null;
      if(p) rt.edited.set(p, Date.now());
    }, true);

    updateBadge();
  }

  window.LazyPages = {
    loadAll:function(){ return loadAll({silent:true, hold:1e12}); },
    loadPage:function(n){ var p = getPages()[n-1]; if(!p) return false; var r = loadPage(p); updateBadge(); return r; },
    loadRange:function(a,b){ var ps = getPages(), c = 0; for(var i=Math.max(1,a);i<=Math.min(ps.length,b);i++) if(loadPage(ps[i-1])) c++; updateBadge(); return c; },
    unloadDistant:function(){ rt.holdUntil = 0; return doUnload({force:true}); },
    isActive:function(){ return rt.docLazy; },
    stats:stats,
    getSettings:function(){ return JSON.parse(JSON.stringify(state)); }
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
