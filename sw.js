const CACHE_NAME = 'docuwrite-pro-cache-v1';

const urlsToCache = [
  '/app.html',
  '/manifest.json',

  // Only same-origin files!
  '/document-writer.html',
  '/collab-document-editor.html',
  '/viewer.html',
  '/word-description-finder.html',
  '/translator.html',
  '/document-signer.html',
  '/findandreplacer.html',
  '/page-number-adder.html',
  '/rm.html',
  '/chart-maker.html',
  '/graphmaker.html',
  '/whiteboard.html',
  '/mmm.html',
  '/table-maker.html',
  '/watermarker.html',
  '/email-writer.html',
  '/spell-checker.html',
  '/file-extractor.html',
  '/qr-code-maker.html',
  '/id-card-maker.html',
  '/file-zipper.html',
  '/converters.html',
  '/pdfcompressor.html',
  '/context-field.html',
  '/gift-card-maker.html',
  '/docudrop.html',
  '/text-extractor.html',
  '/keyboard-click-test.html',
  '/frontend-ide.html',
  '/code-playground.html',
  '/html.html',
  '/wawm.html',
  '/mdeditor.html',
  '/button-designer.html',
  '/html-splitter.html',
  '/goto-code.html',
  '/code-snipper.html',
  '/image-editor.html',
  '/atbedt.html',
  '/image-generator.html',
  '/draw.html'
];

// Install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.all(
          urlsToCache.map(url =>
            fetch(url).then(res => cache.put(url, res))
          )
        );
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('SW install error:', err))
  );
});

// Activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
      .catch(() => new Response("Offline and not cached"))
  );
});
