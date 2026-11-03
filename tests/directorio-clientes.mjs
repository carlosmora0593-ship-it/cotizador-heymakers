import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import './suspension/prepare.mjs';import {abre} from './navegador.mjs';
const dir='tmp/stripe/preview/';let h=fs.readFileSync(dir+'index.html','utf8');h=h.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__qaDirectorio={eval:code=>eval(code)};\nwindow.__consultaCotNuvoor = folio');fs.writeFileSync(dir+'index.html',h);
let fake=fs.readFileSync(dir+'fake-supabase.js','utf8');fake=fake.replace('window.supabase={createClient:()=>client};',fs.readFileSync('tests/directorio-clientes-fixture.js','utf8')+'\nwindow.supabase={createClient:()=>client};');fs.writeFileSync(dir+'fake-supabase.js',fake);
for(const m of h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
const q=await abre(dir),{page}=q,app=code=>page.evaluate(code=>__qaDirectorio.eval(code),code);
try{
 await page.goto(q.url+'/index.html?producto=taller');await page.waitForFunction(()=>window.__qaDirectorio&&typeof CUENTA!=='undefined'&&CUENTA);
 await page.evaluate(()=>{Object.assign(CUENTA,{plan:'pro',estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol:'admin'});pintaCuenta();aplicaPlan();});
 await app('aplicaRol();__qaCategorias.seed();clientes=[];cot.clienteId="";cot.cliente="";fclSelecciona(null);renderCot();guiaVaA("cliente");azClientes()');
 assert.equal(await page.locator('#azCli .nvCliOpcion').count(),2);assert.match(await page.locator('#azCli').innerText(),/Cliente nuevo.*Buscar cliente/s);
 await page.waitForTimeout(300);await page.locator('[data-paso="cliente"]').screenshot({path:'tmp/stripe/clientes-dos-tarjetas.png'});
 await page.locator('#nvCliAbrir').click();await page.waitForFunction(()=>document.querySelectorAll('.nvCliFicha').length===6);assert.equal(await page.locator('#nvCliRango').innerText(),'1–6 de 1,284');
 await page.locator('#nvCliSiguiente').click();await page.waitForFunction(()=>document.querySelector('#nvCliRango').textContent.startsWith('7–12'));assert.equal(await page.locator('.nvCliFicha').count(),6);
 await page.locator('#nvCliAnterior').click();await page.waitForFunction(()=>document.querySelector('#nvCliRango').textContent.startsWith('1–6'));await page.locator('#modalBuscarClientes>.card').screenshot({path:'tmp/stripe/clientes-seis-tarjetas.png'});
 await page.locator('#nvCliBusca').fill('Aurora');await page.waitForFunction(()=>document.querySelectorAll('.nvCliFicha').length===1);await page.locator('.nvCliFicha').click();await page.waitForFunction(()=>document.querySelector('#modalBuscarClientes').hidden);
 assert.equal(await page.locator('#c_cliente').inputValue(),'Impresos Aurora');assert.equal(await page.locator('#fcl_rfc').inputValue(),'AAA010101AAA');assert.match(await page.locator('#nvCliTituloFicha').innerText(),/Editar/);assert.equal(await app('clientes.length'),1);
 await page.locator('#fcl_tel').fill('0000009999');await page.locator('#btnGuardarCliente').click();await page.waitForFunction(()=>__clientesQa.escrituras.length>0);assert.equal(await page.evaluate(()=>__clientesQa.clientes.find(c=>c.id==='qa-1283').tel),'0000009999');
 assert.equal(await page.evaluate(()=>__clientesQa.clientes.find(c=>c.id==='qa-1283').credito),5000);assert.equal(await app('clientes.length'),1);
 await page.locator('#azCli [data-azcli=""]').click();assert.equal(await page.locator('#c_cliente').inputValue(),'');assert.equal(await page.locator('#fcl_rfc').inputValue(),'');
 await page.locator('#nvCliAbrir').click();await page.waitForFunction(()=>document.querySelectorAll('.nvCliFicha').length===6);await page.evaluate(()=>__clientesQa.fallar=true);await page.locator('#nvCliBusca').fill('no hay red');await page.waitForFunction(()=>document.querySelector('#nvCliReintenta'));
 assert.equal(await page.locator('#nvCliSiguiente').isDisabled(),true);await page.evaluate(()=>__clientesQa.fallar=false);await page.locator('#nvCliBusca').fill('diseno horizonte');await page.waitForFunction(()=>document.querySelectorAll('.nvCliFicha').length===1);assert.match(await page.locator('.nvCliFicha').innerText(),/Diseño Horizonte/);
 await page.locator('#nvCliBusca').fill('');await page.waitForFunction(()=>document.querySelectorAll('.nvCliFicha').length===6);await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);assert.equal(await page.locator('#modalBuscarClientes .card').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.locator('#modalBuscarClientes>.card').screenshot({path:'tmp/stripe/clientes-seis-movil.png'});
 await page.locator('#modalBuscarClientesCerrar').click();await app('TEMA.preset="tecno";aplicaTema()');await page.locator('[data-paso="cliente"]').screenshot({path:'tmp/stripe/clientes-dos-noche.png'});
 // Una respuesta anterior no reemplaza una búsqueda nueva ni una selección se aplica a otro pedido.
 await page.evaluate(()=>__clientesQa.demora=700);await page.locator('#nvCliAbrir').click();await page.locator('#nvCliBusca').fill('Aurora');
 await page.waitForFunction(()=>document.querySelectorAll('.nvCliFicha').length===1);assert.match(await page.locator('.nvCliFicha').innerText(),/Aurora/);
 await page.evaluate(()=>{__clientesQa.demora=0;__clientesQa.demoraFicha=600;});await page.locator('.nvCliFicha').click();const folio=await app('cot.folio');await app('cot.folio="pedido-distinto"');
 await page.waitForFunction(()=>document.querySelector('#modalBuscarClientes').hidden);assert.equal(await app('cot.clienteId'),'');await app('cot.folio='+JSON.stringify(folio));
 await page.evaluate(()=>__clientesQa.demoraFicha=0);await page.keyboard.press('Escape');
 assert.deepEqual(q.errors,[]);console.log('Dos tarjetas y directorio: 6 por página, servidor con 1284 fichas, selección fuera de caché, edición sin duplicar, crédito/fiscal conservados, errores y móvil OK.');
}finally{await q.close();}
