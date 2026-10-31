# Tarea para Codex: impresoras como Loyverse y el logo en el APK

Escrito por Claude el 31 oct 2026, después de que Carlos probó el APK 0.1.0 en su tablet. **Va antes de `TAREA-MESEROS.md`.** Las reglas de `AGENTS.md` mandan y el historial va en `HISTORIAL-CODEX/`.

## 1. Lo que dijo Carlos (sus palabras)

> «El ticket no sale automático. Me gustaría que podamos seleccionar la impresora para cocina y para caja y se impriman automáticamente al mandar, sin que me salga esto» (la ventana «Seleccionar una impresora · Tamaño de papel: Carta» de Android).
>
> «Que este sistema sea integral. Lo que menos ocupamos es que se creen accesos directos o adicionales; tiene que ser simple.»
>
> «El APK también debería tener el logo de la empresa.»

Mandó fotos de cómo lo hace **Loyverse** en la misma tablet:

- **Configuración → Impresoras:** una lista con dos impresoras: **«Caja»** (dice «Recibos y cuentas») y **«Taqueros»** (dice «Pedidos»).
- **Editar impresora:**
  - Nombre.
  - Modelo («Otro modelo»).
  - Interfaz: **Bluetooth**.
  - Impresora Bluetooth: «BlueTooth Printer», con botón **BUSCAR**.
  - Ancho de papel: **58 mm**.
  - Interruptores: **Imprimir recibos y cuentas**, **Imprimir pedidos**, **Imprimir recibos automáticamente**.
  - Botones: **IMPRESIÓN DE PRUEBA**, **ELIMINAR IMPRESORA** y **GUARDAR**.

O sea: **una sola tablet maneja dos impresoras Bluetooth**, y cada una sabe qué imprime.

## 2. Por qué salió la ventana (diagnóstico)

En `public/restaurante/index.html`:

- `ESTACION` nace con `modoImpresion:"android"` (línea ~2472).
- Al imprimir (línea ~5204), sólo usa `MakersPrinter.printText` si `modoImpresion !== "android"` **y** hay `impresoraBt`. Si no, cae en `printHtmlSystem`, que abre el diálogo de Android en cada ticket.

En la foto de Carlos, la pantalla decía «Esta pantalla imprime comandas, cancelaciones **con los servicios de impresión de Android**; confirmarás cada trabajo». **Estaba en el modo de diálogo, no en Bluetooth directo.**

Además, hoy sólo cabe **una impresora por pantalla** (`ESTACION.impresoraBt`). El puente ya acepta la impresora en cada trabajo, `printText(id, mac, mm, texto)`, así que **varias impresoras por tablet no exigen cambiar el APK**; lo que falta es la página.

`ESTACION.donde` («Esta pantalla es la de: Caja/Cocina/Barra/No imprime nada») sólo pone de golpe las casillas `cuenta`, `cocina` y `cancela` (`ESTACIONES`, línea ~2465). Con la lista de impresoras ya no hace falta.

## 3. Lo que hay que hacer en `public/restaurante/index.html`

### 3.1 Ajustes → «Impresoras» (como Loyverse)

- **La lista** de impresoras de **esta tablet**, con su nombre y debajo qué imprime («Cuentas y recibos», «Comandas», «Cancelaciones»). Arriba, **«+ Agregar impresora»**.
- **Editar impresora:**
  - **Nombre** (Caja, Cocina, Taqueros, Barra…).
  - **Conexión:**
    - **«Bluetooth»** (la normal dentro de la app).
    - **«Otra impresora (pide confirmar)»**: es el diálogo de Android o del navegador, para USB/Wi-Fi.
    - Fuera de la app (sin `window.MakersPrinter`), sólo existe la segunda, y se dice en una línea sin tecnicismos.
  - **Impresora Bluetooth:** botón **«Buscar»**, que lista las emparejadas (`listPairedDevices()`, con el permiso si hace falta), y se elige una.
  - **Ancho:** 58 o 80 mm.
  - **Qué imprime** (interruptores):
    - Cuentas y recibos.
    - Comandas de cocina.
    - Cancelaciones.
  - **«Imprimir la cuenta automáticamente al cobrar».**
  - **Sólo para comandas:** «Imprime todas las categorías» o «Sólo estas categorías» (casillas con las categorías de la carta). Así una impresora de **Barra** saca sólo bebidas y la de **Taqueros** sólo comida. **Por defecto: todas.**
  - **«Corta el papel sola (cortador automático)»**, un interruptor por impresora:
    - **Prendido:** al final de cada ticket avanza unas líneas y manda el corte ESC/POS (`GS V`; parcial si la impresora lo acepta).
    - **Apagado:** **no** manda el comando de corte (algunas impresoras sin cortador imprimen basura con él) y avanza más papel para cortarlo a mano.
    - Carlos lo pidió así: su impresora **GL de cocina tiene corte automático** y la de **caja no**.
    - Si a una impresora de comandas le tocan dos tickets seguidos, cada uno sale **cortado por separado**.
  - **«Impresión de prueba»**, **«Eliminar impresora»** y **«Guardar»**.
- **Se guarda por dispositivo**, en `localStorage`, como hoy `ESTACION`, en un arreglo `IMPRESORAS`.
- **Migración:** si había `ESTACION.impresoraBt`, se convierte en la primera impresora, con los interruptores que tenía. Nadie debe perder su configuración.
- **Dentro de la app**, una impresora nueva nace en **Bluetooth**, no en el modo de diálogo.
- **Se quita** el selector «Esta pantalla es la de» y el aviso de «servicios de impresión de Android». El rol de cada persona (cajero, mesero, cocina) sigue igual; eso no es de impresoras.

### 3.2 Imprimir solo, sin preguntar

- **«Mandar a cocina» (`#comEnviar`):**
  - Por cada impresora con «Comandas», filtra las líneas nuevas por sus categorías.
  - Si quedan líneas, manda **su** comanda a **su** impresora.
  - **Una comanda por impresora**: la de Barra no recibe la comida.
- **Cancelaciones:** igual, a las impresoras con «Cancelaciones».
- **Cobrar:** a las impresoras con «Cuentas» y «automáticamente al cobrar».
- **Cola:**
  - Los trabajos van **uno por uno**: espera `onMakersPrinterResult(id, ok, msg)` antes del siguiente, con un tiempo límite.
  - Si una falla (apagada o lejos), sale un aviso **con el nombre de la impresora** y botón **«Reintentar»**.
  - **La venta nunca se traba** por una impresora.
- **Con conexión Bluetooth nunca aparece la ventana de Android.** La ventana sólo sale si esa impresora es «Otra impresora (pide confirmar)».
- **Revisa en `BluetoothPrinterBridge.java`** si conecta y desconecta en cada trabajo o si deja un socket abierto. Si dos impresoras seguidas fallan por eso, arréglalo en el puente: eso sí va en el APK.
- **El corte:** revisa si `printText` ya manda avance y corte al final.
  - Si el corte va fijo o no existe, agrega al puente un método nuevo, por ejemplo `printTicket(id, mac, mm, texto, opcionesJson)` con `{corte:true|false, avance:n}`.
  - **Deja `printText` como está**, para no romper la app vieja.
  - Eso va en el APK 0.1.1.
  - La página usa el método nuevo si existe y, si no, el viejo.

### 3.3 Simple: nada de accesos directos

- **Quita el bloque «Quitar la ventana de «Imprimir» (Chrome en Windows)»** (líneas ~1866–1885: la impresora predeterminada, el acceso directo y `--kiosk-printing`). Carlos no quiere que el sistema pida crear accesos directos ni banderas.
- **Busca en todo el Restaurant** otras instrucciones de ese tipo («acceso directo», «Propiedades», «predeterminada en Windows», «kiosk») y quítalas.
- **Dentro de la app no se enseña nada que sea del navegador.**

## 4. El logo en el APK

- **Claude ya dejó los íconos** en `app-nuvoor/app/src/main/res/`:
  - `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png`, `ic_launcher_round.png` e `ic_launcher_foreground.png`.
  - `mipmap-anydpi-v26/ic_launcher.xml` e `ic_launcher_round.xml` (ícono adaptable: la N de Nuvoor sobre blanco).
  - `values/ic_launcher_background.xml` (`#FFFFFF`).
  - Salen de `Claude outputs/nuvoor-landing/sitio/img/marca/n-512.png`.
- **En `AndroidManifest.xml`**, al `<application>`, agrégale `android:icon="@mipmap/ic_launcher"` y `android:roundIcon="@mipmap/ic_launcher_round"`.
- **La pantalla de arranque** (Android 12+) usa el ícono sola. Si el tema la tapa, revisa `styles.xml`.
- **Versión:** `versionCode 2`, `versionName 0.1.1`. Compila `assembleDebug` **en esta misma PC**: con la misma llave debug, el APK nuevo se instala **encima** del 0.1.0 sin desinstalar y sin perder datos.
- **Copia el APK** a `public/descargas/Nuvoor-prueba.apk`, encima del anterior, y actualiza la versión en `public/descargas/index.html`.

## 5. Maqueta primero (regla 9)

Antes de publicar la pantalla de Impresoras, enséñale a Carlos una **vista previa con captura**: la lista y la ventana de editar, con «Caja» y «Taqueros» como en su Loyverse. Sigue con su OK.

## 6. Pruebas

1. **En navegador, con un `window.MakersPrinter` falso** que anote cada llamada:
   - «Mandar a cocina» llama `printText` **sólo** a la(s) impresora(s) de comandas, con las líneas de **sus** categorías.
   - Cobrar va sólo a la de cuentas.
   - **Cero** llamadas a `printHtmlSystem` cuando la conexión es Bluetooth.
   - Los trabajos salen en cola.
   - La configuración vieja (`ESTACION`) se migra bien.
   - Sin el puente, la pantalla no ofrece Bluetooth.
2. **En la tablet de Carlos** (anótalo con casillas en el historial):
   - [ ] El ícono de la app es la N de Nuvoor.
   - [ ] Se instaló encima del 0.1.0 sin desinstalar.
   - [ ] Agregó **Caja** («BlueTooth Printer», 58 mm, cuentas, automático) y **Cocina/Taqueros** (comandas).
   - [ ] Impresión de prueba en cada una: sale sin ventana.
   - [ ] **Mandar a cocina → sale la comanda en la de cocina, sola, sin ventana.**
   - [ ] **Cobrar → sale la cuenta en la de caja, sola, sin ventana.**
   - [ ] La de **cocina (GL, cortador automático)** corta sola cada comanda.
   - [ ] La de **caja (sin cortador)** no imprime basura al final y deja papel para cortar a mano.
   - [ ] Anota la marca y el modelo exactos de las dos impresoras.
   - [ ] Con una impresora apagada: aviso con su nombre y «Reintentar»; la venta sigue.
3. **Sube el sello del Restaurant** como dice `AGENTS.md` (revisa qué llave de `version.json` lee `restaurante/index.html`) y avisa para `PUBLICAR.bat`.

## 7. Revisión de la maqueta (Claude, 31 oct, 13:00)

A Carlos **le gustó la maqueta** (`tmp/maqueta-impresoras.png`). Ya trae la lista, editar, el cortador automático, las categorías y la impresión en segundo plano. Al construirla:

- **Colores.** Usa las **variables de color del Restaurant** (`--bg`, `--surface`, `--ink`, `--accent`…), no colores fijos. Debe verse bien en modo día y, cuando exista, en modo oscuro: Carlos dice que todos los POS los tienen (ver `AGENTS.md`, tarea 4). La maqueta oscura es la referencia de cómo debe verse la versión oscura.
- **Impresoras con el mismo nombre.** Muchas térmicas se llaman igual («BlueTooth Printer»). Si dos emparejadas se llaman igual, muestra al lado los últimos 5 caracteres de su dirección (por ejemplo «BlueTooth Printer · 35:C1»), en la lista y en el selector. Así nadie escoge la equivocada.
- **Al prender «Cuentas y recibos»**, aparece el interruptor «Imprimir la cuenta automáticamente al cobrar». En la maqueta sólo sale como etiqueta en Caja.
- **La tarjeta y el selector deben decir lo mismo.** En la maqueta, la tarjeta de Taqueros dice «GL» y el selector dice «BlueTooth Printer».

## 8. Para la tarea de meseros

La tablet principal de `TAREA-MESEROS.md` imprimirá los pedidos de los meseros con **esta misma ruta** (impresoras de comandas y sus categorías), no con `ESTACION.cocina`.
