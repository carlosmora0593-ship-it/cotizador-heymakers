(()=>{"use strict";
const P={taller:{name:"Nuvoor Imprenta",href:"./taller.html",example:"https://nuvoor.mx/#imprenta",icon:"✂",sub:"Cotiza y organiza producción"},restaurant:{name:"Nuvoor Restaurant",href:"./restaurante/",example:"https://nuvoor.mx/#restaurant",icon:"♨",sub:"Mesas, comandas y caja"},tiendita:{name:"Nuvoor Store",href:"./tiendita/",example:"https://nuvoor.mx/#store",icon:"▤",sub:"Mostrador, caja e inventario"}};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],params=new URLSearchParams(location.search),validos=Object.keys(P);
let sb=null,sesion=null,cuenta=null,productos=[],modo="entrar",requested=[];
function esc(s){return String(s||"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function lista(xs){return [...new Set((Array.isArray(xs)?xs:[]).filter(x=>validos.includes(x)))];}
function show(id){["#authPanel","#accountPanel","#loadingPanel"].forEach(s=>$(s).hidden=s!==id);}
function message(t,k=""){const n=$("#msg");n.textContent=t;n.className="msg"+(k?" "+k:"");}
function detalleError(e){const code=String(e&&e.code||"").trim(),msg=String(e&&e.message||"").trim().replace(/[\r\n\t]+/g," ").slice(0,240);return [code,msg].filter(Boolean).join(" · ")||"La base no devolvió más detalles.";}
function limpiaSesionLocal(){try{const project=new URL(CONFIG.SUPABASE_URL).hostname.split(".")[0];localStorage.removeItem("sb-"+project+"-auth-token");}catch(_){}}
function setMode(k){if(k==="alta")k="entrar";modo=k;const alta=k==="alta";$$('[data-mode]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===k)));$("#signupFields").hidden=!alta;$("#personName").required=alta;$("#businessName").required=alta;$("#password").autocomplete=alta?"new-password":"current-password";$("#authTitle").textContent=alta?"Empieza gratis con Nuvoor":"Entra a Nuvoor";$("#authSub").textContent=alta?"Crea tu cuenta y abre el POS que elegiste.":"Accede a los productos de tu cuenta.";$("#submit").textContent=alta?"Crear cuenta y probar 15 días":"Iniciar sesión";message("");if(alta)seleccionInicial();}
function seleccionInicial(){const pick=params.get("producto"),defaults=pick&&P[pick]?[pick]:["taller"];$$('input[name="producto"]').forEach(x=>x.checked=defaults.includes(x.value));actualizaSeleccion();}
function actualizaSeleccion(){requested=$$('input[name="producto"]:checked').map(x=>x.value).slice(0,1);}
function destino(k){location.replace(P[k].href);}
async function leeCuenta(){
  const errores=[];
  async function porId(id){
    if(!id)return null;
    let r=await sb.from("cuentas").select("id,nombre,producto,productos,plan,estado,vence,ciclo,mp_preapproval_id").eq("id",id).maybeSingle();
    if(r.error&&/productos/i.test(r.error.message||"")){r=await sb.from("cuentas").select("id,nombre,producto,plan,estado,vence,ciclo,mp_preapproval_id").eq("id",id).maybeSingle();}
    if(r.error){errores.push(r.error);return null;}return r.data||null;
  }
  let id=null,cuentaEncontrada=null;
  try{const r=await sb.rpc("mi_cuenta");if(r.error)errores.push(r.error);else id=Array.isArray(r.data)?r.data[0]:r.data;}catch(e){errores.push(e);}
  cuentaEncontrada=await porId(id);
  if(!cuentaEncontrada){
    try{const r=await sb.from("mis_empresas").select("id,activa");if(r.error)errores.push(r.error);else{const empresas=r.data||[],activa=empresas.find(x=>x.activa)||empresas[0];if(activa)cuentaEncontrada=await porId(activa.id);}}catch(e){errores.push(e);}
  }
  if(!cuentaEncontrada){
    try{const r=await sb.from("membresias").select("cuenta_id,creado").eq("usuario_id",sesion.user.id).order("creado");if(r.error)errores.push(r.error);else if(r.data&&r.data[0])cuentaEncontrada=await porId(r.data[0].cuenta_id);}catch(e){errores.push(e);}
  }
  if(!cuentaEncontrada){
    let perfil=null;
    for(let i=0;i<5;i++){try{const r=await sb.from("perfiles").select("cuenta_id,cuenta_activa").eq("id",sesion.user.id).maybeSingle();if(r.error){errores.push(r.error);break;}if(r.data){perfil=r.data;break;}await new Promise(r=>setTimeout(r,350));}catch(e){errores.push(e);break;}}
    if(perfil)cuentaEncontrada=await porId(perfil.cuenta_activa||perfil.cuenta_id);
  }
  if(!cuentaEncontrada){const e=new Error("No pudimos abrir la cuenta de este negocio.");e.code=errores[0]&&errores[0].code||"CUENTA_NO_ENCONTRADA";e.detail=detalleError(errores[0]);throw e;}
  cuenta=cuentaEncontrada;productos=lista(cuenta.productos);if(!productos.length&&P[cuenta.producto])productos=[cuenta.producto];if(!productos.length)productos=["taller"];
  return cuenta;
}
function vigencia(){return cuenta&&cuenta.estado==="activa"&&new Date(cuenta.vence)>new Date();}
function pintaCuenta(){
  show("#accountPanel");$("#accountTitle").textContent=cuenta.nombre||"Tu cuenta Nuvoor";$("#accountEmail").textContent=sesion.user.email||"";
  const days=Math.max(0,Math.ceil((new Date(cuenta.vence)-new Date())/86400000));
  $("#accountStatus").innerHTML=vigencia()?'<strong>'+(cuenta.plan==="prueba"?"Prueba gratis activa":"Licencia activa")+'</strong>'+(cuenta.plan==="prueba"?"Te quedan "+days+" día(s), sin tarjeta.":"Tu cuenta y sus productos están listos."):'<strong>Activa una licencia para seguir</strong>Tu cuenta conserva el acceso y la información.';
  const pane=$("#productOptions");
  if(productos.length===1&&!params.has("gestion")&&!params.has("planes")&&!params.has("pago")){destino(productos[0]);return;}
  pane.innerHTML='<p class="sub">'+(productos.length>1?"Consulta qué ofrece cada POS o abre el que vas a usar.":"Revisa el ejemplo de tu producto o abre el POS.")+'</p><div class="appGrid">'+productos.map(k=>'<a class="appChoice" href="'+P[k].example+'"><i>'+P[k].icon+'</i><span>'+esc(P[k].name)+'<small>Ver ejemplo y ventajas →</small></span></a>').join("")+'</div><div class="appOpenGrid">'+productos.map(k=>'<a class="appOpen" href="'+P[k].href+'">Abrir '+esc(P[k].name)+' →</a>').join("")+'</div>';
  if(params.get("pago")==="ok"){$("#accountStatus").innerHTML='<strong>Pago recibido</strong>Mercado Pago avisó a Nuvoor. La licencia puede tardar unos segundos en reflejarse.';}
  if(params.has("planes")||params.has("gestion")||params.has("pago"))pintaLicencias();
}
function pintaLicencias(){
  $("#licensePanel").hidden=false;
  const host=$("#licenseProducts");
  const notice=$("#paymentNotice"),cards=$("#licenseCards");
  if(productos.length>1){
    host.innerHTML='<span class="help">Esta cuenta conserva varios sistemas de una configuración anterior.</span>';
    cards.innerHTML="";notice.hidden=false;notice.textContent="Para cambiar licencias sin quitar un acceso existente, cada sistema debe tener su propia cuenta.";return;
  }
  const producto=productos[0]||cuenta.producto||"taller";
  host.innerHTML='<span class="help">'+esc(P[producto].name)+' · una licencia para este sistema</span>';
  renderLicencias(producto);
}
function renderLicencias(producto){
  const esImprenta=producto==="taller";
  $("#licenseIntro").textContent=esImprenta?"Pro incluye hasta 4 sucursales de Imprenta.":"Cada licencia cubre un sistema. Multiempresa es para hasta 4 sucursales de ese mismo sistema.";
  const planes=esImprenta?[
    {id:"basico",name:"Básico",price:98,description:"$98 al mes los primeros 3 meses; después $199",ready:false},
    {id:"maker",name:"Maker",price:449,info:"Hasta 3 usuarios · compras e inventario",ready:true},
    {id:"pro",name:"Pro",price:899,info:"Usuarios sin límite · caja y reportes · incluye hasta 4 sucursales",ready:true}
  ]:[
    {id:"basico",name:"Estándar",price:98,description:"$98 al mes los primeros 3 meses; después $199",ready:false},
    {id:"multiempresa",name:"Multiempresa",price:899,info:"Hasta 4 sucursales del mismo sistema",ready:false}
  ];
  $("#licenseCards").innerHTML=planes.map(x=>'<article class="licCard"><b>'+x.name+'</b><strong>$'+x.price.toLocaleString("es-MX")+' <small>MXN / mes</small></strong><small>'+(x.description||x.info)+'</small><button type="button" '+(x.ready?'data-plan="'+x.id+'"':'disabled aria-label="'+x.name+': próximamente"')+'>'+(x.ready?'Contratar':'Próximamente')+'</button></article>').join("");
  $("#licenseCards").querySelectorAll("[data-plan]").forEach(b=>b.addEventListener("click",()=>contrata(b.dataset.plan,[producto])));
  const notice=$("#paymentNotice");
  if(cuenta.mp_preapproval_id){notice.hidden=false;notice.textContent="Hay una suscripción de Mercado Pago registrada. Para cambiar de licencia sin generar otro cobro, cancela la actual en Mercado Pago y después vuelve aquí.";}
  else if(planes.some(x=>!x.ready)){
    notice.hidden=false;
    notice.textContent=esImprenta
      ? "La promoción estará disponible para contratar cuando se actualicen los cobros. Pro ya incluye hasta 4 sucursales."
      : "La promoción y Multiempresa estarán disponibles para contratar cuando se actualicen los cobros y las sucursales.";
  }
  else notice.hidden=true;
}
async function contrata(plan,chosen){
  const b=$("#licenseCards").querySelector('[data-plan="'+plan+'"]');if(!b)return;b.disabled=true;b.textContent="Abriendo Mercado Pago…";
  try{const {data}=await sb.auth.getSession();const url=String(CONFIG.SUPABASE_URL).replace(/\/+$/,"");const r=await fetch(url+"/functions/v1/crear-suscripcion",{method:"POST",headers:{"Content-Type":"application/json","apikey":CONFIG.SUPABASE_ANON_KEY,"Authorization":"Bearer "+data.session.access_token},body:JSON.stringify({plan,ciclo:"mensual",productos:chosen})});let d={};try{d=await r.json();}catch(_){}if(!r.ok||!d.init_point)throw new Error(d.error||"No se pudo iniciar el pago.");location.assign(d.init_point);}catch(e){b.disabled=false;b.textContent="Contratar";const notice=$("#paymentNotice");notice.hidden=false;notice.textContent=e.message;}
}
async function entra(session){sesion=session;show("#loadingPanel");try{await leeCuenta();$("#accountErrorDetail").hidden=true;$("#accountErrorDetail").textContent="";pintaCuenta();}catch(e){show("#accountPanel");$("#accountTitle").textContent="No pudimos abrir tu cuenta";$("#accountEmail").textContent=sesion.user.email||"";$("#accountStatus").textContent=e.message||"No pudimos abrir la cuenta de este negocio.";const d=$("#accountErrorDetail");d.textContent=e.detail||detalleError(e);d.hidden=false;$("#productOptions").innerHTML="";}}
async function envia(e){e.preventDefault();const alta=modo==="alta",email=$("#email").value.trim(),password=$("#password").value;if(alta){actualizaSeleccion();if(!requested.length){message("Selecciona el POS que quieres probar.","error");return;}}
  const b=$("#submit");b.disabled=true;b.textContent=alta?"Creando tu cuenta…":"Entrando…";message("");
  try{let data,error;if(alta){({data,error}=await sb.auth.signUp({email,password,options:{data:{nombre:$("#personName").value.trim(),negocio:$("#businessName").value.trim()||P[requested[0]].name,producto:requested[0],productos:requested}}}));}else{({data,error}=await sb.auth.signInWithPassword({email,password}));}if(error)throw error;if(!data.session){message("Te mandamos un correo para confirmar tu cuenta. Después vuelve aquí e inicia sesión para abrir tu POS.","good");setMode("entrar");$("#email").value=email;$("#password").value="";b.disabled=false;b.textContent="Iniciar sesión";return;}await entra(data.session);if(alta&&params.has("planes")){params.set("gestion","1");history.replaceState({},"",location.pathname+"?gestion=1");await leeCuenta();pintaCuenta();}}
  catch(e){message(e.message||"No se pudo abrir la cuenta.","error");b.disabled=false;b.textContent=alta?"Crear cuenta y probar 15 días":"Iniciar sesión";}}
async function init(){show("#loadingPanel");if(!window.CONFIG||!window.supabase){show("#authPanel");message("Falta cargar la conexión de Nuvoor. Intenta actualizar la página.","error");return;}sb=window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY);const hint=$("#multiHint");if(hint)hint.textContent="Cada cuenta corresponde a un sistema. Multiempresa permite hasta 4 sucursales de ese mismo sistema.";$$('[data-mode]').forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));$("#authForm").addEventListener("submit",envia);$$('input[name="producto"]').forEach(x=>x.addEventListener("change",actualizaSeleccion));$("#manageBtn").addEventListener("click",()=>{const hidden=$("#licensePanel").hidden;$("#licensePanel").hidden=!hidden;if(hidden)pintaLicencias();});$("#logout").addEventListener("click",async()=>{try{await sb.auth.signOut();}catch(_){}finally{limpiaSesionLocal();location.replace("./acceso.html");}});
  const {data,error}=await sb.auth.getSession();if(error){show("#authPanel");message("No pudimos revisar la sesión. Intenta iniciar sesión.","error");return;}if(data.session){await entra(data.session);return;}show("#authPanel");if(modo==="alta")setMode("alta");else setMode("entrar");}
init();
})();
