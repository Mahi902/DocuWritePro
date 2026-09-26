/* ═══════════════════════════════════════════════════════════════════════
   SOUNDBOX — Sugarcane Add-on (soundbox.js)
   Runs after soundbox.html + soundbox.css have been injected by the
   Sugarcane Add-on Runtime, with the full editor DOM already present.
═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const THEMES = [
    {name:'Sugarcane Blue', c:'25,118,210'},
    {name:'Sunset',        c:'255,111,60'},
    {name:'Forest',        c:'46,125,91'},
    {name:'Grape',         c:'124,77,255'},
    {name:'Rose',          c:'224,80,122'}
  ];

  const LS_TRACKS   = 'sb_tracks_v1';
  const LS_SETTINGS = 'sb_settings_v1';
  const LS_STATE    = 'sb_state_v1';

  const defaultSettings = { side:'left', size:40, theme:0, ambient:false, ambientEditor:false, spin:true, outputDeviceId:'' };

  let settings = loadJSON(LS_SETTINGS, defaultSettings);
  let tracks   = loadJSON(LS_TRACKS, []);
  let uiState  = loadJSON(LS_STATE, { lastTrackId:null });

  let currentIndex = -1;
  let playing = false;
  let speed = 1;
  let barDismissed = false;
  let pendingCoverFile = null;
  let uploadCoverMode = 'none';

  // ── tiny persistence helpers ──────────────────────────────────────────
  function loadJSON(key, fallback){
    try{ const v = JSON.parse(localStorage.getItem(key)); return v==null ? fallback : v; }catch(e){ return fallback; }
  }
  function saveSettings(){ try{ localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }catch(e){} }
  function saveTracks(){ try{ localStorage.setItem(LS_TRACKS, JSON.stringify(tracks)); }catch(e){} }
  function saveUiState(){ try{ localStorage.setItem(LS_STATE, JSON.stringify(uiState)); }catch(e){} }
  function uid(){ return 'sb'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
  function debounce(fn, ms){ let t; return function(){ clearTimeout(t); const a=arguments; t=setTimeout(()=>fn.apply(null,a),ms); }; }
  function fmtTime(s){ if(!isFinite(s)||s<0) s=0; s=Math.floor(s); const m=Math.floor(s/60); const r=s%60; return m+':'+(r<10?'0':'')+r; }
  function toast(msg, type){ try{ if(typeof window.showToast==='function') window.showToast(msg, type||'info'); }catch(e){} }

  // ── IndexedDB blob store (uploaded files persist across reloads) ───────
  const IDB_NAME='SoundboxDB', IDB_STORE='blobs';
  let idbPromise=null;
  function idb(){
    if(idbPromise) return idbPromise;
    idbPromise = new Promise((resolve,reject)=>{
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = ()=>{ req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
    return idbPromise;
  }
  async function idbSet(key, blob){
    const db = await idb();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(IDB_STORE,'readwrite');
      tx.objectStore(IDB_STORE).put(blob, key);
      tx.oncomplete = ()=>resolve(); tx.onerror = ()=>reject(tx.error);
    });
  }
  async function idbGet(key){
    const db = await idb();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(IDB_STORE,'readonly');
      const r = tx.objectStore(IDB_STORE).get(key);
      r.onsuccess = ()=>resolve(r.result||null); r.onerror = ()=>reject(r.error);
    });
  }
  async function idbDel(key){
    try{ const db = await idb(); const tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).delete(key); }catch(e){}
  }

  // ── DOM refs (resolved once the panel HTML exists) ─────────────────────
  const $ = id => document.getElementById(id);

  // ══════════════════════════════════════════════════════════════════════
  //  SIDEBAR DROPDOWN
  // ══════════════════════════════════════════════════════════════════════
  function buildSidebarSection(){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar) return;
    const section = document.createElement('div');
    section.className = 'sb-section';
    section.innerHTML =
      '<div class="aw-header" id="sbDdHeader">'+
        '<span class="aw-header-label aw-label-blue" style="font-weight:700">Soundbox</span>'+
        '<div class="aw-header-right"><span class="material-symbols-outlined aw-chevron" id="sbDdChevron">expand_more</span></div>'+
      '</div>'+
      '<div class="aw-dropdown" id="sbDdDropdown">'+
        '<div class="aw-inner" style="padding:4px 0 2px;">'+
          '<div class="sb-now-sub" id="sbSidebarNowSub"><span class="material-symbols-outlined">music_off</span><span>Nothing playing</span></div>'+
          '<div class="sb-dd-item" id="sbDdOpen"><span class="material-symbols-outlined">graphic_eq</span>Open Sound Box</div>'+
          '<div class="sb-dd-item" id="sbDdCustomize"><span class="material-symbols-outlined">tune</span>Customize Soundbox</div>'+
          '<div class="sb-dd-item" id="sbDdTracks"><span class="material-symbols-outlined">queue_music</span>Soundbox Tracks</div>'+
        '</div>'+
      '</div>';
    // Insert right before the collapse button, like Sugarcane's other add-on
    // sections, so Soundbox reads as a native part of the sidebar's bottom.
    const collapseBtn = sidebar.querySelector('.collapse-btn');
    if(collapseBtn) sidebar.insertBefore(section, collapseBtn);
    else sidebar.appendChild(section);

    $('sbDdHeader').addEventListener('click', toggleSidebarDropdown);
    $('sbDdOpen').addEventListener('click', ()=> togglePanel());
    $('sbDdCustomize').addEventListener('click', openCustomize);
    $('sbDdTracks').addEventListener('click', openTracks);
  }
  function toggleSidebarDropdown(){
    const open = $('sbDdDropdown').classList.toggle('open');
    $('sbDdChevron').classList.toggle('open', open);
  }
  function refreshSidebarSub(){
    const el = $('sbSidebarNowSub'); if(!el) return;
    const t = tracks[currentIndex];
    const icon = el.querySelector('.material-symbols-outlined');
    const span = el.querySelector('span:last-child');
    if(!t){ icon.textContent='music_off'; span.textContent='Nothing playing'; return; }
    icon.textContent = playing ? 'graphic_eq' : 'pause_circle';
    span.textContent = (playing?'Playing: ':'Paused: ')+t.name;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LAYOUT — panel placement, landscape/portrait, now-playing bar mount
  // ══════════════════════════════════════════════════════════════════════
  function mountChrome(){
    const editorContainer = document.getElementById('editorContainer') || document.body;
    const nowBar = $('sbNowBar');
    const collab = document.getElementById('collabBanner');
    const toolbarEl = document.querySelector('.toolbar');
    if(collab) collab.insertAdjacentElement('afterend', nowBar);
    else if(toolbarEl) toolbarEl.insertAdjacentElement('afterend', nowBar);
    else editorContainer.appendChild(nowBar);

    document.querySelectorAll('.top-bar,.toolbar,.sidebar').forEach(el=>el.classList.add('sb-amb-el'));
    const eaw = document.querySelector('.editor-area-wrapper');
    if(eaw) eaw.classList.add('sb-amb-el');

    updateLayoutMode();
    window.addEventListener('resize', debounce(updateLayoutMode,150));
    if(window.matchMedia){
      const mq = window.matchMedia('(orientation: landscape)');
      if(mq.addEventListener) mq.addEventListener('change', updateLayoutMode);
      else if(mq.addListener) mq.addListener(updateLayoutMode);
    }
  }
  function applyPanelPlacement(){
    const main = document.querySelector('.main-content');
    const sidebarEl = document.getElementById('sidebar');
    const panel = $('sbPanel');
    if(!main || !panel) return;
    panel.classList.remove('sb-side-right');
    if(settings.side === 'right'){
      main.appendChild(panel);
      panel.classList.add('sb-side-right');
    } else if(sidebarEl && sidebarEl.parentElement === main){
      main.insertBefore(panel, sidebarEl);
    } else {
      main.insertBefore(panel, main.firstChild);
    }
  }
  function isLandscape(){ return window.matchMedia ? window.matchMedia('(orientation: landscape)').matches : window.innerWidth >= window.innerHeight; }
  function updateLayoutMode(){
    const panel = $('sbPanel'); if(!panel) return;
    if(isLandscape()){ panel.classList.remove('sb-overlay'); applyPanelPlacement(); }
    else { panel.classList.add('sb-overlay'); }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANEL OPEN / CLOSE / PLAYLIST TAKEOVER
  // ══════════════════════════════════════════════════════════════════════
  function togglePanel(){ $('sbPanel').classList.contains('sb-open') ? closePanel() : openPanel(); }
  function openPanel(){
    barDismissed = false;
    $('sbPanel').classList.add('sb-open');
    $('sbNowBar').classList.remove('visible');
    updateLayoutMode();
  }
  function closePanel(){
    $('sbPanel').classList.remove('sb-open');
    $('sbPanel').classList.remove('sb-expanded');
    if(tracks[currentIndex] && !barDismissed) $('sbNowBar').classList.add('visible');
  }
  function setExpanded(on){
    $('sbPanel').classList.toggle('sb-expanded', on);
  }
  function wirePlaylistScroll(){
    const body = $('sbPanelBody');
    body.addEventListener('scroll', ()=>{
      const heroH = $('sbHero').offsetHeight;
      if(body.scrollTop > heroH - 60) setExpanded(true);
      else if(body.scrollTop < heroH - 140) setExpanded(false);
    });
    $('sbScrollCue').addEventListener('click', ()=>{ body.scrollTo({top: $('sbHero').offsetHeight, behavior:'smooth'}); });
    $('sbPlaylistBackBtn').addEventListener('click', ()=>{ body.scrollTo({top:0, behavior:'smooth'}); setExpanded(false); });
    $('sbPlaylistSearch').addEventListener('input', e=> renderPlaylist(e.target.value));
  }

  // ══════════════════════════════════════════════════════════════════════
  //  NOW-PLAYING BAR
  // ══════════════════════════════════════════════════════════════════════
  function wireNowBar(){
    $('sbNowBarPlayBtn').addEventListener('click', playPause);
    $('sbNowBarOpenBtn').addEventListener('click', openPanel);
    $('sbNowBarCloseBtn').addEventListener('click', ()=>{ barDismissed = true; $('sbNowBar').classList.remove('visible'); });
  }
  function refreshNowBar(){
    const t = tracks[currentIndex];
    const thumb = $('sbNowBarThumb');
    if(t){
      $('sbNowBarName').textContent = t.name + (t.artist ? ' — '+t.artist : '');
      thumb.src = t.thumb || '';
      thumb.style.display = t.thumb ? '' : 'none';
    }
    $('sbNowBarPlayBtn').querySelector('.material-symbols-outlined').textContent = playing ? 'pause' : 'play_arrow';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PLAYBACK ENGINE (shared <audio>/<video> + YouTube IFrame API)
  // ══════════════════════════════════════════════════════════════════════
  let audioCtx=null, analyser=null, freqData=null, srcNodeAudio=null, srcNodeVideo=null;
  let ytPlayer=null, ytReady=false, ytReadyQueue=[];

  function ensureAudioCtx(){
    if(audioCtx) return audioCtx;
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; }
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    return audioCtx;
  }
  function connectAnalyser(mediaEl, which){
    const ctx = ensureAudioCtx(); if(!ctx) return;
    try{
      if(which==='audio' && !srcNodeAudio){
        srcNodeAudio = ctx.createMediaElementSource(mediaEl);
        srcNodeAudio.connect(analyser); analyser.connect(ctx.destination);
      } else if(which==='video' && !srcNodeVideo){
        srcNodeVideo = ctx.createMediaElementSource(mediaEl);
        srcNodeVideo.connect(analyser); analyser.connect(ctx.destination);
      }
    }catch(e){ /* CORS-tainted source — visualizer falls back to simulated motion */ }
  }

  function activeEl(){
    const t = tracks[currentIndex]; if(!t) return null;
    if(t.kind==='video') return $('sbHiddenVideo');
    if(t.kind==='audio') return $('sbAudioEl');
    return null; // youtube
  }

  function loadYouTubeApi(){
    return new Promise(resolve=>{
      if(window.YT && window.YT.Player) return resolve();
      ytReadyQueue.push(resolve);
      if(window.__sbYtLoading) return;
      window.__sbYtLoading = true;
      const s = document.createElement('script'); s.src='https://www.youtube.com/iframe_api'; document.head.appendChild(s);
      window.onYouTubeIframeAPIReady = ()=>{ ytReadyQueue.forEach(r=>r()); ytReadyQueue=[]; };
    });
  }
  async function ensureYtPlayer(videoId){
    await loadYouTubeApi();
    return new Promise(resolve=>{
      if(ytPlayer){ ytPlayer.loadVideoById(videoId); ytReady=true; resolve(); return; }
      ytPlayer = new YT.Player('sbYtHolder', {
        height:'1', width:'1', videoId,
        playerVars:{ autoplay:0, controls:0, disablekb:1, playsinline:1 },
        events:{
          onReady: ()=>{ ytReady=true; resolve(); },
          onStateChange: (e)=>{
            if(e.data===YT.PlayerState.ENDED) onTrackEnded();
            if(e.data===YT.PlayerState.PLAYING){ playing=true; syncPlayingUi(); }
            if(e.data===YT.PlayerState.PAUSED){ playing=false; syncPlayingUi(); }
          }
        }
      });
    });
  }

  async function resumeAndPlay(el){
    const ctx = ensureAudioCtx();
    if(ctx && ctx.state==='suspended'){ try{ await ctx.resume(); }catch(e){} }
    try{ await applyOutputDevice(el); }catch(e){}
    try{ await el.play(); }catch(e){ toast('Playback was blocked by the browser — tap play again.','error'); }
  }

  // ── Audio output (speaker) device picker — Audio Output Devices API ────
  function outputApiSupported(){
    return !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) &&
           typeof HTMLMediaElement!=='undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }
  async function populateOutputDevices(){
    const row = $('sbOutputRow'), sel = $('sbOutputSelect');
    if(!row || !sel) return;
    if(!outputApiSupported()){ row.style.display='none'; return; }
    try{
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d=>d.kind==='audiooutput');
      if(!outputs.length){ row.style.display='none'; return; }
      row.style.display='';
      sel.innerHTML = '<option value="">System default</option>' +
        outputs.map((d,i)=>'<option value="'+d.deviceId+'">'+escapeHtml(d.label||('Speaker '+(i+1)))+'</option>').join('');
      sel.value = settings.outputDeviceId || '';
    }catch(e){ row.style.display='none'; }
  }
  async function applyOutputDevice(elArg){
    if(!outputApiSupported() || !settings.outputDeviceId) return;
    const els = elArg ? [elArg] : [$('sbAudioEl'), $('sbHiddenVideo')];
    for(const el of els){
      if(el && el.setSinkId){ try{ await el.setSinkId(settings.outputDeviceId); }catch(e){ /* device unplugged / no permission — silently keep default */ } }
    }
  }
  function wireOutputPicker(){
    if(!$('sbOutputSelect')) return;
    populateOutputDevices();
    $('sbOutputSelect').addEventListener('change', async e=>{
      settings.outputDeviceId = e.target.value; saveSettings();
      await applyOutputDevice();
    });
    if(navigator.mediaDevices && navigator.mediaDevices.addEventListener){
      navigator.mediaDevices.addEventListener('devicechange', populateOutputDevices);
    }
  }

  async function loadTrack(index, autoplay){
    if(index<0 || index>=tracks.length) return;
    currentIndex = index;
    const t = tracks[index];
    uiState.lastTrackId = t.id; saveUiState();

    $('sbEmptyHint').style.display='none';
    $('sbProgressRow').style.display='flex';
    $('sbControlsRow').style.display='flex';
    $('sbSpeedRow').style.display='flex';
    $('sbTrackName').textContent = t.name;
    $('sbTrackArtist').textContent = t.artist||'';
    $('sbMiniName').textContent = t.name;
    $('sbMiniThumb').src = t.thumb||'';
    $('sbDisc').src = t.thumb||'';

    if(t.kind==='youtube'){
      await ensureYtPlayer(t.src);
      if(autoplay){ ytPlayer.playVideo(); }
    } else {
      const el = t.kind==='video' ? $('sbHiddenVideo') : $('sbAudioEl');
      let src = t.src;
      if(t.blobKey){
        const blob = await idbGet(t.blobKey);
        if(blob) src = URL.createObjectURL(blob);
        else { toast('That file is missing from this device — re-upload it in Soundbox Tracks.','error'); src=''; }
      }
      el.src = src;
      el.playbackRate = speed;
      connectAnalyser(el, t.kind);
      if(autoplay) await resumeAndPlay(el);
    }
    playing = !!autoplay;
    syncPlayingUi();
    updateAmbientColor();
    renderPlaylist($('sbPlaylistSearch') ? $('sbPlaylistSearch').value : '');
  }

  function playPause(){
    if(currentIndex<0){ if(tracks.length) loadTrack(0, true); return; }
    const t = tracks[currentIndex];
    if(t.kind==='youtube'){
      if(!ytPlayer){ loadTrack(currentIndex, true); return; }
      playing ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    } else {
      const el = activeEl(); if(!el) return;
      if(playing) el.pause();
      else resumeAndPlay(el);
      playing = !playing;
      syncPlayingUi();
    }
  }
  function next(){ if(!tracks.length) return; loadTrack((currentIndex+1)%tracks.length, true); }
  function prev(){ if(!tracks.length) return; loadTrack((currentIndex-1+tracks.length)%tracks.length, true); }
  function seekBy(deltaSec){
    const t = tracks[currentIndex]; if(!t) return;
    if(t.kind==='youtube'){ if(ytPlayer) ytPlayer.seekTo(Math.max(0,ytPlayer.getCurrentTime()+deltaSec), true); return; }
    const el = activeEl(); if(el) el.currentTime = Math.max(0, el.currentTime+deltaSec);
  }
  function seekToFraction(f){
    const t = tracks[currentIndex]; if(!t) return;
    if(t.kind==='youtube'){ if(ytPlayer) ytPlayer.seekTo(ytPlayer.getDuration()*f, true); return; }
    const el = activeEl(); if(el && el.duration) el.currentTime = el.duration*f;
  }
  function setSpeed(v){
    speed=v;
    const t = tracks[currentIndex];
    if(t && t.kind==='youtube'){ if(ytPlayer) ytPlayer.setPlaybackRate(v); }
    else { const el=activeEl(); if(el) el.playbackRate=v; }
    document.querySelectorAll('.sb-speed-btn').forEach(b=> b.classList.toggle('active', parseFloat(b.dataset.speed)===v));
  }
  function onTrackEnded(){ next(); }
  function syncPlayingUi(){
    $('sbPlayBtn').querySelector('.material-symbols-outlined').textContent = playing ? 'pause' : 'play_arrow';
    refreshNowBar(); refreshSidebarSub();
  }

  function tickProgress(){
    const t = tracks[currentIndex];
    let cur=0, dur=0;
    if(t){
      if(t.kind==='youtube' && ytPlayer && ytReady){ cur=ytPlayer.getCurrentTime()||0; dur=ytPlayer.getDuration()||0; }
      else { const el=activeEl(); if(el){ cur=el.currentTime||0; dur=el.duration||0; } }
    }
    if(dur>0 && !$('sbSeek').matches(':active')){
      $('sbSeek').value = Math.round((cur/dur)*1000);
    }
    $('sbTimeCur').textContent = fmtTime(cur);
    $('sbTimeDur').textContent = fmtTime(dur);
    requestAnimationFrame(tickProgress);
  }

  function wireTransport(){
    $('sbPlayBtn').addEventListener('click', playPause);
    $('sbNextBtn').addEventListener('click', next);
    $('sbPrevBtn').addEventListener('click', prev);
    $('sbFwdBtn').addEventListener('click', ()=>seekBy(10));
    $('sbRewBtn').addEventListener('click', ()=>seekBy(-10));
    $('sbSeek').addEventListener('input', e=> seekToFraction(e.target.value/1000));
    document.querySelectorAll('.sb-speed-btn').forEach(b=> b.addEventListener('click', ()=> setSpeed(parseFloat(b.dataset.speed))));
    const audioEl=$('sbAudioEl'), videoEl=$('sbHiddenVideo');
    [audioEl,videoEl].forEach(el=>{
      el.addEventListener('ended', onTrackEnded);
      el.addEventListener('play', ()=>{ playing=true; syncPlayingUi(); });
      el.addEventListener('pause', ()=>{ playing=false; syncPlayingUi(); });
    });
    requestAnimationFrame(tickProgress);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  VISUALIZER — neon streaks radiating from the disc (bass-reactive),
  //  plus a slow ambient CSS halo behind it. The artwork itself stays put —
  //  it doesn't spin; it pulses gently on the beat instead.
  // ══════════════════════════════════════════════════════════════════════
  const RAYS = 16;
  let smoothed = new Array(RAYS).fill(0);
  let bassSmoothed = 0;
  let rayRotation = 0;

  function drawViz(){
    requestAnimationFrame(drawViz);
    const canvas = $('sbVizCanvas'); if(!canvas || !canvas.offsetParent) return;
    const ctx = canvas.getContext('2d');
    const w=canvas.width, h=canvas.height, cx=w/2, cy=h/2, baseR=76;
    ctx.clearRect(0,0,w,h);

    let target = new Array(RAYS).fill(0);
    let bassTarget = 0;
    const hasReal = analyser && playing && (srcNodeAudio||srcNodeVideo);
    if(hasReal){
      analyser.getByteFrequencyData(freqData);
      for(let i=0;i<RAYS;i++){
        const bin = Math.floor((i/RAYS) * (freqData.length*0.8));
        target[i] = (freqData[bin]||0)/255;
      }
      let bassSum=0; for(let i=0;i<6;i++) bassSum += (freqData[i]||0)/255;
      bassTarget = bassSum/6;
    } else if(playing){
      const t = performance.now()/1000;
      for(let i=0;i<RAYS;i++){
        target[i] = Math.max(0, 0.16 + 0.14*Math.sin(t*2.2+i*1.3) + 0.09*Math.sin(t*0.9+i*2.1));
      }
      bassTarget = 0.14 + 0.08*Math.sin(t*1.8);
    }
    for(let i=0;i<RAYS;i++) smoothed[i] += (target[i]-smoothed[i]) * (hasReal?0.4:0.1);
    bassSmoothed += (bassTarget-bassSmoothed) * (hasReal?0.25:0.08);
    rayRotation += 0.0022 + bassSmoothed*0.004;

    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--sb-amb-color-rgb').trim() || '25,118,210';
    ctx.save();
    ctx.filter = 'blur(3px)';
    ctx.globalCompositeOperation = 'lighter';
    for(let i=0;i<RAYS;i++){
      const amp = smoothed[i];
      const a = (i/RAYS)*Math.PI*2 + rayRotation;
      const len = 22 + amp*118;
      const width = 7 + amp*15;
      const innerR = baseR - 4;
      const ix = cx + Math.cos(a)*innerR, iy = cy + Math.sin(a)*innerR;
      const tipR = innerR + len;
      const tx = cx + Math.cos(a)*tipR, ty = cy + Math.sin(a)*tipR;
      const perpX = -Math.sin(a), perpY = Math.cos(a);

      ctx.beginPath();
      ctx.moveTo(ix + perpX*width, iy + perpY*width);
      ctx.quadraticCurveTo(
        cx + Math.cos(a)*(innerR+len*0.55) + perpX*width*0.4,
        cy + Math.sin(a)*(innerR+len*0.55) + perpY*width*0.4,
        tx, ty
      );
      ctx.quadraticCurveTo(
        cx + Math.cos(a)*(innerR+len*0.55) - perpX*width*0.4,
        cy + Math.sin(a)*(innerR+len*0.55) - perpY*width*0.4,
        ix - perpX*width, iy - perpY*width
      );
      ctx.closePath();

      const grad = ctx.createRadialGradient(ix,iy,0, tx,ty, len);
      grad.addColorStop(0, 'rgba('+rgb+',.7)');
      grad.addColorStop(0.55, 'rgba('+rgb+',.32)');
      grad.addColorStop(1, 'rgba('+rgb+',0)');
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();

    // Bass-driven pulse on the artwork itself — no rotation, just breathing.
    const disc = $('sbDisc');
    if(disc){
      const scale = settings.spin ? (1 + bassSmoothed*0.09) : 1;
      disc.style.transform = 'scale('+scale.toFixed(3)+')';
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  AMBIENT LIGHTING — extract average colour from the current thumbnail
  // ══════════════════════════════════════════════════════════════════════
  function setAmbientVars(r,g,b){
    const root = document.documentElement.style;
    root.setProperty('--sb-amb-color-rgb', r+','+g+','+b);
    root.setProperty('--sb-amb-color', 'rgb('+r+','+g+','+b+')');
    root.setProperty('--sb-amb-wash', 'rgba('+r+','+g+','+b+',.13)');
    root.setProperty('--sb-amb-glow', 'rgba('+r+','+g+','+b+',.55)');
    root.setProperty('--sb-amb-border', 'rgba('+r+','+g+','+b+',.35)');
  }
  function themeColor(){ return THEMES[settings.theme]?.c || THEMES[0].c; }
  function isDarkMode(){ return document.body.classList.contains('dark'); }
  // Dark mode needs a lighter tint of whatever colour we've got, the same
  // way the base app swaps #1976d2 for #90caf9 on dark surfaces — otherwise
  // a raw extracted/theme colour reads muddy and low-contrast on #181818.
  function forSurface(r,g,b){
    if(!isDarkMode()) return [r,g,b];
    const f = 0.34;
    return [Math.round(r+(255-r)*f), Math.round(g+(255-g)*f), Math.round(b+(255-b)*f)];
  }
  function updateAmbientColor(){
    const t = tracks[currentIndex];
    document.body.classList.toggle('sb-amb-on', !!(settings.ambient && settings.ambientEditor));
    if(!settings.ambient || !t || !t.thumb){
      let [r,g,b] = themeColor().split(',').map(Number);
      [r,g,b] = forSurface(r,g,b);
      setAmbientVars(r,g,b);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>{
      try{
        const c = $('sbAmbCanvas'), ctx = c.getContext('2d');
        ctx.clearRect(0,0,16,16); ctx.drawImage(img,0,0,16,16);
        const data = ctx.getImageData(0,0,16,16).data;
        let r=0,g=0,b=0,n=0;
        for(let i=0;i<data.length;i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; }
        r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
        [r,g,b] = forSurface(r,g,b);
        setAmbientVars(r,g,b);
      }catch(e){
        let [r,g,b] = themeColor().split(',').map(Number);
        [r,g,b] = forSurface(r,g,b);
        setAmbientVars(r,g,b);
      }
    };
    img.onerror = ()=>{ let [r,g,b] = themeColor().split(',').map(Number); [r,g,b] = forSurface(r,g,b); setAmbientVars(r,g,b); };
    img.src = t.thumb;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PLAYLIST RENDERING
  // ══════════════════════════════════════════════════════════════════════
  function renderPlaylist(filter){
    const wrap = $('sbPlaylistList'); wrap.innerHTML='';
    const f = (filter||'').toLowerCase();
    tracks.forEach((t,i)=>{
      if(f && !(t.name.toLowerCase().includes(f) || (t.artist||'').toLowerCase().includes(f))) return;
      const row = document.createElement('div');
      row.className = 'sb-track-item' + (i===currentIndex?' sb-active':'');
      row.innerHTML =
        '<img class="sb-track-thumb" src="'+(t.thumb||'')+'"/>'+
        '<div class="sb-track-meta"><div class="n">'+escapeHtml(t.name)+'</div><div class="a">'+escapeHtml(t.artist||'')+'</div></div>'+
        (i===currentIndex ? '<span class="material-symbols-outlined">'+(playing?'graphic_eq':'pause_circle')+'</span>' : '');
      row.addEventListener('click', ()=> loadTrack(i, true));
      wrap.appendChild(row);
    });
    if(!tracks.length){
      wrap.innerHTML = '<div style="padding:14px 16px;font-size:12px;color:#999;">No tracks yet — add one from Soundbox Tracks.</div>';
    }
  }
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ══════════════════════════════════════════════════════════════════════
  //  CUSTOMIZE MODAL
  // ══════════════════════════════════════════════════════════════════════
  function openCustomize(){
    $('sbCustomizeModalBg').classList.add('visible');
    refreshCustomizeUi();
  }
  function closeCustomize(){ $('sbCustomizeModalBg').classList.remove('visible'); }
  function refreshCustomizeUi(){
    $('sbSideLeftBtn').classList.toggle('active', settings.side==='left');
    $('sbSideRightBtn').classList.toggle('active', settings.side==='right');
    $('sbSizeRange').value = settings.size;
    $('sbSizeVal').textContent = settings.size+'%';
    $('sbAmbientToggle').checked = !!settings.ambient;
    $('sbAmbientEditorToggle').checked = !!settings.ambientEditor;
    $('sbSpinToggle').checked = !!settings.spin;
    $('sbAmbientEditorRow').style.opacity = settings.ambient ? '1' : '.4';
    $('sbAmbientEditorToggle').disabled = !settings.ambient;
  }
  function buildThemeGrid(){
    const grid = $('sbThemeGrid'); grid.innerHTML='';
    THEMES.forEach((th,i)=>{
      const sw = document.createElement('div');
      sw.className = 'sb-theme-swatch'+(i===settings.theme?' active':'');
      sw.style.background = 'rgb('+th.c+')';
      sw.title = th.name;
      sw.addEventListener('click', ()=>{
        settings.theme = i; saveSettings();
        grid.querySelectorAll('.sb-theme-swatch').forEach(s=>s.classList.remove('active'));
        sw.classList.add('active');
        updateAmbientColor();
      });
      grid.appendChild(sw);
    });
  }
  function wireCustomize(){
    buildThemeGrid();
    $('sbCustomizeQuickBtn').addEventListener('click', openCustomize);
    $('sbSideLeftBtn').addEventListener('click', ()=>{ settings.side='left'; saveSettings(); applyPanelPlacement(); refreshCustomizeUi(); });
    $('sbSideRightBtn').addEventListener('click', ()=>{ settings.side='right'; saveSettings(); applyPanelPlacement(); refreshCustomizeUi(); });
    $('sbSizeRange').addEventListener('input', e=>{
      settings.size = Math.max(20, Math.min(50, parseInt(e.target.value,10)));
      $('sbSizeVal').textContent = settings.size+'%';
      document.documentElement.style.setProperty('--sb-width', settings.size+'%');
      saveSettings();
    });
    $('sbAmbientToggle').addEventListener('change', e=>{ settings.ambient = e.target.checked; saveSettings(); refreshCustomizeUi(); updateAmbientColor(); });
    $('sbAmbientEditorToggle').addEventListener('change', e=>{ settings.ambientEditor = e.target.checked; saveSettings(); updateAmbientColor(); });
    $('sbSpinToggle').addEventListener('change', e=>{ settings.spin = e.target.checked; saveSettings(); });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  TRACKS MODAL — add via link / YouTube / upload
  // ══════════════════════════════════════════════════════════════════════
  function openTracks(){ $('sbTracksModalBg').classList.add('visible'); renderManageList(); }
  function closeTracks(){ $('sbTracksModalBg').classList.remove('visible'); }

  function addTrack(t){
    t.id = t.id || uid();
    tracks.push(t);
    saveTracks();
    renderPlaylist(); renderManageList();
    toast('Added "'+t.name+'" to Soundbox','success');
    if(currentIndex<0) { $('sbEmptyHint').style.display=''; }
  }
  function removeTrack(id){
    const idx = tracks.findIndex(t=>t.id===id); if(idx<0) return;
    const t = tracks[idx];
    if(t.blobKey) idbDel(t.blobKey);
    if(t.coverBlobKey) idbDel(t.coverBlobKey);
    tracks.splice(idx,1);
    if(currentIndex===idx){ currentIndex=-1; playing=false; syncPlayingUi(); }
    else if(currentIndex>idx) currentIndex--;
    saveTracks(); renderPlaylist(); renderManageList();
  }
  function renderManageList(){
    const wrap = $('sbManageList'); wrap.innerHTML='';
    if(!tracks.length){ wrap.innerHTML='<div style="padding:8px 2px;font-size:12px;color:#999;">No tracks added yet.</div>'; return; }
    tracks.forEach(t=>{
      const row = document.createElement('div');
      row.className='sb-manage-item';
      row.innerHTML = '<img src="'+(t.thumb||'')+'"/><div class="n">'+escapeHtml(t.name)+'</div><button class="sb-manage-del"><span class="material-symbols-outlined">delete</span></button>';
      row.querySelector('.sb-manage-del').addEventListener('click', ()=> removeTrack(t.id));
      wrap.appendChild(row);
    });
  }

  function wireAddTabs(){
    document.querySelectorAll('.sb-add-tab').forEach(tab=>{
      tab.addEventListener('click', ()=>{
        document.querySelectorAll('.sb-add-tab').forEach(x=>x.classList.remove('active'));
        document.querySelectorAll('.sb-add-pane').forEach(x=>x.classList.remove('active'));
        tab.classList.add('active');
        $(tab.dataset.pane).classList.add('active');
      });
    });
  }

  // -- Direct link --
  function wireLinkAdd(){
    $('sbLinkAddBtn').addEventListener('click', ()=>{
      const url = $('sbLinkUrl').value.trim();
      if(!url){ $('sbLinkStatus').textContent='Enter a link first.'; return; }
      const kind = /\.mp4($|\?)/i.test(url) ? 'video' : 'audio';
      const name = $('sbLinkName').value.trim() || guessNameFromUrl(url);
      const artist = $('sbLinkArtist').value.trim();
      addTrack({ type:'url', kind, src:url, name, artist, thumb:'' });
      if(kind==='video') tryExtractRemoteVideoThumb(url, tracks[tracks.length-1].id);
      $('sbLinkUrl').value=''; $('sbLinkName').value=''; $('sbLinkArtist').value=''; $('sbLinkStatus').textContent='';
    });
  }
  function guessNameFromUrl(url){
    try{ const p = new URL(url).pathname.split('/').pop()||'Track'; return decodeURIComponent(p.replace(/\.[a-z0-9]+$/i,'')); }
    catch(e){ return 'Track'; }
  }
  function tryExtractRemoteVideoThumb(url, trackId){
    extractAverageFrame(url).then(dataUrl=>{
      const t = tracks.find(x=>x.id===trackId); if(t){ t.thumb=dataUrl; saveTracks(); renderPlaylist(); renderManageList(); if(tracks[currentIndex]===t){ $('sbDisc').src=dataUrl; $('sbMiniThumb').src=dataUrl; updateAmbientColor(); } }
    }).catch(()=>{ /* CORS blocked — thumbnail stays blank, playback is unaffected */ });
  }

  // -- YouTube --
  function parseYouTubeId(url){
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function wireYtAdd(){
    $('sbYtAddBtn').addEventListener('click', async ()=>{
      const url = $('sbYtUrl').value.trim();
      const id = parseYouTubeId(url);
      if(!id){ $('sbYtStatus').textContent='That doesn\'t look like a YouTube link.'; return; }
      $('sbYtStatus').textContent='Fetching video info…';
      try{
        const r = await fetch('https://www.youtube.com/oembed?url='+encodeURIComponent('https://www.youtube.com/watch?v='+id)+'&format=json');
        const info = await r.json();
        addTrack({ type:'youtube', kind:'youtube', src:id, name:info.title||'YouTube track', artist:info.author_name||'', thumb:info.thumbnail_url||('https://i.ytimg.com/vi/'+id+'/hqdefault.jpg') });
      }catch(e){
        addTrack({ type:'youtube', kind:'youtube', src:id, name:'YouTube track', artist:'', thumb:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg' });
      }
      $('sbYtUrl').value=''; $('sbYtStatus').textContent='';
    });
  }

  // -- Upload (mp3 / mp4) --
  function wireUpload(){
    $('sbUploadZone').addEventListener('click', ()=> $('sbUploadInput').click());
    $('sbUploadInput').addEventListener('change', onUploadFile);
    $('sbCoverNoneBtn').addEventListener('click', ()=>{ uploadCoverMode='none'; pendingCoverFile=null; $('sbCoverNoneBtn').classList.add('active'); $('sbCoverUploadBtn').classList.remove('active'); });
    $('sbCoverUploadBtn').addEventListener('click', ()=>{ uploadCoverMode='upload'; $('sbCoverInput').click(); });
    $('sbCoverInput').addEventListener('change', e=>{
      pendingCoverFile = e.target.files[0]||null;
      $('sbCoverUploadBtn').classList.add('active'); $('sbCoverNoneBtn').classList.remove('active');
      $('sbUploadStatus').textContent = pendingCoverFile ? ('Cover selected: '+pendingCoverFile.name) : '';
    });
  }
  async function onUploadFile(e){
    const file = e.target.files[0]; if(!file) return;
    const isVideo = file.type.startsWith('video/') || /\.mp4$/i.test(file.name);
    const isAudio = file.type.startsWith('audio/');
    if(!isVideo && !isAudio){ $('sbUploadStatus').textContent='Please choose an MP3 or MP4 file.'; return; }

    if(isAudio){ $('sbUploadCoverChoiceWrap').style.display=''; }
    $('sbUploadStatus').textContent = isVideo ? 'Analysing video to find a representative frame…' : 'Adding track…';

    const id = uid();
    const blobKey = id+'_media';
    await idbSet(blobKey, file);
    const objUrl = URL.createObjectURL(file);
    const name = file.name.replace(/\.[a-z0-9]+$/i,'');

    if(isVideo){
      try{
        const thumb = await extractAverageFrame(objUrl);
        addTrack({ type:'file', kind:'video', src:'', blobKey, name, artist:'', thumb });
      }catch(err){
        addTrack({ type:'file', kind:'video', src:'', blobKey, name, artist:'', thumb:'' });
      }
      $('sbUploadStatus').textContent='Added.';
    } else {
      let thumb = '';
      if(uploadCoverMode==='upload' && pendingCoverFile){
        const coverKey = id+'_cover';
        await idbSet(coverKey, pendingCoverFile);
        thumb = await blobToDataUrl(pendingCoverFile);
        addTrack({ type:'file', kind:'audio', src:'', blobKey, coverBlobKey:coverKey, name, artist:'', thumb });
      } else {
        addTrack({ type:'file', kind:'audio', src:'', blobKey, name, artist:'', thumb:'' });
      }
      $('sbUploadStatus').textContent='Added.';
    }
    pendingCoverFile=null; uploadCoverMode='none';
    $('sbUploadInput').value=''; $('sbCoverInput').value='';
    $('sbUploadCoverChoiceWrap').style.display='none';
    $('sbCoverNoneBtn').classList.add('active'); $('sbCoverUploadBtn').classList.remove('active');
  }
  function blobToDataUrl(blob){
    return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(blob); });
  }

  // -- "Most average frame" thumbnail extraction --
  function extractAverageFrame(videoSrc){
    return new Promise((resolve,reject)=>{
      const v = document.createElement('video');
      v.crossOrigin='anonymous'; v.muted=true; v.playsInline=true; v.src=videoSrc;
      const smallC = document.createElement('canvas'); smallC.width=24; smallC.height=24;
      const sctx = smallC.getContext('2d');
      const outC = $('sbFrameCanvas'); outC.width=240; outC.height=240;
      const octx = outC.getContext('2d');

      v.addEventListener('error', ()=>reject(new Error('video load failed')));
      v.addEventListener('loadedmetadata', async ()=>{
        const dur = v.duration;
        if(!isFinite(dur) || dur<=0) return reject(new Error('no duration'));
        const N = 8;
        const times = Array.from({length:N}, (_,i)=> dur * (0.08 + i*(0.84/(N-1))));
        const samples = [];
        try{
          for(const t of times){
            await seekTo(v, t);
            sctx.drawImage(v,0,0,24,24);
            const d = sctx.getImageData(0,0,24,24).data;
            let r=0,g=0,b=0,n=0;
            for(let i=0;i<d.length;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
            samples.push({ t, r:r/n, g:g/n, b:b/n });
          }
        }catch(err){ return reject(err); }
        const mean = samples.reduce((a,s)=>({r:a.r+s.r,g:a.g+s.g,b:a.b+s.b}),{r:0,g:0,b:0});
        mean.r/=samples.length; mean.g/=samples.length; mean.b/=samples.length;
        let best=samples[0], bestD=Infinity;
        samples.forEach(s=>{ const d=(s.r-mean.r)**2+(s.g-mean.g)**2+(s.b-mean.b)**2; if(d<bestD){bestD=d; best=s;} });
        try{
          await seekTo(v, best.t);
          const vw=v.videoWidth, vh=v.videoHeight, side=Math.min(vw,vh);
          octx.clearRect(0,0,240,240);
          octx.drawImage(v, (vw-side)/2, (vh-side)/2, side, side, 0,0,240,240);
          resolve(outC.toDataURL('image/jpeg',0.86));
        }catch(err){ reject(err); }
      });
      function seekTo(video,t){
        return new Promise((res,rej)=>{
          const onSeeked=()=>{ video.removeEventListener('seeked',onSeeked); res(); };
          video.addEventListener('seeked', onSeeked);
          try{ video.currentTime=t; }catch(e){ rej(e); }
        });
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════════════
  function wireModalDismiss(){
    $('sbCustomizeModalBg').addEventListener('click', e=>{ if(e.target.id==='sbCustomizeModalBg') closeCustomize(); });
    $('sbTracksModalBg').addEventListener('click', e=>{ if(e.target.id==='sbTracksModalBg') closeTracks(); });
    $('sbPanelCloseBtn').addEventListener('click', closePanel);
  }
  function restoreLastTrack(){
    if(!tracks.length || !uiState.lastTrackId) return;
    const idx = tracks.findIndex(t=>t.id===uiState.lastTrackId);
    if(idx>=0) loadTrack(idx, false);
  }

  function init(){
    buildSidebarSection();
    mountChrome();
    wireNowBar();
    wireTransport();
    wirePlaylistScroll();
    wireCustomize();
    wireOutputPicker();
    wireAddTabs();
    wireLinkAdd();
    wireYtAdd();
    wireUpload();
    wireModalDismiss();

    document.documentElement.style.setProperty('--sb-width', settings.size+'%');
    updateAmbientColor();
    renderPlaylist();
    renderManageList();
    refreshSidebarSub();
    restoreLastTrack();
    requestAnimationFrame(drawViz);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.Soundbox = { open:openPanel, close:closePanel, closeCustomize, closeTracks, playPause, next, prev };
})();
