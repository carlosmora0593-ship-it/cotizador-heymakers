/* Reglas compartidas de calendario. No contiene datos ni permisos de sesión. */
(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const date=/^\d{4}-\d{2}-\d{2}$/;
  const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
  function day(s){if(!date.test(s))throw Error('Revisa la fecha.');const d=new Date(s+'T12:00:00Z');if(d.toISOString().slice(0,10)!==s)throw Error('Revisa la fecha.');return d;}
  function add(s,n){const d=day(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
  function monday(s){const d=day(s);return add(s,-((d.getUTCDay()+6)%7));}
  const minutes=s=>{if(!time.test(s))throw Error('Revisa la hora.');const [h,m]=s.split(':').map(Number);return h*60+m;};
  function interval(t){const d=day(t.fecha).getTime()/60000,e=minutes(t.entrada),s=minutes(t.salida);if(e===s)throw Error('La salida debe ser distinta de la entrada.');return [d+e,d+s+(s<e?1440:0)];}
  const hours=t=>{const [a,b]=interval(t);return (b-a)/60;};
  const overlap=(a,b)=>{const x=interval(a),y=interval(b);return x[0]<y[1]&&y[0]<x[1];};
  const post=rol=>rol==='mesero'?'servicio':rol==='cocina'?'cocina':'gerencia';
  function review(turnos,personas,minimos={gerencia:1,servicio:1,cocina:1}){
    const ids=new Set(),duplicates=[],warnings=[],totals={};
    for(const t of turnos){
      if(!t.id||ids.has(t.id))throw Error('El turno está duplicado.');ids.add(t.id);interval(t);
      if(!['gerencia','servicio','cocina'].includes(t.puesto))throw Error('Revisa el puesto.');
      if(t.persona){const p=personas.find(p=>p.id===t.persona&&p.activo!==false);if(!p||post(p.rol)!==t.puesto)throw Error('La persona no corresponde al puesto.');totals[p.id]=(totals[p.id]||0)+hours(t);}
    }
    for(let i=0;i<turnos.length;i++)for(let j=i+1;j<turnos.length;j++){
      const a=turnos[i],b=turnos[j];if(!a.persona||!b.persona||!overlap(a,b))continue;
      if(a.persona===b.persona)duplicates.push({a:a.id,b:b.id,persona:a.persona});
    }
    // Sweep por puesto: sólo avisa si supera el mínimo configurado.
    for(const puesto of ['gerencia','servicio','cocina']){
      const events=turnos.filter(t=>t.puesto===puesto&&t.persona).flatMap(t=>{const [a,b]=interval(t);return [{m:a,d:1},{m:b,d:-1}];}).sort((a,b)=>a.m-b.m||a.d-b.d);
      let n=0,exceso=false;for(const e of events){n+=e.d;if(n>Number(minimos[puesto]||1))exceso=true;}if(exceso)warnings.push('Hay empalmes en '+puesto+'.');
    }
    for(const p of personas){const limite=Number(p.horasSemana??48);if((totals[p.id]||0)>limite)warnings.push(p.nombre+' quedaría con '+totals[p.id]+' h de '+limite+' h.');}
    return {duplicates,warnings,totals,covered:turnos.filter(t=>t.persona).length,total:turnos.length};
  }
  function apply(turnos,r){
    const out=clone(turnos),data=r.datos||{},targets=out.filter(t=>t.persona===r.persona&&t.fecha>=(data.desde||data.fecha)&&t.fecha<=(data.hasta||data.fecha));
    if(!targets.length)throw Error('El turno ya cambió. Revisa la solicitud.');
    if(r.tipo==='cambio'){if(targets.length!==1)throw Error('Selecciona un solo turno.');Object.assign(targets[0],{entrada:data.entrada,salida:data.salida});interval(targets[0]);}
    else if(r.tipo==='cobertura'){if(!r.aceptada)throw Error('Primero debe aceptar el compañero.');targets.forEach(t=>t.persona=data.companero);}
    else if(['descanso','vacaciones','ausencia'].includes(r.tipo))targets.forEach(t=>t.persona='');
    else throw Error('Esta solicitud no cambia el horario.');
    return out;
  }
  root.NuvoorSemana={clone,add,monday,interval,hours,overlap,post,review,apply};
})(typeof window==='undefined'?globalThis:window);
