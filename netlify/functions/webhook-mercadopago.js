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

    // Solo nos interesan los avisos de la suscripción en sí.
    if (!id || tipo.indexOf("preapproval") < 0) return ok("aviso ignorado: " + tipo);

    const r = await fetch("https://api.mercadopago.com/preapproval/" + id, {
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
      cambios = { plan, ciclo, estado: "activa", vence: siguiente.toISOString(), mp_preapproval_id: id };
    } else if (s.status === "paused") {
      cambios = { estado: "vencida", mp_preapproval_id: id };
    } else if (s.status === "cancelled") {
      // Se cancela, pero respetamos el periodo ya pagado.
      cambios = { estado: "cancelada", mp_preapproval_id: id };
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
