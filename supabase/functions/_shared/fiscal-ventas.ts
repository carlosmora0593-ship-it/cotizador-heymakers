// Contrato compartido de pruebas. Nunca infiere una tasa del total global.
export const centavos=(value:any)=>{
 const n=Number(value);if(!Number.isFinite(n)||n<0||n>100000000)throw Error('Importe inválido en la venta');
 return Math.round((n+Number.EPSILON)*100);
};
export function receptorFiscal(r:any){
 const tax_id=String(r?.rfc||'').trim().toUpperCase(),legal_name=String(r?.razon||'').trim(),zip=String(r?.cp||'').trim(),tax_system=String(r?.regimen||'');
 if(!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(tax_id)||legal_name.length<3||legal_name.length>300||!/^\d{5}$/.test(zip)||!/^\d{3}$/.test(tax_system)||!/^[A-Z]\d{2}$/.test(String(r?.uso||'')))throw Error('Revisa RFC, razón social, código postal, régimen y uso del CFDI');
 if(['XAXX010101000','XEXX010101000'].includes(tax_id))throw Error('Esta primera prueba requiere un receptor con RFC propio; factura global y extranjeros se conectarán por separado');
 return {customer:{tax_id,legal_name,tax_system,address:{zip}},use:String(r.uso)};
}
export function prepararFiscalVenta(sistema:string,doc:any,receptor:any,externalId:string){
 const v=sistema==='taller'?doc?.venta:sistema==='tiendita'?doc?.sale:doc;
 if(!v||v._eliminado||v.cancelada||v.cancelled||v.factura?.folioFiscal)throw Error('Venta no disponible o con comprobante externo registrado');
 const total=centavos(v.total),tip=sistema==='restaurant'?centavos(v.propina||0):0;
 if(total<=tip)throw Error('La venta no tiene importe facturable');
 if(sistema==='taller'&&(v.estado!=='pagado'||centavos(v.recibido)<total))throw Error('Esta primera prueba sólo factura ventas totalmente pagadas');
 if(sistema==='tiendita'&&centavos(v.received)<total)throw Error('El pago no cubre la venta');
 if(sistema==='restaurant'&&(v.appId||!Array.isArray(v.pagos)||v.pagos.length!==1||centavos(v.pagos[0].monto)-centavos(v.cambio||0)<total))throw Error('Esta primera prueba requiere una cuenta pagada con una sola forma de pago, sin plataforma de reparto');
 const f=v.cfdi;
 if(!f||f.version!==1||!Array.isArray(f.conceptos)||!f.conceptos.length||f.conceptos.length>100||centavos(f.total)!==total-tip)throw Error('La venta no conserva su desglose fiscal. Revisa los datos antes de facturar');
 const forma=String(f.forma||''),pago=sistema==='taller'?v.pago:sistema==='tiendita'?v.method:v.pagos[0].tipo;
 const formaVenta:Record<string,string>={Efectivo:'01',Transferencia:'03',Tarjeta:'04','Depósito':'03',efectivo:'01',transferencia:'03',tarjeta:'04',debito:'28'};
 if(!['01','03','04','28'].includes(forma)||formaVenta[pago]!==forma||receptor?.metodo!=='PUE'||String(receptor?.forma)!==forma)throw Error('Confirma la forma de pago de la venta; esta prueba admite PUE con efectivo, transferencia o tarjeta');
 let suma=0;
 const items=f.conceptos.map((x:any)=>{
  const gross=centavos(x.importe),qty=Number(x.cantidad),iva=String(x.iva),description=String(x.descripcion||'').trim(),product_key=String(x.clave||''),unit_key=String(x.unidad||'');
  if(!gross||!Number.isFinite(qty)||qty<=0||qty>100000||!['0','8','16','exento'].includes(iva)||!/^\d{8}$/.test(product_key)||!/^[A-Z0-9]{2,3}$/.test(unit_key)||!description||description.length>1000)throw Error('Faltan cantidades, claves SAT, unidad o impuestos confirmados en un concepto');
  suma+=gross;
  const taxes=iva==='exento'?[{type:'IVA',factor:'Exento',rate:0}]:[{type:'IVA',rate:Number(iva)/100}];
  return {quantity:qty,product:{description,product_key,unit_key,price:Math.round(gross/100/qty*1e6)/1e6,tax_included:true,taxes}};
 });
 if(suma!==total-tip)throw Error('Los conceptos no coinciden con el total cobrado; corrige el desglose');
 return {total:suma,body:{...receptorFiscal(receptor),items,type:'I',payment_form:forma,payment_method:'PUE',currency:'MXN',external_id:externalId,idempotency_key:externalId,pdf_custom_section:'PRUEBA DE INTEGRACIÓN NUVOOR. Sin validez fiscal. No enviar al cliente.'}};
}
export const UUID=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function validarComprobante(d:any,total:number){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(d?.id||'')||d.livemode!==false||centavos(d.total)!==total)throw Error('La respuesta no coincide con el importe y ambiente de prueba esperados');
 const uuid=d.uuid||d.stamp?.uuid;
 if(d.status!=='valid'||!UUID.test(uuid||''))return {id:d.id,uuid:null};
 return {id:d.id,uuid};
}
