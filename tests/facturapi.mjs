import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const {PGlite}=await import('../tmp/stripe/qa/package/dist/index.js');const db=new PGlite();
const schema=fs.readFileSync('tests/lab-operacion-sql.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1];await db.exec(schema);
for(const f of ['26-lab-publicidad-facturas.sql','27-facturapi-pruebas.sql','27-facturapi-pruebas.sql'])await db.exec(fs.readFileSync('sql/'+f,'utf8'));
const owner=randomUUID(),other=randomUUID(),cuenta=randomUUID();await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.query("insert into staff values($1,'Owner QA','dueno')",[owner]);await db.query("insert into cuentas values($1,'Taller QA')",[cuenta]);
const query=async(s,p=[]) => (await db.query(s,p)).rows;
await query("select registra_pago_suscripcion($1,'invoice:facturapi-qa',19900,'mxn',now(),'basico','mensual',true)",[cuenta]);
const fid=(await query('select id from facturas_suscripcion'))[0].id;
async function as(id,fn){await query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return await fn();}finally{await db.exec('reset role');}}
await as(other,async()=>{await assert.rejects(query('select lab_facturapi_solicita($1)',[fid]));await assert.rejects(query('select lab_facturapi_estado()'));});
await as(owner,async()=>{assert.equal((await query('select lab_facturapi_solicita($1) ok',[fid]))[0].ok,true);await assert.rejects(query('select facturapi_reserva($1,$2)',[randomUUID(),'org-qa']));});
let handler;const env={SUPABASE_URL:'https://sb.example.test',SUPABASE_SERVICE_ROLE_KEY:'service-fake-only',FACTURAPI_LLAVE_PRUEBA:'sk_test_FAKE_ONLY'};
globalThis.Deno={env:{get:k=>env[k]},serve:fn=>handler=fn};
let creates=0,lost=false,invalidLive=false,failXml=false,providerDoc=null,requests=[],objects=new Map();
const json=(d,status=200)=>new Response(JSON.stringify(d),{status,headers:{'content-type':'application/json'}});
globalThis.fetch=async(input,opts={})=>{
 const u=new URL(input),path=u.pathname;
 if(u.origin==='https://sb.example.test'){
  if(path==='/auth/v1/user')return opts.headers.Authorization==='Bearer owner-session'?json({id:owner}):opts.headers.Authorization==='Bearer other-session'?json({id:other}):json({},401);
  if(path.startsWith('/rest/v1/rpc/')){
   const name=path.split('/').at(-1),data=JSON.parse(opts.body),vals=Object.values(data).map(v=>v&&typeof v==='object'?JSON.stringify(v):v);
   const run=()=>query('select '+name+'('+Object.keys(data).map((k,i)=>k+'=> $'+(i+1)).join(',')+') result',vals);
   try{let rows;if(opts.headers.Authorization==='Bearer service-fake-only')rows=await run();else rows=await as(opts.headers.Authorization==='Bearer owner-session'?owner:other,run);return json(rows[0]?.result??null);}catch(e){return json({error:e.message},400);}
  }
  if(path.startsWith('/storage/v1/object/')){assert.equal(opts.headers['x-upsert'],'false');const b=Buffer.from(opts.body);objects.set(path,b);return json({});}
 }
 if(u.origin==='https://www.facturapi.io'){
  assert.equal(opts.headers.Authorization,'Bearer sk_test_FAKE_ONLY');requests.push({path,method:opts.method});
  if(path==='/v2/organizations/me')return json({id:'org_qa',legal:{name:'Nuvoor QA'}});
  if(path==='/v2/invoices'&&opts.method==='POST'){
   const body=JSON.parse(opts.body);assert.ok(body.idempotency_key);assert.equal(body.customer.email,undefined);assert.equal(body.items[0].product.price,199);
   assert.equal(body.customer.tax_id,'ABC101010111','receptor ficticio');
   if(!providerDoc){creates++;providerDoc={id:'doc_qa',uuid:randomUUID(),livemode:invalidLive,status:'valid',total:199,folio_number:7};}
   if(lost){lost=false;throw Error('respuesta perdida');}return json(providerDoc);
  }
  if(path==='/v2/invoices/doc_qa')return json(providerDoc);
  if(path.endsWith('/pdf'))return new Response('%PDF-1.7\nARCHIVO DE QA SIN VALIDEZ FISCAL');
  if(path.endsWith('/xml'))return failXml?json({error:'no listo'},503):new Response('<cfdi:Comprobante SubTotal="171.55" Total="199.00"><tfd:TimbreFiscalDigital UUID="'+providerDoc.uuid+'"/></cfdi:Comprobante>');
  throw Error('RUTA FACTURAPI NO SIMULADA '+path);
 }
 throw Error('RED NO SIMULADA '+u.origin+path);
};
await import('../supabase/functions/facturacion-suscripcion/index.ts?qa');
const call=(token='owner-session',accion='procesar')=>handler(new Request('https://sb.example.test/functions/v1/facturacion-suscripcion',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify({accion})}));
// El arranque atiende únicamente la solicitud ya autorizada en la cola.
assert.equal((await call('', 'comprobar')).status,401);let f=(await query('select * from facturas_suscripcion'))[0];
assert.equal(creates,1);assert.equal(f.estado,'timbrada');assert.ok(f.pdf_ref&&f.xml_ref&&f.pdf_sha256&&f.xml_sha256);assert.equal(objects.size,2);
assert.equal((await call('other-session')).status,403);assert.equal((await call('invalid-session')).status,401);assert.equal((await call()).status,200);assert.equal(creates,1);
assert.ok(!requests.some(r=>r.path.endsWith('/email')),'no correos reales');
await as(owner,async()=>{assert.equal((await query('select lab_facturapi_solicita($1) ok',[fid]))[0].ok,false);});
// Falla de archivo: conserva proveedor y consulta el mismo documento al reintentar.
await query("update facturas_suscripcion set pdf_ref=null,xml_ref=null,estado='pendiente'");failXml=true;
await as(owner,()=>query('select lab_facturapi_solicita($1)',[fid]));await call();f=(await query('select * from facturas_suscripcion'))[0];assert.equal(f.proveedor_id,'doc_qa');assert.equal(f.estado,'pendiente');
failXml=false;await as(owner,()=>query('select lab_facturapi_solicita($1)',[fid]));await call();assert.equal(creates,1);assert.equal((await query('select estado from facturas_suscripcion'))[0].estado,'timbrada');
// Respuesta perdida antes de conocer ID: el reintento usa el mismo cuerpo y clave.
await query("update facturas_suscripcion set proveedor_id=null,pdf_ref=null,xml_ref=null,estado='pendiente'");lost=true;
await as(owner,()=>query('select lab_facturapi_solicita($1)',[fid]));await call();assert.equal((await query('select proveedor_id from facturas_suscripcion'))[0].proveedor_id,null);
await as(owner,()=>query('select lab_facturapi_solicita($1)',[fid]));await call();assert.equal(creates,1);
// No aceptar respuesta live o importe diferente.
await query("update facturas_suscripcion set proveedor_id=null,pdf_ref=null,xml_ref=null,estado='pendiente'");providerDoc.livemode=true;
await as(owner,()=>query('select lab_facturapi_solicita($1)',[fid]));await call();assert.equal((await query('select estado from facturas_suscripcion'))[0].estado,'pendiente');providerDoc.livemode=false;
env.FACTURAPI_LLAVE_PRUEBA='sk_live_FAKE_REJECT'; // La constante ya capturada se prueba con otra instancia.
fs.writeFileSync('tmp/facturapi-llave-invalida.ts',fs.readFileSync('supabase/functions/facturacion-suscripcion/index.ts','utf8'));
await import('../tmp/facturapi-llave-invalida.ts');await call('','comprobar');
assert.equal((await query('select disponible from facturapi_conexion'))[0].disponible,false);
console.log('Facturapi: SQL repetible, roles, cola autorizada, prueba exclusiva, PDF/XML privados con checksum, respuesta perdida, reintentos sin duplicar y rechazo live: OK');await db.close();
