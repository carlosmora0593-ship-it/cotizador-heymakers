import fs from 'node:fs';import assert from 'node:assert/strict';import './suspension/prepare.mjs';import {abre} from './navegador.mjs';
const dir='tmp/stripe/preview/';let h=fs.readFileSync(dir+'index.html','utf8');h=h.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__qaAjustes={eval:code=>eval(code)};\nwindow.__consultaCotNuvoor = folio');fs.writeFileSync(dir+'ajustes.html',h);
const q=await abre(dir),{page}=q,app=code=>page.evaluate(code=>__qaAjustes.eval(code),code);
try{
 await page.goto(q.url+'/ajustes.html?producto=taller');await page.waitForFunction(()=>window.__qaAjustes&&typeof CUENTA!=='undefined'&&CUENTA);
 await page.evaluate(()=>{Object.assign(CUENTA,{plan:'pro',estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol:'admin'});pintaCuenta();aplicaPlan();});
 // Una preferencia antigua de la nube no apaga el recorrido ni cambia la edición.
 await app(`(async()=>{aplicaRol();window.__qaParametros={...defaultParams(),guiado:false,guiadoElegido:true,giro:'tiendita',turnos:true,margen:57,selloPrueba:'conservar'};
 window.__qaUse=window.claude.use.bind(window.claude);window.__qaDB={doc:ref=>({get:async()=>ref==='config/parametros'?{exists:true,data:()=>({P:JSON.parse(JSON.stringify(__qaParametros))})}:{exists:false,data:()=>({})},set:async()=>{}}),collection:()=>{const c={orderBy:()=>c,limit:()=>c,get:async()=>({docs:[]})};return c;}};window.claude.use=async tipo=>tipo==='db'?__qaDB:__qaUse(tipo);await initStore();})()`);
 assert.equal(await app('guiado()'),true);assert.equal(await app('P.guiado'),true);assert.equal(await app('P.guiadoElegido'),true);assert.equal(await app('P.giro'),'taller');assert.equal(await app('P.margen'),57);assert.equal(await app('P.turnos'),true);assert.equal(await app('P.selloPrueba'),'conservar');
 // También se normalizan parámetros locales, sin alterar costos o turnos.
 await app(`(async()=>{window.claude.use=async tipo=>tipo==='db'?null:__qaUse(tipo);DB=null;lsSet('P',{...__qaParametros,margen:43});await initStore();})()`);assert.equal(await app('P.guiado'),true);assert.equal(await app('P.margen'),43);assert.equal(await app('P.turnos'),true);
 await app(`__qaCategorias.seed();P.guiado=false;P.giro='tiendita';aplicaGiro();renderCot();guiaVaA('cliente')`);
 assert.equal(await app('guiado()'),true);assert.equal(await app('giroActual()'),'taller');assert.equal(await app('PRODUCTO.clave'),'taller');assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('cotGuiado')),true);
 const siguiente=page.locator('[data-paso="cliente"] [data-guiasig]');assert.equal(await siguiente.isDisabled(),true);await page.locator('#c_cliente').fill('Cliente ficticio');await siguiente.click();assert.equal(await app('GUIA.actual'),'articulo');
 await app(`estrenaGuiado();vaATab('set');cierraTarjetaSec('set');renderSet()`);assert.equal(await page.locator('[data-seclz="set|cotizar"],[data-seclz="set|giro"],#p_guiado,#cardGiro').count(),0);assert.equal(await page.locator('#lz_set .lzApp').count(),10);
 await page.locator('#tab-set').screenshot({path:'tmp/stripe/ajustes-imprenta-simplificados.png'});
 await page.locator('[data-seclz="set|permisos"]').click();assert.equal(await page.locator('#p_turnos').isVisible(),true);assert.equal(await page.locator('#p_turnos').isChecked(),true);
 await page.locator('#p_turnos').uncheck();assert.equal(await app('P.turnos'),false);assert.equal(await app('guiado()'),true);
 // Un respaldo viejo sigue entrando como Imprenta por pasos.
 await page.locator('#fileIn').setInputFiles({name:'respaldo-ficticio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({P:{guiado:false,guiadoElegido:true,giro:'tiendita',margen:44,turnos:true}}))});
 await page.waitForFunction(()=>__qaAjustes.eval('P.margen')===44);assert.equal(await app('P.guiado'),true);assert.equal(await app('P.giro'),'taller');assert.equal(await app('P.turnos'),true);
 await page.setViewportSize({width:390,height:844});await app(`vaATab('set');cierraTarjetaSec('set');renderSet()`);await page.waitForTimeout(400);await page.locator('#tab-set').screenshot({path:'tmp/stripe/ajustes-imprenta-movil.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.deepEqual(q.errors,[]);console.log('Ajustes Imprenta: recorrido obligatorio con parámetros antiguos de nube/local/respaldo, validación y avance, sin selectores de modo/giro, edición fija, caja por turnos preservada y móvil OK.');
}finally{await q.close();}
