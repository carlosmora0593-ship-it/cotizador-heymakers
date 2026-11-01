# Tarea para Codex: arreglo urgente de la nube del Restaurant (prueba real del 1 nov)

Escrito por Claude el 1 nov 2026, 8:45 (Morelia). **Va antes que todo.** Las reglas de `AGENTS.md` mandan. **Se publica sólo con «aprobado, publica» de Claude.**

## 1. Lo que pasó en la prueba real

Carlos corrió los SQL 19 y 20 y abrió su Restaurant en la tablet, la laptop y el celular:

> «Los 3 dispositivos no interactúan entre sí; si cargo una cuenta en un dispositivo los demás lo ignoran; tienen cortes de caja diferentes.»
>
> «En el Lab, en los registros de Restaurant, no veo ninguna suscripción.»

Claude lo revisó en su base real, sólo leyendo, desde el navegador de Claude con la sesión de Carlos:

- **Su único Restaurant, «Asada de noche»** (`producto = restaurant`), se creó con `crear_negocio` el 31 oct a las 02:05 UTC **con `vence` = `creada`**: nació **vencido**, en plan `prueba` y con cero días.
  - En producción, el `vence` por omisión de `cuentas` **no** es `now() + 15 days` (ver `CORRER-3-quince-dias.sql` / `10-sin-plan`: «Quien no contrató, no trabaja»).
  - `crear_negocio` del SQL 19 confió en el valor por omisión. **Es un error del SQL 19, y Claude no lo vio al revisarlo.**
- Por eso `limite_del_plan()` rechaza con `SUSCRIPCION_VENCIDA` **todo** `upsert` de `rest_*`. La nube de esa cuenta tiene **0 documentos `rest_*`**.
  - En la laptop (navegador de Claude) había **38 cambios atorados** (`rest_config` 1, `rest_carta` 18, `rest_mesas` 18, `rest_equipo` 1), el primero con 6 intentos.
  - El celular decía «Sincronizando · 40 cambios».
- **La pantalla no lo dice:** se queda en «Sincronizando · N cambios» y no explica que el negocio está vencido.
- **Riesgo grave de mezclar datos.** Como la nube estaba vacía, **cada aparato** encoló su propia subida inicial:
  - **Datos reales de «La Casa del Menudo»:** la tablet (croquis con Mesa 1–9, cocina, baños, caja) y probablemente el Chrome de la laptop (carta: Tacos, Quesadillas, Volcanes…).
  - **Datos de ejemplo:** el celular y el navegador de Claude («Mi restaurante», «Guacamole con totopos», Mesa 1–8 y Terraza 1–4).
  - En `conectaNube…` (líneas ~2750–2751), la pregunta de migración y la de conflicto sólo corren **si la cola está vacía** (`!REST_NUBE.queue.length`). **En cuanto la cuenta tenga plan, todas las colas se vacían a la nube y se mezclan** los datos reales con los de ejemplo, con ids que pueden chocar (Mesa 1…).
- **Caja y cortes distintos por aparato:** es la fase 2. Carlos la necesita ya; va en la siguiente tarea, no en ésta.

**Nadie activa el plan de «Asada de noche» hasta que esto esté publicado.** Mientras esté vencida, la base frena las colas y protege los datos.

## 2. Lo que hay que hacer

### A. `sql/21-negocio-con-prueba.sql`

Repetible, sin correos, con su copia en el Lab y **después del 19 y el 20**.

1. **`crear_negocio(nombre, producto)`:** igual que en el 19, pero que inserte **explícitamente** `plan = 'prueba'`, `estado = 'activa'` y `vence = now() + interval '15 days'`.
   - Revisa cómo da la prueba el alta normal en producción (`al_crear_usuario`, códigos de curso en `07-codigos`, `CORRER-3`) y anota si la regla «prueba sólo con código» debe aplicar aquí. **No decidas tú:** deja 15 días y escribe la pregunta para Carlos en el historial.
2. **No toques cuentas existentes.** «Asada de noche» la reactiva Carlos desde el Lab, que ya puede (`staff_cambia_plan` + la bandera de CORRER-11, que el 19 conservó).
3. **Higiene:** Supabase da `execute` a `anon` por omisión en `public`.
   - Haz `revoke execute ... from anon` en `crear_negocio`, `rest_reclama_impresion`, `rest_libera_impresion`, `rest_subir_impresion_offline`, `rest_confirma_impresion`, `rest_reasigna_impresion`, `rest_reserva_comanda` y `rest_siguiente_folio`.
   - Hoy son seguras porque revisan sesión y `es_miembro`, pero no deben estar abiertas. **Deja** `anon` en `rol_en`, `es_miembro`, `nuvoor_negocios_disponible` y `nuvoor_rest_nube_disponible`.
4. **Un solo `select` final** de comprobación.

### B. El Lab: que vea el 19, el 20 y el 21

En «Base de datos», hoy el 19 y el 20 salen «no se puede ver». Detéctalos con su función: `nuvoor_negocios_disponible` → 19, `nuvoor_rest_nube_disponible` → 20, y una nueva `nuvoor_negocio_prueba_disponible` → 21. Así salen «puesta».

### C. Restaurant: decir la verdad cuando la base no deja guardar

- Si la subida o una RPC regresan `SUSCRIPCION_VENCIDA` o `SIN_PLAN`, el indicador dice en rojo: **«La nube no guarda: el plan de <negocio> venció. Actívalo en el Lab o en Licencias.»**
- Se deja de reintentar cada pocos segundos (un reintento cada 2 min o al volver a abrir).
- **Lo local sigue funcionando** y no se pierde nada.
- Cualquier otro error: «No se pudo sincronizar · <motivo>», como ya está, pero **sin** que lo tape «Sincronizando».

### D. Restaurant: nunca mezclar dos subidas iniciales

1. **Marca de migración:** cada cambio que entra a la cola por la **subida inicial** («Subir los datos de esta tablet», o la subida automática con la nube vacía) lleva `migracion: true` y el id del aparato.
2. **Antes de mandar** cualquier lote con `migracion: true`, vuelve a leer la nube de la cuenta.
   - **Si la nube ya tiene documentos `rest_*` que no puso este aparato**, **no mandes nada** y enseña el diálogo de conflicto que ya existe: «Bajar respaldo y usar la nube», «Usar los de la nube», «Dejar sus datos sólo en este aparato».
   - **«Usar los de la nube»** quita de la cola **sólo** los cambios de migración, guarda una copia local de lo que tenía (como el respaldo actual) y aplica la nube.
   - **«Dejar sólo en este aparato»** pausa la nube en ese aparato, como hoy.
3. **El mismo chequeo al abrir:** quita la condición `!REST_NUBE.queue.length` de las preguntas de migración y conflicto. Si la cola sólo trae cambios de migración y la nube ya tiene datos, también pregunta.
4. **Datos de ejemplo:** si lo local de un aparato son **los datos de ejemplo sin tocar** («Mi restaurante» y la carta de ejemplo), **no se ofrece subirlos**; ese aparato adopta la nube. Si la nube está vacía y el aparato sólo tiene ejemplo, que pregunte «¿Empezar con datos de ejemplo?» en vez de «Subir los datos de esta tablet». Busca cómo distinguir el ejemplo (semilla, ids o bandera) y anótalo.
5. **Los cambios normales** (no de migración) que se hicieron sin red siguen subiendo como hoy.

### E. Sellos

`restaurant` y `lab` en `version.json`, caché de `restaurante/sw.js` y el Lab.

## 3. Pruebas (Chrome headless, Supabase falso)

- [ ] Una cuenta **vencida**: tres aparatos encolan su subida inicial. El indicador dice «La nube no guarda: …vencido», no «Sincronizando», y los reintentos no martillan.
- [ ] Se **activa** el plan con el aparato A (datos reales) abierto: A sube todo.
  - B (otros datos reales) y C (datos de ejemplo) se abren **después**: B enseña el conflicto y **no** sube nada hasta que se elija; C adopta la nube sin preguntar por subir el ejemplo.
  - Al final la nube tiene **sólo** los datos de A.
- [ ] En B, «Usar los de la nube»: la cola de migración se vacía, queda el respaldo local y B ve las mesas y la carta de A.
- [ ] `crear_negocio` falso → la cuenta nace con `prueba`, `activa` y vence a 15 días.
- [ ] El Lab marca 19, 20 y 21 como «puesta» cuando sus funciones responden.
- [ ] Todo lo de la fase 1 sigue pasando (mesero, impresión una sola vez, sin red, reclamos), sin errores de consola.

## 4. Pasos para Carlos, después de publicar (escríbelos en el historial)

1. Lab → Base de datos → `21-negocio-con-prueba` → Copiar → editor SQL → Run → captura.
2. **Cierra el Restaurant en el celular y en la laptop.** Deja abierta **sólo** la tablet (o el aparato que Carlos diga que tiene los datos buenos).
3. Lab → Cuentas → «Asada de noche» → ponle plan (por ejemplo Estándar, activa, con vencimiento lejano). La tablet sube sus datos sola.
4. Luego abre la laptop y el celular. Si preguntan, **«Usar los de la nube»**; el celular con datos de ejemplo debe adoptar la nube solo.
5. Prueba: abre una mesa en la tablet → debe aparecer en la laptop y en el celular.
