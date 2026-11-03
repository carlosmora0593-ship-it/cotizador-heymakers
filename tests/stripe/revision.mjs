import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
process.chdir(fileURLToPath(new URL('../../',import.meta.url))); 
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.es_staff() returns boolean language sql as $$ select true $$;
create table cuentas(id uuid primary key,producto text,nombre text,plan text default 'prueba',estado text default 'activa',vence timestamptz,ciclo text);
create table perfiles(id uuid,cuenta_id uuid,cuenta_activa uuid,rol text);
create table membresias(usuario_id uuid,cuenta_id uuid,rol text);`);
for(const file of ['18-stripe.sql','22-stripe-planes.sql','23-stripe-seguro.sql','23-stripe-seguro.sql']) await db.exec(fs.readFileSync('sql/'+file,'utf8'));
console.log('SQL real PostgreSQL embebido: 18 → 22 → 23; 23 repetido: OK');
const USER=randomUUID(), API='https://fake.supabase.test';
let current, handler, faults={}, seq=0, calls=[], sessions=new Map(), subscriptions=new Map(), idem=new Map(), coupon=null;
const env={SUPABASE_URL:API,SUPABASE_SERVICE_ROLE_KEY:'service-falso',STRIPE_LLAVE:'stripe-falso',STRIPE_WEBHOOK_SECRETO:'firma-falsa',SITIO_URL:'https://app.nuvoor.mx',DATOS_BANCO:'Banco de prueba'};
globalThis.Deno={env:{get:k=>env[k]},serve:fn=>handler=fn};
const json=(x,status=200)=>new Response(status===204?null:JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
const query=async(sql,params=[]) => (await db.query(sql,params)).rows;
async function seed(producto='restaurant',extra={}) {
 const id=randomUUID();current=id;
 await db.query(`insert into cuentas(id,producto,nombre,vence) values($1,$2,'Prueba',now()+interval '10 days')`,[id,producto]);
 await db.query('delete from perfiles');await db.query('insert into perfiles values($1,$2,$2,$3)',[USER,id,'admin']);
 await db.query('insert into membresias values($1,$2,$3)',[USER,id,'admin']);
 await patch(id,extra); return id;
}
async function patch(id,data) {
 const keys=Object.keys(data);if(!keys.length)return;
 await db.query('update cuentas set '+keys.map((k,i)=>k+'=$'+(i+2)).join(',')+' where id=$1',[id,...keys.map(k=>data[k])]);
}
const account=async(id=current)=>JSON.parse(JSON.stringify((await query('select * from cuentas where id=$1',[id]))[0]));
globalThis.fetch=async(input,opts={})=>{
 const u=new URL(input),method=opts.method||'GET';
 if(u.origin===API) {
  if(u.pathname==='/auth/v1/user')return json({id:USER,email:'qa@example.test'});
  const table=u.pathname.split('/').pop();
  if((faults.apply && table==='stripe_aplica') || (faults.db && (table==='stripe_aplica'||table==='cuentas'))) return json({error:'base caída'},503);
  if(u.pathname.includes('/rpc/')){
   const b=JSON.parse(opts.body),args=Object.values(b);
   if(!['stripe_toma','stripe_suelta','stripe_aplica','stripe_intento'].includes(table))throw Error('RPC inesperada '+table);
   try {const row=await query('select '+table+'('+Object.keys(b).map((k,i)=>k+'=> $'+(i+1)).join(',')+') as result',args.map(x=>typeof x==='object'&&x!==null?JSON.stringify(x):x));return json(row[0].result);}
   catch(e){return json({error:e.message},500);}
  }
  assert.ok(['cuentas','perfiles','membresias','pagos_pendientes','stripe_control','stripe_entregas'].includes(table),'tabla permitida');
  if(method==='PATCH') {if(faults.saveCustomer)return json({},500);const id=u.searchParams.get('id').slice(3);await patch(id,JSON.parse(opts.body));return json(null,204);}
  if(method==='POST') {const b=JSON.parse(opts.body);const keys=Object.keys(b);await db.query('insert into '+table+'('+keys.join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(b));return json(null,201);}
  let filters=[],params=[];for(const [k,v] of u.searchParams)if(v.startsWith('eq.')){filters.push(k+'=$'+(params.length+1));params.push(v.slice(3));}
  const select=u.searchParams.get('select')||'*';assert.match(select,/^[a-z_,*]+$/);
  return json(await query('select '+select+' from '+table+(filters.length?' where '+filters.join(' and '):'')+' limit 100',params));
 }
 if(u.origin==='https://api.stripe.com'){
  const path=u.pathname.slice(4),p=new URLSearchParams(opts.body||'');calls.push({path,method,p,headers:opts.headers});
  if(method==='GET'&&path==='subscriptions')return json({data:[...subscriptions.values()].filter(s=>s.customer===u.searchParams.get('customer')),has_more:false});
  if(method==='GET'&&path.startsWith('subscriptions/')){const s=subscriptions.get(path.split('/')[1]);return s?json(s):json({error:{message:'missing sub'}},404);}
  if(method==='GET'&&path.startsWith('coupons/'))return coupon?json(coupon):json({error:{message:'missing coupon'}},404);
  if(path==='coupons'){coupon={id:p.get('id'),amount_off:+p.get('amount_off'),currency:p.get('currency'),duration:p.get('duration'),duration_in_months:+p.get('duration_in_months')};return json(coupon);}
  if(path==='customers'){assert.ok(opts.headers['Idempotency-Key']);return json({id:'cus_'+p.get('metadata[cuenta_id]')});}
  if(path==='billing_portal/sessions')return json({url:'https://billing.stripe.test/fake'});
  if(path.startsWith('checkout/sessions/')&&path.endsWith('/expire')){sessions.get(path.split('/')[2]).status='expired';return json(sessions.get(path.split('/')[2]));}
  if(method==='GET'&&path.startsWith('checkout/sessions/'))return json(sessions.get(path.split('/')[2]));
  if(path==='checkout/sessions'){
   assert.equal([...p.keys()].some(k=>k.startsWith('subscription_data[discounts]')),false,'Stripe rechaza discounts anidado');
   if(!idem.has(opts.headers['Idempotency-Key'])) assert.ok(p.get('expires_at')>Date.now()/1000+1800-5);
   const key=opts.headers['Idempotency-Key'];assert.ok(key);
   if(idem.has(key)){assert.equal(idem.get(key).body,opts.body,'reintento con cuerpo exacto');return json(idem.get(key).response);}
   const id='cs_'+(++seq),s={id,status:'open',url:'https://checkout.stripe.test/'+id,mode:p.get('mode'),customer:p.get('customer'),currency:'mxn',amount_total:+p.get('line_items[0][price_data][unit_amount]'),payment_status:'unpaid',metadata:{cuenta_id:p.get('metadata[cuenta_id]'),plan:p.get('metadata[plan]'),ciclo:p.get('metadata[ciclo]')}};
   idem.set(key,{body:opts.body,response:s});sessions.set(id,s);
   if(faults.lostResponse){faults.lostResponse=false;throw Error('Respuesta perdida después de crear Checkout');}
   return json(s);
  }
 }
 throw Error('RED NO SIMULADA BLOQUEADA: '+method+' '+u.href);
};
await import('../../supabase/functions/crear-pago/index.ts?revision');const crear=handler;
await import('../../supabase/functions/webhook-stripe/index.ts?revision');const webhook=handler;
await import('../../supabase/functions/portal-suscripcion/index.ts?revision');const portal=handler;
async function pay(body={},id=current){return crear(new Request(API+'/crear',{method:'POST',headers:{authorization:'Bearer fake'},body:JSON.stringify({cuenta_id:id,producto:(await account(id)).producto,plan:'basico',forma:'tarjeta',ciclo:'mensual',...body})}));}
async function event(type,o,{id='evt_'+randomUUID(),timestamp=Math.floor(Date.now()/1000),bad=false}={}){
 const b=JSON.stringify({id,type,data:{object:o}}),sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRETO).update(timestamp+'.'+b).digest('hex');
 return webhook(new Request(API+'/webhook',{method:'POST',headers:{'stripe-signature':'t='+timestamp+',v1='+(bad?'0'.repeat(64):sig)},body:b}));
}
const plans=[['taller','imprenta_basico',19900,199000],['taller','imprenta_maker',44900,449000],['taller','imprenta_pro',89900,899000],['restaurant','restaurant_estandar',19900,199000],['restaurant','restaurant_multi',89900,899000],['tiendita','store_estandar',19900,199000],['tiendita','store_multi',89900,899000]];
for(const [prod,plan,m,a] of plans)for(const ciclo of ['mensual','anual']){
 await seed(prod);const r=await pay({plan,ciclo,monto:1});assert.equal(r.status,200,await r.clone().text());
 const c=calls.filter(c=>c.path==='checkout/sessions').at(-1);assert.equal(+c.p.get('line_items[0][price_data][unit_amount]'),ciclo==='mensual'?m:a);
 assert.equal(c.p.has('discounts[0][coupon]'),ciclo==='mensual'&&m===19900);
 if(c.p.has('discounts[0][coupon]')) assert.equal(c.p.get('discounts[0][coupon]'),'nuvoor-apertura-98');
 assert.ok(+c.p.get('subscription_data[trial_end]')>Date.now()/1000+48*3600);
}
assert.equal(calls.filter(c=>c.path==='coupons').length,1);assert.equal(coupon.duration_in_months,3);
console.log('14 precios en servidor, cupón raíz y reutilización, prueba restante: OK');
await seed();coupon.amount_off=1;
assert.equal((await pay()).status,500,'cupón incorrecto se bloquea');coupon.amount_off=10100;
for(const [producto,alias] of [['taller','taller_basico'],['restaurant','rest_normal'],['tiendita','tienda_normal']]){await seed(producto);assert.equal((await pay({plan:alias,forma:'oxxo'})).status,200);}
await seed('restaurant',{pago_previo:true,plan:'prueba'});await pay();assert.equal(calls.filter(c=>c.path==='checkout/sessions').at(-1).p.has('discounts[0][coupon]'),false);
await seed('tiendita',{vence:new Date(Date.now()+86400000).toISOString()});await pay();assert.equal(calls.filter(c=>c.path==='checkout/sessions').at(-1).p.has('subscription_data[trial_end]'),false);
await seed('taller');let r=await pay({app:'android'});assert.equal(r.status,200);let body=await r.json();let cs=sessions.get(body.id);assert.match(calls.filter(c=>c.path==='checkout/sessions').at(-1).p.get('success_url'),/app=android/);
let again=await pay({app:'android'});assert.equal((await again.json()).id,body.id,'reutiliza Checkout');
await pay({plan:'maker',app:'android'});assert.equal(cs.status,'expired','cambio expira intento previo');
await seed();faults.lostResponse=true;r=await pay();assert.equal(r.status,500);again=await pay();assert.equal(again.status,200,'recupera Checkout creado aunque se perdió respuesta');
await seed();faults.saveCustomer=true;r=await pay();assert.equal(r.status,500);faults.saveCustomer=false;
assert.equal((await account()).stripe_cliente,null,'no guardó cliente y no abre cobro');
await seed();const token=randomUUID();await db.query('select stripe_toma($1,$2)',[current,token]);r=await pay();assert.equal(r.status,409);await db.query('select stripe_suelta($1,$2)',[current,token]);
console.log('Checkout: Android, reuso, cambio de intento, respuesta perdida, guardado fallido, turno ocupado: OK');
await seed();r=await pay({forma:'transferencia',ciclo:'mensual'});assert.equal(r.status,200);body=await r.json();assert.equal(body.monto,1990);
const p=(await query('select id from pagos_pendientes where cuenta_id=$1',[current]))[0];await db.query('select aplica_pago($1)',[p.id]);assert.equal((await account()).pago_previo,true);
const vencida=(await account()).vence;await assert.rejects(db.query('select aplica_pago($1)',[p.id]));assert.equal((await account()).vence,vencida);
console.log('Transferencia anual real SQL, marcador de pago y doble aplicación rechazada: OK');
await seed();r=await pay({forma:'oxxo'});body=await r.json();cs=sessions.get(body.id);cs.status='complete';cs.payment_status='paid';
let old=(await account()).vence;
r=await event('checkout.session.completed',cs);assert.equal(r.status,200);let paid=(await account()).vence;assert.ok(new Date(paid)>new Date(old));
r=await event('checkout.session.async_payment_succeeded',cs);assert.equal(r.status,200);assert.equal((await account()).vence,paid,'distintos eventos misma sesión no suman');
const events=await Promise.all([event('checkout.session.completed',cs),event('checkout.session.completed',cs)]);assert.ok(events.every(r=>[200,503].includes(r.status)));assert.equal((await account()).vence,paid);
// Dos pagos diferentes, mismo negocio: se acumulan sin perder un periodo.
const cs2={...cs,id:'cs_otro'};sessions.set(cs2.id,cs2);await event('checkout.session.completed',cs2);assert.ok(new Date((await account()).vence)>new Date(paid));
// Caída SQL, sin acuse exitoso ni registro que impida volver a intentarlo.
const cs3={...cs,id:'cs_falla'};sessions.set(cs3.id,cs3);faults.db=true;r=await event('checkout.session.completed',cs3,{id:'evt_retry'});assert.equal(r.status,503);faults.db=false;
r=await event('checkout.session.completed',cs3,{id:'evt_retry'});assert.equal(r.status,200);
const cs4={...cs,id:'cs_aplica_falla'};sessions.set(cs4.id,cs4);faults.apply=true;
r=await event('checkout.session.completed',cs4,{id:'evt_apply_retry'});assert.equal(r.status,503);faults.apply=false;
assert.equal((await query("select * from stripe_entregas where evento='evt_apply_retry'")).length,0);
r=await event('checkout.session.completed',cs4,{id:'evt_apply_retry'});assert.equal(r.status,200);
const parallelA={...cs,id:'cs_concurrent_a'},parallelB={...cs,id:'cs_concurrent_b'};
sessions.set(parallelA.id,parallelA);sessions.set(parallelB.id,parallelB);
const outcomes=await Promise.all([event('checkout.session.completed',parallelA),event('checkout.session.completed',parallelB)]);
for(const [ix,response] of outcomes.entries()) if(response.status===503) assert.equal((await event('checkout.session.completed',[parallelA,parallelB][ix])).status,200);
assert.equal((await query("select * from stripe_entregas where sesion in ('cs_concurrent_a','cs_concurrent_b')")).length,2,'concurrencia dos pagos distintos conserva ambos');
r=await event('checkout.session.completed',cs,{bad:true});assert.equal(r.status,400);
r=await event('checkout.session.completed',cs,{timestamp:Math.floor(Date.now()/1000)-301});assert.equal(r.status,400);
console.log('OXXO: repetido, eventos distintos, simultáneos, dos pagos, base caída/reintento y firma: OK');
await seed('restaurant',{stripe_cliente:'cus_sub'});
let sub={id:'sub_actual',customer:'cus_sub',created:100,status:'active',current_period_end:Math.floor(Date.now()/1000)+30*86400,cancel_at_period_end:true,metadata:{cuenta_id:current,plan:'restaurant_multi',ciclo:'mensual'},latest_invoice:{status:'paid'}};subscriptions.set(sub.id,sub);
r=await event('customer.subscription.created',sub);assert.equal(r.status,200);assert.equal((await account()).plan,'maker');
sub.status='past_due';sub.latest_invoice={status:'open'};r=await event('customer.subscription.updated',sub);assert.equal(r.status,200);assert.equal((await account()).estado,'vencida','cancelar al final no resucita past_due');
sub.status='unpaid';await event('customer.subscription.updated',sub);assert.equal((await account()).estado,'vencida');
sub.status='active';sub.latest_invoice={status:'paid'};sub.items={data:[{current_period_end:sub.current_period_end+86400}]};delete sub.current_period_end;
await event('customer.subscription.updated',{...sub,status:'past_due'});assert.equal((await account()).estado,'activa','snapshot atrasado se reconcilia contra Stripe actual');
sub.status='canceled';old=(await account()).vence;await event('customer.subscription.deleted',sub);assert.equal((await account()).estado,'cancelada');assert.equal((await account()).vence,old);
const newer={...sub,id:'sub_nueva',created:200,status:'active'};subscriptions.set(newer.id,newer);await event('customer.subscription.created',newer);
await event('customer.subscription.deleted',sub);assert.equal((await account()).stripe_suscripcion,'sub_nueva');assert.equal((await account()).estado,'activa');
await event('invoice.payment_failed',{id:'in_old',parent:{subscription_details:{subscription:'sub_nueva',metadata:newer.metadata}}});assert.equal((await account()).cobro_fallido,null,'factura atrasada no marca fallo resuelto');
await event('invoice.paid',{id:'in_legacy',subscription:'sub_nueva',subscription_details:{metadata:newer.metadata}});assert.equal((await account()).estado,'activa');
const completed={id:'cs_sub_confirmada',mode:'subscription',subscription:'sub_nueva',metadata:newer.metadata};
assert.equal((await event('checkout.session.completed',completed)).status,200);
assert.equal((await query("select * from stripe_entregas where sesion='cs_sub_confirmada'")).length,1,'confirma esa sesión de tarjeta');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[USER]);
await db.exec('set role authenticated');
assert.equal((await query('select stripe_confirmado($1,$2) as ok',[current,'cs_sub_confirmada']))[0].ok,true);
assert.equal((await query('select stripe_confirmado($1,$2) as ok',[current,'cs_no_aplicada']))[0].ok,false);
await db.exec('reset role');
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()]);
await db.exec('set role authenticated');
assert.equal((await query('select stripe_confirmado($1,$2) as ok',[current,'cs_sub_confirmada']))[0].ok,false,'otra cuenta no puede confirmar este pago');
await db.exec('reset role');
r=await pay();assert.equal(r.status,409,'bloquea segunda suscripción aunque no haya llegado otro webhook');
console.log('Suscripciones: API antigua/nueva, cancelación, deuda, recuperación, snapshots atrasados, factura nueva y bloqueo doble cobro: OK');
await seed('taller',{stripe_cliente:'cus_portal'});
r=await portal(new Request(API+'/portal',{method:'POST',headers:{authorization:'Bearer fake'},body:JSON.stringify({cuenta_id:current,app:'android'})}));assert.equal(r.status,200);assert.match(calls.at(-1).p.get('return_url'),/app=android/);
await db.query('update membresias set rol=$1 where cuenta_id=$2',['ventas',current]);r=await pay();assert.equal(r.status,403);
console.log('Portal Android y rol ventas rechazado: OK');
// Probar privilegios y atomicidad sobre PostgreSQL, no una imitación JS.
await db.exec('set role authenticated');await assert.rejects(db.query('select stripe_toma($1,$2)',[current,randomUUID()]));await db.exec('reset role');
const t=randomUUID();await db.query('select stripe_toma($1,$2)',[current,t]);
await assert.rejects(db.query('select stripe_aplica($1,$2,$3,$4,$5,$6)',[current,t,'evt_rollback','cs_rollback',JSON.stringify({vence:'no-es-fecha'}),null]));
assert.equal((await query("select * from stripe_entregas where evento='evt_rollback'")).length,0,'error revierte recibo y licencia juntos');
await db.query("update stripe_control set hasta=now()-interval '1 minute' where cuenta_id=$1",[current]);
await assert.rejects(db.query('select stripe_aplica($1,$2,$3,$4,$5,$6)',[current,t,'evt_lease_expired','cs_expired','{}',null]));
await db.query('select stripe_suelta($1,$2)',[current,t]);
console.log('RLS/privilegios y rollback transaccional: OK');
await db.close();
