const CACHE_NAME = 'archive-pro-pwa-v8-offline-works';
const DATA_CACHE = 'archive-pro-data-v1';

const WORKS_JSON_URL =
  'https://dungzak.art/data/works.json';

const CORE_ASSETS = [
  '/archivepro/index.html',
  '/archivepro-icon-192-v2.png?v=2',
  '/archivepro-icon-512-v2.png?v=2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        for (const asset of CORE_ASSETS) {
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
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(
              key =>
                key.startsWith('archive-pro-') &&
                key !== CACHE_NAME &&
                key !== DATA_CACHE
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function fetchWorksJson() {
  try {
    const response = await fetch(
      WORKS_JSON_URL,
      {
        cache: 'no-store',
        mode: 'cors'
      }
    );

    if (!response.ok) {
      throw new Error(
        'works fetch failed'
      );
    }

    const copy =
      response.clone();

    caches
      .open(DATA_CACHE)
      .then(cache => {
        cache.put(
          WORKS_JSON_URL,
          copy
        );
      });

    return response;

  } catch (error) {

    const cache =
      await caches.open(
        DATA_CACHE
      );

    const cached =
      await cache.match(
        WORKS_JSON_URL
      );

    if (cached) {
      return cached;
    }

    return new Response(
      '[]',
      {
        headers: {
          'Content-Type':
            'application/json'
        }
      }
    );
  }
}

self.addEventListener(
  'fetch',
  event => {

    const request =
      event.request;

    if (
      !request ||
      request.method !== 'GET'
    ) {
      return;
    }

    const url =
      new URL(
        request.url
      );

    // works.json
    if (
      url.href ===
      WORKS_JSON_URL
    ) {

      event.respondWith(
        fetchWorksJson()
      );

      return;
    }

    // archivepro html
    if (
      request.mode ===
        'navigate' &&
      url.pathname.startsWith(
        '/archivepro/'
      )
    ) {

      event.respondWith(

        fetch(
          request,
          {
            cache:
              'no-store'
          }
        )

        .catch(
          async () => {

            const cache =
              await caches.open(
                CACHE_NAME
              );

            return (
              await cache.match(
                '/archivepro/index.html'
              )
            );

          }
        )
      );

      return;
    }

    // asset cache
    event.respondWith(

      caches
        .match(
          request
        )

        .then(
          cached => {

            if (
              cached
            ) {
              return cached;
            }

            return fetch(
              request
            )

            .then(
              response => {

                if (
                  response &&
                  response.ok
                ) {

                  caches
                    .open(
                      CACHE_NAME
                    )

                    .then(
                      cache =>
                        cache.put(
                          request,
                          response.clone()
                        )
                    );
                }

                return response;
              }
            );

          }
        )
    );

  }
);
