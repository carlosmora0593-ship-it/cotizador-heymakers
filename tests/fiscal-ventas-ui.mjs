import fs from 'node:fs';import assert from 'node:assert/strict';import './suspension/prepare.mjs';import {abre} from './navegador.mjs';
const dir='tmp/stripe/preview/';
let fake=fs.readFileSync(dir+'fake-supabase.js','utf8').replace('estado:"vencida",vence:new Date(Date.now()-86400000)','estado:"activa",vence:new Date(Date.now()+86400000)').replace('order(){return q},limit','in(){return q},gt(){return q},gte(){return q},lte(){return q},order(){return q},limit');
fs.writeFileSync(dir+'fake-supabase.js',fake);
let h=fs.readFileSync(dir+'index.html','utf8').replace('/* BEGIN FACTURACION POS',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__qaFiscal={eval:code=>eval(code)};\n/* BEGIN FACTURACION POS');fs.writeFileSync(dir+'fiscal-imprenta.html',h);
for(const [path,marker] of [['restaurante','/* BEGIN FACTURACION POS'],['tiendita','/* BEGIN FACTURACION POS']]){
 fs.mkdirSync(dir+path,{recursive:true});let s=fs.readFileSync('public/'+path+'/index.html','utf8');s=s.replace(/<script\b[^>]*src="https?:\/\/[^\"]+"[^>]*><\/script>/g,'').replace(/<script src="(?:\.\.\/)?config\.js(?:\?[^\"]*)?"><\/script>/g,'<script src="../fake-supabase.js"></script>');s=s.replace(marker,'window.__qaFiscal={eval:code=>eval(code)};\n'+marker);fs.writeFileSync(dir+path+'/index.html',s);
}
const b=await abre(dir,4193),{page}=b;
await page.addInitScript(()=>{
 window.__fiscalApi={emisor:false,factura:null,calls:[],fail:false};const real=window.fetch.bind(window);
 window.fetch=async(input,init)=>{if(String(input).includes('/functions/v1/facturacion-ventas')){const d=JSON.parse(init.body),qa=__fiscalApi;qa.calls.push(d);if(qa.fail)return new Response(JSON.stringify({error:'Proveedor sin respuesta; conserva el seguimiento'}),{status:503});if(d.accion==='emitir')qa.factura={id:'factura-qa',estado:'timbrada',uuid_sat:'11111111-2222-4333-8444-555555555555'};if(d.accion==='archivo')return new Response(JSON.stringify({url:'https://fake-project.supabase.co/storage/v1/object/sign/facturas-ventas/original.xml?token=qa'}));return new Response(JSON.stringify({emisor:qa.emisor?{razon:'Negocio QA',ambiente:'test'}:null,factura:qa.factura}));}if(String(input).includes('/storage/v1/object/sign/facturas-ventas/'))return new Response('<Comprobante>Archivo QA</Comprobante>',{headers:{'content-type':'application/xml'}});return real(input,init);};
});
const app=code=>page.evaluate(code=>__qaFiscal.eval(code),code);
async function conexion(host){const panel=page.locator(host+' .nvFiscalIntegrada');await panel.waitFor();await page.waitForFunction(sel=>document.querySelector(sel+' [role=status]')?.textContent.includes('Emisor pendiente'),host);assert.equal(await panel.locator('[data-fiscal-accion="emitir"]').isDisabled(),true);await page.evaluate(()=>__fiscalApi.emisor=true);await panel.locator('[data-fiscal-accion="estado"]').click();await page.waitForFunction(sel=>!document.querySelector(sel+' [data-fiscal-accion=emitir]').disabled,host);return panel;}
async function generar(panel){await panel.locator('[data-fiscal-accion="emitir"]').click();await page.waitForFunction(()=>__fiscalApi.factura?.estado==='timbrada');await panel.locator('[data-fiscal-accion="xml"]').waitFor({state:'visible'});assert.match(await panel.innerText(),/Factura de prueba preparada/);assert.equal(await panel.locator('[data-fiscal-accion="emitir"]').isVisible(),false);const dl=page.waitForEvent('download');await panel.locator('[data-fiscal-accion="xml"]').click();assert.match((await dl).suggestedFilename(),/factura-prueba-.*\.xml/);}
try{
 await page.goto(b.url+'/fiscal-imprenta.html?producto=taller');await page.waitForFunction(()=>window.__qaFiscal&&typeof CUENTA!=='undefined'&&CUENTA);
 await page.locator('#arranque').waitFor({state:'visible'});
 await page.evaluate(()=>{Object.assign(CUENTA,{plan:'pro',estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol:'admin'});pintaCuenta();aplicaPlan();});
 await app(`aplicaRol();__qaCategorias.seed();cierraArranque();cat.articulos[0].claveSat='53103001';cat.articulos[0].claveUnidad='H87';cot.articuloId=cat.articulos[0].id;cot.costoArt=70;cot.cliente='Cliente QA';guardaItemActivo(cot);guardadas=[cot];ventas=[{folio:cot.folio,total:calcDe(cot).total,estado:'pagado',pago:'Transferencia',cliente:cot.cliente}];abreGeneraFactura(cot.folio)`);
 assert(await app('ventas[0].total')>0,'venta con importe positivo');
 await app(`(async()=>{ventas=[];cot.pago={monto:Math.round(calcDe(cot).total*100)/100,tipo:'total',forma:'Transferencia',fecha:hoyISO()};await cv2RegistraPago(cot);window.__qaFiscalSnapshot=JSON.parse(JSON.stringify(ventas[0].cfdi));delete ventas[0].cfdi;abreGeneraFactura(cot.folio);})()`);
 assert(await app('window.__qaFiscalSnapshot.total')>0,'el cobro real guarda el desglose');
 const panel=await conexion('#modalFactura');await panel.locator('[data-fiscal-accion="emitir"]').click();assert.match(await panel.innerText(),/no conserva su desglose/);assert.equal(await page.evaluate(()=>__fiscalApi.calls.filter(x=>x.accion==='emitir').length),0);
 await app(`ventas[0].cfdi=window.__qaFiscalSnapshot;`);await page.locator('#fa_rfc').fill('ABC101010111');await page.locator('#fa_razon').fill('EMPRESA DE DEMOSTRACIÓN');await page.locator('#fa_cp').fill('85900');await page.locator('#fa_regimen').selectOption('601');
 await generar(panel);assert.notEqual(await app('ventas[0].factura?.estado||""'),'facturada','no etiqueta el CFDI TEST como factura real');
 await page.locator('#modalFactura').screenshot({path:'tmp/stripe/fiscal-imprenta-integrada.png'});
 await page.locator('#fa_cancel').click();await app(`vaATab('set');abreTarjetaSec('set','timbrado')`);await page.locator('#cardTimbrado [data-fiscal-accion="estado"]').click();assert.match(await page.locator('#cardTimbrado').innerText(),/Emisor: Negocio QA/);
 // Store: formulario dentro de Ventas, sin página independiente.
 await page.goto(b.url+'/tiendita/index.html?producto=tiendita');await page.waitForFunction(()=>window.__qaFiscal);
 await app(`client=window.supabase.createClient();connected={id:'acct-demo-restaurant',active:true,name:'Store QA',profile:{rol:'admin'}};app.products=[{id:'p',name:'Artículo QA',price:116,satCode:'01010101',satUnit:'H87',ivaFiscal:'16'}];app.sales=[{id:'TND-QA',createdAt:new Date().toISOString(),items:[{id:'p',name:'Artículo QA',qty:1,price:116}],total:116,received:116,method:'transferencia'}];app.sales[0].cfdi=nvFiscalStoreSnapshot(app.sales[0]);setView('ventas')`);
 await page.locator('[data-fiscal-store="TND-QA"]').click();const storePanel=await conexion('#nvFiscalStorePanel');await page.locator('#ns_rfc').fill('ABC101010111');await page.locator('#ns_razon').fill('EMPRESA DE DEMOSTRACIÓN');await page.locator('#ns_cp').fill('85900');await page.locator('#ns_regimen').fill('601');await page.locator('#ns_uso').fill('G03');await generar(storePanel);
 assert.equal(await page.locator('#view-ventas').evaluate(e=>e.classList.contains('active')),true);
 await page.locator('#nvFiscalStorePanel').screenshot({path:'tmp/stripe/fiscal-store-integrada.png'});
 // Restaurant conserva su formulario y su tarjeta de emisor.
 await page.goto(b.url+'/restaurante/index.html?producto=restaurant');await page.waitForFunction(()=>window.__qaFiscal);
 await app(`COMANDAS=[{id:'qa',folio:'CTA-QA',fecha:hoyISO(),estado:'cerrada',mesaNombre:'Mesa QA',total:116,subtotal:116,propina:0,servicio:0,pagos:[{tipo:'transferencia',monto:116}],cambio:0,lineas:[{id:'l',nombre:'Consumo QA',precio:116,cant:1,ivaModo:'incluido'}]}];COMANDAS[0].cfdi=nvFiscalRestSnapshot(COMANDAS[0]);abreFacturaRest('CTA-QA')`);
 const restPanel=await conexion('#modalFacRest');await page.locator('#fr_rfc').fill('ABC101010111');await page.locator('#fr_razon').fill('EMPRESA DE DEMOSTRACIÓN');await page.locator('#fr_cp').fill('85900');await page.locator('#fr_regimen').selectOption('601');await generar(restPanel);
 assert.equal(await page.locator('#restaurantFiscalSettings [data-fiscal-emisor]').count(),1);
 await page.locator('#modalFacRest').screenshot({path:'tmp/stripe/fiscal-restaurant-integrada.png'});
 assert.deepEqual(b.errors,[]);console.log('Interfaz existente Imprenta/Restaurant y panel en Ventas Store: emisor en Ajustes, guardia histórica, generación TEST, PDF/XML sin factura real y sin navegación paralela: OK');
}finally{await b.close();}
