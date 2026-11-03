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

async function filas(ruta: string): Promise<any[]> {
  const r = await pide(ruta);
  if (!r.ok) throw new Error("No se pudo consultar la cuenta de cobro");
  return await r.json();
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
    signal: AbortSignal.timeout(10000),
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
  for (const [k, v] of Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) {
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

async function stripe(ruta: string, cuerpo?: any, metodo = "POST", idempotencia?: string) {
  const r = await fetch("https://api.stripe.com/v1/" + ruta, {
    signal: AbortSignal.timeout(10000),
    method: metodo,
    headers: {
      "Authorization": "Bearer " + STRIPE,
      "Content-Type": "application/x-www-form-urlencoded",
      /* Stripe fija la versión de su API por cuenta. Pedirla aquí evita que
         un cambio suyo nos mueva el piso sin avisar. */
      "Stripe-Version": "2024-06-20",
      ...(idempotencia ? { "Idempotency-Key": idempotencia } : {}),
    },
    body: cuerpo ? aForm(cuerpo).join("&") : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Stripe", ruta, r.status, d && d.error && d.error.message);
    const e = new Error((d && d.error && d.error.message) || "Stripe rechazó la petición") as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return d;
}

/* Los precios viven AQUÍ, en el servidor, y no se leen de lo que manda el
   navegador: si el monto viniera del navegador, cualquiera contrataría el
   plan Pro por un peso.

   Van en centavos porque así los pide Stripe. */
const PLANES: Record<string, { nombre: string; mensual: number; anual: number }> = {
  imprenta_basico:     { nombre: "Nuvoor Imprenta · Básico", mensual: 19900, anual: 199000 },
  imprenta_maker:      { nombre: "Nuvoor Imprenta · Maker", mensual: 44900, anual: 449000 },
  imprenta_pro:        { nombre: "Nuvoor Imprenta · Pro (hasta 4 sucursales)", mensual: 89900, anual: 899000 },
  restaurant_estandar: { nombre: "Nuvoor Restaurant", mensual: 19900, anual: 199000 },
  restaurant_multi:    { nombre: "Nuvoor Restaurant · Multiempresa (hasta 4 sucursales)", mensual: 89900, anual: 899000 },
  store_estandar:      { nombre: "Nuvoor Store", mensual: 19900, anual: 199000 },
  store_multi:         { nombre: "Nuvoor Store · Multiempresa (hasta 4 sucursales)", mensual: 89900, anual: 899000 },
};
const ALIAS_PLAN: Record<string, string> = {
  taller_basico: "imprenta_basico", taller_maker: "imprenta_maker", taller_pro: "imprenta_pro",
  rest_normal: "restaurant_estandar", rest_multi: "restaurant_multi",
  tienda_normal: "store_estandar", tienda_multi: "store_multi",
};
const PLAN_PRODUCTO: Record<string, Record<string, string>> = {
  taller: { basico: "imprenta_basico", maker: "imprenta_maker", pro: "imprenta_pro" },
  restaurant: { basico: "restaurant_estandar", maker: "restaurant_multi", multiempresa: "restaurant_multi" },
  tiendita: { basico: "store_estandar", maker: "store_multi", multiempresa: "store_multi" },
};
const PRODUCTO_PLAN: Record<string, string> = {
  imprenta_basico: "taller", imprenta_maker: "taller", imprenta_pro: "taller",
  restaurant_estandar: "restaurant", restaurant_multi: "restaurant",
  store_estandar: "tiendita", store_multi: "tiendita",
};
function productoCanonico(v: string) {
  const x = String(v || "").toLowerCase();
  return x === "imprenta" ? "taller" : x === "store" ? "tiendita" : x;
}
function urlVuelta(sitio: string, cuentaId: string, producto: string, app: string, pago: string) {
  if (producto === "taller") {
    const u = new URL("/", sitio);
    u.searchParams.set("pago", pago); u.searchParams.set("cuenta", cuentaId); u.searchParams.set("producto", "taller");
    u.hash = "suscResumen";
    if (app === "android") u.searchParams.set("app", "android");
    return u.toString();
  }
  const u = new URL("/acceso.html", sitio);
  u.searchParams.set("planes", "1"); u.searchParams.set("gestion", "1");
  u.searchParams.set("producto", producto); u.searchParams.set("cuenta", cuentaId); u.searchParams.set("pago", pago);
  if (app === "android") u.searchParams.set("app", "android");
  return u.toString();
}
async function aseguraCuponApertura() {
  const id = "nuvoor-apertura-98";
  const valida = (c: any) => {
    if (c.amount_off !== 10100 || c.currency !== "mxn" || c.duration !== "repeating" || c.duration_in_months !== 3 || c.valid === false)
      throw new Error("El cupón de apertura requiere revisión antes de cobrar.");
    return c;
  };
  try { return valida(await stripe("coupons/" + id, undefined, "GET")); }
  catch (e) {
    if ((e as Error & {status?:number}).status !== 404) throw e;
  }
  try {
    return valida(await stripe("coupons", {
      id, amount_off: 10100, currency: "mxn", duration: "repeating",
      duration_in_months: 3, name: "Promoción de apertura",
    }));
  } catch (e) {
    /* Si dos cuentas nuevas crean el cupón al mismo tiempo, la segunda
       vuelve a leer el id fijo en vez de fallar o crear otro descuento. */
    try { return valida(await stripe("coupons/" + id, undefined, "GET")); }
    catch (_) { throw e; }
  }
}

/* ==================================================================
   crear-pago
   Devuelve la dirección de la página de cobro de Stripe. Tres formas:

     tarjeta       suscripción de verdad: se guarda la tarjeta y se cobra
                   sola cada mes. Esto es lo que se siente como Netflix.
     oxxo          un pago suelto, en efectivo, que suma un mes.
     transferencia no pasa por Stripe: se le enseñan los datos bancarios
       y lo registra el equipo de Nuvoor. Un año de golpe, sin
                   comisión de nadie.
   ================================================================== */

async function rpc(nombre: string, datos: any) {
  const r = await pide("rpc/" + nombre, { method: "POST", body: JSON.stringify(datos) });
  if (!r.ok) throw new Error("No se pudo guardar la operación de cobro. Revisa las migraciones 18, 22 y 23.");
  return r.status === 204 ? null : await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { error: "Método no permitido" });

  let turno: { p_cuenta: string; p_token: string } | null = null;
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return resp(401, { error: "Falta la sesión" });

    let datos: any = {};
    try { datos = await req.json(); } catch { datos = {}; }
    const { plan: planSolicitado, ciclo, forma, producto: productoSolicitado, cuenta_id: cuentaSolicitada, app } = datos;
    const metodo = ["tarjeta", "oxxo", "transferencia"].includes(forma) ? forma : "tarjeta";

    const user = await quienEres(token);
    if (!user) return resp(401, { error: "Sesión no válida" });

    const perfil = await una("perfiles?select=cuenta_id,cuenta_activa,rol&id=eq." + esc(user.id));
    if (!perfil) return resp(404, { error: "La cuenta no existe todavía" });
    const cuentaId = cuentaSolicitada || perfil.cuenta_activa || perfil.cuenta_id;
    if (!cuentaId) return resp(404, { error: "La cuenta no existe todavía" });

    /* Contratar no es cualquier cosa: sólo el administrador de ESA empresa. */
    const mem = await una("membresias?select=rol&usuario_id=eq." + esc(user.id) + "&cuenta_id=eq." + esc(cuentaId));
    if (!mem && perfil.cuenta_id !== cuentaId)
      return resp(403, { error: "No tienes acceso a este negocio" });
    const miRol = (mem && mem.rol) || perfil.rol || "";
    if (miRol !== "admin" && miRol !== "dueno") {
      return resp(403, { error: "Solo un administrador puede contratar o cambiar el plan" });
    }

    const llaveTurno = { p_cuenta: cuentaId, p_token: crypto.randomUUID() };
    if (!await rpc("stripe_toma", llaveTurno)) return resp(409, { error: "Hay un cobro en proceso. Espera unos segundos e intenta de nuevo." });
    turno = llaveTurno;
    const cuenta = await una("cuentas?select=producto,plan,vence,stripe_cliente,stripe_suscripcion,nombre,pago_previo&id=eq." + esc(cuentaId));
    if (!cuenta) return resp(404, { error: "No se encontró el negocio elegido" });
    const productoCuenta = productoCanonico(cuenta.producto || "");
    const productoPedido = productoCanonico(productoSolicitado || productoCuenta);
    if (!productoCuenta || productoPedido !== productoCuenta)
      return resp(400, { error: "El producto elegido no corresponde a este negocio" });
    const clave = PLANES[planSolicitado] ? planSolicitado :
      ALIAS_PLAN[planSolicitado] || (PLAN_PRODUCTO[productoCuenta] || {})[planSolicitado] || "";
    const P = PLANES[clave];
    if (!P || PRODUCTO_PLAN[clave] !== productoCuenta) return resp(400, { error: "Plan desconocido para este negocio" });
    /* Transferencia es anual según la opción comercial; el navegador no
       puede convertirla en un cobro mensual ni alterar el monto. */
    const periodo = metodo === "transferencia" ? "anual" :
      metodo === "oxxo" ? "mensual" : (ciclo === "anual" ? "anual" : "mensual");
    const monto = periodo === "anual" ? P.anual : P.mensual;

    // Incluso si el webhook tarda, Stripe impide contratar otra suscripción.
    if (cuenta.stripe_cliente) {
      const subs = await stripe("subscriptions?customer=" + esc(cuenta.stripe_cliente) + "&status=all&limit=100", undefined, "GET");
      if (!Array.isArray(subs.data)) throw new Error("No se pudo comprobar la suscripción actual");
      if (subs.has_more || (subs.data || []).some((s: any) => !["canceled", "incomplete_expired"].includes(s.status)))
        return resp(409, { error: "Ya tienes una suscripción. Usa Administrar mi suscripción para actualizar tu tarjeta o cancelarla; para cambiar de plan contacta a Nuvoor." });
    }

    const control = await una("stripe_control?select=intento&cuenta_id=eq." + esc(cuentaId));
    const huella = [clave, periodo, metodo, app === "android" ? "android" : "web"].join(":");
    let intento = control && control.intento;
    if (intento) {
      // Recuperar la respuesta perdida con el mismo cuerpo y clave antes de permitir otro intento.
      let anterior = intento.sesion ? await stripe("checkout/sessions/" + esc(intento.sesion), undefined, "GET") : null;
      if (!anterior) {
        if (Date.now() - intento.creado > 23 * 3600000) return resp(409, { error: "Hay un intento pendiente de revisar. Contacta a Nuvoor antes de volver a pagar." });
        anterior = await stripe("checkout/sessions", intento.cuerpo, "POST", intento.clave);
        intento.sesion = anterior.id;
        await rpc("stripe_intento", { ...turno, p_intento: intento });
      }
      if (!["open", "complete", "expired"].includes(anterior.status)) throw new Error("No se pudo comprobar el intento de pago anterior");
      if (anterior.status === "complete") {
        const aplicado = await una("stripe_entregas?select=evento&sesion=eq." + esc(anterior.id));
        const suscripcionTerminada = anterior.mode === "subscription" && !!cuenta.stripe_suscripcion;
        let ticketVencido = false;
        if (anterior.mode === "payment" && anterior.payment_status !== "paid" && anterior.payment_intent) {
          const pi = await stripe("payment_intents/" + esc(typeof anterior.payment_intent === "string" ? anterior.payment_intent : anterior.payment_intent.id), undefined, "GET");
          ticketVencido = ["canceled", "requires_payment_method"].includes(pi.status);
        }
        if (!aplicado && !suscripcionTerminada && !ticketVencido) return resp(409, { error: "El pago anterior se está confirmando. No vuelvas a pagar mientras llega el aviso." });
      }
      if (anterior.status === "open" && intento.huella === huella)
        return resp(200, { forma: metodo, url: anterior.url, id: anterior.id });
      if (anterior.status === "open") await stripe("checkout/sessions/" + esc(anterior.id) + "/expire");
      await rpc("stripe_intento", { ...turno, p_intento: null });
    }

    /* ---- transferencia: ni Stripe se entera ---- */
    if (metodo === "transferencia") {
      const banco = String(Deno.env.get("DATOS_BANCO") || "").trim();
      if (!banco) return resp(503, { error: "La transferencia todavía no está configurada. Elige tarjeta u OXXO." });
      const ref = "NV-" + String(cuentaId).slice(0, 6).toUpperCase() + "-" + crypto.randomUUID().slice(0, 6).toUpperCase();
      const guardado = await graba("pagos_pendientes", "POST", {
        cuenta_id: cuentaId, plan: clave, ciclo: periodo, monto: monto / 100,
        referencia: ref, forma: "transferencia", estado: "esperando",
      });
      if (guardado.error) return resp(500, { error: "No pudimos registrar la transferencia. Intenta de nuevo." });
      return resp(200, {
        forma: "transferencia",
        referencia: ref,
        monto: monto / 100,
        banco,
        aviso: "Haz la transferencia y mándanos el comprobante. En cuanto entre, tu cuenta queda activa por " +
               (periodo === "anual" ? "un año" : "un mes") + ".",
      });
    }

    const sitio = (Deno.env.get("SITIO_URL") || "https://app.nuvoor.mx").replace(/\/+$/, "");
    if (sitio !== "https://app.nuvoor.mx") return resp(500, { error: "SITIO_URL debe ser https://app.nuvoor.mx" });

    /* El cliente de Stripe se crea una sola vez por cuenta y se guarda: así
       la tarjeta que registre hoy sigue sirviendo el año que entra, y el
       portal de abajo sabe de quién es. */
    let cliente = cuenta && cuenta.stripe_cliente;
    if (!cliente) {
      const c = await stripe("customers", {
        metadata: { cuenta_id: cuentaId },
      }, "POST", "nuvoor-cliente-" + cuentaId);
      cliente = c.id;
      const guardado = await graba("cuentas?id=eq." + esc(cuentaId), "PATCH", { stripe_cliente: cliente });
      if (guardado.error) throw new Error("No se pudo guardar el cliente de Stripe. No se abrió ningún cobro.");
    }

    const comun = {
      customer: cliente,
      locale: "es-419",
      success_url: urlVuelta(sitio, cuentaId, productoCuenta, app || "", "ok").replace(/(#|$)/, "&sesion={CHECKOUT_SESSION_ID}$1"),
      cancel_url: urlVuelta(sitio, cuentaId, productoCuenta, app || "", "cancelado"),
      client_reference_id: cuentaId,
      metadata: { cuenta_id: cuentaId, plan: clave, ciclo: periodo },
    };

    let cuerpo: any;
    if (metodo === "oxxo") {
      /* OXXO no sabe cobrar solo cada mes: es un pago suelto. Suma un
         periodo y se acabó. Por eso el de tarjeta es el bueno. */
      cuerpo = {
        ...comun,
        mode: "payment",
        payment_method_types: ["oxxo"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "mxn",
            unit_amount: monto,
            product_data: { name: P.nombre + " · " + (periodo === "anual" ? "un año" : "un mes") },
          },
        }],
        payment_intent_data: { metadata: { cuenta_id: cuentaId, plan: clave, ciclo: periodo, suelto: "si" } },
      };
    } else {
      const suscripcion: Record<string, unknown> = {
        metadata: { cuenta_id: cuentaId, plan: clave, ciclo: periodo },
      };
      const esPromo = periodo === "mensual" && monto === 19900 &&
        !cuenta.pago_previo && !cuenta.stripe_suscripcion && !["basico", "maker", "pro"].includes(cuenta.plan || "");
      let descuentos;
      if (esPromo) {
        const cupon = await aseguraCuponApertura();
        descuentos = [{ coupon: cupon.id || "nuvoor-apertura-98" }];
      }
      const vencePrueba = cuenta.plan === "prueba" && cuenta.vence ? new Date(cuenta.vence) : null;
      const quedan = vencePrueba ? Math.floor((vencePrueba.getTime() - Date.now()) / 1000) : 0;
      if (quedan >= 48 * 60 * 60 + 120) suscripcion.trial_end = Math.floor(vencePrueba!.getTime() / 1000);
      cuerpo = {
        ...comun,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "mxn",
            unit_amount: monto,
            recurring: { interval: periodo === "anual" ? "year" : "month" },
            product_data: { name: P.nombre },
          },
        }],
        subscription_data: suscripcion,
        discounts: descuentos,
      };
    }

    // Caduca antes del límite de 24 h de las claves idempotentes de Stripe.
    cuerpo.expires_at = Math.floor(Date.now() / 1000) + 3600;
    intento = { clave: "nuvoor-checkout-" + crypto.randomUUID(), huella, creado: Date.now(), cuerpo };
    await rpc("stripe_intento", { ...turno, p_intento: intento });
    const sesion = await stripe("checkout/sessions", cuerpo, "POST", intento.clave);
    intento.sesion = sesion.id;
    await rpc("stripe_intento", { ...turno, p_intento: intento });

    return resp(200, { forma: metodo, url: sesion.url, id: sesion.id });
  } catch (e) {
    console.error(e);
    return resp(500, { error: (e && (e as Error).message) || "Error inesperado al crear el cobro" });
  } finally {
    if (turno) try { await rpc("stripe_suelta", turno); } catch (_) { /* vence solo a los 2 minutos */ }
  }
});
