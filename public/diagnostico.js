
/* ============================================================
   El diagnóstico
   ============================================================
   Seis preguntas, una recomendación, y un renglón guardado para que
   Hey Makers sepa qué pide la gente que llega.

   La recomendación NO usa inteligencia artificial, y es a propósito.
   Con seis preguntas y reglas claras el resultado es el mismo, sale al
   instante, no cuesta nada por respuesta y —lo que más importa— se puede
   EXPLICAR: "te toca Maker porque llevas inventario y son tres". Una IA
   daría la misma respuesta con menos certeza, más lento y sin poder
   decir por qué. Donde sí valdría la pena es del otro lado: leer
   cincuenta diagnósticos juntos y encontrar patrones que nadie pidió.
   ============================================================ */

const DIAG_PASOS = 6;
let diagPaso = 0;
const diagResp = {};

function diagQ(s){ return document.querySelector(s); }

function diagPinta(){
  const total = DIAG_PASOS;
  document.querySelectorAll(".diagPaso").forEach(s=>{
    s.hidden = String(s.dataset.paso) !== String(diagPaso);
  });
  const barra = diagQ("#diagAvance");
  if(barra) barra.style.width = Math.round(((diagPaso === "fin" ? total : diagPaso) / total) * 100) + "%";
  const atras = diagQ("#diagAtras");
  if(atras) atras.hidden = (diagPaso === 0 || diagPaso === "fin");
  const cuenta = diagQ("#diagCuenta");
  if(cuenta) cuenta.textContent = diagPaso === "fin" ? "" : "Pregunta " + (diagPaso + 1) + " de " + total;
  const salta = diagQ("#diagSalta");
  if(salta) salta.hidden = (diagPaso === "fin");
}

/* Las reglas. Se leen de arriba abajo y gana la primera que aplique,
   que es como se razonaría en voz alta frente al cliente. Cada una lleva
   el porqué que se le va a mostrar, citando lo que él mismo contestó. */
function diagRecomienda(){
  const nec = diagResp.necesita || [];
  const tiene = k => nec.indexOf(k) >= 0;
  const razones = [];

  if(tiene("caja") || tiene("utilidad")){
    razones.push(tiene("caja") && tiene("utilidad")
      ? "quieres llevar la caja y saber cuánto ganas"
      : tiene("caja") ? "quieres llevar el corte de caja" : "quieres saber cuánto ganaste en el mes");
  }
  if(diagResp.gente === "4mas") razones.push("son cuatro o más en el taller");
  if(diagResp.cotiza === "muchas") razones.push("haces más de 50 cotizaciones al mes");

  if(razones.length) return {plan:"pro", razones:razones};

  if(tiene("compras")) razones.push("pides material a proveedores");
  if(tiene("inventario")) razones.push("llevas inventario");
  if(tiene("factura")) razones.push("facturas a tus clientes");
  if(diagResp.gente === "2a3") razones.push("son dos o tres y cada quien hace lo suyo");
  if(diagResp.cotiza === "medias") razones.push("haces entre 10 y 50 cotizaciones al mes");

  if(razones.length) return {plan:"maker", razones:razones};

  return {plan:"basico", razones:["estás empezando y lo que necesitas es cotizar bien"]};
}

function diagFrase(razones){
  if(razones.length === 1) return razones[0] + ".";
  if(razones.length === 2) return razones[0] + " y " + razones[1] + ".";
  return razones.slice(0, -1).join(", ") + " y " + razones[razones.length - 1] + ".";
}

let diagPlanSugerido = null;

function diagTermina(){
  const r = diagRecomienda();
  diagPlanSugerido = r.plan;
  const nombre = (CONFIG.PLANES[r.plan] || {}).nombre || r.plan;
  const precio = (CONFIG.PLANES[r.plan] || {}).mensual;

  diagQ("#diagSello").textContent = "Te recomendamos";
  diagQ("#diagTitulo").textContent = "Plan " + nombre + (precio ? " · $" + precio + "/mes" : "");
  diagQ("#diagPorque").textContent = "Porque " + diagFrase(r.razones) +
    " Si crees que te queda mejor otro, los tres están a un clic.";

  diagPaso = "fin";
  diagPinta();
  diagGuarda(r.plan);
}

/* Se guarda en cuanto termina de contestar, no cuando contrata: lo que
   interesa saber es qué necesita la gente que LLEGA, no solo la que paga.
   Si falla el guardado no se le dice nada ni se le estorba: el
   diagnóstico es para nosotros, no para él. */
async function diagGuarda(recomendado){
  try{
    await SB.from("diagnosticos").insert({respuestas: diagResp, recomendado: recomendado});
  }catch(e){ console.warn("No se pudo guardar el diagnóstico", e); }
}

/* Cuando sí contrata, se vuelve a apuntar: así se sabe si la sugerencia
   le atinó o si la gente acaba eligiendo otra cosa. Esa diferencia es la
   que dice si las preguntas sirven o hay que cambiarlas. */
async function diagApuntaEleccion(plan){
  try{
    const {data} = await SB.from("diagnosticos").select("id")
      .order("creado", {ascending:false}).limit(1);
    if(data && data[0]) await SB.from("diagnosticos").update({eligio: plan}).eq("id", data[0].id);
  }catch(e){ /* no es grave */ }
}
window.__diagEligio = diagApuntaEleccion;

function diagAbre(){
  const muro = diagQ("#diagMuro"); if(!muro) return;
  diagPaso = 0;
  Object.keys(diagResp).forEach(k=> delete diagResp[k]);
  document.querySelectorAll(".diagOp.puesta").forEach(b=> b.classList.remove("puesta"));
  muro.hidden = false;
  diagPinta();
}
function diagCierra(){
  const muro = diagQ("#diagMuro"); if(muro) muro.hidden = true;
}

/* Avanzar solo cuando ya contestó. En las de una sola respuesta el clic
   avanza; en las de varias hay que dejarlo elegir y que él diga cuándo. */
function diagSiguiente(){
  if(diagPaso === "fin") return;
  if(diagPaso + 1 >= DIAG_PASOS) diagTermina();
  else { diagPaso++; diagPinta(); }
}

document.addEventListener("click", e=>{
  const op = e.target.closest(".diagOp");
  if(op){
    const preg = op.dataset.preg, val = op.dataset.op;
    const caja = op.parentElement;
    const multi = caja.classList.contains("multi");
    if(multi){
      op.classList.toggle("puesta");
      diagResp[preg] = [...caja.querySelectorAll(".diagOp.puesta")].map(b=> b.dataset.op);
      /* En las de varias no se avanza solo: se cambia el botón de "Me lo
         salto" por "Siguiente", que es lo que ahora toca hacer. */
      const salta = diagQ("#diagSalta");
      if(salta) salta.textContent = (diagResp[preg] || []).length ? "Siguiente" : "Me lo salto";
    } else {
      caja.querySelectorAll(".diagOp").forEach(b=> b.classList.remove("puesta"));
      op.classList.add("puesta");
      diagResp[preg] = val;
      setTimeout(diagSiguiente, 260);   // que alcance a verse la palomita
    }
    return;
  }

  if(e.target.closest("#diagAtras")){
    if(diagPaso !== "fin" && diagPaso > 0){ diagPaso--; diagPinta(); }
    const salta = diagQ("#diagSalta"); if(salta) salta.textContent = "Me lo salto";
    return;
  }

  if(e.target.closest("#diagSalta")){
    const btn = diagQ("#diagSalta");
    if(btn && btn.textContent === "Siguiente"){ diagSiguiente();
      btn.textContent = "Me lo salto"; return; }
    /* Saltárselo no es abandonar: lo poco que haya contestado también
       sirve, y se guarda igual antes de mandarlo a los planes. */
    if(Object.keys(diagResp).length) diagGuarda(null);
    diagCierra(); abrePlanes();
    return;
  }

  if(e.target.closest("#diagVerPlan")){
    diagCierra();
    abrePlanes();
    if(diagPlanSugerido) setTimeout(()=> marcaPlanSugerido(diagPlanSugerido), 120);
    return;
  }
  if(e.target.closest("#diagTodos")){ diagCierra(); abrePlanes(); return; }
});

/* En la pantalla de planes, el sugerido se señala. No se esconden los
   otros: la idea es ayudar a decidir, no empujar. */
function marcaPlanSugerido(plan){
  document.querySelectorAll("[data-plan]").forEach(c=>{
    c.classList.toggle("sugerido", c.dataset.plan === plan);
  });
}
