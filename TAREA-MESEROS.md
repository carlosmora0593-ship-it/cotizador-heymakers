# Tarea para Codex: meseros que mandan a cocina desde su celular

Escrito por Claude el 31 oct 2026 por pedido de Carlos. Va **después** de tener el APK de prueba (ver `TAREA-APP-NUVOOR.md`, sección 0). Las reglas de `AGENTS.md` mandan sobre todo, y el historial va en `HISTORIAL-CODEX/`.

## 1. Lo que pidió Carlos (sus palabras)

> «Es importante que en la app de Restaurant, APK para tablet y teléfono, los meseros puedan mandar pedidos a cocina desde su celular sin tener que ir a la caja a enviar pedido.»
>
> «En mis tablets tengo ya vinculadas las impresoras y que salgan ticket de cada comanda.»
>
> «No pienso pagar por ahora en fase de pruebas.»

## 2. Por qué hoy no se puede (y qué hay que construir)

- **El Restaurant guarda todo en el `localStorage` de cada aparato** (`LS_BASE = "makersrest_v1"`). Dos aparatos no se ven: lo que un mesero capture en su celular nunca llega a la caja. No hay Supabase en `restaurante/index.html` (cero llamadas).
- **Lo que hay que construir** es un buzón en la nube. El celular del mesero deja ahí el pedido y la tablet principal lo recoge, lo mete a la mesa y lo imprime.
- **La tablet sigue mandando** y sigue funcionando sin internet, como hoy. Así no hay choques entre dos aparatos editando la misma mesa: sólo la tablet escribe la verdad y los celulares sólo agregan.

## 3. Antes de programar

1. **Pregúntale a Carlos cómo tiene acomodado su restaurante de prueba:**
   - cuántas tablets;
   - en cuál está la impresora de cocina y en cuál la de caja (marca o modelo, 58 u 80 mm);
   - cuántos meseros;
   - si los meseros usan su propio teléfono Android o iPhone.

   Anótalo en el historial.
2. **La fuente del Restaurant es `public/restaurante/index.html`.**
   - **No uses `PRUEBA-restaurant.html` ni `PREPARAR-APP-RESTAURANTE.bat`/`preparar-app-restaurante.ps1`.** Ese archivo está viejo (dice «Makers Restaurant») y el script regenera `restaurante/index.html` desde él: borraría los cambios de nombre y todo lo nuevo.
   - `public/restaurant.html` es una versión anterior: no la toques.
3. **Lee el modelo de datos del Restaurant** y anota en el historial dónde vive cada cosa:
   - `EQUIPO`, con roles `gerente` / `cajero` / `mesero` / `cocina` y `pin`.
   - Las mesas, las comandas y sus `lineas` (`enviada`, `estado`, `cancelada`).
   - La carta, con categorías, platillos y modificadores.
   - `ESTACION`, con `donde`, `cocina`, `impresoraBt`, `anchoPapelBt` y `modoImpresion`.
   - El botón **`#comEnviar`** («Mandar a cocina»): marca las líneas como enviadas, hace `persist()` y, si `ESTACION.cocina`, llama a `imprimeComandaCocina(c, nuevas)`.
4. **Lee cómo se guardan las cosas en la nube en Imprenta y Store.**
   - Tabla `documentos (cuenta_id, coleccion, doc_id, cuerpo jsonb)`, con RLS colgada de `mi_cuenta()` y `mi_rol()`. Ver `sql/01-esquema.sql`, `sql/06-superadmin.sql` y cómo lo usa `cuenta.js`.
   - **Usa ese mismo patrón.** No inventes tablas nuevas si `documentos` alcanza.

## 4. Maqueta primero (regla 9 de `AGENTS.md`)

Antes de programar en serio, haz una **vista previa** (HTML suelto en `tmp/`, servido con `python -m http.server`) de las pantallas nuevas y enséñasela a Carlos con captura:

- **Celular del mesero:**
  1. Elige su nombre y teclea su clave.
  2. Ve las mesas (libre / ocupada / suya).
  3. Abre una mesa, agrega platillos con comensal y modificadores (igual que en la tablet), y toca **«Mandar a cocina»**.
  4. Ve el estado: «Enviando…» → «Recibido en caja ✓» → «Impreso en cocina ✓».
- **Tablet principal:** un aviso «Pedido de Lety · Mesa 4 · 3 platillos» que aparece solo, y un indicador «Meseros conectados: 2».
- **Ajustes de la tablet:**
  - «Esta tablet es la **principal** (recibe los pedidos de los meseros)».
  - «Esta tablet **imprime comandas de cocina**».

Sigue sólo con su OK.

## 5. Cómo debe funcionar

### 5.1 Quién es quién

- **Tablet principal** (sólo una por restaurante; se marca en Ajustes): tiene la verdad, igual que hoy. Recoge los pedidos de los meseros, los mete a la comanda de la mesa como si se hubieran capturado ahí y publica el estado del salón.
- **Tablet de cocina** (opcional, si la impresora de cocina está en otra tablet): sólo imprime las comandas que le tocan.
- **Celular del mesero:** **no necesita el APK**. Funciona en Chrome o Safari en `https://app.nuvoor.mx/restaurante/?mesero=1`, porque no imprime. El APK sólo hace falta en las tablets con impresora Bluetooth.

### 5.2 La nube (colecciones en `documentos`)

| Colección | La escribe | La lee | Qué trae |
|---|---|---|---|
| `rest_salon` (un solo doc) | Tablet principal, al cambiar algo y cada 10 s como máximo | Celulares | La carta (sin fotos en base64), los modificadores, las mesas y su estado (libre u ocupada, mesero, lo ya pedido sin precios si el rol es mesero), y el equipo **sólo con id, nombre, rol y el hash de la clave** |
| `rest_pedidos` (un doc por pedido) | Celular del mesero | Tablets principal y de cocina | `{id, mesa, mesero, lineas[{platillo, cantidad, comensal, modificadores, nota}], creado, estado:"nuevo", recibido:null, impreso:null, folio:null}` |

**Reglas que no se rompen:**

1. **Nunca suben a la nube** el expediente del personal (CURP, RFC, NSS, dirección, teléfono, contacto), ni las claves en claro, ni el dinero de la caja.
   - La clave va como `sha256(salt + pin)`, con un `salt` aleatorio por cuenta guardado en `rest_salon`.
   - Escribe en el historial que una clave de 4 dígitos con hash se puede adivinar por fuerza bruta. Es una barrera para que un mesero no se haga pasar por otro, no una caja fuerte.
2. **El `id` del pedido lo genera el celular** antes de mandarlo. Si se reintenta, no se duplica.
3. **Recoger un pedido es atómico.** La tablet principal lo cambia de `estado:"nuevo"` a `"recibido"` con un `update` condicionado (`…eq('cuerpo->>estado','nuevo')` y `select()`). Si no le regresa la fila, otra ya lo tomó y no hace nada.
4. **Imprimir es atómico** igual, con `impreso`: **cada comanda sale una sola vez**, aunque haya dos tablets prendidas.
5. **Un pedido recibido se procesa como el `#comEnviar` de la tablet:**
   - Agrega las líneas a la comanda de la mesa (o la abre).
   - Las marca como enviadas, con hora y quién.
   - Hace `persist()`.
   - Si esta tablet tiene `ESTACION.cocina`, llama a `imprimeComandaCocina(c, nuevas)`.

   **Reusa esas funciones**; no copies la lógica.
6. **El mesero no cancela lo que ya está en cocina.** Eso sigue pidiendo gerente o cajero en la tablet, igual que hoy.
7. **Cómo se entera la tablet:** escucha con Supabase Realtime y, **además**, revisa cada 5 s, por si Realtime no está prendido o se cae.
   - Si para Realtime hay que agregar la tabla a la publicación, va en el SQL (sección 6).
8. **Sin internet:**
   - **En el celular**, el pedido se queda en una cola local con aviso «Sin conexión: se manda solo cuando vuelva, o llévalo a la caja». Se reintenta solo.
   - **La tablet** sigue trabajando como hoy y recoge lo pendiente cuando vuelve la red.

### 5.3 Cuentas

- **Las tablets y los celulares necesitan sesión de la cuenta de Supabase** para leer y escribir `documentos`. Hoy `restaurante/index.html` no carga `config.js` ni `supabase-js`. Agrégalos sin romper el modo sin sesión: **sin sesión, el Restaurant funciona igual que hoy**, sólo que sin meseros.
- **Para la prueba**, Carlos entra con su correo en cada aparato desde `acceso.html`. Él teclea su contraseña; tú no la ves ni la pides.
- **Más adelante**, cada mesero con su usuario. Hay una función `invitar-usuario` en `supabase/functions/`; revisa si sirve con las altas cerradas. **No lo hagas sin preguntar.**
- **Los datos van en la cuenta activa (`mi_cuenta()`).** Revisa con Carlos en qué cuenta los quiere y anótalo.

## 6. El SQL

- Escribe `sql/19-restaurant-meseros.sql`.
  - Abre `rest_salon` y `rest_pedidos` en las reglas de `documentos` para cualquier miembro de la cuenta.
  - Siguiendo el patrón de `13-asistencia`: cualquiera crea y lee; sólo actualiza el estado quien es de la cuenta; nadie borra salvo admin.
  - Si hace falta, `alter publication supabase_realtime add table public.documentos;`.
  - Que se pueda correr dos veces sin error.
- **Carlos lo corre** en Supabase → SQL Editor. Dale la liga directa y dile qué debe ver.
- **Prueba la seguridad** en una corrida aparte, con `set local role authenticated` y el `request.jwt.claims` de un usuario de otra cuenta: **no debe ver** los pedidos ajenos. El editor corre como `postgres` y lo ve todo, así que «ahí sí sale» no prueba nada.

## 7. Pruebas

1. **Automáticas** con Playwright o el navegador, servido por http. Dos pestañas (tablet + mesero) contra un Supabase falso en memoria o contra el real con una cuenta de prueba que Carlos te dé. Comprueba:
   - un pedido del mesero aparece en la mesa;
   - con dos tablets prendidas sale **una** comanda, no dos;
   - el reintento sin red no duplica;
   - la versión de mesero no ve dinero ni el expediente.
2. **En el restaurante** (Carlos), con casillas en el historial:
   - [ ] La tablet principal con APK y su impresora: «Imprimir prueba» sale.
   - [ ] Desde el celular de un mesero (en Chrome, sin APK) se levanta la Mesa 4 con 3 platillos → **sale la comanda en cocina** en menos de 10 segundos.
   - [ ] La comanda trae mesa, folio, comensal, modificadores y nombre del mesero, sin precios.
   - [ ] Dos meseros mandan al mismo tiempo a mesas distintas → salen las dos y no se mezclan.
   - [ ] Dos meseros en la **misma** mesa → todo llega y nada se repite.
   - [ ] Si se apaga el wifi del celular, el pedido espera y sale solo al volver.
   - [ ] La tablet sigue cobrando con el internet caído.
   - [ ] En la tablet, la cuenta de la mesa trae lo que mandaron los meseros, con su nombre.

## 8. Lo que NO entra ahora

- Cobrar desde el celular del mesero.
- Dividir la cuenta desde el celular.
- La app de iPhone en la tienda.
- Play Store.
- Que el mesero cancele.

Si Carlos lo pide, se anota como siguiente y se le pregunta.
