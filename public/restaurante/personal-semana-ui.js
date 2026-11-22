(function(){
 'use strict';
 const C=window.NuvoorSemana,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const TYPES={cambio:'Cambio de turno',descanso:'Día de descanso',cobertura:'Que me cubra un compañero',vacaciones:'Vacaciones',ausencia:'Ausencia con justificante',checada:'Corrección de checada'};
 const POSTS={gerencia:'Gerencia y caja',servicio:'Servicio',cocina:'Cocina'};
 const button=(text,attrs='',primary=false)=>'<button type="button" class="btn '+(primary?'primary':'')+'" '+attrs+'>'+text+'</button>';
 function crear(api){
  let state=null,date=C.monday(api.hoy()),sur='principal',busy=false,last='',resolved=false;
  const name=id=>state?.equipo.find(p=>p.id===id)?.nombre||'Sin cubrir';
  const person=()=>api.persona?.()||state?.persona;
  const manager=()=>!!api.gerente();
  const args=()=>({semana:date,sucursal:sur});
  async function run(action,data={}){
   if(busy)throw Error('Espera a que termine el cambio anterior.');busy=true;
   try{
    let r=await api.rpc(action,{...args(),...data});
    if(r?.confirmar){if(!confirm((r.avisos||[]).join('\n')+'\n\n¿'+(action==='publicar'?'Publicar':'Guardar')+' de todos modos?'))return null;r=await api.rpc(action,{...args(),...data,confirmar:true});}
    if(!r?.ok)throw Error(r?.error||'No se pudo completar.');state=r;last=JSON.stringify(r);render();api.cambio?.(r);if(action==='publicar')api.mensaje('Horario publicado. La nueva versión ya está disponible en Mi jornada.');return r;
   }finally{busy=false;}
  }
  function error(e){api.mensaje(e.message||'No se pudo conectar.');}
  async function load(){if(busy)return;try{const r=await api.rpc('leer',args());if(!r?.ok)throw Error(r?.error||'No se pudo cargar.');if(JSON.stringify(r)!==last){state=r;last=JSON.stringify(r);render();api.cambio?.(r);}}catch(e){if(!state){api.root.innerHTML='<p class="pfAviso" role="status">'+esc(e.missing?'Las nuevas funciones de Personal esperan SQL 39 en Lab → Base de datos. Los módulos actuales siguen disponibles.':e.message||'Personal no pudo conectar. Intenta actualizar.')+'</p>'+button('Volver a revisar','data-pf="refresh"');}}}
  function turns(){return state?.semana[manager()?'borrador':'publicado']||[];}
  function review(t=turns()){return C.review(t,state.equipo);}
  function impact(r){
   if(r.tipo==='checada')return 'Se corregirá en Asistencias, con registro de quién autorizó.';
   try{const next=C.apply(state.semana.borrador,r),info=review(next),blank=next.filter(t=>!t.persona).length;
    return (r.tipo==='cobertura'?name(r.companero)+' quedaría con '+(info.totals[r.companero]||0)+' h de '+(state.equipo.find(p=>p.id===r.companero)?.horasSemana||48)+' h. ':'')+blank+' turno(s) sin cubrir. '+(info.duplicates.length?'No se puede aprobar: una persona queda en dos turnos a la vez.':info.warnings.join(' '));
   }catch(e){return e.message;}
  }
  function requestCard(r){
   const waiting=r.estado==='Esperando al compañero',pending=r.estado==='Pendiente',mine=person();
   return '<article class="pfSolicitud"><div><b>'+esc(TYPES[r.tipo]||r.tipo)+' · '+esc(name(r.persona))+'</b><span class="pfEstado">'+esc(waiting?'Esperando a '+name(r.companero):r.estado)+'</span></div><p>'+esc(r.motivo||'Sin comentario')+'</p><small>'+esc(r.datos.fecha||r.datos.desde||'')+(r.datos.hasta?' al '+esc(r.datos.hasta):'')+(r.aceptada?' · '+esc(name(r.companero))+' aceptó':'')+'</small>'+
    (r.datos.justificante?'<p>Justificante: '+esc(r.datos.justificante)+'</p>':'')+
    (manager()?'<p>'+esc(impact({...r,aceptada:r.aceptada}))+'</p>':'')+
    '<div class="pfBotones">'+(manager()&&pending?button('Aprobar','data-pf="approve" data-id="'+esc(r.id)+'"',true)+button('Rechazar','data-pf="reject" data-id="'+esc(r.id)+'"'):'')+
    (!manager()&&waiting&&r.companero===mine?button('Acepto','data-pf="accept" data-id="'+esc(r.id)+'"',true)+button('No puedo','data-pf="decline" data-id="'+esc(r.id)+'"'):'')+'</div>'+
    (r.decidida?'<small>'+esc(r.decidida_por||'')+' · '+esc(new Date(r.decidida).toLocaleString('es-MX'))+'</small>':'')+'</article>';
  }
  function calendar(){
   const ts=turns(),info=review(ts),mine=person(),list=manager()?ts:ts.filter(t=>t.persona===mine);
   return '<div class="pfDias">'+Array.from({length:7},(_,i)=>{const f=C.add(date,i),ls=list.filter(t=>t.fecha===f);return '<div class="pfDia'+(f===api.hoy()?' hoy':'')+'"><h4>'+esc(new Date(f+'T12:00:00').toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'}))+'</h4>'+ (manager()?Object.keys(POSTS).map(post=>'<div class="pfPuesto"><small>'+POSTS[post]+'</small>'+ls.filter(t=>t.puesto===post).map(t=>shift(t,info)).join('')+button('+ Turno','data-pf="new" data-fecha="'+f+'" data-puesto="'+post+'"')+'</div>').join(''):ls.map(t=>shift(t,info)).join('')||'<p class="hint">Descanso</p>')+'</div>';}).join('')+'</div>';
  }
  function shift(t,info){const before=state.semana.publicado.find(x=>x.id===t.id),changed=manager()&&JSON.stringify(before)!==JSON.stringify(t),conflict=info.duplicates.some(x=>x.a===t.id||x.b===t.id);return '<button type="button" class="pfTurno'+(!t.persona?' vacante':'')+'" '+(manager()?'data-pf="edit" data-id="'+esc(t.id)+'"':'disabled')+'><b>'+esc(name(t.persona))+'</b><span>'+esc(t.entrada)+'–'+esc(t.salida)+'</span>'+(changed?'<small>Cambio sin publicar</small>':'')+(conflict?'<small>Conflicto: dos turnos</small>':'')+'</button>';}
  function render(){
   if(!state)return;const mgr=manager(),mine=person(),info=review(),s=state.semana;
   const requests=(state.solicitudes||[]).filter(r=>r.semana===date&&r.sucursal===sur).filter(r=>mgr?(resolved?!['Pendiente','Esperando al compañero'].includes(r.estado):['Pendiente','Esperando al compañero'].includes(r.estado)):(r.persona===mine||r.companero===mine));
   api.root.innerHTML='<div class="pfEncabezado"><div><h2>'+(mgr?'Turnos de la semana':'Mi jornada')+'</h2><p class="hint">'+(mgr?'Borrador · Publicado v'+s.version:'Horario publicado · versión '+s.version)+'</p></div><div class="pfBotones">'+button('‹','data-pf="prev" aria-label="Semana anterior"')+'<input type="date" id="pfSemana" aria-label="Semana" value="'+date+'">'+button('›','data-pf="next" aria-label="Semana siguiente"')+button('Actualizar','data-pf="refresh"')+'</div></div>'+
    (!mgr?'<section class="pfBloque"><h3>Mi checada</h3><p>La entrada y salida se registran únicamente en un aparato checador del negocio.</p>'+minePunches()+'</section>':'')+
    (mgr?'<div class="pfBotones">'+button('Llenar con el horario semanal','data-pf="pattern"')+button('Publicar y avisar','data-pf="publish"',true)+'</div><p>'+info.covered+' de '+info.total+' turnos cubiertos. '+esc(info.warnings.join(' '))+'</p>':'')+
    calendar()+
    (mgr?'<section class="pfBloque"><h3>Horas de la semana</h3><div class="pfHoras">'+state.equipo.filter(p=>p.activo).map(p=>'<span><b>'+esc(p.nombre)+'</b> '+(info.totals[p.id]||0)+' / '+(p.horasSemana??48)+' h'+((info.totals[p.id]||0)>(p.horasSemana??48)?' · Se pasa':'')+'</span>').join('')+'</div></section>':'<section class="pfBloque"><h3>Mi pre-nómina</h3>'+payroll()+'</section>')+
    '<section class="pfBloque"><div class="pfEncabezado"><h3>'+(mgr?'Solicitudes':'Mis solicitudes y coberturas')+'</h3><div class="pfBotones">'+(mgr?button(resolved?'Ver pendientes':'Ver resueltas','data-pf="resolved"'):'')+button(mgr?'Nueva solicitud':'Pedir un cambio','data-pf="request"')+'</div></div>'+ (requests.map(requestCard).join('')||'<p class="hint">No hay solicitudes para mostrar.</p>')+'</section>'+
    (mgr?'<details class="pfBloque"><summary>Historial de publicaciones</summary>'+s.historial.slice().reverse().map(h=>'<p>v'+h.version+' · '+esc(h.quien)+' · '+esc(new Date(h.cuando).toLocaleString('es-MX'))+'</p>').join('')+'</details>':'');
   api.extra?.(state,api.root);
  }
  function minePunches(){const xs=(state.checadas||[]).filter(c=>c.persona===person()).slice(-10);return xs.length?'<ul>'+xs.map(c=>'<li>'+esc(c.tipo)+' · '+esc(new Date(c.instante).toLocaleString('es-MX'))+'</li>').join('')+'</ul>':'<p class="hint">Todavía no hay checadas registradas en este periodo.</p>';}
  function payroll(){const p=(state.prenomina||[]).find(p=>p.persona===person());if(!p)return '<p class="hint">La pre-nómina del servidor está pendiente. Gerencia debe sincronizar el sueldo y cerrar las asistencias.</p>';const mx=x=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(x||0);return '<p><b>'+esc(p.horas)+' horas · '+esc(p.dias)+' de '+esc(p.programados)+' días programados · '+esc(p.retardos)+' retardos</b></p><p>Sueldo: '+mx(p.sueldo)+' · Propinas: '+mx(p.propinas)+'</p><p>'+esc(p.pendiente?'Pendiente de cerrar jornadas y revisar sueldo':mx(p.importe))+'</p><ul>'+(p.detalle||[]).map(d=>'<li>'+esc(new Date(d.entrada).toLocaleDateString('es-MX'))+' · '+esc(d.horas)+' h</li>').join('')+'</ul><p class="hint">Estimado del servidor, antes de otros ajustes. Revisa el detalle con gerencia.</p>';}
  function dialog(title,content,submit){
   const d=document.createElement('dialog');d.className='pfDialog';d.innerHTML='<form><header><h2>'+esc(title)+'</h2>'+button('×','data-close aria-label="Cerrar"')+'</header>'+content+'<p role="status" class="pfError"></p><footer>'+button('Cancelar','data-close')+'<button class="btn primary" type="submit">Guardar</button></footer></form>';document.body.append(d);
   d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());d.addEventListener('close',()=>d.remove());
   d.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;try{if(await submit(new FormData(e.target),d)!==false)d.close();}catch(e){d.querySelector('.pfError').textContent=e.message;}finally{b.disabled=false;}};d.showModal();return d;
  }
  function edit(t){
   const revision=state.semana.revision,original=C.clone(turns());
   const current=t||{id:crypto.randomUUID(),fecha:date,puesto:'servicio',persona:'',entrada:'12:00',salida:'18:00'};
   const content='<label>Fecha<input required type="date" name="fecha" min="'+date+'" max="'+C.add(date,6)+'" value="'+esc(current.fecha)+'"></label><label>Puesto<select name="puesto">'+Object.entries(POSTS).map(([k,v])=>'<option value="'+k+'"'+(k===current.puesto?' selected':'')+'>'+v+'</option>').join('')+'</select></label><label>Persona<select name="persona"></select></label><div class="pfBotones"><label>Entrada<input type="time" name="entrada" required value="'+esc(current.entrada)+'"></label><label>Salida<input type="time" name="salida" required value="'+esc(current.salida)+'"></label></div>'+(t?button('Eliminar turno','data-delete'):'');
   const d=dialog(t?'Editar turno':'Agregar turno',content,async fd=>{
    const n={id:current.id,...Object.fromEntries(fd)},all=original.filter(t=>t.id!==current.id).concat(n),r=review(all);
    if(r.duplicates.length)throw Error('Esta persona ya tiene otro turno a la misma hora.');
    const result=await run('borrador',{revision,turnos:all});return !!result;
   });
   const select=d.querySelector('[name=persona]'),postSelect=d.querySelector('[name=puesto]');
   function people(){select.innerHTML='<option value="">Sin cubrir</option>'+state.equipo.filter(p=>p.activo&&C.post(p.rol)===postSelect.value).map(p=>'<option value="'+esc(p.id)+'"'+(p.id===current.persona?' selected':'')+'>'+esc(p.nombre)+' · '+(review().totals[p.id]||0)+' / '+p.horasSemana+' h</option>').join('');}
   postSelect.onchange=people;people();
   d.querySelector('[data-delete]')?.addEventListener('click',async()=>{try{await run('borrador',{revision,turnos:original.filter(x=>x.id!==t.id)});d.close();}catch(e){error(e);}});
  }
  function request(){
   const mine=person(),me=state.equipo.find(p=>p.id===mine),allowed=manager()?Object.entries(TYPES):Object.entries(TYPES).filter(([k])=>['cambio','descanso','cobertura','vacaciones'].includes(k));
   const d=dialog('Pedir un cambio','<label>Persona<select name="persona">'+(manager()?state.equipo.filter(p=>p.activo):[me].filter(Boolean)).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nombre)+'</option>').join('')+'</select></label><label>Solicitud<select name="tipo">'+allowed.map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label>Día con turno<select name="fecha"></select></label><label data-pf-hasta hidden>Hasta (misma semana)<input name="hasta" type="date" min="'+date+'" max="'+C.add(date,6)+'"></label><div data-pf-horas><label>Entrada<input name="entrada" type="time" value="12:00"></label><label>Salida<input name="salida" type="time" value="18:00"></label></div><label data-pf-comp hidden>Compañero<select name="companero"></select></label><label data-pf-just hidden>Justificante (descripción o referencia)<textarea name="justificante" maxlength="2000"></textarea></label><label>Motivo<textarea name="motivo" maxlength="2000" required></textarea></label>',async fd=>{
    const v=Object.fromEntries(fd),datos={fecha:v.fecha};
    if(v.tipo==='cambio'||v.tipo==='checada')Object.assign(datos,{entrada:v.entrada,salida:v.salida});
    if(v.tipo==='vacaciones')Object.assign(datos,{desde:v.fecha,hasta:v.hasta||v.fecha});
    if(v.tipo==='cobertura')datos.companero=v.companero;
    if(v.tipo==='ausencia')datos.justificante=v.justificante;
    if(!v.fecha)throw Error('Selecciona un día con turno.');
    return !!await run('solicitar',{persona:v.persona,tipo:v.tipo,datos,motivo:v.motivo});
   });
   function fields(){
    const f=d.querySelector('form'),tipo=f.elements.tipo.value,who=f.elements.persona.value;
    d.querySelector('[data-pf-hasta]').hidden=tipo!=='vacaciones';d.querySelector('[data-pf-horas]').hidden=!['cambio','checada'].includes(tipo);d.querySelector('[data-pf-comp]').hidden=tipo!=='cobertura';d.querySelector('[data-pf-just]').hidden=tipo!=='ausencia';
    const prev=f.elements.fecha.value,ts=state.semana.publicado.filter(t=>t.persona===who&&(tipo==='checada'||t.fecha>=api.hoy()));
    f.elements.fecha.innerHTML=[...new Set(ts.map(t=>t.fecha))].map(x=>'<option>'+x+'</option>').join('');if([...f.elements.fecha.options].some(x=>x.value===prev))f.elements.fecha.value=prev;
    const owner=state.equipo.find(p=>p.id===who),shift=ts.find(t=>t.fecha===f.elements.fecha.value),totals=C.review(state.semana.publicado,state.equipo).totals;
    f.elements.companero.innerHTML=state.equipo.filter(p=>p.activo&&p.id!==who&&C.post(p.rol)===C.post(owner?.rol)).map(p=>{const clash=shift&&state.semana.publicado.some(t=>t.persona===p.id&&C.overlap(t,shift));return '<option value="'+esc(p.id)+'"'+(clash?' disabled':'')+'>'+esc(p.nombre)+' · '+((totals[p.id]||0)+(shift?C.hours(shift):0))+' / '+p.horasSemana+' h'+(clash?' · ya trabaja':'')+'</option>';}).join('');
   }
   d.querySelector('[name=tipo]').onchange=fields;d.querySelector('[name=persona]').onchange=fields;d.querySelector('[name=fecha]').onchange=fields;fields();
  }
  async function pattern(){
   if(turns().length&&!confirm('¿Reemplazar el borrador con el horario semanal? Lo publicado se conserva.'))return;
   const ts=[];for(const p of state.equipo.filter(p=>p.activo)){const cloud=state.perfiles.find(x=>x.persona===p.id)?.horario,pat=cloud&&Object.keys(cloud).length?cloud:api.horario?.(p.id)||{};for(let i=0;i<7;i++){const h=pat[['lun','mar','mie','jue','vie','sab','dom'][i]];if(h&&!h.libre&&h.e&&h.s)ts.push({id:crypto.randomUUID(),fecha:C.add(date,i),puesto:C.post(p.rol),persona:p.id,entrada:h.e,salida:h.s});}}
   if(!ts.length)throw Error('Primero configura el horario semanal en el expediente.');
   for(let i=0;i<7;i++)for(const puesto of Object.keys(POSTS))if(!ts.some(t=>t.fecha===C.add(date,i)&&t.puesto===puesto))ts.push({id:crypto.randomUUID(),fecha:C.add(date,i),puesto,persona:'',entrada:puesto==='gerencia'?'09:00':'12:00',salida:puesto==='gerencia'?'17:00':'18:00'});
   await run('borrador',{revision:state.semana.revision,turnos:ts});
  }
  api.root.addEventListener('click',e=>{const b=e.target.closest('[data-pf]');if(!b)return;(async()=>{
   const action=b.dataset.pf,id=b.dataset.id;
   if(action==='refresh')return load();if(!state)return;
   if(action==='prev'||action==='next'){date=C.add(date,action==='prev'?-7:7);last='';return load();}
   if(action==='new')return edit({id:crypto.randomUUID(),fecha:b.dataset.fecha,puesto:b.dataset.puesto,persona:'',entrada:'12:00',salida:'18:00'});
   if(action==='edit')return edit(turns().find(t=>t.id===id));
   if(action==='pattern')return pattern();
   if(action==='publish')return run('publicar',{revision:state.semana.revision});
   if(action==='request')return request();
   if(action==='resolved'){resolved=!resolved;return render();}
   if(action==='approve'||action==='reject')return run('resolver',{id,aprobar:action==='approve'});
   if(action==='accept'||action==='decline')return run('aceptar',{id,acepto:action==='accept'});
  })().catch(error);});
  api.root.addEventListener('change',e=>{if(e.target.id==='pfSemana'&&e.target.value){date=C.monday(e.target.value);last='';load();}});
  return {load,render,run,get:()=>state,impact,requestCard,args};
 }
 window.NuvoorSemanaUI={crear};
})();
