/* Existencias por talla/color. El total anterior se conserva como sin clasificar. */
(function(){
 'use strict';
 const n=v=>Number.isFinite(Number(v))?Number(v):0;
 const normal=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX');
 const clave=v=>JSON.stringify([normal(v?.talla),normal(v?.color)]);
 const lista=v=>String(v||'').split(/[,;|\n]+/).map(s=>s.trim()).filter(Boolean).filter((s,i,a)=>a.findIndex(x=>normal(x)===normal(s))===i);
 const usa=a=>!!(a&&(a.tallas||a.colores));
 function opciones(a,campo){
  const propios=lista(a?.[campo==='talla'?'listaTallas':'listaColores']||(campo==='talla'?'CH, M, G, EG, EEG':''));
  const guardados=(a?.invVariantes||[]).map(v=>v[campo]).filter(Boolean);
  return lista(propios.concat(guardados).join(',' )||(campo==='talla'?'CH, M, G, EG, EEG':''));
 }
 function resumen(a){const clasificado=(a?.invVariantes||[]).reduce((s,v)=>s+n(v.existencia),0);return {total:n(a?.existencia),clasificado,sinClasificar:n(a?.existencia)-clasificado,revisar:!!a?.invVariantesRevisar};}
 function completa(a,v){return !!a&&(!a.tallas||!!String(v?.talla||'').trim())&&(!a.colores||!!String(v?.color||'').trim());}
 function stock(a,v){
  if(!completa(a,v)||a.invVariantesRevisar)return null;
  const fila=(a.invVariantes||[]).find(x=>clave(x)===clave(v));
  return fila?n(fila.existencia):(resumen(a).sinClasificar===0?0:null);
 }
 function valida(a,filas,cantidad){
  if(!usa(a))return '';
  if(!Array.isArray(filas)||!filas.length)return 'Elige las tallas y colores del artículo.';
  if(filas.some(v=>!completa(a,v)))return 'Completa la talla y el color de cada renglón.';
  if(filas.some(v=>!Number.isSafeInteger(Number(v.cant))||Number(v.cant)<=0))return 'Captura piezas enteras mayores que cero en cada renglón.';
  if(cantidad!=null&&filas.reduce((s,v)=>s+n(v.cant),0)!==n(cantidad))return 'La suma de tallas y colores debe coincidir con las piezas del pedido.';
  return '';
 }
 function mueve(a,tipo,cantidad,variante){
  if(!Number.isFinite(Number(cantidad))||Number(cantidad)<0)throw Error('Escribe una cantidad válida.');
  const q=Number(cantidad),antes=n(a.existencia),conVar=usa(a)&&!!variante;
  if(usa(a)&&!Number.isSafeInteger(q))throw Error('Las existencias por talla y color se registran en piezas enteras.');
  let fila,previo=antes,delta;
  if(conVar){
   if(!completa(a,variante))throw Error('Elige la talla y el color para registrar el movimiento.');
   fila=(a.invVariantes||[]).find(v=>clave(v)===clave(variante));previo=n(fila?.existencia);
  }
  if(tipo==='clasificar'){
   if(!conVar)throw Error('Elige la talla y el color que vas a clasificar.');
   if(q>resumen(a).sinClasificar)throw Error('No hay tantas piezas sin clasificar. Revisa el total del artículo.');
   delta=0;
  }else delta=tipo==='entrada'?q:tipo==='salida'?-q:q-previo;
  if(conVar){
   if(!fila){a.invVariantes=a.invVariantes||[];fila={talla:a.tallas?String(variante.talla).trim():'',color:a.colores?String(variante.color).trim():'',existencia:0};a.invVariantes.push(fila);}
   fila.existencia=tipo==='clasificar'?previo+q:previo+delta;
  }else if(tipo!=='entrada'&&(a.invVariantes||[]).length&&resumen(a).sinClasificar+delta<0){a.invVariantesRevisar=true;}
  a.existencia=antes+delta;
  return {delta,queda:a.existencia,variante:conVar?{talla:fila.talla,color:fila.color}:null,quedaVariante:conVar?fila.existencia:null,cantidad:q};
 }
 window.NuvoorVariantes={clave,lista,usa,opciones,resumen,completa,stock,valida,mueve};
})();
