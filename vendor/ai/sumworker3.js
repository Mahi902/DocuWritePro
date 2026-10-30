/* Summarization worker (SmolLM2-360M-Instruct, on-device).
   In:  init {modelId, download?} | summarize {id, text, style} | ask {id, question, context, history} | cancel {id?}
   Out: progress {file,loaded,total} | ready {backend} | stage {id, name} | token {id, text}
        | result {id, text} | error {id?, message}
   Runtime is self-hosted in this folder (same build as sentworker.js). */
import { pipeline, env, TextStreamer, InterruptableStoppingCriteria } from './transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.allowRemoteModels = true;   // must stay true: Transformers.js reads its browser cache through this path
env.backends.onnx.wasm.wasmPaths = new URL('./', self.location.href).href;

let gen = null, loading = null, backend = '', modelId = '', wantGpu = false, offline = false;
let stopper = null, cancelledId = null, running = false;
const queue = [];

const CHUNK_WORDS = 650;          // ~900 tokens per pass keeps CPU prefill quick and well inside the 8k context
const MAX_WORDS = 12000;          // refuse absurdly long input instead of grinding for minutes

const STYLES = {
  short:     { ask: 'in one or two sentences',                                   max: 90  },
  paragraph: { ask: 'as one short paragraph',                                    max: 170 },
  bullets:   { ask: 'as 3 to 6 bullet points, each line starting with "- "',     max: 220 }
};
const SYSTEM = 'You are a careful summarizer. Use only what the text says. Do not add facts, opinions, advice or a preamble. Reply in the same language as the text.';

async function build(device, id, cb) {
  const g = await pipeline('text-generation', id, { dtype: 'q8', device, progress_callback: cb });
  // A session can load on WebGPU and still fail on its first run, so prove it works now.
  await g([{ role: 'user', content: 'Say hi.' }], { max_new_tokens: 2, do_sample: false });
  return g;
}

async function load(id) {
  modelId = id;
  const cb = (p) => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); };
  const tries = (wantGpu && typeof navigator !== 'undefined' && navigator.gpu) ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr;
  for (const device of tries) {
    try { gen = await build(device, id, cb); backend = device; return; }
    catch (e) { lastErr = e; console.warn('[sumworker] ' + device + ' failed:', e); }
  }
  throw lastErr;
}

async function toWasm() {
  try { gen = null; gen = await build('wasm', modelId, () => {}); backend = 'wasm'; return true; }
  catch (e) { console.warn('[sumworker] wasm fallback failed:', e); return false; }
}

/* Split into pieces of roughly CHUNK_WORDS words, breaking at paragraph/sentence ends. */
function chunk(text) {
  const sents = text.replace(/\r/g, '').split(/(?<=[.!?。！？])\s+|\n{2,}/).map(s => s.trim()).filter(Boolean);
  const out = []; let cur = [], n = 0;
  for (const s of sents) {
    const w = s.split(/\s+/).length;
    if (n + w > CHUNK_WORDS && cur.length) { out.push(cur.join(' ')); cur = []; n = 0; }
    cur.push(s); n += w;
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

function clean(t, style) {
  t = (t || '').replace(/^\s*(here( is|'s) (a |the )?summary[^:\n]*:|summary:)\s*/i, '').trim();
  if (style === 'bullets') {
    t = t.split('\n').map(l => l.trim()).filter(Boolean)
         .map(l => l.replace(/^([*•\u2022]|\d+[.)])\s*/, '- ')).map(l => /^- /.test(l) ? l : '- ' + l).join('\n');
  }
  return t;
}

async function one(id, text, style, stream) {
  const s = STYLES[style] || STYLES.paragraph;
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: 'Summarize the text below ' + s.ask + '.\n\nText:\n' + text }
  ];
  stopper = new InterruptableStoppingCriteria();
  const opts = { max_new_tokens: s.max, do_sample: false, repetition_penalty: 1.1, stopping_criteria: stopper };
  if (stream) opts.streamer = new TextStreamer(gen.tokenizer, {
    skip_prompt: true, skip_special_tokens: true,
    callback_function: (t) => self.postMessage({ type: 'token', id, text: t })
  });
  const out = await gen(messages, opts);
  const g = out && out[0] && out[0].generated_text;
  const raw = Array.isArray(g) ? (g[g.length - 1] && g[g.length - 1].content) : String(g || '');
  return clean(raw, style);
}

async function summarize(job) {
  const words = job.text.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) throw new Error('That is too long to summarize on-device (' + words + ' words, limit ' + MAX_WORDS + '). Select a smaller part.');
  const style = STYLES[job.style] ? job.style : 'paragraph';
  let pieces = chunk(job.text);
  let pass = 0;
  // Map-reduce: summarize each piece briefly, then fold the notes together until one piece is left.
  while (pieces.length > 1) {
    pass++;
    const next = [];
    for (let i = 0; i < pieces.length; i++) {
      if (cancelledId === job.id) return '';
      self.postMessage({ type: 'stage', id: job.id, name: 'Reading part ' + (i + 1) + ' of ' + pieces.length + (pass > 1 ? ' (round ' + pass + ')' : '') + '…' });
      next.push(await one(job.id, pieces[i], 'paragraph', false));
    }
    pieces = chunk(next.join('\n\n'));
    if (pass >= 4) { pieces = [pieces.join(' ')]; break; }
  }
  if (cancelledId === job.id) return '';
  self.postMessage({ type: 'stage', id: job.id, name: 'Writing the summary…' });
  return await one(job.id, pieces[0], style, true);
}

const ASK_SYSTEM = 'You answer questions about a document using ONLY the excerpts you are given. If the excerpts do not contain the answer, say that you could not find it in the selected part of the document. Be concise and do not invent facts. Reply in the same language as the question.';
const MAX_ASK_WORDS = 2600;

/* Ask Document: answer one question from the excerpts the page selected (retrieval happens in the editor). */
async function answer(job) {
  const ctxWords = job.context.split(/\s+/).filter(Boolean).length;
  if (ctxWords > MAX_ASK_WORDS) throw new Error('Too much text for one question (' + ctxWords + ' words, limit ' + MAX_ASK_WORDS + '). Choose fewer pages.');
  const messages = [{ role: 'system', content: ASK_SYSTEM }];
  job.history.slice(-4).forEach(h => {
    if (h && (h.role === 'user' || h.role === 'assistant') && h.content) messages.push({ role: h.role, content: String(h.content).slice(0, 700) });
  });
  messages.push({ role: 'user', content: 'Excerpts from the document:\n\n' + job.context + '\n\nQuestion: ' + job.question });
  stopper = new InterruptableStoppingCriteria();
  const opts = {
    max_new_tokens: 280, do_sample: false, repetition_penalty: 1.1, stopping_criteria: stopper,
    streamer: new TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true,
      callback_function: (t) => self.postMessage({ type: 'token', id: job.id, text: t }) })
  };
  const out = await gen(messages, opts);
  const g = out && out[0] && out[0].generated_text;
  const raw = Array.isArray(g) ? (g[g.length - 1] && g[g.length - 1].content) : String(g || '');
  return (raw || '').trim();
}

const run = (job) => job.kind === 'ask' ? answer(job) : summarize(job);

async function pump() {
  if (running || !gen || !queue.length) return;
  running = true;
  const job = queue.shift();
  try {
    let text;
    try { text = await run(job); }
    catch (e) {
      if (backend === 'webgpu' && cancelledId !== job.id && await toWasm()) text = await run(job);
      else throw e;
    }
    self.postMessage({ type: 'result', id: job.id, text: cancelledId === job.id ? '' : text, cancelled: cancelledId === job.id });
  } catch (e) {
    console.error('[sumworker] summarize failed:', e);
    self.postMessage({ type: 'error', id: job.id, message: String((e && e.message) || e) });
  }
  running = false;
  pump();
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    wantGpu = !!m.webgpu;
    offline = !m.download;
    if (offline) {   // installed model: cache only. Refuse any cross-origin request (cache hits never call fetch).
      const realFetch = self.fetch.bind(self);
      const guard = (u, o) => {
        const url = new URL(typeof u === 'string' ? u : (u && u.url) || String(u), self.location.href);
        if (url.origin !== self.location.origin) return Promise.reject(new Error('Offline: a model file is missing from the cache. Re-download the model in Settings \u2192 AI.'));
        return realFetch(u, o);
      };
      self.fetch = guard; try { env.fetch = guard; } catch (_) {}
    }
    try { loading = loading || load(m.modelId); await loading; self.postMessage({ type: 'ready', backend }); }
    catch (err) { loading = null; self.postMessage({ type: 'error', message: String((err && err.message) || err) }); }
  } else if (m.type === 'summarize') {
    cancelledId = null;
    queue.push({ id: m.id, text: String(m.text || ''), style: m.style });
    pump();
  } else if (m.type === 'ask') {
    cancelledId = null;
    queue.push({ kind: 'ask', id: m.id, question: String(m.question || ''), context: String(m.context || ''), history: Array.isArray(m.history) ? m.history : [] });
    pump();
  } else if (m.type === 'cancel') {
    cancelledId = m.id != null ? m.id : cancelledId;
    queue.length = 0;
    try { stopper && stopper.interrupt(); } catch (_) {}
  }
};
