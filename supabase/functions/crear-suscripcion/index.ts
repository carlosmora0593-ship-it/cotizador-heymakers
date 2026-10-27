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

/* ==================================================================
   crear-suscripcion
   Crea la suscripción en Mercado Pago y devuelve el enlace de pago.
   Se llama desde el navegador con el token de sesión del usuario.
   ================================================================== */

/* Los precios viven AQUÍ, en el servidor, y no se leen de lo que
   manda el navegador: si el monto viniera del navegador, cualquiera
   podría contratar el plan Pro por un peso. El costo de esta
   decisión es que hay que cambiarlos en dos lados —aquí y en
   public/config.js— cuando suban. */
const PRECIOS: Record<string, any> = {
  basico: { mensual: 199, anual: 1990, nombre: "Básico" },
  maker: { mensual: 449, anual: 4490, nombre: "Maker" },
  pro: { mensual: 899, anual: 8990, nombre: "Pro" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { error: "Método no permitido" });

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return resp(401, { error: "Falta la sesión" });

    let datos: any = {};
    try { datos = await req.json(); } catch { datos = {}; }
    const { plan, ciclo } = datos;
    if (!PRECIOS[plan]) return resp(400, { error: "Plan desconocido" });
    const periodo = ciclo === "anual" ? "anual" : "mensual";
    const monto = PRECIOS[plan][periodo];

    const user = await quienEres(token);
    if (!user) return resp(401, { error: "Sesión no válida" });

    const perfil = await una("perfiles?select=cuenta_id,cuenta_activa,rol&id=eq." + esc(user.id));
    if (!perfil) return resp(404, { error: "La cuenta no existe todavía" });

    /* Desde que una persona puede tener varias empresas, "su cuenta" ya no es
       una sola: es la que trae abierta. Cobrarle a perfiles.cuenta_id —la
       primera que abrió— le cobraría la suscripción a la empresa equivocada. */
    const cuentaId = perfil.cuenta_activa || perfil.cuenta_id;
    if (!cuentaId) return resp(404, { error: "La cuenta no existe todavía" });

    /* Y contratar no es cualquier cosa: solo el administrador de ESA empresa.
       Quien entró como ventas o producción no le cambia el plan a nadie. */
    const mem = await una("membresias?select=rol&usuario_id=eq." + esc(user.id) + "&cuenta_id=eq." + esc(cuentaId));
    const miRol = (mem && mem.rol) || perfil.rol || "admin";
    if (miRol !== "admin" && miRol !== "dueno") {
      return resp(403, { error: "Solo un administrador puede contratar o cambiar el plan" });
    }

    /* A dónde regresa la gente después de pagar. Antes se sacaba del
       nombre del servidor que atendía; aquí la función vive en
       supabase.co, que no es el sitio. Así que: lo que diga el secreto
       SITIO_URL y, si no está puesto, el sitio desde el que llamaron. */
    const sitio = (Deno.env.get("SITIO_URL") || req.headers.get("origin") || "").replace(/\/+$/, "");
    if (!sitio.startsWith("https://")) {
      return resp(500, { error: "Falta configurar SITIO_URL en los secretos de Supabase" });
    }

    const clave = Deno.env.get("WEBHOOK_CLAVE") || "";

    // ---- Mercado Pago: suscripción sin plan asociado --------------------
    // Referencia: API de suscripciones (preapproval) de Mercado Pago.
    // Si Mercado Pago cambia algún nombre de campo, se ajusta SOLO aquí.
    const cuerpo = {
      reason: "Cotizador " + PRECIOS[plan].nombre,
      external_reference: [cuentaId, plan, periodo].join("|"),
      payer_email: user.email,
      back_url: sitio + "/?pago=ok",
      /* Sin esto, Mercado Pago no tiene a dónde avisar que ya cobró, y la
         cuenta se queda en "pendiente" para siempre aunque el dinero haya
         entrado. La clave va en la dirección porque el webhook no tiene otra
         forma de saber que quien toca es Mercado Pago y no un curioso. */
      notification_url: SB + "/functions/v1/webhook-mercadopago" +
        (clave ? "?clave=" + encodeURIComponent(clave) : ""),
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: periodo === "anual" ? "years" : "months",
        transaction_amount: monto,
        currency_id: "MXN",
      },
    };

    const r = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (Deno.env.get("MP_ACCESS_TOKEN") || ""),
      },
      body: JSON.stringify(cuerpo),
    });
    const mp = await r.json().catch(() => ({}));

    if (!r.ok) {
      console.error("Mercado Pago respondió", r.status, mp);
      return resp(502, { error: (mp && mp.message) || "Mercado Pago rechazó la solicitud" });
    }

    await graba("cuentas?id=eq." + esc(cuentaId), "PATCH", { mp_preapproval_id: mp.id });

    return resp(200, { init_point: mp.init_point || mp.sandbox_init_point, id: mp.id });
  } catch (e) {
    console.error(e);
    return resp(500, { error: "Error inesperado al crear la suscripción" });
  }
});
