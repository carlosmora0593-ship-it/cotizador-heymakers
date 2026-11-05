/* Facturación de prueba dentro de los formularios existentes. Sin llaves PAC,
   certificados, correos automáticos ni navegación a una sección nueva. */
(()=>{'use strict';
 const cajas=new WeakMap();
 async function pedir(getContext,accion,extra={}){
  const c=getContext();if(!c?.cliente||!c.cuenta)throw Error('Conecta la cuenta de este negocio para facturar');
  const {data,error}=await c.cliente.auth.getSession();if(error||!data?.session)throw Error('Vuelve a iniciar sesión para consultar la facturación');
  if(getContext()?.cuenta!==c.cuenta)throw Error('La cuenta cambió. Vuelve a abrir la venta');
  const url=String(window.CONFIG?.SUPABASE_URL||'').replace(/\/+$/,'');
  const r=await fetch(url+'/functions/v1/facturacion-ventas',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:CONFIG.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({accion,cuenta:c.cuenta,sistema:c.sistema,documento:c.documento||'',...extra}),signal:AbortSignal.timeout(90000)});
  if(getContext()?.cuenta!==c.cuenta)throw Error('La cuenta cambió. Vuelve a abrir la venta');
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo consultar la facturación de prueba');return d;
 }
 function boton(texto,action,primary,classes){const b=document.createElement('button');b.type='button';b.className=primary?classes.primary:classes.secondary;b.textContent=texto;b.dataset.fiscalAccion=action;return b;}
 function montar(host,options){
  if(!host)return;
  let box=cajas.get(host);
  if(!box){
   const root=document.createElement('div');root.className='nvFiscalIntegrada';root.style.cssText='border-top:1px solid var(--line-soft,var(--line,#ccd4df));margin-top:16px;padding-top:14px';
   const label=document.createElement('p');label.className='note';label.textContent='Facturapi · Pruebas. Sin validez fiscal.';
   const state=document.createElement('p');state.className='note';state.setAttribute('role','status');state.setAttribute('aria-live','polite');state.style.margin='10px 0';
   const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
   const classes=options.classes||{primary:'btn primary',secondary:'btn'};
   for(const [text,action,primary] of [['Generar factura de prueba','emitir',true],['Consultar','estado',false],['Reintentar','reintentar',false],['Ver PDF','pdf',false],['Descargar XML','xml',false]])actions.append(boton(text,action,primary,classes));
   root.append(label,state,actions);host.append(root);box={root,state,actions,options,busy:false,result:null,generation:0};cajas.set(host,box);
   actions.addEventListener('click',async ev=>{const b=ev.target.closest('[data-fiscal-accion]');if(!b||box.busy)return;
    const opt=box.options,generation=box.generation,context=opt.context(),action=b.dataset.fiscalAccion;if(!context)return;
    box.busy=true;box.error=false;pintar(box);
    try{
     if(action==='emitir'){await opt.preparar();if(generation!==box.generation||opt.context()?.cuenta!==context.cuenta)throw Error('La venta cambió. Vuelve a abrirla');}
     const extra=action==='emitir'?{receptor:opt.receptor()}:action==='pdf'||action==='xml'?{formato:action}:{};
     const d=await pedir(opt.context,action==='pdf'||action==='xml'?'archivo':action,extra);
     if(generation!==box.generation)return;
     if(action==='pdf'||action==='xml'){
      const expected=new URL(CONFIG.SUPABASE_URL);const target=new URL(d.url);if(target.origin!==expected.origin||!target.pathname.startsWith('/storage/v1/object/sign/facturas-ventas/'))throw Error('El enlace del original no es válido');
      const r=await fetch(target.href,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('El enlace caducó. Vuelve a solicitar el original');const blob=await r.blob();
      if(generation!==box.generation||opt.context()?.cuenta!==context.cuenta)throw Error('La cuenta cambió');
      const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='factura-prueba-'+context.documento.replace(/[^a-zA-Z0-9_-]/g,'_')+'.'+action;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
     }else{box.result=d;if(d.factura&&opt.resultado)await opt.resultado(d.factura);pintar(box);}
    }catch(e){if(generation===box.generation){box.error=true;box.state.textContent=e.name==='TimeoutError'?'La respuesta tardó. Usa Consultar antes de volver a intentar la misma factura.':e.message||'No se pudo completar la operación';}}
    finally{if(generation===box.generation){box.busy=false;pintar(box,box.error);}}
   });
  }
  box.options=options;box.generation++;box.result=null;box.busy=false;pintar(box);const version=box.generation;
  pedir(options.context,'estado').then(d=>{if(version!==box.generation)return;box.result=d;pintar(box);}).catch(e=>{if(version===box.generation)box.state.textContent=e.message;});
  return box;
 }
 function pintar(box,preservarTexto=false){
  const f=box.result?.factura,emisor=box.result?.emisor;
  if(!preservarTexto)box.state.textContent=box.busy?'Consultando el comprobante…':!box.result?'Comprobando conexión…':!emisor?'Emisor pendiente. Revísalo en Ajustes → Facturación electrónica.':!f?'Emisor conectado en pruebas. Revisa los datos del cliente antes de generar.':f.estado==='timbrada'?'Factura de prueba preparada · UUID '+f.uuid_sat+' · originales PDF/XML disponibles.':f.error||'El comprobante está en proceso. Consulta antes de reintentar.';
  box.actions.querySelectorAll('button').forEach(b=>{const a=b.dataset.fiscalAccion;b.hidden=a==='emitir'?!!f:a==='reintentar'?!f||f.estado==='timbrada':a==='pdf'||a==='xml'?!f||f.estado!=='timbrada':false;b.disabled=box.busy||a==='emitir'&&!emisor;});
 }
 function emisor(host,getContext,classes={secondary:'btn'}){
  if(!host||host.querySelector('[data-fiscal-emisor]'))return;
  const wrap=document.createElement('div');wrap.dataset.fiscalEmisor='1';wrap.style.marginTop='14px';const p=document.createElement('p');p.className='note';p.setAttribute('role','status');p.textContent='Conexión Facturapi de prueba de este negocio.';const b=boton('Comprobar conexión de prueba','estado',false,classes);wrap.append(p,b);host.append(wrap);
  b.addEventListener('click',async()=>{b.disabled=true;p.textContent='Consultando…';try{const d=await pedir(getContext,'estado');p.textContent=d.emisor?'Emisor: '+(d.emisor.razon||'Configurado')+(d.emisor.rfc?' · '+d.emisor.rfc:'')+' · sólo pruebas.':'Emisor sin conectar. Nuvoor debe asociar la organización de prueba de este negocio. Sus certificados se cargan directamente con el proveedor.';}catch(e){p.textContent=e.message;}finally{b.disabled=false;}});
 }
 window.NuvoorFiscal={montar,emisor};
})();
