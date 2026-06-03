const CACHE_NAME = 'archive-pro-pwa-v10';
const DATA_CACHE = 'archive-pro-data-v2';
const IMAGE_CACHE = 'archive-pro-offline-sections-v2';

const WORKS_JSON_URL = 'https://dungzak.art/data/works.json';

const CORE = [
  '/archivepro/index.html',
  '/archivepro/manifest.json?v=5',
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
            await cache.add(url);
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
          .filter((k) =>
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
  return (
    url.href.includes('/zoom/') ||
    url.pathname.includes('/zoom/')
  );
}

async function cacheStandardImages(list) {
  try {
    const cache = await caches.open(IMAGE_CACHE);

    for (const work of list) {
      try {
        if (
          work &&
          work.section_id !== 0 &&
          work.image &&
          !work.image.includes('/zoom/')
        ) {
          const exists = await cache.match(work.image);

          if (!exists) {
            const r = await fetch(work.image, { mode: 'cors' });

            if (r.ok) {
              await cache.put(work.image, r.clone());
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

async function fetchWorks() {
  try {
    const response = await fetch(WORKS_JSON_URL, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error();
    }

    const json = await response.clone().json();

    const cache = await caches.open(DATA_CACHE);

    await cache.put(
      WORKS_JSON_URL,
      new Response(JSON.stringify(json), {
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    const offline = Array.isArray(json)
      ? json.filter(
          (v) =>
            v.section_id !== 0 &&
            v.section_kr !== 'A 기원' &&
            v.section_en !== 'Origins'
        )
      : json;

    await cache.put(
      'archivepro-offline',
      new Response(JSON.stringify(offline), {
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );

    cacheStandardImages(offline);

    return response;
  } catch (e) {
    const cache = await caches.open(DATA_CACHE);

    const cached = await cache.match('archivepro-offline');

    if (cached) {
      return cached;
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

          if (network.ok) {
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
