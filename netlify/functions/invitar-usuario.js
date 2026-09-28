/* Da de alta a alguien del equipo dentro de la cuenta de quien invita.
   Solo lo puede llamar un administrador. Crea el usuario en Supabase con una
   contraseña temporal y lo cuelga de la misma cuenta con el rol elegido. */
const { createClient } = require("@supabase/supabase-js");

const ROLES = ["admin", "ventas", "produccion"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "Método no permitido" });

  try {
    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return resp(401, { error: "Falta la sesión" });

    const { accion, correo, nombre, rol, usuario_id } = JSON.parse(event.body || "{}");
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // ¿Quién llama, y es administrador?
    const { data: userData, error: e1 } = await admin.auth.getUser(token);
    if (e1 || !userData || !userData.user) return resp(401, { error: "Sesión no válida" });
    const { data: yo } = await admin.from("perfiles").select("cuenta_id, rol").eq("id", userData.user.id).maybeSingle();
    if (!yo) return resp(404, { error: "Tu perfil no existe" });
    if (yo.rol !== "admin") return resp(403, { error: "Solo un administrador puede manejar al equipo" });

    // ---- quitar a alguien del equipo ----
    if (accion === "quitar") {
      if (!usuario_id) return resp(400, { error: "Falta el usuario" });
      if (usuario_id === userData.user.id) return resp(400, { error: "No puedes quitarte a ti mismo" });
      const { data: suyo } = await admin.from("perfiles").select("cuenta_id").eq("id", usuario_id).maybeSingle();
      if (!suyo || suyo.cuenta_id !== yo.cuenta_id) return resp(403, { error: "Ese usuario no es de tu cuenta" });
      await admin.auth.admin.deleteUser(usuario_id);
      return resp(200, { ok: true });
    }

    // ---- cambiar el rol ----
    if (accion === "rol") {
      if (!ROLES.includes(rol)) return resp(400, { error: "Rol desconocido" });
      const { data: suyo } = await admin.from("perfiles").select("cuenta_id").eq("id", usuario_id).maybeSingle();
      if (!suyo || suyo.cuenta_id !== yo.cuenta_id) return resp(403, { error: "Ese usuario no es de tu cuenta" });
      await admin.from("perfiles").update({ rol }).eq("id", usuario_id);
      return resp(200, { ok: true });
    }

    // ---- invitar ----
    if (!correo || correo.indexOf("@") < 0) return resp(400, { error: "Escribe un correo válido" });
    if (!ROLES.includes(rol)) return resp(400, { error: "Rol desconocido" });

    // El plan Básico es de un solo usuario.
    const { data: cuenta } = await admin.from("cuentas").select("plan, estado, vence").eq("id", yo.cuenta_id).maybeSingle();
    const { count } = await admin.from("perfiles").select("id", { count: "exact", head: true }).eq("cuenta_id", yo.cuenta_id);
    if (cuenta && cuenta.plan === "basico" && (count || 0) >= 1) {
      return resp(402, { error: "El plan Básico es de un solo usuario. Cambia a Pro para trabajar en equipo." });
    }

    const temporal = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase() + "!";
    const { data: creado, error: e2 } = await admin.auth.admin.createUser({
      email: correo.trim().toLowerCase(),
      password: temporal,
      email_confirm: true,
      user_metadata: { nombre: nombre || "", invitado: true }
    });
    if (e2) {
      const m = String(e2.message || "");
      return resp(400, { error: m.indexOf("already") >= 0 ? "Ese correo ya tiene una cuenta" : m });
    }

    // El disparador de alta le creó su propia cuenta: lo movemos a la del que invita.
    const nuevoId = creado.user.id;
    const { data: suPerfil } = await admin.from("perfiles").select("cuenta_id").eq("id", nuevoId).maybeSingle();
    const cuentaSobrante = suPerfil && suPerfil.cuenta_id;

    await admin.from("perfiles").update({ cuenta_id: yo.cuenta_id, rol, nombre: nombre || null }).eq("id", nuevoId);
    if (cuentaSobrante && cuentaSobrante !== yo.cuenta_id) {
      await admin.from("cuentas").delete().eq("id", cuentaSobrante);
    }

    return resp(200, { ok: true, correo, temporal, rol });
  } catch (e) {
    console.error(e);
    return resp(500, { error: "Error inesperado al manejar el equipo" });
  }
};

function resp(code, body) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
