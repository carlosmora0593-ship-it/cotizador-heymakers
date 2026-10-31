# Tarea para Codex: la app Nuvoor (Android)

Escrito por Claude el 31 oct 2026 para que Codex la haga mientras Claude no está.
**Antes de empezar lee `AGENTS.md` completo.** Sus reglas mandan sobre todo lo de aquí.
Y lleva el historial en `HISTORIAL-CODEX/`, como dice la sección 9.

---

## 0. CAMBIO DE PRIORIDADES (Carlos, 31 oct, tarde): esto manda sobre el resto

> «No pienso pagar por ahora en fase de pruebas, qué tal un APK. Me interesa mucho que en mis tablets tengo ya vinculadas las impresoras y que salgan ticket de cada comanda.»

1. **Nada de Play Store por ahora.** La Fase 4 queda congelada. La app se reparte como **archivo APK** y se instala a mano. Cuesta $0.
2. **El orden nuevo:**
   1. Lo de `tmp/` en `.gitignore`, si no está hecho.
   2. Fase 1, sólo lo que use la app: `app-shell.js` y esconder pagos.
   3. Fase 2: el APK.
   4. Probarlo en **sus tablets con sus impresoras**, con el Restaurant primero.
   5. Después, **`TAREA-MESEROS.md`**: los meseros mandan a cocina desde su celular.
3. **La llave de firma se crea desde el primer APK**, aunque sea de prueba. Es gratis: `keytool`, con contraseñas que teclea Carlos.
   - Un APK *debug* y uno *release* tienen firmas distintas, así que para cambiar de uno a otro hay que **desinstalar**.
   - **Desinstalar borra lo que el Restaurant guardó dentro de la app.** Con la llave desde el principio, cada APK nuevo se instala encima sin perder nada.
4. **Cómo llega el APK a las tablets:**
   - Propón a Carlos publicarlo en `public/descargas/Nuvoor.apk`, para bajarlo desde `https://app.nuvoor.mx/descargas/Nuvoor.apk` en cada tablet. **Pregúntale antes.**
   - Dale los pasos para permitir «Instalar apps desconocidas» en Chrome de Android, con el texto exacto de cada pantalla.
5. **El Restaurant ya trae un botón para bajar `Makers-Restaurant.apk` y otro de «Buscar actualizaciones»** (`.androidApkLink`).
   - Dentro de la app Nuvoor, escóndelos.
   - En la web se quedan hasta que Carlos diga que la app nueva sustituye a la vieja.
6. **La fuente del Restaurant es `public/restaurante/index.html`.** **No uses** `PRUEBA-restaurant.html` ni `PREPARAR-APP-RESTAURANTE.bat`: están viejos y regenerarían la página encima, con los nombres viejos.
7. **Las impresoras:** el puente `MakersPrinter` ya existe y el Restaurant ya imprime la comanda al «Mandar a cocina» si la pantalla es `ESTACION.cocina` con impresora Bluetooth elegida. Lo que falta es **probarlo en la app nueva, en sus tablets**. Anota en el historial la marca de cada impresora y si salió.

Claude va a revisar tu trabajo cuando regrese: deja en el historial **qué archivos tocaste, qué comandos corriste y cómo se prueba**.

## 1. Qué quiere Carlos

Una sola app que se llame **Nuvoor**. Se instala en teléfonos y tablets Android y abre el punto de venta que cada usuario contrató:

- **Nuvoor Imprenta**
- **Nuvoor Restaurant**
- **Nuvoor Store**

El usuario entra con su correo. Si tiene un solo producto, la app lo lleva directo; si tiene varios, los escoge. Eso ya lo hace `public/acceso.html` + `acceso.js`; la app sólo lo abre. El dominio `app.nuvoor.mx` ya funciona con HTTPS.

## 2. La decisión técnica (no la cambies sin preguntarle a Carlos)

**App Android nativa con un WebView que carga EN VIVO `https://app.nuvoor.mx/acceso.html`.**

- **La base es `android-native/`.** Ese proyecto ya trae un WebView y el puente `window.MakersPrinter` para impresoras térmicas Bluetooth ESC/POS. El Restaurant y el Store ya lo usan:
  - Métodos: `listPairedDevices()`, que regresa un JSON.
  - `requestBluetoothPermission()`
  - `printText(id, mac, mm, texto)`
  - `printHtmlSystem(id, titulo, mm, html, css)`
  - `checkForAppUpdate()` y `openAppUpdate()`
  - Respuestas: `window.onMakersPrinterResult(id, ok, msg)` y `window.onMakersPrinterPermissionResult(ok)`.
- **Por qué no TWA (Bubblewrap/PWABuilder):** la TWA corre dentro de Chrome y no puede meter el puente. Sin puente no hay impresora Bluetooth Classic, que es la que usan casi todas las térmicas baratas.
- **Por qué en vivo y no empaquetada:** cada `PUBLICAR.bat` actualiza la app al instante sin pasar por Play Store. La app sólo se vuelve a compilar cuando cambia algo nativo.
- **iPhone queda fuera de esta tarea:** se compila en una Mac. En iPhone se usa Safari → Compartir → «Agregar a inicio» (ver Fase 1).

## 3. Lo que NO se toca

- **`android-native/` y `android-release/` se quedan como están.** Son la app vieja del Restaurant (`com.heymakers.restaurant`) y hay gente que la tiene instalada. La app nueva va en una carpeta **nueva**, `app-nuvoor/`, copiada de `android-native/`.
- `public/restaurante/.well-known/assetlinks.json` se queda: es de la app vieja.
- **Las claves internas** (`taller`, `tiendita`, `?producto=`, nombres de archivo) no cambian. Ver `AGENTS.md`.
- **Nada de cobros dentro de la app.** Google Play exige su propio sistema de pagos para las suscripciones digitales que se compran dentro de una app.
  - Mientras Carlos no decida otra cosa, en la app se **esconden** «Contratar», «Pagar», «Probar gratis» y cualquier liga a Stripe o Mercado Pago.
  - Si una cuenta no tiene el producto activo, el mensaje es «Tu cuenta no tiene este producto activo», sin liga para pagar.
  - Antes de subir a Play Store, revisa la política de pagos vigente de Google Play y explícasela a Carlos en dos líneas.
- **Las llaves de firma (keystore) y sus contraseñas** nunca van en el repo, en el chat ni en el historial (ver Fase 2).

## 4. Fase 0: arreglos chicos en la web (para calentar)

Estos cambios son en `public/`. Cada uno sube el sello de versión como dice `AGENTS.md` → «Cómo publicar un cambio».

1. **`acceso.html`, línea 12:** dice «…o crea una cuenta y prueba el sistema gratis durante 15 días» y «La prueba no pide tarjeta». Las altas están cerradas.
   - Cámbialo a «Usa tu correo para abrir el punto de venta que tienes contratado.».
   - Esconde la nota de la prueba.
   - Deja un comentario `<!-- ALTAS: al reabrir, regresar el texto de la prueba -->`.
   - Agrega este punto a la lista «Para reabrir» de `AGENTS.md`.
2. **`tiendita/index.html`:** la impresión de prueba dice `"NUVOR TIENDITA\nPRUEBA DE IMPRESION…"`. Cámbialo a `"NUVOOR STORE\nPRUEBA DE IMPRESION…"`. Sale en el papel.
3. Prueba los dos en el navegador. Carlos corre `PUBLICAR.bat`. Comprueba en `https://app.nuvoor.mx/version.json`.

## 5. Fase 1: lo que la web necesita para vivir dentro de la app

1. **Saber que está dentro de la app.** El WebView agrega al User-Agent el sufijo ` NuvoorApp/<versionName>` y expone `window.NuvoorApp` (Fase 2).
   - Crea `public/app-shell.js`, un archivo chico.
   - Si detecta la app, pone `document.documentElement.dataset.app = "android"`.
   - Con CSS `[data-app="android"] .soloWeb{display:none!important}` se esconde lo de cobrar.
   - Cárgalo en `acceso.html`, `index.html`, `taller.html`, `restaurante/index.html`, `tiendita/index.html` y `lab.html`.
   - Marca con `soloWeb` los botones de pago, contratar, «Volver a nuvoor.mx» y probar gratis.
2. **El ícono para iPhone y Chrome:**
   - Copia la N de Nuvoor (`Claude outputs/nuvoor-landing/sitio/img/marca/n-192.png` y `n-512.png`) a `public/img/marca/`.
   - Pon `<link rel="apple-touch-icon" href="img/marca/n-192.png">` y `<link rel="icon" …>` en `acceso.html`.
   - Crea `public/manifest.webmanifest` con:
     - `name` «Nuvoor»
     - `start_url` `/acceso.html`
     - `scope` `/`
     - `display` `standalone`
     - colores del logo: índigo `#4458a4`, tinta `#0b0f1c`
   - **NO pongas un service worker en la raíz.** Se encimaría con los de `restaurante/` y `tiendita/`, y podría dejar viejo el `index.html` de 1.4 MB.
3. Publica y prueba que en el navegador normal **no cambió nada**: los botones de pago siguen ahí fuera de la app.

## 6. Fase 2: el proyecto Android `app-nuvoor/`

### 6.1 Identidad

| Dato | Valor |
|---|---|
| Carpeta | `app-nuvoor/` (copia de `android-native/`) |
| `applicationId` / `namespace` | `mx.nuvoor.app` (paquete Java `mx.nuvoor.app`) |
| Nombre visible | `Nuvoor` |
| `versionCode` / `versionName` | `1` / `1.0.0` |
| `compileSdk` / `targetSdk` | **36**. Google Play pide API 36 para apps nuevas desde el 31 ago 2026; confírmalo en developer.android.com/google/play/requirements/target-sdk |
| `minSdk` | 24 |
| Ícono | Ícono adaptable con la N de `n-512.png` sobre fondo blanco. Splash de Android 12+ con el mismo logo |
| URL de inicio | `https://app.nuvoor.mx/acceso.html?app=android` |

### 6.2 El WebView: lista exacta de lo que debe funcionar

Las páginas usan estas cosas. Revisa cada una con `grep` antes de dar por terminada la fase. Entre paréntesis va cuántas hay en cada página al 31 oct 2026.

1. **Sólo `app.nuvoor.mx` se abre dentro del WebView.** En `shouldOverrideUrlLoading`, cualquier otro host se abre fuera con un `Intent`: `wa.me`, `mailto:`, `tel:`, Mercado Pago, Stripe, nuvoor.mx.
   - Es una regla de **seguridad**: el puente `MakersPrinter` no debe quedar expuesto a otras páginas.
   - Supabase y los CDN se cargan como recursos, no como navegación, así que no les afecta.
2. **Ajustes:**
   - JavaScript y DOM storage prendidos.
   - `allowFileAccess=false` y `MIXED_CONTENT_NEVER_ALLOW`.
   - Depuración remota (`setWebContentsDebuggingEnabled`) sólo en el build *debug*.
3. **Botón atrás:** si `canGoBack()`, `goBack()`; si no, sale de la app.
4. **`window.print()`** (Imprenta 2, Restaurant 2, Store 1). En un WebView no hace nada por sí solo.
   - Expón `NuvoorApp.printPage(titulo)`, que imprime el WebView actual con `PrintManager` + `createPrintDocumentAdapter`.
   - En `app-shell.js`, dentro de la app, `window.print = () => NuvoorApp.printPage(document.title)`.
   - Prueba que la cotización de Imprenta sale bien con «Guardar como PDF».
5. **`window.open(`** (Imprenta 1, Restaurant 3, Store 1, Lab 2). Si es del mismo dominio, ábrelo en el mismo WebView o en uno nuevo con cerrar; si es externo, fuera.
6. **Descargas** (`a.download`: Imprenta 2, Restaurant 1, Store 1). Ahí está el **«Bajar respaldo»** del Restaurant, y es importante.
   - Los `blob:` no se descargan solos en un WebView.
   - `app-shell.js` convierte el blob a base64 y llama a `NuvoorApp.saveFile(nombre, mime, base64)`.
   - Ese método lo guarda en Descargas con `MediaStore` y avisa con un `Toast`.
7. **Subir archivos** (`input type=file`: Imprenta 19, Restaurant 5, Store 1, Lab 2): logos, fotos del catálogo, importar CSV y restaurar respaldo. Implementa `onShowFileChooser`.
8. **Cámara** (`getUserMedia`: Imprenta 2, Restaurant 1, Store 1), para escanear códigos en Store.
   - Permiso `CAMERA` en el manifiesto.
   - `onPermissionRequest` concede sólo `RESOURCE_VIDEO_CAPTURE` y sólo a `https://app.nuvoor.mx`.
9. **`navigator.share`** (Store 2), para compartir la página de citas. Si el WebView no lo trae, `NuvoorApp.share(texto, url)` abre el menú de compartir de Android.
10. **Sin internet:**
    - Si la primera carga falla, muestra `assets/offline.html` (logo + «Sin conexión» + botón «Reintentar»).
    - El Restaurant tiene su propio service worker; comprueba que después de abrirlo una vez funciona en modo avión dentro de la app.
11. **La sesión se queda** al cerrar y abrir la app (Supabase guarda en localStorage).
12. **El puente `MakersPrinter`** se copia tal cual de `android-native/`, con el mismo nombre de interfaz, porque las páginas ya lo llaman así.
    - `checkForAppUpdate()` responde «sin actualización» en esta app: las actualizaciones nativas vendrán por Play Store.
    - En la impresión de prueba, cambia «Nuvor» por «Nuvoor».

### 6.3 La llave de firma (la crea Carlos, no tú)

- Haz `app-nuvoor/CREAR-LLAVE.ps1`, que corre `keytool` y **le pide a Carlos las contraseñas en su consola**.
- La llave queda **fuera del repo**: `C:\Users\hp\Nuvoor-llaves\nuvoor-app.jks`.
- Dile que la respalde en dos lugares (USB y su nube). Sin ella no puede actualizar la app.
- El build lee la llave de variables de entorno, igual que `android-native` (`NUVOOR_KEYSTORE_PATH`, `NUVOOR_KEYSTORE_PASSWORD`, `NUVOOR_KEY_ALIAS`, `NUVOOR_KEY_PASSWORD`).
- **Las contraseñas nunca se escriben en archivos, en el historial ni en el chat.**

### 6.4 Compilar

- `app-nuvoor/CONSTRUIR-APP.bat` llama a `Construir-App.ps1`. Toma de ejemplo `android-native/Build-Release.ps1`.
- **Salidas:**
  - `bundleRelease` → `.aab` para Play Store.
  - `assembleRelease` → `.apk` para instalar directo.
  - Las dos van a `app-nuvoor/salida/`, que está en `.gitignore`.
- **Requisitos:** Android Studio con JDK 17 y el SDK 36. Revisa con `where java` y `ANDROID_HOME`. Si falta algo, dile a Carlos qué instalar, con la liga.
- Los `.bat` deben terminar con `pause`, para que la ventana no se cierre sin decir nada. `CONECTAR-DOMINIO.bat` no le corrió en su Windows: **pruébalo tú corriéndolo** antes de dárselo.

## 7. Fase 3: pruebas en un teléfono real (las hace Carlos y te cuenta)

Dale esta lista **con casillas**, sin tecnicismos. Pon en el historial qué pasó en cada punto.

- [ ] Se instala el APK y el ícono dice «Nuvoor» con la N.
- [ ] No se ve la barra del navegador.
- [ ] Entra con su correo. Con un producto va directo; con varios, los escoge.
- [ ] Imprenta: hace una cotización y la imprime («Guardar como PDF»).
- [ ] Imprenta: sube un logo.
- [ ] Restaurant: abre una mesa, manda comanda y cobra.
- [ ] Restaurant: «Bajar respaldo» deja el archivo en Descargas.
- [ ] Restaurant: con la impresora Bluetooth emparejada, «Imprimir prueba» sale en papel.
- [ ] Store: escanea un código con la cámara y cobra.
- [ ] Store: «Imprimir prueba» sale en papel.
- [ ] Las ligas de WhatsApp abren WhatsApp.
- [ ] No aparece ningún botón de pagar ni de contratar.
- [ ] Atrás regresa; gira la pantalla y no se pierde nada.
- [ ] Al cerrar y abrir, sigue con la sesión.
- [ ] En modo avión, el Restaurant abre; Imprenta y Store dicen «Sin conexión».

**Ojo con el Restaurant:** guarda en el almacenamiento del navegador, y la app nueva tiene el suyo propio. Quien ya lo usa en Chrome o en la app vieja debe **bajar su respaldo antes** y restaurarlo en la app nueva. Díselo a Carlos con estas palabras.

## 8. Fase 4: Play Store (CONGELADA: Carlos no quiere pagar en pruebas; sólo cuando diga «súbela»)

- **La cuenta de Google Play Console la abre Carlos.** Cuesta 25 dólares, una sola vez, y pide verificar identidad. Tú no metes pagos ni contraseñas.
- **Las cuentas personales nuevas deben hacer una prueba cerrada** con al menos 12 personas durante 14 días antes de salir a producción. Confírmalo en support.google.com/googleplay/android-developer/answer/14151465.
- **Lo que pide la ficha:**
  - Ícono de 512.
  - Imagen destacada de 1024×500.
  - Capturas de teléfono y tablet.
  - Descripción en español.
  - Liga de **aviso de privacidad**. Hazlo como `privacidad.html` para el repo `nuvoo-web` (nuvoor.mx/privacidad.html); Carlos lo sube.
  - Formulario de **seguridad de datos**.
  - **Una cuenta de prueba para los revisores.** La crea Carlos y nunca va en el repo.
- **Antes de subir:** la política de pagos (sección 3).

## 9. El historial: obligatorio, en `HISTORIAL-CODEX/`

Carlos quiere ver qué hiciste, y Claude lo va a leer cuando regrese.

- La carpeta es `HISTORIAL-CODEX/`, en la raíz del repo. **Está en `.gitignore`: no sube a GitHub, porque el repo es público.**
- **Un archivo por sesión de trabajo:** `AAAA-MM-DD_HHMM_tema-corto.md`, en hora de Ciudad de México. Usa `PLANTILLA.md`.
- **`INDICE.md`:** una línea por sesión, **la más nueva arriba**: fecha, tema, estado (✅ terminado / 🟡 a medias / ⛔ bloqueado) y archivo.
- **Escríbelo mientras trabajas**, no al final. Si se corta la sesión, que quede lo que llevabas.
- **Nunca escribas ahí:** contraseñas, llaves, tokens, el correo de Carlos ni datos de clientes.
- Si algo no se pudo probar, **dilo así**: «no probado». Nunca pongas «funciona» sin haberlo visto funcionar.

## 10. Orden y cuándo parar a preguntar

1. Fase 0 → publicar → historial.
2. Fase 1 → publicar → historial.
3. Fase 2 → APK *debug* → Carlos lo instala → Fase 3.
4. Llave (Carlos) → APK y AAB *release* → historial.
5. Fase 4 sólo con su «súbela».

**Para y pregúntale a Carlos** cuando:

- algo cueste dinero;
- haya que borrar algo;
- quieras cambiar la decisión de la sección 2;
- un cambio se vea en pantalla y él no lo haya visto antes (regla 9 de `AGENTS.md`: primero se lo enseñas, con captura, y luego se publica).
