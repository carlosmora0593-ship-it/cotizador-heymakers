import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';process.chdir(fileURLToPath(new URL('../',import.meta.url)));
await import('./suspension/prepare.mjs');
let html=fs.readFileSync('tmp/stripe/preview/index.html','utf8');
html=html.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__consultaCotNuvoor = folio');
fs.writeFileSync('tmp/stripe/preview/index.html',html);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../tmp/categorias/playwright/package/index.mjs');
const dir=path.resolve('tmp/stripe/preview'),server=http.createServer((req,res)=>{
 const f=path.resolve(dir,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(dir+path.sep)){res.writeHead(403).end();return;}
 if(f.endsWith('favicon.ico')){res.writeHead(204).end();return;}
 fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png'}[path.extname(f)]||'application/octet-stream')}).end(b);});
});await new Promise(r=>server.listen(4180,'127.0.0.1',r));let browser;
const rgb=h=>h.replace('#','').match(/../g).map(x=>parseInt(x,16)/255);
const luminancia=h=>rgb(h).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contraste=(a,b)=>(Math.max(luminancia(a),luminancia(b))+.05)/(Math.min(luminancia(a),luminancia(b))+.05);
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:950}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript(()=>{
  localStorage.setItem('cotizador_tour','1');
  if(!localStorage.getItem('qaTemaInicializado')){
   localStorage.setItem('cotizador_tema',JSON.stringify({preset:'papel',acento:'#D2541F',vidrio:'vidrio',esquinas:'suave',v:2}));localStorage.setItem('qaTemaInicializado','1');
  }
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const app=code=>page.evaluate(code=>window.__qaCategorias.eval(code),code);
 const abrir=async()=>{await page.goto('http://127.0.0.1:4180/index.html?producto=taller');await page.waitForFunction(()=>typeof window.__qaCategorias==='object'&&typeof CUENTA!=='undefined'&&!!CUENTA);};
 const licencia=async()=>{await page.evaluate(()=>{Object.assign(CUENTA,{plan:'pro',estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol:'admin'});pintaCuenta();aplicaPlan();});await app('aplicaRol();limpiaGrupos()');};
 await abrir();
 let tema=await app('TEMA');assert.equal(tema.v,3);assert.equal(tema.preset,'papel');assert.equal(tema.acento,'');assert.equal(tema.vidrio,'vidrio');assert.equal(tema.esquinas,'suave');
 assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('cotizador_tema')))).v,3);
 await licencia();await page.locator('#tabs [data-tab="set"]').click();await page.locator('[data-seclz="set|tema"]').click();
 assert.ok(await page.locator('[data-set="tema"]').isVisible());
 assert.equal(await page.locator('#temaAcento').inputValue(),'#4458a4');
 for(const modo of ['papel','tecno']){
  await page.locator('[data-tema="'+modo+'"]').click();
  const v=await app('({acento:TEMAS[TEMA.preset].acento,tinta:tintaLegible(TEMAS[TEMA.preset].acento),sec:TEMAS[TEMA.preset].vars["--surface"],muted:TEMAS[TEMA.preset].vars["--ink-3"]})');
  assert.ok(contraste(v.acento,v.tinta)>=4.5,'Contraste de botón '+modo);assert.ok(contraste(v.sec,v.muted)>=4.5,'Texto secundario '+modo);
  const button=await page.locator('#tabs [data-tab="cot"]').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderRadius,text:getComputedStyle(el.querySelector('b')).color}));
  assert.notEqual(button.bg,button.text);assert.ok(parseFloat(button.radius)>0);
  const help=await page.locator('.ayudaBtn').evaluate(el=>getComputedStyle(el).backgroundImage);assert.match(help,/68, 88, 164/);assert.ok(contraste('#4458a4','#ffffff')>4.5);
  await page.screenshot({path:'tmp/stripe/apariencia-nuvoor-'+modo+'.png',fullPage:true});
 }
 await page.locator('[data-tema="papel"]').click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);assert.equal(await page.locator('#tabs').isVisible(),false);
 await page.screenshot({path:'tmp/stripe/apariencia-nuvoor-movil.png',fullPage:true});
 // Preferencias propias nuevas y las anteriores que no eran el color de fábrica.
 await app('TEMA.acento="#206080";guardaTema();aplicaTema();renderTema()');
 await page.reload();await page.waitForFunction(()=>typeof window.__qaCategorias==='object'&&typeof CUENTA!=='undefined'&&!!CUENTA);
 assert.equal((await app('TEMA')).acento,'#206080');
 const propio=await app('migraTema({preset:"papel",acento:"#783fa1",vidrio:"nitido",esquinas:"recto",v:2},{preset:"papel",acento:"#783fa1",v:2})');assert.equal(propio.acento,'#783fa1');assert.equal(propio.esquinas,'recto');
 const noche=await app('migraTema({preset:"tecno",acento:"#22D3EE",vidrio:"normal",esquinas:"redondo",v:2},{preset:"tecno",acento:"#22D3EE",v:2})');assert.equal(noche.preset,'tecno');assert.equal(noche.acento,'');
 assert.deepEqual(errors,[]);console.log('Apariencia Nuvoor: migración v3, preferencias, persistencia, paletas, contraste, botones y móvil: OK.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
