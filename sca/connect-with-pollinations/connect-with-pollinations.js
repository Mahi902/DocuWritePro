/* ═══════════════════════════════════════════════════════════════════════
   Sugarcane Add-on: Connect with Pollinations
   Adds a "Pollinations Configuration" sidebar dropdown for wiring up a
   Pollinations (pollinations.ai) AI model, plus a dockable chat panel. The AI can read and
   control the editor through a slash-command protocol: a fixed set of
   info/action commands, scoped by what the user has allowed it to see.

   Honest scope note (kept out of the UI, left here for future-you):
   Sugarcane doesn't have true per-page margins/background/watermark —
   those are single global settings shared by every page. So commands
   like /marginset and /bgset act globally, not per page, and the
   command set below covers a broad, real slice of the editor rather
   than literally every menu action — the registry is written so new
   commands are a ~5-line addition.
═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  const CFG_KEY = 'sugarcane_addon_pollinations_config';
  const CHAT_KEY = 'sugarcane_addon_pollinations_chat';

  const defaults = {
    apiKey: '',
    model: 'openai',
    autoExecute: false,
    scopePages: 'all',       // 'all' | 'current' | comma list e.g. "1,3"
    elements: {
      header: true, footer: true, watermark: true, background: true,
      margins: true, counts: true, content: true, selection: true, tables: true
    },
    dockMode: 'docked',      // 'docked' | 'floating'
    explore: {
      enabled: false,
      pages: 'selected'      // 'all' | 'selected' (uses scopePages) | 'aichoice'
    },
    allowClicks: false,       // master switch for the /click command (gated, 30-click batches)
    allowScreenShare: false   // sends a live on-screen clickable-control snapshot every message,
                              // and lifts the click batch limit entirely
  };

  // Click-session budget. Deliberately NOT persisted to localStorage — every
  // fresh page load starts at 0, so a new session always needs a confirmation
  // before the AI can click anything.
  let clickBudget = 0;
  const CLICK_BATCH = 30;

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

  let chat = loadChat();
  function loadChat(){ try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); } catch(e){ return []; } }
  function saveChat(){ try { localStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-60))); } catch(e){} }

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

  // Minimal markdown → HTML (bold/italic/headers/lists/links) for /insertmarkdown
  function mdToHtml(md){
    let h = md
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/^### (.*)$/gm,'<h3>$1</h3>')
      .replace(/^## (.*)$/gm,'<h2>$1</h2>')
      .replace(/^# (.*)$/gm,'<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
      .replace(/\*(.+?)\*/g,'<i>$1</i>')
      .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>')
      .replace(/^- (.*)$/gm,'<li>$1</li>');
    h = h.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
    return h.split('\n').map(l => (/^<(h1|h2|h3|ul|li)/.test(l) ? l : (l.trim() ? '<p>'+l+'</p>' : ''))).join('');
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
    el.textContent = rest.join(' '); return 'Header on page ' + num + ' updated.';
  });
  reg('footerset', 'words', 'action', 'footerset <n> <text...> — set page n\'s footer text.', (n, ...rest) => {
    if(!elAllowed('footer')) return denyMsg('page footer');
    const num = parseInt(n,10) || 1;
    if(!pageAllowed(num)) return denyMsg('page ' + num);
    const p = pageByNum(num); if(!p) return 'Page ' + num + ' not found.';
    const el = p.querySelector('.page-footer-area'); if(!el) return 'Page ' + num + ' not found.';
    el.textContent = rest.join(' '); return 'Footer on page ' + num + ' updated.';
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

  reg('inserttext', 'rest', 'action', 'inserttext <text> — insert plain text at the cursor.', (text) => {
    if(!text) return 'Nothing to insert.';
    document.execCommand('insertText', false, text); return 'Inserted text.';
  });
  reg('insertmarkdown', 'rest', 'action', 'insertmarkdown <markdown> — convert basic markdown (bold/italic/headers/lists/links) and insert at the cursor.', (md) => {
    if(!md) return 'Nothing to insert.';
    document.execCommand('insertHTML', false, mdToHtml(md)); return 'Inserted formatted content.';
  });
  reg('inserttable', 'words', 'action', 'inserttable <rows> <cols> — insert a simple table at the cursor.', (r, c) => {
    if(!elAllowed('tables')) return denyMsg('tables');
    const rows = Math.max(1, parseInt(r,10)||2), cols = Math.max(1, parseInt(c,10)||2);
    let h = '<table style="border-collapse:collapse;width:100%;margin:10px 0;"><tbody>';
    for(let i=0;i<rows;i++){ h += '<tr>'; for(let j=0;j<cols;j++) h += '<td style="border:1px solid #ccc;padding:6px 8px;min-width:40px;">&nbsp;</td>'; h += '</tr>'; }
    h += '</tbody></table>';
    document.execCommand('insertHTML', false, h);
    return 'Inserted a ' + rows + '×' + cols + ' table.';
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

  reg('inserthr', 'none', 'action', 'Insert a horizontal divider at the cursor.', () => {
    if(typeof _doInsertHR === 'function'){ _doInsertHR(); return 'Inserted a divider.'; }
    return 'Divider function not available.';
  });
  reg('insertimage', 'rest', 'action', 'insertimage <url> — insert an image at the cursor.', (url) => {
    if(!url) return 'Missing image URL.';
    document.execCommand('insertImage', false, url.trim()); return 'Inserted image.';
  });
  reg('insertlink', 'words', 'action', 'insertlink <url> <text...> — insert a hyperlink at the cursor.', (url, ...rest) => {
    if(!url) return 'Missing link URL.';
    const label = rest.join(' ') || url;
    document.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc(label) + '</a>');
    return 'Inserted link.';
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

  // ── Click anything (gated: batches of CLICK_BATCH need user confirmation) ──
  function collectClickTargets(){
    // Same selector findClickable() matches against, so the list the AI is
    // given is exactly what /click can actually hit — no phantom options.
    // Filtered to what's genuinely visible & usable right now (hidden modal
    // contents, disabled controls excluded) so it reflects the live screen.
    const nodes = document.querySelectorAll(
      'button, [onclick], a[href], input[type="checkbox"], input[type="radio"], select, .tbtn, .mbtn, .aw-header, .sb-title'
    );
    const labels = new Set();
    nodes.forEach(n => {
      if(n.disabled) return;
      if(n.offsetParent === null && getComputedStyle(n).position !== 'fixed') return; // hidden (display:none or in a closed panel)
      if(getComputedStyle(n).visibility === 'hidden') return;
      const label = (n.getAttribute('title') || n.getAttribute('aria-label') || n.textContent || '').trim().replace(/\s+/g,' ');
      if(label && label.length < 60) labels.add(label);
    });
    return [...labels].slice(0, 150);
  }
  function buildScreenShareContext(){
    const targets = collectClickTargets();
    return 'Clickable controls currently on screen (' + targets.length + '), click any of these EXACTLY by label via /click:\n' + targets.join(', ');
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
    'click <element label> — click any labeled UI control by its visible text/title/aria-label (needs "Allow UI Clicks", gated in batches of ' + CLICK_BATCH + ', or "Allow Screen Share" for unlimited back-to-back clicks).',
    (label) => {
      if(!cfg.allowClicks && !cfg.allowScreenShare) return 'Clicking is off — enable "Allow UI Clicks" or "Allow Screen Share" in Pollinations Configuration.';
      if(!cfg.allowScreenShare && clickBudget <= 0) return 'Click budget exhausted — waiting on a new confirmation from the user.';
      if(!label) return 'Missing element label.';
      const el = findClickable(label);
      if(!el) return 'No clickable element found matching "' + label + '".';
      doClick(el);
      if(cfg.allowScreenShare) return 'Clicked "' + label + '".';
      clickBudget--;
      return 'Clicked "' + label + '" (' + clickBudget + ' of ' + CLICK_BATCH + ' left before the next confirmation).';
    }
  );
  // Splits a parsed command list at the point (if any) where a /click would
  // exceed the remaining budget, so everything from there needs a fresh
  // confirmation before any of it — including later non-click commands in
  // the same reply, to keep execution order intact — runs. Skipped entirely
  // when Allow Screen Share is on: clicks just run like any other action.
  function splitForClickGate(cmds){
    if(cfg.allowScreenShare) return {ready: cmds, gated: []};
    let sim = clickBudget;
    for(let i = 0; i < cmds.length; i++){
      if(cmds[i].name === 'click' && cfg.allowClicks){
        if(sim <= 0) return {ready: cmds.slice(0, i), gated: cmds.slice(i)};
        sim--;
      }
    }
    return {ready: cmds, gated: []};
  }

  // ── System prompt ────────────────────────────────────────────────────
  function scopeSummary(){
    const pages = cfg.scopePages === 'all' ? 'all pages' : cfg.scopePages === 'current' ? 'the currently focused page only' : 'pages ' + cfg.scopePages;
    const on = Object.keys(cfg.elements).filter(k => cfg.elements[k]);
    const off = Object.keys(cfg.elements).filter(k => !cfg.elements[k]);
    return 'Page scope: ' + pages + '.\nAllowed element types: ' + (on.join(', ') || 'none') + '.' + (off.length ? ('\nBlocked element types: ' + off.join(', ') + ' (any command touching these will fail).') : '');
  }

  function systemPrompt(){
    const ref = Object.keys(CMDS).sort().map(k => {
      const c = CMDS[k];
      return '/' + k + (c.argMode === 'none' ? '' : c.argMode === 'words' ? ' <args>' : ' <text>') + ' [' + c.kind + '] — ' + c.help;
    }).join('\n');
    const exploreNote = cfg.explore.enabled
      ? '\nExplore Mode is ON: a live "EDITOR CONTEXT" snapshot (UI overview + document text, per the current page setting) is attached fresh before your next reply on every turn. Treat it as ground truth for that turn; it is not saved to history.'
      + (cfg.explore.pages === 'aichoice' ? ' Page text is NOT included automatically in this mode — ask for specific pages with /pagetext <n> when you need them.' : '')
      : '';
    const screenShareNote = cfg.allowScreenShare
      ? '\nAllow Screen Share is ON: a live "SCREEN SHARE" snapshot of every currently visible, enabled, clickable control is attached fresh on every turn — this is your only reliable list of real /click targets right now (a control not in it either doesn\'t exist or isn\'t clickable at the moment, e.g. a closed panel). /click has NO batch limit while this is on — use it as many times, back-to-back, as the task needs.'
      : '';
    return [
      'You are Pollinations, an AI assistant embedded in the Sugarcane document editor.',
      'You can read and control the editor ONLY through slash commands. Put each command on its own line, exactly as documented, e.g.:',
      '/wordcount',
      '/marginset left 2.5',
      'Any line beginning with "/" in your reply is parsed and run automatically — info commands return data to you (you may need to ask again in a follow-up turn to see the result and continue), action commands change the document. Do not use slash commands for anything except the documented ones below. Never invent commands.',
      'You cannot click UI elements directly by intent — the only way to interact with one is the /click command, which looks it up by its visible label/title/aria-label.' + (cfg.allowScreenShare
        ? ' It is unlimited right now (Allow Screen Share is on) — no confirmation batches, click as many things in a row as you need.'
        : ' It is gated: it only works when the user has turned on "Allow UI Clicks", and every ' + CLICK_BATCH + ' clicks needs a fresh confirmation from the user before more can happen — if you get "waiting on a new confirmation", stop and wait rather than repeating the command.') + ' Any other "clickable elements" list you see is descriptive context, not something you can trigger some other way.',
      'You have NO knowledge of the document\'s actual current state until you ask via an info command (or read it from an attached EDITOR CONTEXT / SCREEN SHARE snapshot) — do not assume values.',
      exploreNote,
      screenShareNote,
      '',
      'COMMAND REFERENCE:',
      ref,
      '',
      scopeSummary(),
      '',
      'Keep replies short. When you just want to inform the user, reply in plain text with no commands. When you need to act, issue the command(s) on their own lines.'
    ].join('\n');
  }

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

  // ── Pollinations API call ────────────────────────────────────────────
  // gen.pollinations.ai exposes an OpenAI-compatible /v1/chat/completions
  // endpoint. An API key is optional on the free tier (IP rate-limited);
  // when present it's sent as a standard Bearer token.
  async function callPollinations(messages){
    if(!cfg.model) throw new Error('No model name set. Add one in Pollinations Configuration.');
    const headers = {'Content-Type':'application/json'};
    if(cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
    const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({model: cfg.model, messages})
    });
    if(!res.ok){
      let detail = '';
      try {
        const errBody = (await res.json()).error;
        detail = typeof errBody === 'string' ? errBody : (errBody && errBody.message) || '';
      } catch(e){}
      if(!detail && res.status === 401) detail = 'invalid, missing, or expired API key';
      throw new Error('Pollinations request failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
    }
    const data = await res.json();
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    return (msg && msg.content) || '(empty response)';
  }

  // ── Chat panel UI ─────────────────────────────────────────────────────
  let panelEl, msgsEl, inputEl, sendBtn, dockBtn;
  let pendingApproval = null; // {cmds, resolveNode}

  function buildPanel(){
    panelEl = document.createElement('div');
    panelEl.id = 'pollinationsPanel';
    panelEl.className = 'pl-panel pl-' + cfg.dockMode;
    panelEl.dataset.sugarcaneAddon = 'connect-with-pollinations';
    panelEl.innerHTML =
      '<div class="pl-header" id="plHeader">' +
        '<span class="material-symbols-outlined pl-header-ic">smart_toy</span>' +
        '<span class="pl-header-title">Pollinations</span>' +
        '<div class="pl-header-actions">' +
          '<button type="button" class="pl-icon-btn" id="plDockBtn" title="Dock/undock"><span class="material-symbols-outlined">picture_in_picture</span></button>' +
          '<button type="button" class="pl-icon-btn" id="plCloseBtn" title="Close"><span class="material-symbols-outlined">close</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="pl-messages" id="plMessages"></div>' +
      '<div class="pl-inputrow">' +
        '<textarea id="plInput" class="pl-input" placeholder="Message Pollinations…" rows="1"></textarea>' +
        '<button type="button" class="pl-send-btn" id="plSendBtn"><span class="material-symbols-outlined">send</span></button>' +
      '</div>';
    document.body.appendChild(panelEl);
    msgsEl = panelEl.querySelector('#plMessages');
    inputEl = panelEl.querySelector('#plInput');
    sendBtn = panelEl.querySelector('#plSendBtn');
    dockBtn = panelEl.querySelector('#plDockBtn');

    panelEl.querySelector('#plCloseBtn').addEventListener('click', () => togglePanel(false));
    dockBtn.addEventListener('click', toggleDock);
    sendBtn.addEventListener('click', onSend);
    inputEl.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); onSend(); }
    });
    wireDrag();
    renderHistory();
    // Keep a floating panel on-screen across rotation/resize (a fixed
    // left/top in px doesn't reflow on its own the way right/bottom does).
    window.addEventListener('resize', clampPanelToViewport);
    window.addEventListener('orientationchange', () => setTimeout(clampPanelToViewport, 60));
  }

  function clampPanelToViewport(){
    if(!panelEl || cfg.dockMode !== 'floating') return;
    const margin = 4;
    const rect = panelEl.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const left = Math.min(Math.max(rect.left, margin), maxLeft);
    const top = Math.min(Math.max(rect.top, margin), maxTop);
    panelEl.style.left = left + 'px';
    panelEl.style.top = top + 'px';
  }

  function toggleDock(){
    cfg.dockMode = cfg.dockMode === 'docked' ? 'floating' : 'docked';
    saveCfg();
    panelEl.classList.remove('pl-docked','pl-floating');
    panelEl.classList.add('pl-' + cfg.dockMode);
    if(cfg.dockMode === 'floating'){ panelEl.style.right='auto'; panelEl.style.bottom='auto'; panelEl.style.top='90px'; panelEl.style.left='90px'; clampPanelToViewport(); }
    else { panelEl.style.top='auto'; panelEl.style.left='auto'; panelEl.style.right='18px'; panelEl.style.bottom='18px'; }
  }

  function wireDrag(){
    const header = panelEl.querySelector('#plHeader');
    let dragging = false, sx=0, sy=0, ox=0, oy=0;
    header.addEventListener('pointerdown', (e) => {
      if(cfg.dockMode !== 'floating') return;
      dragging = true; sx = e.clientX; sy = e.clientY;
      const r = panelEl.getBoundingClientRect(); ox = r.left; oy = r.top;
      header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', (e) => {
      if(!dragging) return;
      const rect = panelEl.getBoundingClientRect();
      const margin = 4;
      const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
      panelEl.style.left = Math.min(Math.max(margin, ox + (e.clientX - sx)), maxLeft) + 'px';
      panelEl.style.top = Math.min(Math.max(margin, oy + (e.clientY - sy)), maxTop) + 'px';
    });
    header.addEventListener('pointerup', () => { dragging = false; });
  }

  function togglePanel(show){
    if(!panelEl) buildPanel();
    panelEl.style.display = show ? 'flex' : 'none';
    if(show){ inputEl.focus(); clampPanelToViewport(); }
  }

  function addMsg(role, text){
    chat.push({role, text, t: Date.now()}); saveChat();
    renderMsg(role, text);
  }
  function renderMsg(role, text){
    const div = document.createElement('div');
    div.className = 'pl-msg pl-msg-' + role;
    div.textContent = text;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
  }
  function renderHistory(){
    msgsEl.innerHTML = '';
    chat.forEach(m => renderMsg(m.role, m.text));
  }

  function renderCommandBlock(cmds, results){
    const box = document.createElement('div');
    box.className = 'pl-cmdblock';
    cmds.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'pl-cmdrow';
      row.innerHTML = '<code>' + c.raw.replace(/</g,'&lt;') + '</code><span class="pl-cmdresult"></span>';
      if(results){ row.querySelector('.pl-cmdresult').textContent = results[i]; row.classList.add('pl-cmdrow-done'); }
      box.appendChild(row);
    });
    msgsEl.appendChild(box);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return box;
  }

  function renderApproval(cmds, onDecision){
    const box = renderCommandBlock(cmds, null);
    box.classList.add('pl-cmdblock-pending');
    const actions = document.createElement('div');
    actions.className = 'pl-approve-row';
    actions.innerHTML =
      '<button type="button" class="pl-approve-btn pl-approve-all">Approve all</button>' +
      '<button type="button" class="pl-approve-btn pl-deny-all">Deny all</button>';
    box.appendChild(actions);
    actions.querySelector('.pl-approve-all').addEventListener('click', () => { box.classList.remove('pl-cmdblock-pending'); actions.remove(); onDecision(true); });
    actions.querySelector('.pl-deny-all').addEventListener('click', () => { box.classList.remove('pl-cmdblock-pending'); actions.remove(); onDecision(false); box.classList.add('pl-cmdblock-denied'); });
    return box;
  }

  function renderClickGate(cmds, onDecision){
    const box = document.createElement('div');
    box.className = 'pl-cmdblock pl-clickgate';
    const notice = document.createElement('div');
    notice.className = 'pl-clickgate-notice';
    notice.innerHTML = '<span class="material-symbols-outlined">ads_click</span>Pollinations wants to click around the UI — approve a new batch of ' + CLICK_BATCH + ' clicks?';
    box.appendChild(notice);
    cmds.forEach(c => {
      const row = document.createElement('div');
      row.className = 'pl-cmdrow';
      row.innerHTML = '<code>' + c.raw.replace(/</g,'&lt;') + '</code><span class="pl-cmdresult"></span>';
      box.appendChild(row);
    });
    const actions = document.createElement('div');
    actions.className = 'pl-approve-row';
    actions.innerHTML =
      '<button type="button" class="pl-approve-btn pl-approve-clicks">Approve ' + CLICK_BATCH + ' clicks</button>' +
      '<button type="button" class="pl-approve-btn pl-deny-all">Deny</button>';
    box.appendChild(actions);
    msgsEl.appendChild(box);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    actions.querySelector('.pl-approve-clicks').addEventListener('click', () => { box.classList.remove('pl-clickgate'); actions.remove(); onDecision(true); });
    actions.querySelector('.pl-deny-all').addEventListener('click', () => { actions.remove(); onDecision(false); box.classList.add('pl-cmdblock-denied'); });
    return box;
  }

  // ── Conversation loop ────────────────────────────────────────────────
  let looping = false;
  async function onSend(){
    const text = inputEl.value.trim();
    if(!text || looping) return;
    inputEl.value = '';
    addMsg('user', text);
    await converse();
  }

  async function converse(round){
    round = round || 1;
    looping = true;
    sendBtn.disabled = true;
    const thinking = renderMsg('assistant', 'Thinking…');
    thinking.classList.add('pl-thinking');
    let reply;
    try {
      const messages = [{role:'system', content: systemPrompt()}]
        .concat(chat.map(m => ({role: m.role === 'assistant' ? 'assistant' : (m.role === 'tool' ? 'user' : 'user'), content: m.text})));
      if(cfg.explore.enabled){
        // Freshly rebuilt every call, never persisted to chat/localStorage.
        messages.push({role:'system', content: 'EDITOR CONTEXT (live, this turn only):\n' + buildExploreContext()});
      }
      if(cfg.allowScreenShare){
        // Independent of Explore Mode — this is UI state, not document text.
        messages.push({role:'system', content: 'SCREEN SHARE (live, this turn only):\n' + buildScreenShareContext()});
      }
      reply = await callPollinations(messages);
    } catch(e){
      thinking.remove();
      addMsg('assistant', 'Error: ' + e.message);
      looping = false; sendBtn.disabled = false;
      return;
    }
    thinking.remove();
    chat.push({role:'assistant', text: reply, t: Date.now()}); saveChat();
    renderMsg('assistant', reply);

    const parsedCmds = parseCommands(reply);
    if(!parsedCmds.length){ looping = false; sendBtn.disabled = false; return; }
    const {ready: cmds, gated} = splitForClickGate(parsedCmds);

    let shouldContinue = false;
    if(cmds.length){
      if(cfg.autoExecute){
        const results = cmds.map(runCommand);
        renderCommandBlock(cmds, results);
        const summary = cmds.map((c,i) => c.raw + ' → ' + results[i]).join('\n');
        chat.push({role:'tool', text: 'Command results:\n' + summary, t: Date.now()}); saveChat();
        shouldContinue = true;
      } else {
        shouldContinue = await new Promise(resolve => {
          renderApproval(cmds, (approved) => {
            if(!approved){
              chat.push({role:'tool', text: 'The user denied the pending command(s). Do not repeat them without being asked.', t: Date.now()}); saveChat();
              resolve(false); return;
            }
            const results = cmds.map(runCommand);
            const blocks = msgsEl.querySelectorAll('.pl-cmdblock');
            const block = blocks[blocks.length-1];
            if(block) cmds.forEach((c,i) => { block.children[i].querySelector('.pl-cmdresult').textContent = results[i]; block.children[i].classList.add('pl-cmdrow-done'); });
            const summary = cmds.map((c,i) => c.raw + ' → ' + results[i]).join('\n');
            chat.push({role:'tool', text: 'Command results:\n' + summary, t: Date.now()}); saveChat();
            resolve(true);
          });
        });
      }
    }

    if(gated.length){
      looping = false; sendBtn.disabled = false;
      renderClickGate(gated, (approved) => {
        if(!approved){
          chat.push({role:'tool', text: 'The user denied the click session. Do not attempt further /click commands without being asked.', t: Date.now()}); saveChat();
          return;
        }
        clickBudget = CLICK_BATCH;
        const results = gated.map(runCommand);
        const blocks = msgsEl.querySelectorAll('.pl-cmdblock');
        const block = blocks[blocks.length-1];
        if(block) gated.forEach((c,i) => { block.children[i].querySelector('.pl-cmdresult').textContent = results[i]; block.children[i].classList.add('pl-cmdrow-done'); });
        const summary = gated.map((c,i) => c.raw + ' → ' + results[i]).join('\n');
        chat.push({role:'tool', text: 'Command results:\n' + summary, t: Date.now()}); saveChat();
        converse(round + 1);
      });
      return;
    }

    if(shouldContinue && round < 5){ looping = false; await converse(round + 1); return; }
    looping = false;
    sendBtn.disabled = false;
  }

  // ── Sidebar section ──────────────────────────────────────────────────
  function buildSidebarSection(){
    const sidebar = document.getElementById('sidebar');
    if(!sidebar) return;
    const section = document.createElement('div');
    section.className = 'sb-section';
    section.id = 'plSbSection';
    section.dataset.sugarcaneAddon = 'connect-with-pollinations';
    section.innerHTML =
      '<div class="aw-header" id="plHeaderToggle">' +
        '<span class="aw-header-label aw-label-blue">Pollinations Configuration</span>' +
        '<div class="aw-header-right"><span class="material-symbols-outlined aw-chevron" id="plChevron">expand_more</span></div>' +
      '</div>' +
      '<div class="aw-dropdown" id="plDropdown">' +
        '<div class="aw-inner">' +

          '<label class="pl-cfg-label">API Key</label>' +
          '<div class="pl-input-row">' +
            '<input type="password" class="pl-cfg-input" id="plApiKeyInput" placeholder="Pollinations API key (optional on free tier)" autocomplete="off">' +
            '<button type="button" class="pl-paste-btn" id="plApiKeyPasteBtn" title="Paste from clipboard"><span class="material-symbols-outlined">content_paste</span></button>' +
          '</div>' +

          '<label class="pl-cfg-label">Model name</label>' +
          '<div class="pl-input-row">' +
            '<input type="text" class="pl-cfg-input" id="plModelInput" placeholder="e.g. openai, openai-large, gemini, deepseek">' +
            '<button type="button" class="pl-paste-btn" id="plModelPasteBtn" title="Paste from clipboard"><span class="material-symbols-outlined">content_paste</span></button>' +
          '</div>' +

          '<div class="aw-row">' +
            '<div><div class="aw-row-label">Auto-execute</div><div class="aw-row-sub">Run commands the AI issues without asking</div></div>' +
            '<label class="toggle-switch"><input type="checkbox" id="plAutoExecToggle"><span class="toggle-slider"></span></label>' +
          '</div>' +

          '<label class="pl-cfg-label">Pages the AI can see</label>' +
          '<div class="pl-seg" id="plScopeSeg">' +
            '<button type="button" data-v="all">All</button>' +
            '<button type="button" data-v="current">Current</button>' +
            '<button type="button" data-v="custom">Custom</button>' +
          '</div>' +
          '<input type="text" class="pl-cfg-input" id="plScopeCustomInput" placeholder="e.g. 1,3,4" style="display:none">' +

          '<label class="pl-cfg-label">Elements the AI can see / edit</label>' +
          '<div class="pl-elgrid" id="plElGrid"></div>' +

          '<div class="aw-row">' +
            '<div><div class="aw-row-label">Explore Mode</div><div class="aw-row-sub">Send a live editor snapshot with every message</div></div>' +
            '<label class="toggle-switch"><input type="checkbox" id="plExploreToggle"><span class="toggle-slider"></span></label>' +
          '</div>' +
          '<label class="pl-cfg-label">Document text sent in Explore Mode</label>' +
          '<div class="pl-seg" id="plExploreSeg">' +
            '<button type="button" data-v="all">Full document</button>' +
            '<button type="button" data-v="selected">Selected pages</button>' +
            '<button type="button" data-v="aichoice">Let AI choose</button>' +
          '</div>' +

          '<div class="aw-row pl-risky-row">' +
            '<div><div class="aw-row-label">Allow Screen Share</div><div class="aw-row-sub">Sends a live snapshot of every clickable control actually on screen right now with each message, and lets /click run back-to-back with no batch limit.</div></div>' +
            '<label class="toggle-switch"><input type="checkbox" id="plAllowScreenShareToggle"><span class="toggle-slider"></span></label>' +
          '</div>' +

          '<div class="aw-row pl-risky-row">' +
            '<div><div class="aw-row-label">Allow UI Clicks</div><div class="aw-row-sub">Lets the AI click any labeled control via /click. Every ' + CLICK_BATCH + ' clicks needs your confirmation.</div></div>' +
            '<label class="toggle-switch"><input type="checkbox" id="plAllowClicksToggle"><span class="toggle-slider"></span></label>' +
          '</div>' +

          '<button type="button" class="tc-mod-btn pl-open-chat-btn" id="plOpenChatBtn"><span class="material-symbols-outlined">chat</span>Open Pollinations Chat</button>' +

        '</div>' +
      '</div>';
    // Insert right before the collapse button so it reads as a native section.
    const collapseBtn = sidebar.querySelector('.collapse-btn');
    if(collapseBtn) sidebar.insertBefore(section, collapseBtn);
    else sidebar.appendChild(section);

    document.getElementById('plHeaderToggle').addEventListener('click', () => {
      const open = document.getElementById('plDropdown').classList.toggle('open');
      document.getElementById('plChevron').classList.toggle('open', open);
    });

    const apiKeyInput = document.getElementById('plApiKeyInput');
    apiKeyInput.value = cfg.apiKey;
    apiKeyInput.addEventListener('change', () => { cfg.apiKey = apiKeyInput.value.trim(); saveCfg(); });

    const modelInput = document.getElementById('plModelInput');
    modelInput.value = cfg.model;
    modelInput.addEventListener('change', () => { cfg.model = modelInput.value.trim(); saveCfg(); });

    async function pasteInto(input, onSave){
      try {
        const text = await navigator.clipboard.readText();
        if(text == null) return;
        input.value = text.trim();
        onSave();
        input.focus();
      } catch(e){
        input.focus(); // clipboard read blocked (permissions/insecure context) — let the user paste manually
      }
    }
    document.getElementById('plApiKeyPasteBtn').addEventListener('click', () => {
      pasteInto(apiKeyInput, () => { cfg.apiKey = apiKeyInput.value; saveCfg(); });
    });
    document.getElementById('plModelPasteBtn').addEventListener('click', () => {
      pasteInto(modelInput, () => { cfg.model = modelInput.value; saveCfg(); });
    });

    const autoToggle = document.getElementById('plAutoExecToggle');
    autoToggle.checked = cfg.autoExecute;
    autoToggle.addEventListener('change', () => { cfg.autoExecute = autoToggle.checked; saveCfg(); });

    const scopeSeg = document.getElementById('plScopeSeg');
    const customInput = document.getElementById('plScopeCustomInput');
    function syncScopeUI(){
      const isCustom = !['all','current'].includes(cfg.scopePages);
      scopeSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active',
        (b.dataset.v === 'custom' && isCustom) || b.dataset.v === cfg.scopePages));
      customInput.style.display = isCustom ? 'block' : 'none';
      if(isCustom) customInput.value = cfg.scopePages;
    }
    scopeSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      if(b.dataset.v === 'custom'){ cfg.scopePages = customInput.value || '1'; }
      else cfg.scopePages = b.dataset.v;
      saveCfg(); syncScopeUI();
    }));
    customInput.addEventListener('change', () => { cfg.scopePages = customInput.value.trim() || 'all'; saveCfg(); });
    syncScopeUI();

    const elGrid = document.getElementById('plElGrid');
    const elLabels = {header:'Header', footer:'Footer', watermark:'Watermark', background:'Page background', margins:'Margins', counts:'Word/page counts', content:'Page text', selection:'Selection', tables:'Tables'};
    Object.keys(elLabels).forEach(key => {
      const row = document.createElement('label');
      row.className = 'pl-el-item';
      row.innerHTML = '<input type="checkbox" data-el="' + key + '"' + (cfg.elements[key] ? ' checked' : '') + '><span>' + elLabels[key] + '</span>';
      row.querySelector('input').addEventListener('change', (e) => { cfg.elements[key] = e.target.checked; saveCfg(); });
      elGrid.appendChild(row);
    });

    const exploreToggle = document.getElementById('plExploreToggle');
    exploreToggle.checked = cfg.explore.enabled;
    exploreToggle.addEventListener('change', () => { cfg.explore.enabled = exploreToggle.checked; saveCfg(); });

    const exploreSeg = document.getElementById('plExploreSeg');
    function syncExploreSeg(){
      exploreSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === cfg.explore.pages));
    }
    exploreSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      cfg.explore.pages = b.dataset.v; saveCfg(); syncExploreSeg();
    }));
    syncExploreSeg();

    const allowScreenShareToggle = document.getElementById('plAllowScreenShareToggle');
    allowScreenShareToggle.checked = cfg.allowScreenShare;
    allowScreenShareToggle.addEventListener('change', () => {
      cfg.allowScreenShare = allowScreenShareToggle.checked;
      clickBudget = 0; // switching modes always starts fresh
      saveCfg();
    });

    const allowClicksToggle = document.getElementById('plAllowClicksToggle');
    allowClicksToggle.checked = cfg.allowClicks;
    allowClicksToggle.addEventListener('change', () => {
      cfg.allowClicks = allowClicksToggle.checked;
      clickBudget = 0; // always start a fresh session — off→on or on→off, either way needs a new confirmation
      saveCfg();
    });

    document.getElementById('plOpenChatBtn').addEventListener('click', () => togglePanel(true));
  }

  function init(){
    buildSidebarSection();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
