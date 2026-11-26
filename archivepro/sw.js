const BUILD = '21';
const SHELL = 'archive-pro-pwa-v' + BUILD;
const DATA = 'archive-pro-data-v1';
const IMAGES = 'archive-pro-standard-images-v1';
const PAGE = '/archivepro/index.html';
const CORE = [
  PAGE,
  '/archivepro/manifest.json',
  '/archivepro/archive-shell.css?v=21',
  '/archivepro/archive-runtime.js?v=21',
  '/archivepro/caption-reader.css?v=20261123-par1',
  '/archivepro/caption-reader.js?v=20261123-par1',
  '/a11y/display-settings.css?v=20261123-aa2',
  '/a11y/display-settings.js?v=20261123-aa2',
  '/a11y/screenreader-core.css?v=20261122-sr1',
  '/a11y/screenreader-core.js?v=20261122-sr1',
  '/archivepro-icon-192-v2.png?v=2',
  '/archivepro-icon-512-v2.png?v=2'
];
const CATALOGUES = new Set([
  'https://raw.githubusercontent.com/dungzakcestlavie/dungzakcestlavie.github.io/main/data/works.json',
  'https://dungzak.art/data/works.json'
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(CORE.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(key => key.startsWith('archive-pro-pwa-v') && key !== SHELL);
    await Promise.all(old.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function catalogue(request) {
  const cache = await caches.open(DATA);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    if (self.navigator.onLine === false) {
      const saved = await cache.match(request);
      if (saved) return saved;
    }
    throw error;
  }
}

async function navigation(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.status < 500) return response;
  } catch (_) {}
  return (await (await caches.open(SHELL)).match(PAGE)) || Response.error();
}

async function image(request, url) {
  const cache = await caches.open(IMAGES);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    let response;
    const rawGithub = url.origin === 'https://raw.githubusercontent.com' &&
      url.pathname.startsWith('/dungzakcestlavie/');
    if (rawGithub && request.mode === 'no-cors') {
      try {
        response = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) return response;
      } catch (_) {
        response = await fetch(request);
      }
    } else {
      response = await fetch(request);
    }
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    if (!url.search) {
      const previous = await cache.match(request, { ignoreSearch: true });
      if (previous) return previous;
    }
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === self.location.origin && url.pathname === PAGE) {
    event.respondWith(navigation(request));
  } else if (url.origin === self.location.origin && CORE.includes(url.pathname + url.search)) {
    event.respondWith(caches.open(SHELL).then(cache => cache.match(request)).then(saved => saved || fetch(request)));
  } else if (CATALOGUES.has(url.href)) {
    event.respondWith(catalogue(request));
  } else if (/\.(jpg|jpeg|png|webp)$/i.test(url.pathname)) {
    if (url.pathname.includes('/zoom/')) event.respondWith(fetch(request, { cache: 'no-store' }));
    else event.respondWith(image(request, url));
  }
});
