# Tiendita Makers

La aplicación de abarrotes está en `public/tiendita/` y aparece en Makers Lab como una edición separada. Para abrirla en la computadora se puede usar `PRUEBA-tiendita.html`; para publicarla, la carpeta `public/` ya contiene la ruta `/tiendita/`.

## Módulos

- Inicio con indicadores, accesos rápidos, actividad y anuncios vigentes publicados por Makers Lab en el dashboard y la pantalla de bloqueo. Tiendita no permite editarlos.
- Venta rápida para artículos con inventario y servicios sin inventario; pagos en efectivo, tarjeta o transferencia, cambio y ticket.
- Catálogo con imágenes, categorías, precio, costo, unidad, existencias, mínimos, caducidad, clave de barras y sugerencias SAT.
- Compras a proveedores con pedidos pendientes, contacto por WhatsApp y recepción que aumenta existencias y actualiza costos.
- Agenda opcional para barbería, estética y servicios; se activa desde Ajustes e incluye calendario mensual interactivo, responsable, duración, estado y acceso de confirmación por WhatsApp.
- Reloj checador para marcar entrada y salida por usuario.
- Caja por turno, fondo inicial, entradas/salidas, efectivo esperado y cierre con diferencia.
- Ventas como historial de tickets; Reportes como análisis de periodo, promedio, unidades, utilidad estimada, artículos principales, formas de pago y tendencia semanal.
- Usuarios de la cuenta: lista del equipo e invitación individual desde la cuenta Makers.
- Ajustes para giro del negocio, activar o desactivar citas, impresoras, lectores y bloqueo por inactividad. La publicidad se administra en Makers Lab.
- Diseño adaptable a computadora, tablet y teléfono, con animaciones de navegación y botones.

## Datos y periféricos

Inventario, ventas y caja conservan la sincronización de cuenta ya existente, sujeta al plan y permisos de Makers. Compras, agenda, asistencia, preferencias y bloqueo se guardan en el almacenamiento local de cada dispositivo en esta entrega; todavía no se comparten entre dispositivos. Los anuncios se consultan desde Makers Lab en modo de solo lectura.

Los lectores USB/Bluetooth que escriben como teclado funcionan en el campo de búsqueda. El escaneo con cámara depende de que el navegador ofrezca `BarcodeDetector`. En navegador, los tickets usan el diálogo de impresión del dispositivo. La impresión directa ESC/POS Bluetooth requiere que el APK de Tiendita exponga el puente Android; la página detecta ese puente cuando está presente y, si no, conserva la impresión del sistema. Esto no garantiza compatibilidad directa con cualquier impresora o protocolo.

## Uso inicial

1. Abre el punto de venta, revisa el aviso de catálogo de ejemplo y quita esos artículos o edita sus datos reales.
2. En Catálogo, agrega productos o servicios; puedes subir una foto. Para un lector de teclado, escanea directamente en la búsqueda. Para usar la cámara, abre Ajustes → Escanear con cámara.
3. Abre la caja con el fondo inicial del cajón.
4. Agrega artículos o servicios y cobra. Para cobro en efectivo captura lo recibido y la app calcula el cambio.
5. Cierra el turno contando el efectivo real. La app muestra la diferencia contra el monto esperado.
6. Para un pedido, ve a Compras, elige proveedor, producto y cantidad; puedes abrir WhatsApp con el mensaje preparado. Marca el pedido como recibido cuando llegue para sumar existencias.
7. Agrega servicios en Catálogo, activa Agenda en Ajustes y selecciona un día del calendario para consultar o crear citas. Ajusta el PIN y el tiempo de bloqueo ahí mismo.
8. Conecta una cuenta Tiendita Makers para usar el equipo y sincronizar inventario, ventas y caja cuando el plan lo permite.

Las sugerencias SAT son un punto de partida: quien emite la factura es responsable de seleccionar la clave correcta.
