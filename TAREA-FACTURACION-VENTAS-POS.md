# Facturación de ventas · Imprenta, Restaurant y Store

Estado al 4 nov 2026: SQL 28 instalado y función `facturacion-ventas` desplegada con `verify_jwt=true`. Conectores en los formularios actuales probados localmente. **Falta asociar el emisor de prueba de cada negocio y probar una emisión real del proveedor por sistema.** No se ha emitido un CFDI de ventas ni activado Live.

## Solicitud y alcance

Carlos pidió integrar la facturación para los tres sistemas. Se trata de las ventas de cada negocio a sus clientes. La facturación de las suscripciones de Nuvoor ya iniciada en `facturacion-suscripcion` conserva su flujo y sus tablas.

Primera entrega propuesta: generar un CFDI de ingreso de prueba desde una venta liquidada, revisar sus datos fiscales y guardar los PDF/XML originales en un expediente privado del negocio. Conservar las pantallas y los datos existentes de cada POS. Mostrar la muestra a Carlos antes de publicar cambios grandes (AGENTS.md, regla 9).

**Corrección de Carlos, aplicada:** el emisor vive en Ajustes. No añadir una ventana o sección paralela de facturas en Imprenta: hacer funcionar los botones y tarjetas existentes. Carlos pidió continuar. La muestra de tres pestañas queda como referencia anterior, no como diseño a implementar.

## Implementación preparada

- `public/facturacion-pos.js`: controles de generar/consultar/reintentar/abrir originales dentro del formulario actual, con estado Test explícito. Sin navegación nueva ni llaves en navegador. El comprobante de prueba no marca la venta como fiscalmente facturada.
- Imprenta en `index.html` y `taller.html`: se conserva `modalFactura`, el botón secundario para preparar datos para PAC externo y la ficha de Facturación electrónica de Ajustes. El guardado opcional del receptor usa la ficha del cliente. Las ventas nuevas guardan conceptos e impuestos al cobrar.
- Restaurant: se conserva `modalFacRest` y `restaurantFiscalSettings`. Los tickets nuevos incluyen el desglose que tenían al cobrarse. No se vuelve a interpretar una cuenta antigua con precios/impuestos de hoy.
- Store: botón Facturar junto a Ver ticket; captura dentro de la misma vista Ventas. Estado del emisor en Ajustes. Campo de IVA confirmado en la ficha del producto y snapshot al vender; no inferir IVA de la categoría.
- SQL 28: emisor privado, facturas privadas por cuenta/documento, RLS, reserva con turno, petición inmutable, archivo privado `facturas-ventas`. Las funciones de asignar/reservar/escribir resultado son exclusivas del servidor.
- Función de ventas: exige usuario y membresía/rol de la cuenta; valida origen/total/pago/forma/receptor; compara organización con la llave Test asociada; conserva idempotencia, UUID, PDF/XML y huellas. Rechaza claves/respuestas Live. No envía correos.
- Fuente del detalle fiscal: snapshot guardado con la venta. El servidor valida importes, cantidades, tasas explícitas y suma contra el total cobrado; no recalcula el cotizador completo ni valida jurídicamente la clave SAT seleccionada por el negocio.
- Verificación real hecha: estructura singular `cuentas.producto` (sin depender de que esté instalada la columna opcional `productos`), función activa con JWT, OPTIONS 200 y llamadas sin sesión 401; consulta por rol autenticado real dentro de rollback, emisor/factura pendientes sin inventar datos.

Una revisión automática rechazó el primer despliegue que solicitaba `--no-verify-jwt`. Se usó la alternativa más protegida: configuración explícita `verify_jwt=true`, comprobación de sesión dentro del código y membresía por cuenta. Despliegue posterior permitido y activo; no se eludió la revisión con otra ruta. Las otras funciones no se modificaron.

### Conexión que falta

El titular guarda directamente una Test Secret Key del emisor del negocio en secretos de Supabase con nombre `FACTURAPI_POS_PRUEBA` o `FACTURAPI_POS_PRUEBA_<SUFIJO>`. No pedirla en el chat ni leer su valor. No reutilizar automáticamente la organización de suscripciones de Nuvoor.

Después, el equipo financiero autorizado del Lab puede llamar a `asignar_emisor` de `facturacion-ventas` con cuenta, sistema y **nombre** del secreto, nunca su valor. El servidor consulta la organización y guarda la asociación privada. No hay una pantalla de asignación nueva en Lab en esta primera entrega; preparar esa gestión si se quiere autoservicio para varios emisores. `Comprobar conexión` en Ajustes consulta la asociación del negocio, no modifica ni carga certificados.

No declarar que ya factura una cuenta hasta probar una venta válida con esa conexión, revisar el UUID y abrir sus originales en el sitio. La consulta de originales está permitida por el servidor con cuenta vencida; queda por revisar el acceso a ese flujo desde los botones de la interfaz suspendida de Imprenta.

No activar emisión real ni modificar precios/timbres de los planes. Los paquetes propuestos por Carlos todavía no tienen confirmación final. La revisión del emisor de Nuvoor con su contadora no sustituye el alta fiscal de los emisores de cada negocio.

## Situación encontrada

| Sistema | Datos actuales | Falta |
|---|---|---|
| Imprenta | `abreGeneraFactura`, `conceptosCFDI`, captura de receptor y registro manual de UUID. Documentos por cuenta, colección `ventas`; cuerpo `venta`. La cotización aporta el desglose de conceptos. | Emisión por proveedor, validación del desglose, estados confirmados y expediente de originales. No confundir el registro manual con timbrado automático. |
| Restaurant | `abreFacturaRest`, `renderFacturas`, captura fiscal y UUID manual. Tickets en `rest_tickets`, nube de fase 1. | Emisión por proveedor; contrato exacto del ticket y conciliación de conceptos, pagos, descuentos y propina. No rehacer la aplicación ni usar `restaurant.html` como fuente. |
| Store | Ventas `app.sales`, documentos por cuenta, colección `ventas`; cuerpo `sale`. Productos con claves SAT/unidad. | Formulario fiscal, desglose comprobable, generación, estados y archivo. No asumir que ya tiene una sección funcional de CFDI. |

Las pantallas actuales de Imprenta/Restaurant preparan datos para facturar y permiten registrar comprobantes externos; no timbran por el PAC. No retirar esa modalidad sin distinguirla de una factura emitida por la nueva conexión.

## Conexión por emisor

Facturapi admite organizaciones Multi-RFC. Crear/administrar organizaciones y llaves requiere User Key; una Test Secret Key sólo consulta su propia organización. Fuente comprobada: https://docs.facturapi.io/docs/guides/organizations/

- La conexión `FACTURAPI_LLAVE_PRUEBA` actual pertenece a la organización Nuvoor y no convierte a todos los negocios en emisores de Nuvoor.
- Diseñar una asociación privada de cuenta → emisor autorizado → organización del proveedor, con ambiente explícito. Un RFC escrito por el usuario no basta para vincular cuentas existentes.
- Si varias cuentas pertenecen al mismo titular, compartir emisor requiere verificar administración de las cuentas afectadas y autorización del titular. Mantener ventas, permisos y expedientes por cuenta.
- Secretos y certificados se capturan directamente en el panel correspondiente por el titular. No pedirlos por chat ni añadir campos de claves al navegador. Una eventual User Key sólo vive en secretos de servidor y no habilita Live por sí sola.
- Definir el alta administrada antes de pedir otra credencial. La conexión actual de suscripciones no debe ampliarse a aceptar payloads fiscales arbitrarios.

## Flujo propuesto

1. Desde una venta: **Facturar**; identificar cuenta, sistema y documento origen.
2. Recuperar los datos del cliente; confirmar razón social, RFC, régimen, CP, uso y correo. Guardar modificaciones sólo con permiso y decisión explícita; la casilla de la muestra es ilustrativa.
3. Revisar emisor, conceptos, cantidades, descuentos, impuestos, forma/método de pago y total.
4. Solicitar la emisión de prueba con identificación estable de la operación. No marcar facturada antes de respuesta verificable.
5. Mostrar estado y expediente. PDF/XML originales privados; descargas con sesión y autorización vigente, sin URLs públicas permanentes.
6. Un envío o reenvío posterior usa el mismo comprobante. La muestra no envía correos; cualquier automatización de envío requiere instrucción explícita de Carlos antes de habilitarla.

El expediente y los comprobantes ya emitidos deben seguir consultables cuando se suspenden operaciones de una cuenta vencida. La generación de nuevos comprobantes requerirá la política de plan/rol que se apruebe; no convertir un botón escondido en el único control de permisos.

## Contrato técnico antes de programar

- Componente compartido: `public/facturacion-pos.js`, usando los estilos de cada POS y adaptadores en sus propias fuentes. Imprenta: `index.html` y `taller.html`, conservando sus diferencias. Restaurant: `public/restaurante/index.html`; Store: `public/tiendita/index.html`.
- Función de servidor propuesta: `facturacion-ventas`, separada de `facturacion-suscripcion`.
- Tablas nuevas propuestas, por confirmar que no colisionan: emisores fiscales, asociaciones de cuentas, facturas de ventas, eventos y una cola/arrendamiento de emisión. RLS por membresía y rol de **esa** cuenta; accesos cruzados rechazados.
- Datos de entrada: cuenta, sistema, documento origen y receptor normalizado; nunca aceptar del navegador un `organization_id`, clave, UUID, estado exitoso o precio fiscal como verdad.
- Los documentos de venta actuales son sincronizados desde clientes: capturar y congelar una versión validada para facturar. Recalcular cantidades, importes, descuentos e impuestos en servidor; contrastar con la venta liquidada y con su versión. No deducir todo el IVA dividiendo el total global.
- Facturapi requiere catálogo/estructura de conceptos coherentes. Usar los conceptos de la venta: tasas múltiples, tasa cero, exentos, descuentos y retenciones no se sustituyen con una única tasa global. Si faltan datos, pedir corrección y detener la emisión.
- Dinero con precisión decimal/céntimos y política explícita de redondeo. Comparar subtotal, traslados, retenciones y total del proveedor con el snapshot validado.
- Reserva atómica por cuenta/documento/ambiente. Dos clics o dos dispositivos no crean dos comprobantes. Payload inmutable e idempotencia estable; tras timeout consultar/reconciliar antes de crear de nuevo.
- Estados diferenciados: preparando, en proceso/proveedor pendiente, emitida, archivos pendientes, error reintentable y cancelación confirmada. Un fallo al bajar PDF no autoriza otro timbrado.
- PDF/XML privados, huellas de integridad y referencias de origen, emisor, ambiente y proveedor. URL firmada nueva al abrir. No sobrescribir originales; cancelaciones agregan eventos.
- Validar ambiente Test en la llave y en las respuestas del proveedor. Rechazar credenciales/respuestas Live en esta fase, aun con una configuración equivocada.

## Secuencia de implementación y pruebas

1. Revisar visualmente la muestra con Carlos. Elegir primero el flujo común; no rediseñar todo el POS.
2. Precisar alta de organizaciones de prueba y el contrato fiscal de cada fuente. Auditar los tickets reales con permiso y sin reproducir datos personales en archivos públicos.
3. Implementar contratos, RLS, cola, archivo privado y componente compartido. Probar con base aislada, servidor simulado y casos de dinero/duplicados/cuentas cruzadas.
4. Conectar una organización de prueba autorizada y probar una venta liquidada por sistema. Verificar respuesta, UUID, total, PDF/XML y reapertura real desde el POS publicado. Sólo entonces declarar operativo ese caso.
5. Revisar producción con los emisores y su contadora; alta CSD y habilitación Live por separado. La prueba no activa cobros ni consume los paquetes comerciales de timbres.

Primera etapa limitada: ventas nuevas totalmente pagadas que conserven snapshot fiscal; CFDI de ingreso PUE, receptor nacional con RFC propio y una forma de pago soportada. Restaurant no incluye plataformas, pagos mixtos ni cargo adicional de servicio en esta etapa. Tasas explícitas IVA 0/8/16 o exento; no implementar IEPS/retenciones con una tasa global. Anticipos, crédito/PPD, complementos, devoluciones/egresos, cancelaciones, factura global y ventas históricas sin snapshot necesitan contratos y pruebas propios antes de ofrecerlos como operativos. No esconder estas limitaciones en producción.

## Muestra privada

`C:/Users/hp/.codex/visualizations/2026/11/02/01a19e32-94ec-7732-8664-e0902d72abd1/facturacion-tres-sistemas.html`

Datos ficticios; se puede alternar entre los tres sistemas, preparar/revisar, simular resultado y abrir el expediente. No consulta APIs, emite documentos, descarga facturas ni envía mensajes. Los controles de muestra permiten revisar emisor pendiente y proveedor sin respuesta.

Pruebas locales y capturas: `tmp/facturacion-pos/`. Mantener fuera del repo público. No añadir la constancia del titular, RFC reales, datos de clientes ni secretos a esta tarea o a la muestra.
