const CACHE_NAME = 'archive-pro-exhibition-v3';

const CORE_ASSETS = [
  './',
  './index.html',
  './archivepro/',
  './archivepro/index.html',
  './data/works.json',
  './data/dcao.json',
  './data/dcap.json',
  'https://dungzak.art/data/works.json'
];

const PRECACHE_IMAGE_IDS = [
  'OR-1428',
  'OR-1429',
  'OR-1430'
];

const IMAGE_BASES = [
  'https://raw.githubusercontent.com/dungzakcestlavie/dungzaklab-images/main/archivepro/standard/'
];

function exhibitionImageUrls() {
  return PRECACHE_IMAGE_IDS.flatMap(id =>
    IMAGE_BASES.map(base => `${base}${id}.jpg`)
  );
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
      const assets = CORE_ASSETS.concat(exhibitionImageUrls());

      for (const asset of assets) {
        try {
          await cache.add(asset);
        } catch (e) {}
      }
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

  if (!isCacheableRequest(request)) return;

  const url = new URL(request.url);

  // HTML 페이지
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

  // 기타 파일
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
