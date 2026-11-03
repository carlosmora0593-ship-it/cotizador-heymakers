/* Conteos físicos del catálogo; las piezas anteriores sin clasificar se conservan. */
(function(){
 'use strict';const V=window.NuvoorVariantes;
 function normaliza(art,filas=art?.invVariantes||[]){
  const m=new Map();for(const f of filas){const v={talla:art.tallas?String(f.talla||'').trim():'',color:art.colores?String(f.color||'').trim():'',existencia:Number(f.existencia)};
   if(!V.completa(art,v)||!Number.isFinite(v.existencia))continue;const key=V.clave(v);if(m.has(key))m.get(key).existencia+=v.existencia;else m.set(key,v);
  }return [...m.values()];
 }
 const firma=a=>JSON.stringify([Number(a?.existencia)||0,a?.invVariantes||[],!!a?.invVariantesRevisar]);
 function calcula(original,formato,datos,completo=false){
  const antes=normaliza({...original,tallas:formato.tallas,colores:formato.colores});
  const originales=new Map(antes.map(f=>[V.clave(f),f]));const filas=[];
  for(const f of datos){
   if(f.cantidad===''||f.cantidad==null){if(originales.has(V.clave(f)))throw Error('Escribe 0 si ya no quedan piezas de una combinación registrada.');continue;}
   const cantidad=Number(f.cantidad);if(!Number.isSafeInteger(cantidad)||cantidad<0)throw Error('Las existencias deben ser piezas enteras iguales o mayores a cero.');
   const v={talla:formato.tallas?String(f.talla||'').trim():'',color:formato.colores?String(f.color||'').trim():'',existencia:cantidad};
   if(!V.completa(formato,v))throw Error('Completa la talla y el color del conteo.');filas.push(v);
  }
  const nuevas=normaliza(formato,filas),suma=nuevas.reduce((s,f)=>s+f.existencia,0);
  const sinAntes=(Number(original?.existencia)||0)-antes.reduce((s,f)=>s+f.existencia,0);
  if((original?.invVariantesRevisar||sinAntes<0)&&!completo)throw Error('Revisa todas las combinaciones y marca el conteo completo para corregir este inventario.');
  const clavesNuevas=new Set(nuevas.map(f=>V.clave(f))),sinMostrar=antes.filter(f=>!clavesNuevas.has(V.clave(f))).reduce((s,f)=>s+f.existencia,0);
  const nuevasPiezas=nuevas.filter(f=>!originales.has(V.clave(f))).reduce((s,f)=>s+f.existencia,0);
  const sinClasificar=completo?0:Math.max(0,sinAntes+sinMostrar-nuevasPiezas),total=suma+sinClasificar;
  if(!Number.isSafeInteger(total))throw Error('La cantidad total es demasiado grande.');
  return {variantes:V.usa(formato)?nuevas:[],total,sinClasificar,suma,delta:total-(Number(original?.existencia)||0)};
 }
 function planRecepcion(req,datos,articulos){
  const plan=[];
  for(const d of datos){if(!d.ok)continue;const partida=(req.partidas||[]).find(p=>p.id===d.id);if(!partida)throw Error('La requisición cambió. Vuelve a abrir la recepción.');
   const artId=d.artId||partida.artId||'',art=artId?articulos.find(a=>a.id===artId):null;if(artId&&!art)throw Error('El artículo ya no está en el catálogo. Revisa la liga de material.');
   const cantidad=Number(d.cantidad);if(!Number.isSafeInteger(cantidad)||cantidad<0)throw Error('Captura piezas enteras iguales o mayores a cero.');if(cantidad===0)continue;
   if(cantidad>Math.max(0,Number(partida.cant||0)-Number(partida.recibido||0)))throw Error('La recepción supera las piezas pendientes. Revisa cuánto llegó.');
   const variantes=(d.variantes||[]).map(v=>({talla:art?.tallas?String(v.talla||'').trim():'',color:art?.colores?String(v.color||'').trim():'',cant:Number(v.cant)}));
   if(V.usa(art)){const error=V.valida(art,variantes,cantidad);if(error)throw Error(error);}
   plan.push({id:d.id,artId,cantidad,variantes:V.usa(art)?variantes:[]});
  }
  if(!plan.length)throw Error('Captura las piezas que llegaron antes de guardar.');return plan;
 }
 function recibe(catalogo,folio,plan,ctx){
  const cat=JSON.parse(JSON.stringify(catalogo)),r=(cat.compras||[]).find(r=>r.folio===folio);if(!r)throw Error('La requisición ya no está disponible.');
  if(!['autorizada','enviada','parcial','pagada'].includes(r.estado))throw Error('Esta requisición no está lista para recibir material.');
  let piezas=0,entradas=0;const fecha=ctx.fecha+' '+ctx.hora;cat.invMovs=cat.invMovs||[];
  for(const p of plan){const x=r.partidas.find(x=>x.id===p.id);if(!x||p.cantidad>Math.max(0,Number(x.cant)-Number(x.recibido||0)))throw Error('Cambió la cantidad pendiente de recibir.');
   const a=p.artId?cat.articulos.find(a=>a.id===p.artId):null;
   if(a){for(const v of p.variantes.length?p.variantes:[null]){
    const cantidad=v?v.cant:p.cantidad,mov=V.mueve(a,'entrada',cantidad,v);
    cat.invMovs.push({id:ctx.id(),fecha,articulo:a.nombre,artId:a.id,tipo:'Entrada',delta:mov.delta,queda:mov.queda,variante:mov.variante,quedaVariante:mov.quedaVariante,cantidad,nota:'Recepción de material · '+folio,quien:ctx.quien,req:{folio,archivo:null}});
   }entradas++;}
   x.artId=p.artId;x.recibido=Number(x.recibido||0)+p.cantidad;x.recepciones=(x.recepciones||[]).concat({fecha,cantidad:p.cantidad,variantes:p.variantes,quien:ctx.quien});piezas+=p.cantidad;
  }
  cat.invMovs=cat.invMovs.slice(-400);const pendientes=r.partidas.filter(x=>Number(x.recibido||0)<Number(x.cant||0));
  r.estado=r.pagada||r.estado==='pagada'?'pagada':pendientes.length?'parcial':'recibida';r.recibida=fecha;r.bitacora=(r.bitacora||[]).concat({f:fecha,t:'Recepción: '+piezas+' pieza(s), con desglose por talla/color cuando aplica.'});
  return {cat,r,piezas,entradas,pendientes};
 }
 window.NuvoorConteo={normaliza,firma,calcula,planRecepcion,recibe};
})();
