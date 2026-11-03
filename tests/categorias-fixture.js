window.__qaCategorias = {
  eval: code => eval(code),
  seed(){
    cat.arranque = {hecho:true};
    cat.articulos = [
      {id:"playera-a",nombre:"Playera algodón",cat:"Textil",costo:70,precio:95},
      {id:"playera-b",nombre:"Playera deportiva poliéster",cat:"Textil",costo:77,precio:105},
      {id:"sudadera",nombre:"Sudadera con capucha",cat:"Textil",costo:230,precio:290},
      {id:"taza-a",nombre:"Taza cerámica 11 oz",cat:"Tazas",costo:25,precio:45},
      {id:"taza-b",nombre:"Taza mágica",cat:"TAZAS",costo:35,precio:65},
      {id:"gorra",nombre:"Gorra trucker",cat:"Gorras",costo:28,precio:40},
      {id:"personalizado",nombre:"Modelo especial",cat:"Mi familia",costo:15,precio:25}
    ];
    cot = nuevaCot(false);cot.modo = "articulo";cot.articuloId = "";cot.desc="";cot.descAuto=true;
    cot.apps=[];cot.tallas=[];cot.armado=[];cot.cantidad=50;cot.cantManual=true;cot.qtyListo=true;
    guardaItemActivo(cot);TEMA.preset="papel";aplicaTema();
    vaATab("cot");renderCot();if(typeof guiaVaA === "function")guiaVaA("articulo");azArticulos();
  },
  get(){return JSON.parse(JSON.stringify(cot));},
  total(){return calc().total;}
};
