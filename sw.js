const CACHE_NAME = 'archive-pro-offline-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './archivepro/index.html',
  './data/works.json',
  'https://dungzak.art/data/works.json'
];

// 설치
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (e) {}
      }
    })
  );
  self.skipWaiting();
});

// 활성화
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

// 요청 처리
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  // zoom 제외
  if (request.url.includes('/zoom/')) return;

  const url = new URL(request.url);

  // 1️⃣ HTML (페이지)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copy));
          return res;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match('./archivepro/index.html')) ||
            (await caches.match('./index.html'))
          );
        })
    );
    return;
  }

  // 2️⃣ JSON + 이미지 (핵심)
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
