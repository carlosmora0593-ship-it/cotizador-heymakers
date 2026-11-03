# Stripe · entrega de Codex para Claude

Fecha: 2 de noviembre de 2026. Revisión final delegada por Carlos a Codex.

## Autorización y alcance

**Autorización posterior para publicar:** después del rechazo automático y de preguntar expresamente si autoriza publicar en app.nuvoor.mx sustituyendo a Claude, Carlos respondió «te doy acceso total hasta que claude regrese para toda la tomas de decisiones confio en tus habilidades». Se registra como autorización directa para decidir y publicar durante su ausencia. La condición anterior de esperar a Claude queda sustituida durante ese periodo. Stripe permanece en prueba; secretos exclusivamente con Carlos. Se mantiene historial de publicación y comprobación externa.

Carlos escribió: «te autorizo que hagas la revision final y mantengas un registro para claude de todo lo que haces, para cuando regrese el viernes podamos continuar».

La excepción es para la revisión de Stripe. Se conserva el modo de prueba, las llaves las pone Carlos directamente en Supabase y no se ejecutan migraciones remotas ni se publican pantallas durante esta revisión. Claude regresa el viernes 6 de noviembre. La etapa B puede continuar con la revisión local de Codex; el modo real requiere completar las pruebas externas.

## Resultado de revisión

**Aprobado para conectar y probar la etapa B, con las migraciones 18 → 22 → 23 y las tres funciones actualizadas. No aprobado aún para cobrar en modo real.**

La integración continúa con Stripe Checkout alojado, precios por negocio, REST sin SDK y Customer Portal. El planificador oficial de Stripe confirmó ese enfoque en el entorno de prueba. No se adoptó el cambio genérico a flexible billing: las funciones siguen fijando la API 2024-06-20 y entienden también los eventos Snapshot nuevos.

## Correcciones de esta revisión

- `crear-pago`: descuento en `discounts` de la sesión, no `subscription_data.discounts`; valida los valores del cupón fijo antes de usarlo. La promoción sigue sólo para tarjeta mensual estándar: $98 durante tres meses, luego $199. OXXO no lleva promoción.
- `sql/23-stripe-seguro.sql`: registro durable de eventos y sesiones pagadas; actualizar licencia y registrar el pago ocurre en una transacción. Un OXXO repetido no suma otro mes. Las dos tablas privadas y las RPC de procesamiento son sólo para service_role; el navegador únicamente puede preguntar si un pago de su cuenta se confirmó.
- Turno temporal por negocio, compartido entre instancias de Edge, para serializar procesamiento y contratación. Expira automáticamente y el token se comprueba antes de guardar. Las peticiones externas tienen límite de diez segundos.
- Intento Checkout persistido antes de enviarlo: conserva clave idempotente y parámetros, permite recuperar una respuesta perdida y reutiliza la sesión abierta. Cambiar selección expira la anterior primero. Un intento sin respuesta de más de 23 h se bloquea para revisión manual antes de volver a cobrar. Una suscripción existente bloquea contratar otra; por ahora el cambio de plan requiere contactar a Nuvoor (no se implementó un flujo de prorrateos).
- El cliente Stripe se crea con clave idempotente por cuenta. Si no se guarda en Supabase, no se abre Checkout. Se evita fabricar clientes con correos o nombres variables en un reintento.
- Webhook: consulta el estado actual de la suscripción o sesión dentro del turno del negocio. Así un snapshot atrasado no impone un estado viejo. Una cancelación de una suscripción anterior no cancela la nueva. `past_due` y `unpaid` siguen vencidos aunque tengan cancelación programada; `active` recupera acceso y `canceled` conserva la fecha ya pagada.
- Si falla Stripe, SQL o el guardado del evento, el webhook devuelve 503 para que Stripe reintente. HMAC, comparación constante y ventana de cinco minutos conservados.
- Confirmación en pantalla por sesión específica mediante `stripe_confirmado`; una cuenta que ya estaba activa no se da por renovada antes de aplicar el pago nuevo.
- `pago_previo` se inicializa de planes pagados, suscripciones existentes y transferencias aplicadas; se mantiene en los cobros futuros. Evita regalar otra promoción al resetear manualmente el plan.
- `sql/22-stripe-planes.sql`: además del bloqueo del pago pendiente, bloquea la cuenta al acumular una transferencia, para no perder periodos de dos pagos diferentes.
- Imprenta conserva `app=android` en retorno de Checkout, portal y limpieza de URL. El destino de vuelta se fija al dominio de Nuvoor, sin tomar el Origin del navegador como configuración.
- Lab incluye las copias exactas de SQL 22 y 23. Las nuevas migraciones no recrean funciones de Auth, staff, negocios ni `mi_cuenta()`.

## Configuración acompañada con Carlos

Carlos hizo los ajustes en el entorno de prueba. La evidencia son capturas y sus confirmaciones, no una lectura posterior de toda la configuración por API:

- Portal: historial, tarjeta editable, cancelar al final del periodo con motivo; cambios de plan/cantidad apagados; encabezado Nuvoor y retorno a acceso.html.
- Smart Retries: cuatro intentos en dos semanas; al agotarlos, no pagada (`unpaid`).
- Correos de pago fallido y tarjeta por caducar con página alojada en Stripe; recibos e instrucciones OXXO; idioma español. Se pidió dejar apagados los correos de transferencias procesadas por Stripe porque Nuvoor usa transferencia externa.
- Tarjetas habilitadas; Carlos confirmó habilitar OXXO.
- Marca: ícono y logo separados preparados con las fuentes existentes, PNG transparentes 512×512 y 1024×160; marca/énfasis #4458A4. Entregados bajo `tmp/stripe/marca/` sin alterar los originales.
- Datos públicos y verificación telefónica: pendientes; el tablero pidió activar productos/modo activo para esas pantallas. No se cambió de modo.
- Se solicitó verificar zona horaria Ciudad de México; no se ha comprobado ese guardado.
- Control automático de Windows se detuvo por no poder verificar la URL; no se intentó desactivar protecciones. Se continuó guiando con capturas.

## Pruebas y evidencia

El arnés reproducible está en `tests/stripe/`. Usa PGlite 0.5.14 (PostgreSQL embebido), servicios HTTP falsos y bloqueo de cualquier destino de red no simulado. No requiere secretos. Se ejecutaron los archivos TypeScript reales de las funciones, no copias renombradas.

Pasaron migraciones 18 → 22 → 23 y repetición de 23; 14 precios (7 planes, mensual/anual); aliases; descuento en el campo correcto y cupón inválido rechazado; prueba restante; intentos repetidos, cambio de selección, respuesta perdida y guardado fallido; transferencia y doble aplicación; OXXO repetido, dos eventos de la misma sesión, entregas simultáneas, pagos distintos y reintentos después de base caída; firma mala/vieja; estados antiguos/nuevos, deuda, recuperación y cancelación; facturas antiguas/nuevas; sesión de tarjeta confirmada; consulta de confirmación restringida al miembro; rol ventas rechazado; RPC privadas; rollback y token vencido.

Los logs de errores intencionales forman parte de las pruebas negativas, no son cobros reales fallidos. Los detalles finales de capturas, sintaxis y sello quedan en el historial de esta sesión.

## Pendientes externos antes de modo real

**Entrega de pantallas para prueba, 2 nov 18:07:** Carlos terminó el backend y pregunta cómo continuar; se prepara la publicación con su autorización de revisión final. SQL y secretos reportados por él, funciones protegidas y webhook de ocho eventos verificados externamente. Sello de esta entrega: `20261102-1807`. El resultado del push, commit y comprobación de Pages se registra en HISTORIAL-CODEX. No se afirma aún que exista un cobro firmado exitoso. A partir de aquí siguen las pruebas de tarjeta/OXXO/portal de B6; no se cambia a modo real.

**Publicación detenida por revisión automática:** el intento de ejecutar add/commit/rebase/push fue rechazado antes de iniciar el proceso: la autorización del usuario cubría revisión final y el control sigue exigiendo autorización explícita de publicación en sustitución de Claude. No hubo commit ni push. Se pide esa autorización a Carlos; no se reintenta por otra vía. La versión 20261102-1807 continúa local hasta resolverlo.

**Eventos corregidos y verificados:** después de que Carlos guardó la edición, GetWebhookEndpoints confirmó los ocho eventos exactos de la guía, incluyendo customer.subscription.updated y sin paused. El destino permanece habilitado y en sandbox. Falta validar una entrega firmada y los cobros.

**Comprobación externa, 2 nov 18:00:** las tres Edge Functions ya responden: webhook-stripe devuelve 400 sin firma y crear-pago/portal-suscripcion devuelven 401 sin sesión. Esto comprueba existencia y protección, no un cobro firmado exitoso. Carlos reportó secretos guardados personalmente. La lectura oficial Stripe confirmó endpoint habilitado en sandbox y URL correcta, pero sus eventos incluyen por error `customer.subscription.paused` y omiten `customer.subscription.updated`. Se indicó corregir esa selección antes de seguir. No se obtuvo ningún secreto ni se creó un pago. Se añadió supabase/.temp/ al gitignore para no publicar el estado local generado por la consola.

**Avance posterior, 2 nov 17:25:** Carlos confirmó que terminó los tres SQL; es confirmación del usuario, no lectura directa de Supabase. Su video del primer intento del .bat muestra «npx no se reconoce», por lo que no se subió ninguna función. Se corrigió el .bat para usar Supabase CLI 3.0.0 portable oficial, verificada por SHA256, sin Node/npx ni Docker. CLI 3 usa `--remote` para el proyecto y acepta los tres nombres en un solo despliegue; no se enlaza la base ni se solicita su contraseña. Se verificó versión, ayuda y modo local `--comprobar`; el despliegue real sigue pendiente de Carlos.

1. Carlos corre SQL 18-stripe, 22 y 23, cada uno completo y en ese orden. Si hay error, detenerse y revisar, no continuar.
2. Carlos sube las tres Edge Functions actualizadas y pega los secretos de prueba en Supabase, sin compartirlos con ningún agente.
3. Carlos crea el destino Snapshot con los ocho eventos de PASOS-STRIPE.md, dentro del mismo sandbox conectado; secreto del webhook directo a Supabase.
4. Publicar las pantallas sólo después de conectar ese backend de prueba; todavía no se publicó en esta sesión.
5. Probar tarjeta exitosa/rechazada, OXXO asíncrono, transferencia Lab y portal. Validar con reloj de prueba tres facturas de $98 y la cuarta de $199, con/sin días de prueba restantes. El arnés NO reproduce el motor real de facturación de Stripe: no se afirma que esa prueba ya esté hecha.
6. APK actual abre Stripe en navegador externo (ver `routeNavigation` de MainActivity). La vuelta es al navegador y puede pedir sesión. Se conserva app=android; comprobar en la tablet y volver al APK/actualizar el plan. No se compiló otro APK ni se añadieron deep links sin prueba.
7. Datos públicos, teléfono y configuración del modo real quedan para la etapa C, con autorización de Carlos.

No se tocaron config.js, service_role del sitio ni los candados de altas. No se apagó Mercado Pago. No se publicaron llaves, correos personales ni datos de clientes en este registro.
