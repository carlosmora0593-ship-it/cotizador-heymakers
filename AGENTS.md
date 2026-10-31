# AGENTS.md: Nuvoor

Instrucciones para cualquier agente (Codex, Claude u otro) que trabaje en este repositorio.
Última actualización: 31 de octubre de 2026, al pasar el trabajo de Claude a Codex.

## Qué es esto

**Nuvoor** es una plataforma de puntos de venta hecha en Morelia. Antes se llamó Hey Makers, Makers OS y «Nuvor». Hoy tiene cuatro piezas:

- **Nuvoor Taller**: cotizador y POS para imprentas, serigrafía, sublimación y artículos personalizados.
- **Nuvoor Restaurant**: mesas, comandas, cocina y caja.
- **Nuvoor Tiendita**: venta rápida con lector, inventario y caja.
- **El Lab**: la consola del dueño de la plataforma. Maneja cuentas, planes, publicidad y la base de datos.

El dueño es **Carlos**. Todo el texto de la interfaz va en **español de México**, con lenguaje sencillo: quienes lo usan son dueños de negocio, no programadores.

**Dónde vive cada cosa:**

- `https://app.nuvoor.mx` publica **este repo**, con GitHub Pages por Actions.
- `https://nuvoor.mx` es la landing de ventas. Va en un **repo aparte**, `nuvoor-web`, que todavía no se publica.
- **Supabase** guarda las cuentas, la autenticación, los datos del Taller y la Tiendita y las Edge Functions.

## Mapa del repo

```
public/                 ← lo ÚNICO que se publica (.github/workflows/static.yml → path: public)
  index.html            Nuvoor Taller: app de un solo archivo (~1.4 MB, CSS y JS adentro). Fin de línea CRLF.
  taller.html           Copia casi idéntica de index.html (LF). TODO cambio al Taller va en LOS DOS.
  acceso.html/.js/.css  Entrar y crear cuenta (Supabase Auth). Acepta ?alta=1&producto=taller|restaurant|tiendita
  lab.html + lab.js     El Lab (consola del dueño de la plataforma)
  restaurante/          Nuvoor Restaurant como PWA (+ APK TWA, manifest, sw.js)
  restaurant.html       Versión anterior del Restaurant en la raíz
  tiendita/             Nuvoor Tiendita como PWA (+ reservar.html para citas)
  MakersOS.html, productos/   Página de ventas vieja dentro de la app (la sustituye nuvoor.mx)
  cuenta.js             Puente con Supabase: sesión, datos, storage (window.claude.use("assets") → storage)
  diagnostico.js
  config.js             URL y llave anon de Supabase de Carlos. ⚠️ NO SE TOCA NUNCA.
  version.json          {"build","cotizador","lab","restaurant"}: sellos de versión
supabase/functions/     Edge Functions: crear-pago, crear-suscripcion, portal-suscripcion,
                        webhook-stripe, webhook-mercadopago, invitar-usuario
sql/                    Migraciones que Carlos corre a mano en Supabase. Llevan TU-CORREO-DE-DUENO@EJEMPLO.COM;
                        las copias con su correo se llaman CORRER-*.sql y están en .gitignore.
netlify/, netlify.toml  Legado. Netlify está congelado (sin créditos desde el 23 oct 2026).
saas/                   Árbol viejo. NO se publica; no editar ahí pensando que sale en el sitio.
Claude outputs/         (en .gitignore) Entregas de Claude. Ahí está la landing: nuvoor-landing/
PUBLICAR.bat            Commit + fetch + rebase + push origin HEAD:main. Es el botón de Carlos.
```

La rama local es `docs/estructura-carpeta`. `PUBLICAR.bat` empuja con `git push origin HEAD:main`, así que de todos modos llega a `main`.

## Reglas que no se rompen

1. **`public/config.js` no se edita, no se reemplaza y no se regenera.** El de `saas/public/` es una plantilla con `TU-PROYECTO`; copiarlo encima tira el sitio.
2. **La llave `service_role` de Supabase vive sólo en los secretos de Supabase.** Nunca en el repo, ni en `config.js`, ni en el navegador. La `anon` sí es pública por diseño.
3. **Nunca** se agregan `SUPABASE_SERVICE_KEY`, `MP_ACCESS_TOKEN`, `WEBHOOK_CLAVE` ni `STRIPE_LLAVE` a `SECRETS_SCAN_OMIT_KEYS`. Si un escáner de secretos se queja, se averigua por qué hay una llave en el sitio.
4. **El repo es público.** No subir el correo de Carlos, datos de clientes ni llaves.
5. **Nunca se piden ni se guardan números de tarjeta.** El cobro va por Stripe Checkout o Mercado Pago: la página del procesador los captura, nosotros no.
6. **Contraseñas y llaves las escribe Carlos** en su panel. No se le piden por chat ni se pegan en formularios por él.
7. **El bucket `disenos` de Supabase es privado.** En el catálogo se guarda la *ruta* (`fotoRef`) y la URL firmada se pide cada vez que se abre: una URL firmada caduca.
8. **Sólo Nuvoor (el Lab) pone publicidad** en los POS.
9. **Carlos quiere ver primero una maqueta** de cada POS nuevo o cambio grande de pantalla, y sólo después publicarlo.
10. **No le digas que algo funciona sin probarlo contra lo real**: la base, el sitio publicado, el botón. Que el archivo tenga el código no cuenta como prueba.
11. **No es asesoría fiscal ni legal.** Nada de ayudar a no declarar ingresos.

## Cómo publicar un cambio

1. Edita en `public/`. Si tocas el Taller, aplícalo a **`index.html` y `taller.html`**.
2. **Sube el sello de versión** con el formato `AAAAMMDD-HHMM`, en hora de Ciudad de México:
   - El Taller lee `version.json` → `"cotizador"`. En las dos páginas cambia `window.BUILD="…"` y `var mio = "…"` al mismo valor.
   - `lab.html` → `"lab"`. `restaurant.html` → `"restaurant"`.
   - Si `version.json` es más nuevo que el `mio` de la página, la página se recarga sola una vez.
3. Carlos corre `PUBLICAR.bat`, o `git add -A && git commit && git push origin HEAD:main`.
4. El workflow de Pages tarda 1 o 2 minutos. Comprueba en `https://app.nuvoor.mx/version.json`.
5. Si alguna vez se cambia el dominio en Settings → Pages: Actions → «Deploy static content to Pages» → **Run workflow**. Sin un despliegue nuevo, el dominio da 404.

## Cómo probar

- Las apps son archivos sueltos. Se prueban con **Playwright** sobre una copia de vista previa sin red:
  - Quita `<script src="config.js">`, el CDN de supabase, `cuenta.js` y `diagnostico.js`.
  - Antes del **último** `</body>` (hay `</body>` dentro de strings de JS) inserta una llamada a `window.__arranca`.
- Marca el tutorial como visto **antes** de cargar: `localStorage.setItem("cotizador_tour","1")`. No lo borres del DOM: una prueba que borra la puerta no prueba la puerta.
- Para algo que use `mask-image` o `fetch`, sirve por http (`python -m http.server`), no por `file://`.
- Antes de nombrar una clase o una función en un archivo de 1.4 MB, **búscala**: ya ha habido cuatro choques de nombres (`.tbCol`, `sinAcentos`, `PRODUCTO.giro`, `.croqBarra`).

## El Taller por dentro (lo mínimo)

- `cot` es la cotización abierta.
  - `cot.items` son los **conceptos** y `cot.iAct` es el activo; `CAMPOS_ITEM` dice qué se guarda por concepto.
  - `calc()` calcula el concepto activo y `calcDe(cot)` el total; `guardaItemActivo(cot)` sincroniza.
- `cot.modo`:
  - `"articulo"`: artículo personalizado. `cot.apps` son las ubicaciones (`{ubic, tecnicaId, ancho, alto, tintas, puntadas, art…}`). El armado de material sale con `sincronizaArmado`.
  - `"impresion"`: servicio de impresión. `cot.svc = {pid, st, art}`; el precio sale de `svCalc` sobre `cat.svcCat`, sembrado con `SV_DEF`.
  - `"servicio"`: legado.
- **Confirmar pedido exige pago.** `pgAbre()` captura anticipo, total o crédito, y si se factura. Luego `cv2RegistraPago()` crea la venta del folio. «Cobrar» después de confirmar abre el abono (`abreAbono`), no otra venta.
- **Ventas y crédito:** `saldoDe`, `abreAbono`, `creditoDe`, `puedeFacturar`.
- **Prefijos** `cv2*`, `sv*` y `pg*`: el rediseño del 30 oct 2026 (barra «¿Qué vamos a cotizar?», ventana de servicios, ubicaciones, pago al confirmar).
- **Impresión sin URL en los PDF:** `@page{margin:0}` y el margen va por dentro (`.hojaMarco`). No quitarlo: las ligas del cotizador dejaban entrar a cualquiera.

## Estado al 31 oct 2026

- **`app.nuvoor.mx` está conectado** y con HTTPS forzado. En GoDaddy:
  - `CNAME app → carlosmora0593-ship-it.github.io`
  - `TXT _github-pages-challenge-carlosmora0593-ship-it`
- **Supabase** ya apunta a la dirección nueva: Auth → Site URL `https://app.nuvoor.mx` y Redirect URLs `https://app.nuvoor.mx/**`. Secreto `SITIO_URL = https://app.nuvoor.mx`.
- **La marca ya dice «Nuvoor»** en todos los POS: sello `20261031-0029`. El cotizar nuevo y el pago al confirmar están publicados.
- **La landing está lista** en `Claude outputs/nuvoor-landing/sitio/` (`index.html` + `img/`), sin publicar.
- **ALTAS CERRADAS (decisión de Carlos, 31 oct): por ahora nadie nuevo puede crear cuenta.** Está cerrado en cuatro lugares:
  1. **Supabase** → Authentication → Sign In / Providers → «Allow new users to sign up» **apagado**. Ése es el candado de verdad.
  2. **`acceso.html`:** el botón «Crear cuenta gratis» tiene `hidden` y hay un aviso `#altaPronto`. En `acceso.js`, `modo="entrar"` está fijo y `setMode` convierte `"alta"` en `"entrar"`.
  3. **Taller (`index.html` y `taller.html`):** el botón `data-modo="alta"` tiene `hidden`.
  4. **Tiendita:** el botón `data-authmode="alta"` tiene `hidden`.
  - **La landing** tiene `ALTAS_ABIERTAS = False` en `build.py`: los 14 botones de prueba abren el aviso «Las cuentas nuevas abren muy pronto». Sólo «Entrar» lleva a la app.
  - **Para reabrir, sólo cuando Carlos lo diga:** deshacer los cuatro puntos, poner `ALTAS_ABIERTAS = True` y reconstruir la landing. Antes deben estar configurados los cobros (pendiente 3).

## Pendientes, en orden

1. **Publicar la landing en `nuvoor.mx`.** Ver `Claude outputs/nuvoor-landing/sitio/README.md`.
   - Crea un repo **nuevo** `nuvoor-web`: Pages sólo permite un dominio por repo, y éste ya usa `app.nuvoor.mx`.
   - Pages desde la rama `main`, carpeta raíz. Dominio `nuvoor.mx`.
   - DNS en GoDaddy: Carlos lo hace en la web. Está en el README.
2. **Verificar `nuvoor.mx` en GitHub:** perfil → Settings → Pages → «…» → Continue verifying → Verify. El TXT ya está.
3. **Cobros.** Los secretos de las Edge Functions en Supabase **están vacíos** (sólo existe `SITIO_URL`). Hoy, al terminar la prueba de 15 días, nadie puede pagar.
   - Ver `PASOS-STRIPE.md` y actualizar ahí `SITIO_URL` a `https://app.nuvoor.mx`; lo mismo en `PASOS-SUPABASE.md`.
   - Las llaves las pone Carlos.
4. **Cuando `nuvoor.mx` esté vivo:** `MakersOS.html` y `productos/*` redirigen a `https://nuvoor.mx`, y el «Volver a Nuvoor» de `acceso.html` también.
5. **Logo de Nuvoor dentro de los POS:** puerta de acceso, barra y favicon. Los archivos están en `Claude outputs/nuvoor-landing/sitio/img/marca/`:
   - `n-64.png`, `n-192.png`, `n-512.png`: la N con su estrella.
   - `palabra-96.png`: la palabra NUVOOR en negro. En modo oscuro se pinta con `mask` sobre `background: var(--ink)`.
   - Colores del logo: morado `#4c4780`, índigo `#4458a4`, cielo `#49a6de`, agua `#79cce0`, tinta `#0a0e1a`.
6. **App de Android del Restaurant (TWA):** reconstruirla para `app.nuvoor.mx` (`preparar-app-restaurante.ps1`) y poner `assetlinks.json` en `public/.well-known/`, la raíz del dominio.
7. **Netlify:** Carlos decide si se borra el sitio. Se recomienda borrarlo.
8. **Borrar** `CONECTAR-DOMINIO.bat`, que en su Windows abría y cerraba sin hacer nada, y `public/PRUEBA-commit.html`.
9. **Rotar la llave `service_role`** de Supabase: se vio en un Notepad y en una captura.
10. **Migraciones de Supabase pendientes:** revisar cuáles de `sql/` no se han corrido; al menos anuncios (12–16), stripe (18) y `18-productos-cuenta.sql`, que necesita la licencia Multiempresa. Las corre Carlos.
11. **Lab:**
    - Una pieza para prender las secciones de servicio con candado (rotulación vehicular, letras 3D, router, caja). El gancho es `window.__seccionSvc`.
    - Dar de alta impresoras multifuncionales en Máquinas, con costo por clic.
12. **Editor de la página por bloques** (maqueta en artefacto de Claude):
    - Tabla en Supabase con `borrador` y `publicado`.
    - La página lee de ahí, pero se queda con el contenido horneado para los buscadores.
    - Sección en el Lab y bucket público `sitio`.
13. **NO construir hasta que Carlos confirme que el cotizador quedó:** la bienvenida de cuentas nuevas.
    - Confeti con «Gracias por suscribirte, [plan], [nombre]».
    - Configuración guiada: empresa, datos para facturar, costos, tipos de impresión e inventario; en plan Pro, trabajadores, con opción de dejarlo para después.
    - Lo que deje para después queda como tareas en el tablero del dueño.
14. **El Restaurant guarda todo en el navegador** (localStorage por dirección). Quien lo usaba en la dirección vieja de github.io necesita su respaldo para pasarlo a `app.nuvoor.mx`.
15. **WhatsApp del negocio:** no hay número. La landing no lleva botones de WhatsApp hasta que Carlos lo dé. El código viejo usa el de relleno `524430000000`; no publicarlo como si fuera real.

## Cómo trabajar con Carlos

- Explica en pocas palabras y en español. Si él tiene que hacer algo en un panel (GoDaddy, GitHub, Supabase), dale **la liga directa y el texto exacto** de cada casilla. Le ayudan mucho las capturas marcadas.
- Le gusta lo que se corre con doble clic. Pero `CONECTAR-DOMINIO.bat` no le corrió, así que antes de darle otro `.bat`, prueba que su Windows lo deje correr.
- Revisa que todo quede alineado antes de enseñarle una pantalla, y que el cotizador siga siendo simple aunque eso signifique no agregar algo.
