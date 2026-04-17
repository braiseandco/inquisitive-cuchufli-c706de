// Service Worker — Carte Fidélité Braise & Co
// Dédié uniquement à carte-fidelite.html

const CACHE = 'fidelite-v15';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k.startsWith('fidelite-') && k !== CACHE; })
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
  if (!url.includes('carte-fidelite')) return;
  if (url.includes('supabase') || url.includes('fonts.googleapis') || url.includes('cdnjs') || url.includes('qrserver')) {
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
