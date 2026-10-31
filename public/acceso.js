(()=>{"use strict";
const P={taller:{name:"Nuvoor Taller",href:"./taller.html",icon:"✂",sub:"Cotiza y organiza producción"},restaurant:{name:"Nuvoor Restaurant",href:"./restaurante/",icon:"♨",sub:"Mesas, comandas y caja"},tiendita:{name:"Nuvoor Tiendita",href:"./tiendita/",icon:"▤",sub:"Mostrador, caja e inventario"}};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],params=new URLSearchParams(location.search),validos=Object.keys(P);
let sb=null,sesion=null,cuenta=null,productos=[],productoColumn=true,multiDisponible=false,modo="entrar",requested=[];
function esc(s){return String(s||"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function lista(xs){return [...new Set((Array.isArray(xs)?xs:[]).filter(x=>validos.includes(x)))];}
function show(id){["#authPanel","#accountPanel","#loadingPanel"].forEach(s=>$(s).hidden=s!==id);}
function message(t,k=""){const n=$("#msg");n.textContent=t;n.className="msg"+(k?" "+k:"");}
function setMode(k){if(k==="alta")k="entrar";modo=k;const alta=k==="alta";$$('[data-mode]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===k)));$("#signupFields").hidden=!alta;$("#personName").required=alta;$("#businessName").required=alta;$("#password").autocomplete=alta?"new-password":"current-password";$("#authTitle").textContent=alta?"Empieza gratis con Nuvoor":"Entra a Nuvoor";$("#authSub").textContent=alta?"Crea tu cuenta y abre el POS que elegiste.":"Accede a los productos de tu cuenta.";$("#submit").textContent=alta?"Crear cuenta y probar 15 días":"Iniciar sesión";message("");if(alta)seleccionInicial();}
function seleccionInicial(){const pick=params.get("producto"),defaults=pick&&P[pick]?[pick]:["taller"];$$('input[name="producto"]').forEach(x=>x.checked=defaults.includes(x.value));actualizaSeleccion();}
function actualizaSeleccion(){const checks=$$('input[name="producto"]'),taller=checks.find(x=>x.value==="taller"),otras=checks.filter(x=>x.value!=="taller");if(taller.checked)otras.forEach(x=>x.checked=false);if(otras.some(x=>x.checked))taller.checked=false;requested=checks.filter(x=>x.checked).map(x=>x.value);taller.disabled=otras.some(x=>x.checked);otras.forEach(x=>x.disabled=taller.checked);}
function destino(k){location.replace(P[k].href);}
async function leeCuenta(){
  let perfil=null;
  for(let i=0;i<10;i++){const r=await sb.from("perfiles").select("cuenta_id,cuenta_activa").eq("id",sesion.user.id).maybeSingle();if(r.error)throw new Error("No pudimos leer tu perfil. Intenta entrar de nuevo.");if(r.data){perfil=r.data;break;}await new Promise(r=>setTimeout(r,400));}
  if(!perfil)throw new Error("La cuenta sigue preparándose. Espera unos segundos y vuelve a cargar esta página.");
  const id=perfil.cuenta_activa||perfil.cuenta_id;
  let r=await sb.from("cuentas").select("id,nombre,producto,productos,plan,estado,vence,ciclo,mp_preapproval_id").eq("id",id).maybeSingle();
  if(r.error&&/productos/i.test(r.error.message||"")){productoColumn=false;r=await sb.from("cuentas").select("id,nombre,producto,plan,estado,vence,ciclo,mp_preapproval_id").eq("id",id).maybeSingle();}
  if(r.error||!r.data)throw new Error("No pudimos abrir la cuenta de este negocio.");
  cuenta=r.data;productos=lista(cuenta.productos);if(!productos.length&&P[cuenta.producto])productos=[cuenta.producto];if(!productos.length)productos=["taller"];
  if(!productoColumn&&requested.length>1)throw new Error("Para activar más de un POS primero hay que ejecutar sql/18-productos-cuenta.sql en Supabase.");
  return cuenta;
}
function vigencia(){return cuenta&&cuenta.estado==="activa"&&new Date(cuenta.vence)>new Date();}
function pintaCuenta(){
  show("#accountPanel");$("#accountTitle").textContent=cuenta.nombre||"Tu cuenta Nuvoor";$("#accountEmail").textContent=sesion.user.email||"";
  const days=Math.max(0,Math.ceil((new Date(cuenta.vence)-new Date())/86400000));
  $("#accountStatus").innerHTML=vigencia()?'<strong>'+(cuenta.plan==="prueba"?"Prueba gratis activa":"Licencia activa")+'</strong>'+(cuenta.plan==="prueba"?"Te quedan "+days+" día(s), sin tarjeta.":"Tu cuenta y sus productos están listos."):'<strong>Activa una licencia para seguir</strong>Tu cuenta conserva el acceso y la información.';
  const pane=$("#productOptions");
  if(productos.length===1&&!params.has("gestion")&&!params.has("planes")&&!params.has("pago")){destino(productos[0]);return;}
  pane.innerHTML='<p class="sub">'+(productos.length>1?"Consulta qué ofrece cada POS o abre el que vas a usar.":"Revisa el ejemplo de tu producto o abre el POS.")+'</p><div class="appGrid">'+productos.map(k=>'<a class="appChoice" href="./productos/'+(k==="restaurant"?"restaurant":k)+'.html"><i>'+P[k].icon+'</i><span>'+esc(P[k].name)+'<small>Ver ejemplo y ventajas →</small></span></a>').join("")+'</div><div class="appOpenGrid">'+productos.map(k=>'<a class="appOpen" href="'+P[k].href+'">Abrir '+esc(P[k].name)+' →</a>').join("")+'</div>';
  if(params.get("pago")==="ok"){$("#accountStatus").innerHTML='<strong>Pago recibido</strong>Mercado Pago avisó a Nuvoor. La licencia puede tardar unos segundos en reflejarse.';}
  if(params.has("planes")||params.has("gestion")||params.has("pago"))pintaLicencias();
}
function pintaLicencias(){
  $("#licensePanel").hidden=false;
  const host=$("#licenseProducts");
  if(!productoColumn){host.innerHTML='<span class="help">Para administrar varias licencias, primero hay que actualizar la base con sql/18-productos-cuenta.sql.</span>';$("#licenseCards").innerHTML="";const notice=$("#paymentNotice");notice.hidden=false;notice.textContent="La cuenta sigue entrando a su POS actual. Ejecuta la actualización de base para contratar o cambiar licencias desde aquí.";return;}
  if(productos.includes("taller")){host.innerHTML='<span class="help">Nuvoor Taller · licencia independiente</span>';}
  else{host.innerHTML=validos.filter(k=>k!=="taller").map(k=>'<label><input type="checkbox" data-license-product="'+k+'" '+(productos.includes(k)?"checked":"")+'> '+esc(P[k].name)+'</label>').join("");host.querySelectorAll("input").forEach(x=>x.addEventListener("change",renderLicencias));}
  renderLicencias();
}
function seleccionLicencia(){if(productos.includes("taller"))return ["taller"];const picked=$$('[data-license-product]:checked').map(x=>x.dataset.licenseProduct);return picked.length?picked:productos.slice();}
function renderLicencias(){
  const chosen=seleccionLicencia(),workshop=chosen.includes("taller"),isBoth=chosen.length===2;
  $("#licenseIntro").textContent=workshop?"Licencias para Nuvoor Taller.":isBoth?"La licencia Multiempresa incluye Restaurant y Tiendita.":"Selecciona una licencia estándar o Multiempresa.";
  let plans=workshop?[{id:"basico",name:"Básico",amount:199,info:"1 usuario · hasta 150 cotizaciones"},{id:"maker",name:"Maker",amount:449,info:"Hasta 3 usuarios · compras e inventario"},{id:"pro",name:"Pro",amount:899,info:"Usuarios sin límite · caja y reportes"}]:isBoth?[{id:"maker",name:"Multiempresa",amount:449,info:"Restaurant + Tiendita en una cuenta"}]:[{id:"basico",name:"Estándar",amount:199,info:"Un punto de venta"},{id:"maker",name:"Multiempresa",amount:449,info:"Licencia con más de una empresa"}];
  $("#licenseCards").innerHTML=plans.map(x=>'<article class="licCard"><b>'+x.name+'</b><strong>$'+x.amount.toLocaleString("es-MX")+' <small>MXN / mes</small></strong><small>'+x.info+'</small><button type="button" data-plan="'+x.id+'">Contratar</button></article>').join("");
  $("#licenseCards").querySelectorAll("[data-plan]").forEach(b=>b.addEventListener("click",()=>contrata(b.dataset.plan,chosen)));
  const notice=$("#paymentNotice");
  if(cuenta.mp_preapproval_id){notice.hidden=false;notice.textContent="Hay una suscripción de Mercado Pago registrada. Para cambiar de licencia sin generar otro cobro, cancela la actual en Mercado Pago y después vuelve aquí.";}else notice.hidden=true;
}
async function contrata(plan,chosen){
  const b=$("#licenseCards").querySelector('[data-plan="'+plan+'"]');if(!b)return;b.disabled=true;b.textContent="Abriendo Mercado Pago…";
  try{const {data}=await sb.auth.getSession();const url=String(CONFIG.SUPABASE_URL).replace(/\/+$/,"");const r=await fetch(url+"/functions/v1/crear-suscripcion",{method:"POST",headers:{"Content-Type":"application/json","apikey":CONFIG.SUPABASE_ANON_KEY,"Authorization":"Bearer "+data.session.access_token},body:JSON.stringify({plan,ciclo:"mensual",productos:chosen})});let d={};try{d=await r.json();}catch(_){}if(!r.ok||!d.init_point)throw new Error(d.error||"No se pudo iniciar el pago.");location.assign(d.init_point);}catch(e){b.disabled=false;b.textContent="Contratar";const notice=$("#paymentNotice");notice.hidden=false;notice.textContent=e.message;}
}
async function entra(session){sesion=session;show("#loadingPanel");try{await leeCuenta();pintaCuenta();}catch(e){show("#accountPanel");$("#accountTitle").textContent="No pudimos abrir tu cuenta";$("#accountEmail").textContent=sesion.user.email||"";$("#accountStatus").textContent=e.message;$("#productOptions").innerHTML="";}}
async function envia(e){e.preventDefault();const alta=modo==="alta",email=$("#email").value.trim(),password=$("#password").value;if(alta){actualizaSeleccion();if(!requested.length){message("Selecciona el POS que quieres probar.","error");return;}if(requested.length>1&&!productoColumn){message("Primero hay que ejecutar sql/18-productos-cuenta.sql en Supabase.","error");return;}}
  const b=$("#submit");b.disabled=true;b.textContent=alta?"Creando tu cuenta…":"Entrando…";message("");
  try{let data,error;if(alta){({data,error}=await sb.auth.signUp({email,password,options:{data:{nombre:$("#personName").value.trim(),negocio:$("#businessName").value.trim()||P[requested[0]].name,producto:requested[0],productos:requested}}}));}else{({data,error}=await sb.auth.signInWithPassword({email,password}));}if(error)throw error;if(!data.session){message("Te mandamos un correo para confirmar tu cuenta. Después vuelve aquí e inicia sesión para abrir tu POS.","good");setMode("entrar");$("#email").value=email;$("#password").value="";b.disabled=false;b.textContent="Iniciar sesión";return;}await entra(data.session);if(alta&&params.has("planes")){params.set("gestion","1");history.replaceState({},"",location.pathname+"?gestion=1");await leeCuenta();pintaCuenta();}}
  catch(e){message(e.message||"No se pudo abrir la cuenta.","error");b.disabled=false;b.textContent=alta?"Crear cuenta y probar 15 días":"Iniciar sesión";}}
async function init(){show("#loadingPanel");if(!window.CONFIG||!window.supabase){show("#authPanel");message("Falta cargar la conexión de Nuvoor. Intenta actualizar la página.","error");return;}sb=window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY);let multi=null;try{multi=await sb.rpc("makers_productos_multiples_disponible");}catch(_){}multiDisponible=!!multi&&!multi.error&&multi.data===true;if(!multiDisponible)$("#multiHint").textContent="Para activar Restaurant y Tiendita en una cuenta, primero hay que actualizar la base de datos.";$$('[data-mode]').forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));$("#authForm").addEventListener("submit",envia);$$('input[name="producto"]').forEach(x=>x.addEventListener("change",e=>{if(!multiDisponible&&e.currentTarget.checked&&$$('input[name="producto"]:checked').length>1){e.currentTarget.checked=false;message("Primero hay que ejecutar sql/18-productos-cuenta.sql en Supabase para activar dos POS juntos.","error");}actualizaSeleccion();}));$("#manageBtn").addEventListener("click",()=>{const hidden=$("#licensePanel").hidden;$("#licensePanel").hidden=!hidden;if(hidden)pintaLicencias();});$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();location.replace("./");});
  const {data,error}=await sb.auth.getSession();if(error){show("#authPanel");message("No pudimos revisar la sesión. Intenta iniciar sesión.","error");return;}if(data.session){await entra(data.session);return;}show("#authPanel");if(modo==="alta")setMode("alta");else setMode("entrar");}
init();
})();
