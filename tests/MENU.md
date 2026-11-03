# Menú completo de Imprenta

```powershell
node tests/menu.mjs
```

Requiere Node 22+, Chrome (`CHROME_EXE` para otra ruta) y `playwright-core`. Usa por defecto el paquete oficial local de QA en `tmp/categorias/playwright/package/index.mjs`; se puede indicar otra entrada mediante `PLAYWRIGHT_MODULE`. El puerto local 4180 debe estar libre.

Prueba la aplicación original con Supabase/Stripe ficticios, Chrome aislado y solicitudes externas bloqueadas. No requiere credenciales ni escribe en cuentas reales.

Valida 18 botones originales sin duplicados; cuatro grupos abiertos; selección única; búsqueda sin acentos; grupos plegados y sin resultados; conservación de badges; permisos de producción/Básico/Pro; Ajustes según rol; cuenta vencida y consulta disponible; drawer móvil, fondo, Escape y foco; cambio de tamaño; temas claro/oscuro y contraste de Cotizar. Capturas en `tmp/stripe/menu-integrado-*.png`.

Regresiones relacionadas:

```powershell
node tests/categorias-playwright.mjs
node tests/suspension/run.mjs
```

Ejecutar en secuencia: comparten la carpeta de vista previa.
