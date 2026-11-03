import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const sandbox={window:{},Intl,Date,URL};
vm.runInNewContext(fs.readFileSync('public/tablero.js','utf8'),sandbox);
const datos=sandbox.window.NuvoorTablero.datos;
const ventas=[{fecha:'2026-09-01',total:900,recibido:700,abonos:[{fecha:'2026-09-01',monto:200},{fecha:'2026-11-02',monto:500}]},{fecha:'2026-11-02',total:350,recibido:350},{fecha:'2026-11-02',total:300,recibido:300,abonos:[{fecha:'2026-11-02',monto:100}]}];
const pedidos=[{folio:'uno',op:{estatus:'Pendiente'},entrega:'2026-11-02'},{folio:'dos',op:{estatus:'En diseño'},entrega:'2026-11-01'},{folio:'tres',op:{estatus:'En impresión'},entrega:'2026-11-03'},{folio:'cuatro',op:{estatus:'Lista para entregar'},entrega:'2026-11-03'},{folio:'cinco',op:{estatus:'Detenida'},entrega:''},{folio:'seis',op:{estatus:'Entregada'},entrega:'2026-11-01',entregaReal:{fecha:'2026-11-01'}},{folio:'siete',op:{estatus:'Entregada'},entrega:'2026-11-01',entregaReal:{fecha:'2026-11-02'}},{folio:'ocho',op:{estatus:'Entregada'},entrega:'2026-11-01'}];
const d=datos({hoy:'2026-11-02',finanzas:true,ventas,pedidos});
assert.equal(d.cobrado,1150);assert.equal(d.total,1150);assert.equal(d.saldo,200);assert.equal(d.numeroCobros,4);
assert.equal(d.estados.reduce((s,x)=>s+x.cantidad,0),5);assert.equal(d.recientes,2);assert.equal(d.puntuales,1);
assert.equal(d.terminados,1);assert.equal(d.hoyEntregas,1);assert.equal(d.actual.length,7);
const restringido=datos({hoy:'2026-11-02',finanzas:false,ventas,pedidos},30);
assert.equal(restringido.saldo,0);assert.equal(restringido.cobrado,0);assert.equal(restringido.total,2);assert.equal(restringido.serie.length,30);
assert.equal(datos({hoy:'2026-11-02',pedidos:[]}).total,0);
await import('./suspension/prepare.mjs');
let html=fs.readFileSync('tmp/stripe/preview/index.html','utf8');
html=html.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__consultaCotNuvoor = folio');
fs.writeFileSync('tmp/stripe/preview/index.html',html);
// Analizar todos los scripts propios (el archivo contiene </body> dentro de cadenas).
for(const [i,m] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())if(m[1].trim())new vm.Script(m[1],{filename:'index-script-'+i});
const module=process.env.PLAYWRIGHT_MODULE||'../tmp/categorias/playwright/package/index.mjs';
const {chromium}=await import(path.isAbsolute(module)?pathToFileURL(module):module);
const dir=path.resolve('tmp/stripe/preview');
const server=http.createServer((req,res)=>{
 const file=path.resolve(dir,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}
 if(file.endsWith('favicon.ico')){res.writeHead(204).end();return;}
 fs.readFile(file,(err,body)=>{if(err){res.writeHead(404).end();return;}
 const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png'}[ext]||'text/plain')}).end(body);});
});
await new Promise(r=>server.listen(4180,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript(()=>{
   localStorage.setItem('cotizador_tour','1');
   const OriginalDate=Date,inicio=OriginalDate.now(),base=new OriginalDate('2026-11-02T23:30:00-06:00').getTime();
   window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[base+OriginalDate.now()-inicio]));}static now(){return base+OriginalDate.now()-inicio;}};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const app=code=>page.evaluate(code=>window.__qaCategorias.eval(code),code);
 async function licencia(plan='pro',rol='admin',estado='activa'){
   await page.evaluate(({plan,rol,estado})=>{Object.assign(CUENTA,{plan,estado,vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol});pintaCuenta();aplicaPlan();},{plan,rol,estado});
   await app('aplicaRol();limpiaGrupos();renderTablero()');
 }
 await page.goto('http://127.0.0.1:4180/index.html?producto=taller');
 await page.waitForFunction(()=>typeof window.__qaCategorias==='object'&&typeof CUENTA!=='undefined'&&!!CUENTA);
 await licencia();
 await app(`guardadas=${JSON.stringify(pedidos)};ventas=${JSON.stringify(ventas)};TEMA.preset='papel';aplicaTema();renderTablero();vaATab('inicio')`);
 // Fecha fija en la función de datos de esta prueba, sin alterar producción.
 await page.evaluate(()=>{
   const real=NuvoorTablero.datos;
   window.__stats=real({hoy:'2026-11-02',finanzas:true,ventas:[],pedidos:[]});
 });
 await page.waitForTimeout(750);
 assert.equal(await page.locator('#nvMetricas .nvMetric').count(),4);
 assert.equal(await page.locator('.nvBarGroup').count(),7);
 assert.match(await page.locator('#nvMetricas').innerText(),/1,150/);
 await page.locator('[data-nvrange="30"]').click();assert.equal(await page.locator('.nvBarGroup').count(),30);
 await page.locator('[data-nvday="29"]').focus();assert.match(await page.locator('#nvPlotHint').innerText(),/1,150/);
 await page.keyboard.press('Enter');await page.locator('[data-nvrange="7"]').click();
 await page.locator('#nvTema').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await page.locator('#nvTema').innerText(),'');assert.equal(await page.locator('#nvTema svg').count(),2);
 assert.equal(await page.locator('#nvTema').getAttribute('aria-checked'),'true');
 await app('TEMA=leeTema();aplicaTema()');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await app('TEMA.preset="papel";aplicaTema()');assert.equal(await page.locator('#nvTema').getAttribute('aria-checked'),'false');
 const marca=[];await page.exposeFunction('__qaMarca',(id,tipo)=>marca.push({id,tipo}));
 await page.evaluate(()=>{window.__anuncioMarca=(id,tipo)=>window.__qaMarca(id,tipo);window.__anuncios=async()=>[
  {id:'qa-dia',titulo:'Anuncio de muestra',imagen:'marca/n-512.png',enlace:'https://example.test/catalogo',lugar:'ambos'},
  {id:'qa-otro',titulo:'Segunda muestra',imagen:'marca/n-512.png',enlace:'javascript:alert(1)',lugar:'ambos'},
  {id:'qa-interna',titulo:'No debe desplazar un anuncio contratado',imagen:'marca/n-512.png',interna:true,lugar:'ambos'},
  {id:'qa-estado',titulo:'No debe aparecer',imagen:'marca/n-512.png',lugar:'ambos',estados:['Nunca']}
 ];});
 await app('cargaAnuncios()');await page.waitForTimeout(200);
 assert.ok(await page.locator('#anuncios').isVisible());assert.equal(await page.locator('#anunPista .nvAdPiece').count(),1);
 assert.equal(await page.locator('#anunPuntos').innerText(),'1 de 2');
 assert.equal(marca.filter(x=>x.id==='qa-dia'&&x.tipo==='vista').length,1);
 await app('anunCuenta();anunCuenta()');await page.waitForTimeout(100);
 assert.equal(marca.filter(x=>x.id==='qa-dia'&&x.tipo==='vista').length,1);
 await page.locator('#anunSig').click();assert.equal(await page.locator('#anunPuntos').innerText(),'2 de 2');assert.equal(await page.locator('#anunPista a').count(),0);
 await app('anunArranca()');await page.waitForTimeout(200);assert.equal(await page.locator('#anunPuntos').innerText(),'2 de 2');
 await page.locator('#anunAnt').click();await page.screenshot({path:'tmp/stripe/tablero-integrado-dia.png',fullPage:true});
 await page.locator('#nvTema').click();await page.screenshot({path:'tmp/stripe/tablero-integrado-noche.png',fullPage:true});
 await licencia('pro','produccion');
 assert.equal(await page.locator('#nvAcciones button').count(),0);
 assert.doesNotMatch(await page.locator('#nvDashboard').innerText(),/\$|Cobrado|Por cobrar|Facturas pendientes|Nómina sin pagar/);
 assert.match(await page.locator('#nvCobros').innerText(),/Trabajos entregados/);
 await licencia('basico','admin');assert.doesNotMatch(await page.locator('#nvDashboard').innerText(),/\$|Cobrado|Por cobrar|caja sigue cerrada/);
 await licencia('pro','admin','vencida');
 assert.equal(await page.locator('#nvAcciones [data-tbtab="cot"]').getAttribute('aria-disabled'),'true');
 await page.locator('#nvAcciones [data-tbtab="cot"]').click({force:true});assert.ok(await page.locator('#tab-inicio').isVisible());
 await page.locator('[data-nvrange="30"]').click();assert.equal(await page.locator('.nvBarGroup').count(),30);
 await licencia();
 await app('ponVistaInicio("apps")');assert.ok(await page.locator('#lanzador').isVisible());assert.equal(await page.locator('#nvDashboard').isVisible(),false);
 await app('ponVistaInicio("tablero");guardadas=[];ventas=[];renderTablero()');await page.waitForTimeout(700);
 assert.doesNotMatch(await page.locator('#nvDashboard').innerText(),/NaN|Infinity|undefined/);
 await app('TEMA.preset="papel";aplicaTema();equipo=[{id:"qa-persona",nombre:"Equipo de muestra",rol:"admin",pin:"1234",activo:true}];usuarioId="qa-persona";pideAcceso({bloqueo:true})');
 await page.setViewportSize({width:1365,height:632});await page.waitForTimeout(250);
 assert.ok(await page.locator('#anunBloq').isVisible(),'Anuncio visible en pantallas menores a 700px');
 const nuevoBloqueo=html.includes('id="nvLockHora"');
 if(nuevoBloqueo){
  assert.match(await page.locator('#nvLockHora').innerText(),/\d{2}:\d{2}:\d{2}/);
  const hora=await page.locator('#nvLockHora').innerText();await page.waitForTimeout(1100);assert.notEqual(await page.locator('#nvLockHora').innerText(),hora);
 }
 assert.equal(await page.locator('#anunBloqPieza a').getAttribute('href'),'https://example.test/catalogo');
 assert.equal(await page.locator('#accesoPass').getAttribute('type'),'password');
 if(nuevoBloqueo)await page.screenshot({path:'tmp/stripe/bloqueo-nuvoor-dia.png',fullPage:true});
 await app('TEMA.preset="tecno";aplicaTema()');if(nuevoBloqueo)await page.screenshot({path:'tmp/stripe/bloqueo-nuvoor-noche.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
 assert.ok(await page.locator('#accesoEntrar').isVisible());assert.ok(await page.locator('#anunBloq').isVisible());
 const overflow=await page.locator('#acceso').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false);
 if(nuevoBloqueo)await page.screenshot({path:'tmp/stripe/bloqueo-nuvoor-movil.png',fullPage:true});
 await app('cierraAcceso();vaATab("inicio");TEMA.preset="papel";aplicaTema();renderTablero()');
 await page.screenshot({path:'tmp/stripe/tablero-integrado-movil.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.emulateMedia({reducedMotion:'reduce'});await app('renderTablero()');
 assert.equal(await page.locator('.nvMetric').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.evaluate(()=>window.__anuncios=async()=>[]);await app('cargaAnuncios()');assert.equal(await page.locator('#anuncios').isVisible(),false);
 assert.equal(await page.locator('#nvMain').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 assert.deepEqual(errors,[]);console.log('Tablero: abonos, fechas, permisos, planes, gráficas, tema, anuncios, bloqueo y móvil OK.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
