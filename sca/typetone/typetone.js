/* ══════════════════════════════════════════════════════════════════
   TYPETONE — add-on engine (v1.0.1)
   Every sound is synthesized live with the Web Audio API. Mechanical
   sounds (typing, deleting, carriage return, page changes) are built
   from layered, resonance-filtered NOISE bursts — not oscillator
   tones — because that's what an actual percussive mechanical impact
   sounds like: a sharp broadband transient shaped by the resonant
   cavity that produced it, not a clean sine/square beep. Each "clack"
   is three layers:
     tick  — a very short high-passed noise burst: the contact transient
     body  — a bandpass-filtered noise burst: the pitched "clack" itself
     thump — a short low sine: the mechanical weight behind it
   The carriage return additionally layers a sliding noise sweep, a
   few ratchet ticks, and a proper inharmonic bell (three detuned
   partials, like a real bell) instead of a simple beep.

   Detection layers (unchanged from v1.0.0):
     1. Native InputEvent.inputType — typing/deleting/newline/paste
     2. Confirmed host DOM conventions — .aw-header/.aw-dropdown,
        .collapse-btn, #editorArea .page, body.dark
     3. Best-effort icon/label pattern matching for toolbar actions —
        see ICON_MAP if a button in your build doesn't match.
═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var STORAGE_KEY = 'tt_addon_state_v1';

  var DEFAULT_CATEGORIES = {
    typing:true, deleting:true, newline:true, inserting:true, deleteEmpty:true, editing:true,
    bold:true, italic:true, underline:true, strikethrough:true, alignment:true, newList:true,
    font:true, textColor:true, highlight:true,
    newPage:true, deletePage:true, exportDoc:true, importDoc:true,
    sidebarToggle:true, sectionToggle:true, theme:true
  };
  var DEFAULTS = { enabled:true, style:'classic', variation:true, volume:0.7, categories:Object.assign({},DEFAULT_CATEGORIES) };

  var CATEGORY_GROUPS = [
    { title:'Typing & Editing', items:[
      ['typing','Typing','keyboard'],
      ['deleting','Deleting','backspace'],
      ['newline','New Line','keyboard_return'],
      ['inserting','Inserting / Paste','content_paste'],
      ['deleteEmpty','Nothing to Delete','block'],
      ['editing','Other Edits','edit']
    ]},
    { title:'Formatting', items:[
      ['bold','Bold','format_bold'],
      ['italic','Italic','format_italic'],
      ['underline','Underline','format_underlined'],
      ['strikethrough','Strikethrough','format_strikethrough'],
      ['alignment','Alignment','format_align_center'],
      ['newList','New List','format_list_bulleted'],
      ['font','Font Change','font_download'],
      ['textColor','Text Color','format_color_text'],
      ['highlight','Highlight','ink_highlighter']
    ]},
    { title:'Document', items:[
      ['newPage','New Page','note_add'],
      ['deletePage','Delete Page','delete_sweep'],
      ['exportDoc','Export','file_download'],
      ['importDoc','Import','file_upload']
    ]},
    { title:'Interface', items:[
      ['sidebarToggle','Hide/Unhide Sidebar','menu_open'],
      ['sectionToggle','Open/Close Sections','unfold_more'],
      ['theme','Theme Change','contrast']
    ]}
  ];

  /* Each variant feeds the clack() layering function below.
     bodyFreq/bodyQ/bodyDur/bodyVol shape the resonant "clack" itself;
     tickFreq/tickVol add (or, at 0, omit) the sharp contact transient;
     thumpFreq/thumpVol/thumpDur add (or, at 0, omit) the low mechanical
     thud beneath it; bodyFilter lets softer styles use a lowpass
     instead of a bandpass for a rounder, less percussive body. */
  var STYLES = {
    classic:{ label:'Classic Typewriter',
      type:[
        {bodyFreq:2000,bodyQ:4.5,bodyDur:.035,bodyVol:.34, tickFreq:5500,tickVol:.16, thumpFreq:190,thumpVol:.16,thumpDur:.05},
        {bodyFreq:2300,bodyQ:5,  bodyDur:.032,bodyVol:.32, tickFreq:6000,tickVol:.18, thumpFreq:175,thumpVol:.15,thumpDur:.048},
        {bodyFreq:1850,bodyQ:4,  bodyDur:.038,bodyVol:.35, tickFreq:5200,tickVol:.15, thumpFreq:205,thumpVol:.17,thumpDur:.052}
      ],
      del:[
        {bodyFreq:1400,bodyQ:3.5,bodyDur:.045,bodyVol:.32, tickFreq:4200,tickVol:.12, thumpFreq:140,thumpVol:.20,thumpDur:.07},
        {bodyFreq:1300,bodyQ:3.2,bodyDur:.05, bodyVol:.34, tickFreq:4000,tickVol:.11, thumpFreq:130,thumpVol:.22,thumpDur:.075}
      ]},
    mechanical:{ label:'Mechanical',
      type:[
        {bodyFreq:3200,bodyQ:7,  bodyDur:.018,bodyVol:.28, tickFreq:7000,tickVol:.26, thumpFreq:0,thumpVol:0,thumpDur:0},
        {bodyFreq:3500,bodyQ:7.5,bodyDur:.016,bodyVol:.26, tickFreq:7500,tickVol:.28, thumpFreq:0,thumpVol:0,thumpDur:0},
        {bodyFreq:3000,bodyQ:6.5,bodyDur:.02, bodyVol:.30, tickFreq:6800,tickVol:.24, thumpFreq:0,thumpVol:0,thumpDur:0}
      ],
      del:[
        {bodyFreq:2400,bodyQ:6,  bodyDur:.022,bodyVol:.28, tickFreq:5500,tickVol:.20, thumpFreq:100,thumpVol:.08,thumpDur:.03},
        {bodyFreq:2600,bodyQ:6.5,bodyDur:.02, bodyVol:.27, tickFreq:5800,tickVol:.22, thumpFreq:95, thumpVol:.09,thumpDur:.028}
      ]},
    soft:{ label:'Soft Touch',
      type:[
        {bodyFreq:1400,bodyQ:1.5,bodyDur:.012,bodyVol:.12,bodyFilter:'lowpass', tickFreq:4000,tickVol:.04, thumpFreq:0,thumpVol:0,thumpDur:0},
        {bodyFreq:1500,bodyQ:1.6,bodyDur:.011,bodyVol:.11,bodyFilter:'lowpass', tickFreq:4200,tickVol:.05, thumpFreq:0,thumpVol:0,thumpDur:0},
        {bodyFreq:1350,bodyQ:1.4,bodyDur:.013,bodyVol:.13,bodyFilter:'lowpass', tickFreq:3800,tickVol:.04, thumpFreq:0,thumpVol:0,thumpDur:0}
      ],
      del:[
        {bodyFreq:900,bodyQ:1.3,bodyDur:.02, bodyVol:.13,bodyFilter:'lowpass', tickFreq:2800,tickVol:.03, thumpFreq:0,thumpVol:0,thumpDur:0},
        {bodyFreq:850,bodyQ:1.2,bodyDur:.022,bodyVol:.12,bodyFilter:'lowpass', tickFreq:2600,tickVol:.03, thumpFreq:0,thumpVol:0,thumpDur:0}
      ]},
    muted:{ label:'Muted Felt',
      type:[
        {bodyFreq:800,bodyQ:1.2,bodyDur:.03, bodyVol:.20,bodyFilter:'lowpass', tickFreq:1800,tickVol:.03, thumpFreq:150,thumpVol:.14,thumpDur:.06},
        {bodyFreq:750,bodyQ:1.1,bodyDur:.032,bodyVol:.22,bodyFilter:'lowpass', tickFreq:1700,tickVol:.03, thumpFreq:140,thumpVol:.15,thumpDur:.065}
      ],
      del:[
        {bodyFreq:550,bodyQ:1,  bodyDur:.045,bodyVol:.20,bodyFilter:'lowpass', tickFreq:1200,tickVol:.02, thumpFreq:100,thumpVol:.18,thumpDur:.08},
        {bodyFreq:500,bodyQ:.9, bodyDur:.05, bodyVol:.21,bodyFilter:'lowpass', tickFreq:1100,tickVol:.02, thumpFreq:95, thumpVol:.19,thumpDur:.085}
      ]}
  };
  var STYLE_ORDER = ['classic','soft','mechanical','muted'];

  var ICON_MAP = [
    [['format_bold'],'bold'],
    [['format_italic'],'italic'],
    [['format_underlined','format_underline'],'underline'],
    [['format_strikethrough'],'strikethrough'],
    [['format_align_left','format_align_center','format_align_right','format_align_justify'],'alignment'],
    [['format_list_bulleted','format_list_numbered','format_list_checklist','playlist_add'],'newList'],
    [['format_color_text'],'textColor'],
    [['format_color_fill','ink_highlighter','border_color'],'highlight'],
    [['font_download'],'font'],
    [['dark_mode','light_mode','contrast','brightness_6'],'theme'],
    [['file_download','ios_share','sim_card_download'],'exportDoc'],
    [['file_upload','file_open','drive_folder_upload'],'importDoc']
  ];

  var state = loadState();
  var els = {};
  var AC = null;

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function loadState(){
    var s; try{ s = JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); }catch(e){ s=null; }
    var merged = Object.assign({}, DEFAULTS, s||{});
    merged.categories = Object.assign({}, DEFAULT_CATEGORIES, (s&&s.categories)||{});
    return merged;
  }
  function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){} }
  function has(cat){ return state.enabled && !!state.categories[cat]; }

  /* ══════════════════ Audio synthesis primitives ══════════════════ */
  function ctx(){
    if(!AC){ AC = new (window.AudioContext||window.webkitAudioContext)(); }
    if(AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(freq, dur, opts){
    opts = opts || {};
    try{
      var c = ctx(); var t = c.currentTime;
      var osc = c.createOscillator();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(1,freq), t);
      if(opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1,opts.freqEnd), t+dur);
      var g = c.createGain();
      var vol = (opts.vol!==undefined?opts.vol:0.2) * state.volume;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001,vol), t+(opts.attack||0.003));
      g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
      osc.connect(g); g.connect(c.destination);
      osc.start(t); osc.stop(t+dur+0.03);
    }catch(e){}
  }
  // The core mechanical-sound primitive: a short burst of white noise
  // shaped by a resonant filter and a fast exponential-decay envelope.
  // This — not a pure oscillator tone — is what a percussive impact
  // (a key strike, a ratchet tick, paper rustle) actually sounds like.
  function noiseBurst(dur, opts){
    opts = opts || {};
    try{
      var c = ctx(); var t = c.currentTime;
      var bufSize = Math.max(1, Math.floor(c.sampleRate*dur));
      var buf = c.createBuffer(1, bufSize, c.sampleRate);
      var data = buf.getChannelData(0);
      var decayPow = opts.decayPow!==undefined ? opts.decayPow : 3;
      for(var i=0;i<bufSize;i++) data[i] = (Math.random()*2-1) * Math.pow(1-i/bufSize, decayPow);
      var src = c.createBufferSource(); src.buffer = buf;
      var filt = c.createBiquadFilter();
      filt.type = opts.filterType || 'bandpass';
      filt.frequency.setValueAtTime(opts.freq||2500, t);
      if(opts.freqEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(40,opts.freqEnd), t+dur);
      filt.Q.value = opts.q!==undefined ? opts.q : 3;
      var g = c.createGain();
      var vol = (opts.vol!==undefined?opts.vol:0.25) * state.volume;
      g.gain.setValueAtTime(vol, t);
      src.connect(filt); filt.connect(g); g.connect(c.destination);
      src.start(t); src.stop(t+dur+0.02);
    }catch(e){}
  }
  // Three-layer mechanical impact: tick (contact transient) + body
  // (the resonant, pitched "clack") + thump (low mechanical weight).
  // Any layer is skipped when its *Vol/*Freq is 0/falsy.
  function clack(o){
    o = o || {};
    if(o.tickFreq && o.tickVol) noiseBurst(0.006, {freq:o.tickFreq, freqEnd:o.tickFreq*0.8, q:2, vol:o.tickVol, decayPow:6, filterType:'highpass'});
    noiseBurst(o.bodyDur||.03, {freq:o.bodyFreq||2000, q:o.bodyQ||4, vol:o.bodyVol||.3, decayPow:2.2, filterType:o.bodyFilter||'bandpass'});
    if(o.thumpFreq && o.thumpVol) tone(o.thumpFreq, o.thumpDur||.05, {type:'sine', vol:o.thumpVol, attack:.001, freqEnd:o.thumpFreq*0.7});
  }
  // A real bell/chime has inharmonic partials (not a clean overtone
  // series) — three detuned sine layers with decreasing amplitude and
  // slightly different decay give it that "ting" character instead
  // of sounding like a plain beep.
  function bell(freq, dur, vol){
    [ [1, 1], [2.41, 0.5], [3.76, 0.28] ].forEach(function(p){
      tone(freq*p[0], dur*(0.55+0.45*p[1]), {type:'sine', vol:(vol!==undefined?vol:.2)*p[1], attack:.003});
    });
  }
  function blip(freq,dur,opts){ tone(freq,dur,Object.assign({type:'triangle',vol:.13,attack:.002},opts||{})); }
  function sweep(f1,f2,dur,opts){ tone(f1,dur,Object.assign({type:'sine',vol:.12,attack:.01,freqEnd:f2},opts||{})); }
  function softNoise(dur,opts){ noiseBurst(dur, Object.assign({filterType:'bandpass',decayPow:1.4,vol:.09},opts||{})); }

  /* ══════════════════ Keyboard-style typing/deleting ══════════════════ */
  function pickVariant(pool){ return state.variation ? pool[Math.floor(Math.random()*pool.length)] : pool[0]; }
  function playType(){ clack(pickVariant((STYLES[state.style]||STYLES.classic).type)); }
  function playDelete(){ clack(pickVariant((STYLES[state.style]||STYLES.classic).del)); }

  /* ══════════════════ Fixed event sounds ══════════════════ */
  // Carriage return: the carriage physically slides (a sweeping
  // filtered-noise "zzhick" with a few ratchet ticks along the way),
  // then the bell rings once the slide completes.
  function playNewLine(){
    noiseBurst(0.22, {freq:2600, freqEnd:600, q:1.2, vol:.11, decayPow:1, filterType:'bandpass'});
    [0,45,95,150].forEach(function(delay){
      setTimeout(function(){ noiseBurst(0.008, {freq:3600, q:6, vol:.05, decayPow:6}); }, delay);
    });
    setTimeout(function(){ bell(2100, .45, .18); }, 190);
  }
  function playInsert(){ blip(500,.05,{vol:.12}); setTimeout(function(){blip(720,.05,{vol:.11});},40); }
  // A dry, dead hit with no resonance or pitch — like striking a key
  // with nothing behind it, instead of a normal clack.
  function playDeleteEmpty(){ noiseBurst(0.04, {freq:450, freqEnd:220, q:.8, vol:.16, decayPow:1.4, filterType:'lowpass'}); }
  // Feeding in a fresh sheet: a longer paper rustle plus roller-knob
  // ratchet ticks.
  function playNewPage(){
    softNoise(0.32, {freq:3200, freqEnd:1100, q:.7, vol:.09});
    [0,60,125,190,255].forEach(function(delay){
      setTimeout(function(){ noiseBurst(.008,{freq:4200,q:5,vol:.05,decayPow:6}); }, delay);
    });
  }
  function playDeletePage(){
    noiseBurst(.16, {freq:3500, freqEnd:700, q:1, vol:.16, decayPow:1.4, filterType:'bandpass'});
    clack({bodyFreq:900,bodyQ:2.5,bodyDur:.05,bodyVol:.2, tickFreq:4000,tickVol:.08, thumpFreq:120,thumpVol:.16,thumpDur:.08});
  }
  function playEditing(){ blip(420,.045,{vol:.1}); }
  function playBold(){ clack({bodyFreq:900,bodyQ:3,bodyDur:.02,bodyVol:.16, tickFreq:0, thumpFreq:220,thumpVol:.13,thumpDur:.05}); }
  function playItalic(){ sweep(560,720,.06,{vol:.13}); }
  function playUnderline(){ tone(280,.09,{type:'sine',vol:.14,freqEnd:190}); }
  function playStrikethrough(){ noiseBurst(.05,{freq:1800,q:1.5,vol:.1,decayPow:2.5}); tone(260,.045,{vol:.09}); }
  function playAlignment(){ blip(560,.04,{vol:.12}); }
  function playNewList(){ blip(600,.035,{vol:.11}); setTimeout(function(){blip(760,.035,{vol:.1});},55); }
  function playFont(){ sweep(420,700,.09,{vol:.12}); }
  function playTextColor(){ bell(900,.16,.14); }
  function playHighlight(){ bell(700,.16,.14); }
  function playExport(){ softNoise(.1,{freq:2500,q:1,vol:.06}); sweep(560,1050,.15,{vol:.13}); }
  function playImport(){ softNoise(.1,{freq:2500,q:1,vol:.06}); sweep(1050,560,.15,{vol:.13}); }
  function playSidebarShow(){ sweep(420,760,.11,{vol:.11}); }
  function playSidebarHide(){ sweep(760,420,.11,{vol:.11}); }
  function playSectionOpen(){ blip(650,.045,{vol:.09}); }
  function playSectionClose(){ blip(480,.045,{vol:.09}); }
  function playTheme(){ sweep(320,900,.32,{vol:.15}); softNoise(.22,{freq:3200,q:.8,vol:.05}); }

  var PLAYERS = {
    bold:playBold, italic:playItalic, underline:playUnderline, strikethrough:playStrikethrough,
    alignment:playAlignment, newList:playNewList, font:playFont, textColor:playTextColor,
    highlight:playHighlight, theme:playTheme, exportDoc:playExport, importDoc:playImport
  };

  /* ══════════════════ Detection: native typing/deleting/newline/paste ══════════════════ */
  function isEditableEmpty(target){
    var editable = target && target.closest ? target.closest('[contenteditable="true"]') : null;
    if(!editable) return false;
    if((editable.textContent||'').trim().length === 0) return true;
    var sel = window.getSelection();
    if(sel && sel.rangeCount && sel.isCollapsed){
      try{
        var range = sel.getRangeAt(0);
        var pre = range.cloneRange();
        pre.selectNodeContents(editable);
        pre.setEnd(range.startContainer, range.startOffset);
        return pre.toString().length === 0;
      }catch(e){}
    }
    return false;
  }

  function onInput(e){
    if(!state.enabled) return;
    if(!e.target || !e.target.closest || !e.target.closest('#editorArea')) return;
    var t = e.inputType || '';
    if(t === 'insertText' || t === 'insertCompositionText'){
      if(has('typing')) playType();
    } else if(t === 'deleteContentBackward' || t === 'deleteContentForward' || t === 'deleteWordBackward' || t === 'deleteWordForward' || t === 'deleteByCut'){
      if(isEditableEmpty(e.target)){ if(has('deleteEmpty')) playDeleteEmpty(); }
      else if(has('deleting')) playDelete();
    } else if(t === 'insertParagraph' || t === 'insertLineBreak'){
      if(has('newline')) playNewLine();
    } else if(t === 'insertFromPaste' || t === 'insertFromDrop'){
      if(has('inserting')) playInsert();
    } else if(t === 'formatBold'){ if(has('bold')) playBold(); }
    else if(t === 'formatItalic'){ if(has('italic')) playItalic(); }
    else if(t === 'formatUnderline'){ if(has('underline')) playUnderline(); }
    else if(t === 'formatStrikeThrough'){ if(has('strikethrough')) playStrikethrough(); }
    else { if(has('editing')) playEditing(); }
  }

  /* ══════════════════ Detection: toolbar buttons (icon/label pattern match) ══════════════════ */
  function onToolbarClick(e){
    if(!state.enabled) return;
    var btn = e.target.closest ? e.target.closest('button, [role="button"], a, div[onclick]') : null;
    if(!btn || btn.closest('#ttSbSection, #ttSettingsMdl')) return;
    var iconEl = btn.querySelector ? btn.querySelector('.material-symbols-outlined') : null;
    var iconText = iconEl ? (iconEl.textContent||'').trim().toLowerCase() : '';
    var label = ((btn.getAttribute('title')||'') + ' ' + (btn.getAttribute('aria-label')||'') + ' ' +
                 (btn.id||'') + ' ' + (btn.className||'')).toLowerCase();
    var hay = iconText + ' ' + label;
    for(var i=0;i<ICON_MAP.length;i++){
      var patterns = ICON_MAP[i][0], cat = ICON_MAP[i][1];
      for(var j=0;j<patterns.length;j++){
        if(hay.indexOf(patterns[j]) > -1){
          if(has(cat) && PLAYERS[cat]) PLAYERS[cat]();
          return;
        }
      }
    }
  }

  /* ══════════════════ Detection: sidebar section open/close (generic .aw-header) ══════════════════ */
  function onSectionHeaderClick(e){
    if(!state.enabled) return;
    var header = e.target.closest ? e.target.closest('#sidebar .aw-header') : null;
    if(!header || !has('sectionToggle')) return;
    var dd = header.parentElement ? header.parentElement.querySelector('.aw-dropdown') : null;
    if(!dd) return;
    setTimeout(function(){
      dd.classList.contains('open') ? playSectionOpen() : playSectionClose();
    }, 30);
  }

  /* ══════════════════ Detection: sidebar collapse/expand (geometry-based) ══════════════════ */
  function onCollapseClick(e){
    if(!state.enabled) return;
    var btn = e.target.closest ? e.target.closest('#sidebar .collapse-btn') : null;
    if(!btn || !has('sidebarToggle')) return;
    var sidebar = document.getElementById('sidebar');
    var before = sidebar ? sidebar.getBoundingClientRect().width : 0;
    setTimeout(function(){
      var after = sidebar ? sidebar.getBoundingClientRect().width : 0;
      (after < before) ? playSidebarHide() : playSidebarShow();
    }, 60);
  }

  /* ══════════════════ Detection: new/delete page ══════════════════ */
  function watchPages(){
    var editorArea = document.getElementById('editorArea');
    if(!editorArea){ setTimeout(watchPages, 1000); return; }
    var mo = new MutationObserver(function(muts){
      if(!state.enabled) return;
      muts.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(n.nodeType===1 && n.classList && n.classList.contains('page') && has('newPage')) playNewPage();
        });
        m.removedNodes.forEach(function(n){
          if(n.nodeType===1 && n.classList && n.classList.contains('page') && has('deletePage')) playDeletePage();
        });
      });
    });
    mo.observe(editorArea, {childList:true});
  }

  /* ══════════════════ Detection: theme change ══════════════════ */
  function watchTheme(){
    var lastDark = document.body.classList.contains('dark');
    var mo = new MutationObserver(function(){
      if(!state.enabled) return;
      var nowDark = document.body.classList.contains('dark');
      if(nowDark !== lastDark){ lastDark = nowDark; if(has('theme')) playTheme(); }
    });
    mo.observe(document.body, {attributes:true, attributeFilter:['class']});
  }

  /* ══════════════════ Sidebar section ══════════════════ */
  function insertSidebarSection(){
    var sidebar = document.getElementById('sidebar');
    var tpl = document.getElementById('ttSidebarTpl');
    if(!sidebar || !tpl || document.getElementById('ttSbSection')) return;
    var node = tpl.content.firstElementChild.cloneNode(true);
    var collapseBtn = sidebar.querySelector('.collapse-btn');
    if(collapseBtn) sidebar.insertBefore(node, collapseBtn);
    else sidebar.appendChild(node);
  }
  function toggleSbDropdown(){
    var open = !els.ttDropdown.classList.contains('open');
    els.ttDropdown.classList.toggle('open', open);
    els.ttChevron.classList.toggle('open', open);
  }

  /* ══════════════════ Modal ══════════════════ */
  function renderStyleChips(){
    els.styleChips.innerHTML = '';
    STYLE_ORDER.forEach(function(key){
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'scale-chip' + (state.style===key ? ' active' : '');
      chip.textContent = STYLES[key].label;
      chip.addEventListener('click', function(){
        state.style = key; saveState(); renderStyleChips();
        playType();
      });
      els.styleChips.appendChild(chip);
    });
  }

  function renderCategoryList(){
    els.categoryList.innerHTML = '';
    CATEGORY_GROUPS.forEach(function(group){
      var h = document.createElement('div');
      h.className = 'tt-subtitle';
      h.textContent = group.title;
      els.categoryList.appendChild(h);
      var grid = document.createElement('div');
      grid.className = 'tt-toggle-grid';
      group.items.forEach(function(item){
        var key=item[0], label=item[1], icon=item[2];
        var row = document.createElement('div');
        row.className = 'tt-row';
        row.innerHTML =
          '<span class="tt-row-left"><span class="material-symbols-outlined">'+icon+'</span><span class="tt-label">'+label+'</span></span>' +
          '<label class="toggle-switch tt-mini-toggle"><input type="checkbox" data-cat="'+key+'" '+(state.categories[key]?'checked':'')+'/><span class="toggle-slider"></span></label>';
        grid.appendChild(row);
      });
      els.categoryList.appendChild(grid);
    });
    els.categoryList.querySelectorAll('input[data-cat]').forEach(function(input){
      input.addEventListener('change', function(){
        state.categories[this.dataset.cat] = this.checked;
        saveState();
      });
    });
  }

  function syncModalFromState(){
    els.enableToggle.checked = state.enabled;
    els.variationToggle.checked = state.variation;
    els.volumeSlider.value = Math.round(state.volume*100);
    els.volumeVal.textContent = Math.round(state.volume*100) + '%';
    renderStyleChips();
    renderCategoryList();
  }

  function wireModal(){
    els.variationToggle.addEventListener('change', function(){
      state.variation = this.checked; saveState();
    });
    els.volumeSlider.addEventListener('input', function(){
      state.volume = parseInt(this.value,10)/100;
      els.volumeVal.textContent = this.value + '%';
      saveState();
    });
    els.enableAllBtn.addEventListener('click', function(){
      Object.keys(state.categories).forEach(function(k){ state.categories[k]=true; });
      saveState(); renderCategoryList();
    });
    els.disableAllBtn.addEventListener('click', function(){
      Object.keys(state.categories).forEach(function(k){ state.categories[k]=false; });
      saveState(); renderCategoryList();
    });
    els.resetBtn.addEventListener('click', function(){
      var enabled = state.enabled;
      state = JSON.parse(JSON.stringify(DEFAULTS));
      state.enabled = enabled;
      saveState();
      syncModalFromState();
      if(typeof window.showToast === 'function') window.showToast('Typetone reset to defaults', 'info');
    });
  }

  /* ══════════════════ Init ══════════════════ */
  function cacheEls(){
    els.ttHeader = document.getElementById('ttHeader');
    els.ttDropdown = document.getElementById('ttDropdown');
    els.ttChevron = document.getElementById('ttChevron');
    els.enableToggle = document.getElementById('ttEnableToggle');
    els.modsBtn = document.getElementById('ttModsBtn');

    els.styleChips = document.getElementById('ttStyleChips');
    els.variationToggle = document.getElementById('ttVariationToggle');
    els.volumeSlider = document.getElementById('ttVolumeSlider');
    els.volumeVal = document.getElementById('ttVolumeVal');
    els.enableAllBtn = document.getElementById('ttEnableAllBtn');
    els.disableAllBtn = document.getElementById('ttDisableAllBtn');
    els.categoryList = document.getElementById('ttCategoryList');
    els.resetBtn = document.getElementById('ttResetBtn');
  }

  function init(){
    insertSidebarSection();
    cacheEls();
    if(!els.ttHeader) return;

    els.enableToggle.checked = state.enabled;
    els.ttHeader.addEventListener('click', toggleSbDropdown);
    els.enableToggle.addEventListener('change', function(){ state.enabled = this.checked; saveState(); });
    els.modsBtn.addEventListener('click', function(){
      syncModalFromState();
      if(typeof window.openMdl === 'function') window.openMdl('ttSettingsMdl');
    });
    wireModal();

    document.addEventListener('input', onInput, true);
    document.addEventListener('click', onToolbarClick, true);
    document.addEventListener('click', onSectionHeaderClick, true);
    document.addEventListener('click', onCollapseClick, true);
    watchPages();
    watchTheme();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
