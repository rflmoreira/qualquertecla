/* Qualquer Tecla — service worker mínimo para installability PWA.
 * Sem cache, offline ou interceptação além do pass-through. */
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
