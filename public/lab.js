/* ============================================================
   MAKERS LAB · puente con Supabase
   ------------------------------------------------------------
   Makers Lab por dentro no cambia: sigue pidiendo sus datos con
   window.claude.use("db"), igual que cuando era un artefacto de
   prueba. Lo que cambia es de dónde salen.

   Y salen de dos lugares distintos, a propósito:

   · Las CUENTAS y los TICKETS salen de vistas de solo lectura que
     traen números y fechas —cuántas cotizaciones hizo un taller,
     cuándo entró por última vez, en qué plan está— y nunca el
     contenido de lo que cotizó. Esa promesa no vive en esta
     pantalla: vive en la forma de las vistas, en la base.

   · Tu EQUIPO, tus ALIANZAS y tus CITAS son tuyas, de Hey Makers,
     así que viven en tu propio cuaderno (la tabla lab_datos) y las
     escribes con toda libertad.
   ============================================================ */
"use strict";

const q = s => document.querySelector(s);

/* ---------- Revisión de la configuración ---------- */
function revisaConfig(){
  if(!window.CONFIG) return "No se cargó config.js. Revisa que el archivo esté junto a lab.html.";
  const u = String(CONFIG.SUPABASE_URL||"").trim(), k = String(CONFIG.SUPABASE_ANON_KEY||"").trim();
  if(!u || u.indexOf("TU-PROYECTO")>=0) return "Falta la dirección de Supabase en config.js.";
  if(!k || k.indexOf("PEGA-AQUI")>=0)   return "Falta la llave pública de Supabase en config.js.";
  return null;
}
const PROBLEMA_CONFIG = revisaConfig();
const URL_SB = String((window.CONFIG && CONFIG.SUPABASE_URL) || "").trim().replace(/\/+$/,"");
const SB = PROBLEMA_CONFIG ? null : window.supabase.createClient(URL_SB, CONFIG.SUPABASE_ANON_KEY);

let SESION = null, SOY = null;          // SOY = mi renglón de staff
const VERSION_LAB = window.BUILD || "sin sello";

/* ============================================================
   1. La puerta
   ============================================================
   No es una dirección secreta: eso no protege nada, porque quien
   la adivine entra. Aquí quien decide es la base de datos. Si tu
   correo no está en la tabla `staff`, las vistas de abajo te
   contestan cero renglones, pidas lo que pidas y desde donde lo
   pidas. Esta pantalla solo se ahorra el mal rato de enseñarte
   un tablero vacío. */

async function quienSoy(){
  const {data} = await SB.from("staff").select("*").eq("id", SESION.user.id).maybeSingle();
  return data || null;
}

async function arranca(){
  if(PROBLEMA_CONFIG){ portazo("Falta configurar el sitio", PROBLEMA_CONFIG); return; }

  const {data} = await SB.auth.getSession();
  SESION = data.session;
  if(!SESION){ pideEntrar(); return; }

  SOY = await quienSoy();
  if(!SOY){
    portazo("Esta parte no es para esta cuenta",
      "Makers Lab es la consola interna de Hey Makers. Tu sesión (" + SESION.user.email +
      ") no está dada de alta como parte del equipo, así que aquí no hay nada que enseñarte. " +
      "Si buscabas tu cotizador, está en la página principal.", true);
    return;
  }

  q("#labPuerta").hidden = true;
  document.body.classList.remove("sin-sesion");
  pintaQuienSoy();
  if(window.__arranca) window.__arranca();
}

function pintaQuienSoy(){
  const chip = q("#labQuien");
  if(chip) chip.textContent = (SOY.nombre || SESION.user.email) +
    " · " + (SOY.rol === "dueno" ? "Dueño" : SOY.rol === "ventas" ? "Ventas" : "Soporte");
  const v = q("#labVersion");
  if(v) v.textContent = "Versión " + VERSION_LAB;
}

function portazo(titulo, texto, conSalida){
  q("#labPuerta").hidden = false;
  document.body.classList.add("sin-sesion");
  q("#puertaTitulo").textContent = titulo;
  q("#puertaTexto").textContent = texto;
  q("#puertaForm").hidden = true;
  q("#puertaSalir").hidden = !conSalida;
  q("#puertaInicio").hidden = !conSalida;
}
function pideEntrar(msg){
  q("#labPuerta").hidden = false;
  document.body.classList.add("sin-sesion");
  q("#puertaTitulo").textContent = "Makers Lab";
  q("#puertaTexto").textContent = msg || "Entra con tu correo de Hey Makers.";
  q("#puertaForm").hidden = false;
  q("#puertaSalir").hidden = true;
  q("#puertaInicio").hidden = true;
}

/* ============================================================
   2. Traducción: la base de datos → lo que Makers Lab espera
   ============================================================ */

/* Supabase guarda plan y estado por separado; Makers Lab los junta
   en un solo estado, que es como se habla del negocio: "está en
   prueba", "ya venció". Esta función traduce de uno al otro. */
function estadoDe(r){
  const vigente = r.estado === "activa" && new Date(r.vence) > new Date();
  if(r.estado === "cancelada") return "baja";
  if(!vigente)                 return "vencida";
  if(r.plan === "prueba")      return "prueba";
  return "activa";
}

/* Un renglón de v_cuentas, con la forma que Makers Lab sabe pintar.
   Los números son los de verdad; los campos comerciales (de dónde
   llegó, quién la atiende, su RFC) los pones tú y viven aparte. */
function cuentaDeVista(r, nota){
  const base = {
    id: r.id,
    taller: r.taller || "Sin nombre",
    correo: r.correo_dueno || "",
    plan: r.plan,
    periodo: r.ciclo || "mensual",
    estado: estadoDe(r),
    alta: String(r.creada || "").slice(0,10),
    vence: String(r.vence || "").slice(0,10),
    ultimo: String(r.ultima_actividad || r.creada || "").slice(0,10),
    baja: (r.estado === "cancelada") ? String(r.vence || "").slice(0,10) : null,
    cotizaciones: Number(r.cotizaciones || 0),
    clientesDelTaller: Number(r.clientes || 0),
    ventasDelTaller: Number(r.ventas || 0),
    comprasDelTaller: Number(r.compras || 0),
    usuarios: Number(r.usuarios || 0),
    tickets: Number(r.tickets || 0),
    diasRestantes: Number(r.dias_restantes || 0)
  };
  /* Lo que tú anotaste encima. Nunca pisa un número real: si tu nota
     dijera que hizo 40 cotizaciones y la base dice 12, manda la base. */
  const mio = nota || {};
  ["sitio","contacto","tel","origen","alianza","cerradoPor","requiereFactura",
   "rfc","razon","cp","regimen","uso","apoyo","historial","nota"].forEach(k=>{
    if(mio[k] !== undefined) base[k] = mio[k];
  });
  base.historial = base.historial || [{f: base.alta, t: "Se abrió la cuenta."}];
  base.origen = base.origen || "organico";
  return base;
}

/* Un ticket de v_soporte con la forma de Makers Lab. */
function ticketDeVista(r){
  return {
    id: r.ticket_id,
    cuentaId: r.cuenta_id,
    taller: r.taller,
    folio: r.folio,
    asunto: r.asunto,
    estado: r.estado,
    bloquea: !!r.bloquea,
    pantalla: r.pantalla,
    version: r.version,
    navegador: r.navegador,
    reaperturas: Number(r.reaperturas || 0),
    entro: r.entro,
    contestado: r.contestado,
    resuelto: r.resuelto,
    confirmado: r.confirmado,
    horasEnContestar: r.horas_en_contestar,
    horasEnResolver: r.horas_en_resolver,
    mensajes: r.mensajes || [],
    contexto: r.contexto || {},
    errores: r.errores || []
  };
}

/* ============================================================
   3. El puente
   ============================================================
   Misma forma que usaba el artefacto: collection(), doc(), get(),
   set(), delete(), onSnapshot(). Por dentro cada colección sabe si
   es de solo lectura o del cuaderno. */

const SOLO_LECTURA = {cuentas: true, tickets: true, errores: true};

async function leeColeccion(col){
  if(col === "cuentas"){
    const [{data: filas}, {data: notas}] = await Promise.all([
      SB.from("v_cuentas").select("*").order("creada", {ascending:false}),
      SB.from("lab_datos").select("doc_id,cuerpo").eq("coleccion","notas_cuenta")
    ]);
    const porId = {};
    (notas||[]).forEach(n=> porId[n.doc_id] = n.cuerpo);
    return (filas||[]).map(r=> cuentaDeVista(r, porId[r.id]));
  }

  if(col === "tickets"){
    const {data} = await SB.from("v_soporte").select("*").order("entro", {ascending:false});
    return (data||[]).map(ticketDeVista);
  }

  /* Los errores no son una tabla: son lo que el cotizador capturó
     dentro de cada reporte. Se sacan de ahí y se aplanan. */
  if(col === "errores"){
    const {data} = await SB.from("v_soporte").select("*").order("entro", {ascending:false});
    const fuera = [];
    (data||[]).forEach(t=>{
      (t.errores||[]).forEach((e,i)=> fuera.push({
        id: t.ticket_id + "-" + i,
        cuentaId: t.cuenta_id, taller: t.taller, ticketId: t.ticket_id,
        mensaje: e.mensaje || e.msg || String(e), donde: e.donde || t.pantalla,
        version: t.version, navegador: t.navegador, cuando: e.cuando || t.entro,
        estado: t.estado === "cerrado" ? "resuelto" : "abierto"
      }));
    });
    return fuera;
  }

  const {data} = await SB.from("lab_datos").select("doc_id,cuerpo").eq("coleccion", col);
  return (data||[]).map(r=> Object.assign({id: r.doc_id}, r.cuerpo));
}

function refDoc(ruta){
  const p = ruta.split("/"), col = p[0], id = p.slice(1).join("_");
  return {
    id, path: ruta,
    async get(){
      const {data} = await SB.from("lab_datos").select("cuerpo")
        .eq("coleccion", col).eq("doc_id", id).maybeSingle();
      return {exists: !!data, data: ()=> data ? data.cuerpo : undefined};
    },
    async set(cuerpo){
      /* Guardar una cuenta guarda TUS notas, no sus números: los
         números son de la base y no se editan desde aquí. */
      if(col === "cuentas"){
        const mio = {};
        ["sitio","contacto","tel","origen","alianza","cerradoPor","requiereFactura",
         "rfc","razon","cp","regimen","uso","apoyo","historial","nota"].forEach(k=>{
          if(cuerpo[k] !== undefined) mio[k] = cuerpo[k];
        });
        await SB.from("lab_datos").upsert(
          {coleccion:"notas_cuenta", doc_id:id, cuerpo:mio}, {onConflict:"coleccion,doc_id"});
        return;
      }
      if(col === "tickets"){ await contestaTicket(id, cuerpo); return; }
      if(col === "errores") return;      // los escribe el cotizador, no nosotros
      await SB.from("lab_datos").upsert(
        {coleccion:col, doc_id:id, cuerpo}, {onConflict:"coleccion,doc_id"});
    },
    async delete(){
      if(SOLO_LECTURA[col]) return;
      await SB.from("lab_datos").delete().eq("coleccion", col).eq("doc_id", id);
    },
    /* El candado de la siembra: aquí no sembramos nada, los datos son
       de verdad. Contestamos que no hay que hacerlo. */
    async acquire(){ return {acquired: false}; }
  };
}

/* Contestar un ticket escribe en el documento del cliente, en su
   cuenta. Es lo único que Makers Lab escribe del lado de un taller,
   y la base solo lo permite para la colección 'soporte'. */
async function contestaTicket(id, t){
  const cuenta = t.cuentaId;
  if(!cuenta) return;
  const {data: actual} = await SB.from("documentos").select("cuerpo")
    .eq("cuenta_id", cuenta).eq("coleccion","soporte").eq("doc_id", id).maybeSingle();
  if(!actual) return;
  const cuerpo = Object.assign({}, actual.cuerpo, {
    mensajes: t.mensajes || actual.cuerpo.mensajes,
    estado:   t.estado   || actual.cuerpo.estado
  });
  const {error} = await SB.from("documentos").update({cuerpo})
    .eq("cuenta_id", cuenta).eq("coleccion","soporte").eq("doc_id", id);
  if(error) throw new Error(error.message);
}

function refCol(col){
  const api = {
    doc: id => refDoc(col + "/" + id),
    orderBy(){ return api; },
    limit(){ return api; },
    async get(){
      const filas = await leeColeccion(col);
      return {docs: filas.map(f=> ({id: f.id, data: ()=> f}))};
    },
    /* Makers Lab escucha cambios. Los de soporte llegan solos por
       Realtime; los demás se refrescan cada minuto, que para un
       tablero de suscripciones sobra. */
    onSnapshot(fn, falla){
      let vivo = true;
      const tira = async ()=>{
        try{
          const filas = await leeColeccion(col);
          if(vivo) fn({docs: filas.map(f=> ({id: f.id, data: ()=> f}))});
        }catch(e){ if(vivo && falla) falla(e); }
      };
      tira();
      const cada = setInterval(tira, 60000);
      if(col === "tickets" || col === "errores"){
        SB.channel("lab-" + col)
          .on("postgres_changes",
              {event:"*", schema:"public", table:"documentos", filter:"coleccion=eq.soporte"},
              tira)
          .subscribe();
      }
      return ()=>{ vivo = false; clearInterval(cada); };
    }
  };
  return api;
}

/* Descargas: en un sitio propio basta con un enlace normal. */
const PUENTE_DOWNLOADS = {
  async save({filename, data}){
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const a = document.createElement("a"); a.href = url; a.download = filename || "archivo";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  }
};

window.claude = { use: async nombre =>
  nombre === "db" ? {doc: refDoc, collection: refCol} :
  nombre === "downloads" ? PUENTE_DOWNLOADS :
  null };          // 'sample' no existe fuera de Claude: Makers Lab ya sabe vivir sin él


/* ============================================================
   4. Entrar y salir
   ============================================================ */
if(q("#puertaForm")) q("#puertaForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const correo = q("#puertaMail").value.trim(), pass = q("#puertaPass").value;
  const aviso = q("#puertaMsg");
  aviso.hidden = false; aviso.textContent = "Entrando…";
  try{
    const {error} = await SB.auth.signInWithPassword({email:correo, password:pass});
    if(error) throw error;
    aviso.hidden = true;
    await arranca();
  }catch(err){
    aviso.textContent = String(err.message||"").indexOf("Invalid login") >= 0
      ? "Correo o contraseña incorrectos" : err.message;
  }
});
if(q("#puertaSalir")) q("#puertaSalir").addEventListener("click", async ()=>{
  await SB.auth.signOut(); location.reload();
});
/* El sitio puede estar publicado en una subcarpeta (GitHub Pages lo hace
   así: /cotizador-heymakers/). Mandar a "/" saldría del proyecto, así que
   siempre volvemos al index que está junto a esta página. */
const ALCOTIZADOR = "index.html";
if(q("#puertaInicio")) q("#puertaInicio").addEventListener("click", ()=>{ location.href = ALCOTIZADOR; });
if(q("#labSalir")) q("#labSalir").addEventListener("click", async ()=>{
  await SB.auth.signOut(); location.href = ALCOTIZADOR;
});
if(q("#labCotizador")) q("#labCotizador").addEventListener("click", ()=>{ location.href = ALCOTIZADOR; });

if(SB) SB.auth.onAuthStateChange(evt=>{ if(evt === "SIGNED_OUT") location.href = ALCOTIZADOR; });
arranca();
