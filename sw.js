// ============================================================
//  DocuWrite Pro — Service Worker  v5.0.4.8
//  Strategies:
//    SHELL_CACHE  → Cache-first  (own .html pages, app shell)
//    LIB_CACHE    → Stale-while-revalidate  (CDN / third-party libs)
//    NEVER_CACHE  → Network-only (live data endpoints)
// ============================================================

const SHELL_CACHE = 'dwp-shell-v5048';
const LIB_CACHE   = 'dwp-libs-v5048';

// ── Own-origin pages to pre-cache on install ─────────────────
const OWN_ORIGIN = 'https://mahi902.github.io';
const BASE_PATH  = '/DocuWritePro/';

// Every tool page extracted from toolsDB (including onlineOnly —
// their HTML shell is still useful offline even if features need net).
const PRECACHE_PAGES = [
  // App shell
  'app.html',
  'manifest.json',

  // Document Editing
  'document-writer.html',
  'viewer.html',
  'markup.html',
  'word-description-finder.html',
  'translator.html',
  'document-signer.html',
  'findandreplacer.html',
  'page-number-adder.html',
  'spreadsheet.html',
  'rm.html',
  'fe.html',
  'chart-maker.html',
  'graphmaker.html',
  'whiteboard.html',
  'mmm.html',
  'table-maker.html',
  'watermarker.html',
  'email-writer.html',
  'spell-checker.html',
  'file-extractor.html',
  'qr-code-maker.html',
  'id-card-maker.html',
  'file-zipper.html',
  'converters.html',
  'pdfcompressor.html',
  'context-field.html',
  'metadatainspector.html',
  'gift-card-maker.html',
  'docudrop.html',
  'text-extractor.html',
  'keyboard-click-test.html',

  // Code Editing
  'frontend-ide.html',
  'code-playground.html',
  'html.html',
  'mdeditor.html',
  'button-designer.html',
  'html-splitter.html',
  'goto-code.html',
  'code-snipper.html',

  // Image Editing
  'image-editor.html',
  'atbedt.html',
  'draw.html',

  // Collaboration
  'collab-document-editor.html',
  'connect1.html',
  'connect.html',

  // Other key pages
  'sceditor.html',
  'dynote.html',
  'scanner.html',
  'welcome.html',
  'aboutapp.html',
  'instapp.html',
].map(p => BASE_PATH + p);

// ── Offline assets for the editor (sceditor.html) + its tools ─
// Self-hosted libraries, fonts, data files, sub-pages and the ColorLabs
// iframe tools. Everything here is pre-cached on install so every
// editor feature that does not need a server works with no connection.
// Paths are URL-encoded exactly as the browser requests them.
const OFFLINE_ASSETS = [
  'copy.html',
  'defw.html',
  'enlimg.html',
  'red.html',
  'temp.html',
  'customlinks.json',
  'textstyles.json',
  'textfonts.txt',
  'ffonts.json',
  'pmarg.json',
  'ctab.json',
  'aed.txt',
  'sceditortips.txt',
  'img/1024appicon.png',
  'img/Icon.png',
  'img/verifiedonlybottomright.png',
  'MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.woff2',
  'ColorLabs/actionconfirmation1.html',
  'ColorLabs/asset/000.txt',
  'ColorLabs/asset/001.png',
  'ColorLabs/asset/002.png',
  'ColorLabs/chartmaker1.html',
  'ColorLabs/colorchooser1.html',
  'ColorLabs/draw1.html',
  'vendor/bootstrap-icons/font/bootstrap-icons.min.css',
  'vendor/bootstrap-icons/font/fonts/bootstrap-icons.woff',
  'vendor/bootstrap-icons/font/fonts/bootstrap-icons.woff2',
  'vendor/chart.umd.min.js',
  'vendor/fabric.min.js',
  'vendor/fonts/MaterialSymbolsRounded.woff2',
  'vendor/fonts/files/barlow-latin-400-normal.woff2',
  'vendor/fonts/files/barlow-latin-700-normal.woff2',
  'vendor/fonts/files/caveat-latin-400-normal.woff2',
  'vendor/fonts/files/caveat-latin-700-normal.woff2',
  'vendor/fonts/files/cormorant-garamond-latin-400-normal.woff2',
  'vendor/fonts/files/cormorant-garamond-latin-700-normal.woff2',
  'vendor/fonts/files/crimson-text-latin-400-normal.woff2',
  'vendor/fonts/files/crimson-text-latin-700-normal.woff2',
  'vendor/fonts/files/dancing-script-latin-400-normal.woff2',
  'vendor/fonts/files/dancing-script-latin-700-normal.woff2',
  'vendor/fonts/files/dm-mono-latin-400-normal.woff2',
  'vendor/fonts/files/dm-mono-latin-500-normal.woff2',
  'vendor/fonts/files/dm-sans-latin-300-italic.woff2',
  'vendor/fonts/files/dm-sans-latin-300-normal.woff2',
  'vendor/fonts/files/dm-sans-latin-400-normal.woff2',
  'vendor/fonts/files/dm-sans-latin-500-normal.woff2',
  'vendor/fonts/files/dm-sans-latin-600-normal.woff2',
  'vendor/fonts/files/dm-sans-latin-700-normal.woff2',
  'vendor/fonts/files/eb-garamond-latin-400-normal.woff2',
  'vendor/fonts/files/eb-garamond-latin-700-normal.woff2',
  'vendor/fonts/files/exo-2-latin-400-normal.woff2',
  'vendor/fonts/files/exo-2-latin-700-normal.woff2',
  'vendor/fonts/files/figtree-latin-400-normal.woff2',
  'vendor/fonts/files/figtree-latin-700-normal.woff2',
  'vendor/fonts/files/fira-code-latin-400-normal.woff2',
  'vendor/fonts/files/fira-code-latin-700-normal.woff2',
  'vendor/fonts/files/great-vibes-latin-400-normal.woff2',
  'vendor/fonts/files/hind-siliguri-bengali-400-normal.woff2',
  'vendor/fonts/files/hind-siliguri-bengali-700-normal.woff2',
  'vendor/fonts/files/hind-siliguri-latin-400-normal.woff2',
  'vendor/fonts/files/hind-siliguri-latin-700-normal.woff2',
  'vendor/fonts/files/ibm-plex-mono-latin-400-normal.woff2',
  'vendor/fonts/files/ibm-plex-mono-latin-700-normal.woff2',
  'vendor/fonts/files/jetbrains-mono-latin-400-normal.woff2',
  'vendor/fonts/files/jetbrains-mono-latin-700-normal.woff2',
  'vendor/fonts/files/josefin-sans-latin-400-normal.woff2',
  'vendor/fonts/files/josefin-sans-latin-700-normal.woff2',
  'vendor/fonts/files/karla-latin-400-normal.woff2',
  'vendor/fonts/files/karla-latin-700-normal.woff2',
  'vendor/fonts/files/lato-latin-400-normal.woff2',
  'vendor/fonts/files/lato-latin-700-normal.woff2',
  'vendor/fonts/files/lexend-latin-400-normal.woff2',
  'vendor/fonts/files/lexend-latin-700-normal.woff2',
  'vendor/fonts/files/libre-baskerville-latin-400-normal.woff2',
  'vendor/fonts/files/libre-baskerville-latin-700-normal.woff2',
  'vendor/fonts/files/lora-latin-400-normal.woff2',
  'vendor/fonts/files/lora-latin-700-normal.woff2',
  'vendor/fonts/files/manrope-latin-400-normal.woff2',
  'vendor/fonts/files/manrope-latin-700-normal.woff2',
  'vendor/fonts/files/merriweather-latin-400-normal.woff2',
  'vendor/fonts/files/merriweather-latin-700-normal.woff2',
  'vendor/fonts/files/montserrat-latin-400-normal.woff2',
  'vendor/fonts/files/montserrat-latin-700-normal.woff2',
  'vendor/fonts/files/noto-sans-bengali-bengali-400-normal.woff2',
  'vendor/fonts/files/noto-sans-bengali-bengali-700-normal.woff2',
  'vendor/fonts/files/noto-sans-bengali-latin-400-normal.woff2',
  'vendor/fonts/files/noto-sans-bengali-latin-700-normal.woff2',
  'vendor/fonts/files/noto-sans-latin-400-normal.woff2',
  'vendor/fonts/files/noto-sans-latin-700-normal.woff2',
  'vendor/fonts/files/noto-serif-bengali-bengali-400-normal.woff2',
  'vendor/fonts/files/noto-serif-bengali-bengali-700-normal.woff2',
  'vendor/fonts/files/noto-serif-bengali-latin-400-normal.woff2',
  'vendor/fonts/files/noto-serif-bengali-latin-700-normal.woff2',
  'vendor/fonts/files/noto-serif-latin-400-normal.woff2',
  'vendor/fonts/files/noto-serif-latin-700-normal.woff2',
  'vendor/fonts/files/nunito-latin-400-normal.woff2',
  'vendor/fonts/files/nunito-latin-700-normal.woff2',
  'vendor/fonts/files/open-sans-latin-400-normal.woff2',
  'vendor/fonts/files/open-sans-latin-700-normal.woff2',
  'vendor/fonts/files/oswald-latin-400-normal.woff2',
  'vendor/fonts/files/oswald-latin-700-normal.woff2',
  'vendor/fonts/files/outfit-latin-400-normal.woff2',
  'vendor/fonts/files/outfit-latin-700-normal.woff2',
  'vendor/fonts/files/pacifico-latin-400-normal.woff2',
  'vendor/fonts/files/playfair-display-latin-400-normal.woff2',
  'vendor/fonts/files/playfair-display-latin-700-normal.woff2',
  'vendor/fonts/files/plus-jakarta-sans-latin-400-normal.woff2',
  'vendor/fonts/files/plus-jakarta-sans-latin-700-normal.woff2',
  'vendor/fonts/files/poppins-latin-400-normal.woff2',
  'vendor/fonts/files/poppins-latin-700-normal.woff2',
  'vendor/fonts/files/pt-serif-latin-400-normal.woff2',
  'vendor/fonts/files/pt-serif-latin-700-normal.woff2',
  'vendor/fonts/files/quicksand-latin-400-normal.woff2',
  'vendor/fonts/files/quicksand-latin-500-normal.woff2',
  'vendor/fonts/files/quicksand-latin-600-normal.woff2',
  'vendor/fonts/files/quicksand-latin-700-normal.woff2',
  'vendor/fonts/files/raleway-latin-400-normal.woff2',
  'vendor/fonts/files/raleway-latin-700-normal.woff2',
  'vendor/fonts/files/roboto-latin-400-normal.woff2',
  'vendor/fonts/files/roboto-latin-700-normal.woff2',
  'vendor/fonts/files/roboto-mono-latin-400-normal.woff2',
  'vendor/fonts/files/roboto-mono-latin-700-normal.woff2',
  'vendor/fonts/files/rubik-latin-400-normal.woff2',
  'vendor/fonts/files/rubik-latin-700-normal.woff2',
  'vendor/fonts/files/sacramento-latin-400-normal.woff2',
  'vendor/fonts/files/satisfy-latin-400-normal.woff2',
  'vendor/fonts/files/sora-latin-400-normal.woff2',
  'vendor/fonts/files/sora-latin-700-normal.woff2',
  'vendor/fonts/files/source-code-pro-latin-400-normal.woff2',
  'vendor/fonts/files/source-code-pro-latin-700-normal.woff2',
  'vendor/fonts/files/source-serif-4-latin-400-normal.woff2',
  'vendor/fonts/files/source-serif-4-latin-700-normal.woff2',
  'vendor/fonts/files/spectral-latin-400-normal.woff2',
  'vendor/fonts/files/spectral-latin-700-normal.woff2',
  'vendor/fonts/files/titillium-web-latin-400-normal.woff2',
  'vendor/fonts/files/titillium-web-latin-700-normal.woff2',
  'vendor/fonts/files/ubuntu-latin-400-normal.woff2',
  'vendor/fonts/files/ubuntu-latin-700-normal.woff2',
  'vendor/fonts/fonts.css',
  'vendor/fonts/material.css',
  'vendor/franc-min.min.js',
  'vendor/harper.js',
  'vendor/html2canvas.min.js',
  'vendor/jspdf.umd.min.js',
  'vendor/katex/auto-render.min.js',
  'vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  'vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  'vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  'vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Script-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
  'vendor/katex/katex.min.css',
  'vendor/katex/katex.min.js',
  'vendor/marked.min.js',
  'vendor/pdf-lib.min.js',
  'vendor/peerjs.min.js',
  'vendor/qrcode.js',
  'vendor/yjs.mjs',
  'words.txt'
].map(p => BASE_PATH + p);

// Files that never change without a cache-version bump: serve straight
// from cache and never re-download in the background (harper.js ~5.6 MB,
// words.txt ~4.8 MB, fonts, vendor libs).
const IMMUTABLE_RE = /\/(vendor|ColorLabs\/asset)\/|\/words\.txt$|MaterialSymbols.*\.woff2$|\.woff2?$/;

// ── Live-data URLs — always fetch from network, never cache ──
const NEVER_CACHE_PATTERNS = [
  /\/current\.txt/,
  /\/su\.json/,
  /\/temp\.json/,          // template list (changes often)
  /accounts\.google\.com/, // Google auth
  /\/gsi\/client/,
];

// ── CDN / third-party host patterns → LIB_CACHE ──────────────
const LIB_HOST_PATTERNS = [
  /cdnjs\.cloudflare\.com/,
  /unpkg\.com/,
  /cdn\.jsdelivr\.net/,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /buttons\.github\.io/,
  /mozilla\.github\.io/,    // pdf.js
];

// ─────────────────────────────────────────────────────────────
//  INSTALL — pre-cache the app shell + all tool pages
// ─────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => {
      // addAll fails if ANY request fails; use individual adds so one
      // missing page doesn't block the whole install.
      return Promise.allSettled(
        PRECACHE_PAGES.concat(OFFLINE_ASSETS).map(url =>
          cache.add(new Request(OWN_ORIGIN + url, { cache: 'reload' }))
               .catch(err => console.warn('[SW] Pre-cache miss:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ─────────────────────────────────────────────────────────────
//  ACTIVATE — delete stale caches from old versions
// ─────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const KEEP = [SHELL_CACHE, LIB_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KEEP.includes(k)).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────────────────────
//  FETCH — route each request to the right strategy
// ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Only handle GET; let POST/PUT pass through untouched
  if (request.method !== 'GET') return;

  // ── Never-cache: live data / auth ──────────────────────────
  if (NEVER_CACHE_PATTERNS.some(re => re.test(url))) {
    event.respondWith(fetch(request));
    return;
  }

  // ── Third-party CDN libs: stale-while-revalidate ───────────
  if (LIB_HOST_PATTERNS.some(re => re.test(url))) {
    event.respondWith(staleWhileRevalidate(request, LIB_CACHE));
    return;
  }

  // ── Own origin, immutable assets: cache-first, no bg refresh ─
  if (url.startsWith(OWN_ORIGIN) && IMMUTABLE_RE.test(url)) {
    event.respondWith(cacheOnly(request, SHELL_CACHE));
    return;
  }

  // ── Own origin: cache-first (serve from cache, update bg) ──
  if (url.startsWith(OWN_ORIGIN)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // ── Everything else: network with cache fallback ───────────
  event.respondWith(networkWithCacheFallback(request, SHELL_CACHE));
});

// ─────────────────────────────────────────────────────────────
//  Strategy helpers
// ─────────────────────────────────────────────────────────────

/** Cache-first: serve cached copy instantly; revalidate in background */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    // Background refresh so next visit gets the latest version
    fetch(request).then(res => {
      if (res && res.ok) cache.put(request, res);
    }).catch(() => {});
    return cached;
  }
  // Not in cache yet — fetch, store, and return
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — this page has not been cached yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/** Immutable assets: cache first; fetch + store once if missing */
async function cacheOnly(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

/** Stale-while-revalidate: return cache immediately AND update it */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);

  return cached || await fetchPromise || new Response('', { status: 503 });
}

/** Network-first with cache fallback (for unknown third-party fetches) */
async function networkWithCacheFallback(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('', { status: 503 });
  }
}

// ─────────────────────────────────────────────────────────────
//  MESSAGE — allow the app to trigger a manual cache refresh
//  Usage: navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
// ─────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
