(()=>{"use strict";
const P={
  taller:{name:"Nuvoor Imprenta",example:"https://nuvoor.mx/#imprenta",icon:"✂",sub:"Cotiza y organiza producción",href:"./taller.html"},
  restaurant:{name:"Nuvoor Restaurant",example:"https://nuvoor.mx/#restaurant",icon:"♨",sub:"Mesas, comandas y caja",href:"./restaurante/"},
  tiendita:{name:"Nuvoor Store",example:"https://nuvoor.mx/#store",icon:"▤",sub:"Mostrador, caja e inventario",href:"./tiendita/"}
};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],params=new URLSearchParams(location.search),validos=Object.keys(P);
let sb=null,sesion=null,negocios=[],cuenta=null,productos=[],modo="entrar",requested=[],negociosDisponible=false,skipAutoOpenOnce=false;
function esc(s){return String(s||"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function lista(xs){return [...new Set((Array.isArray(xs)?xs:[]).filter(x=>validos.includes(x)))];}
function show(id){["#authPanel","#accountPanel","#loadingPanel"].forEach(s=>$(s).hidden=s!==id);}
function message(t,k=""){const n=$("#msg");n.textContent=t;n.className="msg"+(k?" "+k:"");}
function detalleError(e){const code=String(e&&e.code||"").trim(),msg=String(e&&e.message||"").trim().replace(/[\r\n\t]+/g," ").slice(0,240);return [code,msg].filter(Boolean).join(" · ")||"La base no devolvió más detalles.";}
function limpiaSesionLocal(){try{const project=new URL(CONFIG.SUPABASE_URL).hostname.split(".")[0];localStorage.removeItem("sb-"+project+"-auth-token");}catch(_){}}
function setMode(k){if(k==="alta")k="entrar";modo=k;const alta=k==="alta";$$('[data-mode]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===k)));$("#signupFields").hidden=!alta;$("#personName").required=alta;$("#businessName").required=alta;$("#password").autocomplete=alta?"new-password":"current-password";$("#authTitle").textContent=alta?"Empieza gratis con Nuvoor":"Entra a Nuvoor";$("#authSub").textContent=alta?"Crea tu cuenta y abre el POS que elegiste.":"Accede a los productos de tu cuenta.";$("#submit").textContent=alta?"Crear cuenta y probar 15 días":"Iniciar sesión";message("");if(alta)seleccionInicial();}
function seleccionInicial(){const pick=params.get("producto"),defaults=pick&&P[pick]?[pick]:["taller"];$$('input[name="producto"]').forEach(x=>x.checked=defaults.includes(x.value));actualizaSeleccion();}
function actualizaSeleccion(){requested=$$('input[name="producto"]:checked').map(x=>x.value).slice(0,1);}
function productosDe(row,detail){return lista(row&&row.productos).length?lista(row.productos):lista([row&&row.producto,detail&&detail.producto]).length?lista([row&&row.producto,detail&&detail.producto]):lista(detail&&detail.productos);}
async function leerEmpresas(){
  const errores=[];let rows=[];
  try{const r=await sb.from("mis_empresas").select("*");if(r.error)errores.push(r.error);else rows=r.data||[];}catch(e){errores.push(e);}
  try{const r=await sb.rpc("nuvoor_negocios_disponible");negociosDisponible=!r.error&&r.data===true;}catch(_){negociosDisponible=false;}
  let perfil=null;
  try{const r=await sb.from("perfiles").select("cuenta_id,cuenta_activa").eq("id",sesion.user.id).maybeSingle();if(r.error)errores.push(r.error);else perfil=r.data||null;}catch(e){errores.push(e);}
  if(!rows.length){
    let id=null;try{const r=await sb.rpc("mi_cuenta");if(r.error)errores.push(r.error);else id=Array.isArray(r.data)?r.data[0]:r.data;}catch(e){errores.push(e);}
    id=id||perfil&& (perfil.cuenta_activa||perfil.cuenta_id);
    if(id)rows=[{id,activa:true}];
    if(!rows.length){try{const r=await sb.from("membresias").select("cuenta_id,rol").eq("usuario_id",sesion.user.id);if(r.error)errores.push(r.error);else rows=(r.data||[]).map(x=>({id:x.cuenta_id,rol:x.rol,activa:x.cuenta_id===(perfil&&perfil.cuenta_activa)}));}catch(e){errores.push(e);}}
  }
  const salida=[];
  for(const row of rows){
    if(!row||!row.id)continue;
    let detail=null;
    try{const r=await sb.from("cuentas").select("*").eq("id",row.id).maybeSingle();if(!r.error)detail=r.data||null;else errores.push(r.error);}catch(e){errores.push(e);}
    const productList=productosDe(row,detail);
    salida.push(Object.assign({},detail||{},row,{id:row.id,nombre:(detail&&detail.nombre)||row.nombre||"Mi negocio",producto:(detail&&detail.producto)||row.producto||productList[0]||"",productos:productList,activa:!!row.activa,rol:row.rol||""}));
  }
  negocios=salida;
  if(!negocios.length){const cause=errores.find(Boolean),e=new Error("No pudimos abrir la cuenta de este negocio.");e.code=cause&&cause.code||"CUENTA_NO_ENCONTRADA";e.detail=detalleError(cause);throw e;}
  return negocios;
}
function urlProducto(k,id){const url=new URL(P[k].href,location.href);if(k!=="taller"&&id)url.searchParams.set("cuenta",id);if(params.get("app")==="android")url.searchParams.set("app","android");return url.href;}
async function abreNegocio(k,n){
  if(!P[k]||!n)return;
  if(k==="taller"&&!n.activa){
    const {error}=await sb.rpc("cambiar_empresa",{destino:n.id});
    if(error){const note=$("#businessNotice");note.hidden=false;note.textContent="No se pudo abrir Nuvoor Imprenta: "+detalleError(error)+". Revisa que sql/19-negocios-por-correo.sql esté aplicado.";return;}
  }
  location.replace(urlProducto(k,n.id));
}
function vigencia(n){return n&&n.estado==="activa"&&new Date(n.vence)>new Date();}
function badgeProductos(n){return n.productos.length?n.productos.map(k=>P[k].name.replace("Nuvoor ","")).join(" · "):"Sistema por identificar";}
function renderNegocio(n,productoSolicitado){
  const products=productoSolicitado&&n.productos.includes(productoSolicitado)?[productoSolicitado]:n.productos,supported=products.length>0;
  const buttons=supported?products.map(k=>'<button class="businessOpen" type="button" data-open-product="'+k+'" data-business="'+esc(n.id)+'">Abrir '+esc(P[k].name.replace("Nuvoor ",""))+' →</button>').join(""):'<small class="businessMissing">Falta ejecutar sql/19-negocios-por-correo.sql para identificar este negocio.</small>';
  return '<article class="businessCard"><div class="businessHead"><span class="businessIcon" aria-hidden="true">'+(supported?products.map(k=>P[k].icon).join(" "):"•")+'</span><div><strong>'+esc(n.nombre)+'</strong><small>'+esc(badgeProductos(n))+' · '+esc(n.rol||"miembro")+'</small></div></div><div class="businessActions">'+buttons+(supported?'<button class="businessLicense" type="button" data-license-business="'+esc(n.id)+'">Ver licencias</button>':"")+'</div></article>';
}
function pintaCuenta(){
  const preventDirect=skipAutoOpenOnce;skipAutoOpenOnce=false;
  show("#accountPanel");$("#accountTitle").textContent=negocios.length>1?"Tus negocios":(negocios[0].nombre||"Tu cuenta Nuvoor");$("#accountEmail").textContent=sesion.user.email||"";
  const requestedProduct=params.get("producto"),matching=negocios.flatMap(n=>n.productos.filter(k=>!requestedProduct||k===requestedProduct).map(k=>({n,k})));
  if(!preventDirect&&requestedProduct&&P[requestedProduct]&&matching.length===1&&!params.has("gestion")&&!params.has("planes")&&!params.has("pago")){abreNegocio(matching[0].k,matching[0].n);return;}
  const singleLegacy=negocios.length===1&&negocios[0].productos.length===1;
  if(!preventDirect&&singleLegacy&&!requestedProduct&&!params.has("gestion")&&!params.has("planes")&&!params.has("pago")){abreNegocio(negocios[0].productos[0],negocios[0]);return;}
  const active=negocios.find(n=>n.activa)||negocios[0],days=Math.max(0,Math.ceil((new Date(active.vence)-new Date())/86400000));
  $("#accountStatus").innerHTML=vigencia(active)?'<strong>'+(active.plan==="prueba"?"Prueba gratis activa":"Licencia activa")+'</strong>'+(active.plan==="prueba"?"Te quedan "+days+" día(s), sin tarjeta.":"El negocio seleccionado conserva su licencia."):'<strong>Activa una licencia para seguir</strong>Tu información se conserva.';
  const pane=$("#productOptions"),businessesView=requestedProduct&&P[requestedProduct]?negocios.filter(n=>!n.productos.length||n.productos.includes(requestedProduct)):negocios;
  pane.innerHTML='<p class="sub">'+(requestedProduct&&P[requestedProduct]?"Elige un negocio de "+P[requestedProduct].name+".":negocios.length>1?"Elige con qué negocio quieres trabajar.":negocios[0].productos.length>1?"Esta cuenta antigua conserva varios POS. Elige uno para continuar.":"Abre el sistema de tu negocio.")+'</p><div class="businessGrid">'+businessesView.map(n=>renderNegocio(n,requestedProduct&&P[requestedProduct]?requestedProduct:"")).join("")+'</div><p id="businessNotice" class="notice" hidden></p><div class="addBusinessRow"><button class="plain addBusinessButton" id="showAddBusiness" type="button">＋ Agregar un negocio</button></div>';
  $("#addBusinessPanel").hidden=true;
  pane.querySelectorAll("[data-open-product]").forEach(b=>b.addEventListener("click",()=>{const n=negocios.find(x=>x.id===b.dataset.business);abreNegocio(b.dataset.openProduct,n);}));
  pane.querySelectorAll("[data-license-business]").forEach(b=>b.addEventListener("click",()=>{cuenta=negocios.find(x=>x.id===b.dataset.licenseBusiness);productos=cuenta?cuenta.productos:[];pintaLicencias();$("#licensePanel").scrollIntoView({behavior:"smooth",block:"start"});}));
  $("#showAddBusiness").addEventListener("click",()=>{$("#addBusinessPanel").hidden=!$("#addBusinessPanel").hidden;});
  if(requestedProduct&&P[requestedProduct]&&!matching.length){const note=$("#businessNotice");note.hidden=false;note.textContent="No tienes un negocio de "+P[requestedProduct].name+" todavía. Agrégalo aquí; cada sistema tendrá su propia cuenta.";}
  if(!negociosDisponible){const note=$("#businessNotice");note.hidden=false;note.textContent="Para crear nuevos negocios y abrir Restaurant o Store separados, falta ejecutar sql/19-negocios-por-correo.sql desde el Lab → Base de datos.";}
  if(params.get("pago")==="ok")$("#accountStatus").innerHTML='<strong>Pago recibido</strong>Mercado Pago avisó a Nuvoor. La licencia puede tardar unos segundos en reflejarse.';
  if(params.has("planes")||params.has("gestion")||params.has("pago")){cuenta=matching[0]?matching[0].n:active;productos=cuenta.productos;pintaLicencias();}
}
function pintaLicencias(){
  if(!cuenta){$("#licensePanel").hidden=true;return;}
  $("#licensePanel").hidden=false;
  const host=$("#licenseProducts"),notice=$("#paymentNotice"),cards=$("#licenseCards");
  if(productos.length>1){host.innerHTML='<span class="help">Cuenta anterior · '+esc(badgeProductos(cuenta))+'</span>';cards.innerHTML="";notice.hidden=false;notice.textContent="Esta cuenta antigua conserva varios POS. Para cambiar sus licencias, primero organiza cada sistema en su propia cuenta.";return;}
  const producto=productos[0]||cuenta.producto||"taller";host.innerHTML='<span class="help">'+esc(P[producto].name)+' · '+esc(cuenta.nombre||"este negocio")+'</span>';
  const esImprenta=producto==="taller",planes=esImprenta?[
    {id:"basico",name:"Básico",price:98,description:"$98 al mes los primeros 3 meses; después $199",ready:false},
    {id:"maker",name:"Maker",price:449,info:"Hasta 3 usuarios · compras e inventario",ready:true},
    {id:"pro",name:"Pro",price:899,info:"Usuarios sin límite · caja y reportes · incluye hasta 4 sucursales",ready:true}
  ]:[
    {id:"basico",name:"Estándar",price:98,description:"$98 al mes los primeros 3 meses; después $199",ready:false},
    {id:"multiempresa",name:"Multiempresa",price:899,info:"Hasta 4 sucursales del mismo sistema",ready:false}
  ];
  $("#licenseIntro").textContent=esImprenta?"Pro incluye hasta 4 sucursales de Imprenta.":"Cada licencia cubre un sistema. Multiempresa es para hasta 4 sucursales de ese mismo sistema.";
  cards.innerHTML=planes.map(x=>'<article class="licCard"><b>'+x.name+'</b><strong>$'+x.price.toLocaleString("es-MX")+' <small>MXN / mes</small></strong><small>'+(x.description||x.info)+'</small><button type="button" '+(x.ready&&cuenta.activa?'data-plan="'+x.id+'"':x.ready?'disabled aria-label="Abre este negocio para cambiar el plan"':'disabled aria-label="'+x.name+': próximamente"')+'>'+(x.ready?(cuenta.activa?'Contratar':'Abre este negocio primero'):'Próximamente')+'</button></article>').join("");
  cards.querySelectorAll("[data-plan]").forEach(b=>b.addEventListener("click",()=>contrata(b.dataset.plan,[producto])));
  if(cuenta.mp_preapproval_id){notice.hidden=false;notice.textContent="Hay una suscripción de Mercado Pago registrada. Para cambiar de licencia sin generar otro cobro, cancela la actual en Mercado Pago y después vuelve aquí.";}
  else if(!cuenta.activa){notice.hidden=false;notice.textContent="Para cambiar una licencia, abre primero este negocio desde Tus negocios. Así el cobro se aplica a la cuenta correcta.";}
  else if(planes.some(x=>!x.ready)){notice.hidden=false;notice.textContent=esImprenta?"La promoción estará disponible cuando se actualicen los cobros. Pro ya incluye hasta 4 sucursales.":"La promoción y Multiempresa estarán disponibles cuando se actualicen los cobros y las sucursales.";}
  else notice.hidden=true;
}
async function contrata(plan,chosen){const b=$("#licenseCards").querySelector('[data-plan="'+plan+'"]');if(!b)return;b.disabled=true;b.textContent="Abriendo Mercado Pago…";try{const {data}=await sb.auth.getSession(),url=String(CONFIG.SUPABASE_URL).replace(/\/+$/,""),r=await fetch(url+"/functions/v1/crear-suscripcion",{method:"POST",headers:{"Content-Type":"application/json","apikey":CONFIG.SUPABASE_ANON_KEY,"Authorization":"Bearer "+data.session.access_token},body:JSON.stringify({plan,ciclo:"mensual",productos:chosen})});let d={};try{d=await r.json();}catch(_){}if(!r.ok||!d.init_point)throw new Error(d.error||"No se pudo iniciar el pago.");location.assign(d.init_point);}catch(e){b.disabled=false;b.textContent="Contratar";const n=$("#paymentNotice");n.hidden=false;n.textContent=e.message;}}
async function agregaNegocio(e){e.preventDefault();const nombre=$("#newBusinessName").value.trim(),producto=$("#newBusinessProduct").value,b=$("#createBusiness");if(!nombre){$("#newBusinessMessage").textContent="Escribe el nombre del negocio.";return;}if(!negociosDisponible){$("#newBusinessMessage").textContent="Falta ejecutar sql/19-negocios-por-correo.sql desde el Lab → Base de datos.";return;}b.disabled=true;b.textContent="Creando…";$("#newBusinessMessage").textContent="";try{const r=await sb.rpc("crear_negocio",{nombre,producto});if(r.error)throw r.error;$("#newBusinessName").value="";await leerEmpresas();skipAutoOpenOnce=true;pintaCuenta();$("#addBusinessPanel").hidden=true;}catch(err){$("#newBusinessMessage").textContent=detalleError(err);}finally{b.disabled=false;b.textContent="Crear negocio";}}
async function entra(session){sesion=session;show("#loadingPanel");try{await leerEmpresas();$("#accountErrorDetail").hidden=true;$("#accountErrorDetail").textContent="";pintaCuenta();}catch(e){show("#accountPanel");$("#accountTitle").textContent="No pudimos abrir tu cuenta";$("#accountEmail").textContent=sesion.user.email||"";$("#accountStatus").textContent=e.message||"No pudimos abrir la cuenta de este negocio.";const d=$("#accountErrorDetail");d.textContent=e.detail||detalleError(e);d.hidden=false;$("#productOptions").innerHTML="";}}
async function envia(e){e.preventDefault();const alta=modo==="alta",email=$("#email").value.trim(),password=$("#password").value;if(alta){actualizaSeleccion();if(!requested.length){message("Selecciona el POS que quieres probar.","error");return;}}
  const b=$("#submit");b.disabled=true;b.textContent=alta?"Creando tu cuenta…":"Entrando…";message("");
  try{let data,error;if(alta){({data,error}=await sb.auth.signUp({email,password,options:{data:{nombre:$("#personName").value.trim(),negocio:$("#businessName").value.trim()||P[requested[0]].name,producto:requested[0],productos:requested}}}));}else{({data,error}=await sb.auth.signInWithPassword({email,password}));}if(error)throw error;if(!data.session){message("Te mandamos un correo para confirmar tu cuenta. Después vuelve aquí e inicia sesión para abrir tu POS.","good");setMode("entrar");$("#email").value=email;$("#password").value="";b.disabled=false;b.textContent="Iniciar sesión";return;}await entra(data.session);}
  catch(e){message(e.message||"No se pudo abrir la cuenta.","error");b.disabled=false;b.textContent=alta?"Crear cuenta y probar 15 días":"Iniciar sesión";}}
async function init(){show("#loadingPanel");if(!window.CONFIG||!window.supabase){show("#authPanel");message("Falta cargar la conexión de Nuvoor. Intenta actualizar la página.","error");return;}sb=window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY);const hint=$("#multiHint");if(hint)hint.textContent="Cada negocio es una cuenta independiente; sus datos no se mezclan.";$$('[data-mode]').forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));$("#authForm").addEventListener("submit",envia);$("#addBusinessForm").addEventListener("submit",agregaNegocio);$$('input[name="producto"]').forEach(x=>x.addEventListener("change",actualizaSeleccion));$("#logout").addEventListener("click",async()=>{try{await sb.auth.signOut();}catch(_){}finally{limpiaSesionLocal();location.replace("./acceso.html");}});
  const {data,error}=await sb.auth.getSession();if(error){show("#authPanel");message("No pudimos revisar la sesión. Intenta iniciar sesión.","error");return;}if(data.session){await entra(data.session);return;}show("#authPanel");if(modo==="alta")setMode("alta");else setMode("entrar");}
init();
})();
