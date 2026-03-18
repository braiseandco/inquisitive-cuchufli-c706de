// Service Worker — Braise & Co Réservations
// Version network-first : toujours charger depuis le réseau, pas de cache agressif

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    // Supprimer tous les anciens caches au cas où
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// NETWORK FIRST : bypass total du cache HTTP pour toujours avoir la dernière version
self.addEventListener('fetch', function(e) {
  e.respondWith(fetch(e.request, {cache: 'no-store'}));
});
