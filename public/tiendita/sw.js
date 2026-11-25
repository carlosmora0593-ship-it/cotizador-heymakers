const CACHE_NAME = "nuvoor-store-v15-personal";
const APP_SCOPE = new URL(self.registration.scope);
const APP_ASSETS = [
  new URL("../personal/panel.css?v=20261125-1552", APP_SCOPE).href,
  new URL("../personal/semana.js?v=20261125-1552", APP_SCOPE).href,
  new URL("../personal/semana-ui.js?v=20261125-1552", APP_SCOPE).href,
  new URL("../personal/actividades.js?v=20261125-1552", APP_SCOPE).href,
  new URL("../personal/admin.js?v=20261125-1552", APP_SCOPE).href,
  new URL("../personal/panel.js?v=20261125-1552", APP_SCOPE).href,
  new URL("../restaurante/personal-panel.css", APP_SCOPE).href,
  new URL("../restaurante/personal-fase1.css", APP_SCOPE).href,
  new URL("../restaurante/actividades.css", APP_SCOPE).href,
  new URL("../caja-concilia.js", APP_SCOPE).href,
  new URL("../caja-concilia.css", APP_SCOPE).href,
  APP_SCOPE.href,
  new URL("index.html", APP_SCOPE).href,
  new URL("manifest.webmanifest", APP_SCOPE).href,
  new URL("icons/tiendita.svg", APP_SCOPE).href,
  new URL("../config.js", APP_SCOPE).href,
  new URL("../facturacion-pos.js?v=20261104-2206", APP_SCOPE).href,
  new URL("bloqueo-store.css?v=20261121-2100", APP_SCOPE).href,
  new URL("../bloqueo-pin.css?v=20261121-2100", APP_SCOPE).href,
  new URL("../bloqueo.css?v=20261104-1712", APP_SCOPE).href,
  new URL("../bloqueo.js?v=20261104-1712", APP_SCOPE).href
];
/* La pantalla de bloqueo es la misma en todo Nuvoor: sus archivos viven fuera de /tiendita/ y también se guardan para que funcione sin internet. */
const COMPARTIDOS = ["../caja-concilia.js", "../caja-concilia.css", "../bloqueo.css", "../bloqueo-pin.css", "../bloqueo.js"].map(r => new URL(r, APP_SCOPE).pathname);
const CONFIG_URL = new URL("../config.js", APP_SCOPE).pathname;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => (key.startsWith("makers-tiendita-") || key.startsWith("nuvoor-store-")) && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== APP_SCOPE.origin) return;
  const inApp = url.pathname.startsWith(APP_SCOPE.pathname);
  const personal = APP_ASSETS.some(asset => new URL(asset).pathname === url.pathname);
  if (!inApp && !personal && url.pathname !== CONFIG_URL && url.pathname !== new URL("../facturacion-pos.js", APP_SCOPE).pathname && !COMPARTIDOS.includes(url.pathname)) return;

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
