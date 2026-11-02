# Tarea para Codex: acceso animado y logo antes de cada POS (1 nov 2026)

Escrita por Claude. **Carlos aprobó la maqueta** («me encantaron las animaciones») **con el color B**: el panel claro del mismo lila-azul de los botones de la landing. Las reglas de `AGENTS.md` mandan. **Se publica sólo con «aprobado, publica» de Claude.**

- **Maqueta interactiva:** https://claude.ai/artifact/9fqtZumL6qDdm86dzj7AER. Tiene la versión de celular, la de computadora y el logo animado; con «Play» se ve cada una moverse. Si no la puedes abrir, todo lo necesario está aquí abajo.
- **Va después de `TAREA-SIN-MAKERSOS.md`.** El logo de la puerta de esa tarea se hace aquí.

## 1. Lo que pidió Carlos

> «Cuando le demos entrar desde la landing, quiero que tenga la animación del video, más el logo animado antes de entrar a cualquier POS.»

El video es un login con un panel de color en diagonal que se barre de un lado al otro entre «Iniciar sesión» y «Registrarse», dentro de una tarjeta oscura con borde brillante.

## 2. El aspecto (igual que la landing)

- **Fondo:** `#0a0d14`, con dos halos difusos: índigo `rgba(68,88,164,.45)` arriba a la izquierda y azul `rgba(61,151,211,.30)` abajo a la derecha.
- **Letra:** la de la landing, por Google Fonts. `Bricolage Grotesque` (títulos), `IBM Plex Sans` (texto) e `IBM Plex Mono` (etiquetas como «UN ACCESO PARA TU NEGOCIO»).
- **Texto:** `#eef3f7`; secundario `#b2bfca`; tenue `#8796a3`.
- **Tarjeta:**
  - Fondo `#11161f`, radio de 24 a 26 px.
  - Borde de 1.5 px en degradado `#9b93e3 → #8ea0f0 → #62c1f3 → #93def0`, con `padding-box`/`border-box`.
  - Brillo: `0 0 22px rgba(98,193,243,.35), 0 0 70px rgba(68,88,164,.30)`.
- **Panel (color B):**
  - `linear-gradient(140deg,#9b93e3 0%,#8ea0f0 45%,#62c1f3 80%,#93def0 100%)`.
  - Sobre el panel, el texto va oscuro: títulos `#0a0d14`, lo demás `#1c2547`.
- **Botón principal:**
  - Píldora `linear-gradient(90deg,#8ea0f0,#62c1f3)`, texto `#0a0d14`, 50 px de alto.
  - Sombra `0 8px 28px rgba(98,193,243,.28)`.
- **Campos:**
  - 46 px de alto, fondo `#0d121b`, borde `#2a3340`.
  - Al enfocar, borde `#8ea0f0` y anillo `rgba(142,160,240,.22)`.
  - Ícono de trazo a la izquierda (correo, candado). Siempre con su `<label>`.
- **Colores de sistema** (puntos que se leen en los dos modos): Imprenta `#22b8d6`, Restaurant `#e0388f`, Store `#22c55e`.

### Modo día (Carlos lo pidió el 1 nov, 20:05)

Arriba va el **modo oscuro**. El acceso sigue el modo del teléfono o la computadora con `prefers-color-scheme`, igual que la landing. Monta todo con variables CSS y cambia sólo los valores; la maqueta ya lo hace así, con el control «Tema» en Tweaks.

| Variable | Oscuro | Día |
|---|---|---|
| Fondo | `#0a0d14` | `#f3f5f8` |
| Texto / secundario / tenue | `#eef3f7` / `#b2bfca` / `#8796a3` | `#0b0f1c` / `#41505d` / `#5d6b78` |
| Tarjeta | `#11161f` | `#ffffff` |
| Borde degradado | `#9b93e3 → #8ea0f0 → #62c1f3 → #93def0` | `#4c4780 → #4458a4 → #3d97d3 → #6cc3dc` |
| Brillo | `0 0 22px rgba(98,193,243,.35), 0 0 70px rgba(68,88,164,.30)` | `0 18px 50px rgba(11,15,28,.10), 0 0 34px rgba(61,151,211,.18)` |
| Halos | `rgba(68,88,164,.45)` y `rgba(61,151,211,.30)` | `rgba(68,88,164,.16)` y `rgba(61,151,211,.14)` |
| Campo / borde / foco | `#0d121b` / `#2a3340` / `#8ea0f0` | `#f6f8fb` / `#d6dce5` / `#4458a4` |
| Botón principal | `#8ea0f0 → #62c1f3`, texto `#0a0d14` | `#3a4f9a → #2a6fb0`, texto `#ffffff` |
| Ligas | `#93def0` | `#2a62b8` |
| Tarjeta de negocio / borde | `#151b27` / `#232c34` | `#f7f8fb` / `#e2e7ec` |
| Botón «Abrir» | fondo `rgba(142,160,240,.12)`, texto `#d6deff` | fondo `rgba(68,88,164,.07)`, texto `#2b3a7a` |
| Palabra NUVOOR (máscara) | `#eef3f7` | `#0b0f1c` |
| Pantalla del logo | fondo `#0a0d14`, pista `#1a2128` | fondo `#f3f5f8`, pista `#e2e7ec` |

- **El panel B y su texto oscuro son iguales en los dos modos.**
- **Capturas de cada pantalla en los dos modos** (sección 6).

## 3. Las pantallas y su animación

Todo con `clip-path: polygon(...)` de 4 puntos y `@keyframes`. Copia las curvas y los tiempos de la maqueta.

| Pantalla | Celular (panel arriba) | Computadora ≥ 900 px (panel de lado) |
|---|---|---|
| Iniciar sesión | `polygon(0 0,100% 0,100% 24%,0 33%)` | `polygon(44% 0,100% 0,100% 100%,80% 100%)` |
| Crear cuenta | `polygon(0 0,100% 0,100% 15%,0 22%)` | `polygon(0 0,56% 0,20% 100%,0 100%)` |
| Tus negocios | `polygon(0 0,100% 0,100% 15%,0 22%)` | `polygon(0 0,34% 0,24% 100%,0 100%)` |
| Cubre todo | `polygon(0 0,100% 0,100% 100%,0 100%)` | igual |

- **Entrada (al llegar desde «Entrar» de la landing):**
  - La tarjeta sube y aparece en 0.7 s.
  - El panel arranca cubriéndolo todo y a los 0.35 s se barre a su lugar en 1 s, con `cubic-bezier(.7,0,.2,1)`.
  - El formulario aparece hacia arriba al segundo.
- **Iniciar sesión ↔ Crear cuenta:** el panel pasa por «cubre todo» (45%) y llega al otro lado en 1.05 s. El texto del panel y el formulario nuevo aparecen a los 0.6 s.
- **Al entrar:** el panel pasa a «Tus negocios». Las tarjetas de negocio aparecen escalonadas, una cada 0.12 s.
- **Mientras `ALTAS_ABIERTAS` sea falso:** «Crea una» hace el mismo barrido, pero del lado de crear cuenta va el aviso «Las cuentas nuevas abren muy pronto. Si ya tienes cuenta, entra con tu correo», con «Entra» para regresar. Cuando se abran, va el formulario de la maqueta: nombre, negocio, sistema, correo, contraseña y «Crear cuenta y probar 15 días».
- **Textos del panel:**
  - Iniciar sesión: «¡Qué gusto verte!» / «Entra y sigue vendiendo.»
  - Crear cuenta: «Bienvenido a Nuvoor» / «15 días gratis, sin tarjeta.»
  - Tus negocios: «Hola de nuevo» / el correo de la sesión.
- **Licencias y «Agregar un negocio»** siguen igual por dentro, con este mismo estilo oscuro.

## 4. El logo animado antes de cada POS

En `abreNegocio()` (y en la apertura automática cuando hay un solo negocio), **antes de `location.replace`**, se muestra una pantalla completa de unos 2.5 s:

1. **La N** (`n-body.png`) entra de izquierda a derecha con `clip-path: inset(0 100% 0 0) → inset(0)`, sube 14 px y se enfoca (de blur 8 px a 0) en 0.8–0.9 s.
2. **Un brillo blanco** la recorre a los 0.95 s: un degradado a 105° con `mask` del mismo `n-body.png`.
3. **La estrella** (`star.png`, arriba a la derecha) entra a los 0.55 s girando de −120° a 0 con un pequeño rebote, y luego titila con `drop-shadow` en bucle.
4. **La palabra NUVOOR** (`palabra-96.png` como `mask` sobre `#eef3f7`) se descubre a los 1.05 s.
5. **Debajo:** «Abriendo Nuvoor Restaurant» y el nombre del negocio (a los 1.25 s), con una barrita de carga de 2.1 s.
6. A los 2.15 s todo se desvanece y crece 6%. A los ~2.5 s, `location.replace(url)`.

- **`prefers-reduced-motion`:** sin animación; el logo quieto 0.4 s y abre.
- **Si la red tarda**, la barrita no espera: el POS abre al terminar la animación.

**Archivos del logo:** `Claude outputs/acceso-animado/n-body.png` (la N sin la estrella), `star.png` (la estrella sola), `n-512.png` y `palabra-96.png`. Cópialos a `public/img/marca/` y úsalos también en la barra superior del acceso: N de 30 px + palabra NUVOOR.

## 5. Lo que no cambia

- **Toda la lógica de `acceso.js`:**
  - Supabase, `mis_empresas` y `crear_negocio`.
  - Licencias, el parámetro `producto` y `app=android`.
  - `limpiaSesionLocal` y «Cerrar sesión».
  - **Sólo cambian las clases, los textos visibles y la pantalla del logo.**
- **`public/config.js` no se toca.**
- **Ningún correo de Carlos** en el código ni en las capturas que se suban al repo.

## 6. Pruebas

- [ ] Capturas en `tmp/acceso-animado/`, a 390 px y a 1280 px, en modo oscuro y en modo día:
  - Iniciar sesión.
  - Mitad del barrido.
  - Crear cuenta con las altas cerradas.
  - Tus negocios.
  - Logo a los 0.6, 1.2 y 2 s.
- [ ] Un video corto (`page.video`) de la entrada y de «Abrir», si Playwright lo permite.
- [ ] Iniciar sesión con Supabase falso, como en las pruebas anteriores. La contraseña real de Carlos nunca se usa.
- [ ] «Abrir» sigue llevando a la URL correcta con `cuenta=` y `app=android`.
- [ ] Con `prefers-reduced-motion` no hay animación y abre igual.
- [ ] A 320 px no se encima nada; sin errores de consola. Sube los sellos de versión.

**No publiques.** Avisa a Claude con las capturas.
