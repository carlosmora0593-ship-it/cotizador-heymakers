import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
// PLAYWRIGHT_MODULE puede apuntar al paquete instalado en otra carpeta.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '../tmp/categorias/playwright/package/index.mjs');
const dir=path.resolve('tmp/stripe/preview');fs.mkdirSync(dir,{recursive:true});
let html=fs.readFileSync('public/index.html','utf8');
html=html.replace(/<script\b[^>]*src="(?:https?:\/\/|config\.js|cuenta\.js|diagnostico\.js|suspension\.js)[^"]*"[^>]*><\/script>/g,'');
html=html.replace(/<link\b[^>]*(?:googleapis|gstatic)\.com[^>]*>/g,'');
html=html.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__consultaCotNuvoor = folio');
const at=html.lastIndexOf('</body>');
html=html.slice(0,at)+'<script>window.__qaCategorias.seed();window.__arranca().then(()=>{document.body.classList.remove("sin-sesion");window.__qaCategorias.seed();});</script>'+html.slice(at);
fs.writeFileSync(path.join(dir,'categorias-sin-red.html'),html);
const server=http.createServer((req,res)=>{
 const file=path.resolve(dir,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.png')?'image/png':'text/plain'}).end(body);});
});
await new Promise(r=>server.listen(4180,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:950}});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await context.addInitScript(()=>localStorage.setItem('cotizador_tour','1'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4180/categorias-sin-red.html');
 await page.locator('#azArt [data-cafamilia="playeras"]').waitFor();
 await page.locator('#azArt [data-cafamilia="playeras"]').click();
 await page.locator('[data-camodelo="playera-b"]').click();
 await page.locator('[data-catecnica]').filter({hasText:'Sublimación'}).click();
 assert.match(await page.locator('#svVTotal').textContent(),/\$/);
 await page.locator('#svVAgregar').click();
 assert.equal(await page.locator('#svVelo').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.__qaCategorias.get().articuloId),'playera-b');
 await page.locator('#azArt .caElegido button').click();
 await page.locator('[data-camodelo="playera-a"]').click();
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.__qaCategorias.get().articuloId),'playera-b');
 await page.setViewportSize({width:390,height:900});
 await page.locator('#azArt [data-cafamilia="tazas"]').click();
 await page.locator('[data-camodelo="taza-b"]').click();
 await page.screenshot({path:'tmp/stripe/categorias-playwright-movil.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#svVAgregar').click();
 assert.equal(await page.evaluate(()=>window.__qaCategorias.get().articuloId),'taza-b');
 assert.deepEqual(errors,[]);
 console.log('Playwright sin red: app original, modelos/técnica, confirmar, cancelar y móvil OK.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
