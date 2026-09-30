const CACHE_NAME = 'twelve-baskets-v11';
const CACHE_PREFIX = 'twelve-baskets-';
const APP_SHELL = ['./', './index.html', './manifest.json', './css/app.css', './js/app.js', './icons/icon-192.png', './icons/icon-512.png', './data/books.json', './data/volume01.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE_NAME).then((cache) => cache.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) cache.put(event.request, response.clone());
    return response;
  }))));
});