/* ═══════════════════════════════════════════════════════════════════════
   Sugarcane Add-on: Vurminal
   Vurminal is a real terminal (a standalone receiver .html) that connects
   to this editor over PeerJS. You type commands in the terminal — the same
   80+ slash-command protocol Connect with Pollinations exposes to an AI —
   and this add-on receives them, executes them against the live document,
   and sends the results back. No AI in the loop: the person typing in the
   terminal IS the "model" here. No click budget, no approval gate — every
   command runs immediately. Config (page scope, element permissions,
   Explore Mode) lives in the terminal's own menu and is pushed to this
   add-on over the connection rather than configured here.
═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  const VURMINAL_VERSION = '1.5.0'; // kept in lockstep with Connect with Pollinations
  const CFG_KEY = 'sugarcane_addon_vurminal_config';

  const defaults = {
    lastPeerId: '',
    scopePages: 'all',       // 'all' | 'current' | comma list e.g. "1,3"
    elements: {
      header: true, footer: true, watermark: true, background: true,
      margins: true, counts: true, content: true, selection: true, tables: true
    },
    explore: { enabled: false, pages: 'selected' }, // 'all' | 'selected' | 'aichoice'
    allowClicks: true // Vurminal is limitless — no batch gate — this only toggles /click on/off entirely
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

  // esc() is provided globally by the host (sceditor.html) — used below by
  // /findreplace and /insertlink, same as in Connect with Pollinations.

  // ── Editor helpers ───────────────────────────────────────────────────
  function activePage(){
    return document.querySelector('.page-content:focus') || document.querySelector('#editorArea .page-content');
  }
  function pageNumFromEl(el){
    // Page IDs are NOT guaranteed sequential — pages inserted via
    // addPageAfter()/addPageBefore() get timestamp+random uid-based IDs.
    // Always resolve position from live DOM order, matching how the host
    // itself computes the current page number (getCurrentPageNum()).
    if(!el) return 1;
    const contentEl = el.matches && el.matches('.page-content') ? el : el.closest('.page-content');
    if(!contentEl) return 1;
    const all = [...document.querySelectorAll('#editorArea .page-content')];
    const idx = all.indexOf(contentEl);
    return idx === -1 ? 1 : idx + 1;
  }
  // DOM-order page lookups — the addressing scheme every /command below uses.
  function pageContentByNum(n){ return document.querySelectorAll('#editorArea .page-content')[n-1] || null; }
  function pageByNum(n){ return document.querySelectorAll('#editorArea .page')[n-1] || null; }
  function allowedPages(){
    if(cfg.scopePages === 'all') return null; // null = no restriction
    if(cfg.scopePages === 'current'){
      const p = activePage();
      return [pageNumFromEl(p)];
    }
    return cfg.scopePages.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  }
  function pageAllowed(n){
    const allowed = allowedPages();
    return allowed === null || allowed.includes(n);
  }
  function elAllowed(name){ return !!cfg.elements[name]; }
  function denyMsg(what){ return 'Permission denied: ' + what + ' access is currently off in Pollinations Configuration.'; }

  function textOf(id){ const el = document.getElementById(id); return el ? el.textContent.trim() : ''; }

  // Markdown → HTML for /insertmarkdown, /insertmarkdownat, and rendering the
  // AI's chat replies (which are themselves written in markdown). Covers
  // headers, bold/italic/bold+italic, strikethrough, inline code, fenced
  // code blocks, blockquotes, ordered/unordered lists, links and hr.
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
    // Pull fenced code blocks out first so nothing inside them gets touched
    // by the line-by-line passes below.
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

  // ── Command registry ─────────────────────────────────────────────────
  // argMode: 'none' | 'words' (space-split args) | 'rest' (remaining text as one string)
  const CMDS = {};
  function reg(name, argMode, kind, help, run){ CMDS[name] = {argMode, kind, help, run}; }

  reg('help', 'none', 'info', 'List every available command.', () => {
    return Object.keys(CMDS).sort().map(k => '/' + k + ' — ' + CMDS[k].help).join('\n');
  });

  reg('pagecount', 'none', 'info', 'Number of pages in the document.', () => {
    if(!elAllowed('counts')) return denyMsg('page count');
    return String(document.querySelectorAll('#editorArea .page').length);
  });

  reg('wordcount', 'none', 'info', 'Current word count.', () => {
    if(!elAllowed('counts')) return denyMsg('word count');
    return textOf('wordCount') || '0 words';
  });

  reg('margins', 'none', 'info', 'Current page margins (top/bottom/left/right, cm). Global — applies to every page.', () => {
    if(!elAllowed('margins')) return denyMsg('margins');
    const g = id => (document.getElementById(id) || {value:'2'}).value;
    return `top:${g('marginTop')}cm bottom:${g('marginBottom')}cm left:${g('marginLeft')}cm right:${g('marginRight')}cm`;
  });

  reg('pagebg', 'none', 'info', 'Current page background color(s).', () => {
    if(!elAllowed('background')) return denyMsg('page background');
    const g = id => (document.getElementById(id) || {value:''}).value;
    return `primary:${g('bgColor')} secondary:${g('bgColor2')}`;
  });

  reg('watermark', 'none', 'info', 'Current watermark text (empty if none). Global — applies to every page.', () => {
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

  // Converts a plain-text character range within a container into an actual
  // DOM Range, by walking its text nodes and accumulating lengths. Needed
  // because page content isn't one flat text node — it's whatever mix of
  // text nodes and inline elements (bold spans, links, etc.) formatting has
  // produced, so a character index has to be mapped through that structure.
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

  // Search text is easy to get subtly wrong versus what's actually in a
  // contenteditable page: the AI (or a user) may wrap the phrase in quotes,
  // and the page's real text may contain non-breaking spaces (inserted
  // automatically by the browser for repeated spaces) where the search
  // phrase has plain ones. Normalize both sides the same way before
  // comparing so /lookup doesn't fail on cosmetic mismatches like these —
  // this was the root cause of it reporting "not found" almost every time.
  function stripWrappingQuotes(s){
    return s.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
  }
  function normalizeForSearch(s){
    return s.replace(/\u00A0/g, ' ').replace(/[ \t]+/g, ' ');
  }

  reg('lookup', 'words', 'info',
    'lookup <n> <phrase...> — find every occurrence of a phrase on page n and report its character position(s), e.g. "15-27". Quotes around the phrase are optional and stripped automatically. Every character, including spaces, counts as one position. Feed a start-end pair into /select or /placecursor.',
    (n, ...rest) => {
      if(!elAllowed('content')) return denyMsg('page content');
      const num = parseInt(n,10) || 1;
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      let phrase = stripWrappingQuotes(rest.join(' '));
      if(!phrase) return 'Missing search phrase — use /lookup <page> <phrase>.';
      const pc = pageContentByNum(num);
      if(!pc) return 'Page ' + num + ' not found.';
      // Normalized copies are only used to LOCATE the match; reported
      // positions still index into the real (un-normalized) text, and since
      // normalization never changes string length here, offsets line up.
      const text = normalizeForSearch(pc.textContent);
      const needle = normalizeForSearch(phrase);
      const hits = [];
      let idx = 0;
      while(hits.length < 20 && (idx = text.indexOf(needle, idx)) !== -1){
        hits.push(idx + '-' + (idx + needle.length));
        idx += needle.length;
      }
      if(!hits.length){
        // Fall back to a case-insensitive pass before giving up, since a
        // near-miss on case is another common false "not found".
        const idxCI = text.toLowerCase().indexOf(needle.toLowerCase());
        if(idxCI !== -1) return 'Exact case not found, but a case-insensitive match exists at ' + idxCI + '-' + (idxCI + needle.length) + ' on page ' + num + '. Use /select ' + num + ' ' + idxCI + ' ' + (idxCI + needle.length) + ' if that\'s the right spot.';
        return 'Phrase "' + phrase + '" not found on page ' + num + '.';
      }
      return 'Page ' + num + ': ' + hits.length + ' occurrence(s) of "' + phrase + '" (' + needle.length + ' chars). Position(s) [start-end]: ' + hits.join(', ') + '. Use /select ' + num + ' <start> <end>, or /placecursor ' + num + ' <end> to insert right after a match.';
    }
  );

  // ── Insert-target resolution ─────────────────────────────────────────
  // Every insert command (/inserttext, /insertmarkdown, /inserttable,
  // /insertimage, /insertlink, /inserthr) goes through this before touching
  // the document, instead of blindly trusting document.execCommand to land
  // wherever the browser's ambient selection happens to be — that's what
  // made insertion "break" sometimes (nothing focused, or focus stolen by
  // the chat input, silently drops or misplaces the insert).
  //
  // Priority: 1) an explicit page:<n> override on the command  2) a
  // one-shot position set by the most recent /placecursor  3) the page
  // currently the user is actually looking at (scrolled into view),
  // inserting at its end.
  let pendingCursor = null; // {pageNum, pos} — set by /placecursor, consumed by the next insert

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
  // Strips an optional leading "page:<n> " directive off a raw arg string,
  // e.g. "page:2 Hello there" → {pageNum:2, rest:"Hello there"}.
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
      pendingCursor = null; // one-shot regardless of outcome below
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
      // fall through to the other strategies if the stored position went stale
    }
    // If the live selection is genuinely, currently sitting inside an
    // allowed page, trust it (covers a human having just clicked/typed).
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

  // ── "Insert via Pollinations" markers ────────────────────────────────
  // Right-click/hold → Insert → "Insert via Pollinations" drops one of
  // these (invisible) at the exact caret position, then opens the chat
  // pre-filled with its id so a later /insertat <id> lands exactly there —
  // more robust than a character offset since it's a real DOM node that
  // moves naturally with the document instead of going stale on edits.
  function findInsertMarker(id){
    return document.querySelector('.pl-insert-marker[data-pl-insert-id="' + String(id).replace(/"/g,'') + '"]');
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
    'select <n> <start> <end> — select page n\'s characters from start up to (not including) end, using positions from /lookup, so a following command like /bold acts on exactly that text.',
    (n, start, end) => {
      if(!elAllowed('selection')) return denyMsg('selection');
      const num = parseInt(n,10) || 1;
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      const s = parseInt(start,10), e = parseInt(end,10);
      if(isNaN(s) || isNaN(e) || s < 0 || e <= s) return 'Invalid range — use /select <page> <start> <end> with start < end (get these from /lookup).';
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
    'placecursor <n> <pos> — place the cursor at character position pos on page n (from /lookup). OR placecursor <n> before <text...> / placecursor <n> after <text...> — find the first occurrence of text (a word, a single character, or any phrase) on page n and place the cursor immediately before or after it in one step, no /lookup needed. Either form makes the next insert command (/inserttext, /insertmarkdown, /inserttable, /insertimage, /insertlink, /inserthr) land exactly there instead of wherever the cursor happened to be.',
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
        if(isNaN(p) || p < 0) return 'Invalid position — use /placecursor <page> <pos> (from /lookup), or /placecursor <page> before|after <text>.';
        describe = 'at position ' + p;
      }
      if(p > total) return 'Position exceeds page ' + num + '\'s length (' + total + ' characters).';
      const range = charOffsetToRange(pc, p, p);
      if(!range) return 'Could not resolve that position.';
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      pc.focus();
      // Also remember it independently of the live browser selection, and
      // re-applied by the next insert command right before it runs — a
      // plain Selection/Range can get silently cleared or moved (e.g. focus
      // shifting to the chat input) in the gap before that command executes.
      pendingCursor = {pageNum: num, pos: p};
      return 'Cursor placed ' + describe + ' on page ' + num + ' — the next insert command lands there.';
    }
  );

  reg('selection', 'none', 'info', 'Currently selected text, if any.', () => {
    if(!elAllowed('selection')) return denyMsg('selection');
    const s = window.getSelection ? window.getSelection().toString() : '';
    return s || '(no selection)';
  });

  reg('recall', 'words', 'info',
    'recall <count?> — show the last <count> messages of this document\'s chat history (default 5, max 200). Only the most recent ' + AUTO_HISTORY + ' are sent to you automatically each turn — use this to reach further back in a long session.',
    (n) => {
      const count = Math.min(200, Math.max(1, n ? (parseInt(n,10) || 5) : 5));
      if(!chat.length) return 'No prior history for this document.';
      const slice = chat.slice(-count);
      const label = m => m.role === 'assistant' ? 'AI' : (m.role === 'tool' ? 'Command result' : 'User');
      return 'Last ' + slice.length + ' of ' + chat.length + ' message(s):\n' + slice.map(m => label(m) + ': ' + m.text).join('\n---\n');
    }
  );

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
  reg('fontsize', 'words', 'action', 'fontsize <1-7> — set HTML font size on selection (execCommand scale, 1–7).', (n) => {
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

  reg('watermarkset', 'rest', 'action', 'watermarkset <text> — set the watermark text (global; empty text clears it).', (text) => {
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

  reg('inserttext', 'rest', 'action',
    'inserttext [page:<n>] <text> — insert plain text. Lands at a pending /placecursor position if one was just set, otherwise at the end of the page the user is currently viewing (or the given page, if you pass page:<n>). Use /insertmarkdown instead if the text has any markdown formatting in it.',
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
    'insertmarkdown [page:<n>] <markdown> — convert markdown (bold/italic/headers/lists/links/code/quotes) to formatted content and insert it — the raw markdown characters are stripped and never appear in the document. Same placement rules as /inserttext.',
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
    'insertat <id> <text> — insert plain text at the point the user marked via "Insert via Pollinations" in the right-click/hold Insert menu (the id was given to you in the prompt that opened this chat).',
    (raw) => {
      const sp = raw.indexOf(' ');
      const id = sp === -1 ? raw : raw.slice(0, sp);
      const text = sp === -1 ? '' : raw.slice(sp + 1);
      if(!id) return 'Missing marker id — use /insertat <id> <text>.';
      if(!text) return 'Nothing to insert.';
      const marker = findInsertMarker(id);
      if(!marker) return 'No pending insert point with id "' + id + '" — it may already have been used, or the user didn\'t open this chat via "Insert via Pollinations".';
      const num = pageNumFromEl(marker);
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      placeCaretAtMarker(marker);
      document.execCommand('insertText', false, text);
      marker.remove();
      return 'Inserted text at the marked point on page ' + num + '.';
    }
  );
  reg('insertmarkdownat', 'rest', 'action',
    'insertmarkdownat <id> <markdown> — like /insertat but converts markdown formatting first, same as /insertmarkdown.',
    (raw) => {
      const sp = raw.indexOf(' ');
      const id = sp === -1 ? raw : raw.slice(0, sp);
      const md = sp === -1 ? '' : raw.slice(sp + 1);
      if(!id) return 'Missing marker id — use /insertmarkdownat <id> <markdown>.';
      if(!md) return 'Nothing to insert.';
      const marker = findInsertMarker(id);
      if(!marker) return 'No pending insert point with id "' + id + '" — it may already have been used, or the user didn\'t open this chat via "Insert via Pollinations".';
      const num = pageNumFromEl(marker);
      if(!pageAllowed(num)) return denyMsg('page ' + num);
      placeCaretAtMarker(marker);
      document.execCommand('insertHTML', false, mdToHtml(md));
      marker.remove();
      return 'Inserted formatted content at the marked point on page ' + num + '.';
    }
  );
  reg('inserttable', 'words', 'action', 'inserttable [page:<n>] <rows> <cols> — insert a simple table. Same placement rules as /inserttext.', (a, b, c) => {
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

  // ── Find / replace (scope-aware, own implementation — the host's
  //    find/replace is wired to modal inputs rather than being standalone) ──
  function eachAllowedPage(cb){
    document.querySelectorAll('#editorArea .page-content').forEach((pc, idx) => {
      const n = idx + 1;
      if(pageAllowed(n)) cb(pc, n);
    });
  }
  reg('find', 'rest', 'info', 'find <text> — count occurrences of text across pages the AI can see.', (term) => {
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
  reg('findreplace', 'rest', 'action', 'findreplace <find>|<replace> — replace all occurrences across pages the AI can see (separate find/replace with a "|").', (arg) => {
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

  // ── Formatting extras ────────────────────────────────────────────────
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

  reg('inserthr', 'words', 'action', 'inserthr [page:<n>] — insert a horizontal divider. Same placement rules as /inserttext.', (a) => {
    const pm = (a||'').match(/^page:(\d+)$/i);
    const target = resolveInsertTarget(pm ? parseInt(pm[1],10) : null);
    if(target.error) return target.error;
    if(typeof _doInsertHR === 'function'){ _doInsertHR(); return 'Inserted a divider on page ' + pageNumFromEl(target.pc) + '.'; }
    return 'Divider function not available.';
  });
  reg('insertimage', 'rest', 'action', 'insertimage [page:<n>] <url> — insert an image. Same placement rules as /inserttext.', (raw) => {
    const {pageNum, rest: url} = extractPageDirective(raw);
    if(!url) return 'Missing image URL.';
    const target = resolveInsertTarget(pageNum);
    if(target.error) return target.error;
    document.execCommand('insertImage', false, url.trim());
    return 'Inserted image on page ' + pageNumFromEl(target.pc) + '.';
  });
  reg('insertlink', 'words', 'action', 'insertlink [page:<n>] <url> <text...> — insert a hyperlink. Same placement rules as /inserttext.', (a, ...rest) => {
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

  // ── Document-wide settings ───────────────────────────────────────────
  reg('linespacing', 'words', 'action', 'linespacing <value> — set line spacing (e.g. 1, 1.5, 2) across the document.', (v) => {
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

  // ── Zoom / navigation ────────────────────────────────────────────────
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

  // ── Stats ────────────────────────────────────────────────────────────
  function allowedText(){
    let out = '';
    eachAllowedPage(pc => { out += pc.textContent + ' '; });
    return out;
  }
  reg('charcount', 'none', 'info', 'Character count (no spaces) across pages the AI can see.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    return String(allowedText().replace(/\s/g,'').length) + ' characters';
  });
  reg('charcountspaces', 'none', 'info', 'Character count (with spaces) across pages the AI can see.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    return String(allowedText().length) + ' characters (incl. spaces)';
  });
  reg('sentencecount', 'none', 'info', 'Sentence count across pages the AI can see.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    return String(allowedText().split(/[.!?]+/).filter(s => s.trim().length > 2).length) + ' sentences';
  });
  reg('paragraphcount', 'none', 'info', 'Paragraph count across pages the AI can see.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    let count = 0;
    eachAllowedPage(pc => { count += pc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6').length || 1; });
    return String(count) + ' paragraphs';
  });
  reg('readingtime', 'none', 'info', 'Estimated reading time across pages the AI can see.', () => {
    if(!elAllowed('counts')) return denyMsg('counts');
    const words = allowedText().trim().split(/\s+/).filter(Boolean).length;
    return '~' + Math.max(1, Math.round(words / 200)) + ' min';
  });

  // ── Document title ───────────────────────────────────────────────────
  reg('doctitle', 'none', 'info', 'Current document title.', () => {
    return typeof getTitle === 'function' ? getTitle() : ((document.getElementById('docTitle')||{value:''}).value || 'Untitled');
  });
  reg('doctitleset', 'rest', 'action', 'doctitleset <text> — rename the document.', (text) => {
    const el = document.getElementById('docTitle');
    if(!el || !text) return 'Title field not found or text missing.';
    el.value = text; el.dispatchEvent(new Event('change', {bubbles:true}));
    return 'Title set to "' + text + '".';
  });

  // ── Export / print ───────────────────────────────────────────────────
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

  // ── Tables (row/column ops on the table nearest the cursor) ──────────
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

  // Direct DOM edits (textContent assignment, appendChild, etc. — as opposed
  // to document.execCommand, which dispatches this on its own) don't fire an
  // 'input' event by themselves, so the host's word-count/autosave listeners
  // (bound to 'input' on page-content) never see them. Call this after any
  // such edit so the document actually saves and stats stay accurate.
  function notifyContentChanged(pc){
    if(!pc) return;
    pc.dispatchEvent(new Event('input', {bubbles:true}));
    if(typeof scheduleAutoSave === 'function') scheduleAutoSave();
  }

  // ── Tables by ID ─────────────────────────────────────────────────────
  // Sugarcane tables have no built-in ID/name of their own, so the addon
  // assigns one the first time a table is seen — a short lowercase letter
  // code (a, b, c, ... z, aa, ab, ...), stamped onto the element itself so
  // it stays stable across calls for as long as that table exists.
  function allTables(){ return [...document.querySelectorAll('#editorArea table')]; }
  function idToLetters(num){
    let s = '', n = num + 1;
    while(n > 0){ n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }
  function ensureTableIds(){
    const used = new Set(allTables().map(t => t.getAttribute('data-pl-tid')).filter(Boolean));
    let n = 0;
    allTables().forEach(t => {
      if(t.getAttribute('data-pl-tid')) return;
      let id;
      do { id = idToLetters(n); n++; } while(used.has(id));
      t.setAttribute('data-pl-tid', id);
      used.add(id);
    });
  }
  function tableById(id){
    ensureTableIds();
    const target = String(id || '').toLowerCase().trim();
    return allTables().find(t => t.getAttribute('data-pl-tid') === target) || null;
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

  reg('tables', 'none', 'info', 'List every table in the document with its letter ID, dimensions, page, and an auto-derived name (its first cell\'s text) — use the ID with /tabledata, /tablecell, /tablecellset, /tableaddrow, /tableaddcol.', () => {
    if(!elAllowed('tables')) return denyMsg('tables');
    ensureTableIds();
    const list = allTables();
    if(!list.length) return 'No tables in the document.';
    return list.map(t => {
      const id = t.getAttribute('data-pl-tid');
      const {rows, cols} = tableDims(t);
      return id + ': ' + rows + '×' + cols + ' table on page ' + tablePageOf(t) + ' — "' + tableName(t) + '"';
    }).join('\n');
  });

  reg('tablesearch', 'rest', 'info', 'tablesearch <keyword...> — search every table\'s cell text for a keyword; reports the best-matching table\'s letter ID (by number of matching cells) plus any others that also matched.', (kw) => {
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
    const id = best.t.getAttribute('data-pl-tid');
    const {rows, cols} = tableDims(best.t);
    let out = 'Best match: table ' + id + ' (' + rows + '×' + cols + ' on page ' + tablePageOf(best.t) + ', ' + best.score + ' matching cell(s)) — e.g. "' + best.snippet + '".';
    if(scored.length > 1) out += ' Also matched: ' + scored.slice(1,5).map(x => x.t.getAttribute('data-pl-tid')).join(', ') + '.';
    return out;
  });

  reg('tabledata', 'words', 'info', 'tabledata <table id> — dump every cell of a table as a grid (one row per line, cells separated by " | ").', (id) => {
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

  reg('tablecellset', 'words', 'action', 'tablecellset <table id> <row> <col> <text...> — set one cell\'s text (row/col 1-indexed).', (id, r, c, ...rest) => {
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

  reg('tableaddrow', 'words', 'action', 'tableaddrow <table id> <top|bottom> — add a row to a specific side of a specific table (no cursor needed).', (id, side) => {
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

  reg('tableaddcol', 'words', 'action', 'tableaddcol <table id> <left|right> — add a column to a specific side of a specific table (no cursor needed).', (id, side) => {
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

  // ── Page management ──────────────────────────────────────────────────
  reg('duplicatepage', 'words', 'action', 'duplicatepage <n> — duplicate page n and insert the copy right after it.', (n) => {
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const srcPage = pageByNum(num);
    if(!srcPage) return 'Page ' + num + ' not found.';
    if(typeof addPageAfter !== 'function') return 'Page duplication function not available.';
    const srcHeader = srcPage.querySelector('.page-header-area');
    const srcContent = srcPage.querySelector('.page-content');
    const srcFooter = srcPage.querySelector('.page-footer-area');
    // addPageAfter() inserts after whichever page currently has editor
    // focus/context, not after an arbitrary page N — so point the host's
    // own context pointer at page N first, exactly like clicking into it
    // would, then restore it. This keeps cert-minting, indicator refresh,
    // etc. on the host's real code path instead of hand-rolling a clone.
    const hasS = typeof S !== 'undefined';
    const savedContext = hasS ? S.currentContextPage : undefined;
    if(hasS) S.currentContextPage = srcPage;
    addPageAfter();
    if(hasS) S.currentContextPage = savedContext;
    const newPage = pageByNum(num + 1); // sits right after srcPage
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

  // ── Click anything (Vurminal is limitless — no batch gate, no approval) ──
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
    'click <element label> — click any labeled UI control by its visible text/title/aria-label. Vurminal has no batch limit — click as many things as you need, back-to-back (toggle "Allow Clicks" off in the terminal menu to disable this entirely).',
    (label) => {
      if(!cfg.allowClicks) return 'Clicking is off — enable "Allow Clicks" in the Vurminal terminal menu.';
      if(!label) return 'Missing element label.';
      const el = findClickable(label);
      if(!el) return 'No clickable element found matching "' + label + '".';
      doClick(el);
      return 'Clicked "' + label + '".';
    }
  );

  function listClickTargets(){
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
    return [...labels].slice(0, 150);
  }
  reg('clickable', 'none', 'info', 'List every currently clickable UI control by label (feed one of these into /click).', () => {
    if(!cfg.allowClicks) return 'Clicking is off — enable "Allow Clicks" in the Vurminal terminal menu.';
    const t = listClickTargets();
    return t.length ? (t.length + ' clickable control(s): ' + t.join(', ')) : 'No clickable controls found.';
  });

  // ── Explore Mode: live editor context snapshot ──────────────────────
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

  // ── Command parsing / execution ──────────────────────────────────────
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

  // ── Vurminal link (PeerJS) ───────────────────────────────────────────
  // PeerJS is already loaded globally by sceditor.html (its own Realtime
  // Collaboration feature) — reused here rather than loading a second copy.
  let peer = null, conn = null;
  let vmStatusEl, vmPeerInput, vmConnectBtn, vmDisconnectBtn;

  function setStatus(text, cls){
    if(!vmStatusEl) return;
    vmStatusEl.textContent = text;
    vmStatusEl.className = 'vm-status' + (cls ? ' vm-status-' + cls : '');
  }

  function sendToTerminal(msg){
    if(conn && conn.open) { try { conn.send(msg); } catch(e){} }
  }

  // File-producing commands (export/print) notify the terminal so a
  // downloaded file shows up there too, same document the export ran on.
  const FILE_COMMANDS = {
    exporttxt: () => ({name: currentTitleGuess() + '.txt', note: 'Exported as .txt'}),
    exportscd: () => ({name: currentTitleGuess() + '.scd', note: 'Exported as .scd'}),
    print:     () => null // print doesn't produce a downloadable file
  };
  function currentTitleGuess(){
    try {
      if(typeof getTitle === 'function') return getTitle();
      const el = document.getElementById('docTitle');
      return (el && el.value) || 'Untitled';
    } catch(e){ return 'Untitled'; }
  }

  async function executeIncoming(text){
    const cmds = parseCommands(text);
    if(!cmds.length){
      sendToTerminal({t:'result', cmds: []});
      return;
    }
    const results = [];
    for(let i = 0; i < cmds.length; i++){
      sendToTerminal({t:'status', state:'executing', label: cmds[i].raw});
      const result = runCommand(cmds[i]);
      results.push(result);
      if(FILE_COMMANDS[cmds[i].name]){
        const info = FILE_COMMANDS[cmds[i].name]();
        if(info) sendToTerminal({t:'file', name: info.name, note: info.note});
      }
    }
    sendToTerminal({t:'status', state:'connected'});
    sendToTerminal({t:'result', cmds: cmds.map((c,i) => ({raw:c.raw, result:results[i]}))});
    if(cfg.explore.enabled) sendToTerminal({t:'context', text: buildExploreContext()});
  }

  function applyIncomingConfig(remoteCfg){
    if(!remoteCfg) return;
    cfg = Object.assign({}, defaults, cfg, remoteCfg, {
      elements: Object.assign({}, cfg.elements, remoteCfg.elements || {}),
      explore: Object.assign({}, cfg.explore, remoteCfg.explore || {})
    });
    saveCfg();
  }

  function handleTerminalMessage(msg){
    if(!msg || !msg.t) return;
    if(msg.t === 'config'){ applyIncomingConfig(msg.cfg); return; }
    if(msg.t === 'exec'){ executeIncoming(msg.text || ''); return; }
    if(msg.t === 'ping'){ sendToTerminal({t:'pong'}); return; }
  }

  function wireConnection(c){
    conn = c;
    conn.on('open', () => {
      setStatus('Connected', 'ok');
      vmConnectBtn.style.display = 'none';
      vmDisconnectBtn.style.display = '';
      cfg.lastPeerId = conn.peer; saveCfg();
      sendToTerminal({t:'hello', version: VURMINAL_VERSION});
      sendToTerminal({t:'status', state:'connected'});
      if(cfg.explore.enabled) sendToTerminal({t:'context', text: buildExploreContext()});
    });
    conn.on('data', handleTerminalMessage);
    conn.on('close', () => {
      setStatus('Not connected', '');
      vmConnectBtn.style.display = '';
      vmDisconnectBtn.style.display = 'none';
      conn = null;
    });
    conn.on('error', (e) => {
      setStatus('Connection error', 'err');
    });
  }

  function ensurePeer(cb){
    if(peer && !peer.destroyed){ cb(); return; }
    peer = new Peer(undefined, {debug:0});
    peer.on('open', cb);
    peer.on('error', () => setStatus('Link error — try again', 'err'));
  }

  function connectToTerminal(remoteId){
    remoteId = (remoteId || '').trim();
    if(!remoteId) return;
    setStatus('Connecting…', 'connecting');
    ensurePeer(() => {
      const c = peer.connect(remoteId, {reliable:true});
      c.on('open', () => wireConnection(c));
      c.on('error', () => setStatus('Could not reach that code', 'err'));
    });
  }

  function disconnectFromTerminal(){
    if(conn){ try { conn.close(); } catch(e){} conn = null; }
    setStatus('Not connected', '');
    vmConnectBtn.style.display = '';
    vmDisconnectBtn.style.display = 'none';
  }

  // ── Sidebar section ──────────────────────────────────────────────────
  function buildSidebarSection(){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar) return;
    const section = document.createElement('div');
    section.className = 'sb-section';
    section.id = 'vmSbSection';
    section.dataset.sugarcaneAddon = 'vurminal';
    section.innerHTML =
      '<div class="aw-header" id="vmHeaderToggle">' +
        '<span class="aw-header-label aw-label-blue">Vurminal</span>' +
        '<div class="aw-header-right"><span class="material-symbols-outlined aw-chevron" id="vmChevron">expand_more</span></div>' +
      '</div>' +
      '<div class="aw-dropdown" id="vmDropdown">' +
        '<div class="aw-inner">' +
          '<label class="pl-cfg-label">Peer code (from the Vurminal terminal)</label>' +
          '<div class="pl-input-row">' +
            '<input type="text" class="pl-cfg-input" id="vmPeerInput" placeholder="e.g. vur-7f2ad91" autocomplete="off">' +
            '<button type="button" class="pl-paste-btn" id="vmPeerPasteBtn" title="Paste from clipboard"><span class="material-symbols-outlined">content_paste</span></button>' +
          '</div>' +
          '<div id="vmStatus" class="vm-status">Not connected</div>' +
          '<button type="button" class="tc-mod-btn pl-open-chat-btn" id="vmConnectBtn"><span class="material-symbols-outlined">link</span>Connect to Vurminal</button>' +
          '<button type="button" class="tc-mod-btn pl-open-chat-btn vm-disconnect-btn" id="vmDisconnectBtn" style="display:none;"><span class="material-symbols-outlined">link_off</span>Disconnect</button>' +
          '<div class="vm-hint">Open the Vurminal receiver page, copy its code, paste it above. Everything else — page scope, element permissions, Explore Mode — is configured from Vurminal&#39;s own menu.</div>' +
        '</div>' +
      '</div>';
    const collapseBtn = sidebar.querySelector('.collapse-btn');
    if(collapseBtn) sidebar.insertBefore(section, collapseBtn);
    else sidebar.appendChild(section);

    document.getElementById('vmHeaderToggle').addEventListener('click', () => {
      const open = document.getElementById('vmDropdown').classList.toggle('open');
      document.getElementById('vmChevron').classList.toggle('open', open);
    });

    vmStatusEl = document.getElementById('vmStatus');
    vmPeerInput = document.getElementById('vmPeerInput');
    vmConnectBtn = document.getElementById('vmConnectBtn');
    vmDisconnectBtn = document.getElementById('vmDisconnectBtn');
    if(cfg.lastPeerId) vmPeerInput.value = cfg.lastPeerId;

    vmConnectBtn.addEventListener('click', () => connectToTerminal(vmPeerInput.value));
    vmDisconnectBtn.addEventListener('click', disconnectFromTerminal);
    vmPeerInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') connectToTerminal(vmPeerInput.value); });
    document.getElementById('vmPeerPasteBtn').addEventListener('click', async () => {
      try { const text = await navigator.clipboard.readText(); if(text != null) vmPeerInput.value = text.trim(); } catch(e){}
    });
  }

  function init(){
    buildSidebarSection();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
