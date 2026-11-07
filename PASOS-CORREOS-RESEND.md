# Correos de acceso de Nuvoor con Resend

## Lo único que necesita hacer Carlos al comenzar

1. Entrar o crear su cuenta en [Resend](https://resend.com/signup) y verificar su correo.
2. En [API Keys](https://resend.com/api-keys), crear una llave llamada **Configurar Nuvoor**, con permiso **Full access** para registrar y verificar el dominio por API.
3. Abrir PowerShell y ejecutar estas dos líneas. La llave se escribe oculta en PowerShell; **no se pega en el chat ni en capturas**:

```powershell
$clave = Read-Host 'Llave de Resend' -AsSecureString
[Environment]::SetEnvironmentVariable('RESEND_API_KEY',[Net.NetworkCredential]::new('',$clave).Password,'User')
```

4. Decir **«llave guardada»**. Codex puede leer esa variable de usuario sin reiniciar la aplicación y sin mostrarla.

No se crea una cuenta ni se escribe una contraseña por Carlos. La variable de entorno no está cifrada como una caja fuerte: después de terminar se debe eliminar y revocar la llave temporal en Resend. El SMTP usará una llave distinta de **Sending access**, limitada al dominio.

## Lo que hará Codex o Claude por API

- Buscar o crear **correo.nuvoor.mx** en Resend. Obtener los registros reales; no inventar el DKIM ni copiar registros de ejemplos.
- Agregar sólo esos registros en GoDaddy. No reemplazar la zona DNS ni cambiar los MX del correo principal de nuvoor.mx. Si no hay acceso API, Carlos inicia sesión en [DNS de nuvoor.mx](https://dcc.godaddy.com/control/nuvoor.mx/dns) y se le entrega una tabla exacta para agregar.
- Ejecutar **Verify** y comprobar que el dominio quede verificado antes de cambiar el envío de Supabase.
- Crear una llave SMTP de **Sending access**, mantenerla sólo en memoria/variable de entorno y en el secreto SMTP de Supabase.
- Configurar únicamente estos campos, sin cambiar las altas, sesiones ni redirecciones existentes:

| Campo | Valor |
|---|---|
| Sender email | acceso@correo.nuvoor.mx |
| Sender name | Nuvoor |
| Host | smtp.resend.com |
| Port | 465 |
| Username | resend |
| Password | llave SMTP de Resend, nunca en archivos |
| Emails por hora en Supabase | 100 |

El límite de Supabase no amplía el cupo contratado en Resend.

## Invitación en español

La plantilla preparada está en `supabase/templates/invite.html`. Asunto: **Te invitaron a Nuvoor**. Usa `{{ .ConfirmationURL }}` para aceptar la invitación. El flujo de correo una vez más PIN del personal se implementa en la tarea de Personal, después de su vista previa.

Para aplicar por CLI, usar un proyecto temporal mínimo con los ajustes anteriores, contraseña como `env(NUVOOR_RESEND_SMTP_KEY)` y la plantilla. Revisar el diff mostrando sólo rutas, no valores remotos completos. La CLI ya conectada puede utilizar su sesión sin entregar ninguna llave del proyecto al navegador.

## Estado comprobado el 7 de noviembre

- Fotos y logo publicados, sello **20261107-0738**; SQL35 disponible en Lab.
- No hay llave de Resend ni credenciales API de GoDaddy disponibles para Codex.
- Invitación preparada. Supabase rechazó aplicarla: el proyecto gratuito usa el proveedor de correo predeterminado y requiere SMTP propio para modificar plantillas. **No se aplicó la plantilla ni se cambió SMTP.**
- Dominio, DNS, SMTP, límite de 100/h e invitación de prueba **pendientes**. No se ha enviado la invitación autorizada.
- El destinatario de prueba está sólo en el chat, nunca en el repositorio ni en HISTORIAL-CODEX.

## Comprobación final

Leer de nuevo la configuración sin imprimir contraseñas; confirmar remitente, servidor, puerto, límite, asunto y contenido de invitación. Mandar una sola invitación real de prueba al destinatario autorizado y comprobar el envío en Resend. Que la API acepte un correo no prueba por sí solo que llegó a la bandeja: Carlos confirma su recepción.

Fuentes: [SMTP de Resend](https://resend.com/docs/send-with-smtp), [dominios de Resend](https://resend.com/docs/api-reference/domains/create-domain), [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [límites de Supabase](https://supabase.com/docs/guides/auth/rate-limits).
