# Tarea para Codex: un solo Restaurant (juntar las dos versiones)

Escrito por Claude el 31 oct 2026, 15:10. Va **después de publicar TAREA-CUENTAS** y antes de meseros. Las reglas de `AGENTS.md` mandan y el historial va en `HISTORIAL-CODEX/`.

## 1. Lo que vio Carlos

Desde otra laptop abrió el Restaurant desde el Lab y le salió `app.nuvoor.mx/restaurant.html?v=…`, una versión **vieja**: no tiene «Eventos y punto móvil», ni impresoras nuevas, ni cuentas.

> «Cuando abro mi app de restaurante desde Lab me abrió este, pero no está actualizado.»

No tiene que ver con que su correo sea superadministrador. **El Lab liga a `restaurant.html`**, en `lab.html` → «Abrir un producto».

## 2. El problema real: hay DOS Restaurant que se separaron

| | `public/restaurant.html` (raíz) | `public/restaurante/index.html` |
|---|---|---|
| Quién lo abre | El Lab | La puerta (`acceso.js`), el APK y la PWA |
| Cuentas, sesión y prefijo por cuenta | ✗ | ✓ |
| Impresoras por tablet (Loyverse) | ✗ | ✓ |
| Eventos y punto móvil | ✗ | ✓ |
| **Pedidos por app (Uber Eats / Rappi / DiDi)**, comisión congelada, cobro sin caja, corte y reporte por canal | **✓** | ✗ |
| **Facturación / CFDI en el restaurante** (`grep -c "Factura\|CFDI"`: 43 contra 1) | **✓** | ✗ |
| `localStorage` | `makersrest_v1` | `makersrest_v1_c_<cuenta>`, y migra `makersrest_v1` |

Las dos viven en el mismo dominio y usaban las **mismas llaves** `makersrest_v1_*`. Lo que el Restaurant viejo guardó en un navegador, la migración de cuentas lo encuentra.

La historia de las funciones está en las notas del proyecto: «apps-de-reparto», build 20261017-1833, y «facturación en el restaurante». Ahí vienen las reglas de negocio, como que **la comisión es un costo** y que **el dinero de apps es venta pero no es caja**.

## 3. Lo que hay que hacer

1. **Inventario primero.**
   - Compara las dos páginas por **función**, no por líneas: pestañas y vistas, secciones de Ajustes, funciones JS, campos de datos (`comisionPct`, `canal`, pagos `tipo:"app"`, datos fiscales…).
   - Pon en el historial una tabla con **lo que sólo tiene `restaurant.html`** y **lo que sólo tiene `restaurante/`**.
   - Si algo de la raíz es claramente más viejo que su equivalente en `restaurante/`, se queda la versión de `restaurante/`.
2. **La base es `restaurante/index.html`.** Trae a esa página **todo lo que sólo tenga la raíz**, como mínimo:
   - **Pedidos por app.** Los botones por plataforma arriba del croquis, con su comisión. Además:
     - La comanda numerada del día («Rappi 1, 2…»).
     - `comisionPct` congelado el día del pedido.
     - Un cobro propio sin propina ni efectivo (`tipo:"app"`, `efectivoCaja:0`).
     - `sumaTurno` con `apps`, `comisionApps`, `netoApps` y `propio`.
     - El reporte por canal en Ventas, el tile de utilidad que resta la comisión y la columna Canal en el archivo de tickets.
     - El encabezado del ticket con el nombre de la app.
     - En Ajustes, las plataformas editables (nombre, color, comisión, si se usa) y poder agregar más.
   - **Facturación en el restaurante**, tal como está en la raíz.
   - **Todo lo demás** que salga en el inventario.

   **Reglas al traerlo:**
   - **Que use lo nuevo:** los tickets salen por la **lista de impresoras** (comandas y cuentas, con su ruta), y los datos se guardan con el **prefijo de la cuenta**.
   - **No dupliques funciones:** si ya existe una con el mismo propósito, únelas. **Antes de nombrar** una clase o función, búscala (regla de `AGENTS.md`).
3. **Datos.** Lo que el Restaurant viejo guardó (comandas con `comisionPct`, pagos `app`, plataformas, datos fiscales) debe **leerse bien** después de la migración a la cuenta. Nada se borra.
4. **Un solo camino.**
   - `public/restaurant.html` → redirección a `./restaurante/`. Conserva `?…` y `#…`, pon un enlace visible y **no borres el archivo**.
   - `lab.html` → «Abrir un producto» → Restaurant apunta a `restaurante/`.
   - Revisa que Imprenta y Store apunten bien.
   - Busca en todo `public/` cualquier otra liga a `restaurant.html` y cámbiala.
5. **Detalle de marca.** El Lab todavía dice «Makers Lab · Hey Makers» en la barra. Cámbialo a «Nuvoor Lab» (sólo el texto visible).
6. **Sellos:** `restaurant` y `lab` en `version.json`, más la caché de `restaurante/sw.js`.

## 4. Pruebas (antes de avisar)

Usa Chrome servido por http, con un Supabase falso y un `MakersPrinter` falso, como en las tareas anteriores.

- [ ] **Pedido de Rappi** de $190 al 30% con costo $66.50: comisión **$57**, depósito **$133**, queda **$66.50 (35%)**.
- [ ] **Ese pedido no toca la caja:** el efectivo del turno sigue igual al fondo.
- [ ] El reporte por canal y la columna Canal salen bien.
- [ ] La comanda de un pedido de app sale por la impresora de comandas, con el encabezado «RAPPI», sin ventana.
- [ ] La facturación abre y arma el paquete como en la raíz.
- [ ] Todo lo de antes sigue pasando: impresoras (cola, categorías, corte, reintento), puerta de cuentas, prefijo por cuenta, migración, cerrar sesión y eventos/punto móvil.
- [ ] `restaurant.html` y el botón del Lab llegan a `restaurante/`.
- [ ] Sin errores de consola.

**Enséñale a Carlos capturas** del croquis con los botones de app, del cobro de Rappi y de Ajustes → Plataformas. Las funciones ya las había aprobado; esto es para que vea que regresaron.

## 5. Publicar

Carlos autorizó (31 oct) que **Codex corra `PUBLICAR.bat` SÓLO después de que Claude revise y escriba «aprobado, publica»**. Mientras no llegue esa aprobación, no se publica.
