import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
await import('./suspension/prepare.mjs');
let html=fs.readFileSync('tmp/stripe/preview/index.html','utf8');
html=html.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/vender-fixture.js','utf8')+'\nwindow.__consultaCotNuvoor = folio');
const init='<script>(function(){let n=0;const t=setInterval(()=>{if(typeof CUENTA!=="undefined"&&CUENTA&&window.__qaVender){clearInterval(t);Object.assign(CUENTA,{plan:"pro",estado:"activa",vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol:"admin"});pintaCuenta();aplicaPlan();window.__qaVender.seed();}else if(++n>150)clearInterval(t);},100);})();</script>';
const fin=html.lastIndexOf('</body>');html=html.slice(0,fin)+init+html.slice(fin);
fs.writeFileSync('tmp/stripe/preview/vender-propuesta.html',html);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../tmp/categorias/playwright/package/index.mjs');
const dir=path.resolve('tmp/stripe/preview');
const server=http.createServer((req,res)=>{const file=path.resolve(dir,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}if(file.endsWith('favicon.ico')){res.writeHead(204).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream')}).end(b);});});
await new Promise(r=>server.listen(4180,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1400,height:1000}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript(()=>localStorage.setItem('cotizador_tour','1'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const app=code=>page.evaluate(code=>window.__qaVender.eval(code),code);
 await page.goto('http://127.0.0.1:4180/vender-propuesta.html');
 await page.locator('[data-mv-familia="playeras"]').waitFor();
 assert.equal(await page.locator('[data-mv-familia="tazas"]').count(),1);assert.match(await page.locator('[data-mv-familia="tazas"]').innerText(),/3 modelos/);
 assert.equal(await page.locator('#mosCats:visible button').count(),0);
 const antes=await page.evaluate(()=>window.__qaVender.cot());
 await page.locator('[data-mv-familia="playeras"]').click();assert.ok(await page.locator('#mvVelo').isVisible());
 assert.equal(await page.locator('[data-mv-modelo]').count(),5);
 await page.locator('[data-mv-modelo="playera-premium"]').click();await page.locator('#mvCantidad').fill('3');
 assert.equal(await page.locator('#mvImporte').innerText(),'$357.00');
 await page.screenshot({path:'tmp/vender-categorias/modelos-escritorio.png'});
 await page.locator('#mvCancelar').click();assert.equal((await page.evaluate(()=>window.__qaVender.ticket())).lineas.length,0);
 assert.equal(await page.locator('[data-mv-familia="playeras"]').evaluate(b=>document.activeElement===b),true);
 await page.locator('[data-mv-familia="playeras"]').click();await page.locator('[data-mv-modelo="playera-premium"]').click();await page.locator('#mvCantidad').fill('3');await page.locator('#mvAgregar').click();
 let ticket=await page.evaluate(()=>window.__qaVender.ticket());assert.equal(ticket.lineas[0].artId,'playera-premium');assert.equal(ticket.lineas[0].cant,3);assert.equal(ticket.lineas[0].precio,119);
 assert.deepEqual(await page.evaluate(()=>window.__qaVender.cot()),antes,'Vender no cambia la cotización');
 await page.locator('[data-mv-familia="playeras"]').click();await page.locator('[data-mv-modelo="playera-premium"]').click();await page.locator('#mvCantidad').fill('2');await page.locator('#mvAgregar').click();
 ticket=await page.evaluate(()=>window.__qaVender.ticket());assert.equal(ticket.lineas.length,1);assert.equal(ticket.lineas[0].cant,5);
 // El lector agrega directamente, incluso si la búsqueda estaba filtrada.
 await page.locator('#mosQ').fill('750000000001');await page.locator('#mosQ').press('Enter');
 ticket=await page.evaluate(()=>window.__qaVender.ticket());assert.equal(ticket.lineas.find(x=>x.artId==='playera-blanca').cant,1);assert.equal(await page.locator('#mosQ').inputValue(),'');
 await page.locator('#mosQ').fill('mágica');assert.equal(await page.locator('[data-mv-familia]').count(),1);await page.locator('[data-mv-familia="tazas"]').click();assert.equal(await page.locator('[data-mv-modelo]').count(),1);await page.keyboard.press('Escape');
 await page.locator('#mosLimpia').click();assert.ok((await page.locator('[data-mv-familia]').count())>1);
 // Cantidad inválida, promociones e IVA con los mismos cálculos del ticket.
 await app('cat.articulos.find(a=>a.id==="playera-premium").promo={tipo:"nxm",lleva:3,paga:2};P.ivaOn=true;P.iva=16');
 await page.locator('[data-mv-familia="playeras"]').click();await page.locator('[data-mv-modelo="playera-premium"]').click();await page.locator('#mvCantidad').fill('3');assert.equal(await page.locator('#mvImporte').innerText(),'$238.00');assert.match(await page.locator('#mvImporteNota').innerText(),/antes de IVA.*promoción/);
 for(const n of ['0','-1','1.5','']){await page.locator('#mvCantidad').fill(n);assert.equal(await page.locator('#mvAgregar').isDisabled(),true);}
 await page.keyboard.press('Escape');
 // Modelo eliminado después de abrir: no entra al ticket.
 await page.locator('[data-mv-familia="gorras"]').click();await app('cat.articulos=cat.articulos.filter(a=>a.id!==mvEstado.id)');const count=(await page.evaluate(()=>window.__qaVender.ticket())).lineas.length;await app('mvAgrega()');assert.equal((await page.evaluate(()=>window.__qaVender.ticket())).lineas.length,count);assert.equal(await page.locator('#mvVelo').isVisible(),false);
 // La licencia/rol y la cuenta se verifican otra vez al confirmar.
 await page.locator('[data-mv-familia="tazas"]').click();
 await page.evaluate(()=>{CUENTA.estado='vencida';CUENTA.vence=new Date(Date.now()-86400000).toISOString();pintaCuenta();aplicaPlan();});
 await app('mvAgrega()');assert.equal((await page.evaluate(()=>window.__qaVender.ticket())).lineas.length,count);
 assert.equal(await page.locator('#mvCancelar').getAttribute('aria-disabled'),null);await page.locator('#mvCancelar').click();
 await page.evaluate(()=>{CUENTA.estado='activa';CUENTA.vence=new Date(Date.now()+86400000).toISOString();pintaCuenta();aplicaPlan();});
 await page.evaluate(()=>{PERFIL.rol='produccion';});await app('mvAbre("playeras",null)');assert.equal(await page.locator('#mvVelo').isVisible(),false);
 await page.evaluate(()=>{PERFIL.rol='admin';});
 await app('mvAbre("tazas",null)');const cuenta=await page.evaluate(()=>CUENTA.id);await page.evaluate(()=>{CUENTA.id='qa-otra-cuenta';});await app('mvAgrega()');assert.equal(await page.locator('#mvVelo').isVisible(),false);assert.equal((await page.evaluate(()=>window.__qaVender.ticket())).lineas.length,count);await page.evaluate(id=>{CUENTA.id=id;},cuenta);
 await app('window.__qaVender.seed();cat.articulos.find(a=>a.id==="lona").granel="m";renderMostrador()');await page.locator('[data-mv-familia="lonas"]').click();await page.locator('#mvCantidad').fill('2.5');assert.equal(await page.locator('#mvImporte').innerText(),'$212.50');await page.locator('#mvAgregar').click();assert.equal((await page.evaluate(()=>window.__qaVender.ticket())).lineas[0].cant,2.5);
 await app('window.__qaVender.seed()');
 await page.waitForTimeout(3400);
 await page.screenshot({path:'tmp/vender-categorias/categorias-escritorio.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
 assert.equal(await page.locator('#tabs').isVisible(),false,'El menú no debe ocupar el ancho de las categorías en móvil');
 assert.ok((await page.locator('#mosRejilla').boundingBox()).width>300,'Las tarjetas deben usar el ancho del celular');
 await page.screenshot({path:'tmp/vender-categorias/categorias-movil.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.locator('[data-mv-familia="playeras"]').click();await page.locator('[data-mv-modelo="playera-premium"]').click();await page.locator('#mvCantidad').fill('3');
 await page.screenshot({path:'tmp/vender-categorias/modelos-movil.png'});
 assert.ok(await page.locator('#mvAgregar').isVisible());
 assert.equal(await page.locator('#mvVelo').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 await app('TEMA.preset="tecno";aplicaTema()');await page.screenshot({path:'tmp/vender-categorias/modelos-noche.png'});
 await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-mv-familia="playeras"]').click();assert.equal(await page.locator('#mvVelo .svVentana').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.deepEqual(errors,[]);console.log('Vender integrado: familias, modelos, cantidad, cancelar, ticket, lector, búsqueda, precios/promos/IVA, vencimiento, móvil y noche: OK.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
