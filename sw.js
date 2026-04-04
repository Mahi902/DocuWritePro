const CACHE_NAME = 'docuwritepro-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.html',
  './1.html',
  './404.html',
  './Dashboard.html',
  './aboutapp.html',
  './atbedt.html',
  './button-designer.html',
  './chart-maker.html',
  './ci.html',
  './code-playground.html',
  './code-snipper.html',
  './collab-document-editor.html',
  './connect.html',
  './connect1.html',
  './converters.html',
  './context-field.html',
  './contact.html',
  './dcai.html',
  './ctpn.html',
  './ct.html',
  './document-writer.html',
  './document-signer.html',
  './docudrop.html',
  './dynote.html',
  './dppack.html',
  './draw.html',
  './file-extractor.html',
  './fe.html',
  './email-writer.html',
  './frontend-ide.html',
  './findandreplacer.html',
  './file-zipper.html',
  './graphmaker.html',
  './goto-code.html',
  './gift-card-maker.html',
  './id-card-maker.html',
  './html.html',
  './html-splitter.html',
  './image-generator.html',
  './image-editor.html',
  './keyboard-click-test.html',
  './j2p.html',
  './instapp.html',
  './lander1.html',
  './lander2.html',
  './lander3.html',
  './lander4.html',
  './mdeditor.html',
  './markup.html',
  './legal-documents.html',
  './p2j.html',
  './mmm.html',
  './mme.html',
  './metadatainspector.html',
  './privacy-policy.html',
  './pricing.html',
  './pes.html',
  './pdfcompressor.html',
  './page-number-adder.html',
  './rm.html',
  './ratings.html',
  './qr-code-maker.html',
  './spell-checker.html',
  './sceditor.html',
  './scanner.html',
  './temp.html',
  './table-maker.html',
  './spreadsheet.html',
  './translator.html',
  './tos.html',
  './text-extractor.html',
  './wawm.html',
  './watermarker.html',
  './viewer.html',
  './word-description-finder.html',
  './whiteboard.html',
  './webgen.html',
  './wb.html',
  './manifest.json'
];

// 1. Install: Pre-cache all pages
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('DocuWrite Pro: Pre-caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Force active immediately
});

// 2. Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('DocuWrite Pro: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. Fetch: Stale-While-Revalidate Strategy
// Serves from cache immediately, updates cache in background
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchedResponse = fetch(event.request).then((networkResponse) => {
          // If valid response, update the cache
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
            // If network fails and no cache, you could return an offline page here
            return cachedResponse; 
        });

        // Return cached version if exists, otherwise wait for network
        return cachedResponse || fetchedResponse;
      });
    })
  );
});
