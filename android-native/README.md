# Makers Restaurant Android con impresión

Este proyecto incluye la página actual del restaurante dentro del APK y añade un puente nativo de Android para impresoras térmicas Bluetooth Classic que aceptan ESC/POS. No necesita esperar a que Netlify publique cada cambio de pantalla. Desde Ajustes de la app se pueden mostrar los dispositivos ya emparejados, elegir el ancho de papel y mandar una prueba.

## Flujo de uso

1. En Android, empareja la impresora desde Ajustes → Bluetooth.
2. Abre Makers Restaurant → Ajustes → Tickets e impresión.
3. Para Bluetooth, selecciona **Bluetooth directo · ESC/POS**, pulsa **Buscar emparejadas**, elige la impresora, guarda y pulsa **Imprimir prueba**. Para USB, Wi-Fi u otros protocolos, selecciona **Servicios de impresión Android** y usa la prueba para abrir el selector del sistema.
4. Marca la estación como Caja o Cocina y activa la impresión automática que corresponda. Bluetooth ESC/POS se envía directo; el selector de Android pide confirmación en cada ticket.

## Buscar actualizaciones desde la tablet

En Inicio, pulsa **Buscar actualizaciones**. La app compara su `versionCode` con `public/restaurante/version.json`; si hay una nueva, el botón abre la descarga del APK publicado. Android descarga el archivo y solicita que confirmes la instalación. No se instala en silencio. Para cada lanzamiento nuevo, aumenta `versionCode` y `versionName` en `app/build.gradle.kts`, compila y publica la carpeta `public/restaurante/`.

La salida directa Bluetooth usa texto ESC/POS y alimentación de papel. Se dirige la comanda al mandar artículos a cocina y el recibo al cobrar, siguiendo las casillas que ya existen en la app. La pantalla utiliza el mismo origen de Netlify para conservar el comportamiento web dentro del almacenamiento privado del APK; las funciones principales quedan dentro de la aplicación. El sistema de impresión de Android queda disponible como alternativa para impresoras con un servicio de impresión instalado. Ese diálogo requiere confirmar cada trabajo.

Las fotos muestran una Gomita My-A1 que declara ESC/POS y una POS-5890 de 58 mm con Bluetooth/USB. La segunda debe confirmarse con la prueba: la etiqueta no identifica el protocolo. La interfaz prepara perfiles de 58 y 80 mm. No existe una conexión única que garantice todos los modelos, protocolos y servicios propietarios.

## Preparar APK firmado

El proyecto usa el identificador `com.heymakers.restaurant`, el mismo que el APK actual. Para instalarlo como actualización se debe firmar con la misma llave de PWABuilder. El script `BUILD-RELEASE.bat` busca el ZIP firmado en Descargas, extrae temporalmente la llave, compila el APK y limpia la copia temporal. No imprime ni guarda las contraseñas en el proyecto.

Requisitos en Windows: Android Studio con JDK 17 y Android SDK Platform 35. El script usa el JDK incluido en Android Studio y descarga Gradle 8.13 automáticamente si hace falta, verificando la suma SHA-256 oficial. También requiere conexión a internet para descargar Gradle y las dependencias de Android.

Antes de sustituir el APK que ya usas, exporta un respaldo desde Ajustes → Respaldo. La nueva versión es una app WebView y Android mantiene su almacenamiento del sitio separado del almacenamiento de Chrome/TWA; después de instalar, restaura ese respaldo.

La compilación copia `PRUEBA-restaurant.html` a los recursos Android antes de compilar, deja el APK firmado en `android-release/Makers-Restaurant.apk` y prepara `public/restaurante/` para publicar en Netlify. Para actualizar una versión existente, publica esa carpeta y luego instala el APK firmado con la misma llave.
