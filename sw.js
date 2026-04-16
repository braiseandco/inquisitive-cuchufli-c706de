// Service Worker — Braise & Co (apps principales)
// Network-first : toujours charger depuis le réseau, cache en fallback offline

const CACHE = 'braise-v11';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k.startsWith('braise-') && k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      return self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED' });
        });
      });
    })
  );
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  if (url.includes('/planning/')) return;
  if (url.includes('/boissons/')) return;
  if (url.includes('supabase') || url.includes('fonts.googleapis') || url.includes('cdnjs') || url.includes('qrserver')) {
    e.respondWith(fetch(e.request, {cache: 'no-store'}));
    return;
  }
  // version.json ne doit jamais être mis en cache (sert à la détection de mise à jour)
  if (url.includes('version.json')) {
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
