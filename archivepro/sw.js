const BUILD = '16';

const CACHE_NAME = `archive-pro-pwa-v${BUILD}`;
const DATA_CACHE = 'archive-pro-data-v-final';
const IMAGE_CACHE = 'archive-pro-standard-images-v-final';

const WORKS_JSON_URL = 'https://dungzak.art/data/works.json';

const CORE = [
  '/archivepro/index.html',
  `/archivepro/manifest.json?v=${BUILD}`,
  '/archivepro-icon-192-v2.png?v=2',
  '/archivepro-icon-512-v2.png?v=2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const url of CORE) {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (e) {}
      }

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith('archive-pro-') &&
              key !== CACHE_NAME &&
              key !== DATA_CACHE &&
              key !== IMAGE_CACHE
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.url === WORKS_JSON_URL) {
    event.respondWith(handleWorksJson(request));
    return;
  }

  if (
    url.hostname === 'raw.githubusercontent.com' &&
    url.pathname.includes('/archivepro/standard/')
  ) {
    event.respondWith(handleStandardImage(request));
    return;
  }

  if (
    url.hostname === 'raw.githubusercontent.com' &&
    url.pathname.includes('/archivepro/zoom/')
  ) {
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(handleCore(request));
    return;
  }
});

async function handleWorksJson(request) {
  const cache = await caches.open(DATA_CACHE);

  try {
    const fresh = await fetch(
      new Request(WORKS_JSON_URL, {
        method: 'GET',
        mode: 'cors',
        cache: 'reload',
        credentials: 'omit'
      })
    );

    if (fresh && fresh.ok) {
      await cache.put(WORKS_JSON_URL, fresh.clone());
      await cache.put(request, fresh.clone());
      return fresh;
    }

    throw new Error('works.json network response not ok');
  } catch (e) {
    const saved =
      (await cache.match(WORKS_JSON_URL)) ||
      (await cache.match(request));

    if (saved) return saved;

    return new Response('[]', {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
  }
}

async function handleStandardImage(request) {
  const cache = await caches.open(IMAGE_CACHE);

  const saved = await cache.match(request);
  if (saved) return saved;

  try {
    const fresh = await fetch(request);

    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone());
    }

    return fresh;
  } catch (e) {
    return new Response('', {
      status: 504,
      statusText: 'Offline image not cached'
    });
  }
}

async function handleCore(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const fresh = await fetch(request);

    if (fresh && fresh.ok) {
      await cache.put(request, fresh.clone());
    }

    return fresh;
  } catch (e) {
    const saved = await cache.match(request);

    if (saved) return saved;

    return cache.match('/archivepro/index.html');
  }
}
