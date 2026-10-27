# Mudar las tres funciones a Supabase

Diez minutos, todo en dos tableros que ya tienes. No hay consola, no hay que
instalar nada, y **no tienes que pegar tu llave de servicio en ningún lado**:
Supabase se la pasa sola a sus propias funciones.

## Por qué estamos haciendo esto

Netlify dejó de publicar el 23 de octubre. No fue un error del código: el plan
gratis da **300 créditos al mes** y cada publicación cuesta **15**, o sea
**veinte publicaciones al mes**. Publicando cinco veces al día, el mes se
acaba en cuatro días. Se destraba solo el 18 de noviembre y se volvería a
acabar el 22.

Las tres cosas que necesitaban Netlify eran: crear el cobro en Mercado Pago,
recibir el aviso de que pagaron, y dar de alta a alguien del equipo. Ahora
viven en Supabase, al lado de la base. Ventajas:

- No hay tope de publicaciones.
- Funcionan igual desde GitHub Pages, que es donde de verdad está tu sitio.
- La llave de servicio ya no se escribe en ninguna parte: Supabase la inyecta.
- El día que quieras cambiar esa llave, no hay que tocar nada más.

---

## 1. Crear las tres funciones (6 min)

En **supabase.com → tu proyecto → Edge Functions → Deploy a new function →
Via Editor**.

Hazlo tres veces. El nombre tiene que ser **exactamente** éste, porque el
cotizador lo llama así:

| Nombre de la función | Qué pegar |
|---|---|
| `crear-suscripcion` | `supabase/functions/crear-suscripcion/index.ts` |
| `invitar-usuario` | `supabase/functions/invitar-usuario/index.ts` |
| `webhook-mercadopago` | `supabase/functions/webhook-mercadopago/index.ts` |

Los tres archivos están en tu carpeta. Abres el archivo, seleccionas todo,
copias, borras lo que el editor trae de ejemplo, pegas, y **Deploy**.

> **Lo único que hay que acordarse de apagar:** en cada función, la casilla
> **"Verify JWT"** va **apagada**. Si no aparece al crearla, se apaga después
> en la propia función → **Details / Settings**.
>
> No es un descuido: las tres revisan por su cuenta quién llama. Las dos del
> navegador le preguntan a Supabase si el token de sesión es bueno antes de
> hacer nada, y el webhook se protege con la clave que va en su dirección. Si
> "Verify JWT" quedara prendido, el navegador ni podría pedir permiso y los
> botones tronarían sin explicación.

---

## 2. Los tres secretos (2 min)

En **Edge Functions → Secrets** (o **Project Settings → Edge Functions →
Secrets**). Son tres, y dos ya las tienes escritas en Netlify:

| Nombre | Qué va ahí |
|---|---|
| `MP_ACCESS_TOKEN` | El mismo de Netlify: Mercado Pago → Tus integraciones → tu app → credenciales **de prueba** |
| `WEBHOOK_CLAVE` | La misma de Netlify. Si no la tienes a mano, inventa otra larga: lo que importa es que coincida con el paso 3 |
| `SITIO_URL` | `https://carlosmora0593-ship-it.github.io/cotizador-heymakers` |

**No agregues la llave de servicio.** Supabase no te deja crear secretos que
empiecen con `SUPABASE_` justamente porque esos los pone ella. Es la razón por
la que esta mudanza también cierra el pendiente de cambiar esa llave: ya no
vive en ningún archivo tuyo.

`SITIO_URL` es a dónde regresa la gente después de pagar. Si algún día mueves
el sitio a otra dirección, se cambia aquí y nada más.

---

## 3. Volver a registrar el webhook en Mercado Pago (2 min)

La dirección cambió, porque las funciones cambiaron de casa. En **Mercado Pago
→ Tus integraciones → tu aplicación → Webhooks → Configurar notificaciones**,
pon:

```
https://vgobhszuziyrrgfysenk.supabase.co/functions/v1/webhook-mercadopago?clave=LA-QUE-PUSISTE
```

Evento a marcar: **Suscripciones (preapproval)**. Si también aparece
**Pagos de suscripción / authorized payment**, márcalo: ése es el aviso que
llega cada mes y el que mueve la fecha de vencimiento.

La vieja dirección de Netlify puedes borrarla.

---

## 4. Publicar (1 min)

Corre **PUBLICAR.bat**. Esto sube el `cuenta.js` nuevo, que ya apunta a
Supabase en vez de a Netlify, y los tres archivos de las funciones para que
queden guardados en el repositorio.

Después de publicar, en el cotizador: **Ctrl+Shift+R** una vez.

---

## 5. Probar (3 min)

1. Entra al cotizador **de GitHub Pages**, el de siempre.
2. **Perfil → Mi equipo → dar de alta a alguien** con un correo que no exista.
   Antes esto decía "el servidor no está conectado en esta publicación".
   Ahora debe darte la contraseña temporal.
3. **Perfil → Mi plan → Cambiar de plan → Maker.** Debe mandarte a Mercado
   Pago. Paga con una **tarjeta de prueba** de ellos.
4. Vuelve al cotizador: en menos de un minuto el plan debe cambiar solo.

Si el plan no cambia, el problema está en el aviso de pago, y ahora se ve en
**Supabase → Edge Functions → webhook-mercadopago → Logs**. Ahí aparece cada
aviso que llegó y qué se hizo con él. Mándame una captura.

---

## Lo que queda de Netlify

El sitio de Netlify sigue en línea con la versión del 23 de octubre, y ahí se
va a quedar: `netlify.toml` ahora le dice que no construya salvo que cambien
sus propias cosas, para que no vuelva a gastar los veinte créditos del mes
publicando lo que GitHub Pages ya publica gratis.

Cuando las pruebas de arriba pasen dos veces seguidas, **lo mejor es borrar el
proyecto de Netlify**, por una razón sencilla: mientras exista, cualquiera que
tenga guardada esa dirección va a seguir viendo el cotizador del 23 de octubre
y va a creer que ésa es la versión buena. Eso lo decides tú y lo haces tú:
Netlify → el proyecto → Project configuration → Delete project.

Los otros cinco proyectos que tienes ahí (`cotizador-heymakers`,
`fancy-gaufre-9ff82a`, `poetic-medovik-c97686` y dos sin nombre del 24 de
octubre) son restos de arrastrar carpetas a mano. **Cada arrastre cuesta 15
créditos**, igual que una publicación. Bórralos también.
