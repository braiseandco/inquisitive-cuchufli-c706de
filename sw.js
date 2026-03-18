const CACHE = 'braise-v2';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(['/inquisitive-cuchufli-c706de/reservations.html']).catch(()=>{})
    )
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if(e.request.url.includes('supabase.co')) return;
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok && e.request.method==='GET'){
        const c = r.clone();
        caches.open(CACHE).then(cache=>cache.put(e.request,c));
      }
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
