const CACHE_NAME = 'archive-pro-offline-sections-v1';

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

async function cacheNonOriginsWorks(cache) {
  try {
    const response = await fetch('./data/works.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('works.json failed');

    const json = await response.json();
    const works = normalizeWorks(json);

    const urls = works
      .filter(work => Number(work.section_id) !== 0)
      .map(work => work.image)
      .filter(Boolean)
      .filter(url => String(url).includes('/standard/'))
      .filter(url => !String(url).includes('/zoom/'));

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
  if (!event.data || event.data.type !== 'CACHE_NON_ORIGINS') return;

  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cacheNonOriginsWorks(cache);
    })
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.href.includes('/zoom/')) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          if (url.pathname.startsWith('/archivepro')) {
            return caches.match('./archivepro/index.html');
          }
          return caches.match('./index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
