(function(){
  'use strict';
  const avisoAndroid='La red se crea desde la tablet de la caja. Abre la app Nuvoor en una tablet con Android 8 o más nuevo.';
  const maxPedido=64*1024;
  let pos, puente, capacidad=null, central=false, unida=false, info=null, tablets=0, pedidos=0;
  let fallandoDesde=0, estadoAnterior='', enviando='', hastaReintento=0, sincronizando=false, ocupado=false, reintentaResumen=0;
  let aviso, dialogo, mensaje, lista, boton, configurar, estadoAjustes, estadoCapacidad, contador, identidadAnterior, ancla;
  const idsValidos=/^[\w-]{1,120}$/;
  const recibiendo=new Set();
  const q=id=>document.getElementById(id);
  const cuenta=()=>pos?.identidad()?.cuenta||'';
  const key=campo=>'nuvoor_red47:'+cuenta()+':'+campo+(campo==='envios'?':'+pos.identidad()?.persona:'');
  const lee=(campo,defecto)=>{
    if(!cuenta())return defecto;
    try{return JSON.parse(localStorage.getItem(key(campo)))??defecto;}catch(_){return defecto;}
  };
  function guarda(campo,valor){
    if(!cuenta())return false;
    try{localStorage.setItem(key(campo),JSON.stringify(valor));return true;}catch(_){return false;}
  }
  function llama(accion,datos={}){
    const identidad=pos?.identidad();
    if(!puente||!identidad?.cuenta)return false;
    puente.postMessage(JSON.stringify({accion,...identidad,...datos}));
    return true;
  }
  function hora(ms){return new Date(ms).toLocaleTimeString('es-MX',{hour:'numeric',minute:'2-digit'});}
  function sinInternet(){
    if(!navigator.onLine)return true;
    return !!fallandoDesde&&Date.now()-fallandoDesde>=60_000;
  }
  function compruebaEstado(){
    const estado=pos?.estadoNube()||'';
    if(estado==='error'){if(!fallandoDesde)fallandoDesde=Date.now();}
    else fallandoDesde=0;
    if(estadoAnterior!==estado){estadoAnterior=estado;pinta();}
  }
  function comunica(texto){
    if(dialogo?.open){mensaje.textContent=texto;mensaje.hidden=false;}
    pos?.avisa(texto);
  }
  function pinta(){
    if(!aviso)return;
    const centralElegida=lee('central',false);
    const habilitada=!!pos?.identidad()?.cuenta;
    const pendientes=lee('envios',[]).length;
    const mostrar=habilitada&&(central||unida||sinInternet()||pendientes>0);
    aviso.hidden=!mostrar;
    aviso.dataset.estado=central?(sinInternet()?'red':'conexion'):unida?'red':'sin-internet';
    q('red47Titulo').textContent=central?(sinInternet()?'Red del restaurante · '+tablets+' tablet'+(tablets===1?'':'s'):'Red del restaurante abierta · '+tablets+' tablet'+(tablets===1?'':'s')):
      unida?'Estás en la red del restaurante':sinInternet()?'Se fue el internet':'Pedidos pendientes para la caja';
    q('red47Texto').textContent=central?(sinInternet()?'La caja y las demás tablets pueden seguir trabajando.':'Hay internet. Cuando ya no la necesites, ciérrala para que la caja suba los pedidos.'):
      pendientes?pendientes+' pedido(s) en la cola de esta tablet.':unida?'Tus pedidos llegan a la caja.':
      centralElegida?'La caja sigue cobrando aquí. Crea la red para recibir los pedidos de las otras tablets.':'Únete a la red de la caja para seguir mandando pedidos a cocina.';
    boton.textContent=central?(sinInternet()?'Ver red y código':'Cerrar la red y subir'):unida?'Salir de la red':
      !capacidad?'Ver cómo abrir la red':centralElegida?'Crear red del restaurante':'Unirme a la red';
    boton.disabled=ocupado||!!puente&&capacidad===null;
    contador.textContent=central?'Red del restaurante · '+tablets:unida?'Red del restaurante · Caja':'';
    contador.hidden=!central&&!unida;
    if(ancla){
      ancla.hidden=!habilitada||!capacidad;
      ancla.classList.toggle('red47Activa',central||unida);
      q('red47AnclaTxt').textContent=central?'Red · '+tablets:unida?'Red · Caja':'Red';
      ancla.setAttribute('aria-label',central?'Red del restaurante abierta, '+tablets+' tablets':unida?'Conectada a la red de la caja':'Red sin internet');
    }
    configurar.hidden=!habilitada||!capacidad||!pos?.puedeMarcarCentral();
    configurar.disabled=central||unida;
    configurar.textContent=centralElegida?'Quitar función de tablet central':'Usar esta tablet como central';
    estadoCapacidad.hidden=!capacidad;
    estadoCapacidad.textContent=centralElegida?'Tablet central':'Compatible';
    estadoAjustes.textContent=capacidad?(centralElegida?'Esta tablet recibe los pedidos de las demás cuando se va el internet. También abres la red cuando quieras con el botón «Red» de arriba.':'Esta tablet puede crear una red para que las demás sigan enviando pedidos a cocina. El botón «Red» de arriba la abre o te une a ella cuando quieras.'):
      puente&&capacidad===null?'Revisando si esta tablet puede crear la red…':avisoAndroid;
    if(dialogo.open&&info&&central){
      q('red47Resumen').textContent=tablets+' tablet(s) · '+pedidos+' pedido(s) por la red';
      q('red47Vence').textContent='Código vigente hasta las '+hora(info.codigoVence)+' · Red abierta hasta las '+hora(info.vence);
    }
  }
  function abre(vista){
    dialogo.dataset.vista=vista;
    mensaje.hidden=true;
    q('red47Pin').value='';
    if(!dialogo.open)dialogo.showModal();
  }
  async function autoriza(e){
    e.preventDefault();
    if(ocupado)return;
    ocupado=true;
    const pin=q('red47Pin').value;
    q('red47Pin').value='';
    try{
      const gerente=await pos.autoriza(pin);
      if(!gerente){comunica('Escribe el PIN de un gerente activo.');return;}
      if(dialogo.dataset.vista==='cierre'){
        llama('cerrar',{persona:gerente});
        dialogo.close();
      }else if(dialogo.dataset.vista==='central'){
        if(!guarda('central',!lee('central',false)))throw Error('No se pudo guardar este ajuste.');
        dialogo.close();
      }else{
        if(!pos.cajaCentral())throw Error('Abre la caja en esta tablet antes de crear la red.');
        llama('crear',{persona:gerente});
        mensaje.hidden=false;
        mensaje.textContent='Android está preparando la red…';
      }
    }catch(e){comunica(e.message||'No se pudo autorizar esta acción.');}
    finally{ocupado=false;pinta();}
  }
  function manda(){
    if(!unida||enviando||Date.now()<hastaReintento)return;
    const [pedido]=lee('envios',[]);
    if(!pedido)return;
    if(llama('enviar',{pedido})){
      enviando=pedido.id;
      hastaReintento=Date.now()+8000;
    }
  }
  function enviar(pedido){
    if(!unida)return false;
    const cola=lee('envios',[]);
    if(!idsValidos.test(pedido.id)||cola.length>=100||
       new TextEncoder().encode(JSON.stringify(pedido)).length>maxPedido||
       !guarda('envios',[...cola,pedido])){
      comunica('No se pudo guardar este envío. El pedido sigue en la cuenta.');
      return null;
    }
    manda();
    pinta();
    return true;
  }
  async function subeResumen(){
    if(sincronizando||!navigator.onLine||central||unida||Date.now()<reintentaResumen)return;
    const [resumen]=lee('resumenes',[]);
    if(!resumen)return;
    sincronizando=true;
    try{
      if(await pos.registra(resumen)){
        if(guarda('resumenes',lee('resumenes',[]).filter(x=>x.id!==resumen.id)))llama('resumenGuardado',{id:resumen.id});
      }
    }catch(_){/* Se conserva para el siguiente intento. */}
    finally{sincronizando=false;reintentaResumen=Date.now()+60_000;}
  }
  function resumen(row){
    if(!row?.id)return;
    const anteriores=lee('resumenes',[]);
    if(!anteriores.some(x=>x.id===row.id))guarda('resumenes',[...anteriores,row]);
    subeResumen();
  }
  async function recibe(pedido){
    if(!idsValidos.test(pedido?.id||'')||recibiendo.has(pedido.id))return;
    recibiendo.add(pedido.id);
    try{
      const resultado=await pos.recibe(pedido);
      if(resultado?.guardado)llama('aplicado',{id:pedido.id});
      if(resultado?.nuevo){pedidos++;pinta();publica();}
    }catch(e){comunica(e.message||'Hay una comanda pendiente de revisar en la caja.');}
    finally{recibiendo.delete(pedido.id);}
  }
  function publica(){
    if(!central)return;
    const estado=pos.foto();
    if(estado)llama('publicaEstado',{estado});
  }
  function evento(e){
    if(!e||e.cuenta&&e.cuenta!==cuenta())return;
    switch(e.tipo){
      case 'capacidad': capacidad=e.central===true;break;
      case 'central': central=true;publica();break;
      case 'abierta':
        central=true;info=e;publica();
        if(dialogo.open){
          q('red47Codigo').textContent=e.codigo?.replace(/^(...)(...)$/,'$1 $2')||'';
          q('red47QR').src='data:image/png;base64,'+e.qr;
          abre('abierta');
        }
        break;
      case 'tablets': tablets=e.cantidad||0;lista.textContent=(e.tablets||[]).map(x=>x.nombre).join(' · ');break;
      case 'unida': unida=true;enviando='';hastaReintento=0;pos.unida?.();if(dialogo.open)dialogo.close();manda();break;
      case 'salida': unida=false;enviando='';pos.salida();break;
      case 'enviado':
        if(guarda('envios',lee('envios',[]).filter(x=>x.id!==e.id))){
          if(enviando===e.id){enviando='';hastaReintento=0;}
          pos.confirmado(e.id);manda();
        }
        break;
      case 'fallo': if(enviando===e.id)enviando='';break;
      case 'pedido': recibe(e.pedido);break;
      case 'estado': if(unida)pos.estado(e.estado);break;
      case 'cerrada':
        central=false;info=null;tablets=0;pedidos=0;
        q('red47QR').removeAttribute('src');
        if(dialogo.open)dialogo.close();
        resumen(e.resumen);pos.salida();comunica('Red cerrada. La caja conserva los pedidos por subir.');
        break;
      case 'resumen': resumen(e.resumen);break;
      case 'error': comunica(e.mensaje||'No se pudo abrir la red.');break;
      default: break;
    }
    pinta();
  }
  function montar(){
    aviso=document.createElement('section');
    aviso.className='card red47Aviso';
    aviso.hidden=true;
    aviso.innerHTML='<div><strong id="red47Titulo"></strong><p id="red47Texto"></p></div><button type="button" class="btn primary" id="red47Accion"></button>';
    const zona=document.querySelector('main,.wrap');
    if(zona)zona.prepend(aviso);
    else return;
    boton=q('red47Accion');
    contador=document.createElement('span');
    contador.className='red47Chip';
    contador.hidden=true;
    q('restaurantSync')?.after(contador);
    estadoCapacidad=q('red47Capacidad');
    estadoAjustes=q('red47EstadoAjustes');
    configurar=q('red47Config');
    if(!estadoAjustes||!configurar)return;
    dialogo=document.createElement('dialog');
    dialogo.className='red47Dialog';
    dialogo.innerHTML=`<div class="red47Encabezado"><strong>Red del restaurante</strong>
      <button type="button" class="btn sm ghost" id="red47Cerrar">Cerrar</button></div>
      <section data-red47="ayuda"><h3>La red se crea desde la tablet de la caja</h3>
      <p>Abre Nuvoor en una tablet Android 8 o más nueva. En Ajustes → Red sin internet, marca la tablet que usas para la caja.</p></section>
      <form id="red47Autoriza"><h3>Autoriza el gerente</h3>
      <label for="red47Pin">PIN del gerente</label><input id="red47Pin" required type="password" inputmode="numeric" autocomplete="off" maxlength="12">
      <button class="btn primary">Confirmar</button></form>
      <section data-red47="unirse"><h3>Escanea el QR de la caja</h3><p>Apunta la cámara al código de la tablet central.</p>
      <button class="btn primary" type="button" id="red47Escanea">Escanear código QR</button></section>
      <section data-red47="unida"><h3>Estás en la red del restaurante</h3><p>Tus pedidos llegan a la caja. Cuando la caja cierre la red, esta tablet regresa sola a su Wi-Fi.</p>
      <button class="btn" type="button" id="red47Salir">Salir de la red</button></section>
      <section data-red47="abierta" class="red47Datos"><figure><img alt="Código QR para conectar una tablet" id="red47QR"><figcaption>Escanéalo desde la otra tablet</figcaption></figure>
      <div><p>Código de un solo uso</p><strong id="red47Codigo"></strong><p id="red47Vence"></p><p id="red47Resumen"></p><p id="red47Tablets"></p></div>
      <div class="red47Botones"><button type="button" class="btn" id="red47Nuevo">Nuevo código</button><button type="button" class="btn primary" id="red47Sube">Cerrar la red y subir</button></div></section>
      <p id="red47Mensaje" role="status" hidden></p>`;
    document.body.append(dialogo);
    mensaje=q('red47Mensaje');
    lista=q('red47Tablets');
    boton.onclick=()=>{
      if(!capacidad){abre('ayuda');return;}
      if(central){
        if(!sinInternet()){abre('cierre');return;}
        if(info){
          abre('abierta');
          q('red47QR').src='data:image/png;base64,'+info.qr;
          q('red47Codigo').textContent=info.codigo?.replace(/^(...)(...)$/,'$1 $2')||'';
        }else {abre('abierta');llama('nuevoCodigo');}
      }else if(unida)llama('salir');
      else abre(lee('central',false)?'abrir':'unirse');
      pinta();
    };
    /* Botón anclado en la barra de arriba: abre la red, muestra el código o te une sin tener que quitar el internet. */
    const acciones=q('lpAcciones');
    if(acciones){
      ancla=document.createElement('button');
      ancla.type='button';ancla.className='btn sm lpBarBtn red47Ancla';ancla.id='red47Ancla';ancla.dataset.lpEn='*';ancla.hidden=true;ancla.title='Red sin internet';
      ancla.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9a16 16 0 0 1 20 0M5 13a11 11 0 0 1 14 0M8 17a6 6 0 0 1 8 0"/><circle cx="12" cy="20.5" r="1"/></svg><span id="red47AnclaTxt">Red</span>';
      acciones.prepend(ancla);
      ancla.onclick=()=>{
        if(!capacidad){abre('ayuda');return;}
        if(central){
          abre('abierta');
          if(info){q('red47QR').src='data:image/png;base64,'+info.qr;q('red47Codigo').textContent=info.codigo?.replace(/^(...)(...)$/,'$1 $2')||'';}
          else llama('nuevoCodigo');
        }else if(unida)abre('unida');
        else abre(lee('central',false)?'abrir':'unirse');
        pinta();
      };
    }
    q('red47Salir').onclick=()=>{llama('salir');dialogo.close();};
    q('red47Cerrar').onclick=()=>dialogo.close();
    q('red47Autoriza').onsubmit=autoriza;
    configurar.onclick=()=>abre('central');
    q('red47Escanea').onclick=()=>llama('escanea');
    q('red47Nuevo').onclick=()=>llama('nuevoCodigo');
    q('red47Sube').onclick=()=>abre('cierre');
    dialogo.addEventListener('close',()=>{q('red47Pin').value='';q('red47QR').removeAttribute('src');});
    pinta();
  }
  function inicia(adaptador){
    pos=adaptador;
    puente=window.NuvoorRed?.postMessage?window.NuvoorRed:null;
    if(puente)puente.onmessage=e=>{try{evento(JSON.parse(e.data));}catch(_){}};
    montar();
    function pulso(){
      const actual=pos.identidad();
      if(actual?.cuenta!==identidadAnterior?.cuenta){
        central=false;info=null;tablets=0;pedidos=0;fallandoDesde=0;reintentaResumen=0;
        if(actual){llama('disponible');llama('recupera');}
      }
      if(unida&&(actual?.cuenta!==identidadAnterior?.cuenta||actual?.persona!==identidadAnterior?.persona)){
        puente?.postMessage(JSON.stringify({accion:'salir',cuenta:identidadAnterior?.cuenta}));
        unida=false;enviando='';hastaReintento=0;pos.salida();
      }
      identidadAnterior=actual;
      compruebaEstado();
      if(enviando&&Date.now()>=hastaReintento)enviando='';
      manda();publica();subeResumen();pinta();
    }
    window.addEventListener('offline',pinta);
    window.addEventListener('online',()=>{reintentaResumen=0;pulso();});
    window.addEventListener('nuvoor:restaurant-resume',()=>{llama('recupera');pulso();});
    setInterval(pulso,3300);
    pulso();
  }
  window.NuvoorRedLocal={inicia,evento,recibe,enviar,unida:()=>unida,central:()=>central,sinInternet};
})();
