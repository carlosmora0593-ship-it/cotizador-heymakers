/* Nuvoor Lab · Seguridad (SQL 45) · 27 nov 2026.
   Quién cambió algo delicado, desde dónde y cuándo; quién entró y desde qué IP; y los PIN que se bloquearon.
   Lee staff_seguridad(): sólo el equipo de Nuvoor la puede llamar. */
(function(){
"use strict";
const S = {datos:null, error:"", cargando:null, horas:168, pestana:"cambios", aviso:"", probando:false};
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const repinta = () => { if(typeof pinta === "function") pinta(); };
const hayCliente = () => { try{ return typeof SB !== "undefined" && SB && typeof SB.rpc === "function"; }catch(_){ return false; } };

const FECHA = new Intl.DateTimeFormat("es-MX", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"America/Mexico_City"});
function cuando(t){
  const d = new Date(t); if(isNaN(d)) return "";
  const min = Math.round((Date.now() - d) / 60000);
  const rel = min < 1 ? "ahora" : min < 60 ? "hace " + min + " min" : min < 1440 ? "hace " + Math.round(min/60) + " h" : "";
  return '<span class="lsCuando" title="' + esc(d.toISOString()) + '">' + esc(FECHA.format(d)) + (rel ? '<small>' + rel + '</small>' : '') + '</span>';
}
function aparato(ua){
  if(!ua) return "";
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /okhttp|Dalvik/i.test(ua) ? "App Android" : /curl|python|node|axios|PostmanRuntime|Go-http/i.test(ua) ? "Programa (no navegador)" : "Otro";
  const so = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return nav + (so ? " · " + so : "");
}
const VIA = {app:"App Nuvoor", sql:"Base de datos (SQL)", servicio:"Servidor (cobros y correos)", auth:"Alta automática", lab:"Nuvoor Lab"};
const GRAV = {critico:["mal","Crítico"], alerta:["mal","Alerta"], aviso:["aviso","Aviso"], info:["gris","Normal"]};
const ACCION = {login:"Entró", logout:"Salió", user_signedup:"Cuenta nueva", user_recovery_requested:"Pidió recuperar contraseña",
  user_updated_password:"Cambió su contraseña", user_modified:"Cambió sus datos", user_deleted:"Se borró el usuario",
  user_invited:"Fue invitado", user_repeated_signup:"Se quiso registrar otra vez", token_revoked:"Se cerró su sesión",
  user_reauthenticate_requested:"Pidió confirmar su identidad"};
function chip(g){ const x = GRAV[g] || GRAV.info; return '<span class="chip ' + x[0] + '">' + x[1] + '</span>'; }
function ip(v, pais, cadena){
  if(!v) return '<span class="lsTenue">—</span>';
  const varias = cadena && cadena.indexOf(",") >= 0 ? ' title="Cadena completa: ' + esc(cadena) + '"' : '';
  return '<span class="lsIp"' + varias + '>' + esc(v) + (pais ? ' <small>' + esc(pais) + '</small>' : '') + (varias ? ' <small>+</small>' : '') + '</span> ' +
    '<a class="lsDonde" href="https://ipinfo.io/' + encodeURIComponent(v) + '" target="_blank" rel="noopener noreferrer" title="Ver de dónde es esta IP (abre ipinfo.io)">¿dónde?</a>';
}
function quien(r){
  const nombre = r.correo || (r.via === "sql" ? "Alguien con acceso a la base" : r.via === "servicio" ? "El servidor" : r.via === "auth" ? "Supabase" : "Sin sesión");
  return '<b>' + esc(nombre) + '</b>' + (r.staff ? ' <span class="chip info">Equipo Nuvoor</span>' : '');
}
function detalle(d){
  if(!d || typeof d !== "object") return "";
  const partes = [];
  const pon = (k, v) => {
    if(v && typeof v === "object" && ("antes" in v || "despues" in v)) partes.push(esc(k) + ': ' + esc(fmt(v.antes)) + ' → ' + esc(fmt(v.despues)));
    else if(v && typeof v === "object" && v.cambio) partes.push(esc(k === "pin_hash" ? "PIN" : k) + ': cambió');
    else if(v != null && typeof v !== "object" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v))) partes.push(esc(k) + ': ' + esc(fmt(v)));
  };
  if(Array.isArray(d.cambios)) d.cambios.forEach(c => partes.push(esc(c.persona || "") + ': ' + esc(({pin:"cambió el PIN", rol:"rol " + (c.antes||"") + " → " + (c.despues||""), alta:"alta" + (c.rol ? " (" + c.rol + ")" : ""), baja:"baja", activo:c.despues ? "activa" : "desactivada"})[c.que] || c.que)));
  else if(d.cambios && typeof d.cambios === "object") Object.keys(d.cambios).forEach(k => pon(k, d.cambios[k]));
  Object.keys(d).forEach(k => { if(k !== "cambios" && k !== "antes" && k !== "despues") pon(k, d[k]); });
  return partes.length ? '<small class="lsDetalle">' + partes.slice(0, 6).join(" · ") + '</small>' : '';
}
function fmt(v){
  if(v == null) return "—";
  if(typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)){ const d = new Date(v); if(!isNaN(d)) return FECHA.format(d); }
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

async function carga(){
  if(S.cargando) return S.cargando;
  if(!hayCliente()){ S.error = "conexion"; repinta(); return; }
  S.error = "";
  S.cargando = (async () => {
    try{
      const {data, error} = await SB.rpc("staff_seguridad", {p_horas:S.horas});
      if(error) throw error;
      if(!data || !data.resumen) throw new Error("Respuesta inválida");
      S.datos = data;
    }catch(err){
      S.datos = null;
      S.error = err && err.code === "PGRST202" ? "sql" : err && err.code === "42501" ? "permiso" : "conexion";
    }finally{
      S.cargando = null; repinta();
    }
  })();
  return S.cargando;
}
async function prueba(){
  if(S.probando || !hayCliente()) return;
  S.probando = true; S.aviso = ""; repinta();
  try{
    const {error} = await SB.rpc("staff_seguridad_prueba");
    if(error) throw error;
    S.aviso = "Listo: el monitor anotó tu prueba. Búscala arriba en «Cambios delicados».";
    S.pestana = "cambios";
    await carga();
  }catch(err){ S.aviso = "No se pudo anotar la prueba. " + ((err && err.message) || ""); }
  finally{ S.probando = false; repinta(); }
}

function alertas(d){
  const ev = (d.eventos || []).filter(e => e.gravedad === "critico" || e.gravedad === "alerta");
  const der = d.derivadas || [];
  if(!ev.length && !der.length) return '<div class="lsTodoBien"><span class="chip bien">Sin alertas</span> Nada raro en este periodo.</div>';
  const filas = der.map(a => '<li>' + chip(a.gravedad) + ' <b>' + esc(a.que) + '</b>' +
      '<small>' + [a.cuantas ? a.cuantas + " veces" : "", a.ip ? "IP " + esc(a.ip) : "", a.correo ? esc(a.correo) : "", a.cuando ? esc(fmt(a.cuando)) : ""].filter(Boolean).join(" · ") + '</small></li>')
    .concat(ev.slice(0, 12).map(e => '<li>' + chip(e.gravedad) + ' <b>' + esc(e.que) + '</b>' +
      '<small>' + [esc(e.correo || VIA[e.via] || ""), e.ip ? "IP " + esc(e.ip) : "", e.negocio ? esc(e.negocio) : "", esc(fmt(e.cuando))].filter(Boolean).join(" · ") + '</small></li>'));
  return '<ul class="lsAlertas">' + filas.join("") + '</ul>';
}
function tablaCambios(d){
  const ev = (d.eventos || []).slice().sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)));
  if(!ev.length) return '<p class="vacio">Sin cambios delicados en este periodo.</p>';
  return '<div class="marco"><table class="lsTabla"><thead><tr><th>Cuándo</th><th>Qué pasó</th><th>Quién</th><th>Desde dónde</th><th>Negocio</th></tr></thead><tbody>' +
    ev.map(e => '<tr class="ls-' + esc(e.gravedad) + '"><td>' + cuando(e.cuando) + '</td>' +
      '<td>' + chip(e.gravedad) + ' ' + esc(e.que) + detalle(e.detalle) + '</td>' +
      '<td>' + quien(e) + '<small class="lsTenue">' + esc(VIA[e.via] || e.via || "") + '</small></td>' +
      '<td>' + ip(e.ip, e.pais, e.cadena) + (e.navegador ? '<small class="lsTenue">' + esc(aparato(e.navegador)) + '</small>' : '') + '</td>' +
      '<td>' + esc(e.negocio || "—") + '</td></tr>').join("") + '</tbody></table></div>';
}
function tablaSesiones(d){
  if(!d.sesiones){
    return '<p class="vacio">' + (d.sesionesMotivo === "sin_permiso"
      ? "La base no dejó leer el registro de inicios de sesión de Supabase."
      : "Este proyecto de Supabase no guarda el registro de inicios de sesión en la base.") +
      ' Puedes verlos en Supabase → Authentication → Logs.</p>';
  }
  if(!d.sesiones.length) return '<p class="vacio">Nadie entró en este periodo.</p>';
  return '<div class="marco"><table class="lsTabla"><thead><tr><th>Cuándo</th><th>Qué hizo</th><th>Quién</th><th>Desde dónde</th></tr></thead><tbody>' +
    d.sesiones.map(s => '<tr><td>' + cuando(s.cuando) + '</td><td>' + esc(ACCION[s.accion] || s.accion) + '</td>' +
      '<td><b>' + esc(s.correo || "—") + '</b>' + (s.staff ? ' <span class="chip info">Equipo Nuvoor</span>' : '') + '</td>' +
      '<td>' + ip(s.ip) + (s.ipNueva ? ' <span class="chip aviso">IP nueva</span>' : '') + '</td></tr>').join("") + '</tbody></table></div>';
}
function tablaPin(d){
  const p = d.pin || [];
  if(!p.length) return '<p class="vacio">Nadie ha fallado su PIN en este periodo.</p>';
  return '<div class="marco"><table class="lsTabla"><thead><tr><th>Negocio</th><th>Persona</th><th>Intentos</th><th>Estado</th></tr></thead><tbody>' +
    p.map(x => '<tr><td>' + esc(x.negocio || "—") + '</td><td>' + esc(x.correo || "—") + '</td><td>' + esc(x.intentos) + '</td>' +
      '<td>' + (x.bloqueado ? '<span class="chip mal">Bloqueado hasta ' + esc(fmt(x.hasta)) + '</span>' : '<span class="chip gris">Puede entrar</span>') + '</td></tr>').join("") +
    '</tbody></table></div>';
}

function vista(){
  const rangos = [[24,"24 h"],[168,"7 días"],[720,"30 días"]];
  const cabeza = '<header><h2>Seguridad</h2><div class="lsRangos" role="group" aria-label="Periodo">' +
    rangos.map(r => '<button type="button" class="btn sm" data-ls-horas="' + r[0] + '" aria-pressed="' + (S.horas === r[0]) + '">' + r[1] + '</button>').join("") + '</div>' +
    '<span class="lsEspacio"></span><button type="button" class="btn sm" data-ls-refresca' + (S.cargando ? " disabled" : "") + '>' + (S.cargando ? "Actualizando…" : "Actualizar") + '</button>' +
    '<button type="button" class="btn sm" data-ls-prueba' + (S.probando || !S.datos ? " disabled" : "") + '>Probar el monitor</button></header>';
  if(!S.datos){
    const texto = S.error === "sql" ? "Para encender el monitor, ejecuta el SQL 45 en Base de datos. Desde ese momento empieza a anotar."
      : S.error === "permiso" ? "Sólo el equipo de Nuvoor puede ver el monitor de seguridad."
      : S.error ? "No se pudo consultar el monitor. Pulsa Actualizar para volver a intentar."
      : "Revisando…";
    const boton = S.error === "sql" ? ' <button type="button" class="btn sm" data-nlgo="base">Abrir Base de datos</button>' : '';
    return '<section class="tarjeta lsSeg">' + cabeza + '<div class="vacio">' + texto + boton + '</div></section>';
  }
  const d = S.datos, r = d.resumen || {};
  const n = v => v == null ? "—" : Number(v).toLocaleString("es-MX");
  const malos = (r.criticos || 0) + (r.alertas || 0);
  const tiles = [
    ["Alertas", n(malos), malos ? "mal" : "bien", "Críticas y alertas"],
    ["Avisos", n(r.avisos), r.avisos ? "aviso" : "", "Cambios que conviene revisar"],
    ["Inicios de sesión", n(r.inicios), "", n(r.ips) + " IP distintas"],
    ["Cuentas nuevas", n(r.altas), "", "Altas en Supabase"],
    ["PIN bloqueados", n(r.pinBloqueados), r.pinBloqueados ? "aviso" : "", "Ahora mismo"]
  ].map(t => '<div class="lsTile ' + t[2] + '"><span>' + t[0] + '</span><b>' + t[1] + '</b><small>' + t[3] + '</small></div>').join("");
  const yo = d.yo && d.yo.ip ? '<p class="lsYo">Así te ve el monitor ahora: IP <b>' + esc(d.yo.ip) + '</b>' + (d.yo.pais ? ' (' + esc(d.yo.pais) + ')' : '') + (d.yo.navegador ? ' · ' + esc(aparato(d.yo.navegador)) : '') + '.</p>' : '';
  const nC = (d.eventos || []).length, nS = d.sesiones ? d.sesiones.length : 0, nP = (d.pin || []).length;
  const tabs = [["cambios","Cambios delicados",nC],["sesiones","Inicios de sesión",nS],["pin","PIN",nP]]
    .map(t => '<button type="button" role="tab" data-ls-tab="' + t[0] + '" aria-selected="' + (S.pestana === t[0]) + '">' + t[1] + ' <span>' + t[2] + '</span></button>').join("");
  const cuerpo = S.pestana === "sesiones" ? tablaSesiones(d) : S.pestana === "pin" ? tablaPin(d) : tablaCambios(d);
  const ayuda = '<details class="lsAyuda"><summary>Qué vigila el monitor</summary><ul>' +
    '<li><b>Planes y vigencias:</b> quién los cambió. Si alguien lo intenta desde el navegador, el sistema lo regresa y aquí sale como crítico.</li>' +
    '<li><b>Equipo de Nuvoor:</b> cualquier alta o baja en el Lab sale como crítica.</li>' +
    '<li><b>Accesos y roles:</b> quién recibió acceso a un negocio y quién intentó subirse de rol.</li>' +
    '<li><b>Personal:</b> cambios de PIN y de rol (nunca se guarda el PIN) y las puertas que se bloquearon por PIN equivocado.</li>' +
    '<li><b>Códigos y transferencias:</b> códigos nuevos o cambiados y pagos marcados como pagados.</li>' +
    '<li><b>Inicios de sesión:</b> salen del registro de Supabase, con la IP. «IP nueva» quiere decir que esa persona no había entrado desde ahí en 60 días.</li>' +
    '<li><b>«Base de datos (SQL)»</b> es un cambio hecho directo en Supabase, no desde la app.</li>' +
    '<li>Lo que el sistema rechaza antes de llegar a la base (una llamada sin permiso) no queda aquí: búscalo en Supabase → Logs → API.</li>' +
    '</ul></details>';
  return '<section class="tarjeta lsSeg">' + cabeza +
    (S.aviso ? '<p class="lsMsg" role="status">' + esc(S.aviso) + '</p>' : '') +
    '<div class="lsTiles">' + tiles + '</div>' + yo +
    '<div class="lsBloque"><h3>Alertas</h3>' + alertas(d) + '</div>' +
    '<div class="lsTabs" role="tablist">' + tabs + '</div>' + cuerpo + ayuda + '</section>';
}
function cuenta(){
  const el = document.getElementById("n_seguridad"); if(!el) return;
  const r = S.datos && S.datos.resumen;
  const n = r ? (r.criticos || 0) + (r.alertas || 0) : null;
  el.textContent = n == null ? "—" : n;
  el.classList.toggle("urge", !!n);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-ls-horas],[data-ls-refresca],[data-ls-prueba],[data-ls-tab]");
  if(!b || !b.closest(".lsSeg")) return;
  if(b.hasAttribute("data-ls-prueba")){ prueba(); return; }
  if(b.hasAttribute("data-ls-tab")){ S.pestana = b.dataset.lsTab; repinta(); return; }
  if(b.hasAttribute("data-ls-horas")) S.horas = Number(b.dataset.lsHoras) || 168;
  S.aviso = ""; carga();
});
window.NuvoorSeguridad = {carga, vista, cuenta, estado:S};
/* Este archivo puede llegar después de que el Lab arrancó: en cuanto el Lab esté listo, trae el monitor
   para que el contador del menú se llene solo. Luego lo refresca cada 5 minutos si ya se vio. */
(function arranca(i){
  try{ if(typeof listo !== "undefined" && listo && hayCliente()){ if(!S.datos && !S.cargando) carga(); return; } }catch(_){}
  if(i < 40) setTimeout(() => arranca(i + 1), 1000);
})(0);
setInterval(() => { if(!document.hidden && S.datos && !S.cargando) carga(); }, 300000);
})();
