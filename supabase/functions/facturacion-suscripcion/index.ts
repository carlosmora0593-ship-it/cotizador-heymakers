/* Conexión fiscal de PRUEBA. La llave nunca sale del servidor.
   La cola sólo acepta solicitudes financieras autorizadas y pagos de prueba.
   Al arrancar se comprueba la conexión y se atiende un trabajo YA autorizado;
   despertar el servidor no crea ni autoriza trabajos nuevos. No envía correos. */
const SB=(Deno.env.get('SUPABASE_URL')||'').replace(/\/+$/,''),SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const KEY=Deno.env.get('FACTURAPI_LLAVE_PRUEBA')||'';
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const cab={apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'};
const response=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...CORS,'Content-Type':'application/json'}});
async function rpc(name:string,data:unknown,token?:string){
 const r=await fetch(SB+'/rest/v1/rpc/'+name,{method:'POST',headers:token?{...cab,Authorization:'Bearer '+token}:cab,body:JSON.stringify(data),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new Error('No se pudo guardar o consultar el seguimiento fiscal.');return r.status===204?null:await r.json();
}
async function api(path:string,body?:unknown){
 if(!KEY.startsWith('sk_test_'))throw new Error('Guarda la Test Secret Key de Facturapi en FACTURAPI_LLAVE_PRUEBA.');
 const r=await fetch('https://www.facturapi.io/v2/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json','Accept-Language':'es'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(18000)});
 if(!r.ok){if(r.status===401)throw new Error('Facturapi no aceptó la llave de prueba. Revisa que esté vigente.');
  const d=r.status===400||r.status===422?await r.json().catch(()=>({})):{};
  const detalle=String(d.message||'').split(KEY).join('[oculta]').replace(/sk_(?:test|live|user)_[A-Za-z0-9_-]+/g,'[oculta]').slice(0,160);
  throw new Error('Facturapi no completó la operación (HTTP '+r.status+'). '+detalle);}
 return r;
}
let org:string|null=null;
async function comprobar(){
 try{const o=await(await api('organizations/me')).json();if(!/^[a-zA-Z0-9_-]{1,100}$/.test(o.id||''))throw new Error('No se pudo verificar la organización emisora.');org=o.id;
  await rpc('facturapi_conexion_guarda',{p_disponible:true,p_organizacion:org,p_mensaje:'Facturapi conectado en pruebas. Emisor fiscal real pendiente.'});
 }catch(e){org=null;await rpc('facturapi_conexion_guarda',{p_disponible:false,p_organizacion:null,p_mensaje:(e as Error).message});}
}
const hex=async(b:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function archivo(id:string,format:string,cuenta:string,factura:number,uuid:string){
 const r=await api('invoices/'+encodeURIComponent(id)+'/'+format),b=await r.arrayBuffer();
 if(b.byteLength<20||b.byteLength>10485760)throw new Error('El original '+format.toUpperCase()+' no está disponible todavía.');
 const t=new TextDecoder().decode(b);
 if(format==='pdf'&&!t.startsWith('%PDF-')||format==='xml'&&(!t.includes('Comprobante')||!t.toLowerCase().includes(uuid.toLowerCase())))throw new Error('El archivo recibido no coincide con la factura de prueba.');
 const sha=await hex(b),ref=cuenta+'/'+factura+'/prueba/'+id+'/'+sha+'.'+format;
 const up=await fetch(SB+'/storage/v1/object/facturas-suscripcion/'+ref.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{...cab,'Content-Type':format==='pdf'?'application/pdf':'application/xml','x-upsert':'false'},body:b,signal:AbortSignal.timeout(18000)});
 // Ruta con checksum: un duplicado contiene exactamente los mismos bytes.
 if(!up.ok){const d=await up.json().catch(()=>({}));if(up.status!==409&&d.error!=='Duplicate'&&d.statusCode!=='409')throw new Error('No se pudo conservar el original '+format.toUpperCase()+'. Reintenta el archivo.');}
 let subtotal:number|undefined,total:number|undefined;
 if(format==='xml'){
  const attrs=t.match(/<(?:\w+:)?Comprobante\b([^>]*)>/)?.[1]||'';
  subtotal=Number(attrs.match(/\bSubTotal=["']([\d.]+)["']/)?.[1]);total=Number(attrs.match(/\bTotal=["']([\d.]+)["']/)?.[1]);
  if(!Number.isFinite(subtotal)||!Number.isFinite(total)||Number(subtotal)>Number(total)||Number(subtotal)<0)throw new Error('Los importes del XML no se pudieron verificar.');
 }
 return {ref,sha,subtotal,total};
}
function payload(p:any,f:any){return {
 customer:{legal_name:'Dunder Mifflin',tax_id:'ABC101010111',tax_system:'601',address:{zip:'85900'}},
 items:[{quantity:1,product:{description:'PRUEBA de integración · Suscripción Nuvoor',product_key:'01010101',unit_key:'E48',price:Number(p.importe_centavos)/100,tax_included:true,taxes:[{type:'IVA',rate:0.16}]}}],
 type:'I',payment_form:'28',payment_method:'PUE',use:'G03',currency:'MXN',
 external_id:'nuvoor-prueba-'+f.id,idempotency_key:'nuvoor-prueba-'+org+'-'+f.id,
 pdf_custom_section:'PRUEBA DE INTEGRACIÓN. Receptor ficticio. Sin validez fiscal. No se envía al cliente.'
};}
let trabajando=false;
async function procesar(){
 if(!org||trabajando)return;trabajando=true;const token=crypto.randomUUID();let f:any;
 try{
  const job=await rpc('facturapi_reserva',{p_token:token,p_organizacion:org});if(!job)return;
  f=job.factura;const p=job.pago;if(p.prueba!==true||p.moneda!=='mxn')throw new Error('Sólo se permiten pagos de prueba en MXN.');
  const body=job.solicitud||payload(p,f);
  await rpc('facturapi_anota',{p_factura:f.id,p_token:token,p_datos:{solicitud:body},p_final:false});
  const d=await(await api(f.proveedor_id?'invoices/'+encodeURIComponent(f.proveedor_id):'invoices',f.proveedor_id?undefined:body)).json();
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(d.id||'')||d.livemode!==false||Math.round(Number(d.total)*100)!==Number(p.importe_centavos))throw new Error('La respuesta no corresponde al importe y ambiente de prueba esperados.');
  const uuid=d.uuid||d.stamp?.uuid;
  await rpc('facturapi_anota',{p_factura:f.id,p_token:token,p_datos:{proveedor_id:d.id,proveedor_estado:d.status,uuid_sat:uuid||null,serie:d.series||'',folio:String(d.folio_number||'')},p_final:false});
  if(d.status!=='valid'||!uuid)throw new Error('Facturapi está preparando el comprobante. Reintenta para consultar el mismo documento.');
  const pdf=await archivo(d.id,'pdf',p.cuenta_id,f.id,uuid),xml=await archivo(d.id,'xml',p.cuenta_id,f.id,uuid);
  if(Math.round(Number(xml.total)*100)!==Number(p.importe_centavos))throw new Error('El total del XML no corresponde al pago de prueba.');
  await rpc('facturapi_anota',{p_factura:f.id,p_token:token,p_datos:{pdf_ref:pdf.ref,xml_ref:xml.ref,pdf_sha256:pdf.sha,xml_sha256:xml.sha,subtotal:xml.subtotal,iva:Math.round((Number(xml.total)-Number(xml.subtotal))*100)/100},p_final:true});
 }catch(e){if(f)try{await rpc('facturapi_anota',{p_factura:f.id,p_token:token,p_datos:{error:(e as Error).message},p_final:true});}catch(_){/* El turno expira y el cuerpo idempotente permanece. */}}
 finally{trabajando=false;}
}
// Revisión de arranque: no recibe llaves ni facturas desde el navegador.
const inicio=(async()=>{try{await comprobar();await procesar();}catch(_){/* No exponer credenciales ni datos del proveedor en logs. */}})();
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
 await inicio;
 if(req.method!=='POST')return response(405,{error:'Método no permitido'});
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return response(401,{error:'Inicia sesión en Nuvoor Lab.'});
 try{
  const u=await fetch(SB+'/auth/v1/user',{headers:{apikey:SERVICE,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
  if(!u.ok)return response(401,{error:'Tu sesión no está vigente.'});
  if(await rpc('lab_puede_facturar',{},token)!==true)return response(403,{error:'Necesitas permiso de facturación.'});
  const body=await req.json().catch(()=>({}));
  if(!['comprobar','procesar'].includes(body.accion))return response(400,{error:'Acción no válida.'});
  if(body.accion==='comprobar')await comprobar();else await procesar();
  return response(200,await rpc('lab_facturapi_estado',{},token));
 }catch(_){return response(503,{error:'No se pudo completar la conexión fiscal. Reintenta desde el Lab.'});}
});
