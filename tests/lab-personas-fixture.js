/* Sólo datos sintéticos para el navegador aislado de QA. */
const u1='10000000-0000-4000-8000-000000000001',u2='10000000-0000-4000-8000-000000000002',u3='10000000-0000-4000-8000-000000000003';
const c1='20000000-0000-4000-8000-000000000001',c2='20000000-0000-4000-8000-000000000002';
let personas=[{id:u1,nombre:'Responsable de muestra',apellidos:'Uno',correo:'uno@example.test',tel:'0000000000',pais:'México',ciudad:'Ciudad de muestra',negocios:[{id:c1,nombre:'Taller de muestra',producto:'taller',rol:'admin'}],revision:null},{id:u2,nombre:'Responsable de muestra',apellidos:'Dos',correo:'dos@example.test',tel:'',pais:'',ciudad:'',negocios:[{id:c2,nombre:'Tienda de muestra',producto:'tiendita',rol:'admin'}],revision:null},{id:u3,nombre:'Persona de muestra',apellidos:'Tres',correo:'tres@example.test',tel:'',pais:'México',ciudad:'Ciudad de muestra',negocios:[{id:c1,nombre:'Taller de muestra',producto:'taller',rol:'produccion'}],revision:null}];
let filas=[{id:c1,taller:'Taller de muestra',correo_dueno:'uno@example.test',producto:'taller',plan:'pro',estado:'activa',ciclo:'mensual',creada:'2026-09-01',vence:'2099-12-31',usuarios:2,cotizaciones:12},{id:c2,taller:'Tienda de muestra',correo_dueno:'dos@example.test',producto:'tiendita',plan:'basico',estado:'activa',ciclo:'mensual',es_prueba:true,creada:'2026-11-02',vence:'2099-12-31',usuarios:1,cotizaciones:0}];
let notas={};try{const d=JSON.parse(localStorage.getItem('lab_qa_persistencia'));if(d){personas=d.personas;filas=d.filas;notas=d.notas;}}catch(e){}
const clona=d=>JSON.parse(JSON.stringify(d)),persistir=()=>localStorage.setItem('lab_qa_persistencia',JSON.stringify({personas,filas,notas}));
window.__labQa={writes:[],fail:false,readFail:false,personas,filas};
const oldFrom=client.from,oldRpc=client.rpc;
client.rpc=async(name,args)=>{
 if(name==='staff_usuarios')return window.__labQa.readFail?{error:{message:'Lectura de prueba fallida'}}:{data:clona(personas),error:null};
 if(name==='staff_guarda_ficha'){
  if(window.__labQa.fail)return {error:{message:'No hay conexión de prueba'}};
  const {p_tipo,p_id,p_datos,p_revision}=args;window.__labQa.writes.push(clona(args));
  const rev='2026-11-03T16:00:'+String(window.__labQa.writes.length).padStart(2,'0')+'Z';
  if(p_tipo==='persona'){const p=personas.find(p=>p.id===p_id);if((p.revision||null)!==p_revision)return {error:{message:'La ficha cambió en otro dispositivo'}};Object.assign(p,p_datos,{revision:rev});}
  else{if((notas[p_id]?.actualizado||null)!==p_revision)return {error:{message:'La ficha cambió en otro dispositivo'}};notas[p_id]={doc_id:p_id,cuerpo:{...(notas[p_id]?.cuerpo||{}),...p_datos},actualizado:rev};if(p_datos.nombre)filas.find(c=>c.id===p_id).taller=p_datos.nombre;}
  persistir();return {data:{ok:true,revision:rev},error:null};
 }
 return oldRpc(name,args);
};
client.from=table=>{
 if(table!=='v_cuentas'&&table!=='lab_datos')return oldFrom(table);
 const filters=[];const rows=()=>table==='v_cuentas'?filas:Object.values(notas).filter(n=>!filters.some(([k,v])=>k==='coleccion'&&v!=='notas_cuenta'||k==='doc_id'&&n.doc_id!==v));
 const a={select(){return a},eq(k,v){filters.push([k,v]);return a},order(){return a},limit(){return a},upsert(r){if(r.coleccion==='notas_cuenta'){notas[r.doc_id]={...r,actualizado:new Date().toISOString()};persistir();}return a},delete(){return a},maybeSingle:async()=>({data:clona(rows()[0]||null),error:null}),then(ok,bad){return Promise.resolve({data:clona(rows()),error:null}).then(ok,bad)}};return a;
};
