/* Crea la suscripción en Mercado Pago y devuelve el enlace de pago.
   Se llama desde el navegador con el token de sesión del usuario. */
const { createClient } = require("@supabase/supabase-js");

/* Los precios viven AQUÍ, en el servidor, y no se leen de lo que manda el
   navegador: si el monto viniera del navegador, cualquiera podría contratar
   el plan Pro por un peso. El costo de esta decisión es que hay que
   cambiarlos en dos lados —aquí y en public/config.js— cuando suban. */
const PRECIOS = {
  basico: { mensual: 199, anual: 1990, nombre: "Básico" },
  maker:  { mensual: 449, anual: 4490, nombre: "Maker"  },
  pro:    { mensual: 899, anual: 8990, nombre: "Pro"    }
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "Método no permitido" });

  try {
    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return resp(401, { error: "Falta la sesión" });

    const { plan, ciclo } = JSON.parse(event.body || "{}");
    if (!PRECIOS[plan]) return resp(400, { error: "Plan desconocido" });
    const periodo = ciclo === "anual" ? "anual" : "mensual";
    const monto = PRECIOS[plan][periodo];

    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { data: userData, error: errUser } = await admin.auth.getUser(token);
    if (errUser || !userData || !userData.user) return resp(401, { error: "Sesión no válida" });
    const user = userData.user;

    const { data: perfil } = await admin.from("perfiles")
      .select("cuenta_id, cuenta_activa, rol").eq("id", user.id).maybeSingle();
    if (!perfil) return resp(404, { error: "La cuenta no existe todavía" });

    /* Desde que una persona puede tener varias empresas, "su cuenta" ya no es
       una sola: es la que trae abierta. Cobrarle a perfiles.cuenta_id —la
       primera que abrió— le cobraría la suscripción a la empresa equivocada. */
    const cuentaId = perfil.cuenta_activa || perfil.cuenta_id;
    if (!cuentaId) return resp(404, { error: "La cuenta no existe todavía" });

    /* Y contratar no es cualquier cosa: solo el administrador de ESA empresa.
       Quien entró como ventas o producción no le cambia el plan a nadie. */
    const { data: mem } = await admin.from("membresias")
      .select("rol").eq("usuario_id", user.id).eq("cuenta_id", cuentaId).maybeSingle();
    const miRol = (mem && mem.rol) || perfil.rol || "admin";
    if (miRol !== "admin" && miRol !== "dueno") {
      return resp(403, { error: "Solo un administrador puede contratar o cambiar el plan" });
    }

    const sitio = process.env.SITE_URL || "https://" + (event.headers.host || "");

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
      notification_url: sitio + "/.netlify/functions/webhook-mercadopago"
                        + (process.env.WEBHOOK_CLAVE ? "?clave=" + encodeURIComponent(process.env.WEBHOOK_CLAVE) : ""),
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: periodo === "anual" ? "years" : "months",
        transaction_amount: monto,
        currency_id: "MXN"
      }
    };

    const r = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.MP_ACCESS_TOKEN
      },
      body: JSON.stringify(cuerpo)
    });
    const mp = await r.json();

    if (!r.ok) {
      console.error("Mercado Pago respondió", r.status, mp);
      return resp(502, { error: (mp && mp.message) || "Mercado Pago rechazó la solicitud" });
    }

    await admin.from("cuentas").update({ mp_preapproval_id: mp.id }).eq("id", cuentaId);

    return resp(200, { init_point: mp.init_point || mp.sandbox_init_point, id: mp.id });
  } catch (e) {
    console.error(e);
    return resp(500, { error: "Error inesperado al crear la suscripción" });
  }
};

function resp(code, body) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
