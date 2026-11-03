/* Fichas ficticias del servidor, separadas de las cargadas inicialmente en la app. */
window.__clientesQa={fallar:false,demora:0,demoraFicha:0,escrituras:[],consultas:[],clientes:Array.from({length:1284},(_,i)=>({id:'qa-'+i,nombre:'Taller de muestra '+String(i+1).padStart(4,'0'),tel:'000000'+String(i+1).padStart(4,'0'),mail:'cliente'+(i+1)+'@example.test',docs:[],credito:5000,creado:'2026-11-03'}))};
Object.assign(__clientesQa.clientes[1283],{nombre:'Impresos Aurora',persona:'Contacto de muestra',mail:'compras@example.test',rfc:'AAA010101AAA',razon:'EMPRESA DE MUESTRA',cp:'58000',regimen:'601',uso:'G03'});
Object.assign(__clientesQa.clientes[0],{nombre:'Acabados Azul'});Object.assign(__clientesQa.clientes[1],{nombre:'Diseño Horizonte'});
const previoRpcClientes=client.rpc,previoFromClientes=client.from;
client.rpc=async(n,a)=>{
 if(n!=='buscar_clientes_nuvoor')return previoRpcClientes(n,a);
 __clientesQa.consultas.push({...a});const demora=__clientesQa.demora,fallar=__clientesQa.fallar;
 const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let t=normal(a.p_busqueda).trim();if(/^[+().0-9 -]+$/.test(t))t=t.replace(/\D/g,'');
 const ls=__clientesQa.clientes.filter(c=>normal([c.nombre,c.razon,c.persona,c.rfc,c.mail,c.tel].join(' ')).includes(t)).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
 const pagina=Math.max(0,Math.min(a.p_pagina,Math.ceil(ls.length/6)-1)),r={data:{clientes:ls.slice(pagina*6,pagina*6+6).map(c=>({id:c.id,nombre:c.nombre,tel:c.tel,mail:c.mail,rfc:c.rfc||''})),total:ls.length,pagina,porPagina:6},error:null};
 if(demora)await new Promise(r=>setTimeout(r,demora));return fallar?{error:{message:'No hay conexión de prueba'}}:r;
};
client.from=table=>{
 if(table!=='documentos')return previoFromClientes(table);
 const f={};let upsert=null;const filas=()=>{if(f.coleccion!=='clientes')return [];return __clientesQa.clientes.filter(c=>!f.doc_id||f.doc_id===c.id).map(c=>({cuerpo:{cliente:JSON.parse(JSON.stringify(c))}}));};
 const q={select(){return q},eq(k,v){f[k]=v;return q},limit(){return q},order(){return q},upsert(v){upsert=v;return q},then(ok,bad){if(upsert){__clientesQa.escrituras.push(upsert);if(upsert.coleccion==='clientes'){const i=__clientesQa.clientes.findIndex(c=>c.id===upsert.doc_id);if(i>=0)__clientesQa.clientes[i]=upsert.cuerpo.cliente;else __clientesQa.clientes.push(upsert.cuerpo.cliente);}}return Promise.resolve({data:filas(),error:null}).then(ok,bad)},async maybeSingle(){const data=filas()[0]||null;if(__clientesQa.demoraFicha)await new Promise(r=>setTimeout(r,__clientesQa.demoraFicha));return {data,error:null}}};return q;
};
