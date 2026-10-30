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
   webhook-mercadopago
   Recibe los avisos de Mercado Pago y activa, renueva o suspende la
   cuenta. Esta dirección se registra en Mercado Pago → Tus
   integraciones → Webhooks:

   https://TU-PROYECTO.supabase.co/functions/v1/webhook-mercadopago?clave=LA-QUE-PONGAS

   Esta función la llama Mercado Pago, no el navegador: por eso
   "Verify JWT" tiene que estar APAGADO. Lo único que la protege es
   la clave de la dirección, y es suficiente mientras sea larga.
   ================================================================== */

function ok(msg: string) { return new Response(msg, { status: 200 }); }

function sumaPeriodo(ciclo: string) {
  const d = new Date();
  if (ciclo === "anual") d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
  return d;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const qs = url.searchParams;

  // Mercado Pago reintenta si no respondemos 200, así que siempre contestamos 200
  // salvo cuando la clave no coincide.
  const esperada = Deno.env.get("WEBHOOK_CLAVE") || "";
  if (esperada && qs.get("clave") !== esperada) {
    return new Response("clave incorrecta", { status: 401 });
  }

  try {
    let cuerpo: any = {};
    try { cuerpo = await req.json(); } catch { cuerpo = {}; }

    const tipo = String(cuerpo.type || cuerpo.topic || qs.get("type") || qs.get("topic") || "");
    const id = (cuerpo.data && cuerpo.data.id) || qs.get("data.id") || qs.get("id");
    if (!id) return ok("aviso sin id: " + tipo);

    const mpCab = { "Authorization": "Bearer " + (Deno.env.get("MP_ACCESS_TOKEN") || "") };

    /* Mercado Pago manda DOS avisos distintos y hay que atender los dos:
     *
     *   subscription_preapproval          la suscripción se creó, se pausó
     *                                     o se canceló.
     *   subscription_authorized_payment   cobró la mensualidad.
     *
     * El segundo es el que llega cada mes. Si solo escucháramos el primero,
     * la cuenta de alguien que paga puntual se vencería igual, porque nadie
     * le estaría moviendo la fecha. El aviso del cobro no trae la
     * suscripción: trae el pago, y de ahí se saca a cuál pertenece. */
    let preapprovalId: string | null = null;

    if (tipo.indexOf("authorized_payment") >= 0) {
      const rp = await fetch("https://api.mercadopago.com/authorized_payments/" + id, { headers: mpCab });
      if (!rp.ok) { console.error("No se pudo leer el cobro", await rp.text()); return ok("sin datos del cobro"); }
      const pago = await rp.json();
      preapprovalId = pago.preapproval_id;
      if (!preapprovalId) return ok("cobro sin suscripción");
      /* Un cobro rechazado no renueva nada: que siga su curso y que el
         aviso de la suscripción decida si se pausa. */
      if (pago.status && pago.status !== "approved" && pago.status !== "accredited") {
        console.warn("Cobro no aprobado", id, pago.status);
        return ok("cobro " + pago.status);
      }
    } else if (tipo.indexOf("preapproval") >= 0) {
      preapprovalId = String(id);
    } else {
      return ok("aviso ignorado: " + tipo);
    }

    const r = await fetch("https://api.mercadopago.com/preapproval/" + preapprovalId, { headers: mpCab });
    if (!r.ok) { console.error("No se pudo leer la suscripción", await r.text()); return ok("sin datos"); }
    const s = await r.json();

    const ref = String(s.external_reference || "").split("|");
    const cuentaId = ref[0], plan = ref[1] || "basico", ciclo = ref[2] || "mensual";
    if (!cuentaId) return ok("sin referencia de cuenta");

    let cambios: Record<string, unknown>;
    if (s.status === "authorized") {
      // Si Mercado Pago dice cuándo toca el siguiente cobro, esa es la fecha de
      // vencimiento; si no, sumamos el periodo contratado.
      const siguiente = s.next_payment_date ? new Date(s.next_payment_date) : sumaPeriodo(ciclo);
      // Un día de gracia para que un cobro que tarde no tumbe la cuenta.
      siguiente.setDate(siguiente.getDate() + 1);
      cambios = { plan, ciclo, estado: "activa", vence: siguiente.toISOString(), mp_preapproval_id: preapprovalId };
      const productos = (ref[3] || "").split(",").filter((p: string) =>
        ["taller", "restaurant", "tiendita"].includes(p));
      if (productos.length) {
        const unicos = [...new Set(productos)];
        if (!(unicos.includes("taller") && unicos.length > 1)) {
          cambios.productos = unicos;
          cambios.producto = unicos[0];
        }
      }
    } else if (s.status === "paused") {
      cambios = { estado: "vencida", mp_preapproval_id: preapprovalId };
    } else if (s.status === "cancelled") {
      // Se cancela, pero respetamos el periodo ya pagado.
      cambios = { estado: "cancelada", mp_preapproval_id: preapprovalId };
    } else {
      return ok("estado sin acción: " + s.status);
    }

    const { error } = await graba("cuentas?id=eq." + esc(cuentaId), "PATCH", cambios);
    if (error) console.error("No se pudo actualizar la cuenta", error);

    return ok("cuenta " + cuentaId + " → " + s.status);
  } catch (e) {
    console.error(e);
    return ok("error registrado");
  }
});
