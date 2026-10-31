# Nuvoor para Android · APK de prueba

Esta app de prueba abre **en vivo** `https://app.nuvoor.mx/restaurante/` en un WebView. No contiene una copia del Restaurant y no depende de Netlify ni de `assets/www`.

## Identidad y compilación

- `applicationId` y `namespace`: `mx.nuvoor.app`.
- Nombre visible: `Nuvoor`.
- Versión actual: `versionCode 2`, `versionName 0.1.1`.
- Android API 37.0 (compilar y destino) y Build Tools 36.0.0.
- JBR de Android Studio: Java 25. El proyecto usa AGP 9.1.1 y Gradle 9.3.1 para admitir ese JBR y API 37.
- APK: `app/build/outputs/apk/debug/app-debug.apk`.

Para compilar desde PowerShell en la carpeta del repositorio:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'C:\Users\hp\AppData\Local\Android\Sdk'
$env:GRADLE_USER_HOME = (Join-Path (Get-Location) 'tmp\gradle-user-home')
& '.\app-nuvoor\gradlew.bat' -p '.\app-nuvoor' assembleDebug
```

El APK debug usa la firma de depuración automática de Android. No se creó una llave de publicación ni se guardaron contraseñas. Un APK firmado después desde Android Studio tendrá otra firma; Android puede pedir desinstalar el APK debug para cambiar al firmado, lo que borra los datos locales de esa instalación. Haz un respaldo antes de cambiar de firma.

## Incluido en esta prueba

- Mantiene intacto el puente `MakersPrinter` (`BluetoothPrinterBridge`) de `android-native/`.
- Sólo las páginas HTTPS de `app.nuvoor.mx` se abren dentro. Los enlaces externos se envían a otra app con un `Intent`.
- El botón Atrás vuelve en el historial del WebView.
- El selector del sistema permite elegir un respaldo para restaurarlo.
- «Bajar respaldo» entrega el archivo Blob a Android y lo guarda en Descargas (o pide elegir dónde guardarlo en versiones antiguas de Android).
- Oculta la instalación y actualización del APK viejo de Restaurant dentro de esta app.
- Configura varias impresoras Bluetooth por tablet, rutas para cuentas/comandas/cancelaciones, filtro por categoría, cola de impresión, reintento y corte ESC/POS opcional.

## Pendiente para la siguiente versión

Todavía no se implementa ni prueba:

- `window.print()` con el diálogo de impresión Android.
- Ventanas `window.open()` y enlaces con `target="_blank"`.
- Permisos de cámara y `getUserMedia`.
- Compartir con `navigator.share`.
- Pantalla sin conexión y uso en modo avión.
- Persistencia de sesión tras cerrar y volver a abrir.
- Descargas de enlaces que no sean Blob.
- Instalación en tablet y prueba física de cada impresora Bluetooth.
- El control de corte automático requiere `printTicket` de la versión 0.1.1; `printText` conserva el formato anterior.

El puente Bluetooth está en la app, pero sólo la prueba en las tablets de Carlos confirma que cada impresora recibe las comandas.

## Scripts heredados del proyecto anterior

No ejecutes `BUILD-RELEASE.bat` ni `Build-Release.ps1` en esta copia. Son del Restaurant anterior: esperan el ZIP de firma viejo, copian `PRUEBA-restaurant.html` y preparan la publicación anterior; no son parte de la compilación de Nuvoor. Para esta prueba se usó `gradlew.bat assembleDebug`.
