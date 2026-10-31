# Tarea para Codex: cuentas, sesión y cada negocio por separado (URGENTE)

Escrito por Claude el 31 oct 2026, 14:00. **Va ANTES que todo lo demás** (impresoras pendientes menores, meseros y modo oscuro). Las reglas de `AGENTS.md` mandan y el historial va en `HISTORIAL-CODEX/`.

## 1. Lo que reportó Carlos (sus palabras y sus capturas del iPhone)

> «Cuando tratas de entrar en sesión y le das en el nombre Nuvoor te manda a la página de la foto 1 en vez de a la landing page.»
>
> «El APK no se sincroniza con mi usuario de correo, y tampoco puedes cerrar sesión.»
>
> «Recordemos que esta app es multiusuarios y todos son independientes. Espero se construyera así desde un principio.»

**Captura 2:** en `app.nuvoor.mx/acceso.html`, entrando con su correo, sale «**No pudimos abrir tu cuenta** · No pudimos abrir la cuenta de este negocio.» y un botón «Ver licencias».

## 2. Lo que ya revisó Claude

1. **El nombre «Nuvoor» y «Volver a Nuvoor» de `acceso.html`** van a `./MakersOS.html` (3 ligas). Es la página de ventas vieja, que todavía dice «Nuvor Taller» y «15 días gratis». **Deben ir a `https://nuvoor.mx`.**
   - `productos/*.html` también ligan a `MakersOS.html`.
   - El pendiente 4 de `AGENTS.md` ya lo pedía: `MakersOS.html` y `productos/` deben **redirigir** a `https://nuvoor.mx`, con `<meta http-equiv="refresh">` + `location.replace` y un enlace visible.
2. **«No pudimos abrir la cuenta de este negocio»** sale de `leeCuenta()` en `acceso.js`. Hipótesis más probable, **no comprobada**:
   - `acceso.js` busca la cuenta con `perfil.cuenta_activa || perfil.cuenta_id`.
   - Pero la base decide con `public.mi_cuenta()` (ver `CORRER-2-superadmin.sql`): usa `cuenta_activa` **sólo si hay membresía** y si no, la primera de `membresias`.
   - Si `cuenta_activa` o `cuenta_id` apuntan a una cuenta sin membresía, la RLS `cuentas_ver (id = mi_cuenta())` regresa cero filas y sale ese error.
   - Imprenta (`cuenta.js`) resuelve la cuenta con la lista de membresías, por eso puede que a él sí le abra.
   - Store (`tiendita/index.html`) usa `prof.cuenta_id`, así que tiene el mismo riesgo.
3. **El Restaurant nunca se conectó a las cuentas.**
   - `restaurante/index.html` no carga `config.js` ni Supabase: guarda todo en el `localStorage` del aparato (`makersrest_v1`).
   - **El APK 0.1.x abre directo `restaurante/`**: esa decisión fue de Claude, para probar impresoras rápido. Por eso no pide correo, no se liga al usuario y no tiene «Cerrar sesión».
   - Ya estaba anotado como pendiente desde el 16 oct («la capa de cuentas y planes»). **Ahora es lo primero.**
4. **«Cerrar sesión» de `acceso.js`** hace `signOut()` y `location.replace("./")`. Eso manda a la raíz, que es Imprenta, en vez de regresar a la puerta.

## 3. Lo que hay que hacer

### A. La puerta (`acceso.html` / `acceso.js`)

1. **Las ligas:** el logo «Nuvoor» y «Volver a Nuvoor» van a `https://nuvoor.mx`.
2. **Redirecciones:** `MakersOS.html` y `productos/*.html` redirigen a `https://nuvoor.mx`. No borres los archivos: sólo los conviertes en redirección.
3. **La cuenta se resuelve igual que la base:**
   - Primero `sb.rpc("mi_cuenta")`. Revisa que `authenticated` tenga `execute`; si no, escribe el `grant` en un SQL nuevo para que Carlos lo corra.
   - Luego `cuentas.eq("id", eseId)`.
   - Si falla, prueba con las membresías del usuario (`membresias` → `cuentas`), como hace `cuenta.js`.
4. **Cuando falle, enseña el porqué.** Debajo de «No pudimos abrir la cuenta…» pon el **detalle real** en letra chica (`r.error.message` / `code`), sin datos sensibles. Hoy el mensaje genérico no deja diagnosticar.
5. **Cerrar sesión:** `signOut()` y regresar a `acceso.html`, no a `./`. Que funcione en iPhone Safari, Chrome Android y dentro del APK.
6. **Store:** aplica la misma forma de resolver la cuenta en `tiendita/index.html`.

### B. El Restaurant con cuenta (cada negocio independiente)

1. **Sesión obligatoria.**
   - `restaurante/index.html` carga `config.js` + supabase-js y revisa la sesión.
   - Sin sesión → `acceso.html?producto=restaurant`.
   - Si la cuenta no tiene el producto `restaurant` → un aviso claro con «Ver licencias» / «Cambiar de cuenta».
2. **Datos separados por cuenta en el aparato.**
   - El prefijo de `localStorage` incluye el id de la cuenta (por ejemplo `makersrest_v1_c_<cuentaId>`).
   - **Dos negocios en la misma tablet nunca ven lo del otro.**
   - Los eventos (`_evento_`) y la lista de **impresoras** también van por cuenta; las impresoras siguen siendo por aparato *y* por cuenta.
3. **Migración.** Si en el aparato hay datos viejos sin cuenta (`makersrest_v1_*`), la **primera** vez que entra alguien se pregunta: «En esta tablet hay datos del Restaurant sin cuenta (N mesas, N platillos, N ventas). ¿Son de **[nombre de la cuenta]**?».
   - Si dice que **sí**: se copian a su prefijo.
   - Si dice que **no**: se quedan donde están, sin borrarse, y se avisa que se pueden bajar como respaldo.
   - **Nunca se borra nada sin preguntar.**
4. **Cerrar sesión y cambiar de POS.** En la barra del Restaurant (junto al usuario) y en Ajustes:
   - **«Cambiar de POS»** → `acceso.html`.
   - **«Cerrar sesión»** → `signOut()` + `acceso.html`.
   - Cerrar sesión **no borra** los datos locales de esa cuenta.
5. **Sin internet:** si ya había sesión guardada, el Restaurant abre igual con los datos locales de esa cuenta, porque Supabase guarda la sesión. Sin sesión y sin internet, avisa que se necesita internet para entrar la primera vez.
6. **La nube del Restaurant** (que los datos del negocio vivan en Supabase y se compartan entre aparatos) **va en `TAREA-MESEROS.md`**. Aquí basta con que el Restaurant sepa **de quién** es cada dato y **quién** está usando la app.

### C. El APK (versión 0.1.2)

1. **Inicio en la puerta:** la URL de inicio pasa a `https://app.nuvoor.mx/acceso.html?app=android`, como decía la tarea original.
   - Si la cuenta tiene un solo POS, `acceso.js` ya manda directo.
   - Si tiene varios, los elige.
2. **Que el WebView guarde la sesión.** Revisa que DOM storage y las cookies sobrevivan al cerrar y abrir la app.
3. `versionCode 3`, `0.1.2`. Compílalo en esta PC (misma llave debug, se instala encima) y cópialo a `public/descargas/` (actualiza `index.html`).
4. **Aviso:** al cambiar el inicio y el prefijo, la tablet de Carlos **pasa por la migración del punto B.3**. No debe perder la configuración de impresoras que ya hizo.

### D. Lo que Carlos tiene que hacer en Supabase (sólo si hace falta)

- **Para que el Restaurant le abra a su cuenta**, la cuenta necesita `restaurant` en `productos` (`sql/18-productos-cuenta.sql`) o `producto = 'restaurant'`. **Revisa en el código** qué falta (`AGENTS.md`, pendiente 10).
- Prepárale **un solo SQL** que se pueda correr dos veces, con la liga directa al SQL Editor y qué debe ver.
- **No pongas su correo en `sql/`.** Va en una copia `CORRER-*.sql`, que está en `.gitignore`.

## 4. Pruebas (antes de avisar)

1. **Navegador servido por http, con un Supabase falso** (o la cuenta real si Carlos te da una de prueba; él escribe la contraseña):
   - Sin sesión: el Restaurant manda a la puerta.
   - Con sesión: abre y usa el prefijo de **su** cuenta.
   - Con otra cuenta en el mismo navegador: **no ve** las mesas ni las ventas de la primera.
   - La migración pregunta y respeta el «no».
   - «Cerrar sesión» regresa a la puerta.
   - El logo «Nuvoor» de la puerta va a `nuvoor.mx`.
   - `MakersOS.html` y `productos/` redirigen.
2. **`acceso.js` con un error simulado de `cuentas`:** se ve el detalle real.
3. **La lista para Carlos** (iPhone + tablet), con casillas en el historial:
   - [ ] En `app.nuvoor.mx/acceso.html` entra con su correo y **abre su cuenta**. Si no, que mande captura del **detalle** nuevo.
   - [ ] El logo «Nuvoor» lleva a `nuvoor.mx`.
   - [ ] «Cerrar sesión» funciona en iPhone.
   - [ ] El APK 0.1.2 pide correo, abre **su** Restaurant y tiene «Cerrar sesión» y «Cambiar de POS».
   - [ ] Las impresoras siguen configuradas después de la migración.
4. **Sube los sellos** (Restaurant y lo que toques) y avisa para `PUBLICAR.bat`.
