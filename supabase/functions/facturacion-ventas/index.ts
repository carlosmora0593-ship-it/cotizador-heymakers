import {prepararFiscalVenta,validarComprobante,centavos} from '../_shared/fiscal-ventas.ts';
const SB=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,''),SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const cab={apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'};
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const respuesta=(status:number,data:any)=>new Response(JSON.stringify(data),{status,headers:{...CORS,'Content-Type':'application/json'}});
class FiscalError extends Error{status:number;constructor(m:string,s=400){super(m);this.status=s;}}
async function rpc(name:string,data:any,token?:string){
 const r=await fetch(SB+'/rest/v1/rpc/'+name,{method:'POST',headers:token?{...cab,Authorization:'Bearer '+token}:cab,body:JSON.stringify(data),signal:AbortSignal.timeout(12000)});
 if(!r.ok){const d=await r.json().catch(()=>({}));throw new FiscalError(String(d.message||'No se pudo consultar el seguimiento fiscal').slice(0,240),r.status===401||r.status===403||d.code==='42501'?403:409);}return r.status===204?null:r.json();
}
function llave(nombre:string){if(!/^FACTURAPI_POS_PRUEBA(_[A-Z0-9_]{1,48})?$/.test(nombre))throw new FiscalError('Falta configurar el emisor de este negocio',409);const k=Deno.env.get(nombre)||'';if(!k.startsWith('sk_test_'))throw new FiscalError('La conexión fiscal de prueba de este negocio está pendiente. Revísala en Ajustes',409);return k;}
async function api(key:string,path:string,body?:any){
 const r=await fetch('https://www.facturapi.io/v2/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Accept-Language':'es'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 if(!r.ok){const d=r.status===400||r.status===422?await r.json().catch(()=>({})):{};const detalle=String(d.message||'').split(key).join('[oculta]').replace(/sk_(?:test|live|user)_[A-Za-z0-9_-]+/g,'[oculta]').slice(0,150);throw new FiscalError(r.status===401?'El proveedor no aceptó la conexión de prueba. Revisa el emisor en Ajustes':'El proveedor no completó la operación. '+detalle+' La venta conserva su seguimiento para reintentar',503);}return r;
}
const hex=async(b:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function guardarOriginal(key:string,f:any,format:string,uuid:string){
 const r=await api(key,'invoices/'+encodeURIComponent(f.proveedor_id)+'/'+format),bytes=await r.arrayBuffer(),txt=new TextDecoder().decode(bytes);
 if(bytes.byteLength<20||bytes.byteLength>10485760||format==='pdf'&&!txt.startsWith('%PDF-'))throw Error('El original PDF no está listo todavía');
 if(format==='xml'){
  const attrs=txt.match(/<(?:\w+:)?Comprobante\b([^>]*)>/)?.[1]||'',total=attrs.match(/\bTotal=["']([\d.]+)["']/)?.[1];
  const uuidXml=txt.match(/<(?:\w+:)?TimbreFiscalDigital\b[^>]*\bUUID=["']([^"']+)["']/)?.[1];
  if(!total||centavos(total)!==Number(f.total_centavos)||uuidXml?.toLowerCase()!==uuid.toLowerCase())throw Error('El XML no coincide con el comprobante esperado');
 }
 const sha=await hex(bytes),ref=f.cuenta_id+'/'+f.id+'/test/'+f.proveedor_id+'/'+sha+'.'+format;
 const up=await fetch(SB+'/storage/v1/object/facturas-ventas/'+ref.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{...cab,'Content-Type':format==='pdf'?'application/pdf':'application/xml','x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(18000)});
 if(!up.ok){const d=await up.json().catch(()=>({}));if(up.status!==409&&d.error!=='Duplicate'&&d.statusCode!=='409')throw Error('No se pudo conservar el original. Reintenta la descarga sin generar otra factura');}return {ref,sha};
}
const limpio=(f:any)=>{if(!f)return null;const {solicitud,secreto_nombre,turno,hasta,...x}=f;return {...x,receptor:solicitud?.customer,uso:solicitud?.use,forma:solicitud?.payment_form};};
async function procesa(f:any,turno:string){
 try{
  const key=llave(f.secreto_nombre),org=await(await api(key,'organizations/me')).json();if(org.id!==f.organizacion)throw Error('La conexión pertenece a otro emisor. Revisa Ajustes; no se emitió con esta conexión');
  const d=await(await api(key,f.proveedor_id?'invoices/'+encodeURIComponent(f.proveedor_id):'invoices',f.proveedor_id?undefined:f.solicitud)).json();
  const v=validarComprobante(d,Number(f.total_centavos));
  await rpc('fiscal_pos_resultado',{p_id:f.id,p_token:turno,p_datos:{proveedor_id:v.id,uuid_sat:v.uuid},p_final:false});f.proveedor_id=v.id;
  if(!v.uuid)throw Error('El proveedor está preparando el comprobante. Consulta o reintenta el mismo documento');
  const pdf=await guardarOriginal(key,f,'pdf',v.uuid),xml=await guardarOriginal(key,f,'xml',v.uuid);
  await rpc('fiscal_pos_resultado',{p_id:f.id,p_token:turno,p_datos:{pdf_ref:pdf.ref,xml_ref:xml.ref,pdf_sha256:pdf.sha,xml_sha256:xml.sha},p_final:true});
 }catch(e){const message=e instanceof FiscalError?e.message:String((e as Error).message||'No se pudo completar el comprobante').replace(/sk_(?:test|live|user)_[A-Za-z0-9_-]+/g,'[oculta]').slice(0,240);
  await rpc('fiscal_pos_resultado',{p_id:f.id,p_token:turno,p_datos:{error:message},p_final:true});}
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});if(req.method!=='POST')return respuesta(405,{error:'Método no permitido'});
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return respuesta(401,{error:'Inicia sesión en tu negocio'});
 try{
  const u=await fetch(SB+'/auth/v1/user',{headers:{apikey:SERVICE,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});if(!u.ok)return respuesta(401,{error:'Tu sesión ya no está vigente'});const user=await u.json();
  const body=await req.json();if(!/^[a-f0-9-]{36}$/i.test(body.cuenta||'')||!['taller','restaurant','tiendita'].includes(body.sistema)||String(body.documento||'').length>200)throw new FiscalError('Cuenta o documento incorrectos');
  // El alta se hace desde Lab, verificando una llave TEST que el titular ya guardó.
  if(body.accion==='asignar_emisor'){
   if(await rpc('lab_puede_facturar',{},token)!==true)return respuesta(403,{error:'Sólo el equipo financiero de Nuvoor puede asociar emisores'});
   const key=llave(String(body.secreto_nombre||'')),org=await(await api(key,'organizations/me')).json();if(!/^[a-zA-Z0-9_-]{1,100}$/.test(org.id||''))throw Error('Organización inválida');
   await rpc('fiscal_pos_emisor_asigna',{p_cuenta:body.cuenta,p_org:org.id,p_secreto:body.secreto_nombre,p_razon:org.legal?.name||org.name||'',p_rfc:org.legal?.tax_id||'',p_cp:org.legal?.address?.zip||''});
   return respuesta(200,{configurada:true,ambiente:'test'});
  }
  if(!['estado','emitir','reintentar','archivo'].includes(body.accion))throw new FiscalError('Acción no válida');
  const write=['emitir','reintentar'].includes(body.accion),params={p_cuenta:body.cuenta,p_sistema:body.sistema,p_documento:String(body.documento||''),p_escritura:write};
  const ctx=await rpc('fiscal_pos_contexto',params,token);
  if(body.accion==='estado')return respuesta(200,{emisor:ctx.emisor,factura:limpio(ctx.factura),ambiente:'test'});
  if(body.accion==='archivo'){
   const f=ctx.factura,format=body.formato;if(!['pdf','xml'].includes(format)||!f||f.estado!=='timbrada'||!f[format+'_ref'])throw new FiscalError('El original todavía no está disponible',409);
   const r=await fetch(SB+'/storage/v1/object/sign/facturas-ventas/'+f[format+'_ref'].split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:cab,body:JSON.stringify({expiresIn:60}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('No se pudo abrir el original');const d=await r.json();
   return respuesta(200,{url:SB+'/storage/v1'+d.signedURL});
  }
  if(!ctx.emisor)throw new FiscalError('Configura el emisor del negocio en Ajustes → Facturación electrónica antes de generar',409);
  if(!body.documento)throw new FiscalError('Elige una venta');
  const existing=ctx.factura;
  if(existing?.estado==='timbrada')return respuesta(200,{emisor:ctx.emisor,factura:limpio(existing),ambiente:'test'});
  if(body.accion==='emitir'&&existing)throw new FiscalError('Esta venta ya tiene una solicitud. Usa Consultar o Reintentar para conservar el mismo comprobante',409);
  if(body.accion==='reintentar'&&!existing)throw new FiscalError('Todavía no hay una solicitud para reintentar');
  const requestId='nuvoor-pos-test-'+body.cuenta+'-'+body.sistema+'-'+body.documento;
  let normalized:any=null;if(!existing)try{normalized=prepararFiscalVenta(body.sistema,ctx.documento,body.receptor,requestId);}catch(e){throw new FiscalError((e as Error).message);}
  const turno=crypto.randomUUID(),job=await rpc('fiscal_pos_reserva',{p_actor:user.id,p_cuenta:body.cuenta,p_sistema:body.sistema,p_documento:body.documento,p_firma:ctx.firma,p_solicitud:normalized?.body||null,p_total:normalized?.total||0,p_token:turno});
  if(job.adquirido)await procesa(job.factura,turno);
  const result=await rpc('fiscal_pos_contexto',{...params,p_escritura:false},token);return respuesta(200,{emisor:result.emisor,factura:limpio(result.factura),ambiente:'test'});
 }catch(e){const err=e as FiscalError;return respuesta(err.status||400,{error:err.status?err.message:'No se pudo preparar la factura. Revisa el desglose de la venta y los datos fiscales',ambiente:'test'});}
});
