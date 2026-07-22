const CACHE_NAME = 'punto-electro-v5-auto-update';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './backup.js',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // Ya NO se activa sola de una: espera a que el usuario toque
  // "Actualizar" en el cartel de la app (ver mensaje SKIP_WAITING abajo).
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network falling back to cache - así se actualiza cuando hay internet, pero
// funciona offline. Nunca interceptamos las llamadas de Firebase/Google, para
// no interferir con la sincronización en tiempo real.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const bypass = ['google', 'googleapis', 'gstatic', 'firebaseio', 'firebase', 'emailjs', 'jsdelivr'];
  if (bypass.some((s) => url.origin.includes(s))) {
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
