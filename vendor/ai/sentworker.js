/* Sentence-prediction worker. Messages in: init | predict {id,text} | cancel | status.
   Out: progress | ready | result {id,text} | error | status. Runtime is self-hosted in this folder. */
import { pipeline, env } from './transformers.web.min.js';   // pinned build, vendored (see NOTES.md)

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./', self.location.href).href;

let gen = null, loading = null, backend = '', pending = null, running = false, MAX_NEW = 10;

async function load(modelId) {
  const cb = (p) => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); };
  const tries = (typeof navigator !== 'undefined' && navigator.gpu) ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr;
  for (const device of tries) {
    try { gen = await pipeline('text-generation', modelId, { dtype: 'q8', device, progress_callback: cb }); backend = device; return; }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function clean(raw, hitMax, midWord) {
  let t = raw.split('\n')[0];
  const m = t.search(/[.?!]/);
  if (m >= 0) t = t.slice(0, m + 1);
  else if (hitMax) { const i = t.search(/\s\S*$/); if (i > 0) t = t.slice(0, i); else if (!midWord) t = ''; }
  return t.replace(/\s+$/, '');
}

async function pump() {
  if (running || !pending || !gen) return;
  running = true;
  const job = pending; pending = null;
  try {
    const out = await gen(job.text, { max_new_tokens: MAX_NEW, do_sample: false, return_full_text: false });
    const raw = out[0].generated_text || '';
    const midWord = /\S$/.test(job.text);
    self.postMessage({ type: 'result', id: job.id, text: clean(raw, raw.length > 0 && !/[.?!\n]/.test(raw), midWord) });
  } catch (e) { self.postMessage({ type: 'result', id: job.id, text: '' }); }
  running = false;
  pump();                                   // only the newest queued request ever runs
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try { loading = loading || load(m.modelId); await loading; self.postMessage({ type: 'ready', backend }); }
    catch (err) { loading = null; self.postMessage({ type: 'error', message: String(err && err.message || err) }); }
  } else if (m.type === 'predict') { pending = { id: m.id, text: m.text }; pump(); }
  else if (m.type === 'cancel') pending = null;
  else if (m.type === 'status') self.postMessage({ type: 'status', ready: !!gen, backend });
};
