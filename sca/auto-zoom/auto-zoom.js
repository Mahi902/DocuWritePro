/* ══════════════════════════════════════════════════════════════════
   AUTO ZOOM — add-on engine
   Drives the host editor's own zoom (S.zoom / applyZoom()) and its
   scroll container (#editorAreaWrapper). Runs in the same document as
   the host (the Sugarcane Add-on runtime injects this after the DOM
   is ready), so it talks to the host's globals directly — no overlay,
   no polling loop, nothing drawn on screen. Three independent pieces:

   • Auto Zoom          — refits the page to the screen whenever the
                           screen's size/shape/orientation changes.
   • Auto Focus         — zooms in and centers on your cursor the
                           moment you tap in or place the caret.
   • Auto Cursor Align  — while enabled, keeps smoothly re-centering
                           the screen on the caret as it moves.
═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var STORAGE_KEY = 'az_addon_state_v1';

  var DEFAULTS = {
    autoZoom:false,
    fitMode:'page',       // page | width
    autoFocus:false,
    focusZoom:150,
    autoAlign:false
  };

  var state = loadState();

  // ---- runtime (non-persisted) ----
  var rt = {
    focusActive:false,     // true while the caret is inside the document
    blurTimer:null,
    focusCenterTimer:null,
    resizeTimer:null,
    alignScheduled:false,
    ro:null
  };

  // ---- DOM refs (filled in init) ----
  var els = {};

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function showToastSafe(msg, type){ if(typeof window.showToast === 'function') window.showToast(msg, type); }

  function loadState(){
    var s;
    try{ s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }catch(e){ s = null; }
    return Object.assign({}, DEFAULTS, s || {});
  }
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  /* ══════════════════ Sidebar section ══════════════════ */
  function insertSidebarSection(){
    var sidebar = document.getElementById('sidebar');
    var tpl = document.getElementById('azSidebarTpl');
    if(!sidebar || !tpl || document.getElementById('azSbSection')) return;
    var node = tpl.content.firstElementChild.cloneNode(true);
    var collapseBtn = sidebar.querySelector('.collapse-btn');
    // Placed right before Collapse, same convention every add-on
    // sidebar section follows, so they stack in load order without
    // depending on one another.
    if(collapseBtn) sidebar.insertBefore(node, collapseBtn);
    else sidebar.appendChild(node);
  }

  function toggleSbDropdown(){
    var open = !els.azDropdown.classList.contains('open');
    els.azDropdown.classList.toggle('open', open);
    els.azChevron.classList.toggle('open', open);
  }

  /* ══════════════════ Host zoom bridge ══════════════════
     The host keeps its zoom state in `const S = {...}` at the top
     level of a classic <script> — top-level let/const never become
     properties of window (only function declarations, like the
     host's applyZoom, do that). S is still reachable as a bare
     identifier though, since classic scripts on the same page share
     one global lexical scope — so we deliberately read `S` directly
     here rather than `window.S`, which would silently stay undefined
     forever. typeof is safe to use on it either way: it only throws
     on an identifier still in its temporal dead zone, and by the
     time this add-on runs, the host's own script has long since
     finished executing and initialized S. */
  function hostReady(){
    try{ return typeof applyZoom === 'function' && typeof S === 'object' && S !== null; }
    catch(e){ return false; }
  }
  function currentZoom(){ return hostReady() ? (S.zoom || 100) : 100; }
  function setHostZoom(z){
    if(!hostReady()) return;
    z = clamp(Math.round(z), 30, 200);
    if(Math.round(S.zoom) === z) return;
    S.zoom = z;
    applyZoom();
  }

  /* ══════════════════ Fit-to-screen calculation ══════════════════
     Pages are a fixed CSS size (21cm × 29.7cm) regardless of content,
     so we only ever need to measure one — reading its *rendered*
     size and dividing out the current zoom gives its true size at
     100%, which we then compare against the wrapper's own viewport
     (minus #editorArea's own padding, read live so it never drifts
     out of sync with the host's own CSS). */
  function computeFitZoom(mode){
    var wrapper = els.wrapper, area = els.area;
    if(!wrapper || !area) return null;
    var page = area.querySelector('.page-outer .page') || area.querySelector('.page');
    if(!page) return null;

    var scale = currentZoom() / 100 || 1;
    var pr = page.getBoundingClientRect();
    var pageW = pr.width / scale, pageH = pr.height / scale;
    if(!pageW || !pageH) return null;

    var cs = getComputedStyle(area);
    var padX = (parseFloat(cs.paddingLeft)||0) + (parseFloat(cs.paddingRight)||0);
    var padY = (parseFloat(cs.paddingTop)||0) + (parseFloat(cs.paddingBottom)||0);
    var breathe = 16; // small comfortable margin so the page isn't flush against the edges

    var availW = wrapper.clientWidth - padX - breathe;
    var availH = wrapper.clientHeight - padY - breathe;
    if(availW <= 0 || availH <= 0) return null;

    var zw = (availW / pageW) * 100;
    var zh = (availH / pageH) * 100;
    var z = mode === 'width' ? zw : Math.min(zw, zh);
    return clamp(Math.round(z), 30, 200);
  }

  function applyAutoZoomFit(){
    if(!state.autoZoom) return;
    var z = computeFitZoom(state.fitMode);
    if(z != null) setHostZoom(z); // setHostZoom already goes either direction — up or down — from whatever zoom is current
  }

  function forceFit(){
    var z = computeFitZoom(state.fitMode);
    if(z == null){ showToastSafe('Could not measure the document yet', 'error'); return; }
    setHostZoom(z);
    showToastSafe('Zoomed to fit', 'success');
  }

  /* ══════════════════ Screen-change watcher ══════════════════ */
  function scheduleFit(){
    clearTimeout(rt.resizeTimer);
    rt.resizeTimer = setTimeout(applyAutoZoomFit, 260);
  }
  function wireResizeWatch(){
    if(window.ResizeObserver){
      rt.ro = new ResizeObserver(scheduleFit);
      rt.ro.observe(els.wrapper);
    } else {
      window.addEventListener('resize', scheduleFit);
    }
    window.addEventListener('orientationchange', scheduleFit);
    if(window.visualViewport) window.visualViewport.addEventListener('resize', scheduleFit);
  }

  /* ══════════════════ Caret geometry / centering ══════════════════ */
  function isEditableTarget(el){
    return !!(el && el.closest && el.closest('#editorArea .page-content[contenteditable="true"]'));
  }
  function getCaretRect(){
    var sel = window.getSelection && window.getSelection();
    if(!sel || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    var host = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    if(!isEditableTarget(host)) return null;
    var rects = range.getClientRects();
    if(rects.length) return rects[0];
    var rect = range.getBoundingClientRect();
    if(rect && (rect.width || rect.height)) return rect;
    return host && host.getBoundingClientRect ? host.getBoundingClientRect() : null;
  }
  function centerRectInWrapper(rect, smooth){
    var wrapper = els.wrapper;
    if(!wrapper || !rect) return;
    var wr = wrapper.getBoundingClientRect();
    var dx = (rect.left + rect.width/2) - (wr.left + wr.width/2);
    var dy = (rect.top + rect.height/2) - (wr.top + wr.height/2);
    if(Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    var left = wrapper.scrollLeft + dx, top = wrapper.scrollTop + dy;
    try{ wrapper.scrollTo({ left:left, top:top, behavior: smooth ? 'smooth' : 'auto' }); }
    catch(e){ wrapper.scrollLeft = left; wrapper.scrollTop = top; }
  }

  /* ══════════════════ Auto Focus ══════════════════ */
  function doAutoFocus(target){
    rt.focusActive = true;
    var changed = hostReady() && Math.round(S.zoom) !== Math.round(state.focusZoom);
    if(changed) setHostZoom(state.focusZoom);
    clearTimeout(rt.focusCenterTimer);
    // The host's zoom transform animates over .25s — wait it out before
    // measuring, so we center on where the caret actually ends up.
    rt.focusCenterTimer = setTimeout(function(){
      var rect = getCaretRect() || (target && target.getBoundingClientRect());
      if(rect) centerRectInWrapper(rect, true);
    }, changed ? 270 : 0);
  }
  function onFocusIn(e){
    if(!isEditableTarget(e.target)) return;
    rt.focusActive = true;
    if(state.autoFocus) doAutoFocus(e.target);
  }
  function onFocusOut(){
    clearTimeout(rt.blurTimer);
    rt.blurTimer = setTimeout(function(){
      if(isEditableTarget(document.activeElement)) return; // focus just moved to another editable spot
      rt.focusActive = false;
      if(state.autoZoom) applyAutoZoomFit(); // back to overview once writing is done
    }, 120);
  }
  function onPointerUpInEditor(e){
    if(!state.autoFocus) return;
    if(!isEditableTarget(e.target)) return;
    doAutoFocus(e.target);
  }

  /* ══════════════════ Auto Cursor Align ══════════════════ */
  function onSelectionChange(){
    if(!state.autoAlign) return;
    if(!isEditableTarget(document.activeElement)) return;
    if(rt.alignScheduled) return;
    rt.alignScheduled = true;
    requestAnimationFrame(function(){
      rt.alignScheduled = false;
      var rect = getCaretRect();
      if(rect) centerRectInWrapper(rect, true);
    });
  }

  function wireEditorListeners(){
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    if(els.area) els.area.addEventListener('pointerup', onPointerUpInEditor);
    document.addEventListener('selectionchange', onSelectionChange);
  }

  /* ══════════════════ Modal wiring ══════════════════ */
  function syncModalFromState(){
    document.querySelectorAll('#azFitRow .vw-mode-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.fit === state.fitMode);
    });
    els.focusZoomSlider.value = state.focusZoom;
    els.focusZoomVal.textContent = state.focusZoom + '%';
    els.focusToggle.checked = state.autoFocus;
    els.alignToggle.checked = state.autoAlign;
  }

  function wireModal(){
    document.querySelectorAll('#azFitRow .vw-mode-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        state.fitMode = btn.dataset.fit;
        saveState();
        syncModalFromState();
        if(state.autoZoom) applyAutoZoomFit();
      });
    });

    els.fitNowBtn.addEventListener('click', forceFit);

    els.focusToggle.addEventListener('change', function(){
      state.autoFocus = this.checked;
      saveState();
    });
    els.focusZoomSlider.addEventListener('input', function(){
      state.focusZoom = parseInt(this.value, 10);
      els.focusZoomVal.textContent = state.focusZoom + '%';
      saveState();
      if(rt.focusActive) setHostZoom(state.focusZoom); // live-preview while actively writing
    });

    els.alignToggle.addEventListener('change', function(){
      state.autoAlign = this.checked;
      saveState();
    });

    els.resetBtn.addEventListener('click', function(){
      var autoZoom = state.autoZoom; // the sidebar's own master toggle survives a reset, like every other add-on
      state = JSON.parse(JSON.stringify(DEFAULTS));
      state.autoZoom = autoZoom;
      saveState();
      syncModalFromState();
      if(state.autoZoom) applyAutoZoomFit();
      showToastSafe('Auto Zoom reset to defaults', 'info');
    });
  }

  /* ══════════════════ Init ══════════════════ */
  function cacheEls(){
    els.azDropdown = document.getElementById('azDropdown');
    els.azChevron = document.getElementById('azChevron');
    els.azHeader = document.getElementById('azHeader');
    els.enableToggle = document.getElementById('azEnableToggle');
    els.modsBtn = document.getElementById('azModsBtn');

    els.wrapper = document.getElementById('editorAreaWrapper');
    els.area = document.getElementById('editorArea');

    els.fitNowBtn = document.getElementById('azFitNowBtn');
    els.focusToggle = document.getElementById('azFocusToggle');
    els.focusZoomSlider = document.getElementById('azFocusZoomSlider');
    els.focusZoomVal = document.getElementById('azFocusZoomVal');
    els.alignToggle = document.getElementById('azAlignToggle');
    els.resetBtn = document.getElementById('azResetBtn');
  }

  function init(){
    insertSidebarSection();
    cacheEls();
    if(!els.wrapper || !els.area || !els.azDropdown) return; // markup didn't load — bail quietly

    els.enableToggle.checked = state.autoZoom;
    els.azHeader.addEventListener('click', toggleSbDropdown);
    els.enableToggle.addEventListener('change', function(){
      state.autoZoom = this.checked;
      saveState();
      if(state.autoZoom) applyAutoZoomFit();
    });
    els.modsBtn.addEventListener('click', function(){
      syncModalFromState();
      if(typeof window.openMdl === 'function') window.openMdl('autoZoomMdl');
    });

    wireModal();
    wireEditorListeners();
    wireResizeWatch();

    if(state.autoZoom) setTimeout(applyAutoZoomFit, 300); // let the host's own initial layout settle first
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
