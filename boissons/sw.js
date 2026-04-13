// Service Worker — Commande Suivi Boisson
// Network-first : toujours charger depuis le réseau, cache en fallback offline

const CACHE = 'boissons-v2';
const STATIC_ASSETS = [
  '/boissons/index.html',
  '/boissons/manifest.json',
  '/boissons/icon-192.png',
  '/boissons/icon-192-maskable.png',
  '/boissons/icon-512.png',
  '/boissons/icon-512-maskable.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k.startsWith('boissons-') && k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  if (url.includes('supabase') || url.includes('fonts.googleapis') || url.includes('cdnjs')) {
    e.respondWith(fetch(e.request, {cache: 'no-store'}));
    return;
  }
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
