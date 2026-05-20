const CACHE_NAME = 'archive-pro-offline-sections-v12-lab-routing-pwa-fix-20260520';

const CORE_ASSETS = [
  '/archivepro/',
  '/archivepro/index.html',
  '/archivepro/manifest.webmanifest',
  '/archivepro-icon-192-v2.png?v=2',
  '/archivepro-icon-512-v2.png?v=2'
];

const WORKS_JSON_URLS = [
  'https://dungzak.art/data/works.json',
  'https://raw.githubusercontent.com/dungzakcestlavie/dungzakcestlavie.github.io/main/data/works.json',
  '/archivepro/data/works.json',
  '/data/works.json'
];

const LIVE_DATA_URLS = {
  '/archivepro/data/works.json': WORKS_JSON_URLS,
  '/data/works.json': WORKS_JSON_URLS,
  '/archivepro/data/dcao.json': [
    'https://dungzak.art/data/dcao.json',
    '/archivepro/data/dcao.json',
    '/data/dcao.json'
  ],
  '/data/dcao.json': [
    'https://dungzak.art/data/dcao.json',
    '/archivepro/data/dcao.json',
    '/data/dcao.json'
  ],
  '/archivepro/data/dcap.json': [
    'https://dungzak.art/data/dcap.json',
    '/archivepro/data/dcap.json',
    '/data/dcap.json'
  ],
  '/data/dcap.json': [
    'https://dungzak.art/data/dcap.json',
    '/archivepro/data/dcap.json',
    '/data/dcap.json'
  ]
};

const MAX_IMAGE_CACHE_BATCH = 320;

function normalizeWorks(json) {
  const seen = new Set();

  function unwrap(value) {
    if (!value || seen.has(value)) return [];
    if (typeof value === 'object') seen.add(value);

    if (Array.isArray(value)) {
      if (
        value.length &&
        value.every(item =>
          item &&
          typeof item === 'object' &&
          ('id' in item || 'image' in item || 'zoom' in item)
        )
      ) {
        return value;
      }

      for (const item of value) {
        const nested = unwrap(item);
        if (nested.length) return nested;
      }

      return [];
    }

    if (Array.isArray(value.works)) return value.works;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.data)) return unwrap(value.data);

    if (value.data && typeof value.data === 'object') return unwrap(value.data);
    if (value.archive && typeof value.archive === 'object') return unwrap(value.archive);
    if (value.payload && typeof value.payload === 'object') return unwrap(value.payload);

    return [];
  }

  return unwrap(json).filter(item => item && typeof item === 'object');
}

function isArchiveProRoute(url) {
  return (
    url.pathname === '/archivepro/' ||
    url.pathname === '/archivepro/index.html' ||
    url.pathname.startsWith('/archivepro/')
  );
}

function isZoomUrl(url) {
  return String(url || '').includes('/zoom/');
}

function isStandardImageUrl(url) {
  const value = String(url || '');
  return value.includes('/standard/') && !isZoomUrl(value);
}

function freshUrl(baseUrl) {
  const clean = String(baseUrl || '');
  if (!clean) return clean;
  return clean + (clean.includes('?') ? '&' : '?') + 'v=' + Date.now();
}

async function fetchFresh(urls) {
  let lastError = null;

  for (const baseUrl of urls) {
    try {
      const response = await fetch(freshUrl(baseUrl), {
        cache: 'no-store',
        mode: 'cors',
        credentials: 'omit'
      });

      if (!response.ok) throw new Error('fetch failed: ' + response.status);
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('all fetch attempts failed');
}

async function putCacheSafe(cache, request, response) {
  try {
    if (!response || !response.ok) return;
    await cache.put(request, response.clone());
  } catch (e) {}
}

async function cacheNonOriginsWorks(cache) {
  try {
    const response = await fetchFresh(WORKS_JSON_URLS);
    const json = await response.clone().json();
    const works = normalizeWorks(json);

    await putCacheSafe(cache, '/archivepro/data/works.json', response.clone());

    const urls = Array.from(
      new Set(
        works
          .filter(work => Number(work && work.section_id) !== 0)
          .map(work => work && work.image)
          .filter(Boolean)
          .filter(isStandardImageUrl)
      )
    ).slice(0, MAX_IMAGE_CACHE_BATCH);

    for (const url of urls) {
      try {
        const imageResponse = await fetch(url, {
          cache: 'reload',
          mode: 'cors',
          credentials: 'omit'
        });

        await putCacheSafe(cache, url, imageResponse);
      } catch (e) {}
    }
  } catch (e) {}
}

async function cleanOldCaches() {
  const keys = await caches.keys();

  await Promise.all(
    keys.map(key => {
      if (key !== CACHE_NAME && key.includes('archive-pro')) return caches.delete(key);
      if (key !== CACHE_NAME && key.includes('offline-sections')) return caches.delete(key);
      return Promise.resolve(false);
    })
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of CORE_ASSETS) {
        try {
          const response = await fetch(freshUrl(asset), {
            cache: 'no-store'
          });

          await putCacheSafe(cache, asset, response);
        } catch (e) {}
      }

      await cacheNonOriginsWorks(cache);
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    cleanOldCaches().then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const type = event && event.data && event.data.type;

  if (type === 'CACHE_NON_ORIGINS' || type === 'CACHE_EXHIBITION_SET') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => cacheNonOriginsWorks(cache))
    );
  }

  if (type === 'CLEAR_ARCHIVE_PRO_CACHES') {
    event.waitUntil(cleanOldCaches());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isZoomUrl(url.href)) return;

  const archiveRoute = isArchiveProRoute(url);
  const liveUrls = LIVE_DATA_URLS[url.pathname];

  if (request.mode === 'navigate') {
    if (!archiveRoute) {
      return;
    }

    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          caches.open(CACHE_NAME).then(cache => putCacheSafe(cache, request, response));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match('/archivepro/index.html'))
        )
    );
    return;
  }

  if (!archiveRoute && !liveUrls && !isStandardImageUrl(url.href)) {
    return;
  }

  if (liveUrls) {
    event.respondWith(
      fetchFresh(liveUrls)
        .then(response => {
          caches.open(CACHE_NAME).then(cache => putCacheSafe(cache, url.pathname, response));
          return response;
        })
        .catch(() => caches.match(url.pathname))
    );
    return;
  }

  if (isStandardImageUrl(url.href)) {
    event.respondWith(
      fetch(url.href, {
        cache: 'reload',
        mode: 'cors',
        credentials: 'omit'
      })
        .then(response => {
          caches.open(CACHE_NAME).then(cache => putCacheSafe(cache, url.href, response.clone()));
          return response;
        })
        .catch(() => caches.match(url.href))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        caches.open(CACHE_NAME).then(cache => putCacheSafe(cache, request, response));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
