const CACHE_NAME = "nuvoor-restaurant-v32-acciones-pedido";
const APP_SCOPE = new URL(self.registration.scope);
const APP_ASSETS = [
  APP_SCOPE.href,
  new URL("index.html", APP_SCOPE).href,
  new URL("manifest.webmanifest", APP_SCOPE).href,
  new URL("tema-petroleo.css?v=20261105-1033", APP_SCOPE).href,
  new URL("../config.js", APP_SCOPE).href,
  new URL("../facturacion-pos.js?v=20261104-2206", APP_SCOPE).href,
  new URL("icons/icon-192.png", APP_SCOPE).href,
  new URL("icons/icon-512.png", APP_SCOPE).href,
  new URL("icons/icon-180.png", APP_SCOPE).href
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => (key.startsWith("makers-restaurant-") || key.startsWith("nuvoor-restaurant-")) && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const configPath = new URL("../config.js", APP_SCOPE).pathname;
  const fiscalPath = new URL("../facturacion-pos.js", APP_SCOPE).pathname;
  if (url.origin !== APP_SCOPE.origin || (!url.pathname.startsWith(APP_SCOPE.pathname) && url.pathname !== configPath && url.pathname !== fiscalPath)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => {
      return await caches.match(request, { ignoreSearch: true }) ||
        await caches.match(APP_SCOPE.href) ||
        await caches.match(new URL("index.html", APP_SCOPE).href);
    }));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
