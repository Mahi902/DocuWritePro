/**
 * Pre 1 — Local Predictive Language Model
 * Sugarcane Editor · DocuWrite Pro
 * mahi902.github.io/DocuWritePro/ai/pre1.js
 *
 * A pure client-side, n-gram + frequency predictive text engine.
 * No API calls. No servers. All inference runs in your browser.
 *
 * Public surface (attach to window.Pre1 via loader):
 *   Pre1.init(corpusText)         — seed base corpus
 *   Pre1.addContext(text)         — add document text as context
 *   Pre1.removeContext(id)        — remove a named context block
 *   Pre1.clearContext()           — reset all added context
 *   Pre1.predict(opts)            — main prediction entry-point
 *   Pre1.getStats()               — return model diagnostics
 *   Pre1.MODEL_NAME               — "Pre 1"
 *   Pre1.MODEL_VERSION            — semver string
 */

(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────────────────── */
  const MODEL_NAME    = 'Pre 1';
  const MODEL_VERSION = '1.0.0';
  const NGRAM_SIZES   = [5, 4, 3, 2, 1]; // descending priority
  const MAX_VOCAB     = 80000;

  /* ─────────────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────────────── */
  /** @type {Map<string, Map<string, number>>} key = joined n-gram, value = Map<nextWord, count> */
  const ngrams = new Map();
  /** @type {Map<string, number>} unigram frequencies */
  const freqMap = new Map();
  /** @type {string[]} ordered vocabulary list */
  let vocab = [];
  /** @type {boolean} */
  let _ready = false;
  /** @type {number} total tokens trained on */
  let _totalTokens = 0;
  /** @type {Map<string, string>} named context blocks */
  const _contextBlocks = new Map();
  /** @type {number} total refinements performed in current session */
  let _sessionRefinements = 0;

  /* ─────────────────────────────────────────────────────
     TOKENISER
  ───────────────────────────────────────────────────── */
  /**
   * Split text into word-like tokens, preserving basic punctuation
   * as separate tokens so the model learns sentence boundaries.
   * @param {string} text
   * @returns {string[]}
   */
  function tokenise(text) {
    if (!text || typeof text !== 'string') return [];
    // Normalise whitespace, split on word boundaries keeping punct
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/[^\w\s.,!?;:'"\-\n]/g, ' ')
      .match(/[\w']+|[.,!?;:\n]/g) || [];
  }

  /**
   * Lower-case a token for lookup; preserve case in output via a
   * separate mapping step.
   */
  function normalise(token) {
    return token.toLowerCase();
  }

  /* ─────────────────────────────────────────────────────
     INDEX BUILDER
  ───────────────────────────────────────────────────── */
  /**
   * Feed an array of tokens into the n-gram index.
   * @param {string[]} tokens
   */
  function indexTokens(tokens) {
    const n = tokens.length;
    _totalTokens += n;

    // Unigram frequencies
    for (let i = 0; i < n; i++) {
      const w = normalise(tokens[i]);
      freqMap.set(w, (freqMap.get(w) || 0) + 1);
    }

    // N-grams
    for (const size of NGRAM_SIZES) {
      for (let i = 0; i <= n - size - 1; i++) {
        const key = tokens.slice(i, i + size).map(normalise).join('\x00');
        const next = normalise(tokens[i + size]);
        if (!ngrams.has(key)) ngrams.set(key, new Map());
        const followers = ngrams.get(key);
        followers.set(next, (followers.get(next) || 0) + 1);
      }
    }

    // Rebuild vocabulary (top MAX_VOCAB words by frequency)
    const sorted = [...freqMap.entries()].sort((a, b) => b[1] - a[1]);
    vocab = sorted.slice(0, MAX_VOCAB).map(([w]) => w);
  }

  /* ─────────────────────────────────────────────────────
     PUBLIC: INIT / CONTEXT MANAGEMENT
  ───────────────────────────────────────────────────── */
  function init(corpusText) {
    ngrams.clear();
    freqMap.clear();
    vocab = [];
    _totalTokens = 0;
    _ready = false;
    if (corpusText) {
      indexTokens(tokenise(corpusText));
    }
    _ready = true;
  }

  /**
   * @param {string} id   — unique identifier for this context block
   * @param {string} text — document text or loaded .scd content
   */
  function addContext(id, text) {
    _contextBlocks.set(id, text);
    if (text) indexTokens(tokenise(text));
  }

  function removeContext(id) {
    if (!_contextBlocks.has(id)) return;
    _contextBlocks.delete(id);
    // Rebuild index from scratch with remaining blocks
    _rebuildFromContexts();
  }

  function clearContext() {
    _contextBlocks.clear();
    // Leave base corpus — just remove added context by rebuilding
    _rebuildFromContexts();
  }

  function _rebuildFromContexts() {
    // Re-index only context blocks (base corpus already indexed; rebuild all)
    // This is conservative but correct for a client-side tool
    ngrams.clear();
    freqMap.clear();
    vocab = [];
    _totalTokens = 0;
    for (const text of _contextBlocks.values()) {
      if (text) indexTokens(tokenise(text));
    }
  }

  /* ─────────────────────────────────────────────────────
     PREDICTION CORE
  ───────────────────────────────────────────────────── */

  /**
   * Given the recent context words (tail), find the best next word candidate.
   * @param {string[]} contextWords   — normalised recent words
   * @param {object}   opts
   * @param {number}   opts.accuracy  — 0..1, minimum relative frequency threshold
   * @param {boolean}  opts.punctuation — allow punctuation as predicted token
   * @param {Set}      opts.recentWords — words used recently (avoid repetition)
   * @returns {{ word: string, confidence: number } | null}
   */
  function predictNext(contextWords, opts) {
    const { accuracy = 0.3, punctuation = false, recentWords = new Set() } = opts;
    const PUNCT_TOKENS = new Set(['.', ',', '!', '?', ';', ':']);

    for (const size of NGRAM_SIZES) {
      if (contextWords.length < size) continue;
      const tail = contextWords.slice(-size);
      const key  = tail.join('\x00');
      const followers = ngrams.get(key);
      if (!followers || followers.size === 0) continue;

      // Sort candidates by count descending
      const sorted = [...followers.entries()].sort((a, b) => b[1] - a[1]);
      const topCount = sorted[0][1];

      for (const [candidate, count] of sorted) {
        // Skip punctuation unless allowed
        if (!punctuation && PUNCT_TOKENS.has(candidate)) continue;
        // Accuracy gate: candidate must be at least `accuracy` fraction of top
        const relFreq = count / topCount;
        if (relFreq < accuracy) continue;
        // Avoid recent repetition (light suppression)
        if (recentWords.has(candidate) && sorted.length > 3) continue;
        // Return with normalised confidence 0..1
        const globalFreq = freqMap.get(candidate) || 0;
        const confidence = Math.min(1, (relFreq * 0.6) + (globalFreq / (_totalTokens || 1)) * 0.4 * 1000);
        return { word: candidate, confidence };
      }
    }

    // Fallback: frequency-based unigram
    for (const w of vocab) {
      if (!punctuation && PUNCT_TOKENS.has(w)) continue;
      if (recentWords.has(w)) continue;
      const globalFreq = freqMap.get(w) || 0;
      const confidence = Math.min(0.3, globalFreq / (_totalTokens || 1) * 500);
      return { word: w, confidence };
    }

    return null;
  }

  /* ─────────────────────────────────────────────────────
     REFINEMENT
  ───────────────────────────────────────────────────── */
  /**
   * Post-process a generated sequence: check each word against
   * its immediate neighbourhood and optionally swap it for a better fit.
   * @param {string[]} words
   * @param {object} opts
   * @param {number} opts.visibility  — words of context seen before/after (1..10)
   * @param {number} opts.accuracy
   * @param {boolean} opts.punctuation
   * @returns {{ words: string[], refinements: number }}
   */
  function refine(words, opts) {
    const { visibility = 4, accuracy = 0.3, punctuation = false } = opts;
    const refined = [...words];
    let refinements = 0;

    for (let i = 1; i < refined.length - 1; i++) {
      const before = refined.slice(Math.max(0, i - visibility), i).map(normalise);
      const result = predictNext(before, { accuracy, punctuation, recentWords: new Set() });
      if (result && result.word !== normalise(refined[i]) && result.confidence > 0.45) {
        refined[i] = result.word;
        refinements++;
        _sessionRefinements++;
      }
    }
    return { words: refined, refinements };
  }

  /* ─────────────────────────────────────────────────────
     CAPITALISATION HELPER
  ───────────────────────────────────────────────────── */
  function capitaliseFirst(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Decide whether the upcoming word should be capitalised.
   * True after sentence-ending punctuation or at the start.
   */
  function shouldCapitalise(generated, inputTail) {
    if (generated.length === 0) {
      const last = inputTail[inputTail.length - 1];
      if (!last) return true;
      return /[.!?]/.test(last);
    }
    const last = generated[generated.length - 1];
    return /[.!?]/.test(last);
  }

  /* ─────────────────────────────────────────────────────
     STOP DETECTION
  ───────────────────────────────────────────────────── */
  /**
   * Return true if the model should stop generating naturally.
   * Logic: confidence drops or sentence-ending punctuation hit.
   */
  function shouldStop(word, confidence, generated, targetLength, limitEnabled) {
    const STOP_PUNCT = new Set(['.', '!', '?']);
    if (STOP_PUNCT.has(word)) {
      if (!limitEnabled) return true;
      if (generated.length >= targetLength * 0.6) return true;
    }
    if (limitEnabled && generated.length >= targetLength) return true;
    if (confidence < 0.05 && generated.length > 5) return true;
    return false;
  }

  /* ─────────────────────────────────────────────────────
     CREATIVITY / TEMPERATURE
  ───────────────────────────────────────────────────── */
  /**
   * Apply creativity: at higher creativity, occasionally pick a
   * less-than-top candidate to diversify output.
   * @param {number} creativity 0..1
   * @returns {boolean} true = skip this top candidate and try next
   */
  function applyCreativity(creativity) {
    // At creativity 0 = always pick top; at 1 = 40% chance skip
    return Math.random() < creativity * 0.4;
  }

  /* ─────────────────────────────────────────────────────
     MAIN PREDICT API
  ───────────────────────────────────────────────────── */
  /**
   * @typedef {object} PredictOptions
   * @property {string}   prefix         — text before the blank item (send input left part)
   * @property {string}   suffix         — text after the blank item (send input right part)
   * @property {number}   [accuracy=0.4] — 0..1
   * @property {number}   [creativity=0.3] — 0..1
   * @property {number}   [targetLength=20] — approximate word count to generate
   * @property {boolean}  [limitEnabled=true] — whether to honour targetLength
   * @property {boolean}  [punctuation=true]
   * @property {boolean}  [refinement=true]
   * @property {number}   [visibility=4]
   * @property {function} [onToken]      — called with (word, confidence) each step
   */

  /**
   * @param {PredictOptions} opts
   * @returns {Promise<PredictResult>}
   */
  async function predict(opts) {
    const {
      prefix         = '',
      suffix         = '',
      accuracy       = 0.4,
      creativity     = 0.3,
      targetLength   = 20,
      limitEnabled   = true,
      punctuation    = true,
      refinement     = true,
      visibility     = 4,
      onToken        = null,
    } = opts;

    if (!_ready) throw new Error('Pre 1: model not initialised. Call Pre1.init() first.');

    const t0 = performance.now();
    let stepConfidenceSum = 0;
    let stepCount = 0;

    // Build context from prefix (take last `visibility * 2` words)
    const prefixTokens = tokenise(prefix).map(normalise);
    const contextWindow = prefixTokens.slice(-visibility * 2);

    // Suffix words (for future context awareness in refinement)
    const suffixTokens = tokenise(suffix).map(normalise).slice(0, visibility);

    const generated = [];
    const recentWords = new Set();
    const MAX_STEPS = limitEnabled ? (targetLength * 2 + 20) : 200;

    for (let step = 0; step < MAX_STEPS; step++) {
      const contextWords = [...contextWindow, ...generated].slice(-visibility * 2);

      // Get candidates (we'll peek at top-3 for creativity)
      const result = predictNextWithAlts(contextWords, {
        accuracy,
        punctuation,
        recentWords,
        creativity,
      });

      if (!result) break;

      const { word, confidence } = result;
      stepConfidenceSum += confidence;
      stepCount++;

      // Capitalisation
      let outputWord = word;
      if (shouldCapitalise(generated, contextWindow)) {
        outputWord = capitaliseFirst(word);
      }

      generated.push(outputWord);
      recentWords.add(word);
      if (recentWords.size > 20) {
        const first = recentWords.values().next().value;
        recentWords.delete(first);
      }

      if (onToken) {
        await onToken(outputWord, confidence);
        // Yield to UI every token
        await new Promise(r => setTimeout(r, 0));
      }

      if (shouldStop(word, confidence, generated, targetLength, limitEnabled)) break;
    }

    // Refinement pass
    let refinementCount = 0;
    let finalWords = generated;
    if (refinement && generated.length > 2) {
      const refResult = refine(generated, { visibility, accuracy, punctuation });
      finalWords = refResult.words;
      refinementCount = refResult.refinements;
    }

    const t1 = performance.now();
    const avgConfidence = stepCount > 0 ? stepConfidenceSum / stepCount : 0;

    return {
      text: finalWords.join(' '),
      words: finalWords,
      wordCount: finalWords.length,
      refinements: refinementCount,
      confidence: parseFloat(avgConfidence.toFixed(3)),
      duration: parseFloat((t1 - t0).toFixed(1)),
      model: MODEL_NAME,
      version: MODEL_VERSION,
    };
  }

  /**
   * Internal: get next word with creativity applied.
   */
  function predictNextWithAlts(contextWords, opts) {
    const { accuracy, punctuation, recentWords, creativity } = opts;
    const PUNCT_TOKENS = new Set(['.', ',', '!', '?', ';', ':']);

    for (const size of NGRAM_SIZES) {
      if (contextWords.length < size) continue;
      const tail  = contextWords.slice(-size);
      const key   = tail.join('\x00');
      const followers = ngrams.get(key);
      if (!followers || followers.size === 0) continue;

      const sorted = [...followers.entries()].sort((a, b) => b[1] - a[1]);
      const topCount = sorted[0][1];

      for (const [candidate, count] of sorted) {
        if (!punctuation && PUNCT_TOKENS.has(candidate)) continue;
        const relFreq = count / topCount;
        if (relFreq < accuracy) continue;
        if (recentWords.has(candidate) && sorted.length > 3) continue;
        // Creativity: skip this candidate and try next with some probability
        if (applyCreativity(creativity) && sorted.length > 1) continue;
        const globalFreq = freqMap.get(candidate) || 0;
        const confidence = Math.min(1, (relFreq * 0.6) + (globalFreq / (_totalTokens || 1)) * 0.4 * 1000);
        return { word: candidate, confidence };
      }
      // If creativity skipped all, return top valid candidate
      for (const [candidate, count] of sorted) {
        if (!punctuation && PUNCT_TOKENS.has(candidate)) continue;
        const relFreq = count / topCount;
        if (relFreq < accuracy) continue;
        const globalFreq = freqMap.get(candidate) || 0;
        const confidence = Math.min(1, relFreq * 0.6 + (globalFreq / (_totalTokens || 1)) * 400);
        return { word: candidate, confidence };
      }
    }

    // Unigram fallback
    for (const w of vocab.slice(0, 500)) {
      if (!punctuation && PUNCT_TOKENS.has(w)) continue;
      if (recentWords.has(w)) continue;
      const globalFreq = freqMap.get(w) || 0;
      return { word: w, confidence: Math.min(0.2, globalFreq / (_totalTokens || 1) * 500) };
    }
    return null;
  }

  /* ─────────────────────────────────────────────────────
     DIAGNOSTICS
  ───────────────────────────────────────────────────── */
  function getStats() {
    return {
      model: MODEL_NAME,
      version: MODEL_VERSION,
      ready: _ready,
      totalTokens: _totalTokens,
      vocabSize: vocab.length,
      ngramKeys: ngrams.size,
      contextBlocks: _contextBlocks.size,
      sessionRefinements: _sessionRefinements,
    };
  }

  /* ─────────────────────────────────────────────────────
     EXPORT
  ───────────────────────────────────────────────────── */
  const Pre1 = {
    MODEL_NAME,
    MODEL_VERSION,
    init,
    addContext,
    removeContext,
    clearContext,
    predict,
    getStats,
    // Low-level access for advanced users
    _tokenise: tokenise,
    _indexTokens: indexTokens,
  };

  global.Pre1 = Pre1;

}(typeof globalThis !== 'undefined' ? globalThis : window));
