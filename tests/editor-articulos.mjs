import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
await import('./suspension/prepare.mjs');
let html=fs.readFileSync('tmp/stripe/preview/index.html','utf8');
html=html.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__consultaCotNuvoor = folio');
fs.writeFileSync('tmp/stripe/preview/index.html',html);
const module=process.env.PLAYWRIGHT_MODULE||'../tmp/categorias/playwright/package/index.mjs';
const {chromium}=await import(path.isAbsolute(module)?pathToFileURL(module):module);
const dir=path.resolve('tmp/stripe/preview');
const server=http.createServer((req,res)=>{
 const file=path.resolve(dir,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}
 if(file.endsWith('favicon.ico')){res.writeHead(204).end();return;}
 fs.readFile(file,(err,body)=>{if(err){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/plain'}).end(body);});
});
await new Promise(r=>server.listen(4180,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:950}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript(()=>localStorage.setItem('cotizador_tour','1'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const app=code=>page.evaluate(code=>window.__qaCategorias.eval(code),code);
 const licencia=async(plan='pro',rol='admin',estado='activa')=>{
   await page.evaluate(({plan,rol,estado})=>{Object.assign(CUENTA,{plan,estado,vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol});pintaCuenta();aplicaPlan();},{plan,rol,estado});
   await app('aplicaRol();limpiaGrupos()');
 };
 await page.goto('http://127.0.0.1:4180/index.html?producto=taller');
 await page.waitForFunction(()=>typeof window.__qaCategorias==='object'&&typeof CUENTA!=='undefined'&&!!CUENTA);
 await licencia();
 assert.equal(await page.locator('#tabs input').count(),0,'El menú conserva un campo que el navegador puede autocompletar');
 await app(`window.__qaCategorias.seed();clearTimeout(saveT);
   cat.articulos[0].existencia=50;cat.articulos[0].fotoRef='privada/original.png';cat.articulos[0].promo={tipo:'test'};cat.articulos[0].propio='conservar';
   window.__ceRemote=JSON.parse(JSON.stringify(cat));window.__ceWrites=0;window.__ceUploads=0;window.__ceFail=false;
   DB={doc:key=>({get:async()=>({exists:true,data:()=>({cat:JSON.parse(JSON.stringify(window.__ceRemote))})}),set:async body=>{if(key!=='config/catalogo')return;if(window.__ceFail)throw Error('Fallo simulado de red');window.__ceWrites++;window.__ceRemote=JSON.parse(JSON.stringify(body.cat));}})};
   ASSETS={upload:async file=>{window.__ceUploads++;return {id:'privada/foto-prueba.png',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBv8AAAAASUVORK5CYII='};}};
   vaATab('cat');abreTarjetaSec('cat','articulos');renderCatalogo();clearTimeout(saveT);`);
 await page.locator('[data-cefamilia="playeras"]').waitFor();
 assert.equal(await page.locator('#t_articulos').isVisible(),false);
 for(const id of ['catImportar','catCodsTodos','catEtiquetas'])assert.ok(await page.locator('#'+id).isVisible());
 await page.screenshot({path:'tmp/stripe/catalogo-integrado-categorias.png'});
 await page.locator('[data-cefamilia="playeras"]').click();
 await page.locator('[data-cemodelo="playera-a"]').click();
 assert.equal(await page.locator('#ce_nombre').inputValue(),'Playera algodón');
 await page.screenshot({path:'tmp/stripe/catalogo-integrado-editor.png'});
 await page.locator('#ce_nombre').fill('No guardar');await page.locator('#ceCancelar').click();
 assert.equal(await page.evaluate(()=>window.__ceWrites),0);
 assert.equal(await app("cat.articulos[0].nombre"),'Playera algodón');
 await page.locator('[data-cefamilia="playeras"]').click();
 await page.locator('#ce_costo').fill('88.50');await page.locator('#ce_precio').fill('0');
 await page.locator('#ce_colores').check();await page.locator('#ce_listaColores').fill('Negra, blanca');
 // El inventario y campos ajenos que cambien durante la edición no se pisan.
 await page.evaluate(()=>{window.__ceRemote.articulos[0].existencia=9;window.__ceRemote.articulos[0].propio='cambió fuera';window.__ceRemote.articulos.push({id:'ajeno',nombre:'Agregado por otro equipo',cat:'Otros',costo:10});});
 await page.locator('#ceGuardar').click();await page.waitForFunction(()=>window.__ceWrites===1);
 assert.equal(await app("cat.articulos[0].costo"),88.5);
 assert.equal(await app("cat.articulos[0].precio"),0);
 assert.equal(await app("cat.articulos[0].existencia"),9);
 assert.equal(await app("cat.articulos[0].fotoRef"),'privada/original.png');
 assert.equal(await app("cat.articulos[0].propio"),'cambió fuera');
 assert.equal(await app("cat.articulos.find(a=>a.id==='ajeno').nombre"),'Agregado por otro equipo');
 assert.equal(await app("cat.historial.at(-1).despues"),88.5);
 await page.locator('#ceNuevo').click();
 await page.locator('#ceGuardar').click();assert.ok(await page.locator('#ceError').isVisible());
 await page.locator('#ce_nombre').fill('Playera de prueba nueva');
 await page.locator('#ce_costo').fill('50');await page.locator('#ce_precio').fill('80');
 await page.locator('#ceCodigos summary').click();
 await page.locator('#ce_sku').fill('000-PRUEBA');await page.locator('#ce_barras').fill('00123456');
 await page.locator('#ce_claveSat').fill('53103001');await page.locator('#ce_claveUnidad').selectOption('H87');
 await page.locator('#ceFotoFile').setInputFiles({name:'muestra.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBv8AAAAASUVORK5CYII=','base64')});
 assert.equal(await page.evaluate(()=>window.__ceUploads),0,'La foto se subió antes de guardar');
 await page.locator('#ceGuardar').click();await page.waitForFunction(()=>window.__ceWrites===2);
 assert.equal(await page.evaluate(()=>window.__ceUploads),1);
 const saved=await app("cat.articulos.find(a=>a.sku==='000-PRUEBA')");
 assert.equal(saved.barras,'00123456');assert.equal(saved.fotoRef,'privada/foto-prueba.png');assert.equal(saved.existencia,0);
 assert.equal(await page.evaluate(()=>window.__ceRemote.articulos.find(a=>a.sku==='000-PRUEBA').foto),undefined,'Se persistió una URL temporal en lugar de la ruta privada');
 // Error de red: no hay mensaje de éxito ni mutación local y se puede reintentar.
 await page.locator('#ce_precio').fill('99');await page.evaluate(()=>window.__ceFail=true);
 await page.locator('#ceGuardar').click();await page.waitForFunction(()=>!document.querySelector('#ceError').hidden);
 assert.equal(await app("cat.articulos.find(a=>a.sku==='000-PRUEBA').precio"),80);
 await page.evaluate(()=>window.__ceFail=false);await page.locator('#ceGuardar').click();await page.waitForFunction(()=>window.__ceWrites===3);
 assert.equal(await app("cat.articulos.find(a=>a.sku==='000-PRUEBA').precio"),99);
 // Modificaciones simultáneas del mismo campo se detectan, sin sobrescribir.
 await page.locator('#ce_precio').fill('101');await page.evaluate(()=>window.__ceRemote.articulos.find(a=>a.sku==='000-PRUEBA').precio=110);
 await page.locator('#ceGuardar').click();await page.waitForFunction(()=>document.querySelector('#ceError').textContent.includes('cambió mientras'));
 assert.equal(await page.evaluate(()=>window.__ceWrites),3);
 await page.locator('#ceCancelar').click();
 // El plan vencido y otros roles no pueden abrir ni guardar el editor.
 await licencia('pro','produccion');await app("ceAbre('playeras','playera-a',null)");assert.equal(await page.locator('#ceVelo').isVisible(),false);
 await licencia('pro','admin');await app("ceAbre('playeras','playera-a',null)");
  await page.evaluate(()=>{window.__ceEstadoOriginal=window.__estadoLicenciaNuvoor;window.__estadoLicenciaNuvoor=()=>({...window.__ceEstadoOriginal(),cuenta:'otra-cuenta-ficticia'});});
  await app('ceGuarda(false)');assert.equal(await page.evaluate(()=>window.__ceWrites),3);
  assert.ok((await page.locator('#ceError').textContent()).includes('cuenta cambió'));
  await page.evaluate(()=>window.__estadoLicenciaNuvoor=window.__ceEstadoOriginal);
 await licencia('pro','admin','vencida');await app('ceGuarda(false)');assert.equal(await page.evaluate(()=>window.__ceWrites),3);
 await page.locator('#ceCancelar').click();
 await licencia('pro','admin');await app("vaATab('cat');abreTarjetaSec('cat','articulos');renderCatalogo();clearTimeout(saveT)");
 // Mantener el ajuste masivo y el renderer anterior de otros giros.
 await app("P.giro='tiendita';renderTabla('articulos')");assert.ok(await page.locator('#t_articulos').isVisible());
 await app("P.giro='taller';renderTabla('articulos')");assert.equal(await page.locator('#t_articulos').isVisible(),false);
 await page.setViewportSize({width:390,height:950});await page.waitForTimeout(200);
 await page.locator('[data-cefamilia="playeras"]').click();
 await page.screenshot({path:'tmp/stripe/catalogo-integrado-movil.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#ceGuardar').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'ceCerrar');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#ceVelo').isVisible(),false);
 await page.setViewportSize({width:1280,height:1000});await app("TEMA.preset='tecno';aplicaTema();ceAbre('tazas','taza-a',null)");
 await page.screenshot({path:'tmp/stripe/catalogo-integrado-oscuro.png'});
  await app("ceCierra();ceAbre('mi familia','personalizado',null)");
  page.once('dialog',d=>d.dismiss());await page.locator('#ceEliminar').click();
  assert.equal(await page.evaluate(()=>window.__ceWrites),3);
  page.once('dialog',d=>d.accept());await page.locator('#ceEliminar').click();
  await page.waitForFunction(()=>window.__ceWrites===4);
  assert.equal(await app("cat.articulos.some(a=>a.id==='personalizado')"),false);
 assert.deepEqual(errors,[]);
 console.log('Editor real con servicios ficticios: categorías, alta/edición, foto al guardar, códigos, existencia readonly, mezcla de otros cambios, conflicto, error/reintento, roles/vencida, Store, móvil y oscuro OK.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
