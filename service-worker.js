// Service Worker für Offline-Funktionalität und Caching
const CACHE_NAME = 'todoapp-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/script.js',
    '/styles.css',
    '/manifest.json'
];

// Installation: Cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
                console.warn('Cache addAll error:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activation: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch: Network-first strategy for API calls, cache-first for assets
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // API calls - network first, fallback to cache
    if (request.method === 'GET' && (url.pathname.startsWith('/todos') || url.pathname === '/backup' || url.pathname === '/backups')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache successful responses
                    if (response.ok) {
                        const cache = caches.open(CACHE_NAME);
                        cache.then((c) => c.put(request, response.clone()));
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails
                    return caches.match(request);
                })
        );
        return;
    }

    // Static assets - cache first, fallback to network
    if (request.method === 'GET') {
        event.respondWith(
            caches.match(request)
                .then((response) => {
                    if (response) {
                        return response;
                    }
                    return fetch(request)
                        .then((response) => {
                            if (response.ok) {
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, response.clone());
                                });
                            }
                            return response;
                        });
                })
                .catch(() => {
                    return caches.match('/index.html');
                })
        );
        return;
    }

    // For non-GET requests (POST, PUT, DELETE), try network only
    event.respondWith(fetch(request));
});
