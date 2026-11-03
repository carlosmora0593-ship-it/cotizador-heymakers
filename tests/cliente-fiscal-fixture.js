window.__qaFcl={
 eval:code=>eval(code),
 seed(){
  window.__qaCategorias.seed();
  clientes=[{id:'cliente-ejemplo',nombre:'Taller de muestra',persona:'Contacto de ejemplo',tel:'0000000000',mail:'compras@example.test',razon:'EMPRESA DE MUESTRA',rfc:'AAA010101AAA',cp:'58000',regimen:'601',uso:'G03',calle:'Calle de ejemplo 25',colonia:'Centro',ciudad:'Morelia',estado:'Michoacán',notas:'Enviar factura al correo de compras.',credito:5000,docs:[],creado:hoyISO()}];
  cot.cliente='';cot.contacto='';cot.clienteId='';cot.clienteFicha=null;
  FCL.clave='';vaATab('cot');renderCot();pintaSelectClientes();azClientes();if(typeof guiaVaA==='function')guiaVaA('cliente');
 },
 cot(){return JSON.parse(JSON.stringify(cot));},
 clientes(){return JSON.parse(JSON.stringify(clientes));}
};
