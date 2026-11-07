# TAREA 0o · Un solo ticket de cocina por pedido

Prioridad 2: va **después** de TAREA-CAJA-FIJA. Autor: Claude, 6 nov 2026, 22:20. Carlos autorizó a Codex publicar en automático (ver AGENTS.md).

## Lo que pasa

El 6 de noviembre en la noche, Carlos reportó que la laptop Samsung manda a cocina tickets dobles.

Causa en el código publicado (`public/restaurante/index.html`):

- La lista de impresoras es **de cada aparato** (localStorage `impresoras`).
- La llave que evita duplicados es `rutaImpresoraNube(p)` = nombre normalizado + «|» + categorías.
  - `rest_reclama_impresion` y `rest_bt_toma` solo toman una línea si `impreso[ruta]` está vacío.
  - Dos aparatos con «Comandas de cocina» encendido y **nombres distintos** reclaman la misma línea con dos rutas distintas, y las dos imprimen.
- `nuevoBorradorImpresoraPOS()` deja `cocina:true` y `cancela:true` en toda impresora que no sea la primera. Una laptop con dos impresoras queda imprimiendo comandas sin que nadie lo decida.
- Antes ya hubo duplicados por dos configuraciones («Taqueros» y «Cocina») para la misma impresora física.

Arreglo inmediato que hace Carlos: apagar «Comandas de cocina» y «Cancelaciones» en las impresoras de la Samsung.

## Lo que hay que hacer

1. **Nada de comandas por defecto.** Una impresora nueva nace con `cocina:false` y `cancela:false` en cualquier aparato. Encender comandas es una decisión explícita.
2. **Aviso al encender comandas en un segundo aparato.**
   - Al guardar una impresora con Comandas o Cancelaciones, revisar en la nube si **otro aparato** ya imprime comandas de las mismas categorías (o se traslapan). Fuentes posibles: rutas de `impreso` en `rest_lineas` de las últimas horas con `por` ≠ este aparato, o un registro ligero de estaciones de cocina. Si hace falta SQL, va como **34** en Lab y la pantalla debe funcionar sin él.
   - Si hay traslape, preguntar con nombre legible del aparato, con un texto como este: «La tablet "Cocina" ya imprime las comandas de Tacos y Bebidas. Si las dos impresoras son la misma, saldrán dobles.»
   - Opciones: «Dejar solo la otra» (recomendada), «Imprimir en las dos (son impresoras distintas)».
3. **Mismo aparato, misma impresora física.** Si dos configuraciones del mismo aparato usan la misma dirección Bluetooth (`impresoraBt`) y sus categorías se traslapan, no dejar guardar y explicar por qué.
4. **Renombrar no debe duplicar.**
   - Si la estación de pantalla apagada (SQL 29) está activa y se cambia el nombre o las categorías de una impresora, volver a registrar las rutas con `rest_bt_activa` en ese momento. Así la estación nativa no se queda con la ruta vieja mientras la pantalla usa la nueva.
   - Lo ya impreso con la ruta vieja no debe reimprimirse.
5. **«Impreso en …» con el aparato.** Mostrar también el nombre del aparato que imprimió, para diagnosticar desde la cuenta sin SQL.

## Pruebas mínimas

- Simular dos aparatos (dos perfiles):
  - Con mismo nombre de impresora sale un ticket.
  - Con nombres distintos y categorías traslapadas aparece el aviso al guardar.
  - Con categorías distintas no hay aviso y cada una imprime lo suyo.
- Laptop sin app (navegador): crear la segunda impresora no enciende comandas.
- Renombrar con estación nativa activa: un solo ticket del siguiente pedido.

## Reglas

Publicar fuera del servicio de Asada de noche (después de 23:30). No correr SQL en producción; lo corre Carlos desde Lab. Registrar en HISTORIAL-CODEX y marcar 0o en AGENTS.md.
