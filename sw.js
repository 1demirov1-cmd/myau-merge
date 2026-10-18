/* МЯУ offline assets. Version bumps should accompany future releases. */
const CACHE = 'myau-pwa-v6-20261018';
const PREFIX = 'myau-pwa-';
const CORE = [
  "./",
  "./index.html",
  "./game.mjs?v=6",
  "./physics.mjs?v=4",
  "./mutations.mjs",
  "./style.css?v=2",
  "./pwa-register.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/apple-touch-icon.png",
  "./assets/pwa-192.png",
  "./assets/pwa-512.png",
  "./assets/pwa-maskable-512.png",
  "./assets/meow.wav",
  "./assets/cat-0.webp",
  "./assets/cat-1.webp",
  "./assets/cat-2.webp",
  "./assets/cat-3.webp",
  "./assets/cat-4.webp",
  "./assets/cat-5.webp",
  "./assets/cat-6.webp",
  "./assets/cat-7.webp",
  "./assets/cat-8.png",
  "./assets/cat-9.webp?v=4",
  "./assets/mur-pair.webp?v=5"
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const live = await fetch(req);
        if (live.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(new URL('./', scope), live.clone());
        }
        return live;
      } catch {
        return (await caches.match(new URL('./', scope))) ||
          (await caches.match(new URL('./index.html', scope))) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const live = await fetch(req);
    if (live.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, live.clone());
    }
    return live;
  })());
});
