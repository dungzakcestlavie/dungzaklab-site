const CACHE_NAME = 'archive-pro-app-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './archivepro/',
  './archivepro/index.html',
  './data/works.json',
  './data/dcao.json',
  './data/dcap.json'
];

function normalizeWorks(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.works)) return json.works;
  if (json && json.data && Array.isArray(json.data.works)) return json.data.works;
  if (json && json.archive && Array.isArray(json.archive.works)) return json.archive.works;
  return [];
}

// Origins 제외 + standard 이미지만 캐시
async function cacheNonOriginsWorks(cache) {
  try {
    const response = await fetch('./data/works.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('works.json fetch failed');

    const json = await response.json();
    const works = normalizeWorks(json);

    const urls = works
      .filter(work => Number(work.section_id) !== 0)
      .map(work => work.image)
      .filter(Boolean)
      .filter(url => !String(url).includes('/zoom/'))
      .filter(url => String(url).includes('/standard/'));

    for (const url of urls) {
      try {
        await cache.add(url);
      } catch (e) {}
    }
  } catch (e) {}
}

function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);

  // zoom 이미지는 캐시하지 않음
  if (url.href.includes('/zoom/')) return false;

  return true;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (e) {}
      }

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

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'CACHE_EXHIBITION_SET') return;

  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cacheNonOriginsWorks(cache);
    })
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (!isCacheableRequest(request)) return;

  const url = new URL(request.url);

  // HTML 페이지 오프라인 fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          if (url.pathname.startsWith('/archivepro')) {
            return caches.match('./archivepro/index.html');
          }

          return caches.match('./index.html');
        })
    );
    return;
  }

  // JSON + standard 이미지
  if (
    request.destination === 'image' ||
    url.pathname.endsWith('.json') ||
    url.href.includes('works.json') ||
    url.href.includes('/standard/')
  ) {
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
    return;
  }

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
