const CACHE_NAME = 'docuwrite-pro-cache-v1';
const urlsToCache = [
  '/app.html',
  '/manifest.json',

  // Tailwind CSS
  'https://cdn.tailwindcss.com',

  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0',

  // Main Tools & Pages
  'https://mahi902.github.io/Aurora/pollinatedai.html',
  'https://mahi902.github.io/DocuWritePro/document-writer.html',
  'https://mahi902.github.io/DocuWritePro/collab-document-editor.html',
  'https://mahi902.github.io/DocuWritePro/viewer.html',
  'https://mahi902.github.io/DocuWritePro/word-description-finder.html',
  'https://mahi902.github.io/DocuWritePro/translator.html',
  'https://mahi902.github.io/DocuWritePro/document-signer.html',
  'https://mahi902.github.io/DocuWritePro/findandreplacer.html',
  'https://mahi902.github.io/DocuWritePro/page-number-adder.html',
  'https://mahi902.github.io/DocuWritePro/rm.html',
  'https://mahi902.github.io/DocuWritePro/chart-maker.html',
  'https://mahi902.github.io/DocuWritePro/graphmaker.html',
  'https://mahi902.github.io/DocuWritePro/whiteboard.html',
  'https://mahi902.github.io/DocuWritePro/mmm.html',
  'https://mahi902.github.io/DocuWritePro/table-maker.html',
  'https://mahi902.github.io/DocuWritePro/watermarker.html',
  'https://mahi902.github.io/DocuWritePro/email-writer.html',
  'https://mahi902.github.io/DocuWritePro/spell-checker.html',
  'https://mahi902.github.io/DocuWritePro/file-extractor.html',
  'https://mahi902.github.io/DocuWritePro/qr-code-maker.html',
  'https://mahi902.github.io/DocuWritePro/id-card-maker.html',
  'https://mahi902.github.io/DocuWritePro/file-zipper.html',
  'https://mahi902.github.io/DocuWritePro/converters.html',
  'https://mahi902.github.io/DocuWritePro/pdfcompressor.html',
  'https://mahi902.github.io/DocuWritePro/context-field.html',
  'https://mahi902.github.io/DocuWritePro/gift-card-maker.html',
  'https://mahi902.github.io/DocuWritePro/docudrop.html',
  'https://mahi902.github.io/DocuWritePro/text-extractor.html',
  'https://mahi902.github.io/DocuWritePro/keyboard-click-test.html',
  'https://mahi902.github.io/DocuWritePro/frontend-ide.html',
  'https://mahi902.github.io/DocuWritePro/code-playground.html',
  'https://mahi902.github.io/DocuWritePro/html.html',
  'https://mahi902.github.io/DocuWritePro/wawm.html',
  'https://mahi902.github.io/DocuWritePro/mdeditor.html',
  'https://mahi902.github.io/DocuWritePro/button-designer.html',
  'https://mahi902.github.io/DocuWritePro/html-splitter.html',
  'https://mahi902.github.io/DocuWritePro/goto-code.html',
  'https://mahi902.github.io/DocuWritePro/code-snipper.html',
  'https://mahi902.github.io/DocuWritePro/image-editor.html',
  'https://mahi902.github.io/DocuWritePro/atbedt.html',
  'https://mahi902.github.io/DocuWritePro/image-generator.html',
  'https://mahi902.github.io/DocuWritePro/draw.html'
];

// Install Service Worker and cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate SW and clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch handler to serve cached content first
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request).catch(() => {
        // Optionally return a fallback page here if offline
        return new Response("You are offline. Page not cached.");
      });
    })
  );
});
