/* ============================================================
   Cuentas, sesión, planes y puente con Supabase.
   Este archivo se carga ANTES del cotizador y le da a la app un
   objeto `window.claude` con la misma forma que usaba dentro de
   Claude, para que el cotizador no tenga que cambiar por dentro:
   guarda en Supabase en vez de en la nube de Claude.
   ============================================================ */
"use strict";

const q = s => document.querySelector(s);
const VERSION_SITIO = window.BUILD || "sin sello";
console.log("Cotizador Hey Makers · versión " + VERSION_SITIO);

/* El arreglo de roles, tal cual viene en sql/03-arreglo-roles.sql, para
   poder ponerlo en el portapapeles sin que nadie busque el archivo. */
const SQL_ARREGLO_ROLES = "-- ============================================================\n--  Arreglo de roles — córrelo si entraste y te quedaste como\n--  \"ventas\" aunque seas el dueño de la cuenta.\n--  Es seguro repetirlo las veces que quieras.\n-- ============================================================\n\n-- ¿Por qué pasa? Si se corrió 01-esquema.sql DESPUÉS de 02-roles.sql,\n-- el disparador de alta volvió a la versión vieja y los usuarios nuevos\n-- nacieron con el rol por defecto, que es 'ventas'.\n\n-- 1. Vuelve a dejar el disparador correcto: quien abre la cuenta es admin.\ncreate or replace function public.al_crear_usuario()\nreturns trigger\nlanguage plpgsql security definer set search_path = public\nas $$\ndeclare nueva uuid;\nbegin\n  insert into public.cuentas (nombre)\n    values (coalesce(new.raw_user_meta_data->>'negocio', 'Mi taller'))\n    returning id into nueva;\n  insert into public.perfiles (id, cuenta_id, nombre, correo, rol)\n    values (new.id, nueva, new.raw_user_meta_data->>'nombre', new.email, 'admin');\n  return new;\nend $$;\n\n-- 2. Toda cuenta que se haya quedado sin administrador: el primero que\n--    entró pasa a serlo.\nupdate public.perfiles p\n   set rol = 'admin'\n where not exists (\n         select 1 from public.perfiles q\n          where q.cuenta_id = p.cuenta_id and q.rol = 'admin')\n   and p.creado = (\n         select min(r.creado) from public.perfiles r\n          where r.cuenta_id = p.cuenta_id);\n\n-- 3. Revisa cómo quedó tu equipo (esto solo muestra, no cambia nada).\nselect c.nombre as cuenta, p.correo, p.rol, p.creado\n  from public.perfiles p\n  join public.cuentas c on c.id = p.cuenta_id\n order by c.nombre, p.creado;\n";

/* La dirección del editor SQL del proyecto, sacada de la misma URL de Supabase */
function urlEditorSQL(){
  const m = String((window.CONFIG && CONFIG.SUPABASE_URL) || "").match(/https:\/\/([a-z0-9-]+)\.supabase\./i);
  return m ? "https://supabase.com/dashboard/project/" + m[1] + "/sql/new" : "https://supabase.com/dashboard";
}

/* Roles que la base todavía no conoce. Pasa cuando se corrió 01-esquema.sql
   después de 02-roles.sql: el dueño se queda con un rol viejo y la base le
   niega cosas aunque la pantalla se las muestre. Se arregla corriendo
   sql/03-arreglo-roles.sql una vez. */
function rolRaro(){
  const r = (PERFIL && PERFIL.rol) || "";
  return !!PERFIL && ["admin","ventas","diseno","produccion"].indexOf(r) < 0;
}

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

/* ---------- ¿Este sitio tiene funciones de servidor? ----------
   El cotizador entero vive entre el navegador y Supabase, así que corre en
   cualquier lado. Pero tres cosas necesitan un servidor que guarde la llave
   de servicio en secreto: crear el cobro en Mercado Pago, recibir el aviso
   de pago, y dar de alta a alguien del equipo.

   En Netlify existen. En GitHub Pages no, porque ahí solo se sirven
   archivos. En vez de dejar que el botón truene con un error incomprensible,
   lo preguntamos una vez y lo decimos con todas sus letras. */
const FUNCIONES = "/.netlify/functions/";
const SIN_SERVIDOR = "SIN_SERVIDOR";

/* Preguntar de antemano "¿hay servidor?" sale mal: cada hosting contesta
   distinto a una petición a la nada (404, 405, 501, una página de error).
   Así que no adivinamos: hacemos la llamada de verdad y miramos QUÉ
   contestó. Una función siempre contesta JSON; un sitio de puros archivos
   contesta su página de error en HTML. Eso no falla en ningún lado. */
async function leeJson(r){
  const tipo = (r.headers.get("content-type") || "").toLowerCase();
  if(tipo.indexOf("json") < 0){
    const e = new Error(SIN_SERVIDOR); e.code = SIN_SERVIDOR; throw e;
  }
  try{ return await r.json(); }
  catch(err){ const e = new Error(SIN_SERVIDOR); e.code = SIN_SERVIDOR; throw e; }
}

const PROBLEMA_CONFIG = revisaConfig();
const URL_SB = String((window.CONFIG && CONFIG.SUPABASE_URL) || "").trim().replace(/\/+$/,"");
const SB = PROBLEMA_CONFIG ? null : window.supabase.createClient(URL_SB, CONFIG.SUPABASE_ANON_KEY);
let SESION = null, CUENTA = null, PERFIL = null;
let EMPRESAS = [];      // todas las empresas a las que pertenece este correo
let SOY_STAFF = false;  // ¿es alguien de Hey Makers? lo decide la base, no la pantalla

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
const vigente = () => !!(CUENTA && CUENTA.plan !== "ninguno" &&
  CUENTA.estado === "activa" && new Date(CUENTA.vence) > new Date());

/* Los planes van en escalera: lo que abre uno sigue abierto en los de
   arriba. La prueba abre todo para que el cliente vea qué está comprando.
     1 Básico · 2 Maker · 3 Pro                                          */
/* 'ninguno' es la cuenta recién creada sin código: existe, entra y mira,
   pero no guarda nada hasta contratar. 'prueba' queda por compatibilidad
   con las cuentas viejas. */
const NIVEL = {ninguno:0, basico:1, maker:2, pro:3, prueba:3};
const nivelPlan = () => NIVEL[plan()] || 0;
const esPro   = () => vigente() && nivelPlan() >= 3;   // caja, ventas, utilidad
const esMaker = () => vigente() && nivelPlan() >= 2;   // compras, inventario, equipo
const sinPlan = () => plan() === "ninguno";
const esPrueba = () => !!(CUENTA && CUENTA.es_prueba) || plan() === "prueba";
const nombrePlan = () => {
  if(sinPlan()) return "Sin plan";
  const p = CONFIG.PLANES[plan()];
  return p ? p.nombre : plan() === "prueba" ? "Prueba" : plan();
};
const TOPE_USUARIOS = {basico:1, maker:3, pro:0, prueba:0};   // 0 = sin límite

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
  if(m.indexOf("SIN_PLAN")>=0)           return {code:"sinplan", message:"Tu cuenta todavía no tiene plan"};
  if(m.indexOf("SUSCRIPCION_VENCIDA")>=0) return {code:"vencida", message:"Tu suscripción venció"};
  if(m.indexOf("FUNCION_PRO")>=0)        return {code:"pro",     message:"La caja y el registro de ventas son del plan Pro"};
  if(m.indexOf("FUNCION_MAKER")>=0)      return {code:"pro",     message:"Compras e inventario son del plan Maker en adelante"};
  if(m.indexOf("LIMITE_COTIZACIONES")>=0)return {code:"limite",  message:"Llegaste al límite de cotizaciones de tu plan"};
  if(m.indexOf("LIMITE_CLIENTES")>=0)   return {code:"limite",  message:"Llegaste al límite de clientes de tu plan"};
  if(m.indexOf("LIMITE_USUARIOS")>=0)   return {code:"limite",  message:"Llegaste al límite de usuarios de tu plan"};
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
   ventas     : cotizar, cotizaciones, clientes, catálogo, compras, ver producción
   diseno     : archivos de diseño y el tablero de órdenes
   produccion : el tablero de órdenes y la recepción de material              */
const ROLES_NOMBRE = {admin:"Administrador", ventas:"Ventas", diseno:"Diseño", produccion:"Producción"};
/* Nombres viejos que quedaron en bases ya instaladas: quien abrió la cuenta
   es su administrador, se llame como se llame en la tabla. */
const ALIAS_ROL = {dueno:"admin", owner:"admin", propietario:"admin", miembro:"ventas"};
const rolCrudo = () => (PERFIL && PERFIL.rol) || "";
const escTxt = t => String(t==null?"":t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function rol(){
  const r = ALIAS_ROL[rolCrudo()] || rolCrudo();
  return ROLES_NOMBRE[r] ? r : "admin";     // rol desconocido o sin perfil: no le escondemos nada
}
const PERMISOS = {
  admin:      ["cot","sav","pro","dis","cli","arc","caj","ven","cat","calc","com","set"],
  ventas:     ["cot","sav","pro","dis","cli","arc","cat","com"],
  diseno:     ["dis","pro"],
  produccion: ["pro","com"]
};
/* Secciones que no vienen en el plan Básico */
const SOLO_PRO   = ["caj","ven"];
/* "fac" no es una pestaña: es el bloque de datos fiscales y facturación
   que vive dentro de Ajustes. Se cuela en la misma lista porque el
   cotizador pregunta por el mismo lugar, y así hay UNA sola tabla de
   qué incluye cada plan en lugar de dos que se desincronizan. */
const SOLO_MAKER = ["com", "fac"];
function enElPlan(t){
  /* Quien nunca contrató no entra a trabajar. Antes esto dejaba pasar todo
     lo que no fuera Caja, Ventas o Compras, con la idea de que viera cómo
     funciona; el resultado real era que podía cotizar gratis para siempre
     y, peor, "confirmar pedidos" que le daban folio y no se guardaban en
     ningún lado. Prefiero una puerta cerrada y honesta que un recorrido
     que termina en un documento que no existe.

     Ojo con la diferencia: esto es para el que NUNCA tuvo plan. A quien
     se le venció no se le cierra nada — sigue viendo lo suyo, y la base
     es la que no le deja guardar. Quitarle la vista a quien ya pagó
     sería castigarlo por atrasarse un día. */
  if(sinPlan()) return false;
  if(SOLO_PRO.indexOf(t) >= 0)   return esPro();
  if(SOLO_MAKER.indexOf(t) >= 0) return esMaker();
  return true;
}
function puede(seccion){
  return (PERMISOS[rol()] || PERMISOS.admin).indexOf(seccion) >= 0 && enElPlan(seccion);
}

/* ---------- el carrusel de anuncios ----------
   Los anuncios no son de ningún taller: son del Lab y los ve todo el mundo.
   La base ya filtra por vigencia y por "activo", así que aquí no hace falta
   repetir esa lógica: lo que llegue es lo que está al aire.

   Si algo falla —sin red, tabla todavía sin crear— se devuelve una lista
   vacía a propósito. Un anuncio que no carga no tiene por qué romperle el
   día a quien está cotizando. */
window.__anuncios = async function(){
  if(!SB) return [];
  try{
    const {data, error} = await SB.from("anuncios")
      .select("id,titulo,imagen,enlace,alt")
      .order("orden", {ascending:true}).order("id", {ascending:true});
    if(error) return [];
    return data || [];
  }catch(e){ return []; }
};
/* Contar es lo ÚNICO que el navegador puede hacerle a un anuncio: del otro
   lado hay una función que sólo sabe sumar de uno en uno. */
window.__anuncioMarca = function(id, tipo){
  if(!SB || !id) return;
  try{ SB.rpc("anuncio_marca", {p_id: id, p_tipo: tipo}); }catch(e){}
};

/* El cotizador reparte sus pestañas por rol y no sabe de planes. Le
   dejamos esta puerta para que pregunte antes de mostrar una sección que
   la suscripción no incluye. */
window.__enElPlan = enElPlan;

/* El cotizador pregunta por aquí qué rol tiene quien está adentro, y con eso
   decide quién autoriza una requisición, quién ve la caja y todo lo demás.
   Va el rol YA normalizado: si la base todavía dice "dueno", aquí sale
   "admin". Si devolviéramos el texto crudo, el cotizador no reconocería el
   rol y le negaría al dueño hasta autorizar sus propias compras. */
window.__rolServidor = () => PERFIL ? rol() : null;
function aplicaPermisos(){
  const permitidas = (PERMISOS[rol()] || PERMISOS.admin).filter(enElPlan);
  document.querySelectorAll('#tabs [data-tab]').forEach(b=>{
    b.hidden = b.dataset.tab === "set" || permitidas.indexOf(b.dataset.tab) < 0;
  });
  // Si está parado en una sección que ya no le toca, lo mandamos a la primera suya.
  const actual = document.querySelector('#tabs [data-tab][aria-selected="true"]');
  if(!actual || actual.hidden){
    const primera = document.querySelector('#tabs [data-tab]:not([hidden])');
    if(primera) primera.click();
  }
  // Ventas no edita precios del catálogo; producción no ve dinero.
  document.body.classList.toggle("rol-ventas", rol()==="ventas");
  document.body.classList.toggle("rol-diseno", rol()==="diseno");
  document.body.classList.toggle("rol-produccion", rol()==="produccion");
  /* Sin acceso a Ajustes no tiene sentido ofrecerlos: un menú que enseña
     puertas cerradas hace perder el tiempo. */
  const hayAjustes = permitidas.indexOf("set") >= 0;
  const bAj = q("#btnAjustes"); if(bAj) bAj.hidden = !hayAjustes;

  const chip = q("#cuentaRol");
  if(chip){
    chip.textContent = (ROLES_NOMBRE[rol()] || "Sin rol asignado") + (rolRaro() ? " ⚠" : "");
    chip.title = rolRaro()
      ? 'Tu perfil dice "' + rolCrudo() + '", que no es un rol válido. Corre sql/03-arreglo-roles.sql en Supabase. · Versión ' + VERSION_SITIO
      : "Versión " + VERSION_SITIO;
  }
}

/* ---------- Equipo ---------- */
async function cargaEquipo(){
  if(!SB) return [];
  const {data} = await SB.from("mi_equipo").select("*").order("creado");
  return data || [];
}
async function renderEquipo(){
  const caja = q("#equipoCaja"); if(!caja) return;
  const manda = rol() === "admin";                 // quién puede cambiar roles y dar de baja
  const gente = await cargaEquipo();
  const alta = q("#equipoAlta");
  if(alta) alta.hidden = !manda;                   // el formulario de alta sí es solo del admin

  caja.innerHTML = (gente || []).map(u=>{
    const yo = u.id === SESION.user.id;
    const nombre = u.nombre || u.correo || "Sin nombre";
    const selector = manda
      ? '<select data-rol="'+u.id+'" style="width:auto"'+(yo?" disabled":"")+'>'+
          Object.keys(ROLES_NOMBRE).map(r=>'<option value="'+r+'"'+(r===u.rol?" selected":"")+'>'+
            ROLES_NOMBRE[r]+'</option>').join("")+
        '</select>'
      : '<span class="pill">'+(ROLES_NOMBRE[u.rol] || "Sin rol asignado")+'</span>';
    return '<div class="saved-item"><div class="meta"><b>'+nombre+'</b>'+
      '<small>'+(u.correo||"")+'</small></div>'+ selector +
      (yo ? '<span class="pill good">Eres tú</span>'
          : (manda ? '<button class="btn sm icon" data-quitar="'+u.id+'" title="Quitar del equipo">✕</button>' : ''))+
      '</div>';
  }).join("") || '<div class="empty">Solo estás tú.</div>';

  const alarma = q("#equipoAlarma");
  if(alarma){
    alarma.hidden = !rolRaro();
    if(rolRaro()) alarma.innerHTML =
      'Tu perfil en la base dice el rol <b>' + escTxt(rolCrudo() || "(vacío)") + '</b>, que no es ninguno de los cuatro. ' +
      'Por eso no puedes dar de alta a nadie ni ver a tu equipo: la base de datos te lo niega, aunque la pantalla te deje pasar. ' +
      'Se arregla una sola vez, con este SQL.' +
      '<span style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        '<button class="btn sm primary" id="rolCopiar" type="button">Copiar el SQL</button>' +
        '<button class="btn sm" id="rolAbrir" type="button">Abrir el editor de Supabase</button>' +
      '</span>';
  }

  const copiar = q("#rolCopiar");
  if(copiar) copiar.addEventListener("click", ()=>{
    const listo = ()=>{ copiar.textContent = "Copiado ✓"; setTimeout(()=>copiar.textContent = "Copiar el SQL", 2500); };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(SQL_ARREGLO_ROLES).then(listo, ()=>alert(SQL_ARREGLO_ROLES));
    } else alert(SQL_ARREGLO_ROLES);
  });
  const abrir = q("#rolAbrir");
  if(abrir) abrir.addEventListener("click", ()=>{
    const v = window.open(urlEditorSQL(), "_blank", "noopener");
    if(!v) alert("Tu navegador bloqueó la ventana. Entra a mano a Supabase → SQL Editor.");
  });

  const nota = q("#equipoNota");
  if(nota){
    const tope = TOPE_USUARIOS[plan()];
    nota.hidden = false;
    nota.textContent = (!manda
      ? "La lista completa del equipo la ve el administrador de la cuenta."
      : tope
        ? "Tu plan "+nombrePlan()+" permite "+tope+" usuario(s). Ahora van "+(gente||[]).length+"."
        : "Tu plan "+nombrePlan()+" no tiene límite de usuarios. Ahora van "+(gente||[]).length+".")
      + "  ·  Versión " + VERSION_SITIO;
  }
}
async function llamaEquipo(cuerpo){
  const r = await fetch(FUNCIONES + "invitar-usuario", {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+SESION.access_token},
    body: JSON.stringify(cuerpo)
  });
  const data = await leeJson(r);
  if(!r.ok) throw new Error(data.error || "No se pudo completar");
  return data;
}
document.addEventListener("click", async e=>{
  if(e.target.closest("#equipoInvitar")){
    const correo = (q("#equipoCorreo").value||"").trim();
    const nombre = (q("#equipoNombre").value||"").trim();
    const rolNuevo = q("#equipoRol").value;
    const b = e.target.closest("#equipoInvitar");

    /* Errores que se ven antes de molestar al servidor */
    const mio = String((PERFIL && PERFIL.correo) || (SESION && SESION.user && SESION.user.email) || "").toLowerCase();
    if(!correo || correo.indexOf("@") < 0){ alert("Escribe el correo de la persona que vas a dar de alta."); return; }
    if(correo.toLowerCase() === mio){
      alert("Ese es tu propio correo. Cada persona del equipo entra con el suyo: ponle a "+(nombre||"esta persona")+" un correo distinto.");
      return;
    }
    if(rolRaro()){
      alert("Antes de dar de alta a nadie hay que arreglar tu rol en la base: corre el SQL que aparece arriba en rojo. Mientras tanto la base de datos va a rechazar el alta.");
      return;
    }

    b.disabled = true; b.textContent = "Dando de alta…";
    try{
      const d = await llamaEquipo({accion:"invitar", correo, nombre, rol:rolNuevo});
      q("#equipoCorreo").value = ""; q("#equipoNombre").value = "";
      q("#equipoAviso").hidden = false;
      q("#equipoAviso").innerHTML = "Listo. Pásale estos datos a <b>"+d.correo+"</b>:<br>"+
        "Contraseña temporal: <b style='font-family:monospace;font-size:15px'>"+d.temporal+"</b><br>"+
        "<span style='font-size:12px'>Que entre y la cambie desde “Olvidé mi contraseña”. Este aviso no se vuelve a mostrar.</span>";
      await renderEquipo();
    }catch(err){
      const m = String(err.message||"");
      if(err.code === SIN_SERVIDOR){
        alert("Dar de alta a alguien necesita un servidor, y esta publicación no lo tiene.\n\n" +
              "Mientras tanto se hace desde Supabase: Authentication → Users → Add user con su " +
              "correo, y luego agregas su renglón en la tabla membresias con el rol que le toca.");
        return;
      }
      alert(m.indexOf("administrador") >= 0
        ? "La base de datos dice que no eres administrador de esta cuenta. Es el mismo problema del aviso rojo: corre sql/03-arreglo-roles.sql y vuelve a intentarlo."
        : m);
    }
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

  /* mis_empresas ya sabe cuál está activa y con qué rol entro en cada una.
     Si la base todavía no tiene la parte de varias empresas (06-superadmin.sql
     sin correr), esto viene vacío y seguimos con la de siempre. */
  const {data: empresas} = await SB.from("mis_empresas").select("*");
  EMPRESAS = empresas || [];
  const activa = EMPRESAS.find(e=> e.activa) || EMPRESAS[0] || null;

  if(activa){
    const {data: cuenta} = await SB.from("cuentas").select("*").eq("id", activa.id).maybeSingle();
    CUENTA = cuenta;
    PERFIL = Object.assign({}, perfil, {rol: activa.rol});   // el rol es de ESTA empresa
  } else {
    const {data: cuenta} = await SB.from("cuentas").select("*").eq("id", perfil.cuenta_id).maybeSingle();
    CUENTA = cuenta;
  }
  return !!CUENTA;
}

/* ---------- ¿Eres de Hey Makers? ----------
   La puerta de Makers Lab no es una dirección secreta: quien la adivinara
   entraría igual. Quien decide es la base. Si tu correo no está en `staff`,
   las vistas de Makers Lab te contestan cero renglones aunque las pidas a
   mano; esto solo se ahorra enseñarte un botón que no lleva a ningún lado. */
async function revisaStaff(){
  SOY_STAFF = false;
  /* Primero la pregunta directa. Si la base contesta un error —una regla
     mal puesta, por ejemplo— no nos quedamos con "no eres del equipo":
     volvemos a preguntar por la función, que es la que de verdad manda.
     Un error de configuración no debe verse igual que un "no". */
  try{
    const {data, error} = await SB.from("staff").select("rol").eq("id", SESION.user.id).maybeSingle();
    if(!error){ SOY_STAFF = !!data; }
    else {
      const r = await SB.rpc("es_staff");
      SOY_STAFF = r.data === true;
      if(r.data === true) console.warn("La tabla staff no se deja leer (" + error.message + "). Revisa la política staff_ver.");
    }
  }catch(e){
    try{ const r = await SB.rpc("es_staff"); SOY_STAFF = r.data === true; }catch(e2){ SOY_STAFF = false; }
  }
  const b = q("#btnLab");
  if(b) b.hidden = !SOY_STAFF;
}

/* ---------- El selector de empresa ---------- */
function pintaEmpresas(){
  const sel = q("#empresaSel"), caja = q("#perfilEmpresas");
  if(!sel) return;
  const varias = EMPRESAS.length > 1;
  if(caja) caja.hidden = !varias && !SOY_STAFF;   // con una sola empresa no estorba, salvo que seas tú
  if(caja && caja.hidden) return;

  sel.innerHTML = EMPRESAS.map(e=>
      '<option value="'+e.id+'"'+(e.activa?" selected":"")+'>'+escTxt(e.nombre||"Sin nombre")+'</option>'
    ).join("") + '<option value="__nueva">+ Abrir otra empresa…</option>';
}

async function cambiaEmpresa(destino){
  const sel = q("#empresaSel");
  if(destino === "__nueva"){
    const nombre = prompt("¿Cómo se llama la nueva empresa?\n\nVa completamente aparte: su propio catálogo, sus clientes y sus números. Nada se mezcla con la que ya tienes.");
    if(!nombre){ pintaEmpresas(); return; }
    if(sel) sel.disabled = true;
    const {error} = await SB.rpc("crear_empresa", {nombre});
    if(error){ alert("No se pudo crear: "+error.message); if(sel) sel.disabled = false; pintaEmpresas(); return; }
    location.reload();
    return;
  }
  if(sel) sel.disabled = true;
  const {error} = await SB.rpc("cambiar_empresa", {destino});
  if(error){
    alert(String(error.message).indexOf("NO_ERES_DE_ESA_EMPRESA") >= 0
      ? "No perteneces a esa empresa." : error.message);
    if(sel) sel.disabled = false; pintaEmpresas(); return;
  }
  location.reload();   // se recarga entera: el catálogo y todo lo demás son otros
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
  pintaEmpresas();
  revisaStaff();
  aplicaPlan();
  aplicaPermisos();
  renderEquipo();
  escuchaCuenta();
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
      /* El código se revisa antes de nada: si no sirve, no creamos el
         correo. Así puede corregirlo y volver a intentar con el mismo. */
      const escrito = (q("#authCodigo").value || "").trim();
      if(escrito){
        const bueno = await revisaCodigo(true);
        if(!bueno){ avisoAuth("Revisa el código del curso, o bórralo para crear tu cuenta sin él."); return; }
      }

      const {error} = await SB.auth.signUp({email:correo, password:pass, options:{data:{
        nombre: q("#authNombre").value.trim(), negocio: q("#authNegocio").value.trim() || "Mi taller"}}});
      if(error) throw error;
      const {data} = await SB.auth.getSession();
      if(!data.session){ avisoAuth("Te mandamos un correo para confirmar tu cuenta. Ábrelo y regresa a entrar.", true); return; }

      if(CODIGO_OK){
        try{
          const r = await SB.rpc("canjear_codigo", {p_codigo: CODIGO_OK});
          if(!(r.data && r.data.ok)) console.warn("El código no se pudo canjear:", r.data);
        }catch(e){ console.warn("El código no se pudo canjear:", e.message); }
      }
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

/* ---------- El código del curso ----------
   Se revisa ANTES de crear la cuenta. Dejar a alguien con el correo ya
   registrado y un código que no servía es la peor manera de empezar: no
   puede volver a intentarlo con ese correo y no entiende por qué. */
let CODIGO_OK = null;

async function revisaCodigo(mostrar){
  const campo = q("#authCodigo"), avi = q("#authCodMsg");
  if(!campo) return null;
  const txt = (campo.value || "").trim().toUpperCase();
  CODIGO_OK = null;
  if(!txt){ if(avi) avi.hidden = true; return null; }

  try{
    const {data, error} = await SB.rpc("revisa_codigo", {p_codigo: txt});
    if(error) throw error;
    if(data && data.ok){
      CODIGO_OK = txt;
      if(mostrar && avi){
        avi.hidden = false; avi.className = "authCodMsg bien";
        avi.textContent = "Código válido" + (data.curso ? " · " + data.curso : "") +
          ". Empiezas con plan " + (data.plan === "pro" ? "Pro" : data.plan === "basico" ? "Básico" : "Maker") +
          " por " + data.dias + " días.";
      }
      return data;
    }
    if(mostrar && avi){
      avi.hidden = false; avi.className = "authCodMsg mal";
      avi.textContent = (data && data.motivo) || "Ese código no sirve.";
    }
  }catch(e){
    /* Si la base todavía no tiene la parte de códigos, no estorbamos:
       quien no traiga código se registra igual. */
    if(mostrar && avi){ avi.hidden = false; avi.className = "authCodMsg mal";
      avi.textContent = "No pude revisar el código ahora mismo. Puedes crear tu cuenta y usarlo después."; }
  }
  return null;
}

const campoCod = q("#authCodigo");
if(campoCod){
  let reloj = null;
  campoCod.addEventListener("input", ()=>{
    clearTimeout(reloj);
    const avi = q("#authCodMsg"); if(avi) avi.hidden = true;
    reloj = setTimeout(()=> revisaCodigo(true), 500);
  });
  campoCod.addEventListener("blur", ()=> revisaCodigo(true));
}

q("#authProbar").addEventListener("click", async ()=>{
  avisoAuth("Probando la conexión con Supabase…", true);
  const d = await pruebaConexion();
  avisoAuth(d.msg, d.ok);
});

q("#authOlvide").addEventListener("click", async ()=>{
  const correo = q("#authMail").value.trim();
  if(!correo){ avisoAuth("Escribe tu correo arriba y vuelve a darle"); return; }
  /* De vuelta a ESTA página, no a la raíz del dominio: en GitHub Pages el
     sitio vive en una subcarpeta y la raíz es de otro. */
  const aqui = location.origin + location.pathname.replace(/[^/]*$/, "");
  await SB.auth.resetPasswordForEmail(correo, {redirectTo: aqui});
  avisoAuth("Te mandamos un correo para cambiar tu contraseña", true);
});

/* ---------- Encabezado de cuenta ---------- */
/* El nombre que se enseña: el que pusiste al registrarte y, si no hay,
   la parte del correo antes de la arroba. "carlosmora0593" se lee mejor
   que un correo completo cortado a la mitad. */
function nombreCorto(){
  const n = (PERFIL && PERFIL.nombre || "").trim();
  if(n) return n;
  const c = (PERFIL && PERFIL.correo) || (SESION && SESION.user && SESION.user.email) || "";
  return c.split("@")[0] || "Mi perfil";
}

function pintaPerfil(){
  const nom = nombreCorto();
  const ini = nom.trim().charAt(0) || "·";
  [["#perfilNombre", nom], ["#perfilNombre2", nom], ["#perfilAv", ini], ["#perfilAv2", ini]]
    .forEach(([sel, txt]) => { const el = q(sel); if(el) el.textContent = txt; });
  const v = q("#perfilVersion");
  if(v) v.textContent = VERSION_SITIO;
}

function abrePerfil(abrir){
  const m = q("#perfilMenu"), b = q("#perfilBtn");
  if(!m || !b) return;
  const va = abrir === undefined ? m.hidden : abrir;
  m.hidden = !va;
  b.setAttribute("aria-expanded", va ? "true" : "false");

  /* En teléfono el encabezado se parte en dos renglones y el botón acaba a
     la izquierda; colgar el menú de su borde derecho lo sacaba de la
     pantalla. Aquí lo pegamos a la pantalla y solo tomamos del botón la
     altura a la que empieza, que es lo único que de verdad varía. */
  const angosta = window.matchMedia("(max-width:620px)").matches;
  if(va && angosta){
    const r = b.getBoundingClientRect();
    const alto = Math.max(160, window.innerHeight - r.bottom - 24);
    m.style.cssText = "position:fixed;left:12px;right:12px;width:auto;top:" +
      Math.round(r.bottom + 8) + "px;max-height:" + Math.round(alto) + "px;overflow:auto";
  } else {
    m.style.cssText = "";
  }
}

/* Si gira el teléfono con el menú abierto, la posición calculada deja de
   valer. Más simple cerrarlo que recalcularlo. */
window.addEventListener("resize", ()=>{
  const m = q("#perfilMenu");
  if(m && !m.hidden) abrePerfil(false);
});

function pintaCuenta(){
  const dias = Math.max(0, Math.ceil((new Date(CUENTA.vence) - new Date())/86400000));
  /* Las cuentas viejas tienen plan 'prueba' a secas; las nuevas traen el
     plan real más la marca de cortesía. "Prueba Prueba" no se lo decimos
     a nadie. */
  const etiqueta = sinPlan()          ? "Sin plan"
                 : plan() === "prueba" ? "Prueba · " + dias + " día(s)"
                 : esPrueba()          ? "Prueba " + nombrePlan() + " · " + dias + " día(s)"
                 : "Plan " + nombrePlan();
  const chip = q("#cuentaPlan");
  chip.textContent = etiqueta;
  chip.style.color = vigente() ? "" : "var(--warn)";
  pintaPerfil();
  q("#cuentaMail").textContent = (PERFIL && PERFIL.correo) || SESION.user.email;
  q("#avisoPago").hidden = vigente();
  if(sinPlan()){
    q("#avisoPagoTxt").textContent =
      "Tu cuenta está lista, pero todavía no tiene plan. Puedes moverte y ver cómo funciona; " +
      "para guardar tu trabajo elige uno. Si tomaste un curso Hey Makers y traes código, escríbenos y te lo activamos.";
  } else if(!vigente()){
    q("#avisoPagoTxt").textContent =
      "Tu " + (esPrueba() ? "prueba" : "suscripción") + " terminó el " + String(CUENTA.vence).slice(0,10) +
      ". Puedes seguir consultando lo que ya tienes, pero para guardar cambios hay que " +
      (esPrueba() ? "elegir un plan." : "reactivarla.");
  } else if(esPrueba() && dias <= 5){
    q("#avisoPago").hidden = false;
    q("#avisoPagoTxt").textContent = "Te quedan " + dias + " día(s) de prueba. Elige un plan para no perder tu información.";
  }
}
/* El muro: lo único que ve una cuenta sin plan. No es una pantalla de
   castigo — es la que le dice cómo empezar, con las dos puertas que
   tiene: pagar, o traer el código de su curso. */
function muroSinPlan(){
  const muro = q("#sinPlanMuro");
  if(!muro) return;
  const lg = q("#muroLogo");
  if(lg && !lg.src && window.LOGO_MARCA) lg.src = window.LOGO_MARCA;
  const cerrado = sinPlan();
  muro.hidden = !cerrado;
  document.body.classList.toggle("sin-plan", cerrado);
}

function aplicaPlan(){
  if(typeof aplicaPermisos === "function") aplicaPermisos();
  muroSinPlan();
  document.querySelectorAll("[data-solo-pro]").forEach(el=> el.hidden = !esPro());
  document.querySelectorAll("[data-solo-maker]").forEach(el=> el.hidden = !esMaker());
  /* Los datos fiscales no son una pestaña que se pueda esconder con un
     atributo: son dos bloques dentro de Ajustes que el cotizador pinta.
     Cuando tu equipo le sube el plan a alguien desde Makers Lab, esto tiene
     que abrirse en el momento, sin recargar. */
  if(typeof window.__candadoFiscal === "function") window.__candadoFiscal();
}

q("#btnSalir").addEventListener("click", async ()=>{ await SB.auth.signOut(); location.reload(); });

const selEmp = q("#empresaSel");
if(selEmp) selEmp.addEventListener("change", e=> cambiaEmpresa(e.target.value));

const btnLab = q("#btnLab");
if(btnLab) btnLab.addEventListener("click", ()=>{ location.href = "lab.html"; });

/* ---------- El menú de perfil ---------- */
const btnPerfil = q("#perfilBtn");
if(btnPerfil) btnPerfil.addEventListener("click", e=>{ e.stopPropagation(); abrePerfil(); });

/* Se cierra al hacer clic fuera, con Escape, y al elegir cualquier cosa:
   un menú que se queda abierto tapando la pantalla es una molestia. */
document.addEventListener("click", e=>{
  const m = q("#perfilMenu");
  if(m && !m.hidden && !e.target.closest(".perfilBox")) abrePerfil(false);
});
document.addEventListener("keydown", e=>{
  if(e.key === "Escape"){ const m = q("#perfilMenu"); if(m && !m.hidden) abrePerfil(false); }
});
const listaPerfil = q("#perfilMenu");
if(listaPerfil) listaPerfil.addEventListener("click", e=>{
  if(e.target.closest("#perfilEmpresas")) return;      // elegir empresa no debe cerrarlo
  if(e.target.closest("button")) abrePerfil(false);
});

/* Llevar a una pestaña y, si hace falta, a una tarjeta dentro de ella.
   Ajustes ya no está en el menú de secciones —vive en el de perfil— así que
   su botón está oculto; aquí lo usamos igual, que para eso sigue existiendo. */
function vaA(pestana, ancla){
  const b = document.querySelector('#tabs [data-tab="' + pestana + '"]');
  if(!b){ alert("Esa sección no está disponible con tu plan o tu rol."); return; }
  b.click();
  if(ancla) setTimeout(()=>{
    const el = q(ancla);
    if(el) el.scrollIntoView({behavior:"smooth", block:"center"});
  }, 260);
}
const btnEquipo = q("#btnEquipo");
if(btnEquipo) btnEquipo.addEventListener("click", ()=> vaA("set", "#equipoCaja"));
const btnAjustes = q("#btnAjustes");
if(btnAjustes) btnAjustes.addEventListener("click", ()=> vaA("set"));
q("#btnPlanes").addEventListener("click", ()=> abrePlanes());
q("#avisoPagoBtn").addEventListener("click", ()=> abrePlanes());

/* ---------- Los botones del muro ---------- */
/* El muro abre el diagnóstico, no la lista de precios. Quien llega aquí
   casi nunca sabe cuál plan le toca, y tres columnas de características
   no se lo van a decir. Si prefiere ver precios y ya, el cuestionario
   tiene su salida en cada pantalla. */
if(q("#muroPlanes")) q("#muroPlanes").addEventListener("click", ()=>{
  if(typeof diagAbre === "function") diagAbre(); else abrePlanes();
});

if(q("#muroCodigo")) q("#muroCodigo").addEventListener("click", ()=>{
  const caja = q("#muroCanje");
  caja.hidden = !caja.hidden;
  if(!caja.hidden) q("#muroCodigoTxt").focus();
});

async function canjeaDesdeMuro(){
  const campo = q("#muroCodigoTxt"), msg = q("#muroMsg");
  const txt = (campo.value || "").trim().toUpperCase();
  const di = (t, clase)=>{ msg.hidden = false; msg.className = "muroMsg " + clase; msg.textContent = t; };
  if(txt.length < 4){ di("Escribe el código que te dieron en el curso.", "mal"); return; }
  di("Revisando…", "");
  try{
    const {data, error} = await SB.rpc("canjear_codigo", {p_codigo: txt});
    if(error) throw error;
    if(!data || !data.ok){ di((data && data.motivo) || "Ese código no se pudo usar.", "mal"); return; }
    di("¡Listo! Tu prueba quedó activa.", "bien");
    /* No recargamos la página: refrescamos la cuenta y el muro se quita
       solo. Quien acaba de activar su curso no tiene por qué ver cómo se
       reinicia todo. */
    setTimeout(async ()=>{ await refrescaCuenta(false); if(typeof toast==="function") toast("Tu prueba quedó activa"); }, 600);
  }catch(e){
    di((e && e.message) || "No se pudo activar. Intenta de nuevo.", "mal");
  }
}
if(q("#muroCanjea")) q("#muroCanjea").addEventListener("click", canjeaDesdeMuro);
if(q("#muroCodigoTxt")) q("#muroCodigoTxt").addEventListener("keydown", e=>{ if(e.key === "Enter") canjeaDesdeMuro(); });

/* ---------- Planes y cobro ---------- */
const fechaLarga = d => {
  try{ return new Date(d).toLocaleDateString("es-MX", {day:"numeric", month:"long", year:"numeric"}); }
  catch(e){ return String(d).slice(0,10); }
};

/* ---------- Tu suscripción ----------
   Lo que se puede decir con certeza va primero; lo que depende de un
   servidor que aquí no existe se dice tal cual, sin botones que no llevan
   a ningún lado. Prometer un "cambiar tarjeta" que no funciona es peor que
   explicar por qué todavía no está. */
function pintaSuscripcion(){
  const caja = q("#suscResumen"); if(!caja) return;
  const dias = Math.max(0, Math.ceil((new Date(CUENTA.vence) - new Date())/86400000));
  const enPrueba = esPrueba();
  const viva = vigente();

  /* Una cuenta sin plan no es una suscripción vencida: nunca empezó.
     Decirle "se terminó" a quien acaba de registrarse confunde. */
  if(sinPlan()){
    caja.className = "suscResumen";
    caja.innerHTML =
      '<div><span class="grande">Sin plan</span>' +
      '<div style="font-size:13px;color:var(--ink-2);margin-top:2px">' +
      'Tu cuenta existe y puedes moverte por ella. Para guardar tu trabajo hace falta contratar.' +
      '</div></div>';
    q("#suscPago").innerHTML = '<div class="suscFila">Todavía no hay nada que cobrar. ' +
      'Elige un plan en la pestaña de al lado y ahí se define la forma de pago.</div>';
    q("#suscFactura").innerHTML = '<div class="suscFila">Cuando contrates, las facturas salen con ' +
      'los datos fiscales que cargues en Ajustes.</div>';
    q("#suscBaja").innerHTML = '<div class="suscFila">No hay nada que dar de baja. ' +
      'Tu cuenta y tu información se quedan donde están.</div>';
    return;
  }

  caja.className = "suscResumen" + (viva ? "" : " vencida");
  caja.innerHTML =
    '<div><span class="grande">' + escTxt(nombrePlan()) + '</span>' +
      '<div style="font-size:13px;color:var(--ink-2);margin-top:2px">' +
        (viva
          ? (enPrueba ? "Prueba de cortesía · sin cargo" : "Suscripción activa")
          : "Se terminó. Puedes seguir consultando lo que ya tienes, pero no guardar cambios.") +
      '</div></div>' +
    '<div class="aLado">' + (viva ? (enPrueba ? "Te quedan" : "Se renueva el") : "Terminó el") +
      '<b>' + (viva && enPrueba ? dias + " día(s)" : fechaLarga(CUENTA.vence)) + '</b></div>';

  /* --- Forma de pago --- */
  const conMP = !!(CUENTA.mp_preapproval_id);
  q("#suscPago").innerHTML = '<div class="suscFila">' + (
    conMP
      ? "Pagas por Mercado Pago, con cargo automático " +
        (CUENTA.ciclo === "anual" ? "cada año" : "cada mes") + ". La tarjeta y los recibos se " +
        "cambian desde tu propia cuenta de Mercado Pago: entra a Suscripciones y busca Hey Makers." +
        '<button class="btn sm" id="suscMP" type="button">Abrir Mercado Pago</button>'
      : enPrueba
        ? "Todavía no hay nada que cobrar: estás en la prueba y no pediste tarjeta. " +
          "Cuando elijas un plan te pedimos la forma de pago en ese momento."
        : "Esta cuenta no tiene un cargo automático dado de alta. El plan lo activó " +
          "Hey Makers a mano, así que la renovación también se hace hablando con ellos."
  ) + '</div>';

  /* --- Facturación --- */
  const par = (typeof P !== "undefined" && P) ? P : {};
  const f = !!par.rfc;
  q("#suscFactura").innerHTML = '<div class="suscFila">' + (
    f ? "Tus datos fiscales están cargados en Ajustes, así que las facturas salen a nombre de <b>" +
        escTxt(par.razon || par.rfc) + "</b>."
      : "Todavía no cargas tus datos fiscales. Ponlos en Ajustes → Datos de tu empresa y las " +
        "facturas salen con ellos."
  ) + '<button class="btn sm" id="suscDatos" type="button">Ir a Ajustes</button></div>';

  /* --- Baja --- */
  q("#suscBaja").innerHTML = '<div class="suscFila">' + (
    conMP
      ? "Para dar de baja la suscripción, cancélala en Mercado Pago. Tu plan sigue funcionando " +
        "hasta que termine el periodo que ya pagaste, y tu información se queda donde está."
      : "No hay ningún cargo automático corriendo, así que no hay nada que cancelar. " +
        "Al vencer, la cuenta pasa a solo consulta y tus datos se quedan intactos."
  ) + '</div>';

  const mp = q("#suscMP");
  if(mp) mp.addEventListener("click", ()=>{
    const v = window.open("https://www.mercadopago.com.mx/subscriptions", "_blank", "noopener");
    if(!v) alert("Tu navegador bloqueó la ventana. Entra a mercadopago.com.mx → Suscripciones.");
  });
  const dt = q("#suscDatos");
  if(dt) dt.addEventListener("click", ()=>{ q("#modalPlanes").hidden = true; vaA("set"); });
}

function abrePlanes(){
  pintaSuscripcion();
  const ciclo = q("#cicloSel").value;
  q("#planesGrid").innerHTML = Object.keys(CONFIG.PLANES).map(k=>{
    const p = CONFIG.PLANES[k], precio = ciclo==="anual" ? p.anual : p.mensual;
    const actual = plan()===k && vigente();
    return '<div class="planCard'+(p.destacado?" destacado":"")+'" data-plan="'+k+'">'+
      '<h3>'+p.nombre+'</h3><p class="para">'+p.para+'</p>'+
      '<div class="precio">$'+precio.toLocaleString("es-MX")+'<span> MXN / '+(ciclo==="anual"?"año":"mes")+'</span></div>'+
      '<ul>'+p.incluye.map(i=>"<li>"+i+"</li>").join("")+'</ul>'+
      '<button class="btn '+(p.destacado?"primary":"")+'" data-contratar="'+k+'"'+(actual?" disabled":"")+'>'+
      (actual?"Es tu plan actual":"Suscribirme")+'</button></div>';
  }).join("");
  q("#modalPlanes").hidden = false;
}
q("#cicloSel").addEventListener("change", abrePlanes);

const tabsPlan = document.querySelector(".planTabs");
if(tabsPlan) tabsPlan.addEventListener("click", e=>{
  const b = e.target.closest("[data-plantab]"); if(!b) return;
  const cual = b.dataset.plantab;
  tabsPlan.querySelectorAll("[data-plantab]").forEach(x=>
    x.setAttribute("aria-selected", x === b ? "true" : "false"));
  document.querySelectorAll("[data-planpanel]").forEach(p=> p.hidden = p.dataset.planpanel !== cual);
});
q("#planesCerrar").addEventListener("click", ()=> q("#modalPlanes").hidden = true);

q("#planesGrid").addEventListener("click", async e=>{
  const b = e.target.closest("[data-contratar]"); if(!b) return;

  b.disabled = true; b.textContent = "Abriendo Mercado Pago…";
  try{
    const r = await fetch(FUNCIONES + "crear-suscripcion", {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+SESION.access_token},
      body: JSON.stringify({plan:b.dataset.contratar, ciclo:q("#cicloSel").value})
    });
    const data = await leeJson(r);
    if(!r.ok || !data.init_point) throw new Error(data.error || "No se pudo crear la suscripción");
    /* Antes de irnos a Mercado Pago, dejamos anotado qué eligió. Comparar
       eso contra lo que le sugerimos es lo que dice si las preguntas del
       diagnóstico sirven o hay que cambiarlas. */
    if(typeof window.__diagEligio === "function"){
      try{ await window.__diagEligio(b.dataset.contratar); }catch(e){}
    }
    location.href = data.init_point;
  }catch(err){
    b.disabled = false; b.textContent = "Suscribirme";
    const plan = (CONFIG.PLANES[b.dataset.contratar] || {}).nombre || b.dataset.contratar;
    alert(err.code === SIN_SERVIDOR
      ? "El cobro en línea todavía no está conectado en esta publicación.\n\n" +
        "Para contratar el plan " + plan + ", escríbele a Hey Makers: te lo activan " +
        "y sigues trabajando con todo lo que ya tienes, sin perder nada."
      : "No se pudo abrir el cobro: " + err.message);
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

/* Si config.js todavía no tiene las llaves, SB no existe: no le pedimos nada,
   y dejamos que arrancaSesion pinte el aviso de qué falta configurar. */
/* ---------- Que los cambios del panel lleguen solos ----------
   Cuando Hey Makers cambia tu plan desde Makers Lab, no tienes por qué
   recargar la página ni enterarte al día siguiente. Tres caminos, del más
   rápido al más terco, porque uno solo siempre falla en algún navegador:
     1. Tiempo real: la base avisa en cuanto cambia la fila.
     2. Al volver a la pestaña: el caso de "me lo activaron por teléfono
        mientras yo miraba otra cosa".
     3. Cada dos minutos, por si los dos anteriores no llegaron. */
function huella(){ return CUENTA ? [CUENTA.plan, CUENTA.estado, CUENTA.vence, CUENTA.es_prueba].join("|") : ""; }

async function refrescaCuenta(avisar){
  if(!SESION || !CUENTA) return;
  const antes = huella();
  try{ await cargaCuenta(); }catch(e){ return; }
  if(huella() === antes) return;

  pintaCuenta();
  pintaEmpresas();
  aplicaPlan();
  aplicaPermisos();

  if(avisar !== false && typeof toast === "function"){
    toast(sinPlan()      ? "Tu plan cambió: la cuenta quedó sin plan"
        : esPrueba()     ? "Tu cuenta quedó en prueba de " + nombrePlan()
        : "Tu plan cambió a " + nombrePlan());
  }
}

function escuchaCuenta(){
  if(!CUENTA) return;
  try{
    SB.channel("mi-cuenta")
      .on("postgres_changes",
          {event:"UPDATE", schema:"public", table:"cuentas", filter:"id=eq." + CUENTA.id},
          ()=> refrescaCuenta())
      .subscribe();
  }catch(e){ /* sin tiempo real seguimos con los otros dos caminos */ }

  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) refrescaCuenta(); });
  setInterval(()=> refrescaCuenta(), 120000);

  escuchaSoporte();
}

/* Cuando soporte contesta un reporte desde Makers Lab, escribe en el
   documento de esta cuenta. Esto se entera en ese momento y le prende el
   punto rojo al botón de ayuda, sin que nadie recargue nada: el cliente
   pidió ayuda y le contestaron; enterarse media hora después, cuando
   vuelva a abrir el panel por su cuenta, es tarde.

   El botón de ayuda y el panel son del cotizador, no de este archivo, así
   que aquí solo se toca el timbre: quien sabe repintar es él. */
function escuchaSoporte(){
  if(!CUENTA) return;
  const timbre = ()=>{ if(typeof window.__recargaSoporte === "function") window.__recargaSoporte(); };
  try{
    SB.channel("mi-soporte")
      .on("postgres_changes",
          {event:"*", schema:"public", table:"documentos", filter:"cuenta_id=eq." + CUENTA.id},
          (m)=>{ const f = m.new || m.old || {}; if(f.coleccion === "soporte") timbre(); })
      .subscribe();
  }catch(e){ /* sin tiempo real, queda el de abajo */ }
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) timbre(); });
}

if(SB) SB.auth.onAuthStateChange((evt)=>{ if(evt==="SIGNED_OUT") location.reload(); });
arrancaSesion().then(revisaTrasPago);
