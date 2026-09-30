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
  const {data, error} = await SB.from("staff").select("*").eq("id", SESION.user.id).maybeSingle();
  if(!error) return data || null;

  /* La tabla no se dejó leer. Antes de darte con la puerta en las narices
     preguntamos por la función, que es la que manda: si resulta que sí eres
     del equipo, te dejamos pasar y avisamos que hay una regla mal puesta.
     Cerrarle a quien sí tiene permiso, por un error de configuración, es
     peor que enseñar el tablero. */
  try{
    const r = await SB.rpc("es_staff");
    if(r.data === true){
      console.warn("La tabla staff no se deja leer (" + error.message + "). Corre el arreglo de la política staff_ver.");
      return {id: SESION.user.id, correo: SESION.user.email, nombre: SESION.user.email, rol: "soporte", parcial: true};
    }
  }catch(e){}
  return null;
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

/* La base habla en UTC y con milésimas; Makers Lab habla en la hora del
   reloj de quien está mirando, con el formato AAAA-MM-DDTHH:MM que usan
   todos sus cálculos de tiempo. Sin esta traducción un ticket que entró
   a las 9 de la mañana aparecería a las 3 de la tarde. */
function aSello(ts){
  if(!ts) return null;
  const d = new Date(ts);
  if(isNaN(d)) return null;
  const dd = n => String(n).padStart(2,"0");
  return d.getFullYear() + "-" + dd(d.getMonth()+1) + "-" + dd(d.getDate()) +
         "T" + dd(d.getHours()) + ":" + dd(d.getMinutes());
}

/* Los dos programas le dicen distinto a lo mismo. El cotizador habla
   desde el cliente ("lo envié", "ya lo cerré"); Makers Lab habla desde
   soporte ("nadie lo ha tomado", "está en curso"). Es el mismo ticket
   visto desde los dos lados del mostrador, y aquí se traduce. */
const TK_A_LAB  = {enviado:"abierto", contestado:"encurso", esperando:"esperando", cerrado:"resuelto"};
const TK_A_BASE = {abierto:"enviado", encurso:"contestado", esperando:"esperando", resuelto:"cerrado"};

/* Supabase guarda plan y estado por separado; Makers Lab los junta
   en un solo estado, que es como se habla del negocio: "está en
   prueba", "ya venció". Esta función traduce de uno al otro. */
function estadoDe(r){
  const viva = r.estado === "activa" && r.plan !== "ninguno" && new Date(r.vence) > new Date();
  if(r.estado === "cancelada")            return "baja";
  if(r.plan === "ninguno")                return "vencida";   // nunca contrató
  if(!viva)                               return "vencida";
  if(r.es_prueba || r.plan === "prueba")  return "prueba";
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
    /* El plan que se muestra es el que la cuenta tiene de verdad.
       Disfrazar un "sin plan" de "Básico" inflaba el ingreso del mes y
       hacía que soporte le hablara de un plan que nadie contrató. */
    plan: r.plan || "ninguno",
    planReal: r.plan,
    esPrueba: !!r.es_prueba,
    codigo: r.codigo || null,
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
function ticketDeVista(r, nota){
  const t = {
    id: r.ticket_id,
    cuentaId: r.cuenta_id,
    taller: r.taller,
    plan: r.plan || "ninguno",
    folio: r.folio,
    asunto: r.asunto,
    /* El estado traducido, y la prioridad sacada de lo que el cliente
       contestó cuando pidió ayuda: si dijo que no puede seguir
       trabajando, esto es urgente y no hay que adivinarlo. */
    estado: TK_A_LAB[r.estado] || "abierto",
    prioridad: r.bloquea ? "alta" : "normal",
    bloquea: !!r.bloquea,
    origen: "widget",
    pantalla: r.pantalla,
    version: r.version,
    navegador: r.navegador,
    reaperturas: Number(r.reaperturas || 0),
    /* Los nombres que Makers Lab usa para el reloj. Los sellos los puso
       la base, no el navegador del cliente: no se pueden maquillar. */
    creado:     aSello(r.entro),
    primeraResp: aSello(r.contestado),
    resuelto:   aSello(r.resuelto),
    confirmado: aSello(r.confirmado),
    horasEnContestar: r.horas_en_contestar,
    horasEnResolver: r.horas_en_resolver,
    contexto: r.contexto || {},
    errores: (r.errores || []).map(e => ({
      hora: e.hora || e.cuando || "",
      pantalla: e.pantalla || r.pantalla || "",
      msg: e.msg || e.mensaje || String(e),
      donde: e.donde || ""
    })),
    /* El cotizador guarda la hora del mensaje en "hora"; Makers Lab la
       busca en "f". Se rellenan las dos para que ninguno de los dos se
       quede mirando un hueco. */
    mensajes: (r.mensajes || []).map(m => ({
      de: m.de === "soporte" ? "soporte" : "cliente",
      txt: m.txt || "",
      f: m.f || (m.hora && String(m.hora).length > 5 ? m.hora
                 : (aSello(r.entro) || "").slice(0,10) + "T" + String(m.hora || "00:00").slice(0,5)),
      hora: m.hora || null
    })),
    atiende: null,
    fallaId: null
  };
  /* Quién lo lleva y si es una falla del programa son cosas TUYAS: no
     tienen por qué viajar al documento del cliente. Viven en tu
     cuaderno y se le montan encima al ticket al leerlo. */
  const mio = nota || {};
  ["atiende","fallaId","prioridad","nota"].forEach(k=>{
    if(mio[k] !== undefined && mio[k] !== null) t[k] = mio[k];
  });
  return t;
}

/* ============================================================
   3. El puente
   ============================================================
   Misma forma que usaba el artefacto: collection(), doc(), get(),
   set(), delete(), onSnapshot(). Por dentro cada colección sabe si
   es de solo lectura o del cuaderno. */

/* De solo lectura quiere decir "no se borra desde aquí". Los tickets sí
   se contestan —eso es su razón de ser— pero borrar el reporte de un
   cliente no es algo que Makers Lab deba poder hacer. */
const SOLO_LECTURA = {cuentas: true, tickets: true, errores: true, codigos: true};

/* La vista de soporte es la última pieza que se instala, y si falta, lo
   que aparece es "no existe la tabla v_soporte": cierto y perfectamente
   inútil. Aquí se traduce a la instrucción de qué correr, una sola vez,
   y el resto de Makers Lab sigue funcionando en lugar de caerse entero.

   Los reportes no se pierden mientras eso pasa: están guardados en la
   cuenta de cada taller, esperando que la vista exista. */
let avisoSoporte = false;
async function leeSoporte(){
  const r = await SB.from("v_soporte").select("*").order("entro", {ascending:false});
  if(r.error){
    const m = String(r.error.message || "");
    if(m.indexOf("v_soporte") >= 0 || m.indexOf("schema cache") >= 0){
      if(!avisoSoporte){
        avisoSoporte = true;
        if(window.aviso) setTimeout(()=> window.aviso(
          "Falta correr CORRER-6-soporte.sql en Supabase: sin eso los reportes de los talleres no llegan aqu\u00ed."), 800);
        console.warn("v_soporte no existe todav\u00eda:", m);
      }
      return {data: []};
    }
    throw new Error(r.error.message);
  }
  return {data: r.data || []};
}

async function leeColeccion(col){
  if(col === "cuentas"){
    const [{data: filas}, {data: notas}] = await Promise.all([
      SB.from("v_cuentas").select("*").order("creada", {ascending:false}),
      SB.from("lab_datos").select("doc_id,cuerpo").eq("coleccion","notas_cuenta")
    ]);
    const porId = {};
    (notas||[]).forEach(n=> porId[n.doc_id] = n.cuerpo);
    /* Nos quedamos con el renglón tal cual viene de la base. Al guardar,
       comparamos contra esto para mandar solo lo que de verdad cambió. */
    window.__cuentasCrudas = {};
    (filas||[]).forEach(r=> window.__cuentasCrudas[r.id] = r);
    return (filas||[]).map(r=> cuentaDeVista(r, porId[r.id]));
  }

  if(col === "tickets"){
    const [{data}, {data: notas}] = await Promise.all([
      leeSoporte(),
      SB.from("lab_datos").select("doc_id,cuerpo").eq("coleccion","notas_ticket")
    ]);
    const porId = {};
    (notas||[]).forEach(n=> porId[n.doc_id] = n.cuerpo);
    return (data||[]).map(r=> ticketDeVista(r, porId[r.ticket_id]));
  }

  /* Los errores no son una tabla: son lo que el cotizador capturó
     dentro de cada reporte. Se sacan de ahí y se aplanan. */
  if(col === "errores"){
    const {data} = await leeSoporte();
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

  if(col === "codigos"){
    const {data} = await SB.from("v_codigos").select("*");
    return (data||[]).map(r=> Object.assign({id: r.codigo}, r));
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

/* Contestar un ticket escribe en dos lados, y la diferencia importa:

     · Lo que el cliente tiene que ver —tu respuesta y en qué va— se
       escribe en SU documento. La base solo nos deja tocar la colección
       'soporte', así que no hay forma de que esto se desvíe a una
       cotización o a un precio de nadie.
     · Lo que es asunto tuyo —quién lo lleva, si es una falla del
       programa, tus notas— se queda en tu cuaderno. El cliente no
       necesita ver el nombre de quién lo está atendiendo por dentro.

   Y una regla que no se negocia: un ticket lo cierra el cliente. Si
   soporte marca "resuelto", del lado del cliente queda 'esperando' y él
   decide. La base además lo impide, pero es mejor que aquí ni se
   intente y se diga por qué. */
async function contestaTicket(id, t){
  const cuenta = t.cuentaId;
  if(!cuenta) throw new Error("Ese ticket no trae cuenta.");

  /* Primero tu cuaderno: nunca se pierde por un problema del otro lado. */
  const mio = {};
  ["atiende","fallaId","prioridad","nota"].forEach(k=>{
    if(t[k] !== undefined) mio[k] = t[k];
  });
  const {error: e1} = await SB.from("lab_datos").upsert(
    {coleccion:"notas_ticket", doc_id:id, cuerpo:mio}, {onConflict:"coleccion,doc_id"});
  if(e1) throw new Error(e1.message);

  const {data: actual, error: e0} = await SB.from("documentos").select("cuerpo")
    .eq("cuenta_id", cuenta).eq("coleccion","soporte").eq("doc_id", id).maybeSingle();
  if(e0) throw new Error(e0.message);
  if(!actual) throw new Error("Ese reporte ya no está en la cuenta del cliente.");

  const antes = actual.cuerpo || {};

  /* Los mensajes se mandan como los guarda el cotizador: con "hora". Se
     deja también "f" para que Makers Lab los pinte igual sin recargar. */
  const mensajes = (t.mensajes || antes.mensajes || []).map(m=>{
    const f = m.f || m.hora || "";
    return {de: m.de, txt: m.txt,
            hora: (m.hora && String(m.hora).length <= 5) ? m.hora : String(f).slice(11,16) || String(f).slice(0,5),
            f: f};
  });

  let estado = TK_A_BASE[t.estado] || antes.estado || "enviado";
  let recado = null;
  if(estado === "cerrado" && antes.estado !== "cerrado"){
    estado = "esperando";
    recado = "Queda en espera: el cierre lo confirma el cliente desde su cotizador.";
  }
  /* Si soporte contestó, el cliente tiene algo nuevo que leer. */
  const hayRespuestaNueva = mensajes.length > (antes.mensajes || []).length &&
                            mensajes[mensajes.length-1].de === "soporte";

  const cuerpo = Object.assign({}, antes, {
    mensajes: mensajes,
    estado:   estado,
    sinLeer:  hayRespuestaNueva ? true : !!antes.sinLeer
  });

  const {error} = await SB.from("documentos").update({cuerpo})
    .eq("cuenta_id", cuenta).eq("coleccion","soporte").eq("doc_id", id);
  if(error) throw new Error(error.message);
  /* Se guardó bien; esto no es un fallo, es una aclaración. Va como
     recado y no como error, porque el error diría "no se guardó". */
  if(recado && window.aviso) setTimeout(()=> window.aviso(recado), 400);
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
