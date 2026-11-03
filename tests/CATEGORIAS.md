# Artículos por categoría

Prueba de escenarios con la aplicación original y servicios ficticios:

```powershell
node tests/categorias.mjs
```

Requiere Node 22+, Chrome (`CHROME_EXE` permite indicar otra ruta) y puertos libres 4178/9229. Comprueba catálogo con categorías duplicadas y propias, modelos, precio con el motor original, restauración de cotización, cancelación sin cambios, varias ubicaciones/conceptos, precios propios, técnicas, catálogo vacío, licencia vencida, teclado y tamaños de pantalla. También verifica que los editores anteriores de servicios y ubicaciones sigan funcionando.

Prueba adicional con clics reales de Playwright sobre una copia sin configuración ni servicios de red:

```powershell
node tests/categorias-playwright.mjs
```

Requiere `playwright-core`. `PLAYWRIGHT_MODULE` puede indicar su módulo de entrada; por omisión usa el paquete local de QA extraído en `tmp/categorias/playwright/package/`. En esta sesión se usó la distribución oficial 1.64.1 y se verificó su integridad SHA512. No descarga navegadores; abre Chrome con perfil aislado. Los datos de la sesión local se simulan sólo en la copia de prueba; el tutorial se marca visto antes de cargar y no se eliminan sus elementos del DOM.

Ambas pruebas usan datos inventados, no requieren llaves y no escriben cuentas reales. Las capturas quedan en `tmp/stripe/categorias-integradas-*.png` y `categorias-playwright-movil.png`.
