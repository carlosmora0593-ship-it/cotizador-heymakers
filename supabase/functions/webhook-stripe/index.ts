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
    signal: AbortSignal.timeout(10000),
    ...resto,
    headers: { ...CAB, ...(prefer ? { Prefer: prefer } : {}) },
  });
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
    signal: AbortSignal.timeout(10000),
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
  imprenta_basico: { nombre: "Nuvoor Imprenta · Básico", mensual: 19900, anual: 199000 },
  imprenta_maker: { nombre: "Nuvoor Imprenta · Maker", mensual: 44900, anual: 449000 },
  imprenta_pro: { nombre: "Nuvoor Imprenta · Pro (hasta 4 sucursales)", mensual: 89900, anual: 899000 },
  restaurant_estandar: { nombre: "Nuvoor Restaurant", mensual: 19900, anual: 199000 },
  restaurant_multi: { nombre: "Nuvoor Restaurant · Multiempresa (hasta 4 sucursales)", mensual: 89900, anual: 899000 },
  store_estandar: { nombre: "Nuvoor Store", mensual: 19900, anual: 199000 },
  store_multi: { nombre: "Nuvoor Store · Multiempresa (hasta 4 sucursales)", mensual: 89900, anual: 899000 },
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
  imprenta_basico: "basico", imprenta_maker: "maker", imprenta_pro: "pro",
  restaurant_estandar: "basico", restaurant_multi: "maker",
  store_estandar: "basico", store_multi: "maker",
  taller_basico: "basico", taller_maker: "maker", taller_pro: "pro",
  rest_normal: "basico", rest_multi: "maker", tienda_normal: "basico", tienda_multi: "maker",
};

function metadatosFactura(o: any) {
  const cabeza = o.subscription_details || (o.parent && o.parent.subscription_details);
  if (cabeza && cabeza.metadata && cabeza.metadata.cuenta_id) return cabeza.metadata;
  if (o.metadata && o.metadata.cuenta_id) return o.metadata;
  const lineas = (o.lines && o.lines.data) || [];
  for (const linea of lineas) {
    const m = linea.metadata || (linea.parent && linea.parent.subscription_item_details && linea.parent.subscription_item_details.metadata);
    if (m && m.cuenta_id) return m;
  }
  return (cabeza && cabeza.metadata) || o.metadata || {};
}

// Sólo las Edge Functions con service_role pueden llamar estas RPC.
async function rpc(nombre: string, datos: any) {
  const r = await pide("rpc/" + nombre, { method: "POST", body: JSON.stringify(datos) });
  if (!r.ok) throw new Error("No se pudo aplicar el aviso de Stripe: " + r.status);
  return r.status === 204 ? null : await r.json();
}
async function cuentaDe(id: string) {
  const r = await pide("cuentas?select=id,producto,stripe_cliente,stripe_suscripcion&limit=1&id=eq." + esc(id));
  if (!r.ok) throw new Error("No se pudo leer la cuenta");
  const filas = await r.json();
  if (!filas[0]) throw new Error("El aviso no corresponde a una cuenta existente");
  return filas[0];
}
function idDe(o: any) { return typeof o === "string" ? o : o && o.id; }
function corresponde(plan: string, producto: string) {
  const prefijo = producto === "taller" ? /^(imprenta_|taller_)/ :
    producto === "restaurant" ? /^(restaurant_|rest_)/ : /^(store_|tienda_)/;
  return !!PLAN_INTERNO[plan] && prefijo.test(plan);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  const crudo = await req.text();
  const firma = req.headers.get("stripe-signature") || "";
  const secreto = Deno.env.get("STRIPE_WEBHOOK_SECRETO") || "";
  if (!(await firmaBuena(crudo, firma, secreto))) return new Response("firma inválida", { status: 400 });
  let ev: any;
  try { ev = JSON.parse(crudo); } catch { return new Response("cuerpo ilegible", { status: 400 }); }
  const o = ev.data?.object || {};
  let turno: any = null;
  try {
    if (ev.type === "checkout.session.async_payment_failed") {
      console.warn("pago pendiente de OXXO vencido", o.id || "sin id");
      return ok("fallo de pago asíncrono registrado");
    }
    const checkout = ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(ev.type);
    const suscripcion = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(ev.type);
    const factura = ["invoice.paid", "invoice.payment_failed"].includes(ev.type);
    if (!checkout && !suscripcion && !factura) return ok("aviso ignorado");
    if (checkout && o.mode === "payment" && o.payment_status !== "paid") return ok("sin pago suelto confirmado");
    if (checkout && o.mode !== "payment" && o.mode !== "subscription") return ok("sesión sin licencia");
    if (!ev.id || !o.id) throw new Error("Falta identificador del aviso");
    const m = factura ? metadatosFactura(o) : o.metadata || {};
    let subId = suscripcion ? o.id : (factura || checkout) ? idDe(o.subscription || o.parent?.subscription_details?.subscription) : null;
    let cuentaId = m.cuenta_id || (checkout ? o.client_reference_id : null);
    // Algunas facturas no incluyen metadatos; la suscripción conserva la relación.
    if (!cuentaId && subId) {
      const sub = await stripe("subscriptions/" + esc(subId), undefined, "GET");
      cuentaId = sub.metadata?.cuenta_id;
    }
    if (!cuentaId) return ok("aviso ajeno a Nuvoor");
    const llave = { p_cuenta: cuentaId, p_token: crypto.randomUUID() };
    if (!await rpc("stripe_toma", llave)) throw new Error("Otro aviso está procesando este negocio");
    turno = llave;
    const c = await cuentaDe(cuentaId);
    let cambios: Record<string, unknown>;
    let sumar: string | null = null;
    let sesion: string | null = null;
    if (checkout && o.mode === "payment") {
      // Consultar la sesión evita aplicar un snapshot antiguo o incompleto.
      const actual = await stripe("checkout/sessions/" + esc(o.id), undefined, "GET");
      if (actual.payment_status !== "paid" || actual.mode !== "payment") return ok("pago no confirmado");
      if (idDe(actual.customer) !== c.stripe_cliente || actual.metadata?.cuenta_id !== cuentaId)
        throw new Error("La sesión no corresponde al cliente de la cuenta");
      const p = actual.metadata?.plan;
      if (!corresponde(p, c.producto) || !["mensual", "anual"].includes(actual.metadata?.ciclo))
        throw new Error("Plan o periodo del pago desconocido");
      const alias: Record<string,string> = { taller_basico:"imprenta_basico",taller_maker:"imprenta_maker",taller_pro:"imprenta_pro",rest_normal:"restaurant_estandar",rest_multi:"restaurant_multi",tienda_normal:"store_estandar",tienda_multi:"store_multi" };
      const precio = PLANES[p] || PLANES[alias[p]];
      const monto = actual.metadata.ciclo === "anual" ? precio.anual : precio.mensual;
      if (actual.currency !== "mxn" || actual.amount_total !== monto) throw new Error("Importe de OXXO inesperado");
      cambios = { plan: PLAN_INTERNO[p], ciclo: actual.metadata.ciclo, estado: "activa", forma_pago: "oxxo", pago_previo: true, cobro_fallido: null };
      sumar = actual.metadata.ciclo; sesion = actual.id;
    } else {
      subId = subId || c.stripe_suscripcion;
      if (!subId) return ok("factura sin suscripción");
      // Se consulta BAJO el turno por cuenta: eventos viejos y del mismo segundo
      // aplican el estado actual de Stripe, no su snapshot fuera de orden.
      const sub = await stripe("subscriptions/" + esc(subId) + "?expand[]=latest_invoice", undefined, "GET");
      if (idDe(sub.customer) !== c.stripe_cliente || sub.metadata?.cuenta_id !== cuentaId)
        throw new Error("La suscripción no corresponde a la cuenta");
      if (c.stripe_suscripcion && c.stripe_suscripcion !== sub.id) {
        const previa = await stripe("subscriptions/" + esc(c.stripe_suscripcion), undefined, "GET");
        if (!["canceled", "incomplete_expired"].includes(previa.status) || Number(previa.created) >= Number(sub.created))
          return ok("aviso de otra suscripción ignorado");
      }
      if (!corresponde(sub.metadata?.plan, c.producto)) throw new Error("Plan de suscripción desconocido");
      const vivo = sub.status === "active" || sub.status === "trialing";
      if (checkout && !vivo) return ok("suscripción aún sin activar");
      const fin = Number(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end);
      if (vivo && !(fin > 0)) throw new Error("Falta la fecha del periodo de Stripe");
      const ultima = typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
      cambios = {
        stripe_suscripcion: sub.id, plan: PLAN_INTERNO[sub.metadata.plan], ciclo: sub.metadata.ciclo,
        estado: vivo ? "activa" : sub.status === "canceled" ? "cancelada" : "vencida",
        forma_pago: "tarjeta", pago_previo: true,
        cobro_fallido: ["past_due", "unpaid"].includes(sub.status) ? new Date().toISOString() : null,
      };
      if (vivo) cambios.vence = new Date((fin + 86400) * 1000).toISOString();
      if (ultima?.status === "paid") cambios.cobro_fallido = null;
      if (checkout) sesion = o.id;
      // canceled conserva vence. cancel_at_period_end NO vuelve activa una deuda.
    }
    const aplicado = await rpc("stripe_aplica", { ...turno, p_evento: ev.id, p_sesion: sesion, p_cambios: cambios, p_sumar: sumar });
    return ok(aplicado ? "licencia actualizada" : "pago ya aplicado");
  } catch (e) {
    console.error("aviso Stripe pendiente de reintento", (e as Error).message);
    return new Response("No se pudo procesar; reintentar", { status: 503 });
  } finally {
    if (turno) try { await rpc("stripe_suelta", turno); } catch (_) { /* el turno caduca */ }
  }
});
