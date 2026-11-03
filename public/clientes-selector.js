/* Selector de clientes. Consulta seis fichas del servidor; la elección carga una ficha completa. */
(function(){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const persona='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';
 const lupa='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
 function crea(op){
  const modal=document.getElementById('modalBuscarClientes'),buscar=modal.querySelector('#nvCliBusca'),lista=modal.querySelector('#nvCliLista'),estado=modal.querySelector('#nvCliEstado');
  let pagina=0,total=0,abierto=false,cargando=false,errorConsulta=false,secuencia=0,seleccionando=false,timer=null,ambito='',ultimoDisparador=null;
  const contexto=()=>{const e=op.estado();return e.cuenta+'|'+e.folio;};
  const vigente=seq=>abierto&&seq===secuencia&&ambito===contexto();
  function render(){
   const e=op.estado(),scope=e.cuenta+'|'+e.folio;
   if(ambito&&ambito!==scope){cerrar(false);}
   const host=document.getElementById('azCli');if(!host)return;
   host.innerHTML='<div class="nvCliDos"><button type="button" class="nvCliOpcion" data-azcli="" aria-pressed="'+(!e.clienteId)+'"><span class="nvCliIcono nvCliMas" aria-hidden="true">+</span><b>Cliente nuevo</b><small>Capturar sus datos</small></button><button type="button" class="nvCliOpcion" id="nvCliAbrir" aria-pressed="'+!!e.clienteId+'"><span class="nvCliIcono">'+lupa+'</span><b>Buscar cliente</b><small>'+esc(e.clienteId?(e.nombre||'Cambiar cliente'):'Elegir uno guardado')+'</small></button></div>';
  }
  function muestraEstado(m,error=false){estado.textContent=m;estado.classList.toggle('nvCliError',error);}
  function botones(){modal.querySelector('#nvCliAnterior').disabled=cargando||seleccionando||errorConsulta||pagina<=0;modal.querySelector('#nvCliSiguiente').disabled=cargando||seleccionando||errorConsulta||(pagina+1)*6>=total;}
  async function consulta(){
   const seq=++secuencia,ctx=op.estado();if(!abierto)return;
   cargando=true;errorConsulta=false;lista.innerHTML='';lista.setAttribute('aria-busy','true');muestraEstado('Buscando clientes…');botones();
   try{
    const r=await op.buscar(buscar.value,pagina,ctx.cuenta);
    if(!vigente(seq)){if(ambito!==contexto())cerrar(false);return;}
    if(!Array.isArray(r.clientes))throw Error('No se pudo leer el directorio.');
    pagina=Number(r.pagina)||0;total=Number(r.total)||0;
    lista.innerHTML=r.clientes.slice(0,6).map(c=>'<button type="button" class="nvCliFicha" data-nvcliente="'+esc(c.id)+'">'+
      '<span class="nvCliAvatar">'+persona+'</span><b>'+esc(c.nombre||'Sin nombre')+'</b><small>'+esc(c.tel||c.mail||'Sin contacto capturado')+'</small>'+
      (c.rfc?'<span class="nvCliRfc">'+esc(c.rfc)+'</span>':'')+'<span class="nvCliElegir">Elegir y editar →</span></button>').join('');
    muestraEstado(total?total.toLocaleString('es-MX')+' cliente(s)'+(buscar.value.trim()?' encontrados':' guardados'):'No hay clientes que coincidan.');
    modal.querySelector('#nvCliRango').textContent=total?(pagina*6+1)+'–'+Math.min((pagina+1)*6,total)+' de '+total.toLocaleString('es-MX'):'Sin resultados';
    modal.querySelector('#nvCliPagina').textContent='Página '+(pagina+1)+' de '+Math.max(1,Math.ceil(total/6));
   }catch(e){if(vigente(seq)){errorConsulta=true;muestraEstado(e.message||'No se pudieron cargar los clientes. Intenta de nuevo.',true);modal.querySelector('#nvCliRango').textContent='';modal.querySelector('#nvCliPagina').textContent='';lista.innerHTML='<button type="button" class="btn sm" id="nvCliReintenta">Volver a intentar</button>';}else if(ambito!==contexto())cerrar(false);}
   finally{if(vigente(seq)){cargando=false;lista.removeAttribute('aria-busy');botones();}}
  }
  function cerrar(enfocar=true){
   abierto=false;secuencia++;clearTimeout(timer);modal.hidden=true;lista.innerHTML='';buscar.value='';seleccionando=false;cargando=false;
   if(enfocar){const b=document.getElementById('nvCliAbrir')||ultimoDisparador;if(b?.isConnected)b.focus();}
  }
  function abrir(){
   if(!op.puede())return;
   ultimoDisparador=document.activeElement;ambito=contexto();abierto=true;pagina=0;total=0;buscar.value='';modal.hidden=false;buscar.disabled=false;
   buscar.focus();consulta();
  }
  async function elige(id){
   if(seleccionando||!abierto||!op.puede())return;
   seleccionando=true;const seq=secuencia,ctx=op.estado();buscar.disabled=true;lista.querySelectorAll('button').forEach(b=>b.disabled=true);botones();muestraEstado('Abriendo la ficha del cliente…');
   try{const c=await op.obtener(id,ctx.cuenta);if(!vigente(seq)){if(ambito!==contexto())cerrar(false);return;}if(!op.puede()){cerrar(false);return;}
    await op.selecciona(c);cerrar(false);op.editar();
   }catch(e){if(vigente(seq))muestraEstado(e.message||'No se pudo abrir la ficha.',true);else if(ambito!==contexto())cerrar(false);}
   finally{if(vigente(seq)){seleccionando=false;buscar.disabled=false;lista.querySelectorAll('button').forEach(b=>b.disabled=false);botones();}}
  }
  document.addEventListener('click',e=>{if(e.target.closest('#nvCliAbrir'))abrir();});
  modal.addEventListener('click',e=>{if(e.target.closest('#modalBuscarClientesCerrar')||e.target===modal){cerrar();return;}const b=e.target.closest('[data-nvcliente]');if(b){elige(b.dataset.nvcliente);return;}
   if(seleccionando)return;
   if(e.target.closest('#nvCliAnterior')&&!cargando){pagina--;consulta();}if(e.target.closest('#nvCliSiguiente')&&!cargando){pagina++;consulta();}if(e.target.closest('#nvCliReintenta'))consulta();
  });
  buscar.addEventListener('input',()=>{clearTimeout(timer);secuencia++;pagina=0;timer=setTimeout(consulta,220);});
  modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cerrar();}if(e.key==='Tab'){
   const ls=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled)')],i=ls.indexOf(document.activeElement);
   if(e.shiftKey&&i===0){ls[ls.length-1]?.focus();e.preventDefault();}else if(!e.shiftKey&&i===ls.length-1){ls[0]?.focus();e.preventDefault();}
  }});
  return {render,cerrar,abrir};
 }
 window.NuvoorClientes={crea};
})();
