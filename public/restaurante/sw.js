const CACHE_NAME = "nuvoor-restaurant-v49-fotos-logo";
const MEDIOS_CACHE = "nuvoor-restaurant-medios-v1";
const APP_SCOPE = new URL(self.registration.scope);
const APP_ASSETS = [
  APP_SCOPE.href,
  new URL("index.html", APP_SCOPE).href,
  new URL("manifest.webmanifest", APP_SCOPE).href,
  new URL("tema-borgona.css?v=20261106-1620", APP_SCOPE).href,
  new URL("catalogo-alimentos.js?v=1", APP_SCOPE).href,
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
    keys.filter(key => (key.startsWith("makers-restaurant-") || key.startsWith("nuvoor-restaurant-")) && key !== CACHE_NAME && key !== MEDIOS_CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if(url.protocol === "https:" && /^[a-z0-9]+\.supabase\.co$/.test(url.hostname) &&
      url.pathname.startsWith("/storage/v1/object/public/restaurant-medios/")) {
    event.respondWith(caches.open(MEDIOS_CACHE).then(async cache => {
      const cached = await cache.match(request);
      if(cached) return cached;
      const response = await fetch(new Request(request,{mode:"cors",credentials:"omit"}));
      if(response.ok) await cache.put(request,response.clone());
      return response;
    }));
    return;
  }
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
