import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';import './suspension/prepare.mjs';import {abre} from './navegador.mjs';
let fake=fs.readFileSync('tmp/stripe/preview/fake-supabase.js','utf8');fake=fake.replace('window.supabase={createClient:()=>client};',fs.readFileSync('tests/lab-personas-fixture.js','utf8')+'\nwindow.supabase={createClient:()=>client};');fs.writeFileSync('tmp/stripe/preview/fake-supabase.js',fake);
const html=fs.readFileSync('tmp/stripe/preview/lab.html','utf8');for(const [i,m]of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())if(m[1].trim())new vm.Script(m[1],{filename:'lab-script-'+i});
const q=await abre('tmp/stripe/preview'),{page}=q;
try{
 await page.goto(q.url+'/lab.html');await page.waitForFunction(()=>document.querySelector('#n_usuarios')?.textContent==='3');
 assert.equal(await page.locator('#nav [data-v]').count(),14);assert.equal(await page.locator('.nlMetric').count(),4);
 assert.match(await page.locator('#vista').innerText(),/Sin capturar/);assert.match(await page.locator('.nlMetric').nth(1).innerText(),/775/);
 await page.locator('[data-nlgo="usuarios"]').first().click();assert.equal(await page.locator('#vista tbody tr').count(),3);
 await page.locator('#busca').fill('Tres');assert.equal(await page.locator('#vista tbody tr').count(),1);await page.locator('#busca').fill('');
 await page.locator('[data-nlpersona="10000000-0000-4000-8000-000000000003"]').click();assert.equal(await page.locator('#nlf_correo').inputValue(),'tres@example.test');assert.equal(await page.locator('#nlf_correo').getAttribute('readonly'),'');
 await page.locator('[data-nltab="accesos"]').click();assert.match(await page.locator('#ficha').innerText(),/Taller de muestra/);await page.locator('#cerrarFicha').click();
 await page.locator('#nav [data-v="tablero"]').click();await page.locator('[data-nlgo="incompletas"]').first().click();assert.equal(await page.locator('#vista tbody tr').count(),2);
 await page.locator('[data-nlcuenta="20000000-0000-4000-8000-000000000002"]').click();await page.locator('[data-nltab="negocio"]').click();
 assert.equal(await page.locator('#nlf_pais').inputValue(),'');await page.locator('#nlf_pais').fill('México');await page.locator('#nlf_ciudad').fill('Ciudad de prueba');
 await page.locator('[data-nltab="persona"]').click();await page.locator('[data-nltab="negocio"]').click();assert.equal(await page.locator('#nlf_ciudad').inputValue(),'Ciudad de prueba');
 await page.locator('#nlGuardaFicha').click();await page.waitForFunction(()=>window.__labQa.writes.length===1);await page.waitForFunction(()=>document.querySelector('#nlGuardaFicha')?.textContent==='Guardar datos');
 assert.equal(await page.locator('#nlf_ciudad').inputValue(),'Ciudad de prueba');
 await page.locator('[data-nltab="persona"]').click();await page.locator('#nlf_tel').fill('0000000000');await page.evaluate(()=>__labQa.fail=true);await page.locator('#nlGuardaFicha').click();
 await page.waitForFunction(()=>!document.querySelector('#nlFichaError').hidden);assert.equal(await page.locator('#nlf_tel').inputValue(),'0000000000');
 await page.evaluate(()=>__labQa.fail=false);await page.locator('#nlGuardaFicha').click();await page.waitForFunction(()=>__labQa.writes.length===2);await page.waitForFunction(()=>document.querySelector('#nlGuardaFicha')?.textContent==='Guardar datos');
 assert.equal(await page.evaluate(()=>Object.keys(__labQa.writes[1].p_datos).includes('correo')),false);
 await page.locator('[data-nltab="plan"]').click();assert.ok(await page.locator('#fPlan').isVisible());await page.locator('[data-nltab="seguimiento"]').click();assert.ok(await page.locator('[data-acc="guardacita"]').isVisible());
 await page.locator('#cerrarFicha').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#n_usuarios')?.textContent==='3');
 await page.locator('#nav [data-v="cuentas"]').click();await page.locator('#busca').fill('Ciudad de prueba');assert.equal(await page.locator('#vista tbody tr').count(),1);
 await page.locator('#nav [data-v="tablero"]').click();await page.locator('[data-nlperiodo="12"]').click();assert.equal(await page.locator('.nlBars button').count(),12);await page.locator('.nlBars button').last().click();assert.match(await page.locator('#nlChartHint').innerText(),/al mes sin IVA/);
 for(const v of ['agenda','soporte','cobros','transferencias','codigos','diagnosticos','equipo','anuncios','tips','base','numeros']){await page.locator('#nav [data-v="'+v+'"]').click();assert.ok((await page.locator('#vista').innerText()).length>10);}
 await page.locator('#nav [data-v="tablero"]').click();await page.waitForTimeout(500);await page.screenshot({path:'tmp/stripe/lab-integrado-dia.png',fullPage:true});
 await page.locator('#labTema').click();assert.equal(await page.locator('#labTema').innerText(),'');assert.equal(await page.locator('#labTema').getAttribute('aria-checked'),'true');await page.screenshot({path:'tmp/stripe/lab-integrado-noche.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.locator('#labMenu').click();await page.locator('#nav [data-v="usuarios"]').click();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('nlMenuOpen')),false);
 await page.locator('[data-nlpersona="10000000-0000-4000-8000-000000000001"]').click();await page.waitForTimeout(400);assert.ok(await page.locator('#nlGuardaFicha').isVisible());
 const caja=await page.locator('#ficha').boundingBox();assert.ok(caja.x>=-1&&caja.x+caja.width<=391);assert.equal(await page.locator('#ficha').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await page.screenshot({path:'tmp/stripe/lab-integrado-persona-movil.png',fullPage:true});
 assert.deepEqual(q.errors,[]);console.log('Lab integrado: datos reales del puente, usuarios/membresías, países vacíos, guardado y fallo, recarga, 14 vistas, tema y móvil OK.');
}finally{await q.close();}
