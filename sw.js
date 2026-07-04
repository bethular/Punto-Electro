const CACHE_NAME = 'punto-electro-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './drive.js',
  './db.js',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network falling back to cache - so it updates when online, but works offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never intercept Google API / auth calls - always go to network
  if (url.origin.includes('google') || url.origin.includes('googleapis')) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
