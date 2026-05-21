const CACHE_NAME = 'archive-pro-pwa-v2-20260521';

const CORE_ASSETS = [
  '/archivepro/',
  '/archivepro/index.html',
  '/archivepro/manifest.json',
  '/archivepro-icon-192-v2.png?v=2',
  '/archivepro-icon-512-v2.png?v=2'
];

const LIVE_JSON_URLS = {
  works: [
    'https://dungzak.art/data/works.json',
    '/archivepro/data/works.json',
    '/data/works.json'
  ],
  dcao: [
    'https://dungzak.art/data/dcao.json',
    '/archivepro/data/dcao.json',
    '/data/dcao.json'
  ],
  dcap: [
    'https://dungzak.art/data/dcap.json',
    '/archivepro/data/dcap.json',
    '/data/dcap.json'
  ]
};

function isCacheableRequest(request) {
  if (!request || request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.href.includes('/zoom/')) return false;
  return true;
}

function isArchiveProRoute(url) {
  return url.pathname.startsWith('/archivepro/');
}

function isLiveJson(url) {
  return (
    url.href.includes('/data/works.json') ||
    url.href.includes('/data/dcao.json') ||
    url.href.includes('/data/dcap.json') ||
    url.href.includes('works.json') ||
    url.href.includes('dcao.json') ||
    url.href.includes('dcap.json')
  );
}

function getLiveJsonFallbacks(url) {
  if (url.href.includes('works.json')) return LIVE_JSON_URLS.works;
  if (url.href.includes('dcao.json')) return LIVE_JSON_URLS.dcao;
  if (url.href.includes('dcap.json')) return LIVE_JSON_URLS.dcap;
  return [url.href];
}

async function fetchFresh(urls) {
  let lastError = null;

  for (const baseUrl of urls) {
    try {
      const joiner = String(baseUrl).includes('?') ? '&' : '?';
      const freshUrl = baseUrl + joiner + 'v=' + Date.now();

      const response = await fetch(freshUrl, {
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

  throw lastError || new Error('all fresh fetch attempts failed');
}

async function getWorksJson() {
  try {
    const response = await fetchFresh(LIVE_JSON_URLS.works);
    return await response.clone().json();
  } catch (e) {
    return null;
  }
}

function normalizeWorks(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.works)) return json.works;
  if (json && json.data && Array.isArray(json.data.works)) return json.data.works;
  if (json && json.archive && Array.isArray(json.archive.works)) return json.archive.works;
  return [];
}

async function cacheNonOriginsWorks(cache) {
  const json = await getWorksJson();
  const works = normalizeWorks(json);

  const urls = Array.from(
    new Set(
      works
        .filter(work => Number(work && work.section_id) !== 0)
        .map(work => work && work.image)
        .filter(Boolean)
        .filter(url => !String(url).includes('/zoom/'))
        .filter(url => String(url).includes('/standard/'))
    )
  );

  for (const url of urls) {
    try {
      await cache.add(url);
    } catch (e) {}
  }
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
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.includes('archive-pro') && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const type = event && event.data && event.data.type;

  if (type === 'CACHE_EXHIBITION_SET' || type === 'CACHE_NON_ORIGINS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(async cache => {
        await cacheNonOriginsWorks(cache);
      })
    );
  }

  if (type === 'CLEAR_ARCHIVE_PRO_CACHES') {
    event.waitUntil(
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key.includes('archive-pro'))
            .map(key => caches.delete(key))
        )
      )
    );
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (!isCacheableRequest(request)) return;

  const url = new URL(request.url);

  if (!isArchiveProRoute(url)) {
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              try {
                cache.put(request, copy);
              } catch (e) {}
            });
          }

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          return caches.match('/archivepro/index.html');
        })
    );
    return;
  }

  if (isLiveJson(url)) {
    event.respondWith(
      fetchFresh(getLiveJsonFallbacks(url))
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              try {
                cache.put(request, copy.clone());
              } catch (e) {}
            });
          }

          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          const fallbackUrls = getLiveJsonFallbacks(url);

          for (const fallbackUrl of fallbackUrls) {
            const cachedFallback = await caches.match(fallbackUrl);
            if (cachedFallback) return cachedFallback;
          }

          return new Response('{}', {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  if (request.destination === 'image' || url.href.includes('/standard/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              try {
                cache.put(request, copy);
              } catch (e) {}
            });
          }

          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            try {
              cache.put(request, copy);
            } catch (e) {}
          });
        }

        return response;
      });
    })
  );
});
