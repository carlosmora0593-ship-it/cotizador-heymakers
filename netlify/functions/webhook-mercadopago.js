/* Recibe los avisos de Mercado Pago y activa, renueva o suspende la cuenta.
   Esta dirección se registra en Mercado Pago → Tus integraciones → Webhooks:
   https://TU-SITIO.netlify.app/.netlify/functions/webhook-mercadopago?clave=LA-QUE-PONGAS */
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  // Mercado Pago reintenta si no respondemos 200, así que siempre contestamos 200
  // salvo cuando la clave no coincide.
  const clave = (event.queryStringParameters || {}).clave;
  if (process.env.WEBHOOK_CLAVE && clave !== process.env.WEBHOOK_CLAVE) {
    return { statusCode: 401, body: "clave incorrecta" };
  }

  try {
    const qs = event.queryStringParameters || {};
    let cuerpo = {};
    try { cuerpo = JSON.parse(event.body || "{}"); } catch (e) {}

    const tipo = cuerpo.type || cuerpo.topic || qs.type || qs.topic || "";
    const id = (cuerpo.data && cuerpo.data.id) || qs["data.id"] || qs.id;
    if (!id) return ok("aviso sin id: " + tipo);

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
    let preapprovalId = null;

    if (tipo.indexOf("authorized_payment") >= 0) {
      const rp = await fetch("https://api.mercadopago.com/authorized_payments/" + id, {
        headers: { "Authorization": "Bearer " + process.env.MP_ACCESS_TOKEN }
      });
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
      preapprovalId = id;
    } else {
      return ok("aviso ignorado: " + tipo);
    }

    const r = await fetch("https://api.mercadopago.com/preapproval/" + preapprovalId, {
      headers: { "Authorization": "Bearer " + process.env.MP_ACCESS_TOKEN }
    });
    if (!r.ok) { console.error("No se pudo leer la suscripción", await r.text()); return ok("sin datos"); }
    const s = await r.json();

    const ref = String(s.external_reference || "").split("|");
    const cuentaId = ref[0], plan = ref[1] || "basico", ciclo = ref[2] || "mensual";
    if (!cuentaId) return ok("sin referencia de cuenta");

    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    let cambios;
    if (s.status === "authorized") {
      // Si Mercado Pago dice cuándo toca el siguiente cobro, esa es la fecha de
      // vencimiento; si no, sumamos el periodo contratado.
      const siguiente = s.next_payment_date ? new Date(s.next_payment_date) : sumaPeriodo(ciclo);
      // Un día de gracia para que un cobro que tarde no tumbe la cuenta.
      siguiente.setDate(siguiente.getDate() + 1);
      cambios = { plan, ciclo, estado: "activa", vence: siguiente.toISOString(), mp_preapproval_id: preapprovalId };
    } else if (s.status === "paused") {
      cambios = { estado: "vencida", mp_preapproval_id: preapprovalId };
    } else if (s.status === "cancelled") {
      // Se cancela, pero respetamos el periodo ya pagado.
      cambios = { estado: "cancelada", mp_preapproval_id: preapprovalId };
    } else {
      return ok("estado sin acción: " + s.status);
    }

    const { error } = await admin.from("cuentas").update(cambios).eq("id", cuentaId);
    if (error) console.error("No se pudo actualizar la cuenta", error);

    return ok("cuenta " + cuentaId + " → " + s.status);
  } catch (e) {
    console.error(e);
    return ok("error registrado");
  }
};

function sumaPeriodo(ciclo) {
  const d = new Date();
  if (ciclo === "anual") d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
  return d;
}
function ok(msg) { return { statusCode: 200, body: msg }; }
