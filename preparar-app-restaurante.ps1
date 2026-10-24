$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$sourcePath = Join-Path $projectRoot "PRUEBA-restaurant.html"
if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "No encuentro PRUEBA-restaurant.html en $projectRoot"
}
$nativeApkPath = Join-Path $projectRoot "android-native\app\build\outputs\apk\release\app-release.apk"
$nativeHashPath = Join-Path $projectRoot "android-release\Makers-Restaurant.native-source.sha256"
$legacyApkPath = Join-Path $projectRoot "android-release\Makers-Restaurant.apk"
$nativeIsCurrent = $false
if ((Test-Path -LiteralPath $nativeApkPath) -and (Test-Path -LiteralPath $nativeHashPath)) {
  $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
  $builtSourceHash = [IO.File]::ReadAllText($nativeHashPath).Trim()
  $nativeIsCurrent = $sourceHash -eq $builtSourceHash
}
$apkSourcePath = if ($nativeIsCurrent) { $nativeApkPath } else { $legacyApkPath }
$appPath = Join-Path $projectRoot "public\restaurante"
$iconPath = Join-Path $appPath "icons"
$indexPath = Join-Path $appPath "index.html"
$swPath = Join-Path $appPath "sw.js"

if (-not (Test-Path -LiteralPath $apkSourcePath)) {
  throw "No encuentro android-release\Makers-Restaurant.apk. El boton de descarga necesita el APK firmado."
}
if (-not (Test-Path -LiteralPath $iconPath)) {
  New-Item -ItemType Directory -Path $iconPath -Force | Out-Null
}

$page = [IO.File]::ReadAllText($sourcePath)
$viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
if (-not $page.Contains($viewport)) { throw "No encontré el punto de inserción del encabezado de la app." }
$storageAnchor = 'const LS = "makersrest_v1";'
if (-not $page.Contains($storageAnchor)) { throw "No encontré la clave de almacenamiento para aislar los datos de la app." }
$page = $page.Replace($storageAnchor, 'const LS = "makersrest_pwa_v1";')

$pwaHead = @'
<meta name="theme-color" content="#204a3b">
<meta name="description" content="Makers Restaurant: mesas, comandas, caja y servicio para tu restaurante.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Makers Rest">
<link rel="apple-touch-icon" href="./icons/icon-180.png">
<link rel="manifest" href="./manifest.webmanifest">
<style>#pwaInstall{background:#f8f6ec;color:#204a3b;border-color:#d8dece}#pwaInstall:hover{background:#fffdf7;border-color:#fffdf7}.pwaInstall+.turnoChip{margin-left:0}@media(max-width:540px){.pwaInstall{padding:6px 8px;font-size:10px}.turnoChip{font-size:10px}}</style>
'@
$page = $page.Replace($viewport, $viewport + "`r`n" + $pwaHead.Trim())

$turnoAnchor = '    <span class="turnoChip cerrado" id="turnoChip">'
if (-not $page.Contains($turnoAnchor)) { throw "No encontré el encabezado de caja para agregar la opción de instalación." }
$installButton = '    <button class="btn sm pwaInstall" id="pwaInstall" type="button" hidden style="white-space:nowrap;margin-left:auto">Instalar app</button>' + "`r`n" + $turnoAnchor
$page = $page.Replace($turnoAnchor, $installButton)

$pwaScript = @'
<script>
(()=>{
  const button=document.getElementById("pwaInstall");
  if(!button||location.protocol==="file:") return;
  const standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
  if(standalone||window.MakersPrinter){button.hidden=true;return;}
  let installEvent=null;
  button.hidden=false;
  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();installEvent=event;button.textContent="Instalar app";button.hidden=false;
  });
  button.addEventListener("click",async()=>{
    if(installEvent){
      const prompt=installEvent;installEvent=null;await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==="accepted") button.hidden=true;
      return;
    }
    const apple=/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
    toast(apple?"En Safari, toca Compartir y elige A\u00f1adir a pantalla de inicio.":"Abre el men\u00fa del navegador y elige Instalar app o Instalar p\u00e1gina.");
  });
  window.addEventListener("appinstalled",()=>{button.hidden=true;toast("Makers Restaurant qued\u00f3 instalada.");});
  if("serviceWorker" in navigator){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{}));
  }
})();
</script>
'@
$closeBody = '</body>'
if (-not $page.Contains($closeBody)) { throw "No encontré el cierre de la página." }
$bodyCloseIndex = $page.LastIndexOf($closeBody, [StringComparison]::OrdinalIgnoreCase)
$page = $page.Substring(0, $bodyCloseIndex) + $pwaScript + "`r`n" + $page.Substring($bodyCloseIndex)
[IO.File]::WriteAllText($indexPath, $page, [Text.UTF8Encoding]::new($false))

$manifest = @'
{
  "id": "./",
  "name": "Makers Restaurant",
  "short_name": "Makers Rest",
  "description": "Mesas, comandas, caja y servicio para tu restaurante.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "orientation": "any",
  "theme_color": "#204a3b",
  "background_color": "#f5f3ec",
  "categories": ["food", "business"],
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
'@
[IO.File]::WriteAllText((Join-Path $appPath "manifest.webmanifest"), $manifest, [Text.UTF8Encoding]::new($false))

$serviceWorker = @'
const CACHE_NAME = "makers-restaurant-__BUILD_ID__";
const APP_SCOPE = new URL(self.registration.scope);
const APP_ASSETS = [
  APP_SCOPE.href,
  new URL("index.html", APP_SCOPE).href,
  new URL("manifest.webmanifest", APP_SCOPE).href,
  new URL("icons/icon-192.png", APP_SCOPE).href,
  new URL("icons/icon-512.png", APP_SCOPE).href,
  new URL("icons/icon-180.png", APP_SCOPE).href
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("makers-restaurant-") && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== APP_SCOPE.origin || !url.pathname.startsWith(APP_SCOPE.pathname)) return;
  if (url.pathname.endsWith("/Makers-Restaurant.apk")) return;

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
'@
$buildId = (Get-FileHash -LiteralPath $indexPath -Algorithm SHA256).Hash.Substring(0, 12).ToLowerInvariant()
$serviceWorker = $serviceWorker.Replace("__BUILD_ID__", $buildId)
[IO.File]::WriteAllText($swPath, $serviceWorker, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath $apkSourcePath -Destination (Join-Path $appPath "Makers-Restaurant.apk") -Force

Write-Host "App web lista en public/restaurante/ (version $buildId)."
Write-Host "Incluye el boton de descarga Android y Makers-Restaurant.apk."
if (-not $nativeIsCurrent) {
  Write-Host "Aviso: aun se usa el APK anterior; compila android-native para incluir la impresion directa."
}
Write-Host "Al publicarla en HTTPS, se podra instalar desde el menu del navegador."
