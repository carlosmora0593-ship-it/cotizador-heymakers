/* Interfaz de cotización conectada a cat, cot, calc() y guardadas de la app. */
(function(){
  "use strict";
  const tab=document.getElementById("tab-cot");
  if(!tab)return;
  const oldCols=tab.querySelector(".cols");
  if(!oldCols)return;
  const q=(s,r)=> (r||tab).querySelector(s);
  const byId=id=>document.getElementById(id);
  const artCard=q('.card.plegable[data-paso="articulo"]');
  const clientCard=q('.card.plegable[data-paso="cliente"]');
  const appsCard=q('.card.plegable[data-paso="apps"]');
  const sizeCard=q('.card.plegable[data-paso="tallas"]');
  const extrasCard=q('.card.plegable[data-paso="extras"]');
  const prodCard=q('.card.plegable[data-paso="prod"]');
  const strip=q("#tiraArts");
  const summary=q(".card.summary");
  if(!artCard||!clientCard||!appsCard||!sizeCard||!extrasCard||!prodCard||!summary)return;

  const studio=document.createElement("div");
  studio.id="hm-studio";
  studio.innerHTML=
    '<div class="hm-studio-grid">'+
      '<main class="hm-sheet" aria-label="Crear cotización">'+
        '<section class="hm-section hm-customer-section">'+
          '<div class="hm-section-head"><p class="hm-eyebrow"><span class="hm-step">1</span> Datos del cliente</p><span class="hm-section-note" id="hm-folio"></span></div>'+ 
          '<div class="hm-customer-grid" id="hm-client-fields"></div>'+ 
        '</section>'+ 
        '<section class="hm-section hm-product-section">'+
          '<div class="hm-section-head"><p class="hm-eyebrow"><span class="hm-step">2</span> Artículo o servicio</p><span id="hm-product-count" class="hm-section-note"></span></div>'+ 
          '<div class="hm-mode-options" id="hm-mode-options">'+
            '<button type="button" class="hm-mode-button" data-hm-mode="articulo" aria-pressed="false"><span class="hm-mode-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 4-5 3 2 5 3-1v9h8v-9l3 1 2-5-5-3-3 2a3 3 0 0 1-5 0Z"/></svg></span><span class="hm-mode-copy"><b>Artículo</b><small>Elige prendas, tazas, bolsas y más</small></span><span class="hm-mode-check">✓</span></button>'+ 
            '<button type="button" class="hm-mode-button" data-hm-mode="servicio" aria-pressed="false"><span class="hm-mode-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8V3h12v5M6 18H4V9h16v9h-2M7 14h10v7H7zM9 11h1"/></svg></span><span class="hm-mode-copy"><b>Servicio por medida</b><small>Impresión, vinil, DTF y otros trabajos</small></span><span class="hm-mode-check">✓</span></button>'+ 
          '</div>'+ 
          '<div class="hm-product-selection" id="hm-product-selection"><div class="hm-product-grid" id="hm-product-grid"></div>'+ 
          '<div class="hm-variant-section" id="hm-variant-section" hidden><div class="hm-variant-head"><b id="hm-variant-title">Elige el modelo</b><span>Opciones reales de tu catálogo</span></div><div class="hm-variant-grid" id="hm-variant-grid"></div></div></div>'+ 
          '<div class="hm-service-selection" id="hm-service-selection" hidden><div class="hm-service-intro" id="hm-service-intro"></div><div class="hm-service-fields" id="hm-service-fields"></div></div>'+ 
          '<div class="hm-item-details" id="hm-desc-slot"></div>'+ 
          '<div class="hm-product-controls"><div id="hm-qty-slot"></div><div class="hm-product-footer" id="hm-product-footer"><button type="button" class="hm-text-button" id="hm-open-catalog">Explorar catálogo completo ↗</button></div></div>'+ 
          '<div class="hm-items-section" id="hm-items-slot"></div>'+ 
        '</section>'+
        '<section class="hm-section" id="hm-tech-section">'+
          '<div class="hm-section-head"><p class="hm-eyebrow"><span class="hm-step">3</span> Personalización</p><span class="hm-section-note" id="hm-tech-count"></span></div>'+ 
          '<div class="hm-tech-grid" id="hm-tech-grid"></div>'+
          '<div class="hm-tech-footer"><span id="hm-tech-status">Elige una técnica para actualizar tu propuesta.</span><button type="button" class="hm-text-button" id="hm-tech-toggle" hidden>Ver todas</button></div>'+
          '<details class="hm-tech-advanced"><summary>Ubicaciones, medidas, materiales y archivos</summary><div class="hm-advanced-content" id="hm-apps-slot"></div></details>'+
        '</section>'+
        '<section class="hm-section" id="hm-sizes-section">'+
          '<div class="hm-section-head"><p class="hm-eyebrow"><span class="hm-step">4</span> Distribución de tallas</p><span class="hm-section-note" id="hm-size-hint">Las piezas deben sumar la cantidad del pedido</span></div>'+ 
          '<div class="hm-size-toolbar"><div class="hm-color-wrap"><label for="hm-color">Color del lote</label><input id="hm-color" placeholder="Ej. Negro" autocomplete="off"></div><span class="hm-size-note">Si agregas varios colores, captura cada combinación en la edición avanzada.</span></div>'+
          '<div id="hm-size-warning" class="hm-size-warning" hidden>Esta cotización tiene más de un color. Conservé todos tus datos; edita la distribución completa en las opciones avanzadas.</div>'+
          '<div class="hm-size-grid" id="hm-size-grid"></div>'+
          '<div class="hm-size-footer"><span id="hm-size-total"></span><b id="hm-size-match"></b></div>'+
          '<details class="hm-size-advanced"><summary>Editar filas por talla y color</summary><div class="hm-advanced-content" id="hm-sizes-slot"></div></details>'+
        '</section>'+
        '<section class="hm-section"><details class="hm-advanced-card"><summary>Más opciones de precio, cargos y producción</summary>'+
          '<div class="hm-advanced-stack" id="hm-options-slot"></div></details></section>'+
      '</main>'+
      '<aside id="hm-summary" aria-label="Resumen de la cotización"></aside>'+
    '</div>'+
    '<section class="hm-recent" aria-label="Cotizaciones recientes">'+
      '<div class="hm-recent-head"><h2>Cotizaciones recientes <span id="hm-recent-count">(0)</span></h2><button type="button" class="hm-text-button" id="hm-view-all">Ver todas ↗</button></div>'+
      '<div class="hm-recent-list" id="hm-recent-list"></div>'+
    '</section>';

  const hero=q(".hm-cot-hero");
  oldCols.parentNode.insertBefore(studio,oldCols);
  const clientBody=clientCard.querySelector(".body");
  const getRow=(id)=>{const el=byId(id);return el?el.closest(".body > div"):null};
  const client= getRow("c_cliente");
  const contact=getRow("c_contacto");
  const reference=getRow("c_ref");
  const customerSelect=getRow("c_clienteSel");
  const qtyRow=byId("c_qty")&&byId("c_qty").closest(".grid > div");
  const descRow=byId("c_desc")&&byId("c_desc").closest(".grid > div");
  const serviceSelectRow=byId("c_svc")&&byId("c_svc").closest(".grid > div");
  const serviceWidthRow=byId("c_svcAncho")&&byId("c_svcAncho").closest(".grid > div");
  const serviceHeightRow=byId("c_svcAlto")&&byId("c_svcAlto").closest(".grid > div");
  const serviceBuildRow=byId("c_svcResumen")&&byId("c_svcResumen").closest(".grid > div");
  const serviceNote=artCard.querySelector('.note[data-solo="servicio"]');
  if(client)studio.querySelector("#hm-client-fields").appendChild(client);
  if(qtyRow)studio.querySelector("#hm-qty-slot").appendChild(qtyRow);
  if(contact)studio.querySelector("#hm-client-fields").appendChild(contact);
  if(reference)studio.querySelector("#hm-client-fields").appendChild(reference);
  if(customerSelect)studio.querySelector("#hm-client-fields").appendChild(customerSelect);
  if(descRow)studio.querySelector("#hm-desc-slot").appendChild(descRow);
  [serviceNote,serviceSelectRow,serviceWidthRow,serviceHeightRow,serviceBuildRow].forEach(row=>{if(row)studio.querySelector(row===serviceNote?"#hm-service-intro":"#hm-service-fields").appendChild(row)});
  if(serviceSelectRow){serviceSelectRow.classList.add("hm-service-select-row");const l=serviceSelectRow.querySelector("label");if(l)l.textContent="Tipo de impresión o material"}
  if(serviceWidthRow){serviceWidthRow.classList.add("hm-service-dimension-row");const l=serviceWidthRow.querySelector("label");if(l)l.textContent="Ancho de impresión (cm)"}
  if(serviceHeightRow){serviceHeightRow.classList.add("hm-service-dimension-row");const l=serviceHeightRow.querySelector("label");if(l)l.textContent="Largo de impresión (cm)"}
  if(serviceBuildRow)serviceBuildRow.classList.add("hm-service-build-row");
  if(clientBody)clientBody.remove();

  studio.querySelector("#hm-apps-slot").appendChild(appsCard);
  studio.querySelector("#hm-sizes-slot").appendChild(sizeCard);
  studio.querySelector("#hm-options-slot").append(artCard,extrasCard,prodCard);
  if(strip)studio.querySelector("#hm-items-slot").appendChild(strip);
  const addItem=byId("btnAddArt");
  if(addItem)studio.querySelector("#hm-product-footer").appendChild(addItem);
  studio.querySelector("#hm-summary").appendChild(summary);
  oldCols.remove();

  const clientWrap=studio.querySelector("#hm-client-fields > div");
  const qtyWrap=studio.querySelector("#hm-qty-slot > div");
  if(clientWrap){
    const label=clientWrap.querySelector("label");
    if(label){label.innerHTML='Cliente o empresa <small>opcional</small>';label.htmlFor="c_cliente";}
    clientWrap.classList.add("hm-client-wrap");
  }
  if(qtyWrap){
    const label=qtyWrap.querySelector("label");
    if(label){label.textContent="Cantidad de piezas";label.htmlFor="c_qty";}
    qtyWrap.classList.add("hm-qty-wrap");
  }
  const clientFields=studio.querySelector("#hm-client-fields");
  clientFields.querySelectorAll(":scope > div").forEach(d=>{
    const label=d.querySelector("label");if(label)label.classList.add("hm-extra-label");
  });
  if(customerSelect){const selectLabel=customerSelect.querySelector("label");if(selectLabel)selectLabel.textContent="O elige un cliente guardado";}
  if(descRow){const label=descRow.querySelector("label");if(label){label.textContent="Descripción para el cliente";label.htmlFor="c_desc";}descRow.classList.add("hm-description-row");}
  const serviceLabel=serviceBuildRow&&serviceBuildRow.querySelector("label");
  if(serviceLabel)serviceLabel.textContent="Armado del material · sin tallas";
  const buildButton=serviceBuildRow&&serviceBuildRow.querySelector("[data-abrearmado]");
  if(buildButton){buildButton.textContent="Abrir armado del material";buildButton.classList.add("hm-open-material");}
  if(addItem){addItem.classList.add("hm-add-item");addItem.textContent="+ Agregar otro artículo";}
  const techHeading=studio.querySelector("#hm-tech-section .hm-eyebrow");
  if(techHeading)techHeading.innerHTML='<span class="hm-step">4</span> Técnica de personalización';
  const sizeHeading=studio.querySelector("#hm-sizes-section .hm-eyebrow");
  if(sizeHeading)sizeHeading.innerHTML='<span class="hm-step">3</span> Tallas y colores';

  const actionBody=summary.querySelector(".body");
  const saveButton=byId("btnSave");
  if(actionBody&&saveButton){
    const actionList=document.createElement("div");
    actionList.className="hm-action-grid";
    actionList.id="hm-action-list";
    const actionIcons={
      btnConfirmar:'<path d="m5 12 4 4L19 6"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
      btnCobrar:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9h.01M17 15h.01"/>',
      btnOrden:'<path d="M9 4h6M9 3h6v3H9z"/><path d="M7 5H5v16h14V5h-2M8 11h8M8 15h5"/>',
      btnPrint:'<path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7zM17 11h.01"/>',
      btnEnviar:'<path d="m21 3-7.2 18-3.6-7.2L3 10.2 21 3Z"/><path d="M10.2 13.8 15 9"/>',
      btnTerminar:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
      btnNew:'<path d="M12 5v14M5 12h14"/>'
    };
    Array.from(actionBody.querySelectorAll("button")).forEach(b=>{
      if(b===saveButton)return;
      const addIcon=()=>{
        if(b.querySelector(":scope > .hm-action-icon"))return;
        const icon=document.createElement("span");
        icon.className="hm-action-icon";
        icon.setAttribute("aria-hidden","true");
        icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(actionIcons[b.id]||'<path d="M12 5v14M5 12h14"/>')+'</svg>';
        b.prepend(icon);
      };
      addIcon();
      new MutationObserver(addIcon).observe(b,{childList:true});
      actionList.appendChild(b);
    });
    saveButton.textContent="Guardar cotización";
    const primary=document.createElement("div");primary.className="hm-summary-actions";
    const actionCaption=document.createElement("div");actionCaption.className="hm-action-caption";actionCaption.textContent="Acciones del pedido";
    primary.append(saveButton,actionCaption,actionList);
    actionBody.replaceChildren(primary);
  }
  const price=summary.querySelector(".price");
  if(price){
    const meta=document.createElement("div");
    meta.className="hm-summary-meta";
    meta.innerHTML='<div><span>Tu propuesta</span><b id="hm-proposal-title">Cotización nueva</b><small id="hm-proposal-sub">Ajusta cantidad y personalización</small></div><div class="hm-summary-icon" id="hm-proposal-icon" aria-hidden="true">✦</div>';
    price.insertBefore(meta,price.firstChild);
  }
  const breakDown=byId("r_break");
  if(breakDown){
    const profit=document.createElement("div");profit.className="hm-profit";profit.id="hm-profit";
    profit.innerHTML='<span>Utilidad estimada</span><strong id="hm-profit-value">—</strong>';
    breakDown.insertAdjacentElement("afterend",profit);
  }

  function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
  function articleLabel(a){
    const n=norm(a.nombre);
    if(/playera|camiseta|polo/.test(n))return "Playera";
    if(/sudader/.test(n))return "Sudadera";
    if(/tote|bolsa/.test(n))return "Tote bag";
    if(/taza|termo|anfora|vaso/.test(n))return /taza/.test(n)?"Taza":(a.nombre.split(" ")[0]||"Termo");
    if(/gorra|cap/.test(n))return "Gorra";
    return a.cat||"Producto";
  }
  function isDrinkware(a){return !!a&&/taza|termo|anfora|vaso/.test(norm((a.cat||"")+" "+(a.nombre||"")))}
  function isTextileArticle(a){return !!a&&(/playera|camiseta|polo|sudader|hoodie|textil/.test(norm((a.cat||"")+" "+(a.nombre||"")))||!!a.tallas)}
  function productIcon(a){
    const photo=typeof fotoDe==="function"?fotoDe(a):(a&&a.foto?String(a.foto):"");
    if(photo)return '<img class="hm-catalog-photo" src="'+esc(photo)+'" alt="" loading="lazy">';
    const n=norm((a.cat||"")+" "+(a.nombre||""));
    const paths=/taza|termo|anfora|vaso/.test(n)
      ?'<path fill="#b9a8ed" stroke="#65528f" stroke-width="1.1" d="M6 7h11v10a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path fill="none" stroke="#65528f" stroke-width="1.4" d="M17 10h2a3 3 0 0 1 0 6h-2M9 4h5"/><path fill="none" stroke="#eee8ff" stroke-width="1.3" d="M8 9v7"/>'
      :/gorra|cap/.test(n)
      ?'<path fill="#f4a782" stroke="#93513c" stroke-width="1.1" d="M3 15h18l-3 3H7a4 4 0 0 1-4-3Z"/><path fill="#ffd2ae" stroke="#93513c" stroke-width="1.1" d="M5 15a7 7 0 0 1 14 0z"/><path fill="none" stroke="#93513c" stroke-width="1.2" d="M11 8V5"/>'
      :/tote|bolsa/.test(n)
      ?'<path fill="#e6b578" stroke="#805a34" stroke-width="1.1" d="M5 9h14l1 12H4z"/><path fill="none" stroke="#805a34" stroke-width="1.4" d="M8 9V6a4 4 0 0 1 8 0v3"/><path fill="none" stroke="#ffe5bd" stroke-width="1.2" d="M7 11h10"/>'
      :/sudader|hoodie/.test(n)
      ?'<path fill="#d99b72" stroke="#80533f" stroke-width="1.1" d="m8 5-4.4 2.4L5 13l3-1v8.5h8V12l3 1 1.4-5.6L16 5c-.4 2-1.8 3.1-4 3.1S8.4 7 8 5Z"/><path fill="#f1c3a5" stroke="#80533f" stroke-width="1" d="M8.7 5.1C9 2.9 10.3 1.8 12 1.8s3 1.1 3.3 3.3c-.8 1.3-1.9 2-3.3 2s-2.5-.7-3.3-2Z"/><path fill="none" stroke="#80533f" stroke-width="1" d="m10 7 1 3m3-3-1 3"/><path fill="#efbd99" stroke="#80533f" stroke-width=".9" d="M9 15h6v3H9z"/>'
      :/playera|camiseta|polo|textil/.test(n)
      ?'<path fill="#92d47a" stroke="#386c48" stroke-width="1.1" d="m8 4-5 3 2 5 3-1v9h8v-9l3 1 2-5-5-3-3 2a3 3 0 0 1-5 0Z"/><path fill="none" stroke="#386c48" stroke-width="1.1" d="M9 4c.4 1.5 1.4 2.3 3 2.3S14.6 5.5 15 4"/><path fill="none" stroke="#dff4d2" stroke-width="1.2" d="M8.5 16h7"/>'
      :'<path fill="#83d9cb" stroke="#347c73" stroke-width="1.1" d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5z"/><path fill="none" stroke="#347c73" stroke-width="1.1" d="m5.5 8 6.5 3.5L18.5 8M12 11.5V20"/><path fill="none" stroke="#d8fff4" stroke-width="1.1" d="m8 6 4 2 4-2"/>';
    return '<svg class="hm-product-illustration" viewBox="0 0 24 24" aria-hidden="true">'+paths+'</svg>';
  }
  function serviceIcon(){return '<svg class="hm-product-illustration hm-service-illustration" viewBox="0 0 32 32" aria-hidden="true"><path fill="#bfe8cf" stroke="#dffff0" stroke-width="1.2" d="M8 4h16v8H8z"/><path fill="#f5fbf5" stroke="#9bd1b2" stroke-width="1.2" d="M6 12h20a3 3 0 0 1 3 3v7h-5v6H8v-6H3v-7a3 3 0 0 1 3-3Z"/><path fill="#76c897" stroke="#2e7756" stroke-width="1.1" d="M9 20h14v8H9z"/><path fill="none" stroke="#337e5b" stroke-width="1.2" d="M10 8h12M11 23h10M11 26h7"/><circle cx="24" cy="16" r="1.2" fill="#76c897"/></svg>'}
  function proposalIcon(article,isService){
    if(article)return productIcon(article);
    if(isService)return serviceIcon();
    return '<svg class="hm-product-illustration" viewBox="0 0 24 24" aria-hidden="true"><path fill="#d9ed75" stroke="#59783b" stroke-width="1.1" d="m12 2 2.4 6.1L21 6l-3 6 4 4-6.8.2L12 22l-3.2-5.8L2 16l4-4-3-6 6.6 2.1z"/></svg>';
  }
  function featuredProducts(){
    const all=Array.isArray(cat&&cat.articulos)?cat.articulos.filter(a=>a&&a.id):[];
    const picks=[];
    const rules=[/playera|camiseta|polo/i,/sudader/i,/tote|bolsa/i,/taza|termo|anfora|vaso/i];
    rules.forEach(re=>{const found=all.find(a=>re.test((a.nombre||"")+" "+(a.cat||""))&&!picks.some(p=>p.id===a.id));if(found)picks.push(found)});
    all.forEach(a=>{if(picks.length<4&&!picks.some(p=>p.id===a.id))picks.push(a)});
    const active=all.find(a=>a.id===cot.articuloId);
    if(active&&!picks.some(a=>a.id===active.id)){
      const sameKind=picks.findIndex(a=>articleLabel(a)===articleLabel(active));
      if(sameKind>=0)picks[sameKind]=active;
      else if(picks.length>=4)picks[picks.length-1]=active;else picks.push(active);
    }
    return picks.slice(0,4);
  }
  function renderProducts(){
    const grid=byId("hm-product-grid");if(!grid)return;
    const articles=featuredProducts();
    const current=(cat.articulos||[]).find(a=>a.id===cot.articuloId);
    const activeMode=cot.modo||"articulo";
    const isService=activeMode==="servicio";
    byId("hm-product-count").textContent=isService?"Impresión y armado de material":"Elige una familia de artículos";
    grid.hidden=isService;
    byId("hm-product-selection").hidden=isService;
    byId("hm-service-selection").hidden=!isService;
    [serviceNote,serviceSelectRow,serviceWidthRow,serviceHeightRow,serviceBuildRow].forEach(row=>{if(row)row.hidden=!isService});
    if(isService&&typeof renderServicio==="function")renderServicio();
    studio.querySelectorAll("[data-hm-mode]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.hmMode===activeMode));
    if(!articles.length){
      grid.innerHTML='<div class="empty" style="grid-column:1/-1">El catálogo todavía no tiene artículos. Abre el catálogo para agregar uno o configura un servicio por medida.</div>';
    }else{
      grid.innerHTML=articles.map((a,i)=>{
        const title=articleLabel(a);
        const detail=(a.nombre||"").replace(new RegExp("^"+title+"\\s*[-—:]?\\s*","i"),"");
        const visiblePrice=a.id===cot.articuloId&&num(cot.precioArt)>0?num(cot.precioArt):num(a.precio);
        const price=visiblePrice>0?"Desde "+mx(visiblePrice)+" / pza":"Precio pendiente";
        return '<button type="button" class="hm-product-card" data-hm-product="'+esc(a.id)+'" aria-pressed="'+(a.id===cot.articuloId&&activeMode!=="servicio")+'" style="animation-delay:'+(i*35)+'ms">'+
          '<span class="hm-product-ico">'+productIcon(a)+'</span><b>'+esc(title)+'</b><small title="'+esc(a.nombre)+'">'+esc(detail||a.cat||a.nombre)+'</small><span class="hm-product-price">'+esc(price)+'</span></button>';
      }).join("");
    }
    const selected=(cat.articulos||[]).find(a=>a.id===cot.articuloId);
    renderVariants(selected);
    const custom=byId("hm-current-item");
    if(custom)custom.textContent=selected?(selected.nombre||"Artículo seleccionado"):"";
    const hasSizes=!isService&&typeof esTextil==="function"&&esTextil(cot);
    byId("hm-sizes-section").hidden=!hasSizes;
    const techHeading=studio.querySelector("#hm-tech-section .hm-eyebrow");
    if(techHeading)techHeading.innerHTML='<span class="hm-step">'+(hasSizes?"4":"3")+'</span> Técnica de personalización';
    byId("hm-tech-section").hidden=isService;
    const qtyLabel=byId("c_qty")&&byId("c_qty").closest("div")&&byId("c_qty").closest("div").querySelector("label");
    if(qtyLabel)qtyLabel.textContent=isService?"Cantidad de impresiones":"Cantidad de piezas";
    const catalogButton=byId("hm-open-catalog");if(catalogButton)catalogButton.hidden=isService;
    if(addItem)addItem.textContent=isService?"+ Agregar otro artículo o servicio":"+ Agregar otro artículo";
    renderSizes();
  }
  function renderVariants(current){
    const section=byId("hm-variant-section"),grid=byId("hm-variant-grid");
    const desc=byId("c_desc"),descLabel=desc&&desc.closest("div")&&desc.closest("div").querySelector("label");
    const isService=(cot.modo||"articulo")==="servicio";
    const drink=current&&isDrinkware(current),textile=current&&isTextileArticle(current);
    if(descLabel)descLabel.textContent=isService?"Descripción del servicio por medida":(drink?"Modelo, capacidad (oz) o color":(textile?"Modelo o color de la prenda":"Descripción para el cliente"));
    if(desc)desc.placeholder=isService?"Ej. Impresión DTF en rollo, 60 × 80 cm":(drink?"Ej. Blanca · 15 oz · asa de color":(textile?"Ej. Playera cuello redondo · color negro":"Detalles del artículo"));
    if(!section||!grid)return;
    const peers=current?(cat.articulos||[]).filter(a=>a&&a.id&&articleLabel(a)===articleLabel(current)):[];
    section.hidden=!(cot.modo!=="servicio"&&current&&peers.length>1);
    const title=byId("hm-variant-title");
    if(title)title.textContent=drink?"Elige modelo, capacidad o color":"Elige modelo o variante de "+articleLabel(current||{}).toLowerCase();
    grid.innerHTML=peers.map((a,i)=>'<button type="button" class="hm-variant-card" data-hm-product="'+esc(a.id)+'" aria-pressed="'+(a.id===current.id)+'" style="animation-delay:'+(i*30)+'ms"><span class="hm-variant-icon">'+productIcon(a)+'</span><span><b>'+esc(a.nombre||articleLabel(a))+'</b><small>'+(num(a.precio)>0?'Desde '+esc(mx(num(a.precio)))+' por pieza':'Precio pendiente')+'</small></span></button>').join("");
  }
  function techDescription(t){
    const n=norm(t.nombre);
    if(/dtf/.test(n))return "Color y detalle";
    if(/subli/.test(n))return "Color permanente";
    if(/serigraf/.test(n))return "Ideal por volumen";
    if(/bord/.test(n))return "Acabado premium";
    return ({area:"Por área",tintas:"Por número de tintas",tiempo:"Por tiempo",puntadas:"Por puntadas"}[t.modo]||"Técnica del taller");
  }
  function techIcon(t){return ({area:"✳",tintas:"▤",tiempo:"◷",puntadas:"✣"}[t.modo]||"✳")}
  function primaryApp(){return cot&&cot.apps&&cot.apps[0]}
  function featuredTechniques(){
    const all=Array.isArray(cat&&cat.tecnicas)?cat.tecnicas.filter(t=>t&&t.id):[];
    const chosen=[];
    const rules=[/dtf/i,/subli/i,/serigraf/i,/bord/i];
    rules.forEach(re=>{const found=all.find(t=>re.test(t.nombre||"")&&!chosen.some(x=>x.id===t.id));if(found)chosen.push(found)});
    all.forEach(t=>{if(chosen.length<4&&!chosen.some(x=>x.id===t.id))chosen.push(t)});
    const active=primaryApp();
    if(active&&!chosen.some(t=>t.id===active.tecnicaId)){
      if(chosen.length>=4)chosen[chosen.length-1]=all.find(t=>t.id===active.tecnicaId)||chosen[chosen.length-1];
    }
    return {all,chosen:chosen.slice(0,4)};
  }
  function renderTechniques(){
    const grid=byId("hm-tech-grid");if(!grid)return;
    const {all,chosen}=featuredTechniques();
    const active=primaryApp();
    const techById=id=>all.find(t=>t.id===id);
    const rest=all.filter(t=>!chosen.some(c=>c.id===t.id));
    grid.innerHTML=chosen.map((t,i)=>'<button type="button" class="hm-tech-card" data-hm-tech="'+esc(t.id)+'" aria-pressed="'+(!!active&&active.tecnicaId===t.id)+'" style="animation-delay:'+(i*35)+'ms"><span class="hm-tech-ico">'+techIcon(t)+'</span><b>'+esc(t.nombre)+'</b><small>'+esc(techDescription(t))+'</small></button>').join("")+
      rest.map((t,i)=>'<button type="button" class="hm-tech-card hm-tech-more" data-hm-tech="'+esc(t.id)+'" aria-pressed="'+(!!active&&active.tecnicaId===t.id)+'" style="animation-delay:'+(i*25)+'ms"><span class="hm-tech-ico">'+techIcon(t)+'</span><b>'+esc(t.nombre)+'</b><small>'+esc(techDescription(t))+'</small></button>').join("");
    grid.classList.toggle("hm-show-all",grid.dataset.all==="1");
    const toggle=byId("hm-tech-toggle");
    toggle.hidden=rest.length===0;
    toggle.textContent=grid.dataset.all==="1"?"Mostrar menos":"Ver todas las técnicas ("+all.length+")";
    byId("hm-tech-count").textContent=all.length+" disponibles";
    const activeTech=active&&techById(active.tecnicaId);
    byId("hm-tech-status").textContent=activeTech?"Aplicación principal: "+activeTech.nombre:"Agrega una ubicación para sumar personalización a la propuesta.";
  }
  function labelsForSizes(){
    const base=["CH","M","G","XG","XXG","Unitalla"];
    const seen=(cot.tallas||[]).map(t=>String(t.talla||"").trim()).filter(Boolean);
    seen.forEach(s=>{if(!base.some(b=>norm(b)===norm(s)))base.push(s)});
    return base;
  }
  function colorGroups(){
    const colors=[...new Set((cot.tallas||[]).filter(t=>num(t.cant)>0).map(t=>String(t.color||"").trim()).filter(Boolean))];
    return colors;
  }
  function renderSizes(){
    const grid=byId("hm-size-grid");if(!grid)return;
    const colors=colorGroups(), multi=colors.length>1;
    byId("hm-size-warning").hidden=!multi;
    const color=byId("hm-color");
    if(color&&document.activeElement!==color)color.value=colors[0]||((cot.tallas||[]).find(t=>t.color)||{}).color||"";
    color.disabled=multi;
    const labels=labelsForSizes();
    grid.innerHTML=labels.map((s,i)=>{
      const item=(cot.tallas||[]).find(t=>norm(t.talla)===norm(s)&&(!multi||String(t.color||"").trim()===colors[0]));
      return '<div class="hm-size-field"><label for="hm-size-'+i+'">'+esc(s)+'</label><input id="hm-size-'+i+'" type="number" min="0" step="1" inputmode="numeric" data-hm-size="'+esc(s)+'" value="'+(item?Math.round(num(item.cant)):0)+'"'+(multi?' disabled':'')+' aria-label="Cantidad talla '+esc(s)+'"></div>';
    }).join("");
    grid.querySelectorAll("[data-hm-size]").forEach(input=>{
      input.addEventListener("input",()=>updateSize(input.dataset.hmSize,input.value));
    });
    updateSizeStatus();
  }
  function updateSizeStatus(){
    const total=sumaTallas(cot),qty=Math.max(1,Math.round(num(cot.cantidad,1)));
    byId("hm-size-total").innerHTML='Distribuidas: <b>'+total+'</b> piezas';
    if(total===qty){byId("hm-size-match").textContent="✓ Coincide con tu pedido";byId("hm-size-match").style.color="#327556"}
    else{byId("hm-size-match").textContent=total>0?"Faltan "+(qty-total)+" piezas":"Agrega las tallas";byId("hm-size-match").style.color=total>qty?"#a46c27":"#858c83"}
  }
  function updateSize(label,value){
    if(colorGroups().length>1)return;
    const color=byId("hm-color").value.trim();
    const amount=Math.max(0,Math.round(num(value)));
    let item=(cot.tallas||[]).find(t=>norm(t.talla)===norm(label)&&String(t.color||"").trim()===color);
    if(amount>0){
      if(!item){item={id:uid(),talla:label,color,cant:amount};cot.tallas.push(item)}
      else item.cant=amount;
      item.color=color;
    }else if(item){cot.tallas=cot.tallas.filter(t=>t!==item)}
    cot.cantManual=false;
    const total=sumaTallas(cot);
    cot.cantidad=Math.max(1,total);
    const qty=byId("c_qty");if(qty)qty.value=cot.cantidad;
    if(typeof pintaSumaTallas==="function")pintaSumaTallas();
    if(typeof refrescaCostos==="function")refrescaCostos();
    updateSizeStatus();
  }
  function setColor(value){
    if(colorGroups().length>1)return;
    const color=value.trim();
    (cot.tallas||[]).forEach(t=>{if(num(t.cant)>0)t.color=color});
    if(typeof renderTallas==="function")renderTallas();
    if(typeof refrescaCostos==="function")refrescaCostos();
    renderSizes();
  }
  function renderSummary(){
    if(!summary||!cot)return;
    const total=typeof calcDe==="function"?calcDe(cot):calc();
    const article=(cat.articulos||[]).find(a=>a.id===cot.articuloId);
    const title=cot.modo==="servicio"?(cot.desc||"Servicio por medida"):(article?articleLabel(article):(cot.desc||"Artículo personalizado"));
    const tech=primaryApp()&&(cat.tecnicas||[]).find(t=>t.id===primaryApp().tecnicaId);
    const iconBox=byId("hm-proposal-icon");
    if(iconBox)iconBox.innerHTML=proposalIcon(article,cot.modo==="servicio");
    const titleEl=byId("hm-proposal-title");if(titleEl)titleEl.textContent=title;
    const sub=byId("hm-proposal-sub");
    if(sub)sub.textContent=(total.qty||0)+(cot.modo==="servicio"?" impresiones":" piezas")+(tech?" · "+tech.nombre:"")+(cot.folio?" · "+cot.folio:"");
    const profit=byId("hm-profit"),profitValue=byId("hm-profit-value");
    const canSee=typeof veDetalle==="function"&&veDetalle();
    if(profit){profit.hidden=!canSee;if(canSee&&profitValue)profitValue.textContent=mx(total.utilidad)+" · "+num(total.margenReal).toFixed(0)+"%"}
    const folio=byId("hm-folio");if(folio)folio.textContent=cot.folio||"";
    renderRecent();
  }
  function renderRecent(){
    const list=byId("hm-recent-list");if(!list||typeof guardadas==="undefined")return;
    const rows=(guardadas||[]).slice().reverse().slice(0,3);
    byId("hm-recent-count").textContent="("+((guardadas||[]).length)+")";
    if(!rows.length){list.innerHTML='<div class="hm-recent-empty" style="grid-column:1/-1">Aquí aparecerán las cotizaciones que guardes.</div>';return}
    list.innerHTML=rows.map(g=>{
      let r;try{r=calcDe(g)}catch(e){r={total:num(g._total),qty:num(g.cantidad)}}
      const name=g.cliente||"Sin cliente";
      return '<button type="button" class="hm-recent-card" data-load="'+esc(g.folio)+'"><b>'+esc(name)+'</b><strong>'+mx(r.total||g._total||0)+'</strong><small>'+esc(g.folio)+' · '+esc(g.fecha||"")+' · '+Math.round(num(r.qty||g.cantidad))+' piezas</small></button>';
    }).join("");
  }
  function selectProduct(id){
    if(cot.modo==="servicio"){
      const mode=byId("modoSwitch")&&byId("modoSwitch").querySelector('[data-modo="articulo"]');
      if(mode)mode.click();
    }
    const select=byId("c_art");if(!select)return;
    select.value=id;
    select.dispatchEvent(new Event("change",{bubbles:true}));
    renderStudio();
  }
  function selectTechnique(id){
    if(cot.modo==="servicio")return;
    if(!cot.apps||!cot.apps.length){const add=byId("addApp");if(add)add.click()}
    requestAnimationFrame(()=>{
      const select=studio.querySelector('#apps select[data-k="tecnicaId"]');
      if(select){select.value=id;select.dispatchEvent(new Event("change",{bubbles:true}))}
      else if(cot.apps&&cot.apps[0]){cot.apps[0].tecnicaId=id;renderApps();renderResumen()}
      renderStudio();
    });
  }
  function renderStudio(){
    if(!studio.isConnected)return;
    if(strip)strip.hidden=!cot.items||cot.items.length<=1;
    renderProducts();renderTechniques();renderSummary();
  }
  function trackButtonSpotlight(root){
    if(!root||root.dataset.hmSpotlightReady)return;
    root.dataset.hmSpotlightReady="1";
    function prepare(button){
      if(!button.querySelector(":scope > .hm-button-light")){
        const light=document.createElement("span");
        light.className="hm-button-light";light.setAttribute("aria-hidden","true");
        button.prepend(light);
      }
      button.classList.add("hm-spot-button");
    }
    function follow(e){
      if(e.pointerType==="touch")return;
      const button=e.target&&e.target.closest("button");
      if(!button||!root.contains(button))return;
      const r=button.getBoundingClientRect();
      prepare(button);
      button.style.setProperty("--button-x",(e.clientX-r.left)+"px");
      button.style.setProperty("--button-y",(e.clientY-r.top)+"px");
    }
    root.addEventListener("pointerover",follow);
    root.addEventListener("pointermove",follow);
    root.addEventListener("focusin",e=>{
      const button=e.target&&e.target.closest("button");
      if(button&&root.contains(button))prepare(button);
    });
  }
  function initHomeCommand(){
    const home=document.getElementById("tab-inicio"),hero=home&&home.querySelector(".tbHero");
    if(!home||!hero||home.querySelector("#hm-home-command"))return;
    const panel=document.createElement("section");
    panel.id="hm-home-command";panel.className="hm-home-command";panel.setAttribute("aria-label","Centro de mando del taller");
    panel.innerHTML='<div class="hm-home-command-top">'+
      '<div class="hm-home-orbit" aria-hidden="true"><i></i><i></i><i></i><span>HM</span></div>'+ 
      '<div class="hm-home-command-copy"><div class="hm-home-kicker"><i></i> EL TALLER EN MOVIMIENTO</div><h2>Tu siguiente gran idea empieza aquí.</h2><p>Un vistazo claro para elegir el próximo paso de tu día.</p></div>'+ 
      '<div class="hm-home-next"><small>PRÓXIMO MOVIMIENTO</small><b id="hm-home-next-title">Todo listo para comenzar</b><span id="hm-home-next-note">Abre una sección y sigue el ritmo del taller.</span><button type="button" id="hm-home-next-open" data-hm-home-tab="cot">Abrir cotizador <span aria-hidden="true">↗</span></button></div>'+ 
      '</div><div class="hm-home-flow" aria-label="Etapas del trabajo">'+
      '<button type="button" class="hm-home-stage" data-hm-home-tab="cot"><span class="hm-home-stage-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/></svg></span><span class="hm-home-stage-copy"><b>Cotizar</b><small>Crear propuesta</small></span><strong class="hm-home-stage-value">+</strong></button>'+ 
      '<button type="button" class="hm-home-stage" data-hm-home-tab="sav"><span class="hm-home-stage-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3H7zM5 5H4v16h16V5h-1"/><path d="m8 13 2.5 2.5L16 10"/></svg></span><span class="hm-home-stage-copy"><b>Pedidos</b><small>Dar seguimiento</small></span><strong class="hm-home-stage-value">—</strong></button>'+ 
      '<button type="button" class="hm-home-stage" data-hm-home-tab="pro"><span class="hm-home-stage-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v3H9zM7 5H5v16h14V5h-2"/><path d="M8 11h8M8 15h5"/></svg></span><span class="hm-home-stage-copy"><b>Producción</b><small>Avanzar órdenes</small></span><strong class="hm-home-stage-value">—</strong></button>'+ 
      '<button type="button" class="hm-home-stage" data-hm-home-tab="caj"><span class="hm-home-stage-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9h.01M17 15h.01"/></svg></span><span class="hm-home-stage-copy"><b>Caja</b><small>Cerrar el día</small></span><strong class="hm-home-stage-value">—</strong></button>'+ 
      '</div><div class="hm-home-command-foot"><span><i></i> <b id="hm-home-clock">—</b> · Panel sincronizado con la actividad del taller</span><span class="hm-home-foot-wave" aria-hidden="true">〰</span></div>';
    hero.insertAdjacentElement("afterend",panel);

    function update(){
      const native=[...home.querySelectorAll("#tbAccesos .tbAcceso")];
      const stageButtons=[...panel.querySelectorAll(".hm-home-stage")];
      stageButtons.forEach(button=>{
        const key=button.dataset.hmHomeTab,nativeButton=native.find(item=>item.dataset.tbtab===key);
        button.hidden=!nativeButton;
        if(!nativeButton)return;
        const nativeValue=nativeButton.querySelector(".tbAccN");
        const count=nativeValue?[...nativeValue.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent.trim()).join("").trim():"";
        const note=nativeValue&&nativeValue.querySelector("i")?nativeValue.querySelector("i").textContent.trim():"";
        const value=button.querySelector(".hm-home-stage-value"),sub=button.querySelector(".hm-home-stage-copy small");
        if(value)value.textContent=count||(key==="cot"?"+":"—");
        if(sub&&note)sub.textContent=note;
        ["mal","aviso","bien"].forEach(tone=>button.classList.toggle("is-"+tone,nativeButton.classList.contains(tone)));
      });
      const priority=["pro","sav","caj"];
      const countFor=item=>{
        const node=item&&item.querySelector(".tbAccN");
        const direct=node?[...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent.trim()).join("").trim():"";
        const note=node&&node.querySelector("i")?node.querySelector("i").textContent:"";
        return /\d/.test(direct+" "+note)&&Number((direct+" "+note).replace(/[^0-9]/g,""))>0;
      };
      const candidate=priority.map(key=>native.find(item=>item.dataset.tbtab===key)).find(item=>item&&(item.classList.contains("mal")||item.classList.contains("aviso")))
        ||priority.map(key=>native.find(item=>item.dataset.tbtab===key)).find(item=>countFor(item))
        ||native.find(item=>item&&item.dataset.tbtab==="cot")||native[0];
      const next=candidate?candidate.dataset.tbtab:"cot";
      const title=candidate&&candidate.querySelector(".tbAccTxt b")?candidate.querySelector(".tbAccTxt b").textContent.trim():"Cotizar";
      const note=candidate&&candidate.querySelector(".tbAccN i")?candidate.querySelector(".tbAccN i").textContent.trim():"Inicia una nueva propuesta";
      const needsAttention=!!candidate&&(candidate.classList.contains("mal")||candidate.classList.contains("aviso"));
      const nextTitle=panel.querySelector("#hm-home-next-title"),nextNote=panel.querySelector("#hm-home-next-note"),nextOpen=panel.querySelector("#hm-home-next-open");
      if(nextTitle)nextTitle.textContent=needsAttention?"Revisa "+title.toLowerCase():title==="Cotizar"?"Todo listo para comenzar":"Sigue el flujo del taller";
      if(nextNote)nextNote.textContent=needsAttention?"Hay actividad que requiere atención · "+note:title==="Cotizar"?"Puedes iniciar una cotización nueva ahora.":note;
      if(nextOpen){nextOpen.dataset.hmHomeTab=next;nextOpen.innerHTML=(title==="Cotizar"?"Abrir cotizador":"Abrir "+title.toLowerCase())+' <span aria-hidden="true">↗</span>';}
      stageButtons.forEach(button=>button.classList.toggle("is-next",button.dataset.hmHomeTab===next));
      const clock=panel.querySelector("#hm-home-clock");
      if(clock)clock.textContent=new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
    }
    panel.addEventListener("click",e=>{
      const button=e.target.closest("[data-hm-home-tab]");if(!button)return;
      const tabButton=document.querySelector('#tabs [data-tab="'+button.dataset.hmHomeTab+'"]');
      if(tabButton&&!tabButton.hidden){tabButton.click();window.scrollTo({top:0,behavior:"smooth"});}
    });
    const appsToggle=home.querySelector('#inVista [data-inv="apps"]');
    const updateVisibility=()=>{try{panel.hidden=localStorage.getItem("cotizador_inicio")==="apps"}catch(e){panel.hidden=false}};
    if(appsToggle)home.querySelector("#inVista").addEventListener("click",()=>requestAnimationFrame(updateVisibility));
    updateVisibility();update();
    if(!window.__hmHomeCommandRefresh){
      window.__hmHomeCommandRefresh=true;
      const original=window.renderTablero;
      if(typeof original==="function"){
        window.renderTablero=function(){const result=original.apply(this,arguments);requestAnimationFrame(update);return result};
      }
      window.setInterval(update,30000);
    }
  }
  studio.addEventListener("click",e=>{
    const saved=e.target.closest(".hm-recent-card[data-load]");
    if(saved){
      const record=(guardadas||[]).find(g=>g.folio===saved.dataset.load);
      if(record){cot=JSON.parse(JSON.stringify(record));normalizaItems(cot);renderCot();const b=document.querySelector('#tabs button[data-tab="cot"]');if(b)b.click()}
      return;
    }
    const mode=e.target.closest("[data-hm-mode]");
    if(mode){
      const target=byId("modoSwitch")&&byId("modoSwitch").querySelector('[data-modo="'+mode.dataset.hmMode+'"]');
      if(target)target.click();
      renderStudio();return;
    }
    const product=e.target.closest("[data-hm-product]");
    if(product){selectProduct(product.dataset.hmProduct);return}
    const tech=e.target.closest("[data-hm-tech]");
    if(tech){selectTechnique(tech.dataset.hmTech);return}
    if(e.target.closest("#hm-open-catalog")){const b=byId("c_artBtn");if(b)b.click();return}
    if(e.target.closest("#hm-tech-toggle")){const g=byId("hm-tech-grid");g.dataset.all=g.dataset.all==="1"?"0":"1";renderTechniques();return}
    if(e.target.closest("#hm-view-all")){const b=document.querySelector('#tabs button[data-tab="sav"]');if(b)b.click();return}
  });
  byId("hm-color").addEventListener("change",e=>setColor(e.target.value));
  byId("hm-color").addEventListener("input",e=>{
    if(!colorGroups().length)return;
    const color=e.target.value.trim();
    (cot.tallas||[]).forEach(t=>{if(num(t.cant)>0)t.color=color});
    if(typeof renderTallas==="function")renderTallas();
    if(typeof refrescaCostos==="function")refrescaCostos();
    updateSizeStatus();
  });
  studio.addEventListener("change",e=>{
    if(e.target.matches("[data-hm-size]")&&typeof renderTallas==="function")renderTallas();
  });
  studio.querySelector(".hm-size-advanced").addEventListener("toggle",e=>{
    if(e.target.open&&typeof renderTallas==="function")renderTallas();
  });
  studio.addEventListener("input",e=>{if(e.target.id==="c_qty")updateSizeStatus()});

  function wrap(name,after){
    const original=window[name];
    if(typeof original!=="function")return;
    window[name]=function(){
      const result=original.apply(this,arguments);
      requestAnimationFrame(after);
      return result;
    };
  }
  wrap("renderCot",renderStudio);
  wrap("renderTiraItems",()=>{if(strip)strip.hidden=!cot.items||cot.items.length<=1});
  wrap("renderApps",()=>{renderProducts();renderTechniques();renderSummary()});
  wrap("renderTallas",renderSizes);
  wrap("renderResumen",()=>{renderSummary();renderRecent()});
  wrap("pintaTabArmado",()=>{if(buildButton)buildButton.textContent="Abrir armado del material ↗"});
  wrap("renderSaved",renderRecent);
  initHomeCommand();
  trackButtonSpotlight(tab);
  trackButtonSpotlight(document.getElementById("tab-inicio"));
  trackButtonSpotlight(document.getElementById("acceso"));
  renderStudio();
})();
