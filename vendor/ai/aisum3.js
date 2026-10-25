/* DocuWrite Pro — optional on-device summarization model helper (shared by sceditor.html and app.html).
   SmolLM2-360M-Instruct, int8 (~365 MB). Loads NO runtime and makes NO network requests until AISum.download() is called. */
(function (g) {
  'use strict';
  var MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct';
  var CACHE = 'transformers-cache';            // Transformers.js default Cache API name (entries are keyed by model id)
  var REQUIRED = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
  var MIN_MODEL_BYTES = 200 * 1024 * 1024;     // sanity check against truncated weights (real file is ~365 MB)
  var WORKER_V = '205';
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
      if (!REQUIRED.every(has)) return false;
      var w = e.filter(function (x) { return /\/onnx\/model_quantized\.onnx(_data)?$/.test(x.url.split('?')[0]); })
               .reduce(function (a, x) { return a + x.size; }, 0);
      return w >= MIN_MODEL_BYTES;
    } catch (_) { return false; }
  }
  async function size() { return (await entries()).reduce(function (a, x) { return a + x.size; }, 0); }
  async function remove() {
    stopWorker();
    var c = await caches.open(CACHE), keys = await c.keys();
    await Promise.all(keys.filter(function (k) { return k.url.indexOf('/' + MODEL_ID + '/') >= 0; })
                          .map(function (k) { return c.delete(k); }));
  }

  /* Downloads by starting the worker's `init`; resolves when verified, rejects (after cleanup) on failure. */
  function download(onProgress, signal) {
    return new Promise(function (resolve, reject) {
      var w = new Worker(BASE + 'sumworker3.js?v=' + WORKER_V, { type: 'module' }), files = {};
      function done(err) {
        w.terminate();
        if (err) { g.AISum.lastError = err.message; console.error('[AISum]', err); }
        if (err) { remove().catch(function () {}).then(function () { reject(err); }); return; }
        installed().then(function (ok) {
          if (ok) resolve(); else { g.AISum.lastError = 'Download finished but files failed verification'; remove().catch(function () {}).then(function () { reject(new Error('Verification failed')); }); }
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
      };
      w.onerror = function (e) { done(new Error(e.message || 'Worker script failed to load (check vendor/ai/sumworker3.js and the runtime files)')); };
      w.postMessage({ type: 'init', modelId: MODEL_ID, download: true });
    });
  }

  /* ── Summarizing: one lazily created worker, one job at a time ── */
  var W = null, ready = null, nextId = 1, jobs = {};
  function stopWorker() { try { W && W.terminate(); } catch (_) {} W = null; ready = null; jobs = {}; }
  function ensureWorker() {
    if (ready) return ready;
    ready = new Promise(function (resolve, reject) {
      var w = W = new Worker(BASE + 'sumworker3.js?v=' + WORKER_V, { type: 'module' });
      w.onmessage = function (e) {
        var m = e.data, j = m.id != null ? jobs[m.id] : null;
        if (m.type === 'ready') { g.AISum.backend = m.backend; resolve(); }
        else if (m.type === 'error' && m.id == null) { stopWorker(); reject(new Error(m.message)); }
        else if (!j) return;
        else if (m.type === 'stage') j.onStage && j.onStage(m.name);
        else if (m.type === 'token') j.onToken && j.onToken(m.text);
        else if (m.type === 'result') { delete jobs[m.id]; j.resolve(m.cancelled ? null : m.text); }
        else if (m.type === 'error') { delete jobs[m.id]; j.reject(new Error(m.message)); }
      };
      w.onerror = function (e) { var err = new Error(e.message || 'Summarizer failed to start'); stopWorker(); reject(err); };
      var gpu = false; try { gpu = localStorage.getItem('sum_webgpu') === 'true'; } catch (_) {}   // opt-in only; needs Vulkan + unsafe WebGPU flags
      w.postMessage({ type: 'init', modelId: MODEL_ID, webgpu: gpu });
    });
    return ready;
  }
  /* opts: { style: 'short'|'paragraph'|'bullets', onStage(name), onToken(text), onLoading(), signal }.
     Resolves with the summary text, or null if cancelled. */
  async function summarize(text, opts) {
    opts = opts || {};
    if (!(await installed())) throw new Error('Summarization model is not downloaded. Install it in the app: Settings → AI → Data Sources.');
    if (!W) opts.onLoading && opts.onLoading();
    await ensureWorker();
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      jobs[id] = { resolve: resolve, reject: reject, onStage: opts.onStage, onToken: opts.onToken };
      if (opts.signal) opts.signal.addEventListener('abort', function () { W && W.postMessage({ type: 'cancel', id: id }); });
      W.postMessage({ type: 'summarize', id: id, text: text, style: opts.style || 'paragraph' });
    });
  }

  /* Ask Document. opts: { history:[{role,content}], onToken(text), onLoading(), signal }.
     Resolves with the answer text, or null if cancelled. */
  async function ask(question, context, opts) {
    opts = opts || {};
    if (!(await installed())) throw new Error('Summarization model is not downloaded. Install it in the app: Settings \u2192 AI \u2192 Data Sources.');
    if (!W) opts.onLoading && opts.onLoading();
    await ensureWorker();
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      jobs[id] = { resolve: resolve, reject: reject, onToken: opts.onToken };
      if (opts.signal) opts.signal.addEventListener('abort', function () { W && W.postMessage({ type: 'cancel', id: id }); });
      W.postMessage({ type: 'ask', id: id, question: question, context: context, history: opts.history || [] });
    });
  }

  g.AISum = { MODEL_ID: MODEL_ID, ask: ask, BASE: BASE, installed: installed, size: size, remove: remove, download: download, summarize: summarize, stop: stopWorker };
})(window);
