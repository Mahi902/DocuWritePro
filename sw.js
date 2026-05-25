// ============================================================
//  DocuWrite Pro — Service Worker  v5.0.4.7
//  Strategies:
//    SHELL_CACHE  → Cache-first  (own .html pages, app shell)
//    LIB_CACHE    → Stale-while-revalidate  (CDN / third-party libs)
//    NEVER_CACHE  → Network-only (live data endpoints)
// ============================================================

const SHELL_CACHE = 'dwp-shell-v5047';
const LIB_CACHE   = 'dwp-libs-v5047';

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
        PRECACHE_PAGES.map(url =>
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
  const cached = await cache.match(request);
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

/** Stale-while-revalidate: return cache immediately AND update it */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(res => {
    if (res && res.ok) cache.put(request, res.clone());
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
