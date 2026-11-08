// 本機原型，非完整正式版：核心資產必備；圖示 PNG 缺少時不阻止安裝。
const CACHE = 'feifei-lite-v4';
const CORE = ['./', 'index.html', 'manifest.json', 'icon.svg', 'workout-ui.js'];
const OPTIONAL = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE);
      await Promise.allSettled(OPTIONAL.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('feifei-') && n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(req);
        if (response.ok) {
          await cache.put(req, response.clone());
          return response;
        }
        return (await cache.match(req)) || response;
      } catch (e) {
        const cached =
          (await cache.match(req)) ||
          (req.mode === 'navigate' ? await cache.match('index.html') : null);
        if (cached) return cached;
        throw e;
      }
    })(),
  );
});
