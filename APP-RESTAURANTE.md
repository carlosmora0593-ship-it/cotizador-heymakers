# App de restaurante

La app instalable se publica desde `public/restaurante/`. Su página se genera desde `PRUEBA-restaurant.html` para que el prototipo siga siendo la fuente de trabajo.

## Preparar o actualizar

Haz doble clic en `PREPARAR-APP-RESTAURANTE.bat`. El script copia la versión actual, agrega el manifiesto, la opción de instalación y una caché offline. También cambia la versión del service worker cuando cambia la página y separa el almacenamiento de esta app del cotizador/restaurante existente en el mismo dominio.

## Instalar

La carpeta está lista para publicarse con el sitio de Netlify existente. Una vez publicada, abre `https://tu-dominio/restaurante/` en Chrome o Edge y elige **Instalar app**. En iPhone/iPad, ábrela en Safari y usa **Compartir → Añadir a pantalla de inicio**. Un archivo abierto como `file://` no se puede instalar como PWA: requiere HTTPS.

La caché permite abrir la interfaz sin conexión después de la primera visita. Los datos del prototipo siguen guardándose en el almacenamiento local del navegador; esto todavía no crea sincronización multi-dispositivo ni respaldo compartido. El siguiente paso para una operación real es conectar usuarios, datos y respaldos a un backend seguro.

Los campos SAT ayudan a preparar los conceptos de producto. La app aún no emite ni timbra CFDI; eso requiere integrar un proveedor autorizado y mantener sus credenciales en un servicio seguro, nunca en la página del cliente.
