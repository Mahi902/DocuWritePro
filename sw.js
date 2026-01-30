const CACHE_NAME = 'docuwrite-pro-v5';

// Install Event: Activate immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate Event: Claim clients immediately so we can control app.html right away
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Clean up old caches if any
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        if (cache !== CACHE_NAME) {
                            return caches.delete(cache);
                        }
                    })
                );
            })
        ])
    );
});

// Fetch Event: Cache First, Fallback to Network
// This ensures offline functionality for everything we've cached.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return cache if found
            if (response) {
                return response;
            }
            // Otherwise fetch from network
            return fetch(event.request).catch(() => {
                // Optional: Return a specific offline page if network fails and not in cache
                // For now, we rely on the caching logic in message listener
                return new Response("This tool isn’t fully installed yet, so it can’t run offline. Please connect to the internet using Wi-Fi or mobile data and open the tool once.
It will automatically download everything it needs, and after that, you can use it normally offline.");
            });
        })
    );
});

// Message Event: Handle Manual Caching Trigger
self.addEventListener('message', (event) => {
    if (event.data.action === 'CACHE_URLS') {
        const urls = event.data.urls;
        
        // Open cache and add all files
        caches.open(CACHE_NAME).then((cache) => {
            // We use map to handle them individually to prevent one 404 from stopping the whole batch
            // effectively "Best Effort" caching
            const promises = urls.map(url => {
                return fetch(url).then(response => {
                    if (!response.ok) throw new Error('Network error');
                    return cache.put(url, response);
                }).catch(err => {
                    console.warn(`Failed to cache ${url}:`, err);
                });
            });

            return Promise.all(promises);
        }).then(() => {
            // Notify the client that we are done
            event.source.postMessage({
                type: 'CACHE_COMPLETE'
            });
        });
    }
});
