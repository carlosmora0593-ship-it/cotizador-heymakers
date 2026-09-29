/* Da de alta a alguien del equipo dentro de la cuenta de quien invita.
   Solo lo puede llamar un administrador. Crea el usuario en Supabase con una
   contraseña temporal y lo cuelga de la misma cuenta con el rol elegido. */
const { createClient } = require("@supabase/supabase-js");

const ROLES = ["admin", "ventas", "diseno", "produccion"];

// Cuántas personas caben en cada plan. 0 = sin límite.
const TOPE_USUARIOS = { basico: 1, maker: 3, pro: 0, prueba: 0 };
const NOMBRE_PLAN   = { basico: "Básico", maker: "Maker", pro: "Pro", prueba: "de prueba" };

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
    const { data: perfil } = await admin.from("perfiles").select("cuenta_id, cuenta_activa, rol").eq("id", userData.user.id).maybeSingle();
    if (!perfil) return resp(404, { error: "Tu perfil no existe" });

    // La empresa en la que está parado ahora, y su rol EN ESA empresa.
    const cuentaId = perfil.cuenta_activa || perfil.cuenta_id;
    const { data: mem } = await admin.from("membresias")
      .select("rol").eq("usuario_id", userData.user.id).eq("cuenta_id", cuentaId).maybeSingle();
    const miRol = (mem && mem.rol) || (["admin","ventas","diseno","produccion"].includes(perfil.rol) ? perfil.rol : "admin");
    const yo = { cuenta_id: cuentaId, rol: miRol };
    if (yo.rol !== "admin") return resp(403, { error: "Solo un administrador puede manejar al equipo" });

    // ---- quitar a alguien del equipo ----
    if (accion === "quitar") {
      if (!usuario_id) return resp(400, { error: "Falta el usuario" });
      if (usuario_id === userData.user.id) return resp(400, { error: "No puedes quitarte a ti mismo" });
      const { data: suya } = await admin.from("membresias")
        .select("cuenta_id").eq("usuario_id", usuario_id).eq("cuenta_id", yo.cuenta_id).maybeSingle();
      if (!suya) return resp(403, { error: "Esa persona no es de esta empresa" });

      // Se va de ESTA empresa, no del mundo: puede trabajar en otra.
      await admin.from("membresias").delete().eq("usuario_id", usuario_id).eq("cuenta_id", yo.cuenta_id);

      const { data: otras } = await admin.from("membresias").select("cuenta_id").eq("usuario_id", usuario_id);
      if (!otras || otras.length === 0) {
        await admin.auth.admin.deleteUser(usuario_id);          // no le quedaba ninguna
      } else {
        await admin.from("perfiles").update({ cuenta_activa: otras[0].cuenta_id }).eq("id", usuario_id);
      }
      return resp(200, { ok: true });
    }

    // ---- cambiar el rol ----
    if (accion === "rol") {
      if (!ROLES.includes(rol)) return resp(400, { error: "Rol desconocido" });
      const { data: suya } = await admin.from("membresias")
        .select("cuenta_id").eq("usuario_id", usuario_id).eq("cuenta_id", yo.cuenta_id).maybeSingle();
      if (!suya) return resp(403, { error: "Esa persona no es de esta empresa" });
      await admin.from("membresias").update({ rol }).eq("usuario_id", usuario_id).eq("cuenta_id", yo.cuenta_id);
      return resp(200, { ok: true });
    }

    // ---- invitar ----
    if (!correo || correo.indexOf("@") < 0) return resp(400, { error: "Escribe un correo válido" });
    if (!ROLES.includes(rol)) return resp(400, { error: "Rol desconocido" });

    // Cada plan tiene su tope de usuarios.
    const { data: cuenta } = await admin.from("cuentas").select("plan, estado, vence").eq("id", yo.cuenta_id).maybeSingle();
    const { count } = await admin.from("membresias").select("usuario_id", { count: "exact", head: true }).eq("cuenta_id", yo.cuenta_id);
    const suPlan = (cuenta && cuenta.plan) || "basico";
    const tope = TOPE_USUARIOS[suPlan] != null ? TOPE_USUARIOS[suPlan] : 1;
    if (tope > 0 && (count || 0) >= tope) {
      const siguiente = suPlan === "basico" ? "Maker" : "Pro";
      return resp(402, {
        error: "El plan " + (NOMBRE_PLAN[suPlan] || suPlan) + " permite " + tope +
               " usuario(s) y ya los tienes. Cambia al plan " + siguiente + " para dar de alta a más gente."
      });
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

    await admin.from("perfiles")
      .update({ cuenta_id: yo.cuenta_id, cuenta_activa: yo.cuenta_id, rol, nombre: nombre || null })
      .eq("id", nuevoId);
    await admin.from("membresias").delete().eq("usuario_id", nuevoId);   // la que le creó su propia alta
    await admin.from("membresias").insert({ usuario_id: nuevoId, cuenta_id: yo.cuenta_id, rol });
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
