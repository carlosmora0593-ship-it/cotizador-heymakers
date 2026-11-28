-- 46 · PIN de Imprenta, altas por invitación y fotos privadas del checador.
-- Después de 38, 39, 40, 43, 44 y 45. Puede aplicarse antes del SQL 42.
begin;

create table if not exists public.nuvoor_imprenta_pines (
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  persona text not null,
  hash text not null,
  formato_legado boolean not null default false,
  primary key (cuenta_id, persona)
);
alter table public.nuvoor_imprenta_pines enable row level security;
revoke all on public.nuvoor_imprenta_pines from public, anon, authenticated;

create table if not exists public.nuvoor_imprenta_intentos (
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  usuario uuid not null references auth.users(id) on delete cascade,
  ventana timestamptz not null,
  intentos integer not null default 0,
  hasta timestamptz,
  primary key (cuenta_id, usuario)
);
alter table public.nuvoor_imprenta_intentos enable row level security;
revoke all on public.nuvoor_imprenta_intentos from public,anon,authenticated;

-- Incluso con otras políticas permisivas, sólo administración puede leer
-- los documentos que alimentan el Personal con PIN.
drop policy if exists nuvoor46_equipo_privado on public.documentos;
create policy nuvoor46_equipo_privado on public.documentos as restrictive
  for select using (
    (coleccion <> 'rest_equipo' and (coleccion <> 'config' or doc_id <> 'equipo'))
    or coalesce(public.rol_en(cuenta_id) = 'admin', false)
  );

create or replace function public.nuvoor46_pin_hash(p_sal text, p_pin text)
returns text language sql immutable strict set search_path = pg_catalog
as $$ select encode(sha256(convert_to(p_sal || p_pin, 'UTF8')), 'hex') $$;
revoke all on function public.nuvoor46_pin_hash(text,text) from public, anon, authenticated;

create or replace function public.nuvoor46_protege_importacion_pin()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare clave text;
begin
  if new.coleccion = 'rest_equipo' and new.cuerpo->>'fuente42' = 'equipo' then
    select hash into clave from public.nuvoor_imprenta_pines
     where cuenta_id = new.cuenta_id and persona = new.cuerpo->>'id';
    new.cuerpo := (new.cuerpo - 'pin') || jsonb_build_object('pin_hash', coalesce(clave,''), 'pinConfigurado', clave is not null);
  end if;
  return new;
end $$;
revoke all on function public.nuvoor46_protege_importacion_pin() from public, anon, authenticated;
drop trigger if exists nuvoor46_protege_importacion_pin on public.documentos;
create trigger nuvoor46_protege_importacion_pin before insert or update on public.documentos
for each row execute function public.nuvoor46_protege_importacion_pin();

create or replace function public.nuvoor46_resguarda_equipo()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  persona jsonb;
  equipo jsonb := '[]'::jsonb;
  clave text;
  sal text;
  identificador text;
  rol_pos text;
  activo boolean;
  prev text;
begin
  if new.coleccion <> 'config' or new.doc_id <> 'equipo'
     or not exists(select 1 from public.cuentas where id=new.cuenta_id and producto='taller') then
    return new;
  end if;
  if auth.uid() is not null and public.rol_en(new.cuenta_id) is distinct from 'admin' then
    raise exception 'Sólo administración puede guardar el equipo.' using errcode='42501';
  end if;
  if jsonb_typeof(new.cuerpo->'equipo') is distinct from 'array'
     or jsonb_array_length(new.cuerpo->'equipo') > 500 then
    raise exception 'Revisa el equipo antes de guardar.';
  end if;
  insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo)
    values(new.cuenta_id,'rest_config','config_general',jsonb_build_object('pinSalt',gen_random_uuid()::text))
    on conflict(cuenta_id,coleccion,doc_id) do nothing;
  select cuerpo->>'pinSalt' into sal from public.documentos
    where cuenta_id=new.cuenta_id and coleccion='rest_config' and doc_id='config_general';
  if coalesce(sal,'')='' then
    sal:=gen_random_uuid()::text;
    update public.documentos set cuerpo=jsonb_set(cuerpo,'{pinSalt}',to_jsonb(sal))
      where cuenta_id=new.cuenta_id and coleccion='rest_config' and doc_id='config_general';
  end if;
  for persona in select value from jsonb_array_elements(new.cuerpo->'equipo') loop
    identificador:=persona->>'id';
    if coalesce(identificador,'')='' or length(identificador)>120 then
      raise exception 'Una persona del equipo no tiene identificador válido.';
    end if;
    clave:=persona->>'pin';
    -- Importa PIN heredados sin reenviar la clave en la respuesta.
    -- Un navegador antiguo no puede quitar o pisar un PIN ya migrado.
    if coalesce(btrim(clave),'')<>'' then
      insert into public.nuvoor_imprenta_pines values (
        new.cuenta_id,identificador,public.nuvoor46_pin_hash(sal,clave),clave !~ '^[0-9]{4,12}$')
        on conflict on constraint nuvoor_imprenta_pines_pkey do nothing;
    end if;
    select hash into prev from public.nuvoor_imprenta_pines where cuenta_id=new.cuenta_id and nuvoor_imprenta_pines.persona=identificador;
    rol_pos:=persona->>'rol';
    activo:=persona->>'activo' is distinct from 'false';
    insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo)
      values(new.cuenta_id,'rest_equipo','personal42_'||identificador,jsonb_build_object(
        'id',identificador,'nombre',left(coalesce(nullif(btrim(persona->>'nombre'),''),'Personal'),120),'rolPos',rol_pos,
        'rol',case when rol_pos in ('admin','gerente') then 'gerente' when rol_pos='cajero' then 'cajero'
                   when rol_pos in ('diseno','produccion','inventario','cocina') then 'cocina' else 'mesero' end,
        'activo',activo,'eventoId','','fuente42','equipo'))
      on conflict(cuenta_id,coleccion,doc_id) do update set cuerpo=excluded.cuerpo,actualizado=clock_timestamp()
      where documentos.cuerpo is distinct from excluded.cuerpo;
    equipo:=equipo || jsonb_build_array((persona-'pin'-'pin_hash'-'pinHash'-'_t'-'_tc')||
      jsonb_build_object('pinConfigurado',prev is not null));
  end loop;
  update public.documentos d set cuerpo=jsonb_set(d.cuerpo,'{activo}','false')
   where d.cuenta_id=new.cuenta_id and d.coleccion='rest_equipo' and d.cuerpo->>'fuente42'='equipo'
     and d.cuerpo->>'activo' is distinct from 'false'
     and not exists(select 1 from jsonb_array_elements(equipo) e where e->>'id'=d.cuerpo->>'id');
  delete from public.nuvoor_imprenta_pines p where p.cuenta_id=new.cuenta_id
    and not exists(select 1 from jsonb_array_elements(equipo) e where e->>'id'=p.persona);
  new.cuerpo := (new.cuerpo-'pin'-'pin_hash'-'pinHash') || jsonb_build_object('equipo',equipo);
  return new;
end $$;
revoke all on function public.nuvoor46_resguarda_equipo() from public, anon, authenticated;
drop trigger if exists nuvoor46_resguarda_equipo on public.documentos;
create trigger nuvoor46_resguarda_equipo before insert or update on public.documentos
for each row execute function public.nuvoor46_resguarda_equipo();

-- La limpieza incluye licencias vencidas. El límite de plan se pausa sólo
-- durante esta transacción de instalación, con la tabla bloqueada.
do $$
declare estado "char";
begin
  select tgenabled into estado from pg_trigger where tgrelid='public.documentos'::regclass and tgname='aplica_limites';
  if estado is not null then alter table public.documentos disable trigger aplica_limites; end if;
  update public.documentos d set cuerpo=d.cuerpo
    where d.coleccion='config' and d.doc_id='equipo' and jsonb_typeof(d.cuerpo->'equipo')='array'
      and exists(select 1 from public.cuentas c where c.id=d.cuenta_id and c.producto='taller');
  if estado='O' then alter table public.documentos enable trigger aplica_limites;
  elsif estado='R' then alter table public.documentos enable replica trigger aplica_limites;
  elsif estado='A' then alter table public.documentos enable always trigger aplica_limites;
  end if;
end $$;

create or replace function public.nuvoor_imprenta_pin(p_cuenta uuid,p_persona text,p_pin text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare f public.nuvoor_imprenta_intentos%rowtype; perfil jsonb; valido boolean; reloj timestamptz:=clock_timestamp();
  fallos integer;
begin
  if auth.uid() is null or public.rol_en(p_cuenta) not in ('admin','ventas','produccion','diseno')
     or public.rol_en(p_cuenta) is null
     or not exists(select 1 from public.cuentas where id=p_cuenta and producto='taller') then
    raise exception 'No tienes acceso a este equipo.' using errcode='42501';
  end if;
  if length(coalesce(p_pin,'')) not between 1 and 64 or length(coalesce(p_persona,'')) not between 1 and 120 then
    return jsonb_build_object('ok',false,'error','Escribe el PIN del perfil.');
  end if;
  insert into public.nuvoor_imprenta_intentos(cuenta_id,usuario,ventana)
    values(p_cuenta,auth.uid(),reloj) on conflict do nothing;
  select * into f from public.nuvoor_imprenta_intentos where cuenta_id=p_cuenta and usuario=auth.uid() for update;
  if f.hasta>reloj then return jsonb_build_object('ok',false,'error','Espera unos minutos antes de intentar otra vez.'); end if;
  select e into perfil from public.documentos d, lateral jsonb_array_elements(d.cuerpo->'equipo') e
    where d.cuenta_id=p_cuenta and d.coleccion='config' and d.doc_id='equipo'
      and e->>'id'=p_persona and e->>'activo' is distinct from 'false';
  select exists(select 1 from public.nuvoor_imprenta_pines p join public.documentos d
    on d.cuenta_id=p.cuenta_id and d.coleccion='rest_config' and d.doc_id='config_general'
    where p.cuenta_id=p_cuenta and p.persona=p_persona
      and p.hash=public.nuvoor46_pin_hash(d.cuerpo->>'pinSalt',p_pin)) into valido;
  if perfil is null or not valido then
    fallos:=case when reloj-f.ventana>=interval '5 minutes' then 1 else f.intentos+1 end;
    update public.nuvoor_imprenta_intentos set
      intentos=fallos,ventana=case when fallos=1 then reloj else f.ventana end,
      hasta=case when fallos>=5 then reloj+interval '5 minutes' end
      where cuenta_id=p_cuenta and usuario=auth.uid();
    return jsonb_build_object('ok',false,'error','PIN incorrecto.');
  end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.nuvoor_imprenta_pin(uuid,text,text) from public, anon;
grant execute on function public.nuvoor_imprenta_pin(uuid,text,text) to authenticated;

create or replace function public.nuvoor_imprenta_equipo(p_cuenta uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public
as $$
begin
  if public.rol_en(p_cuenta) is null or not exists(select 1 from public.cuentas where id=p_cuenta and producto='taller') then
    raise exception 'No tienes acceso a este equipo.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id',e->'id','nombre',e->'nombre','rol',e->'rol','activo',e->'activo',
      'veCostos',e->'veCostos','cotiza',e->'cotiza','comision',e->'comision',
      'pinConfigurado',exists(select 1 from public.nuvoor_imprenta_pines p
        where p.cuenta_id=p_cuenta and p.persona=e->>'id')
    ) order by num)
    from public.documentos d, lateral jsonb_array_elements(d.cuerpo->'equipo') with ordinality as perfil(e,num)
    where d.cuenta_id=p_cuenta and d.coleccion='config' and d.doc_id='equipo'),'[]'::jsonb);
end $$;
revoke all on function public.nuvoor_imprenta_equipo(uuid) from public, anon;
grant execute on function public.nuvoor_imprenta_equipo(uuid) to authenticated;

create or replace function public.nuvoor_imprenta_cambia_pin(p_cuenta uuid,p_persona text,p_pin text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $$
declare cuerpo_equipo jsonb; sal text; clave text;
begin
  if public.rol_en(p_cuenta) is distinct from 'admin'
     or not exists(select 1 from public.cuentas where id=p_cuenta and producto='taller') then
    raise exception 'Sólo administración puede cambiar este PIN.' using errcode='42501';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,12}$' then
    raise exception 'El PIN debe tener entre 4 y 12 números.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('personal39:'||p_cuenta::text,0));
  select cuerpo into cuerpo_equipo from public.documentos
    where cuenta_id=p_cuenta and coleccion='config' and doc_id='equipo' for update;
  if not exists(select 1 from jsonb_array_elements(cuerpo_equipo->'equipo') e where e->>'id'=p_persona) then
    raise exception 'Primero guarda a la persona en el equipo.';
  end if;
  select cuerpo->>'pinSalt' into sal from public.documentos
    where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
  if coalesce(sal,'')='' then raise exception 'Actualiza los ajustes del equipo.';end if;
  if p_pin is null then
    delete from public.nuvoor_imprenta_pines where cuenta_id=p_cuenta and persona=p_persona;
  else
    clave:=public.nuvoor46_pin_hash(sal,p_pin);
    if exists(select 1 from public.nuvoor_imprenta_pines p where p.cuenta_id=p_cuenta and p.persona<>p_persona and p.hash=clave) then
      raise exception 'Ese PIN ya está asignado.' using errcode='22023';
    end if;
    insert into public.nuvoor_imprenta_pines values(p_cuenta,p_persona,clave)
      on conflict(cuenta_id,persona) do update set hash=excluded.hash,formato_legado=false where nuvoor_imprenta_pines.hash<>excluded.hash;
  end if;
  if not found then return true; end if;
  update public.documentos set cuerpo=cuerpo_equipo where cuenta_id=p_cuenta and coleccion='config' and doc_id='equipo';
  update public.rest_personal_operadores set vence=clock_timestamp() where cuenta_id=p_cuenta and persona=p_persona;
  update public.rest_personal_dispositivos set vence=null where acceso_id in (
    select id from public.rest_personal_accesos where cuenta_id=p_cuenta and persona_id=p_persona
  );
  return true;
end $$;
revoke all on function public.nuvoor_imprenta_cambia_pin(uuid,text,text) from public, anon;
grant execute on function public.nuvoor_imprenta_cambia_pin(uuid,text,text) to authenticated;

-- Invitaciones de Personal. Un invitado tiene su acceso en Personal y el
-- alta normal conserva exactamente la creación de negocio del SQL 43.
create or replace function public.al_crear_usuario()
returns trigger language plpgsql security definer set search_path=public
as $$
declare negocio uuid; sistema text;
begin
  if new.invited_at is not null or new.raw_user_meta_data->>'nuvoor_personal_invitado'='true' then
    return new;
  end if;
  sistema := coalesce(new.raw_user_meta_data->>'producto', 'taller');
  if sistema not in ('taller','restaurant','tiendita') then sistema := 'taller'; end if;
  if exists (select 1 from pg_attribute
              where attrelid='public.cuentas'::regclass and attname='productos' and not attisdropped) then
    insert into public.cuentas (nombre, producto, productos, plan, estado, vence, es_prueba)
      values (coalesce(nullif(btrim(new.raw_user_meta_data->>'negocio'), ''), 'Mi negocio'),
              sistema, array[sistema], 'ninguno', 'activa', now(), false)
      returning id into negocio;
  else
    insert into public.cuentas (nombre, producto, plan, estado, vence, es_prueba)
      values (coalesce(nullif(btrim(new.raw_user_meta_data->>'negocio'), ''), 'Mi negocio'),
              sistema, 'ninguno', 'activa', now(), false)
      returning id into negocio;
  end if;
  insert into public.perfiles (id, cuenta_id, cuenta_activa, nombre, correo, rol)
    values (new.id, negocio, negocio, new.raw_user_meta_data->>'nombre', new.email, 'admin');
  insert into public.membresias (usuario_id, cuenta_id, rol)
    values (new.id, negocio, 'admin');
  return new;
end $$;

-- Los perfiles de un invitado pueden existir sin un negocio raíz.
alter table public.perfiles alter column cuenta_id drop not null;

create or replace function public.nuvoor46_fantasmas()
returns table(cuenta uuid, usuario uuid, negocio text, correo text, creada timestamptz)
language sql stable set search_path=pg_catalog,public
as $$
  select c.id,u.id,c.nombre,u.email::text,c.creada
  from public.cuentas c
  join public.perfiles p on p.cuenta_id=c.id
  join auth.users u on u.id=p.id
  join public.membresias m on m.cuenta_id=c.id and m.usuario_id=u.id and m.rol='admin'
  where c.creada>='2026-11-25 00:00 America/Mexico_City'::timestamptz
    and c.plan='ninguno' and not coalesce(c.es_prueba,false)
    and c.codigo is null and c.stripe_cliente is null and c.mp_preapproval_id is null
    and u.invited_at is not null and u.deleted_at is null
    and p.creado=c.creada and abs(extract(epoch from c.creada-u.created_at))<1
    and exists(select 1 from public.rest_personal_accesos a
               where a.cuenta_id<>c.id and (a.usuario_id=u.id or lower(a.correo)=lower(u.email)))
    and not exists(select 1 from public.perfiles x where x.cuenta_id=c.id and x.id<>u.id)
    and not exists(select 1 from public.membresias x where x.cuenta_id=c.id and x.usuario_id<>u.id)
    and not exists(select 1 from public.documentos d where d.cuenta_id=c.id);
$$;
revoke all on function public.nuvoor46_fantasmas() from public, anon, authenticated;

create or replace function public.staff_negocios_fantasma()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public
as $$
begin
  if not public.es_staff() then raise exception 'Solo el equipo de Nuvoor puede consultar.' using errcode='42501';end if;
  return jsonb_build_object('puedeBorrar',public.es_super(),'casos',
    coalesce((select jsonb_agg(to_jsonb(f) order by f.creada desc) from public.nuvoor46_fantasmas() f),'[]'::jsonb));
end $$;
revoke all on function public.staff_negocios_fantasma() from public, anon;
grant execute on function public.staff_negocios_fantasma() to authenticated;

create or replace function public.staff_borra_negocio_fantasma(p_cuenta uuid,p_usuario uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $$
declare fantasma record; referencia record; ocupada boolean;
begin
  if not public.es_super() then raise exception 'Solo el dueño de Nuvoor puede borrar.' using errcode='42501';end if;
  perform 1 from public.cuentas where id=p_cuenta for update;
  select * into fantasma from public.nuvoor46_fantasmas() where cuenta=p_cuenta and usuario=p_usuario;
  if not found then raise exception 'El negocio cambió o tiene actividad. Actualiza la lista.';end if;
  -- Evita borrar en cascada datos de otras funciones y tablas agregadas en el futuro.
  for referencia in
    select conrelid::regclass as tabla, a.attname as columna from pg_constraint k
    join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
    where k.contype='f' and k.confrelid='public.cuentas'::regclass
      and k.conrelid not in ('public.membresias'::regclass,'public.perfiles'::regclass)
      and k.confdeltype<>'n' and cardinality(k.conkey)=1
  loop
    execute format('select exists(select 1 from %s where %I=$1)',referencia.tabla,referencia.columna)
      into ocupada using p_cuenta;
    if ocupada then raise exception 'El negocio tiene registros relacionados. Requiere revisión manual.';end if;
  end loop;
  update public.perfiles set cuenta_id=null,
    cuenta_activa=case when cuenta_activa=p_cuenta then null else cuenta_activa end
    where id=p_usuario and cuenta_id=p_cuenta;
  delete from public.cuentas where id=p_cuenta;
  insert into public.lab_bitacora(cuenta_id,quien,que,antes,despues)
    values(null,auth.uid(),'Eliminó un negocio vacío creado por una invitación',
      jsonb_build_object('cuenta',p_cuenta,'usuario',p_usuario),
      jsonb_build_object('eliminado',true));
  return true;
end $$;
revoke all on function public.staff_borra_negocio_fantasma(uuid,uuid) from public, anon;
grant execute on function public.staff_borra_negocio_fantasma(uuid,uuid) to authenticated;

-- Las RPC de Restaurant pueden devolver cuerpo completo a gerencia. El
-- material derivado de los PIN de Imprenta no viaja por ese puente.
create or replace function public.rest_personal_cuerpo(p_col text,p_body jsonb,p_rol text)
returns jsonb language sql immutable as $$
 select case
 when p_col='rest_equipo' and p_body->>'fuente42'='equipo' then p_body-'pin'-'pin_hash'
 when p_rol='gerente' then p_body
 when p_col='rest_equipo' then jsonb_build_object('id',p_body->'id','nombre',p_body->'nombre','rol',p_body->'rol','activo',coalesce(p_body->'activo','true'::jsonb),'eventoId',coalesce(p_body->>'eventoId',''),'_eliminado',coalesce(p_body->'_eliminado','false'::jsonb),'pinConfigurado',coalesce(p_body->>'pin_hash','')<>'')
 when p_col='rest_config' then p_body-'pinSalt'-'fiscal'
 when p_col in ('rest_carta','rest_lineas') then p_body-'costo'-'costoKg'
 when p_col='rest_comandas' and p_rol in ('mesero','cocina') and p_body->>'estado'<>'abierta' then jsonb_build_object('id',p_body->'id','estado',p_body->'estado','cancelada',coalesce(p_body->'cancelada','false'::jsonb),'eventoId','')
 when p_col in ('rest_comandas','rest_tickets') then p_body-'analiticaVenta'-'costo'-'costoKg'
 else p_body end
$$;
revoke all on function public.rest_personal_cuerpo(text,jsonb,text) from public;

-- Fotos del checador: sólo metadatos en la checada y bytes en Storage.
alter table public.rest_personal_checadas add column if not exists foto_ref text;
create unique index if not exists checadas_foto_ref_46 on public.rest_personal_checadas(foto_ref)
  where foto_ref is not null;
create table if not exists public.nuvoor_checador_reservas (
  id uuid primary key,
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  usuario uuid not null references auth.users(id) on delete cascade,
  objeto text not null unique,
  creada timestamptz not null default clock_timestamp(),
  vence timestamptz not null default clock_timestamp()+interval '10 minutes'
);
alter table public.nuvoor_checador_reservas enable row level security;
revoke all on public.nuvoor_checador_reservas from public,anon,authenticated;
create index if not exists checador_reserva_usuario_46 on public.nuvoor_checador_reservas(cuenta_id,usuario,creada);

create or replace function public.nuvoor_checador_foto_permitida(p_objeto text,p_escritura boolean)
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$
  select auth.uid() is not null and (
    case when p_escritura then
      exists(select 1 from public.nuvoor_checador_reservas r where r.objeto=p_objeto and r.usuario=auth.uid()
        and r.vence>now() and public.rol_en(r.cuenta_id)='admin')
    else exists(select 1 from public.rest_personal_checadas c where c.foto_ref=p_objeto and (
      public.rol_en(c.cuenta_id)='admin' or
      exists(select 1 from public.rest_personal_accesos a where a.cuenta_id=c.cuenta_id and a.persona_id=c.persona
             and a.usuario_id=auth.uid() and a.activo and a.estado='activo')
    )) end
  );
$$;
revoke all on function public.nuvoor_checador_foto_permitida(text,boolean) from public;
grant execute on function public.nuvoor_checador_foto_permitida(text,boolean) to anon,authenticated;

do $$begin
  if to_regclass('storage.buckets') is null then return;end if;
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('nuvoor-checador','nuvoor-checador',false,375000,array['image/jpeg'])
    on conflict(id) do update set public=false,file_size_limit=375000,allowed_mime_types=array['image/jpeg'];
  drop policy if exists checador_foto_muro_46 on storage.objects;
  create policy checador_foto_muro_46 on storage.objects as restrictive for select
    using (bucket_id<>'nuvoor-checador' or public.nuvoor_checador_foto_permitida(name,false));
  drop policy if exists checador_foto_lectura_46 on storage.objects;
  create policy checador_foto_lectura_46 on storage.objects for select to authenticated
    using (bucket_id='nuvoor-checador' and public.nuvoor_checador_foto_permitida(name,false));
  drop policy if exists checador_foto_subida_46 on storage.objects;
  create policy checador_foto_subida_46 on storage.objects for insert to authenticated
    with check (bucket_id='nuvoor-checador' and public.nuvoor_checador_foto_permitida(name,true));
  drop policy if exists checador_foto_muro_subida_46 on storage.objects;
  create policy checador_foto_muro_subida_46 on storage.objects as restrictive for insert
    with check (bucket_id<>'nuvoor-checador' or public.nuvoor_checador_foto_permitida(name,true));
  drop policy if exists checador_foto_sin_edicion_46 on storage.objects;
  create policy checador_foto_sin_edicion_46 on storage.objects as restrictive for update
    using(bucket_id<>'nuvoor-checador') with check(bucket_id<>'nuvoor-checador');
  drop policy if exists checador_foto_sin_borrado_46 on storage.objects;
  create policy checador_foto_sin_borrado_46 on storage.objects as restrictive for delete
    using(bucket_id<>'nuvoor-checador');
end$$;

create or replace function public.nuvoor_checador_foto_reserva(p_cuenta uuid,p_id uuid)
returns text language plpgsql security definer set search_path=pg_catalog,public
as $$
declare guardada public.nuvoor_checador_reservas%rowtype;
begin
  if p_id is null or public.rol_en(p_cuenta) is distinct from 'admin'
     or not exists(select 1 from public.cuentas where id=p_cuenta and estado='activa' and plan<>'ninguno'
                   and (vence is null or vence>now())) then
    raise exception 'Este perfil no puede preparar una foto del checador.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('foto46:'||p_cuenta||':'||auth.uid(),0));
  select * into guardada from public.nuvoor_checador_reservas where id=p_id;
  if found then
    if guardada.usuario=auth.uid() and guardada.cuenta_id=p_cuenta and guardada.vence>now() then return guardada.objeto;end if;
    raise exception 'Esta foto caducó. Vuelve a tomarla.';
  end if;
  if (select count(*) from public.nuvoor_checador_reservas where cuenta_id=p_cuenta and usuario=auth.uid()
      and creada>now()-interval '1 minute')>=12 then raise exception 'Espera un momento y vuelve a intentar.';end if;
  insert into public.nuvoor_checador_reservas(id,cuenta_id,usuario,objeto)
    values(p_id,p_cuenta,auth.uid(),p_cuenta||'/'||((now() at time zone 'America/Mexico_City')::date)::text||'/'||p_id||'.jpg')
    returning objeto into guardada.objeto;
  return guardada.objeto;
end $$;
revoke all on function public.nuvoor_checador_foto_reserva(uuid,uuid) from public,anon;
grant execute on function public.nuvoor_checador_foto_reserva(uuid,uuid) to authenticated;

create or replace function public.nuvoor_checador_foto_registra(
  p_cuenta uuid,p_aparato text,p_pin text,p_persona text,p_terminal text,p_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare r public.nuvoor_checador_reservas%rowtype; c public.rest_personal_checadas%rowtype; salida jsonb;
begin
  if public.rol_en(p_cuenta) is distinct from 'admin' then
    raise exception 'Este perfil no puede registrar una checada con foto.' using errcode='42501';
  end if;
  select * into r from public.nuvoor_checador_reservas where id=p_id and cuenta_id=p_cuenta and usuario=auth.uid() for update;
  if not found then raise exception 'Falta preparar la foto del checador.';end if;
  select * into c from public.rest_personal_checadas where solicitud=p_id and cuenta_id=p_cuenta;
  if found then return jsonb_build_object('ok',true,'registro',to_jsonb(c)-'foto','nombre',
    (select d.cuerpo->>'nombre' from public.documentos d
     where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and d.cuerpo->>'id'=c.persona
     order by d.actualizado desc limit 1));end if;
  if r.vence<=now() or not exists(select 1 from storage.objects where bucket_id='nuvoor-checador' and name=r.objeto) then
    raise exception 'La foto no se guardó. Vuelve a tomarla.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('personal39:'||p_cuenta::text,0));
  if coalesce(p_terminal,'')<>'' then
    -- Conserva la validación de PIN, terminal y jornada del checador instalado.
    -- El marcador transitorio se elimina dentro de la misma transacción.
    salida:=public.rest_personal_fase1(p_cuenta,p_aparato,'checar',
      jsonb_build_object('pin',p_pin,'persona',p_persona,'terminal',p_terminal,'foto','data:image/jpeg;base64,/9j/'));
    if salida->>'ok' is distinct from 'true' then return salida;end if;
    update public.rest_personal_checadas set foto='',foto_ref=r.objeto,solicitud=p_id
      where id=(salida->'registro'->>'id')::uuid and cuenta_id=p_cuenta
      returning * into c;
    if not found then raise exception 'No se pudo vincular la foto a la checada.';end if;
  else
    -- Checador anterior de Imprenta, también cuando SQL 42 aún no está instalado.
    salida:=public.nuvoor_imprenta_pin(p_cuenta,p_persona,p_pin);
    if salida->>'ok' is distinct from 'true' then return salida;end if;
    select * into c from public.rest_personal_checadas where cuenta_id=p_cuenta and persona=p_persona
      and anulada_por is null order by instante desc limit 1;
    if c.instante>clock_timestamp()-interval '15 seconds' then raise exception 'La checada se acaba de registrar.';end if;
    insert into public.rest_personal_checadas(cuenta_id,persona,tipo,origen,foto_ref,solicitud)
      values(p_cuenta,p_persona,case when c.tipo='entrada' then 'salida' else 'entrada' end,'terminal',r.objeto,p_id)
      returning * into c;
  end if;
  update public.nuvoor_checador_reservas set vence=clock_timestamp() where id=p_id;
  return jsonb_build_object('ok',true,'registro',to_jsonb(c)-'foto','nombre',salida->>'nombre');
end $$;
revoke all on function public.nuvoor_checador_foto_registra(uuid,text,text,text,text,uuid) from public,anon;
grant execute on function public.nuvoor_checador_foto_registra(uuid,text,text,text,text,uuid) to authenticated;

create or replace function public.nuvoor_checador_fotos_anteriores(p_cuenta uuid,p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public
as $$
begin
  if coalesce(cardinality(p_ids),0)>30 then raise exception 'Consulta las fotos por grupos de hasta 30.';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'foto',c.foto))
    from public.rest_personal_checadas c
    where c.cuenta_id=p_cuenta and c.id=any(p_ids) and c.foto_ref is null
      and c.foto ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'
      and (public.rol_en(p_cuenta)='admin' or exists(select 1 from public.rest_personal_accesos a
        where a.cuenta_id=p_cuenta and a.persona_id=c.persona and a.usuario_id=auth.uid() and a.activo and a.estado='activo'))
  ),'[]'::jsonb);
end $$;
revoke all on function public.nuvoor_checador_fotos_anteriores(uuid,uuid[]) from public,anon;
grant execute on function public.nuvoor_checador_fotos_anteriores(uuid,uuid[]) to authenticated;

-- El objeto tiene que existir antes de reemplazar el respaldo histórico.
create or replace function public.nuvoor_checador_foto_migrada(p_id uuid,p_objeto text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
  update public.rest_personal_checadas c set foto='',foto_ref=p_objeto
    where c.id=p_id and c.foto_ref is null AND c.foto like 'data:image/jpeg;base64,%'
      and p_objeto=c.cuenta_id||'/'||((c.instante at time zone 'America/Mexico_City')::date)::text||'/'||c.id||'.jpg'
      and exists(select 1 from storage.objects where bucket_id='nuvoor-checador' and name=p_objeto);
  return found;
end $$;
revoke all on function public.nuvoor_checador_foto_migrada(uuid,text) from public,anon,authenticated;
grant execute on function public.nuvoor_checador_foto_migrada(uuid,text) to service_role;

-- Conserva sesiones de Personal si SQL 42 ya existe. Si se instala después,
-- repetir 46 también corrige su preparador. El disparador protege el hash en ambos órdenes.
do $parche46$ begin
  if to_regprocedure('public.nuvoor_personal_preparar(uuid,text)') is not null then
    execute $preparar46$
create or replace function public.nuvoor_personal_preparar(p_cuenta uuid,p_aparato text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 producto_cuenta text; salt text; perfiles jsonb; u jsonb; identificador text; nombre text;
 rol_nativo text; rol_comun text; clave text; cuerpo_perfil jsonb;
 activos text[]:='{}'; compat boolean:=false; duplicados boolean; sin_pin boolean;
begin
 if not public.nuvoor_personal_disponible(p_cuenta) or public.rol_en(p_cuenta) is distinct from 'admin' then
   raise exception 'Sólo administración puede preparar este negocio.' using errcode='42501';
 end if;
 if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then raise exception 'Dispositivo inválido.' using errcode='22023';end if;
 select producto into producto_cuenta from public.cuentas where id=p_cuenta;
 if producto_cuenta not in ('taller','tiendita') then raise exception 'Usa Personal de Restaurant.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('personal39:'||p_cuenta::text,0));
 insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo)
 values(p_cuenta,'rest_config','config_general',jsonb_build_object('pinSalt',gen_random_uuid()::text))
 on conflict(cuenta_id,coleccion,doc_id) do nothing;
 select d.cuerpo->>'pinSalt' into salt from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_config' and d.doc_id='config_general';
 if coalesce(salt,'')='' then raise exception 'Falta la configuración de PIN del negocio.';end if;
 if producto_cuenta='taller' then
   select d.cuerpo->'equipo' into perfiles from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='config' and d.doc_id='equipo';
   if jsonb_typeof(perfiles) is distinct from 'array' or jsonb_array_length(perfiles)=0 then
     perfiles:=jsonb_build_array(jsonb_build_object('id',auth.uid()::text,'nombre','Administrador','rol','admin','activo',true));
   end if;
 else
   select coalesce(jsonb_agg(jsonb_build_object('id',m.usuario_id::text,'nombre',coalesce(
         nullif(to_jsonb(p)->>'nombre',''),nullif(to_jsonb(a)->'raw_user_meta_data'->>'nombre',''),nullif(split_part(a.email,'@',1),''),'Personal'),
         'rol',m.rol,'activo',true)),'[]') into perfiles
   from public.membresias m join auth.users a on a.id=m.usuario_id left join public.perfiles p on p.id=m.usuario_id
   where m.cuenta_id=p_cuenta;
 end if;
 if jsonb_array_length(perfiles)>500 then raise exception 'El equipo necesita una revisión antes de importarse.';end if;
 for u in select value from jsonb_array_elements(perfiles) loop
   identificador:=u->>'id';
   if coalesce(identificador,'')='' or length(identificador)>120 then continue;end if;
   activos:=array_append(activos,identificador);
   nombre:=left(coalesce(nullif(btrim(u->>'nombre'),''),'Personal'),120);
   rol_nativo:=u->>'rol';
   rol_comun:=case when rol_nativo in ('admin','gerente') then 'gerente' when rol_nativo='cajero' then 'cajero'
     when rol_nativo in ('diseno','produccion','inventario','cocina') then 'cocina' else 'mesero' end;
   clave:=coalesce(u->>'pin','');
   if producto_cuenta='taller' and exists(select 1 from public.nuvoor_imprenta_pines p where p.cuenta_id=p_cuenta and p.persona=identificador and p.formato_legado) then compat:=true;end if;
   cuerpo_perfil:=jsonb_build_object('id',identificador,'nombre',nombre,'rol',rol_comun,'rolPos',rol_nativo,
     'activo',u->>'activo' is distinct from 'false','eventoId','',
     'pin_hash',coalesce((select p.hash from public.nuvoor_imprenta_pines p where p.cuenta_id=p_cuenta and p.persona=identificador),''),
     'fuente42',case when producto_cuenta='taller' then 'equipo' else 'membresia' end);
   if producto_cuenta='taller' and exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo'
      and d.doc_id='personal42_'||identificador and d.cuerpo->>'pin_hash' is distinct from cuerpo_perfil->>'pin_hash') then
     update public.rest_personal_operadores set vence=clock_timestamp() where cuenta_id=p_cuenta and persona=identificador;
     delete from public.rest_personal_dispositivos where acceso_id in
      (select id from public.rest_personal_accesos where cuenta_id=p_cuenta and persona_id=identificador);
   end if;
   insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo) values(p_cuenta,'rest_equipo','personal42_'||identificador,cuerpo_perfil)
   on conflict(cuenta_id,coleccion,doc_id) do update set cuerpo=case
       when producto_cuenta='tiendita' then excluded.cuerpo||jsonb_build_object('pin_hash',documentos.cuerpo->>'pin_hash')
       else excluded.cuerpo end,actualizado=clock_timestamp()
   where documentos.cuerpo is distinct from case when producto_cuenta='tiendita' then excluded.cuerpo||jsonb_build_object('pin_hash',documentos.cuerpo->>'pin_hash') else excluded.cuerpo end;
 end loop;
 update public.documentos d set cuerpo=jsonb_set(d.cuerpo,'{activo}','false'),actualizado=clock_timestamp()
 where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and d.cuerpo->>'fuente42' in ('equipo','membresia')
   and d.cuerpo->>'activo' is distinct from 'false' and not (d.cuerpo->>'id'=any(activos));
 select not exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo'
  and d.cuerpo->>'activo' is distinct from 'false' and coalesce(d.cuerpo->>'pin_hash','')<>'') into sin_pin;
 select exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo'
   and d.cuerpo->>'activo' is distinct from 'false' and coalesce(d.cuerpo->>'pin_hash','')<>''
   group by d.cuerpo->>'pin_hash' having count(*)>1) into duplicados;
 return jsonb_build_object('ok',true,'producto',producto_cuenta,'sinPin',sin_pin,'compatibilidad',compat or duplicados,'sucursal','principal');
end $$;
    $preparar46$;
  end if;
end $parche46$;

create or replace function public.nuvoor_correcciones_seguridad_disponible()
returns boolean language sql immutable as $$ select true $$;
revoke all on function public.nuvoor_correcciones_seguridad_disponible() from public,anon;
grant execute on function public.nuvoor_correcciones_seguridad_disponible() to authenticated;
notify pgrst,'reload schema';
commit;
select '46 · Correcciones de seguridad' as migracion;
