const CACHE_NAME = 'archive-pro-offline-sections-v9-20260516';

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
  'https://raw.githubusercontent.com/dungzakcestlavie/dungzakcestlavie.github.io/main/data/works.json',
  '/data/works.json',
  '/archivepro/data/works.json'
];

const LIVE_DATA_URLS = {
  '/data/works.json': WORKS_JSON_URLS,
  '/archivepro/data/works.json': WORKS_JSON_URLS,
  '/data/dcao.json': [
    'https://dungzak.art/data/dcao.json',
    '/data/dcao.json'
  ],
  '/data/dcap.json': [
    'https://dungzak.art/data/dcap.json',
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
      if (value.length === 1) {
        const nested = unwrap(value[0]);
        if (nested.length) return nested;
      }

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

      return value;
    }

    if (Array.isArray(value.works)) return value.works;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.data)) return unwrap(value.data);

    if (value.data && typeof value.data === 'object') {
      const nested = unwrap(value.data);
      if (nested.length) return nested;
    }

    if (value.archive && typeof value.archive === 'object') {
      const nested = unwrap(value.archive);
      if (nested.length) return nested;
    }

    if (value.payload && typeof value.payload === 'object') {
      const nested = unwrap(value.payload);
      if (nested.length) return nested;
    }

    return [];
  }

  return unwrap(json).filter(item => item && typeof item === 'object');
}

function stripVersion(url) {
  return String(url || '').split('?')[0];
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
  const joiner = clean.includes('?') ? '&' : '?';
  return clean + joiner + 'v=' + Date.now();
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

    await putCacheSafe(cache, '/data/works.json', response.clone());

    const urls = Array.from(
      new Set(
        works
          .filter(work => Number(work && work.section_id) !== 0)
          .map(work => stripVersion(work && work.image))
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
      if (key !== CACHE_NAME && key.indexOf('archive-pro') !== -1) {
        return caches.delete(key);
      }

      if (key !== CACHE_NAME && key.indexOf('offline-sections') !== -1) {
        return caches.delete(key);
      }

      return Promise.resolve(false);
    })
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of CORE_ASSETS) {
        try {
          const response = await fetch(freshUrl(asset), { cache: 'no-store' });
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

  const liveUrls = LIVE_DATA_URLS[url.pathname];

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          caches.open(CACHE_NAME).then(cache => putCacheSafe(cache, request, response));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match('/archivepro/index.html'))
            .then(cached => cached || caches.match('/index.html'))
        )
    );
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
          caches.open(CACHE_NAME).then(cache => {
            putCacheSafe(cache, url.href, response.clone());
            putCacheSafe(cache, stripVersion(url.href), response.clone());
          });
          return response;
        })
        .catch(() =>
          caches.match(url.href)
            .then(cached => cached || caches.match(stripVersion(url.href)))
        )
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
