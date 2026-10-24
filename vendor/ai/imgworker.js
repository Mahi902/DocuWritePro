/* Fun image generation worker: SDXS-512-0.9 (one diffusion step), 3 ONNX models + CLIP BPE tokenizer.
   In:  generate {id, prompt, seed?} | cancel
   Out: stage {id, name} | result {id, w, h, rgba(ArrayBuffer), backend} | error {id, message}
   Sessions are created one at a time and released right after use to keep peak memory low. */
import * as ortNs from './ort.webgpu.min.mjs';

const ort = ortNs.InferenceSession ? ortNs : ortNs.default;
ort.env.wasm.wasmPaths = new URL('./', self.location.href).href;
try { ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 2) : 1; } catch (e) {}

const REPO = 'Fcouprie/sdxs-512-texte-image';
const HOST = 'https://huggingface.co/' + REPO + '/resolve/main/';
const CACHE = 'dwp-ai-imggen-v1';
const LAT = [1, 4, 64, 64], CTX = 77;

async function bytesOf(file) {
  const c = await caches.open(CACHE);
  const r = await c.match(HOST + file);
  if (!r) throw new Error('Image model is not downloaded (' + file + ')');
  return r;
}

/* ── CLIP BPE tokenizer built from the model's tokenizer.json ── */
let TOK = null;
function byteMap() {
  const bs = [], cs = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  cs.push(...bs);
  let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n++); }
  const m = {}; bs.forEach((b, i) => { m[b] = String.fromCharCode(cs[i]); });
  return m;
}
async function loadTokenizer() {
  if (TOK) return TOK;
  const j = await (await bytesOf('tokenizer/tokenizer.json')).json();
  const cfg = await (await bytesOf('tokenizer/tokenizer_config.json')).json();
  const vocab = j.model.vocab, rank = new Map();
  j.model.merges.forEach((m, i) => rank.set(Array.isArray(m) ? m.join(' ') : m, i));
  const tokId = (t) => (t && typeof t === 'object') ? vocab[t.content] : vocab[t];
  const bos = vocab['<|startoftext|>'], eos = vocab['<|endoftext|>'];
  let pad = tokId(cfg.pad_token); if (pad === undefined) pad = 0;
  TOK = { vocab, rank, bos, eos, pad, bm: byteMap(), cache: new Map() };
  return TOK;
}
function bpe(T, word) {
  if (T.cache.has(word)) return T.cache.get(word);
  let p = Array.from(word); p[p.length - 1] += '</w>';
  while (p.length > 1) {
    let best = Infinity, at = -1;
    for (let i = 0; i < p.length - 1; i++) { const r = T.rank.get(p[i] + ' ' + p[i + 1]); if (r !== undefined && r < best) { best = r; at = i; } }
    if (at < 0) break;
    p.splice(at, 2, p[at] + p[at + 1]);
  }
  T.cache.set(word, p);
  return p;
}
function encode(T, text) {
  text = text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const re = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|[\p{L}]+|[\p{N}]|[^\s\p{L}\p{N}]+/giu;
  const ids = [];
  for (const m of text.matchAll(re)) {
    const w = Array.from(new TextEncoder().encode(m[0])).map(b => T.bm[b]).join('');
    for (const t of bpe(T, w)) { const id = T.vocab[t]; if (id !== undefined) ids.push(id); }
  }
  const out = [T.bos, ...ids.slice(0, CTX - 2), T.eos];
  while (out.length < CTX) out.push(T.pad);
  return out;
}

/* ── ONNX helpers ── */
function metaOf(s, name) { try { const m = s.inputMetadata; return Array.isArray(m) ? m.find(x => x.name === name) : (m && m[name]); } catch (e) { return null; } }
function pick(names, re, fallback) { return names.find(n => re.test(n)) || names[fallback]; }
const tensorOf = (type, data, dims) => new ort.Tensor(type, data, dims);

async function open(file, providers) {
  const resp = await bytesOf(file);
  let buf = new Uint8Array(await resp.arrayBuffer());
  try { return await ort.InferenceSession.create(buf, { executionProviders: providers, graphOptimizationLevel: 'all' }); }
  finally { buf = null; }
}
async function withSession(file, providers, fn) {
  const s = await open(file, providers);
  try { return await fn(s); } finally { try { await s.release(); } catch (e) {} }
}

function randn(n, seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const o = new Float32Array(n);
  for (let i = 0; i < n; i += 2) { const u = Math.max(rnd(), 1e-9), v = rnd(), r = Math.sqrt(-2 * Math.log(u)); o[i] = r * Math.cos(2 * Math.PI * v); if (i + 1 < n) o[i + 1] = r * Math.sin(2 * Math.PI * v); }
  return o;
}
function alphaBar(t) {                          // Stable Diffusion scaled-linear schedule, 1000 steps
  const a = Math.sqrt(0.00085), b = Math.sqrt(0.012); let p = 1;
  for (let i = 0; i <= t; i++) { const be = Math.pow(a + (b - a) * i / 999, 2); p *= (1 - be); }
  return p;
}

let cancelled = false, backendUsed = '';

async function run(job) {
  const post = (name) => self.postMessage({ type: 'stage', id: job.id, name });
  const chk = () => { if (cancelled) throw new Error('Cancelled'); };
  const T = await loadTokenizer();
  const ids = encode(T, job.prompt);
  const providers = (self.navigator && self.navigator.gpu) ? ['webgpu', 'wasm'] : ['wasm'];

  const go = async (prov) => {
    // 1 · text encoder
    post('text'); chk();
    const hidden = await withSession('onnx/text_encoder_int8.onnx', prov, async (s) => {
      const feeds = {};
      for (const n of s.inputNames) {
        const ty = (metaOf(s, n) || {}).type;
        if (/mask/i.test(n)) { feeds[n] = ty === 'int32' ? tensorOf('int32', new Int32Array(CTX).fill(1), [1, CTX]) : tensorOf('int64', new BigInt64Array(CTX).fill(1n), [1, CTX]); continue; }
        feeds[n] = ty === 'int32' ? tensorOf('int32', Int32Array.from(ids), [1, CTX]) : tensorOf('int64', BigInt64Array.from(ids.map(BigInt)), [1, CTX]);
      }
      const out = await s.run(feeds);
      const key = s.outputNames.includes('last_hidden_state') ? 'last_hidden_state' : s.outputNames[0];
      const t = out[key];
      return tensorOf('float32', Float32Array.from(t.data), t.dims);
    });
    // 2 · one UNet step
    post('draw'); chk();
    const seed = job.seed >>> 0;
    const noise = randn(LAT[0] * LAT[1] * LAT[2] * LAT[3], seed);
    const pred = await withSession('onnx/unet_int8.onnx', prov, async (s) => {
      const names = s.inputNames;
      const nS = pick(names, /sample|latent/i, 0), nT = pick(names, /time|step/i, 1), nE = pick(names, /encoder|hidden|text|context/i, 2);
      const tm = metaOf(s, nT) || {}, scalar = Array.isArray(tm.shape) && tm.shape.length === 0;
      const tsFeeds = [];
      if (tm.type === 'float32' || tm.type === 'float16') tsFeeds.push(tensorOf('float32', new Float32Array([999]), scalar ? [] : [1]));
      else if (tm.type === 'int32') tsFeeds.push(tensorOf('int32', new Int32Array([999]), scalar ? [] : [1]));
      else { tsFeeds.push(tensorOf('int64', new BigInt64Array([999n]), scalar ? [] : [1])); tsFeeds.push(tensorOf('float32', new Float32Array([999]), scalar ? [] : [1])); }
      let lastErr;
      for (const ts of tsFeeds) {
        try {
          const out = await s.run({ [nS]: tensorOf('float32', noise, LAT), [nT]: ts, [nE]: hidden });
          const t = out[s.outputNames[0]];
          return Float32Array.from(t.data);
        } catch (e) { lastErr = e; }
      }
      throw lastErr;
    });
    // one-step DDIM (epsilon prediction) at t = 999 → clean latent
    const ab = alphaBar(999), sa = Math.sqrt(ab), sb = Math.sqrt(1 - ab);
    const lat = new Float32Array(noise.length);
    for (let i = 0; i < lat.length; i++) lat[i] = (noise[i] - sb * pred[i]) / sa;
    // 3 · TAESD decoder
    post('decode'); chk();
    return await withSession('onnx/vae_decoder.onnx', prov, async (s) => {
      const out = await s.run({ [s.inputNames[0]]: tensorOf('float32', lat, LAT) });
      const t = out[s.outputNames[0]];
      return { data: Float32Array.from(t.data), dims: t.dims };
    });
  };

  let img;
  try { img = await go(providers); backendUsed = providers[0]; }
  catch (e) {
    if (cancelled || providers.length === 1) throw e;
    console.warn('[imgworker] ' + providers[0] + ' failed, retrying on wasm:', e);
    img = await go(['wasm']); backendUsed = 'wasm';
  }
  // [1,3,H,W] → RGBA. Decoder output is either [0,1] or [-1,1]: detect from its range.
  const [, C, H, W] = img.dims, d = img.data, plane = H * W;
  let mn = Infinity; for (let i = 0; i < d.length; i += 97) if (d[i] < mn) mn = d[i];
  const signed = mn < -0.02;
  const rgba = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) { let v = d[c * plane + i]; v = signed ? (v + 1) / 2 : v; rgba[i * 4 + c] = Math.round(Math.max(0, Math.min(1, v)) * 255); }
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, w: W, h: H };
}

let busy = false;
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'cancel') { cancelled = true; return; }
  if (m.type !== 'generate') return;
  if (busy) return;
  busy = true; cancelled = false;
  try {
    const r = await run({ id: m.id, prompt: String(m.prompt || ''), seed: m.seed == null ? (Math.random() * 4294967296) >>> 0 : m.seed });
    self.postMessage({ type: 'result', id: m.id, w: r.w, h: r.h, rgba: r.rgba.buffer, backend: backendUsed }, [r.rgba.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
  busy = false;
};
