const CACHE_NAME = "makers-tiendita-v3";
const APP_SCOPE = new URL(self.registration.scope);
const APP_ASSETS = [
  APP_SCOPE.href,
  new URL("index.html", APP_SCOPE).href,
  new URL("manifest.webmanifest", APP_SCOPE).href,
  new URL("icons/tiendita.svg", APP_SCOPE).href,
  new URL("../config.js", APP_SCOPE).href
];
const CONFIG_URL = new URL("../config.js", APP_SCOPE).pathname;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("makers-tiendita-") && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== APP_SCOPE.origin) return;
  const inApp = url.pathname.startsWith(APP_SCOPE.pathname);
  if (!inApp && url.pathname !== CONFIG_URL) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => await caches.match(request, {ignoreSearch:true}) || await caches.match(APP_SCOPE.href) || await caches.match(new URL("index.html", APP_SCOPE).href)));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
