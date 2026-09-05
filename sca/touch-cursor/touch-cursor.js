
(function(){
  'use strict';
  const KEY='sc_touch_cursor_v1';
  const defaults={
    enabled:false,cursor:'pointer',text:'+',image:'',size:32,sensitivity:1,padSize:190,
    opacity:82,shape:'round',mode:'input',buttons:true,position:{x:24,y:24},
    gestures:{single:'none',double:'left',triple:'right',hold2:'none',hold3:'right',leftHold:'left',rightHold:'right'}
  };
  const actions=['none','left','right','middle','hover','escape'];
  const cursorDefs=[
    ['pointer','Pointer','↖'],['precision','Precision','⊙'],['hand','Hand','☝'],
    ['crosshair','Crosshair','✛'],['text','Text','I'],['grab','Grab','✋'],
    ['dot','Dot','•'],['custom','Custom','+']
  ];
  let C=load();
  let pad, cursor, modal, drag=null, padTouch=null, downTimer=null, gestureTimer=null;
  let cx=window.innerWidth/2, cy=window.innerHeight/2;
  let leftDown=false,rightDown=false;

  function load(){try{return Object.assign({},defaults,JSON.parse(localStorage.getItem(KEY)||'{}'),{gestures:Object.assign({},defaults.gestures,(JSON.parse(localStorage.getItem(KEY)||'{}').gestures||{}))});}catch(e){return JSON.parse(JSON.stringify(defaults));}}
  function save(){localStorage.setItem(KEY,JSON.stringify(C));}
  function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

  function init(){
    if(!document.body || !document.getElementById('tc-root')) return setTimeout(init,50);
    pad=document.getElementById('tc-pad');
    modal=document.getElementById('tc-modal');
    cursor=document.createElement('div');
    cursor.id='tc-virtual-cursor';
    document.getElementById('tc-root').appendChild(cursor);
    injectSidebar();
    buildCursorGrid(); buildGestureSelects(); bindModal();
    apply();
    if(C.enabled) setTimeout(()=>enable(true),0);
  }

  function injectSidebar(){
    const collapse=document.querySelector('.sidebar .collapse-btn');
    if(!collapse || document.getElementById('tc-sidebar-section')) return;
    const sec=document.createElement('div');
    sec.className='sb-section'; sec.id='tc-sidebar-section';
    sec.innerHTML=`<div class="aw-header" id="tc-sidebar-header">
      <span class="aw-header-label aw-label-blue">Touch Cursor</span>
      <div class="aw-header-right"><span class="material-symbols-outlined aw-chevron" id="tc-sidebar-chevron">expand_more</span></div>
    </div>
    <div class="aw-dropdown" id="tc-sidebar-dropdown">
      <div class="aw-inner">
        <div class="sb-toggle-row"><span class="sb-toggle-label">Touch Cursor</span>
          <label class="toggle-switch"><input id="tc-sidebar-toggle" type="checkbox"><span class="toggle-slider"></span></label>
        </div>
        <button class="aw-correct-btn" id="tc-modifications"><span class="material-symbols-outlined" style="font-size:13px">tune</span>Modifications</button>
      </div>
    </div>`;
    collapse.parentNode.insertBefore(sec,collapse);
    document.getElementById('tc-sidebar-header').addEventListener('click',()=>{
      const d=document.getElementById('tc-sidebar-dropdown'),ch=document.getElementById('tc-sidebar-chevron');
      const open=d.classList.toggle('open'); ch.classList.toggle('open',open);
    });
    document.getElementById('tc-sidebar-toggle').addEventListener('change',e=>enable(e.target.checked));
    document.getElementById('tc-modifications').addEventListener('click',openModal);
  }

  function buildCursorGrid(){
    const g=document.getElementById('tc-cursor-grid');
    g.innerHTML=cursorDefs.map(x=>`<button class="tc-cursor-choice" data-cursor="${x[0]}"><div class="tc-cursor-preview">${x[2]}</div>${x[1]}</button>`).join('');
    g.addEventListener('click',e=>{const b=e.target.closest('[data-cursor]');if(!b)return;C.cursor=b.dataset.cursor;save();apply();syncModal();});
  }
  function buildGestureSelects(){
    document.querySelectorAll('[data-tc-gesture]').forEach(s=>{
      s.innerHTML=actions.map(a=>`<option value="${a}">${a[0].toUpperCase()+a.slice(1)}</option>`).join('');
      s.value=C.gestures[s.dataset.tcGesture]||'none';
      s.addEventListener('change',()=>{C.gestures[s.dataset.tcGesture]=s.value;save();});
    });
  }
  function bindModal(){
    document.getElementById('tc-close').onclick=closeModal;
    document.getElementById('tc-done').onclick=closeModal;
    document.getElementById('tc-reset').onclick=()=>{C=JSON.parse(JSON.stringify(defaults));save();apply();syncModal();};
    document.querySelectorAll('.tc-tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tc-tab').forEach(x=>x.classList.toggle('active',x===t));document.querySelectorAll('.tc-panel').forEach(p=>p.classList.toggle('active',p.dataset.tcPanel===t.dataset.tcTab));});
    document.getElementById('tc-size').oninput=e=>{C.size=+e.target.value;save();apply();};
    document.getElementById('tc-sensitivity').oninput=e=>{C.sensitivity=+e.target.value;save();};
    document.getElementById('tc-pad-size').oninput=e=>{C.padSize=+e.target.value;save();apply();};
    document.getElementById('tc-opacity').oninput=e=>{C.opacity=+e.target.value;save();apply();};
    document.getElementById('tc-text-cursor').oninput=e=>{C.text=e.target.value; if(C.cursor==='custom')apply();save();};
    document.getElementById('tc-image-url-apply').onclick=()=>{C.image=document.getElementById('tc-image-url').value.trim();C.cursor='custom';save();apply();syncModal();};
    document.getElementById('tc-image-file').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{C.image=r.result;C.cursor='custom';save();apply();syncModal();};r.readAsDataURL(f);};
    document.querySelectorAll('[data-tc-shape]').forEach(b=>b.onclick=()=>{C.shape=b.dataset.tcShape;save();apply();syncModal();});
    document.querySelectorAll('[data-tc-mode]').forEach(b=>b.onclick=()=>{C.mode=b.dataset.tcMode;save();syncModal();});
    document.querySelectorAll('[data-tc-buttons]').forEach(b=>b.onclick=()=>{C.buttons=b.dataset.tcButtons==='on';save();apply();syncModal();});
    modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  }
  function syncModal(){
    document.getElementById('tc-size').value=C.size;document.getElementById('tc-sensitivity').value=C.sensitivity;
    document.getElementById('tc-pad-size').value=C.padSize;document.getElementById('tc-opacity').value=C.opacity;
    document.getElementById('tc-text-cursor').value=C.text;document.getElementById('tc-image-url').value=C.image.startsWith('data:')?'':C.image;
    document.getElementById('tc-size-out').textContent=C.size;document.getElementById('tc-sensitivity-out').textContent=Number(C.sensitivity).toFixed(2);
    document.getElementById('tc-pad-size-out').textContent=C.padSize;document.getElementById('tc-opacity-out').textContent=C.opacity;
    document.querySelectorAll('[data-cursor]').forEach(b=>b.classList.toggle('active',b.dataset.cursor===C.cursor));
    document.querySelectorAll('[data-tc-shape]').forEach(b=>b.classList.toggle('active',b.dataset.tcShape===C.shape));
    document.querySelectorAll('[data-tc-mode]').forEach(b=>b.classList.toggle('active',b.dataset.tcMode===C.mode));
    document.querySelectorAll('[data-tc-buttons]').forEach(b=>b.classList.toggle('active',(b.dataset.tcButtons==='on')===C.buttons));
    document.querySelectorAll('[data-tc-gesture]').forEach(s=>s.value=C.gestures[s.dataset.tcGesture]||'none');
    const st=document.getElementById('tc-sidebar-toggle');if(st)st.checked=C.enabled;
  }
  function openModal(){syncModal();modal.classList.add('open');}
  function closeModal(){modal.classList.remove('open');}

  function enable(on){
    C.enabled=!!on;save();
    const st=document.getElementById('tc-sidebar-toggle');if(st)st.checked=C.enabled;
    pad.classList.toggle('tc-visible',C.enabled);cursor.classList.toggle('tc-visible',C.enabled);
    if(C.enabled){placeCenter();applyCursor();}else{releaseAll();}
  }
  function apply(){
    pad.style.width=C.padSize+'px';pad.style.height=C.padSize+'px';pad.style.opacity=C.opacity/100;
    pad.classList.toggle('tc-square',C.shape==='square');pad.classList.toggle('tc-hide-buttons',!C.buttons);
    syncModal();applyCursor();if(C.enabled)pad.classList.add('tc-visible');
  }
  function applyCursor(){
    cursor.className='';cursor.id='tc-virtual-cursor';cursor.style.width=C.size+'px';cursor.style.height=C.size+'px';cursor.style.fontSize=C.size+'px';cursor.style.backgroundImage='none';cursor.textContent='';
    if(C.cursor==='custom' && C.image){cursor.style.backgroundImage=`url("${C.image.replace(/"/g,'\\"')}")`;cursor.style.backgroundSize='contain';cursor.style.backgroundRepeat='no-repeat';cursor.style.width=C.size+'px';cursor.style.height=C.size+'px';}
    else if(C.cursor==='custom'){cursor.classList.add('tc-text');cursor.textContent=C.text||'+';}
    else if(C.cursor==='dot'){cursor.classList.add('tc-css');}
    else {cursor.textContent=({pointer:'↖',precision:'⊙',hand:'☝',crosshair:'✛',text:'I',grab:'✋'})[C.cursor]||'↖';cursor.classList.add('tc-text');}
    cursor.classList.add('tc-visible');moveCursor(cx,cy);
  }
  function placeCenter(){cx=window.innerWidth/2;cy=window.innerHeight/2;moveCursor(cx,cy);}
  function moveCursor(x,y){
    cx=Math.max(0,Math.min(window.innerWidth,x));cy=Math.max(0,Math.min(window.innerHeight,y));
    cursor.style.left=cx+'px';cursor.style.top=cy+'px';
    hoverAt(cx,cy);
  }

  function targetAt(x,y){
    cursor.style.display='none';let el=document.elementFromPoint(x,y);cursor.style.display='';return el;
  }
  function hoverAt(x,y){
    if(!C.enabled)return;
    const el=targetAt(x,y);if(!el)return;
    try{el.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y,view:window}));el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:x,clientY:y,view:window}));}catch(e){}
  }
  function clickAt(button){
    const el=targetAt(cx,cy);if(!el)return;
    if(button===2){el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,buttons:2,clientX:cx,clientY:cy,view:window}));return;}
    if(el.closest && (el.closest('button,a,[role="button"],input,select,textarea,[onclick]'))){try{el.click();}catch(e){}}
    el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button,buttons:button===0?1:2,clientX:cx,clientY:cy,view:window}));
    el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button,buttons:0,clientX:cx,clientY:cy,view:window}));
    el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button,clientX:cx,clientY:cy,view:window}));
    if(button===0) placeCaretIfText(el);
  }
  function press(button){
    const el=targetAt(cx,cy);if(!el)return;
    if(button===0) placeCaretIfText(el);
    el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button,buttons:button===0?1:2,clientX:cx,clientY:cy,view:window}));
    if(button===0)leftDown=true;else rightDown=true;
  }
  function release(button){
    const el=targetAt(cx,cy);if(!el)return;
    el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button,buttons:0,clientX:cx,clientY:cy,view:window}));
    if(button===0)leftDown=false;else rightDown=false;
  }
  function placeCaretIfText(el){
    const pc=el.closest && el.closest('.page-content[contenteditable="true"]');
    if(!pc)return;
    try{
      let range=null;
      if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(cx,cy);if(p)range=document.createRange(),range.setStart(p.offsetNode,p.offset),range.collapse(true);}
      else if(document.caretRangeFromPoint)range=document.caretRangeFromPoint(cx,cy);
      if(range && pc.contains(range.startContainer)){const s=getSelection();s.removeAllRanges();s.addRange(range);pc.focus();window.S.lastRange=range.cloneRange?range.cloneRange():range;}
    }catch(e){}
  }

  function padPointerDown(e){
    if(!C.enabled)return;e.preventDefault();
    if(e.target.closest('button'))return;
    pad.setPointerCapture?.(e.pointerId);
    if(C.mode==='move'){drag={sx:e.clientX,sy:e.clientY,px:parseFloat(pad.style.left)||24,py:parseFloat(pad.style.top)||24};pad.classList.add('tc-moving');return;}
    padTouch={x:e.clientX,y:e.clientY,start:Date.now(),moved:false};
    gestureTimer=setTimeout(()=>{if(padTouch&&!padTouch.moved)trigger(C.gestures.hold2)},2000);
  }
  function padPointerMove(e){
    if(!C.enabled)return;
    if(drag){e.preventDefault();const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;pad.style.left=Math.max(4,Math.min(window.innerWidth-C.padSize-4,drag.px+dx))+'px';pad.style.top=Math.max(4,Math.min(window.innerHeight-C.padSize-4,drag.py+dy))+'px';return;}
    if(!padTouch)return;
    const dx=e.clientX-padTouch.x,dy=e.clientY-padTouch.y;
    if(Math.hypot(dx,dy)>7)padTouch.moved=true;
    if(padTouch.moved){moveCursor(cx+dx*C.sensitivity,cy+dy*C.sensitivity);padTouch.x=e.clientX;padTouch.y=e.clientY;}
  }
  function padPointerUp(e){
    if(!C.enabled)return;e.preventDefault();
    if(drag){drag=null;pad.classList.remove('tc-moving');return;}
    if(!padTouch)return;clearTimeout(gestureTimer);
    const duration=Date.now()-padTouch.start,moved=padTouch.moved;padTouch=null;
    if(moved)return;
    if(duration>=3000){trigger(C.gestures.hold3);return;}
    if(duration>=2000){return;}
    registerTap();
  }
  let taps=0,lastTap=0,tapReset=null;
  function registerTap(){
    const now=Date.now();if(now-lastTap<430)taps++;else taps=1;lastTap=now;clearTimeout(tapReset);
    tapReset=setTimeout(()=>{if(taps===1)trigger(C.gestures.single);else if(taps===2)trigger(C.gestures.double);else if(taps>=3)trigger(C.gestures.triple);taps=0;},440);
  }
  function trigger(a){if(!a||a==='none')return;if(a==='left')clickAt(0);else if(a==='right')clickAt(2);else if(a==='middle')clickAt(1);else if(a==='escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));else if(a==='hover')hoverAt(cx,cy);}
  function buttonDown(e,b){e.preventDefault();if(!C.enabled)return;press(b);downTimer=setTimeout(()=>trigger(b===0?C.gestures.leftHold:C.gestures.rightHold),3000);}
  function buttonUp(e,b){e.preventDefault();clearTimeout(downTimer);release(b);}
  function releaseAll(){if(leftDown)release(0);if(rightDown)release(2);}

  pad.addEventListener('pointerdown',padPointerDown);pad.addEventListener('pointermove',padPointerMove);pad.addEventListener('pointerup',padPointerUp);pad.addEventListener('pointercancel',padPointerUp);
  document.getElementById('tc-left').addEventListener('pointerdown',e=>buttonDown(e,0));
  document.getElementById('tc-left').addEventListener('pointerup',e=>buttonUp(e,0));
  document.getElementById('tc-right').addEventListener('pointerdown',e=>buttonDown(e,2));
  document.getElementById('tc-right').addEventListener('pointerup',e=>buttonUp(e,2));
  window.addEventListener('resize',()=>{cx=Math.min(cx,innerWidth-1);cy=Math.min(cy,innerHeight-1);moveCursor(cx,cy);});
  window.addEventListener('blur',releaseAll);
  window.addEventListener('scroll',()=>hoverAt(cx,cy),true);

  window.TouchCursor={enable,openSettings:openModal,getSettings:()=>JSON.parse(JSON.stringify(C))};
  init();
})();
