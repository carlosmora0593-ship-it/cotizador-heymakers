(function(w){
 'use strict';
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>Number.isFinite(Number(v))?Number(v):0;
 const fmt=v=>n(v).toLocaleString('es-MX');
 const url=v=>{try{if(!/^https?:\/\//i.test(String(v||'')))return '';const u=new URL(String(v),location.href);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch(_){return '';}};
 const dia=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 const hoy=()=>dia(new Date()),antes=d=>dia(new Date(Date.now()-d*86400000));
 const s={tab:'anuncios',desde:antes(6),hasta:hoy(),anuncio:'',reporte:null,facDesde:hoy().slice(0,8)+'01',facHasta:hoy(),buscar:'',carpetas:false,facturas:null};
 let anuncios=[],secuencia=0,modalModelo=null,publicar=null,foco=null;
 const doc=()=>typeof document==='undefined'?null:document;
 const q=sel=>doc()?.querySelector(sel);
 const btn=(texto,accion,extra='',principal=false)=>'<button type="button" class="btn '+(principal?'p ':'')+'" data-lo="'+accion+'" '+extra+'>'+texto+'</button>';
 const tag=(texto,clase='')=>'<span class="loTag '+clase+'">'+e(texto)+'</span>';
 const error=err=>String(err?.message||err||'No se pudo completar la operación.');
 const vacio=t=>'<p class="loVacio">'+e(t)+'</p>';
 const raiz=(contenido,vista)=>'<div id="loRoot" class="loRoot" data-view="'+vista+'">'+contenido+'</div>';
 function csv(filas){return '\uFEFF'+filas.map(f=>f.map(v=>{let t=String(v??'');if(/^[\s]*[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');}
 function descarga(nombre,texto){const a=doc().createElement('a'),u=URL.createObjectURL(new Blob([texto],{type:'text/csv;charset=utf-8'}));a.href=u;a.download=nombre;doc().body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);}
 function aviso(t){if(typeof w.aviso==='function')w.aviso(t);else if(q('#loMensaje'))q('#loMensaje').textContent=t;}
 function indicadores(datos){return '<div class="loMetrics">'+datos.map(d=>'<div><span>'+e(d[0])+'</span><b>'+e(d[1])+'</b><small>'+e(d[2])+'</small></div>').join('')+'</div>';}
 function panel(titulo,sub,cuerpo){return '<section class="loPanel"><header><h2>'+e(titulo)+'</h2>'+(sub?'<p>'+e(sub)+'</p>':'')+'</header>'+cuerpo+'</section>';}
 function tabs(items){return '<div class="loTabs">'+items.map(i=>'<button type="button" data-lo="'+i[1]+'" aria-pressed="'+i[2]+'">'+e(i[0])+'</button>').join('')+'</div>';}
 function publicidad(lista){
  anuncios=(lista||[]).slice();
  let contenido='<div class="loHead"><div><h1>Publicidad con resultados</h1><p>Revisa el anuncio antes de publicar y consulta sus resultados.</p></div><div class="loActions"><button class="btn sm" id="anVarias">Subir varias</button><input id="an_varias" type="file" accept="image/*" multiple hidden><button class="btn p" id="anNuevo">Nuevo anuncio</button></div></div>';
  contenido+=tabs([['Anuncios','tab-anuncios',s.tab==='anuncios'],['Reportes y alcance','tab-reportes',s.tab==='reportes']]);
  if(s.tab==='reportes')return raiz(contenido+reporteHTML(),'anuncios');
  const vistas=anuncios.reduce((a,x)=>a+n(x.vistas),0),clics=anuncios.reduce((a,x)=>a+n(x.clics),0);
  contenido+=indicadores([['Al aire',anuncios.filter(a=>a.estado==='al aire'||a.activo&&!a.estado).length,'Campañas publicadas'],['Borradores',anuncios.filter(a=>a.borrador).length,'Cambios fuera del aire'],['Vistas acumuladas',fmt(vistas),'Incluye el contador anterior'],['Clics acumulados',fmt(clics),vistas?(100*clics/vistas).toFixed(1)+'% de las vistas':'Sin clics todavía']]);
  contenido+=panel('Tus campañas','Guardar un borrador conserva la versión publicada hasta que decidas sustituirla.',anuncios.length?'<div class="loCampanas">'+anuncios.sort((a,b)=>n(a.orden)-n(b.orden)).map(a=>{
   const d=a.borrador||a,img=url(d.imagen),activa=a.activo&&(!a.desde||a.desde<=hoy())&&(!a.hasta||a.hasta>=hoy());
   return '<article class="loCampana"><div class="loMini">'+(img?'<img src="'+e(img)+'" alt="">':'Sin imagen')+'</div><div class="loCrece"><h3>'+e(d.titulo||'Sin título')+'</h3><p>'+e(d.anunciante||'Sin anunciante')+' · '+e(a.lugar==='bloqueo'?'Pantalla de bloqueo':a.lugar==='ambos'?'Tablero y bloqueo':'Tablero')+'</p>'+tag(activa?'Al aire':a.estado||'Apagado',activa?'loGood':'')+' '+(a.borrador?tag('Hay borrador','loWarn'):'')+'</div><div class="loActions">'+btn('Vista previa','previa','data-id="'+e(a.id)+'"')+'<button type="button" class="btn" data-anuncio="'+e(a.id)+'">Editar</button>'+btn('Resultados','resultado','data-id="'+e(a.id)+'"')+'</div></article>';
  }).join('')+'</div>':vacio('Todavía no hay anuncios. Crea un borrador para revisar la primera campaña.'));
  return raiz(contenido,'anuncios');
 }
 function reporteHTML(){
  const filtros='<div class="loFiltros"><label>Desde<input id="loDesde" type="date" value="'+e(s.desde)+'"></label><label>Hasta<input id="loHasta" type="date" value="'+e(s.hasta)+'"></label><label>Campaña<select id="loAnuncio"><option value="">Todas las campañas</option>'+anuncios.map(a=>'<option value="'+e(a.id)+'"'+(String(a.id)===s.anuncio?' selected':'')+'>'+e(a.titulo||a.borrador?.titulo||'Sin título')+'</option>').join('')+'</select></label>'+btn('Consultar','consultar','',true)+'</div>';
  const r=s.reporte;
  if(!r)return filtros+vacio('Cargando el reporte…');
  if(r.error)return filtros+'<div class="loError" role="alert">'+e(r.error)+' '+btn('Reintentar','consultar')+'</div>';
  const d=r.data,t=d.totales||{},pct=n(t.vistas)?(100*n(t.clics)/n(t.vistas)).toFixed(1)+'%':'—';
  let body=indicadores([['Visualizaciones',fmt(t.vistas),'Veces que se mostró'],['Alcance',fmt(t.alcance),'Negocios únicos'],['Clics',fmt(t.clics),'Interacciones con el enlace'],['Porcentaje de clics',pct,'Clics ÷ visualizaciones']]);
  const dias=d.dias||[],max=Math.max(1,...dias.map(x=>n(x.vistas)));
  body+=panel('Resultados del periodo','Alcance por negocios, no por personas; un negocio se cuenta una vez en el periodo.',dias.length?'<div class="loGrafica" role="img" aria-label="Visualizaciones por fecha">'+dias.map(x=>'<div><b>'+fmt(x.vistas)+'</b><i style="height:'+Math.max(2,Math.round(n(x.vistas)/max*120))+'px"></i><small>'+e(String(x.fecha).slice(5))+'</small></div>').join('')+'</div>':vacio('Todavía no hay eventos en estas fechas.'));
  body+=panel('Por campaña','', '<div class="loTabla"><table><thead><tr><th>Anuncio</th><th>Vistas</th><th>Negocios</th><th>Clics</th></tr></thead><tbody>'+(d.campanas||[]).map(a=>'<tr><td>'+e(a.titulo||'Anuncio retirado')+'</td><td>'+fmt(a.vistas)+'</td><td>'+fmt(a.alcance)+'</td><td>'+fmt(a.clics)+'</td></tr>').join('')+'</tbody></table></div>');
  return filtros+body+'<div class="loActions">'+btn('Descargar CSV para Excel','exportar')+btn('Imprimir / guardar PDF','imprimir')+'</div><p class="loNota">Medición disponible desde '+e(String(d.inicio||'').slice(0,10))+'. Fechas en Ciudad de México. Los acumulados anteriores se conservan; no se reconstruye alcance histórico.</p>';
 }
 function dinero(f){try{return new Intl.NumberFormat('es-MX',{style:'currency',currency:String(f.moneda||'mxn').toUpperCase()}).format(n(f.importe_centavos)/100);}catch(_){return fmt(n(f.importe_centavos)/100)+' '+e(f.moneda);}}
 function facturas(){
  let h='<div class="loHead"><div><h1>Facturas de suscripciones</h1><p>Cada pago confirmado, con su emisión, archivos y seguimiento.</p></div><div class="loActions">'+tag('Archivo privado')+(w.__labOperacion?.propietario()?btn('Permisos del equipo','permisos'):'')+'</div></div>';
  h+='<div class="loAviso">Falta configurar el emisor en Facturapi. Los pagos se registran como pendientes: no se generan folios ni se simulan envíos. <a href="https://dashboard.facturapi.io" target="_blank" rel="noopener noreferrer">Abrir Facturapi ↗</a></div>';
  h+='<div class="loFiltros"><label>Desde<input type="date" id="loFacDesde" value="'+e(s.facDesde)+'"></label><label>Hasta<input type="date" id="loFacHasta" value="'+e(s.facHasta)+'"></label><label>Cliente o referencia<input type="search" id="loFacBusca" value="'+e(s.buscar)+'" placeholder="Nombre del negocio o pago"></label>'+btn('Consultar','facturas-consultar','',true)+'</div>';
  const r=s.facturas;
  if(!r)return raiz(h+vacio('Cargando los pagos y sus facturas…'),'facturas');
  if(r.error)return raiz(h+'<div class="loError" role="alert">'+e(r.error)+' '+btn('Reintentar','facturas-consultar')+'</div>','facturas');
  const filas=r.data.filas||[];
  h+=indicadores([['Pagos registrados',filas.length,'En esta consulta'],['Por facturar',filas.filter(f=>f.estado!=='timbrada'||!f.uuid_sat).length,'Pendientes fiscales'],['Por reenviar',filas.filter(f=>f.uuid_sat&&f.envio_estado!=='enviado').length,'Reutiliza la misma factura'],['Con archivos',filas.filter(f=>f.pdf&&f.xml).length,'PDF y XML disponibles']]);
  h+=tabs([['Pagos y facturas','facturas-pagos',!s.carpetas],['Carpetas de archivos','facturas-carpetas',s.carpetas]]);
  const lista=filas.length?'<div class="loFacturas">'+filas.map(f=>'<article class="loFactura"><div class="loCrece"><h3>'+e(f.negocio)+'</h3><p>'+e(f.plan||'Suscripción')+' · '+e(String(f.pagado).slice(0,10))+' · '+e(dinero(f))+'</p><small>'+e(f.referencia)+'</small></div><div class="loEstados">'+tag(f.uuid_sat&&f.estado==='timbrada'?'Timbrada':'Pendiente de emisión',f.uuid_sat?'loGood':'loWarn')+tag(f.prueba?'Pago de prueba':'Pago confirmado')+(f.uuid_sat?tag(f.envio_estado==='enviado'?'Envío solicitado':'Por enviar'):tag('Sin envío'))+'</div>'+btn(s.carpetas?'Abrir carpeta':'Abrir expediente','expediente','data-id="'+e(f.pago_id)+'"')+'</article>').join('')+'</div>':vacio('No hay pagos registrados en estas fechas. Los nuevos pagos confirmados por Stripe aparecerán aquí.');
  const grupos=new Map();for(const f of filas){const k=String(f.cuenta_id);if(!grupos.has(k))grupos.set(k,{nombre:f.negocio,id:k,filas:[]});grupos.get(k).filas.push(f);}
  const carpetas='<div class="loCarpetas">'+[...grupos.values()].map(g=>'<article><h3>'+e(g.nombre)+'</h3><p>'+g.filas.length+' pago(s) · '+g.filas.filter(f=>f.pdf&&f.xml).length+' con PDF y XML</p>'+btn('Abrir carpeta','carpeta','data-id="'+e(g.id)+'"')+'</article>').join('')+'</div>';
  h+=panel(s.carpetas?'Archivo por cliente y periodo':'Cada pago, con su seguimiento','Los pagos de prueba se identifican y nunca se presentan como facturas fiscales reales.',s.carpetas&&filas.length?carpetas:lista);
  if(filas.length===1000)h+='<p class="loNota">Se muestran hasta 1000 pagos. Reduce el periodo para revisar o exportar los demás.</p>';
  h+='<div class="loActions">'+btn('Exportar registro CSV','facturas-exportar')+'</div><p class="loNota">El PDF y el XML originales se conservarán aunque falle el correo. Sólo el equipo autorizado puede abrirlos.</p>';
  return raiz(h,'facturas');
 }
 async function montar(vista){
  const r=q('#loRoot');if(!r)return;
  if(vista==='anuncios'&&s.tab==='reportes'&&!s.reporte)await cargaReporte();
  if(vista==='facturas'&&!s.facturas)await cargaFacturas();
 }
 function repinta(vista){const root=q('#loRoot');if(root?.dataset.view!==vista)return;root.outerHTML=vista==='anuncios'?publicidad(anuncios):facturas();}
 async function cargaReporte(){const turno=++secuencia;try{const data=await w.__labOperacion.reporte(s.desde,s.hasta,s.anuncio);if(turno!==secuencia)return;s.reporte={data};}catch(err){if(turno!==secuencia)return;s.reporte={error:error(err)};}repinta('anuncios');}
 async function cargaFacturas(){const turno=++secuencia;try{const data=await w.__labOperacion.facturas(s.facDesde,s.facHasta,s.buscar);if(turno!==secuencia)return;s.facturas={data};}catch(err){if(turno!==secuencia)return;s.facturas={error:error(err)};}repinta('facturas');}
 function cierra(){q('#loModal')?.remove();doc()?.body.classList.remove('loModalAbierto');if(foco?.isConnected)foco.focus();}
 function abre(titulo,cuerpo){cierra();foco=doc().activeElement;const m=doc().createElement('div');m.id='loModal';m.innerHTML='<section class="loDialogo" role="dialog" aria-modal="true" aria-labelledby="loModalTitulo"><header><h2 id="loModalTitulo">'+e(titulo)+'</h2>'+btn('Cerrar','cerrar')+'</header><div class="loDialogoBody">'+cuerpo+'</div><p id="loMensaje" role="status"></p></section>';doc().body.append(m);doc().body.classList.add('loModalAbierto');q('#loModal button').focus();}
 function previa(a,alPublicar){modalModelo={...a};publicar=alPublicar||null;const img=url(a.imagen);abre('Vista previa · '+(a.borrador?'borrador':'anuncio'),'<div class="loFiltros">'+btn('Computadora / tablet','dispositivo','data-device="desktop"')+btn('Celular','dispositivo','data-device="mobile"')+'<label>Ubicación<select id="loUbicacion"><option value="bloqueo">Pantalla de bloqueo</option><option value="tablero">Tablero</option></select></label></div><div class="loPrevia" data-device="desktop"><span>PUBLICIDAD</span><div class="loImagen">'+(img?'<img src="'+e(img)+'" alt="'+e(a.alt||a.titulo||'Anuncio')+'">':vacio('Sube una imagen para completar el anuncio.'))+'</div><b>'+e(a.titulo||'Sin título')+'</b>'+(url(a.enlace)?'<span class="loCta">Conocer más →</span>':'')+'</div><p class="loNota" id="loMedida">Bloqueo: arte 1200 × 900 px · en celular 1200 × 400 px. La imagen se muestra completa.</p><p class="loNota">Previsualizar no publica ni suma vistas o clics.</p><div class="loActions">'+(publicar?btn('Publicar ahora','publicar-final','',true):btn('Editar anuncio','editar-previa','data-id="'+e(a.id)+'"'))+'</div>');}
 function previaEditor(a){if(!a)return;const modelo={...a};for(const k of ['titulo','imagen','enlace','alt','lugar']){const el=q('#an_'+k);if(el)modelo[k]=el.value.trim();}previa(modelo,()=>w.guardaFicha(true));}
 function expediente(id){const f=(s.facturas?.data?.filas||[]).find(f=>String(f.pago_id)===String(id));if(!f)return;const fecha=String(f.pagado).slice(0,10),folio=f.folio?(f.serie||'')+f.folio:'Pendiente';abre('Expediente · '+f.negocio,'<p class="loNota">Facturas / '+e(f.negocio)+' / '+e(fecha.slice(0,4))+' / '+e(fecha.slice(5,7))+'</p><div class="loFichaDatos"><b>'+e(dinero(f))+'</b>'+tag(f.prueba?'Pago de prueba':'Pago confirmado')+'<p>'+e(f.referencia)+'</p><p>Factura: '+e(folio)+'</p>'+(f.uuid_sat?'<p>UUID: '+e(f.uuid_sat)+'</p>':'<p>'+e(f.motivo||'Pendiente de emisión fiscal')+'</p>')+'</div><div class="loArchivos">'+[['pdf','Descargar PDF',f.pdf],['xml','Descargar XML',f.xml]].map(x=>btn(x[1],'archivo','data-id="'+e(f.factura_id)+'" data-format="'+x[0]+'"'+(!x[2]?' disabled':''))).join('')+'</div><h3>Seguimiento del correo</h3><p>'+e(f.uuid_sat?(f.envio_error||f.envio_estado):'Sin envío: aún no hay una factura emitida.')+'</p><button type="button" class="btn" disabled>Reenviar PDF + XML</button><p class="loNota">El reenvío estará disponible al conectar Facturapi. No generará una factura nueva. Puedes descargar los archivos disponibles para enviarlos por tu cuenta.</p>');}
 function carpeta(id){const filas=(s.facturas?.data?.filas||[]).filter(f=>String(f.cuenta_id)===String(id));if(!filas.length)return;const meses=new Map();for(const f of filas){const mes=String(f.pagado).slice(0,7);if(!meses.has(mes))meses.set(mes,[]);meses.get(mes).push(f);}abre('Archivos · '+filas[0].negocio,[...meses].map(([mes,lista])=>'<section class="loMes"><h3>'+e(mes.replace('-',' / '))+'</h3>'+lista.map(f=>'<div class="loPermiso"><span>'+e(dinero(f))+'<small>'+e(f.referencia)+'</small></span>'+btn('Abrir expediente','expediente','data-id="'+e(f.pago_id)+'"')+'</div>').join('')+'</section>').join(''));}
 async function permisos(){try{const lista=await w.__labOperacion.permisos();abre('Equipo autorizado para facturas','<p class="loNota">Sólo el dueño puede habilitar o retirar estos permisos. Cada cambio queda registrado.</p>'+lista.map(p=>'<label class="loPermiso"><span>'+e(p.nombre||'Miembro del equipo')+'<small>'+e(p.rol)+'</small></span><input type="checkbox" data-lo-permiso="'+e(p.id)+'"'+(p.permitido?' checked':'')+(p.rol==='dueno'?' disabled':'')+'></label>').join(''));}catch(err){aviso(error(err));}}
 function reporteCSV(){const d=s.reporte?.data;if(!d)return;descarga('reporte-publicidad-'+s.desde+'-'+s.hasta+'.csv',csv([['Reporte de publicidad Nuvoor'],['Desde',s.desde,'Hasta',s.hasta],['Anuncio','Visualizaciones','Negocios únicos','Clics'],...(d.campanas||[]).map(c=>[c.titulo,c.vistas,c.alcance,c.clics]),['TOTAL (alcance único del periodo)',d.totales.vistas,d.totales.alcance,d.totales.clics]]));}
 function imprime(){const d=s.reporte?.data;if(!d)return;const p=w.open('','_blank');if(!p){aviso('Permite abrir la ventana del reporte para imprimirlo.');return;}p.document.write('<!doctype html><html lang="es"><meta charset="utf-8"><title>Reporte de publicidad Nuvoor</title><style>body{font:14px system-ui;margin:32px;color:#111}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #ccc}</style><h1>Reporte de publicidad · Nuvoor</h1><p>'+e(s.desde)+' al '+e(s.hasta)+' · Ciudad de México</p><p>Vistas: '+fmt(d.totales.vistas)+' · Negocios únicos: '+fmt(d.totales.alcance)+' · Clics: '+fmt(d.totales.clics)+'</p><table><tr><th>Anuncio</th><th>Vistas</th><th>Negocios</th><th>Clics</th></tr>'+(d.campanas||[]).map(c=>'<tr><td>'+e(c.titulo)+'</td><td>'+fmt(c.vistas)+'</td><td>'+fmt(c.alcance)+'</td><td>'+fmt(c.clics)+'</td></tr>').join('')+'</table><p>El alcance total no es la suma del alcance de las campañas.</p></html>');p.addEventListener('load',()=>p.print(),{once:true});p.document.close();}
 async function clic(ev){const b=ev.target.closest('[data-lo]');if(!b)return;ev.preventDefault();ev.stopPropagation();const a=b.dataset.lo;
  if(a==='tab-anuncios'||a==='tab-reportes'){s.tab=a.slice(4);repinta('anuncios');if(!s.reporte&&s.tab==='reportes')cargaReporte();}
  if(a==='previa'){const item=anuncios.find(x=>String(x.id)===b.dataset.id);if(item)previa({...item,...(item.borrador||{})});}
  if(a==='resultado'){s.anuncio=b.dataset.id;s.tab='reportes';s.reporte=null;repinta('anuncios');cargaReporte();}
  if(a==='consultar'){s.desde=q('#loDesde').value;s.hasta=q('#loHasta').value;s.anuncio=q('#loAnuncio').value;s.reporte=null;repinta('anuncios');cargaReporte();}
  if(a==='facturas-consultar'){s.facDesde=q('#loFacDesde').value;s.facHasta=q('#loFacHasta').value;s.buscar=q('#loFacBusca').value;s.facturas=null;repinta('facturas');cargaFacturas();}
  if(a==='facturas-pagos'||a==='facturas-carpetas'){s.carpetas=a==='facturas-carpetas';repinta('facturas');}
  if(a==='expediente')expediente(b.dataset.id);
  if(a==='carpeta')carpeta(b.dataset.id);
  if(a==='cerrar')cierra();
  if(a==='dispositivo'){q('.loPrevia').dataset.device=b.dataset.device;}
  if(a==='editar-previa'){cierra();if(w.abreAnuncio)w.abreAnuncio(b.dataset.id);}
  if(a==='publicar-final'){if(!url(modalModelo?.imagen)){aviso('Falta una imagen válida para publicar.');return;}const fn=publicar;cierra();if(fn)await fn();}
  if(a==='exportar')reporteCSV();
  if(a==='imprimir')imprime();
  if(a==='facturas-exportar'){const filas=s.facturas?.data?.filas||[];descarga('registro-facturas-'+s.facDesde+'.csv',csv([['Negocio','Fecha de pago','Referencia','Importe','Moneda','Prueba','Estado fiscal','UUID'],...filas.map(f=>[f.negocio,f.pagado,f.referencia,n(f.importe_centavos)/100,f.moneda,f.prueba?'Sí':'No',f.estado,f.uuid_sat||''])]));}
  if(a==='ir-facturas')q('#nav [data-v="facturas"]')?.click();
  if(a==='permisos')await permisos();
  if(a==='archivo'){b.disabled=true;try{const u=await w.__labOperacion.archivo(b.dataset.id,b.dataset.format);const ancla=doc().createElement('a');ancla.href=url(u);ancla.target='_blank';ancla.rel='noopener noreferrer';doc().body.append(ancla);ancla.click();ancla.remove();}catch(err){aviso(error(err));}finally{b.disabled=false;}}
 }
 if(doc()){
  doc().addEventListener('click',ev=>{if(ev.target===q('#loModal')){cierra();return;}clic(ev).catch(err=>aviso(error(err)));},true);
  doc().addEventListener('change',async ev=>{
   if(ev.target.id==='loUbicacion'){q('.loPrevia').dataset.place=ev.target.value;q('#loMedida').textContent=ev.target.value==='bloqueo'?'Bloqueo: 1200 × 900 px · celular 1200 × 400 px.':'Tablero: la imagen se contiene en el espacio publicitario sin recortarse.';}
   const id=ev.target.dataset.loPermiso;if(id){const el=ev.target;el.disabled=true;try{await w.__labOperacion.permisos(id,el.checked);}catch(err){el.checked=!el.checked;aviso(error(err));}finally{el.disabled=false;}}
  });
  doc().addEventListener('keydown',ev=>{const m=q('#loModal');if(!m)return;if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cierra();}if(ev.key==='Tab'){const nodes=[...m.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select')].filter(x=>x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(ev.shiftKey&&doc().activeElement===first){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&doc().activeElement===last){ev.preventDefault();first?.focus();}}},true);
 }
 w.NuvoorLabOperacion={publicidad,facturas,montar,previaEditor,csv};
})(typeof window==='undefined'?globalThis:window);
