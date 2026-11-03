/* Imprenta: conserva la interfaz y deja las acciones vencidas en suspensión.
   La consulta conserva los permisos del rol y del plan contratado.
   La base sigue validando las escrituras; este archivo evita iniciar la acción. */
(function(){
  'use strict';
  const estado=()=>window.__estadoLicenciaNuvoor?window.__estadoLicenciaNuvoor():{cargada:false,suspendida:false};
  const suspendida=()=>estado().suspendida===true;
  const navSuspendida=new Set(['cot','mos','com','calc']);
  const zona='#tab-cot,#tab-mos,#tab-com,#tab-sav,#tab-ven,#tab-caj,#tab-inv,#tab-cat,#tab-cli,#tab-dis,#tab-pro,#tab-arc,#tab-asi,#tab-nom,#tab-val,#tab-set,.modal,#docview,#visor,#svVelo,#ceVelo,#mvVelo';
  const excepciones='#auth,#modalPlanes,.nuvoorStripeFondo,[id^="nuvoorStripe"],#perfilMenu,#perfilBox,#modalUser,#modalAyuda,#ayudaPanel,#sinPlanMuro';
  const leer='#mvTicketResumen,[data-expver="cliente"],[data-load],[data-vercot],[data-verdoc-op],[data-verdocped],[data-verdocs],[data-verdis],[data-exp],[data-cotmas],[data-secvolver],[data-seclz],[data-verarchivo]';
  const filtros='#proFiltro button,#proBuscar,#savOrden,#arcBuscar,#venFecha,#venSeg button,#venPrev,#venNext,#venHoy,[data-sfiltro],[data-savfiltro],[data-cxc-edad],[data-cxcedad],[data-rango],[data-periodo]';
  const cierre=/^(ceCerrar|ceCancelar|mvCerrar|mvCancelar|svVCerrar|docClose|visorClose|visorPrev|visorNext|visorZoomIn|visorZoomOut|perfilBtn|btnSalir|menuBtn|btnPlanes|avisoPagoBtn|btnLab|btnBloquea|userBloquea|pinCancel|pinOk|modal.*Cerrar)$/i;
  const etiquetaLectura=/^(cerrar|volver|atrás|hoy|anterior|siguiente|día|semana|mes|año|todas|todos|cotizaciones|pedidos|por cobrar|facturadas|por facturar)$/i;
  let refresco=false,ultimoEstado=null;

  function aviso(){
    if(window.__avisoSuspensionNuvoor)window.__avisoSuspensionNuvoor();
  }
  window.__exigeVigenciaNuvoor=function(silencioso){
    if(!suspendida())return true;
    if(!silencioso)aviso();
    return false;
  };
  function tabDe(el){return el.dataset.tab||el.dataset.tbtab||'';}
  function esCampo(el){return el.matches('input,select,textarea');}
  function esFiltro(el){
    if(el.matches(filtros))return true;
    if(!esCampo(el))return false;
    return el.type==='search'||/(buscar|filtro|orden|rango|periodo|segmento)/i.test(el.id)||/buscar|filtrar/i.test(el.placeholder||'');
  }
  function bloqueada(el){
    if(!suspendida()||el.closest(excepciones))return false;
    if(el.matches('[data-reporte],a[download],#btnExport,#docPrint,#btnPrint,#btnOrden,#envPdf,#visorBajar,#btnSave,#btnTerminar,#btnNew,#compNueva,[data-delcot],[data-delven],[data-abono],[data-cobrar],[data-facturar],[data-subedoc],[data-deldocped],[data-avisar]'))return true;
    const tab=tabDe(el);
    if(tab)return navSuspendida.has(tab);
    if(el.matches('[data-grupo],[data-inv]'))return false;
    if(el.matches('[data-hub]'))return el.dataset.suspendeOperacion==='1';
    if(!el.closest(zona))return false;
    if(el.matches(leer)||esFiltro(el))return false;
    if(el.dataset.racc)return !['volver','verpdf','doc','acuse'].includes(el.dataset.racc);
    if([...el.attributes].some(a=>/^data-.*(?:del|borra|elimina|guarda|save|autoriza|rechaza|cobra)/i.test(a.name)))return true;
    if(esCampo(el))return true;
    if(cierre.test(el.id)||el.matches('.modalClose,[data-close],.secVolver'))return false;
    if(el.closest('#tab-cot,#tab-mos,#tab-com'))return true;
    if(etiquetaLectura.test(el.textContent.trim()))return false;
    // Botones de cerrar de los diálogos actuales, sin cambiar sus etiquetas.
    if(el.textContent.trim()==='×'||el.textContent.trim()==='✕')return !!el.closest('[data-delcot],[data-delven],[data-deldocped]');
    return el.matches('button,input[type=button],input[type=submit],a');
  }
  function marca(el){
    const bloquear=bloqueada(el);
    const tenia=el.hasAttribute('data-nv-suspendido');
    if(bloquear&&!tenia){
      el.dataset.nvSuspendido='1';
      el.dataset.nvAriaAnterior=el.getAttribute('aria-disabled')??'';
      el.dataset.nvTituloAnterior=el.getAttribute('title')??'';
      el.setAttribute('aria-disabled','true');
      el.title='Suspendido: actualiza tu pago para usar esta opción.';
      if(esCampo(el)){el.dataset.nvDisabledAnterior=el.disabled?'1':'0';el.disabled=true;}
    }else if(!bloquear&&tenia){
      const aria=el.dataset.nvAriaAnterior,title=el.dataset.nvTituloAnterior;
      if(aria)el.setAttribute('aria-disabled',aria);else el.removeAttribute('aria-disabled');
      if(title)el.title=title;else el.removeAttribute('title');
      if(esCampo(el)&&el.dataset.nvDisabledAnterior==='0')el.disabled=false;
      delete el.dataset.nvSuspendido;delete el.dataset.nvAriaAnterior;delete el.dataset.nvTituloAnterior;delete el.dataset.nvDisabledAnterior;
    }
  }
  function aplica(){
    document.querySelectorAll('button,input,select,textarea,a[download]').forEach(marca);
    const actual=suspendida();
    document.body.classList.toggle('nv-plan-suspendido',actual);
    if(estado().cargada&&ultimoEstado!==actual){
      ultimoEstado=actual;
      if(window.__cambioSuspensionNuvoor)queueMicrotask(window.__cambioSuspensionNuvoor);
    }
  }
  window.__aplicaSuspensionNuvoor=aplica;
  function programa(){if(refresco)return;refresco=true;requestAnimationFrame(()=>{refresco=false;aplica();});}
  const css=document.createElement('style');css.id='nvSuspensionEstilo';css.textContent=`
    [data-nv-suspendido="1"]{opacity:.48!important;filter:grayscale(1)!important;cursor:not-allowed!important;box-shadow:none!important}
    [data-nv-suspendido="1"]:hover{transform:none!important}
    #avisoPagoBtn.nv-renovar{white-space:normal}
    @media print{body.nv-plan-suspendido>*{display:none!important}body.nv-plan-suspendido::before{content:'Tu plan está suspendido. Actualiza tu pago para exportar documentos.';display:block!important;color:#333;font:14px sans-serif}}
  `;document.head.appendChild(css);
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,input[type=button],input[type=submit]');
    if(!el||!suspendida())return;
    // Abrir una cotización guardada va al visor existente, no al editor.
    if(el.matches('[data-load]')){
      e.preventDefault();e.stopImmediatePropagation();
      if(window.__consultaCotNuvoor)window.__consultaCotNuvoor(el.dataset.load);
      return;
    }
    if(bloqueada(el)){e.preventDefault();e.stopImmediatePropagation();aviso();}
  },true);
  document.addEventListener('submit',e=>{
    if(suspendida()&&e.target.closest(zona)&&!e.target.closest(excepciones)){e.preventDefault();e.stopImmediatePropagation();aviso();}
  },true);
  document.addEventListener('keydown',e=>{
    if(suspendida()&&(e.ctrlKey||e.metaKey)&&['s','p'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();aviso();}
  },true);
  const imprimir=window.print.bind(window);
  window.print=function(){if(window.__exigeVigenciaNuvoor())imprimir();};
  if(window.XLSX){for(const nombre of ['writeFile','writeFileXLSX']){
    if(typeof window.XLSX[nombre]!=='function')continue;
    const original=window.XLSX[nombre];window.XLSX[nombre]=function(...args){if(window.__exigeVigenciaNuvoor())return original.apply(this,args);};
  }}
  new MutationObserver(programa).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)aplica();});
  setInterval(aplica,15000);
  aplica();
})();
