# Tarea para Codex: que nada visible diga MakersOS ni Makers (1 nov 2026)

Escrita por Claude a pedido de Carlos: **«Quiero que nada quede relacionado con MakersOS.»** Las reglas de `AGENTS.md` mandan. **Se publica sólo con «aprobado, publica» de Claude.**

## 1. Los nombres nuevos

| Antes | Ahora |
|---|---|
| Makers Lab / MakersOS (el panel interno) | **Nuvoor Lab** |
| Makers OS, Makers Restaurant, Tiendita Makers, Taller Makers | **Nuvoor**, Nuvoor Restaurant, Nuvoor Store, Nuvoor Imprenta |
| «cuenta Makers» | **cuenta Nuvoor** |
| «Soporte Hey Makers», «escríbele a Hey Makers», «soy X de Hey Makers» | **Soporte Nuvoor**, «escríbenos», «soy X de Nuvoor» |
| «Publicidad de Makers Lab» | **Publicidad de Nuvoor** |

**Se queda «curso de Hey Makers»** donde habla de los cursos con código. Los cursos de Carlos se llaman así; no es MakersOS.

## 2. Lo visible que hay que cambiar (inventario de Claude, revísalo con `grep -i makers`)

- **Imprenta (`index.html` y `taller.html`, los dos):**
  - Menú `#btnLab`: «Makers Lab · La consola interna de Hey Makers» → «Nuvoor Lab · La consola interna de Nuvoor».
  - Ayuda: «la respuesta llega desde Makers Lab» y la etiqueta «Soporte Hey Makers».
  - **Empresa de fábrica:** `empresa:{nombre:"Hey Makers", eslogan:"Cursos y Talleres"…}`. Una cuenta nueva no debe nacer llamándose Hey Makers.
    - Déjala vacía con «Mi negocio» como texto de ayuda.
    - Revisa los `||"Hey Makers"` de los mensajes y los PDF: sin nombre, que no diga ninguno.
    - **No toques la configuración guardada de ninguna cuenta.** Si Carlos tiene puesto Hey Makers en la suya, se queda.
  - `alt="Hey Makers"` del logo.
  - El tema `heymakers` se muestra como «Hey Makers»: cambia sólo la etiqueta visible (por ejemplo «Magenta»). **La clave `heymakers` se queda**, porque es la que tienen guardada las cuentas.
  - Los comentarios del código que dicen MakersOS o Makers Lab también, para que `grep` salga limpio.
- **Puerta (`acceso.html`, `acceso.js`):** «Tu cuenta Makers» → «Tu cuenta Nuvoor».
- **`cuenta.js`:**
  - Los textos al usuario: «escríbele a Hey Makers», «busca Hey Makers» (Mercado Pago), «Makers Lab».
  - El `console.log`.
- **Store (`tiendita/index.html`):**
  - «Publicidad de Makers Lab», «Abrir Makers Lab», «cuenta Makers».
  - «se administran únicamente desde Makers Lab».
- **Restaurant (`restaurante/index.html`):**
  - `apple-mobile-web-app-title` «Makers Rest» → «Nuvoor Restaurant».
  - El enlace a `./Makers-Restaurant.apk` → `../descargas/` (la app Nuvoor).
- **Lab (`lab.html`, `lab.js`):**
  - Título de la puerta «Makers Lab» y «Makers Lab es la consola interna de Hey Makers».
  - Los mensajes a prospectos: «soy X de Hey Makers», «dejaste … en Hey Makers».
  - «Alta manual desde Makers Lab».
  - Los títulos de los SQL que muestra el Lab («Cotizador Hey Makers — esquema multiusuario», «QUE MAKERS LAB PUEDA MANDAR»…).
  - Los correos de relleno `@heymakers.mx` del equipo de ejemplo.
- **`public/config.js` NO se toca** (regla 1). Si el código lee `MARCA: "Hey Makers"` de ahí y lo enseña, que el código use «Nuvoor» y deje de leerlo. Dile a Claude si lo usa.

## 3. Lo que NO se renombra (no se ve y romperlo cuesta datos)

- **El puente `window.MakersPrinter`:** vive en los APK instalados. Cambiarlo es un APK nuevo y no lo ve nadie.
- **Las llaves de `localStorage`:** `makersrest_v1`, `makers-tiendita-v1:…`. Renombrarlas borra los datos guardados en cada aparato.
- **Los ajustes de la base:** `makers.cambio_autorizado` y `makers.rest_reclamo_autorizado`. Tampoco se re-crean funciones de la base sólo por el texto de un mensaje: así se perdió una vez la bandera del Lab.
- **El paquete Android viejo `com.heymakers.restaurant`, `assetlinks.json`, el nombre del repo y la ruta `/cotizador-heymakers/`.**
- **Los respaldos del Restaurant:** los nuevos pueden decir `_app:"nuvoor-restaurant"`, pero **la importación debe seguir aceptando `"makers-restaurant"`**.
- **Sí puedes renombrar:**
  - Las cachés del service worker: `makers-restaurant-*` → `nuvoor-restaurant-*` y `makers-tiendita-*` → `nuvoor-store-*`. La limpieza debe borrar los dos prefijos viejos.
  - Los `@keyframes makers*`.

## 4. Archivos que se borran (Carlos lo pidió hoy)

- `public/MakersOS.css`: nadie lo usa.
- `public/restaurante/Makers-Restaurant.apk`: la app vieja; ya existe la app Nuvoor.
- `public/PRUEBA-commit.html` y `CONECTAR-DOMINIO.bat`, que ya estaban en la lista.

**`public/MakersOS.html` y `public/productos/*.html` se quedan por ahora.** Son redirecciones invisibles a `nuvoor.mx`, y borrarlas rompe las ligas que alguien ya compartió. Claude se lo explica a Carlos y él decide.

## 5. Los logos (CAMBIÓ: Carlos revisó la maqueta el 1 nov, 20:00)

> «En cada sistema tienen que poner el logo de las empresas. Podemos poner nuestro logo muy discreto abajo de la barra de tareas; sólo en el Lab es el principal.»

- **Imprenta, Restaurant y Store:**
  - **Arriba de la barra va el negocio del cliente:** su logo (el que ya sube en Ajustes / datos del negocio) y su nombre.
  - **Sin logo subido:** un cuadro redondeado con sus iniciales y su nombre. Nunca el logo de Nuvoor en su lugar.
- **Nuvoor, discreto:**
  - En Imprenta y Restaurant, **al pie de la barra lateral:** la N de 16 px y «Nuvoor» en gris tenue, sin competir con el menú.
  - En Store, que tiene la barra arriba: al final de la barra o al pie de la página, igual de discreto. Propón el lugar en la captura.
- **Nuvoor Lab:** el logo de Nuvoor es el principal, arriba (como en tu maqueta).
- **La puerta (`acceso.html`)** no se toca aquí: la rehace `TAREA-ACCESO-ANIMADO.md`.
- **El favicon** de cada sistema puede ser la N de Nuvoor.
- **El texto «¿Quién va a trabajar en …?»** que hoy lee `CONFIG.MARCA` («Hey Makers»): que use el nombre del negocio de la cuenta. `config.js` no se toca.
- Los archivos están en `Claude outputs/nuvoor-landing/sitio/img/marca/`.
- **Ya no hace falta otra maqueta:** implementa y manda capturas del sistema real (barras en día y oscuro, con logo subido y sin logo) antes de publicar.

## 6. Pruebas

- [ ] `grep -ri "makers" public/` sólo deja lo de la sección 3 y «curso de Hey Makers». Pega la lista que queda en tu historial.
- [ ] Una cuenta nueva de Imprenta no dice Hey Makers en ningún lado: barra, cotización PDF, mensaje de WhatsApp.
- [ ] La cuenta de Carlos conserva su nombre y su tema.
- [ ] Un respaldo viejo del Restaurant (`"makers-restaurant"`) se importa.
- [ ] Imprime desde el APK 0.1.3 como antes: el puente no cambió.
- [ ] Sin errores de consola. Sube los sellos de versión.

**No publiques.** Avisa a Claude con las capturas y la lista del grep.
