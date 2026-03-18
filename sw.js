// Service Worker — Braise & Co Réservations
// Requis pour l'installation PWA sur l'écran d'accueil

const CACHE_NAME = 'braise-reservations-v1';

// À l'installation : mise en cache du shell de l'appli
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/inquisitive-cuchufli-c706de/reservations.html',
        '/inquisitive-cuchufli-c706de/icon-192.png',
        '/inquisitive-cuchufli-c706de/icon-512.png'
      ]).catch(() => {}); // silencieux si un fichier manque
    })
  );
});

// Activation : supprimer les anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch : network first (données Supabase en temps réel), fallback cache
self.addEventListener('fetch', event => {
  // Ne pas intercepter les requêtes Supabase — toujours réseau pour la BDD
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mettre à jour le cache avec la réponse fraîche
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Hors-ligne : servir depuis le cache
        return caches.match(event.request);
      })
  );
});
