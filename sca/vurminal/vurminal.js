/* ═══════════════════════════════════════════════════════════════════════
   Sugarcane Add-on: Vurminal
   Connects the editor to a Vurminal terminal receiver over PeerJS.
   The receiver sends slash commands, this add-on executes them and sends
   back results — you ARE the AI in this loop, just typing manually.

   v1.5.0 — full Pollinations command set + PeerJS transport.

   AUTO-RECONNECT
   --------------
   If the connection drops unexpectedly (WebRTC drop, receiver tab closed,
   network blip), the add-on will automatically try to reconnect. This is
   governed by an "Auto-connect" toggle in the sidebar (on by default).

   The distinction between "deliberate" and "accidental" disconnect:

     - Deliberate: the user clicks Disconnect in the add-on, the receiver
       sends a {type:'bye'} message, or the page is being unloaded. Sets
       _deliberateDisconnect = true, and no retry happens.
     - Accidental: any other 'close' event. Triggers the retry logic.

   RETRY POLICY
   ------------
   After 3 failed attempts in a row, retrying stops. Backoff is
   2s → 4s → 8s. Any success resets the counter to 0. Any manual connect
   also resets the counter, so the user always gets 3 fresh tries.
═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const CFG_KEY = 'sugarcane_addon_vurminal_config';
  const VURMINAL_VERSION = '1.5.0';
  const MAX_AUTO_RETRIES = 3;
  const RETRY_DELAYS_MS = [2000, 4000, 8000]; // attempt 1, 2, 3

  const defaults = {
    peerCode: '',
    autoConnect: true,
    scopePages: 'all',
    elements: {
      header:true, footer:true, watermark:true, background:true,
      margins:true, counts:true, content:true, selection:true, tables:true
    },
    explore: {
      enabled: false,
      pages: 'all'
    }
  };

  let cfg = loadCfg();
  function loadCfg(){
    try {
      const saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      return Object.assign({}, defaults, saved, {
        elements: Object.assign({}, defaults.elements, saved.elements || {}),
        explore: Object.assign({}, defaults.explore, saved.explore || {})
      });
    } catch(e){ return JSON.parse(JSON.stringify(defaults)); }
  }
  function saveCfg(){ try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch(e){} }

  function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

  // ── Editor helpers ───────────────────────────────────────────────────
  function activePage(){
    return document.querySelector('.page-content:focus') || document.querySelector('#editorArea .page-content');
  }
  function pageNumFromEl(el){
    if(!el) return 1;
    const contentEl = el.matches && el.matches('.page-content') ? el : el.closest('.page-content');
    if(!contentEl) return 1;
    const all = [...document.querySelectorAll('#editorArea .page-content')];
    const idx = all.indexOf(contentEl);
    return idx === -1 ? 1 : idx + 1;
  }
  function pageContentByNum(n){ return document.querySelectorAll('#editorArea .page-content')[n-1] || null; }
  function pageByNum(n){ return document.querySelectorAll('#editorArea .page')[n-1] || null; }
  function allowedPages(){
    if(cfg.scopePages === 'all') return null;
    if(cfg.scopePages === 'current') return [pageNumFromEl(activePage())];
    return cfg.scopePages.split(',').map(s => parseInt(s.trim(),10)).filter(n => !isNaN(n));
  }
  function pageAllowed(n){
    const allowed = allowedPages();
    return allowed === null || allowed.includes(n);
  }
  function elAllowed(name){ return !!cfg.elements[name]; }
  function denyMsg(what){ return 'Permission denied: ' + what + ' access is currently off in Vurminal Configuration.'; }
  function textOf(id){ const el = document.getElementById(id); return el ? el.textContent.trim() : ''; }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── Markdown renderer ────────────────────────────────────────────────
  function mdInline(s){
    return s
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,'<b><i>$1</i></b>')
      .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<i>$2</i>')
      .replace(/~~(.+?)~~/g,'<s>$1</s>')
      .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function mdToHtml(md){
    let src = String(md)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const blocks = [];
    src = src.replace(/```([\s\S]*?)```/g, (m, code) => {
      blocks.push('<pre><code>' + code.replace(/^\n/,'').replace(/\n$/,'') + '</code></pre>');
      return '\u0000B' + (blocks.length - 1) + '\u0000';
    });
    const out = [];
    let listType = null, quoting = false;
    const closeList = () => { if(listType){ out.push('</' + listType + '>'); listType = null; } };
    const closeQuote = () => { if(quoting){ out.push('</blockquote>'); quoting = false; } };
    src.split('\n').forEach(line => {
      const ph = line.match(/^\u0000B(\d+)\u0000$/);
      if(ph){ closeList(); closeQuote(); out.push(blocks[+ph[1]]); return; }
      if(/^\s*(---|\*\*\*|___)\s*$/.test(line)){ closeList(); closeQuote(); out.push('<hr>'); return; }
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if(h){ closeList(); closeQuote(); const lvl = h[1].length; out.push('<h'+lvl+'>'+mdInline(h[2])+'</h'+lvl+'>'); return; }
      const bq = line.match(/^>\s?(.*)$/);
      if(bq){ closeList(); if(!quoting){ out.push('<blockquote>'); quoting = true; } if(bq[1].trim()) out.push('<p>'+mdInline(bq[1])+'</p>'); return; }
      closeQuote();
      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if(ol){ if(listType !== 'ol'){ closeList(); out.push('<ol>'); listType = 'ol'; } out.push('<li>'+mdInline(ol[1])+'</li>'); return; }
      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      if(ul){ if(listType !== 'ul'){ closeList(); out.push('<ul>'); listType = 'ul'; } out.push('<li>'+mdInline(ul[1])+'</li>'); return; }
      closeList();
      if(line.trim()) out.push('<p>'+mdInline(line)+'</p>');
    });
    closeList(); closeQuote();
    return out.join('');
  }

  // ── Character-offset → DOM Range ─────────────────────────────────────
  function charOffsetToRange(containerEl, start, end){
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, null);
    let node, pos = 0, startNode = null, startOffset = 0, endNode = null, endOffset = 0;
    while((node = walker.nextNode())){
      const len = node.textContent.length;
      if(startNode === null && pos + len >= start){ startNode = node; startOffset = start - pos; }
      if(endNode === null && pos + len >= end){ endNode = node; endOffset = end - pos; }
      pos += len;
      if(startNode && endNode) break;
    }
    if(!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function stripWrappingQuotes(s){
    return s.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
  }
  function normalizeForSearch(s){
    return s.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  COMMAND REGISTRY
  // ═══════════════════════════════════════════════════════════════════════
  const CMDS = {};
  function reg(name, argMode, kind, help, run){ CMDS[name] = {argMode, kind, help, run}; }

  reg('help', 'none', 'info', 'List every available command.', () => {
    return Object.keys(CMDS).sort().map(k => '/' + k + ' — ' + CMDS[k].help).join('\n');
  });

  reg('version', 'none', 'info', 'Show the add-on version.', () => 'Vurminal ' + VURMINAL_VERSION);

  reg('pagecount', 'none', 'info', 'Number of pages in the document.', () => {
    if(!elAllowed('counts')) return denyMsg('page count');
    return String(document.querySelectorAll('#editorArea .page').length);
  });

  reg('wordcount', 'none', 'info', 'Current word count.', () => {
    if(!elAllowed('counts')) return denyMsg('word count');
    return textOf('wordCount') || '0 words';
  });

  reg('margins', 'none', 'info', 'Current page margins (top/bottom/left/right, cm).', () => {
    if(!elAllowed('margins')) return denyMsg('margins');
    const g = id => (document.getElementById(id) || {value:'2'}).value;
    return `top:${g('marginTop')}cm bottom:${g('marginBottom')}cm left:${g('marginLeft')}cm right:${g('marginRight')}cm`;
  });

  reg('pagebg', 'none', 'info', 'Current page background color(s).', () => {
    if(!elAllowed('background')) return denyMsg('page background');
    const g = id => (document.getElementById(id) || {value:''}).value;
    return `primary:${g('bgColor')} secondary:${g('bgColor2')}`;
  });

  reg('watermark', 'none', 'info', 'Current watermark text.', () => {
    if(!elAllowed('watermark')) return denyMsg('watermark');
    return (document.getElementById('watermarkText')||{value:''}).value || '(none)';
  });

  reg('header', 'words', 'info', 'header <n> — text of page n\'s header.', (n) => {
    if(!elAllowed('header')) return denyMsg('page header');
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const p = pageByNum(num); if(!p) return 'Page ' + num + ' not found.';
    const el = p.querySelector('.page-header-area');
    return (el && el.textContent.trim()) || '(empty)';
  });

  reg('footer', 'words', 'info', 'footer <n> — text of page n\'s footer.', (n) => {
    if(!elAllowed('footer')) return denyMsg('page footer');
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const p = pageByNum(num); if(!p) return 'Page ' + num + ' not found.';
    const el = p.querySelector('.page-footer-area');
    return (el && el.textContent.trim()) || '(empty)';
  });

  reg('pagetext', 'words', 'info', 'pagetext <n> — plain text content of page n.', (n) => {
    if(!elAllowed('content')) return denyMsg('page content');
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const el = pageContentByNum(num);
    return (el && el.textContent.trim()) || '(empty)';
  });

  reg('lookup', 'words', 'info',
    'lookup <n> <phrase...> — find every occurrence of a phrase on page n and report its character position(s).',
    (n, ...rest) => {
      if(!elAllowed('content')) return denyMsg('page content');
      const num = parseInt(n,10) || 1;
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      let phrase = stripWrappingQuotes(rest.join(' '));
      if(!phrase) return 'Missing search phrase — use /lookup <page> <phrase>.';
      const pc = pageContentByNum(num);
      if(!pc) return 'Page ' + num + ' not found.';
      const text = normalizeForSearch(pc.textContent);
      const needle = normalizeForSearch(phrase);
      const hits = [];
      let idx = 0;
      while(hits.length < 20 && (idx = text.indexOf(needle, idx)) !== -1){
        hits.push(idx + '-' + (idx + needle.length));
        idx += needle.length;
      }
      if(!hits.length){
        const idxCI = text.toLowerCase().indexOf(needle.toLowerCase());
        if(idxCI !== -1) return 'Exact case not found, but a case-insensitive match exists at ' + idxCI + '-' + (idxCI + needle.length) + ' on page ' + num + '.';
        return 'Phrase "' + phrase + '" not found on page ' + num + '.';
      }
      return 'Page ' + num + ': ' + hits.length + ' occurrence(s) of "' + phrase + '" (' + needle.length + ' chars). Position(s) [start-end]: ' + hits.join(', ') + '.';
    }
  );

  // ── Insert-target resolution ─────────────────────────────────────────
  let pendingCursor = null;

  function mostVisiblePageContent(){
    const pages = [...document.querySelectorAll('#editorArea .page-content')];
    if(!pages.length) return null;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    let best = null, bestVisible = -Infinity;
    pages.forEach(pc => {
      const r = pc.getBoundingClientRect();
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if(visible > bestVisible){ bestVisible = visible; best = pc; }
    });
    return best;
  }
  function placeCaretAtEnd(pc){
    const range = document.createRange();
    range.selectNodeContents(pc);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    pc.focus();
  }
  function extractPageDirective(text){
    const m = (text || '').match(/^page:(\d+)\s+/i);
    if(m) return {pageNum: parseInt(m[1],10), rest: text.slice(m[0].length)};
    return {pageNum: null, rest: text || ''};
  }
  function resolveInsertTarget(explicitPageNum){
    if(explicitPageNum){
      if(!pageAllowed(explicitPageNum)) return {error: denyMsg('page ' + explicitPageNum)};
      const pc = pageContentByNum(explicitPageNum);
      if(!pc) return {error: 'Page ' + explicitPageNum + ' not found.'};
      placeCaretAtEnd(pc);
      pendingCursor = null;
      return {pc};
    }
    if(pendingCursor){
      const {pageNum, pos} = pendingCursor;
      pendingCursor = null;
      if(pageAllowed(pageNum)){
        const pc = pageContentByNum(pageNum);
        if(pc){
          const total = pc.textContent.length;
          const range = charOffsetToRange(pc, Math.min(pos, total), Math.min(pos, total));
          if(range){
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            pc.focus();
            return {pc};
          }
        }
      }
    }
    const sel = window.getSelection();
    if(sel && sel.rangeCount){
      const anchor = sel.getRangeAt(0).startContainer;
      const inPage = anchor && (anchor.nodeType === 1 ? anchor.closest('.page-content') : (anchor.parentElement && anchor.parentElement.closest('.page-content')));
      if(inPage && document.body.contains(inPage) && pageAllowed(pageNumFromEl(inPage))){
        inPage.focus();
        return {pc: inPage};
      }
    }
    const pc = mostVisiblePageContent();
    if(!pc) return {error: 'No page found to insert into.'};
    const num = pageNumFromEl(pc);
    if(!pageAllowed(num)) return {error: denyMsg('page ' + num)};
    placeCaretAtEnd(pc);
    return {pc};
  }

  function findInsertMarker(id){
    return document.querySelector('.vm-insert-marker[data-vm-insert-id="' + String(id).replace(/"/g,'') + '"]');
  }
  function placeCaretAtMarker(marker){
    const range = document.createRange();
    range.setStartBefore(marker);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const pc = marker.closest('.page-content');
    if(pc) pc.focus();
    return pc;
  }

  reg('select', 'words', 'action',
    'select <n> <start> <end> — select page n\'s characters from start up to (not including) end.',
    (n, start, end) => {
      if(!elAllowed('selection')) return denyMsg('selection');
      const num = parseInt(n,10) || 1;
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      const s = parseInt(start,10), e = parseInt(end,10);
      if(isNaN(s) || isNaN(e) || s < 0 || e <= s) return 'Invalid range — use /select <page> <start> <end>.';
      const pc = pageContentByNum(num);
      if(!pc) return 'Page ' + num + ' not found.';
      const total = pc.textContent.length;
      if(e > total) return 'Range exceeds page ' + num + '\'s length (' + total + ' characters).';
      const range = charOffsetToRange(pc, s, e);
      if(!range) return 'Could not resolve that range to a selection.';
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      pc.focus();
      const preview = pc.textContent.slice(s, Math.min(e, s + 40));
      return 'Selected ' + (e - s) + ' character(s) on page ' + num + ': "' + preview + (e - s > 40 ? '…' : '') + '".';
    }
  );

  reg('placecursor', 'words', 'action',
    'placecursor <n> <pos> — place the cursor at character position pos on page n. OR placecursor <n> before <text...> / placecursor <n> after <text...>.',
    (n, ...rest) => {
      if(!elAllowed('content')) return denyMsg('page content');
      const num = parseInt(n,10) || 1;
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      const pc = pageContentByNum(num);
      if(!pc) return 'Page ' + num + ' not found.';
      const total = pc.textContent.length;
      const mode = (rest[0] || '').toLowerCase();
      let p, describe;
      if(mode === 'before' || mode === 'after'){
        const phrase = stripWrappingQuotes(rest.slice(1).join(' '));
        if(!phrase) return 'Missing text — use /placecursor <page> ' + mode + ' <text>.';
        const text = normalizeForSearch(pc.textContent);
        const needle = normalizeForSearch(phrase);
        const idx = text.indexOf(needle);
        if(idx === -1) return 'Text "' + phrase + '" not found on page ' + num + '.';
        p = mode === 'before' ? idx : idx + needle.length;
        describe = mode + ' "' + phrase + '"';
      } else {
        p = parseInt(rest[0], 10);
        if(isNaN(p) || p < 0) return 'Invalid position — use /placecursor <page> <pos>, or /placecursor <page> before|after <text>.';
        describe = 'at position ' + p;
      }
      if(p > total) return 'Position exceeds page ' + num + '\'s length (' + total + ' characters).';
      const range = charOffsetToRange(pc, p, p);
      if(!range) return 'Could not resolve that position.';
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      pc.focus();
      pendingCursor = {pageNum: num, pos: p};
      return 'Cursor placed ' + describe + ' on page ' + num + ' — the next insert command lands there.';
    }
  );

  reg('selection', 'none', 'info', 'Currently selected text, if any.', () => {
    if(!elAllowed('selection')) return denyMsg('selection');
    const s = window.getSelection ? window.getSelection().toString() : '';
    return s || '(no selection)';
  });

  reg('bold', 'none', 'action', 'Toggle bold on the current selection.', () => { document.execCommand('bold'); return 'Toggled bold.'; });
  reg('italic', 'none', 'action', 'Toggle italic on the current selection.', () => { document.execCommand('italic'); return 'Toggled italic.'; });
  reg('underline', 'none', 'action', 'Toggle underline on the current selection.', () => { document.execCommand('underline'); return 'Toggled underline.'; });
  reg('strikethrough', 'none', 'action', 'Toggle strikethrough on the current selection.', () => { document.execCommand('strikeThrough'); return 'Toggled strikethrough.'; });
  reg('undo', 'none', 'action', 'Undo the last edit.', () => { document.execCommand('undo'); return 'Undid last edit.'; });
  reg('redo', 'none', 'action', 'Redo the last undone edit.', () => { document.execCommand('redo'); return 'Redid edit.'; });
  reg('clearformatting', 'none', 'action', 'Clear formatting on the current selection.', () => { document.execCommand('removeFormat'); return 'Cleared formatting.'; });
  reg('deleteselection', 'none', 'action', 'Delete the currently selected text.', () => { document.execCommand('delete'); return 'Deleted selection.'; });

  reg('alignleft', 'none', 'action', 'Left-align the current paragraph.', () => { document.execCommand('justifyLeft'); return 'Aligned left.'; });
  reg('aligncenter', 'none', 'action', 'Center the current paragraph.', () => { document.execCommand('justifyCenter'); return 'Centered.'; });
  reg('alignright', 'none', 'action', 'Right-align the current paragraph.', () => { document.execCommand('justifyRight'); return 'Aligned right.'; });
  reg('alignjustify', 'none', 'action', 'Justify the current paragraph.', () => { document.execCommand('justifyFull'); return 'Justified.'; });

  reg('fontfamily', 'rest', 'action', 'fontfamily <name> — set font family on selection.', (name) => {
    if(!name) return 'Missing font name.';
    document.execCommand('fontName', false, name); return 'Font set to ' + name + '.';
  });
  reg('fontsize', 'words', 'action', 'fontsize <1-7> — set HTML font size on selection.', (n) => {
    document.execCommand('fontSize', false, String(Math.min(7, Math.max(1, parseInt(n,10)||3))));
    return 'Font size set.';
  });
  reg('textcolor', 'words', 'action', 'textcolor <#hex> — set text color on selection.', (hex) => {
    document.execCommand('foreColor', false, hex); return 'Text color set to ' + hex + '.';
  });
  reg('highlightcolor', 'words', 'action', 'highlightcolor <#hex> — highlight the selection.', (hex) => {
    document.execCommand('hiliteColor', false, hex); return 'Highlight set to ' + hex + '.';
  });

  reg('marginsetall', 'words', 'action', 'marginsetall <cm> — set all four page margins (global).', (v) => {
    if(!elAllowed('margins')) return denyMsg('margins');
    const el = document.getElementById('pageMargin'); if(!el) return 'Margin control not found.';
    el.value = v; if(typeof updateMargins === 'function') updateMargins(v);
    return 'All margins set to ' + v + 'cm.';
  });
  reg('marginset', 'words', 'action', 'marginset <top|bottom|left|right> <cm> — set one margin (global).', (side, v) => {
    if(!elAllowed('margins')) return denyMsg('margins');
    const map = {top:'marginTop', bottom:'marginBottom', left:'marginLeft', right:'marginRight'};
    const id = map[(side||'').toLowerCase()];
    if(!id) return 'Unknown side "' + side + '" (use top/bottom/left/right).';
    const el = document.getElementById(id); if(!el) return 'Margin control not found.';
    el.value = v; if(typeof updateIndividualMargins === 'function') updateIndividualMargins();
    return side + ' margin set to ' + v + 'cm.';
  });
  reg('bgset', 'words', 'action', 'bgset <#hex> [#hex2] — set page background color(s) (global).', (hex1, hex2) => {
    if(!elAllowed('background')) return denyMsg('page background');
    const a = document.getElementById('bgColor'), b = document.getElementById('bgColor2');
    if(a && hex1) a.value = hex1; if(b && hex2) b.value = hex2;
    if(typeof updateBackground === 'function') updateBackground();
    return 'Page background updated.';
  });
  reg('watermarkset', 'rest', 'action', 'watermarkset <text> — set the watermark text.', (text) => {
    if(!elAllowed('watermark')) return denyMsg('watermark');
    const el = document.getElementById('watermarkText'); if(!el) return 'Watermark control not found.';
    el.value = text || ''; if(typeof updateWatermark === 'function') updateWatermark();
    return text ? ('Watermark set to "' + text + '".') : 'Watermark cleared.';
  });
  reg('headerset', 'words', 'action', 'headerset <n> <text...> — set page n\'s header text.', (n, ...rest) => {
    if(!elAllowed('header')) return denyMsg('page header');
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const p = pageByNum(num); if(!p) return 'Page ' + num + ' not found.';
    const el = p.querySelector('.page-header-area'); if(!el) return 'Page ' + num + ' not found.';
    el.textContent = rest.join(' ');
    notifyContentChanged(p.querySelector('.page-content'));
    return 'Header on page ' + num + ' updated.';
  });
  reg('footerset', 'words', 'action', 'footerset <n> <text...> — set page n\'s footer text.', (n, ...rest) => {
    if(!elAllowed('footer')) return denyMsg('page footer');
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const p = pageByNum(num); if(!p) return 'Page ' + num + ' not found.';
    const el = p.querySelector('.page-footer-area'); if(!el) return 'Page ' + num + ' not found.';
    el.textContent = rest.join(' ');
    notifyContentChanged(p.querySelector('.page-content'));
    return 'Footer on page ' + num + ' updated.';
  });

  reg('addpage', 'none', 'action', 'Add a new page at the end of the document.', () => {
    if(typeof addNewPage === 'function'){ addNewPage(); return 'Page added.'; }
    return 'Add-page function not available.';
  });
  reg('removepage', 'words', 'action', 'removepage <n> — delete page n.', (n) => {
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const pages = document.querySelectorAll('#editorArea .page');
    if(pages.length <= 1) return 'Cannot delete the only page.';
    const pageEl = pages[num-1];
    if(!pageEl) return 'Page ' + num + ' not found.';
    if(typeof _executeDeletePage !== 'function') return 'Delete-page function not available.';
    _executeDeletePage(pageEl);
    return 'Page ' + num + ' removed.';
  });
  reg('duplicatepage', 'words', 'action', 'duplicatepage <n> — duplicate page n and insert the copy right after it.', (n) => {
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const srcPage = pageByNum(num);
    if(!srcPage) return 'Page ' + num + ' not found.';
    if(typeof addPageAfter !== 'function') return 'Page duplication function not available.';
    const srcHeader = srcPage.querySelector('.page-header-area');
    const srcContent = srcPage.querySelector('.page-content');
    const srcFooter = srcPage.querySelector('.page-footer-area');
    const hasS = typeof S !== 'undefined';
    const savedContext = hasS ? S.currentContextPage : undefined;
    if(hasS) S.currentContextPage = srcPage;
    addPageAfter();
    if(hasS) S.currentContextPage = savedContext;
    const newPage = pageByNum(num + 1);
    if(newPage){
      const nh = newPage.querySelector('.page-header-area');
      const nc = newPage.querySelector('.page-content');
      const nf = newPage.querySelector('.page-footer-area');
      if(nh && srcHeader) nh.innerHTML = srcHeader.innerHTML;
      if(nc && srcContent) nc.innerHTML = srcContent.innerHTML;
      if(nf && srcFooter) nf.innerHTML = srcFooter.innerHTML;
    }
    return 'Page ' + num + ' duplicated.';
  });

  reg('inserttext', 'rest', 'action',
    'inserttext [page:<n>] <text> — insert plain text.',
    (raw) => {
      const {pageNum, rest} = extractPageDirective(raw);
      if(!rest) return 'Nothing to insert.';
      const target = resolveInsertTarget(pageNum);
      if(target.error) return target.error;
      document.execCommand('insertText', false, rest);
      return 'Inserted text on page ' + pageNumFromEl(target.pc) + '.';
    }
  );
  reg('insertmarkdown', 'rest', 'action',
    'insertmarkdown [page:<n>] <markdown> — convert markdown to formatted content and insert it.',
    (raw) => {
      const {pageNum, rest} = extractPageDirective(raw);
      if(!rest) return 'Nothing to insert.';
      const target = resolveInsertTarget(pageNum);
      if(target.error) return target.error;
      document.execCommand('insertHTML', false, mdToHtml(rest));
      return 'Inserted formatted content on page ' + pageNumFromEl(target.pc) + '.';
    }
  );
  reg('insertat', 'rest', 'action',
    'insertat <id> <text> — insert plain text at the point the user marked.',
    (raw) => {
      const sp = raw.indexOf(' ');
      const id = sp === -1 ? raw : raw.slice(0, sp);
      const text = sp === -1 ? '' : raw.slice(sp + 1);
      if(!id) return 'Missing marker id — use /insertat <id> <text>.';
      if(!text) return 'Nothing to insert.';
      const marker = findInsertMarker(id);
      if(!marker) return 'No pending insert point with id "' + id + '".';
      const num = pageNumFromEl(marker);
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      placeCaretAtMarker(marker);
      document.execCommand('insertText', false, text);
      marker.remove();
      return 'Inserted text at the marked point on page ' + num + '.';
    }
  );
  reg('insertmarkdownat', 'rest', 'action',
    'insertmarkdownat <id> <markdown> — like /insertat but converts markdown formatting first.',
    (raw) => {
      const sp = raw.indexOf(' ');
      const id = sp === -1 ? raw : raw.slice(0, sp);
      const md = sp === -1 ? '' : raw.slice(sp + 1);
      if(!id) return 'Missing marker id — use /insertmarkdownat <id> <markdown>.';
      if(!md) return 'Nothing to insert.';
      const marker = findInsertMarker(id);
      if(!marker) return 'No pending insert point with id "' + id + '".';
      const num = pageNumFromEl(marker);
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      placeCaretAtMarker(marker);
      document.execCommand('insertHTML', false, mdToHtml(md));
      marker.remove();
      return 'Inserted formatted content at the marked point on page ' + num + '.';
    }
  );
  reg('inserttable', 'words', 'action', 'inserttable [page:<n>] <rows> <cols> — insert a simple table.', (a, b, c) => {
    if(!elAllowed('tables')) return denyMsg('tables');
    let pageNum = null, r = a, cc = b;
    const pm = (a||'').match(/^page:(\d+)$/i);
    if(pm){ pageNum = parseInt(pm[1],10); r = b; cc = c; }
    const target = resolveInsertTarget(pageNum);
    if(target.error) return target.error;
    const rows = Math.max(1, parseInt(r,10)||2), cols = Math.max(1, parseInt(cc,10)||2);
    let h = '<table style="border-collapse:collapse;width:100%;margin:10px 0;"><tbody>';
    for(let i=0;i<rows;i++){ h += '<tr>'; for(let j=0;j<cols;j++) h += '<td style="border:1px solid #ccc;padding:6px 8px;min-width:40px;">&nbsp;</td>'; h += '</tr>'; }
    h += '</tbody></table>';
    document.execCommand('insertHTML', false, h);
    return 'Inserted a ' + rows + '×' + cols + ' table on page ' + pageNumFromEl(target.pc) + '.';
  });
  reg('inserthr', 'words', 'action', 'inserthr [page:<n>] — insert a horizontal divider.', (a) => {
    const pm = (a||'').match(/^page:(\d+)$/i);
    const target = resolveInsertTarget(pm ? parseInt(pm[1],10) : null);
    if(target.error) return target.error;
    if(typeof _doInsertHR === 'function'){ _doInsertHR(); return 'Inserted a divider on page ' + pageNumFromEl(target.pc) + '.'; }
    return 'Divider function not available.';
  });
  reg('insertimage', 'rest', 'action', 'insertimage [page:<n>] <url> — insert an image.', (raw) => {
    const {pageNum, rest: url} = extractPageDirective(raw);
    if(!url) return 'Missing image URL.';
    const target = resolveInsertTarget(pageNum);
    if(target.error) return target.error;
    document.execCommand('insertImage', false, url.trim());
    return 'Inserted image on page ' + pageNumFromEl(target.pc) + '.';
  });
  reg('insertlink', 'words', 'action', 'insertlink [page:<n>] <url> <text...> — insert a hyperlink.', (a, ...rest) => {
    let pageNum = null, url = a;
    const pm = (a||'').match(/^page:(\d+)$/i);
    if(pm){ pageNum = parseInt(pm[1],10); url = rest.shift(); }
    if(!url) return 'Missing link URL.';
    const target = resolveInsertTarget(pageNum);
    if(target.error) return target.error;
    const label = rest.join(' ') || url;
    document.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc(label) + '</a>');
    return 'Inserted link on page ' + pageNumFromEl(target.pc) + '.';
  });

  function eachAllowedPage(cb){
    document.querySelectorAll('#editorArea .page-content').forEach((pc, idx) => {
      const n = idx + 1;
      if(pageAllowed(n)) cb(pc, n);
    });
  }
  reg('find', 'rest', 'info', 'find <text> — count occurrences of text across allowed pages.', (term) => {
    if(!elAllowed('content')) return denyMsg('page content');
    if(!term) return 'Missing search text.';
    let total = 0; const hitPages = [];
    eachAllowedPage((pc, n) => {
      const text = pc.textContent; let idx = 0, count = 0;
      while((idx = text.indexOf(term, idx)) !== -1){ count++; idx += term.length; }
      if(count){ total += count; hitPages.push(n); }
    });
    return total ? ('Found ' + total + ' occurrence(s) on page(s) ' + hitPages.join(', ') + '.') : 'Not found.';
  });
  reg('findreplace', 'rest', 'action', 'findreplace <find>|<replace> — replace all occurrences across allowed pages.', (arg) => {
    if(!elAllowed('content')) return denyMsg('page content');
    const parts = arg.split('|');
    const find = (parts[0]||'').trim(), replace = (parts[1]||'').trim();
    if(!find) return 'Missing search text (use: /findreplace find|replace).';
    let total = 0;
    eachAllowedPage((pc) => {
      const text = pc.textContent; let idx = 0, count = 0;
      while((idx = text.indexOf(find, idx)) !== -1){ count++; idx += find.length; }
      if(count){ total += count; pc.innerHTML = pc.innerHTML.split(esc(find)).join(esc(replace)); }
    });
    if(typeof checkContent === 'function') checkContent();
    return 'Replaced ' + total + ' occurrence(s).';
  });

  reg('indent', 'none', 'action', 'Indent the current paragraph.', () => { document.execCommand('indent'); return 'Indented.'; });
  reg('outdent', 'none', 'action', 'Outdent the current paragraph.', () => { document.execCommand('outdent'); return 'Outdented.'; });
  reg('superscript', 'none', 'action', 'Toggle superscript on the selection.', () => { document.execCommand('superscript'); return 'Toggled superscript.'; });
  reg('subscript', 'none', 'action', 'Toggle subscript on the selection.', () => { document.execCommand('subscript'); return 'Toggled subscript.'; });
  reg('orderedlist', 'none', 'action', 'Toggle a numbered list on the current selection.', () => { document.execCommand('insertOrderedList'); return 'Toggled numbered list.'; });
  reg('unorderedlist', 'none', 'action', 'Toggle a bulleted list on the current selection.', () => { document.execCommand('insertUnorderedList'); return 'Toggled bulleted list.'; });
  reg('blockquote', 'none', 'action', 'Turn the current paragraph into a blockquote.', () => { document.execCommand('formatBlock', false, 'blockquote'); return 'Applied blockquote.'; });
  reg('codeblock', 'none', 'action', 'Turn the current paragraph into a code block.', () => { document.execCommand('formatBlock', false, 'pre'); return 'Applied code block.'; });
  reg('normaltext', 'none', 'action', 'Reset the current paragraph to normal text.', () => { document.execCommand('formatBlock', false, 'p'); return 'Reset to normal text.'; });
  reg('heading', 'words', 'action', 'heading <1-6> — turn the current paragraph into a heading.', (n) => {
    const lvl = Math.min(6, Math.max(1, parseInt(n,10)||1));
    document.execCommand('formatBlock', false, 'h' + lvl); return 'Applied heading ' + lvl + '.';
  });

  function transformSelection(fn){
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const text = sel.toString();
    document.execCommand('insertText', false, fn(text));
    return true;
  }
  reg('uppercase', 'none', 'action', 'Convert the selected text to UPPERCASE.', () => transformSelection(t => t.toUpperCase()) ? 'Converted to uppercase.' : 'No text selected.');
  reg('lowercase', 'none', 'action', 'Convert the selected text to lowercase.', () => transformSelection(t => t.toLowerCase()) ? 'Converted to lowercase.' : 'No text selected.');
  reg('titlecase', 'none', 'action', 'Convert the selected text to Title Case.', () => transformSelection(t => t.replace(/\w\S*/g, w => w[0].toUpperCase()+w.slice(1).toLowerCase())) ? 'Converted to title case.' : 'No text selected.');

  reg('linespacing', 'words', 'action', 'linespacing <value> — set line spacing across the document.', (v) => {
    if(typeof updateLineSpacing === 'function'){ updateLineSpacing(v); return 'Line spacing set to ' + v + '.'; }
    return 'Line spacing function not available.';
  });
  reg('spellcheck', 'words', 'action', 'spellcheck <on|off> — toggle spellcheck.', (v) => {
    if(typeof toggleSpellCheck === 'function'){ toggleSpellCheck((v||'').toLowerCase() === 'on'); return 'Spellcheck ' + ((v||'').toLowerCase()==='on'?'enabled':'disabled') + '.'; }
    return 'Spellcheck function not available.';
  });
  reg('pagenumbering', 'words', 'action', 'pagenumbering <on|off> — toggle page numbers.', (v) => {
    if(typeof togglePageNumbering === 'function'){ togglePageNumbering((v||'').toLowerCase() === 'on'); return 'Page numbering ' + ((v||'').toLowerCase()==='on'?'enabled':'disabled') + '.'; }
    return 'Page numbering function not available.';
  });
  reg('darkmode', 'words', 'action', 'darkmode <on|off|toggle> — switch the editor theme.', (v) => {
    v = (v||'toggle').toLowerCase();
    const want = v === 'toggle' ? !document.body.classList.contains('dark') : v === 'on';
    document.body.classList.toggle('dark', want);
    document.documentElement.classList.toggle('dark', want);
    document.cookie = 'toolsuite_theme=' + (want ? 'dark' : 'light') + ';path=/;max-age=31536000;SameSite=Lax';
    return 'Dark mode ' + (want ? 'on' : 'off') + '.';
  });

  reg('zoomin', 'none', 'action', 'Zoom the document in by 10%.', () => { if(typeof adjustZoom==='function'){ adjustZoom(10); return 'Zoomed in.'; } return 'Zoom function not available.'; });
  reg('zoomout', 'none', 'action', 'Zoom the document out by 10%.', () => { if(typeof adjustZoom==='function'){ adjustZoom(-10); return 'Zoomed out.'; } return 'Zoom function not available.'; });
  reg('zoomset', 'words', 'action', 'zoomset <percent> — set zoom level (30–200).', (n) => {
    if(typeof window.S === 'undefined' || typeof applyZoom !== 'function') return 'Zoom function not available.';
    window.S.zoom = Math.max(30, Math.min(200, parseInt(n,10)||100)); applyZoom();
    return 'Zoom set to ' + window.S.zoom + '%.';
  });
  reg('zoomreset', 'none', 'action', 'Reset zoom to 100%.', () => { if(typeof resetZoom==='function'){ resetZoom(); return 'Zoom reset.'; } return 'Zoom function not available.'; });
  reg('gotopage', 'words', 'info', 'gotopage <n> — scroll page n into view.', (n) => {
    const num = parseInt(n,10)||1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const el = pageByNum(num);
    if(!el) return 'Page ' + num + ' not found.';
    el.scrollIntoView({behavior:'smooth', block:'start'});
    return 'Scrolled to page ' + num + '.';
  });

  function allowedText(){
    let out = '';
    eachAllowedPage(pc => { out += pc.textContent + ' '; });
    return out;
  }
  reg('charcount', 'none', 'info', 'Character count (no spaces) across allowed pages.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    return String(allowedText().replace(/\s/g,'').length) + ' characters';
  });
  reg('charcountspaces', 'none', 'info', 'Character count (with spaces) across allowed pages.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    return String(allowedText().length) + ' characters (incl. spaces)';
  });
  reg('sentencecount', 'none', 'info', 'Sentence count across allowed pages.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    return String(allowedText().split(/[.!?]+/).filter(s => s.trim().length > 2).length) + ' sentences';
  });
  reg('paragraphcount', 'none', 'info', 'Paragraph count across allowed pages.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    let count = 0;
    eachAllowedPage(pc => { count += pc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6').length || 1; });
    return String(count) + ' paragraphs';
  });
  reg('readingtime', 'none', 'info', 'Estimated reading time across allowed pages.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    const words = allowedText().trim().split(/\s+/).filter(Boolean).length;
    return '~' + Math.max(1, Math.round(words / 200)) + ' min';
  });

  reg('doctitle', 'none', 'info', 'Current document title.', () => {
    return typeof getTitle === 'function' ? getTitle() : ((document.getElementById('docTitle')||{value:''}).value || 'Untitled');
  });
  reg('doctitleset', 'rest', 'action', 'doctitleset <text> — rename the document.', (text) => {
    const el = document.getElementById('docTitle');
    if(!el || !text) return 'Title field not found or text missing.';
    el.value = text; el.dispatchEvent(new Event('change', {bubbles:true}));
    return 'Title set to "' + text + '".';
  });

  reg('print', 'none', 'action', 'Open the print dialog for this document.', () => {
    if(typeof printDoc === 'function'){ printDoc(); return 'Opened print dialog.'; }
    return 'Print function not available.';
  });
  reg('exporttxt', 'none', 'action', 'Export the document as a .txt file.', () => {
    if(typeof exportTXT === 'function'){ exportTXT(); return 'Exported as .txt.'; }
    return 'Export function not available.';
  });
  reg('exportscd', 'none', 'action', 'Export the document in Sugarcane\'s native .scd format.', () => {
    if(typeof exportSCD === 'function'){ exportSCD(); return 'Exported as .scd.'; }
    return 'Export function not available.';
  });

  function nearestTable(){
    const sel = window.getSelection();
    let node = sel && sel.anchorNode;
    while(node && node.nodeType !== 1) node = node.parentNode;
    let table = node && node.closest ? node.closest('table') : null;
    if(!table){ const p = activePage(); table = p ? p.querySelector('table') : null; }
    return table;
  }
  function nearestCell(){
    const sel = window.getSelection();
    let node = sel && sel.anchorNode;
    while(node && node.nodeType !== 1) node = node.parentNode;
    return node && node.closest ? node.closest('td,th') : null;
  }
  function makeCell(){ const c = document.createElement('td'); c.style.cssText = 'border:1px solid #ccc;padding:6px 8px;min-width:40px'; c.innerHTML = '&nbsp;'; return c; }

  reg('tableaddrowabove', 'none', 'action', 'Add a table row above the cursor\'s current row.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const table = nearestTable(), cell = nearestCell(); if(!table || !cell) return 'Place the cursor in a table first.';
    const row = cell.closest('tr'); const cols = row.querySelectorAll('td,th').length;
    const tr = document.createElement('tr'); for(let i=0;i<cols;i++) tr.appendChild(makeCell());
    row.parentNode.insertBefore(tr, row); return 'Row added above.';
  });
  reg('tableaddrowbelow', 'none', 'action', 'Add a table row below the cursor\'s current row.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const table = nearestTable(), cell = nearestCell(); if(!table || !cell) return 'Place the cursor in a table first.';
    const row = cell.closest('tr'); const cols = row.querySelectorAll('td,th').length;
    const tr = document.createElement('tr'); for(let i=0;i<cols;i++) tr.appendChild(makeCell());
    row.after(tr); return 'Row added below.';
  });
  reg('tableaddcolleft', 'none', 'action', 'Add a table column to the left of the cursor\'s current column.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const table = nearestTable(), cell = nearestCell(); if(!table || !cell) return 'Place the cursor in a table first.';
    const row = cell.closest('tr'); const cells = [...row.querySelectorAll('td,th')]; const idx = cells.indexOf(cell);
    table.querySelectorAll('tr').forEach(r => { const cs = [...r.querySelectorAll('td,th')]; r.insertBefore(makeCell(), cs[idx] || null); });
    return 'Column added to the left.';
  });
  reg('tableaddcolright', 'none', 'action', 'Add a table column to the right of the cursor\'s current column.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const table = nearestTable(), cell = nearestCell(); if(!table || !cell) return 'Place the cursor in a table first.';
    const row = cell.closest('tr'); const cells = [...row.querySelectorAll('td,th')]; const idx = cells.indexOf(cell);
    table.querySelectorAll('tr').forEach(r => { const cs = [...r.querySelectorAll('td,th')]; const ref = cs[idx]; if(ref) ref.after(makeCell()); else r.appendChild(makeCell()); });
    return 'Column added to the right.';
  });
  reg('tabledeleterow', 'none', 'action', 'Delete the table row the cursor is in.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const table = nearestTable(), cell = nearestCell(); if(!table || !cell) return 'Place the cursor in a table first.';
    const rows = table.querySelectorAll('tr'); if(rows.length <= 1) return 'Cannot delete the only row.';
    cell.closest('tr').remove(); return 'Row deleted.';
  });
  reg('tabledeletecol', 'none', 'action', 'Delete the table column the cursor is in.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const table = nearestTable(), cell = nearestCell(); if(!table || !cell) return 'Place the cursor in a table first.';
    const row = cell.closest('tr'); const cells = [...row.querySelectorAll('td,th')];
    if(cells.length <= 1) return 'Cannot delete the only column.';
    const idx = cells.indexOf(cell);
    table.querySelectorAll('tr').forEach(r => { const cs = [...r.querySelectorAll('td,th')]; if(cs[idx]) cs[idx].remove(); });
    return 'Column deleted.';
  });
  reg('tabledeletetable', 'none', 'action', 'Delete the table the cursor is in.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const table = nearestTable(); if(!table) return 'Place the cursor in a table first.';
    table.remove(); return 'Table deleted.';
  });

  function notifyContentChanged(pc){
    if(!pc) return;
    pc.dispatchEvent(new Event('input', {bubbles:true}));
    if(typeof scheduleAutoSave === 'function') scheduleAutoSave();
  }

  function allTables(){ return [...document.querySelectorAll('#editorArea table')]; }
  function idToLetters(num){
    let s = '', n = num + 1;
    while(n > 0){ n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }
  function ensureTableIds(){
    const used = new Set(allTables().map(t => t.getAttribute('data-vm-tid')).filter(Boolean));
    let n = 0;
    allTables().forEach(t => {
      if(t.getAttribute('data-vm-tid')) return;
      let id;
      do { id = idToLetters(n); n++; } while(used.has(id));
      t.setAttribute('data-vm-tid', id);
      used.add(id);
    });
  }
  function tableById(id){
    ensureTableIds();
    const target = String(id || '').toLowerCase().trim();
    return allTables().find(t => t.getAttribute('data-vm-tid') === target) || null;
  }
  function tableDims(t){
    const rows = t.querySelectorAll('tr');
    return {rows: rows.length, cols: rows.length ? rows[0].querySelectorAll('td,th').length : 0};
  }
  function tableName(t){
    const cell = t.querySelector('td,th');
    const text = cell ? cell.textContent.trim() : '';
    return text ? (text.length > 30 ? text.slice(0,30) + '…' : text) : '(unnamed)';
  }
  function tablePageOf(t){
    const pc = t.closest('.page-content');
    return pc ? pageNumFromEl(pc) : 1;
  }

  reg('tables', 'none', 'info', 'List every table in the document with its letter ID, dimensions, page, and an auto-derived name.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    ensureTableIds();
    const list = allTables();
    if(!list.length) return 'No tables in the document.';
    return list.map(t => {
      const id = t.getAttribute('data-vm-tid');
      const {rows, cols} = tableDims(t);
      return id + ': ' + rows + '×' + cols + ' table on page ' + tablePageOf(t) + ' — "' + tableName(t) + '"';
    }).join('\n');
  });

  reg('tablesearch', 'rest', 'info', 'tablesearch <keyword...> — search every table\'s cell text for a keyword.', (kw) => {
    if(!elAllowed('tables')) return denyMsg('tables');
    if(!kw) return 'Missing search keyword.';
    ensureTableIds();
    const term = kw.toLowerCase();
    const scored = allTables().map(t => {
      let score = 0, snippet = '';
      t.querySelectorAll('td,th').forEach(c => {
        const txt = c.textContent;
        if(txt.toLowerCase().includes(term)){ score++; if(!snippet) snippet = txt.trim().slice(0,40); }
      });
      return {t, score, snippet};
    }).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
    if(!scored.length) return 'No table contains "' + kw + '".';
    const best = scored[0];
    const id = best.t.getAttribute('data-vm-tid');
    const {rows, cols} = tableDims(best.t);
    let out = 'Best match: table ' + id + ' (' + rows + '×' + cols + ' on page ' + tablePageOf(best.t) + ', ' + best.score + ' matching cell(s)) — e.g. "' + best.snippet + '".';
    if(scored.length > 1) out += ' Also matched: ' + scored.slice(1,5).map(x => x.t.getAttribute('data-vm-tid')).join(', ') + '.';
    return out;
  });

  reg('tabledata', 'words', 'info', 'tabledata <table id> — dump every cell of a table as a grid.', (id) => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const t = tableById(id);
    if(!t) return 'No table with ID "' + id + '".';
    const rows = [...t.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td,th')].map(c => c.textContent.trim() || '(empty)').join(' | '));
    return 'Table ' + id.toLowerCase() + ':\n' + rows.join('\n');
  });

  reg('tablecell', 'words', 'info', 'tablecell <table id> <row> <col> — read one cell\'s text (row/col 1-indexed).', (id, r, c) => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const t = tableById(id);
    if(!t) return 'No table with ID "' + id + '".';
    const tr = t.querySelectorAll('tr')[parseInt(r,10) - 1];
    if(!tr) return 'Table ' + id.toLowerCase() + ' has no row ' + r + '.';
    const cell = tr.querySelectorAll('td,th')[parseInt(c,10) - 1];
    if(!cell) return 'Table ' + id.toLowerCase() + ' row ' + r + ' has no column ' + c + '.';
    return cell.textContent.trim() || '(empty)';
  });

  reg('tablecellset', 'words', 'action', 'tablecellset <table id> <row> <col> <text...> — set one cell\'s text.', (id, r, c, ...rest) => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const t = tableById(id);
    if(!t) return 'No table with ID "' + id + '".';
    const tr = t.querySelectorAll('tr')[parseInt(r,10) - 1];
    if(!tr) return 'Table ' + id.toLowerCase() + ' has no row ' + r + '.';
    const cell = tr.querySelectorAll('td,th')[parseInt(c,10) - 1];
    if(!cell) return 'Table ' + id.toLowerCase() + ' row ' + r + ' has no column ' + c + '.';
    cell.textContent = rest.join(' ');
    notifyContentChanged(t.closest('.page-content'));
    return 'Set table ' + id.toLowerCase() + ' row ' + r + ', col ' + c + '.';
  });

  reg('tableaddrow', 'words', 'action', 'tableaddrow <table id> <top|bottom> — add a row to a specific side of a specific table.', (id, side) => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const t = tableById(id);
    if(!t) return 'No table with ID "' + id + '".';
    const trs = t.querySelectorAll('tr');
    if(!trs.length) return 'Table ' + id.toLowerCase() + ' has no rows to measure from.';
    const cols = trs[0].querySelectorAll('td,th').length;
    const tr = document.createElement('tr');
    for(let i = 0; i < cols; i++) tr.appendChild(makeCell());
    const s = (side || 'bottom').toLowerCase();
    if(s === 'top') trs[0].parentNode.insertBefore(tr, trs[0]);
    else trs[trs.length - 1].after(tr);
    notifyContentChanged(t.closest('.page-content'));
    return 'Added a row to the ' + (s === 'top' ? 'top' : 'bottom') + ' of table ' + id.toLowerCase() + '.';
  });

  reg('tableaddcol', 'words', 'action', 'tableaddcol <table id> <left|right> — add a column to a specific side of a specific table.', (id, side) => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const t = tableById(id);
    if(!t) return 'No table with ID "' + id + '".';
    const trs = t.querySelectorAll('tr');
    if(!trs.length) return 'Table ' + id.toLowerCase() + ' has no rows.';
    const s = (side || 'right').toLowerCase();
    trs.forEach(tr => {
      const cells = tr.querySelectorAll('td,th');
      if(s === 'left') tr.insertBefore(makeCell(), cells[0] || null);
      else tr.appendChild(makeCell());
    });
    notifyContentChanged(t.closest('.page-content'));
    return 'Added a column to the ' + (s === 'left' ? 'left' : 'right') + ' of table ' + id.toLowerCase() + '.';
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  /click — LIMITLESS
  // ═══════════════════════════════════════════════════════════════════════
  function collectClickTargets(){
    const nodes = document.querySelectorAll(
      'button, [onclick], a[href], input[type="checkbox"], input[type="radio"], select, .tbtn, .mbtn, .aw-header, .sb-title'
    );
    const labels = new Set();
    nodes.forEach(n => {
      if(n.disabled) return;
      if(n.offsetParent === null && getComputedStyle(n).position !== 'fixed') return;
      if(getComputedStyle(n).visibility === 'hidden') return;
      const label = (n.getAttribute('title') || n.getAttribute('aria-label') || n.textContent || '').trim().replace(/\s+/g,' ');
      if(label && label.length < 60) labels.add(label);
    });
    return [...labels].slice(0, 200);
  }

  function findClickable(label){
    const norm = s => (s||'').trim().toLowerCase().replace(/\s+/g,' ');
    const target = norm(label);
    if(!target) return null;
    const nodes = document.querySelectorAll(
      'button, [onclick], a[href], input[type="checkbox"], input[type="radio"], select, .tbtn, .mbtn, .aw-header, .sb-title'
    );
    let exact = null, partial = null;
    nodes.forEach(n => {
      if(exact) return;
      const l = norm(n.getAttribute('title') || n.getAttribute('aria-label') || n.textContent);
      if(!l) return;
      if(l === target) exact = n;
      else if(!partial && l.includes(target)) partial = n;
    });
    return exact || partial;
  }
  function doClick(el){
    el.scrollIntoView({block:'center', behavior:'smooth'});
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true}));
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true}));
    el.click();
  }
  reg('click', 'rest', 'action',
    'click <element label> — click any labeled UI control by its visible text/title/aria-label. Limitless — no batch confirmation, no cooldown.',
    (label) => {
      if(!label) return 'Missing element label.';
      const el = findClickable(label);
      if(!el) return 'No clickable element found matching "' + label + '".';
      doClick(el);
      return 'Clicked "' + label + '".';
    }
  );
  reg('clickables', 'none', 'info', 'List every currently visible, enabled, clickable UI control by label.', () => {
    const t = collectClickTargets();
    if(!t.length) return 'No clickable controls visible right now.';
    return t.length + ' clickable control(s):\n' + t.join('\n');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  EXPLORE MODE
  // ═══════════════════════════════════════════════════════════════════════
  function collectClickableLabels(){
    const nodes = document.querySelectorAll('button[title], button[aria-label], .tbtn[title], .mbtn, .aw-header-label, .sb-title');
    const labels = new Set();
    nodes.forEach(n => {
      const label = (n.getAttribute('title') || n.getAttribute('aria-label') || n.textContent || '').trim().replace(/\s+/g,' ');
      if(label && label.length < 40) labels.add(label);
    });
    return [...labels].slice(0, 90);
  }

  function buildExploreContext(){
    const parts = [];
    parts.push('UI overview (informational only — not clickable by you, describes what exists in the app):');
    parts.push(collectClickableLabels().join(', '));
    if(elAllowed('counts')){
      parts.push('');
      parts.push('Pages: ' + document.querySelectorAll('#editorArea .page').length + ' | Words: ' + (textOf('wordCount')||'0'));
    }
    const mode = cfg.explore.pages;
    if(mode === 'aichoice'){
      parts.push('');
      parts.push('Page text: not attached — call /pagetext <n> for whichever page(s) you need.');
    } else if(elAllowed('content')){
      const pages = mode === 'all' ? null : allowedPages();
      parts.push('');
      parts.push('Document text' + (pages ? (' (pages ' + pages.join(',') + ')') : ' (full document)') + ':');
      document.querySelectorAll('#editorArea .page-content').forEach((pc, idx) => {
        const n = idx + 1;
        if(pages && !pages.includes(n)) return;
        if(mode !== 'all' && !pageAllowed(n)) return;
        const text = pc.textContent.trim();
        parts.push('--- Page ' + n + ' ---\n' + (text ? text.slice(0, 2000) : '(empty)'));
      });
    }
    return parts.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  COMMAND PARSING
  // ═══════════════════════════════════════════════════════════════════════
  function parseCommands(text){
    const found = [];
    text.split('\n').forEach(line => {
      const m = line.match(/^\s*\/([a-zA-Z]+)\s*(.*)$/);
      if(!m) return;
      const name = m[1].toLowerCase(), argsRaw = m[2].trim();
      if(!CMDS[name]) return;
      const c = CMDS[name];
      let args = [];
      if(c.argMode === 'words') args = argsRaw.length ? argsRaw.split(/\s+/) : [];
      else if(c.argMode === 'rest') args = [argsRaw];
      found.push({name, args, raw: line.trim()});
    });
    return found;
  }
  function runCommand(cmd){
    try { return CMDS[cmd.name].run.apply(null, cmd.args); }
    catch(e){ return 'Error running /' + cmd.name + ': ' + e.message; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PEERJS CONNECTION + AUTO-RECONNECT
  // ═══════════════════════════════════════════════════════════════════════
  let peer = null;
  let conn = null;
  let connState = 'disconnected';   // 'disconnected' | 'connecting' | 'connected' | 'error'

  // Auto-reconnect bookkeeping
  let _deliberateDisconnect = false; // set true when we close the link on purpose
  let _autoRetryCount = 0;           // 0..MAX_AUTO_RETRIES
  let _autoRetryTimer = null;        // setTimeout handle
  let _isAutoRetrying = false;       // true while an auto-retry attempt is in flight
  let _connectingCode = null;        // the peer code the current attempt is for

  function ensurePeerJS(){
    if(window.Peer) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load PeerJS'));
      document.head.appendChild(s);
    });
  }

  function clearAutoRetryTimer(){
    if(_autoRetryTimer){ clearTimeout(_autoRetryTimer); _autoRetryTimer = null; }
  }

  // A "user-initiated" connect resets the retry budget — so if the user
  // manually clicks Connect, they always get 3 fresh tries.
  function resetRetryBudget(){
    _autoRetryCount = 0;
    _isAutoRetrying = false;
    clearAutoRetryTimer();
  }

  function scheduleAutoRetry(reason){
    if(!cfg.autoConnect) return;
    if(_autoRetryCount >= MAX_AUTO_RETRIES){
      logLine('err', 'auto-connect gave up after ' + MAX_AUTO_RETRIES + ' failed attempts. Click Connect to try again.');
      setConnState('error', 'Auto-connect stopped');
      return;
    }
    const delayMs = RETRY_DELAYS_MS[Math.min(_autoRetryCount, RETRY_DELAYS_MS.length - 1)];
    _autoRetryCount++;
    _isAutoRetrying = true;
    clearAutoRetryTimer();

    const attempt = _autoRetryCount;
    logLine('sys', 'auto-connect attempt ' + attempt + '/' + MAX_AUTO_RETRIES + ' in ' + (delayMs/1000) + 's (' + reason + ')');
    setConnState('connecting', 'auto-reconnect ' + attempt + '/' + MAX_AUTO_RETRIES + '…');

    _autoRetryTimer = setTimeout(() => {
      _autoRetryTimer = null;
      if(_deliberateDisconnect) return;
      if(connState === 'connected') return;
      connect(cfg.peerCode, { isAuto: true });
    }, delayMs);
  }

  async function connect(code, opts){
    opts = opts || {};
    code = (code || '').trim().toUpperCase();
    if(!code){
      logLine('sys', 'Enter a peer code first.');
      return;
    }

    // A user-initiated connect resets the retry budget; auto-retry does not
    if(!opts.isAuto) resetRetryBudget();

    // Remember for auto-reconnect
    cfg.peerCode = code;
    saveCfg();
    const input = document.getElementById('vmPeerCodeInput');
    if(input) input.value = code;
    _connectingCode = code;

    // Tear down any previous peer, but mark the close as deliberate
    // so its 'close' handler doesn't try to auto-reconnect.
    _deliberateDisconnect = true;
    disconnectInternal();
    _deliberateDisconnect = false;

    setConnState('connecting', (opts.isAuto ? 'auto-reconnecting to ' : 'Connecting to ') + 'vurminal-' + code + '…');
    logLine('sys', (opts.isAuto ? 'auto-reconnecting to ' : 'Connecting to ') + 'vurminal-' + code + '…');

    try { await ensurePeerJS(); }
    catch(e){
      setConnState('error', 'PeerJS failed to load');
      logLine('err', e.message);
      _isAutoRetrying = false;
      scheduleAutoRetry('PeerJS load failed');
      return;
    }

    peer = new Peer({ debug: 1 });

    peer.on('open', () => {
      conn = peer.connect('vurminal-' + code, { reliable: true });

      conn.on('open', () => {
        // Success — reset retry budget and go green
        _autoRetryCount = 0;
        _isAutoRetrying = false;
        clearAutoRetryTimer();
        setConnState('connected', 'Connected to vurminal-' + code);
        logLine('sys', 'Connected.');
        const commands = Object.keys(CMDS).sort().map(k => ({
          name: k, argMode: CMDS[k].argMode, kind: CMDS[k].kind, help: CMDS[k].help
        }));
        send({
          type: 'hello',
          version: VURMINAL_VERSION,
          addon: 'vurminal',
          commands: commands,
          config: cfg
        });
        if(cfg.explore.enabled) sendContext();
      });

      conn.on('data', handleIncoming);

      conn.on('close', () => {
        const wasConnected = connState === 'connected';
        setConnState('disconnected', 'Disconnected');
        logLine('sys', 'Disconnected.');
        if(_deliberateDisconnect){
          // The user, the receiver, or page unload asked for this — done.
          _isAutoRetrying = false;
          return;
        }
        if(!wasConnected) return;    // didn't get far enough to matter
        if(!cfg.autoConnect){
          logLine('sys', 'auto-connect is off. Click Connect to try again.');
          return;
        }
        scheduleAutoRetry('connection closed');
      });

      conn.on('error', (err) => {
        logLine('err', 'Connection error: ' + (err && err.message || err));
      });
    });

    peer.on('error', (err) => {
      const t = (err && err.type) || 'unknown';
      const msg = (err && err.message) || '';
      setConnState('error', 'PeerJS error: ' + t + (msg ? ' — ' + msg : ''));
      logLine('err', 'PeerJS error: ' + t + (msg ? ' — ' + msg : ''));

      // 'peer-unavailable' means the receiver isn't there yet — a common
      // case for auto-retry: the receiver may have restarted and the
      // peer ID isn't registered. Treat as a failed attempt.
      if(!opts.isAuto && t !== 'peer-unavailable'){
        // A fresh user-initiated failure: still counts as one failed attempt
        // only if auto-connect is on. If off, we just stop.
      }
      _isAutoRetrying = false;
      if(!_deliberateDisconnect){
        scheduleAutoRetry(t === 'peer-unavailable' ? 'receiver not registered' : 'peer error');
      }
    });
  }

  function disconnectInternal(){
    if(conn){ try { conn.close(); } catch(e){} conn = null; }
    if(peer){ try { peer.destroy(); } catch(e){} peer = null; }
  }

  // Public disconnect — called by the Disconnect button and the receiver's
  // 'bye' message. Sets the deliberate flag so no auto-retry is scheduled.
  function disconnect(announce = true){
    _deliberateDisconnect = true;
    resetRetryBudget();
    disconnectInternal();
    if(connState === 'connected' || connState === 'connecting'){
      setConnState('disconnected', 'Disconnected');
      if(announce) logLine('sys', 'Disconnected.');
    } else {
      setConnState('disconnected', 'Disconnected');
    }
    // Re-enable the connect button for the next attempt
    setConnState('disconnected', 'Disconnected');
    setTimeout(() => { _deliberateDisconnect = false; }, 100);
  }

  function send(obj){
    if(!conn || !conn.open) return false;
    try { conn.send(obj); return true; } catch(e){ return false; }
  }

  function handleIncoming(data){
    if(!data || typeof data !== 'object') return;
    switch(data.type){
      case 'command': {
        const raw = String(data.raw || '').trim();
        if(!raw) { send({ type:'response', id: data.id, ok:false, result:'Empty command.' }); return; }
        const cmds = parseCommands(raw);
        if(!cmds.length){
          const parsed = parseCommands('/' + raw);
          if(parsed.length) { runParsed(parsed, data, raw); return; }
          send({ type:'response', id: data.id, ok:false, result:'Unrecognised command: ' + raw });
          logLine('err', 'Unrecognised: ' + raw);
          return;
        }
        runParsed(cmds, data, raw);
        break;
      }
      case 'config': {
        if(data.config){
          cfg = Object.assign({}, cfg, data.config, {
            elements: Object.assign({}, cfg.elements, data.config.elements || {}),
            explore: Object.assign({}, cfg.explore, data.config.explore || {})
          });
          saveCfg();
          logLine('sys', 'Config updated from receiver.');
        }
        break;
      }
      case 'getContext': { sendContext(); break; }
      case 'ping': { send({ type:'pong', ts: Date.now() }); break; }

      // A clean "I'm going away" from the receiver. Treat as deliberate
      // so the add-on doesn't try to auto-reconnect into a void.
      case 'bye': {
        logLine('sys', 'Receiver said goodbye.');
        disconnect(false);
        break;
      }
      default: break;
    }
  }

  function runParsed(cmds, data, rawLabel){
    const results = [];
    const t0 = performance.now();
    cmds.forEach(c => {
      const r = runCommand(c);
      results.push({ name: c.name, raw: c.raw, result: r });
      logLine(c.kind === 'action' ? 'in' : 'in', c.raw);
      logLine('out', String(r).split('\n')[0].slice(0, 200));
    });
    const t1 = performance.now();
    send({
      type: 'response',
      id: data.id,
      raw: rawLabel,
      results: results,
      ok: true,
      ms: Math.round(t1 - t0)
    });
  }

  function sendContext(){
    if(!conn || !conn.open) return;
    try {
      send({ type:'context', context: buildExploreContext(), config: cfg });
      logLine('sys', 'Sent editor context.');
    } catch(e){
      logLine('err', 'Context failed: ' + e.message);
    }
  }

  // ── Download hook ────────────────────────────────────────────────────
  const DOWNLOAD_SIZE_LIMIT = 6 * 1024 * 1024;
  function hookDownloads(){
    if(typeof window.dlBlob !== 'function'){ setTimeout(hookDownloads, 200); return; }
    if(window.dlBlob.__vurminalHooked) return;
    const orig = window.dlBlob;
    window.dlBlob = function(blob, name){
      try {
        if(conn && conn.open && blob instanceof Blob){
          send({ type:'download', name: name, size: blob.size, mime: blob.type });
          if(blob.size <= DOWNLOAD_SIZE_LIMIT){
            const reader = new FileReader();
            reader.onload = () => {
              if(conn && conn.open && reader.result){
                send({ type:'downloadData', name: name, mime: blob.type, size: blob.size, data: reader.result });
              }
            };
            reader.readAsArrayBuffer(blob);
          }
          logLine('out', '📎 ' + name + ' (' + formatBytes(blob.size) + ')');
        }
      } catch(e){}
      return orig.call(this, blob, name);
    };
    window.dlBlob.__vurminalHooked = true;
  }
  function formatBytes(b){
    if(b < 1024) return b + ' B';
    if(b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    return (b/(1024*1024)).toFixed(2) + ' MB';
  }

  // ── Sidebar UI ───────────────────────────────────────────────────────
  let vmLogEl = null;
  function logLine(kind, text){
    if(!vmLogEl) vmLogEl = document.getElementById('vmLog');
    if(!vmLogEl) return;
    const line = document.createElement('div');
    line.className = 'vm-log-line vm-log-' + (kind === 'in' ? 'in' : kind === 'out' ? 'out' : kind === 'err' ? 'err' : 'sys');
    const ts = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    line.textContent = '[' + ts + '] ' + text;
    vmLogEl.appendChild(line);
    vmLogEl.scrollTop = vmLogEl.scrollHeight;
    while(vmLogEl.children.length > 100) vmLogEl.removeChild(vmLogEl.firstChild);
  }

  function setConnState(state, text){
    connState = state;
    const box = document.getElementById('vmStatus');
    const txt = document.getElementById('vmStatusText');
    const btn = document.getElementById('vmConnectBtn');
    if(box) box.className = 'vm-status vm-' + state;
    if(txt) txt.textContent = text || state;
    if(btn){
      if(state === 'connected'){
        btn.className = 'vm-btn vm-btn-disconnect';
        btn.innerHTML = '<span class="material-symbols-outlined">link_off</span>Disconnect';
        btn.disabled = false;
        btn.onclick = () => disconnect(true);
      } else if(state === 'connecting'){
        btn.className = 'vm-btn vm-btn-connect';
        btn.innerHTML = '<span class="material-symbols-outlined">sync</span>' + (text || 'Connecting…');
        btn.disabled = true;
        btn.onclick = null;
      } else if(state === 'error'){
        btn.className = 'vm-btn vm-btn-connect';
        btn.innerHTML = '<span class="material-symbols-outlined">link</span>Retry';
        btn.disabled = false;
        btn.onclick = () => {
          const inp = document.getElementById('vmPeerCodeInput');
          connect(inp ? inp.value : cfg.peerCode);
        };
      } else {
        btn.className = 'vm-btn vm-btn-connect';
        btn.innerHTML = '<span class="material-symbols-outlined">link</span>Connect';
        btn.disabled = false;
        btn.onclick = () => {
          const inp = document.getElementById('vmPeerCodeInput');
          connect(inp ? inp.value : cfg.peerCode);
        };
      }
    }
  }

  function buildSidebarSection(){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar) return;
    const section = document.createElement('div');
    section.className = 'sb-section';
    section.id = 'vmSbSection';
    section.dataset.sugarcaneAddon = 'vurminal';
    section.innerHTML = `
      <div class="aw-header" id="vmHeaderToggle">
        <span class="aw-header-label aw-label-blue">Vurminal</span>
        <div class="aw-header-right">
          <span class="material-symbols-outlined aw-chevron" id="vmChevron">expand_more</span>
        </div>
      </div>
      <div class="aw-dropdown" id="vmDropdown">
        <div class="aw-inner">
          <label class="vm-cfg-label">Peer code</label>
          <input type="text" class="vm-cfg-input" id="vmPeerCodeInput" placeholder="ABCDE" maxlength="12" value="${esc(cfg.peerCode||'')}" autocomplete="off"/>
          <div class="vm-hint">Open <strong>https://mahi902.github.io/DocuWritePro/Vurminal.html</strong>, copy its code, paste it here, and Connect.</div>

          <div class="aw-row" style="margin-top:8px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div>
              <div class="aw-row-label" style="font-size:12px;color:#333;">Auto-connect</div>
              <div class="aw-row-sub" style="font-size:11px;color:#999;margin-top:1px;">Reconnect automatically if the link drops</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="vmAutoConnectToggle" ${cfg.autoConnect ? 'checked' : ''}/>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <button class="vm-btn vm-btn-connect" id="vmConnectBtn" type="button">
            <span class="material-symbols-outlined">link</span>Connect
          </button>
          <div class="vm-status vm-disconnected" id="vmStatus">
            <span class="vm-dot"></span>
            <span id="vmStatusText">Disconnected</span>
          </div>
          <div class="vm-log" id="vmLog"></div>
          <div class="vm-hint">v${VURMINAL_VERSION} · ${Object.keys(CMDS).length} commands</div>
        </div>
      </div>`;
    const collapseBtn = sidebar.querySelector('.collapse-btn');
    if(collapseBtn) sidebar.insertBefore(section, collapseBtn);
    else sidebar.appendChild(section);

    document.getElementById('vmHeaderToggle').addEventListener('click', () => {
      const open = document.getElementById('vmDropdown').classList.toggle('open');
      document.getElementById('vmChevron').classList.toggle('open', open);
    });

    const input = document.getElementById('vmPeerCodeInput');
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
    });
    input.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); connect(input.value); }
    });

    const btn = document.getElementById('vmConnectBtn');
    btn.onclick = () => connect(input.value);

    const autoToggle = document.getElementById('vmAutoConnectToggle');
    autoToggle.checked = !!cfg.autoConnect;
    autoToggle.addEventListener('change', () => {
      cfg.autoConnect = autoToggle.checked;
      saveCfg();
      if(cfg.autoConnect){
        logLine('sys', 'Auto-connect enabled.');
        // If we're currently down and have a code, kick off a retry
        if(connState !== 'connected' && cfg.peerCode){
          resetRetryBudget();
          scheduleAutoRetry('auto-connect enabled');
        }
      } else {
        logLine('sys', 'Auto-connect disabled.');
        clearAutoRetryTimer();
        _isAutoRetrying = false;
      }
    });

    vmLogEl = document.getElementById('vmLog');
    logLine('sys', 'Vurminal ' + VURMINAL_VERSION + ' ready.');
    if(cfg.peerCode){
      logLine('sys', 'Saved peer code: ' + cfg.peerCode);
      // Auto-connect on load (but only once, and only if the toggle is on)
      if(cfg.autoConnect){
        setTimeout(() => {
          if(_deliberateDisconnect) return;
          if(connState === 'connected') return;
          resetRetryBudget();
          connect(cfg.peerCode, { isAuto: true });
        }, 1500);
      }
    } else {
      logLine('sys', 'Awaiting peer code.');
    }
  }

  // ── Page unload — mark as deliberate so no retry fires during teardown ──
  window.addEventListener('beforeunload', () => {
    _deliberateDisconnect = true;
    clearAutoRetryTimer();
    if(conn) try { conn.send({ type:'leaving' }); } catch(e){}
  });

  // ── INIT ─────────────────────────────────────────────────────────────
  function init(){
    buildSidebarSection();
    hookDownloads();
    setTimeout(hookDownloads, 2000);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();

  window.VurminalAddon = {
    VERSION: VURMINAL_VERSION,
    connect, disconnect, sendContext,
    getConfig: () => cfg,
    setConfig: (c) => { cfg = Object.assign({}, cfg, c); saveCfg(); },
    listCommands: () => Object.keys(CMDS).sort(),
    getRetryState: () => ({
      autoConnect: !!cfg.autoConnect,
      attempt: _autoRetryCount,
      max: MAX_AUTO_RETRIES,
      isAutoRetrying: _isAutoRetrying,
      deliberateDisconnect: _deliberateDisconnect
    })
  };
})();
