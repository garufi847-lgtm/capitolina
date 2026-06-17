const CACHE = 'gestionale-v5';
const ASSETS = ['./', './index.html', './app.js', './style.css', './manifest.json', './data_embedded.js', './xlsx.full.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  // Network-first per file critici (app.js, style.css, index.html) per evitare cache stantia
  const url = e.request.url;
  if(url.includes('app.js') || url.includes('style.css') || url.includes('index.html')){
    e.respondWith(
      fetch(e.request).then(r => {
        caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
