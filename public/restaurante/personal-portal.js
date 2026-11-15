(async function(){
  'use strict';
  const $=s=>document.querySelector(s),ui=['confirm','login','password','businesses','pinForm'];
  const params=new URLSearchParams(location.search),pendingKey='nuvoor_personal_invitacion_v1';
  let invitation=null,ctx=null,session=null,busy=false;
  try{if(params.has('invitacion')){invitation={id:params.get('invitacion'),nonce:params.get('clave'),tipo:params.get('tipo')==='invite'?'invite':'email',password:params.get('password')==='1',cuenta:params.get('cuenta')};sessionStorage.setItem(pendingKey,JSON.stringify(invitation));}else invitation=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch(_){}
  const requested=params.get('cuenta')||invitation?.cuenta;
  const raw=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY);
  function show(id,title,intro){ui.forEach(x=>$('#'+x).hidden=x!==id);$('#title').textContent=title;$('#intro').textContent=intro;$('#status').textContent='';}
  function message(text){$('#status').textContent=text;}
  async function lock(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(x=>x.disabled=true);try{await fn();}catch(e){message(e?.message||'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.');}finally{busy=false;document.querySelectorAll('button').forEach(x=>x.disabled=false);}}
  async function rpc(name,args){const r=await raw.rpc(name,args);if(r.error){if(NuvoorPersonal.missing(r.error))throw new Error('El acceso de personal se está preparando. Pide al administrador que instale el SQL 38 desde Lab.');throw r.error;}return r.data;}
  async function choose(c){ctx=c;show('pinForm',c.pinConfigurado?'Hola, '+c.nombre:'Prepara tu PIN','Entra únicamente a tu perfil de trabajo.');$('#personName').textContent=c.nombre+' · '+({gerente:'Gerente',cajero:'Cajero',mesero:'Mesero',cocina:'Cocina'}[c.rol]||c.rol);$('#businessName').textContent=c.negocio;$('#pinLabel').textContent=c.pinConfigurado?'PIN de trabajo':'Crea un PIN de 4 a 12 números';$('#pinNote').textContent=c.pinConfigurado?'El mismo PIN de tu perfil en Personal y del checador.':'Se guardará en tu perfil de Personal. No es la contraseña de tu correo.';$('#pin').focus();}
  async function afterAuth(){
    const s=await raw.auth.getSession();session=s.data?.session;if(!session){show(invitation?'confirm':'login','Tu acceso de trabajo',invitation?'Confirma el correo al que llegó la invitación.':'Entra con el correo que registró tu administrador.');return;}
    $('#signOut').hidden=false;
    // El cliente ya procesó el retorno de Auth. Retirar el enlace de invitación
    // de la barra y de futuras referencias; su copia sólo dura esta pestaña.
    history.replaceState(null,'',location.pathname+(requested?'?cuenta='+encodeURIComponent(requested):''));
    if(invitation){
      let valid;
      try{valid=await rpc('rest_personal_validar',{p_id:invitation.id,p_nonce:invitation.nonce});}
      catch(e){show('confirm','Confirma tu invitación','Escribe el correo al que llegó la invitación y su código.');throw e;}
      if(valid.requierePassword){show('password','Crea tu contraseña','Tu correo quedó confirmado. Elige tu propia contraseña para Nuvoor.');return;}
      await rpc('rest_personal_aceptar',{p_id:invitation.id,p_nonce:invitation.nonce});sessionStorage.removeItem(pendingKey);invitation=null;
    }
    const list=await rpc('rest_personal_mis_negocios',{});
    if(!list?.length){show('businesses','Sin acceso de personal','Pide al administrador una invitación para tu perfil de Personal.');const a=document.createElement('a');a.href='../acceso.html?producto=restaurant';a.textContent='Ir a mis negocios';$('#businesses').replaceChildren(a);return;}
    const c=requested?list.find(x=>x.cuenta===requested):list.length===1?list[0]:null;
    if(c)return choose(c);
    show('businesses','Elige tu restaurante','Cada negocio conserva sus datos y tus permisos.');$('#businesses').replaceChildren();for(const c of list){const b=document.createElement('button');b.textContent=c.negocio+' · '+c.nombre;b.onclick=()=>choose(c);$('#businesses').append(b);}
  }
  $('#confirm').onsubmit=e=>{e.preventDefault();lock(async()=>{const r=await raw.auth.verifyOtp({email:$('#email').value.trim(),token:$('#code').value.trim(),type:invitation?.tipo||'email'});$('#code').value='';if(r.error)throw new Error('El código no es válido o ya venció. Abre el correo más reciente.');await afterAuth();});};
  $('#login').onsubmit=e=>{e.preventDefault();lock(async()=>{const r=await raw.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPass').value});$('#loginPass').value='';if(r.error)throw new Error('Revisa tu correo y contraseña.');await afterAuth();});};
  async function sendCode(){const email=session?.user?.email||$('#loginEmail').value.trim();if(!email)throw new Error('Primero escribe tu correo.');const u=new URL(location.pathname,location.origin);if(requested)u.searchParams.set('cuenta',requested);const r=await raw.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:u.href}});if(r.error)throw new Error('No se pudo enviar el correo. Espera un minuto y vuelve a intentar.');show('confirm','Confirma tu correo','Abre el enlace del correo más reciente de Nuvoor o escribe su código, si aparece.');$('#email').value=email;message('Si tu correo está registrado, recibirás un mensaje para continuar.');}
  $('#sendCode').onclick=()=>lock(sendCode);$('#verifyEmail').onclick=()=>lock(sendCode);
  $('#password').onsubmit=e=>{e.preventDefault();lock(async()=>{const a=$('#pass').value,b=$('#passAgain').value;$('#pass').value='';$('#passAgain').value='';if(a!==b)throw new Error('Las contraseñas no coinciden. Escríbelas de nuevo.');if(a.length<10)throw new Error('Usa al menos 10 caracteres.');const r=await raw.auth.updateUser({password:a});if(r.error)throw new Error('No se pudo guardar la contraseña. Usa una contraseña distinta y segura.');invitation.password=false;sessionStorage.setItem(pendingKey,JSON.stringify(invitation));await afterAuth();});};
  $('#pinForm').onsubmit=e=>{e.preventDefault();lock(async()=>{if(!ctx)throw new Error('Selecciona tu restaurante.');const pin=$('#pin').value;$('#pin').value='';if(!ctx.pinConfigurado){await rpc('rest_personal_crear_pin',{p_cuenta:ctx.cuenta,p_pin:pin});ctx.pinConfigurado=true;}const r=await rpc('rest_personal_pin',{p_cuenta:ctx.cuenta,p_aparato:NuvoorPersonal.device(session.user.id,ctx.cuenta),p_pin:pin});if(!r?.ok){$('#verifyEmail').hidden=!r?.verificarCorreo;throw new Error(r?.error||'Revisa tu PIN.');}location.replace('./?cuenta='+encodeURIComponent(ctx.cuenta));});};
  $('#signOut').onclick=()=>lock(async()=>{await raw.auth.signOut();sessionStorage.removeItem(pendingKey);location.replace('./personal.html');});
  await lock(afterAuth);
})();
