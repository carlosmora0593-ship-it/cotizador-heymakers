# Tarea para Codex: precios nuevos y Multiempresa = sucursales

Escrito por Claude el 31 oct 2026, 17:15. Las reglas de `AGENTS.md` mandan; historial en `HISTORIAL-CODEX/`. **Se publica sólo con «aprobado, publica» de Claude.**

## 1. Lo que decidió Carlos (31 oct)

> «Multiempresa significa que tienen diferentes sucursales de su empresa. Store y Restaurant no van juntas en plan Multiempresa. Tampoco con Imprenta.»
>
> «Poner un precio de promoción: el plan más básico de Store y Restaurant por 98 al mes como promoción de apertura.»

Respuestas de Carlos a las preguntas de Claude:

- **Promoción de apertura: $98 al mes los primeros 3 meses de cada cuenta nueva.** Después, el precio normal ($199). Aplica a **Imprenta Básico, Restaurant y Store**. Maker ($449) y Pro ($899) no cambian. Los 15 días de prueba van antes y son gratis.
- **Multiempresa: $899 al mes, hasta 4 sucursales del mismo sistema.** Aplica a **los tres**, cada uno por separado: Imprenta, Restaurant o Store. **Ya no existe** el combo «Restaurant + Store en una cuenta por $449».
- **Cambio de Carlos (31 oct, 17:30): en Imprenta, Multiempresa va dentro del plan Pro.** Pro sigue costando $899 y ahora **incluye hasta 4 sucursales**. En Imprenta **ya no hay** una tarjeta aparte de Multiempresa. En Restaurant y Store, Multiempresa sigue siendo su propio plan de $899.

> «En Imprenta agreguemos por ese precio del Pro Multiempresa.»

## 2. La landing ya está (Claude)

Ya están en `Claude outputs/nuvoor-landing/sitio/index.html` y en `landing-fuentes.tar.gz` (`build.py`). Falta que Carlos apruebe la vista previa. **No la subas a `nuvoo-web` hasta que Claude diga.**

## 3. Lo que falta en la app

1. **`public/acceso.js`, panel de licencias:** hoy ofrece «Multiempresa · $449 · Restaurant + Store en una cuenta» (`isBoth`) y «Multiempresa · Licencia con más de una empresa».
   - **Imprenta:** Básico $199 (promoción $98 los primeros 3 meses), Maker $449 y **Pro $899, que incluye Multiempresa (hasta 4 sucursales)**. Sin opción aparte de Multiempresa.
   - **Restaurant:** Estándar $199 (promoción $98 los primeros 3 meses) y **Multiempresa $899 (hasta 4 sucursales)**.
   - **Store:** igual que Restaurant.
   - **Quita** el caso «los dos juntos» (`isBoth`) y cualquier texto que lo prometa.
   - **La promoción se dice tal cual:** «$98 al mes los primeros 3 meses; después $199».
2. **`public/lab.html`:** revisa las 2 menciones de 449/Multiempresa y ajústalas al significado nuevo.
3. **Multiempresa por dentro:** las sucursales deben ser **cuentas (empresas) separadas** del mismo dueño, con `membresias`, `crear_empresa` y `cambiar_empresa` (ver la nota «superadmin-y-empresas» y `CORRER-2-superadmin.sql`).
   - Revisa qué existe y escribe en el historial **qué falta** para que el plan permita hasta 4 empresas del mismo producto (por ejemplo, un límite en `crear_empresa` según el plan).
   - **No lo construyas todavía**; sólo diagnostica y propone.
   - El arreglo `productos` de `sql/18-productos-cuenta.sql` (varios POS en una cuenta) **ya no es la idea de Multiempresa**. Anótalo, sin borrar nada.
4. **Cobros:** siguen sin configurarse (pendiente 3 de `AGENTS.md`). Cuando se configuren Stripe o Mercado Pago, la promoción se hace con un **cupón o precio introductorio de 3 meses**. Déjalo anotado en `PASOS-STRIPE.md`.
5. **Sello** de lo que toques y caché si aplica.

## 4. Pruebas

- [ ] El panel de licencias de Imprenta, Restaurant y Store muestra los precios de arriba, la promoción con su vigencia y las 4 sucursales (en Imprenta, dentro de Pro; en Restaurant y Store, como Multiempresa).
- [ ] Ya no aparece «Restaurant + Store».
- [ ] Sin errores de consola. Prueba en Chrome headless con Supabase falso, **sin Computer Use**.

## 5. Pregunta que ya se resolvió

Imprenta **Pro** y **Multiempresa** costaban lo mismo ($899). Carlos decidió juntarlos: **Pro incluye las 4 sucursales** (ver sección 1). La landing ya está ajustada. En el diagnóstico del punto 3.3, el límite de 4 empresas aplica al plan **Pro** de Imprenta y al plan **Multiempresa** de Restaurant y de Store.
