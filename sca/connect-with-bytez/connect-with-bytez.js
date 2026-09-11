(function(){
'use strict';

const KEY='sc_bytez_config_v1';
const DEFAULT={apiKey:'',model:'Qwen/Qwen3-4B',endpoint:'https://api.bytez.com/models/v2/{modelId}',autoExecute:false,exploreMode:false,pageMode:'all',pages:[],scopes:{
  pageContent:true,header:false,footer:false,watermark:false,watermarkOptions:false,pageBackground:true,pageMargins:true,pageNumbering:false,typography:true,documentTitle:true,selection:true,tables:true,images:true,links:true,banners:true,shapes:true,toolbar:false,sidebar:false,rawHtml:false
},history:[]};
const SCOPE_DEFS=[
 ['pageContent','Page content'],['header','Current page header'],['footer','Current page footer'],['watermark','Watermark text'],['watermarkOptions','Watermark options'],['pageBackground','Page background'],['pageMargins','Page margins'],['pageNumbering','Page numbering'],['typography','Typography / spacing'],['documentTitle','Document title / metadata'],['selection','Current selection'],['tables','Tables / table data'],['images','Images / image data'],['links','Links'],['banners','Banners'],['shapes','Shapes / charts / drawings'],['toolbar','Toolbar controls'],['sidebar','Sidebar controls'],['rawHtml','Raw editor HTML']
];
let cfg=loadCfg(), pending=[], chat=[], dragging=false, dragOffset={x:0,y:0};

function loadCfg(){try{return Object.assign(structuredClone(DEFAULT),JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){return structuredClone(DEFAULT);}}
function saveCfg(){localStorage.setItem(KEY,JSON.stringify(cfg));}
function q(id){return document.getElementById(id)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function status(text,error){const e=q('bytezConfigStatus'); if(e){e.textContent=text||'';e.classList.toggle('error',!!error);}}
function currentPages(){return [...document.querySelectorAll('#editorArea .page')];}
function pageNum(p){const ps=currentPages(); return Math.max(1,ps.indexOf(p)+1);}
function currentPage(){try{if(typeof getCurrentPageEl==='function'){const p=getCurrentPageEl(); if(p) return p;}}catch(e){}
 const sel=getSelection&&getSelection(); const n=sel&&sel.anchorNode; const p=n&&n.nodeType===1?n.closest?.('.page'):n?.parentElement?.closest?.('.page'); if(p) return p;
 const ps=currentPages(); if(!ps.length)return null; const y=innerHeight*.42; let best=ps[0],dist=1e9; for(const x of ps){const r=x.getBoundingClientRect(),c=Math.abs((r.top+r.bottom)/2-y);if(c<dist){dist=c;best=x;}}return best;}
function selectedPageIndexes(){if(cfg.pageMode==='current'){const p=currentPage(); return p?[pageNum(p)]:[];} if(cfg.pageMode==='selected'&&cfg.pages.length)return cfg.pages.slice(); return currentPages().map((_,i)=>i+1);}
function selectedPageEls(){const nums=new Set(selectedPageIndexes());return currentPages().filter((p,i)=>nums.has(i+1));}
function get(id){return q(id)?.value??q(id)?.textContent??null;}
function bool(id){return !!q(id)?.checked;}
function call(name,...args){try{if(typeof window[name]==='function')return window[name](...args);}catch(e){throw e;}throw new Error('Editor function not available: '+name);}
function updateWith(fnName,id,val){const el=q(id);if(!el)throw new Error('Control not found: '+id);el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true})); if(typeof window[fnName]==='function')window[fnName](val);}
function normColor(v){let s=String(v||'').trim();if(!s)return '#000000'; if(/^#[0-9a-f]{6}$/i.test(s))return s; const raw=s.replace(/[^0-9a-f]/gi,''); if(raw.length>=6)return '#'+raw.slice(0,6); if(raw.length===3)return '#'+raw.split('').map(c=>c+c).join(''); throw new Error('Invalid color: '+v);}

function pageData(p, detailed){
 const n=pageNum(p), pc=p.querySelector('.page-content'), h=p.querySelector('.page-header-area'), f=p.querySelector('.page-footer-area'), wm=p.querySelector('.watermark');
 const cs=getComputedStyle(p); const obj={page:n,content:cfg.scopes.pageContent?pc?.innerText||'':undefined,html:cfg.scopes.rawHtml?p.innerHTML:undefined,header:cfg.scopes.header?h?.innerText||'':undefined,footer:cfg.scopes.footer?f?.innerText||'':undefined,watermark:cfg.scopes.watermark?wm?.textContent||'':undefined};
 if(cfg.scopes.pageBackground)obj.background={inline:p.style.background||'',computed:cs.background||'',type:get('bgType'),color:get('bgColor'),color2:get('bgColor2'),angle:get('gradientAngle')};
 if(cfg.scopes.pageMargins)obj.margins={top:(cs.paddingTop||''),right:(cs.paddingRight||''),bottom:(cs.paddingBottom||''),left:(cs.paddingLeft||''),inputs:{all:get('pageMargin'),top:get('marginTop'),bottom:get('marginBottom'),left:get('marginLeft'),right:get('marginRight')}};
 if(cfg.scopes.watermarkOptions)obj.watermarkOptions={color:get('wmColor'),fontSize:get('wmFontSize'),position:get('wmPosition'),bold:bool('wmBold'),font:get('wmFont')};
 if(cfg.scopes.typography)obj.typography={font:get('fontChooserToolbarBtn')||window.S?.font,lineSpacing:get('lineSpacing'),wordSpacing:get('wordSpacing'),zoom:window.S?.zoom};
 if(cfg.scopes.tables)obj.tables=[...p.querySelectorAll('table')].map((t,i)=>({index:i+1,html:t.outerHTML,rows:[...t.rows].map(r=>[...r.cells].map(c=>c.innerText))}));
 if(cfg.scopes.images)obj.images=[...p.querySelectorAll('img')].map((img,i)=>({index:i+1,src:img.src,alt:img.alt,width:img.width,height:img.height,locked:!!window.S?.lockedImgs?.has?.(img)}));
 if(cfg.scopes.links)obj.links=[...p.querySelectorAll('a')].map((a,i)=>({index:i+1,text:a.innerText,href:a.href,title:a.title||''}));
 if(cfg.scopes.banners)obj.banners=[...p.querySelectorAll('.sc-banner,.insert-banner,.banner')].map((b,i)=>({index:i+1,text:b.innerText,html:b.outerHTML}));
 if(cfg.scopes.shapes)obj.shapes=[...p.querySelectorAll('svg,canvas,.shape,.chart')].map((x,i)=>({index:i+1,tag:x.tagName,html:x.outerHTML?.slice(0,6000)||''}));
 return obj;
}
function documentContext(){
 const out={title:cfg.scopes.documentTitle?(q('docTitle')?.value||''):'',pageCount:currentPages().length};
 if(cfg.scopes.pageNumbering)out.pageNumbering={enabled:window.PN?.enabled??false,pages:get('pnPages'),start:get('pnStart'),position:window.PN?.position,size:get('pnSize'),color:get('pnColor'),highlight:get('pnHighlight')};
 out.pages=selectedPageEls().map(p=>pageData(p));
 if(cfg.scopes.selection){const s=getSelection?.();out.selection={text:s?.toString?.()||'',html:s&&s.rangeCount?(()=>{const r=s.getRangeAt(0),d=document.createElement('div');try{d.appendChild(r.cloneContents());return d.innerHTML;}catch(e){return '';}})():''};}
 if(cfg.scopes.documentTitle)out.documentUI={zoom:window.S?.zoom??null,hasContent:window.S?.hasContent??null};
 if(cfg.scopes.rawHtml)out.editorHTML=[...document.querySelectorAll('#editorArea .page')].map(p=>p.outerHTML);
 return out;
}

function countForPages(){let text=selectedPageEls().map(p=>p.querySelector('.page-content')?.innerText||'').join('\n');let words=text.trim()?text.trim().split(/\s+/).filter(Boolean):[];return {words:words.length,charactersNoSpaces:text.replace(/\s/g,'').length,characters:text.length,sentences:text.split(/[.!?]+/).filter(x=>x.trim().length>2).length,paragraphs:selectedPageEls().reduce((n,p)=>n+p.querySelectorAll('.page-content p,.page-content li,.page-content h1,.page-content h2,.page-content h3,.page-content h4,.page-content h5,.page-content h6').length,0)};}

function queryCommand(cmd){const m=cmd.trim().match(/^\/(\S+)(.*)$/);if(!m)throw new Error('Bad query command');const name=m[1].toLowerCase(),rest=m[2].trim();
 if(name==='help')return {command:'/help',commands:COMMAND_DOCS.map(x=>x.cmd+' — '+x.desc),actions:discoverActions().slice(0,500)};
 if(name==='pagecount')return {pageCount:currentPages().length};
 if(name==='wordcount')return countForPages();
 if(name==='pagebg')return selectedPageEls().map(pageData).map(x=>({page:x.page,background:x.background}));
 if(name==='pagewatermark')return selectedPageEls().map(p=>{const d=pageData(p);return {page:d.page,watermark:d.watermark,options:d.watermarkOptions};});
 if(name==='pagemargins')return selectedPageEls().map(p=>pageData(p).margins);
 const pm=name.match(/^pagemargin(\d+)$/); if(pm){const idx=+pm[1],p=currentPages()[idx-1];if(!p)throw new Error('Page '+idx+' not found');return pageData(p,true);}
 if(name==='pagemarginborder')return selectedPageEls().map(p=>{const r=p.getBoundingClientRect(),cs=getComputedStyle(p);return {page:pageNum(p),width:r.width,height:r.height,border:{top:cs.borderTopWidth+' '+cs.borderTopStyle+' '+cs.borderTopColor,right:cs.borderRightWidth+' '+cs.borderRightStyle+' '+cs.borderRightColor,bottom:cs.borderBottomWidth+' '+cs.borderBottomStyle+' '+cs.borderBottomColor,left:cs.borderLeftWidth+' '+cs.borderLeftStyle+' '+cs.borderLeftColor}}});
 if(name==='selection')return {selection:getSelection?.()?.toString?.()||''};
 if(name==='selectionhtml')return {html:(()=>{const s=getSelection?.();if(!s||!s.rangeCount)return '';const d=document.createElement('div');try{d.appendChild(s.getRangeAt(0).cloneContents());return d.innerHTML;}catch(e){return '';}})()};
 if(name==='tabledata')return documentContext().pages.flatMap(p=>p.tables||[]);
 if(name==='pagedata'){const n=parseInt(rest,10)||pageNum(currentPage()||currentPages()[0]);const p=currentPages()[n-1];if(!p)throw new Error('Page not found');return pageData(p,true);}
 if(name==='get'){if(!rest)throw new Error('Use /get <elementId>');const el=q(rest);if(!el)throw new Error('Element not found: '+rest);return {id:rest,value:el.value??null,text:el.innerText??el.textContent??'',checked:el.checked??null};}
 return {unknown:true,message:'Unknown query command '+name,known:COMMAND_DOCS.map(x=>x.cmd)};
}

function setPageMargins(n,vals){const p=currentPages()[n-1];if(!p)throw new Error('Page '+n+' not found');const t=vals.t??vals.top??parseFloat(get('marginTop')||2),b=vals.b??vals.bottom??parseFloat(get('marginBottom')||2),l=vals.l??vals.left??parseFloat(get('marginLeft')||2),r=vals.r??vals.right??parseFloat(get('marginRight')||2);p.style.padding=`${t}cm ${r}cm ${b}cm ${l}cm`;return {page:n,top:t,bottom:b,left:l,right:r};}
function allPageText(){return currentPages().map((p,i)=>({page:i+1,text:p.querySelector('.page-content')?.innerText||'',words:(p.querySelector('.page-content')?.innerText||'').trim().split(/\s+/).filter(Boolean).length}));}
function replaceText(oldText,newText,all){if(!oldText)throw new Error('Missing find text');const pages=selectedPageEls();let count=0;for(const p of pages){const root=p.querySelector('.page-content');if(!root)continue;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const n of nodes){if(!n.nodeValue.includes(oldText))continue;const hits=n.nodeValue.split(oldText).length-1;n.nodeValue=n.nodeValue.split(oldText).join(newText);count+=hits;if(!all)break;}if(count&&!all)break;}try{if(typeof updateWordCountDetailed==='function')updateWordCountDetailed();}catch(e){}return {replaced:count,find:oldText,replace:newText,all};}
function findText(text,startAfter){if(!text)throw new Error('Missing search text');const hits=[];for(const p of selectedPageEls()){const root=p.querySelector('.page-content');if(!root)continue;const s=root.innerText||'';let at=0;while((at=s.toLowerCase().indexOf(text.toLowerCase(),at))>=0){hits.push({page:pageNum(p),index:at,match:s.slice(at,at+text.length)});at+=Math.max(1,text.length);if(hits.length>=200)break;}}return {text,matches:hits,count:hits.length};}
function nativeExec(cmd,a=false,b=null){document.execCommand(cmd,a,b);return {command:cmd};}
function setZoom(v){const n=Math.max(25,Math.min(400,parseFloat(v)||100));if(typeof window.setZoom==='function' && window.setZoom!==setZoom){window.setZoom(n);}else{try{if(window.S)S.zoom=n;}catch(e){} document.documentElement.style.setProperty('--sc-bytez-zoom',n/100); }return {zoom:n};}
function setPageTextPart(n,part,text){const p=currentPages()[n-1];if(!p)throw new Error('Page '+n+' not found');const el=p.querySelector(part==='header'?'.page-header-area':'.page-footer-area');if(!el)throw new Error('Page '+part+' unavailable');el.textContent=text;return {page:n,part,text};}
function exportKind(fmt){if(fmt==='PDF')return call('exportPDF');if(fmt==='DOCX')return call('exportDOCX');if(fmt==='TXT')return call('exportTXTWithOpts');if(fmt==='JPG')return call('exportImgWithOpts');if(fmt==='SCD')return call('exportSCDWithOpts');throw new Error('Unsupported export format');}
function exploreCatalog(){return {pages:currentPages().map((p,i)=>({page:i+1,visible:!!(p.getBoundingClientRect().width),textPreview:(p.querySelector('.page-content')?.innerText||'').slice(0,1200),wordCount:(p.querySelector('.page-content')?.innerText||'').trim().split(/\s+/).filter(Boolean).length})),clickable:discoverActions(),functions:functionCatalog(),selection:documentContext().selection||null};}
function executeSemantic(cmd){const raw=cmd.trim();
  let m2;
  if(/^\/documentinfo$/i.test(raw))return {title:q('docTitle')?.value||'',pages:currentPages().length,zoom:window.S?.zoom??get('zoomDisplay'),wordCount:countForPages()};
  m2=raw.match(/^\/pageinfo\s*(\d+)?$/i);if(m2){const n=+(m2[1]||pageNum(currentPage()||currentPages()[0]));const p=currentPages()[n-1];if(!p)throw new Error('Page not found');return pageData(p,true);}
  m2=raw.match(/^\/(?:replaceall|replace)\s+([\s\S]+?)\s*=>\s*([\s\S]*)$/i);if(m2)return replaceText(m2[1],m2[2],/^\/replaceall/i.test(raw));
  m2=raw.match(/^\/(?:find|findnext)\s+([\s\S]+)$/i);if(m2)return findText(m2[1]);
  if(/^\/wordfreq$/i.test(raw)){const f={};for(const x of allPageText().flatMap(x=>x.text.toLowerCase().match(/[\\p{L}\\p{N}']+/gu)||[]))f[x]=(f[x]||0)+1;return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,100);}
  if(/^\/(?:superscript)$/i.test(raw))return nativeExec('superscript');if(/^\/(?:subscript)$/i.test(raw))return nativeExec('subscript');
  if(/^\/indent$/i.test(raw))return nativeExec('indent');if(/^\/outdent$/i.test(raw))return nativeExec('outdent');if(/^\/blockquote$/i.test(raw))return nativeExec('formatBlock',false,'blockquote');if(/^\/orderedlist$/i.test(raw))return nativeExec('insertOrderedList');if(/^\/unorderedlist$/i.test(raw))return nativeExec('insertUnorderedList');
  m2=raw.match(/^\/inserttext\s+([\s\S]+)$/i);if(m2)return nativeExec('insertText',false,m2[1]);
  m2=raw.match(/^\/insertlink\s+([\s\S]+?)\s*\|\s*(https?:\/\/\S+)$/i);if(m2){nativeExec('createLink',false,m2[2]);return {text:m2[1],url:m2[2]};}
  m2=raw.match(/^\/insertimage\s+(https?:\/\/\S+)$/i);if(m2){nativeExec('insertImage',false,m2[1]);return {url:m2[1]};}
  m2=raw.match(/^\/inserttable\s+(\d+)\s+(\d+)$/i);if(m2){if(typeof window.insertTable==='function'){call('insertTable');return {rows:+m2[1],cols:+m2[2]};}throw new Error('Table insertion unavailable');}
  if(/^\/tableattrs$/i.test(raw))return call('openEditTableAttrs');
  m2=raw.match(/^\/goto\s+(\d+)$/i);if(m2){const p=currentPages()[+m2[1]-1];if(!p)throw new Error('Page not found');p.scrollIntoView({behavior:'smooth',block:'center'});return {page:+m2[1]};}
  m2=raw.match(/^\/zoom\s+(\d+(?:\.\d+)?)$/i);if(m2)return setZoom(m2[1]);
  m2=raw.match(/^\/lineheight\s+(.+)$/i);if(m2){if(q('lineSpacing'))return updateWith('updateLineSpacing','lineSpacing',m2[1]);return nativeExec('formatBlock',false,'p');}
  m2=raw.match(/^\/wordspacing\s+(.+)$/i);if(m2){if(q('wordSpacing'))return updateWith('updateWordSpacing','wordSpacing',m2[1]);throw new Error('Word spacing control unavailable');}
  if(/^\/togglewatermark$/i.test(raw)){if(q('watermarkText')&&typeof window.updateWatermark==='function'){q('watermarkText').value=q('watermarkText').value?'':' ';call('updateWatermark');return {watermark:q('watermarkText').value};}return nativeExec('insertText',false,'');}
  if(/^\/togglepagenumbers$/i.test(raw))return call('togglePageNumbering');
  m2=raw.match(/^\/pageheader\s+([\s\S]+)$/i);if(m2)return setPageTextPart(pageNum(currentPage()||currentPages()[0]),'header',m2[1]);
  m2=raw.match(/^\/pagefooter\s+([\s\S]+)$/i);if(m2)return setPageTextPart(pageNum(currentPage()||currentPages()[0]),'footer',m2[1]);
  if(/^\/selectall$/i.test(raw))return nativeExec('selectAll');if(/^\/copy$/i.test(raw))return nativeExec('copy');if(/^\/cut$/i.test(raw))return nativeExec('cut');
  m2=raw.match(/^\/paste\s+([\s\S]+)$/i);if(m2)return nativeExec('insertText',false,m2[1]);
  if(/^\/print$/i.test(raw))return call('printDoc');m2=raw.match(/^\/export\s+(PDF|DOCX|TXT|JPG|SCD)$/i);if(m2)return exportKind(m2[1].toUpperCase());
  if(/^\/(?:rawhtml)$/i.test(raw))return [...document.querySelectorAll('#editorArea .page')].map(p=>p.outerHTML);
  if(/^\/explore$/i.test(raw))return exploreCatalog();
  m2=raw.match(/^\/explorepages\s+([\d,\s]+)$/i);if(m2){cfg.pageMode='selected';cfg.pages=[...new Set(m2[1].split(',').map(x=>+x.trim()).filter(n=>n>0&&n<=currentPages().length))];saveCfg();renderConfig();return {pageMode:cfg.pageMode,pages:cfg.pages};}
  if(/^\/context$/i.test(raw))return documentContext();if(/^\/clearselection$/i.test(raw)){const s=getSelection?.();s?.removeAllRanges?.();return {cleared:true};}
  if(/^\/removeformat$/i.test(raw))return execFormat('removeFormat');if(/^\/justify$/i.test(raw))return execFormat('justifyFull');if(/^\/center$/i.test(raw))return execFormat('justifyCenter');if(/^\/left$/i.test(raw))return execFormat('justifyLeft');if(/^\/right$/i.test(raw))return execFormat('justifyRight');

  let m=raw.match(/^\/pagemargin(\d+)setall(-?\d+(?:\.\d+)?)$/i); if(m)return setPageMargins(+m[1],{t:+m[2],b:+m[2],l:+m[2],r:+m[2]});
 m=raw.match(/^\/pagemargin(\d+)set([TBLR])(-?\d+(?:\.\d+)?)$/i);if(m){const n=+m[1],key={T:'t',B:'b',L:'l',R:'r'}[m[2].toUpperCase()],p=currentPages()[n-1],cs=getComputedStyle(p),base={t:parseFloat(cs.paddingTop)/37.8,b:parseFloat(cs.paddingBottom)/37.8,l:parseFloat(cs.paddingLeft)/37.8,r:parseFloat(cs.paddingRight)/37.8};base[key]=+m[3];return setPageMargins(n,base);}
 m=raw.match(/^\/pagemargin(\d+)color(.+)$/i);if(m){const n=+m[1],c=normColor(m[2]),p=currentPages()[n-1];if(!p)throw new Error('Page '+n+' not found');p.style.outlineColor=c;p.dataset.bytezMarginColor=c;try{if(typeof applyPageMarginDesigns==='function')applyPageMarginDesigns();}catch(e){}return {page:n,marginColor:c};}
 m=raw.match(/^\/pagemarginborder([TRBL])(-?\d+(?:\.\d+)?)$/i);if(m){const side={T:'Top',R:'Right',B:'Bottom',L:'Left'}[m[1].toUpperCase()];const v=m[2];selectedPageEls().forEach(p=>p.style['border'+side]=`${v}cm solid ${p.dataset.bytezMarginBorderColor||'#888888'}`);return {side:side,value:v+'cm',pages:selectedPageIndexes()};}
 m=raw.match(/^\/pagemarginbordercolor(.+)$/i);if(m){const c=normColor(m[1]);selectedPageEls().forEach(p=>{p.dataset.bytezMarginBorderColor=c;const cs=getComputedStyle(p);['Top','Right','Bottom','Left'].forEach(s=>{const w=parseFloat(cs['border'+s+'Width']);if(w>0)p.style['border'+s]=`${w}px solid ${c}`;});});return {borderColor:c,pages:selectedPageIndexes()};}
 m=raw.match(/^\/pagebg(?:set)?(\d+)(?:color)?(.+)$/i);if(m){const n=+m[1],c=normColor(m[2]),p=currentPages()[n-1];if(!p)throw new Error('Page '+n+' not found');p.style.background=c;if(q('bgType'))q('bgType').value='solid';if(q('bgColor'))q('bgColor').value=c;return {page:n,background:c};}
 m=raw.match(/^\/pagewatermark(\d+)text(.+)$/i);if(m){const n=+m[1],t=m[2],p=currentPages()[n-1];if(!p)throw new Error('Page '+n+' not found');const w=p.querySelector('.watermark');if(w)w.textContent=t;if(q('watermarkText'))q('watermarkText').value=t;return {page:n,text:t};}
 m=raw.match(/^\/pagewatermark(\d+)color(.+)$/i);if(m){const n=+m[1],c=normColor(m[2]),p=currentPages()[n-1];if(!p)throw new Error('Page '+n+' not found');if(q('wmColor'))q('wmColor').value=c;try{call('updateWatermark');}catch(e){}return {page:n,color:c};}
 if(/^\/bold$/i.test(raw))return execFormat('bold');if(/^\/italic$/i.test(raw))return execFormat('italic');if(/^\/underline$/i.test(raw))return execFormat('underline');if(/^\/strike$/i.test(raw))return execFormat('strikeThrough');
 if(/^\/delete$/i.test(raw))return execFormat('delete');if(/^\/clearformat$/i.test(raw))return execFormat('removeFormat');if(/^\/unlink$/i.test(raw))return execFormat('unlink');
 m=raw.match(/^\/font(?:name)?\s+(.+)$/i);if(m)return applyFont(m[1]);
 m=raw.match(/^\/fontsize\s+(.+)$/i);if(m)return applyFontSize(m[1]);
 m=raw.match(/^\/forecolor\s+(.+)$/i);if(m){const c=normColor(m[1]);return execFormat('foreColor',false,c);}
 m=raw.match(/^\/highlight\s+(.+)$/i);if(m){const c=normColor(m[1]);return execFormat('hiliteColor',false,c);}
 m=raw.match(/^\/(?:align|alignment)\s+(left|center|right|justify)$/i);if(m)return execFormat('justify'+m[1][0].toUpperCase()+m[1].slice(1));
 if(/^\/undo$/i.test(raw))return call('undo');if(/^\/redo$/i.test(raw))return call('redo');
 if(/^\/createpage$/i.test(raw)||/^\/addpage$/i.test(raw))return call('addNewPage');
 m=raw.match(/^\/deletepage(?:\s+)?(\d+)$/i);if(m){const p=currentPages()[+m[1]-1];if(!p)throw new Error('Page not found');if(typeof window.deletePage==='function')return window.deletePage(p);p.closest('.page-outer')?.remove();return {deleted:+m[1]};}
 m=raw.match(/^\/insertmarkdown\s+([\s\S]+)$/i);if(m)return insertTextMarkdown(m[1]);
 m=raw.match(/^\/set#([^=]+)=(.*)$/i);if(m){const el=q(m[1].trim());if(!el)throw new Error('Element not found: '+m[1]);el.value=m[2];el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return {set:m[1].trim(),value:m[2]};}
 m=raw.match(/^\/toggle#(.+)$/i);if(m){const el=q(m[1].trim());if(!el)throw new Error('Element not found: '+m[1]);if('checked'in el){el.checked=!el.checked;el.dispatchEvent(new Event('change',{bubbles:true}));}else{el.click();}return {toggled:m[1].trim()};}
 m=raw.match(/^\/click#(.+)$/i);if(m){const el=q(m[1].trim());if(!el)throw new Error('Element not found: '+m[1]);el.click();return {clicked:m[1].trim()};}
 m=raw.match(/^\/call#([A-Za-z_$][\w$]*)\s*(.*)$/i);if(m){const name=m[1];if(!isCallableEditorFunction(name))throw new Error('Function not allowlisted: '+name);const args=m[2]?JSON.parse(m[2]):[];return {function:name,result:call(name,...args)}}
 return null;
}
function execFormat(cmd,a,b){const s=getSelection?.();if(!s||!s.rangeCount)throw new Error('No text selection');document.execCommand(cmd,a,b);return {command:cmd,selection:s.toString()};}
function applyFont(font){if(q('fontChooserToolbarBtn')&&typeof openFontChooser==='function'){q('fontChooserToolbarBtn').click();setTimeout(()=>{},0);} document.execCommand('fontName',false,font);try{if(window.S)S.font=font;}catch(e){}return {font};}
function applyFontSize(size){document.execCommand('fontSize',false,String(Math.max(1,Math.min(96,parseInt(size,10)||16))));return {size};}
function insertTextMarkdown(md){const text=md.replace(/\*\*(.+?)\*\*/g,'$1').replace(/__(.+?)__/g,'$1').replace(/`([^`]+)`/g,'$1');document.execCommand('insertText',false,text);return {inserted:text};}
function isCallableEditorFunction(name){if(['eval','Function','setTimeout','setInterval','fetch','alert','confirm','prompt'].includes(name))return false;const src=String(window[name]||'');return typeof window[name]==='function'&&src&&(!/native code/i.test(src));}

function extractCommands(text){const out=[];const lines=String(text||'').split(/\r?\n/);for(const line of lines){const matches=line.match(/\/(?:[A-Za-z][\w-]*)(?:[^\n]*)/g)||[];for(let raw of matches){raw=raw.trim().replace(/\]\s*$/,'');if(/^\/(?:https?:\/\/)/i.test(raw))continue;const first=raw.split(/\s+/)[0].toLowerCase();const known=['/help','/pagecount','/wordcount','/pageinfo','/documentinfo','/pagebg','/pagewatermark','/pagemargins','/pagemargin','/pagemarginborder','/selection','/selectionhtml','/replace','/replaceall','/find','/findnext','/wordfreq','/bold','/italic','/underline','/strike','/superscript','/subscript','/delete','/clearformat','/unlink','/font','/fontname','/fontsize','/forecolor','/highlight','/align','/alignment','/indent','/outdent','/blockquote','/orderedlist','/unorderedlist','/inserttext','/insertmarkdown','/insertlink','/insertimage','/inserttable','/tabledata','/tableattrs','/undo','/redo','/createpage','/addpage','/deletepage','/goto','/zoom','/lineheight','/wordspacing','/togglewatermark','/togglepagenumbers','/pageheader','/pagefooter','/selectall','/copy','/cut','/paste','/print','/export','/rawhtml','/get','/set#','/toggle#','/click#','/call#','/explore','/explorepages','/context','/clearselection','/removeformat','/justify','/center','/left','/right'];if(known.some(k=>first===k||raw.toLowerCase().startsWith(k)))if(!out.includes(raw))out.push(raw);}}return out;}

const COMMAND_DOCS=[
 {cmd:'/help',desc:'List all available commands and dynamic editor actions.'},
 {cmd:'/pagecount',desc:'Return total page count.'},
 {cmd:'/wordcount',desc:'Return word/character/sentence/paragraph counts.'},
 {cmd:'/pageinfo N',desc:'Return detailed page information.'},
 {cmd:'/documentinfo',desc:'Return document metadata and high-level state.'},
 {cmd:'/pagebg',desc:'Read page background settings.'},
 {cmd:'/pagebgsetN#RRGGBB',desc:'Set page N background color.'},
 {cmd:'/pagebgtypeN solid|gradient',desc:'Set page N background type.'},
 {cmd:'/pagewatermark',desc:'Read watermark settings.'},
 {cmd:'/pagewatermarkNtextTEXT',desc:'Set page N watermark text.'},
 {cmd:'/pagewatermarkNcolor#RRGGBB',desc:'Set page N watermark color.'},
 {cmd:'/pagewatermarkNsizeN',desc:'Set watermark font size.'},
 {cmd:'/pagewatermarkNpositionPOS',desc:'Set watermark position.'},
 {cmd:'/pagemargins',desc:'Read all visible page margins.'},
 {cmd:'/pagemarginN',desc:'Read page N margins and design.'},
 {cmd:'/pagemarginNsetallX',desc:'Set all page N margins in cm.'},
 {cmd:'/pagemarginNsetTX',desc:'Set top page N margin in cm.'},
 {cmd:'/pagemarginNsetBX',desc:'Set bottom page N margin in cm.'},
 {cmd:'/pagemarginNsetLX',desc:'Set left page N margin in cm.'},
 {cmd:'/pagemarginNsetRX',desc:'Set right page N margin in cm.'},
 {cmd:'/pagemarginNcolor#RRGGBB',desc:'Set page N margin design color.'},
 {cmd:'/pagemarginborder',desc:'Read page border data.'},
 {cmd:'/pagemarginborderTX',desc:'Set top page border width.'},
 {cmd:'/pagemarginborderborderX',desc:'Set border width on all sides.'},
 {cmd:'/pagemarginbordercolor#RRGGBB',desc:'Set page border color.'},
 {cmd:'/selection',desc:'Read current text selection.'},
 {cmd:'/selectionhtml',desc:'Read current selection as HTML.'},
 {cmd:'/replace OLD => NEW',desc:'Replace matching text in allowed pages.'},
 {cmd:'/replaceall OLD => NEW',desc:'Replace all matching text in allowed pages.'},
 {cmd:'/find TEXT',desc:'Find text and return matches.'},
 {cmd:'/findnext TEXT',desc:'Find next occurrence.'},
 {cmd:'/wordfreq',desc:'Return word frequency information.'},
 {cmd:'/bold',desc:'Bold selection.'},
 {cmd:'/italic',desc:'Italicize selection.'},
 {cmd:'/underline',desc:'Underline selection.'},
 {cmd:'/strike',desc:'Strike selection.'},
 {cmd:'/superscript',desc:'Superscript selection.'},
 {cmd:'/subscript',desc:'Subscript selection.'},
 {cmd:'/delete',desc:'Delete selection.'},
 {cmd:'/clearformat',desc:'Remove selection formatting.'},
 {cmd:'/unlink',desc:'Remove link from selection.'},
 {cmd:'/font NAME',desc:'Apply font.'},
 {cmd:'/fontsize N',desc:'Apply font size.'},
 {cmd:'/forecolor #RRGGBB',desc:'Set text color.'},
 {cmd:'/highlight #RRGGBB',desc:'Set highlight color.'},
 {cmd:'/align left|center|right|justify',desc:'Set alignment.'},
 {cmd:'/indent',desc:'Indent paragraph.'},
 {cmd:'/outdent',desc:'Outdent paragraph.'},
 {cmd:'/blockquote',desc:'Toggle block quote.'},
 {cmd:'/orderedlist',desc:'Create ordered list.'},
 {cmd:'/unorderedlist',desc:'Create unordered list.'},
 {cmd:'/inserttext TEXT',desc:'Insert text at selection.'},
 {cmd:'/insertmarkdown TEXT',desc:'Insert text derived from markdown.'},
 {cmd:'/insertlink TEXT | URL',desc:'Insert a link.'},
 {cmd:'/insertimage URL',desc:'Insert an image URL.'},
 {cmd:'/inserttable ROWS COLS',desc:'Open/insert table.'},
 {cmd:'/tabledata',desc:'Read table data.'},
 {cmd:'/tableattrs',desc:'Open table attributes editor.'},
 {cmd:'/undo',desc:'Undo.'},
 {cmd:'/redo',desc:'Redo.'},
 {cmd:'/createpage',desc:'Add page.'},
 {cmd:'/addpage',desc:'Add page.'},
 {cmd:'/deletepage N',desc:'Delete page N.'},
 {cmd:'/goto N',desc:'Scroll to page N.'},
 {cmd:'/zoom N',desc:'Set editor zoom.'},
 {cmd:'/lineheight N',desc:'Set line spacing.'},
 {cmd:'/wordspacing N',desc:'Set word spacing.'},
 {cmd:'/togglewatermark',desc:'Toggle watermark.'},
 {cmd:'/togglepagenumbers',desc:'Toggle page numbering.'},
 {cmd:'/pageheader TEXT',desc:'Set current page header text.'},
 {cmd:'/pagefooter TEXT',desc:'Set current page footer text.'},
 {cmd:'/selectall',desc:'Select editor content.'},
 {cmd:'/copy',desc:'Copy selection.'},
 {cmd:'/cut',desc:'Cut selection.'},
 {cmd:'/paste TEXT',desc:'Paste/insert text.'},
 {cmd:'/print',desc:'Open print workflow.'},
 {cmd:'/export PDF|DOCX|TXT|JPG|SCD',desc:'Export document.'},
 {cmd:'/rawhtml',desc:'Read current editor HTML.'},
 {cmd:'/get elementId',desc:'Read a native control.'},
 {cmd:'/set#elementId=value',desc:'Set a native control value.'},
 {cmd:'/toggle#elementId',desc:'Toggle a native control.'},
 {cmd:'/click#elementId',desc:'Click a native editor control.'},
 {cmd:'/call#function [args]',desc:'Call a discovered allowlisted native function.'},
 {cmd:'/explore',desc:'Return the live editor exploration catalog.'},
 {cmd:'/explorepages N,N',desc:'Set temporary AI-visible page selection.'},
 {cmd:'/context',desc:'Return current AI context.'},
 {cmd:'/clearselection',desc:'Clear selection.'},
 {cmd:'/removeformat',desc:'Alias for clearformat.'},
 {cmd:'/justify',desc:'Justify paragraph.'},
 {cmd:'/center',desc:'Center paragraph.'},
 {cmd:'/left',desc:'Left-align paragraph.'},
 {cmd:'/right',desc:'Right-align paragraph.'},
 ];

function discoverActions(){const root=document.querySelector('#editorContainer');if(!root)return [];const arr=[];const els=[...root.querySelectorAll('button,input,select,textarea,[role="button"]')];for(const el of els){if(el.id?.startsWith('bytez'))continue;const txt=(el.innerText||el.textContent||el.getAttribute('aria-label')||el.title||el.value||'').replace(/\s+/g,' ').trim();if(!txt&&!el.id)continue;arr.push({id:el.id||null,tag:el.tagName.toLowerCase(),label:txt.slice(0,120),title:el.title||'',type:el.type||'',selector:el.id?'#'+el.id:null});}return arr;}
function functionCatalog(){const names=new Set();for(const el of document.querySelectorAll('#editorContainer [onclick]')){const s=el.getAttribute('onclick')||'';for(const m of s.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)){if(isCallableEditorFunction(m[1]))names.add(m[1]);}}return [...names].sort();}

function renderConfig(){
 const root=q('bytezAddonRoot');if(!root)return;root.style.display='block';q('bytezApiKey').value=cfg.apiKey;q('bytezModel').value=cfg.model;q('bytezEndpoint').value=cfg.endpoint;q('bytezAutoExecute').checked=cfg.autoExecute;if(q('bytezExploreMode'))q('bytezExploreMode').checked=!!cfg.exploreMode;q('bytezChatModel').textContent=cfg.model||'';
 document.querySelectorAll('[data-page-mode]').forEach(b=>b.classList.toggle('active',b.dataset.pageMode===cfg.pageMode));
 const pages=q('bytezPageList'); if(pages){pages.innerHTML='';currentPages().forEach((p,i)=>{const row=document.createElement('label');row.className='bxz-check';row.innerHTML='<input type="checkbox" data-bxz-page="'+(i+1)+'" '+(cfg.pages.includes(i+1)?'checked':'')+'> Page '+(i+1);row.querySelector('input').onchange=e=>{const n=+e.target.dataset.bxzPage;if(e.target.checked){if(!cfg.pages.includes(n))cfg.pages.push(n);}else{cfg.pages=cfg.pages.filter(x=>x!==n);}saveCfg();};pages.appendChild(row);});if(!currentPages().length)pages.innerHTML='<div class="bxz-sub">No pages yet.</div>';}
 const scopes=q('bytezScopeList');if(scopes){scopes.innerHTML='';SCOPE_DEFS.forEach(([id,label])=>{const row=document.createElement('label');row.className='bxz-check';row.innerHTML='<input type="checkbox" data-bxz-scope="'+id+'" '+(cfg.scopes[id]?'checked':'')+'> '+esc(label);row.querySelector('input').onchange=e=>{cfg.scopes[id]=e.target.checked;saveCfg();};scopes.appendChild(row);});}
}
function openChat(){q('bytezChatDock').classList.add('open');q('bytezFab').classList.remove('open');if(!q('bytezChatMessages').children.length)addMessage('system','Bytez is ready. Ask it to inspect or edit the document.');}
function closeChat(){q('bytezChatDock').classList.remove('open');q('bytezFab').classList.add('open');}
function addMessage(role,text,commands){const box=q('bytezChatMessages');const d=document.createElement('div');d.className='bxz-msg '+role;d.textContent=text;if(commands?.length){const wrap=document.createElement('div');wrap.style.marginTop='6px';commands.forEach(c=>{const x=document.createElement('span');x.className='bxz-command';x.textContent=c;wrap.appendChild(x);wrap.appendChild(document.createElement('br'));});d.appendChild(wrap);}box.appendChild(d);box.scrollTop=box.scrollHeight;chat.push({role,content:text});}
function renderPending(){const box=q('bytezPending');box.innerHTML='';box.classList.toggle('open',pending.length>0);pending.forEach((p,i)=>{const row=document.createElement('div');row.className='bxz-pending-item';const c=document.createElement('div');c.className='bxz-pending-code';c.textContent=p.cmd;const y=document.createElement('button');y.className='bxz-pending-btn bxz-pending-yes';y.textContent='Approve';y.onclick=()=>{runPending(i,true);};const n=document.createElement('button');n.className='bxz-pending-btn bxz-pending-no';n.textContent='Reject';n.onclick=()=>{runPending(i,false);};row.append(c,y,n);box.appendChild(row);});}
function queueCommand(cmd){pending.push({cmd});renderPending();}
function runPending(i,ok){const p=pending.splice(i,1)[0];renderPending();if(ok)runCommand(p.cmd).catch(e=>addMessage('system','Command failed: '+e.message));else addMessage('system','Rejected '+p.cmd);}
async function runCommand(cmd){let result=null;try{result=executeSemantic(cmd);if(result===null){result=queryCommand(cmd);}return result;}catch(e){throw e;}finally{renderConfig();}}
function autoOrQueue(cmd){if(cfg.autoExecute)runCommand(cmd).then(r=>addMessage('system',cmd+' ✓'+(r!==undefined?'\n'+JSON.stringify(r).slice(0,900):''))).catch(e=>addMessage('system',cmd+' ✕ '+e.message));else queueCommand(cmd);}

function buildSendContext(){const base=documentContext();if(!cfg.exploreMode)return base;const catalog=exploreCatalog();if(cfg.pageMode==='all')return {...base,exploreMode:true,exploreCatalog:catalog};if(cfg.pageMode==='current')return {...base,exploreMode:true,exploreCatalog:{...catalog,pages:catalog.pages.filter(x=>x.page===pageNum(currentPage()||currentPages()[0]))}};if(cfg.pageMode==='selected')return {...base,exploreMode:true,exploreCatalog:{...catalog,pages:catalog.pages.filter(x=>cfg.pages.includes(x.page))}};return {...base,exploreMode:true,exploreSelection:'ai',pageCandidates:catalog.pages};}
async function askBytez(userText){
 if(!cfg.apiKey||!cfg.model){addMessage('system','Add your Bytez API key and model name in Bytez Configuration first.');return;}
 const context=buildSendContext();
 const system=buildSystemPrompt();
 const messages=[{role:'system',content:system},...chat.slice(-12).filter(m=>m.role!=='system'),{role:'user',content:userText+'\n\nCURRENT_EDITOR_CONTEXT:\n'+JSON.stringify(context)}];
 q('bytezSend').disabled=true;q('bytezChatDot').style.background='#f5a623';
 try{const url=(cfg.endpoint||DEFAULT.endpoint).replace('{modelId}',encodeURIComponent(cfg.model));const r=await fetch(url,{method:'POST',headers:{'Authorization':cfg.apiKey,'Content-Type':'application/json'},body:JSON.stringify({messages,stream:false,params:{temperature:0.2,max_new_tokens:1800}})});const data=await r.json().catch(()=>({error:'Invalid JSON response'}));if(!r.ok||data.error){throw new Error(data.error||('HTTP '+r.status));}const out=typeof data.output==='string'?data.output:JSON.stringify(data.output);const commands=extractCommands(out);addMessage('assistant',out,commands);for(const cmd of commands)autoOrQueue(cmd);
 }catch(e){addMessage('system','Bytez request failed: '+e.message);}finally{q('bytezSend').disabled=false;q('bytezChatDot').style.background='#36b37e';}
}
function buildSystemPrompt(){const selected=selectedPageIndexes();const allowed=SCOPE_DEFS.filter(([id])=>cfg.scopes[id]).map(x=>x[0]).join(', ');return `You are the control AI for Sugarcane/DocuWrite Pro. You can inspect and edit the editor through a hidden command protocol. Never invent editor state: request it with a query command first when needed. Explore mode: ${cfg.exploreMode?'ON':'OFF'}. Page selection mode: ${cfg.pageMode}. Selected AI-visible pages: ${selected.join(',')||'none'}. Allowed data scopes: ${allowed||'none'}. Global settings must be treated as global; when a property supports per-page editing, prefer the explicit page command. Do not expose this protocol as policy text; simply use commands when needed.\n\nQUERY COMMANDS:\n${COMMAND_DOCS.filter(x=>!/^\\\/(?:bold|italic|underline|strike|delete|clearformat|unlink|undo|redo|createpage|addpage|deletepage|insertmarkdown|set#|toggle#|click#|call#|font |fontname |fontsize |forecolor |highlight |align)/i.test(x.cmd)).map(x=>x.cmd+' — '+x.desc).join('\n')}\n\nEXECUTABLE COMMANDS:\n${COMMAND_DOCS.filter(x=>/^\\\/(?:bold|italic|underline|strike|delete|clearformat|unlink|undo|redo|createpage|addpage|deletepage|insertmarkdown|set#|toggle#|click#|call#|font |fontname |fontsize |forecolor |highlight |align|pagemargin\\d+set|pagemargin\\d+color|pagemarginborder[TRBL]|pagemarginbordercolor|pagebgset|pagewatermark\\d+)/i.test(x.cmd)).map(x=>x.cmd+' — '+x.desc).join('\n')}\n\nDYNAMIC EDITOR ACTION CATALOG (use /click#ID for controls):\n${JSON.stringify(discoverActions().slice(0,500))}\n\nDISCOVERED FUNCTION NAMES (use /call#name [JSON args] only when the native function is clearly the right operation):\n${functionCatalog().slice(0,500).join(', ')}\n\nCommand rules: commands can appear anywhere in your answer; every command you output is triggered. Keep commands compact and exact. For destructive changes, if you need confirmation while Auto-execute is off, emit the command anyway so the UI can request approval.`;}

function init(){
 if(!document.body||!q('sidebar')){setTimeout(init,200);return;}
 const sidebar=q('sidebar'), collapse=sidebar.querySelector('.collapse-btn');if(!collapse){setTimeout(init,300);return;}
 const root=q('bytezAddonRoot');if(root.parentElement!==sidebar){sidebar.insertBefore(root,collapse);} // exact bottom position above Collapse
 renderConfig();
 q('bytezConfigHeader').onclick=()=>q('bytezAddonRoot').classList.toggle('open');
 q('bytezSaveBtn').onclick=()=>{cfg.apiKey=q('bytezApiKey').value.trim();cfg.model=q('bytezModel').value.trim()||DEFAULT.model;cfg.endpoint=q('bytezEndpoint').value.trim()||DEFAULT.endpoint;saveCfg();q('bytezChatModel').textContent=cfg.model;status('Saved.');};
 q('bytezAutoExecute').onchange=e=>{cfg.autoExecute=e.target.checked;saveCfg();status(e.target.checked?'Auto-execute enabled.':'Approval required for each command.');};if(q('bytezExploreMode'))q('bytezExploreMode').onchange=e=>{cfg.exploreMode=e.target.checked;saveCfg();status(e.target.checked?'Explore mode enabled.':'Explore mode disabled.');};
 q('bytezOpenBtn').onclick=openChat;q('bytezFab').onclick=openChat;q('bytezCloseBtn').onclick=closeChat;
 q('bytezDockBtn').onclick=()=>{q('bytezChatDock').classList.toggle('bxz-docked');};
 q('bytezTestBtn').onclick=async()=>{cfg.apiKey=q('bytezApiKey').value.trim();cfg.model=q('bytezModel').value.trim()||DEFAULT.model;cfg.endpoint=q('bytezEndpoint').value.trim()||DEFAULT.endpoint;saveCfg();status('Testing…');try{const url=cfg.endpoint.replace('{modelId}',encodeURIComponent(cfg.model));const r=await fetch(url,{method:'POST',headers:{'Authorization':cfg.apiKey,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Reply with the single word OK.'}],stream:false,params:{max_new_tokens:8,temperature:0}})});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error||'HTTP '+r.status);status('Bytez connection works.');}catch(e){status('Test failed: '+e.message,true);}};
 document.querySelectorAll('[data-page-mode]').forEach(b=>b.onclick=()=>{cfg.pageMode=b.dataset.pageMode;saveCfg();renderConfig();});
 q('bytezSend').onclick=()=>{const v=q('bytezChatInput').value.trim();if(!v)return;q('bytezChatInput').value='';addMessage('user',v);if(/^\//.test(v)){if(cfg.autoExecute)runCommand(v).then(r=>addMessage('system',JSON.stringify(r))).catch(e=>addMessage('system','Command failed: '+e.message));else queueCommand(v);}else askBytez(v);};
 q('bytezChatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();q('bytezSend').click();}});
 q('bytezChatHead').addEventListener('mousedown',e=>{if(e.target.closest('button'))return;dragging=true;const r=q('bytezChatDock').getBoundingClientRect();dragOffset={x:e.clientX-r.left,y:e.clientY-r.top};});window.addEventListener('mousemove',e=>{if(!dragging)return;const d=q('bytezChatDock');d.style.left=Math.max(5,Math.min(innerWidth-d.offsetWidth-5,e.clientX-dragOffset.x))+'px';d.style.top=Math.max(5,Math.min(innerHeight-d.offsetHeight-5,e.clientY-dragOffset.y))+'px';d.style.right='auto';d.style.bottom='auto';});window.addEventListener('mouseup',()=>dragging=false);
 const mo=new MutationObserver(()=>{if(!q('bytezAddonRoot'))return;renderConfig();});mo.observe(q('editorArea'),{childList:true,subtree:true});
 window.BytezAddon={open:openChat,close:closeChat,query:queryCommand,execute:runCommand,context:documentContext,config:()=>cfg};
 q('bytezFab').classList.add('open');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();  m2=raw.match(/^\/pagebgtype(\d+)\s+(solid|gradient)$/i);if(m2){const p=currentPages()[+m2[1]-1];if(!p)throw new Error('Page not found');if(q('bgType'))q('bgType').value=m2[2];try{if(typeof updateBackground==='function')call('updateBackground');}catch(e){}return {page:+m2[1],type:m2[2]};}
  m2=raw.match(/^\/pagewatermark(\d+)size(\d+(?:\.\d+)?)$/i);if(m2){if(q('wmFontSize')){q('wmFontSize').value=m2[2];q('wmFontSize').dispatchEvent(new Event('change',{bubbles:true}));}try{call('updateWatermark');}catch(e){}return {page:+m2[1],size:+m2[2]};}
  m2=raw.match(/^\/pagewatermark(\d+)position(.+)$/i);if(m2){if(q('wmPosition')){q('wmPosition').value=m2[2];q('wmPosition').dispatchEvent(new Event('change',{bubbles:true}));}try{call('updateWatermark');}catch(e){}return {page:+m2[1],position:m2[2]};}
  m2=raw.match(/^\/pagemarginborderborder(-?\d+(?:\.\d+)?)$/i);if(m2){const v=m2[1];selectedPageEls().forEach(p=>p.style.border=`${v}cm solid ${p.dataset.bytezMarginBorderColor||'#888888'}`);return {width:v+'cm',pages:selectedPageIndexes()};}

