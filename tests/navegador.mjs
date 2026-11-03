import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../tmp/categorias/playwright/package/index.mjs');
export async function abre(dir,port=4185){
 dir=path.resolve(dir);
 const server=http.createServer((req,res)=>{const file=path.resolve(dir,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(file.endsWith('favicon.ico')?204:404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript; charset=utf-8','.png':'image/png'}[path.extname(file)]||'application/octet-stream')}).end(b);});});
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.addInitScript(()=>localStorage.setItem('cotizador_tour','1'));
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 return {page,errors,url:'http://127.0.0.1:'+port,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
