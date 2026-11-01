# Tarea para Codex: tickets legibles en cocina y nombre en los pedidos para llevar

Escrito por Claude el 1 nov 2026, 9:00 (Morelia). **Va justo después de `TAREA-NUBE-ARREGLO.md`** y antes de la fase 2 (caja en la nube). Las reglas de `AGENTS.md` mandan. **Se publica sólo con «aprobado, publica» de Claude.**

## 1. Lo que pidió Carlos

> «Tenemos que cambiar las tipografías de los tickets: para cocina salen letras muy pequeñas y deben salir con títulos y subtítulos en letras bold.»
>
> «Los pedidos para llevar: antes de levantar un pedido, en vez de agregar comensales por número, agreguemos un nombre, para que también aparezca en el ticket de la cocina y de caja.»

## 2. Tickets de cocina grandes y con negritas

**Cómo está hoy (revísalo):**

- Las comandas se arman como HTML: `imprimeComandaCocina` → `imprimeComandaRutaNube`, y `imprimeCancelacion` usa clases `c xl` y `c g`.
- Con impresora **Bluetooth**, el puente recibe **texto** (`MakersPrinter.printTicket(id, mac, mm, texto, opciones)`). En ese paso se pierden los tamaños y las negritas, y todo sale en la letra chica de la impresora.

**Lo que hay que hacer:**

1. **Lee `app-nuvoor/.../BluetoothPrinterBridge.java`.** Revisa cómo convierte el texto a bytes (charset) y si deja pasar los caracteres de control ESC/POS (`0x1B`, `0x1D`) o los quita.
   - **Si pasan:** arma el formato desde la página con ESC/POS. `ESC E 1/0` para negritas, `GS ! n` para doble alto o doble ancho y `ESC a 1` para centrar.
   - **Si no pasan:** agrega al puente un formato mínimo de marcas (por ejemplo `[B]…[/B]`, `[2X]…[/2X]`, `[C]`) que el Java traduzca a ESC/POS. Eso es un **APK nuevo (0.1.3, `versionCode 4`)**: misma llave debug, se instala encima, se copia a `public/descargas/` y se actualiza su `index.html`. **Avisa antes de hacer el APK.**
   - **Que el APK viejo no rompa nada:** si la página detecta un puente sin las marcas, imprime en texto plano como hoy, nunca con basura en el papel.
2. **Diseño de la comanda de cocina:**
   - **Encabezado, en grande** (doble alto y ancho, negritas, centrado): la mesa («MESA 4»), el nombre del pedido para llevar («LLEVAR · JUAN», ver punto 3) o la app («RAPPI 3»).
   - **Subtítulo en negritas:** folio, hora y mesero.
   - **Cada platillo:** cantidad y nombre **en negritas y doble alto**. El comensal, los modificadores y la nota van debajo, en tamaño normal, con sangría.
   - **Separadores claros** entre comensales o grupos.
   - Las **cancelaciones**: «CANCELAR» en grande y negritas.
   - Que quepa bien en **58 y 80 mm**: la doble anchura parte en la mitad de columnas, así que corta los renglones sin partir palabras.
3. **Ticket de caja (cuenta):** con el mismo criterio, el nombre del negocio, el total y el nombre del pedido para llevar en negritas o grande. Sin cambiar los montos ni el orden de la información fiscal.
4. **«Otra impresora (pide confirmar)»** (impresión HTML del sistema): sube el tamaño de la letra base y las negritas en el CSS del ticket, para que también se lea bien.
5. **Corte automático:** se conserva como está (la GL de cocina corta; la de caja no).

**Maqueta primero (regla 9):** arma en `tmp/` una vista previa de cómo saldría en papel de 58 y 80 mm. Basta un render del texto con su formato: una comanda de mesa, una para llevar con nombre, una de Rappi y una cancelación. Claude se la enseña a Carlos antes de publicar.

## 3. Nombre en los pedidos para llevar

**Cómo está hoy:** «Venta para llevar» (`#mesaRapida`, y el bloque «para llevar: cada pedido es su propio ticket») abre el pedido y pide **comensales por número**.

**Lo que hay que hacer:**

1. **Al tocar «Venta para llevar»** (o «Nueva venta / Pedido para llevar» en Inicio), antes de capturar, sale un campo **«¿A nombre de quién?»** con el teclado listo.
   - **Obligatorio**, sin permitir que quede vacío. Si no se escribe nada, el sistema sugiere «Cliente N», con el número del día.
   - Ya **no** se pregunta el número de comensales.
2. **El nombre se guarda en la comanda** (por ejemplo `c.cliente`) y sale en:
   - La lista de pedidos para llevar y donde hoy se ve «Para llevar», como «Para llevar · Juan».
   - **El ticket de cocina:** encabezado grande «LLEVAR · JUAN».
   - **El ticket de caja / la cuenta** y el archivo de tickets o Ventas.
   - **El celular del mesero y los demás aparatos.** Va en `rest_comandas`, así que se sincroniza con la nube.
3. **Que se pueda editar** el nombre mientras el pedido esté abierto.
4. **Mesas y apps de reparto no cambian.** Las mesas siguen con comensales por número, y Rappi, Uber y DiDi con su número del día. **Opcional, pregúntalo:** el nombre del cliente en pedidos por app.

## 4. Pruebas

Chrome headless con `MakersPrinter` falso, que guarde los bytes o el texto exactos.

- [ ] Una comanda de mesa lleva el encabezado en doble tamaño y negritas y los platillos en negritas. Revisa los bytes ESC/POS o las marcas.
- [ ] «Venta para llevar» pide el nombre. Con «Juan» → la comanda dice «LLEVAR · JUAN» en grande, y la cuenta y Ventas dicen «Juan».
- [ ] Sin nombre: no deja seguir o propone «Cliente N».
- [ ] 58 mm y 80 mm sin renglones partidos a la mitad de una palabra.
- [ ] Con el puente viejo, sin marcas: imprime en texto plano y sin basura.
- [ ] El nombre se sincroniza a otro aparato (nube de la fase 1).
- [ ] Lo de antes sigue pasando: impresión una sola vez, categorías, corte, reintento, mesero y apps.
- [ ] Sin errores de consola.

## 5. Publicar

Sólo con «aprobado, publica» de Claude, **después de que Carlos vea la maqueta de los tickets**. Si hace falta APK 0.1.3, Carlos lo instala encima del 0.1.2 desde `app.nuvoor.mx/descargas`.
