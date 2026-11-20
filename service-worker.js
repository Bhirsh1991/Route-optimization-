// The build updates these two constants whenever the offline shell changes.
const REVISION = 'c71be7fd12c1614c';
const FILES = ["index.html","manifest.json","logo-small.webp","assets/app.css","assets/icon-192.png","assets/icon-512.png","src/address-picker.js","src/geocode.js","src/optimizer.js","src/planner-state.js","src/routing.js"];
const scope = self.registration.scope;
const prefix = 'route-optimizer:' + scope + ':';
const cacheName = prefix + REVISION;
const indexUrl = new URL('index.html', scope).href;
const assets = new Set(FILES.map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const legacy = new URL(scope).pathname === '/Route-optimization-/'
      ? ['route-optimizer-v1', 'route-optimizer-runtime-v1'] : [];
    for (const name of await caches.keys()) {
      if ((name.startsWith(prefix) && name !== cacheName) || legacy.includes(name)) {
        await caches.delete(name);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const navigation = request.mode === 'navigate'
    && (url.origin + url.pathname === scope || url.origin + url.pathname === indexUrl);
  if (!navigation && !assets.has(url.href)) return;

  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(cacheName);
    } catch {
      return fetch(request);
    }
    const key = navigation ? indexUrl : url.href;
    let response;
    try {
      response = await fetch(request, { cache: 'no-cache' });
    } catch {
      return await cache.match(key) || Response.error();
    }
    if (response.ok && !response.redirected) {
      try {
        await cache.put(key, response.clone());
      } catch {
        // A full or restricted cache should not prevent an online visit.
      }
    } else if (response.status >= 500 || response.status === 429) {
      return await cache.match(key) || response;
    }
    return response;
  })());
});
