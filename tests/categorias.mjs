import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

process.chdir(fileURLToPath(new URL('../',import.meta.url)));
await import('./suspension/prepare.mjs');
let preview=fs.readFileSync('tmp/stripe/preview/index.html','utf8');preview=preview.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__consultaCotNuvoor = folio');fs.writeFileSync('tmp/stripe/preview/index.html',preview);
const root = process.cwd();
const site = path.join(root, 'tmp/stripe/preview');
const out = path.join(root, 'tmp/stripe');
const chromeExe = process.env.CHROME_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const serverPort = 4178, debugPort = 9229;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json'};

const server = http.createServer((req,res)=>{
  if(new URL(req.url, 'http://localhost').pathname.endsWith('/favicon.ico')){res.writeHead(204).end();return;}
  let file;
  try { file = path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (!file.startsWith(site + path.sep) && file !== site) { res.writeHead(403).end(); return; }
  if (file === site) file = path.join(site,'index.html');
  fs.readFile(file,(err,body)=>{
    if(err){res.writeHead(404).end('not found');return;}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(body);
  });
});
await new Promise(resolve=>server.listen(serverPort,'127.0.0.1',resolve));

const profile = path.join(out,'chrome-profile');
fs.mkdirSync(profile,{recursive:true});
const chrome = spawn(chromeExe,[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--disable-extensions','--disable-sync','--no-proxy-server',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
  `--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'about:blank'
],{stdio:'ignore',windowsHide:true});

let ws;
try {
  let version;
  for(let i=0;i<80;i++){
    try { version=await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json(); break; }
    catch { await delay(250); }
  }
  if(!version) throw new Error('Chrome headless no inició su puerto CDP.');
  const target=await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let seq=0;const waiters=new Map();const consoleErrors=[];let activeUrl='';
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.id&&waiters.has(m.id)){const w=waiters.get(m.id);waiters.delete(m.id);m.error?w.reject(new Error(m.error.message)):w.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown') consoleErrors.push(`${activeUrl} | exception: ${m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text||'error'}`);
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error') consoleErrors.push(`${activeUrl} | console: ${m.params.entry.text}`);
    if(m.method==='Network.responseReceived'&&m.params.response.status>=400) consoleErrors.push(`${activeUrl} | HTTP ${m.params.response.status}: ${m.params.response.url}`);
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;waiters.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evalJs=async expression=>{
    const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'Error JS');
    return r.result?.value;
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable'); await call('Network.enable');
  async function configure(width,height,theme){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
  }
  async function navigate(url,selector,timeout=7000){
    activeUrl=url;
    await call('Page.navigate',{url});
    const end=Date.now()+timeout;
    while(Date.now()<end){
      await delay(200);
      try { if(await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e && !e.hidden})()`)) return; } catch {}
    }
    throw new Error(`No cargó el selector ${selector}: ${url}`);
  }
  async function screenshot(name){
    await delay(180);
    const r=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'));
  }
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('cotizador_tour','1');window.__descargasPrueba=0;"});
  await configure(1280,950,'light');
  await navigate('http://127.0.0.1:4178/index.html?producto=taller','#cuentaPlan',15000);
  for(let i=0;i<60;i++){
    if(await evalJs("typeof window.__qaCategorias==='object' && typeof CUENTA!=='undefined' && !!CUENTA"))break;
    await delay(250);
  }
  const check=async(expr,note)=>{if(!await evalJs(expr))throw new Error(note);};
  const app=code=>evalJs('window.__qaCategorias.eval('+JSON.stringify(code)+')');
  await evalJs("Object.assign(CUENTA,{plan:'pro',estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});pintaCuenta();aplicaPlan();window.__qaCategorias.seed()");
  await delay(500);
  await check("document.querySelectorAll('#azArt [data-cafamilia=\"tazas\"]').length===1",'Tazas duplicadas');
  await check("!!document.querySelector('#azArt [data-cafamilia=\"mi familia\"]')",'Perdió categoría personalizada');
  await app('window.__antesCategoria=JSON.stringify(cot)');
  await screenshot('categorias-integradas-tarjetas.png');
  await evalJs("document.querySelector('[data-cafamilia=\"playeras\"]').click()");
  await check("!document.querySelector('#svVelo').hidden && document.querySelectorAll('[data-camodelo]').length===2",'No abre modelos');
  await evalJs("document.querySelector('[data-camodelo=\"playera-b\"]').click()");
  await app("cv2CambiaTecnica(cat.tecnicas.find(t=>/sublim/i.test(t.nombre)).id)");
  await check("window.__qaCategorias.eval('window.__antesCategoria===JSON.stringify(cot)')",'El borrador modificó cotización');
  await screenshot('categorias-integradas-playeras.png');
  await evalJs("document.querySelector('#svVCerrar').click()");
  await check("window.__qaCategorias.eval('window.__antesCategoria===JSON.stringify(cot)')",'Cancelar modificó cotización');
  await evalJs("document.querySelector('[data-cafamilia=\"playeras\"]').click();document.querySelector('[data-camodelo=\"playera-b\"]').click()");
  await app("cv2CambiaTecnica(cat.tecnicas.find(t=>/sublim/i.test(t.nombre)).id)");
  const displayed=await evalJs("document.querySelector('#svVTotal').textContent");
  await app('window.__esperadoCategoria=caConCopia(()=>cv2Previa(SVV.app).r.total)');
  await evalJs("document.querySelector('#svVAgregar').click()");
  await check("document.querySelector('#svVelo').hidden && window.__qaCategorias.get().articuloId==='playera-b'",'No confirmó artículo');
  await check("window.__qaCategorias.get().apps.length===1 && window.__qaCategorias.get().costoArt===77",'No confirmó costo y ubicación');
  await check("window.__qaCategorias.eval('Math.abs(calc().total-window.__esperadoCategoria)<0.001')",'El precio confirmado difiere de la vista previa');
  await app("window.__precioPersistido=calcDe(cot).total;window.__cotGuardada=JSON.stringify(cot);cot=JSON.parse(window.__cotGuardada);renderCot()");
  await check("window.__qaCategorias.eval('Math.abs(calcDe(cot).total-window.__precioPersistido)<0.001')",'Precio cambió al restaurar');
  // Otra ubicación, otro concepto y una descripción propia deben conservarse.
  await app("cot.apps.push({...cot.apps[0],id:'segunda',ubic:'Espalda',ancho:15,alto:15});cot.desc='Descripción del cliente';cot.descAuto=false;guardaItemActivo(cot);cot.items.push({...itemEnBlanco(),desc:'Otro concepto',cantidad:3});window.__segunda=JSON.stringify(cot.apps[1]);window.__otro=JSON.stringify(cot.items[1]);renderCot();azArticulos()");
  await evalJs("document.querySelector('[data-cafamilia=\"tazas\"]').click();document.querySelector('[data-camodelo=\"taza-b\"]').click();document.querySelector('#svVAgregar').click()");
  await check("window.__qaCategorias.eval('JSON.stringify(cot.apps[1])===window.__segunda && JSON.stringify(cot.items[1])===window.__otro && cot.desc===\"Descripción del cliente\"')",'Cambio de modelo perdió datos existentes');
  // Ejercitar cada motor de técnica sobre el borrador, sin cambiar la cotización.
  await evalJs("document.querySelector('[data-cafamilia=\"tazas\"]').click()");
  await app("for(const t of cat.tecnicas){cv2CambiaTecnica(t.id);if(!Number.isFinite(caConCopia(()=>cv2Previa(SVV.app).r.total)))throw Error('Precio inválido '+t.nombre)}");
  await app('svCierra()');
  // Error de medida: no debe confirmar.
  await evalJs("document.querySelector('[data-cafamilia=\"playeras\"]').click()");
  await app("cv2CambiaTecnica(cat.tecnicas.find(t=>t.modo==='area').id);SVV.app.ancho=0;cv2PintaFormApp()");
  await check("document.querySelector('#svVAgregar').disabled",'Permitió área de cero');
  await app('svCierra()');
  // Catálogo vacío y sin técnicas se resuelven sin romper la ventana.
  await app('window.__tecnicas=cat.tecnicas;cat.tecnicas=[]');
  await evalJs("document.querySelector('[data-cafamilia=\"gorras\"]').click()");
  await check("document.querySelector('#svVForm').textContent.includes('Todavía no tienes técnicas')",'No contempla técnicas vacías');
  await evalJs("document.querySelector('#svVCerrar').click()");
  await app('cat.tecnicas=window.__tecnicas;window.__articulos=cat.articulos;cat.articulos=[];azArticulos()');
  await check("!!document.querySelector('#azArt [data-artpick=\"\"]')",'Perdió captura manual');
  await app('cat.articulos=window.__articulos;azArticulos()');
  await configure(390,900,'light');
  await evalJs("document.querySelector('[data-cafamilia=\"playeras\"]').click()");
  await screenshot('categorias-integradas-movil.png');
  await check("document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('#svVelo .svVentana').scrollWidth<=innerWidth+1",'Desborde móvil');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await check("document.querySelector('#svVelo').hidden",'Escape no cerró');
  await configure(1280,950,'dark');
  await evalJs("window.__qaSuspension.theme('tecno');document.querySelector('[data-cafamilia=\"playeras\"]').click()");
  await screenshot('categorias-integradas-oscuro.png');
  await evalJs("document.querySelector('#svVAgregar').focus()");
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
  await check("document.activeElement.id==='svVCerrar'",'El foco escapó del diálogo');
  // Si el plan vence con la ventana abierta, el handler tampoco aplica.
  await app('window.__antesVencer=JSON.stringify(cot)');
  await evalJs("Object.assign(CUENTA,{estado:'vencida'});pintaCuenta();aplicaPlan()");
  await app('caGuarda()');
  await check("window.__qaCategorias.eval('window.__antesVencer===JSON.stringify(cot)')",'Cuenta vencida pudo aplicar');
  await app('svCierra()');
  await evalJs("document.querySelector('[data-cafamilia=\"playeras\"]').click()");
  await check("document.querySelector('#svVelo').hidden",'Vencida abrió selección');
  await evalJs("Object.assign(CUENTA,{estado:'activa'});pintaCuenta();aplicaPlan()");
  await app("svAbre('gran',null,'nuevo',null)");
  await check("!document.querySelector('#svVelo').hidden && !document.querySelector('#svVelo').classList.contains('caVentana') && !document.querySelector('[data-camodelo]')",'Alteró ventana original de servicios');
  await app('svCierra();cv2AbreApp(cot.apps[0].id)');
  await check("document.querySelector('#svVProds').textContent.includes('Técnica') && !document.querySelector('[data-catecnica]')",'Alteró editor original de ubicaciones');
  await app('svCierra();cot.costoArt=123;cot.precioArt=156;renderCot();azArticulos()');
  await app('caAbre(caClave(caFamilia(cat.articulos.find(a=>a.id===cot.articuloId))),null);caGuarda()');
  await check("window.__qaCategorias.get().costoArt===123 && window.__qaCategorias.get().precioArt===156",'Reemplazó precio propio del mismo modelo');
  if(consoleErrors.length)throw Error(consoleErrors.join('\n'));
  console.log('Categorías integradas: catálogo, cancelación, precio real, restauración, conceptos/ubicaciones, técnicas, vacíos, móvil, oscuro, teclado y vencida: OK; sin errores. Total inicial: '+displayed);
} finally {try{ws?.close()}catch{};try{chrome.kill()}catch{};await new Promise(r=>server.close(r));}
