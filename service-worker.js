const CACHE_PREFIX = 'twelve-baskets-';
const CACHE_NAME = 'twelve-baskets-v16';
const APP_SHELL = ['./', './index.html', './manifest.json', './css/app.css', './js/app.js', './icons/icon-192.png', './icons/icon-512.png', './data/books.json', './data/volume01.json'];
const APP_SHELL_PATHS = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    APP_SHELL.map((path) => new Request(path, { cache: 'reload' })),
  )));
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
  const isAppShell = APP_SHELL_PATHS.has(new URL(event.request.url).pathname);
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    if (isAppShell) {
      try {
        const response = await fetch(event.request, { cache: 'no-cache' });
        if (response.ok) {
          await cache.put(event.request, response.clone());
          return response;
        }
      } catch {}
      const cached = await cache.match(event.request);
      if (cached) return cached;
      return Response.error();
    }

    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  }));
});