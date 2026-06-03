const CACHE_NAME = 'archive-pro-pwa-v6-scope-safe';

const CORE_ASSETS = [
  '/archivepro/index.html',
  '/archivepro/manifest.json',
  '/archivepro-icon-192-v2.png?v=2',
  '/archivepro-icon-512-v2.png?v=2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .catch(() => {})
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith('archive-pro-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (!url.pathname.startsWith('/archivepro/')) {
    return;
  }

  if (
    req.mode === 'navigate' ||
    url.pathname === '/archivepro/' ||
    url.pathname === '/archivepro/index.html'
  ) {
    event.respondWith(
      fetch(req, {
        cache: 'no-store'
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (
          await cache.match('/archivepro/index.html')
        );
      })
    );
    return;
  }

  if (
    url.pathname === '/archivepro/manifest.json'
  ) {
    event.respondWith(
      fetch(req, {
        cache: 'reload'
      }).catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              try {
                cache.put(req, copy);
              } catch {}
            });
        }

        return res;
      });
    })
  );
});
