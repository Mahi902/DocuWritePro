/* ══════════════════════════════════════════════════════════════════
   TIMELAPSE — add-on engine
   Records periodic html2canvas snapshots of either the full editor
   (document.body — everything currently on screen, including this
   add-on's own UI) or just the current page (via the host's own
   getCurrentPageEl()/getCurrentPageNum(), already global functions),
   then encodes the captured frames into a WebM video on export using
   MediaRecorder + canvas.captureStream() — no screen-share permission
   prompt needed, since it's compositing our own captured images, not
   recording the live screen. Falls back to a downloadable image
   sequence if MediaRecorder isn't available.
═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var STORAGE_KEY = 'tl_addon_state_v1';
  var MAX_FRAMES = 1200;      // sanity cap so a forgotten recording can't run away with memory
  var BASE_FPS = 6;           // export playback fps at 1x speed

  var WIDTH_OPTIONS = [800, 1280, 1600, 1920];
  var SPEED_OPTIONS = [0.5, 1, 2, 4, 8, 16];

  var DEFAULTS = {
    mode:'full',           // full | page
    captureInterval:2,     // seconds between frames while recording
    maxWidth:1280,         // captured frame is downscaled to at most this width
    quality:75,            // JPEG quality 0-100 for stored frames
    showBadge:true,
    exportSpeed:4
  };

  var state = loadState();

  var rt = {
    recording:false,
    paused:false,
    frames:[],
    pageTarget:null,
    timer:null,
    uiTicker:null,
    startedAt:0,
    elapsedBeforePause:0,
    exporting:false
  };

  var els = {};

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function pad2(n){ return (n<10?'0':'')+n; }
  function formatTime(ms){
    var s = Math.floor(ms/1000), m = Math.floor(s/60);
    return pad2(m) + ':' + pad2(s%60);
  }

  function loadState(){
    var s;
    try{ s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }catch(e){ s = null; }
    return Object.assign({}, DEFAULTS, s || {});
  }
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }
  function toastSafe(msg, type){
    if(typeof window.showToast === 'function') window.showToast(msg, type);
  }

  /* ══════════════════ Sidebar section ══════════════════ */
  function insertSidebarSection(){
    var sidebar = document.getElementById('sidebar');
    var tpl = document.getElementById('tlSidebarTpl');
    if(!sidebar || !tpl || document.getElementById('tlSbSection')) return;
    var node = tpl.content.firstElementChild.cloneNode(true);
    var collapseBtn = sidebar.querySelector('.collapse-btn');
    if(collapseBtn) sidebar.insertBefore(node, collapseBtn);
    else sidebar.appendChild(node);
  }
  function toggleSbDropdown(){
    var open = !els.tlDropdown.classList.contains('open');
    els.tlDropdown.classList.toggle('open', open);
    els.tlChevron.classList.toggle('open', open);
    if(open) updateTargetHint();
  }

  /* ══════════════════ Target resolution ══════════════════ */
  function resolveTarget(){
    if(state.mode === 'full') return document.body;
    if(typeof window.getCurrentPageEl === 'function'){
      var p = window.getCurrentPageEl();
      if(p) return p;
    }
    return document.querySelector('#editorArea .page');
  }
  function updateTargetHint(){
    if(state.mode === 'full'){
      els.targetHint.textContent = 'Recording the full editor — everything shown.';
      return;
    }
    var el = resolveTarget();
    var num = (typeof window.getCurrentPageNum === 'function') ? window.getCurrentPageNum() : null;
    els.targetHint.textContent = el ? ('Recording Page ' + (num || '') + ' only.') : 'No page found to record.';
  }

  /* ══════════════════ Recording ══════════════════ */
  function computeScale(el, maxWidth){
    var w = (el === document.body) ? window.innerWidth : (el.getBoundingClientRect().width || el.scrollWidth || window.innerWidth);
    return Math.max(0.1, Math.min(1, maxWidth / w));
  }

  function captureFrame(){
    if(state.mode === 'page' && rt.pageTarget && !document.body.contains(rt.pageTarget)){
      toastSafe('The page being recorded was removed — timelapse stopped', 'error');
      stopRecording();
      return;
    }
    var el = state.mode === 'page' ? (rt.pageTarget || resolveTarget()) : document.body;
    if(!el || typeof window.html2canvas !== 'function') return;
    var scale = computeScale(el, state.maxWidth);
    var opts = { scale:scale, useCORS:true, allowTaint:true, backgroundColor:'#ffffff', logging:false };
    if(el === document.body){
      opts.width = window.innerWidth;
      opts.height = window.innerHeight;
      opts.windowWidth = window.innerWidth;
      opts.windowHeight = window.innerHeight;
      opts.x = window.scrollX;
      opts.y = window.scrollY;
    }
    window.html2canvas(el, opts).then(function(canvas){
      if(!rt.recording) return; // stopped while the capture was in flight
      var url = canvas.toDataURL('image/jpeg', state.quality/100);
      rt.frames.push({ dataUrl:url, w:canvas.width, h:canvas.height });
      updateLiveDisplay();
      if(rt.frames.length >= MAX_FRAMES){
        toastSafe('Timelapse reached the ' + MAX_FRAMES + '-frame limit — recording stopped', 'info');
        stopRecording();
      }
    }).catch(function(err){
      console.error('Timelapse capture failed', err);
    });
  }

  function startRecording(){
    if(rt.recording) return;
    if(typeof window.html2canvas !== 'function'){
      toastSafe('Timelapse needs html2canvas, which isn\u2019t available right now', 'error');
      return;
    }
    var el = resolveTarget();
    if(!el){ toastSafe('Nothing to record — no target found', 'error'); return; }
    rt.recording = true; rt.paused = false;
    rt.frames = [];
    rt.pageTarget = state.mode === 'page' ? el : null;
    rt.startedAt = Date.now();
    rt.elapsedBeforePause = 0;

    els.modeRow.classList.add('tl-disabled');
    els.recordBtn.classList.add('tl-active');
    els.recordIcon.textContent = 'stop';
    els.recordLabel.textContent = 'Stop Recording';
    els.liveRow.style.display = '';
    els.resultBlock.style.display = 'none';
    els.pauseBtn.textContent = 'Pause';

    if(state.showBadge) els.badge.classList.add('tl-show');

    captureFrame();
    rt.timer = setInterval(captureFrame, state.captureInterval * 1000);
    rt.uiTicker = setInterval(updateLiveDisplay, 500);
  }

  function pauseRecording(){
    if(!rt.recording || rt.paused) return;
    rt.paused = true;
    clearInterval(rt.timer);
    rt.elapsedBeforePause += Date.now() - rt.startedAt;
    els.pauseBtn.textContent = 'Resume';
  }
  function resumeRecording(){
    if(!rt.recording || !rt.paused) return;
    rt.paused = false;
    rt.startedAt = Date.now();
    rt.timer = setInterval(captureFrame, state.captureInterval * 1000);
    els.pauseBtn.textContent = 'Pause';
  }
  function togglePause(){ rt.paused ? resumeRecording() : pauseRecording(); }

  function stopRecording(){
    if(!rt.recording) return;
    rt.recording = false;
    if(!rt.paused) rt.elapsedBeforePause += Date.now() - rt.startedAt;
    clearInterval(rt.timer); clearInterval(rt.uiTicker);
    rt.timer = null; rt.uiTicker = null;

    els.modeRow.classList.remove('tl-disabled');
    els.recordBtn.classList.remove('tl-active');
    els.recordIcon.textContent = 'fiber_manual_record';
    els.recordLabel.textContent = 'Start Recording';
    els.liveRow.style.display = 'none';
    els.badge.classList.remove('tl-show');

    if(rt.frames.length){
      els.resultSummary.textContent = rt.frames.length + ' frame' + (rt.frames.length===1?'':'s') +
        ' \u00b7 ' + formatTime(rt.elapsedBeforePause) + ' recorded';
      els.resultBlock.style.display = '';
    }
  }

  function discardRecording(){
    rt.frames = [];
    els.resultBlock.style.display = 'none';
    toastSafe('Timelapse discarded', 'info');
  }

  function updateLiveDisplay(){
    if(!rt.recording) return;
    var elapsed = rt.elapsedBeforePause + (rt.paused ? 0 : (Date.now() - rt.startedAt));
    els.timer.textContent = formatTime(elapsed);
    els.frameCount.textContent = rt.frames.length + ' frame' + (rt.frames.length===1?'':'s') + ' captured';
    if(state.showBadge) els.badgeTime.textContent = formatTime(elapsed);
  }

  /* ══════════════════ Export ══════════════════ */
  function pickMime(){
    if(typeof window.MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
    var candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for(var i=0;i<candidates.length;i++){
      if(MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return null;
  }
  function downloadBlob(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }
  function showExportOverlay(){ rt.exporting = true; els.exportOverlay.classList.add('tl-show'); updateExportProgress(0); }
  function hideExportOverlay(){ rt.exporting = false; els.exportOverlay.classList.remove('tl-show'); }
  function updateExportProgress(frac){
    var pct = Math.round(clamp(frac,0,1) * 100);
    els.exportBarFill.style.width = pct + '%';
    els.exportPct.textContent = pct + '%';
  }

  function exportAsImageSequence(){
    toastSafe('Video export isn\u2019t supported in this browser — downloading frames as images instead', 'info');
    rt.frames.forEach(function(f, idx){
      setTimeout(function(){
        var a = document.createElement('a');
        a.href = f.dataUrl;
        a.download = 'timelapse-frame-' + String(idx+1).padStart(4,'0') + '.jpg';
        document.body.appendChild(a); a.click(); a.remove();
      }, idx * 120);
    });
  }

  function exportVideo(){
    if(rt.exporting) return;
    if(!rt.frames.length){ toastSafe('Nothing recorded yet', 'error'); return; }
    var mime = pickMime();
    var canCaptureStream = !!(document.createElement('canvas').captureStream);
    if(!mime || !canCaptureStream){ exportAsImageSequence(); return; }

    var w = 0, h = 0;
    rt.frames.forEach(function(f){ if(f.w>w) w=f.w; if(f.h>h) h=f.h; });
    if(!w || !h){ toastSafe('Could not export — no valid frames', 'error'); return; }

    showExportOverlay();
    els.exportStatus.textContent = 'Rendering timelapse\u2026';

    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);

    var fps = clamp(Math.round(BASE_FPS * state.exportSpeed), 2, 30);
    var frameDurMs = 1000 / fps;

    var stream, recorder;
    try{
      stream = canvas.captureStream(fps);
      recorder = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond: 6*1000*1000 });
    }catch(e){
      hideExportOverlay();
      exportAsImageSequence();
      return;
    }
    var chunks = [];
    recorder.ondataavailable = function(e){ if(e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function(){
      var blob = new Blob(chunks, { type:mime });
      var ext = mime.indexOf('mp4') > -1 ? 'mp4' : 'webm';
      downloadBlob(blob, 'timelapse-' + Date.now() + '.' + ext);
      hideExportOverlay();
      toastSafe('Timelapse exported', 'success');
    };

    var i = 0;
    recorder.start(200);
    (function drawNext(){
      if(i >= rt.frames.length){
        els.exportStatus.textContent = 'Finalizing\u2026';
        setTimeout(function(){ recorder.stop(); }, 150);
        return;
      }
      var img = new Image();
      img.onload = function(){
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
        ctx.drawImage(img, (w - img.width)/2, (h - img.height)/2);
        updateExportProgress(i / rt.frames.length);
        i++;
        setTimeout(drawNext, frameDurMs);
      };
      img.onerror = function(){ i++; setTimeout(drawNext, frameDurMs); };
      img.src = rt.frames[i].dataUrl;
    })();
  }

  /* ══════════════════ Modal wiring ══════════════════ */
  function buildChipRow(container, options, unit, currentVal, onPick){
    container.innerHTML = '';
    options.forEach(function(v){
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'scale-chip' + (v === currentVal ? ' active' : '');
      chip.textContent = (unit === 'x') ? (v + '\u00d7') : (v + unit);
      chip.addEventListener('click', function(){ onPick(v); });
      container.appendChild(chip);
    });
  }
  function renderWidthChips(){
    buildChipRow(els.widthChips, WIDTH_OPTIONS, 'px', state.maxWidth, function(v){
      state.maxWidth = v; saveState(); renderWidthChips();
    });
  }
  function renderSpeedChips(){
    buildChipRow(els.speedChips, SPEED_OPTIONS, 'x', state.exportSpeed, function(v){
      state.exportSpeed = v; saveState(); renderSpeedChips();
    });
  }

  function syncModalFromState(){
    els.intervalSlider.value = state.captureInterval;
    els.intervalVal.textContent = state.captureInterval.toFixed(1) + 's';
    els.qualitySlider.value = state.quality;
    els.qualityVal.textContent = state.quality + '%';
    els.badgeToggle.checked = state.showBadge;
    renderWidthChips();
    renderSpeedChips();
  }

  function wireModal(){
    els.intervalSlider.addEventListener('input', function(){
      state.captureInterval = parseFloat(this.value);
      els.intervalVal.textContent = state.captureInterval.toFixed(1) + 's';
      saveState();
      if(rt.recording && !rt.paused){
        clearInterval(rt.timer);
        rt.timer = setInterval(captureFrame, state.captureInterval * 1000);
      }
    });
    els.qualitySlider.addEventListener('input', function(){
      state.quality = parseInt(this.value, 10);
      els.qualityVal.textContent = state.quality + '%';
      saveState();
    });
    els.badgeToggle.addEventListener('change', function(){
      state.showBadge = this.checked;
      saveState();
      if(!state.showBadge) els.badge.classList.remove('tl-show');
      else if(rt.recording) els.badge.classList.add('tl-show');
    });
    els.resetBtn.addEventListener('click', function(){
      var mode = state.mode;
      state = Object.assign({}, DEFAULTS);
      state.mode = mode;
      saveState();
      syncModalFromState();
      toastSafe('Timelapse settings reset to defaults', 'info');
    });
  }

  /* ══════════════════ Init ══════════════════ */
  function cacheEls(){
    els.tlHeader = document.getElementById('tlHeader');
    els.tlDropdown = document.getElementById('tlDropdown');
    els.tlChevron = document.getElementById('tlChevron');

    els.modeRow = document.getElementById('tlModeRow');
    els.targetHint = document.getElementById('tlTargetHint');

    els.recordBtn = document.getElementById('tlRecordBtn');
    els.recordIcon = document.getElementById('tlRecordIcon');
    els.recordLabel = document.getElementById('tlRecordLabel');

    els.liveRow = document.getElementById('tlLiveRow');
    els.timer = document.getElementById('tlTimer');
    els.frameCount = document.getElementById('tlFrameCount');
    els.pauseBtn = document.getElementById('tlPauseBtn');

    els.resultBlock = document.getElementById('tlResultBlock');
    els.resultSummary = document.getElementById('tlResultSummary');
    els.exportBtn = document.getElementById('tlExportBtn');
    els.discardBtn = document.getElementById('tlDiscardBtn');

    els.modsBtn = document.getElementById('tlModsBtn');

    els.badge = document.getElementById('tlBadge');
    els.badgeTime = document.getElementById('tlBadgeTime');

    els.exportOverlay = document.getElementById('tlExportOverlay');
    els.exportStatus = document.getElementById('tlExportStatus');
    els.exportBarFill = document.getElementById('tlExportBarFill');
    els.exportPct = document.getElementById('tlExportPct');

    els.intervalSlider = document.getElementById('tlIntervalSlider');
    els.intervalVal = document.getElementById('tlIntervalVal');
    els.widthChips = document.getElementById('tlWidthChips');
    els.qualitySlider = document.getElementById('tlQualitySlider');
    els.qualityVal = document.getElementById('tlQualityVal');
    els.badgeToggle = document.getElementById('tlBadgeToggle');
    els.speedChips = document.getElementById('tlSpeedChips');
    els.resetBtn = document.getElementById('tlResetBtn');
  }

  function init(){
    insertSidebarSection();
    cacheEls();
    if(!els.recordBtn) return; // markup didn't load — bail quietly

    els.tlHeader.addEventListener('click', toggleSbDropdown);

    document.querySelectorAll('#tlModeRow .vw-mode-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(rt.recording) return;
        state.mode = btn.dataset.mode;
        saveState();
        document.querySelectorAll('#tlModeRow .vw-mode-btn').forEach(function(b){
          b.classList.toggle('active', b === btn);
        });
        updateTargetHint();
      });
    });

    els.recordBtn.addEventListener('click', function(){
      rt.recording ? stopRecording() : startRecording();
    });
    els.pauseBtn.addEventListener('click', togglePause);
    els.exportBtn.addEventListener('click', exportVideo);
    els.discardBtn.addEventListener('click', discardRecording);

    els.modsBtn.addEventListener('click', function(){
      syncModalFromState();
      if(typeof window.openMdl === 'function') window.openMdl('tlSettingsMdl');
    });

    wireModal();
    updateTargetHint();

    // A page reload mid-recording loses in-memory frames — warn before
    // the user navigates away with an active or unexported recording.
    window.addEventListener('beforeunload', function(e){
      if(rt.recording || rt.frames.length){
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
