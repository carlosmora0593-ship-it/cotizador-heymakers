# Correos de Nuvoor · estado del 14 de noviembre de 2026

## Listo y comprobado

- Dominio **nuvoor.mx** creado y verificado en Resend.
- Los cuatro registros de Resend están guardados en GoDaddy. Se conservaron los MX, SPF, DKIM y DMARC del correo principal, y los registros del sitio.
- SMTP personalizado de Supabase: `smtp.resend.com`, TLS por puerto `465`, usuario `resend`, nombre de envío **Nuvoor** y límite de **100 correos por hora**.
- SMTP usa una llave separada de **Sending access**, restringida al dominio. Su copia temporal de recuperación se retiró del entorno local.
- Una prueba real de SMTP fue aceptada y Resend la reportó **entregada**. Esto comprueba el transporte de correo; no constituye una invitación de personal aceptada.

La dirección personal del remitente elegido se conserva en la configuración remota y en el contexto privado de la sesión. No se escribe aquí, en el repositorio ni en HISTORIAL-CODEX. La propuesta anterior de usar `correo.nuvoor.mx` se sustituyó por verificar el dominio principal, para autorizar el remitente solicitado.

## Acceso del personal de Restaurant

Pantallas de la entrega **20261114-2330**:

- Invitación desde **Restaurant → Personal → Acceso desde celular** y **Lab → Negocios y cuentas → Personal Restaurant**.
- Un perfil por persona y negocio; **15 accesos en Estándar**, **40 compartidos entre Restaurant con plan Multisucursal y el mismo administrador principal**.
- Confirmación mediante código de correo, contraseña propia y PIN diario. La aplicación no entrega las contraseñas al gerente ni las guarda en el navegador.
- Permisos de operación validados en el servidor. El personal no recibe una membresía de administrador.
- Desactivar el expediente o retirar el acceso invalida el acceso y libera su cupo.
- Los cobros desde el perfil del personal se confirman con conexión. Si se pierde la red, el pedido conserva su estado pendiente. La caja del titular mantiene su respaldo sin conexión anterior.

La nueva función `invitar-personal-restaurant` genera el código con Supabase Auth y prepara un correo en español mediante Resend. La vinculación se guarda **antes** del envío; sólo se marca «Enviada» después de que el proveedor lo acepta. El botón abre la confirmación y el trabajador escribe su código, evitando consumir el acceso mediante la previsualización del correo.

Los dos secretos del servidor están instalados y comprobados por nombre: `RESTAURANT_EMAIL_KEY` (sólo envío, limitada al dominio) y `RESTAURANT_EMAIL_FROM`. La función `invitar-personal-restaurant` ya está desplegada. La llamada sin sesión devuelve 401 y la preconsulta de conexión responde correctamente. Nunca colocar los valores de los secretos en archivos, argumentos escritos con la llave literal, capturas ni mensajes.

## Pendiente antes de activar

La última revisión del portal pasó en Chrome móvil: código, contraseña propia, primer PIN y perfil correcto. También pasaron mesero/cajero sobre la misma base, el cobro desde su perfil, la protección contra PIN compartidos y la caja anterior sin SQL 38. La operación del dueño conserva su funcionamiento mientras no esté instalado el SQL de personal.

1. Carlos ejecuta **38-restaurant-personal.sql**, incluido en **Lab → Base de datos**, después de las migraciones anteriores. No dejar una migración antigua de permisos como última versión. Antes de instalarlo, la tarjeta de invitaciones explica este requisito; no simula envíos.
2. Hacer una invitación real al destinatario de prueba autorizado en el chat y verificar aceptación y entrada. El código y la contraseña los introduce su dueño; no pedirlos por chat. La prueba SMTP entregada no sustituye esta comprobación.

El SQL 38 actualizado en Lab incluye la protección contra PIN compartidos (`6792dba`). Si se copió una revisión anterior, volver a copiar la actual; es repetible.

La revisión automática se restableció. La configuración y el despliegue se completaron mediante la misma vía autorizada, sin extraer credenciales de la sesión de la CLI. Se retiró la copia temporal de la llave de personal del entorno de usuario. No se ejecutó SQL en producción.

## Plantillas generales de Auth

Los asuntos de invitación y código se actualizaron al español mediante la CLI. El cuerpo HTML remoto no quedó verificado; no presentarlo como instalado. Los archivos genéricos están en `supabase/templates/invite.html` y `supabase/templates/magic-link.html`. La invitación específica del personal usa su propia plantilla en la función nueva y no depende de reemplazar la de Imprenta.

## Protección de las llaves

Las variables temporales de configuración deben retirarse cuando se complete y compruebe el despliegue. Revocar únicamente las llaves temporales identificadas, preservando las de envío que estén en uso. Nunca imprimir ni copiar su valor para verificarlo; revisar presencia, nombre, permiso o estado del proveedor.

Las altas públicas y Stripe conservan su política vigente. Esta configuración de correo no autoriza cobros reales ni nuevos accesos administrativos.
