const CACHE_NAME = 'archive-pro-app-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './archivepro/',
  './archivepro/index.html',
  './data/works.json'
];

// Origins 제외 + standard 이미지만 캐시
async function cacheNonOriginsWorks(cache) {
  try {
    const response = await fetch('./data/works.json');
    const json = await response.json();

    const works = Array.isArray(json)
      ? json
      : Array.isArray(json.works)
        ? json.works
        : [];

    const urls = works
      .filter(work => Number(work.section_id) !== 0)
      .map(work => work.image)
      .filter(Boolean)
      .filter(url => !url.includes('/zoom/'));

    for (const url of urls) {
      try {
        await cache.add(url);
      } catch (e) {}
    }
  } catch (e) {}
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(CORE_ASSETS);
      await cacheNonOriginsWorks(cache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // zoom 이미지 제외
  if (url.href.includes('/zoom/')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
