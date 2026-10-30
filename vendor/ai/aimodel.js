/* Oryn — optional on-device model helper (shared by sceditor.html and app.html).
   Loads NO runtime and makes NO network requests until AIModel.download() is called. */
(function (g) {
  'use strict';
  // SmolLM2-135M base, ONNX build from onnx-community (repo seen on the Hub; verify it has onnx/model_quantized.onnx and is NOT Instruct).
  // Verified fallback (SmolLM v1 base, 136 MB q8): 'HuggingFaceTB/SmolLM-135M'
  var MODEL_ID = 'onnx-community/SmolLM2-135M-ONNX';
  var CACHE = 'transformers-cache';            // Transformers.js default Cache API name
  var REQUIRED = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
  var MIN_MODEL_BYTES = 50 * 1024 * 1024;      // sanity check against truncated weights
  var BASE = new URL('./', (document.currentScript && document.currentScript.src) || location.href).href;

  async function entries() {
    if (!('caches' in g)) return [];
    if (!(await caches.has(CACHE))) return [];
    var c = await caches.open(CACHE), keys = await c.keys(), out = [];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].url.indexOf('/' + MODEL_ID + '/') < 0) continue;
      var r = await c.match(keys[i]);
      var len = r ? +(r.headers.get('content-length') || 0) : 0;
      if (r && !len) len = (await r.clone().blob()).size;
      out.push({ url: keys[i].url, size: len });
    }
    return out;
  }
  async function installed() {                 // cache lookup only, never downloads
    try {
      var e = await entries();
      var has = function (f) { return e.some(function (x) { return x.url.split('?')[0].endsWith('/' + f) && x.size > 0; }); };
      if (!['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'].every(has)) return false;
      // weights may be split into model_quantized.onnx + model_quantized.onnx_data: count both
      var w = e.filter(function (x) { return /\/onnx\/model_quantized\.onnx(_data)?$/.test(x.url.split('?')[0]); })
               .reduce(function (a, x) { return a + x.size; }, 0);
      return w >= MIN_MODEL_BYTES;
    } catch (_) { return false; }
  }
  async function size() { return (await entries()).reduce(function (a, x) { return a + x.size; }, 0); }
  async function remove() {
    var c = await caches.open(CACHE), keys = await c.keys();
    await Promise.all(keys.filter(function (k) { return k.url.indexOf('/' + MODEL_ID + '/') >= 0; })
                          .map(function (k) { return c.delete(k); }));
  }
  /* Downloads by starting the worker's `init`; resolves when verified, rejects (after cleanup) on failure. */
  function download(onProgress, signal) {
    return new Promise(function (resolve, reject) {
      var w = new Worker(BASE + 'sentworker.js?v=195', { type: 'module' }), files = {};
      function done(err) {
        w.terminate();
        if (err) { g.AIModel.lastError = err.message; console.error('[AIModel]', err); }
        if (err) { remove().catch(function () {}).then(function () { reject(err); }); return; }
        installed().then(function (ok) {
          if (ok) resolve(); else { g.AIModel.lastError = 'Download finished but files failed verification'; remove().catch(function () {}).then(function () { reject(new Error('Verification failed')); }); }
        });
      }
      if (signal) signal.addEventListener('abort', function () { done(new Error('Cancelled')); });
      w.onmessage = function (e) {
        var m = e.data;
        if (m.type === 'progress' && m.total) {
          files[m.file] = { l: m.loaded, t: m.total };
          var L = 0, T = 0; for (var k in files) { L += files[k].l; T += files[k].t; }
          onProgress && onProgress(T ? Math.min(100, L / T * 100) : 0, L, T);
        } else if (m.type === 'ready') done();
        else if (m.type === 'error') done(new Error(m.message));
        else if (m.type === 'log') console.log('[AIModel]', m.message);
      };
      w.onerror = function (e) { done(new Error(e.message || 'Worker script failed to load (check vendor/ai/transformers.web.min.js and .wasm files)')); };
      w.postMessage({ type: 'init', modelId: MODEL_ID, download: true });
    });
  }
  g.AIModel = { MODEL_ID: MODEL_ID, BASE: BASE, installed: installed, size: size, remove: remove, download: download };
  g.aiModelInstalled = installed;
})(window);
