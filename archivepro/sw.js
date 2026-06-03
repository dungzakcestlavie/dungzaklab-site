const CACHE_NAME = 'archive-pro-pwa-v7-manifest-network-only';

const CORE_ASSETS = [
  '/archivepro/index.html',
  '/archivepro-icon-192-v2.png?v=2',
  '/archivepro-icon-512-v2.png?v=2'
];

const CURRENT_MANIFEST = {
  name: 'Archive Pro — DUNGZAK CESTLAVIE',
  short_name: 'Archive Pro',
  description: 'Archive Pro / interface for dungzak.art works.json',
  start_url: '/archivepro/index.html',
  scope: '/archivepro/',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#031421',
  theme_color: '#031421',
  icons: [
    {
      src: '/archivepro-icon-192-v2.png?v=2',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any maskable'
    },
    {
      src: '/archivepro-icon-512-v2.png?v=2',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any maskable'
    }
  ]
};

function currentManifestResponse() {
  return new Response(
    JSON.stringify(CURRENT_MANIFEST, null, 2),
    {
      status: 200,
      headers: {
        'Content-Type':
          'application/manifest+json; charset=utf-8',
        'Cache-Control':
          'no-store, no-cache, must-revalidate, max-age=0'
      }
    }
  );
}

function isArchiveProPath(url) {
  return url.pathname.startsWith('/archivepro/');
}

function isArchiveProManifest(url) {
  return url.pathname === '/archivepro/manifest.json';
}

function isArchiveDocument(request, url) {
  return (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname === '/archivepro/' ||
    url.pathname === '/archivepro/index.html'
  );
}

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

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(
              key =>
                key.includes('archive-pro') &&
                key !== CACHE_NAME
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (!request || request.method !== 'GET')
    return;

  const url = new URL(request.url);

  if (!isArchiveProPath(url))
    return;

  // 중요:
  // manifest 절대 캐시 금지
  if (isArchiveProManifest(url)) {
    event.respondWith(
      fetch(request, {
        cache: 'no-store',
        credentials: 'same-origin'
      })
        .then(response => {
          if (
            response &&
            response.ok
          ) {
            return response;
          }

          return currentManifestResponse();
        })
        .catch(() =>
          currentManifestResponse()
        )
    );

    return;
  }

  // index 최신 우선
  if (isArchiveDocument(request, url)) {
    event.respondWith(
      fetch(request, {
        cache: 'no-store'
      }).catch(async () => {
        const cache =
          await caches.open(
            CACHE_NAME
          );

        return (
          await cache.match(
            '/archivepro/index.html'
          )
        );
      })
    );

    return;
  }

  // 일반 asset
  event.respondWith(
    caches.match(request).then(
      cached => {
        if (cached)
          return cached;

        return fetch(request).then(
          response => {
            if (
              response &&
              response.ok
            ) {
              const copy =
                response.clone();

              caches
                .open(CACHE_NAME)
                .then(cache => {
                  try {
                    cache.put(
                      request,
                      copy
                    );
                  } catch (e) {}
                });
            }

            return response;
          }
        );
      }
    )
  );
});
