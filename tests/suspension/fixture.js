window.__qaSuspension={
 seed(){const g=nuevaCot(true);g.folio='COT-PRUEBA';g.cliente='Cliente de prueba';g.fecha='2026-11-02';g.desc='Playera de ejemplo';g.cantidad=20;g.costoArt=40;g._total=1480;guardadas=[g];renderSaved();},
 theme(mode){TEMA.preset=mode;TEMA.acento=mode==='papel'?'#d4541c':'';aplicaTema();},
 home(){vaATab('inicio');renderTablero();},
 saved(){const b=document.querySelector('#lz_sav [data-seclz]');if(b)b.click();savFiltro='todas';renderSaved();},
 sales(){try{abrePorAncla('#venChart')}catch{}},
 core(){window.__antesCot=JSON.stringify(cot);cotizacionNueva(false);reporte('ventas');bajaLibro({},'prohibido.xlsx');guardaCot().then(()=>{window.__guardoInvalido=true}).catch(()=>{});},
 sinCambios(){return window.__antesCot===JSON.stringify(cot)&&!window.__guardoInvalido},
 async cloudBlocked(){let n=0;try{await (await window.claude.use('db')).doc('cotizaciones/prueba').set({})}catch{n++};try{await (await window.claude.use('downloads')).save({filename:'prohibido.xlsx',data:new Blob(['x'])})}catch{n++};try{await (await window.claude.use('assets')).upload({name:'prueba.png'})}catch{n++};return n===3;}
};
