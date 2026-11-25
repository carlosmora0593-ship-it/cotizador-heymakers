(async function(){
 'use strict';
 const $=s=>document.querySelector(s),status=$('#jornadaEstado');
 const productos={restaurant:['Restaurant','../restaurante/'],taller:['Imprenta','../index.html'],tiendita:['Store','../tiendita/']};
 const requested=new URL(location.href).searchParams.get('cuenta');
 function equipo(){
   const u=new URL('../equipo/',location.href);
   if(requested)u.searchParams.set('cuenta',requested);
   location.replace(u.href);
 }
 try{
   const sb=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_ANON_KEY);
   const {data,error}=await sb.auth.getSession();
   if(error)throw error;
   if(!data.session){equipo();return;}
   let list=await sb.rpc('nuvoor_personal_mis_negocios',{});
   if(NuvoorPersonal.missing(list.error))list=await sb.rpc('rest_personal_mis_negocios',{});
   if(list.error)throw list.error;
   const rows=list.data||[];
   let ctx=requested?rows.find(x=>x.cuenta===requested):rows.length===1?rows[0]:null;
   let device=ctx?NuvoorPersonal.device(data.session.user.id,ctx.cuenta):requested?sessionStorage.getItem('nuvoor_jornada_aparato_'+requested):null;
   if(!ctx&&requested&&device){
     const r=await sb.rpc('rest_personal_fase1',{p_cuenta:requested,p_aparato:device,p_accion:'leer',p_datos:{}});
     const persona=!r.error&&r.data?.equipo?.find(x=>x.id===r.data.persona);
     if(persona){
       const members=await sb.from('mis_empresas').select('id,nombre,producto').eq('id',requested).maybeSingle();
       ctx={cuenta:requested,persona:persona.id,nombre:persona.nombre,negocio:members.data?.nombre||'Mi negocio',producto:members.data?.producto||r.data.producto||'restaurant'};
     }else{status.textContent='Abre el negocio con tu PIN y elige Mi jornada.';return;}
   }else if(ctx){
     const product=ctx.producto||'restaurant';
     const lease=await sb.rpc(product==='restaurant'?'rest_personal_sesion':'nuvoor_personal_sesion',{p_cuenta:ctx.cuenta,p_aparato:device});
     if(lease.error){NuvoorPersonal.portal(ctx.cuenta);return;}
   }
   if(!ctx){equipo();return;}
   const product=productos[ctx.producto]?ctx.producto:'restaurant';
   const [label,route]=productos[product];
   $('#jornadaMarca').textContent='NUVOOR '+label.toUpperCase();
   $('#jornadaPersona').textContent=ctx.nombre+' · '+ctx.negocio;
   $('#jornadaTrabajo').href=route+'?cuenta='+encodeURIComponent(ctx.cuenta);
   $('#jornadaSalir').onclick=async()=>{await sb.auth.signOut();equipo();};
   $('#jornadaTema').onclick=()=>{
     const theme=document.documentElement.dataset.theme==='dark'?'day':'dark';
     document.documentElement.dataset.theme=theme;localStorage.setItem('nuvoor_restaurant_tema',theme);
   };
   const hoy=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
   const mensaje=m=>{status.textContent=m;};
   async function call(func,action,details){
     const r=await sb.rpc(func,{p_cuenta:ctx.cuenta,p_aparato:device,p_accion:action,p_datos:details});
     if(r.error){const e=Error(r.error.message);e.missing=NuvoorPersonal.missing(r.error);throw e;}
     return r.data;
   }
   let ui;
   const activities=NuvoorActividades.crear({producto:product,args:()=>ui.args(),hoy,equipo:()=>ui.get()?.equipo||[],gerente:()=>false,mensaje,client:()=>sb,rpc:(a,d)=>call('rest_actividades_rpc',a,{...d,solo_mio:true})});
   ui=NuvoorSemanaUI.crear({producto:product,extra:(_state,root)=>activities.mount(root),root:$('#jornadaPanel'),hoy,gerente:()=>false,persona:()=>ctx.persona,mensaje,rpc:(a,d)=>call('rest_personal_fase1',a,d)});
   status.textContent='Consulta tu horario, checadas y solicitudes.';
   await ui.load();
   const refrescar=()=>{if(!document.hidden&&!document.querySelector('dialog[open]')){ui.load();activities.load();}};
   setInterval(refrescar,product==='restaurant'?5000:30000);
   document.addEventListener('visibilitychange',refrescar);
 }catch(e){status.textContent=e.message||'No se pudo cargar tu jornada. Revisa la conexión.';}
})();
