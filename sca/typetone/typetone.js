/* ══════════════════════════════════════════════════════════════════
   TYPETONE — add-on engine
   Every sound is synthesized live with the Web Audio API — no audio
   files, nothing to host. Detection uses three layers, roughly in
   order of how solid they are:
     1. Native InputEvent.inputType (typing/deleting/newline/paste) —
        spec-guaranteed, fires for real typing regardless of the
        editor's own internals.
     2. Structural DOM signals this addon has directly confirmed
        (.aw-header/.aw-dropdown, .collapse-btn, #editorArea .page,
        body.dark) — solid, these are the editor's own conventions.
     3. Best-effort pattern matching on toolbar buttons (Material
        Symbols ligature text + title/aria-label/id/class keywords)
        for formatting/export/import/theme actions whose exact
        selectors weren't inspected — heuristic by design, and easy
        to retune via the ICON_MAP table below if a button doesn't
        match your build.
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

  var STYLES = {
    classic:{ label:'Classic Typewriter',
      type:[ {freq:180,oscType:'square',dur:.045,tvol:.16,nfreq:2200,nvol:.09},
             {freq:195,oscType:'square',dur:.04, tvol:.15,nfreq:2600,nvol:.10},
             {freq:170,oscType:'square',dur:.05, tvol:.17,nfreq:2000,nvol:.08} ],
      del:[  {freq:130,dur:.09,tvol:.20,nfreq:750,nvol:.08},
             {freq:120,dur:.095,tvol:.19,nfreq:820,nvol:.09} ] },
    soft:{ label:'Soft Touch',
      type:[ {freq:900,oscType:'sine',dur:.02, tvol:.09,nfreq:5000,nvol:.03,ndur:.01},
             {freq:950,oscType:'sine',dur:.018,tvol:.08,nfreq:5200,nvol:.03,ndur:.01},
             {freq:870,oscType:'sine',dur:.022,tvol:.10,nfreq:4800,nvol:.035,ndur:.012} ],
      del:[  {freq:500,dur:.05,tvol:.12,nfreq:2500,nvol:.03},
             {freq:470,dur:.055,tvol:.11,nfreq:2300,nvol:.03} ] },
    mechanical:{ label:'Mechanical',
      type:[ {freq:260,oscType:'sawtooth',dur:.05, tvol:.14,nfreq:3500,nvol:.12},
             {freq:280,oscType:'sawtooth',dur:.048,tvol:.15,nfreq:3800,nvol:.13},
             {freq:250,oscType:'sawtooth',dur:.052,tvol:.13,nfreq:3300,nvol:.11} ],
      del:[  {freq:160,oscType:'sawtooth',dur:.09,tvol:.20,nfreq:1000,nvol:.10},
             {freq:150,oscType:'sawtooth',dur:.095,tvol:.19,nfreq:1100,nvol:.11} ] },
    muted:{ label:'Muted Felt',
      type:[ {freq:140,oscType:'sine',dur:.06, tvol:.10,nfreq:900,nvol:.03},
             {freq:135,oscType:'sine',dur:.065,tvol:.09,nfreq:850,nvol:.03} ],
      del:[  {freq:100,dur:.09,tvol:.12,nfreq:500,nvol:.03},
             {freq:95, dur:.095,tvol:.11,nfreq:480,nvol:.03} ] }
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

  /* ══════════════════ Audio synthesis ══════════════════ */
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
  function noise(dur, opts){
    opts = opts || {};
    try{
      var c = ctx(); var t = c.currentTime;
      var bufSize = Math.max(1, Math.floor(c.sampleRate*dur));
      var buf = c.createBuffer(1, bufSize, c.sampleRate);
      var data = buf.getChannelData(0);
      var decayPow = opts.decayPow || 2;
      for(var i=0;i<bufSize;i++) data[i] = (Math.random()*2-1) * Math.pow(1-i/bufSize, decayPow);
      var src = c.createBufferSource(); src.buffer = buf;
      var filt = c.createBiquadFilter();
      filt.type = opts.filterType || 'bandpass';
      filt.frequency.setValueAtTime(opts.filterFreq||2500, t);
      filt.Q.value = opts.q!==undefined ? opts.q : 1;
      var g = c.createGain();
      var vol = (opts.vol!==undefined?opts.vol:0.15) * state.volume;
      g.gain.setValueAtTime(vol, t);
      src.connect(filt); filt.connect(g); g.connect(c.destination);
      src.start(t);
    }catch(e){}
  }
  function chime(freq,dur,opts){ tone(freq,dur,Object.assign({type:'sine',vol:.22,attack:.005},opts||{})); }
  function sweep(f1,f2,dur,opts){ tone(f1,dur,Object.assign({type:'sine',vol:.14,attack:.01,freqEnd:f2},opts||{})); }
  function blip(freq,dur,opts){ tone(freq,dur,Object.assign({type:'triangle',vol:.16,attack:.002},opts||{})); }

  /* ══════════════════ Keyboard-style variation pools ══════════════════ */
  function pickVariant(pool){ return state.variation ? pool[Math.floor(Math.random()*pool.length)] : pool[0]; }
  function playType(){
    var s = STYLES[state.style] || STYLES.classic;
    var v = pickVariant(s.type);
    tone(v.freq, v.dur, {type:v.oscType||'square', vol:v.tvol, attack:.001});
    noise(v.ndur||.02, {filterFreq:v.nfreq, vol:v.nvol, decayPow:3});
  }
  function playDelete(){
    var s = STYLES[state.style] || STYLES.classic;
    var v = pickVariant(s.del);
    tone(v.freq, v.dur, {type:'sine', vol:v.tvol, attack:.002, freqEnd:v.freq*0.6});
    noise(.03, {filterFreq:v.nfreq, vol:v.nvol, decayPow:2});
  }

  /* ══════════════════ Fixed event sounds ══════════════════ */
  function playNewLine(){ chime(660,.12); setTimeout(function(){chime(880,.15);},70); }
  function playInsert(){ blip(500,.05); setTimeout(function(){blip(720,.05);},40); }
  function playDeleteEmpty(){ noise(.045,{filterFreq:400,filterType:'lowpass',vol:.14,decayPow:1}); }
  function playNewPage(){ noise(.18,{filterFreq:1800,vol:.10,decayPow:1}); chime(520,.2,{vol:.12}); }
  function playDeletePage(){ sweep(700,200,.18,{vol:.14}); noise(.12,{filterFreq:1200,vol:.09,decayPow:1.5}); }
  function playEditing(){ blip(420,.05,{vol:.12}); }
  function playBold(){ tone(300,.07,{type:'square',vol:.15}); }
  function playItalic(){ sweep(500,650,.06,{vol:.14}); }
  function playUnderline(){ tone(260,.08,{type:'triangle',vol:.15,freqEnd:200}); }
  function playStrikethrough(){ noise(.06,{filterFreq:2000,vol:.10,decayPow:2}); tone(240,.05,{vol:.10}); }
  function playAlignment(){ blip(560,.04); }
  function playNewList(){ blip(600,.04); setTimeout(function(){blip(720,.04);},50); }
  function playFont(){ sweep(400,700,.09,{vol:.13}); }
  function playTextColor(){ chime(720,.08,{vol:.12}); }
  function playHighlight(){ chime(560,.08,{vol:.12}); }
  function playExport(){ sweep(500,1000,.16,{vol:.15}); }
  function playImport(){ sweep(1000,500,.16,{vol:.15}); }
  function playSidebarShow(){ sweep(400,750,.12,{vol:.12}); }
  function playSidebarHide(){ sweep(750,400,.12,{vol:.12}); }
  function playSectionOpen(){ blip(650,.05,{vol:.10}); }
  function playSectionClose(){ blip(480,.05,{vol:.10}); }
  function playTheme(){ sweep(300,900,.3,{vol:.16}); noise(.2,{filterFreq:3000,vol:.05,decayPow:1}); }

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
    if(!e.target || !e.target.closest || !e.target.closest('#editorArea')) return; // ignore settings/inputs elsewhere
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
    }, 30); // let the header's own toggle handler run first
  }

  /* ══════════════════ Detection: sidebar collapse/expand (geometry-based, no class guessing) ══════════════════ */
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

  /* ══════════════════ Detection: new/delete page (MutationObserver on #editorArea) ══════════════════ */
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

  /* ══════════════════ Detection: theme change (body.dark, the confirmed host convention) ══════════════════ */
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
        playType(); // little preview so you can hear the style you just picked
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
