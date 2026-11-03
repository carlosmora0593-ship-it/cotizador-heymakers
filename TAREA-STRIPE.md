# Tarea para Codex: dejar listo el cobro con Stripe (2 nov 2026)

> **Excepción autorizada por Carlos el 2 nov:** Codex hace la revisión final durante la ausencia de Claude y lleva el registro de relevo. Ver `REVISION-STRIPE-PARA-CLAUDE.md` y el historial más reciente. La etapa B sigue siendo en prueba; esta revisión no publica ni ejecuta SQL remoto. Se añadió `sql/23-stripe-seguro.sql` a los pasos de Carlos.

> **Ajuste del instalador, 2 nov 17:25:** el video de Carlos mostró que Windows no tiene npx. `SUBIR-COBROS.bat` usa ahora Supabase CLI oficial portable 3.0.0, con descarga y comprobación SHA256. Reemplaza la indicación de npx/link de 2.7: despliega las tres funciones con destino `--remote` explícito y `--use-api`, sin Node ni Docker. Verificado con `--comprobar`, sin login/despliegue del agente.

Escrita por Claude. **Carlos decidió el 2 nov que Stripe va antes de la caja en la nube (0h).** Las reglas de `AGENTS.md` mandan. **Se publica sólo con «aprobado, publica» de Claude.**

**Los pasos de Carlos están en `PASOS-STRIPE.md`.** Léelos completos: así sabes en qué etapa va (A, B o C) y lo puedes acompañar si te pregunta.

## 0. Reglas que no se rompen

- **Nunca pidas, recibas, escribas ni guardes una llave de Stripe** (`sk_…`, `rk_…`, `whsec_…`). Van sólo en Supabase → Edge Functions → Secrets, y las pega Carlos.
  - Si Carlos te pega una en el chat, **no la uses**. Dile que la cambie en Stripe («roll») y que pegue la nueva en Supabase.
- Las pruebas son con **Stripe falso y Supabase falso**, como el arnés del 26 oct. Nada de red real.
- `public/config.js` no se toca. Ni llaves ni el correo de Carlos en el repo: es público.
- No borres `crear-suscripcion` ni `webhook-mercadopago`. Se apagan en la etapa C.

## 1. Cómo está hoy (lo revisó Claude)

- **El servidor ya existe** en `supabase/functions/`: `crear-pago`, `portal-suscripcion` y `webhook-stripe`. Hacen tarjeta (suscripción), OXXO (pago suelto) y transferencia (`pagos_pendientes` + `aplica_pago`). No usan librerías y la firma del aviso se verifica a mano. **Eso se queda.**
- **Lo que está mal:**
  - `PLANES` en las tres funciones: nombres viejos («Taller Makers», «Makers Restaurant», «Tiendita Makers»), que **el cliente vería en la página de pago y en sus recibos**. Además, Multiempresa cuesta $449 y debe costar $899.
  - Falta la **promoción de apertura**: $98 los 3 primeros meses y después $199.
  - `PLAN_INTERNO` del aviso convierte `rest_multi` en `"maker"`. Hay que revisarlo contra cómo la base y el Lab nombran hoy Multiempresa.
  - **`webhook-stripe` lee `current_period_end` arriba de la suscripción y `subscription_details` arriba de la factura.** Con las versiones de la API de Stripe de 2025 en adelante, esos datos se mudaron:
    - El fin del periodo, a `items.data[0].current_period_end`.
    - Los datos de la suscripción en la factura, a `parent.subscription_details`.

    El destino de eventos que cree Carlos puede salir con la versión nueva, así que la cuenta nunca se renovaría.
  - **Las pantallas siguen mandando a Mercado Pago:**
    - En `acceso.js`, `contrata()` llama a `crear-suscripcion` y escribe «Abriendo Mercado Pago…».
    - `cuenta.js` (línea ~1122) hace lo mismo.
    - La promoción y Multiempresa salen con «Próximamente».
  - **No hay botón de «Administrar mi suscripción»** ni lugar en el Lab para marcar una transferencia como pagada (`aplica_pago` existe en `sql/18-stripe.sql`, pero el Lab no lo usa).
  - `supabase/config.toml` no lista las tres funciones nuevas con `verify_jwt = false`.

## 2. Lo que hay que hacer

### 2.1 Planes y precios (en las tres funciones; van copiados en cada archivo a propósito)

| Clave | Nombre que ve el cliente | Mensual | Anual |
|---|---|---|---|
| `imprenta_basico` | Nuvoor Imprenta · Básico | $199 | $1,990 |
| `imprenta_maker` | Nuvoor Imprenta · Maker | $449 | $4,490 |
| `imprenta_pro` | Nuvoor Imprenta · Pro (hasta 4 sucursales) | $899 | $8,990 |
| `restaurant_estandar` | Nuvoor Restaurant | $199 | $1,990 |
| `restaurant_multi` | Nuvoor Restaurant · Multiempresa (hasta 4 sucursales) | $899 | $8,990 |
| `store_estandar` | Nuvoor Store | $199 | $1,990 |
| `store_multi` | Nuvoor Store · Multiempresa (hasta 4 sucursales) | $899 | $8,990 |

- **Precios con IVA incluido. El anual es 10 meses.** Si la landing o `acceso.js` dicen otro anual, **pregúntale a Claude antes de elegir**.
- **El monto sale sólo del servidor**, nunca de lo que mande el navegador.
- Acepta las claves viejas (`taller_basico`, `rest_normal`…) como alias.
- Arma `MAPA` con el producto de la cuenta: `taller`, `restaurant`, `tiendita` (o como los guarde hoy la base) más `basico`, `maker`, `pro` o `multiempresa`.
- **`PLAN_INTERNO` debe dejar en `cuentas.plan` el mismo valor que hoy usan la base, el Lab y `acceso.js`** para cada plan, Multiempresa incluido. Revisa `sql/19`, `sql/20` y `sql/21` y el Lab, y anota en tu historial qué valor quedó.
- `grep -i makers supabase/functions/` debe salir **vacío**. Lo mismo con `Taller` y `Tiendita` en textos que vea el cliente.

### 2.2 La promoción de apertura

- **Un cupón de Stripe con id fijo** `nuvoor-apertura-98`:
  - `amount_off` 10100, `currency` mxn, `duration` repeating, `duration_in_months` 3, nombre «Promoción de apertura».
  - **Lo crea la función si no existe**: `GET /v1/coupons/{id}` y, si da 404, `POST`. Así Carlos no tiene que crearlo.
- **Se aplica con `discounts: [{ coupon }]` sólo si se cumple todo esto:**
  - El plan es de $199 (Imprenta Básico, Restaurant Estándar o Store Estándar).
  - El ciclo es **mensual** y el pago es con **tarjeta**.
  - La cuenta **nunca ha tenido** suscripción de Stripe ni plan pagado. Define cómo lo sabes y anótalo.
- **OXXO:**
  - Si es sencillo, los 3 primeros pagos mensuales de una cuenta nueva van a $98, contando los pagos aplicados en la base.
  - Si complica, OXXO va a $199. **Dile a Claude cuál hiciste.**
- **Comprueba el número de mensualidades con descuento.** El cupón empieza a contar al crear la suscripción. Con la prueba del punto 2.3 (menos de un mes), deben salir **exactamente 3 cobros a $98 y el 4.º a $199**. Si no te salen así, cámbialo y explica por qué.

### 2.3 Los días de prueba que le queden

- Si la cuenta está en prueba gratis (`plan = 'prueba'`) y le quedan **2 días o más**, manda `subscription_data.trial_end` con la fecha en que termina. Así **no se le cobra antes de que se le acabe la prueba**.
- Stripe exige que `trial_end` esté al menos 48 h en el futuro. Si quedan menos de 2 días, se cobra al momento.

### 2.4 El aviso (`webhook-stripe`)

- **Funciona con las dos versiones de la API:**
  - El fin del periodo se lee de `o.current_period_end ?? o.items?.data?.[0]?.current_period_end`.
  - Los metadatos de la factura se leen de `o.subscription_details ?? o.parent?.subscription_details`, y como último recurso de las líneas de la factura.
  - Prueba los dos formatos.
- **`cancel_at_period_end`:** la cuenta sigue activa hasta su fecha. Cuando llegue `deleted`, queda `cancelada` sin tocar `vence`, como hoy.
- **`past_due` y `unpaid`:** la cuenta queda vencida. Si después llega `active` (el cliente puso otra tarjeta), se activa de nuevo.
- **Agrega `checkout.session.async_payment_failed`** (el ticket de OXXO venció sin pagarse) sólo para dejarlo en el log.
  - Si lo agregas, **súmalo a la lista de eventos de B4 en `PASOS-STRIPE.md`**.
  - No agregues otros eventos sin decirle a Claude.
- **Lo de la firma no se toca:** HMAC, tiempo constante, ventana de 5 minutos y 400 si está mal.

### 2.5 Las direcciones

- Usa `SITIO_URL = https://app.nuvoor.mx`.
- `success_url`, `cancel_url` y el `return_url` del portal deben **regresar al cliente a donde estaba**:
  - Imprenta, a su pantalla de plan.
  - Restaurant y Store, a `acceso.html` con su negocio.
  - Conserva `app=android`.
- Al volver con `pago=ok`, la pantalla espera a que llegue el aviso: lee la cuenta cada 3 segundos, hasta 30 segundos. Luego dice «¡Listo! Tu plan quedó activo» o «Tu pago se está confirmando; en unos minutos se activa».
- **El APK:** comprueba que la página de Stripe abra dentro de la app Nuvoor y que regrese. Si Android la abre fuera, propón cómo regresar. **No hagas APK nuevo sin decirle a Claude.**

### 2.6 Las pantallas

- **En el panel de licencias de `acceso.js` y en el «Mi plan» de Imprenta (`cuenta.js`), «Contratar» abre una ventanita con tres formas de pago:**
  - **Tarjeta (recomendada):** «Se cobra sola cada mes. Cancelas cuando quieras.»
  - **Efectivo en OXXO:** «Pagas un mes a la vez en cualquier OXXO.»
  - **Transferencia:** «Pago anual, sin comisión.» Enseña banco, CLABE, referencia y monto (de `DATOS_BANCO` vía la función) y un botón para copiar la referencia.
  - **No le enseñes al cliente las comisiones.**
- **La promoción y Multiempresa ya se pueden contratar.**
  - Quita «Próximamente» y «Abriendo Mercado Pago…».
  - El aviso de la suscripción vieja de Mercado Pago se queda sólo si la cuenta tiene `mp_preapproval_id`.
- **«Administrar mi suscripción»**, si la cuenta tiene `stripe_cliente`: abre `portal-suscripcion`.
- **Sólo el dueño o admin contrata.** Los demás ven «Pídele al dueño del negocio que contrate».
- **Lab:** una lista de «Transferencias por confirmar» (`pagos_pendientes` en `esperando`) con negocio, plan, monto y referencia, y un botón «Ya llegó» que llama a `aplica_pago(id)`.
  - Revisa que `aplica_pago` entienda las claves nuevas. Si hay que cambiarla, **haz `sql/22-stripe-planes.sql`**, que se pueda correr dos veces.
  - **No recrees funciones de la base que no sean de cobro:** así se perdió una vez la bandera del Lab.
- **El mismo estilo de cada sistema, en día y en oscuro.** Simple: Carlos prefiere menos opciones si confunden.

### 2.7 Subir las funciones con doble clic

- **`SUBIR-COBROS.bat`:**
  - Con la consola de Supabase (`npx supabase`), hace `login` (Carlos entra en su navegador; tú no ves nada), `link --project-ref vgobhszuziyrrgfysenk` y `functions deploy` de las tres funciones con `--no-verify-jwt`.
  - Al final hace una pausa y dice qué subió.
  - **No pone secretos.** Los pega Carlos en el tablero.
- `supabase/config.toml` lleva las tres funciones con `verify_jwt = false` y su porqué.
- **Si no puedes probar el `.bat` sin la sesión de Carlos, dilo.** El camino a mano por el tablero sigue en `PASOS-STRIPE.md`.

## 3. Pruebas

- [ ] Arnés con Stripe falso y Supabase falso (que cada función se cargue con su propio nombre, como se arregló el 26 oct):
  - Los 7 planes con su monto. Un monto mandado por el navegador se ignora.
  - Cupón creado una vez y reutilizado. Se aplica sólo cuando toca.
  - `trial_end`.
  - Aviso con carga de 2024-06-20 y con carga de 2025 o más nueva.
  - Firma mala → 400; firma vieja → 400.
  - OXXO suma el periodo sin pisarlo. Transferencia → `pagos_pendientes`.
- [ ] `grep -i makers supabase/functions/` vacío.
- [ ] Capturas del sistema real con Supabase falso:
  - Elegir forma de pago, la transferencia, «Administrar mi suscripción» y la lista del Lab.
  - En día y en oscuro, a 390 y a 1280 px.
  - En `tmp/stripe/`.
- [ ] Sin errores de consola. `node --check` a los `.js`. Sube los sellos de versión.

**No publiques.** Avisa a Claude con las capturas y la lista de archivos que Carlos va a subir.

**El orden de la publicación:**

1. Claude aprueba el código.
2. Carlos hace la etapa B de `PASOS-STRIPE.md` (funciones, secretos y aviso, en modo de prueba).
3. Claude te escribe «aprobado, publica» para las pantallas.
4. Carlos prueba con las tarjetas de juguete.

## 4. Fuera de esta tarea

- **La factura (CFDI) de la mensualidad:** va con Facturapi.
- **Los avisos antes de que venza** el pago anual o el de OXXO.
- **Apagar Mercado Pago:** cuando Carlos pase a modo real.
- **El límite de 4 sucursales** en `crear_empresa`.
