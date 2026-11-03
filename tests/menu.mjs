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
 res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.png')?'image/png':'text/plain'}).end(body);});
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
  // El acceso principal conserva contraste estando activo e inactivo.
  for(const theme of ['papel','tecno']){
    await app('TEMA.preset='+JSON.stringify(theme)+';aplicaTema()');
    for(const selected of ['inicio','cot']){
      await page.locator('#tabs [data-tab="'+selected+'"]').click();
      const colors=await page.locator('#tabs [data-tab="cot"]').evaluate(b=>({
        bg:getComputedStyle(b).backgroundColor,text:getComputedStyle(b.querySelector('b')).color,
        icon:getComputedStyle(b.querySelector('.ico')).color,label:b.querySelector('b').textContent.trim()
      }));
      assert.equal(colors.label,'Cotizar');
      assert.notEqual(colors.bg,colors.text,'Cotizar sin contraste '+theme+' activo='+selected);
      assert.notEqual(colors.bg,colors.icon,'Icono sin contraste '+theme+' activo='+selected);
      if(theme==='papel'&&selected==='cot')await page.screenshot({path:'tmp/stripe/menu-cotizar-activo-claro.png'});
    }
  }
 assert.equal(await page.locator('#tabs [data-tab]').count(),18);
 assert.equal(await page.locator('#tabs [data-nav-grupo][aria-expanded="true"]').count(),4);
 assert.equal(await page.locator('#tabs [data-tab="val"] #valBadge').count(),1);
 for(const t of ['inicio','cot','mos','sav','cli','dis','pro','arc','caj','ven','com','val','inv','cat','calc','asi','nom','set'])assert.equal(await page.locator('#tabs [data-tab="'+t+'"]').count(),1);
 await page.locator('#tabs [data-tab="pro"]').click();
 assert.equal(await page.locator('#tabs [data-tab][aria-selected="true"]').count(),1);
 assert.equal(await page.locator('#tabs [data-tab="pro"]').getAttribute('aria-current'),'page');
 await page.screenshot({path:'tmp/stripe/menu-integrado-escritorio.png'});
 const footer=await page.locator('#tabs .nvNavAjustes').boundingBox();assert.ok(footer.y+footer.height<=950);
 assert.equal(await page.locator('#tabs input').count(),0,'El menú no debe ofrecer campos para autocompletado');
 await page.locator('#tabs [data-tab="nom"]').click();
 await page.locator('#tabs [data-nav-grupo="Materiales"]').click();
 assert.equal(await page.locator('#tabs [data-tab="calc"]').isVisible(),false);
 await page.locator('#tabs [data-nav-grupo="Materiales"]').click();
 assert.ok(await page.locator('#tabs [data-tab="calc"]').isVisible());
 await page.locator('#tabs [data-tab="set"]').click();
 assert.ok(await page.locator('#tab-set').isVisible());
 await licencia('pro','produccion');
 assert.equal(await page.locator('#tabs [data-tab="set"]').isVisible(),false);
 assert.equal(await page.locator('#tabs [data-tab="ven"]').isVisible(),false);
 assert.equal(await page.locator('#tabs [data-tab="nom"]').isVisible(),false);
 assert.ok(await page.locator('#tabs [data-tab="inv"]').isVisible());
 await licencia('basico','admin');
 for(const t of ['ven','caj','inv','com'])assert.equal(await page.locator('#tabs [data-tab="'+t+'"]').isVisible(),false);
 await licencia('pro','admin','vencida');
 assert.equal(await page.locator('#tabs [data-tab="cot"]').getAttribute('aria-disabled'),'true');
 await page.locator('#tabs [data-tab="cot"]').click({force:true});
 assert.ok(await page.locator('#tab-inicio').isVisible());
 await page.locator('#tabs [data-tab="sav"]').click();assert.ok(await page.locator('#tab-sav').isVisible());
 await licencia();
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(250);
 assert.equal(await page.locator('#tabs').isVisible(),false);
 await page.locator('#menuBtn').click();
 assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'),'true');
 assert.ok(await page.locator('#tabs').isVisible());
 await page.locator('#tabs [data-nav-grupo="Dinero"]').click();
 assert.ok(await page.locator('#tabs').isVisible());
 await page.locator('#tabs [data-nav-grupo="Dinero"]').click();
 await page.locator('#tabs [data-tab="cot"]').click();
 await page.locator('#menuBtn').click();
 const mobileColors=await page.locator('#tabs [data-tab="cot"]').evaluate(b=>({bg:getComputedStyle(b).backgroundColor,text:getComputedStyle(b.querySelector('b')).color,icon:getComputedStyle(b.querySelector('.ico')).color}));
 assert.notEqual(mobileColors.bg,mobileColors.text,'Cotizar activo sin contraste móvil');
 assert.notEqual(mobileColors.bg,mobileColors.icon,'Icono activo sin contraste móvil');
 await page.screenshot({path:'tmp/stripe/menu-integrado-movil.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#tabs [data-tab="set"]').focus();await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'nvNavCerrar');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#tabs').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'menuBtn');
 await page.locator('#menuBtn').click();
 await page.locator('#tabs [data-tab="calc"]').click();
 assert.equal(await page.locator('#tabs').isVisible(),false);
 assert.ok(await page.locator('#tab-calc').isVisible());
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 await page.locator('#menuBtn').click();
 await page.locator('#nvNavFondo').click({position:{x:360,y:100}});assert.equal(await page.locator('#tabs').isVisible(),false);
 await page.setViewportSize({width:1280,height:1300});await page.waitForTimeout(250);
 await app("TEMA.preset='papel';aplicaTema();vaATab('pro')");
 const cotStyle=await page.locator('#tabs [data-tab="cot"]').evaluate(b=>({bg:getComputedStyle(b).backgroundColor,ink:getComputedStyle(b.querySelector('b')).color}));
 assert.notEqual(cotStyle.bg,cotStyle.ink,'Cotizar sin contraste');
 assert.notEqual(cotStyle.bg,'rgb(255, 255, 255)','Cotizar perdió el color principal');
 await page.locator('#tabs').screenshot({path:'tmp/stripe/menu-integrado-completo.png'});
 await app("TEMA.preset='tecno';aplicaTema()");
 await page.screenshot({path:'tmp/stripe/menu-integrado-oscuro.png'});
 assert.equal(await page.locator('#tabs [data-nav-grupo][aria-expanded="true"]').count(),4);
 assert.deepEqual(errors,[]);
 console.log('Menú integrado: 18 botones únicos, selección, grupos, sin buscador/autocompletado, roles/planes, vencida, badges, Ajustes, móvil, foco, Escape, fondo y oscuro: OK.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
