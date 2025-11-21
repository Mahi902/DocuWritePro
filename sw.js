const CACHE_NAME = 'docuwrite-cache-v2';
const urlsToCache = [
  '/',  // homepage
  '/DocuWritePro/app.html',
  '/DocuWritePro/recents.html',
  '/DocuWritePro/index.html',
  '/DocuWritePro/editor.html',
  '/DocuWritePro/collab.html',
  '/DocuWritePro/document-viewer.html',
  '/DocuWritePro/word-finder.html',
  '/DocuWritePro/translator.html',
  '/DocuWritePro/document-signer.html',
  '/DocuWritePro/page-number-adder.html',
  '/DocuWritePro/chart-maker.html',
  '/DocuWritePro/table-maker.html',
  '/DocuWritePro/watermark-adder.html',
  '/DocuWritePro/email-writer.html',
  '/DocuWritePro/spell-checker.html',
  '/DocuWritePro/file-extractor.html',
  '/DocuWritePro/qr-maker.html',
  '/DocuWritePro/id-card-maker.html',
  '/DocuWritePro/file-zipper.html',
  '/DocuWritePro/pdf-converter.html',
  '/DocuWritePro/context-field.html',
  '/DocuWritePro/gift-card-maker.html',
  '/DocuWritePro/share-file.html',
  '/DocuWritePro/text-extractor.html',
  '/DocuWritePro/keyboard-click-test.html',
  '/DocuWritePro/frontend-ide.html',
  '/DocuWritePro/html-editor.html',
  '/DocuWritePro/html-writer.html',
  '/DocuWritePro/button-designer.html',
  '/DocuWritePro/html-splitter.html',
  '/DocuWritePro/goto-code.html',
  '/DocuWritePro/code-snipper.html',
  '/DocuWritePro/image-editor.html',
  '/DocuWritePro/image-generator.html',
  '/DocuWritePro/drawing-board.html'
];

// Install
self.addEventListener('install', event => {
  self.skipWaiting(); // make new SW active immediately

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        urlsToCache.map(url =>
          cache.add(url).catch(err => {
            console.warn("Failed to cache", url, err);
          })
        )
      );
    })
  );
});

// Activate
self.addEventListener('activate', event => {
  self.clients.claim();

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    )
  );
});

// Fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).catch(() => {
        // If it's a navigation request, fall back to your main page
        if (event.request.mode === 'navigate') {
          return caches.match('/DocuWritePro/index.html');
        }
      });
    })
  );
});
