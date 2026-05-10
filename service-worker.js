const CACHE_NAME = 'archive-pro-offline-sections-v7';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/archivepro/',
  '/archivepro/index.html',
  '/manifest.webmanifest?v=2',
  '/archivepro-icon-192-v2.png?v=2',
  '/archivepro-icon-512-v2.png?v=2'
];

const WORKS_JSON_URLS = [
  'https://dungzak.art/data/works.json',
  '/data/works.json'
];

const LIVE_DATA_URLS = {
  '/data/works.json': [
    'https://dungzak.art/data/works.json',
    '/data/works.json'
  ],
  '/data/dcao.json': [
    'https://dungzak.art/data/dcao.json',
    '/data/dcao.json'
  ],
  '/data/dcap.json': [
    'https://dungzak.art/data/dcap.json',
    '/data/dcap.json'
  ]
};

function normalizeWorks(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.works)) return json.works;
  if (json && json.data && Array.isArray(json.data.works)) return json.data.works;
  if (json && json.archive && Array.isArray(json.archive.works)) return json.archive.works;
  return [];
}

async function fetchFresh(urls) {
  let lastError = null;

  for (const baseUrl of urls) {
    try {
      const joiner = String(baseUrl).includes('?') ? '&' : '?';
      const freshUrl = baseUrl + joiner + 'v=' + Date.now();

      const response = await fetch(freshUrl, {
        cache: 'no-store',
        mode: 'cors'
      });

      if (!response.ok) throw new Error('fetch failed: ' + response.status);

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('all fetch attempts failed');
}

async function cacheNonOriginsWorks(cache) {
  try {
    const response = await fetchFresh(WORKS_JSON_URLS);
    const json = await response.clone().json();
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

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.href.includes('/zoom/')) return;

  const liveUrls = LIVE_DATA_URLS[url.pathname];

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            try {
              cache.put(request, copy);
            } catch (e) {}
          });

          return response;
        })
        .catch(() =>
          caches.match('/archivepro/index.html')
            .then(cached => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  if (liveUrls) {
    event.respondWith(
      fetchFresh(liveUrls)
        .then(response => {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            try {
              cache.put(url.pathname, copy);
            } catch (e) {}
          });

          return response;
        })
        .catch(() => caches.match(url.pathname))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        const copy = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          try {
            cache.put(request, copy);
          } catch (e) {}
        });

        return response;
      });
    })
  );
});
