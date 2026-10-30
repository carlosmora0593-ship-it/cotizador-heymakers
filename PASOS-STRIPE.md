# Cambiar el cobro a Stripe

Lo que sigue son tus pasos. El código ya está escrito y probado; sin tu cuenta
de Stripe no sirve de nada, y esa sólo la puedes abrir tú.

## Por qué Stripe y no otro

Buscamos "como pagar Netflix": la tarjeta se guarda y se cobra sola, y el
cliente no se vuelve a enterar hasta que algo falla.

Dato contra la intuición: **Stripe es la más cara de las cuatro.** Cobra 3.6% +
$3, más 0.7% del módulo de suscripciones. A $199 se lleva $13.41 (6.7%), contra
$12.70 de Mercado Pago y $9.59 de Conekta.

Se eligió de todos modos porque trae hecho lo que de otro modo hay que
construir y mantener: la página de cobro, **el portal donde el cliente cambia
su tarjeta y cancela solo**, la actualización automática de tarjetas vencidas,
los reintentos cuando un cobro rebota y los correos de aviso. Con 50 clientes
la diferencia contra Mercado Pago son $70 al mes. Eso es lo que cuesta no
construir un portal de suscripciones.

---

## 1. Abrir la cuenta de Stripe (10 min)

En **stripe.com**, cuenta de México. Te va a pedir:

- **RFC.** Si estás como persona física con actividad empresarial, sirve el tuyo.
- **CLABE** de una cuenta de banco en pesos. Ahí te deposita.
- Los datos del representante.

Empieza en **modo de prueba**. Todo lo de abajo funciona igual en prueba, con
las tarjetas de prueba de Stripe, y no mueve dinero de nadie.

> **Stripe deposita en 2 o 3 días hábiles, y la primera vez tarda 7.** Mercado
> Pago te daba el dinero al instante. Tenlo en cuenta para tu flujo.

---

## 2. Subir las tres funciones (6 min)

En **Supabase → Edge Functions → Deploy a new function → Via Editor**. Tres
veces, con estos nombres exactos:

| Función | Qué pegar | Qué hace |
|---|---|---|
| `crear-pago` | `supabase/functions/crear-pago/index.ts` | Abre la página de cobro |
| `portal-suscripcion` | `supabase/functions/portal-suscripcion/index.ts` | Abre el portal del cliente |
| `webhook-stripe` | `supabase/functions/webhook-stripe/index.ts` | Recibe los avisos de Stripe |

**En las tres, "Verify JWT" apagado.** Las dos primeras revisan por su cuenta
el token de sesión; el webhook se protege con la firma de Stripe, que es más
fuerte que cualquier contraseña en la dirección.

Las viejas de Mercado Pago (`crear-suscripcion`, `webhook-mercadopago`) **déjalas
ahí por ahora**. El día que una suscripción de Mercado Pago ya no exista, se
borran.

---

## 3. Los secretos (3 min)

**Supabase → Edge Functions → Secrets:**

| Nombre | De dónde sale |
|---|---|
| `STRIPE_LLAVE` | Stripe → Developers → API keys → **Secret key** (empieza con `sk_test_` en prueba) |
| `STRIPE_WEBHOOK_SECRETO` | Del paso 4, cuando registres el webhook |
| `SITIO_URL` | `https://carlosmora0593-ship-it.github.io/cotizador-heymakers` |
| `DATOS_BANCO` | Tu banco, CLABE y a nombre de quién. Es lo que se le enseña a quien paga por transferencia. |

La llave secreta de Stripe **nunca** va en `config.js`, ni en el repositorio, ni
en el navegador. Quien la tenga puede cobrarle a tus clientes.

---

## 4. Registrar el webhook (3 min)

**Stripe → Developers → Webhooks → Add endpoint.**

```
https://vgobhszuziyrrgfysenk.supabase.co/functions/v1/webhook-stripe
```

Eventos a marcar, los siete:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Al guardarlo, Stripe te da el **Signing secret** (empieza con `whsec_`). Ése va
en `STRIPE_WEBHOOK_SECRETO`.

> Sin ese secreto el webhook rechaza **todo**, a propósito. Es lo único que
> separa un aviso de Stripe de cualquiera que adivine tu dirección y se regale
> el plan Pro.

---

## 5. El portal del cliente (2 min)

**Stripe → Settings → Billing → Customer portal.** Préndelo y deja que el
cliente pueda:

- Actualizar su método de pago ✔
- Ver y descargar sus recibos ✔
- Cancelar la suscripción ✔

El cambio de plan **no** lo prendas ahí: eso se queda en tu cotizador, que ya
tiene su pantalla de planes.

---

## 6. El SQL (1 min)

Corre `sql/18-stripe.sql` en Supabase → SQL Editor. Agrega cuatro columnas a
`cuentas`, la tabla de transferencias esperadas y la función que las aplica.

---

## 7. Probar antes de cobrarle a nadie

Con Stripe en modo de prueba:

1. Entra al cotizador, **Perfil → Mi plan → Maker**.
2. Debe mandarte a la página de Stripe. Paga con la tarjeta de prueba
   `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC.
3. Regresa: tu cuenta debe quedar **activa** en menos de un minuto.
4. Vuelve a Mi plan y entra a **Administrar mi suscripción**. Debe abrirte el
   portal de Stripe con tu tarjeta y tus recibos.
5. Cancela ahí mismo. La cuenta debe quedar **cancelada** pero con su fecha de
   vencimiento intacta: lo que ya pagó, lo conserva.

Si algo no cuadra, **Supabase → Edge Functions → webhook-stripe → Logs**. Ahí
aparece cada aviso que llegó y qué se hizo con él.

---

## Las tres formas de pago

| | Quién la usa | Qué pasa |
|---|---|---|
| **Tarjeta** | Quien tiene tarjeta | Suscripción de verdad. Se cobra sola cada mes, se actualiza sola cuando la tarjeta vence, y el cliente la administra solo. Es la que queremos. |
| **OXXO** | Quien no tiene tarjeta | Un pago suelto que suma un mes. Cada mes hay que volver a pagar: alguien tiene que acordarse. |
| **Transferencia** | Quien paga el año completo | **No pasa por Stripe: comisión cero.** Le das tu CLABE y una referencia; cuando entra, lo marcas en el Lab y se le extienden doce meses. |

Un año de Taller Pro son $8,990. Por Stripe pagarías $484 de comisión; por
transferencia, nada. Por eso vale la pena el trabajo de marcarlo a mano.

---

## Lo que todavía falta, y lo hago yo

1. **La pantalla donde el cliente escoge cómo pagar** (tarjeta, OXXO o
   transferencia) y el botón de "Administrar mi suscripción". Te la enseño en
   artefacto antes de publicarla.
2. **El botón del Lab para marcar una transferencia como pagada.** Para eso
   necesito traer tu `lab.html`: tu copia pesa 34 bytes más que mi fuente, así
   que voy a parchear la tuya.
3. **Avisarle al cliente antes de que se le venza** el pago anual o el de OXXO.
   Sin eso, el que no paga con tarjeta se cae sin enterarse.
