(function(){
  'use strict';
  const DAYS=[['lun','Lunes'],['mar','Martes'],['mie','Miércoles'],['jue','Jueves'],['vie','Viernes'],['sab','Sábado'],['dom','Domingo']];
  const TABS=['resumen','equipo','asistencias','horarios','prenomina','sucursales'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  function crear(api){
    const root=api.root;if(!root)return null;
    const $=s=>root.querySelector(s),$$=s=>Array.from(root.querySelectorAll(s));
    const esc=api.escapar,mx=api.dinero;
    const expediente=document.getElementById('modalExp');
    if(expediente){
      expediente.className='personalInlineExp';
      const surface=expediente.querySelector(':scope > .card');if(surface)surface.className='personalBlock';
      $('#personalPanel_equipo').append(expediente);
      expediente.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();document.getElementById('expCerrar').click();}});
    }
    let selected='resumen',roleKey='',dragging=null,touch=null;
    function manager(){return !!api.gerente()}
    function elegir(tab,focus=false){
      if(!TABS.includes(tab))return;
      if(!manager()&&tab!=='asistencias')tab='asistencias';
      selected=tab;
      $$('[data-personal-tab]').forEach(b=>{const active=b.dataset.personalTab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});
      TABS.forEach(k=>$('#personalPanel_'+k).hidden=k!==tab);
      if(focus)$('#personalTab_'+tab).focus();
      if(manager())pintar(tab);
    }
    function aplicaRol(){
      const admin=manager(),u=api.usuario(),key=String(u.id)+'/'+u.rol+'/'+api.contexto();
      $$('[data-personal-admin]').forEach(b=>b.hidden=!admin);
      root.querySelectorAll('[data-save-config="personal"],#userNuevo').forEach(b=>b.hidden=!admin);
      if(key!==roleKey){roleKey=key;selected=admin?'resumen':'asistencias';cancelTouch();dragging=null}
      if(!admin){['#personalResumenStats','#personalCostoComparado','#personalEquipoHoy','#personalPrenomina','#personalSucursalActual','#personalSemana','#expLista','#t_equipo','#recResumen','#recQuien','#t_retardos'].forEach(s=>$(s).replaceChildren());if(expediente){expediente.hidden=true;document.getElementById('expCuerpo').replaceChildren();}}
      elegir(selected);
    }
    function dates(prefix='personal'){
      const d=$('#'+prefix+'Desde'),h=$('#'+prefix+'Hasta');
      if(!d.value)d.value=api.hoy();if(!h.value)h.value=api.hoy();
      return {desde:d.value,hasta:h.value,ok:!!d.value&&!!h.value&&d.value<=h.value};
    }
    function periodo(kind){
      const f=api.hoy(),d=new Date(f+'T12:00:00');
      if(kind==='semana')d.setDate(d.getDate()-((d.getDay()+6)%7));
      if(kind==='mes')d.setDate(1);
      $('#personalDesde').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');$('#personalHasta').value=f;
      resumen();
    }
    function labor(desde,hasta){
      let total=0,minutos=0,abiertas=0,sinSueldo=0,registros=0;
      const filas=[];
      for(const u of api.equipo().filter(u=>u.activo!==false)){
        const eventos=api.asistencias().filter(a=>a.uid===u.id&&a.fecha>=desde&&a.fecha<=hasta),fechas=[...new Set(eventos.map(a=>a.fecha))];
        let min=0,dias=0,open=0;
        for(const f of fechas){const turnos=api.turnos(u.id,f),closed=turnos.filter(t=>t.salida);open+=turnos.filter(t=>!t.salida).length;min+=api.minutos(u.id,f);if(closed.length&&turnos.every(t=>t.salida))dias++;}
        const pago=api.pago(u),tarifa=Number(pago.monto)||0,divisor=({dia:1,dosdias:2,semana:7,quincena:15,mes:30})[pago.forma]||7;
        const pendiente=tarifa<=0&&fechas.length>0,importe=tarifa>0?(pago.forma==='hora'?min/60*tarifa:dias/divisor*tarifa):null;
        total+=importe||0;minutos+=min;abiertas+=open;sinSueldo+=pendiente?1:0;registros+=eventos.length;
        filas.push({u,min,dias,open,importe,tarifa,pendiente});
      }
      return {total,minutos,abiertas,sinSueldo,registros,filas,pendiente:abiertas>0||sinSueldo>0};
    }
    function resumen(){
      if(!manager())return;
      const r=dates();if(!r.ok){$('#personalResumenStats').innerHTML='<p class="personalInlineEmpty">Revisa el rango de fechas.</p>';$('#personalCostoComparado').replaceChildren();return;}
      const ventas=api.ventas(r.desde,r.hasta),l=labor(r.desde,r.hasta),sinAsistencias=ventas.venta>0&&!l.registros,pendiente=l.pendiente||sinAsistencias;
      const ventaNeta=ventas.venta-ventas.iva,ganancia=ventas.utilidad-l.total;
      const metrics=[['Venta neta',mx(ventaNeta),'Sin IVA ni propinas'],['Costo del personal',pendiente?'Pendiente':mx(l.total),l.sinSueldo?'Falta sueldo en '+l.sinSueldo+' perfil(es)':l.abiertas?'Hay jornadas abiertas':sinAsistencias?'Faltan asistencias del periodo':'Estimado con jornadas cerradas'],['Horas registradas',api.horas(l.minutos),l.abiertas?l.abiertas+' jornada(s) abierta(s)':'Asistencias cerradas'],['Margen estimado',pendiente||ventas.pendiente?'Pendiente':mx(ganancia),'Antes de renta y gastos fijos']];
      $('#personalResumenStats').innerHTML=metrics.map(([a,b,c])=>'<div class="personalHubMetric"><small>'+esc(a)+'</small><strong>'+esc(b)+'</strong><span>'+esc(c)+'</span></div>').join('');
      const ratio=ventaNeta>0?l.total/ventaNeta*100:null;
      $('#personalCostoComparado').innerHTML=pendiente?'<p class="personalInlineEmpty">Completa las asistencias y los sueldos para comparar el costo con las ventas.</p>':ratio===null?'<p class="personalInlineEmpty">Todavía no hay venta neta en este periodo.</p>':'<div class="personalBudgetNumber">'+ratio.toLocaleString('es-MX',{maximumFractionDigits:1})+'%</div><span class="hint">de la venta neta corresponde al costo del personal</span><div class="personalBudgetTrack"><i style="width:'+Math.min(100,Math.max(0,ratio))+'%"></i></div><div class="personalBudgetCaption"><span>'+esc(mx(l.total))+' de personal</span><span>'+esc(mx(ventaNeta))+' de venta neta</span></div>';
      $('#personalEquipoHoy').innerHTML=api.equipo().filter(u=>u.activo!==false).map(u=>'<div class="personalHubPerson"><span class="av">'+esc((u.nombre||'?').charAt(0))+'</span><span><b>'+esc(u.nombre||'Sin nombre')+'</b><small>'+esc(u.rol||'')+'</small></span><span class="pill '+(api.dentro(u.id)?'good':'')+'">'+(api.dentro(u.id)?'Dentro':'Fuera')+'</span></div>').join('')||'<p class="personalInlineEmpty">Agrega al equipo para comenzar.</p>';
      $('#personalResumenOrigen').textContent='Las ventas usan los tickets cobrados del contexto actual y excluyen cuentas canceladas. El costo del personal se estima con los sueldos y asistencias guardados en este aparato. Las jornadas abiertas no se consideran completas.';
    }
    function prenomina(){
      if(!manager())return;
      const r=dates('personalPago');if(!r.ok){$('#personalPrenomina').innerHTML='<tbody><tr><td>Revisa el rango de fechas.</td></tr></tbody>';return;}
      const l=labor(r.desde,r.hasta);
      $('#personalPrenomina').innerHTML='<thead><tr><th>Persona</th><th class="der">Días cerrados</th><th class="der">Horas</th><th class="der">Estimado</th><th>Revisión</th></tr></thead><tbody>'+l.filas.map(x=>'<tr><td><button type="button" class="btn sm ghost" data-personal-recibo="'+esc(x.u.id)+'">'+esc(x.u.nombre||'Sin nombre')+'</button></td><td class="der">'+x.dias+'</td><td class="der">'+esc(api.horas(x.min))+'</td><td class="der">'+(x.tarifa>0?esc(mx(x.importe)):'Sin sueldo configurado')+'</td><td>'+esc(x.open?'Jornada abierta':x.pendiente?'Revisar sueldo':'Jornadas cerradas')+'</td></tr>').join('')+'<tr><td><b>Total estimado</b></td><td></td><td class="der">'+esc(api.horas(l.minutos))+'</td><td class="der">'+esc(mx(l.total))+'</td><td>'+(l.pendiente?'Pendiente de completar':'Revisar antes de pagar')+'</td></tr></tbody>';
    }
    function semana(){
      if(!manager())return;
      const equipo=api.equipo().filter(u=>u.activo!==false);
      $('#personalSemana').innerHTML=DAYS.map(([key,label])=>'<div class="personalDay" data-personal-dia="'+key+'"><strong>'+label+'</strong>'+equipo.map(u=>{const h=api.horario(u)[key];return !h||h.libre||!h.e||!h.s?'':'<div class="personalShift" draggable="true" data-personal-persona="'+esc(u.id)+'" data-personal-origen="'+key+'"><button type="button" class="personalShiftGrip" aria-label="Mover turno de '+esc(u.nombre)+'" data-personal-grip>⠿</button><b>'+esc(u.nombre||'Sin nombre')+'</b><span>'+esc(h.e)+'–'+esc(h.s)+'</span><small>'+esc(u.rol||'')+'</small></div>'}).join('')+'</div>').join('');
      const select=$('#personalMoverPersona'),before=select.value;
      select.innerHTML=equipo.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nombre||'Sin nombre')+'</option>').join('');
      if(equipo.some(u=>u.id===before))select.value=before;
      ['personalMoverOrigen','personalMoverDestino'].forEach(id=>{const s=$('#'+id);if(!s.options.length)s.innerHTML=DAYS.map(([k,n])=>'<option value="'+k+'">'+n+'</option>').join('')});
    }
    function mover(id,origen,destino){
      if(!manager()||origen===destino||!DAYS.some(d=>d[0]===origen)||!DAYS.some(d=>d[0]===destino))return;
      const u=api.equipo().find(u=>u.id===id&&u.activo!==false);if(!u)return;
      const h=api.horario(u),source=h[origen];if(!source||source.libre||!source.e||!source.s){api.mensaje('Ese día no tiene turno. Configúralo en su expediente.');return;}
      const target=h[destino];h[destino]=clone(source);h[origen]=target&&!target.libre?clone(target):{e:'',s:'',libre:true};
      api.guardar();api.renderActual();api.mensaje('Horario semanal actualizado. Guarda los cambios al terminar.');
    }
    function sucursales(){
      if(!manager())return;
      $('#personalSucursalActual').innerHTML='<h3>'+esc(api.nombre())+'</h3><p class="hint">'+esc(api.contexto()?'Punto móvil: '+api.contexto():'Restaurante principal')+'</p><p>Los datos de esta tarjeta corresponden únicamente a este negocio y al contexto seleccionado.</p><p class="note">La comparación consolidada estará disponible cuando las sucursales estén vinculadas a la misma licencia. Los negocios independientes conservan su información separada.</p>';
    }
    function pintar(tab){if(tab==='resumen')resumen();if(tab==='horarios')semana();if(tab==='prenomina')prenomina();if(tab==='sucursales')sucursales()}
    function render(){aplicaRol()}
    function cancelTouch(){if(!touch)return;clearTimeout(touch.timer);touch.ghost?.remove();touch.element?.classList.remove('moving');touch=null;$$('.personalDay.over').forEach(n=>n.classList.remove('over'))}
    root.addEventListener('click',e=>{
      const tab=e.target.closest('[data-personal-tab]');if(tab){elegir(tab.dataset.personalTab);return;}
      const go=e.target.closest('[data-personal-go]');if(go){elegir(go.dataset.personalGo);return;}
      const period=e.target.closest('[data-personal-periodo]');if(period&&manager()){periodo(period.dataset.personalPeriodo);return;}
      if(e.target.closest('#personalMoverOk')){mover($('#personalMoverPersona').value,$('#personalMoverOrigen').value,$('#personalMoverDestino').value);return;}
      if(e.target.closest('#personalEditarHorario')&&manager()){api.abrirExpediente($('#personalMoverPersona').value);return;}
      const recibo=e.target.closest('[data-personal-recibo]');if(recibo&&manager()){const r=dates('personalPago');const event=new Event('change',{bubbles:true});root.querySelector('#recQuien').value=recibo.dataset.personalRecibo;root.querySelector('#recDesde').value=r.desde;root.querySelector('#recHasta').value=r.hasta;root.querySelector('#recQuien').dispatchEvent(event);root.querySelector('#cardRecibos').scrollIntoView({block:'nearest',behavior:'smooth'});}
    });
    root.addEventListener('keydown',e=>{const current=e.target.closest('[data-personal-tab]');if(!current)return;const visible=$$('[data-personal-tab]').filter(b=>!b.hidden);const i=visible.indexOf(current);let target;if(e.key==='ArrowRight')target=visible[(i+1)%visible.length];if(e.key==='ArrowLeft')target=visible[(i+visible.length-1)%visible.length];if(e.key==='Home')target=visible[0];if(e.key==='End')target=visible[visible.length-1];if(target){e.preventDefault();elegir(target.dataset.personalTab,true)}});
    root.addEventListener('change',e=>{if(['personalDesde','personalHasta'].includes(e.target.id)&&manager())resumen();if(['personalPagoDesde','personalPagoHasta'].includes(e.target.id)&&manager())prenomina()});
    root.addEventListener('dragstart',e=>{const card=e.target.closest('.personalShift');if(!card||!manager()){e.preventDefault();return;}dragging={id:card.dataset.personalPersona,day:card.dataset.personalOrigen};e.dataTransfer.setData('text/plain','nuvoor-horario');e.dataTransfer.effectAllowed='move';card.classList.add('moving')});
    root.addEventListener('dragover',e=>{const day=e.target.closest('[data-personal-dia]');if(day&&dragging&&manager()){e.preventDefault();day.classList.add('over')}});
    root.addEventListener('dragleave',e=>e.target.closest('[data-personal-dia]')?.classList.remove('over'));
    root.addEventListener('drop',e=>{const day=e.target.closest('[data-personal-dia]'),move=dragging;dragging=null;if(day&&move){e.preventDefault();mover(move.id,move.day,day.dataset.personalDia)}$$('.moving,.over').forEach(n=>n.classList.remove('moving','over'))});
    root.addEventListener('dragend',()=>{dragging=null;$$('.moving,.over').forEach(n=>n.classList.remove('moving','over'))});
    root.addEventListener('pointerdown',e=>{const grip=e.target.closest('[data-personal-grip]');if(!grip||e.pointerType==='mouse'||!manager())return;cancelTouch();const element=grip.closest('.personalShift');touch={element,id:element.dataset.personalPersona,day:element.dataset.personalOrigen,x:e.clientX,y:e.clientY,active:false};const t=touch;grip.setPointerCapture(e.pointerId);t.timer=setTimeout(()=>{if(t!==touch||!manager())return;t.active=true;t.ghost=element.cloneNode(true);t.ghost.classList.add('personalShiftGhost');t.ghost.setAttribute('aria-hidden','true');document.body.append(t.ghost);element.classList.add('moving');t.ghost.style.left=(t.x-40)+'px';t.ghost.style.top=(t.y-20)+'px'},250)});
    root.addEventListener('pointermove',e=>{if(!touch)return;if(!touch.active&&Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>9){cancelTouch();return;}if(!touch.active)return;touch.ghost.style.left=(e.clientX-40)+'px';touch.ghost.style.top=(e.clientY-20)+'px';const day=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-personal-dia]');$$('.personalDay.over').forEach(n=>n.classList.remove('over'));if(day&&root.contains(day))day.classList.add('over')});
    root.addEventListener('pointerup',e=>{if(!touch)return;const t=touch,day=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-personal-dia]');cancelTouch();if(t.active&&day&&root.contains(day))mover(t.id,t.day,day.dataset.personalDia)});
    root.addEventListener('pointercancel',cancelTouch);
    return {render,aplicaRol,elegir,labor};
  }
  window.NuvoorRestaurantPersonal={crear};
})();
