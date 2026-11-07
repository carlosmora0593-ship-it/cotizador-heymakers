# Tarea para Codex: cualquier aparato conectado cobra en la caja compartida (6 nov 2026, 20:50)

Escrita por Claude. **Es la prioridad número uno** y reemplaza la versión anterior de esta tarea. Las reglas de `AGENTS.md` mandan.

## Lo que dijo Carlos

> «No entiendo: aunque sea en navegador trabajamos bajo una sola nube, eso debería estar sincronizado. Espero que no vuelva a pasar este error.»

Tiene razón. Hoy en Asada de noche **no se pudo cobrar en ninguna caja tres veces** («Cobra desde el dispositivo que abrió el turno de caja»):

- La caja compartida amarra el turno al `deviceId` del aparato que lo abrió.
- En la misma tablet, el navegador y la app Nuvoor tienen `localStorage` distinto, así que son dos aparatos.

Se destrabó con SQL de reinicio (`HISTORIAL-CODEX/2026-11-06_1930_claude-reinicio-cajas.md`). Eso no debe volver a hacer falta.

## Lo que debe pasar

1. **Cobrar:** cualquier aparato **conectado** del negocio, con perfil de cajero o gerente, cobra en el turno abierto: app, navegador, laptop o celular.
   - El servidor acepta el cobro si `turnoId` es el turno activo y `cajaCompartida` es verdadero. Ya **no** compara `cajaAparato` con el aparato del turno (`rest_caja_protege_cobro`).
   - Guarda en el ticket qué aparato cobró, para el corte.
2. **Cobrar sin internet:** sólo el aparato que tiene la caja (el que abrió o el que la tomó) puede cobrar sin conexión y subir después. Los demás, sin red, avisan «Conéctate para cobrar».
3. **Cerrar turno:** cajero o gerente desde cualquier aparato conectado, con su PIN. El cierre espera los cobros sin subir del aparato que tiene la caja, como hoy.
   - En `rest_caja_operar('cerrar')`, quita la condición del aparato.
   - Agrega una revisión: si el aparato que tiene la caja tiene cobros sin subir, avisa cuál aparato y cuántos.
4. **Tomar la caja aquí:** botón para que este aparato sea el que cobra sin internet (gerente con PIN). Sirve cuando la tablet cambia o se apaga.
5. **El aviso** dice qué aparato tiene la caja, con un nombre legible («Tablet · app Nuvoor»), y deja de bloquear el cobro cuando hay conexión.
6. **Bajar la versión del aviso viejo:** quita «Cobra desde el dispositivo que abrió el turno de caja» y «Cierra este turno desde el dispositivo que lo abrió» cuando hay conexión.

## Cobrar en una laptop con impresora (Carlos, 6 nov, 21:00)

> «También me gustaría poder cobrar desde cualquier dispositivo; tener sólo una tablet para cobrar hace lento el sistema. Que con mi usuario pueda cobrar en otra laptop con impresoras vinculadas.»

- **Cobro:** con lo de arriba, la laptop cobra en el mismo turno, con la sesión del negocio y el perfil de cajero o gerente.
- **Impresión en la laptop:** en el navegador no hay puente Bluetooth.
  - Agrega en Ajustes → Impresoras, cuando no es la app Android, la conexión **«Impresora de esta computadora»**. Imprime la cuenta en la impresora predeterminada de Windows con un `iframe` oculto y `print()`, sin abrir ventana nueva.
  - Para que **no pregunte cada vez**, deja **`CAJA-LAPTOP.bat`** (doble clic) que cree en el escritorio el acceso «Nuvoor Caja». El acceso abre Chrome (o Edge si no hay Chrome) con:
    - `--kiosk-printing`
    - `--app=https://app.nuvoor.mx/restaurante/`
    - un perfil propio en `%LOCALAPPDATA%\NuvoorCaja`
  - Explica en el `.bat` que la impresora térmica debe estar instalada en Windows y marcada como predeterminada. Comprueba en la documentación de Chrome que el modificador sigue vigente y dilo en tu historial.
- **Las comandas de cocina** siguen saliendo de la tablet de cocina, que tiene sus impresoras Bluetooth; la laptop no las imprime. Si Carlos quiere cocina desde la laptop, propón aparte cómo hacerlo.
- **Pruebas:** cobro desde la laptop y la tablet en el mismo turno, ticket de la laptop sin ventana con Chrome en modo de impresión silenciosa (simulado), y que en Android siga apareciendo Bluetooth.

## Reglas

- **SQL 33**, repetible, que sólo reemplace `rest_caja_protege_cobro` y `rest_caja_operar` (más lo nuevo de tomar la caja). No recrees otras funciones.
- **Pruebas en PostgreSQL local:**
  - Cobro del navegador y de la app en el mismo turno.
  - Cobro con turno equivocado: rechazado.
  - Cobro sin red de un aparato que no tiene la caja: no se guarda como cobrado.
  - Cierre desde otro aparato con cobros pendientes: espera.
  - Corte con tickets de dos aparatos.
  - Reintentos y cobro doble del mismo ticket.
- **Chrome con dos sesiones** (tablet app simulada y navegador): cobrar en los dos, cerrar desde uno, ver el mismo corte.
- Capturas en `tmp/caja-fija/`.
- **Publicar sólo después del cierre de Asada de noche** (después de las 23:30), nunca durante el servicio. Dile a Carlos qué SQL correr; no lo ejecutes tú en producción.
