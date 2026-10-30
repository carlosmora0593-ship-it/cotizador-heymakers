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
   webhook-stripe
   Stripe avisa aquí cada vez que pasa algo con el dinero. Esta función
   es la única que activa, renueva o vence una cuenta.

   Se registra en Stripe → Developers → Webhooks:
     https://TU-PROYECTO.supabase.co/functions/v1/webhook-stripe

   Como la llama Stripe y no el navegador, "Verify JWT" va APAGADO. Lo
   que la protege es la FIRMA: Stripe firma cada aviso con un secreto
   que sólo ustedes dos conocen, y aquí se verifica antes de tocar nada.
   Sin eso, cualquiera que adivine la dirección se regala el plan Pro.
   ================================================================== */

function ok(msg: string) { return new Response(msg, { status: 200 }); }

/* Firma de Stripe: cabecera "t=123,v1=abc...". Se arma HMAC-SHA256 de
   "t.cuerpo" con el secreto y se compara en tiempo constante. */
async function firmaBuena(cuerpo: string, cabecera: string, secreto: string): Promise<boolean> {
  if (!cabecera || !secreto) return false;
  const partes: Record<string, string[]> = {};
  cabecera.split(",").forEach((p) => {
    const i = p.indexOf("=");
    if (i < 0) return;
    const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
    (partes[k] = partes[k] || []).push(v);
  });
  const t = (partes["t"] || [])[0];
  const firmas = partes["v1"] || [];
  if (!t || !firmas.length) return false;

  /* Un aviso viejo repetido no debe revivir una cuenta: cinco minutos. */
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) { console.warn("aviso fuera de tiempo"); return false; }

  const llave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(t + "." + cuerpo));
  const esperado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return firmas.some((f) => {
    if (f.length !== esperado.length) return false;
    let dif = 0;
    for (let i = 0; i < f.length; i++) dif |= f.charCodeAt(i) ^ esperado.charCodeAt(i);
    return dif === 0;
  });
}

const PLAN_INTERNO: Record<string, string> = {
  taller_basico: "basico", taller_maker: "maker", taller_pro: "pro",
  rest_normal: "basico", rest_multi: "maker",
  tienda_normal: "basico", tienda_multi: "maker",
};

function sumaPeriodo(desde: Date, ciclo: string) {
  const d = new Date(desde);
  if (ciclo === "anual") d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
  d.setDate(d.getDate() + 1);          // un día de gracia
  return d;
}

Deno.serve(async (req) => {
  const crudo = await req.text();
  const firma = req.headers.get("stripe-signature") || "";
  const secreto = Deno.env.get("STRIPE_WEBHOOK_SECRETO") || "";

  if (!(await firmaBuena(crudo, firma, secreto))) {
    console.error("firma inválida");
    return new Response("firma inválida", { status: 400 });
  }

  let ev: any = {};
  try { ev = JSON.parse(crudo); } catch { return ok("cuerpo ilegible"); }
  const o = (ev.data && ev.data.object) || {};

  try {
    switch (ev.type) {
      /* ---- pago suelto: OXXO o tarjeta de una sola vez ---- */
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        if (o.mode !== "payment") return ok("sesión de suscripción, la atiende el otro aviso");
        if (o.payment_status !== "paid") return ok("todavía sin pagar: " + o.payment_status);
        const m = o.metadata || {};
        const cuentaId = m.cuenta_id || o.client_reference_id;
        if (!cuentaId) return ok("sesión sin cuenta");
        const c = await una("cuentas?select=vence&id=eq." + esc(cuentaId));
        const desde = c && c.vence && new Date(c.vence) > new Date() ? new Date(c.vence) : new Date();
        await graba("cuentas?id=eq." + esc(cuentaId), "PATCH", {
          plan: PLAN_INTERNO[m.plan] || "basico",
          ciclo: m.ciclo || "mensual",
          estado: "activa",
          vence: sumaPeriodo(desde, m.ciclo || "mensual").toISOString(),
          forma_pago: "oxxo",
        });
        return ok("cuenta " + cuentaId + " extendida");
      }

      /* ---- la suscripción con tarjeta ---- */
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const m = o.metadata || {};
        const cuentaId = m.cuenta_id;
        if (!cuentaId) return ok("suscripción sin cuenta");
        /* current_period_end viene en segundos; más un día de gracia para
           que un cobro que tarde no tumbe a nadie. */
        const fin = new Date((Number(o.current_period_end) || 0) * 1000);
        fin.setDate(fin.getDate() + 1);
        const vivo = o.status === "active" || o.status === "trialing";
        const cambios: Record<string, unknown> = {
          stripe_suscripcion: o.id,
          forma_pago: "tarjeta",
          estado: vivo ? "activa" : (o.status === "canceled" ? "cancelada" : "vencida"),
        };
        if (m.plan) cambios.plan = PLAN_INTERNO[m.plan] || "basico";
        if (m.ciclo) cambios.ciclo = m.ciclo;
        if (vivo && Number(o.current_period_end)) cambios.vence = fin.toISOString();
        await graba("cuentas?id=eq." + esc(cuentaId), "PATCH", cambios);
        return ok("cuenta " + cuentaId + " → " + o.status);
      }

      case "customer.subscription.deleted": {
        const cuentaId = (o.metadata || {}).cuenta_id;
        if (!cuentaId) return ok("suscripción sin cuenta");
        /* Se cancela, pero se respeta el periodo ya pagado: la fecha de
           vencimiento no se toca. */
        await graba("cuentas?id=eq." + esc(cuentaId), "PATCH", { estado: "cancelada" });
        return ok("cuenta " + cuentaId + " cancelada");
      }

      /* ---- el cobro rebotó ---- */
      case "invoice.payment_failed": {
        const cuentaId = (o.subscription_details && o.subscription_details.metadata &&
                          o.subscription_details.metadata.cuenta_id) || (o.metadata || {}).cuenta_id;
        console.warn("cobro rechazado", cuentaId, o.id);
        /* Aquí NO se vence la cuenta: Stripe reintenta varios días y avisa
           al cliente. Si al final no entra, llega subscription.updated con
           past_due o unpaid, y ése sí la vence. */
        if (cuentaId) await graba("cuentas?id=eq." + esc(cuentaId), "PATCH", { cobro_fallido: new Date().toISOString() });
        return ok("rechazo registrado");
      }

      case "invoice.paid": {
        const cuentaId = (o.subscription_details && o.subscription_details.metadata &&
                          o.subscription_details.metadata.cuenta_id);
        if (cuentaId) await graba("cuentas?id=eq." + esc(cuentaId), "PATCH", { cobro_fallido: null });
        return ok("cobrado");
      }

      default:
        return ok("aviso ignorado: " + ev.type);
    }
  } catch (e) {
    console.error(e);
    /* Siempre 200 salvo firma mala: si contestamos error, Stripe reintenta
       en bucle y el problema se multiplica en vez de verse. */
    return ok("error registrado");
  }
});
