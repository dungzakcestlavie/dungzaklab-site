const BUILD = '11';

const CACHE_NAME = `archive-pro-pwa-v${BUILD}`;
const DATA_CACHE = 'archive-pro-data-v2';
const IMAGE_CACHE = 'archive-pro-offline-sections-v2';

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

      await Promise.all(
        CORE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (e) {}
        })
      );

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
            (k) =>
              k.startsWith('archive-pro-') &&
              k !== CACHE_NAME &&
              k !== DATA_CACHE &&
              k !== IMAGE_CACHE
          )
          .map((k) => caches.delete(k))
      );

      await self.clients.claim();
    })()
  );
});

function isZoom(url) {
  return url.pathname.includes('/zoom/');
}

async function cacheStandardImages(list) {
  try {
    const cache = await caches.open(IMAGE_CACHE);

    for (const work of list) {
      try {
        if (
          !work ||
          Number(work.section_id) === 0 ||
          !work.image ||
          work.image.includes('/zoom/')
        ) {
          continue;
        }

        const exists = await cache.match(work.image);

        if (exists) {
          continue;
        }

        const res = await fetch(work.image, { mode: 'cors' });

        if (res.ok) {
          await cache.put(work.image, res.clone());
        }
      } catch (e) {}
    }
  } catch (e) {}
}

async function fetchWorks() {
  try {
    const network = await fetch(WORKS_JSON_URL, {
      cache: 'no-store'
    });

    if (!network.ok) {
      throw new Error('works.json network error');
    }

    const json = await network.clone().json();

    const dataCache = await caches.open(DATA_CACHE);

    await dataCache.put(
      WORKS_JSON_URL,
      new Response(JSON.stringify(json), {
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    let offline = json;

    if (Array.isArray(json)) {
      offline = json.filter((w) => Number(w.section_id) !== 0);
    }

    await dataCache.put(
      'archivepro-offline',
      new Response(JSON.stringify(offline), {
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    cacheStandardImages(offline);

    return network;
  } catch (e) {
    const dataCache = await caches.open(DATA_CACHE);

    const offline = await dataCache.match('archivepro-offline');
    if (offline) {
      return offline;
    }

    const full = await dataCache.match(WORKS_JSON_URL);
    if (full) {
      return full;
    }

    return new Response('[]', {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  if (url.href === WORKS_JSON_URL) {
    event.respondWith(fetchWorks());
    return;
  }

  if (isZoom(url)) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response('', {
          status: 204
        });
      })
    );
    return;
  }

  if (url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGE_CACHE);

        const cached = await cache.match(req);

        if (cached) {
          return cached;
        }

        try {
          const network = await fetch(req);

          if (
            network.ok &&
            !url.pathname.includes('/zoom/')
          ) {
            cache.put(req, network.clone());
          }

          return network;
        } catch (e) {
          return cached || Response.error();
        }
      })()
    );

    return;
  }

  if (
    req.mode === 'navigate' &&
    url.pathname.startsWith('/archivepro/')
  ) {
    event.respondWith(
      fetch(req, {
        cache: 'no-store'
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match('/archivepro/index.html');
      })
    );

    return;
  }
});

console.log(`Archive Pro SW v${BUILD}`);
