/* Nuvoor · el menú en un cajón (☰), igual que el Restaurant (capa LIMPIO). Imprenta y Store · 27 nov 2026.
   Sólo acomoda los mismos botones: el candado, el usuario, la empresa, el plan y cerrar sesión siguen haciendo lo mismo.
   Para volver al menú de antes en un aparato: abre la página con ?menu=fijo (y con ?menu=cajon para regresar). */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const oculta = (el, v) => { if(el && el.hidden !== !!v) el.hidden = !!v; };
try{
  const pide = new URLSearchParams(location.search).get("menu");
  if(pide === "fijo") localStorage.setItem("nuvoor_menu","fijo");
  if(pide === "cajon") localStorage.removeItem("nuvoor_menu");
  if(localStorage.getItem("nuvoor_menu") === "fijo") return;
}catch(_){}
const SVG = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const ICO = {
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  candado:'<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
  carrito:'<circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/><path d="M3 4h2.2l2.2 11h10.4l2-8H6.3"/>',
  mas:'<path d="M12 5v14M5 12h14"/>',
  plan:'<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M3.5 10h17"/>',
  lab:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>',
  luna:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  salir:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l4-4-4-4M14 12H4"/>'
};
const esImprenta = !!$("#barra") && !!$("#tabs");
const esStore = !esImprenta && !!$("#n7Barra");
if(!esImprenta && !esStore) return;
const barra = esImprenta ? $("#barra") : $("#n7Barra");
let foco = null;

/* ---------- la barra de arriba ---------- */
document.body.classList.add("mc", esImprenta ? "mcImprenta" : "mcStore");
barra.classList.add("mcCajonBarra");
if(!barra.getAttribute("aria-label")) barra.setAttribute("aria-label","Menú");
document.body.insertAdjacentHTML("afterbegin",
  '<header class="mcBar" id="mcBar"><button type="button" class="mcIcono" id="mcMenuBtn" aria-label="Abrir el menú" aria-controls="'+barra.id+'" aria-expanded="false">'+SVG(ICO.menu)+'</button>'+
  '<div class="mcTitulo"><h1 id="mcTitulo">Inicio</h1><small id="mcSub" hidden></small></div>'+
  '<div class="mcAcciones" id="mcAcciones"></div></header><div class="mcVelo" id="mcVelo" hidden></div>');
const acc = $("#mcAcciones");
if(esImprenta){
  acc.innerHTML = '<button type="button" class="mcBarBtn" data-mc-ir="mos">'+SVG(ICO.carrito)+'<span>Vender</span></button>'+
    '<button type="button" class="mcBarBtn mcPrimario" data-mc-ir="cot">'+SVG(ICO.mas)+'<span>Cotizar</span></button>';
  acc.addEventListener("click", e=>{ const b = e.target.closest("[data-mc-ir]"); if(b && typeof vaATab === "function") vaATab(b.dataset.mcIr); });
}else{
  acc.innerHTML = '<button type="button" class="mcBarBtn mcPrimario" data-view="venta">'+SVG(ICO.carrito)+'<span>Vender</span></button>';
}

/* ---------- arriba del cajón: el negocio, el candado, quién está y la caja ---------- */
barra.insertAdjacentHTML("afterbegin",
  '<div class="mcCajonTop"><div class="mcCajonFila"><div class="mcNegocio" id="mcNegocio"></div>'+
  '<button type="button" class="mcCandado" id="mcCandado" aria-label="Bloquear la pantalla" title="Bloquear la pantalla">'+SVG(ICO.candado)+'</button></div>'+
  '<button type="button" class="mcQuien" id="mcQuien" aria-label="Cambiar de usuario"><b id="mcQuienNombre"></b><small id="mcQuienRol"></small></button>'+
  '<div class="mcCaja" id="mcCaja" hidden></div></div>');
const franja = barra.querySelector(".barraCmyk,.n7Franja"); if(franja) barra.prepend(franja);
/* La Imprenta sacaba el menú de la barra lateral cuando la pantalla mide menos de 1100 px (acomodaBarra).
   Con el cajón, el menú vive siempre en la barra, a cualquier ancho. */
if(esImprenta && typeof window.acomodaBarra === "function"){
  window.acomodaBarra = function(){
    const tabs = $("#tabs"), nav = $("#barraNav"); if(!tabs || !nav) return;
    try{ agrupaBarra(); nvNavEstado(false); }catch(_){}
    const m = document.querySelector(".brand"); if(m && $("#barraTop") && m.parentElement !== $("#barraTop")) $("#barraTop").appendChild(m);
    if(tabs.parentElement !== nav) nav.appendChild(tabs);
    tabs.hidden = false; barra.hidden = false; document.body.classList.add("conBarra");
    try{ limpiaGrupos(); }catch(_){}
  };
  window.acomodaBarra();
}
const marca = esImprenta ? $("#barraTop") : barra.querySelector(".n7Top .brand");
if(marca) $("#mcNegocio").append(marca);
if(esStore){ const top = barra.querySelector(".n7Top"); if(top && !top.querySelector(".brand")) top.hidden = true; }

/* ---------- abajo del cajón (Imprenta): la cuenta, la empresa, el plan, el tema y cerrar sesión ---------- */
if(esImprenta){
  const pie = barra.querySelector(".barraPie");
  const html = '<div class="mcCuenta" id="mcCuenta"><div class="mcCuentaQuien" id="mcCuentaQuien"></div>'+
    '<button type="button" class="mcItem" data-mc-clic="#btnPlanes">'+SVG(ICO.plan)+'<span>Mi plan</span></button>'+
    '<button type="button" class="mcItem" id="mcLab" data-mc-clic="#btnLab" hidden>'+SVG(ICO.lab)+'<span>Nuvoor Lab</span></button>'+
    '<button type="button" class="mcItem" id="mcTema"></button>'+
    '<button type="button" class="mcItem mcSalir" data-mc-clic="#btnSalir">'+SVG(ICO.salir)+'<span>Cerrar sesión</span></button></div>';
  if(pie) pie.insertAdjacentHTML("beforebegin", html); else barra.insertAdjacentHTML("beforeend", html);
  /* El selector de empresa es el mismo de siempre (cuenta.js lo llena y lo escucha); sólo cambia de lugar. */
  const emp = $("#perfilEmpresas");
  if(emp) $("#mcCuentaQuien").after(emp);
}

/* ---------- abrir y cerrar ---------- */
const bloqueada = () => document.body.classList.contains("sin-sesion") || document.body.classList.contains("sin-acceso") ||
  (esStore && $("#acceso") && !$("#acceso").hidden);
function abre(rapido){
  if(bloqueada()) return;
  if(rapido === true){ document.body.classList.add("mcRapido"); requestAnimationFrame(()=> requestAnimationFrame(()=> document.body.classList.remove("mcRapido"))); }
  foco = document.activeElement; pinta();
  barra.scrollTop = 0;
  document.body.classList.add("mcCajon");
  $("#mcVelo").hidden = false;
  $("#mcMenuBtn").setAttribute("aria-expanded","true");
  const sel = barra.querySelector('[aria-selected="true"],.active,.on') || barra.querySelector("button");
  setTimeout(()=> sel && sel.focus({preventScroll:true}), 30);
}
function cierra(regresa = true){
  if(!document.body.classList.contains("mcCajon")) return;
  document.body.classList.remove("mcCajon");
  $("#mcVelo").hidden = true;
  $("#mcMenuBtn").setAttribute("aria-expanded","false");
  if(regresa) (foco && foco.isConnected ? foco : $("#mcMenuBtn")).focus();
}
$("#mcMenuBtn").addEventListener("click", ()=> document.body.classList.contains("mcCajon") ? cierra() : abre());
$("#mcVelo").addEventListener("click", ()=> cierra());
addEventListener("keydown", e=>{ if(e.key === "Escape") cierra(); });
barra.addEventListener("click", e=>{
  const proxy = e.target.closest("[data-mc-clic]");
  if(proxy){ cierra(false); const t = $(proxy.dataset.mcClic); if(t) t.click(); return; }
  if(e.target.closest("[data-tab],[data-view],.mcItem,a[href]")) cierra(false);
});
/* El candado y el usuario son los mismos de siempre. Al bloquear, el foco sale del cajón para que «Enter» llegue al teclado de la puerta. */
$("#mcCandado").addEventListener("click", ()=>{
  cierra(false); $("#mcCandado").blur();
  const b = esImprenta ? $("#btnBloquea") : $("#lockNow"); if(b) b.click();
});
$("#mcQuien").addEventListener("click", ()=>{
  cierra(false);
  const b = esImprenta ? $("#userChip") : $("#lockNow"); if(b) b.click();
});
/* El recorrido de bienvenida de la Imprenta señala el menú: si el paso apunta a algo del cajón, el cajón se abre (sin animación,
   para que el recuadro caiga en su lugar) y se cierra en los demás pasos. */
if(esImprenta && typeof window.pintaPasoTour === "function"){
  const pasoOriginal = window.pintaPasoTour, cierraOriginal = window.cierraTour;
  window.pintaPasoTour = function(i){
    let enCajon = false;
    try{ const p = tourPasos[i], el = p && p.sel ? document.querySelector(p.sel) : null; enCajon = !!(el && barra.contains(el)); }catch(_){}
    if(enCajon) abre(true); else cierra(false);
    return pasoOriginal.apply(this, arguments);
  };
  if(typeof cierraOriginal === "function") window.cierraTour = function(){ cierra(false); return cierraOriginal.apply(this, arguments); };
}
if(esImprenta){
  $("#mcTema").addEventListener("click", ()=>{
    try{ TEMA.preset = document.documentElement.dataset.theme === "dark" ? "papel" : "tecno"; aplicaTema(); if(typeof guardaTema === "function") guardaTema(); }catch(_){}
    pinta();
  });
}

/* ---------- lo que se pinta: el título, quién está, la caja y la cuenta ---------- */
function vistaImprenta(){
  const s = [...document.querySelectorAll('.wrap > section[id^="tab-"]')].find(x=>!x.hidden && x.offsetParent !== null);
  return s ? s.id.slice(4) : "inicio";
}
function vistaStore(){
  const v = document.querySelector('.view.active'); return v ? v.id.replace(/^view-/,"") : "inicio";
}
function nombreDe(boton){
  if(!boton) return "";
  const b = boton.querySelector("b") || boton.querySelector("span:not(.n7i)");
  return ((b ? b.firstChild && b.firstChild.nodeType === 3 ? b.firstChild.textContent : b.textContent : boton.textContent) || "").trim();
}
function pinta(){
  if(esImprenta){
    const k = vistaImprenta();
    $("#mcTitulo").textContent = k === "inicio" ? "Inicio" : (nombreDe($('#tabs [data-tab="'+k+'"]')) || "Nuvoor Imprenta");
    /* Vender y Cotizar sólo salen si esa persona y ese plan los tienen en el menú. */
    acc.querySelectorAll("[data-mc-ir]").forEach(b=>{ const t = $('#tabs [data-tab="'+b.dataset.mcIr+'"]'); oculta(b, !t || t.hidden); });
    try{
      const u = usuarioActual();
      $("#mcQuienNombre").textContent = u.nombre || "Administrador";
      $("#mcQuienRol").textContent = ((typeof ROLES !== "undefined" && ROLES[rolActual()]) ? ROLES[rolActual()].nombre : "Administrador") + " · Cambiar de usuario";
    }catch(_){ $("#mcQuienNombre").textContent = "Administrador"; $("#mcQuienRol").textContent = "Cambiar de usuario"; }
    try{
      const conCaja = typeof cajaDe === "function" && (typeof crCajaPlan41 !== "function" || crCajaPlan41()) && (typeof puedeVer !== "function" || puedeVer("caj"));
      oculta($("#mcCaja"), !conCaja);
      if(conCaja){ const c = cajaDe(hoyISO()), abierta = !!(c && c.abierta && !c.cierre);
        $("#mcCaja").innerHTML = 'Caja <b class="'+(abierta?"abierta":"cerrada")+'">'+(abierta?"abierta":"cerrada")+'</b>'; }
    }catch(_){ oculta($("#mcCaja"), true); }
    const nombre = (($("#perfilNombre") || {}).textContent || "").trim(), plan = (($("#cuentaPlan") || {}).textContent || "").trim();
    const quien = $("#mcCuentaQuien"); quien.textContent = "";
    if(nombre && nombre !== "Mi perfil"){ const b = document.createElement("b"); b.textContent = nombre; quien.append(b); }
    const s = document.createElement("span"); s.textContent = plan && plan !== "…" ? plan : "Tu cuenta Nuvoor"; quien.append(s);
    oculta($("#mcLab"), !$("#btnLab") || $("#btnLab").hidden);
    const oscuro = document.documentElement.dataset.theme === "dark";
    $("#mcTema").innerHTML = SVG(oscuro ? ICO.sol : ICO.luna) + "<span>" + (oscuro ? "Modo de día" : "Modo de noche") + "</span>";
  }else{
    const k = vistaStore();
    $("#mcTitulo").textContent = k === "venta" ? "Vender" : (nombreDe(barra.querySelector('[data-view="'+k+'"]')) || "Nuvoor Store");
    const cuenta = (($("#accountLabel") || {}).textContent || "").trim();
    $("#mcQuienNombre").textContent = cuenta && !/conectar/i.test(cuenta) ? cuenta : "Este dispositivo";
    $("#mcQuienRol").textContent = "Cambiar de usuario";
    const alerta = $("#cashAlert");
    oculta($("#mcCaja"), !alerta);
    if(alerta){ const cerrada = alerta.classList.contains("closed");
      $("#mcCaja").innerHTML = 'Caja <b class="'+(cerrada?"cerrada":"abierta")+'">'+(cerrada?"cerrada":"abierta")+'</b>'; }
    oculta(acc, k === "venta");
  }
  if(bloqueada()) cierra(false);
}
/* El título sigue a la sección que se ve, sin tocar las funciones de cada sistema. Un repintado por cuadro, como mucho. */
let pendiente = false;
const pide = () => { if(pendiente) return; pendiente = true; requestAnimationFrame(()=>{ pendiente = false; pinta(); }); };
/* Lo que cambia este mismo archivo (la barra de arriba y lo que agrega al cajón) no cuenta: así no se repinta solo. */
const propio = n => n && n.nodeType === 1 && n.closest && n.closest("#mcBar,.mcCajonTop,.mcCuenta");
const observa = new MutationObserver(ms=>{ if(ms.some(m=>!propio(m.target))) pide(); });
const raiz = esImprenta ? $(".wrap") : $(".shell");
if(raiz) observa.observe(raiz, {subtree:true, attributes:true, attributeFilter:["hidden","class"]});
observa.observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});
observa.observe(document.body, {attributes:true, attributeFilter:["class"]});
if(esStore && $("#acceso")) observa.observe($("#acceso"), {attributes:true, attributeFilter:["hidden"]});
pinta();
window.NuvoorMenuCajon = {abre, cierra, pinta};
})();
