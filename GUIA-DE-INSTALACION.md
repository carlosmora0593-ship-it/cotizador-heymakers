# Cotizador por suscripción — guía de instalación

Esta guía te lleva de cero a tener el cotizador en internet, con cuentas de
usuario y cobro por Mercado Pago. No necesitas saber programar, pero sí seguir
los pasos en orden. Calcula entre **2 y 4 horas** la primera vez.

---

## Qué vas a contratar y cuánto cuesta

| Servicio | Para qué | Costo |
|---|---|---|
| **Supabase** | Base de datos, cuentas de usuario y archivos | Gratis hasta 50,000 usuarios activos y 500 MB de datos. Después ~25 USD/mes |
| **Netlify** | Publica el sitio y corre las funciones de cobro | Gratis para este tamaño |
| **Mercado Pago** | Cobra las suscripciones | Sin mensualidad. Comisión por transacción (revísala en tu cuenta) |
| **Dominio** (opcional) | `cotizador.tumarca.com` en vez de `algo.netlify.app` | ~$200–400 MXN al año |

Arrancas en **cero pesos** y solo empiezas a pagar cuando tengas volumen real.

---

## Paso 1 — Crea el proyecto en Supabase

1. Entra a **supabase.com**, crea una cuenta y luego un proyecto nuevo.
2. Elige la región **East US** o la más cercana a México.
3. Guarda la contraseña de la base de datos que te pide (la vas a necesitar rara vez, pero guárdala).
4. Espera a que el proyecto termine de crearse (unos 2 minutos).

### Carga el esquema

1. En el menú lateral entra a **SQL Editor** → **New query**.
2. Abre el archivo `sql/01-esquema.sql` de esta carpeta, cópialo **completo** y pégalo ahí.
3. Dale **Run**. Debe decir *Success*.
4. Abre otra consulta nueva, pega ahora `sql/02-roles.sql` completo y dale **Run**.
   Ese segundo archivo crea los roles de usuario (administrador, ventas,
   diseño y producción) y las reglas de qué puede tocar cada quien.
5. Repite con `sql/03-arreglo-roles.sql` y con `sql/04-soporte.sql`, **en ese
   orden**. El 03 deja el primer usuario de cada cuenta como administrador; el
   04 conecta el botón de ayuda del cotizador con tu tablero de soporte.

Esto crea las tablas, las reglas de seguridad, el disparador que abre una cuenta
cuando alguien se registra y el almacén de diseños.

### Configura el correo de acceso

1. Ve a **Authentication → Providers → Email** y déjalo activado.
2. Mientras pruebas, en **Authentication → Sign In / Providers** puedes apagar
   *Confirm email* para entrar sin confirmar. **Vuelve a encenderlo antes de vender.**
3. En **Authentication → URL Configuration**, en *Site URL*, pon la dirección de
   tu sitio (la tendrás en el paso 2; puedes volver después).

### Copia tus llaves

Ve a **Project Settings → API** y copia:

- **Project URL** → algo como `https://abcdefgh.supabase.co`
- **anon public** → una llave larga. Esta es pública, puede ir en el navegador.
- **service_role** → **esta es secreta**. Nunca la pongas en `config.js` ni la
  compartas. Solo va en Netlify como variable de entorno.

---

## Paso 2 — Publica el sitio en Netlify

1. Abre `public/config.js` en cualquier editor de texto y pega tu **Project URL**
   y tu llave **anon**. Ahí mismo ajustas los precios de tus planes.
2. Entra a **netlify.com**, crea una cuenta.
3. Elige **Add new site → Deploy manually** y arrastra **toda esta carpeta**
   (la que contiene `public`, `netlify` y `netlify.toml`).
4. Netlify te da una dirección tipo `https://algo-random.netlify.app`.
   En **Site configuration → Change site name** ponle algo decente.

### Variables de entorno

En **Site configuration → Environment variables** agrega:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | El Project URL de Supabase |
| `SUPABASE_SERVICE_KEY` | La llave **service_role** (la secreta) |
| `MP_ACCESS_TOKEN` | El Access Token de Mercado Pago (paso 3) |
| `SITE_URL` | La dirección final de tu sitio, sin diagonal al final |
| `WEBHOOK_CLAVE` | Una cadena larga y al azar, sin espacios. **No una palabra** — abajo se explica por qué |

La función que da de alta al equipo usa estas mismas variables, así que con
ponerlas una vez queda todo listo.

Después de agregarlas dale **Deploys → Trigger deploy → Deploy site** para que
las tome.

### Por qué la clave del webhook tiene que ser al azar

Netlify revisa cada despliegue buscando si el **valor** de alguna de tus
variables aparece escrito en los archivos. Si pones como `WEBHOOK_CLAVE` una
palabra normal —tu nombre, tu marca, "soporte"— tarde o temprano esa palabra
aparece en algún comentario o en una guía, y el despliegue **falla** con un
mensaje de secretos encontrados.

Pero el problema de fondo no es el despliegue: es que **una palabra se adivina**.
Esa clave es lo único que separa tu webhook de que cualquiera te mande avisos
falsos de pago. Usa algo así, de 40 caracteres al azar:

```
H7NE2M9Q3hcv9Wn5YrlKub3BDsf7zrVVKMCRZqp3
```

Genera la tuya, no copies ésa. Y si cambias la clave, acuérdate de cambiarla
también en la dirección del webhook que registraste en Mercado Pago.

Si aun así un despliegue falla por el revisor de secretos, el `netlify.toml`
ya deja fuera las carpetas que no forman parte del sitio (`sql/` y los `.md`),
que es donde suelen estar las coincidencias inocentes.

Regresa a Supabase → **Authentication → URL Configuration** y pon ahí la
dirección de tu sitio como *Site URL*.

---

## Paso 3 — Conecta Mercado Pago

1. Entra a **mercadopago.com.mx/developers**, inicia sesión con tu cuenta.
2. En **Tus integraciones** crea una aplicación nueva. Elige el producto de
   **Suscripciones**.
3. Copia el **Access Token** de *producción* y pégalo en Netlify como
   `MP_ACCESS_TOKEN`. Para probar primero, usa el de *prueba*.
4. En esa misma aplicación entra a **Webhooks** y registra esta dirección:

```
https://TU-SITIO.netlify.app/.netlify/functions/webhook-mercadopago?clave=LA-CLAVE-QUE-INVENTASTE
```

   Marca el evento de **suscripciones (preapproval)**.

> **Importante:** Mercado Pago ajusta de vez en cuando los nombres de sus campos.
> Todo lo que toca su API está en dos archivos —
> `netlify/functions/crear-suscripcion.js` y `webhook-mercadopago.js` —
> y en el primero está marcado con un comentario dónde se ajusta.
> **Haz una prueba completa con las credenciales de prueba antes de cobrarle a
> alguien de verdad**, y revisa la documentación vigente de Mercado Pago.

---

## Paso 4 — Pruébalo de punta a punta

1. Abre tu sitio y crea una cuenta con tu correo.
2. Debe entrar directo con **15 días de prueba** y todo abierto.
3. Arma una cotización, sube un diseño, guárdala, cóbrala y revisa que aparezca
   en Ventas.
4. Dale a **Mi plan → Suscribirme** y completa el pago con una tarjeta de prueba
   de Mercado Pago.
5. Al volver, el letrero de arriba debe cambiar a **Plan Básico** o **Plan Pro**.
6. En Supabase → **Table Editor → cuentas** confirma que `estado` diga `activa`
   y que `vence` tenga la fecha correcta.

Si algo falla, en Netlify → **Functions** puedes ver los registros de cada
llamada; ahí aparece qué respondió Mercado Pago.

---

## Los cuatro roles

Quien crea la cuenta queda como **administrador**. Desde **Ajustes → Equipo**
da de alta al resto con el correo y el rol; el sistema devuelve una contraseña
temporal que le pasas a la persona para que entre y la cambie.

| | Administrador | Ventas | Diseño | Producción |
|---|---|---|---|---|
| Cotizar y confirmar pedidos | sí | sí | no | no |
| Clientes y expedientes | sí | sí | no | no |
| Catálogo | edita | solo consulta | no | no |
| Mesa de diseño (archivos) | sí | sí | **sí, es lo suyo** | no |
| Tablero de producción | sí | solo consulta | sí | **sí** |
| Cambiar estatus y checklist | sí | **no** | no | sí |
| Dejar notas en la bitácora | sí | **no** | sí | sí |
| Compras y requisiciones | sí | levanta | no | recibe material |
| Autorizar una requisición | **solo admin** | no | no | no |
| Prioridad y pendientes de la orden | **solo admin** | no | no | no |
| Caja y cortes | sí | no | no | no |
| Ventas, utilidades y análisis | sí | no | no | no |
| Ajustes y equipo | sí | no | no | no |

**Producción no ve precios en ninguna pantalla**: ni el resumen de la
cotización, ni los botones de cobro, ni el catálogo. Su tablero muestra folio,
cliente, fecha de entrega, piezas, técnicas, medidas, archivos y checklist.

Esto no es solo la pantalla escondiéndose: las reglas viven en la base de datos.
Alguien de producción que intentara leer las ventas desde fuera del sitio
tampoco obtendría nada, y si intenta cambiar algo de una cotización que no sea
el estatus, la bitácora o el checklist, Postgres se lo rechaza. Al revés igual:
ventas cotiza y confirma pedidos, pero si intentara mover el estatus de una
orden o escribir en la bitácora, la base de datos lo bloquea.

**El seguimiento de administración** es del administrador y de nadie más: ahí
marca la prioridad de una orden (normal, alta o urgente), deja anotado qué falta
para que todo el equipo lo vea, y sella la orden como revisada. La prioridad
reordena el tablero, así que lo urgente sube solo hasta arriba.

**La bitácora** es el canal entre el taller y la oficina: producción escribe
("pedido listo hoy a las 4"), y ventas y administración lo leen en el tablero,
en el paso de Producción de la cotización y en la orden impresa.

El plan Básico es de un solo usuario. Maker permite tres y Pro no tiene límite.

**Si entraste y no te deja ver el equipo ni los ajustes**, tu renglón de la tabla
`perfiles` no dice `admin`. Pasa cuando se corre `01-esquema.sql` después de
`02-roles.sql`. Córrele `sql/03-arreglo-roles.sql`: deja el disparador correcto y
pone como administrador al primero que entró en cada cuenta.

## Tus propias empresas y tu consola de dueño

Esto lo enciende `sql/06-superadmin.sql`. Córrelo después de los otros.

**Un correo, varias empresas.** Antes un correo pertenecía a una sola empresa.
Ahora puede pertenecer a varias y cambiar entre ellas con el selector que
aparece arriba, junto a tu plan. Cada una va completamente aparte: su catálogo,
sus clientes, sus precios, sus cotizaciones y sus números. Nada se mezcla, ni
siquiera entre dos empresas tuyas, porque la separación no la hace la pantalla
sino las reglas por fila de la base: al cambiar de empresa cambia la respuesta
de `mi_cuenta()`, y con eso cambia todo lo que la base te deja ver.

El selector solo aparece cuando de verdad tienes más de una. Un taller suscrito
que tiene una sola nunca lo ve.

**Tu consola.** El botón de Makers Lab solo le sale a quien está en la tabla
`staff`. Y no es un botón escondido: es la base la que decide. Las vistas que
Makers Lab lee (`v_cuentas`, `v_resumen`, `v_uso`, `v_altas`) empiezan todas
con `where public.es_staff()`, así que a cualquier otro usuario le contestan
cero renglones aunque las pida a mano desde fuera del sitio. Esconder el botón
sin esa regla no habría protegido nada.

El archivo da de alta tu correo solo, buscándolo en `auth.users`; no tienes que
copiar ningún uuid. Si todavía no has entrado nunca al sitio, te avisa: entra
una vez y vuelve a correrlo.

**Lo que Makers Lab puede ver, y lo que no.** Ve cuántas cuentas hay, en qué
plan están, cuándo vencen, cuántas cotizaciones llevan, cuándo entraron por
última vez y qué tickets abrieron. No ve el contenido de una sola cotización,
ni los clientes de un taller, ni sus precios, ni sus archivos.

Eso no es una decisión de la pantalla que se pueda revertir quitando un botón:
las vistas simplemente no traen esa información, así que no hay forma de
pedirla. La única excepción son los tickets de soporte, que sí traen su
conversación, porque el cliente la escribió para que tú la leas.

**Lo que tú anotas.** Tu equipo, tus alianzas, tus citas y las notas
comerciales de cada cuenta (de dónde llegó, quién la atiende, su RFC) son datos
de Hey Makers, no de tus clientes. Viven en la tabla `lab_datos`, que también es
solo para `staff`. Cuando guardas una cuenta desde Makers Lab se guardan esas
notas, nunca los números: los números son de la base y no se editan a mano.

## Cómo quedaron los planes

Los defines en `public/config.js`. Así vienen de fábrica:

Los precios ya traen IVA: quien paga $199 ve $199 en su estado de cuenta.

**Básico — $199/mes o $1,990/año.** Para quien sale de tu curso: cotizador
completo, catálogo propio, orden de producción con folio, clientes y
expedientes, hasta 150 cotizaciones guardadas, un usuario. Es el que se prueba
y el que se vende solo.

**Maker — $449/mes o $4,490/año.** Cuando ya son dos o tres en el taller: todo
lo de Básico más los roles de ventas, diseño y producción, compras con
requisiciones foliadas y proveedores, inventario y bitácora, hasta 600
cotizaciones y hasta tres usuarios.

**Pro — $899/mes o $8,990/año.** Para la empresa que mide: todo lo de Maker sin
límite de cotizaciones, más caja y registro de ventas con cortes, utilidad y
margen real por periodo, reportes en Excel y usuarios sin límite. No se muestra
en frío: lo trabaja el equipo de ventas con cita.

El gancho para subir de Básico a Maker es **trabajar en equipo**; el de Maker a
Pro es **el registro de ventas**: cotizar lo hace cualquiera, pero saber cuánto
ganaste el mes pasado es lo que vuelve indispensable la herramienta.

Si cambias un precio, cámbialo en los dos lados: `public/config.js` (lo que ve el
cliente) y `netlify/functions/crear-suscripcion.js` (lo que se le cobra).

Los límites no están solo escondidos en la pantalla: viven en la base de datos
(`sql/01-esquema.sql`, sección *Límites por plan*), así que nadie los brinca
trucando el navegador.

---

## Cómo se protege la información de cada cliente

Cada cuenta solo ve lo suyo, y eso lo garantiza Postgres, no el sitio web:
todas las tablas tienen *seguridad por fila* atada a la cuenta del usuario que
consulta. Aunque alguien tomara la llave `anon` —que es pública a propósito— no
podría leer datos de otra cuenta. Los diseños que suben viven en carpetas
separadas por cuenta, con la misma regla.

La llave `service_role` es la única que brinca esas reglas. Por eso vive
exclusivamente en Netlify, nunca en el navegador.

---

## Lo que todavía no tiene (para la versión Pro grande)

Cosas que vale la pena construir cuando ya tengas clientes pagando:

- **Varios artículos en una misma cotización** (50 playeras + 20 gorras en un
  solo folio).
- **Panel para ti**: cuántas cuentas hay, cuáles están por vencer, cuánto
  facturas al mes.
- **Facturación CFDI** de las suscripciones.
- **Cupones** para tus alumnos (primer mes gratis al terminar el curso).
- **Recordatorio por correo** tres días antes de que venza la prueba.

---

## Estructura de la carpeta

```
GUIA-DE-INSTALACION.md      este documento
netlify.toml                configuración del sitio
package.json                dependencias de las funciones
public/
  index.html                el cotizador completo
  config.js                 ← el único archivo que editas
  cuenta.js                 sesión, planes y puente con la base
netlify/functions/
  crear-suscripcion.js      crea el cobro en Mercado Pago
  webhook-mercadopago.js    recibe el aviso y activa la cuenta
netlify/functions/
  invitar-usuario.js        alta, cambio de rol y baja del equipo
sql/
  01-esquema.sql            tablas, seguridad y límites por plan
  02-roles.sql              roles de usuario y qué puede tocar cada uno
  03-arreglo-roles.sql      deja al primero de cada cuenta como administrador
  04-soporte.sql            el botón de ayuda, los sellos de tiempo y tu vista
```

---

## El botón de ayuda, y cómo llega a ti

El cotizador tiene abajo a la derecha un botón de **Ayuda**. Antes de molestar a
nadie intenta resolverlo solo: muestra la explicación de la pantalla donde está
la persona y las preguntas que más se repiten. Si aun así sigue atorada, abre un
reporte.

Lo importante es lo que viaja con ese reporte **sin que el cliente escriba
nada**: su taller, quién reporta y con qué perfil, en qué pantalla estaba, la
versión del cotizador, el navegador, el tamaño de pantalla, cuántas cotizaciones
lleva y **los errores técnicos que el cotizador capturó solo en esa sesión**. El
panel se lo enseña antes de mandarlo, para que sepa exactamente qué comparte —
sus cotizaciones y sus precios nunca salen.

Cada reporte se guarda como un documento de la colección `soporte` de esa cuenta.
El archivo `sql/04-soporte.sql` hace tres cosas con eso:

1. Crea la tabla `staff`, que es donde va **tu** equipo (no los talleres), y
   abre una rendija para que solo ellos puedan leer y contestar la colección
   `soporte` de todas las cuentas. Nada más que esa colección: si alguien de tu
   equipo intentara leer las cotizaciones de un taller, Postgres se lo niega.
2. Pone los **sellos de tiempo en la base de datos**, no en el navegador: cuándo
   entró el reporte, cuándo se contestó, cuándo soporte dijo haberlo resuelto y
   cuándo el cliente lo confirmó. Como los pone Postgres, no se pueden editar
   después para que un promedio se vea mejor. Y hay una regla escrita ahí:
   **un ticket lo cierra el cliente, no soporte.**
3. Enciende el tiempo real. La respuesta que tu equipo escribe en Makers Lab le
   aparece al cliente en su cotizador sin que recargue nada.

Para leerlo desde Makers Lab tienes la vista `v_soporte`, que ya trae el taller,
el plan, la pantalla, la versión, el navegador y las horas que se tardaron en
contestar y en resolver:

```sql
select * from public.v_soporte order by entro desc;
```

Da de alta a tu primera persona de soporte al final de ese mismo archivo: creas
el usuario en **Authentication → Users**, copias su id y lo insertas en `staff`.
