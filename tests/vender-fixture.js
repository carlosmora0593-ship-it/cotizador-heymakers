window.__qaVender={
 eval:code=>eval(code),
 seed(){
  cat.arranque={hecho:true};P.ivaOn=false;P.margen=30;P.empresa.nombre='Taller de muestra';
  cat.articulos=[
   {id:'playera-blanca',nombre:'Playera cuello redondo algodón — blanca',cat:'Textil',costo:70.20,precio:73.71,sku:'TEXT-0001',barras:'750000000001',existencia:120,vigila:true},
   {id:'playera-color',nombre:'Playera cuello redondo algodón — color',cat:'Textil',costo:44.13,precio:59,sku:'TEXT-0002',existencia:84,vigila:true},
   {id:'playera-poli',nombre:'Playera poliéster deportiva',cat:'Textil',costo:77.76,precio:78,sku:'TEXT-0003'},
   {id:'playera-premium',nombre:'Playera premium 24/1 peinada',cat:'Textil',costo:118.80,precio:119,sku:'TEXT-0004',existencia:24,vigila:true},
   {id:'polo',nombre:'Camisa polo piqué',cat:'Textil',costo:178.20,precio:199,sku:'TEXT-0005'},
   {id:'sudadera',nombre:'Sudadera con capucha',cat:'Textil',costo:230,precio:290},
   {id:'gorra-cinco',nombre:'Gorra 5 paneles',cat:'Gorras',costo:91.8,precio:110},
   {id:'gorra-malla',nombre:'Gorra trucker malla',cat:'Gorras',costo:28,precio:40},
   {id:'taza-blanca',nombre:'Taza cerámica 11 oz blanca',cat:'Tazas',costo:30.24,precio:45},
   {id:'taza-magica',nombre:'Taza mágica 11 oz',cat:'TAZAS',costo:40,precio:65},
   {id:'taza-color',nombre:'Taza de color 11 oz',cat:'Tazas',costo:38,precio:58},
   {id:'termo-acero',nombre:'Termo de acero 20 oz',cat:'Termos',costo:120,precio:170},
   {id:'termo-botella',nombre:'Botella de aluminio',cat:'Termos',costo:70,precio:99},
   {id:'llavero',nombre:'Llavero promocional',cat:'Promocional',costo:8,precio:15},
   {id:'libreta',nombre:'Libreta personalizada',cat:'Oficina',costo:24,precio:40},
   {id:'bolsa',nombre:'Bolsa de manta',cat:'Otros',costo:18,precio:30},
   {id:'lona',nombre:'Lona terminada',cat:'LONAS',costo:50,precio:85}
  ];
  mosTicket={lineas:[],clienteId:''};mosQ='';mosCat='';TEMA.preset='papel';aplicaTema();aplicaRol();limpiaGrupos();vaATab('mos');renderMostrador();
 },
 ticket(){return JSON.parse(JSON.stringify(mosTicket));},
 cot(){return JSON.parse(JSON.stringify(cot));}
};
