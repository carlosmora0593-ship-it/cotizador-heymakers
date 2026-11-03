/* PostgreSQL local, con documentos y membresías ficticios. Nunca abre Supabase. */
import fs from 'node:fs';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'../tmp/stripe/qa/package/dist/index.js');
const {pg_trgm}=await import('../tmp/stripe/qa/package/dist/contrib/pg_trgm.js');
const db=new PGlite({extensions:{pg_trgm}}),cuenta='11111111-1111-4111-8111-111111111111',otra='22222222-2222-4222-8222-222222222222',usuario='33333333-3333-4333-8333-333333333333';
try{
 await db.exec(`create role anon;create role authenticated;create schema extensions;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table membresias(usuario_id uuid,cuenta_id uuid,rol text);
 create table documentos(cuenta_id uuid,coleccion text,doc_id text,cuerpo jsonb,primary key(cuenta_id,coleccion,doc_id));
 alter table documentos enable row level security;grant select on documentos to authenticated;`);
 const roles=fs.readFileSync('sql/19-negocios-por-correo.sql','utf8');
 await db.exec(roles.slice(roles.indexOf('create or replace function public.rol_en'),roles.indexOf('-- El candado de producción')));
 const migration=fs.readFileSync('sql/25-directorio-clientes.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.query('insert into membresias values($1,$2,$3)',[usuario,cuenta,'admin']);
 await db.query(`insert into documentos select $1,'clientes','qa-'||i,jsonb_build_object('cliente',jsonb_build_object('id','qa-'||i,'nombre','Taller de muestra '||lpad(i::text,4,'0'),'tel','00 0000 '||lpad(i::text,4,'0'),'credito',5000,'docs',jsonb_build_array('ruta-privada'))) from generate_series(1,1284) i`,[cuenta]);
 await db.query(`update documentos set cuerpo=jsonb_set(cuerpo,'{cliente,nombre}','"Diseño Horizonte"') where cuenta_id=$1 and doc_id='qa-1284'`,[cuenta]);
 await db.query(`insert into documentos values($1,'clientes','literal',jsonb_build_object('cliente',jsonb_build_object('nombre','100%_ Impresión'))),($2,'clientes','otro',jsonb_build_object('cliente',jsonb_build_object('nombre','Cliente de otra cuenta'))),($1,'config','no-cliente','{}')`,[cuenta,otra]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[usuario]);await db.exec('set role authenticated');
 const busca=async(t='',p=0,c=cuenta)=>(await db.query('select buscar_clientes_nuvoor($1,$2,$3) as r',[c,t,p])).rows[0].r;
 let r=await busca();assert.equal(r.total,1285);assert.equal(r.clientes.length,6);assert.equal(r.porPagina,6);assert.equal(r.pagina,0);
 const ids=new Set(r.clientes.map(c=>c.id));r=await busca('',1);assert.ok(r.clientes.every(c=>!ids.has(c.id)));
 assert.deepEqual(Object.keys(r.clientes[0]).sort(),['id','mail','nombre','rfc','tel']);
 r=await busca('diseno horizonte');assert.equal(r.total,1);assert.equal(r.clientes[0].id,'qa-1284');
 r=await busca('+00 (0000) 1284');assert.equal(r.total,1);assert.equal(r.clientes[0].id,'qa-1284');
 assert.equal((await busca('%_')).total,1);assert.equal((await busca('imprésion')).total,1);assert.equal((await busca('nadie')).total,0);
 assert.equal((await busca('',-10)).pagina,0);assert.equal((await busca('',99999)).pagina,214);assert.equal((await busca('',99999)).clientes.length,1);
 await assert.rejects(()=>busca('',0,otra),e=>e.code==='42501');
 await db.exec('reset role');await db.query("update membresias set rol='ventas'");await db.exec('set role authenticated');assert.equal((await busca()).total,1285);
 await db.exec('reset role');await db.query("update membresias set rol='produccion'");await db.exec('set role authenticated');await assert.rejects(()=>busca(),e=>e.code==='42501');
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role authenticated');await assert.rejects(()=>busca(),e=>e.code==='42501');
 await db.exec('reset role;set role anon');await assert.rejects(()=>busca(),e=>e.code==='42501');
 console.log('SQL/25 local: migración repetible, índices, 1285 fichas, 6 por página, búsqueda más allá de 500, acentos/teléfono/literales, resumen sin crédito/documentos y permisos admin/ventas/producción/otra cuenta/anon OK.');
}finally{await db.close();}
