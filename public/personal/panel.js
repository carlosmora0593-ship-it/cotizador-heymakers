/* Adaptadores de Imprenta y Store. La base confirma los permisos y las checadas. */
(function(){
  'use strict';
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tabs={resumen:'Resumen',equipo:'Equipo y acceso',asistencias:'Asistencias',horarios:'Horarios',prenomina:'Prenómina',sucursales:'Sucursales'};
  const zone='America/Mexico_City';
  const currency=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'});
  const date=format=>new Intl.DateTimeFormat('es-MX',{timeZone:zone,...format});
  function hoy(){
    const parts=date({year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    return ['year','month','day'].map(type=>parts.find(x=>x.type===type).value).join('-');
  }
  function stored(storage,key,make){
    try{
      const current=storage.getItem(key);
      if(current)return current;
      const next=make();
      storage.setItem(key,next);
      return next;
    }catch(_){return make();}
  }
  function records(headers,rows){
    if(!rows.length)return '<p class="npHint">Todavía no hay registros para esta semana.</p>';
    return '<div class="npTable"><table><thead><tr>'+headers.map(x=>'<th scope="col">'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function crear(api){
    const root=api.root;
    const config=NuvoorSemana.producto(api.producto);
    let token=null,controller=null,activacion=null,capacidad=null,schedule=null,activity=null,editor=null,lastLoad=0,lastState=null,timer=null,epoch=0,currentTab='resumen';
    let status,invitation,buttons,panels,gerenteServidor=false;
    const namespace=()=>[api.usuario(),api.cuenta()].join('_');
    const scope=()=>!!(token&&api.cuenta()&&api.usuario()&&token.llave===namespace());
    const current=()=>scope()?capacidad:null;
    const active=()=>!!current();
    const admin=()=>Boolean(api.admin()&&gerenteServidor);
    const permMissing=e=>['PGRST202','42883'].includes(e?.code);
    function notify(message){
      if(status)status.textContent=message;
      api.notifica?.(message);
    }
    async function call(client,name,args){
      let r;
      try{r=await client.rpc(name,args);}
      catch(error){error.sinConexion=error instanceof TypeError;throw error;}
      if(r.error){
        const e=Error(r.error.message||'No se pudo conectar con Personal.');
        e.missing=permMissing(r.error);
        e.sinConexion=!r.error.code||r.error.code==='PGRST000'||r.error.code==='PGRST001';
        throw e;
      }
      return r.data;
    }
    async function rpc(accion,datos={},name='rest_personal_fase1'){
      if(!scope())throw Error('La sesión cambió. Abre Personal de nuevo.');
      const use=token,generation=epoch;
      const r=await call(api.client(),name,{p_cuenta:use.cuenta,p_aparato:use.aparato,p_accion:accion,p_datos:{terminal:use.terminal,...datos}});
      if(token!==use||!scope()||epoch!==generation)throw Error('La sesión del negocio cambió.');
      if(name==='rest_personal_fase1'&&r?.semana)gerenteServidor=r.gerente===true;
      if(r&&typeof r.sinPin==='boolean'&&capacidad)capacidad.sinPin=r.sinPin;
      return r;
    }
    function limpiar(){
      epoch++;api.restaurarLegado?.();
      clearInterval(timer);controller?.abort();editor?.close();
      gerenteServidor=false;lastLoad=0;lastState=null;controller=null;schedule=null;activity=null;invitation=null;status=null;
      root.replaceChildren();
    }
    function reset(){
      limpiar();
      token=null;capacidad=null;activacion=null;
      root.hidden=true;api.alternar?.(false);
    }
    async function activar({actualizar=false}={}){
      const client=api.client(),cuenta=api.cuenta(),usuario=api.usuario();
      if(!client||!cuenta||!usuario){if(token)reset();return false;}
      const llave=namespace();
      if(token?.llave!==llave){
        reset();
        const aparato=stored(localStorage,'nuvoor_personal_device_'+llave,()=>crypto.randomUUID());
        const claveTerminal=stored(localStorage,'nuvoor_personal_terminal_'+llave,()=>crypto.randomUUID());
        token={cuenta,usuario,llave,aparato,terminal:claveTerminal,comprobado:false};
      }
      const use=token;
      if(activacion)return activacion;
      if(use.comprobado&&!actualizar)return active();
      const pending=(async()=>{
        try{
          const disponible=await call(client,'nuvoor_personal_disponible',{p_cuenta:cuenta});
          if(token!==use||!scope())return false;
          if(disponible!==true){use.comprobado=true;return false;}
          const preparado=(api.puedeChecar||api.admin)()?await call(client,'nuvoor_personal_preparar',{p_cuenta:cuenta,p_aparato:use.aparato}):{ok:true};
          if(token!==use||!scope()||preparado?.ok!==true)return false;
          use.comprobado=true;
          capacidad=preparado;
          root.hidden=false;
          api.alternar?.(true);
          return true;
        }catch(e){
          if(token===use&&e.missing)use.comprobado=true;
          return active();
        }
      })();
      activacion=pending;
      try{return await pending;}finally{if(activacion===pending)activacion=null;}
    }
    function statusFor(el,text){el.textContent=text;}
    function mount(){
      const signals=new AbortController();controller=signals;
      root.classList.add('npPersonal','personalHub');
      root.innerHTML='<header class="personalHubHeader"><div><div class="personalHubEyebrow" data-np-negocio></div><h1>Personal</h1><p>Equipo, horarios y asistencias del negocio.</p></div><div class="personalHubActions"><a class="btn" data-np-jornada>Mi jornada</a><button class="btn primary" type="button" data-np="abrirPuerta" hidden>Abrir checador</button></div></header>'+
        '<div class="personalHubTabs" role="tablist" aria-label="Secciones de Personal">'+Object.entries(tabs).map(([id,name])=>'<button role="tab" type="button" id="np-tab-'+id+'" aria-selected="false" aria-controls="np-'+id+'" data-np-tab="'+id+'">'+name+'</button>').join('')+'</div>'+
        Object.keys(tabs).map(id=>'<section class="personalHubPanel" role="tabpanel" id="np-'+id+'" aria-labelledby="np-tab-'+id+'" hidden><div data-np-content></div></section>').join('')+
        '<p class="personalHubFooter" role="status"></p>';
      buttons=[...root.querySelectorAll('[data-np-tab]')];
      panels=[...root.querySelectorAll('[role=tabpanel]')];
      status=root.querySelector('[role=status]');
      root.querySelector('[data-np-negocio]').textContent=api.negocio?.()||'';
      const link=root.querySelector('[data-np-jornada]');
      link.href='/restaurante/jornada.html?cuenta='+encodeURIComponent(token.cuenta);
      link.addEventListener('click',()=>sessionStorage.setItem('nuvoor_jornada_aparato_'+token.cuenta,token.aparato));
      const actions={args:()=>schedule.args(),hoy,equipo:()=>lastState?.equipo||[],gerente:admin,producto:api.producto,mensaje:notify,client:api.client,rpc:(a,d)=>rpc(a,{...d,solo_mio:!admin()},'rest_actividades_rpc')};
      activity=NuvoorActividades.crear(actions);
      schedule=NuvoorSemanaUI.crear({
        root:root.querySelector('#np-horarios'),producto:api.producto,hoy,gerente:admin,
        mensaje:notify,rpc,cambio:paint,extra:(_s,el)=>activity.mount(el)
      });
      root.addEventListener('click',click,{signal:signals.signal});
      root.addEventListener('keydown',key,{signal:signals.signal});
      currentTab='resumen';select(currentTab);
      timer=setInterval(()=>{
        if(document.hidden||!active()||!api.visible()||editor?.open||document.querySelector('dialog[open]'))return;
        mostrar({forzar:true});
      },30000);
    }
    function btn(action,text,id=''){
      return '<button class="btn" type="button" data-np="'+action+'" data-np-persona="'+safe(id)+'">'+text+'</button>';
    }
    function select(id,focus=false){
      if(id==='equipo'&&!admin())id='resumen';
      currentTab=id;
      for(const b of buttons){
        const on=b.dataset.npTab===id;
        b.tabIndex=on?0:-1;b.setAttribute('aria-selected',String(on));
        if(on&&focus)b.focus();
      }
      for(const el of panels)el.hidden=el.id!=='np-'+id;
      if(id==='equipo'&&admin()&&invitation?.childElementCount===0)loadInvitations();
      if(id==='horarios')activity?.load();
      api.mostrarLegado?.(id,admin());
    }
    function paint(state){
      if(!scope()||!controller||!state?.ok)return;
      lastState=state;
      status.textContent='';
      for(const b of buttons)b.hidden=b.dataset.npTab==='equipo'&&!admin();
      if(currentTab==='equipo'&&!admin())select('resumen');
      const door=root.querySelector('[data-np=abrirPuerta]');
      door.hidden=!(api.abrirPuerta&&(api.puedeChecar||api.admin)()&&state.terminal);
      api.mostrarLegado?.(currentTab,admin());
      const people=state.equipo||[],attendance=state.checadas||[],period=schedule.args().semana;
      const time=date({day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      const name=id=>safe(people.find(p=>p.id===id)?.nombre||'Perfil anterior');
      const role=p=>safe(config.puestos[config.rolPuesto(p.rol)]||p.rol);
      const present=new Map(attendance.map(x=>[x.persona,x.tipo]));
      const pending=(state.solicitudes||[]).filter(x=>['Pendiente','Esperando al compañero'].includes(x.estado)).length;
      const metrics=[['Personas activas',people.filter(p=>p.activo).length],['En turno',[...present.values()].filter(x=>x==='entrada').length],['Turnos publicados',state.semana.publicado.length],['Solicitudes',pending]];
      root.querySelector('#np-resumen > [data-np-content]').innerHTML='<div class="personalHubStats">'+metrics.map(([label,n])=>'<div class="personalHubMetric"><small>'+label+'</small><strong>'+n+'</strong></div>').join('')+'</div><section class="npBlock"><h2>Turnos y cobertura</h2><p class="npHint">Versión publicada '+state.semana.version+' · Semana del '+safe(period.split('-').slice(1).reverse().join('/'))+'</p><div class="npPosts">'+Object.entries(config.puestos).map(([id,label])=>'<div><strong>'+safe(label)+'</strong><small>Mínimo de referencia por día: '+safe(config.minimos[id]??1)+'</small></div>').join('')+'</div></section>';
      const equipo=root.querySelector('#np-equipo > [data-np-content]');
      if(admin()){
        const currentInvite=invitation;
        equipo.innerHTML='<div class="npBar"><div><h2>Equipo y acceso</h2><p class="npHint">Perfiles, PIN y acceso desde el celular.</p></div><div class="pfBotones">'+(api.producto==='tiendita'?btn('persona','Agregar persona'):btn('legado','Administrar PIN y permisos'))+'</div></div>'+
          records(['Persona','Puesto','Horas por semana','Acciones'],people.map(p=>[safe(p.nombre)+(p.activo?'':' · Inactivo'),role(p),safe(p.horasSemana)+' h',btn('expediente','Expediente',p.id)+(api.producto==='tiendita'&&p.activo?btn('pin','Cambiar PIN',p.id):'')]))+
          '<section class="npBlock"><h2>Acceso por correo</h2><div data-np-invitations></div></section>';
        invitation=equipo.querySelector('[data-np-invitations]');
        if(currentInvite?.hasChildNodes()){invitation.replaceWith(currentInvite);invitation=currentInvite;}
        if(currentTab==='equipo'&&!invitation.childElementCount)loadInvitations();
      }else{equipo.replaceChildren();invitation=null;}
      root.querySelector('#np-asistencias > [data-np-content]').innerHTML='<div class="npBar"><div><h2>Asistencias</h2><p class="npHint">'+(admin()?'Entradas y salidas del negocio.':'Tus entradas y salidas.')+'</p></div><div class="pfBotones">'+btn('actualizar','Actualizar')+((api.puedeChecar||api.admin)()&&admin()?btn('terminal',state.terminal?'Quitar checador de este aparato':'Usar este aparato como checador'):'')+(api.historial&&admin()?btn('historial','Traer historial anterior'):'')+'</div></div>'+
        records(['Persona','Movimiento','Fecha y hora'],attendance.filter(a=>!a.anulada_por).slice().reverse().slice(0,200).map(a=>[name(a.persona),safe(a.tipo),safe(time.format(new Date(a.instante)))]));
      root.querySelector('#np-prenomina > [data-np-content]').innerHTML='<h2>Prenómina de la semana</h2><p class="npHint">Estimación a partir de las checadas y el sueldo guardado.</p>'+
        records(['Persona','Horas','Días asistidos','Estimado'],(state.prenomina||[]).map(p=>[name(p.persona),safe(p.horas),safe(p.dias),currency.format(p.importe||0)+(p.pendiente?' · Pendiente':'')]));
      root.querySelector('#np-sucursales > [data-np-content]').innerHTML='<h2>Negocio actual</h2><div class="npPosts"><div><strong>'+safe(api.negocio?.()||'Mi negocio')+'</strong><small>Los datos de Personal pertenecen a esta cuenta.</small></div></div>';
    }
    function loadInvitations(){
      if(!admin()||!invitation||!window.NuvoorPersonalAdmin)return;
      NuvoorPersonalAdmin.mount(invitation,api.client(),token.cuenta,{producto:api.producto})
        .catch(e=>statusFor(invitation,e.message||'No se pudo cargar el acceso.'));
    }
    function edit(action,title,markup,data,after){
      if(!admin()||editor?.open)return;
      const dialog=document.createElement('dialog');
      dialog.className='pfDialog npPersonal';
      dialog.innerHTML='<form><header><h2>'+safe(title)+'</h2><button type="button" class="btn" data-cerrar>Cerrar</button></header>'+markup+'<p class="pfError" role="status"></p><footer><button type="submit" class="btn primary">Guardar cambios</button></footer></form>';
      editor=dialog;document.body.append(dialog);
      dialog.querySelector('[data-cerrar]').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{editor=null;dialog.remove();},{once:true});
      dialog.querySelector('form').onsubmit=async e=>{
        e.preventDefault();
        const form=e.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;
        try{
          await rpc(action,data(new FormData(form)));
          dialog.close();await schedule.load();after?.();notify('Cambios guardados.');
        }catch(error){statusFor(form.querySelector('[role=status]'),error.message);}
        finally{b.disabled=false;}
      };
      dialog.showModal();
    }
    function persona(id){
      const p=lastState?.equipo.find(x=>x.id===id);
      const exp=lastState?.perfiles.find(x=>x.persona===id);
      if(!p)return;
      const pay=exp?.pago||{};
      edit('perfil','Expediente · '+p.nombre,
        '<label>Horas límite por semana<input name="horas" type="number" min="0" max="168" step=".5" required value="'+safe(p.horasSemana??48)+'"></label>'+
        '<label>Forma de pago<select name="forma">'+[['dia','Por día'],['hora','Por hora'],['semana','Por semana']].map(([v,text])=>'<option value="'+v+'"'+(pay.forma===v?' selected':'')+'>'+text+'</option>').join('')+'</select></label>'+
        '<label>Importe<input type="number" name="monto" min="0" step=".01" required value="'+safe(pay.monto||0)+'"></label>',
        fd=>({persona:p.id,horas:Number(fd.get('horas')),pago:{...pay,forma:fd.get('forma'),monto:Number(fd.get('monto'))},horario:exp?.horario||{}}));
    }
    async function importHistory(){
      const use=token;
      const ids=new Set(lastState.equipo.map(p=>p.id));
      const valid=(api.historial?.()||[]).filter(r=>ids.has(r.uid)&&r.id&&r.fecha&&r.hora&&['entrada','salida'].includes(r.tipo));
      if(!valid.length){notify('El historial anterior sigue disponible en su sección. No hay checadas vinculadas para importar.');return;}
      for(let i=0;i<valid.length;i+=200){
        if(use!==token||!scope())return;
        await rpc('importar_asistencias',{registros:valid.slice(i,i+200)});
      }
      await schedule.load();notify('Historial vinculado al equipo.');
    }
    async function manage(action,id){
      if(!admin())return;
      if(action==='expediente')persona(id);
      else if(action==='legado')api.legacy?.();
      else if(action==='terminal'){
        await rpc('terminal',{activo:!lastState.terminal,nombre:'Checador '+(api.negocio?.()||'del negocio')});
        await schedule.load();
      }else if(action==='historial')await importHistory();
      else if(action==='pin')edit('guardar_pin','Cambiar PIN','<label>Nuevo PIN<input type="password" name="pin" inputmode="numeric" autocomplete="off" required pattern="[0-9]{4,12}" maxlength="12"></label>',fd=>({persona:id,pin:fd.get('pin')}));
      else if(action==='persona')edit('guardar_persona','Agregar persona','<label>Nombre<input name="nombre" required maxlength="120"></label><label>Puesto<select name="rol"><option value="mesero">Piso de venta</option><option value="cocina">Inventario</option><option value="cajero">Caja</option><option value="gerente">Gerencia</option></select></label>',fd=>({nombre:fd.get('nombre'),rol:fd.get('rol')}));
    }
    function click(e){
      const b=e.target.closest('[data-np],[data-np-tab]');
      if(!b)return;
      if(b.dataset.npTab){select(b.dataset.npTab);return;}
      const action=b.dataset.np;
      if(action==='actualizar'){mostrar({forzar:true});return;}
      if(action==='abrirPuerta'){api.abrirPuerta?.();return;}
      manage(action,b.dataset.npPersona).catch(e=>notify(e.message));
    }
    function key(e){
      const b=e.target.closest('[data-np-tab]');
      if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const set=buttons.filter(x=>!x.hidden),i=set.indexOf(b);
      const next=e.key==='Home'?0:e.key==='End'?set.length-1:(i+(e.key==='ArrowLeft'?-1:1)+set.length)%set.length;
      e.preventDefault();select(set[next].dataset.npTab,true);
    }
    async function mostrar({forzar=false}={}){
      if(!active()||!api.visible())return;
      if(!controller)mount();
      if(!forzar&&Date.now()-lastLoad<1500)return;
      lastLoad=Date.now();
      if(!lastState)status.textContent='Cargando Personal…';
      await schedule.load();
      if(currentTab==='horarios')activity?.load();
    }
    function puerta(op){
      const door=op.raiz,$=s=>door.querySelector(s);
      const pin=$(op.pin),error=$(op.error),enter=$(op.entrar),check=$(op.checar),state=$(op.estado);
      if(!pin||!error||!enter||!check||!state)throw Error('Faltan los controles de acceso.');
      const text=check.textContent,auto=pin.autocomplete,max=pin.maxLength,mode=pin.inputMode;
      let running=false,enabled=false,waiting=Promise.resolve();
      const confirmation=document.createElement('div');confirmation.hidden=true;confirmation.className='npConfirm';state.after(confirmation);
      const note=message=>{error.hidden=!message;error.textContent=message;};
      function abrir(){
        if(!active()||!(api.puedeChecar||api.admin)())return false;
        limpiar();enabled=true;confirmation.hidden=true;
        pin.autocomplete='off';pin.inputMode='numeric';pin.maxLength=12;pin.value='';
        check.textContent='Checar turno';note('');
        waiting=Promise.resolve(rpc('bloquear')).catch(e=>{if(scope())note(e.message);});
        return true;
      }
      function cerrar(){
        enabled=false;pin.autocomplete=auto;pin.inputMode=mode;
        if(max<0)pin.removeAttribute('maxlength');else pin.maxLength=max;
        check.textContent=text;note('');confirmation.hidden=true;pin.value='';
      }
      async function autenticar(code,persona){
        await waiting;
        const r=await rpc('identificar',{pin:code,persona});
        if(!r.ok)throw Error(r.error||'PIN incorrecto.');
        return r;
      }
      async function act(checkOnly){
        if(running||!enabled)return;
        const code=pin.value;
        if(!/^[0-9]{4,12}$/.test(code)&&(code||!current()?.sinPin||checkOnly)){
          note(checkOnly?'Escribe tu PIN de 4 a 12 números para checar.':'Escribe tu PIN de 4 a 12 números.');return;
        }
        running=true;enter.disabled=true;check.disabled=true;confirmation.hidden=true;note('');
        try{
          if(!checkOnly){const p=await autenticar(code);if(enabled){cerrar();op.alEntrar(p);}return;}
          await waiting;
          const p=await rpc('identificar',{pin:code,solo_checar:true});
          if(!p.ok)throw Error(p.error||'PIN incorrecto.');
          if(!enabled)return;
          confirmation.hidden=false;
          confirmation.innerHTML='<p>Registrar checada de <strong>'+safe(p.nombre)+'</strong></p><div class="pfLockAcc"><button type="button" class="btn primary" data-np-confirmar>Registrar checada</button><button type="button" class="btn" data-np-cancelar>Cancelar</button></div>';
          confirmation.querySelector('[data-np-cancelar]').onclick=()=>{confirmation.hidden=true;pin.focus();};
          confirmation.querySelector('[data-np-confirmar]').onclick=async e=>{
            const button=e.currentTarget;
            button.disabled=true;
            async function registrar(foto=''){
              const r=await rpc('checar',{pin:code,foto});
              if(!r.ok)throw Error(r.error||'No se registró la checada.');
              confirmation.hidden=true;
              state.textContent=p.nombre+' · '+r.registro.tipo+' registrada a las '+date({hour:'2-digit',minute:'2-digit'}).format(new Date(r.registro.instante))+'.';
              api.checadaGuardada?.(r.registro,p);
              return r.registro;
            }
            try{
              confirmation.hidden=true;
              if(api.capturaChecada)api.capturaChecada(p,code,registrar);
              else{await registrar();pin.focus();}
            }catch(ex){note(ex.message);confirmation.hidden=false;}
            finally{button.disabled=false;}
          };
        }catch(e){
          if(checkOnly||!e.sinConexion||!await op.respaldo?.(code))note(e.message);
        }
        finally{running=false;enter.disabled=false;check.disabled=false;pin.value='';}
      }
      door.addEventListener('click',e=>{
        if(!enabled)return;
        const b=e.target.closest('button');
        if(!b||(b!==enter&&b!==check&&!b.dataset.pfkey))return;
        e.preventDefault();e.stopImmediatePropagation();
        if(b===enter||b===check){act(b===check);return;}
        const key=b.dataset.pfkey;
        pin.value=key==='borrar'?'':key==='←'?pin.value.slice(0,-1):(pin.value+key).slice(0,12);pin.focus();
      },true);
      door.addEventListener('keydown',e=>{
        if(!enabled||e.target!==pin||e.key!=='Enter')return;
        e.preventDefault();e.stopImmediatePropagation();act(false);
      },true);
      door.addEventListener('submit',e=>{
        if(!enabled)return;
        e.preventDefault();e.stopImmediatePropagation();act(false);
      },true);
      pin.addEventListener('input',()=>{if(enabled)pin.value=pin.value.replace(/\D/g,'').slice(0,12);});
      return {abrir,cerrar,autenticar};
    }
    const seleccionar=id=>{if(buttons&&controller&&Object.hasOwn(tabs,id))select(id);};
    return {activar,mostrar,seleccionar,reiniciar:reset,activo:active,sinPin:()=>current()?.sinPin===true,compatibilidad:()=>current()?.compatibilidad,puerta};
  }
  window.NuvoorPersonalPanel={crear};
})();