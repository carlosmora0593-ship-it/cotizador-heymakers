# Acceso del personal de Restaurant · 14 de noviembre de 2026

## Decisiones de Carlos

- El personal recibe una invitación por correo, confirma su dirección y crea su propia contraseña.
- La administración de invitaciones se concentra en Nuvoor Lab, dentro del negocio de Restaurant.
- Se conserva un solo expediente: el perfil ya registrado en Restaurant → Personal. La invitación lo vincula con su usuario de autenticación.
- Estándar incluye **15 personas**; Multisucursal, **40 personas**. No son 40 por sucursal. Al implementar, vincular el conteo con la licencia que agrupa las sucursales, sin multiplicar el cupo al crear otra cuenta.
- El remitente temporal usa el correo del dominio **nuvoor.mx** que Carlos indicó en el chat. No se registra su dirección personal en este repositorio ni en el historial.
- Después de crear la contraseña, la sesión puede conservarse en el celular; el PIN existente de Personal y del checador se usa para volver al trabajo. El PIN no se utiliza como contraseña de Supabase.

## Muestra preparada

En la carpeta local ignorada `tmp/personal-restaurant-20261114/`:

- `lab.png`: equipo de un restaurante, roles, accesos activos, invitaciones pendientes y cupo.
- `perfil.png`: expediente, correo, rol, permisos, reenvío y retiro del acceso.
- `correo.png`: invitación y creación de contraseña en el celular.
- `diario.png`: PIN diario y confirmación por correo después del límite de intentos.
- `celular.png`: presentación en pantalla de 390 px.
- `preview.html`: muestra interactiva con datos ficticios. No envía correos ni guarda contraseñas.

Las capturas se mostraron a Carlos en el chat antes de integrar pantallas de producción. El archivo de muestra no se publica.

## Flujo a integrar

1. El dueño o equipo de Nuvoor autorizado abre Lab → Negocios y cuentas → negocio Restaurant → Personal.
2. Selecciona un perfil existente, captura el correo y confirma el rol. No se crea otro trabajador con el mismo perfil.
3. El servidor valida el permiso de quien invita, la vigencia, el cupo, el negocio y que el perfil esté activo. Registra la invitación de forma idempotente.
4. Se envía un correo en español con código de un solo uso y un botón a la pantalla de confirmación. El botón no consume el código al previsualizar el correo. La pantalla sólo dice «Enviada» si el proveedor aceptó el envío; «Activo» requiere aceptación real.
5. El trabajador confirma el correo y crea una contraseña. Si el correo ya pertenece a un usuario existente, se vincula tras autenticarlo; nunca se reemplaza su contraseña ni se elimina su otra cuenta.
6. Al entrar al Restaurant queda asociado al perfil invitado. No elige otro perfil de mayor privilegio en el bloqueo.
7. Reenviar no duplica personas ni consume otro cupo. Retirar acceso bloquea la membresía de ese negocio; no elimina el usuario de otros negocios.

## Permisos y protección de datos

| Perfil | Acceso de trabajo |
|---|---|
| Gerente | Operación, personal, menú, ajustes, ventas y caja del negocio autorizado |
| Cajero | Cobros y caja; autorización de cancelaciones según las reglas del negocio |
| Mesero | Mesas, pedidos y envío a cocina; cancelación sólo con autorización de cajero o gerente |
| Cocina | Consulta y preparación de comandas; no caja, precios ni personal |

- Validar permisos en políticas y funciones de la base. Ocultar botones no reemplaza esta protección.
- Revisar todas las funciones de Restaurant que usan `es_miembro`, `rol_en` y permisos de administrador antes de dar acceso a sesiones de personal.
- El acceso del dueño y los dispositivos de caja existentes siguen funcionando. No cambiar los roles ni el flujo de Imprenta.
- La relación usuario/perfil/cuenta es única. Los correos se guardan en Auth y en la relación privada de acceso; no en los documentos compartidos `rest_equipo`.
- Las contraseñas se envían directamente a Auth. Lab no las ve, no las guarda y no las manda por correo.
- PIN con límite de intentos validado en el servidor. Un perfil inactivo o sin acceso no recupera permisos con una sesión conservada.
- Conservar la política de altas vigente; este flujo no habilita por sí solo registros públicos.
- SQL nuevo repetible, disponible en Lab → Base de datos. Lo ejecuta Carlos; las pantallas existentes deben funcionar antes de instalarlo.

## Correo y estado actual

Resend requiere una cuenta, llave de configuración y dominio verificado. El dominio a verificar es `nuvoor.mx` para poder usar el remitente solicitado; verificar únicamente `correo.nuvoor.mx` no autoriza un remitente del dominio principal.

No sustituir los MX de `nuvoor.mx`. Agregar únicamente los registros reales que entregue Resend (DKIM y ruta de retorno), conservando el proveedor del correo existente.

La plantilla específica de Restaurant está preparada en `supabase/templates/invite-restaurant.html`. No se aplica globalmente mientras no se preserve el comportamiento de Imprenta y los demás productos.

**Estado:** DNS y SMTP verificados, con una prueba real entregada. La función de invitación está desplegada, con sus dos secretos instalados y respuesta 401 sin sesión comprobada. Las pantallas del personal están implementadas y probadas localmente; faltan la publicación en su ventana autorizada, SQL 38 por Carlos y la prueba real de aceptación.

## Pruebas necesarias antes de publicar

- Una invitación real autorizada: aceptación del proveedor, recepción confirmada por Carlos, enlace/código, creación de contraseña y entrada al perfil correcto.
- Invitación repetida y reenvío sin duplicar usuarios, perfiles ni cupos; correo ya registrado en otro negocio.
- Dos negocios, distintos roles y pruebas de escritura directa: sin acceso cruzado ni ascenso de permisos.
- Mesero sin permiso de cancelar/cobrar; autorización válida y expiración/revocación en el servidor.
- Perfil inactivo, acceso retirado, enlace caducado, cinco intentos de PIN y recuperación por correo.
- Safari y Chrome móvil; sesión conservada y cambio de dispositivo.
- Tablet del dueño y caja actual sin regresiones; comportamiento antes de instalar el SQL.
- Registrar resultados en HISTORIAL-CODEX. Restaurant se publica en su ventana autorizada, después de las 23:30.

## Avance comprobado al terminar la preparación del 14 de noviembre

- Dominio y DNS verificados; SMTP personalizado funcionando y prueba real reportada como entregada. Los MX y el sitio se conservaron.
- Integración de personal implementada localmente: componente de administración compartido por Restaurant y Lab, portal de correo/contraseña/PIN, función de envío y SQL 38.
- SQL 38 incluido localmente en Lab después del 37. No ejecutado en producción. No se publicó la integración ni se hizo una invitación real de Auth.
- Pasaron pruebas locales de SQL repetible, permisos por rol, negocio ajeno, cupos, retiro, invitación idempotente, creación de contraseña, PIN diario y bloqueo/recuperación. Mesero y cajero se probaron en Chrome aislado sobre la misma base local. La caja actual pasó su prueba de compatibilidad antes de instalar SQL 38.
- El control remoto se restableció: secretos guardados y función desplegada por la misma vía autorizada. Se retiró la copia temporal de recuperación de la llave de personal. No se extrajeron credenciales de la CLI.
- La última revisión del portal pasó en Chrome móvil de 390 px: logo, código inválido y válido, contraseña propia, limpieza de campos, primer PIN y entrada al perfil asignado. La integración mesero/cajero y la compatibilidad de caja sin SQL nuevo también pasaron en su última revisión.
- Falta publicar en la ventana permitida, ejecutar SQL 38 por Carlos e invitar al correo de prueba autorizado. La aceptación real no se presenta como probada.

### Alcance de permisos de esta entrega

El personal usa operaciones de Restaurant validadas por perfil; no recibe membresía administrativa ni escritura general en documentos. El dueño conserva su aplicación actual. El foco de la prueba compartida es mesas, comandas, cocina, autorizaciones y caja. La facturación conserva su autorización anterior y no se amplía al personal en esta entrega. Los eventos fuera del restaurante siguen con el flujo del dueño; no se habilitan por el nuevo acceso de personal.

El esquema actual no tiene una referencia explícita a una licencia compartida: el cupo de 40 agrupa cuentas Restaurant con plan maker/Multisucursal por su administrador principal. No incluye negocios independientes en prueba ni multiplica el cupo por cada sucursal. Si se incorpora una tabla de licencias, enlazar el conteo con ella.


## Entrega de pantallas 20261114-2330

Incluye Restaurant, el acceso del personal y su administración en Lab. La función de invitación y los secretos de envío ya están instalados. SQL 38 está publicado en Lab, con la protección contra PIN compartidos (6792dba). Falta que Carlos lo ejecute y se complete una invitación real con la confirmación y contraseña de su destinatario. Las pruebas locales pasaron; la entrega no presenta esa aceptación real como comprobada. Los cobros del personal requieren conexión y la asistencia se registra en el checador del restaurante.
