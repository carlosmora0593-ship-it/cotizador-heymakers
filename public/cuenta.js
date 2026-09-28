/* ============================================================
   Cuentas, sesión, planes y puente con Supabase.
   Este archivo se carga ANTES del cotizador y le da a la app un
   objeto `window.claude` con la misma forma que usaba dentro de
   Claude, para que el cotizador no tenga que cambiar por dentro:
   guarda en Supabase en vez de en la nube de Claude.
   ============================================================ */
"use strict";

const q = s => document.querySelector(s);

/* ---------- Revisión de la configuración ----------
   La causa número uno de "Failed to fetch" es que config.js se subió
   sin editar, o con la dirección mal escrita. Lo revisamos antes de
   intentar nada, para dar un mensaje que sí diga qué arreglar. */
function revisaConfig(){
  if(!window.CONFIG) return "No se cargó config.js. Revisa que el archivo esté junto a index.html.";
  const u = String(CONFIG.SUPABASE_URL||"").trim(), k = String(CONFIG.SUPABASE_ANON_KEY||"").trim();
  if(!u || u.indexOf("TU-PROYECTO")>=0)
    return "Falta pegar la dirección de tu proyecto de Supabase en config.js (SUPABASE_URL).";
  if(!k || k.indexOf("PEGA-AQUI")>=0)
    return "Falta pegar tu llave pública de Supabase en config.js (SUPABASE_ANON_KEY).";
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(u.replace(/\/+$/,"")))
    return "La dirección de Supabase no tiene la forma correcta. Debe verse así: https://abcdefgh.supabase.co (sin diagonal al final). Ahora dice: " + u;
  if(k.length < 100)
    return "La llave de Supabase se ve incompleta: debe ser un texto muy largo. Copia otra vez la llave anon public desde Project Settings → API.";
  return null;
}

const PROBLEMA_CONFIG = revisaConfig();
const URL_SB = String((window.CONFIG && CONFIG.SUPABASE_URL) || "").trim().replace(/\/+$/,"");
const SB = PROBLEMA_CONFIG ? null : window.supabase.createClient(URL_SB, CONFIG.SUPABASE_ANON_KEY);
let SESION = null, CUENTA = null, PERFIL = null;

/* Prueba directa contra Supabase: dice si el problema es la dirección,
   la llave, o si todo está bien y el error viene de otro lado. */
async function pruebaConexion(){
  if(PROBLEMA_CONFIG) return {ok:false, msg:PROBLEMA_CONFIG};
  try{
    const r = await fetch(URL_SB + "/auth/v1/settings", {headers:{apikey: CONFIG.SUPABASE_ANON_KEY}});
    if(r.status === 200) return {ok:true, msg:"Conexión correcta con Supabase. Si aun así no puedes entrar, revisa Authentication → Providers → Email en tu proyecto."};
    if(r.status === 401 || r.status === 403)
      return {ok:false, msg:"Supabase contesta, pero rechaza la llave. Vuelve a copiar la llave anon public desde Project Settings → API."};
    return {ok:false, msg:"Supabase contestó con el código "+r.status+". Revisa que el proyecto no esté pausado."};
  }catch(e){
    return {ok:false, msg:"No se pudo contactar a "+URL_SB+". Puede ser que la dirección esté mal escrita, que el proyecto de Supabase esté pausado, o que una extensión del navegador esté bloqueando la conexión."};
  }
}
const plan = () => (CUENTA && CUENTA.plan) || "prueba";
const vigente = () => !!(CUENTA && CUENTA.estado === "activa" && new Date(CUENTA.vence) > new Date());
const esPro = () => vigente() && (plan() === "pro" || plan() === "prueba");

/* ---------- Puente: almacén de documentos ---------- */
const TABLA = "documentos";
function partes(path){ const p = path.split("/"); return {col:p[0], id:p.slice(1).join("_")}; }

function refDoc(path){
  const {col,id} = partes(path);
  return {
    id,
    path,
    async get(){
      const {data} = await SB.from(TABLA).select("cuerpo")
        .eq("cuenta_id",CUENTA.id).eq("coleccion",col).eq("doc_id",id).maybeSingle();
      return {exists: !!data, data: () => data ? data.cuerpo : undefined};
    },
    async set(cuerpo){
      const fila = {cuenta_id:CUENTA.id, coleccion:col, doc_id:id, cuerpo,
                    fecha: cuerpo.fecha || (cuerpo.cot && cuerpo.cot.fecha) || (cuerpo.venta && cuerpo.venta.fecha) || null,
                    total: cuerpo.total != null ? cuerpo.total : null};
      const {error} = await SB.from(TABLA).upsert(fila, {onConflict:"cuenta_id,coleccion,doc_id"});
      if(error) throw traduce(error);
    },
    async delete(){
      await SB.from(TABLA).delete().eq("cuenta_id",CUENTA.id).eq("coleccion",col).eq("doc_id",id);
    }
  };
}
function refCol(col){
  const estado = {orden:null, dir:"asc", tope:500};
  const api = {
    doc: id => refDoc(col+"/"+id),
    orderBy(campo, dir){ estado.orden = campo; estado.dir = dir||"asc"; return api; },
    limit(n){ estado.tope = n; return api; },
    async get(){
      let c = SB.from(TABLA).select("cuerpo").eq("cuenta_id",CUENTA.id).eq("coleccion",col);
      if(estado.orden) c = c.order(estado.orden === "fecha" ? "fecha" : "actualizado", {ascending: estado.dir === "asc"});
      c = c.limit(estado.tope);
      const {data} = await c;
      return {docs: (data||[]).map(r => ({data: () => r.cuerpo}))};
    }
  };
  return api;
}
const PUENTE_DB = {doc: refDoc, collection: refCol};

/* ---------- Puente: archivos ---------- */
const PUENTE_ASSETS = {
  async upload(file){
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const ruta = CUENTA.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2,8) + "." + ext;
    const {error} = await SB.storage.from("disenos").upload(ruta, file, {contentType:file.type||undefined, upsert:false});
    if(error) throw {code:"upload", message:error.message};
    const {data} = await SB.storage.from("disenos").createSignedUrl(ruta, 60*60*24*365);
    return {id: ruta, url: (data && data.signedUrl) || "", contentType: file.type, sizeBytes: file.size};
  },
  async list(){ return {assets:[], usage:{}}; },
  async delete(id){ await SB.storage.from("disenos").remove([id]); }
};

function traduce(error){
  const m = (error && error.message) || "";
  if(m.indexOf("SUSCRIPCION_VENCIDA")>=0) return {code:"vencida", message:"Tu suscripción venció"};
  if(m.indexOf("FUNCION_PRO")>=0)        return {code:"pro",     message:"El registro de ventas es del plan Pro"};
  if(m.indexOf("LIMITE_COTIZACIONES")>=0)return {code:"limite",  message:"Llegaste al límite de cotizaciones del plan Básico"};
  if(m.indexOf("LIMITE_CLIENTES")>=0)   return {code:"limite",  message:"Llegaste al límite de clientes del plan Básico"};
  if(m.indexOf("PRODUCCION_SOLO_ESTATUS")>=0) return {code:"rol", message:"Producción solo puede mover el estatus, la bitácora y el checklist"};
  if(m.indexOf("VENTAS_NO_TOCA_PRODUCCION")>=0) return {code:"rol", message:"Ventas solo puede consultar la producción"};
  if(m.indexOf("DISENO_SOLO_ARCHIVOS")>=0) return {code:"rol", message:"Diseño solo puede cambiar los archivos y dejar notas"};
  return {code:"error", message:m};
}

/* El cotizador pide sus servicios por aquí */
/* Descargas: en el sitio propio basta con un enlace normal. */
const PUENTE_DOWNLOADS = {
  async save({filename, data}){
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const a = document.createElement("a"); a.href = url; a.download = filename || "archivo";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  }
};
window.claude = { use: async nombre =>
  nombre === "db" ? PUENTE_DB :
  nombre === "assets" ? PUENTE_ASSETS :
  nombre === "downloads" ? PUENTE_DOWNLOADS : null };


/* ---------- Permisos por rol ----------
   admin      : todo
   ventas     : cotizar, cotizaciones, clientes, ver catálogo y producción
   produccion : solo el tablero de órdenes                                   */
const rol = () => (PERFIL && PERFIL.rol) || "admin";
const PERMISOS = {
  admin:      ["cot","sav","pro","dis","cli","arc","caj","ven","cat","set"],
  ventas:     ["cot","sav","pro","dis","cli","arc","cat"],
  diseno:     ["dis","pro"],
  produccion: ["pro"]
};
function puede(seccion){ return (PERMISOS[rol()] || PERMISOS.admin).indexOf(seccion) >= 0; }

window.__rolServidor = () => (PERFIL && PERFIL.rol) || null;
function aplicaPermisos(){
  const permitidas = (PERMISOS[rol()] || PERMISOS.admin).filter(t=> (t!=="ven" && t!=="caj") || esPro());
  document.querySelectorAll('#tabs [data-tab]').forEach(b=>{
    b.hidden = permitidas.indexOf(b.dataset.tab) < 0;
  });
  // Si está parado en una sección que ya no le toca, lo mandamos a la primera suya.
  const actual = document.querySelector('#tabs [data-tab][aria-selected="true"]');
  if(!actual || actual.hidden){
    const primera = document.querySelector('#tabs [data-tab]:not([hidden])');
    if(primera) primera.click();
  }
  // Ventas no edita precios del catálogo; producción no ve dinero.
  document.body.classList.toggle("rol-ventas", rol()==="ventas");
  document.body.classList.toggle("rol-produccion", rol()==="produccion");
  const chip = q("#cuentaRol");
  if(chip) chip.textContent = rol()==="admin" ? "Administrador" : rol()==="ventas" ? "Ventas" : "Producción";
}

/* ---------- Equipo ---------- */
async function cargaEquipo(){
  const {data} = await SB.from("mi_equipo").select("*").order("creado");
  return data || [];
}
async function renderEquipo(){
  const caja = q("#equipoCaja"); if(!caja) return;
  if(rol() !== "admin"){ caja.innerHTML = '<div class="empty">Solo un administrador puede ver y cambiar el equipo.</div>'; return; }
  const gente = await cargaEquipo();
  caja.innerHTML = gente.map(u=>
    '<div class="saved-item"><div class="meta"><b>'+(u.nombre||u.correo||"Sin nombre")+'</b>'+
    '<small>'+(u.correo||"")+'</small></div>'+
    '<select data-rol="'+u.id+'" style="width:auto"'+(u.id===SESION.user.id?" disabled":"")+'>'+
      ['admin','ventas','produccion'].map(r=>'<option value="'+r+'"'+(r===u.rol?" selected":"")+'>'+
        (r==="admin"?"Administrador":r==="ventas"?"Ventas":"Producción")+'</option>').join("")+
    '</select>'+
    (u.id===SESION.user.id ? '<span class="pill good">Eres tú</span>'
      : '<button class="btn sm icon" data-quitar="'+u.id+'" title="Quitar del equipo">✕</button>')+
    '</div>').join("") || '<div class="empty">Solo estás tú.</div>';
}
async function llamaEquipo(cuerpo){
  const r = await fetch("/.netlify/functions/invitar-usuario", {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+SESION.access_token},
    body: JSON.stringify(cuerpo)
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || "No se pudo completar");
  return data;
}
document.addEventListener("click", async e=>{
  if(e.target.closest("#equipoInvitar")){
    const correo = (q("#equipoCorreo").value||"").trim();
    const nombre = (q("#equipoNombre").value||"").trim();
    const rolNuevo = q("#equipoRol").value;
    const b = e.target.closest("#equipoInvitar");
    b.disabled = true; b.textContent = "Dando de alta…";
    try{
      const d = await llamaEquipo({accion:"invitar", correo, nombre, rol:rolNuevo});
      q("#equipoCorreo").value = ""; q("#equipoNombre").value = "";
      q("#equipoAviso").hidden = false;
      q("#equipoAviso").innerHTML = "Listo. Pásale estos datos a <b>"+d.correo+"</b>:<br>"+
        "Contraseña temporal: <b style='font-family:monospace;font-size:15px'>"+d.temporal+"</b><br>"+
        "<span style='font-size:12px'>Que entre y la cambie desde “Olvidé mi contraseña”. Este aviso no se vuelve a mostrar.</span>";
      await renderEquipo();
    }catch(err){ alert(err.message); }
    finally{ b.disabled = false; b.textContent = "Dar de alta"; }
    return;
  }
  const quitar = e.target.closest("[data-quitar]");
  if(quitar){
    if(!confirm("¿Quitar a esta persona del equipo? Pierde el acceso de inmediato.")) return;
    try{ await llamaEquipo({accion:"quitar", usuario_id:quitar.dataset.quitar}); await renderEquipo(); }
    catch(err){ alert(err.message); }
  }
});
document.addEventListener("change", async e=>{
  const sel = e.target.closest("[data-rol]");
  if(!sel) return;
  try{ await llamaEquipo({accion:"rol", usuario_id:sel.dataset.rol, rol:sel.value}); }
  catch(err){ alert(err.message); await renderEquipo(); }
});

/* ---------- Sesión ---------- */
async function cargaCuenta(){
  const {data: perfil} = await SB.from("perfiles").select("*").eq("id", SESION.user.id).maybeSingle();
  if(!perfil) return false;
  PERFIL = perfil;
  const {data: cuenta} = await SB.from("cuentas").select("*").eq("id", perfil.cuenta_id).maybeSingle();
  CUENTA = cuenta;
  return !!cuenta;
}

async function arrancaSesion(){
  if(PROBLEMA_CONFIG){
    muestraAcceso();
    avisoAuth("Falta configurar el sitio · " + PROBLEMA_CONFIG);
    q("#authOk").disabled = true;
    return;
  }
  const {data} = await SB.auth.getSession();
  SESION = data.session;
  if(!SESION){ muestraAcceso(); return; }
  // El alta de la cuenta la hace un disparador; si aún no existe, esperamos un momento.
  let ok = await cargaCuenta();
  if(!ok){ await new Promise(r=>setTimeout(r,1200)); ok = await cargaCuenta(); }
  if(!ok){ muestraAcceso("No pudimos abrir tu cuenta. Vuelve a entrar en un momento."); return; }
  q("#auth").hidden = true;
  document.body.classList.remove("sin-sesion");
  pintaCuenta();
  aplicaPlan();
  aplicaPermisos();
  renderEquipo();
  if(window.__arranca) window.__arranca();
}

function muestraAcceso(msg){
  q("#auth").hidden = false;
  document.body.classList.add("sin-sesion");
  if(msg) avisoAuth(msg);
}
function avisoAuth(m, bien){
  const el = q("#authMsg"); el.textContent = m || ""; el.hidden = !m;
  el.style.color = bien ? "var(--good)" : "var(--accent)";
}

/* ---------- Pantalla de acceso ---------- */
q("#authTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-modo]"); if(!b) return;
  [...q("#authTabs").children].forEach(x=>x.setAttribute("aria-pressed", x===b));
  const alta = b.dataset.modo === "alta";
  q("#authAlta").hidden = !alta;
  q("#authOk").textContent = alta ? "Crear mi cuenta" : "Entrar";
  avisoAuth("");
});

q("#authForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const alta = !q("#authAlta").hidden;
  const correo = q("#authMail").value.trim(), pass = q("#authPass").value;
  if(!correo || pass.length < 6){ avisoAuth("Escribe tu correo y una contraseña de al menos 6 caracteres"); return; }
  q("#authOk").disabled = true;
  try{
    if(alta){
      const {error} = await SB.auth.signUp({email:correo, password:pass, options:{data:{
        nombre: q("#authNombre").value.trim(), negocio: q("#authNegocio").value.trim() || "Mi taller"}}});
      if(error) throw error;
      const {data} = await SB.auth.getSession();
      if(!data.session){ avisoAuth("Te mandamos un correo para confirmar tu cuenta. Ábrelo y regresa a entrar.", true); return; }
    } else {
      const {error} = await SB.auth.signInWithPassword({email:correo, password:pass});
      if(error) throw error;
    }
    await arrancaSesion();
  }catch(err){
    const m = String(err.message||"");
    if(/Failed to fetch|NetworkError|Load failed/i.test(m)){
      const d = await pruebaConexion();
      avisoAuth("No se pudo conectar · " + d.msg);
    } else {
      avisoAuth(m.indexOf("Invalid login")>=0 ? "Correo o contraseña incorrectos"
              : m.indexOf("already registered")>=0 ? "Ese correo ya tiene cuenta, entra con tu contraseña"
              : m.indexOf("Email not confirmed")>=0 ? "Falta confirmar tu correo. Abre el mensaje que te mandamos."
              : m);
    }
  }finally{ q("#authOk").disabled = false; }
});

q("#authProbar").addEventListener("click", async ()=>{
  avisoAuth("Probando la conexión con Supabase…", true);
  const d = await pruebaConexion();
  avisoAuth(d.msg, d.ok);
});

q("#authOlvide").addEventListener("click", async ()=>{
  const correo = q("#authMail").value.trim();
  if(!correo){ avisoAuth("Escribe tu correo arriba y vuelve a darle"); return; }
  await SB.auth.resetPasswordForEmail(correo, {redirectTo: location.origin});
  avisoAuth("Te mandamos un correo para cambiar tu contraseña", true);
});

/* ---------- Encabezado de cuenta ---------- */
function pintaCuenta(){
  const dias = Math.max(0, Math.ceil((new Date(CUENTA.vence) - new Date())/86400000));
  const etiqueta = plan()==="prueba" ? "Prueba · "+dias+" días"
                 : plan()==="pro" ? "Plan Pro" : "Plan Básico";
  q("#cuentaPlan").textContent = etiqueta;
  q("#cuentaPlan").className = "chip-store " + (vigente() ? (plan()==="pro"?"pro":"ok") : "malo");
  q("#cuentaMail").textContent = (PERFIL && PERFIL.correo) || SESION.user.email;
  q("#avisoPago").hidden = vigente();
  if(!vigente()) q("#avisoPagoTxt").textContent =
    "Tu suscripción terminó el "+String(CUENTA.vence).slice(0,10)+". Puedes seguir consultando lo que ya tienes, pero para guardar cambios hay que reactivarla.";
  else if(plan()==="prueba" && dias<=5){
    q("#avisoPago").hidden = false;
    q("#avisoPagoTxt").textContent = "Te quedan "+dias+" día(s) de prueba. Elige un plan para no perder tu información.";
  }
}
function aplicaPlan(){
  if(typeof aplicaPermisos === "function") aplicaPermisos();
  document.querySelectorAll("[data-solo-pro]").forEach(el=> el.hidden = !esPro());
}

q("#btnSalir").addEventListener("click", async ()=>{ await SB.auth.signOut(); location.reload(); });
q("#btnPlanes").addEventListener("click", ()=> abrePlanes());
q("#avisoPagoBtn").addEventListener("click", ()=> abrePlanes());

/* ---------- Planes y cobro ---------- */
function abrePlanes(){
  const ciclo = q("#cicloSel").value;
  q("#planesGrid").innerHTML = Object.keys(CONFIG.PLANES).map(k=>{
    const p = CONFIG.PLANES[k], precio = ciclo==="anual" ? p.anual : p.mensual;
    const actual = plan()===k && vigente();
    return '<div class="planCard'+(k==="pro"?" destacado":"")+'">'+
      '<h3>'+p.nombre+'</h3><p class="para">'+p.para+'</p>'+
      '<div class="precio">$'+precio.toLocaleString("es-MX")+'<span> MXN / '+(ciclo==="anual"?"año":"mes")+'</span></div>'+
      '<ul>'+p.incluye.map(i=>"<li>"+i+"</li>").join("")+'</ul>'+
      '<button class="btn '+(k==="pro"?"primary":"")+'" data-contratar="'+k+'"'+(actual?" disabled":"")+'>'+
      (actual?"Es tu plan actual":"Suscribirme")+'</button></div>';
  }).join("");
  q("#modalPlanes").hidden = false;
}
q("#cicloSel").addEventListener("change", abrePlanes);
q("#planesCerrar").addEventListener("click", ()=> q("#modalPlanes").hidden = true);

q("#planesGrid").addEventListener("click", async e=>{
  const b = e.target.closest("[data-contratar]"); if(!b) return;
  b.disabled = true; b.textContent = "Abriendo Mercado Pago…";
  try{
    const r = await fetch("/.netlify/functions/crear-suscripcion", {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+SESION.access_token},
      body: JSON.stringify({plan:b.dataset.contratar, ciclo:q("#cicloSel").value})
    });
    const data = await r.json();
    if(!r.ok || !data.init_point) throw new Error(data.error || "No se pudo crear la suscripción");
    location.href = data.init_point;
  }catch(err){
    b.disabled = false; b.textContent = "Suscribirme";
    alert("No se pudo abrir el cobro: "+err.message);
  }
});

/* Al volver de Mercado Pago revisamos el estado un par de veces,
   porque el aviso de pago puede tardar unos segundos en llegar. */
async function revisaTrasPago(){
  if(location.search.indexOf("pago=")<0) return;
  q("#avisoPagoTxt").textContent = "Confirmando tu pago con Mercado Pago…";
  q("#avisoPago").hidden = false;
  for(let i=0;i<8;i++){
    await new Promise(r=>setTimeout(r,2500));
    await cargaCuenta();
    if(vigente() && plan()!=="prueba"){ history.replaceState({},"",location.pathname); pintaCuenta(); aplicaPlan(); return; }
  }
  pintaCuenta();
}

SB.auth.onAuthStateChange((evt)=>{ if(evt==="SIGNED_OUT") location.reload(); });
arrancaSesion().then(revisaTrasPago);
