// Sello Restaurant: 20261122-1435
const CACHE_NAME = "nuvoor-restaurant-v61-cierre-remoto";
const MEDIOS_CACHE = "nuvoor-restaurant-medios-v1";
const APP_SCOPE = new URL(self.registration.scope);
const APP_ASSETS = [
  new URL("../caja-concilia.css", APP_SCOPE).href,
  APP_SCOPE.href,
  new URL("index.html", APP_SCOPE).href,
  new URL("manifest.webmanifest", APP_SCOPE).href,
  new URL("tema-nuvoor.css?v=20261119-1428", APP_SCOPE).href,
  new URL("limpio.css?v=20261121-1445", APP_SCOPE).href,
  new URL("catalogo-alimentos.js?v=1", APP_SCOPE).href,
  new URL("personal-api.js?v=1", APP_SCOPE).href,
  new URL("personal-admin.js?v=1", APP_SCOPE).href,
  new URL("personal-panel.js?v=20261116-1726", APP_SCOPE).href,
  new URL("personal-panel.css?v=20261116-1726", APP_SCOPE).href,
  new URL("personal-semana.js", APP_SCOPE).href,
  new URL("personal-semana-ui.js", APP_SCOPE).href,
  new URL("personal-fase1.css", APP_SCOPE).href,
  new URL("personal-jornada.js", APP_SCOPE).href,
  new URL("actividades.js", APP_SCOPE).href,
  new URL("actividades.css", APP_SCOPE).href,
  new URL("puerta-imprenta.css", APP_SCOPE).href,
  new URL("../bloqueo.css?v=20261104-1712", APP_SCOPE).href,
  new URL("../bloqueo-pin.css?v=20261121-2100", APP_SCOPE).href,
  new URL("../bloqueo.js?v=20261104-1712", APP_SCOPE).href,
  new URL("../marca/n-64.png", APP_SCOPE).href,
  new URL("../marca/n-192.png", APP_SCOPE).href,
  new URL("../marca/palabra-96.png", APP_SCOPE).href,
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
  const compartido = APP_ASSETS.some(ref=>new URL(ref).pathname===url.pathname);
  if (url.origin !== APP_SCOPE.origin || (!url.pathname.startsWith(APP_SCOPE.pathname) && !compartido)) return;

  // La liga de una invitación puede traer un código privado. No se guarda
  // su dirección ni la respuesta de acceso en el caché del dispositivo.
  if (["personal.html","jornada.html"].some(p=>url.pathname === new URL(p, APP_SCOPE).pathname)) {
    event.respondWith(fetch(new Request(request,{cache:"no-store"})).catch(()=>new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><p>Conéctate a internet para confirmar tu acceso a Nuvoor.</p>',
      {status:503,headers:{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"}}
    )));
    return;
  }
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
