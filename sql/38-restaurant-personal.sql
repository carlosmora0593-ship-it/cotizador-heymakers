-- 38 · Acceso de personal de Restaurant por correo y PIN.
-- Ejecutar después de 20, 30, 31, 33, 34 y 35, con la publicación de personal.
-- Se puede repetir. No agrega miembros administradores al personal.
-- Conserva los accesos de los dueños y los datos de otros negocios.
-- Correr después de las migraciones anteriores, en el orden del Lab.
begin;
create table if not exists public.rest_personal_accesos(
 id uuid primary key default gen_random_uuid(),
 cuenta_id uuid not null references public.cuentas(id) on delete cascade,
 persona_id text not null,
 usuario_id uuid references auth.users(id) on delete set null,
 correo text not null,
 activo boolean not null default true,
 estado text not null default 'preparando' check(estado in ('preparando','enviada','activo','error','retirado')),
 nonce_hash text,
 nonce_vence timestamptz,
 solicitud uuid not null,
 creada_por uuid not null references auth.users(id),
 creado timestamptz not null default clock_timestamp(),
 actualizado timestamptz not null default clock_timestamp(),
 enviada timestamptz,
 aceptada timestamptz,
 unique(cuenta_id,persona_id),
 check(correo=lower(btrim(correo)))
);
create unique index if not exists rest_personal_un_usuario on public.rest_personal_accesos(cuenta_id,usuario_id) where usuario_id is not null and activo;
create unique index if not exists rest_personal_un_correo on public.rest_personal_accesos(cuenta_id,correo) where activo;
alter table public.rest_personal_accesos enable row level security;
alter table public.rest_personal_accesos add column if not exists requiere_password boolean not null default false;
alter table public.rest_personal_accesos add column if not exists fallos_pin integer not null default 0;
alter table public.rest_personal_accesos add column if not exists bloqueado_pin timestamptz;
alter table public.rest_personal_accesos add column if not exists fallos_autorizar integer not null default 0;
alter table public.rest_personal_accesos add column if not exists bloqueado_autorizar timestamptz;
revoke all on public.rest_personal_accesos from anon,authenticated;
grant all on public.rest_personal_accesos to service_role;

-- La marca se conserva al retirar/cambiar un acceso. Evita que una política
-- antigua basada sólo en mi_cuenta() abra datos al perfil de compatibilidad.
create table if not exists public.rest_personal_usuarios(
 usuario_id uuid not null references auth.users(id) on delete cascade,
 cuenta_id uuid not null references public.cuentas(id) on delete cascade,
 primary key(usuario_id,cuenta_id)
);
alter table public.rest_personal_usuarios enable row level security;
revoke all on public.rest_personal_usuarios from anon,authenticated;
grant all on public.rest_personal_usuarios to service_role;

create or replace function public.rest_personal_marca_usuario()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.usuario_id is not null then insert into public.rest_personal_usuarios values(new.usuario_id,new.cuenta_id) on conflict do nothing;end if;
 return new;
end $$;
revoke all on function public.rest_personal_marca_usuario() from public;
drop trigger if exists rest_personal_marca_usuario on public.rest_personal_accesos;
create trigger rest_personal_marca_usuario after insert or update of usuario_id,cuenta_id on public.rest_personal_accesos for each row execute function public.rest_personal_marca_usuario();

-- Una membresía antigua de ventas/producción no abre otras puertas al
-- empleado ligado a un perfil. El administrador real conserva su propiedad.
create or replace function public.rol_en(cuenta uuid)
returns text language sql stable security definer set search_path=public as $$
 select m.rol from public.membresias m where m.usuario_id=auth.uid() and m.cuenta_id=cuenta
 and (m.rol='admin' or not exists(select 1 from public.rest_personal_usuarios p where p.usuario_id=m.usuario_id and p.cuenta_id=m.cuenta_id)) limit 1
$$;
create or replace function public.es_miembro(cuenta uuid)
returns boolean language sql stable security definer set search_path=public as $$select public.rol_en(cuenta) is not null$$;

create or replace function public.rest_personal_cuentas_restringidas()
returns uuid[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(u.cuenta_id),'{}'::uuid[]) from public.rest_personal_usuarios u where u.usuario_id=auth.uid()
 and not coalesce(public.rol_en(u.cuenta_id)='admin',false)
 and not exists(select 1 from public.staff where id=auth.uid() and rol='dueno')
$$;
revoke all on function public.rest_personal_cuentas_restringidas() from public;
grant execute on function public.rest_personal_cuentas_restringidas() to authenticated;

-- Se evalúa la lista una vez por consulta. Los usuarios actuales no tienen
-- marca y conservan sus políticas. Las RPC de personal aplican su propio rol.
do $$ declare t record;v_regla text;begin
 for t in select distinct c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
 where n.nspname='public' and c.relkind in ('r','p') and a.attname='cuenta_id' and a.atttypid='uuid'::regtype and not a.attisdropped
 and c.relname not like 'rest_personal_%' loop
  v_regla:='cuenta_id <> all((select public.rest_personal_cuentas_restringidas())::uuid[])';
  if t.relname='perfiles' then v_regla:='('||v_regla||') or id=auth.uid()';end if;
  execute format('drop policy if exists rest_personal_acceso_directo on public.%I',t.relname);
  execute format('create policy rest_personal_acceso_directo on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t.relname,v_regla,v_regla);
 end loop;
 if to_regclass('public.perfiles') is not null then
  execute 'drop policy if exists rest_personal_perfil_sin_edicion on public.perfiles';
  execute 'create policy rest_personal_perfil_sin_edicion on public.perfiles as restrictive for update to authenticated using (cuenta_id <> all((select public.rest_personal_cuentas_restringidas())::uuid[])) with check (cuenta_id <> all((select public.rest_personal_cuentas_restringidas())::uuid[]))';
 end if;
end $$;

-- No se sustituye el alta existente de otros productos. La vinculación de
-- una persona nueva se confirma en estado_envio, sólo desde el servidor.
create table if not exists public.rest_personal_envios(
 solicitud uuid primary key,
 cuenta_id uuid not null references public.cuentas(id) on delete cascade,
 acceso_id uuid not null references public.rest_personal_accesos(id) on delete cascade,
 estado text not null default 'preparando' check(estado in ('preparando','enviada','error')),
 creado timestamptz not null default clock_timestamp()
);
alter table public.rest_personal_envios enable row level security;
revoke all on public.rest_personal_envios from anon,authenticated;
grant all on public.rest_personal_envios to service_role;

create table if not exists public.rest_personal_dispositivos(
 acceso_id uuid not null references public.rest_personal_accesos(id) on delete cascade,
 aparato text not null,
 fallos integer not null default 0,
 bloqueado timestamptz,
 vence timestamptz,
 ultima_autenticacion numeric not null default 0,
 primary key(acceso_id,aparato)
);
alter table public.rest_personal_dispositivos enable row level security;
alter table public.rest_personal_dispositivos add column if not exists fecha_pin date;
revoke all on public.rest_personal_dispositivos from anon,authenticated;
grant all on public.rest_personal_dispositivos to service_role;

-- Cuenta heredada: el último recurso nunca abre un negocio al personal
-- que sólo dispone de un acceso por perfil. Los miembros actuales conservan
-- la selección de negocio y las políticas originales.
create or replace function public.mi_cuenta()
returns uuid language sql stable security definer set search_path=public as $$
 select coalesce(
  (select p.cuenta_activa from public.perfiles p where p.id=auth.uid() and public.es_miembro(p.cuenta_activa)),
  (select m.cuenta_id from public.membresias m where m.usuario_id=auth.uid() and public.rol_en(m.cuenta_id) is not null order by m.creado limit 1),
  (select p.cuenta_id from public.perfiles p where p.id=auth.uid() and not exists(
   select 1 from public.rest_personal_usuarios u where u.usuario_id=p.id and u.cuenta_id=p.cuenta_id)))
$$;

-- Multisucursal comparte el cupo entre los Restaurant de su administrador
-- principal. No se multiplica al crear otra sucursal con la misma licencia.
create or replace function public.rest_personal_cupo(p_cuenta uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_plan text;v_owner uuid;v_ids uuid[];v_n integer;
begin
 select plan into v_plan from public.cuentas where id=p_cuenta;
 if v_plan in ('maker','multiempresa') then
  select usuario_id into v_owner from public.membresias where cuenta_id=p_cuenta and rol='admin' order by creado,usuario_id limit 1;
  select array_agg(c.id) into v_ids from public.cuentas c where c.producto='restaurant' and c.plan in ('maker','multiempresa') and
   (c.id=p_cuenta or v_owner=(select m.usuario_id from public.membresias m where m.cuenta_id=c.id and m.rol='admin' order by m.creado,m.usuario_id limit 1));
 else v_ids:=array[p_cuenta];end if;
 select count(*) into v_n from public.rest_personal_accesos where cuenta_id=any(v_ids) and activo;
 return jsonb_build_object('cuentas',to_jsonb(v_ids),'limite',case when v_plan in ('maker','multiempresa') then 40 else 15 end,
  'usados',v_n,'bloqueo',coalesce(v_owner::text,p_cuenta::text));
end $$;
revoke all on function public.rest_personal_cupo(uuid) from public;

create or replace function public.rest_personal_admin(p_cuenta uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.cuentas c where c.id=p_cuenta and c.producto='restaurant')
 and coalesce((public.rol_en(p_cuenta)='admin' or exists(select 1 from public.staff s where s.id=auth.uid() and s.rol='dueno')),false)
$$;
revoke all on function public.rest_personal_admin(uuid) from public;
grant execute on function public.rest_personal_admin(uuid) to authenticated;

create or replace function public.rest_personal_listar(p_cuenta uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_cuenta public.cuentas%rowtype;v_lista jsonb;
begin
 if not public.rest_personal_admin(p_cuenta) then raise exception 'No puedes administrar este equipo.' using errcode='42501';end if;
 select * into v_cuenta from public.cuentas where id=p_cuenta;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',d.cuerpo->>'id','nombre',d.cuerpo->>'nombre','rol',d.cuerpo->>'rol',
  'activo',coalesce((d.cuerpo->>'activo')::boolean,true),
  'pinConfigurado',coalesce(d.cuerpo->>'pin_hash','')<>'',
  'accesoId',a.id,'correo',a.correo,'estado',coalesce(a.estado,'sin_acceso'),
  'enviada',a.enviada,'aceptada',a.aceptada
 ) order by lower(d.cuerpo->>'nombre')),'[]') into v_lista
 from public.documentos d left join public.rest_personal_accesos a on a.cuenta_id=d.cuenta_id and a.persona_id=d.cuerpo->>'id'
 where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and coalesce(d.cuerpo->>'eventoId','')=''
 and d.cuerpo->>'_eliminado' is distinct from 'true';
 return jsonb_build_object('personas',v_lista,'cuenta',p_cuenta,'nombre',v_cuenta.nombre,
 'limite',(public.rest_personal_cupo(p_cuenta)->>'limite')::integer,
 'usados',(public.rest_personal_cupo(p_cuenta)->>'usados')::integer,
 'plan',case when v_cuenta.plan in ('maker','multiempresa') then 'Multisucursal' else 'Estándar' end);
end $$;
revoke all on function public.rest_personal_listar(uuid) from public;
grant execute on function public.rest_personal_listar(uuid) to authenticated;

create or replace function public.rest_personal_preparar(p_cuenta uuid,p_persona text,p_correo text,p_solicitud uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_c public.cuentas%rowtype;v_p jsonb;v_a public.rest_personal_accesos%rowtype;v_nonce text;v_limite integer;v_cuantos integer;v_envio public.rest_personal_envios%rowtype;v_cupo jsonb;
begin
 if not public.rest_personal_admin(p_cuenta) then raise exception 'No puedes invitar personal a este negocio.' using errcode='42501';end if;
 if p_solicitud is null then raise exception 'Falta identificar la solicitud.' using errcode='22023';end if;
 p_correo:=lower(btrim(coalesce(p_correo,'')));
 if length(p_correo)>254 or p_correo !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' then raise exception 'Escribe un correo válido.' using errcode='22023';end if;
 v_cupo:=public.rest_personal_cupo(p_cuenta);
 perform pg_advisory_xact_lock(hashtextextended('personal:'||(v_cupo->>'bloqueo'),0));
 v_cupo:=public.rest_personal_cupo(p_cuenta);
 select * into v_envio from public.rest_personal_envios where solicitud=p_solicitud;
 if found then
  select * into v_a from public.rest_personal_accesos where id=v_envio.acceso_id;
  if v_envio.cuenta_id<>p_cuenta or v_a.persona_id<>p_persona or v_a.correo<>p_correo then raise exception 'La solicitud ya pertenece a otra invitación.' using errcode='22023';end if;
  return jsonb_build_object('ok',v_envio.estado<>'error','yaEnviada',v_envio.estado='enviada','enProceso',v_envio.estado='preparando','id',v_envio.acceso_id);
 end if;
 select * into v_c from public.cuentas where id=p_cuenta for update;
 if v_c.estado<>'activa' or v_c.plan='ninguno' or coalesce(v_c.vence,now())<=now() then raise exception 'El plan del negocio necesita estar vigente.' using errcode='42501';end if;
 select cuerpo into v_p from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo'
 and cuerpo->>'id'=p_persona and coalesce(cuerpo->>'eventoId','')='' and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true';
 if v_p is null or coalesce(v_p->>'rol','') not in ('gerente','cajero','mesero','cocina') then raise exception 'Selecciona un perfil activo de Personal.' using errcode='22023';end if;
 select * into v_a from public.rest_personal_accesos where cuenta_id=p_cuenta and persona_id=p_persona for update;
 if v_a.enviada>now()-interval '60 seconds' then raise exception 'Espera un minuto antes de reenviar.' using errcode='P0001';end if;
 if v_a.estado='preparando' and v_a.actualizado>now()-interval '60 seconds' then raise exception 'La invitación todavía se está enviando.' using errcode='P0001';end if;
 if v_a.usuario_id is not null and v_a.correo<>p_correo and v_a.activo then raise exception 'Retira el acceso anterior antes de cambiar el correo.' using errcode='22023';end if;
 v_limite:=(v_cupo->>'limite')::integer;
 v_cuantos:=(v_cupo->>'usados')::integer-case when v_a.activo then 1 else 0 end;
 if v_cuantos>=v_limite then raise exception 'Este plan ya alcanzó su límite de personas con acceso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('personal:correo:limite-hora',0));
 if (select count(*) from public.rest_personal_envios where creado>clock_timestamp()-interval '1 hour')>=100 then
  raise exception 'Se alcanzó el límite de 100 correos por hora. Intenta más tarde.' using errcode='P0001';end if;
 v_nonce:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.rest_personal_accesos(cuenta_id,persona_id,correo,solicitud,creada_por,nonce_hash,nonce_vence)
 values(p_cuenta,p_persona,p_correo,p_solicitud,auth.uid(),encode(sha256(convert_to(v_nonce,'UTF8')),'hex'),now()+interval '24 hours')
 on conflict(cuenta_id,persona_id) do update set correo=excluded.correo,solicitud=excluded.solicitud,nonce_hash=excluded.nonce_hash,nonce_vence=excluded.nonce_vence,
 activo=true,estado=case when rest_personal_accesos.estado='activo' and rest_personal_accesos.activo and rest_personal_accesos.correo=excluded.correo then 'activo' else 'preparando' end,usuario_id=case when rest_personal_accesos.correo=excluded.correo then rest_personal_accesos.usuario_id else null end,actualizado=clock_timestamp()
 returning * into v_a;
 insert into public.rest_personal_envios(solicitud,cuenta_id,acceso_id) values(p_solicitud,p_cuenta,v_a.id);
 return jsonb_build_object('ok',true,'id',v_a.id,'nonce',v_nonce,'correo',v_a.correo,'nombre',v_p->>'nombre','negocio',v_c.nombre,'usuarioId',v_a.usuario_id);
end $$;
revoke all on function public.rest_personal_preparar(uuid,text,text,uuid) from public;
grant execute on function public.rest_personal_preparar(uuid,text,text,uuid) to authenticated;

create or replace function public.rest_personal_retirar(p_cuenta uuid,p_persona text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.rest_personal_admin(p_cuenta) then raise exception 'No puedes retirar este acceso.' using errcode='42501';end if;
 update public.rest_personal_accesos set activo=false,estado='retirado',nonce_hash=null,nonce_vence=null,actualizado=clock_timestamp()
 where cuenta_id=p_cuenta and persona_id=p_persona returning id into v_id;
 delete from public.rest_personal_dispositivos where acceso_id=v_id;
 return true;
end $$;
revoke all on function public.rest_personal_retirar(uuid,text) from public;
grant execute on function public.rest_personal_retirar(uuid,text) to authenticated;

-- El servidor de invitaciones usa esto; el navegador no consulta Auth.
create or replace function public.rest_personal_auth_por_correo(p_correo text)
returns uuid language sql stable security definer set search_path=public as $$
 select id from auth.users where lower(email)=lower(btrim(p_correo)) limit 1
$$;
revoke all on function public.rest_personal_auth_por_correo(text) from public,anon,authenticated;
grant execute on function public.rest_personal_auth_por_correo(text) to service_role;

create or replace function public.rest_personal_auth_buscar(p_correo text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',id,'requierePassword',coalesce(encrypted_password,'')='')
 from auth.users where lower(email)=lower(btrim(p_correo)) limit 1
$$;
revoke all on function public.rest_personal_auth_buscar(text) from public,anon,authenticated;
grant execute on function public.rest_personal_auth_buscar(text) to service_role;

create or replace function public.rest_personal_estado_envio(p_id uuid,p_solicitud uuid,p_usuario uuid,p_ok boolean,p_nuevo boolean default false,p_preparando boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_a public.rest_personal_accesos%rowtype;v_origen uuid;v_creado timestamptz;
begin
 if p_usuario is not null and exists(select 1 from public.rest_personal_accesos a join public.rest_personal_accesos b on b.cuenta_id=a.cuenta_id and b.usuario_id=p_usuario and b.activo and b.id<>a.id where a.id=p_id)
 then raise exception 'Este usuario ya está vinculado a otro perfil del negocio.' using errcode='22023';end if;
 update public.rest_personal_envios set estado=case when p_preparando then 'preparando' when p_ok then 'enviada' else 'error' end where solicitud=p_solicitud and acceso_id=p_id;
 if not found then raise exception 'La solicitud de invitación no existe.' using errcode='22023';end if;
 update public.rest_personal_accesos set usuario_id=coalesce(p_usuario,usuario_id),estado=case when estado='activo' then 'activo' when p_preparando then 'preparando' when p_ok then 'enviada' else 'error' end,
 enviada=case when p_ok then clock_timestamp() else enviada end,requiere_password=requiere_password or p_nuevo,actualizado=clock_timestamp() where id=p_id and activo and solicitud=p_solicitud returning * into v_a;
 if not found then return false;end if;
 if p_nuevo then
  select created_at into v_creado from auth.users where id=p_usuario and lower(email)=v_a.correo;
  if v_creado is null or v_creado<v_a.creado-interval '1 second' then raise exception 'El usuario nuevo no corresponde a esta invitación.' using errcode='22023';end if;
  select cuenta_id into v_origen from public.perfiles where id=p_usuario;
  if v_origen is not null and v_origen<>v_a.cuenta_id
  and exists(select 1 from public.cuentas where id=v_origen and plan in ('ninguno','prueba') and creada>=v_creado-interval '1 second')
  and not exists(select 1 from public.documentos where cuenta_id=v_origen)
  and not exists(select 1 from public.perfiles where cuenta_id=v_origen and id<>p_usuario)
  and not exists(select 1 from public.membresias where cuenta_id=v_origen and usuario_id<>p_usuario) then
   update public.perfiles set cuenta_id=v_a.cuenta_id,cuenta_activa=v_a.cuenta_id,rol='produccion' where id=p_usuario;
   delete from public.membresias where usuario_id=p_usuario and cuenta_id=v_origen;
   delete from public.cuentas where id=v_origen;
  end if;
 end if;
 return true;
end $$;
revoke all on function public.rest_personal_estado_envio(uuid,uuid,uuid,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.rest_personal_estado_envio(uuid,uuid,uuid,boolean,boolean,boolean) to service_role;

-- Sólo un cambio real de contraseña en Auth completa este paso. No se
-- guarda, lee ni entrega la contraseña a Lab ni al dueño del restaurante.
create or replace function public.rest_personal_password_cambiada()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
  update public.rest_personal_accesos set requiere_password=false where usuario_id=new.id and activo;
 end if;
 return new;
end $$;
revoke all on function public.rest_personal_password_cambiada() from public;
drop trigger if exists rest_personal_password_cambiada on auth.users;
create trigger rest_personal_password_cambiada after update of encrypted_password on auth.users for each row execute function public.rest_personal_password_cambiada();

create or replace function public.rest_personal_validar(p_id uuid,p_nonce text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_a public.rest_personal_accesos%rowtype;v_necesita boolean;
begin
 select * into v_a from public.rest_personal_accesos where id=p_id and usuario_id=auth.uid() and activo and estado in ('enviada','activo');
 if not found or v_a.nonce_vence<=now() or coalesce(v_a.nonce_hash,'')='' or v_a.nonce_hash is distinct from encode(sha256(convert_to(coalesce(p_nonce,''),'UTF8')),'hex') then
  raise exception 'Confirma el correo al que llegó esta invitación.' using errcode='42501';end if;
 select coalesce(encrypted_password,'')='' into v_necesita from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if not found then raise exception 'Confirma primero tu correo.' using errcode='42501';end if;
 return jsonb_build_object('cuenta',v_a.cuenta_id,'requierePassword',v_necesita or v_a.requiere_password);
end $$;
revoke all on function public.rest_personal_validar(uuid,text) from public;
grant execute on function public.rest_personal_validar(uuid,text) to authenticated;

create or replace function public.rest_personal_aceptar(p_id uuid,p_nonce text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a public.rest_personal_accesos%rowtype;v_p jsonb;
begin
 if auth.uid() is null then raise exception 'Confirma tu correo para continuar.' using errcode='42501';end if;
 select * into v_a from public.rest_personal_accesos where id=p_id for update;
 if not found or v_a.usuario_id is distinct from auth.uid() or not v_a.activo or v_a.estado not in ('enviada','activo')
 or v_a.nonce_hash is null or v_a.nonce_vence is null or v_a.nonce_vence<=now() or v_a.nonce_hash is distinct from encode(sha256(convert_to(coalesce(p_nonce,''),'UTF8')),'hex')
 then raise exception 'Esta invitación venció o ya no está disponible. Pide que la reenvíen.' using errcode='42501';end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Primero confirma tu correo.' using errcode='42501';end if;
 if v_a.requiere_password or exists(select 1 from auth.users where id=auth.uid() and coalesce(encrypted_password,'')='') then raise exception 'Primero crea tu contraseña.' using errcode='42501';end if;
 select cuerpo into v_p from public.documentos where cuenta_id=v_a.cuenta_id and coleccion='rest_equipo' and cuerpo->>'id'=v_a.persona_id
 and coalesce(cuerpo->>'eventoId','')='' and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true';
 if v_p is null or coalesce(v_p->>'rol','') not in ('gerente','cajero','mesero','cocina') then raise exception 'Tu perfil ya no está activo.' using errcode='42501';end if;
 update public.rest_personal_accesos set estado='activo',aceptada=clock_timestamp(),nonce_hash=null,nonce_vence=null,actualizado=clock_timestamp() where id=p_id;
 return jsonb_build_object('ok',true,'cuenta',v_a.cuenta_id,'persona',v_a.persona_id,'nombre',v_p->>'nombre','rol',v_p->>'rol');
end $$;
revoke all on function public.rest_personal_aceptar(uuid,text) from public;
grant execute on function public.rest_personal_aceptar(uuid,text) to authenticated;
-- El personal conserva su sesión propia. No recibe una membresía de admin.
create or replace function public.rest_personal_contexto(p_cuenta uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_a public.rest_personal_accesos%rowtype;v_p jsonb;v_c public.cuentas%rowtype;
begin
 if auth.uid() is null then raise exception 'Vuelve a iniciar sesión.' using errcode='42501';end if;
 select * into v_a from public.rest_personal_accesos where cuenta_id=p_cuenta and usuario_id=auth.uid() and activo and estado='activo';
 if not found then raise exception 'Tu acceso a este negocio no está activo.' using errcode='42501';end if;
 select cuerpo into v_p from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo'
 and cuerpo->>'id'=v_a.persona_id and coalesce(cuerpo->>'eventoId','')='' and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true';
 if v_p is null or coalesce(v_p->>'rol','') not in ('gerente','cajero','mesero','cocina') then raise exception 'Tu perfil ya no está activo.' using errcode='42501';end if;
 select * into v_c from public.cuentas where id=p_cuenta and producto='restaurant';
 if not found or v_c.estado<>'activa' or v_c.plan='ninguno' or coalesce(v_c.vence,now())<=now() then raise exception 'El plan del restaurante necesita renovarse.' using errcode='42501';end if;
 return jsonb_build_object('accesoId',v_a.id,'cuenta',p_cuenta,'negocio',v_c.nombre,'persona',v_a.persona_id,'nombre',v_p->>'nombre','rol',v_p->>'rol','plan',v_c.plan,'vence',v_c.vence,'estado',v_c.estado,'producto','restaurant','pinConfigurado',coalesce(v_p->>'pin_hash','')<>'');
end $$;
revoke all on function public.rest_personal_contexto(uuid) from public;
grant execute on function public.rest_personal_contexto(uuid) to authenticated;

create or replace function public.rest_personal_mis_negocios()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_a record;v_d jsonb;v_out jsonb:='[]';
begin
 if auth.uid() is null then return '[]';end if;
 for v_a in select cuenta_id from public.rest_personal_accesos where usuario_id=auth.uid() and activo and estado='activo' order by aceptada loop
  begin v_d:=public.rest_personal_contexto(v_a.cuenta_id);v_out:=v_out||jsonb_build_array(v_d);exception when insufficient_privilege then null;end;
 end loop;
 return v_out;
end $$;
revoke all on function public.rest_personal_mis_negocios() from public;
grant execute on function public.rest_personal_mis_negocios() to authenticated;

alter table public.rest_personal_dispositivos add column if not exists fallos_autorizacion integer not null default 0;
alter table public.rest_personal_dispositivos add column if not exists autorizacion_bloqueada timestamptz;
create or replace function public.rest_personal_sesion(p_cuenta uuid,p_aparato text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_ctx jsonb;
begin
 v_ctx:=public.rest_personal_contexto(p_cuenta);
 if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then raise exception 'El dispositivo no es válido.' using errcode='22023';end if;
 if exists(select 1 from public.rest_personal_accesos where id=(v_ctx->>'accesoId')::uuid and bloqueado_pin is not null)
 or not exists(select 1 from public.rest_personal_dispositivos where acceso_id=(v_ctx->>'accesoId')::uuid and aparato=p_aparato and bloqueado is null and vence>clock_timestamp() and fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date)
 then raise exception 'Confirma tu PIN para continuar.' using errcode='42501',hint='PIN_REQUERIDO';end if;
 return v_ctx;
end $$;
revoke all on function public.rest_personal_sesion(uuid,text) from public;
grant execute on function public.rest_personal_sesion(uuid,text) to authenticated;

create or replace function public.rest_personal_pin(p_cuenta uuid,p_aparato text,p_pin text,p_autorizar boolean default false,p_comanda text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ctx jsonb;v_id uuid;v_d public.rest_personal_dispositivos%rowtype;v_a public.rest_personal_accesos%rowtype;v_p jsonb;v_salt text;v_hash text;v_amr numeric:=0;
begin
 v_ctx:=public.rest_personal_contexto(p_cuenta);v_id:=(v_ctx->>'accesoId')::uuid;
 select * into v_a from public.rest_personal_accesos where id=v_id for update;
 if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' or coalesce(p_pin,'') !~ '^[0-9]{4,12}$' then return jsonb_build_object('ok',false,'error','Escribe un PIN válido.');end if;
 insert into public.rest_personal_dispositivos(acceso_id,aparato) values(v_id,p_aparato) on conflict do nothing;
 select * into v_d from public.rest_personal_dispositivos where acceso_id=v_id and aparato=p_aparato for update;
 if p_autorizar then
  perform public.rest_personal_sesion(p_cuenta,p_aparato);
  if coalesce(p_comanda,'')='' then return jsonb_build_object('ok',false,'error','Primero abre el pedido.');end if;
  if v_a.bloqueado_autorizar>clock_timestamp()-interval '15 minutes' then return jsonb_build_object('ok',false,'error','Se alcanzó el límite de intentos de autorización. Espera 15 minutos.');end if;
  if v_a.bloqueado_autorizar is not null then
   update public.rest_personal_accesos set fallos_autorizar=0,bloqueado_autorizar=null where id=v_id;
   v_a.fallos_autorizar:=0;v_a.bloqueado_autorizar:=null;
  end if;
 else
  if v_a.bloqueado_pin is not null then
   -- Renovar la sesión con un código por correo permite volver a intentar el PIN propio.
   select coalesce(max((x->>'timestamp')::numeric),0) into v_amr from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) x where x->>'method' in ('otp','magiclink','invite');
   if v_amr<=extract(epoch from v_a.bloqueado_pin) then return jsonb_build_object('ok',false,'verificarCorreo',true,'error','Confirma tu correo para volver a intentar.');end if;
   update public.rest_personal_accesos set fallos_pin=0,bloqueado_pin=null where id=v_id;
   update public.rest_personal_dispositivos set fallos=0,bloqueado=null where acceso_id=v_id and aparato=p_aparato;
   v_d.fallos:=0;v_d.bloqueado:=null;
   v_a.fallos_pin:=0;v_a.bloqueado_pin:=null;
  end if;
 end if;
 select cuerpo->>'pinSalt' into v_salt from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
 v_hash:=encode(sha256(convert_to(coalesce(v_salt,'')||p_pin,'UTF8')),'hex');
 select cuerpo into v_p from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and coalesce(cuerpo->>'eventoId','')=''
 and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true'
 and (case when p_autorizar then cuerpo->>'rol' in ('gerente','cajero') else cuerpo->>'id'=v_ctx->>'persona' end)
 and coalesce(v_salt,'')<>'' and cuerpo->>'pin_hash'=v_hash limit 1;
 if v_p is null then
  if p_autorizar then
   update public.rest_personal_accesos set fallos_autorizar=case when bloqueado_autorizar<clock_timestamp()-interval '15 minutes' then 1 else fallos_autorizar+1 end,
   bloqueado_autorizar=case when fallos_autorizar>=4 then clock_timestamp() else bloqueado_autorizar end where id=v_id;
   update public.rest_personal_dispositivos set fallos_autorizacion=case when autorizacion_bloqueada<clock_timestamp()-interval '15 minutes' then 1 else fallos_autorizacion+1 end,
   autorizacion_bloqueada=case when fallos_autorizacion>=4 then clock_timestamp() else autorizacion_bloqueada end where acceso_id=v_id and aparato=p_aparato;
  else
   update public.rest_personal_accesos set fallos_pin=fallos_pin+1,bloqueado_pin=case when fallos_pin>=4 then clock_timestamp() else null end where id=v_id;
   update public.rest_personal_dispositivos set fallos=fallos+1,bloqueado=case when fallos>=4 then clock_timestamp() else null end,vence=null where acceso_id=v_id and aparato=p_aparato;
  end if;
  return jsonb_build_object('ok',false,'verificarCorreo',not p_autorizar and v_a.fallos_pin>=4,'error','El PIN no corresponde a un perfil autorizado.');
 end if;
 if p_autorizar then
  if not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas' and cuerpo->>'id'=p_comanda and cuerpo->>'estado'='abierta') then raise exception 'El pedido ya cambió.' using errcode='22023';end if;
  update public.rest_personal_dispositivos set fallos_autorizacion=0,autorizacion_bloqueada=null where acceso_id=v_id and aparato=p_aparato;
  update public.rest_personal_accesos set fallos_autorizar=0,bloqueado_autorizar=null where id=v_id;
 else
  update public.rest_personal_dispositivos set fallos=0,bloqueado=null,vence=clock_timestamp()+interval '12 hours',fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date,ultima_autenticacion=v_amr where acceso_id=v_id and aparato=p_aparato;
  update public.rest_personal_accesos set fallos_pin=0,bloqueado_pin=null where id=v_id;
 end if;
 return jsonb_build_object('ok',true,'persona',v_p->>'id','nombre',v_p->>'nombre');
end $$;
revoke all on function public.rest_personal_pin(uuid,text,text,boolean,text) from public;
grant execute on function public.rest_personal_pin(uuid,text,text,boolean,text) to authenticated;

create or replace function public.rest_personal_crear_pin(p_cuenta uuid,p_pin text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_ctx jsonb;v_salt text;
begin
 v_ctx:=public.rest_personal_contexto(p_cuenta);
 if coalesce(p_pin,'') !~ '^[0-9]{4,12}$' then raise exception 'El PIN debe tener entre 4 y 12 números.' using errcode='22023';end if;
 select cuerpo->>'pinSalt' into v_salt from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
 if coalesce(v_salt,'')='' then raise exception 'El gerente necesita guardar los ajustes del negocio antes de configurar el PIN.' using errcode='22023';end if;
 update public.documentos set cuerpo=jsonb_set(cuerpo,'{pin_hash}',to_jsonb(encode(sha256(convert_to(v_salt||p_pin,'UTF8')),'hex'))),actualizado=clock_timestamp()
 where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'id'=v_ctx->>'persona' and coalesce(cuerpo->>'eventoId','')='' and coalesce(cuerpo->>'pin_hash','')='';
 if not found then raise exception 'Tu perfil ya tiene PIN. Usa el actual o pide al gerente que lo cambie en Personal.' using errcode='42501';end if;
 return true;
end $$;
revoke all on function public.rest_personal_crear_pin(uuid,text) from public;
grant execute on function public.rest_personal_crear_pin(uuid,text) to authenticated;

create or replace function public.rest_personal_cuerpo(p_col text,p_body jsonb,p_rol text)
returns jsonb language sql immutable as $$
 select case
 when p_rol='gerente' then p_body
 when p_col='rest_equipo' then jsonb_build_object('id',p_body->'id','nombre',p_body->'nombre','rol',p_body->'rol','activo',coalesce(p_body->'activo','true'::jsonb),'eventoId',coalesce(p_body->>'eventoId',''),'_eliminado',coalesce(p_body->'_eliminado','false'::jsonb),'pinConfigurado',coalesce(p_body->>'pin_hash','')<>'')
 when p_col='rest_config' then p_body-'pinSalt'-'fiscal'
 when p_col in ('rest_carta','rest_lineas') then p_body-'costo'-'costoKg'
 when p_col='rest_comandas' and p_rol in ('mesero','cocina') and p_body->>'estado'<>'abierta' then jsonb_build_object('id',p_body->>'id','estado',p_body->>'estado','cancelada',coalesce((p_body->>'cancelada')::boolean,false),'eventoId','')
 when p_col in ('rest_comandas','rest_tickets') then p_body-'analiticaVenta'-'costo'-'costoKg'
 else p_body end
$$;
revoke all on function public.rest_personal_cuerpo(text,jsonb,text) from public;

create index if not exists rest_personal_actualizados_idx on public.documentos(cuenta_id,actualizado);
create or replace function public.rest_personal_documentos(p_cuenta uuid,p_aparato text,p_desde timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_ctx jsonb;v_rol text;v_out jsonb;
begin
 v_ctx:=public.rest_personal_sesion(p_cuenta,p_aparato);v_rol:=v_ctx->>'rol';
 select coalesce(jsonb_agg(jsonb_build_object('cuenta_id',d.cuenta_id,'coleccion',d.coleccion,'doc_id',d.doc_id,'actualizado',d.actualizado,
 'cuerpo',public.rest_personal_cuerpo(d.coleccion,d.cuerpo,v_rol)) order by d.actualizado,d.coleccion,d.doc_id),'[]') into v_out
 from public.documentos d where d.cuenta_id=p_cuenta and (d.coleccion like 'rest\_%' escape '\' or (v_rol in ('gerente','cajero') and d.coleccion in ('caja_turno_v1','caja_cortes_v1'))) and coalesce(d.cuerpo->>'eventoId','')=''
 and (p_desde is null or d.actualizado>=p_desde)
 and (v_rol='gerente'
 or (v_rol='cajero' and d.coleccion not in ('rest_asistencia','rest_costos'))
 or (v_rol in ('mesero','cocina') and (d.coleccion in ('rest_config','rest_carta','rest_mesas','rest_equipo','rest_contadores','rest_locks')
  or d.coleccion='rest_comandas'
  or d.coleccion='rest_lineas' and exists(select 1 from public.documentos c where c.cuenta_id=p_cuenta and c.coleccion='rest_comandas' and c.cuerpo->>'id'=d.cuerpo->>'comandaId' and c.cuerpo->>'estado'='abierta'))));
 return v_out;
end $$;
revoke all on function public.rest_personal_documentos(uuid,text,timestamptz) from public;
grant execute on function public.rest_personal_documentos(uuid,text,timestamptz) to authenticated;

create or replace function public.rest_personal_guardar(p_cuenta uuid,p_aparato text,p_filas jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ctx jsonb;v_rol text;v_f jsonb;v_n jsonb;v_o jsonb;v_c jsonb;v_p jsonb;v_g jsonb;v_mod jsonb;v_op jsonb;v_canon jsonb;v_aut jsonb;
 v_col text;v_id text;v_k text;v_cid text;v_qty numeric;v_antes numeric;v_nueva boolean;v_cancela boolean;v_modos jsonb;v_out jsonb:='[]';v_row public.documentos%rowtype;v_num integer;v_total numeric;
begin
 v_ctx:=public.rest_personal_sesion(p_cuenta,p_aparato);v_rol:=v_ctx->>'rol';
 if jsonb_typeof(p_filas)<>'array' or jsonb_array_length(p_filas)>100 then raise exception 'El lote no es válido.' using errcode='22023';end if;
 for v_f in select value from jsonb_array_elements(p_filas) loop
  if (v_f->>'cuenta_id')::uuid is distinct from p_cuenta then raise exception 'La fila pertenece a otro negocio.' using errcode='42501';end if;
  v_col:=v_f->>'coleccion';v_id:=v_f->>'doc_id';v_n:=v_f->'cuerpo';
  if coalesce(v_id,'') !~ '^[a-zA-Z0-9_-]{1,220}$' or jsonb_typeof(v_n)<>'object' or coalesce(v_n->>'eventoId','')<>'' then raise exception 'La fila no corresponde al restaurante.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_cuenta::text||':'||v_col||':'||v_id,0));
  if v_col='rest_lineas' then
   perform 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas' and cuerpo->>'id'=v_n->>'comandaId' for update;
  end if;
  select cuerpo into v_o from public.documentos where cuenta_id=p_cuenta and coleccion=v_col and doc_id=v_id for update;
  v_nueva:=v_o is null;
  if v_o=v_n then
   select * into v_row from public.documentos where cuenta_id=p_cuenta and coleccion=v_col and doc_id=v_id;
   v_out:=v_out||jsonb_build_array(to_jsonb(v_row));continue;
  end if;
  if v_col in ('caja_turno_v1','caja_cortes_v1','rest_tickets') then
   -- Sólo rest_caja_operar puede crear o cambiar un cobro/corte.
   if v_o is null then raise exception 'Usa la operación de Caja para guardar este movimiento.' using errcode='42501';end if;
   select * into v_row from public.documentos where cuenta_id=p_cuenta and coleccion=v_col and doc_id=v_id;
   v_out:=v_out||jsonb_build_array(to_jsonb(v_row));continue;
  elsif v_col='rest_comandas' then
   if v_rol='cocina' then raise exception 'Cocina sólo cambia el estado de los platillos.' using errcode='42501';end if;
   if coalesce(v_n->>'id','')='' or v_id<>'comanda_'||(v_n->>'id') then raise exception 'El pedido no es válido.' using errcode='22023';end if;
   if v_nueva then
    if v_n->>'estado'<>'abierta' or v_n->>'cancelada'='true' or v_n->>'_eliminado'='true' then raise exception 'El pedido debe comenzar abierto.' using errcode='22023';end if;
    if coalesce(v_n->>'mesaId','')<>'llevar' and not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_mesas' and cuerpo->>'id'=v_n->>'mesaId' and cuerpo->>'activa' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true') then raise exception 'La mesa ya no está disponible.' using errcode='22023';end if;
    v_n:=(v_n-'pagos'-'factura'-'cfdi'-'analiticaVenta'-'cajaCompartida'-'turnoId'-'cambio'-'comision'-'neto')||jsonb_build_object('meseroId',v_ctx->>'persona','mesero',v_ctx->>'nombre','estado','abierta','pagos','[]'::jsonb,'total',0,'subtotal',0,'propina',0,'fecha',to_char(clock_timestamp() at time zone 'America/Mexico_City','YYYY-MM-DD'),'abre',to_char(clock_timestamp() at time zone 'America/Mexico_City','HH24:MI'));
   else
    if v_rol='mesero' and v_o->>'meseroId' is distinct from v_ctx->>'persona' then raise exception 'Este pedido lo atiende otra persona.' using errcode='42501';end if;
    if v_o->>'estado'<>'abierta' then
     select * into v_row from public.documentos where cuenta_id=p_cuenta and coleccion=v_col and doc_id=v_id;
     v_out:=v_out||jsonb_build_array(to_jsonb(v_row));continue;
    end if;
    if v_n->>'mesaId' is distinct from v_o->>'mesaId' then raise exception 'Usa Transferir mesa con autorización.' using errcode='42501';end if;
    v_cancela:=v_n->>'cancelada'='true' or v_n->>'estado'='cancelada';
    v_canon:=v_o;
    foreach v_k in array array['personas','cliente','nota','folio','appOrderNo','appFolioPendiente'] loop
     if v_n ? v_k then v_canon:=jsonb_set(v_canon,array[v_k],v_n->v_k,true);end if;
    end loop;
    if v_cancela then raise exception 'Usa Cancelar pedido con autorización.' using errcode='42501';end if;
    v_n:=v_canon;
   end if;
   if coalesce(v_n->>'folio','')<>'' and exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas' and doc_id<>v_id and cuerpo->>'folio'=v_n->>'folio') then raise exception 'Ese folio ya existe. Actualiza el pedido.' using errcode='23505';end if;
  elsif v_col='rest_lineas' then
   if not v_nueva and (v_n->'comandaId' is distinct from v_o->'comandaId' or v_n->'id' is distinct from v_o->'id') then
    raise exception 'El platillo pertenece a otro pedido.' using errcode='42501';end if;
   v_cid:=v_n->>'comandaId';
   select cuerpo into v_c from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas' and cuerpo->>'id'=v_cid for update;
   if v_c is null then raise exception 'Primero guarda el pedido.' using errcode='22023';end if;
   if v_rol='mesero' and v_c->>'meseroId' is distinct from v_ctx->>'persona' then raise exception 'Este pedido lo atiende otra persona.' using errcode='42501';end if;
   if v_n->>'tipo'='cancelacion' then
    if not v_nueva then
     select * into v_row from public.documentos where cuenta_id=p_cuenta and coleccion=v_col and doc_id=v_id;
     v_out:=v_out||jsonb_build_array(to_jsonb(v_row));continue;
    end if;
    raise exception 'Las cancelaciones se registran desde la operación autorizada.' using errcode='42501';
   elsif v_nueva then
    if v_rol='cocina' or v_c->>'estado'<>'abierta' or v_id<>'linea_'||(v_n->>'id') then raise exception 'No puedes agregar este platillo.' using errcode='42501';end if;
    select cuerpo into v_p from public.documentos where cuenta_id=p_cuenta and coleccion='rest_carta' and cuerpo->>'tipo'='platillo' and cuerpo->>'id'=v_n->>'platId' and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true';
    if v_p is null then raise exception 'El platillo ya no está disponible.' using errcode='22023';end if;
    if (v_n->>'precio')::numeric is null or abs((v_n->>'precio')::numeric-(v_p->>'precio')::numeric)>0.005 then raise exception 'El precio cambió. Actualiza el menú y vuelve a agregar el platillo.' using errcode='22023';end if;
    v_qty:=(v_n->>'cant')::numeric;
    if v_qty is null or v_qty<=0 or v_qty>100000 or (coalesce(v_p->>'unidadVenta','')<>'kg' and v_qty<>trunc(v_qty)) or (v_p->>'unidadVenta'='kg' and v_qty*1000<>trunc(v_qty*1000)) then raise exception 'La cantidad no es válida.' using errcode='22023';end if;
    v_modos:='[]';
    if jsonb_typeof(coalesce(v_n->'mods','[]'))<>'array' then raise exception 'Los modificadores no son válidos.' using errcode='22023';end if;
    for v_mod in select value from jsonb_array_elements(coalesce(v_n->'mods','[]')) loop
     if not coalesce(v_p->'mods','[]') ? coalesce(v_mod->>'grupoId','') then raise exception 'El modificador no pertenece al platillo.' using errcode='22023';end if;
     select cuerpo into v_g from public.documentos where cuenta_id=p_cuenta and coleccion='rest_carta' and cuerpo->>'tipo'='grupo' and cuerpo->>'id'=v_mod->>'grupoId' and cuerpo->>'_eliminado' is distinct from 'true';
     select x into v_op from jsonb_array_elements(coalesce(v_g->'ops','[]')) x where x->>'id'=v_mod->>'opcionId' and btrim(coalesce(x->>'nombre',''))<>'';
     if v_op is null or exists(select 1 from jsonb_array_elements(v_modos) x where x->>'grupoId'=v_mod->>'grupoId' and x->>'opcionId'=v_mod->>'opcionId') then raise exception 'La opción no está disponible o está repetida.' using errcode='22023';end if;
     v_modos:=v_modos||jsonb_build_array(jsonb_build_object('grupoId',v_mod->>'grupoId','opcionId',v_op->>'id','nombre',v_op->>'nombre','extra',coalesce((v_op->>'extra')::numeric,0)));
    end loop;
    for v_k in select jsonb_array_elements_text(coalesce(v_p->'mods','[]')) loop
     select cuerpo into v_g from public.documentos where cuenta_id=p_cuenta and coleccion='rest_carta' and cuerpo->>'tipo'='grupo' and cuerpo->>'id'=v_k and cuerpo->>'_eliminado' is distinct from 'true';
     if v_g is null then raise exception 'El grupo de modificadores ya cambió.' using errcode='22023';end if;
     select count(*) into v_num from jsonb_array_elements(v_modos) x where x->>'grupoId'=v_k;
     if v_num<coalesce((v_g->>'min')::integer,0) or v_num>greatest(1,coalesce((v_g->>'max')::integer,1)) then raise exception 'Revisa las opciones requeridas del platillo.' using errcode='22023';end if;
    end loop;
    v_n:=(v_n-'impreso'-'_eliminado'-'cancelada'-'empezo'-'listoA')||jsonb_build_object('estado',case when coalesce(v_n->>'enviada','')<>'' then 'pedido' else '' end)||jsonb_build_object('nombre',v_p->>'nombre','categoria',v_p->>'catId','precio',(v_p->>'precio')::numeric,'mods',v_modos,'ivaModo',coalesce(v_p->>'ivaModo','incluido'),'satClave',coalesce(v_p->>'satClave',''),'satNombre',coalesce(v_p->>'satNombre',''),'satUnidad',coalesce(v_p->>'satUnidad',''));
    if v_p->>'unidadVenta'='kg' then v_n:=v_n||jsonb_build_object('unidadVenta','kg','costoKg',coalesce((v_p->>'costo')::numeric,0));else v_n:=v_n-'unidadVenta'-'costoKg';end if;
   else
    if v_c->>'estado'<>'abierta' then
     select * into v_row from public.documentos where cuenta_id=p_cuenta and coleccion=v_col and doc_id=v_id;
     v_out:=v_out||jsonb_build_array(to_jsonb(v_row));continue;
    end if;
    v_canon:=v_o;
    if v_rol='cocina' then
     if coalesce(v_o->>'enviada','')='' or v_n->>'estado' not in ('preparando','listo','entregada') then raise exception 'El platillo todavía no está en cocina.' using errcode='42501';end if;
     foreach v_k in array array['estado','empezo','listoA'] loop if v_n ? v_k then v_canon:=jsonb_set(v_canon,array[v_k],v_n->v_k,true);end if;end loop;
    else
     if v_o->>'cancelada'='true' then v_n:=v_o;
     else
      if v_n->'platId' is distinct from v_o->'platId' or v_n->'precio' is distinct from v_o->'precio' or v_n->'mods' is distinct from v_o->'mods' or v_n->>'_eliminado'='true' then raise exception 'No puedes cambiar el precio ni eliminar el registro del platillo.' using errcode='42501';end if;
      v_qty:=(v_n->>'cant')::numeric;v_antes:=(v_o->>'cant')::numeric;
      if v_qty is null or v_qty<=0 or v_qty>100000 or (coalesce(v_o->>'unidadVenta','')<>'kg' and v_qty<>trunc(v_qty)) or (v_o->>'unidadVenta'='kg' and v_qty*1000<>trunc(v_qty*1000)) then raise exception 'La cantidad no es válida.' using errcode='22023';end if;
      if v_qty<v_antes or v_n->>'cancelada'='true' then raise exception 'Usa Corregir con autorización para quitar platillos.' using errcode='42501';end if;
      if coalesce(v_n->>'estado','') not in ('','pedido','preparando','listo','entregada') then raise exception 'El estado del platillo no es válido.' using errcode='22023';end if;
      if coalesce(v_o->>'enviada','')<>'' and v_qty>v_antes then raise exception 'Agrega otro platillo para aumentar lo que ya está en cocina.' using errcode='42501';end if;
      foreach v_k in array array['cant','cancelada','motivo','cancelaHora','nota','comensal','enviada','enviadaTs','envioId','envioTotal','estado','empezo','listoA'] loop
       if v_n ? v_k then v_canon:=jsonb_set(v_canon,array[v_k],v_n->v_k,true);end if;
      end loop;
      if coalesce(v_o->>'enviada','')<>'' and coalesce(v_n->>'enviada','')='' then raise exception 'El platillo ya fue enviado a cocina.' using errcode='42501';end if;
      v_n:=v_canon;
     end if;
    end if;
    if v_rol='cocina' then v_n:=v_canon;end if;
   end if;
  elsif v_rol='gerente' and v_col in ('rest_config','rest_carta','rest_mesas','rest_equipo') then
   if v_n->>'_eliminado'='true' then
    if v_nueva or v_col='rest_config' then raise exception 'El elemento no se puede eliminar.' using errcode='22023';end if;
    v_n:=v_o||v_n;
   end if;
   if v_col='rest_equipo' and (coalesce(v_n->>'id','')='' or v_id<>'persona_'||(v_n->>'id')) then raise exception 'El perfil no corresponde a este expediente.' using errcode='22023';end if;
   if v_col='rest_equipo' and v_n->>'_eliminado' is distinct from 'true' and coalesce(v_n->>'rol','') not in ('gerente','cajero','mesero','cocina') then raise exception 'El rol no es válido.' using errcode='22023';end if;
  else raise exception 'Tu perfil no puede guardar este cambio.' using errcode='42501';end if;
  insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo,actualizado) values(p_cuenta,v_col,v_id,v_n,clock_timestamp())
   on conflict(cuenta_id,coleccion,doc_id) do update set cuerpo=excluded.cuerpo,actualizado=excluded.actualizado returning * into v_row;
  if v_rol<>'gerente' and v_col='rest_lineas' then v_row.cuerpo:=v_row.cuerpo-'costoKg'-'costo';end if;
  v_out:=v_out||jsonb_build_array(to_jsonb(v_row));
 end loop;
 select coalesce(jsonb_agg(jsonb_set(x,'{cuerpo}',public.rest_personal_cuerpo(x->>'coleccion',x->'cuerpo',v_rol))),'[]') into v_out from jsonb_array_elements(v_out) x;
 return v_out;
end $$;
revoke all on function public.rest_personal_guardar(uuid,text,jsonb) from public;
grant execute on function public.rest_personal_guardar(uuid,text,jsonb) to authenticated;

create table if not exists public.rest_personal_operaciones(
 solicitud uuid primary key,
 acceso_id uuid not null references public.rest_personal_accesos(id) on delete cascade,
 huella text not null,
 respuesta jsonb not null,
 creado timestamptz not null default clock_timestamp()
);
alter table public.rest_personal_operaciones enable row level security;
revoke all on public.rest_personal_operaciones from anon,authenticated;
grant all on public.rest_personal_operaciones to service_role;

create or replace function public.rest_personal_cancelar(p_cuenta uuid,p_aparato text,p_solicitud uuid,p_objetivo jsonb,p_pin text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ctx jsonb;v_aut jsonb;v_pin jsonb;v_c public.documentos%rowtype;v_l public.documentos%rowtype;v_log public.documentos%rowtype;v_op public.rest_personal_operaciones%rowtype;
 v_huella text;v_antes numeric;v_nueva numeric;v_diferencia numeric;v_extra numeric;v_iva numeric;v_importe numeric;v_mesa boolean;v_id text;v_fila jsonb;v_doc jsonb;v_out jsonb:='[]';v_estado jsonb;v_actual jsonb;v_esperado jsonb;
begin
 v_ctx:=public.rest_personal_sesion(p_cuenta,p_aparato);
 if v_ctx->>'rol' not in ('gerente','cajero','mesero') or p_solicitud is null then raise exception 'No tienes permiso para cancelar.' using errcode='42501';end if;
 if jsonb_typeof(p_objetivo)<>'object' or btrim(coalesce(p_objetivo->>'motivo',''))='' or length(p_objetivo->>'motivo')>500 then raise exception 'Escribe el motivo de la cancelación.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('personal-cancelar:'||p_solicitud::text,0));
 v_huella:=encode(sha256(convert_to(p_cuenta::text||':'||p_aparato||':'||p_objetivo::text,'UTF8')),'hex');
 select * into v_op from public.rest_personal_operaciones where solicitud=p_solicitud;
 if found then
  if v_op.acceso_id is distinct from (v_ctx->>'accesoId')::uuid or v_op.huella<>v_huella then raise exception 'La solicitud ya corresponde a otro cambio.' using errcode='22023';end if;
  return v_op.respuesta;
 end if;
 if v_ctx->>'rol'='mesero' then
  v_pin:=public.rest_personal_pin(p_cuenta,p_aparato,p_pin,true,p_objetivo->>'comanda');
  if v_pin->>'ok' is distinct from 'true' then return v_pin;end if;
  v_aut:=jsonb_build_object('id',v_pin->>'persona','nombre',v_pin->>'nombre');
 else v_aut:=jsonb_build_object('id',v_ctx->>'persona','nombre',v_ctx->>'nombre','propio',true);end if;
 perform public.rest_caja_bloquea(p_cuenta,'');
 select * into v_c from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas' and cuerpo->>'id'=p_objetivo->>'comanda' and coalesce(cuerpo->>'eventoId','')='' for update;
 if not found or v_c.cuerpo->>'estado'<>'abierta' or v_c.cuerpo->>'cancelada'='true' then raise exception 'El pedido ya cambió. Actualízalo antes de cancelar.' using errcode='22023';end if;
 v_mesa:=coalesce((p_objetivo->>'mesa')::boolean,false);
 if v_mesa then
  select coalesce(jsonb_agg(jsonb_build_object('id',cuerpo->>'id','cant',(cuerpo->>'cant')::numeric,'enviada',coalesce(cuerpo->>'enviada','')) order by cuerpo->>'id'),'[]') into v_actual
  from public.documentos where cuenta_id=p_cuenta and coleccion='rest_lineas' and cuerpo->>'comandaId'=v_c.cuerpo->>'id' and cuerpo->>'tipo' is distinct from 'cancelacion' and cuerpo->>'cancelada' is distinct from 'true';
  select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','cant',(x->>'cant')::numeric,'enviada',coalesce(x->>'enviada','')) order by x->>'id'),'[]') into v_esperado from jsonb_array_elements(coalesce(p_objetivo->'lineas','[]')) x;
  if v_actual<>v_esperado then raise exception 'Los platillos cambiaron. Revisa la mesa antes de cancelar.' using errcode='22023';end if;
 end if;
 select greatest(0,coalesce((cuerpo->>'iva')::numeric,16)) into v_iva from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
 for v_l in select * from public.documentos where cuenta_id=p_cuenta and coleccion='rest_lineas' and cuerpo->>'comandaId'=v_c.cuerpo->>'id'
 and cuerpo->>'tipo' is distinct from 'cancelacion' and cuerpo->>'cancelada' is distinct from 'true'
 and (v_mesa or cuerpo->>'id'=p_objetivo->>'linea') order by doc_id for update loop
  v_antes:=(v_l.cuerpo->>'cant')::numeric;v_nueva:=case when v_mesa then 0 else (p_objetivo->>'cantidad')::numeric end;
  if not v_mesa and (v_antes is distinct from (p_objetivo->>'antes')::numeric or coalesce(v_l.cuerpo->>'enviada','') is distinct from coalesce(p_objetivo->>'enviada','')) then raise exception 'El platillo cambió. Revisa la cantidad.' using errcode='22023';end if;
  if v_nueva is null or v_nueva<0 or v_nueva>=v_antes or (coalesce(v_l.cuerpo->>'unidadVenta','')<>'kg' and v_nueva<>trunc(v_nueva)) or (v_l.cuerpo->>'unidadVenta'='kg' and v_nueva*1000<>trunc(v_nueva*1000)) then raise exception 'La cantidad a cancelar no es válida.' using errcode='22023';end if;
  v_diferencia:=v_antes-v_nueva;
  select coalesce(sum((x->>'extra')::numeric),0) into v_extra from jsonb_array_elements(coalesce(v_l.cuerpo->'mods','[]')) x;
  v_importe:=((v_l.cuerpo->>'precio')::numeric+v_extra)*v_diferencia;
  if v_l.cuerpo->>'ivaModo'='mas' then v_importe:=v_importe*(1+coalesce(v_iva,16)/100);end if;
  v_id:=gen_random_uuid()::text;
  v_doc:=jsonb_build_object('tipo','cancelacion','id',v_id,'linId',v_l.cuerpo->>'id','comandaId',v_c.cuerpo->>'id','nombre',v_l.cuerpo->>'nombre','categoria',coalesce(v_l.cuerpo->>'categoria',''),
   'cant',v_diferencia,'importe',round(v_importe,2),'motivo',p_objetivo->>'motivo','nota',left(coalesce(p_objetivo->>'nota',''),1000),
   'merma',coalesce(v_l.cuerpo->>'estado','') in ('preparando','listo','entregada'),'quien',v_ctx->>'nombre','fecha',to_char(clock_timestamp() at time zone 'America/Mexico_City','YYYY-MM-DD'),
   'hora',to_char(clock_timestamp() at time zone 'America/Mexico_City','HH24:MI'),'estadoAlCancelar',coalesce(v_l.cuerpo->>'estado','pedido'),'autorizo',v_aut,'eventoId','');
  if v_l.cuerpo->>'unidadVenta'='kg' then v_doc:=v_doc||jsonb_build_object('unidadVenta','kg');end if;
  insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo,actualizado) values(p_cuenta,'rest_lineas','cancelacion_'||v_id,v_doc,clock_timestamp()) returning * into v_log;
  v_l.cuerpo:=v_l.cuerpo||case when v_nueva=0 then jsonb_build_object('cancelada',true,'motivo',p_objetivo->>'motivo','cancelaHora',v_doc->>'hora') else jsonb_build_object('cant',v_nueva) end;
  update public.documentos set cuerpo=v_l.cuerpo,actualizado=clock_timestamp() where cuenta_id=p_cuenta and coleccion='rest_lineas' and doc_id=v_l.doc_id returning * into v_l;
  if v_ctx->>'rol'<>'gerente' then v_l.cuerpo:=v_l.cuerpo-'costo'-'costoKg';end if;
  v_out:=v_out||jsonb_build_array(to_jsonb(v_l),to_jsonb(v_log));
 end loop;
 if not v_mesa and jsonb_array_length(v_out)=0 then raise exception 'El platillo ya no está disponible.' using errcode='22023';end if;
 if v_mesa then
  select cuerpo into v_estado from public.documentos where cuenta_id=p_cuenta and coleccion='caja_turno_v1' and doc_id='principal';
  v_c.cuerpo:=v_c.cuerpo||jsonb_build_object('estado','cancelada','cancelada',true,'motivo',p_objetivo->>'motivo','autorizo',v_aut,'total',0,
   'cierra',to_char(clock_timestamp() at time zone 'America/Mexico_City','HH24:MI'),'fechaCierre',to_char(clock_timestamp() at time zone 'America/Mexico_City','YYYY-MM-DD'),'turnoId',coalesce(v_estado->'turno'->>'id',''));
  update public.documentos set cuerpo=v_c.cuerpo,actualizado=clock_timestamp() where cuenta_id=p_cuenta and coleccion='rest_comandas' and doc_id=v_c.doc_id returning * into v_c;
  v_out:=v_out||jsonb_build_array(to_jsonb(v_c));
 end if;
 v_fila:=jsonb_build_object('ok',true,'filas',v_out,'autorizo',v_aut);
 insert into public.rest_personal_operaciones(solicitud,acceso_id,huella,respuesta) values(p_solicitud,(v_ctx->>'accesoId')::uuid,v_huella,v_fila);
 return v_fila;
end $$;
revoke all on function public.rest_personal_cancelar(uuid,text,uuid,jsonb,text) from public;
grant execute on function public.rest_personal_cancelar(uuid,text,uuid,jsonb,text) to authenticated;

create or replace function public.rest_personal_ticket(p_cuenta uuid,p_datos jsonb,p_ctx jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ticket jsonb:=p_datos->'ticket';v_c jsonb;v_cfg jsonb;v_l jsonb;v_plat jsonb;v_app jsonb;v_p jsonb;v_pagos jsonb:='[]';
 v_base numeric;v_tax numeric;v_suma numeric:=0;v_iva numeric:=0;v_tasa numeric;v_serv numeric;v_prop numeric;v_total numeric;v_pagado numeric:=0;v_efec numeric:=0;v_cambio numeric;v_cost numeric:=0;v_unit numeric;v_falta boolean:=false;v_pct numeric:=0;
begin
 select cuerpo into v_c from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas' and cuerpo->>'id'=p_datos->>'id';
 if v_c is null then raise exception 'No se encontró el pedido.' using errcode='22023';end if;
 select cuerpo into v_cfg from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
 v_tasa:=greatest(0,coalesce((v_cfg->>'iva')::numeric,16))/100;
 for v_l in select cuerpo from public.documentos where cuenta_id=p_cuenta and coleccion='rest_lineas' and cuerpo->>'comandaId'=v_c->>'id' and cuerpo->>'tipo' is null and cuerpo->>'cancelada' is distinct from 'true' and cuerpo->>'_eliminado' is distinct from 'true' loop
  select coalesce(sum(coalesce((x->>'extra')::numeric,0)),0) into v_base from jsonb_array_elements(coalesce(v_l->'mods','[]')) x;
  v_base:=((v_l->>'precio')::numeric+v_base)*(v_l->>'cant')::numeric;
  v_tax:=case when v_l->>'ivaModo'='exento' then 0 when v_l->>'ivaModo'='mas' then v_base*v_tasa else v_base-v_base/(1+v_tasa) end;
  v_iva:=v_iva+v_tax;
  if v_l->>'ivaModo'='mas' then v_base:=v_base+v_tax;end if;
  v_suma:=v_suma+case when v_l->>'unidadVenta'='kg' then round(v_base,2) else v_base end;
  select cuerpo into v_plat from public.documentos where cuenta_id=p_cuenta and coleccion='rest_carta' and cuerpo->>'tipo'='platillo' and cuerpo->>'id'=v_l->>'platId';
  v_unit:=case when v_l->>'unidadVenta'='kg' then (v_l->>'costoKg')::numeric else (v_plat->>'costo')::numeric end;
  if coalesce(v_unit,0)<=0 then v_falta:=true;else v_cost:=v_cost+v_unit*(v_l->>'cant')::numeric;end if;
 end loop;
 v_serv:=v_suma*greatest(0,coalesce((v_cfg->>'servicio')::numeric,0))/100;
 v_prop:=round(coalesce((v_ticket->>'propina')::numeric,0),2);
 if v_prop<0 or v_prop>999999999 then raise exception 'La propina no es válida.' using errcode='22023';end if;
 v_total:=round(v_suma+v_serv+v_prop,2);
 if (v_ticket->>'total')::numeric is null or abs((v_ticket->>'total')::numeric-v_total)>0.02 then raise exception 'La cuenta cambió. Revisa el total antes de cobrar.' using errcode='22023';end if;
 if jsonb_typeof(v_ticket->'pagos')<>'array' or jsonb_array_length(v_ticket->'pagos') not between 1 and 10 then raise exception 'Revisa las formas de pago.' using errcode='22023';end if;
 for v_p in select value from jsonb_array_elements(v_ticket->'pagos') loop
  v_unit:=round((v_p->>'monto')::numeric,2);
  if v_unit is null or v_unit<0 or v_unit>999999999 or coalesce(v_p->>'tipo','') not in ('efectivo','tarjeta','transferencia','app') then raise exception 'La forma de pago no es válida.' using errcode='22023';end if;
  if v_p->>'tipo'='app' and coalesce(v_c->>'appId','')='' then raise exception 'El pedido no pertenece a una app.' using errcode='22023';end if;
  v_pagado:=v_pagado+v_unit;if v_p->>'tipo'='efectivo' then v_efec:=v_efec+v_unit;end if;
  v_pagos:=v_pagos||jsonb_build_array(jsonb_build_object('tipo',v_p->>'tipo','monto',v_unit));
 end loop;
 v_cambio:=greatest(0,v_pagado-v_total);
 if v_pagado<v_total or v_cambio>v_efec then raise exception 'El pago no cubre la cuenta o el cambio no corresponde al efectivo.' using errcode='22023';end if;
 if coalesce(v_c->>'appId','')<>'' then
  select x into v_app from jsonb_array_elements(coalesce(v_cfg->'apps','[]')) x where x->>'id'=v_c->>'appId';
  if v_app is null then raise exception 'La plataforma del pedido ya no está configurada.' using errcode='22023';end if;
  v_pct:=greatest(0,least(100,coalesce((v_app->>'comision')::numeric,0)));
 end if;
 v_ticket:=jsonb_build_object('cfdi',v_ticket->'cfdi','cliente',v_c->>'cliente','personas',v_c->'personas','appId',coalesce(v_c->>'appId',''),'appNombre',coalesce(v_app->>'nombre',v_c->>'appNombre',''),'appOrderNo',v_c->>'appOrderNo')||jsonb_build_object('fecha',v_c->>'fecha','meseroId',v_c->>'meseroId','mesero',v_c->>'mesero','mesaId',v_c->>'mesaId','mesaNombre',v_c->>'mesaNombre',
  'subtotal',v_suma,'servicio',v_serv,'propina',v_prop,'total',v_total,'pagos',v_pagos,'cambio',v_cambio,'efectivoCaja',v_efec-v_cambio,'cobro',p_ctx->>'nombre',
  'comisionPct',v_pct,'comision',round((v_suma+v_serv)*v_pct/100,2),'neto',v_total-round((v_suma+v_serv)*v_pct/100,2),
  'analiticaVenta',jsonb_build_object('fecha',to_char(clock_timestamp() at time zone 'America/Mexico_City','YYYY-MM-DD'),'iva',v_iva,'costo',case when v_falta then null else v_cost end),
  'operadorAuth',auth.uid(),'operadorPersona',p_ctx->>'persona');
 return jsonb_set(p_datos,'{ticket}',v_ticket,true);
end $$;
revoke all on function public.rest_personal_ticket(uuid,jsonb,jsonb) from public;

create or replace function public.rest_personal_rpc(p_cuenta uuid,p_aparato text,p_nombre text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ctx jsonb;v_rol text;v_owner uuid;v_uid text;v_claims text;v_result jsonb;v_args jsonb:=coalesce(p_args,'{}');v_body jsonb;v_lineas text[];v_pin jsonb;
begin
 v_ctx:=public.rest_personal_sesion(p_cuenta,p_aparato);v_rol:=v_ctx->>'rol';
 if (v_args->>'p_cuenta')::uuid is distinct from p_cuenta or coalesce(v_args->>'p_evento','')<>'' then raise exception 'La operación pertenece a otro negocio.' using errcode='42501';end if;
 if p_nombre in ('rest_siguiente_folio','rest_reserva_comanda') and v_rol not in ('gerente','cajero','mesero') then raise exception 'Tu perfil no puede abrir pedidos.' using errcode='42501';end if;
 if p_nombre in ('rest_caja_operar','rest_traslada_mesa') and v_rol not in ('gerente','cajero') then raise exception 'Sólo cajero o gerente puede usar esta operación.' using errcode='42501';end if;
 if p_nombre in ('rest_cocina_configurar','rest_bt_activa','rest_bt_apaga','rest_medios_confirmar','rest_medio_sin_uso') and v_rol<>'gerente' then raise exception 'Sólo un gerente puede cambiar esta configuración.' using errcode='42501';end if;
 if p_nombre in ('rest_reclama_impresion','rest_confirma_impresion','rest_libera_impresion','rest_reasigna_impresion') and v_rol='mesero' then raise exception 'La impresión se realiza desde la caja o cocina.' using errcode='42501';end if;
 if p_nombre not in ('rest_siguiente_folio','rest_reserva_comanda','rest_caja_operar','rest_traslada_mesa','rest_cocina_estaciones','rest_cocina_configurar','rest_bt_activa','rest_bt_apaga','rest_medios_confirmar','rest_medio_sin_uso','rest_reclama_impresion','rest_confirma_impresion','rest_libera_impresion','rest_reasigna_impresion') then raise exception 'Esta operación no está disponible para el personal.' using errcode='42501';end if;
 if p_nombre='rest_caja_operar' then
  if v_args->>'p_accion'='activar' then v_args:=jsonb_set(v_args,'{p_datos}','{}',true);end if;
  if v_args->>'p_accion'='abrir' then v_args:=jsonb_set(v_args,'{p_datos}',(v_args->'p_datos')||jsonb_build_object('cajero',v_ctx->>'nombre','cajeroId',v_ctx->>'persona'),true);end if;
  if v_args->>'p_accion'='mover' then v_args:=jsonb_set(v_args,'{p_datos}',(v_args->'p_datos')||jsonb_build_object('quien',v_ctx->>'nombre'),true);end if;
  if v_rol='cajero' and (v_args->>'p_accion'='tomar' or v_args->>'p_accion'='preparar' and v_args->'p_datos'->>'accionFinal'='tomar') then raise exception 'Sólo gerente puede tomar la caja.' using errcode='42501';end if;
 end if;
 if p_nombre='rest_traslada_mesa' or p_nombre='rest_caja_operar' and v_args->>'p_accion' in ('preparar','tomar','cerrar') then
  v_body:=case when p_nombre='rest_traslada_mesa' then jsonb_build_object('persona',v_args->>'p_persona','pin',v_args->>'p_pin') else v_args->'p_datos' end;
  if v_body->>'persona' is distinct from v_ctx->>'persona' then raise exception 'Usa el PIN de tu propio perfil autorizado.' using errcode='42501';end if;
  v_pin:=public.rest_personal_pin(p_cuenta,p_aparato,v_body->>'pin');
  if v_pin->>'ok' is distinct from 'true' then return jsonb_build_object('_personalError',v_pin->>'error');end if;
 end if;
 if p_nombre='rest_reserva_comanda' then
  v_body:=v_args->'p_cuerpo';
  if coalesce(v_body->>'id','')='' or v_args->>'p_doc_id'<>'comanda_'||(v_body->>'id') or v_body->>'mesaId' is distinct from v_args->>'p_mesa' then raise exception 'El pedido no es válido.' using errcode='22023';end if;
  if not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_mesas' and cuerpo->>'id'=v_body->>'mesaId' and cuerpo->>'activa' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true') then raise exception 'La mesa ya no está disponible.' using errcode='22023';end if;
  v_body:=v_body-'lineas'-'cancelaciones'-'factura'-'cfdi'-'analiticaVenta'-'cajaCompartida'-'_eliminado';
  v_body:=v_body||jsonb_build_object('meseroId',v_ctx->>'persona','mesero',v_ctx->>'nombre','estado','abierta','pagos','[]'::jsonb,'total',0,'subtotal',0,'propina',0,'eventoId','',
   'fecha',to_char(clock_timestamp() at time zone 'America/Mexico_City','YYYY-MM-DD'),'abre',to_char(clock_timestamp() at time zone 'America/Mexico_City','HH24:MI'));
 end if;
 if p_nombre='rest_caja_operar' and v_args->>'p_accion'='cobrar'
 and not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_tickets' and cuerpo->>'id'=v_args->'p_datos'->>'id') then
  perform public.rest_caja_bloquea(p_cuenta,'');
  perform 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas' and cuerpo->>'id'=v_args->'p_datos'->>'id' for update;
  perform 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_lineas' and cuerpo->>'comandaId'=v_args->'p_datos'->>'id' order by doc_id for update;
  v_args:=jsonb_set(v_args,'{p_datos}',public.rest_personal_ticket(p_cuenta,v_args->'p_datos',v_ctx),true);
 end if;
 select usuario_id into v_owner from public.membresias where cuenta_id=p_cuenta and rol='admin' order by usuario_id limit 1;
 if v_owner is null then raise exception 'El negocio necesita que su dueño revise el acceso.' using errcode='42501';end if;
 v_uid:=current_setting('request.jwt.claim.sub',true);v_claims:=current_setting('request.jwt.claims',true);
 -- Delegación interna para reutilizar las operaciones transaccionales ya
 -- probadas. Sólo se llega aquí después de validar usuario, perfil y acción.
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 perform set_config('request.jwt.claims',jsonb_set(coalesce(nullif(v_claims,'')::jsonb,'{}'),'{sub}',to_jsonb(v_owner::text),true)::text,true);
 select coalesce(array_agg(value),'{}'::text[]) into v_lineas from jsonb_array_elements_text(coalesce(v_args->'p_lineas','[]'));
 case p_nombre
  when 'rest_siguiente_folio' then v_result:=to_jsonb(public.rest_siguiente_folio(p_cuenta,v_args->>'p_serie'));
  when 'rest_reserva_comanda' then v_result:=to_jsonb(public.rest_reserva_comanda(p_cuenta,v_args->>'p_mesa',v_args->>'p_doc_id',v_body));
  when 'rest_caja_operar' then v_result:=public.rest_caja_operar(p_cuenta,'',p_aparato,v_args->>'p_accion',v_args->'p_datos');
  when 'rest_traslada_mesa' then v_result:=public.rest_traslada_mesa(p_cuenta,'',v_args->>'p_comanda',v_args->>'p_origen',v_args->>'p_destino',v_args->>'p_persona',v_args->>'p_pin');
  when 'rest_cocina_estaciones' then v_result:=to_jsonb(public.rest_cocina_estaciones(p_cuenta,''));
  when 'rest_cocina_configurar' then v_result:=to_jsonb(public.rest_cocina_configurar(p_cuenta,p_aparato,'',v_args->>'p_nombre',v_args->'p_impresoras',coalesce((v_args->>'p_confirmar')::boolean,false)));
  when 'rest_bt_activa' then v_result:=to_jsonb(public.rest_bt_activa(p_cuenta,p_aparato,'',v_args->'p_rutas'));
  when 'rest_bt_apaga' then v_result:=to_jsonb(public.rest_bt_apaga(p_cuenta,p_aparato));
  when 'rest_medios_confirmar' then v_result:=to_jsonb(public.rest_medios_confirmar(p_cuenta,'',v_args->>'p_tipo',v_args->>'p_id',v_args->>'p_ruta',v_args->>'p_anterior'));
  when 'rest_medio_sin_uso' then v_result:=to_jsonb(public.rest_medio_sin_uso(p_cuenta,v_args->>'p_ruta'));
  when 'rest_reclama_impresion' then v_result:=to_jsonb(public.rest_reclama_impresion(p_cuenta,v_lineas,v_args->>'p_ruta',p_aparato));
  when 'rest_confirma_impresion' then v_result:=to_jsonb(public.rest_confirma_impresion(p_cuenta,v_lineas,v_args->>'p_ruta',p_aparato));
  when 'rest_libera_impresion' then v_result:=to_jsonb(public.rest_libera_impresion(p_cuenta,v_lineas,v_args->>'p_ruta',p_aparato));
  when 'rest_reasigna_impresion' then v_result:=to_jsonb(public.rest_reasigna_impresion(p_cuenta,v_lineas,v_args->>'p_ruta',p_aparato));
 end case;
 perform set_config('request.jwt.claim.sub',coalesce(v_uid,''),true);perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
 if v_rol<>'gerente' and jsonb_typeof(v_result)='object' then
  if v_result->'comanda'->'cuerpo' is not null then v_result:=jsonb_set(v_result,'{comanda,cuerpo}',public.rest_personal_cuerpo('rest_comandas',v_result->'comanda'->'cuerpo',v_rol));end if;
  if v_result->'ticket'->'cuerpo' is not null then v_result:=jsonb_set(v_result,'{ticket,cuerpo}',public.rest_personal_cuerpo('rest_tickets',v_result->'ticket'->'cuerpo',v_rol));end if;
 end if;
 return v_result;
end $$;
revoke all on function public.rest_personal_rpc(uuid,text,text,jsonb) from public;
grant execute on function public.rest_personal_rpc(uuid,text,text,jsonb) to authenticated;

-- Desactivar o retirar el expediente cierra el acceso y libera el cupo,
-- también si la edición viene de la tablet del dueño con la versión actual.
create or replace function public.rest_personal_perfil_inactivo()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_persona text;
begin
 if new.coleccion<>'rest_equipo' or coalesce(new.cuerpo->>'eventoId','')<>'' then return new;end if;
 if tg_op='UPDATE' and old.cuerpo->>'id' is distinct from new.cuerpo->>'id' then
  update public.rest_personal_accesos set activo=false,estado='retirado',nonce_hash=null,nonce_vence=null,actualizado=clock_timestamp()
   where cuenta_id=new.cuenta_id and persona_id=old.cuerpo->>'id';
 end if;
 if new.cuerpo->>'activo'='false' or new.cuerpo->>'_eliminado'='true' then
  update public.rest_personal_accesos set activo=false,estado='retirado',nonce_hash=null,nonce_vence=null,actualizado=clock_timestamp()
   where cuenta_id=new.cuenta_id and persona_id=new.cuerpo->>'id';
 end if;
 delete from public.rest_personal_dispositivos x using public.rest_personal_accesos a where x.acceso_id=a.id and a.cuenta_id=new.cuenta_id and not a.activo;
 return new;
end $$;
revoke all on function public.rest_personal_perfil_inactivo() from public;
drop trigger if exists rest_personal_perfil_inactivo on public.documentos;
create trigger rest_personal_perfil_inactivo after insert or update on public.documentos for each row execute function public.rest_personal_perfil_inactivo();

-- El gerente con sesión/PIN vigente administra las invitaciones desde
-- Personal; el dueño del negocio y el dueño de Lab conservan su acceso.
create or replace function public.rest_personal_admin(p_cuenta uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.cuentas c where c.id=p_cuenta and c.producto='restaurant') and
 (coalesce(public.rol_en(p_cuenta)='admin',false) or exists(select 1 from public.staff where id=auth.uid() and rol='dueno') or exists(
  select 1 from public.rest_personal_accesos a join public.documentos d on d.cuenta_id=a.cuenta_id and d.coleccion='rest_equipo' and d.cuerpo->>'id'=a.persona_id
  where a.cuenta_id=p_cuenta and a.usuario_id=auth.uid() and a.activo and a.estado='activo' and a.bloqueado_pin is null
  and coalesce(d.cuerpo->>'eventoId','')='' and d.cuerpo->>'rol'='gerente' and d.cuerpo->>'activo' is distinct from 'false' and d.cuerpo->>'_eliminado' is distinct from 'true'
  and exists(select 1 from public.rest_personal_dispositivos x where x.acceso_id=a.id and x.bloqueado is null and x.vence>clock_timestamp() and x.fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date)))
$$;

-- Fotografías del gerente, limitadas a la carpeta de este restaurante.
do $$begin
 if to_regclass('storage.objects') is not null and to_regprocedure('public.rest_medio_cuenta(text)') is not null then
  execute 'drop policy if exists rest_personal_medios_insertar on storage.objects';
  execute 'create policy rest_personal_medios_insertar on storage.objects for insert to authenticated with check(bucket_id=''restaurant-medios'' and public.rest_personal_admin(public.rest_medio_cuenta(name)))';
  execute 'drop policy if exists rest_personal_medios_borrar on storage.objects';
  execute 'create policy rest_personal_medios_borrar on storage.objects for delete to authenticated using(bucket_id=''restaurant-medios'' and public.rest_personal_admin(public.rest_medio_cuenta(name)))';
 end if;
end $$;
create or replace function public.nuvoor_rest_personal_disponible()
returns boolean language sql immutable as $$select true$$;
revoke all on function public.nuvoor_rest_personal_disponible() from public;
grant execute on function public.nuvoor_rest_personal_disponible() to authenticated;
notify pgrst,'reload schema';
commit;
