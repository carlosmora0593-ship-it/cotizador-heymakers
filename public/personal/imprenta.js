/* Imprenta: conserva perfiles, menú y cámara. Personal reutiliza sus mismos IDs. */
(function(){
  'use strict';
  const root=document.querySelector('#personalNuvoor');
  if(!root||!window.NuvoorPersonalPanel)return;
  const $=s=>document.querySelector(s);
  const getSession=()=>window.__personalSesionImprenta?.();
  let rolPin=false,perfilEnNube=false,prefiereLegado=false,checando=null,puertaNube=false;
  const old={pide:pideAcceso,cierra:cierraAcceso,entrada:entraPerfil,rol:rolActual,equipo:guardaEquipo,guardaChecada,cierraCheca,pintaReloj:pintaAccesoReloj,aplicaRol,navega:vaATab};
  const cajaPuerta=$('#acceso');
  const pin=$('#accesoPass');
  const pinLabel=$('label[for=accesoPass]');
  const pinNombre=$('#accesoQuien');
  const btnAsi=$('#tabs [data-tab=asi]');
  const areaAsi=$('#personalAsistenciaAnterior');
  const nom=$('#tab-nom'),btnNom=$('#tabs [data-tab=nom]');
  const slotAsi=document.createComment('Asistencia anterior');
  const slotNom=document.createComment('Nómina anterior');
  areaAsi.before(slotAsi);nom.before(slotNom);
  const lugarDelBoton=document.createComment('Entrada Personal');
  btnAsi.before(lugarDelBoton);
  function restaurarLegado(){
    slotAsi.after(areaAsi);slotNom.after(nom);
    areaAsi.hidden=personal.activo();nom.hidden=true;
  }
  function mostrarLegado(id,admin){
    for(const [nodo,titulo,panel,source] of [
      [areaAsi,'Asistencia anterior','asistencias',slotAsi],
      [nom,'Nómina y recibos','prenomina',slotNom]
    ]){
      const destino=admin&&id===panel?$('#np-'+panel):null;
      if(!destino){source.after(nodo);nodo.hidden=true;continue;}
      let details=destino.querySelector('.npLegado');
      if(!details){
        details=document.createElement('details');details.className='npLegado';
        const summary=document.createElement('summary');summary.textContent=titulo;
        details.append(summary);destino.append(details);
      }
      if(nodo.parentElement!==details)details.append(nodo);
      nodo.hidden=false;
      if(nodo===nom)renderNomina();
      else renderAsistencia();
    }
  }
  const permisoBase=()=>getSession()?.admin===true;
  const gestor=()=>rolActual()==='admin'&&(!personal.activo()||perfilEnNube||personal.sinPin());
  const fallosClave=()=>!!personal.compatibilidad();
  const visible=()=>!$('#tab-asi').hidden&&!document.body.classList.contains('sin-sesion')&&cajaPuerta.hidden;
  const estadoConectado=()=>getSession()?.cuenta || null;
  const personal=NuvoorPersonalPanel.crear({
    producto:'taller',root,client:()=>getSession()?.cliente,cuenta:estadoConectado,usuario:()=>getSession()?.usuario,
    negocio:()=>P.empresa?.nombre||$('#brandProducto').textContent,
    admin:gestor,puedeChecar:permisoBase,visible,notifica:toast,
    alternar(activo){
      const b=btnAsi.querySelector('b');
      if(b){
        const badge=b.querySelector('.mbadge');
        b.textContent=activo?'Personal':'Asistencia';
        if(badge)b.append(badge);
      }
      const description=btnAsi.querySelector('small');
      if(description)description.textContent=activo?'Equipo, horarios y asistencias':'Reloj checador y horas trabajadas';
      btnAsi.title=activo?'Personal':'Asistencia';
      if(btnAsi.getAttribute('aria-selected')==='true')$('#menuActual').textContent=b.textContent;
      if(activo){
        const group=btnAsi.closest('.nvNavGrupo');
        if(group){btnAsi.before(lugarDelBoton);group.before(btnAsi);}
        btnNom.hidden=true;areaAsi.hidden=true;
      }else{
        lugarDelBoton.after(btnAsi);areaAsi.hidden=false;
        btnNom.hidden=!puedeVer('nom')||(window.__enElPlan&&!window.__enElPlan('nom'));
      }
      limpiaGrupos();
      if(NOMBRES_ORIG?.asi)NOMBRES_ORIG.asi=activo?['Personal','Equipo, horarios y asistencias']:['Asistencia','Reloj checador y horas trabajadas'];
    },
    mostrarLegado,restaurarLegado,
    historial:()=>asistencias.filter(r=>!String(r.id).startsWith('personal-')),
    legacy:()=>{if(gestor()&&vaATab('set'))abrePorAncla('#equipoCaja');},
    abrirPuerta:()=>pideAcceso({bloqueo:true}),
    capturaChecada(perfil,clave,registrar){
      checando={persona:perfil.persona,registrar};
      abreCheca(perfil.persona);
      if($('#modalCheca').hidden){checando=null;throw Error('El perfil aún no está disponible en este aparato.');}
      chTecleado=clave;pintaPin();revisaChOk();
    }
  });
  const door=personal.puerta({
    raiz:cajaPuerta,pin:'#accesoPass',error:'#accesoError',entrar:'#accesoEntrar',checar:'#accesoCheca',estado:'#accesoRelojEstado',
    alEntrar(perfil){
      const u=equipo.find(p=>p.id===perfil.persona&&p.activo!==false)||
        (personal.sinPin()&&perfil.rol==='gerente'?equipo.find(p=>p.rol==='admin'&&p.activo!==false):null);
      if(!u){toast('Actualiza el equipo para abrir el perfil.');return;}
      rolPin=true;perfilEnNube=true;
      old.entrada(u.id,false);
    },
    respaldo(code){
      const matches=equipo.filter(u=>u.activo!==false&&tieneClave(u)&&String(u.pin)===code);
      const sinClaves=!code&&!equipo.some(u=>u.activo!==false&&tieneClave(u));
      const u=sinClaves?equipo.find(u=>u.activo!==false&&u.rol==='admin'):matches.length===1?matches[0]:null;
      if(!u)return false;
      rolPin=true;perfilEnNube=false;old.entrada(u.id,false);return true;
    }
  });
  const alternativo=document.createElement('button');
  alternativo.type='button';alternativo.className='pfLink pfOtro';alternativo.textContent='Elegir perfil';alternativo.hidden=true;
  $('#accesoOtro').after(alternativo);

  function etiquetaPin(activado){
    pinLabel.firstChild.textContent=activado?'Inserta tu PIN':'Contraseña de ';
    pinNombre.hidden=activado;
  }
  function despliegaPuerta(){
    if(!door.abrir())return;
    perfilEnNube=false;puertaNube=true;
    etiquetaPin(true);
    for(const id of ['accesoTitulo','accesoPerfiles','accesoVolver','accesoRecordarFila','accesoOtro'])$('#'+id).hidden=true;
    $('#accesoClave').hidden=false;$('#accesoReloj').hidden=false;
    $('#accesoSub').textContent='Si no tienes PIN, pídelo al gerente.';
    $('#accesoRelojEstado').textContent='';
    alternativo.textContent='Elegir perfil';alternativo.hidden=!fallosClave();
    setTimeout(()=>{if(!cajaPuerta.hidden&&!prefiereLegado)pin.focus();},60);
  }
  rolActual=function(){
    if(rolPin&&permisoBase()&&ROLES[usuarioActual().rol])return usuarioActual().rol;
    return old.rol();
  };
  pideAcceso=function(opc){
    prefiereLegado=false;puertaNube=false;
    door.cerrar();etiquetaPin(false);
    old.pide(opc);
    if(permisoBase()&&personal.activo())despliegaPuerta();
  };
  pintaAccesoReloj=function(){if(!puertaNube)old.pintaReloj();};
  cierraAcceso=function(){
    puertaNube=false;
    door.cerrar();etiquetaPin(false);alternativo.hidden=true;
    old.cierra();
    personal.mostrar({forzar:true});
  };
  alternativo.onclick=()=>{
    prefiereLegado=!prefiereLegado;
    if(!prefiereLegado){pideAcceso({bloqueo:bloqueado});return;}
    const locked=bloqueado;puertaNube=false;
    door.cerrar();etiquetaPin(false);old.pide();
    bloqueado=locked;alternativo.hidden=false;alternativo.textContent='Volver al teclado';
  };
  /* La ruta explícita conserva claves antiguas alfanuméricas y perfiles de
     dispositivo. Un duplicado puede abrir su perfil local, no la gestión en nube. */
  entraPerfil=function(id,recordar){
    if(!prefiereLegado||!personal.activo()||!permisoBase())return old.entrada(id,recordar);
    const codigo=pin.value;
    door.autenticar(codigo,id).then(()=>{
      rolPin=true;perfilEnNube=true;old.entrada(id,false);
    }).catch(()=>{
      rolPin=true;perfilEnNube=false;old.entrada(id,false);
    });
  };
  guardaEquipo=async function(){
    await old.equipo();
    if(personal.activo()&&permisoBase())await personal.activar({actualizar:true});
  };
  guardaChecada=async function(ev){
    if(!checando||checando.persona!==ev.uid)return old.guardaChecada(ev);
    try{
      const registro=await checando.registrar(chBlob);
      const fecha=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(registro.instante));
      const hora=new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(registro.instante));
      return old.guardaChecada({...ev,id:'personal-'+registro.id,tipo:registro.tipo,fecha,hora,ts:Date.parse(registro.instante)});
    }catch(e){toast(e.message||'No se pudo registrar la checada.');return false;}
  };
  cierraCheca=function(){checando=null;old.cierraCheca();};
  vaATab=function(t){
    if(t!=='nom'||!personal.activo())return old.navega(t);
    if(!puedeVer('nom')||!old.navega('asi'))return false;
    personal.mostrar();
    personal.seleccionar('prenomina');
    return true;
  };
  aplicaRol=function(){
    old.aplicaRol();
    if(personal.activo()){btnNom.hidden=true;limpiaGrupos();}
    if(personal.activo()&&rolPin&&typeof pintaPerfil==='function')pintaPerfil();
  };
  btnAsi.addEventListener('click',()=>queueMicrotask(()=>personal.mostrar()));
  const start=window.__arranca;
  window.__arranca=function(){
    return Promise.resolve(start()).then(()=>{
      if(!$('#auth').hidden)return;
      personal.activar().then(activo=>{
        if(!activo)return;
        const hayClaves=equipo.some(u=>u.activo!==false&&tieneClave(u));
        if(permisoBase()&&(hayClaves||!cajaPuerta.hidden)){
          rolPin=hayClaves;
          pideAcceso({bloqueo:bloqueado});
          aplicaRol();
        }else personal.mostrar();
      });
    });
  };
  window.__nombrePerfilPersonal=()=>personal.activo()&&rolPin&&usuarioActual().nombre||'';
  window.__aplicaPerfilPersonal=()=>{if(rolPin||personal.activo())aplicaRol();};
})();