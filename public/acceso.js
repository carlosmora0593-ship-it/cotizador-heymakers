(()=>{"use strict";
const P={
  taller:{name:"Nuvoor Imprenta",example:"https://nuvoor.mx/#imprenta",icon:"✂",sub:"Cotiza y organiza producción",href:"./taller.html"},
  restaurant:{name:"Nuvoor Restaurant",example:"https://nuvoor.mx/#restaurant",icon:"♨",sub:"Mesas, comandas y caja",href:"./restaurante/"},
  tiendita:{name:"Nuvoor Store",example:"https://nuvoor.mx/#store",icon:"▤",sub:"Mostrador, caja e inventario",href:"./tiendita/"}
};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],params=new URLSearchParams(location.search),validos=Object.keys(P);
/* Las altas las abre o cierra Lab (altas_abiertas() en la base). Si la base
   todavía no tiene esa función, se quedan cerradas como antes. */
let ALTAS_ABIERTAS=false;
/* Con las altas cerradas, un código de invitación vigente (los de Lab › Códigos)
   abre el formulario de cuenta nueva sólo para quien lo trae. El código se
   canjea en cuanto hay sesión: así entra con su plan sin pagar. */
let invitacion=null;const LS_INVITA="nuvoor_invitacion_pendiente";
const nombrePlan=p=>p==="pro"?"Pro":p==="basico"?"Básico":"Maker";
const textoAlta=()=>invitacion?"Crear cuenta · "+invitacion.dias+" días gratis":"Crear cuenta y probar 15 días";
let sb=null,sesion=null,negocios=[],cuenta=null,productos=[],modo="entrar",requested=[],negociosDisponible=false,skipAutoOpenOnce=false,accessMode="login",accessTransition=0,firstAccessReveal=true,launchTimer=null;
function esc(s){return String(s||"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function lista(xs){return [...new Set((Array.isArray(xs)?xs:[]).filter(x=>validos.includes(x)))];}
function panelCopy(screen){const title=$("#panelTitle"),sub=$("#panelSubtitle");if(!title||!sub)return;if(screen==="signup"){title.textContent="Bienvenido a Nuvoor";sub.textContent=invitacion?invitacion.dias+" días gratis con tu código, sin tarjeta.":"15 días gratis, sin tarjeta.";}else if(screen==="business"){title.textContent="Hola de nuevo";sub.textContent=sesion&&sesion.user&&sesion.user.email||"Elige con qué negocio quieres trabajar.";}else{title.textContent="¡Qué gusto verte!";sub.textContent="Entra y sigue vendiendo.";}}
function cambiaVista(screen,inicial=false){
  const card=$("#accessCard");if(!card)return;const serial=++accessTransition,reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,entrada=inicial||firstAccessReveal;firstAccessReveal=false;accessMode=screen;
  card.dataset.formReady="false";card.classList.add("is-entering");
  const destino=()=>{if(serial!==accessTransition)return;panelCopy(screen);card.dataset.screen=screen;card.dataset.phase="travel";setTimeout(()=>{if(serial!==accessTransition)return;card.dataset.formReady="true";card.dataset.phase="steady";card.classList.remove("is-entering");},reduced?0:entrada?650:150);};
  if(entrada){card.dataset.screen="cover";card.dataset.phase="initial";setTimeout(destino,reduced?0:350);}
  else{card.dataset.phase="cover";card.dataset.screen="cover";setTimeout(destino,reduced?0:450);}
}
function show(id){["#authPanel","#accountPanel","#loadingPanel"].forEach(s=>$(s).hidden=s!==id);if(id==="#authPanel")cambiaVista(accessMode,firstAccessReveal);else if(id==="#accountPanel")cambiaVista("business",firstAccessReveal);}
function message(t,k=""){const n=$("#msg");n.textContent=t;n.className="msg"+(k?" "+k:"");}
function detalleError(e){const code=String(e&&e.code||"").trim(),msg=String(e&&e.message||"").trim().replace(/[\r\n\t]+/g," ").slice(0,240);return [code,msg].filter(Boolean).join(" · ")||"La base no devolvió más detalles.";}
function limpiaSesionLocal(){try{const project=new URL(CONFIG.SUPABASE_URL).hostname.split(".")[0];localStorage.removeItem("sb-"+project+"-auth-token");}catch(_){}}
function setMode(k){const quiereAlta=k==="alta",alta=quiereAlta&&(ALTAS_ABIERTAS||!!invitacion),altaCerrada=quiereAlta&&!alta;modo=alta?"alta":"entrar";accessMode=quiereAlta?"signup":"login";$$('[data-mode]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===k)));$("#signupFields").hidden=!alta;$("#personName").required=alta;$("#businessName").required=alta;$("#password").autocomplete=alta?"new-password":"current-password";$("#authTitle").textContent=quiereAlta?"Crea una cuenta":"Entra a Nuvoor";$("#authSub").textContent=quiereAlta?"Elige tu sistema y abre tu espacio de trabajo.":"Accede a los productos de tu cuenta.";$("#submit").textContent=alta?textoAlta():"Iniciar sesión";const ia=$("#inviteActive");if(ia){ia.hidden=!(alta&&invitacion);if(invitacion)ia.textContent="Código "+invitacion.codigo+": plan "+nombrePlan(invitacion.plan)+" gratis por "+invitacion.dias+" días. Sin tarjeta.";}$("#authForm").hidden=altaCerrada;$("#closedSignup").hidden=!altaCerrada;$("#authSwitch").hidden=altaCerrada;const switchButton=$("#authSwitch [data-mode]");if(switchButton){switchButton.dataset.mode=alta?"entrar":"alta";switchButton.innerHTML=alta?'Iniciar sesión <span aria-hidden="true">→</span>':'Crea una cuenta <span aria-hidden="true">→</span>';$("#authSwitch").querySelector("span").textContent=alta?"¿Ya tienes cuenta?":"¿Primera vez aquí?";}message("");if(alta)seleccionInicial();if(!$("#authPanel").hidden&&$("#accessCard").dataset.formReady==="true")cambiaVista(accessMode,false);}
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
function animarApertura(k,n){const overlay=$("#launchOverlay");if(!overlay){location.replace(urlProducto(k,n.id));return;}clearTimeout(launchTimer);$("#launchTitle").textContent="Abriendo "+P[k].name;$("#launchBusiness").textContent=n.nombre||"Mi negocio";overlay.hidden=false;overlay.setAttribute("aria-hidden","false");overlay.classList.remove("active");requestAnimationFrame(()=>overlay.classList.add("active"));const reduced=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;launchTimer=setTimeout(()=>location.replace(urlProducto(k,n.id)),reduced?400:2500);}
async function abreNegocio(k,n){
  if(!P[k]||!n)return;
  if(k==="taller"&&!n.activa){
    const {error}=await sb.rpc("cambiar_empresa",{destino:n.id});
    if(error){const note=$("#businessNotice");note.hidden=false;note.textContent="No se pudo abrir Nuvoor Imprenta: "+detalleError(error)+". Revisa que sql/19-negocios-por-correo.sql esté aplicado.";return;}
  }
  animarApertura(k,n);
}
function vigencia(n){return n&&n.estado==="activa"&&new Date(n.vence)>new Date();}
function badgeProductos(n){return n.productos.length?n.productos.map(k=>P[k].name.replace("Nuvoor ","")).join(" · "):"Sistema por identificar";}
function renderNegocio(n,productoSolicitado){
  const products=productoSolicitado&&n.productos.includes(productoSolicitado)?[productoSolicitado]:n.productos,supported=products.length>0;
  const buttons=supported?products.map(k=>'<button class="businessOpen" type="button" data-open-product="'+k+'" data-business="'+esc(n.id)+'">Abrir '+esc(P[k].name.replace("Nuvoor ",""))+' →</button>').join(""):'<small class="businessMissing">Falta ejecutar sql/19-negocios-por-correo.sql para identificar este negocio.</small>';
  const rolVisible=n.rol==="dueno"?"dueño":n.rol||"miembro";
  return '<article class="businessCard"><div class="businessHead"><span class="businessIcon" aria-hidden="true">'+(supported?products.map(k=>P[k].icon).join(" "):"•")+'</span><div><strong>'+esc(n.nombre)+'</strong><small>'+esc(badgeProductos(n))+' · '+esc(rolVisible)+'</small></div></div><div class="businessActions">'+buttons+(supported?'<button class="businessLicense" type="button" data-license-business="'+esc(n.id)+'">Ver licencias</button>':"")+'</div></article>';
}
let pagoPollStarted=false, pagoSeleccionado=null;
function pintaCuenta(){
  const preventDirect=skipAutoOpenOnce;skipAutoOpenOnce=false;
  show("#accountPanel");$("#accountTitle").textContent=negocios.length>1?"Tus negocios":(negocios[0].nombre||"Tu cuenta Nuvoor");$("#accountEmail").textContent=sesion.user.email||"";
  const requestedProduct=params.get("producto"),targetId=params.get("cuenta");
  const matching=negocios.flatMap(n=>n.productos.filter(k=>(!requestedProduct||k===requestedProduct)&&(!targetId||n.id===targetId)).map(k=>({n,k})));
  if(!preventDirect&&requestedProduct&&P[requestedProduct]&&matching.length===1&&!params.has("gestion")&&!params.has("planes")&&!params.has("pago")){abreNegocio(matching[0].k,matching[0].n);return;}
  const singleLegacy=negocios.length===1&&negocios[0].productos.length===1;
  if(!preventDirect&&singleLegacy&&!requestedProduct&&!params.has("gestion")&&!params.has("planes")&&!params.has("pago")){abreNegocio(negocios[0].productos[0],negocios[0]);return;}
  const active=(targetId&&negocios.find(n=>n.id===targetId))||negocios.find(n=>n.activa)||negocios[0],days=Math.max(0,Math.ceil((new Date(active.vence)-new Date())/86400000));
  $("#accountStatus").innerHTML=vigencia(active)?'<strong>'+(active.plan==="prueba"?"Prueba gratis activa":"Licencia activa")+'</strong>'+(active.plan==="prueba"?"Te quedan "+days+" día(s), sin tarjeta.":"El negocio seleccionado conserva su licencia."):'<strong>Activa una licencia para seguir</strong>Tu información se conserva.';
  const pane=$("#productOptions"),businessesView=requestedProduct&&P[requestedProduct]?negocios.filter(n=>(!targetId||n.id===targetId)&&(!n.productos.length||n.productos.includes(requestedProduct))):negocios;
  pane.innerHTML='<p class="sub">'+(requestedProduct&&P[requestedProduct]?"Elige un negocio de "+P[requestedProduct].name+".":negocios.length>1?"Elige con qué negocio quieres trabajar.":negocios[0].productos.length>1?"Esta cuenta antigua conserva varios POS. Elige uno para continuar.":"Abre el sistema de tu negocio.")+'</p><div class="businessGrid">'+businessesView.map(n=>renderNegocio(n,requestedProduct&&P[requestedProduct]?requestedProduct:"")).join("")+'</div><p id="businessNotice" class="notice" hidden></p><div class="addBusinessRow"><button class="plain addBusinessButton" id="showAddBusiness" type="button">＋ Agregar un negocio</button></div>';
  $("#addBusinessPanel").hidden=true;
  pane.querySelectorAll("[data-open-product]").forEach(b=>b.addEventListener("click",()=>{const n=negocios.find(x=>x.id===b.dataset.business);abreNegocio(b.dataset.openProduct,n);}));
  pane.querySelectorAll("[data-license-business]").forEach(b=>b.addEventListener("click",()=>{cuenta=negocios.find(x=>x.id===b.dataset.licenseBusiness);productos=cuenta?cuenta.productos:[];pintaLicencias();$("#licensePanel").scrollIntoView({behavior:"smooth",block:"start"});}));
  $("#showAddBusiness").addEventListener("click",()=>{$("#addBusinessPanel").hidden=!$("#addBusinessPanel").hidden;});
  if(requestedProduct&&P[requestedProduct]&&!matching.length){const note=$("#businessNotice");note.hidden=false;note.textContent="No tienes un negocio de "+P[requestedProduct].name+" todavía. Agrégalo aquí; cada sistema tendrá su propia cuenta.";}
  if(!negociosDisponible){const note=$("#businessNotice");note.hidden=false;note.textContent="Para crear nuevos negocios y abrir Restaurant o Store separados, falta ejecutar sql/19-negocios-por-correo.sql desde el Lab → Base de datos.";}
  if(params.get("pago")==="ok"){
    $("#accountStatus").innerHTML='<strong>Pago recibido</strong>Estamos esperando la confirmación de Stripe. Tu negocio sigue seleccionado.';
    if(!pagoPollStarted){pagoPollStarted=true;setTimeout(confirmarPagoAcceso,0);}
  }else if(params.get("pago")==="cancelado"){
    $("#accountStatus").innerHTML='<strong>Pago no completado</strong>No se hizo ningún cambio en tu licencia. Puedes intentarlo de nuevo cuando quieras.';
  }
  if(params.has("planes")||params.has("gestion")||params.has("pago")){
    cuenta=(targetId&&negocios.find(n=>n.id===targetId))||(matching[0]&&matching[0].n)||active;
    productos=cuenta.productos||[];pintaLicencias();
  }
}
function puedeContratar(){return !!cuenta&&["admin","dueno","owner"].includes(String(cuenta.rol||"").toLowerCase());}
function etiquetaPlan(plan,producto){return producto==="taller"?({basico:"imprenta_basico",maker:"imprenta_maker",pro:"imprenta_pro"}[plan]||plan):producto==="restaurant"?({basico:"restaurant_estandar",multiempresa:"restaurant_multi",maker:"restaurant_multi"}[plan]||plan):({basico:"store_estandar",multiempresa:"store_multi",maker:"store_multi"}[plan]||plan);}
function formatoPrecio(n){return "$"+Number(n||0).toLocaleString("es-MX");}
function pintaLicencias(){
  if(!cuenta){$("#licensePanel").hidden=true;return;}
  $("#licensePanel").hidden=false;
  const host=$("#licenseProducts"),notice=$("#paymentNotice"),cards=$("#licenseCards");
  if(productos.length>1){host.innerHTML='<span class="help">Cuenta anterior · '+esc(badgeProductos(cuenta))+'</span>';cards.innerHTML="";notice.hidden=false;notice.textContent="Esta cuenta antigua conserva varios POS. Para cambiar sus licencias, primero organiza cada sistema en su propia cuenta.";return;}
  const producto=productos[0]||cuenta.producto||"taller",esImprenta=producto==="taller",ciclo=$("#licenseCycle").value||"mensual";
  host.innerHTML='<span class="help">'+esc(P[producto].name)+' · '+esc(cuenta.nombre||"este negocio")+'</span>'+(cuenta.stripe_cliente&&puedeContratar()?'<button class="btn secondaryBtn" id="stripeManage" type="button">Administrar mi suscripción</button>':"");
  const planes=esImprenta?[
    {id:"basico",name:"Básico",monthly:199,annual:1990,description:"Hasta 1 usuario · cotizaciones e impresión",promo:true},
    {id:"maker",name:"Maker",monthly:449,annual:4490,description:"Hasta 3 usuarios · compras e inventario"},
    {id:"pro",name:"Pro",monthly:899,annual:8990,description:"Usuarios sin límite · incluye hasta 4 sucursales"}
  ]:[
    {id:"basico",name:"Estándar",monthly:199,annual:1990,description:"Todo lo necesario para operar",promo:true},
    {id:"multiempresa",name:"Multiempresa",monthly:899,annual:8990,description:"Hasta 4 sucursales del mismo sistema"}
  ];
  $("#licenseIntro").textContent=esImprenta?"Pro incluye hasta 4 sucursales de Imprenta.":"Cada licencia cubre un sistema. Multiempresa es para hasta 4 sucursales de ese mismo sistema.";
  const admin=puedeContratar();
  cards.innerHTML=planes.map(x=>'<article class="licCard"><b>'+x.name+'</b><strong>'+formatoPrecio(ciclo==="anual"?x.annual:x.monthly)+' <small>MXN / '+(ciclo==="anual"?"año":"mes")+'</small></strong><small>'+(x.promo?(ciclo==="mensual"?"Con tarjeta: $98 los primeros 3 meses; después $199. OXXO conserva $199 al mes.":"El pago anual no lleva promoción."):x.description)+(ciclo==="anual"?" · equivale a 10 meses":"")+'</small><button type="button" '+(admin?'data-plan="'+x.id+'"':'disabled')+'>'+(admin?"Contratar":"Pídele al dueño del negocio que contrate")+'</button></article>').join("");
  cards.querySelectorAll("[data-plan]").forEach(b=>b.addEventListener("click",()=>abrePagoAcceso(b.dataset.plan,producto,ciclo)));
  $("#licenseCycle").onchange=()=>pintaLicencias();
  const manage=$("#stripeManage");if(manage)manage.onclick=()=>administraStripeAcceso();
  if(cuenta.mp_preapproval_id){notice.hidden=false;notice.textContent="Hay una suscripción anterior de Mercado Pago. Antes de contratar otra, cancélala desde esa cuenta para evitar un doble cobro.";}
  else if(!admin){notice.hidden=false;notice.textContent="Pídele al dueño del negocio que contrate o administre el plan.";}
  else notice.hidden=true;
}
function abrePagoAcceso(plan,producto,ciclo){
  if(!puedeContratar()){const n=$("#paymentNotice");n.hidden=false;n.textContent="Pídele al dueño del negocio que contrate.";return;}
  const data={plan,producto,ciclo,cuenta:cuenta.id};pagoSeleccionado=data;
  const item=producto==="taller"?({basico:[199,1990],maker:[449,4490],pro:[899,8990]}[plan]):({basico:[199,1990],multiempresa:[899,8990]}[plan]);
  const mensual=ciclo==="mensual",promo=plan==="basico"&&mensual;
  $("#paymentTitle").textContent="Contratar "+(producto==="taller"?(plan==="basico"?"Imprenta Básico":plan==="maker"?"Imprenta Maker":"Imprenta Pro"):producto==="restaurant"?"Restaurant "+(plan==="multiempresa"?"Multiempresa":"Estándar"):"Store "+(plan==="multiempresa"?"Multiempresa":"Estándar"));
  $("#paymentPrice").textContent=promo?"$98 MXN al mes durante 3 meses; después $199 al mes.":formatoPrecio(item[mensual?0:1])+" MXN / "+(mensual?"mes":"año");
  $("#paymentChoices").hidden=false;$("#paymentTransfer").hidden=true;$("#paymentModalNote").hidden=true;$("#paymentModalNote").textContent="";
  $("#paymentModal").hidden=false;$("#paymentModal").setAttribute("aria-hidden","false");
}
async function iniciarPagoAcceso(forma){
  if(!pagoSeleccionado||!cuenta||!puedeContratar())return;
  const note=$("#paymentModalNote"),buttons=$$("#paymentChoices button");buttons.forEach(b=>b.disabled=true);note.hidden=false;note.textContent="Preparando el pago…";
  if(forma==="oxxo"){
    const mensual=pagoSeleccionado.plan==="multiempresa"?899:pagoSeleccionado.plan==="maker"?449:pagoSeleccionado.plan==="pro"?899:199;
    $("#paymentPrice").textContent=formatoPrecio(mensual)+" MXN / mes con OXXO. La promoción es sólo para tarjeta.";
  }else if(forma==="transferencia"){
    const anual=pagoSeleccionado.plan==="multiempresa"?8990:pagoSeleccionado.plan==="maker"?4490:pagoSeleccionado.plan==="pro"?8990:1990;
    $("#paymentPrice").textContent=formatoPrecio(anual)+" MXN / año por transferencia.";
  }
  try{
    const {data}=await sb.auth.getSession();if(!data.session)throw new Error("Tu sesión terminó. Vuelve a entrar.");
    const body={plan:pagoSeleccionado.plan,ciclo:forma==="transferencia"?"anual":forma==="oxxo"?"mensual":pagoSeleccionado.ciclo,forma,producto:pagoSeleccionado.producto,cuenta_id:pagoSeleccionado.cuenta,app:params.get("app")||""};
    const url=String(CONFIG.SUPABASE_URL).replace(/\/+$/,""),r=await fetch(url+"/functions/v1/crear-pago",{method:"POST",headers:{"Content-Type":"application/json","apikey":CONFIG.SUPABASE_ANON_KEY,"Authorization":"Bearer "+data.session.access_token},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"No se pudo preparar el pago.");
    if(forma==="transferencia"){
      $("#paymentChoices").hidden=true;$("#paymentModalNote").textContent=d.aviso||"Haz la transferencia para activar el año de servicio.";
      $("#paymentBank").textContent=d.banco||"Los datos bancarios aparecerán aquí cuando estén configurados.";$("#paymentReference").textContent=d.referencia||"—";$("#paymentAmount").textContent=formatoPrecio(d.monto)+" MXN";$("#paymentTransfer").hidden=false;return;
    }
    if(!d.url)throw new Error("Stripe no devolvió el enlace de pago.");location.assign(d.url);
  }catch(e){note.textContent=e.message||"No se pudo iniciar el pago.";}
  finally{buttons.forEach(b=>b.disabled=false);}
}
async function administraStripeAcceso(){
  try{const {data}=await sb.auth.getSession();if(!data.session)throw new Error("Tu sesión terminó. Vuelve a entrar.");
    const r=await fetch(String(CONFIG.SUPABASE_URL).replace(/\/+$/ ,"")+"/functions/v1/portal-suscripcion",{method:"POST",headers:{"Content-Type":"application/json","apikey":CONFIG.SUPABASE_ANON_KEY,"Authorization":"Bearer "+data.session.access_token},body:JSON.stringify({cuenta_id:cuenta.id,app:params.get("app")||""})});
    const d=await r.json().catch(()=>({}));if(!r.ok||!d.url)throw new Error(d.error||"No se pudo abrir la administración.");location.assign(d.url);
  }catch(e){const n=$("#paymentNotice");n.hidden=false;n.textContent=e.message||"No se pudo abrir la administración.";}
}
async function confirmarPagoAcceso(){
  const id=params.get("cuenta");
  for(let i=0;i<10;i++){
    await new Promise(r=>setTimeout(r,3000));
    try{await leerEmpresas();}catch(_){continue;}
    const actualizado=(id&&negocios.find(n=>n.id===id))||negocios.find(n=>n.activa)||negocios[0];if(!actualizado)continue;
    cuenta=actualizado;productos=actualizado.productos||[];
    const sesionPago=params.get("sesion");
    let confirmado=false;
    if(sesionPago){try{const r=await sb.rpc("stripe_confirmado",{p_cuenta:actualizado.id,p_sesion:sesionPago});confirmado=!r.error&&r.data===true;}catch(_){}}
    if(confirmado&&vigencia(actualizado)&&!['prueba','ninguno',''].includes(actualizado.plan||'')){
      $("#accountStatus").innerHTML='<strong>¡Listo! Tu plan quedó activo.</strong>El negocio ya puede seguir trabajando.';pintaLicencias();return;
    }
  }
  $("#accountStatus").innerHTML='<strong>Tu pago se está confirmando.</strong>En unos minutos se activa. No vuelvas a pagar mientras llega el aviso.';
}
function conectaPagoAcceso(){
  $("#paymentClose").addEventListener("click",()=>{$("#paymentModal").hidden=true;$("#paymentModal").setAttribute("aria-hidden","true");});
  $("#paymentModal").addEventListener("click",e=>{if(e.target===$("#paymentModal"))$("#paymentClose").click();});
  $("#paymentChoices").addEventListener("click",e=>{const b=e.target.closest("[data-paymethod]");if(b)iniciarPagoAcceso(b.dataset.paymethod);});
  $("#copyPaymentReference").addEventListener("click",async()=>{const ref=$("#paymentReference").textContent;try{await navigator.clipboard.writeText(ref);}catch(_){const t=document.createElement("textarea");t.value=ref;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove();}$("#copyPaymentReference").textContent="Referencia copiada";});
}
conectaPagoAcceso();
async function agregaNegocio(e){e.preventDefault();const nombre=$("#newBusinessName").value.trim(),producto=$("#newBusinessProduct").value,b=$("#createBusiness");if(!nombre){$("#newBusinessMessage").textContent="Escribe el nombre del negocio.";return;}if(!negociosDisponible){$("#newBusinessMessage").textContent="Falta ejecutar sql/19-negocios-por-correo.sql desde el Lab → Base de datos.";return;}b.disabled=true;b.textContent="Creando…";$("#newBusinessMessage").textContent="";try{const r=await sb.rpc("crear_negocio",{nombre,producto});if(r.error)throw r.error;$("#newBusinessName").value="";await leerEmpresas();skipAutoOpenOnce=true;pintaCuenta();$("#addBusinessPanel").hidden=true;}catch(err){$("#newBusinessMessage").textContent=detalleError(err);}finally{b.disabled=false;b.textContent="Crear negocio";}}
async function revisaInvitacion(txt){
  const codigo=String(txt||"").trim().toUpperCase(),n=$("#inviteMsg");
  const di=(t,k="")=>{if(n){n.textContent=t;n.className="msg"+(k?" "+k:"");}};
  if(codigo.length<4){di("Escribe el código que te dieron.","error");return null;}
  di("Revisando…");
  try{const {data,error}=await sb.rpc("revisa_codigo",{p_codigo:codigo});if(error)throw error;
    if(data&&data.ok){invitacion={codigo,plan:data.plan,dias:data.dias};di("");return invitacion;}
    invitacion=null;di((data&&data.motivo)||"Ese código no sirve.","error");return null;
  }catch(e){di("No pude revisar el código. Revisa tu conexión e intenta otra vez.","error");return null;}
}
async function usaInvitacion(){const b=$("#inviteCheck");if(b)b.disabled=true;const ok=await revisaInvitacion($("#inviteCode").value);if(b)b.disabled=false;if(ok){setMode("alta");const p=$("#personName");if(p)p.focus();}}
async function canjeaInvitacionPendiente(){let c="";try{c=localStorage.getItem(LS_INVITA)||"";}catch(_){}if(!c)return;try{const r=await sb.rpc("canjear_codigo",{p_codigo:c});if(!r.error){try{localStorage.removeItem(LS_INVITA);}catch(_){}}}catch(_){}}
async function entra(session){sesion=session;show("#loadingPanel");await canjeaInvitacionPendiente();try{await leerEmpresas();$("#accountErrorDetail").hidden=true;$("#accountErrorDetail").textContent="";pintaCuenta();}catch(e){show("#accountPanel");$("#accountTitle").textContent="No pudimos abrir tu cuenta";$("#accountEmail").textContent=sesion.user.email||"";$("#accountStatus").textContent=e.message||"No pudimos abrir la cuenta de este negocio.";const d=$("#accountErrorDetail");d.textContent=e.detail||detalleError(e);d.hidden=false;$("#productOptions").innerHTML="";}}
async function envia(e){e.preventDefault();const alta=modo==="alta",email=$("#email").value.trim(),password=$("#password").value;if(alta){actualizaSeleccion();if(!requested.length){message("Selecciona el POS que quieres probar.","error");return;}}
  const b=$("#submit");b.disabled=true;b.textContent=alta?"Creando tu cuenta…":"Entrando…";message("");
  try{let data,error;if(alta&&invitacion&&!(await revisaInvitacion(invitacion.codigo))){message("Ese código ya no sirve. Pide uno nuevo a quien te invitó.","error");b.disabled=false;b.textContent=textoAlta();return;}if(alta){({data,error}=await sb.auth.signUp({email,password,options:{data:{nombre:$("#personName").value.trim(),negocio:$("#businessName").value.trim()||P[requested[0]].name,producto:requested[0],productos:requested}}}));}else{({data,error}=await sb.auth.signInWithPassword({email,password}));}if(error)throw error;if(alta&&invitacion){try{localStorage.setItem(LS_INVITA,invitacion.codigo);}catch(_){}}if(!data.session){message("Te mandamos un correo para confirmar tu cuenta. Después vuelve aquí e inicia sesión para abrir tu POS.","good");setMode("entrar");$("#email").value=email;$("#password").value="";b.disabled=false;b.textContent="Iniciar sesión";return;}await entra(data.session);}
  catch(e){message(/signups? not allowed|signup_disabled/i.test(String(e&&(e.code||e.message)||""))?"Las cuentas nuevas todavía están cerradas. Avísale a quien te dio el código.":(e.message||"No se pudo abrir la cuenta."),"error");b.disabled=false;b.textContent=alta?textoAlta():"Iniciar sesión";}}
let correoCodigo="",ultimoEnvioCodigo=0,codigoOcupado=false;
function mensajeCodigo(texto,clase=""){
  const n=$("#emailCodeMessage");n.textContent=texto;n.className="msg"+(clase?" "+clase:"");
}
function pasoCodigo(correo=""){
  correoCodigo=correo;
  $("#codeEmail").readOnly=!!correo;
  $("#emailCodeField").hidden=!correo;
  $("#emailCode").disabled=!correo;
  $("#emailCode").required=!!correo;
  $("#emailCode").value="";
  $("#emailCodeResend").hidden=!correo;
  $("#emailCodeChange").hidden=!correo;
  $("#emailCodeSubmit").textContent=correo?"Verificar y entrar":"Enviar código";
}
function abreAccesoCodigo(){
  $("#codeEmail").value=$("#email").value;
  $("#password").value="";
  $("#authForm").hidden=true;
  $("#authSwitch").hidden=true;
  $("#closedSignup").hidden=true;
  $("#emailCodeForm").hidden=false;
  $("#authTitle").textContent="Entra con tu correo";
  $("#authSub").textContent="Te enviaremos un código para abrir tu cuenta.";
  pasoCodigo();mensajeCodigo("");
}
async function usaCodigo(e,reenviar=false){
  e.preventDefault();
  if(codigoOcupado)return;
  const verificar=!!correoCodigo&&!reenviar;
  const email=correoCodigo||$("#codeEmail").value.trim().toLowerCase();
  const token=$("#emailCode").value.trim();
  if(verificar&&!/^[0-9]{6}$/.test(token)){mensajeCodigo("Escribe los 6 dígitos del código.","error");return;}
  if(!verificar&&Date.now()-ultimoEnvioCodigo<60000){mensajeCodigo("Espera un minuto antes de pedir otro código.","error");return;}
  codigoOcupado=true;
  const botones=$$("#emailCodeForm button");
  botones.forEach(b=>b.disabled=true);
  mensajeCodigo(verificar?"Verificando…":"Enviando…");
  try{
    if(verificar){
      const {data,error}=await sb.auth.verifyOtp({email,token,type:"email"});
      if(error||!data?.session){mensajeCodigo("El código no coincide o venció. Revisa el correo o pide otro código.","error");return;}
      $("#emailCode").value="";
      await entra(data.session);
    }else{
      const destino=new URL("./acceso.html",location.href);
      for(const llave of ["producto","cuenta","app"]){const valor=params.get(llave);if(valor)destino.searchParams.set(llave,valor);}
      destino.searchParams.set("codigo","1");
      const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:destino.href}});
      if(error&&error.code!=="otp_disabled"&&error.code!=="signup_disabled")throw error;
      ultimoEnvioCodigo=Date.now();
      pasoCodigo(email);
      mensajeCodigo("Si ese correo tiene acceso, recibirás un código. Si el mensaje incluye un enlace, también puedes usarlo.","good");
      $("#emailCode").focus();
    }
  }catch(error){
    mensajeCodigo(error?.status===429?"Espera un minuto y vuelve a intentar.":"No se pudo enviar el código. Revisa tu conexión e inténtalo de nuevo.","error");
  }finally{codigoOcupado=false;botones.forEach(b=>b.disabled=false);}
}
function conectaAccesoCodigo(){
  $("#useEmailCode").addEventListener("click",()=>{abreAccesoCodigo();$("#codeEmail").focus();});
  $("#emailCodeBack").addEventListener("click",()=>{
    $("#email").value=$("#codeEmail").value;
    pasoCodigo();mensajeCodigo("");$("#emailCodeForm").hidden=true;
    setMode("entrar");$("#email").focus();
  });
  $("#emailCodeChange").addEventListener("click",()=>{pasoCodigo();mensajeCodigo("");$("#codeEmail").focus();});
  $("#emailCodeResend").addEventListener("click",e=>usaCodigo(e,true));
  $("#emailCodeForm").addEventListener("submit",usaCodigo);
}
async function init(){show("#loadingPanel");if(!window.CONFIG||!window.supabase){show("#authPanel");message("Falta cargar la conexión de Nuvoor. Intenta actualizar la página.","error");return;}sb=window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY);conectaAccesoCodigo();try{const r=await sb.rpc("altas_abiertas");if(!r.error&&r.data===true)ALTAS_ABIERTAS=true;}catch(_){}const hint=$("#multiHint");if(hint)hint.textContent="Cada negocio es una cuenta independiente; sus datos no se mezclan.";$$('[data-mode]').forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));$("#authForm").addEventListener("submit",envia);const bi=$("#inviteCheck");if(bi)bi.addEventListener("click",usaInvitacion);const ic=$("#inviteCode");if(ic)ic.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();usaInvitacion();}});$("#addBusinessForm").addEventListener("submit",agregaNegocio);$$('input[name="producto"]').forEach(x=>x.addEventListener("change",actualizaSeleccion));$("#logout").addEventListener("click",async()=>{try{await sb.auth.signOut();}catch(_){}finally{limpiaSesionLocal();location.replace("./acceso.html");}});
  const {data,error}=await sb.auth.getSession();if(error){show("#authPanel");message("No pudimos revisar la sesión. Intenta iniciar sesión.","error");return;}if(data.session){await entra(data.session);return;}if(params.get("codigo")==="1")abreAccesoCodigo();const inv=params.get("invitacion");if(inv&&$("#inviteCode")){$("#inviteCode").value=inv.toUpperCase();setMode("alta");usaInvitacion();}show("#authPanel");}
init();
})();
