import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import './suspension/prepare.mjs';import {abre} from './navegador.mjs';
let preview=fs.readFileSync('tmp/stripe/preview/index.html','utf8');
preview=preview.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\n'+fs.readFileSync('tests/cliente-fiscal-fixture.js','utf8')+'\nwindow.__consultaCotNuvoor = folio');
fs.writeFileSync('tmp/stripe/preview/cliente-fiscal-propuesta.html',preview);
const h=fs.readFileSync('tmp/stripe/preview/cliente-fiscal-propuesta.html','utf8');
for(const [i,m]of [...h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())if(m[1].trim())new vm.Script(m[1],{filename:'fcl-'+i});
const q=await abre('tmp/stripe/preview'),{page}=q,app=code=>page.evaluate(code=>__qaFcl.eval(code),code);
try{
 await page.goto(q.url+'/cliente-fiscal-propuesta.html?producto=taller');await page.waitForFunction(()=>window.__qaFcl&&typeof CUENTA!=='undefined'&&CUENTA);
 await page.evaluate(()=>{Object.assign(CUENTA,{plan:'pro',estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol:'admin'});pintaCuenta();aplicaPlan();});await app('aplicaRol();__qaFcl.seed()');
 await page.locator('[data-azcli="cliente-ejemplo"]').click();
 assert.equal(await page.locator('#fcl_mail').inputValue(),'compras@example.test');assert.equal(await page.locator('#fcl_rfc').inputValue(),'AAA010101AAA');
 await page.locator('[data-azcli=""]').click();assert.equal(await page.locator('#fcl_rfc').inputValue(),'');assert.equal(await page.locator('#fcl_tel').inputValue(),'');assert.equal(await page.locator('#fcl_regimen').inputValue(),'');
 await page.locator('#c_cliente').fill('Cliente sin factura');await app('DB=null;fclCaptura();guardaCot()');
 assert.equal(await app('guardadas.find(g=>g.folio===cot.folio).clienteFicha.rfc'),'');
 await page.locator('[data-azcli="cliente-ejemplo"]').click();
 await app(`window.__fclDocs=[];window.__fclRemoto=JSON.parse(JSON.stringify(clientes[0]));DB={collection:col=>({doc:id=>({get:async()=>({data:()=>({cliente:window.__fclRemoto})}),set:async d=>{if(window.__fclFalla)throw Error('No hay conexión de prueba');window.__fclDocs.push({col,id,d});if(d.cliente)window.__fclRemoto=JSON.parse(JSON.stringify(d.cliente));}})})}`);
 await page.locator('#fcl_mail').fill('facturas@example.test');await page.locator('#btnGuardarCliente').click();await page.waitForFunction(()=>window.__fclDocs.length===1);
 assert.equal(await app('clientes[0].mail'),'facturas@example.test');assert.equal(await app('clientes[0].credito'),5000);
 await page.locator('#fcl_persona').fill('Contacto actualizado');await page.evaluate(()=>window.__fclFalla=true);await page.locator('#btnGuardarCliente').click();await page.waitForFunction(()=>!document.querySelector('#fclError').hidden);
 assert.equal(await page.locator('#fcl_persona').inputValue(),'Contacto actualizado');assert.equal(await app('clientes[0].persona'),'Contacto de ejemplo');
 await page.evaluate(()=>window.__fclFalla=false);await page.locator('#btnGuardarCliente').click();await page.waitForFunction(()=>window.__fclDocs.length===2);
 await app('fclCaptura();guardaCot()');assert.equal(await app('guardadas.find(g=>g.folio===cot.folio).clienteFicha.mail'),'facturas@example.test');
 await app('clientes[0].mail="posterior@example.test";fclAbreArchivo(guardadas.find(g=>g.folio===cot.folio))');
 assert.match(await page.locator('#fclLectura').innerText(),/facturas@example.test/);assert.doesNotMatch(await page.locator('#fclLectura').innerText(),/posterior@example.test/);
 await page.waitForTimeout(3200);await app('TEMA.preset="tecno";aplicaTema()');await page.locator('#modalFichaCliente .card').screenshot({path:'tmp/cliente-fiscal/archivo.png'});
 await page.locator('#modalFclCerrar').click();await app('clientes[0].mail="facturas@example.test";fclSelecciona(clientes[0])');
 // No confirma un guardado de cotización que falló en la nube.
 await page.locator('#fcl_mail').fill('no-guardado@example.test');await page.evaluate(()=>window.__fclFalla=true);
 assert.equal(await app('guardaCot()'),false);
 assert.equal(await app('guardadas.find(g=>g.folio===cot.folio).clienteFicha.mail'),'facturas@example.test');
 await page.evaluate(()=>window.__fclFalla=false);await app('fclSelecciona(clientes[0])');
 // Conflicto real del perfil: conserva el formulario y no sobrescribe.
 const antes=await page.evaluate(()=>__fclDocs.length);await page.locator('#fcl_tel').fill('1111111111');
 await page.evaluate(()=>__fclRemoto.tel='2222222222');await page.locator('#btnGuardarCliente').click();
 await page.waitForFunction(()=>!document.querySelector('#fclError').hidden);
 assert.match(await page.locator('#fclError').innerText(),/otro dispositivo/);assert.equal(await page.evaluate(()=>__fclDocs.length),antes);
 await page.evaluate(()=>__fclRemoto.tel='0000000000');await app('fclSelecciona(clientes[0])');
 // Cambiar de negocio mientras se lee la ficha impide enviarla a otra cuenta.
 const idCuenta=await page.evaluate(()=>CUENTA.id);
 await app('window.__fclDBAnterior=DB;window.__fclCruces=0;window.__fclLibera=null;DB={collection:()=>({doc:()=>({get:()=>new Promise(resolve=>window.__fclLibera=()=>resolve({data:()=>({cliente:window.__fclRemoto})})),set:async()=>{window.__fclCruces++}})})}');
 await page.locator('#fcl_tel').fill('1111111111');const pendiente=app('fclGuarda()');await page.waitForFunction(()=>typeof __fclLibera==='function');
 await page.evaluate(()=>{CUENTA.id='otra-cuenta-de-prueba';__fclLibera();});await pendiente;
 assert.equal(await page.evaluate(()=>__fclCruces),0);assert.match(await page.locator('#fclError').innerText(),/cuenta|otro dispositivo/);
 await page.evaluate(id=>CUENTA.id=id,idCuenta);await app('DB=window.__fclDBAnterior;fclSelecciona(clientes[0])');
 // El pago usa la copia del trabajo y pide datos completos sólo al facturar.
 await app('fclCaptura();pgAbre()');assert.equal(await app('PG.rfc'),'AAA010101AAA');assert.equal(await app('PG.uso'),'G03');
 await app('PG.factura=true;PG.forma="Efectivo";PG.cp="";pgPinta()');assert.equal(await page.locator('#pgOk').isDisabled(),true);
 await app('pgCierra();cot.clienteFicha={version:1,nombre:"Sin datos fiscales"};fclPinta();pgAbre()');assert.equal(await app('PG.regimen+PG.uso'),'');
 await app('pgCierra();fclSelecciona(clientes[0]);fclCaptura();guardaCot()');
 // Expediente: JSON de la copia para ventas/admin; producción conserva su vista.
 await page.evaluate(()=>{window.__zipFiles=[];window.JSZip=class{file(p,d){__zipFiles.push({p,d});return this}async generateAsync(){return new Blob(['qa'])}};});
 await app('descargaBlob=async()=>{};zipPedido(cot.folio)');assert.equal(await page.evaluate(()=>__zipFiles.filter(x=>x.p.endsWith('cliente-y-datos-fiscales.json')).length),1);
 await page.evaluate(()=>{Object.assign(PERFIL,{rol:'produccion'});window.__zipFiles=[];});await app('aplicaRol();fclAbreArchivo(cot);zipPedido(cot.folio)');
 assert.equal(await page.locator('#modalFichaCliente').isVisible(),false);assert.equal(await page.evaluate(()=>__zipFiles.some(x=>x.p.endsWith('cliente-y-datos-fiscales.json'))),false);
 await page.evaluate(()=>Object.assign(PERFIL,{rol:'admin'}));await app('aplicaRol();vaATab("cot");renderCot();guiaVaA("cliente")');
 await page.evaluate(()=>{Object.assign(CUENTA,{estado:'vencida',vence:new Date(Date.now()-86400000).toISOString()});pintaCuenta();aplicaPlan();});
 await app('abreExpPedido(cot.folio)');await page.waitForTimeout(100);
 await page.locator('[data-expver="cliente"]').click();assert.ok(await page.locator('#modalFichaCliente').isVisible());await page.locator('#modalFclCerrar').click();assert.equal(await page.locator('#modalFichaCliente').isVisible(),false);
 await page.evaluate(()=>{Object.assign(CUENTA,{estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});pintaCuenta();aplicaPlan();});await app('vaATab("cot");renderCot();guiaVaA("cliente")');
 await page.locator('#fclFiscal').evaluate(e=>e.open=true);
 await page.locator('[data-paso="cliente"]').screenshot({path:'tmp/cliente-fiscal/formulario-noche.png'});
 await app('TEMA.preset="papel";aplicaTema()');await page.locator('[data-paso="cliente"]').screenshot({path:'tmp/cliente-fiscal/formulario-dia.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(450);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.locator('[data-paso="cliente"]').screenshot({path:'tmp/cliente-fiscal/formulario-movil.png'});
 assert.deepEqual(q.errors,[]);console.log('Propuesta fiscal: selección limpia, datos opcionales, guardado/fallo, crédito conservado, copia en Archivo, temas y móvil OK.');
}finally{await q.close();}
