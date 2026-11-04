import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {abre} from './navegador.mjs';
await import('./suspension/prepare.mjs');
for(const file of ['index.html','taller.html']){
 let html=fs.readFileSync('public/'+file,'utf8');
 html=html.replace(/<link\b[^>]*(?:googleapis|gstatic)\.com[^>]*>/g,'');
 html=html.replace(/<script src="(?:\.\/)?config\.js(?:\?[^\"]*)?"><\/script>/g,'<script src="./fake-supabase.js"></script>');
 html=html.replace(/<script\b[^>]*src="https?:\/\/[^\"]+"[^>]*><\/script>/g,'');
 html=html.replace(/<script src="diagnostico\.js\?v=[^"]+"><\/script>/g,'');
 html=html.replace('window.__consultaCotNuvoor = folio',fs.readFileSync('tests/categorias-fixture.js','utf8')+'\nwindow.__consultaCotNuvoor = folio');
 for(const [i,m] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())if(m[1].trim())new vm.Script(m[1],{filename:file+'-'+i});
 fs.writeFileSync('tmp/stripe/preview/'+file,html);
}
const qa=await abre('tmp/stripe/preview',4192),page=qa.page;
const app=code=>page.evaluate(code=>window.__qaCategorias.eval(code),code);
async function inicia(file){
 await page.goto(qa.url+'/'+file+'?producto=taller');
 await page.waitForFunction(()=>window.__qaCategorias&&typeof CUENTA!=='undefined'&&!!CUENTA);
 await page.evaluate(()=>{Object.assign(CUENTA,{plan:'pro',estado:'activa',vence:new Date(Date.now()+86400000).toISOString()});Object.assign(PERFIL,{rol:'admin'});pintaCuenta();aplicaPlan();});
 await app('equipo=[{id:"qa-admin",nombre:"Administrador de muestra",rol:"admin",pin:"1234",activo:true},{id:"qa-ventas",nombre:"Ventas de muestra",rol:"ventas",pin:"5678",activo:true}];usuarioId="qa-admin";asistencias=[];P.empresa.nombre="Taller de muestra";aplicaRol()');
 await page.evaluate(()=>{window.__anuncios=async()=>[{id:'qa-anuncio',titulo:'Publicidad del Lab de muestra',imagen:'marca/n-192.png',enlace:'https://example.test/propuesta',lugar:'bloqueo'}];});
 await app('cargaAnuncios();pideAcceso({bloqueo:true})');
 await page.locator('#acceso').waitFor({state:'visible'});
}
try{
 for(const file of ['index.html','taller.html']){
  await inicia(file);
  assert.equal(await page.locator('.nvLockBrand').getAttribute('href'),'https://nuvoor.mx');
  assert.equal(await page.locator('#anunBloqPieza a').getAttribute('href'),'https://example.test/propuesta');
  assert.equal(await page.locator('#accesoPass').getAttribute('type'),'password');
  for(const theme of ['papel','tecno']){
   await app('TEMA.preset="'+theme+'";aplicaTema()');
   for(const [width,height] of [[1365,900],[1024,768],[820,1180],[768,1024],[390,844],[320,568],[390,420]]){
    await page.setViewportSize({width,height});
    await page.locator('#acceso').evaluate(el=>el.scrollTop=0);
    const m=await page.locator('#acceso').evaluate(root=>{
     const r=s=>root.querySelector(s).getBoundingClientRect(),ad=r('.nvLockAside'),card=r('.accesoCard'),mark=r('.nvLockBrand>img'),word=r('.nvLockWord'),clock=r('.nvLockClock'),img=r('#anunBloqPieza img');
     return {overflow:root.scrollWidth>root.clientWidth+1,ad,card,logoCenter:(mark.left+word.right)/2,clockCenter:clock.x+clock.width/2,markHeight:mark.height,clockHeight:clock.height,imageRatio:img.width/img.height,fit:getComputedStyle(root.querySelector('#anunBloqPieza img')).objectFit};
    });
    assert.equal(m.overflow,false,file+': sin desborde '+width+' '+theme);
    assert.equal(m.fit,'contain');
    if(width>760){
     assert.ok(Math.abs(m.ad.top-m.card.top)<1,'Paneles alineados');
     assert.ok(Math.abs(m.logoCenter-(m.ad.x+m.ad.width/2))<1,'Logo centrado sobre publicidad');
     assert.ok(Math.abs(m.clockCenter-(m.card.x+m.card.width/2))<1,'Reloj centrado sobre checador');
     assert.ok(Math.abs(m.markHeight-m.clockHeight)<1,'Logo y reloj de igual alto');
     assert.ok(Math.abs(m.imageRatio-4/3)<.01,'Imagen 4:3');
     assert.equal(await page.locator('.nvLockSeconds').isVisible(),true);
    }else{
     assert.ok(m.ad.top>=m.card.bottom,'Acceso antes de publicidad en celular');
     assert.ok(Math.abs(m.imageRatio-3)<.01,'Imagen 3:1 en celular');
     assert.equal(await page.locator('.nvLockSeconds').isVisible(),false);
    }
    await page.locator('#accesoEntrar').scrollIntoViewIfNeeded();
    await page.locator('#accesoPass').fill('incorrecta');
    await page.locator('#accesoEntrar').click();
    assert.ok(await page.locator('#acceso').isVisible());
    assert.match(await page.locator('#accesoError').innerText(),/incorrecta/);
    assert.equal(await page.locator('#accesoPass').inputValue(),'');
   }
  }
  await page.setViewportSize({width:1365,height:900});
  await app('TEMA.preset="papel";aplicaTema();pideAcceso({bloqueo:true})');
  await page.locator('#acceso').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'tmp/stripe/bloqueo-publicar-'+file+'-pc.png'});
  const segundos=await page.locator('.nvLockSeconds').innerText();
  await page.waitForTimeout(1150);
  assert.notEqual(await page.locator('.nvLockSeconds').innerText(),segundos);
  await page.locator('#accesoPass').fill('1234');
  await page.locator('#accesoPass').press('Enter');
  await page.locator('#acceso').waitFor({state:'hidden'});
  assert.equal(await app('usuarioId'),'qa-admin');
  // El selector y los roles siguen usando los manejadores reales de Imprenta.
  await app('pideAcceso()');
  await page.locator('[data-perfil="qa-ventas"]').click();
  await page.locator('#accesoPass').fill('5678');
  await page.locator('#accesoEntrar').click();
  assert.equal(await app('usuarioId'),'qa-ventas');
  assert.equal(await page.locator('#acceso').isVisible(),false);
  await app('usuarioId="qa-admin";aplicaRol();pideAcceso({bloqueo:true})');
  // Se abre el checador real, sin dar acceso a cámara ni registrar datos reales.
  await page.locator('#accesoCheca').click();
  await page.locator('#modalCheca').waitFor({state:'visible'});
  assert.match(await page.locator('#chTitulo').innerText(),/Entrada/);
  assert.equal(await app('asistencias.length'),0);
  assert.equal(await page.locator('#chOk').isDisabled(),true,'Sin foto/clave no registra');
  await app('cierraCheca()');
  assert.ok(await page.locator('#acceso').isVisible());
  await app('asistencias=[{id:"qa-entrada",uid:"qa-admin",nombre:"Administrador de muestra",fecha:hoyISO(),hora:"09:00",tipo:"entrada",ts:Date.now()-3600000}];pintaAccesoReloj()');
  assert.match(await page.locator('#accesoCheca').innerText(),/Terminar jornada/);
  assert.match(await page.locator('#accesoRelojEstado').innerText(),/Entraste/);
  // La falta de anuncios no deja una tarjeta de publicidad vacía.
  await page.evaluate(()=>window.__anuncios=async()=>[]);await app('cargaAnuncios()');
  assert.equal(await page.locator('#anunBloq').isVisible(),false);
  assert.ok(await page.locator('#accesoEntrar').isVisible());
  await page.evaluate(()=>window.__anuncios=async()=>[{id:'qa-anuncio',titulo:'Publicidad del Lab',imagen:'marca/n-192.png',lugar:'bloqueo'}]);await app('cargaAnuncios()');
  await page.setViewportSize({width:390,height:844});
  await app('TEMA.preset="tecno";aplicaTema()');
  await page.locator('#acceso').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'tmp/stripe/bloqueo-publicar-'+file+'-movil.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.accesoCard').evaluate(el=>getComputedStyle(el).animationName),'none');
  await app('cierraAcceso()');
  const parado=await page.locator('.nvLockSeconds').textContent();
  await page.waitForTimeout(1100);assert.equal(await page.locator('.nvLockSeconds').textContent(),parado,'Reloj se detiene al cerrar');
 }
 assert.deepEqual(qa.errors,[]);
 console.log('Bloqueo: dos páginas, logo/reloj centrados e igual alto, anuncios enteros 4:3/3:1, 320–1365 px, día/noche, teclado, PIN, roles, checador y temporizador OK. Sin conexión con cuentas reales.');
}finally{await qa.close();}
