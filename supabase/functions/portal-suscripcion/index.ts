/* ------------------------------------------------------------------
   Lo mismo en las tres funciones. Va copiado adentro de cada archivo
   a propósito: cada función se pega sola en el tablero de Supabase y
   no debe depender de que exista otro archivo al lado.

   No se importa NADA. Ni la librería de Supabase. Todo se hace con
   fetch contra las direcciones que Supabase ya expone, porque una
   dependencia menos es una cosa menos que se rompa el día que algo
   cambie de versión.

   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las pone Supabase sola:
   no se escriben en ningún lado. La llave de servicio nunca sale de
   aquí, nunca viaja al navegador y nunca se pega en un archivo.
   ------------------------------------------------------------------ */

const SB = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const LLAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  || Deno.env.get("SUPABASE_SERVICE_KEY")
  || "";

/* El cotizador se sirve desde GitHub Pages y la función vive en
   supabase.co: son dos direcciones distintas, así que el navegador
   pregunta primero "¿me dejas?". Esto es ese permiso. */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function resp(code: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), {
    status: code,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const CAB = {
  apikey: LLAVE,
  Authorization: "Bearer " + LLAVE,
  "Content-Type": "application/json",
};

const esc = (v: unknown) => encodeURIComponent(String(v ?? ""));

async function pide(ruta: string, opc: RequestInit & { prefer?: string } = {}) {
  const { prefer, ...resto } = opc;
  return await fetch(SB + "/rest/v1/" + ruta, {
    ...resto,
    headers: { ...CAB, ...(prefer ? { Prefer: prefer } : {}) },
  });
}

async function filas(ruta: string): Promise<any[]> {
  const r = await pide(ruta);
  if (!r.ok) { console.error("lectura", ruta, r.status, await r.text()); return []; }
  try { return await r.json(); } catch { return []; }
}

async function una(ruta: string): Promise<any | null> {
  const f = await filas(ruta + (ruta.includes("?") ? "&" : "?") + "limit=1");
  return f.length ? f[0] : null;
}

/* Contar sin traerse las filas: PostgREST lo dice en la cabecera
   content-range, que viene como "0-4/5". El total es lo de después
   de la diagonal. */
async function cuantas(ruta: string): Promise<number> {
  const r = await pide(ruta, { prefer: "count=exact" });
  const n = Number((r.headers.get("content-range") || "").split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}

async function graba(ruta: string, metodo: string, cuerpo?: unknown) {
  const r = await pide(ruta, {
    method: metodo,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("escritura", metodo, ruta, r.status, t);
    return { error: t };
  }
  return { error: null };
}

/* ¿Quién llama? El token de sesión que manda el navegador se lo
   preguntamos a Supabase: si contesta con un usuario, es válido; si
   no, no hay nada que hacer. Esta es la única autenticación que
   importa, y por eso estas funciones NO necesitan "Verify JWT"
   prendido: lo revisan ellas mismas. */
async function quienEres(token: string): Promise<any | null> {
  const r = await fetch(SB + "/auth/v1/user", {
    headers: { apikey: LLAVE, Authorization: "Bearer " + token },
  });
  if (!r.ok) return null;
  try { const u = await r.json(); return u && u.id ? u : null; } catch { return null; }
}

/* ---------- Stripe, sin librería ----------
   La API de Stripe habla formularios, no JSON. Así que se arma el cuerpo
   como un formulario y se manda con fetch. Una dependencia menos.

   La llave secreta vive en los secretos de Supabase y no sale de aquí. */
const STRIPE = Deno.env.get("STRIPE_LLAVE") || "";

/* Stripe recibe objetos anidados como a[b][c]=valor. Esto aplana. */
function aForm(obj: any, prefijo = "", fuera: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const llave = prefijo ? prefijo + "[" + k + "]" : k;
    if (typeof v === "object" && !Array.isArray(v)) aForm(v, llave, fuera);
    else if (Array.isArray(v)) v.forEach((x, i) => {
      if (typeof x === "object") aForm(x, llave + "[" + i + "]", fuera);
      else fuera.push(encodeURIComponent(llave + "[" + i + "]") + "=" + encodeURIComponent(String(x)));
    });
    else fuera.push(encodeURIComponent(llave) + "=" + encodeURIComponent(String(v)));
  }
  return fuera;
}

async function stripe(ruta: string, cuerpo?: any, metodo = "POST") {
  const r = await fetch("https://api.stripe.com/v1/" + ruta, {
    method: metodo,
    headers: {
      "Authorization": "Bearer " + STRIPE,
      "Content-Type": "application/x-www-form-urlencoded",
      /* Stripe fija la versión de su API por cuenta. Pedirla aquí evita que
         un cambio suyo nos mueva el piso sin avisar. */
      "Stripe-Version": "2024-06-20",
    },
    body: cuerpo ? aForm(cuerpo).join("&") : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Stripe", ruta, r.status, d && d.error && d.error.message);
    throw new Error((d && d.error && d.error.message) || "Stripe rechazó la petición");
  }
  return d;
}

/* Los precios viven AQUÍ, en el servidor, y no se leen de lo que manda el
   navegador: si el monto viniera del navegador, cualquiera contrataría el
   plan Pro por un peso.

   Van en centavos porque así los pide Stripe. */
const PLANES: Record<string, { nombre: string; mensual: number; anual: number }> = {
  taller_basico: { nombre: "Taller Makers · Básico", mensual: 19900, anual: 199000 },
  taller_maker:  { nombre: "Taller Makers · Maker",  mensual: 44900, anual: 449000 },
  taller_pro:    { nombre: "Taller Makers · Pro",    mensual: 89900, anual: 899000 },
  rest_normal:   { nombre: "Makers Restaurant",      mensual: 19900, anual: 199000 },
  rest_multi:    { nombre: "Makers Restaurant · Multisucursal", mensual: 44900, anual: 449000 },
  tienda_normal: { nombre: "Tiendita Makers",        mensual: 19900, anual: 199000 },
  tienda_multi:  { nombre: "Tiendita Makers · Empresarial",      mensual: 44900, anual: 449000 },
};

/* ==================================================================
   portal-suscripcion
   Devuelve la dirección del portal de Stripe: ahí el cliente cambia su
   tarjeta, baja sus recibos y cancela, solo, sin escribirte.

   Esta es la pieza que hace que se sienta como Netflix, y es la que no
   hay que construir: Stripe ya la tiene hecha.
   ================================================================== */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { error: "Método no permitido" });

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return resp(401, { error: "Falta la sesión" });

    const user = await quienEres(token);
    if (!user) return resp(401, { error: "Sesión no válida" });

    const perfil = await una("perfiles?select=cuenta_id,cuenta_activa,rol&id=eq." + esc(user.id));
    if (!perfil) return resp(404, { error: "Tu perfil no existe" });
    const cuentaId = perfil.cuenta_activa || perfil.cuenta_id;

    const mem = await una("membresias?select=rol&usuario_id=eq." + esc(user.id) + "&cuenta_id=eq." + esc(cuentaId));
    const miRol = (mem && mem.rol) || perfil.rol || "admin";
    if (miRol !== "admin" && miRol !== "dueno") {
      return resp(403, { error: "Solo un administrador puede ver la suscripción" });
    }

    const cuenta = await una("cuentas?select=stripe_cliente&id=eq." + esc(cuentaId));
    if (!cuenta || !cuenta.stripe_cliente) {
      return resp(409, { error: "Esta cuenta todavía no tiene una suscripción con tarjeta" });
    }

    const sitio = (Deno.env.get("SITIO_URL") || req.headers.get("origin") || "").replace(/\/+$/, "");
    const s = await stripe("billing_portal/sessions", {
      customer: cuenta.stripe_cliente,
      return_url: sitio + "/",
      locale: "es-419",
    });

    return resp(200, { url: s.url });
  } catch (e) {
    console.error(e);
    return resp(500, { error: (e && (e as Error).message) || "No se pudo abrir el portal" });
  }
});
