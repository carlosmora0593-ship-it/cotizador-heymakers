/* Tablero de Imprenta. Recibe únicamente los datos que permite el rol y el plan. */
(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const red=v=>Math.round(v*100)/100;
  const numero=(v,d=0)=>new Intl.NumberFormat('es-MX',{maximumFractionDigits:d}).format(v);
  const dinero=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(v);
  const fecha=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const dia=v=>{const s=String(v||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T12:00:00');return Number.isFinite(+d)&&fecha(d)===s?s:'';};
  function dias(hoy,cantidad,atras=0){const d=new Date(dia(hoy)+'T12:00:00');d.setDate(d.getDate()-atras-cantidad+1);return Array.from({length:cantidad},()=>{const f=fecha(d);d.setDate(d.getDate()+1);return f;});}
  const grupos=[['Pendientes','#4c4780'],['En diseño','#4458a4'],['En producción','#49a6de'],['Listos para entregar','#79cce0'],['Detenidos','#b37c37']];
  function grupo(estado){return estado==='Detenida'?4:['Empacada','Lista para entregar'].includes(estado)?3:['En impresión','En aplicación','Control de calidad'].includes(estado)?2:estado==='En diseño'?1:0;}
  function datos(entrada,periodo=7){
    const hoy=dia(entrada.hoy)||fecha(new Date()),finanzas=!!entrada.finanzas;
    const pedidos=(entrada.pedidos||[]).filter(g=>g.op);
    const activos=pedidos.filter(g=>g.op.estatus!=='Entregada');
    const entregados=pedidos.filter(g=>g.op.estatus==='Entregada'&&dia(g.entregaReal?.fecha));
    const cobros=[];
    if(finanzas)for(const v of entrada.ventas||[]){
      // Los abonos se cuentan en su día, aunque la venta sea de otro mes.
      // En ventas antiguas, el anticipo sin desglose queda en la fecha de venta.
      let desglosado=0;
      for(const a of v.abonos||[]){const monto=Math.max(0,n(a.monto));desglosado+=monto;if(dia(a.fecha)&&monto)cobros.push({fecha:dia(a.fecha),monto});}
      const resto=red(Math.max(0,n(v.recibido)-desglosado));
      if(resto&&dia(v.fecha))cobros.push({fecha:dia(v.fecha),monto:resto});
    }
    const actual=dias(hoy,periodo),anterior=dias(hoy,periodo,periodo),mapa=new Map();
    for(const x of finanzas?cobros:entregados.map(g=>({fecha:dia(g.entregaReal.fecha),monto:1})))mapa.set(x.fecha,red((mapa.get(x.fecha)||0)+x.monto));
    const serie=actual.map(f=>mapa.get(f)||0),previa=anterior.map(f=>mapa.get(f)||0),total=red(serie.reduce((a,b)=>a+b,0)),antes=red(previa.reduce((a,b)=>a+b,0));
    const mes=dias(hoy,30),recientes=entregados.filter(g=>mes.includes(dia(g.entregaReal.fecha))&&dia(g.entrega));
    const puntuales=recientes.filter(g=>dia(g.entregaReal.fecha)<=dia(g.entrega)).length;
    const estados=grupos.map(([nombre,color])=>({nombre,color,cantidad:0}));activos.forEach(g=>estados[grupo(g.op.estatus)].cantidad++);
    const hoyCobros=cobros.filter(x=>x.fecha===hoy);
    return {hoy,finanzas,activos,estados,actual,serie,total,antes,
      cobrado:red(hoyCobros.reduce((s,x)=>s+x.monto,0)),numeroCobros:hoyCobros.length,
      saldo:finanzas?red((entrada.ventas||[]).reduce((s,v)=>s+Math.max(0,n(v.total)-n(v.recibido)),0)):0,
      hoyEntregas:activos.filter(g=>dia(g.entrega)===hoy).length,
      terminados:entregados.filter(g=>dia(g.entregaReal.fecha)===hoy).length,
      recientes:recientes.length,puntuales,
      proximos:activos.filter(g=>dia(g.entrega)).sort((a,b)=>String(a.entrega).localeCompare(String(b.entrega))||String(a.horaEntrega||'').localeCompare(String(b.horaEntrega||''))).slice(0,5)};
  }
  function seguro(url){if(typeof url!=='string'||!url.trim())return '';try{const u=new URL(url,location.href);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch(e){return '';}}
  function tema(){const b=document.querySelector('#nvTema');if(!b)return;const oscuro=document.documentElement.dataset.theme==='dark';b.setAttribute('aria-checked',String(oscuro));b.setAttribute('aria-label',oscuro?'Cambiar a modo día':'Cambiar a modo nocturno');b.title=b.getAttribute('aria-label');}
  function crea(opciones){
    let periodo=7,estado=null;
    const raiz=document.querySelector('#tab-inicio'),q=s=>raiz.querySelector(s);
    const puede=t=>!!opciones.puede(t);
    function enlace(t,texto,clase='nvLink'){return puede(t)?'<button type="button" class="'+clase+'" data-tbtab="'+esc(t)+'">'+esc(texto)+'</button>':'';}
    function render(){
      const entrada=opciones.lee();estado=datos(entrada,periodo);const d=estado;
      q('#nvFecha').textContent=new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long'}).format(new Date(d.hoy+'T12:00:00'));
      q('#nvAcciones').innerHTML=enlace('mos','Vender','nvBtn')+enlace('cot','+ Nueva cotización','nvBtn nvPrimary');
      const metricas=d.finanzas?[
        ['Cobrado hoy',d.cobrado,d.numeroCobros+' pago(s) recibido(s)',true,'ven'],['Por cobrar',d.saldo,'Saldo pendiente actual',true,'ven'],
        ['Pedidos en proceso',d.activos.length,'Trabajos activos',false,'pro'],['Entregas hoy',d.hoyEntregas,'Comprometidas para hoy',false,'pro']
      ]:[['Pedidos en proceso',d.activos.length,'Trabajos activos',false,'pro'],['En producción',d.estados[2].cantidad,'Trabajos en el taller',false,'pro'],['Entregas hoy',d.hoyEntregas,'Comprometidas para hoy',false,'pro'],puede('inv')?['Material por revisar',entrada.faltantes||0,'Debajo del mínimo',false,'inv']:['Listos para entregar',d.estados[3].cantidad,'Empacados o listos',false,'pro']];
      q('#nvMetricas').innerHTML=metricas.map((m,i)=>'<article class="nvMetric"><span class="nvMetricIcon">'+opciones.icono(m[4])+'</span><span class="nvLabel">'+m[0]+'</span><strong data-nvvalor="'+m[1]+'"'+(m[3]?' data-nvmoneda="1"':'')+'>'+esc(m[3]?dinero(m[1]):numero(m[1]))+'</strong><small>'+esc(m[2])+'</small></article>').join('');
      const tareas=[];
      const vencidos=d.activos.filter(g=>dia(g.entrega)&&dia(g.entrega)<d.hoy);
      if(vencidos.length&&puede('pro'))tareas.push({t:'pro',que:'Hay '+vencidos.length+' pedido(s) con entrega vencida',det:'Revisa las fechas y acuerda la entrega con el cliente.',tono:'aviso'});
      if(puede('caj')&&!entrada.cajaAbierta)tareas.push({t:'caj',que:'La caja sigue cerrada',det:'Ábrela antes de registrar el primer cobro del día.'});
      for(const p of entrada.pendientes||[])if(puede(p.t)&&!tareas.some(x=>x.que===p.que))tareas.push(p);
      const fila=p=>'<div class="nvTask"><span class="nvSignal '+(p.tono==='aviso'?'nvWarn':'')+'">'+opciones.icono(p.t)+'</span><div><b>'+esc(p.que)+'</b><p>'+esc(p.det)+'</p></div>'+enlace(p.t,'Revisar →')+'</div>';
      q('#nvPendientes').innerHTML=tareas.length?tareas.slice(0,3).map(fila).join('')+(tareas.length>3?'<details class="nvMasPendientes"><summary>Ver '+(tareas.length-3)+' pendiente(s) más</summary>'+tareas.slice(3).map(fila).join('')+'</details>':''):'<div class="nvEmpty"><b>Todo en orden por ahora</b><p>Aquí aparecerán los pedidos y avisos que necesiten tu atención.</p>'+enlace('cot','Crear una cotización','nvBtn nvPrimary')+'</div>';
      q('#nvEntregas').innerHTML=d.proximos.length?d.proximos.map(g=>'<div class="nvDelivery"><div><b>'+esc(g.op.folio||g.folio)+'</b><small>'+esc(g.desc||g.cliente||'Pedido')+'</small></div><span class="'+(dia(g.entrega)<d.hoy?'nvLate':'')+'">'+esc(dia(g.entrega)===d.hoy?'Hoy':new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(new Date(dia(g.entrega)+'T12:00:00')))+(g.horaEntrega?' · '+esc(g.horaEntrega):'')+'</span><span class="nvStatus">'+esc(g.op.estatus||'Pendiente')+'</span>'+(puede('pro')?'<button type="button" class="nvLink" data-tbir="'+esc(g.folio)+'">Abrir →</button>':'')+'</div>').join(''):'<div class="nvEmpty">No hay entregas programadas.</div>';
      graficas();tema();contadores();
      opciones.despues?.();
    }
    function graficas(){
      const d=estado,importe=v=>d.finanzas?dinero(v):numero(v,1)+' trabajos';
      const max=Math.max(...d.serie,1),paso=d.finanzas?Math.max(1,Math.ceil(max/3/100)*100):Math.max(1,Math.ceil(max/3));
      const W=600,H=185,left=58,right=8,top=10,alto=140,slot=(W-left-right)/periodo,ancho=Math.min(42,slot*.58);
      let svg='<svg class="nvPlot" viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="nvSerieTitulo"><title id="nvSerieTitulo">'+(d.finanzas?'Cobros':'Entregas registradas')+' de los últimos '+periodo+' días</title><defs><linearGradient id="nvBarGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#49a6de"/><stop offset="1" stop-color="#4458a4"/></linearGradient></defs>';
      for(let i=0;i<4;i++){const y=top+alto-i*alto/3,v=paso*i;svg+='<line class="nvGridLine" x1="'+left+'" x2="'+(W-right)+'" y1="'+y+'" y2="'+y+'"/><text x="'+(left-8)+'" y="'+(y+3)+'" text-anchor="end">'+(d.finanzas?'$':'')+numero(v)+'</text>';}
      d.serie.forEach((v,i)=>{const x=left+slot*i+(slot-ancho)/2,h=v/(paso*3)*alto,f=d.actual[i],et=i===periodo-1?'Hoy':new Intl.DateTimeFormat('es-MX',{day:'numeric',month:periodo===7?undefined:'numeric',weekday:periodo===7?'short':undefined}).format(new Date(f+'T12:00:00'));
        svg+='<g class="nvBarGroup" tabindex="0" role="button" data-nvday="'+i+'" aria-label="'+esc(f+' · '+importe(v))+'"><title>'+esc(f+' · '+importe(v))+'</title><rect class="nvBar'+(i===periodo-1?' today':'')+'" x="'+x+'" y="'+(top+alto-h)+'" width="'+ancho+'" height="'+Math.max(0,h)+'" rx="3" style="animation-delay:'+i*.016+'s"/>'+(periodo===7||i%6===0||i===periodo-1?'<text x="'+(left+slot*(i+.5))+'" y="178" text-anchor="middle">'+esc(et)+'</text>':'')+'</g>';
      });svg+='</svg>';
      const delta=d.antes?(d.total-d.antes)/d.antes*100:null;
      q('#nvCobros').innerHTML='<header class="nvPanelHead"><div><h2>'+(d.finanzas?'Cobros por día':'Trabajos entregados')+'</h2><p>Últimos '+periodo+' días'+(d.finanzas?' · abonos y pagos recibidos':' · con entrega registrada')+'</p></div><div class="nvRange" aria-label="Periodo de la gráfica">'+[7,30].map(v=>'<button type="button" data-nvrange="'+v+'" aria-pressed="'+(v===periodo)+'">'+v+' días</button>').join('')+'</div></header><div class="nvChartFigures"><strong>'+importe(d.total)+'</strong><span class="nvTrend">'+(delta===null?'Sin cobros o entregas en el periodo anterior':(delta>=0?'+':'')+numero(delta,1)+'% frente al periodo anterior')+'</span></div>'+svg+'<p class="nvPlotHint" id="nvPlotHint" aria-live="polite">Toca una barra para ver el detalle.</p><div class="nvChartFoot"><span>Promedio diario <b>'+importe(d.total/periodo)+'</b></span><span><b>'+d.serie.filter(v=>v>0).length+'/'+periodo+'</b> días con actividad</span></div>';
      let offset=0,ring='<svg class="nvDonut" viewBox="0 0 150 150" role="img" aria-label="'+d.activos.length+' pedidos activos"><circle class="base" cx="75" cy="75" r="58"/>';
      d.estados.forEach(e=>{const p=d.activos.length?e.cantidad/d.activos.length*100:0;ring+='<circle class="segment" cx="75" cy="75" r="58" pathLength="100" stroke="'+e.color+'" stroke-dasharray="'+p+' '+(100-p)+'" stroke-dashoffset="'+(-offset)+'"/>';offset+=p;});
      ring+='<text class="centerNumber" x="75" y="73" text-anchor="middle">'+d.activos.length+'</text><text class="centerLabel" x="75" y="91" text-anchor="middle">pedidos activos</text></svg>';
      q('#nvPedidos').innerHTML='<header class="nvPanelHead"><div><h2>Estado de los pedidos</h2><p>Así se reparte el trabajo del taller</p></div></header><div class="nvDonutBody">'+ring+'<ul class="nvLegend">'+d.estados.map(e=>'<li><span class="nvDot" style="background:'+e.color+'"></span><span>'+e.nombre+'</span><b>'+e.cantidad+'</b></li>').join('')+'</ul></div><div class="nvStats"><div><span>'+(d.finanzas?'Cobro promedio de hoy':'Entregados hoy')+'</span><strong>'+(d.finanzas?(d.numeroCobros?dinero(d.cobrado/d.numeroCobros):'—'):d.terminados)+'</strong><small>'+(d.finanzas?d.numeroCobros+' pago(s) recibido(s)':'Con fecha real de entrega')+'</small></div><div><span>Entregas a tiempo</span><strong>'+(d.recientes?Math.round(d.puntuales/d.recientes*100)+'%':'—')+'</strong><small>'+(d.recientes?d.puntuales+' de '+d.recientes+' · últimos 30 días':'Sin fechas de entrega suficientes')+'</small></div></div>';
    }
    function detalle(i){if(!estado||i<0||i>=estado.serie.length)return;q('#nvPlotHint').textContent=estado.actual[i]+' · '+(estado.finanzas?dinero(estado.serie[i]):numero(estado.serie[i])+' trabajos entregados');}
    function contadores(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;q('#nvMetricas').querySelectorAll('[data-nvvalor]').forEach(el=>{const destino=n(el.dataset.nvvalor),texto=el.textContent,inicio=performance.now();function frame(t){if(!el.isConnected)return;const p=Math.min(1,(t-inicio)/600);el.textContent=p===1?texto:el.dataset.nvmoneda?dinero(destino*(1-(1-p)**3)):numero(Math.round(destino*(1-(1-p)**3)));if(p<1)requestAnimationFrame(frame);}requestAnimationFrame(frame);});}
    raiz.addEventListener('click',e=>{if(e.target.closest('#nvTema')){opciones.cambiaTema();tema();}const r=e.target.closest('[data-nvrange]');if(r){periodo=Number(r.dataset.nvrange)===30?30:7;estado=datos(opciones.lee(),periodo);graficas();q('[data-nvrange="'+periodo+'"]').focus();}const b=e.target.closest('[data-nvday]');if(b)detalle(Number(b.dataset.nvday));});
    for(const ev of ['focusin','pointerover'])raiz.addEventListener(ev,e=>{const b=e.target.closest('[data-nvday]');if(b)detalle(Number(b.dataset.nvday));});
    raiz.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-nvday]')){e.preventDefault();detalle(Number(e.target.dataset.nvday));}});
    return {render};
  }
  window.NuvoorTablero={crea,datos,tema,seguro,esc};
})();
