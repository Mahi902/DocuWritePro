/* ══════════════════════════════════════════════════════════════════
   TOUCH CURSOR — add-on engine
   Adds a desktop-style virtual cursor, driven by an on-screen trackpad,
   to touch devices. Runs in the same document as the host editor (the
   Sugarcane Add-on runtime injects this after the DOM is ready), so it
   talks to the host's own openMdl/closeMdl/showToast helpers directly.
═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var STORAGE_KEY = 'tc_addon_state_v1';

  var PRESETS = [
    {id:'arrow',     icon:'near_me',              label:'Arrow'},
    {id:'hand',      icon:'front_hand',           label:'Hand'},
    {id:'point',     icon:'touch_app',            label:'Point'},
    {id:'precision', icon:'adjust',               label:'Precision'},
    {id:'dot',       icon:'radio_button_checked', label:'Dot'},
    {id:'ibeam',     icon:'text_fields',          label:'Text'},
    {id:'grab',      icon:'pan_tool',             label:'Grab'},
    {id:'target',    icon:'my_location',          label:'Target'}
  ];

  var ACTIONS = [
    {v:'none',       label:'None',        icon:'block'},
    {v:'leftClick',  label:'Left Click',  icon:'mouse'},
    {v:'rightClick', label:'Right Click', icon:'menu_open'},
    {v:'hold',       label:'Hold',        icon:'back_hand'},
    {v:'hover',      label:'Hover',       icon:'visibility'}
  ];

  var DEFAULTS = {
    enabled:false,
    cursorType:'preset',      // preset | text | image
    presetId:'arrow',
    customText:'➤',
    customImageUrl:'',
    cursorSize:32,
    sensitivity:1.5,
    padSize:110,
    padOpacity:0.85,
    padShape:'round',         // round | square
    padMode:'input',          // input | move
    padPos:null,              // {x,y} top-left px, computed on first activation
    showClickButtons:true,
    gestures:{ singleTap:'none', doubleTap:'leftClick', tripleTap:'rightClick', hold2s:'hold' }
  };

  var state = loadState();

  // ---- runtime (non-persisted) ----
  var rt = {
    cursorPos:{x:0,y:0},
    padPos:state.padPos ? {x:state.padPos.x,y:state.padPos.y} : null,
    isHolding:false,
    lastHoverEl:null,
    pointer:{ active:false, startX:0, startY:0, lastX:0, lastY:0, startTime:0, moved:false,
              tapCount:0, tapTimer:null, hold2sTimer:null, hold3sTimer:null, popoverShown:false }
  };

  // ---- DOM refs (filled in init) ----
  var els = {};

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function loadState(){
    var s;
    try{ s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }catch(e){ s = null; }
    var merged = Object.assign({}, DEFAULTS, s || {});
    merged.gestures = Object.assign({}, DEFAULTS.gestures, (s && s.gestures) || {});
    return merged;
  }
  function saveState(){
    state.padPos = rt.padPos;
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  /* ══════════════════ Sidebar section ══════════════════ */
  function insertSidebarSection(){
    var sidebar = document.getElementById('sidebar');
    var tpl = document.getElementById('tcSidebarTpl');
    if(!sidebar || !tpl || document.getElementById('tcSbSection')) return;
    var node = tpl.content.firstElementChild.cloneNode(true);
    var collapseBtn = sidebar.querySelector('.collapse-btn');
    // Placed right before Collapse — i.e. the very bottom of whatever
    // sections already exist (Collaborate included), and other add-ons
    // that follow the same pattern simply stack above this one.
    if(collapseBtn) sidebar.insertBefore(node, collapseBtn);
    else sidebar.appendChild(node);
  }

  function toggleSbDropdown(){
    var open = !els.tcDropdown.classList.contains('open');
    els.tcDropdown.classList.toggle('open', open);
    els.tcChevron.classList.toggle('open', open);
  }

  /* ══════════════════ Cursor / pad visuals ══════════════════ */
  function applyCursorStyle(){
    var icon = els.cursorIcon;
    var size = state.cursorSize;
    if(state.cursorType === 'text'){
      icon.innerHTML = '<span style="font-size:' + Math.round(size*0.8) + 'px;line-height:1">' + esc(state.customText || '➤') + '</span>';
    } else if(state.cursorType === 'image' && state.customImageUrl){
      icon.innerHTML = '<img src="' + state.customImageUrl.replace(/"/g,'&quot;') + '" alt=""/>';
    } else {
      var p = PRESETS.filter(function(p){return p.id===state.presetId;})[0] || PRESETS[0];
      icon.innerHTML = '<span class="material-symbols-outlined" style="font-size:' + size + 'px">' + p.icon + '</span>';
    }
  }
  function applyCursorSize(){
    els.cursor.style.width = state.cursorSize + 'px';
    els.cursor.style.height = state.cursorSize + 'px';
    applyCursorStyle();
  }
  function applyPadVisuals(){
    els.pad.style.width = state.padSize + 'px';
    els.pad.style.height = state.padSize + 'px';
    els.pad.style.opacity = state.padOpacity;
    els.pad.classList.toggle('tc-square', state.padShape === 'square');
    els.pad.classList.toggle('tc-move-mode', state.padMode === 'move');
    els.modeBtn.querySelector('.material-symbols-outlined').textContent =
      state.padMode === 'move' ? 'open_with' : 'touch_app';
    positionClickButtons();
  }
  function defaultPadPos(){
    return { x: window.innerWidth - state.padSize - 22, y: window.innerHeight - state.padSize - 110 };
  }
  function applyPadPosition(){
    if(!rt.padPos) rt.padPos = defaultPadPos();
    rt.padPos.x = clamp(rt.padPos.x, 0, Math.max(0, window.innerWidth - state.padSize));
    rt.padPos.y = clamp(rt.padPos.y, 0, Math.max(0, window.innerHeight - state.padSize));
    els.pad.style.left = rt.padPos.x + 'px';
    els.pad.style.top = rt.padPos.y + 'px';
    positionClickButtons();
  }
  function positionClickButtons(){
    if(!state.showClickButtons || !rt.padPos) return;
    var x = clamp(rt.padPos.x + state.padSize/2 - 52, 4, window.innerWidth - 104);
    var y = clamp(rt.padPos.y + state.padSize + 8, 4, window.innerHeight - 40);
    els.clickBtns.style.left = x + 'px';
    els.clickBtns.style.top = y + 'px';
  }
  function moveCursorAbs(x,y){
    rt.cursorPos.x = clamp(x, 0, window.innerWidth);
    rt.cursorPos.y = clamp(y, 0, window.innerHeight);
    els.cursor.style.left = rt.cursorPos.x + 'px';
    els.cursor.style.top = rt.cursorPos.y + 'px';
  }
  function moveCursorBy(dx,dy){ moveCursorAbs(rt.cursorPos.x + dx, rt.cursorPos.y + dy); }

  function recenter(){
    moveCursorAbs(window.innerWidth/2, window.innerHeight/2);
    rt.padPos = defaultPadPos();
    applyPadPosition();
    hideQuickPopover();
    updateScrollArrows();
  }

  /* ══════════════════ Enable / disable ══════════════════ */
  function setEnabled(v){
    state.enabled = v;
    saveState();
    if(v) activate(); else deactivate();
  }
  function activate(){
    if(!rt.padPos) rt.padPos = defaultPadPos();
    if(!rt.cursorPos.x && !rt.cursorPos.y) moveCursorAbs(window.innerWidth/2, window.innerHeight/2);
    els.pad.classList.add('tc-visible');
    els.cursor.classList.add('tc-active');
    if(state.showClickButtons) els.clickBtns.classList.add('tc-visible');
    applyCursorSize();
    applyPadVisuals();
    applyPadPosition();
    moveCursorAbs(rt.cursorPos.x, rt.cursorPos.y);
    window.addEventListener('resize', onResize);
  }
  function deactivate(){
    els.pad.classList.remove('tc-visible');
    els.cursor.classList.remove('tc-active');
    els.clickBtns.classList.remove('tc-visible');
    hideQuickPopover();
    hideArrows();
    window.removeEventListener('resize', onResize);
  }
  function onResize(){
    if(rt.padPos) applyPadPosition();
    moveCursorAbs(rt.cursorPos.x, rt.cursorPos.y);
  }

  /* ══════════════════ Element lookup that ignores our own overlay ══════════════════ */
  function elementAtCursor(){
    var list;
    try{ list = document.elementsFromPoint(rt.cursorPos.x, rt.cursorPos.y); }
    catch(e){ var single = document.elementFromPoint(rt.cursorPos.x, rt.cursorPos.y); list = single ? [single] : []; }
    for(var i=0;i<list.length;i++){
      var el = list[i];
      if(!el.closest('#tcPad,#tcCursor,#tcClickBtns,.tc-arrow,#tcQuickPopover')) return el;
    }
    return null;
  }

  /* ══════════════════ Synthetic input dispatch ══════════════════ */
  function dispatchAt(el, type, x, y, button){
    if(!el) return;
    var opts = { bubbles:true, cancelable:true, view:window, clientX:x, clientY:y,
                 button: button||0, buttons: button===2?2:1 };
    var Evt = (type.indexOf('pointer')===0 && window.PointerEvent) ? PointerEvent : MouseEvent;
    try{ el.dispatchEvent(new Evt(type, opts)); }
    catch(e){ try{ el.dispatchEvent(new MouseEvent(type, opts)); }catch(e2){} }
  }

  function placeCaretIfEditable(el, x, y){
    if(!el) return;
    if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'){ el.focus(); return; }
    var editable = el.closest('[contenteditable="true"]');
    if(!editable) return;
    var range = null;
    if(document.caretRangeFromPoint){
      range = document.caretRangeFromPoint(x,y);
    } else if(document.caretPositionFromPoint){
      var pos = document.caretPositionFromPoint(x,y);
      if(pos){ range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
    }
    editable.focus();
    if(range){ var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  }

  function performClick(kind){
    var x = rt.cursorPos.x, y = rt.cursorPos.y;
    var el = elementAtCursor();
    if(!el) return;
    placeCaretIfEditable(el, x, y);
    if(kind === 'left'){
      dispatchAt(el,'pointerdown',x,y,0); dispatchAt(el,'mousedown',x,y,0);
      dispatchAt(el,'pointerup',x,y,0);   dispatchAt(el,'mouseup',x,y,0);
      dispatchAt(el,'click',x,y,0);
    } else {
      dispatchAt(el,'pointerdown',x,y,2); dispatchAt(el,'mousedown',x,y,2);
      dispatchAt(el,'contextmenu',x,y,2);
      dispatchAt(el,'pointerup',x,y,2);   dispatchAt(el,'mouseup',x,y,2);
    }
    els.cursor.classList.add('tc-clicking');
    setTimeout(function(){ els.cursor.classList.remove('tc-clicking'); }, 130);
  }

  function toggleHold(){
    rt.isHolding = !rt.isHolding;
    els.pad.classList.toggle('tc-holding', rt.isHolding);
    els.cursor.classList.toggle('tc-held', rt.isHolding);
    var x = rt.cursorPos.x, y = rt.cursorPos.y;
    var el = elementAtCursor();
    if(!el) return;
    if(rt.isHolding){ dispatchAt(el,'pointerdown',x,y,0); dispatchAt(el,'mousedown',x,y,0); }
    else { dispatchAt(el,'pointerup',x,y,0); dispatchAt(el,'mouseup',x,y,0); dispatchAt(el,'click',x,y,0); }
  }

  function dispatchHover(){
    var x = rt.cursorPos.x, y = rt.cursorPos.y;
    var el = elementAtCursor();
    if(!el) return;
    if(el !== rt.lastHoverEl){
      if(rt.lastHoverEl){ dispatchAt(rt.lastHoverEl,'mouseout',x,y); dispatchAt(rt.lastHoverEl,'mouseleave',x,y); }
      dispatchAt(el,'mouseover',x,y); dispatchAt(el,'mouseenter',x,y);
      rt.lastHoverEl = el;
    }
    dispatchAt(el,'mousemove',x,y);
    dispatchAt(el,'pointermove',x,y);
    if(rt.isHolding) dispatchAt(el,'mousedown',x,y,0); // keeps drag-selection extending while held
  }

  /* ══════════════════ Scrollable-area affordance arrows ══════════════════ */
  var arrowRaf = null;
  function updateScrollArrows(){
    if(arrowRaf) return;
    arrowRaf = requestAnimationFrame(function(){
      arrowRaf = null;
      var x = rt.cursorPos.x, y = rt.cursorPos.y;
      var el = elementAtCursor();
      var h = null, v = null, node = el;
      for(var i=0; node && i<6; i++, node = node.parentElement){
        if(node.nodeType !== 1) continue;
        var cs = getComputedStyle(node);
        if(!h && node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(cs.overflowX)) h = node;
        if(!v && node.scrollHeight > node.clientHeight + 2 && /auto|scroll/.test(cs.overflowY)) v = node;
        if(h && v) break;
      }
      var half = state.cursorSize/2;
      var showL = !!(h && h.scrollLeft > 2);
      var showR = !!(h && h.scrollLeft + h.clientWidth < h.scrollWidth - 2);
      var showU = !!(v && v.scrollTop > 2);
      var showD = !!(v && v.scrollTop + v.clientHeight < v.scrollHeight - 2);
      els.arrowLeft.classList.toggle('tc-show', showL);
      els.arrowRight.classList.toggle('tc-show', showR);
      els.arrowUp.classList.toggle('tc-show', showU);
      els.arrowDown.classList.toggle('tc-show', showD);
      if(showL || showR){
        els.arrowLeft.style.left = (x - half - 26) + 'px'; els.arrowLeft.style.top = (y - 11) + 'px';
        els.arrowRight.style.left = (x + half + 4) + 'px'; els.arrowRight.style.top = (y - 11) + 'px';
      }
      if(showU || showD){
        els.arrowUp.style.left = (x - 11) + 'px';   els.arrowUp.style.top = (y - half - 26) + 'px';
        els.arrowDown.style.left = (x - 11) + 'px'; els.arrowDown.style.top = (y + half + 4) + 'px';
      }
    });
  }
  function hideArrows(){
    [els.arrowLeft, els.arrowRight, els.arrowUp, els.arrowDown].forEach(function(a){ a.classList.remove('tc-show'); });
  }

  /* ══════════════════ Gestures ══════════════════ */
  function performAction(action){
    if(!action || action === 'none') return;
    if(action === 'leftClick') performClick('left');
    else if(action === 'rightClick') performClick('right');
    else if(action === 'hold') toggleHold();
    else if(action === 'hover') dispatchHover();
  }
  function resolveTapCount(){
    var n = rt.pointer.tapCount; rt.pointer.tapCount = 0;
    if(n === 1) performAction(state.gestures.singleTap);
    else if(n === 2) performAction(state.gestures.doubleTap);
    else if(n >= 3) performAction(state.gestures.tripleTap);
  }

  /* ══════════════════ Quick shortcut popover (3s hold) ══════════════════ */
  function showQuickPopover(){
    if(!rt.padPos) return;
    var pop = els.quickPopover;
    pop.querySelectorAll('button').forEach(function(b){
      b.classList.toggle('active', b.dataset.qp === state.gestures.doubleTap);
    });
    var x = clamp(rt.padPos.x + state.padSize/2 - 90, 4, window.innerWidth - 184);
    var y = Math.max(4, rt.padPos.y - 96);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    pop.classList.add('tc-show');
    if(navigator.vibrate) try{ navigator.vibrate(15); }catch(e){}
  }
  function hideQuickPopover(){ els.quickPopover.classList.remove('tc-show'); }

  /* ══════════════════ Pad pointer handling ══════════════════ */
  function onPadPointerDown(e){
    e.preventDefault();
    try{ els.pad.setPointerCapture(e.pointerId); }catch(err){}
    var p = rt.pointer;
    p.active = true; p.moved = false;
    p.startX = p.lastX = e.clientX; p.startY = p.lastY = e.clientY;
    p.startTime = Date.now();
    p.popoverShown = false;
    clearTimeout(p.hold2sTimer); clearTimeout(p.hold3sTimer);
    p.hold2sTimer = setTimeout(function(){
      if(p.active && !p.moved) performAction(state.gestures.hold2s);
    }, 2000);
    p.hold3sTimer = setTimeout(function(){
      if(p.active && !p.moved){ showQuickPopover(); p.popoverShown = true; }
    }, 3000);
  }
  function onPadPointerMove(e){
    var p = rt.pointer;
    if(!p.active) return;
    var dx = e.clientX - p.lastX, dy = e.clientY - p.lastY;
    var totalDist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if(totalDist > 8 && !p.moved){
      p.moved = true;
      clearTimeout(p.hold2sTimer); clearTimeout(p.hold3sTimer);
      if(p.popoverShown){ hideQuickPopover(); p.popoverShown = false; }
    }
    if(state.padMode === 'move'){
      rt.padPos.x += dx; rt.padPos.y += dy;
      applyPadPosition();
    } else {
      moveCursorBy(dx * state.sensitivity, dy * state.sensitivity);
      dispatchHover();
      updateScrollArrows();
    }
    p.lastX = e.clientX; p.lastY = e.clientY;
  }
  function onPadPointerUp(e){
    var p = rt.pointer;
    if(!p.active) return;
    p.active = false;
    clearTimeout(p.hold2sTimer); clearTimeout(p.hold3sTimer);
    try{ els.pad.releasePointerCapture(e.pointerId); }catch(err){}
    if(state.padMode === 'move') saveState();
    if(p.popoverShown) return; // the hold already resolved into showing the popover
    var duration = Date.now() - p.startTime;
    if(p.moved || duration >= 2000) return; // movement or a long hold isn't a tap
    p.tapCount++;
    clearTimeout(p.tapTimer);
    p.tapTimer = setTimeout(resolveTapCount, 300);
  }

  function onModeBtnClick(e){
    e.stopPropagation();
    state.padMode = state.padMode === 'move' ? 'input' : 'move';
    saveState();
    applyPadVisuals();
    syncModalFromState();
  }

  /* ══════════════════ Click buttons ══════════════════ */
  function wireClickButtons(){
    els.leftBtn.addEventListener('click', function(){ performClick('left'); });
    els.rightBtn.addEventListener('click', function(){ performClick('right'); });
  }

  /* ══════════════════ Quick popover buttons ══════════════════ */
  function wireQuickPopover(){
    els.quickPopover.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('click', function(){
        state.gestures.doubleTap = btn.dataset.qp;
        saveState();
        renderGestureChips();
        hideQuickPopover();
        showToastSafe('Double-tap set to ' + (btn.dataset.qp === 'leftClick' ? 'Left Click' : 'Right Click'), 'success');
      });
    });
    document.addEventListener('pointerdown', function(e){
      if(!els.quickPopover.classList.contains('tc-show')) return;
      if(!e.target.closest('#tcQuickPopover,#tcPad')) hideQuickPopover();
    });
  }

  function showToastSafe(msg, type){
    if(typeof window.showToast === 'function') window.showToast(msg, type);
  }

  /* ══════════════════ Modal wiring ══════════════════ */
  function buildPresetGrid(){
    els.presetGrid.innerHTML = '';
    PRESETS.forEach(function(p){
      var opt = document.createElement('div');
      opt.className = 'tc-cursor-opt' + (state.presetId === p.id ? ' active' : '');
      opt.title = p.label;
      opt.innerHTML = '<span class="material-symbols-outlined">' + p.icon + '</span>';
      opt.addEventListener('click', function(){
        state.presetId = p.id;
        state.cursorType = 'preset';
        saveState();
        syncModalFromState();
        applyCursorStyle();
      });
      els.presetGrid.appendChild(opt);
    });
  }

  function showTypePanel(type){
    els.presetPanel.style.display = type === 'preset' ? '' : 'none';
    els.textPanel.style.display = type === 'text' ? '' : 'none';
    els.imagePanel.style.display = type === 'image' ? '' : 'none';
  }

  function updateImgPreview(){
    if(state.customImageUrl){
      els.imgPreviewBox.innerHTML = '<img src="' + state.customImageUrl.replace(/"/g,'&quot;') + '" alt=""/>';
    } else {
      els.imgPreviewBox.innerHTML = '<span class="material-symbols-outlined" style="color:#bbb">image</span>';
    }
  }

  function renderGestureChips(){
    document.querySelectorAll('.tc-gesture-row').forEach(function(row){
      var g = row.dataset.gesture;
      var wrap = row.querySelector('.tc-gesture-chips');
      wrap.innerHTML = '';
      ACTIONS.forEach(function(a){
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'scale-chip' + (state.gestures[g] === a.v ? ' active' : '');
        chip.textContent = a.label;
        chip.addEventListener('click', function(){
          state.gestures[g] = a.v;
          saveState();
          renderGestureChips();
        });
        wrap.appendChild(chip);
      });
    });
  }

  function syncModalFromState(){
    document.querySelectorAll('#tcTypeRow .vw-mode-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.type === state.cursorType);
    });
    showTypePanel(state.cursorType);
    document.querySelectorAll('#tcPresetGrid .tc-cursor-opt').forEach(function(opt, i){
      opt.classList.toggle('active', PRESETS[i] && PRESETS[i].id === state.presetId);
    });
    els.textInput.value = state.customText || '';
    els.imgUrlInput.value = (state.customImageUrl && state.customImageUrl.indexOf('data:') !== 0) ? state.customImageUrl : '';
    updateImgPreview();

    els.sizeSlider.value = state.cursorSize; els.sizeVal.textContent = state.cursorSize + 'px';
    els.sensSlider.value = state.sensitivity; els.sensVal.textContent = state.sensitivity + 'x';
    els.padSizeSlider.value = state.padSize; els.padSizeVal.textContent = state.padSize + 'px';
    els.padOpSlider.value = Math.round(state.padOpacity*100); els.padOpVal.textContent = Math.round(state.padOpacity*100) + '%';

    document.querySelectorAll('#tcShapeRow .vw-mode-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.shape === state.padShape);
    });
    document.querySelectorAll('#tcModeRow .vw-mode-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.mode === state.padMode);
    });
    els.showBtnsToggle.checked = state.showClickButtons;
    renderGestureChips();
  }

  function downscaleImage(file, cb){
    var reader = new FileReader();
    reader.onload = function(){
      var img = new Image();
      img.onload = function(){
        var max = 128;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/png'));
      };
      img.onerror = function(){ cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function(){ cb(null); };
    reader.readAsDataURL(file);
  }

  function wireModal(){
    document.querySelectorAll('#tcTypeRow .vw-mode-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        state.cursorType = btn.dataset.type;
        saveState();
        syncModalFromState();
        applyCursorStyle();
      });
    });

    els.textInput.addEventListener('input', function(){
      state.customText = this.value;
      saveState();
      if(state.cursorType === 'text') applyCursorStyle();
    });

    els.imgUpload.addEventListener('change', function(){
      var file = this.files && this.files[0];
      if(!file) return;
      downscaleImage(file, function(dataUrl){
        if(!dataUrl){ showToastSafe('Could not read that image', 'error'); return; }
        state.customImageUrl = dataUrl;
        state.cursorType = 'image';
        saveState();
        syncModalFromState();
        applyCursorStyle();
      });
    });
    els.imgUrlInput.addEventListener('change', function(){
      var val = this.value.trim();
      if(!val) return;
      state.customImageUrl = val;
      state.cursorType = 'image';
      saveState();
      syncModalFromState();
      applyCursorStyle();
    });

    els.sizeSlider.addEventListener('input', function(){
      state.cursorSize = parseInt(this.value, 10);
      els.sizeVal.textContent = state.cursorSize + 'px';
      applyCursorSize();
      saveState();
    });
    els.sensSlider.addEventListener('input', function(){
      state.sensitivity = parseFloat(this.value);
      els.sensVal.textContent = state.sensitivity + 'x';
      saveState();
    });
    els.padSizeSlider.addEventListener('input', function(){
      state.padSize = parseInt(this.value, 10);
      els.padSizeVal.textContent = state.padSize + 'px';
      applyPadVisuals();
      applyPadPosition();
      saveState();
    });
    els.padOpSlider.addEventListener('input', function(){
      state.padOpacity = parseInt(this.value, 10) / 100;
      els.padOpVal.textContent = Math.round(state.padOpacity*100) + '%';
      applyPadVisuals();
      saveState();
    });

    document.querySelectorAll('#tcShapeRow .vw-mode-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        state.padShape = btn.dataset.shape;
        saveState();
        syncModalFromState();
        applyPadVisuals();
      });
    });
    document.querySelectorAll('#tcModeRow .vw-mode-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        state.padMode = btn.dataset.mode;
        saveState();
        syncModalFromState();
        applyPadVisuals();
      });
    });

    els.showBtnsToggle.addEventListener('change', function(){
      state.showClickButtons = this.checked;
      els.clickBtns.classList.toggle('tc-visible', state.showClickButtons && state.enabled);
      positionClickButtons();
      saveState();
    });

    els.recenterBtn.addEventListener('click', recenter);

    els.resetBtn.addEventListener('click', function(){
      var enabled = state.enabled;
      state = JSON.parse(JSON.stringify(DEFAULTS));
      state.enabled = enabled;
      rt.padPos = null;
      saveState();
      syncModalFromState();
      applyCursorSize();
      applyPadVisuals();
      applyPadPosition();
      showToastSafe('Touch Cursor reset to defaults', 'info');
    });
  }

  /* ══════════════════ Init ══════════════════ */
  function cacheEls(){
    els.tcDropdown = document.getElementById('tcDropdown');
    els.tcChevron = document.getElementById('tcChevron');
    els.tcHeader = document.getElementById('tcHeader');
    els.enableToggle = document.getElementById('tcEnableToggle');
    els.modsBtn = document.getElementById('tcModsBtn');

    els.cursor = document.getElementById('tcCursor');
    els.cursorIcon = document.getElementById('tcCursorIcon');
    els.pad = document.getElementById('tcPad');
    els.modeBtn = document.getElementById('tcModeBtn');
    els.clickBtns = document.getElementById('tcClickBtns');
    els.leftBtn = document.getElementById('tcLeftBtn');
    els.rightBtn = document.getElementById('tcRightBtn');
    els.arrowLeft = document.getElementById('tcArrowLeft');
    els.arrowRight = document.getElementById('tcArrowRight');
    els.arrowUp = document.getElementById('tcArrowUp');
    els.arrowDown = document.getElementById('tcArrowDown');
    els.quickPopover = document.getElementById('tcQuickPopover');

    els.presetGrid = document.getElementById('tcPresetGrid');
    els.presetPanel = document.getElementById('tcPresetPanel');
    els.textPanel = document.getElementById('tcTextPanel');
    els.imagePanel = document.getElementById('tcImagePanel');
    els.textInput = document.getElementById('tcTextInput');
    els.imgUpload = document.getElementById('tcImgUpload');
    els.imgUrlInput = document.getElementById('tcImgUrlInput');
    els.imgPreviewBox = document.getElementById('tcImgPreviewBox');
    els.sizeSlider = document.getElementById('tcSizeSlider');
    els.sizeVal = document.getElementById('tcSizeVal');
    els.sensSlider = document.getElementById('tcSensSlider');
    els.sensVal = document.getElementById('tcSensVal');
    els.padSizeSlider = document.getElementById('tcPadSizeSlider');
    els.padSizeVal = document.getElementById('tcPadSizeVal');
    els.padOpSlider = document.getElementById('tcPadOpSlider');
    els.padOpVal = document.getElementById('tcPadOpVal');
    els.showBtnsToggle = document.getElementById('tcShowBtnsToggle');
    els.recenterBtn = document.getElementById('tcRecenterBtn');
    els.resetBtn = document.getElementById('tcResetBtn');
  }

  function init(){
    insertSidebarSection();
    cacheEls();
    if(!els.pad || !els.cursor) return; // markup didn't load — bail quietly

    els.enableToggle.checked = state.enabled;
    els.tcHeader.addEventListener('click', toggleSbDropdown);
    els.enableToggle.addEventListener('change', function(){ setEnabled(this.checked); });
    els.modsBtn.addEventListener('click', function(){
      syncModalFromState();
      if(typeof window.openMdl === 'function') window.openMdl('touchCursorMdl');
    });

    buildPresetGrid();
    wireModal();
    wireClickButtons();
    wireQuickPopover();

    els.pad.addEventListener('pointerdown', onPadPointerDown);
    els.pad.addEventListener('pointermove', onPadPointerMove);
    els.pad.addEventListener('pointerup', onPadPointerUp);
    els.pad.addEventListener('pointercancel', onPadPointerUp);
    els.modeBtn.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    els.modeBtn.addEventListener('click', onModeBtnClick);

    if(state.enabled) activate();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
