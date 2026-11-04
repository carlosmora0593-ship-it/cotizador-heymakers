/* Sin red: sólo anuncios, pagos y rutas de prueba. */
const op={writes:[],signed:[],fail:false,revision:0,ads:[{id:91,titulo:'Campaña de prueba',imagen:'/img/marca/n-192.png',anunciante:'Proveedor QA',enlace:'https://example.test',activo:true,estado:'al aire',lugar:'ambos',vistas:42,clics:3,orden:10,actualizado:'2026-11-04T20:00:00Z',giros:[],estados:[]}],drafts:[],payments:[{pago_id:'pago-qa',cuenta_id:'cuenta-qa',factura_id:72,negocio:'Taller de prueba',plan:'Imprenta Maker',pagado:new Date().toISOString(),referencia:'invoice:in_qa',importe_centavos:44900,moneda:'mxn',prueba:true,estado:'pendiente',uuid_sat:null,pdf:false,xml:false,motivo:'Falta configurar el emisor en Facturapi',envio_estado:'pendiente'}]};
op.ads[0].imagen=location.origin+op.ads[0].imagen;
window.__opQa=op;
const opFrom=client.from,opRpc=client.rpc;
client.from=table=>{
 if(!['v_anuncios','anuncios_borradores'].includes(table))return opFrom(table);
 const q={select(){return q},then(ok,bad){return Promise.resolve({data:JSON.parse(JSON.stringify(table==='v_anuncios'?op.ads:op.drafts)),error:null}).then(ok,bad)}};return q;
};
client.rpc=async(name,args)=>{
 if(name==='lab_anuncio_guarda'){
  if(op.fail)return {error:{message:'No hay conexión de prueba'}};
  op.writes.push(JSON.parse(JSON.stringify(args)));let a=op.ads.find(a=>a.id===args.p_id);
  if(!a){a={id:92+op.revision,imagen:'',titulo:'',activo:false,actualizado:new Date().toISOString(),vistas:0,clics:0};op.ads.push(a);}
  if(args.p_modo==='borrador')op.drafts=[{id:a.id,cuerpo:args.p_datos,actualizado:new Date().toISOString()}];
  if(args.p_modo==='publicar'){Object.assign(a,args.p_datos,{activo:true,estado:'al aire',actualizado:new Date().toISOString()});op.drafts=op.drafts.filter(d=>d.id!==a.id);}
  if(args.p_modo==='apagar'){a.activo=false;a.estado='apagado';}
  op.revision++;return {data:a.id,error:null};
 }
 if(name==='lab_reporte_publicidad')return {data:{inicio:new Date().toISOString(),totales:{vistas:20,clics:3,alcance:2},dias:[{fecha:'2026-11-04',vistas:20,clics:3,alcance:2}],campanas:[{anuncio_id:91,titulo:'=CAMPAÑA QA',vistas:20,clics:3,alcance:2}]},error:null};
 if(name==='lab_facturas_lista')return {data:{configurada:false,filas:op.payments.filter(p=>!args.p_busqueda||p.negocio.includes(args.p_busqueda))},error:null};
 if(name==='lab_facturas_permisos')return {data:[{id:'staff-qa',nombre:'Equipo QA',rol:'soporte',permitido:false}],error:null};
 if(name==='lab_facturas_archivo')return {data:'cuenta-qa/72/factura.'+args.p_formato,error:null};
 return opRpc(name,args);
};
client.storage.from=bucket=>({createSignedUrl:async(ref,expires)=>{op.signed.push({bucket,ref,expires});return {data:{signedUrl:location.origin+'/qa-documento.pdf'},error:null};}});
