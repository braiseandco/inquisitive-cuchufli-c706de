// Service Worker — Braise & Co
// Network-first : toujours charger depuis le réseau, cache en fallback offline

const CACHE = 'braise-v4';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      // Ne supprimer que les anciens caches "braise-*", pas les caches d'autres SW
      return Promise.all(keys.filter(function(k) { return k.startsWith('braise-') && k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  // Laisser le SW du planning gérer ses propres requêtes
  if (url.includes('/planning/')) return;
  // Pas de cache pour supabase, fonts externes, CDN
  if (url.includes('supabase') || url.includes('fonts.googleapis') || url.includes('cdnjs') || url.includes('qrserver')) {
    e.respondWith(fetch(e.request, {cache: 'no-store'}));
    return;
  }
  // Network-first avec fallback cache (offline)
  e.respondWith(
    fetch(e.request, {cache: 'no-store'}).then(function(response) {
      var clone = response.clone();
      caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
