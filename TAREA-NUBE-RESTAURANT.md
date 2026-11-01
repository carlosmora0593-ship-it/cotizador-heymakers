# Tarea para Codex: el Restaurant en la nube, en tiempo real (y meseros desde el celular)

Escrito por Claude el 31 oct 2026, 20:10. **Va antes que todo lo pendiente** y **reemplaza la idea de «buzón» de `TAREA-MESEROS.md`**: los meseros quedan resueltos en la fase 1 de esta tarea. Las reglas de `AGENTS.md` mandan y el historial va en `HISTORIAL-CODEX/`. **Se publica sólo con «aprobado, publica» de Claude.**

## 1. Lo que dijo Carlos

> «Tenemos un problema grande: inicié sesión en 3 dispositivos diferentes, celular, laptop y tablet. El error más grande es que no se sincroniza ninguna de ellas en tiempo real. Y así no podemos ejecutar la idea de que los meseros usen su teléfono para enviar pedidos a cocina.»

Se le preguntó cómo construirlo y eligió **«Todo en la nube»**: como Loyverse, tablet, celular y laptop ven y editan lo mismo en tiempo real, y sin internet se sigue cobrando y todo se pone al día al volver. Notó el problema en el **Restaurant**.

## 2. Cómo está hoy (lo revisó Claude)

- **`public/restaurante/index.html` guarda todo en el `localStorage` de cada aparato**, con el prefijo `makersrest_v1_c_<cuentaId>`. Sólo usa Supabase para la sesión y para resolver la cuenta (no llama `from("documentos")`, ni canales, ni `postgres_changes`). Por eso cada aparato tiene su propio restaurante.
- **Imprenta (`cuenta.js`) sí tiene tiempo real:** dos canales con `postgres_changes` sobre `documentos` filtrados por `cuenta_id`. **Úsalo de modelo.**
- **Store** sube ventas, inventario y caja a `documentos` con `cuenta_id` explícito, pero sin tiempo real.
- **La RLS por membresía** (`sql/19-negocios-por-correo.sql`, publicado en `41f410d`) es la base: el Restaurant trabaja con `?cuenta=<id>` sin cambiar la cuenta activa. **Carlos todavía tiene que correr el SQL 19.** Todo lo de esta tarea debe detectar si falta (`nuvoor_negocios_disponible`) y, si falta, seguir funcionando local como hoy.

## 3. Lo que hay que construir

### 3.1 Inventario primero

En el historial, una tabla con **cada llave de `localStorage` del Restaurant** que diga qué guarda, quién la cambia y cuál de estas opciones le toca:

- **Nube compartida:** todos los aparatos ven lo mismo.
- **Sólo este aparato:** impresoras (`IMPRESORAS`, `ESTACION`), la última cuenta, preferencias de pantalla y la cola de salida.
- **Fase 2 o 3** (ver 3.8).

### 3.2 Dónde vive cada cosa en la nube

Todo va en `documentos (cuenta_id, coleccion, doc_id, cuerpo)`, con colecciones `rest_*` y `cuenta_id` explícito en cada lectura y escritura. **Nada de tablas nuevas.** Regla de tamaño: **un documento por cosa que dos aparatos puedan cambiar al mismo tiempo.**

| Colección | Un documento por | Notas |
|---|---|---|
| `rest_config` | uno solo (`general`) | Nombre, propina, impuestos, plataformas de reparto (nombre, color, comisión, si se usa) y datos fiscales del emisor. |
| `rest_carta` | categoría y platillo | Con modificadores. **Sin fotos en base64**: las fotos se quedan locales en la fase 1 (anótalo). |
| `rest_mesas` | mesa | Croquis: nombre, zona y posición. |
| `rest_comandas` | comanda (cuenta abierta) | Encabezado: mesa o canal (salón, Rappi, Uber, DiDi…), comensales, mesero, estado `abierta`/`cobrada`/`cancelada`, abrió y cerró. **Sin la lista de líneas adentro.** |
| `rest_lineas` | **línea** de comanda | `{comanda, platillo, cantidad, comensal, modificadores, nota, precio, categoria, mesero, enviada, estado, cancelada, impreso{<ruta>: {por, en}}}`. Como cada línea es su propio documento, dos meseros en la misma mesa nunca se pisan. |
| `rest_tickets` | ticket cobrado | **No se edita** después de cobrado. Pagos, propina, canal, `comisionPct` congelado y folio. |
| `rest_equipo` | persona | Sólo id, nombre, rol y `pin_hash = sha256(salt + pin)`, con el `salt` en `rest_config`. **El expediente (CURP, RFC, NSS, dirección, teléfono, contacto) NO sube en esta fase.** |
| `rest_eventos` | evento o punto móvil | Si lo que ya existe lo amerita. |

**Los `doc_id` los genera el aparato** (`crypto.randomUUID()`), así que un reintento nunca duplica.

### 3.3 El motor de sincronización

1. **Primero local, siempre.** La pantalla lee y escribe en la caché local, igual que hoy, así que **sin internet se sigue trabajando** sin esperar a la red.
2. **Cola de salida** (en `localStorage`, por cuenta). Cada cambio se guarda en la caché y entra a la cola como un `upsert` con `onConflict: "cuenta_id,coleccion,doc_id"`.
   - Se manda en cuanto hay red, en orden, con reintentos.
   - Si el servidor rechaza un cambio, se avisa con el motivo y **no se pierde**.
3. **Entrada:**
   - Al abrir, se baja todo `rest_*` de la cuenta.
   - Luego, Realtime: `channel` + `postgres_changes` sobre `documentos` con `filter: cuenta_id=eq.<id>`.
   - **Además**, cada 10 s se piden los cambios con `actualizado > último visto`, por si Realtime está apagado o se cayó. La base pone `actualizado` en `limite_del_plan`.
4. **Choques:** el último que escribe gana, **por documento**. Las líneas y los tickets no chocan por diseño. Lo que llega de la nube no pisa un cambio local que todavía esté en la cola.
5. **Pantalla:** un indicador chico y siempre visible:
   - «En línea»
   - «Sin conexión · N cambios por subir»
   - «Sincronizando…»

   Lo que llega de otro aparato se pinta solo, sin recargar.

### 3.4 Imprimir una sola vez (lo más importante para Carlos)

- **Imprime cualquier aparato que tenga una impresora con «Comandas».** Normalmente es la tablet con el APK.
  - Cuando llegan líneas `enviada` sin `impreso[<ruta>]`, el aparato **reclama** las de sus categorías y luego las imprime con la cola actual (`encolaTrabajoImpresoraPOS`, `imprimeComandaCocina`, el corte, el reintento…).
  - **Reusa esas funciones.**
- **Reclamar es atómico en la base**, con una función SQL (sección 4) que marca `impreso.<ruta>` **sólo si estaba vacío** y regresa lo que sí le tocó. Así, **con dos tablets prendidas, cada comanda sale una sola vez por destino.**
- **La ruta** es la de su impresora: cocina, barra, taqueros…
- Si la impresión falla después de reclamar, sale el aviso con «Reintentar», como hoy. **Anota cómo se libera el reclamo** para que otra tablet pueda imprimirla.
- **Las cancelaciones** siguen la misma idea, con su ruta de cancelación.

### 3.5 Meseros desde el celular (fase 1)

- **Entrada:** `app.nuvoor.mx` → «Tus negocios» → Restaurant, en Chrome o Safari. **Sin APK.** Por ahora el mesero entra con la sesión del dueño (Carlos teclea su correo y contraseña) y luego **escoge su nombre y teclea su PIN**.
- **Modo mesero:**
  - Croquis de mesas (libre / ocupada / suya).
  - Abre una mesa y agrega platillos con comensal y modificadores.
  - **«Mandar a cocina»**, con estado «Enviado» → «Impreso en cocina ✓» (cuando la tablet reclama e imprime).
- **No ve** caja, cortes, reportes, ventas, ni Ajustes de dinero o personal. No cancela lo enviado; eso pide gerente o cajero, como hoy.
- **Escribe en el historial**, para que Carlos lo sepa: con la sesión del dueño, el celular del mesero **técnicamente puede leer** todo lo de la cuenta. El modo mesero lo esconde, pero no es una barra de seguridad. Usuarios propios por mesero, con su rol en la base, quedan para la **fase 3**.

### 3.6 Folios únicos entre aparatos

Los números de comanda del día («Rappi 1, 2…») y los folios de ticket **no deben repetirse** entre aparatos.

- **Con red:** se toman de un contador atómico en la base (función SQL, sección 4).
- **Sin red:** un folio provisional con la letra del aparato (por ejemplo `T-0042`) y su número final al sincronizar.

Anota el formato.

### 3.7 Lo que ya tiene cada aparato (migración)

- **La primera vez que un aparato se conecta a la nube de la cuenta:**
  - **Si la nube está vacía y el aparato tiene datos:** «¿Subir los datos de esta tablet a la nube de **[negocio]**? (N mesas, N platillos, N comandas abiertas, N tickets)». Con «sí», se suben.
  - **Si la nube ya tiene datos y el aparato también**, sin coincidir: **no se mezcla solo**. Se avisa que este aparato tiene datos que no están en la nube y se ofrece «Bajar respaldo» y «Usar los de la nube». **Nunca se borra nada sin preguntar.**
- **Las impresoras no suben:** son de cada aparato.

### 3.8 Fases

1. **Fase 1 (ésta, urgente):** config, carta, mesas, comandas, líneas, tickets cobrados, equipo sin expediente, impresión una sola vez, folios, cola de salida, Realtime + sondeo, indicador, modo mesero y migración.
2. **Fase 2:** turnos, caja, movimientos y cortes; reportes y apps de reparto con su corte por canal; y la facturación del restaurante, todo en la nube. Si algo de esto es fácil de meter en la fase 1 sin riesgo, dilo antes de hacerlo.
3. **Fase 3:** usuarios propios por mesero con su rol en la base, el expediente del personal y las fotos de la carta en Storage.
4. **Fase 4, «modo local» en el APK** (Carlos, 31 oct, 20:30: «sí, porfa»). Cubre el caso de que se caiga el internet del local con el WiFi todavía prendido.
   - La tablet con el APK funciona como servidor dentro del WiFi del restaurante y los celulares de los meseros le mandan los pedidos directo, sin pasar por la nube.
   - Al volver internet, todo se sube como cualquier cambio de la cola.
   - Es trabajo nativo en `app-nuvoor/`: servidor local, descubrir la tablet, seguridad con PIN dentro de la red y qué pasa con dos tablets.
   - **Mientras no exista:** sin internet, los pedidos del celular esperan en su cola y el mesero captura en la tablet. Para el día a día, Claude le sugirió a Carlos internet de respaldo (datos móviles o hotspot para la tablet y datos en los celulares).
5. **Versión de celular más simple** (Carlos, 31 oct, 20:30: «tenemos que adaptar una versión más simple de usar para celulares, también queda pendiente»).
   - Pantallas pensadas para el teléfono: botones grandes, pocos pasos, una mano.
   - Para el mesero y para usar el Restaurant desde el celular.
   - Empieza con maqueta (regla 9).
   - **El modo mesero de la fase 1 ya debe ser cómodo en celular**, sin rediseñar todo lo demás todavía.

Las fases 2 a 5 **no se construyen ahora**: sólo anota cómo encajan.

## 4. SQL nuevo: `sql/20-restaurant-nube.sql`

Debe poder correrse dos veces, no llevar correos, poner su copia en el Lab («Base de datos») y **depender del 19**.

1. **Realtime para `documentos`:**
   - Agrégala a `supabase_realtime` **sólo si no está** (`pg_publication_tables`).
   - Revisa si ya estaba por Imprenta y anótalo.
2. **`rest_reclama_impresion(cuenta uuid, lineas text[], ruta text, aparato text) returns text[]`:**
   - `security definer` y exige `es_miembro(cuenta)`.
   - Un solo `update ... set cuerpo = jsonb_set(...)` **donde `impreso.<ruta>` sea nulo**, `returning doc_id`.
3. **`rest_libera_impresion(...)`**, para el reintento desde otra tablet, con la misma seguridad.
4. **`rest_siguiente_folio(cuenta uuid, serie text) returns int`:**
   - Atómico: un renglón por cuenta y serie, con bloqueo.
   - Sirve para el folio del día por canal y para el folio de ticket.
5. **`nuvoor_rest_nube_disponible()`** para detectarlo.
6. **Un solo `select` final** de comprobación: funciones, publicación y permisos.
7. **Revisa contra 01, 02, 10, 17, 19 y CORRER-11.**
   - `rest_*` debe pasar las políticas de `documentos` del 19 para el rol `admin`.
   - **No abras colecciones a otros roles todavía.**
   - `limite_del_plan` ya deja pasar todo en cuentas que no son de Imprenta.

## 5. Pruebas

En Chrome headless, servido por http, con **tres contextos a la vez** (tablet, celular de mesero y laptop) contra un Supabase falso que simule `documentos`, Realtime (se puede apagar), el `upsert`, las funciones del 20 y la cuenta `?cuenta=R`. Sin Computer Use.

- [ ] El celular manda 3 platillos a la Mesa 4: en menos de 2 s aparecen en la tablet y en la laptop, y la tablet imprime **una** comanda (`MakersPrinter` falso).
- [ ] **Dos tablets con impresora de comandas prendidas** → cada línea sale **una sola vez** por ruta.
- [ ] La impresora de barra recibe sólo bebidas y la de cocina sólo comida.
- [ ] Dos meseros en la **misma mesa** al mismo tiempo → llegan todas las líneas y ninguna se pierde ni se repite.
- [ ] **Realtime apagado:** igual llega en ≤ 10 s, por el sondeo.
- [ ] **Sin red en el celular:**
  - El pedido espera con «Sin conexión · 1 cambio por subir».
  - Al volver la red se manda **una sola vez**.
  - El folio provisional pasa a definitivo.
- [ ] **Sin red en la tablet:** cobra y abre mesas. Al volver, todo sube y la laptop lo ve.
- [ ] **La laptop cambia el precio de un platillo** → la tablet y el celular lo ven sin recargar.
- [ ] Cobrar en la tablet libera la mesa en los tres aparatos; el ticket no se edita después.
- [ ] El modo mesero no enseña caja, cortes, reportes ni Ajustes de dinero o personal.
- [ ] Migración: una tablet con datos y la nube vacía → pregunta y sube. Otra tablet con datos distintos → no mezcla y ofrece respaldo.
- [ ] Sin SQL 19 o 20: aviso claro y el Restaurant funciona local como hoy.
- [ ] Todo lo de antes sigue pasando: impresoras (cola, categorías, corte, reintento), apps de reparto (Rappi $190 al 30% → comisión $57), facturación, eventos y cerrar sesión.
- [ ] Sin errores de consola.

**Capturas para Carlos:**
- el celular en modo mesero;
- la tablet con el indicador «En línea»;
- el aviso de migración.

## 6. Lo que hará Carlos (escríbelo en pasos de celular)

1. **Si no lo ha hecho**, correr el SQL 19 y luego el 20, desde el Lab → Base de datos → copiar → editor SQL → Run. Mandar captura de la fila final.
2. **En la tablet** con las impresoras: abrir el Restaurant → «Subir los datos de esta tablet» → sí.
3. **En la laptop y en su celular:** entrar al mismo Restaurant y comprobar que se ven las mesas y la carta.
4. **Prueba de mesero:** celular → modo mesero → Mesa 4 → 3 platillos → «Mandar a cocina» → **sale la comanda en la impresora de cocina**.

## 7. Publicar

Sólo con «aprobado, publica» de Claude. Sube los sellos (`restaurant` en `version.json`, la caché de `restaurante/sw.js` y el Lab por el SQL 20). **No hace falta APK nuevo**, salvo que encuentres algo del puente; si es así, avisa antes.
