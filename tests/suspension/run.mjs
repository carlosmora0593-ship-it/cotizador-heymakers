import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
await import('./prepare.mjs');
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
    if(await evalJs("typeof window.__qaSuspension==='object' && typeof CUENTA!=='undefined' && !!CUENTA && document.querySelector('#tbAccesos').children.length>0"))break;
    await delay(250);
  }
  const check=async(expr,note)=>{if(!await evalJs(expr))throw new Error(note);};
  await check("typeof window.__qaSuspension==='object'",'App no arrancó');
  await evalJs("window.__qaSuspension.theme('papel');window.__qaSuspension.seed();Object.assign(CUENTA,{plan:'pro',estado:'vencida',vence:new Date(Date.now()-86400000).toISOString()});pintaCuenta();aplicaPlan();window.__qaSuspension.home();");
  await delay(1500);
  await check("document.querySelector('[data-tbtab=\"cot\"]').getAttribute('aria-disabled')==='true'",'Cotizar sin suspensión');
  await check("document.querySelector('#tabs [data-tab=\"ven\"]').hidden===false",'Ocultó ventas que debe poder consultar');
  await check("document.querySelector('[data-reporte=\"cotizaciones\"]').getAttribute('aria-disabled')==='true'",'Excel de cotizaciones sin bloqueo');
  await evalJs("document.querySelector('[data-tbtab=\"cot\"]').click()");
  await check("!document.querySelector('#tab-inicio').hidden",'Pudo abrir cotizador nuevo');
  await screenshot('suspension-original-inicio-light-1280.png');
  await evalJs("document.querySelector('#tabs [data-tab=\"sav\"]').click();document.querySelector('[data-seclz]').getAttribute('data-seclz');");
  await evalJs("window.__qaSuspension.saved()");
  await delay(200);
  await screenshot('suspension-original-cotizaciones-light-1280.png');
  await check("document.querySelector('[data-load]')!==null",'Falta cotización guardada de prueba');
  await evalJs("document.querySelector('[data-load]').click()");
  await check("!document.querySelector('#docview').hidden",'Abrir no conserva el visor original');
  await check("document.querySelector('#tab-cot').hidden",'La consulta abrió el editor');
  await check("document.querySelector('#docPrint').getAttribute('aria-disabled')==='true'",'La descarga/impresión sigue activa');
  await screenshot('suspension-original-consulta-light-1280.png');
  await evalJs("document.querySelector('#docClose').click()");
  await check("document.querySelector('#docview').hidden",'Bloqueó Cerrar');
  await evalJs("window.__qaSuspension.core()");
  await check("window.__qaSuspension.sinCambios()",'Mutó la cotización desde llamada directa');
  await check("(async()=>await window.__qaSuspension.cloudBlocked())()",'Guardado o descargas en puente disponibles');
  await evalJs("document.querySelector('#tabs [data-tab=\"ven\"]').click();window.__qaSuspension.sales()");
  await delay(200);
  await screenshot('suspension-original-ventas-light-1280.png');
  await check("document.querySelector('[data-reporte=\"ventas\"]').getAttribute('aria-disabled')==='true'",'Reporte ventas se puede exportar');
  await check("!document.querySelector('#venFecha').disabled",'Bloqueó filtro del reporte');
  await evalJs("window.__qaPortal=0;abrirPortalStripe=async()=>{window.__qaPortal++};document.querySelector('#avisoPagoBtn').click()");
  await check("window.__qaPortal===1",'CTA no abre administración de tarjeta');
  await evalJs("Object.assign(CUENTA,{stripe_cliente:null});pintaCuenta();window.__qaPlanes=0;abrePlanes=()=>{window.__qaPlanes++};document.querySelector('#avisoPagoBtn').click()");
  await check("window.__qaPlanes===1 && document.querySelector('#avisoPagoBtn').textContent==='Renovar plan'",'Renovación OXXO/transferencia inaccesible');
  await evalJs("Object.assign(CUENTA,{plan:'basico'});aplicaPlan()");
  await check("document.querySelector('#tabs [data-tab=\"ven\"]').hidden",'Regaló acceso Pro al Básico');
  await evalJs("Object.assign(CUENTA,{plan:'prueba',estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});pintaCuenta();aplicaPlan();window.__qaSuspension.home()");
  await check("!document.querySelector('[data-tbtab=\"cot\"]').hasAttribute('data-nv-suspendido')",'Prueba vigente sigue bloqueada');
  await evalJs("Object.assign(CUENTA,{plan:'pro'});pintaCuenta();aplicaPlan();window.__qaSuspension.home()");
  await check("!document.querySelector('[data-reporte=\"ventas\"]').hasAttribute('data-nv-suspendido')",'Exportación no se reactivó');
  await screenshot('suspension-original-vigente-light-1280.png');
  await evalJs("Object.assign(CUENTA,{estado:'vencida',stripe_cliente:'cus_fake',vence:new Date(Date.now()-86400000).toISOString()});pintaCuenta();aplicaPlan();window.__qaSuspension.home()");
  await configure(390,1050,'light');await delay(200);
  await screenshot('suspension-original-inicio-light-390.png');
  await check("document.documentElement.scrollWidth<=innerWidth+1",'Desborde móvil');
  await evalJs("window.__qaSuspension.theme('tecno')");
  await configure(1280,950,'dark');await delay(200);await screenshot('suspension-original-inicio-dark-1280.png');
  if(consoleErrors.length)throw Error(consoleErrors.join('\n'));
  console.log('Suspensión: UI original, cotización sólo visor, exportaciones/puentes bloqueados, filtros, roles, tarjeta y renovación, prueba vigente y reactivación: OK; 0 errores.');
} finally {try{ws?.close()}catch{};try{chrome.kill()}catch{};await new Promise(r=>server.close(r));}
