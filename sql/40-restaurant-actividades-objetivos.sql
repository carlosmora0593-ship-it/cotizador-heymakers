-- 40 · Actividades, objetivos y evidencias privadas. Después de SQL 38 y 39.
-- Repetible. Carlos lo ejecuta desde Lab; no contiene datos de muestra.
begin;
create table if not exists public.rest_actividades(
 id uuid primary key default gen_random_uuid(),cuenta_id uuid not null references public.cuentas(id) on delete cascade,
 sucursal text not null default 'principal',titulo text not null check(length(titulo) between 1 and 200),instrucciones text not null default '',
 para_tipo text not null check(para_tipo in ('persona','puesto')),para_id text not null,
 repite text not null check(repite in ('no','diario','semana')),dias smallint[] not null default '{}',fecha date,hora time,
 desde date not null,vigente_desde date not null,retirada date,creada_por uuid not null default auth.uid(),creada timestamptz not null default clock_timestamp(),
 revision integer not null default 0,historial jsonb not null default '[]');
create table if not exists public.rest_actividades_hechas(
 id uuid primary key default gen_random_uuid(),cuenta_id uuid not null references public.cuentas(id) on delete cascade,
 actividad uuid not null references public.rest_actividades(id),fecha date not null,asignacion text not null,persona text not null,titulo text not null,
 estado text not null check(estado in ('revision','aprobada','regresada')),nota text not null default '',foto text not null default '',
 marcada timestamptz not null default clock_timestamp(),revisada timestamptz,revisada_por text,comentario text not null default '',
 revision integer not null default 0,historial jsonb not null default '[]',unique(actividad,fecha,asignacion));
create table if not exists public.rest_objetivos(
 id uuid primary key default gen_random_uuid(),cuenta_id uuid not null references public.cuentas(id) on delete cascade,sucursal text not null default 'principal',
 titulo text not null check(length(titulo) between 1 and 200),instrucciones text not null default '',para_tipo text not null check(para_tipo in ('persona','puesto')),para_id text not null,
 periodo text not null check(periodo in ('semana','mes')),desde date not null,hasta date not null,meta numeric check(meta>0 and meta<=1000000000),unidad text not null default '',
 estado text not null default 'pendiente' check(estado in ('pendiente','revision','aprobada','regresada')),persona text,nota text not null default '',foto text not null default '',
 marcada timestamptz,revisada timestamptz,revisada_por text,comentario text not null default '',retirado boolean not null default false,
 revision integer not null default 0,historial jsonb not null default '[]',creada_por uuid not null default auth.uid(),creada timestamptz not null default clock_timestamp());
create table if not exists public.rest_objetivos_avance(
 id uuid primary key default gen_random_uuid(),cuenta_id uuid not null references public.cuentas(id) on delete cascade,objetivo uuid not null references public.rest_objetivos(id),
 persona text not null,cantidad numeric not null check(cantidad>0 and cantidad<=1000000000),nota text not null default '',creada timestamptz not null default clock_timestamp());
create table if not exists public.rest_actividades_fotos(
 id uuid primary key default gen_random_uuid(),cuenta_id uuid not null references public.cuentas(id) on delete cascade,usuario uuid not null,persona text not null,
 clase text not null check(clase in ('actividad','objetivo')),recurso uuid not null,fecha date not null,objeto text not null unique,creada timestamptz not null default clock_timestamp());
create index if not exists rest_actividades_cuenta on public.rest_actividades(cuenta_id,sucursal);
create index if not exists rest_hechas_pendientes on public.rest_actividades_hechas(cuenta_id,estado);
create index if not exists rest_objetivos_periodo on public.rest_objetivos(cuenta_id,desde,hasta);
do $$declare t text;begin foreach t in array array['rest_actividades','rest_actividades_hechas','rest_objetivos','rest_objetivos_avance','rest_actividades_fotos'] loop
 execute 'alter table public.'||t||' enable row level security';execute 'revoke all on public.'||t||' from public,anon,authenticated';execute 'grant select on public.'||t||' to authenticated';execute 'grant all on public.'||t||' to service_role';
end loop;end $$;
-- Una actividad personal también exige turno publicado ese día.
create or replace function public.rest_actividad_asignada(c uuid,p text,tip text,dest text,f date)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.rest_personal_semanas w cross join lateral jsonb_array_elements(w.publicado) t where w.cuenta_id=c and t->>'persona'=p and t->>'fecha'=f::text and ((tip='persona' and dest=p) or (tip='puesto' and t->>'puesto'=dest)))
$$;
create or replace function public.rest_objetivo_asignado(c uuid,p text,tip text,dest text,d date,h date)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.rest_personal_semanas w cross join lateral jsonb_array_elements(w.publicado) t where w.cuenta_id=c and t->>'persona'=p and (t->>'fecha')::date between d and h and ((tip='persona' and dest=p) or (tip='puesto' and t->>'puesto'=dest)))
$$;
-- Para SELECT por RLS/Storage se exige una sesión personal con PIN vigente.
create or replace function public.rest_actividades_rls(c uuid,tip text,dest text,d date,h date default null)
returns boolean language plpgsql stable security definer set search_path=public as $$declare x jsonb;ap text;begin
 if auth.uid() is null or not exists(select 1 from public.cuentas where id=c and producto='restaurant' and estado='activa' and vence>now()) then return false;end if;
 if public.rest_personal_admin(c) then return true;end if;
 select q.aparato into ap from public.rest_personal_dispositivos q join public.rest_personal_accesos a on a.id=q.acceso_id where a.cuenta_id=c and a.usuario_id=auth.uid() and q.vence>clock_timestamp() and q.bloqueado is null and q.fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date limit 1;
 if ap is null then return false;end if;x:=public.rest_personal_sesion(c,ap);
 return public.rest_objetivo_asignado(c,x->>'persona',tip,dest,d,coalesce(h,d));
 exception when insufficient_privilege then return false;
end $$;
-- Las ediciones sólo cambian desde hoy; las fechas anteriores usan su versión anterior.
create or replace function public.rest_actividad_version(a jsonb,f date)
returns jsonb language sql immutable as $$
 select v from jsonb_array_elements(coalesce(a->'historial','[]')||jsonb_build_array(a-'historial')) v where coalesce((v->>'vigente_desde')::date,(v->>'desde')::date)<=f order by coalesce((v->>'vigente_desde')::date,(v->>'desde')::date) desc,(v->>'revision')::integer desc limit 1
$$;
create or replace function public.rest_actividad_ocurre(a jsonb,f date)
returns boolean language sql immutable as $$select a is not null and f>=(a->>'desde')::date and ((a->>'repite'='no' and f=(a->>'fecha')::date) or a->>'repite'='diario' or (a->>'repite'='semana' and (extract(isodow from f)::integer-1)::text in(select value from jsonb_array_elements_text(a->'dias'))))$$;
-- Las plantillas contienen versiones de otros puestos/personas. El personal recibe
-- sólo las instancias autorizadas por RPC, nunca el historial completo de la plantilla.
create or replace function public.rest_actividad_hecha_rls(c uuid,recurso uuid,f date)
returns boolean language plpgsql stable security definer set search_path=public as $$declare v jsonb;begin
 select public.rest_actividad_version(to_jsonb(a),f) into v from public.rest_actividades a where a.id=recurso and a.cuenta_id=c;
 return public.rest_actividades_rls(c,v->>'para_tipo',v->>'para_id',f);
end $$;
drop policy if exists actividades_leer on public.rest_actividades;
create policy actividades_leer on public.rest_actividades for select to authenticated using(public.rest_personal_admin(cuenta_id) and public.rest_actividades_rls(cuenta_id,para_tipo,para_id,desde));
drop policy if exists actividades_hechas_leer on public.rest_actividades_hechas;
create policy actividades_hechas_leer on public.rest_actividades_hechas for select to authenticated using(public.rest_actividad_hecha_rls(cuenta_id,actividad,fecha));
drop policy if exists objetivos_leer on public.rest_objetivos;
create policy objetivos_leer on public.rest_objetivos for select to authenticated using(public.rest_actividades_rls(cuenta_id,para_tipo,para_id,desde,hasta));
drop policy if exists objetivos_avance_leer on public.rest_objetivos_avance;
create policy objetivos_avance_leer on public.rest_objetivos_avance for select to authenticated using(exists(select 1 from public.rest_objetivos o where o.id=objetivo and o.cuenta_id=rest_objetivos_avance.cuenta_id and public.rest_actividades_rls(o.cuenta_id,o.para_tipo,o.para_id,o.desde,o.hasta)));
drop policy if exists fotos_leer on public.rest_actividades_fotos;
create policy fotos_leer on public.rest_actividades_fotos for select to authenticated using(usuario=auth.uid() or public.rest_personal_admin(cuenta_id));
create or replace function public.rest_actividad_foto_permitida(n text,escritura boolean default false)
returns boolean language plpgsql stable security definer set search_path=public as $$declare f public.rest_actividades_fotos%rowtype;a public.rest_actividades%rowtype;o public.rest_objetivos%rowtype;v jsonb;begin
 select * into f from public.rest_actividades_fotos where objeto=n;if not found or auth.uid() is null then return false;end if;
 if not escritura and public.rest_personal_admin(f.cuenta_id) then return true;end if;
 if f.clase='actividad' then
  select * into a from public.rest_actividades where id=f.recurso and cuenta_id=f.cuenta_id;
  v:=public.rest_actividad_version(to_jsonb(a),f.fecha);
  if escritura and exists(select 1 from public.rest_actividades_hechas where actividad=a.id and fecha=f.fecha and estado in ('revision','aprobada')) then return false;end if;
  return (not escritura or f.usuario=auth.uid()) and public.rest_actividades_rls(f.cuenta_id,v->>'para_tipo',v->>'para_id',f.fecha);
 else
  select * into o from public.rest_objetivos where id=f.recurso and cuenta_id=f.cuenta_id;
  return (not escritura or (f.usuario=auth.uid() and o.estado not in ('revision','aprobada') and not o.retirado)) and public.rest_actividades_rls(f.cuenta_id,o.para_tipo,o.para_id,o.desde,o.hasta);
 end if;
end $$;
-- Bucket privado, máximo 300 KB y JPEG. No hay política de UPDATE/DELETE del empleado.
do $$begin if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('restaurant-actividades','restaurant-actividades',false,300000,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=300000,allowed_mime_types=array['image/jpeg'];
 execute 'drop policy if exists actividades_foto_leer on storage.objects';
 execute 'create policy actividades_foto_leer on storage.objects for select to authenticated using(bucket_id=''restaurant-actividades'' and public.rest_actividad_foto_permitida(name,false))';
 execute 'drop policy if exists actividades_foto_subir on storage.objects';
 execute 'create policy actividades_foto_subir on storage.objects for insert to authenticated with check(bucket_id=''restaurant-actividades'' and coalesce((metadata->>''size'')::bigint,0)<=300000 and coalesce(metadata->>''mimetype'',''image/jpeg'')=''image/jpeg'' and public.rest_actividad_foto_permitida(name,true))';
 end if;end $$;
create or replace function public.rest_actividad_foto_validar(c uuid,p text,cl text,r uuid,f date,n text)
returns void language plpgsql stable security definer set search_path=public as $$begin
 if coalesce(n,'')='' then return;end if;
 if not exists(select 1 from public.rest_actividades_fotos where cuenta_id=c and persona=p and usuario=auth.uid() and clase=cl and recurso=r and fecha=f and objeto=n) then raise exception 'La foto no pertenece a esta entrega.' using errcode='42501';end if;
 if to_regclass('storage.objects') is null then raise exception 'Falta el bucket privado de evidencias.';end if;
 if not exists(select 1 from storage.objects where bucket_id='restaurant-actividades' and name=n and coalesce((metadata->>'size')::bigint,0) between 1 and 300000 and metadata->>'mimetype'='image/jpeg') then raise exception 'Primero sube una foto JPEG de hasta 300 KB.';end if;
end $$;
create or replace function public.rest_actividades_rpc(p_cuenta uuid,p_aparato text,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare ctx jsonb;gerente boolean;lectura_gerente boolean;persona text;nombre text;sem date;sur text;hoy date:=(clock_timestamp() at time zone 'America/Mexico_City')::date;
 a public.rest_actividades%rowtype;o public.rest_objetivos%rowtype;h public.rest_actividades_hechas%rowtype;
 t jsonb;v jsonb;acts jsonb:='[]';objs jsonb:='[]';rev jsonb:='[]';f date;dest text;total numeric;foto text;cantidad numeric;uid uuid;avance public.rest_objetivos_avance%rowtype;
begin
 if length(p_datos::text)>16000 then raise exception 'La operación es demasiado grande.';end if;
 ctx:=public.rest_personal_fase1(p_cuenta,p_aparato,'leer','{}');gerente:=coalesce((ctx->>'gerente')::boolean,false);persona:=ctx->>'persona';
 lectura_gerente:=gerente and p_datos->>'solo_mio' is distinct from 'true';
 select x->>'nombre' into nombre from jsonb_array_elements(ctx->'equipo') x where x->>'id'=persona;nombre:=coalesce(nombre,'Administración');
 sem:=coalesce((p_datos->>'semana')::date,date_trunc('week',hoy)::date);sur:=coalesce(p_datos->>'sucursal','principal');
 if extract(isodow from sem)<>1 or length(sur)>120 then raise exception 'Revisa semana y sucursal.';end if;
 perform pg_advisory_xact_lock(hashtextextended('actividades40:'||p_cuenta::text,0));
 if p_accion in ('guardar_actividad','quitar_actividad','guardar_objetivo','quitar_objetivo','revisar') and not gerente then raise exception 'Sólo gerencia puede hacer esto.' using errcode='42501';end if;
 if p_accion='guardar_actividad' then
  if coalesce(trim(p_datos->>'titulo'),'')='' or length(p_datos->>'titulo')>200 or length(coalesce(p_datos->>'instrucciones',''))>2000 then raise exception 'Escribe qué hay que hacer (hasta 200 caracteres).';end if;
  if p_datos->>'para_tipo' not in ('persona','puesto') or (p_datos->>'para_tipo'='puesto' and p_datos->>'para_id' not in ('gerencia','servicio','cocina')) or (p_datos->>'para_tipo'='persona' and not exists(select 1 from jsonb_array_elements(ctx->'equipo') x where x->>'id'=p_datos->>'para_id' and x->>'activo'='true')) then raise exception 'Elige una persona activa o puesto.';end if;
  if p_datos->>'repite' not in ('no','diario','semana') or (p_datos->>'repite'='no' and coalesce((p_datos->>'fecha')::date,hoy-1)<hoy) or (p_datos->>'repite'='semana' and (jsonb_typeof(p_datos->'dias')<>'array' or jsonb_array_length(p_datos->'dias')=0)) then raise exception 'Elige una fecha futura o al menos un día.';end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_datos->'dias','[]')) d where d !~ '^[0-6]$') then raise exception 'Revisa los días.';end if;
  if coalesce(p_datos->>'id','')<>'' then
   select * into a from public.rest_actividades where id=(p_datos->>'id')::uuid and cuenta_id=p_cuenta for update;
   if not found or a.revision<>coalesce((p_datos->>'revision')::integer,-1) or a.retirada is not null then raise exception 'La actividad cambió. Actualiza antes de guardar.' using errcode='40001';end if;
   update public.rest_actividades set historial=historial||jsonb_build_array(to_jsonb(a)-'historial'),vigente_desde=hoy,revision=revision+1,titulo=trim(p_datos->>'titulo'),instrucciones=coalesce(p_datos->>'instrucciones',''),para_tipo=p_datos->>'para_tipo',para_id=p_datos->>'para_id',repite=p_datos->>'repite',dias=array(select value::smallint from jsonb_array_elements_text(coalesce(p_datos->'dias','[]'))),fecha=nullif(p_datos->>'fecha','')::date,hora=nullif(p_datos->>'hora','')::time where id=a.id;
  else
   insert into public.rest_actividades(cuenta_id,sucursal,titulo,instrucciones,para_tipo,para_id,repite,dias,fecha,hora,desde,vigente_desde) values(p_cuenta,sur,trim(p_datos->>'titulo'),coalesce(p_datos->>'instrucciones',''),p_datos->>'para_tipo',p_datos->>'para_id',p_datos->>'repite',array(select value::smallint from jsonb_array_elements_text(coalesce(p_datos->'dias','[]'))),nullif(p_datos->>'fecha','')::date,nullif(p_datos->>'hora','')::time,hoy,hoy);
  end if;
 elsif p_accion='quitar_actividad' then
  update public.rest_actividades set retirada=hoy,revision=revision+1 where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid and revision=(p_datos->>'revision')::integer and retirada is null;if not found then raise exception 'La actividad cambió. Actualiza.' using errcode='40001';end if;
 elsif p_accion='guardar_objetivo' then
  if coalesce(trim(p_datos->>'titulo'),'')='' or length(p_datos->>'titulo')>200 or length(coalesce(p_datos->>'instrucciones',''))>2000 or length(coalesce(p_datos->>'unidad',''))>40 then raise exception 'Completa el objetivo.';end if;
  if p_datos->>'para_tipo' not in ('persona','puesto') or (p_datos->>'para_tipo'='puesto' and p_datos->>'para_id' not in ('gerencia','servicio','cocina')) or (p_datos->>'para_tipo'='persona' and not exists(select 1 from jsonb_array_elements(ctx->'equipo') x where x->>'id'=p_datos->>'para_id' and x->>'activo'='true')) then raise exception 'Elige una persona activa o puesto.';end if;
  f:=case p_datos->>'periodo' when 'semana' then sem when 'mes' then date_trunc('month',sem+6)::date else null end;if f is null then raise exception 'Elige semana o mes.';end if;
  if coalesce(p_datos->>'id','')<>'' then
   select * into o from public.rest_objetivos where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid for update;
   if not found or o.revision<>coalesce((p_datos->>'revision')::integer,-1) or o.retirado then raise exception 'El objetivo cambió. Actualiza.' using errcode='40001';end if;
   if o.marcada is not null or exists(select 1 from public.rest_objetivos_avance where objetivo=o.id) then raise exception 'Este objetivo ya tiene entregas. Consérvalo y crea otro para cambiarlo.';end if;
   update public.rest_objetivos set titulo=trim(p_datos->>'titulo'),instrucciones=coalesce(p_datos->>'instrucciones',''),revision=revision+1,meta=nullif(p_datos->>'meta','')::numeric,unidad=coalesce(p_datos->>'unidad','') where id=o.id;
  else
   insert into public.rest_objetivos(cuenta_id,sucursal,titulo,instrucciones,para_tipo,para_id,periodo,desde,hasta,meta,unidad) values(p_cuenta,sur,trim(p_datos->>'titulo'),coalesce(p_datos->>'instrucciones',''),p_datos->>'para_tipo',p_datos->>'para_id',p_datos->>'periodo',f,case when p_datos->>'periodo'='semana' then f+6 else (f+interval '1 month'-interval '1 day')::date end,nullif(p_datos->>'meta','')::numeric,coalesce(p_datos->>'unidad',''));
  end if;
 elsif p_accion='quitar_objetivo' then
  update public.rest_objetivos set retirado=true,revision=revision+1 where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid and revision=(p_datos->>'revision')::integer;if not found then raise exception 'El objetivo cambió. Actualiza.' using errcode='40001';end if;
 elsif p_accion in ('completar_actividad','foto_preparar') and coalesce(p_datos->>'clase','actividad')='actividad' then
  select * into a from public.rest_actividades where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid;
  f:=(p_datos->>'fecha')::date;v:=public.rest_actividad_version(to_jsonb(a),f);
  if persona is null or a.id is null or f is null or f>hoy or (a.retirada is not null and f>=a.retirada) or not public.rest_actividad_ocurre(v,f) or not public.rest_actividad_asignada(p_cuenta,persona,v->>'para_tipo',v->>'para_id',f) then raise exception 'La actividad no corresponde a tu turno publicado.' using errcode='42501';end if;
  dest:=case when v->>'para_tipo'='puesto' then 'puesto:'||(v->>'para_id') else 'persona:'||persona end;
  select * into h from public.rest_actividades_hechas where actividad=a.id and fecha=f and asignacion=dest for update;
  if h.id is not null and (h.estado in ('revision','aprobada') or h.persona<>persona) then raise exception 'La entrega ya fue enviada o aprobada; no puedes modificarla.' using errcode='42501';end if;
  if p_accion='foto_preparar' then
   uid:=gen_random_uuid();foto:=p_cuenta::text||'/'||uid::text||'.jpg';insert into public.rest_actividades_fotos values(uid,p_cuenta,auth.uid(),persona,'actividad',a.id,f,foto,clock_timestamp());return jsonb_build_object('ok',true,'objeto',foto,'bucket','restaurant-actividades');
  end if;
  if length(coalesce(p_datos->>'nota',''))>2000 then raise exception 'La nota es demasiado larga.';end if;
  perform public.rest_actividad_foto_validar(p_cuenta,persona,'actividad',a.id,f,p_datos->>'foto');
  insert into public.rest_actividades_hechas(cuenta_id,actividad,fecha,asignacion,persona,titulo,estado,nota,foto) values(p_cuenta,a.id,f,dest,persona,v->>'titulo','revision',coalesce(p_datos->>'nota',''),coalesce(p_datos->>'foto','')) on conflict(actividad,fecha,asignacion) do update set estado='revision',nota=excluded.nota,foto=excluded.foto,marcada=clock_timestamp(),revision=rest_actividades_hechas.revision+1,historial=rest_actividades_hechas.historial||jsonb_build_array(to_jsonb(h)-'historial'),revisada=null,revisada_por=null,comentario='';
 elsif p_accion in ('avanzar','cumplir_objetivo','reenviar_objetivo','foto_preparar') then
  select * into o from public.rest_objetivos where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid for update;
  if o.id is null or persona is null or o.retirado or hoy not between o.desde and o.hasta or not public.rest_objetivo_asignado(p_cuenta,persona,o.para_tipo,o.para_id,o.desde,o.hasta) then raise exception 'Este objetivo no corresponde a tus turnos publicados.' using errcode='42501';end if;
  if o.estado in ('revision','aprobada') then raise exception 'El objetivo ya fue enviado o aprobado.' using errcode='42501';end if;
  if length(coalesce(p_datos->>'nota',''))>2000 then raise exception 'La nota es demasiado larga.';end if;
  if p_accion='foto_preparar' then
   uid:=gen_random_uuid();foto:=p_cuenta::text||'/'||uid::text||'.jpg';insert into public.rest_actividades_fotos values(uid,p_cuenta,auth.uid(),persona,'objetivo',o.id,hoy,foto,clock_timestamp());return jsonb_build_object('ok',true,'objeto',foto,'bucket','restaurant-actividades');
  end if;
  perform public.rest_actividad_foto_validar(p_cuenta,persona,'objetivo',o.id,hoy,p_datos->>'foto');
  select coalesce(sum(av.cantidad),0) into total from public.rest_objetivos_avance av where av.objetivo=o.id;
  if p_accion='avanzar' then
   cantidad:=(p_datos->>'cantidad')::numeric;if o.meta is null or cantidad is null or cantidad<=0 or cantidad>1000000000 then raise exception 'Escribe cuántos lograste, mayor que cero.';end if;
   uid:=(p_datos->>'avance_id')::uuid;if uid is null then raise exception 'Falta el identificador del avance.';end if;
   select * into avance from public.rest_objetivos_avance where id=uid;
   if found then if avance.objetivo<>o.id or avance.persona<>persona or avance.cantidad<>cantidad then raise exception 'Ese avance no corresponde.';end if;
   else insert into public.rest_objetivos_avance(id,cuenta_id,objetivo,persona,cantidad,nota) values(uid,p_cuenta,o.id,persona,cantidad,coalesce(p_datos->>'nota',''));total:=total+cantidad;end if;
  elsif p_accion='cumplir_objetivo' and o.meta is not null then raise exception 'Con meta numérica debes registrar avance.';
  elsif p_accion='reenviar_objetivo' and (o.estado<>'regresada' or (o.meta is not null and total<o.meta) or (trim(coalesce(p_datos->>'nota',''))='' and coalesce(p_datos->>'foto','')='')) then raise exception 'Explica qué corregiste antes de reenviar.';end if;
  update public.rest_objetivos set estado=case when meta is null or total>=meta then 'revision' else 'pendiente' end,persona=persona,nota=coalesce(p_datos->>'nota',''),foto=coalesce(p_datos->>'foto',''),marcada=case when meta is null or total>=meta then clock_timestamp() else null end,revision=revision+1,historial=historial||jsonb_build_array(to_jsonb(o)-'historial'),comentario='',revisada=null,revisada_por=null where id=o.id;
 elsif p_accion='revisar' then
  if p_datos->>'aprobar' is distinct from 'true' and trim(coalesce(p_datos->>'comentario',''))='' then raise exception 'Escribe qué falta antes de regresar la entrega.';end if;
  if length(coalesce(p_datos->>'comentario',''))>2000 then raise exception 'El comentario es demasiado largo.';end if;
  if p_datos->>'clase'='actividad' then
   select * into h from public.rest_actividades_hechas where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid for update;
   if h.id is null or h.estado<>'revision' or h.revision<>coalesce((p_datos->>'revision')::integer,-1) then raise exception 'La entrega cambió. Actualiza antes de revisar.' using errcode='40001';end if;
   update public.rest_actividades_hechas set estado=case when p_datos->>'aprobar'='true' then 'aprobada' else 'regresada' end,comentario=coalesce(p_datos->>'comentario',''),revisada=clock_timestamp(),revisada_por=nombre,revision=revision+1,historial=historial||jsonb_build_array(to_jsonb(h)-'historial') where id=h.id;
  else
   select * into o from public.rest_objetivos where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid for update;
   if o.id is null or o.estado<>'revision' or o.revision<>coalesce((p_datos->>'revision')::integer,-1) then raise exception 'El objetivo cambió. Actualiza antes de revisar.' using errcode='40001';end if;
   update public.rest_objetivos set estado=case when p_datos->>'aprobar'='true' then 'aprobada' else 'regresada' end,comentario=coalesce(p_datos->>'comentario',''),revisada=clock_timestamp(),revisada_por=nombre,revision=revision+1,historial=historial||jsonb_build_array(to_jsonb(o)-'historial') where id=o.id;
  end if;
 elsif p_accion<>'leer' then raise exception 'Operación desconocida.';end if;
 -- Instancias reales; nada aparece antes de que se haya asignado.
 for a in select * from public.rest_actividades where cuenta_id=p_cuenta and sucursal=sur and desde<=sem+6 loop
  for f in select d::date from generate_series(sem,sem+6,interval '1 day') d loop
   v:=public.rest_actividad_version(to_jsonb(a),f);
   if (a.retirada is null or f<a.retirada) and public.rest_actividad_ocurre(v,f) and (lectura_gerente or public.rest_actividad_asignada(p_cuenta,persona,v->>'para_tipo',v->>'para_id',f)) then
    dest:=case when v->>'para_tipo'='puesto' then 'puesto:'||(v->>'para_id') else 'persona:'||(v->>'para_id') end;
    select * into h from public.rest_actividades_hechas where actividad=a.id and fecha=f and asignacion=dest;
    acts:=acts||jsonb_build_array((v-'historial')||jsonb_build_object('fecha_instancia',f,'estado',coalesce(h.estado,case when f<hoy then 'vencida' else 'pendiente' end),'hecho',case when h.id is null then null else to_jsonb(h)-'historial' end));
   end if;
  end loop;
 end loop;
 for o in select * from public.rest_objetivos where cuenta_id=p_cuenta and sucursal=sur and not retirado and desde<=sem+6 and hasta>=sem and (lectura_gerente or public.rest_objetivo_asignado(p_cuenta,persona,para_tipo,para_id,desde,hasta)) loop
  objs:=objs||jsonb_build_array((to_jsonb(o)-'historial')||jsonb_build_object('avance',coalesce((select sum(av.cantidad) from public.rest_objetivos_avance av where av.objetivo=o.id),0),'aportes',coalesce((select jsonb_agg(z) from (select av.persona,sum(av.cantidad) cantidad from public.rest_objetivos_avance av where av.objetivo=o.id group by av.persona) z),'[]'),'mio',coalesce((select sum(av.cantidad) from public.rest_objetivos_avance av where av.objetivo=o.id and av.persona=persona),0)));
 end loop;
 if lectura_gerente then
  select coalesce(jsonb_agg((to_jsonb(x)-'historial')||jsonb_build_object('clase','actividad')),'[]') into rev from public.rest_actividades_hechas x where x.cuenta_id=p_cuenta and x.estado='revision';
  rev:=rev||coalesce((select jsonb_agg((to_jsonb(x)-'historial')||jsonb_build_object('clase','objetivo')) from public.rest_objetivos x where x.cuenta_id=p_cuenta and x.estado='revision' and not x.retirado),'[]');
 end if;
 return jsonb_build_object('ok',true,'gerente',lectura_gerente,'persona',persona,'hoy',hoy,'semana',sem,'actividades',acts,'objetivos',objs,'revisiones',rev,'plantillas',case when lectura_gerente then coalesce((select jsonb_agg(to_jsonb(x)-'historial') from public.rest_actividades x where x.cuenta_id=p_cuenta and x.sucursal=sur and x.retirada is null),'[]') else '[]'::jsonb end);
end $$;
revoke all on function public.rest_actividades_rpc(uuid,text,text,jsonb) from public;grant execute on function public.rest_actividades_rpc(uuid,text,text,jsonb) to authenticated;
-- Sólo los comprobadores usados por RLS son invocables por authenticated.
revoke all on function public.rest_actividad_asignada(uuid,text,text,text,date),public.rest_objetivo_asignado(uuid,text,text,text,date,date),public.rest_actividad_version(jsonb,date),public.rest_actividad_ocurre(jsonb,date),public.rest_actividad_foto_validar(uuid,text,text,uuid,date,text) from public;
revoke all on function public.rest_actividades_rls(uuid,text,text,date,date),public.rest_actividad_foto_permitida(text,boolean) from public;
grant execute on function public.rest_actividades_rls(uuid,text,text,date,date),public.rest_actividad_foto_permitida(text,boolean) to authenticated;
revoke all on function public.rest_actividad_hecha_rls(uuid,uuid,date) from public;
grant execute on function public.rest_actividad_hecha_rls(uuid,uuid,date) to authenticated;
create or replace function public.nuvoor_rest_actividades_disponible() returns boolean language sql stable as $$select true$$;
revoke all on function public.nuvoor_rest_actividades_disponible() from public;grant execute on function public.nuvoor_rest_actividades_disponible() to authenticated;
notify pgrst,'reload schema';
commit;
