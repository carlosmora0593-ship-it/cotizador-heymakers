// SMTP y credenciales administrativas permanecen en Supabase.
const SB=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,'');
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const SITE=(Deno.env.get('SITIO_URL')||'https://app.nuvoor.mx').replace(/\/+$/,'');
const EMAIL_KEY=Deno.env.get('RESTAURANT_EMAIL_KEY')||'';
const EMAIL_FROM=Deno.env.get('RESTAURANT_EMAIL_FROM')||'';
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json'}});
const validId=(x)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
async function request(path,token,body=undefined){
  const r=await fetch(SB+path,{method:body===undefined?'GET':'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await r.json().catch(()=>({}));return {ok:r.ok,status:r.status,data};
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function sendInvitation(email,redirect,nombre,negocio,nuevo,solicitud,beforeSend){
  if(!EMAIL_KEY||!EMAIL_FROM)throw new Error('EMAIL_NOT_CONFIGURED');
  // GenerateLink no envía un segundo correo. El enlace y código de Auth se
  // entregan en esta plantilla en español, sin modificar la de Imprenta.
  const link=await request('/auth/v1/admin/generate_link',KEY,{type:nuevo?'invite':'magiclink',email,redirect_to:redirect,...(nuevo?{data:{nombre,negocio,producto:'restaurant'}}:{})});
  const p=link.data?.properties||link.data;
  if(!link.ok||!p?.action_link||!p.email_otp)throw new Error('EMAIL_LINK_NOT_CREATED');
  const action=new URL(p.action_link);
  if(action.origin!==new URL(SB).origin||!action.pathname.endsWith('/auth/v1/verify'))throw new Error('EMAIL_LINK_NOT_VALID');
  const generatedId=link.data?.user?.id||link.data?.id||null;
  await beforeSend(generatedId);
  const html='<!doctype html><html lang="es-MX"><body style="margin:0;padding:24px 12px;background:#fdf0d6;color:#391722;font:16px/1.6 Arial,sans-serif"><div style="max-width:520px;margin:auto;padding:30px;background:#fffbf3;border-radius:20px;border:1px solid #e9d9c6"><p style="letter-spacing:3px;color:#731328;font-weight:bold">NUVOOR RESTAURANT</p><h1 style="font-size:26px">Hola'+(nombre?', '+esc(nombre):'')+'.</h1><p>'+ (negocio?'Tu equipo de <strong>'+esc(negocio)+'</strong> te espera. ':'')+'Confirma tu correo para continuar con tu acceso'+(nuevo?' y crear tu contraseña':'')+'.</p><p style="margin:28px 0"><a href="'+esc(redirect)+'" style="display:inline-block;padding:15px 22px;background:#731328;color:white;border-radius:12px;text-decoration:none;font-weight:bold">Confirmar mi correo</a></p><p>También puedes <a href="'+esc(redirect)+'" style="color:#731328">abrir la pantalla de confirmación</a> y escribir este código:</p><p style="font-size:30px;letter-spacing:5px;color:#731328;font-weight:bold">'+esc(p.email_otp)+'</p><p style="font-size:13px;color:#745a60">El enlace y el código son personales y de un solo uso. Si no esperabas esta invitación, ignora el correo. Nadie de Nuvoor necesita conocer tu contraseña.</p></div></body></html>';
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+EMAIL_KEY,'Content-Type':'application/json','Idempotency-Key':'rest-personal/'+solicitud},body:JSON.stringify({from:'Nuvoor <'+EMAIL_FROM+'>',to:[email],subject:negocio?'Tu acceso a '+String(negocio).slice(0,100)+' · Nuvoor':'Confirma tu acceso · Nuvoor',html}),signal:AbortSignal.timeout(15000)});
  if(!sent.ok)throw new Error('EMAIL_NOT_ACCEPTED');
  // La respuesta de Auth contiene datos privados; sólo se conserva el id.
  return generatedId;
}
export async function handle(req){
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='POST')return reply(405,{error:'Método no permitido.'});
  let invitation=null,solicitud=null;
  try{
    const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(!token||token===KEY)return reply(401,{error:'Vuelve a iniciar sesión.'});
    const who=await request('/auth/v1/user',token);
    if(!who.ok||!who.data?.id)return reply(401,{error:'Tu sesión no está vigente.'});
    const text=await req.text();if(text.length>4096)return reply(413,{error:'La solicitud es demasiado grande.'});
    let input;try{input=JSON.parse(text);}catch(_){return reply(400,{error:'Revisa los datos de la invitación.'});}
    if(input.accion)return reply(400,{error:'Acción no disponible.'});
    if(!EMAIL_KEY||!EMAIL_FROM)return reply(503,{error:'El envío del personal se está configurando. Tu perfil se conserva; no se reservó otra invitación.'});
    if(!validId(input.cuenta)||!validId(input.solicitud)||typeof input.persona!=='string'||input.persona.length>120||typeof input.correo!=='string')return reply(400,{error:'Selecciona el restaurante, la persona y su correo.'});
    solicitud=input.solicitud;
    const prepared=await request('/rest/v1/rpc/rest_personal_preparar',token,{p_cuenta:input.cuenta,p_persona:input.persona,p_correo:input.correo,p_solicitud:solicitud});
    if(!prepared.ok){
      if(prepared.data?.code==='PGRST202')return reply(409,{error:'Primero instala el SQL 38 desde Lab → Base de datos.'});
      return reply(prepared.status===403?403:400,{error:String(prepared.data?.message||'No se pudo preparar la invitación.').slice(0,260)});
    }
    invitation=prepared.data;
    if(invitation.yaEnviada)return reply(200,{ok:true,enviada:true,yaEnviada:true});
    if(invitation.enProceso)return reply(202,{ok:true,enProceso:true});
    if(!invitation.ok||!invitation.nonce)return reply(409,{error:'El envío anterior no se completó. Pulsa Reenviar para intentarlo de nuevo.'});
    const found=await request('/rest/v1/rpc/rest_personal_auth_buscar',KEY,{p_correo:invitation.correo});
    if(!found.ok)throw new Error('AUTH_LOOKUP');
    let user=found.data?.id||null;const isNew=!user;
    const needsPassword=!user||found.data?.requierePassword===true;
    const redirect=new URL(SITE+'/restaurante/personal.html');
    redirect.searchParams.set('invitacion',invitation.id);redirect.searchParams.set('clave',invitation.nonce);redirect.searchParams.set('cuenta',input.cuenta);redirect.searchParams.set('tipo',user?'email':'invite');
    if(needsPassword)redirect.searchParams.set('password','1');
    const generatedId=await sendInvitation(invitation.correo,redirect.href,invitation.nombre,invitation.negocio,!user,solicitud,async id=>{
      if(user&&id&&user!==id)throw new Error('USER_CHANGED');
      user=user||id;if(!user)throw new Error('USER_NOT_BOUND');
      const bound=await request('/rest/v1/rpc/rest_personal_estado_envio',KEY,{p_id:invitation.id,p_solicitud:solicitud,p_usuario:user,p_ok:false,p_nuevo:isNew,p_preparando:true});
      if(!bound.ok||bound.data!==true)throw new Error('USER_NOT_BOUND');
    });
    if(!user)user=generatedId;
    if(!user)throw new Error('USER_NOT_BOUND');
    const saved=await request('/rest/v1/rpc/rest_personal_estado_envio',KEY,{p_id:invitation.id,p_solicitud:solicitud,p_usuario:user,p_ok:true});
    if(!saved.ok||saved.data!==true)throw new Error('STATE_NOT_SAVED');
    return reply(200,{ok:true,enviada:true});
  }catch(_e){
    if(invitation?.id&&solicitud){
      try{await request('/rest/v1/rpc/rest_personal_estado_envio',KEY,{p_id:invitation.id,p_solicitud:solicitud,p_usuario:null,p_ok:false});}catch(_ignored){}
    }
    // No registrar cuerpos, correos, tokens, enlaces ni contraseñas.
    return reply(502,{error:'No se pudo confirmar el envío. Revisa el estado antes de reenviar; no se ha creado otro perfil.'});
  }
}
Deno.serve(handle);
