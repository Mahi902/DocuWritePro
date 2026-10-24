/* Sentence-prediction worker. Messages in: init | predict {id,text,regen?,temperature?,avoid?} | cancel | status.
   Out: progress | ready {backend} | result {id,text,error?} | error | status. Runtime is self-hosted in this folder. */
import { pipeline, env } from './transformers.min.js';   // pinned build, vendored (see NOTES.md)

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./', self.location.href).href;

let gen = null, loading = null, backend = '', modelId = '', pending = null, running = false, MAX_NEW = 10;

async function build(device, id, cb) {
  const g = await pipeline('text-generation', id, { dtype: 'q8', device, progress_callback: cb });
  // Warm-up: a session can load fine on WebGPU and still fail on its first run, so prove it works now.
  await g('Hello, my name is', { max_new_tokens: 2, do_sample: false, return_full_text: false });
  return g;
}

async function load(id) {
  modelId = id;
  const cb = (p) => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); };
  const tries = (typeof navigator !== 'undefined' && navigator.gpu) ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr;
  for (const device of tries) {
    try { gen = await build(device, id, cb); backend = device; return; }
    catch (e) { lastErr = e; console.warn('[sentworker] ' + device + ' failed:', e); }
  }
  throw lastErr;
}

async function toWasm() {                    // runtime fallback if WebGPU breaks after loading
  try { gen = null; gen = await build('wasm', modelId, () => {}); backend = 'wasm'; return true; }
  catch (e) { console.warn('[sentworker] wasm fallback failed:', e); return false; }
}

function clean(raw, hitMax, midWord) {
  let t = raw.split('\n')[0];
  const m = t.search(/[.?!]/);
  if (m >= 0) t = t.slice(0, m + 1);
  else if (hitMax) { const i = t.search(/\s\S*$/); if (i > 0) t = t.slice(0, i); else if (!midWord) t = ''; }
  return t.replace(/\s+$/, '');
}

async function run(job) {
  const opts = { max_new_tokens: MAX_NEW, return_full_text: false };
  if (job.regen) Object.assign(opts, { do_sample: true, temperature: Math.min(1.2, Math.max(0.3, +job.temperature || 0.8)), top_k: 40, top_p: 0.92 });
  else opts.do_sample = false;
  const avoid = job.avoid ? String(job.avoid).trim() : '';
  const midWord = /\S$/.test(job.text);
  let best = '';
  for (let i = 0, n = job.regen ? 3 : 1; i < n; i++) {   // regenerate: try again if we got the same text back
    const out = await gen(job.text, opts);
    const raw = (out && out[0] && out[0].generated_text) || '';
    best = clean(raw, raw.length > 0 && !/[.?!\n]/.test(raw), midWord);
    if (best && !(avoid && best.trim() === avoid)) break;
  }
  return best;
}

async function pump() {
  if (running || !pending || !gen) return;
  running = true;
  const job = pending; pending = null;
  let text = '', error;
  try { text = await run(job); }
  catch (e) {
    if (backend === 'webgpu' && await toWasm()) { try { text = await run(job); } catch (e2) { error = e2; } }
    else error = e;
  }
  const msg = { type: 'result', id: job.id, text: text || '' };
  if (error) { msg.error = String((error && error.message) || error); console.error('[sentworker] predict failed:', error); }
  self.postMessage(msg);
  running = false;
  pump();                                   // only the newest queued request ever runs
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try { loading = loading || load(m.modelId); await loading; self.postMessage({ type: 'ready', backend }); }
    catch (err) { loading = null; self.postMessage({ type: 'error', message: String(err && err.message || err) }); }
  } else if (m.type === 'predict') { pending = { id: m.id, text: m.text, regen: m.regen, temperature: m.temperature, avoid: m.avoid }; pump(); }
  else if (m.type === 'cancel') pending = null;
  else if (m.type === 'status') self.postMessage({ type: 'status', ready: !!gen, backend });
};
