/* ═══════════════════════════════════════════════════════════════════════
   Sugarcane Add-on: Typewriter Sound
   Plays a soft synthesized keystroke click while typing in the editor,
   a distinct "ding" on Enter/new line, and a lower "thock" on Backspace.
   No audio files — everything is generated with the Web Audio API, so
   there's nothing to host besides this script (and the small stylesheet
   for the toggle button).
   Toggle state persists in localStorage. Sound is muted by default until
   the first user interaction unlocks the AudioContext (browser policy).
═══════════════════════════════════════════════════════════════════════ */
(function(){
  const STORAGE_KEY = 'sugarcane_addon_typewriter_sound_enabled';
  let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
  let ctx = null;

  function getCtx(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
    }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Short percussive click built from filtered noise, cheap and organic-sounding.
  function click(freq, dur, gain){
    const c = getCtx();
    if(!c || !enabled) return;
    const bufferSize = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++){
      data[i] = (Math.random()*2-1) * Math.pow(1 - i/bufferSize, 3);
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.1;

    const g = c.createGain();
    g.gain.value = gain;

    noise.connect(bp).connect(g).connect(c.destination);
    noise.start();
    noise.stop(c.currentTime + dur);
  }

  function keyClick(){ click(2200 + Math.random()*600, 0.035, 0.18); }
  function enterDing(){ click(1400, 0.09, 0.14); setTimeout(()=>click(2100,0.07,0.10), 30); }
  function backspaceThock(){ click(700 + Math.random()*150, 0.05, 0.16); }

  const IGNORE_KEYS = new Set(['Shift','Control','Alt','Meta','CapsLock','Tab','Escape',
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown']);

  document.addEventListener('keydown', function(e){
    const editable = e.target.closest && e.target.closest('[contenteditable="true"]');
    if(!editable) return;
    if(IGNORE_KEYS.has(e.key)) return;
    if(e.metaKey || e.ctrlKey || e.altKey) return; // let shortcuts stay silent
    if(e.key === 'Enter') enterDing();
    else if(e.key === 'Backspace' || e.key === 'Delete') backspaceThock();
    else keyClick();
  }, true);

  // ── Toggle button ────────────────────────────────────────────────────
  function buildToggle(){
    const btn = document.createElement('button');
    btn.id = 'twsToggleBtn';
    btn.type = 'button';
    btn.title = 'Typewriter sound';
    btn.dataset.sugarcaneAddon = 'typewriter-sound';
    btn.innerHTML = '<span class="material-symbols-outlined">' +
      (enabled ? 'volume_up' : 'volume_off') + '</span>';
    btn.addEventListener('click', function(){
      enabled = !enabled;
      localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
      btn.querySelector('span').textContent = enabled ? 'volume_up' : 'volume_off';
      btn.classList.toggle('tws-off', !enabled);
      if(enabled){ getCtx(); click(1800, 0.05, 0.12); }
    });
    document.body.appendChild(btn);
    if(!enabled) btn.classList.add('tws-off');
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildToggle, {once:true});
  } else {
    buildToggle();
  }
})();
