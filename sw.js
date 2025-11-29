const CACHE_NAME = "docuwrite-pro-cache-v2";

const PAGES_TO_CACHE = [
  "/",
  "/app.html",
  "/manifest.json",

  // Main Tools (same-origin only)
  "/document-writer.html",
  "/collab-document-editor.html",
  "/viewer.html",
  "/word-description-finder.html",
  "/translator.html",
  "/document-signer.html",
  "/findandreplacer.html",
  "/page-number-adder.html",
  "/rm.html",
  "/chart-maker.html",
  "/graphmaker.html",
  "/whiteboard.html",
  "/mmm.html",
  "/table-maker.html",
  "/watermarker.html",
  "/email-writer.html",
  "/spell-checker.html",
  "/file-extractor.html",
  "/qr-code-maker.html",
  "/id-card-maker.html",
  "/file-zipper.html",
  "/converters.html",
  "/pdfcompressor.html",
  "/context-field.html",
  "/gift-card-maker.html",
  "/docudrop.html",
  "/text-extractor.html",
  "/keyboard-click-test.html",
  "/frontend-ide.html",
  "/code-playground.html",
  "/html.html",
  "/wawm.html",
  "/mdeditor.html",
  "/button-designer.html",
  "/html-splitter.html",
  "/goto-code.html",
  "/code-snipper.html",
  "/image-editor.html",
  "/atbedt.html",
  "/image-generator.html",
  "/draw.html"
];

// -------------------------
// INSTALL
// -------------------------
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        PAGES_TO_CACHE.map(url => {
          return fetch(url)
            .then(res => {
              if (!res.ok) throw new Error("Failed: " + url);
              return cache.put(url, res);
            })
            .catch(() => {
              console.warn("Not cached (likely 404 or CORS):", url);
            });
        })
      );
    })
  );

  self.skipWaiting();
});

// -------------------------
// ACTIVATE
// -------------------------
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );

  self.clients.claim();
});

// -------------------------
// FETCH STRATEGY
// -------------------------
self.addEventListener("fetch", event => {
  const req = event.request;

  // -------------------------
  // 1. HTML → NETWORK FIRST
  // -------------------------
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => {
          return caches.match(req).then(cached => {
            return (
              cached ||
              new Response("Offline and page not cached yet.", {
                headers: { "Content-Type": "text/plain" }
              })
            );
          });
        })
    );
    return;
  }

  // -------------------------
  // 2. STATIC FILES → CACHE FIRST
  // -------------------------
  event.respondWith(
    caches.match(req).then(cached => {
      return (
        cached ||
        fetch(req)
          .then(res => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
            return res;
          })
          .catch(() => cached)
      );
    })
  );
});
