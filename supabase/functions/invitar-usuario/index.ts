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
   invitar-usuario
   Da de alta a alguien del equipo dentro de la cuenta de quien
   invita, le cambia el rol, o lo saca. Solo lo puede llamar un
   administrador de esa empresa.
   ================================================================== */

const ROLES = ["admin", "ventas", "diseno", "produccion"];

// Cuántas personas caben en cada plan. 0 = sin límite.
const TOPE_USUARIOS: Record<string, number> = { basico: 1, maker: 3, pro: 0, prueba: 0 };
const NOMBRE_PLAN: Record<string, string> = { basico: "Básico", maker: "Maker", pro: "Pro", prueba: "de prueba" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp(405, { error: "Método no permitido" });

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return resp(401, { error: "Falta la sesión" });

    const yoUsuario = await quienEres(token);
    if (!yoUsuario) return resp(401, { error: "Sesión no válida" });

    let datos: any = {};
    try { datos = await req.json(); } catch { datos = {}; }
    const { accion, correo, nombre, rol, usuario_id } = datos;

    const perfil = await una("perfiles?select=cuenta_id,cuenta_activa,rol&id=eq." + esc(yoUsuario.id));
    if (!perfil) return resp(404, { error: "Tu perfil no existe" });

    // La empresa en la que está parado ahora, y su rol EN ESA empresa.
    const cuentaId = perfil.cuenta_activa || perfil.cuenta_id;
    const mem = await una("membresias?select=rol&usuario_id=eq." + esc(yoUsuario.id) + "&cuenta_id=eq." + esc(cuentaId));
    const miRol = (mem && mem.rol) || (ROLES.includes(perfil.rol) ? perfil.rol : "admin");
    if (miRol !== "admin") return resp(403, { error: "Solo un administrador puede manejar al equipo" });

    const yo = { cuenta_id: cuentaId };

    // ---- quitar a alguien del equipo ----
    if (accion === "quitar") {
      if (!usuario_id) return resp(400, { error: "Falta el usuario" });
      if (usuario_id === yoUsuario.id) return resp(400, { error: "No puedes quitarte a ti mismo" });

      const suya = await una("membresias?select=cuenta_id&usuario_id=eq." + esc(usuario_id) + "&cuenta_id=eq." + esc(yo.cuenta_id));
      if (!suya) return resp(403, { error: "Esa persona no es de esta empresa" });

      // Se va de ESTA empresa, no del mundo: puede trabajar en otra.
      await graba("membresias?usuario_id=eq." + esc(usuario_id) + "&cuenta_id=eq." + esc(yo.cuenta_id), "DELETE");

      const otras = await filas("membresias?select=cuenta_id&usuario_id=eq." + esc(usuario_id));
      if (!otras.length) {
        await fetch(SB + "/auth/v1/admin/users/" + esc(usuario_id), { method: "DELETE", headers: CAB });
      } else {
        await graba("perfiles?id=eq." + esc(usuario_id), "PATCH", { cuenta_activa: otras[0].cuenta_id });
      }
      return resp(200, { ok: true });
    }

    // ---- cambiar el rol ----
    if (accion === "rol") {
      if (!ROLES.includes(rol)) return resp(400, { error: "Rol desconocido" });
      const suya = await una("membresias?select=cuenta_id&usuario_id=eq." + esc(usuario_id) + "&cuenta_id=eq." + esc(yo.cuenta_id));
      if (!suya) return resp(403, { error: "Esa persona no es de esta empresa" });
      await graba("membresias?usuario_id=eq." + esc(usuario_id) + "&cuenta_id=eq." + esc(yo.cuenta_id), "PATCH", { rol });
      return resp(200, { ok: true });
    }

    // ---- invitar ----
    if (!correo || String(correo).indexOf("@") < 0) return resp(400, { error: "Escribe un correo válido" });
    if (!ROLES.includes(rol)) return resp(400, { error: "Rol desconocido" });

    // Cada plan tiene su tope de usuarios.
    const cuenta = await una("cuentas?select=plan,estado,vence&id=eq." + esc(yo.cuenta_id));
    const cuantos = await cuantas("membresias?select=usuario_id&cuenta_id=eq." + esc(yo.cuenta_id));
    const suPlan = (cuenta && cuenta.plan) || "basico";
    const tope = TOPE_USUARIOS[suPlan] != null ? TOPE_USUARIOS[suPlan] : 1;
    if (tope > 0 && cuantos >= tope) {
      const siguiente = suPlan === "basico" ? "Maker" : "Pro";
      return resp(402, {
        error: "El plan " + (NOMBRE_PLAN[suPlan] || suPlan) + " permite " + tope +
          " usuario(s) y ya los tienes. Cambia al plan " + siguiente + " para dar de alta a más gente.",
      });
    }

    const temporal = Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 6).toUpperCase() + "!";

    const rCrea = await fetch(SB + "/auth/v1/admin/users", {
      method: "POST",
      headers: CAB,
      body: JSON.stringify({
        email: String(correo).trim().toLowerCase(),
        password: temporal,
        email_confirm: true,
        user_metadata: { nombre: nombre || "", invitado: true },
      }),
    });
    const creado = await rCrea.json().catch(() => ({}));
    if (!rCrea.ok || !creado || !creado.id) {
      const m = String(creado?.msg || creado?.message || creado?.error_description || "");
      return resp(400, {
        error: (m.indexOf("already") >= 0 || m.indexOf("registered") >= 0)
          ? "Ese correo ya tiene una cuenta"
          : (m || "No se pudo crear el usuario"),
      });
    }

    // El disparador de alta le creó su propia cuenta: lo movemos a la del que invita.
    const nuevoId = creado.id;
    const suPerfil = await una("perfiles?select=cuenta_id&id=eq." + esc(nuevoId));
    const cuentaSobrante = suPerfil && suPerfil.cuenta_id;

    await graba("perfiles?id=eq." + esc(nuevoId), "PATCH", {
      cuenta_id: yo.cuenta_id, cuenta_activa: yo.cuenta_id, rol, nombre: nombre || null,
    });
    await graba("membresias?usuario_id=eq." + esc(nuevoId), "DELETE");   // la que le creó su propia alta
    await graba("membresias", "POST", { usuario_id: nuevoId, cuenta_id: yo.cuenta_id, rol });
    if (cuentaSobrante && cuentaSobrante !== yo.cuenta_id) {
      await graba("cuentas?id=eq." + esc(cuentaSobrante), "DELETE");
    }

    return resp(200, { ok: true, correo, temporal, rol });
  } catch (e) {
    console.error(e);
    return resp(500, { error: "Error inesperado al manejar el equipo" });
  }
});
