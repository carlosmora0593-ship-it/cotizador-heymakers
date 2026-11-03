import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),out=path.join(root,'tmp/stripe/preview');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'img/marca'),{recursive:true});fs.mkdirSync(path.join(out,'marca'),{recursive:true});
for(const f of ['acceso.html','acceso.css','acceso.js','lab.html','lab.js','lab-nuvoor.js','lab-nuvoor.css','index.html','cuenta.js','suspension.js','version.json','tablero.js','tablero.css','clientes-selector.js','clientes-selector.css','variantes.js','variantes.css','conteo.js','bloqueo.js','bloqueo.css'])fs.copyFileSync(path.join(root,'public',f),path.join(out,f));
for(const f of ['n-body.png','star.png','n-64.png','n-192.png','n-512.png','palabra-96.png']){
 const src=path.join(root,'public/img/marca',f);if(fs.existsSync(src))fs.copyFileSync(src,path.join(out,'img/marca',f));
}
for(const f of ['n-64.png','n-192.png','n-512.png','palabra-96.png']){
 const src=path.join(root,'public/marca',f);if(fs.existsSync(src))fs.copyFileSync(src,path.join(out,'marca',f));
}
const fake=`window.CONFIG={SUPABASE_URL:"https://fake-project.supabase.co",SUPABASE_ANON_KEY:"anon-fake-public-key-".repeat(10)};
(()=>{
 const id="acct-demo-restaurant", producto=new URL(location.href).searchParams.get("producto")||"taller", session={access_token:"fake-session-token",user:{id:"user-demo",email:"demo@example.test"}};
 const account={id,nombre:"Café de Prueba",producto,productos:[producto],plan:"prueba",estado:"activa",vence:new Date(Date.now()+5*86400000).toISOString(),rol:"admin",activa:true,stripe_cliente:"cus_test_demo",stripe_suscripcion:null,mp_preapproval_id:null};
 const company={...account};const pending=[{id:101,cuenta_id:id,plan:"imprenta_basico",ciclo:"anual",monto:1990,referencia:"NV-DEMO-123456",forma:"transferencia",estado:"esperando",pedido:new Date().toISOString()}];
 function resultFor(table,filters){
   if(table==="mis_empresas")return [company];
   if(table==="v_cuentas")return [{id,taller:"Café de Prueba",correo_dueno:"demo@example.test",producto,plan:"prueba",estado:"activa",vence:account.vence,ciclo:"mensual",creada:new Date().toISOString(),ultima_actividad:"",total:0}];
   if(table==="perfiles")return [{id:"user-demo",cuenta_id:id,cuenta_activa:id,rol:"admin",nombre:"Demo",correo:"demo@example.test"}];
   if(table==="membresias")return [{usuario_id:"user-demo",cuenta_id:id,rol:"admin"}];
   if(table==="cuentas")return [account];
   if(table==="staff")return [{id:"user-demo",correo:"demo@example.test",nombre:"Demo",rol:"dueno"}];
   if(table==="pagos_pendientes")return pending;
   return [];
 }
 function query(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},range(){return q},maybeSingle(){return Promise.resolve({data:resultFor(table,filters)[0]||null,error:null})},single(){return q.maybeSingle()},insert(){return q},upsert(){return q},update(){return q},delete(){return q},then(ok,bad){return Promise.resolve({data:resultFor(table,filters),error:null}).then(ok,bad)}};return q;}
 const client={auth:{getSession:async()=>({data:{session},error:null}),signOut:async()=>({error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:query,rpc:async(name)=>({data:name==="nuvoor_negocios_disponible"||name==="nuvoor_stripe_planes_disponible"||name.includes("disponible")||name==="es_staff",error:null}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({upload:async()=>({data:{},error:null}),getPublicUrl:()=>({data:{publicUrl:""}})})}};
 window.supabase={createClient:()=>client};
 const realFetch=window.fetch.bind(window);
 window.fetch=async(input,init={})=>{
   const url=String(input);
   if(url.startsWith("https://fake-project.supabase.co/functions/v1/")){
     const body=JSON.parse(init.body||"{}");
     if(url.endsWith("/crear-pago")){
       if(body.forma==="transferencia")return new Response(JSON.stringify({forma:"transferencia",referencia:"NV-DEMO-654321",monto:body.plan==="pro"||body.plan==="multiempresa"?8990:body.plan==="maker"?4490:1990,banco:"Banco de Prueba · CLABE 000000000000000000",aviso:"Haz la transferencia y el equipo confirmará el depósito."}),{status:200,headers:{"content-type":"application/json"}});
       return new Response(JSON.stringify({forma:body.forma,url:"https://checkout.stripe.test/sesion-demo"}),{status:200,headers:{"content-type":"application/json"}});
     }
     if(url.endsWith("/portal-suscripcion"))return new Response(JSON.stringify({url:"https://billing.stripe.test/portal-demo"}),{status:200,headers:{"content-type":"application/json"}});
   }
   return realFetch(input,init);
 };
 window.claude={use:async()=>null};
})();`;
fs.writeFileSync(path.join(out,'fake-supabase.js'),fake);
function sanitize(file){let s=fs.readFileSync(path.join(out,file),'utf8');
 s=s.replace(/<link\b[^>]*\b(?:googleapis|gstatic)\.com[^>]*>\s*/g,'');
 s=s.replace(/<script src="(?:\.\/)?config\.js(?:\?[^\"]*)?"><\/script>/g,'<script src="./fake-supabase.js"></script>');
 s=s.replace(/<script\b[^>]*src="https?:\/\/[^\"]+"[^>]*><\/script>/g,'');
 if(file==='acceso.html')s=s.replace(/<script src="\.\/acceso\.js\?v=[^"]+"><\/script>/,'<script src="./acceso.js"></script>');
 if(file==='index.html'){
   s=s.replace(/<script src="cuenta\.js\?v=[^"]+"><\/script>/,'<script src="./cuenta.js"></script>');
   s=s.replace(/<script src="diagnostico\.js\?v=[^"]+"><\/script>/g,'');
 }
 fs.writeFileSync(path.join(out,file),s);
}
sanitize('acceso.html');sanitize('lab.html');sanitize('index.html');
const publicImg=path.join(root,'public/img');
if(fs.existsSync(publicImg))fs.cpSync(publicImg,path.join(out,'img'),{recursive:true,force:true});
console.log('Preview preparado en tmp/stripe/preview con Supabase y Stripe falsos.');

{
 let f=fs.readFileSync(path.join(out,'fake-supabase.js'),'utf8');
 f=f.replace('plan:"prueba",estado:"activa",vence:new Date(Date.now()+5*86400000)','plan:"pro",estado:"vencida",vence:new Date(Date.now()-86400000)');
 fs.writeFileSync(path.join(out,'fake-supabase.js'),f);
 let h=fs.readFileSync(path.join(out,'index.html'),'utf8');
 const helpers=fs.readFileSync(new URL('./fixture.js',import.meta.url),'utf8');
 h=h.replace('window.__consultaCotNuvoor = folio',helpers+'\nwindow.__consultaCotNuvoor = folio');
 fs.writeFileSync(path.join(out,'index.html'),h);
}
