/* ═══════════════════════════════════════════════════════════════════════
   Sugarcane Add-on: Touch Cursor
   Adds a virtual desktop-style cursor, driven by an on-screen touchpad,
   to touch screen devices. Supports left/right click, click-and-hold,
   and synthetic hover so hover-only UI still reacts.

   Adds a "Touch Cursor" section to the very bottom of the sidebar with:
     - an enable toggle
     - a "Modifications" button opening the settings modal

   Everything is namespaced under `tc`/`tcm` to avoid clashing with the
   host app's own classes. Settings persist in localStorage.
═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  const LS_KEY = 'sugarcane_addon_touch_cursor_settings';

  const defaults = {
    enabled: false,
    styleType: 'preset',     // 'preset' | 'text' | 'image'
    presetShape: 'arrow',    // 'arrow' | 'hand' | 'ibeam' | 'crosshair'
    styleText: '➤',
    styleImage: '',
    size: 30,
    sensitivity: 1,
    padSize: 130,
    padOpacity: 0.9,
    padMode: 'input',        // 'input' | 'move'
    padPos: null,            // {left, top} px, used only in 'move' mode
    showPadButtons: true,
    doubleTapAction: 'left'  // 'left' | 'right'
  };

  let cfg = loadCfg();
  function loadCfg(){
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); }
    catch(e){ return Object.assign({}, defaults); }
  }
  function saveCfg(){ try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch(e){} }

  // ── Virtual cursor state ─────────────────────────────────────────────
  let cx = 0, cy = 0, hoveredEl = null;
  let cursorEl, padEl, padSurface, leftBtn, rightBtn, customizeBox, sidebarSection;

  const ARROW_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M4 2l14 12-6 1 3 6-3 1-3-6-5 4z" fill="#1a1a1a" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const HAND_SVG  = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M9 12V4.5a1.5 1.5 0 0 1 3 0V11h1V3a1.5 1.5 0 0 1 3 0v8h1V5a1.5 1.5 0 0 1 3 0v10c0 3.9-2.9 7-7 7-2.3 0-3.7-.8-5-2.3L3.6 14a1.4 1.4 0 0 1 2-2L8 14.5V12z" fill="#1a1a1a" stroke="#fff" stroke-width="1" stroke-linejoin="round"/></svg>';
  const IBEAM_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M9 3h6M12 3v18M9 21h6" stroke="#1a1a1a" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const CROSS_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="#1a1a1a" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="#1a1a1a" stroke-width="1.6"/></svg>';
  const PRESET_SVGS = {arrow: ARROW_SVG, hand: HAND_SVG, ibeam: IBEAM_SVG, crosshair: CROSS_SVG};

  // ── Cursor rendering ─────────────────────────────────────────────────
  function buildCursor(){
    cursorEl = document.createElement('div');
    cursorEl.id = 'tcCursor';
    cursorEl.dataset.sugarcaneAddon = 'touch-cursor';
    document.body.appendChild(cursorEl);
    cx = window.innerWidth / 2;
    cy = window.innerHeight / 2;
    renderCursorStyle();
    positionCursor();
  }

  function renderCursorStyle(){
    cursorEl.className = '';
    cursorEl.style.backgroundImage = '';
    cursorEl.style.width = cfg.size + 'px';
    cursorEl.style.height = cfg.size + 'px';
    if(cfg.styleType === 'image' && cfg.styleImage){
      cursorEl.classList.add('tc-cursor-image');
      cursorEl.style.backgroundImage = 'url("' + cfg.styleImage.replace(/"/g,'\\"') + '")';
      cursorEl.innerHTML = '';
    } else if(cfg.styleType === 'text' && cfg.styleText){
      cursorEl.classList.add('tc-cursor-text');
      cursorEl.style.fontSize = Math.max(10, cfg.size * 0.8) + 'px';
      cursorEl.style.lineHeight = cfg.size + 'px';
      cursorEl.textContent = cfg.styleText;
    } else {
      cursorEl.classList.add('tc-cursor-preset');
      cursorEl.innerHTML = PRESET_SVGS[cfg.presetShape] || ARROW_SVG;
    }
  }

  function positionCursor(){
    cursorEl.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
  }

  function clampCursor(){
    cx = Math.min(window.innerWidth - 2, Math.max(2, cx));
    cy = Math.min(window.innerHeight - 2, Math.max(2, cy));
  }

  function moveCursorBy(dx, dy){
    cx += dx * cfg.sensitivity;
    cy += dy * cfg.sensitivity;
    clampCursor();
    positionCursor();
    updateHover();
  }

  // ── Synthetic mouse dispatch ─────────────────────────────────────────
  function elAt(){ return document.elementFromPoint(cx, cy); }

  function fire(el, type, opts){
    if(!el) return;
    const base = {bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy, button:0};
    const merged = Object.assign(base, opts || {});
    let ev;
    try { ev = type.indexOf('pointer') === 0 ? new PointerEvent(type, merged) : new MouseEvent(type, merged); }
    catch(e){ ev = new MouseEvent(type, merged); }
    el.dispatchEvent(ev);
  }

  function updateHover(){
    const el = elAt();
    if(el === hoveredEl){ fire(el, 'mousemove'); return; }
    if(hoveredEl){ fire(hoveredEl, 'mouseout', {bubbles:true}); fire(hoveredEl, 'mouseleave', {bubbles:false}); }
    hoveredEl = el;
    if(el){ fire(el, 'mouseover', {bubbles:true}); fire(el, 'mouseenter', {bubbles:false}); fire(el, 'mousemove'); }
  }

  function placeCaret(){
    if(document.caretRangeFromPoint){
      const r = document.caretRangeFromPoint(cx, cy);
      if(r){ const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    } else if(document.caretPositionFromPoint){
      const p = document.caretPositionFromPoint(cx, cy);
      if(p){ const range = document.createRange(); range.setStart(p.offsetNode, p.offset); range.collapse(true);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
    }
  }

  function clickAt(button){
    const el = elAt();
    if(!el) return;
    const opts = {button, buttons: button === 2 ? 2 : 1};
    fire(el, 'pointerdown', opts); fire(el, 'mousedown', opts);
    fire(el, 'pointerup', opts);   fire(el, 'mouseup', opts);
    if(button === 2){
      fire(el, 'contextmenu', opts);
    } else {
      fire(el, 'click', opts);
      if(typeof el.focus === 'function'){ try { el.focus({preventScroll:true}); } catch(e){} }
      if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) placeCaret();
    }
  }

  let holding = null;
  function holdStart(button){
    const el = elAt(); if(!el) return;
    const opts = {button, buttons: button === 2 ? 2 : 1};
    fire(el, 'pointerdown', opts); fire(el, 'mousedown', opts);
    holding = {el, button};
  }
  function holdEnd(){
    if(!holding) return;
    const {el, button} = holding;
    const opts = {button, buttons: 0};
    fire(el, 'pointerup', opts); fire(el, 'mouseup', opts); fire(el, 'click', opts);
    holding = null;
  }

  // ── Pad ───────────────────────────────────────────────────────────────
  function buildPad(){
    padEl = document.createElement('div');
    padEl.id = 'tcPad';
    padEl.dataset.sugarcaneAddon = 'touch-cursor';
    padEl.innerHTML =
      '<div class="tc-pad-surface" id="tcPadSurface"></div>' +
      '<div class="tc-pad-btns" id="tcPadBtns">' +
        '<button type="button" class="tc-pad-btn" id="tcLeftBtn">L</button>' +
        '<button type="button" class="tc-pad-btn" id="tcRightBtn">R</button>' +
      '</div>' +
      '<div class="tc-pad-mode-tag" id="tcPadModeTag"></div>' +
      '<div class="tc-pad-customize" id="tcPadCustomize" hidden>' +
        '<div class="tc-pc-title">Double-tap triggers</div>' +
        '<div class="tc-pc-row">' +
          '<button type="button" data-val="left" class="tc-pc-btn">Left Click</button>' +
          '<button type="button" data-val="right" class="tc-pc-btn">Right Click</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(padEl);
    padSurface = padEl.querySelector('#tcPadSurface');
    leftBtn = padEl.querySelector('#tcLeftBtn');
    rightBtn = padEl.querySelector('#tcRightBtn');
    customizeBox = padEl.querySelector('#tcPadCustomize');
    applyPadStyle();
    wirePadGestures();
    wirePadButtons();
  }

  function applyPadStyle(){
    padEl.style.width = cfg.padSize + 'px';
    padEl.style.height = cfg.padSize + 'px';
    padEl.style.opacity = cfg.padOpacity;
    padEl.classList.toggle('tc-pad-move-mode', cfg.padMode === 'move');
    padEl.querySelector('#tcPadModeTag').textContent = cfg.padMode === 'move' ? 'Move' : '';
    padEl.querySelector('#tcPadBtns').style.display = cfg.showPadButtons ? 'flex' : 'none';
    if(cfg.padMode === 'move' && cfg.padPos){
      padEl.style.left = cfg.padPos.left + 'px';
      padEl.style.top = cfg.padPos.top + 'px';
      padEl.style.right = 'auto'; padEl.style.bottom = 'auto';
    } else if(!cfg.padPos){
      padEl.style.left = 'auto'; padEl.style.top = 'auto';
      padEl.style.right = '18px'; padEl.style.bottom = '18px';
    }
  }

  function clampPadPos(left, top){
    const size = cfg.padSize;
    left = Math.min(window.innerWidth - size - 4, Math.max(4, left));
    top = Math.min(window.innerHeight - size - 4, Math.max(4, top));
    return {left, top};
  }

  function wirePadGestures(){
    let dragging = false, lastX = 0, lastY = 0, startX = 0, startY = 0;
    let moved = false, lastTapTime = 0, lastTapX = 0, lastTapY = 0, holdTimer = null;

    padSurface.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false;
      lastX = e.clientX; lastY = e.clientY; startX = e.clientX; startY = e.clientY;
      padSurface.setPointerCapture(e.pointerId);
      hideCustomize();
      if(cfg.padMode === 'input'){
        holdTimer = setTimeout(() => { if(!moved) showCustomize(); }, 3000);
      }
    });

    padSurface.addEventListener('pointermove', (e) => {
      if(!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if(Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) moved = true;
      if(moved && holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
      if(cfg.padMode === 'move'){
        const rect = padEl.getBoundingClientRect();
        const pos = clampPadPos(rect.left + dx, rect.top + dy);
        cfg.padPos = pos; applyPadStyle();
      } else {
        moveCursorBy(dx, dy);
      }
    });

    padSurface.addEventListener('pointerup', (e) => {
      dragging = false;
      if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
      if(cfg.padMode === 'move'){ saveCfg(); return; }
      if(!moved){
        const now = Date.now();
        const dt = now - lastTapTime;
        const dist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
        if(dt < 320 && dist < 30){
          clickAt(cfg.doubleTapAction === 'right' ? 2 : 0);
          lastTapTime = 0;
        } else {
          lastTapTime = now; lastTapX = e.clientX; lastTapY = e.clientY;
        }
      }
    });

    document.addEventListener('pointerdown', (e) => {
      if(customizeBox && !customizeBox.hidden && !customizeBox.contains(e.target) && e.target !== padSurface){
        hideCustomize();
      }
    });

    customizeBox.querySelectorAll('.tc-pc-btn').forEach(btn => {
      btn.addEventListener('pointerup', () => {
        cfg.doubleTapAction = btn.dataset.val; saveCfg(); hideCustomize(); syncModalInputs();
      });
    });
  }

  function showCustomize(){ customizeBox.hidden = false; }
  function hideCustomize(){ if(customizeBox) customizeBox.hidden = true; }

  function wirePadButtons(){
    [[leftBtn, 0], [rightBtn, 2]].forEach(([btn, button]) => {
      let pressTimer = null, isHold = false;
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); isHold = false;
        pressTimer = setTimeout(() => { isHold = true; holdStart(button); }, 400);
      });
      btn.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        clearTimeout(pressTimer);
        if(isHold) holdEnd(); else clickAt(button);
      });
      btn.addEventListener('pointerleave', () => { if(isHold) holdEnd(); clearTimeout(pressTimer); });
    });
  }

  // ── Sidebar section ──────────────────────────────────────────────────
  function buildSidebarSection(){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar) return;
    sidebarSection = document.createElement('div');
    sidebarSection.className = 'sb-section';
    sidebarSection.id = 'tcSbSection';
    sidebarSection.dataset.sugarcaneAddon = 'touch-cursor';
    sidebarSection.innerHTML =
      '<div class="aw-header" id="tcHeader">' +
        '<span class="aw-header-label aw-label-blue">Touch Cursor</span>' +
        '<div class="aw-header-right"><span class="material-symbols-outlined aw-chevron" id="tcChevron">expand_more</span></div>' +
      '</div>' +
      '<div class="aw-dropdown" id="tcDropdown">' +
        '<div class="aw-inner">' +
          '<div class="aw-row">' +
            '<div><div class="aw-row-label">Touch Cursor</div><div class="aw-row-sub">Virtual desktop cursor for touch screens</div></div>' +
            '<label class="toggle-switch"><input type="checkbox" id="tcEnableToggle"><span class="toggle-slider"></span></label>' +
          '</div>' +
          '<button type="button" class="tc-mod-btn" id="tcModBtn"><span class="material-symbols-outlined">tune</span>Modifications</button>' +
        '</div>' +
      '</div>';
    sidebar.appendChild(sidebarSection);

    document.getElementById('tcHeader').addEventListener('click', () => {
      const open = document.getElementById('tcDropdown').classList.toggle('open');
      document.getElementById('tcChevron').classList.toggle('open', open);
    });
    const enableToggle = document.getElementById('tcEnableToggle');
    enableToggle.checked = cfg.enabled;
    enableToggle.addEventListener('change', () => {
      cfg.enabled = enableToggle.checked; saveCfg(); applyEnabled();
    });
    document.getElementById('tcModBtn').addEventListener('click', openModal);
  }

  function applyEnabled(){
    const disp = cfg.enabled ? '' : 'none';
    if(cursorEl) cursorEl.style.display = disp;
    if(padEl) padEl.style.display = disp;
    if(!cfg.enabled) hideCustomize();
  }

  // ── Modifications modal ──────────────────────────────────────────────
  let modalEl;
  function buildModal(){
    modalEl = document.createElement('div');
    modalEl.id = 'tcModalOverlay';
    modalEl.className = 'tcm-overlay';
    modalEl.dataset.sugarcaneAddon = 'touch-cursor';
    modalEl.innerHTML =
      '<div class="tcm-box">' +
        '<div class="tcm-header">' +
          '<div class="tcm-title"><span class="material-symbols-outlined">touch_app</span>Touch Cursor</div>' +
          '<button type="button" class="tcm-close" id="tcmCloseBtn"><span class="material-symbols-outlined">close</span></button>' +
        '</div>' +
        '<div class="tcm-body">' +

          '<div class="tcm-section">' +
            '<div class="tcm-section-title">Cursor Appearance</div>' +
            '<div class="tcm-preset-grid" id="tcPresetGrid">' +
              '<button type="button" class="tcm-preset" data-shape="arrow"><span class="tcm-preset-ic">➤</span>Arrow</button>' +
              '<button type="button" class="tcm-preset" data-shape="hand"><span class="tcm-preset-ic">✋</span>Hand</button>' +
              '<button type="button" class="tcm-preset" data-shape="ibeam"><span class="tcm-preset-ic">I</span>Text</button>' +
              '<button type="button" class="tcm-preset" data-shape="crosshair"><span class="tcm-preset-ic">✛</span>Crosshair</button>' +
            '</div>' +
            '<label class="tcm-label">Custom text cursor</label>' +
            '<div class="tcm-inline-row">' +
              '<input type="text" id="tcCustomTextInput" class="tcm-input" placeholder="e.g. 🐾 or >>" maxlength="4">' +
              '<button type="button" class="tcm-btn small" id="tcUseTextBtn">Use</button>' +
            '</div>' +
            '<label class="tcm-label">Upload image</label>' +
            '<div class="tcm-upload-zone" id="tcUploadZone">' +
              '<span class="material-symbols-outlined">upload</span><p>Tap to upload an image</p>' +
              '<input type="file" id="tcImageFile" accept="image/*" hidden>' +
            '</div>' +
            '<label class="tcm-label">or Image URL</label>' +
            '<div class="tcm-inline-row">' +
              '<input type="text" id="tcImageUrlInput" class="tcm-input" placeholder="https://…">' +
              '<button type="button" class="tcm-btn small" id="tcUseUrlBtn">Use</button>' +
            '</div>' +
          '</div>' +

          '<div class="tcm-section">' +
            '<div class="tcm-section-title">Cursor Size</div>' +
            '<input type="range" id="tcSizeRange" min="16" max="64" step="1" class="tcm-range">' +
            '<div class="tcm-range-val" id="tcSizeVal"></div>' +
          '</div>' +

          '<div class="tcm-section">' +
            '<div class="tcm-section-title">Sensitivity</div>' +
            '<input type="range" id="tcSensRange" min="0.3" max="3" step="0.1" class="tcm-range">' +
            '<div class="tcm-range-val" id="tcSensVal"></div>' +
          '</div>' +

          '<div class="tcm-section">' +
            '<div class="tcm-section-title">Cursor Pad Size</div>' +
            '<input type="range" id="tcPadSizeRange" min="90" max="220" step="1" class="tcm-range">' +
            '<div class="tcm-range-val" id="tcPadSizeVal"></div>' +
          '</div>' +

          '<div class="tcm-section">' +
            '<div class="tcm-section-title">Cursor Pad Opacity</div>' +
            '<input type="range" id="tcPadOpRange" min="20" max="100" step="1" class="tcm-range">' +
            '<div class="tcm-range-val" id="tcPadOpVal"></div>' +
          '</div>' +

          '<div class="tcm-section">' +
            '<div class="tcm-section-title">Cursor Pad Mode</div>' +
            '<div class="tcm-mode-row">' +
              '<button type="button" class="tcm-mode-btn" data-mode="input" id="tcModeInputBtn"><span class="material-symbols-outlined">touch_app</span>Input<small>Pad locked — touches move the cursor</small></button>' +
              '<button type="button" class="tcm-mode-btn" data-mode="move" id="tcModeMoveBtn"><span class="material-symbols-outlined">open_with</span>Move<small>Drag to reposition the pad</small></button>' +
            '</div>' +
          '</div>' +

          '<div class="tcm-section">' +
            '<div class="aw-row">' +
              '<div><div class="aw-row-label">Left/Right click buttons</div><div class="aw-row-sub">Show click buttons on the pad</div></div>' +
              '<label class="toggle-switch"><input type="checkbox" id="tcShowBtnsToggle"><span class="toggle-slider"></span></label>' +
            '</div>' +
          '</div>' +

          '<div class="tcm-section">' +
            '<div class="tcm-section-title">Cursor Pad Shortcuts</div>' +
            '<div class="tcm-shortcut-row">' +
              '<span>Double-tap triggers</span>' +
              '<div class="tcm-seg"><button type="button" data-val="left" id="tcDblLeftBtn">Left Click</button><button type="button" data-val="right" id="tcDblRightBtn">Right Click</button></div>' +
            '</div>' +
            '<div class="tcm-hint">Tip: hold the pad for 3 seconds to open this same picker without leaving the pad.</div>' +
          '</div>' +

        '</div>' +
        '<div class="tcm-footer"><button type="button" class="tcm-btn primary" id="tcmDoneBtn">Done</button></div>' +
      '</div>';
    document.body.appendChild(modalEl);
    wireModal();
  }

  function wireModal(){
    document.getElementById('tcmCloseBtn').addEventListener('click', closeModal);
    document.getElementById('tcmDoneBtn').addEventListener('click', closeModal);
    modalEl.addEventListener('click', (e) => { if(e.target === modalEl) closeModal(); });

    modalEl.querySelectorAll('.tcm-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        cfg.styleType = 'preset'; cfg.presetShape = btn.dataset.shape;
        saveCfg(); renderCursorStyle(); syncModalInputs();
      });
    });

    document.getElementById('tcUseTextBtn').addEventListener('click', () => {
      const v = document.getElementById('tcCustomTextInput').value.trim();
      if(!v) return;
      cfg.styleType = 'text'; cfg.styleText = v; saveCfg(); renderCursorStyle(); syncModalInputs();
    });

    const uploadZone = document.getElementById('tcUploadZone');
    const fileInput = document.getElementById('tcImageFile');
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        cfg.styleType = 'image'; cfg.styleImage = reader.result;
        saveCfg(); renderCursorStyle(); syncModalInputs();
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('tcUseUrlBtn').addEventListener('click', () => {
      const v = document.getElementById('tcImageUrlInput').value.trim();
      if(!v) return;
      cfg.styleType = 'image'; cfg.styleImage = v; saveCfg(); renderCursorStyle(); syncModalInputs();
    });

    const sizeRange = document.getElementById('tcSizeRange');
    sizeRange.addEventListener('input', () => {
      cfg.size = parseInt(sizeRange.value, 10); saveCfg(); renderCursorStyle(); positionCursor();
      document.getElementById('tcSizeVal').textContent = cfg.size + 'px';
    });

    const sensRange = document.getElementById('tcSensRange');
    sensRange.addEventListener('input', () => {
      cfg.sensitivity = parseFloat(sensRange.value); saveCfg();
      document.getElementById('tcSensVal').textContent = cfg.sensitivity.toFixed(1) + '×';
    });

    const padSizeRange = document.getElementById('tcPadSizeRange');
    padSizeRange.addEventListener('input', () => {
      cfg.padSize = parseInt(padSizeRange.value, 10); saveCfg(); applyPadStyle();
      document.getElementById('tcPadSizeVal').textContent = cfg.padSize + 'px';
    });

    const padOpRange = document.getElementById('tcPadOpRange');
    padOpRange.addEventListener('input', () => {
      cfg.padOpacity = parseInt(padOpRange.value, 10) / 100; saveCfg(); applyPadStyle();
      document.getElementById('tcPadOpVal').textContent = Math.round(cfg.padOpacity * 100) + '%';
    });

    document.getElementById('tcModeInputBtn').addEventListener('click', () => { cfg.padMode = 'input'; saveCfg(); applyPadStyle(); syncModalInputs(); });
    document.getElementById('tcModeMoveBtn').addEventListener('click', () => { cfg.padMode = 'move'; saveCfg(); applyPadStyle(); syncModalInputs(); });

    const showBtnsToggle = document.getElementById('tcShowBtnsToggle');
    showBtnsToggle.addEventListener('change', () => { cfg.showPadButtons = showBtnsToggle.checked; saveCfg(); applyPadStyle(); });

    document.getElementById('tcDblLeftBtn').addEventListener('click', () => { cfg.doubleTapAction = 'left'; saveCfg(); syncModalInputs(); });
    document.getElementById('tcDblRightBtn').addEventListener('click', () => { cfg.doubleTapAction = 'right'; saveCfg(); syncModalInputs(); });
  }

  function syncModalInputs(){
    if(!modalEl) return;
    modalEl.querySelectorAll('.tcm-preset').forEach(b => b.classList.toggle('active', cfg.styleType === 'preset' && b.dataset.shape === cfg.presetShape));
    document.getElementById('tcSizeRange').value = cfg.size;
    document.getElementById('tcSizeVal').textContent = cfg.size + 'px';
    document.getElementById('tcSensRange').value = cfg.sensitivity;
    document.getElementById('tcSensVal').textContent = cfg.sensitivity.toFixed(1) + '×';
    document.getElementById('tcPadSizeRange').value = cfg.padSize;
    document.getElementById('tcPadSizeVal').textContent = cfg.padSize + 'px';
    document.getElementById('tcPadOpRange').value = Math.round(cfg.padOpacity * 100);
    document.getElementById('tcPadOpVal').textContent = Math.round(cfg.padOpacity * 100) + '%';
    document.getElementById('tcModeInputBtn').classList.toggle('active', cfg.padMode === 'input');
    document.getElementById('tcModeMoveBtn').classList.toggle('active', cfg.padMode === 'move');
    document.getElementById('tcShowBtnsToggle').checked = cfg.showPadButtons;
    document.getElementById('tcDblLeftBtn').classList.toggle('active', cfg.doubleTapAction === 'left');
    document.getElementById('tcDblRightBtn').classList.toggle('active', cfg.doubleTapAction === 'right');
  }

  function openModal(){
    if(!modalEl) buildModal();
    syncModalInputs();
    requestAnimationFrame(() => modalEl.classList.add('open'));
  }
  function closeModal(){ if(modalEl) modalEl.classList.remove('open'); }

  // ── Init ──────────────────────────────────────────────────────────────
  function init(){
    buildCursor();
    buildPad();
    buildSidebarSection();
    applyEnabled();
    window.addEventListener('resize', () => {
      clampCursor(); positionCursor();
      if(cfg.padMode === 'move' && cfg.padPos){ cfg.padPos = clampPadPos(cfg.padPos.left, cfg.padPos.top); applyPadStyle(); }
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
