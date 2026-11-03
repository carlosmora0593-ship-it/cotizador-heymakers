# Conectar Stripe: tus pasos, Carlos (2 nov 2026)

> **Actualización, 2 nov por la tarde:** Carlos autorizó a Codex hacer la revisión final mientras Claude regresa el viernes 6. La revisión local y los pendientes reales se documentan en `REVISION-STRIPE-PARA-CLAUDE.md`. Las llaves siguen siendo sólo de Carlos. Esta autorización no activa modo real.

Lo escribió Claude. **Es la guía de lo que tienes que hacer tú**: Codex la lee para saber en qué paso vas y acompañarte, pero **las llaves sólo las ves y las pegas tú**. Lo que le toca a Codex está en `TAREA-STRIPE.md`.

Hay tres etapas:

- **A. Hoy.** Abres la cuenta y la dejas lista en modo de prueba. No necesitas a Codex.
- **B. Cuando Claude apruebe el código de Codex.** Subes las funciones, pegas las llaves de prueba, registras el aviso y pruebas con tarjetas de juguete.
- **C. Al final.** Activas la cuenta con tu RFC y tu CLABE y cambias todo a modo real.

---

## Reglas de seguridad (léelas una vez)

- **La llave secreta de Stripe (`sk_…`) y el secreto del aviso (`whsec_…`) sólo van en Supabase → Edge Functions → Secrets.** Nunca en el chat, en WhatsApp, en un archivo, en `config.js` ni se las dictes a Codex o a Claude. Quien tiene la llave secreta puede cobrarle a tus clientes y mover tu dinero.
- **Si una llave se te escapa** (la pegaste donde no era), en Stripe → Desarrolladores → Claves de API → «⋯» → **Cambiar la clave (roll)**. Luego pegas la nueva en Supabase.
- **La «clave publicable» (`pk_…`) no hace falta.** El sistema no la usa.
- **Nunca captures números de tarjeta de nadie.** Stripe los guarda; Nuvoor no los ve.

---

## Etapa A · Hoy, sin esperar a nadie (unos 30 min)

### A1. Abrir la cuenta

1. Entra a **stripe.com/mx** → «Comenzar ahora».
2. Usa el correo que vayas a administrar para Nuvoor, el país **México**, y una contraseña que sólo tú sepas.
3. Confirma el correo y **prende la verificación en dos pasos** (Stripe te la pide; usa una app de autenticación).

Al entrar, Stripe te deja en **modo de prueba** (a veces dice «entorno de prueba» o «sandbox»). Todo lo de la etapa A y la B se hace ahí. **No mueve dinero de nadie.**

> Stripe te va a pedir «activar pagos» con tu RFC y tu CLABE. **Eso puede esperar a la etapa C.** Si quieres adelantarlo, mira primero los datos que pide en C1.

### A2. Cómo te ve el cliente

**Configuración → Detalles públicos de la empresa** (o «Información pública»):

| Campo | Qué poner |
|---|---|
| Nombre público | **Nuvoor** |
| Descriptor del estado de cuenta | **NUVOOR** (es lo que sale en el estado de cuenta del cliente) |
| Sitio web | **https://nuvoor.mx** |
| Correo y teléfono de soporte | Los de Nuvoor, no tu personal |

**Configuración → Marca (Branding):**

- Ícono: la N de Nuvoor (`Claude outputs/acceso-animado/n-512.png`).
- Color principal: **#4458A4**.

### A3. Formas de pago

**Configuración → Métodos de pago:**

- **Tarjetas:** prendido. Es la buena: se cobra sola cada mes.
- **OXXO:** prendido. Es para quien no tiene tarjeta. Cada mes paga un mes en efectivo.
- Lo demás (Apple Pay, Google Pay, Link): déjalo como venga.

> **OXXO no sirve para cobrar solo cada mes**: es un pago suelto y no se puede reembolsar. El ticket vence a los pocos días y el máximo es $10,000.

### A4. El portal del cliente (donde cambia su tarjeta y cancela solo)

**Configuración → Billing → Portal del cliente** → «Activar».

- **Métodos de pago:** sí, que pueda cambiar su tarjeta.
- **Historial de facturas:** sí, que vea y baje sus recibos.
- **Cancelar suscripción:** sí, **al final del periodo** (no «de inmediato»): lo que ya pagó, lo conserva. Deja prendido «motivo de cancelación».
- **Cambiar de plan: NO.** El cambio de plan se hace dentro de Nuvoor.
- **Códigos de promoción: NO.**
- **Encabezado:** «Administra tu suscripción de Nuvoor».
- **Enlace de regreso:** `https://app.nuvoor.mx/acceso.html`

### A5. Cobros que rebotan y correos

**Configuración → Billing → Suscripciones y correos** (o «Recuperación de ingresos»):

- **Reintentos inteligentes:** prendidos, unos 4 intentos en 2 semanas.
- **Si todos los reintentos fallan:** «marcar la suscripción como **no pagada** (unpaid)». Así la cuenta se pausa, pero el cliente puede poner otra tarjeta y seguir sin volver a contratar.
- **Correos al cliente:** prende los de pago fallido, tarjeta por vencer y recibo de pago.

**Ya terminaste la etapa A.** Avísale a Claude: «Stripe etapa A lista».

---

## Etapa B · Con el código revisado por Codex, autorizado por Carlos (modo de prueba)

La revisión local de las correcciones queda registrada en `REVISION-STRIPE-PARA-CLAUDE.md`. Sigue esta etapa sólo en el entorno de prueba. No cambies las llaves por las de modo real todavía.

### B1. La base de datos

**Supabase → SQL Editor:** corre cada archivo completo por separado, en este orden:

1. `sql/18-stripe.sql`.
2. `sql/22-stripe-planes.sql`.
3. `sql/23-stripe-seguro.sql`.

El 22 corrige los planes y bloquea la cuenta al sumar transferencias. El 23 evita aplicar dos veces un pago OXXO, conserva los intentos de Checkout y registra si ya hubo pagos para no repetir la promoción. Los tres pueden repetirse **en ese orden**. Si aparece un error, no sigas con el siguiente: comparte el texto del error sin datos personales. No ejecutes otros SQL llamados 18 (por ejemplo, `18-productos-cuenta.sql`) como parte de estos pasos.

El SQL no contiene llaves ni las necesita. El 23 depende de las tablas de cuentas y membresías existentes. No modifica el staff, la puerta, Auth ni `mi_cuenta()`. La copia disponible hoy en el Lab publicado todavía puede ser la anterior: usa los archivos locales revisados hasta que se publiquen las pantallas.

### B2. Subir las tres funciones

**Con doble clic:** `SUBIR-COBROS.bat`. Usa la consola oficial portable de Supabase 3.0.0: no requiere instalar Node, npx ni Docker. Si falta la consola, la descarga del repositorio oficial y verifica su SHA256 en `tmp/stripe/cli/` (carpeta local ignorada por Git). La primera vez abre el navegador para que entres a Supabase con tu cuenta; después sube sólo las tres funciones al proyecto indicado, sin pedir contraseña de la base ni correr SQL. Si pregunta si deseas continuar con la subida de esas funciones al proyecto indicado, confirma.

Si el navegador te pide iniciar sesión o confirmar un código de acceso de la consola, lo haces tú en Supabase y la ventana de la consola; no compartas ese código ni tokens por chat. El modo `SUBIR-COBROS.bat --comprobar` verifica únicamente la versión, sin iniciar sesión ni desplegar.

**Si el `.bat` falla**, a mano en **Supabase → Edge Functions → Deploy a new function → Via Editor**, tres veces, con estos nombres exactos:

| Función | Qué pegas | Para qué |
|---|---|---|
| `crear-pago` | `supabase/functions/crear-pago/index.ts` | Abre la página de cobro |
| `portal-suscripcion` | `supabase/functions/portal-suscripcion/index.ts` | Abre el portal del cliente |
| `webhook-stripe` | `supabase/functions/webhook-stripe/index.ts` | Recibe los avisos de Stripe |

**En las tres, «Verify JWT» apagado.** Las dos primeras revisan solas la sesión. El aviso se protege con la firma de Stripe.

### B3. La llave de prueba

1. En Stripe, modo de prueba: **Desarrolladores → Claves de API → Clave secreta** → «Revelar». Empieza con `sk_test_`.
2. Cópiala y **pégala directo** en **Supabase → Edge Functions → Secrets** → «Add new secret»:

| Nombre | Valor |
|---|---|
| `STRIPE_LLAVE` | la `sk_test_…` |
| `SITIO_URL` | `https://app.nuvoor.mx` |
| `DATOS_BANCO` | Banco, CLABE y titular, en una línea. Es lo que ve quien paga por transferencia. |

### B4. El aviso de Stripe (webhook)

1. Stripe → **Desarrolladores → Webhooks** (se abre «Workbench») → **«Crear un destino de eventos»**.
2. **De dónde:** «Tu cuenta».
3. **Tipo de carga:** **«Snapshot»**. **No** elijas «Thin»: con «Thin» el sistema no entiende los avisos. Si te pide versión de la API, deja la que propone.
4. **Eventos**, marca estos ocho:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `checkout.session.async_payment_failed` (sólo deja registro; no cambia la licencia)
5. **Destino:** «Endpoint de webhook». **URL:**

   ```
   https://vgobhszuziyrrgfysenk.supabase.co/functions/v1/webhook-stripe
   ```

6. Créalo. En su página, **«Revelar secreto»**: empieza con `whsec_`. Pégalo en Supabase → Secrets como **`STRIPE_WEBHOOK_SECRETO`**.

> Sin ese secreto, el aviso rechaza **todo** a propósito. Es lo único que separa un aviso de Stripe de alguien que adivine la dirección y se regale el plan Pro.

### B5. Avisar

Dile a Codex: «Stripe etapa B lista». Se comprueba la conexión de prueba y después se publican las pantallas nuevas de pago. Claude tendrá el registro completo al regresar.

### B6. Probar con tarjetas de juguete (en modo de prueba)

Usa **tu** cuenta de prueba, nunca la de un cliente.

1. **Tarjeta:** contrata Restaurant Estándar. Paga con `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC.
   - Al regresar, la licencia debe quedar **activa** en menos de un minuto.
   - En Stripe → Clientes → tú → Suscripción, debe verse el **descuento de la promoción** ($98 los primeros 3 meses).
   - Antes de modo real, comprobar también con un reloj de prueba de Stripe **tres facturas de $98 y la cuarta de $199**, incluyendo una cuenta con días de prueba restantes. El arnés local no simula el motor de facturación de Stripe.
2. **Tarjeta que rebota:** `4000 0000 0000 0002`. Stripe dice «tarjeta rechazada» y la cuenta **no** se debe activar.
3. **OXXO:** elige OXXO y genera el ticket. En prueba, Stripe simula que el cliente pagó **a los 3 minutos más o menos**. La cuenta debe sumar un mes.
4. **Transferencia:** debe enseñarte banco, CLABE, referencia y monto. Luego márcala como pagada desde el Lab y la cuenta debe sumar el periodo.
5. **Portal:** «Administrar mi suscripción» debe abrir el portal con tu tarjeta y tus recibos. Cancela ahí: la cuenta queda **cancelada al final del periodo**, sin perder los días pagados.
6. **Sin doble cobro:** varios clics reutilizan el Checkout abierto. Con una suscripción existente se usa el portal o se contacta a Nuvoor para cambiar de plan; no se abre otra suscripción en paralelo.
7. **APK 0.1.3:** abre Stripe en Chrome, fuera del APK. Completa el pago allí; la vuelta abre Nuvoor en ese navegador. Si pide sesión, entra con el mismo usuario. Al volver al APK, actualiza el plan. Aún falta comprobar este recorrido en la tablet. No se compiló otro APK.

**Si algo no cuadra:**

- **Stripe → Workbench → Webhooks → tu destino → «Entregas de eventos»** (lo que mandó Stripe).
- **Supabase → Edge Functions → webhook-stripe → Logs** (lo que hizo el sistema).

Mándale captura a Claude.

---

## Etapa C · Modo real (cuando B salga bien)

### C1. Activar la cuenta

Stripe → «Activar pagos». Te pide:

- **Tipo de negocio:**
  - **Persona física con actividad empresarial**, si facturas a tu nombre.
  - **S.A. o S. de R.L.**, si Nuvoor ya es empresa. Esto lo decides con tu contador.
- **Nombre legal exactamente como aparece en el RFC.**
- **RFC:**
  - Como persona física, va **tu RFC personal (13 caracteres) en los datos del representante**.
  - **No lo pongas en el campo del RFC de la empresa**: Stripe dice que eso da error.
  - Como empresa, va el RFC de la empresa (12 caracteres) y además tu RFC personal como representante.
- **Tus datos:** fecha de nacimiento y domicilio.
- **Del negocio:** domicilio en México, teléfono de soporte, sitio web (**nuvoor.mx**) y descripción del negocio, por ejemplo «Software de punto de venta por suscripción mensual».
- **CLABE** de una cuenta en pesos **a nombre del mismo titular del RFC**. Ahí te deposita.

> El tablero te dice cuándo llega cada depósito. El primero suele tardar más que los siguientes, y los pagos en OXXO tardan unos días más en depositarse.

### C2. Repetir en modo real

En Stripe hay un interruptor de **modo de prueba / modo real**. En modo real:

1. **Repite A3, A4 y A5.** El portal y los métodos de pago se configuran aparte en cada modo.
2. **Clave secreta real** (`sk_live_…`): reemplaza `STRIPE_LLAVE` en Supabase → Secrets.
3. **Crea otro destino de eventos** igual al de B4: Snapshot, los mismos eventos y la misma URL. Su `whsec_…` **reemplaza** `STRIPE_WEBHOOK_SECRETO`.

### C3. La prueba de verdad

- Contrata con **tu tarjeta** el plan más barato, revisa que se active y cancélalo desde el portal.
- Si quieres el dinero de vuelta, en Stripe → Pagos → ese cobro → **Reembolsar**. Stripe no te devuelve su comisión.
- Avísale a Claude: «Stripe en modo real». Claude y Codex apagan Mercado Pago.

---

## Lo que cuesta (stripe.com/mx, revisado el 2 nov 2026; todo **más IVA**)

| | Comisión |
|---|---|
| Tarjeta mexicana | 3.6% + $3 por cobro |
| Tarjeta extranjera | +0.5% |
| Suscripciones (Billing) | +0.7% de lo cobrado por suscripción |
| OXXO | 4% + $3 por pago |
| Transferencia a tu CLABE | $0: no pasa por Stripe |

Un año de Pro por transferencia ($8,990) te ahorra unos $500 de comisiones. Por eso existe esa opción.

## Lo que todavía no hace (va después)

- **La factura (CFDI) de cada mensualidad.** Stripe no la emite: se hará con Facturapi, que se contrata cuando Stripe ya cobre en real.
- **El aviso antes de que se le venza el pago anual o el de OXXO**, para que quien no paga con tarjeta no se quede sin sistema sin enterarse.
