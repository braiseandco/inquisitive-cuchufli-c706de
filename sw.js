// Service Worker — Braise & Co
// Network-first : toujours charger depuis le réseau, cache en fallback offline

const CACHE = 'braise-v9';

self.addEventListener('install', function(e) {
  self.skipWaiting(); // Active immédiatement sans attendre la fermeture des onglets
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
      // Envoie un message à tous les onglets ouverts pour qu'ils se rechargent
      return self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED' });
        });
      });
    })
  );
});

// ── PUSH NOTIFICATIONS ──────────────────────────────────────────
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) {}
  var title = data.title || '🔥 Braise & Co';
  var body  = data.body  || '';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: 'https://app.braiseandco.fr/carte-fidelite.html' }
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var title = e.notification.title || '';
  var body  = e.notification.body  || '';
  var base = 'https://app.braiseandco.fr/carte-fidelite.html?action=ma-carte'
    + '&ntitle=' + encodeURIComponent(title)
    + '&nbody='  + encodeURIComponent(body);
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      for (var i = 0; i < cs.length; i++) {
        if (cs[i].url.includes('carte-fidelite') && 'focus' in cs[i]) {
          cs[i].focus();
          cs[i].navigate(base);
          return;
        }
      }
      return clients.openWindow(base);
    })
  );
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
