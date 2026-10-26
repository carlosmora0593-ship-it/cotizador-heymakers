# App de restaurante

## Fuente estable

`PRUEBA-restaurant.html` queda como la versión estable y fuente principal de Makers Restaurant. El nombre “PRUEBA” se conserva por compatibilidad con la carpeta actual; no indica que la versión publicada sea temporal.

`public/restaurante/index.html` se genera desde ese archivo y suma el manifiesto, la instalación PWA y el almacenamiento separado de la app web. El APK también incorpora la misma página al compilarse. Para que las versiones no se desalineen, los cambios del restaurante se hacen primero en `PRUEBA-restaurant.html` y luego se preparan con el script.

La carpeta instalable se publica desde `public/restaurante/`.

## Preparar o actualizar

Haz doble clic en `PREPARAR-APP-RESTAURANTE.bat`. El script toma la versión estable, agrega el manifiesto, la opción de instalación y una caché offline. También renueva la caché del service worker cuando cambia la página y separa el almacenamiento de esta app del cotizador/restaurante existente en el mismo dominio.

## Instalar

La carpeta está lista para publicarse con el sitio de Netlify existente. Una vez publicada, abre `https://tu-dominio/restaurante/` en Chrome o Edge y elige **Instalar app**. En iPhone/iPad, ábrela en Safari y usa **Compartir → Añadir a pantalla de inicio**. Un archivo abierto como `file://` no se puede instalar como PWA: requiere HTTPS.

La caché permite abrir la interfaz sin conexión después de la primera visita. Los datos del prototipo siguen guardándose en el almacenamiento local del navegador; esto todavía no crea sincronización multi-dispositivo ni respaldo compartido. El siguiente paso para una operación real es conectar usuarios, datos y respaldos a un backend seguro.

Los campos SAT ayudan a preparar los conceptos de producto. La app aún no emite ni timbra CFDI; eso requiere integrar un proveedor autorizado y mantener sus credenciales en un servicio seguro, nunca en la página del cliente.
