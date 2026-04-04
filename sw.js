const CACHE_NAME = 'docuwritepro-v1';

// The list of pages you provided
const URLS_TO_CACHE = [
  './',
  './index.html',
  './1.html',
  './404.html',
  './Dashboard.html',
  './aboutapp.html',
  './app.html',
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
  './wb.html'
];

// Install Event: Caches all the pages listed above
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Fetch Event: Serve from cache if offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response, otherwise try network
        return response || fetch(event.request);
      })
  );
});
