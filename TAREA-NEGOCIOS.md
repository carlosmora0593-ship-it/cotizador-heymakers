# Tarea para Codex: varios negocios con el mismo correo (Imprenta, Restaurant y Store)

Escrito por Claude el 31 oct 2026, 18:40. **Va antes que todo lo pendiente** (app, meseros, modo oscuro). Las reglas de `AGENTS.md` mandan y el historial va en `HISTORIAL-CODEX/`. **Se publica sólo con «aprobado, publica» de Claude.**

## 1. Lo que pidió Carlos

> «Inicié sesión en Nuvoor y sólo me abre Taller. Al parecer sólo tengo cuenta ahí. Intégrame una cuenta para Restaurant y Store con mi mismo correo.»
>
> «En mi caso, con mi correo tendré 3 POS: que al iniciar sesión pueda escoger con cuál voy a trabajar.»

Su correo tiene una sola cuenta, de Imprenta. La quiere conservar y sumar **un Restaurant y un Store aparte**, entrando con el mismo correo. Es lo mismo que pidió antes: «la app es multiusuario y **todos son independientes**». Y es la base de Multiempresa (sucursales) de `TAREA-PRECIOS.md`.

**No se hace con el arreglo `productos`** (`sql/18`, varios POS en una cuenta):

- Store guarda en `documentos` las colecciones `ventas`, `caja` e `inventario`, y la Imprenta usa esas mismas colecciones. En la misma cuenta, **las ventas del Store se mezclarían con la caja de Imprenta**.
- Además, rompe la regla de un sistema por cuenta.

Cada negocio es **una cuenta propia** ligada a su correo por `membresias`.

## 2. Lo que encontró Claude (léelo antes de tocar nada)

1. **`mi_cuenta()` es por persona, no por aparato.** Sale de `perfiles.cuenta_activa`.
   - Si el Store de la tablet llamara `cambiar_empresa()`, la Imprenta abierta en la PC quedaría parada en la cuenta del Store.
   - Sus lecturas filtran `.eq("cuenta_id", CUENTA.id)`, así que no se mezclaría nada, pero la RLS `cuenta_id = mi_cuenta()` la dejaría **sin ver ni guardar**. Se pierde una cotización.
   - **Por eso los POS no deben cambiar la cuenta activa para abrir otro negocio.**
2. **Las lecturas ya llevan la cuenta explícita.** Imprenta (`cuenta.js`, el puente de `documentos`) y Store (`connected.id`) filtran y escriben con `cuenta_id` explícito. Por eso la RLS puede pasar de «la cuenta activa» a **«cualquier cuenta de la que soy miembro, con mi rol en ESA cuenta»** sin mezclar datos.
   - **Revisa cada consulta** a `documentos`, `cuentas` y `perfiles` en `cuenta.js`, `acceso.js`, `lab.js`, `tiendita/index.html` y `restaurante/index.html`.
   - Toda la que dependa sólo de la RLS (sin `.eq("cuenta_id")` o `.eq("id")`) debe filtrar explícito antes del cambio. Claude vio dos en `lab.js` (líneas ~416 y ~448); revísalas.
3. **`limite_del_plan()`** (versión vigente en `sql/10-sin-plan.sql`) aplica la escalera de Imprenta a **todas** las cuentas.
   - Un Store en `basico` (Estándar) **no puede guardar** `ventas`, `caja` ni `inventario` (`FUNCION_PRO` / `FUNCION_MAKER`).
   - Restaurant y Store tienen todas sus funciones en cualquier plan vigente. **La escalera sólo aplica a cuentas de Imprenta.**
4. **`mis_empresas`** no trae `producto` ni `productos`, así que nadie puede saber de qué sistema es cada negocio sin cambiar la cuenta activa.
5. **Las políticas por rol** (`sql/02-roles.sql`) usan `mi_rol()`, que es el rol en la cuenta activa: `documentos_leer`, `documentos_crear`, `documentos_actualizar`, `documentos_borrar`, el disparador de campos por rol de las líneas ~90-130 y `perfiles_*`. Con la RLS nueva, el rol debe ser **el de la cuenta del renglón**.

## 3. Lo que hay que hacer

### A. SQL nuevo: `sql/19-negocios-por-correo.sql`

Debe poder correrse dos veces, no llevar correos y ponerse también donde lo lea el Lab («Base de datos», `build_lab.py`).

1. **Funciones:**
   - `public.rol_en(cuenta uuid) returns text`: el rol de `auth.uid()` en esa cuenta según `membresias`, o `null`. Con `security definer`, `stable` y `search_path = public`.
   - `public.es_miembro(cuenta uuid) returns boolean`: `rol_en(cuenta) is not null`.
2. **`documentos`:** rehaz las cuatro políticas de `02-roles.sql` cambiando `cuenta_id = mi_cuenta()` por `rol_en(cuenta_id) is not null` y `mi_rol()` por `rol_en(cuenta_id)`.
   - Las mismas reglas por colección, sin abrir más.
   - El `with check` también.
   - Ajusta igual el disparador por rol.
3. **`cuentas`:** `cuentas_ver` y `cuentas_editar` con `es_miembro(id)`, el mismo significado de hoy pero para cualquier negocio propio. `protege_suscripcion` sigue igual.
4. **`perfiles` y storage `disenos`:** déjalos como están, con la cuenta activa. Son de Imprenta y no estorban. Anótalo.
5. **`mis_empresas`:** agrégale `producto` y `productos` **al final** (`create or replace view` sólo permite columnas nuevas al final). Sigue con `security_invoker`.
6. **`crear_negocio(nombre text, producto text) returns uuid`:**
   - Pide sesión y que `producto` sea `taller`, `restaurant` o `tiendita`.
   - Crea la cuenta con `producto` y `productos = array[producto]`. Plan, estado y vence se quedan con lo predeterminado (prueba de 15 días).
   - Agrega la membresía `admin`.
   - **No cambia `cuenta_activa`.**
   - `grant execute ... to authenticated`. Sin límite por ahora; anótalo para Multiempresa.
7. **`limite_del_plan()`:** la escalera (topes, `FUNCION_PRO`, `FUNCION_MAKER`) sólo si la cuenta es de Imprenta (`producto = 'taller'`).
   - Restaurant y Store pasan con cualquier plan vigente.
   - Se conservan `soporte` primero, `SIN_PLAN` y `SUSCRIPCION_VENCIDA`.
8. **`nuvoor_negocios_disponible() returns boolean`**, para que el código sepa si ya se corrió (como `makers_productos_multiples_disponible`).
9. **Al final, una comprobación que se lea en el editor:**
   - Que las funciones existan.
   - Que `mis_empresas` tenga `producto`.
   - Que las políticas nuevas estén puestas.

**Sin Supabase real:** revisa el SQL a mano, línea por línea, contra `01`, `02`, `06`, `10`, `17` y `18`. Si en esta PC hay Postgres o Docker, pruébalo ahí; si no, dilo en el historial.

### B. La puerta (`acceso.js` / `acceso.html`)

1. **Lee `mis_empresas`** después de entrar.
   - Si hay **un solo negocio con un solo sistema**, se abre directo, como hoy.
   - Si hay más, sale **«Tus negocios»**: una tarjeta por negocio con su nombre, su sistema (con el color e ícono de cada producto) y **«Abrir»**.
2. **Abrir:**
   - **Restaurant y Store:** van a su POS con `?cuenta=<id>`.
   - **Imprenta:** `cambiar_empresa(id)` y luego `taller.html`, porque Imprenta sí trabaja con la cuenta activa.
3. **«+ Agregar un negocio»:**
   - Elige el sistema (Imprenta, Restaurant o Store) y escribe el nombre.
   - Llama `crear_negocio` y refresca la lista.
   - Si `nuvoor_negocios_disponible` no existe, enseña que falta correr `sql/19` en Supabase.
4. **«Ver licencias»** es por negocio. Usa el panel de `TAREA-PRECIOS` con el sistema de ese negocio.
5. **Cuentas viejas** con varios sistemas en `productos` siguen entrando como hoy.

### C. Restaurant (`public/restaurante/index.html`)

1. **`restaurantResolveAccount` decide la cuenta así:**
   1. El `?cuenta=` de la liga.
   2. La última que se usó en **este aparato** (`localStorage`, por usuario).
   3. La activa, si tiene Restaurant.
   4. El único negocio de Restaurant en `mis_empresas`.
   5. Si hay varios, manda a `acceso.html?producto=restaurant` con la lista filtrada.
   - Siempre comprueba la membresía con `mis_empresas` y **no llama `cambiar_empresa`**.
2. **El prefijo de datos** sigue siendo `makersrest_v1_c_<cuentaId>`. La migración de datos sin cuenta pregunta igual que hoy.
   - **La tablet de Carlos tiene sus datos viejos** (mesas, platillos, impresoras), que todavía no se migraron. Al abrir su Restaurant nuevo debe salir la pregunta, y con «sí» copiarse.
3. **Si no hay ningún Restaurant**, el aviso «Esta cuenta no tiene Restaurant» ofrece **«Agregar un Restaurant»**, que lleva a la puerta.

### D. Store (`public/tiendita/index.html`)

Lo mismo que el Restaurant: `?cuenta=`, la última del aparato, la activa si tiene Store, el único negocio de Store o la lista. Sin `cambiar_empresa`.

- **Las lecturas y escrituras usan esa cuenta** (`connected.id`). Ya lo hacen; revísalo.
- **Sin `sql/19`**, una cuenta que no es la activa no podrá guardar. Detéctalo con `nuvoor_negocios_disponible` y avisa claro, sin perder ventas: se quedan en el aparato como hoy.

### E. Imprenta (`public/cuenta.js`)

- **El selector de empresas** de arriba lista **sólo los negocios de Imprenta** y agrega una liga «Tus otros negocios → acceso.html».
- **Si la cuenta activa no es de Imprenta**, Imprenta toma el primer negocio de Imprenta de `mis_empresas` (con `cambiar_empresa`). Si no hay ninguno, manda a la puerta.

### F. Sellos

Sube los sellos de lo que toques (`version.json`, `?v=` de `acceso.js`, `restaurante/sw.js`, `tiendita/sw.js`, Lab si cambia). **No hace falta APK nuevo:** el 0.1.2 arranca en `acceso.html`.

## 4. Pruebas

Chrome headless, servido por http, con un Supabase falso que entienda `mis_empresas`, `crear_negocio`, `cambiar_empresa`, `mi_cuenta` y `nuvoor_negocios_disponible`. Sin Computer Use.

- [ ] Un usuario con **Imprenta, Restaurant y Store**:
  - La puerta enseña «Tus negocios» con los tres.
  - Cada «Abrir» llega al POS correcto con su cuenta.
  - **`cambiar_empresa` sólo se llama al abrir Imprenta.**
- [ ] **«Agregar un negocio» → Restaurant «Mi restaurante»:** llama `crear_negocio('Mi restaurante','restaurant')` y aparece en la lista.
- [ ] **El Restaurant con `?cuenta=R`:**
  - Usa `makersrest_v1_c_R`.
  - Con datos viejos sin cuenta, hace la pregunta de migración y con «sí» los copia, **impresoras incluidas**.
- [ ] **El Store con `?cuenta=S`:**
  - Toda escritura a `documentos` lleva `cuenta_id = S`.
  - No se llama `cambiar_empresa`.
- [ ] **Imprenta:** el selector sólo enseña negocios de Imprenta.
- [ ] **Un usuario con un solo negocio** entra directo, igual que antes.
- [ ] **Cuenta vieja con `productos` = Restaurant + Store:** sigue entrando a los dos.
- [ ] **Sin `sql/19`** (la función de comprobación no existe): avisos claros y nada se rompe.
- [ ] Sin errores de consola.

## 5. Lo que hará Carlos (escríbelo en el historial, en pasos de celular)

1. Lab → **Base de datos** → copiar `19-negocios-por-correo.sql` → **Abrir el editor SQL** → pegar → **Run**. Qué debe ver al final.
2. `app.nuvoor.mx` → entrar → **«+ Agregar un negocio»** → Restaurant, con su nombre. Luego lo mismo con Store.
3. En la tablet, abrir la app → **«Tus negocios»** → su Restaurant → contestar **«sí»** a la pregunta de sus datos.
4. **Los negocios nuevos nacen en prueba de 15 días.** Como dueño, les pone el plan desde el Lab cuando quiera.

## 6. Publicar

Sólo con «aprobado, publica» de Claude. **El SQL se publica antes que nada**, pero el código debe funcionar aunque Carlos todavía no lo corra (punto D y avisos de B.3).
