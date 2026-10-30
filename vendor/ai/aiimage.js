/* Oryn Pro — optional on-device image-generation model helper (SDXS-512, one step).
   Shared by sceditor.html and app.html. Loads NO runtime and makes NO network requests until AIImage.download() is called. */
(function (g) {
  'use strict';
  var REPO = 'Fcouprie/sdxs-512-texte-image';
  var CACHE = 'dwp-ai-imggen-v1';               // own Cache API store, separate from the sentence-prediction model
  var HOST = 'https://huggingface.co/' + REPO + '/resolve/main/';
  var FILES = [
    { f: 'tokenizer/tokenizer.json',        min: 100 * 1024 },
    { f: 'tokenizer/tokenizer_config.json', min: 50 },
    { f: 'onnx/vae_decoder.onnx',           min: 1024 * 1024 },
    { f: 'onnx/unet_int8.onnx',             min: 100 * 1024 * 1024 },
    { f: 'onnx/text_encoder_int8.onnx',     min: 100 * 1024 * 1024 }
  ];
  var BASE = new URL('./', (document.currentScript && document.currentScript.src) || location.href).href;

  async function sizes() {
    var out = {};
    if (!('caches' in g) || !(await caches.has(CACHE))) return out;
    var c = await caches.open(CACHE);
    for (var i = 0; i < FILES.length; i++) {
      var r = await c.match(HOST + FILES[i].f);
      if (!r) continue;
      var len = +(r.headers.get('content-length') || 0);
      if (!len) len = (await r.clone().blob()).size;
      out[FILES[i].f] = len;
    }
    return out;
  }
  async function installed() {                  // cache lookup only, never downloads
    try { var s = await sizes(); return FILES.every(function (x) { return (s[x.f] || 0) >= x.min; }); }
    catch (_) { return false; }
  }
  async function size() { var s = await sizes(); return Object.keys(s).reduce(function (a, k) { return a + s[k]; }, 0); }
  async function remove() { if ('caches' in g) await caches.delete(CACHE); }

  /* Streams each file straight into the Cache API (never holds a whole model in JS memory).
     Resolves when verified; rejects (after cleanup) on failure or abort. */
  async function download(onProgress, signal) {
    var total = 0, loaded = 0, done = {};
    try {
      var c = await caches.open(CACHE);
      var heads = await Promise.all(FILES.map(async function (x) {
        try { var r = await fetch(HOST + x.f, { method: 'HEAD', signal: signal }); return +(r.headers.get('content-length') || 0); } catch (e) { return 0; }
      }));
      total = heads.reduce(function (a, b) { return a + b; }, 0);
      for (var i = 0; i < FILES.length; i++) {
        var x = FILES[i], url = HOST + x.f;
        var ex = await c.match(url);
        if (ex) { var el = +(ex.headers.get('content-length') || 0); if (el >= x.min) { loaded += el; onProgress && onProgress(total ? Math.min(100, loaded / total * 100) : 0, loaded, total); continue; } }
        var res = await fetch(url, { signal: signal });
        if (!res.ok || !res.body) throw new Error(x.f + ': HTTP ' + res.status);
        var len = +(res.headers.get('content-length') || heads[i] || 0), base = loaded;
        var counter = new TransformStream({ transform: function (chunk, ctl) { loaded += chunk.length; onProgress && onProgress(total ? Math.min(100, loaded / total * 100) : 0, loaded, total || loaded); ctl.enqueue(chunk); } });
        var h = new Headers({ 'content-type': res.headers.get('content-type') || 'application/octet-stream' });
        if (len) h.set('content-length', String(len));
        await c.put(url, new Response(res.body.pipeThrough(counter), { status: 200, headers: h }));
        if (!len) loaded = base + (await (await c.match(url)).clone().blob()).size;
      }
      if (!(await installed())) throw new Error('Download finished but files failed verification');
    } catch (err) {
      g.AIImage.lastError = err && err.message;
      await remove().catch(function () {});
      throw err;
    }
  }
  g.AIImage = { REPO: REPO, CACHE: CACHE, HOST: HOST, BASE: BASE, installed: installed, size: size, remove: remove, download: download };
})(window);
