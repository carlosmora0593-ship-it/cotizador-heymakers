import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {prepararFiscalVenta,validarComprobante} from '../supabase/functions/_shared/fiscal-ventas.ts';
const {PGlite}=await import('../tmp/stripe/qa/package/dist/index.js');const db=new PGlite();
const schema=fs.readFileSync('tests/lab-operacion-sql.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1];await db.exec(schema);
await db.exec(`alter table cuentas add column producto text default 'taller';alter table cuentas add column productos text[] default array['taller','restaurant','tiendita'];alter table cuentas add column estado text default 'activa';alter table cuentas add column plan text default 'pro';alter table cuentas add column vence timestamptz default now()+interval '1 month';
create table documentos(cuenta_id uuid,coleccion text,doc_id text,cuerpo jsonb,total numeric,fecha timestamptz,primary key(cuenta_id,coleccion,doc_id));`);
for(const f of ['26-lab-publicidad-facturas.sql','28-facturacion-ventas-prueba.sql','28-facturacion-ventas-prueba.sql'])await db.exec(fs.readFileSync('sql/'+f,'utf8'));
const query=async(s,p=[]) => (await db.query(s,p)).rows,one=async(s,p=[]) => (await query(s,p))[0];
const admin=randomUUID(),other=randomUUID(),designer=randomUUID(),c1=randomUUID(),c2=randomUUID();
for(const id of [admin,other,designer])await query('insert into auth.users values($1)',[id]);
await query("insert into cuentas(id,nombre) values($1,'Negocio QA'),($2,'Otro negocio QA')",[c1,c2]);
await query("insert into membresias values($1,$2,'admin'),($3,$4,'admin'),($5,$2,'diseno')",[admin,c1,other,c2,designer]);await query("insert into staff values($1,'Owner QA','dueno')",[admin]);
async function as(id,fn){await query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');try{return await fn();}finally{await db.exec('reset role');}}
const receiver={rfc:'ABC101010111',razon:'EMPRESA DE DEMOSTRACIÓN',cp:'85900',regimen:'601',uso:'G03',metodo:'PUE',forma:'03'};
const sale={total:116,estado:'pagado',pago:'Transferencia',method:'transferencia',recibido:116,received:116,cfdi:{version:1,total:116,forma:'03',conceptos:[{descripcion:'Trabajo de muestra',cantidad:2,importe:116,clave:'82121500',unidad:'E48',iva:'16'}]}};
const doc={venta:sale};
assert.equal(prepararFiscalVenta('taller',doc,receiver,'test-qa').total,11600);
for(const bad of [{...sale,total:117},{...sale,estado:'anticipo'},{...sale,cfdi:null},{...sale,cfdi:{...sale.cfdi,conceptos:[{...sale.cfdi.conceptos[0],iva:'pendiente'}]}}])assert.throws(()=>prepararFiscalVenta('taller',{venta:bad},receiver,'qa'));
assert.throws(()=>prepararFiscalVenta('taller',doc,{...receiver,metodo:'PPD'},'qa'));
const store={...sale,total:144,cfdi:{...sale.cfdi,total:144,conceptos:[...sale.cfdi.conceptos,{descripcion:'Otro producto',cantidad:1,importe:28,clave:'50131700',unidad:'H87',iva:'0'}]},received:144};assert.equal(prepararFiscalVenta('tiendita',{sale:store},receiver,'qa').body.items[1].product.taxes[0].rate,0);
const rest={...sale,total:128,propina:12,pagos:[{tipo:'transferencia',monto:128}],cambio:0};assert.equal(prepararFiscalVenta('restaurant',rest,receiver,'qa').total,11600);
assert.throws(()=>validarComprobante({id:'doc',status:'valid',uuid:randomUUID(),livemode:true,total:116},11600));
await query("insert into documentos values($1,'ventas','QA-1',$2,116,now())",[c1,JSON.stringify(doc)]);
await as(other,async()=>{await assert.rejects(query("select fiscal_pos_contexto($1,'taller','QA-1',false)",[c1]));});
await as(designer,async()=>{await assert.rejects(query("select fiscal_pos_contexto($1,'taller','QA-1',false)",[c1]));});
await as(admin,async()=>{assert.equal((await one("select fiscal_pos_contexto($1,'taller','QA-1',false) r",[c1])).r.emisor,null);await assert.rejects(query('select * from fiscal_pos_emisores'));await assert.rejects(query("select fiscal_pos_emisor_asigna($1,'org_qa','FACTURAPI_POS_PRUEBA_QA','','','')",[c1]));});
let handler;const env={SUPABASE_URL:'https://sb.example.test',SUPABASE_SERVICE_ROLE_KEY:'service-qa-only',FACTURAPI_POS_PRUEBA_QA:'sk_test_FAKE_ONLY'};globalThis.Deno={env:{get:k=>env[k]},serve:fn=>handler=fn};
const json=(d,status=200)=>new Response(JSON.stringify(d),{status,headers:{'content-type':'application/json'}});
let creates=0,lost=false,failXml=false,providerDoc=null;const keys=[],objects=new Map();
globalThis.fetch=async(input,opts={})=>{
 const u=new URL(input),path=u.pathname;
 if(u.origin==='https://sb.example.test'){
  if(path==='/auth/v1/user')return opts.headers.Authorization==='Bearer admin-session'?json({id:admin}):opts.headers.Authorization==='Bearer other-session'?json({id:other}):json({},401);
  if(path.startsWith('/rest/v1/rpc/')){const name=path.split('/').at(-1),data=JSON.parse(opts.body),vals=Object.values(data).map(v=>v&&typeof v==='object'?JSON.stringify(v):v),run=()=>query('select '+name+'('+Object.keys(data).map((k,i)=>k+'=> $'+(i+1)).join(',')+') result',vals);
   try{const rows=opts.headers.Authorization==='Bearer service-qa-only'?await run():await as(opts.headers.Authorization==='Bearer admin-session'?admin:other,run);return json(rows[0]?.result??null);}catch(e){return json({message:e.message,code:e.code},400);}}
  if(path.startsWith('/storage/v1/object/sign/'))return json({signedURL:'/object/sign/facturas-ventas/qa?token=fake'});
  if(path.startsWith('/storage/v1/object/')){assert.equal(opts.headers['x-upsert'],'false');objects.set(path,Buffer.from(opts.body));return json({});}
 }
 if(u.origin==='https://www.facturapi.io'){
  keys.push(opts.headers.Authorization);assert.equal(opts.headers.Authorization,'Bearer sk_test_FAKE_ONLY');
  if(path==='/v2/organizations/me')return json({id:'org_qa',name:'Negocio QA',legal:{tax_id:'ABC101010111',address:{zip:'85900'}}});
  if(path==='/v2/invoices'&&opts.method==='POST'){
   const body=JSON.parse(opts.body);assert.equal(body.customer.email,undefined);assert.ok(body.idempotency_key);assert.equal(body.payment_method,'PUE');
   if(!providerDoc){creates++;providerDoc={id:'doc_qa',uuid:randomUUID(),livemode:false,status:'valid',total:116};}
   if(lost){lost=false;throw Error('respuesta perdida');}return json(providerDoc);
  }
  if(path==='/v2/invoices/doc_qa')return json(providerDoc);
  if(path.endsWith('/pdf'))return new Response('%PDF-1.7\nARCHIVO DE QA SIN VALIDEZ FISCAL');
  if(path.endsWith('/xml'))return failXml?json({},503):new Response('<cfdi:Comprobante SubTotal="100.00" Total="116.00"><tfd:TimbreFiscalDigital UUID="'+providerDoc.uuid+'"/></cfdi:Comprobante>');
 }
 throw Error('RED NO SIMULADA '+u.origin+path);
};
await import('../supabase/functions/facturacion-ventas/index.ts?qa');
const call=(action,extra={},token='admin-session')=>handler(new Request('https://sb.example.test/functions/v1/facturacion-ventas',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify({accion:action,cuenta:c1,sistema:'taller',documento:'QA-1',...extra})}));
assert.equal((await call('estado',{},'')).status,401);assert.equal((await call('estado',{},'bad')).status,401);assert.equal((await call('estado',{},'other-session')).status,403);
assert.equal((await call('emitir',{receptor:receiver})).status,409);assert.equal(creates,0);
assert.equal((await call('asignar_emisor',{secreto_nombre:'FACTURAPI_POS_PRUEBA_QA'})).status,200);
// A dropped response retains the body and idempotency key; no invented success.
lost=true;let r=await call('emitir',{receptor:receiver}),d=await r.json();assert.equal(r.status,200);assert.equal(d.factura.estado,'pendiente');assert.equal(creates,1);assert.equal(d.factura.secreto_nombre,undefined);assert.equal(d.factura.solicitud,undefined);
assert.equal((await call('emitir',{receptor:receiver})).status,409);
failXml=true;d=await(await call('reintentar')).json();assert.equal(d.factura.estado,'archivos_pendientes');assert.equal(creates,1);
failXml=false;d=await(await call('reintentar')).json();assert.equal(d.factura.estado,'timbrada');assert.ok(d.factura.pdf_ref&&d.factura.xml_ref);assert.equal(objects.size,2);assert.equal(creates,1);
assert.equal((await call('archivo',{formato:'xml'})).status,200);
await query("update cuentas set estado='vencida' where id=$1",[c1]);assert.equal((await call('estado')).status,200);assert.equal((await call('archivo',{formato:'pdf'})).status,200);assert.equal((await call('reintentar')).status,409);
assert.equal((await call('archivo',{formato:'xml'},'other-session')).status,403);
await as(other,async()=>{assert.equal((await query('select * from fiscal_pos_facturas')).length,0);});
await as(admin,async()=>{await assert.rejects(query("update fiscal_pos_facturas set estado='timbrada'"));});
assert.equal(keys.some(x=>x.includes('sk_live_')),false);console.log('SQL28 repetible, permisos/cuentas, receptor, tasas, total, ambiente TEST, timeout, reintento, originales y consulta vencida: OK');await db.close();
