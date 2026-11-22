(async function(){
 'use strict';const $=s=>document.querySelector(s),status=$('#jornadaEstado');
 try{
  const sb=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY),{data,error}=await sb.auth.getSession();if(error)throw error;
  const requested=new URL(location.href).searchParams.get('cuenta');
  if(!data.session){NuvoorPersonal.portal(requested);return;}
  const list=await sb.rpc('rest_personal_mis_negocios',{});if(list.error)throw list.error;
  let ctx=requested?(list.data||[]).find(x=>x.cuenta===requested):(list.data||[]).length===1?list.data[0]:null;
  let device=ctx?NuvoorPersonal.device(data.session.user.id,ctx.cuenta):requested?sessionStorage.getItem('nuvoor_jornada_aparato_'+requested):null;
  if(!ctx&&requested&&device){
   const r=await sb.rpc('rest_personal_fase1',{p_cuenta:requested,p_aparato:device,p_accion:'leer',p_datos:{}});
   if(!r.error&&r.data?.persona){const p=r.data.equipo.find(p=>p.id===r.data.persona);ctx={cuenta:requested,persona:p.id,nombre:p.nombre,negocio:'Mi negocio'};}
   else{status.textContent='Abre Restaurant con tu PIN y elige Mi jornada. Si falta SQL 39, pide a gerencia que lo instale desde el Lab.';return;}
  }else if(ctx){const lease=await sb.rpc('rest_personal_sesion',{p_cuenta:ctx.cuenta,p_aparato:device});if(lease.error){NuvoorPersonal.portal(ctx.cuenta);return;}}
  if(!ctx){NuvoorPersonal.portal(requested);return;}
  $('#jornadaPersona').textContent=ctx.nombre+' · '+ctx.negocio;$('#jornadaTrabajo').href='./?cuenta='+encodeURIComponent(ctx.cuenta);
  $('#jornadaSalir').onclick=async()=>{await sb.auth.signOut();NuvoorPersonal.portal();};
  $('#jornadaTema').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'day':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('nuvoor_restaurant_tema',theme);};
  let ui;const activities=NuvoorActividades.crear({args:()=>ui.args(),hoy:()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'}),equipo:()=>ui.get()?.equipo||[],gerente:()=>false,mensaje:m=>{status.textContent=m;},client:()=>sb,rpc:async(action,details)=>{const r=await sb.rpc('rest_actividades_rpc',{p_cuenta:ctx.cuenta,p_aparato:device,p_accion:action,p_datos:{...details,solo_mio:true}});if(r.error){const e=Error(r.error.message);e.missing=NuvoorPersonal.missing(r.error);throw e;}return r.data;}});
  ui=NuvoorSemanaUI.crear({extra:(_state,root)=>activities.mount(root),root:$('#jornadaPanel'),hoy:()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'}),gerente:()=>false,persona:()=>ctx.persona,mensaje:m=>{status.textContent=m;},rpc:async(action,details)=>{
   const r=await sb.rpc('rest_personal_fase1',{p_cuenta:ctx.cuenta,p_aparato:device,p_accion:action,p_datos:details});if(r.error){const e=Error(r.error.message);e.missing=NuvoorPersonal.missing(r.error);throw e;}return r.data;
  }});
  status.textContent='Tus checadas se registran en el negocio. Aquí puedes consultar tu jornada y pedir cambios.';await ui.load();
  setInterval(()=>{if(!document.hidden){ui.load();activities.load();}},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)ui.load();});
 }catch(e){status.textContent=e.message||'No se pudo cargar tu jornada. Revisa la conexión.';}
})();
