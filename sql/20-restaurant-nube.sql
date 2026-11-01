-- ============================================================
--  20 · NUVOOR RESTAURANT EN LA NUBE
--  Correr después de sql/19-negocios-por-correo.sql.
--  SQL 19 va después de 08/CORRER-11. No crea tablas nuevas.
--  Es seguro repetirlo. No agregues correos, nombres ni llaves.
-- ============================================================

-- ---------- Realtime: agregar documentos sólo si falta ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'documentos'
  ) then
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      raise exception 'No existe la publicación supabase_realtime.';
    end if;
    execute 'alter publication supabase_realtime add table public.documentos';
  end if;
end $$;

-- La impresora es dueña del reclamo hasta que termina la impresión.
-- Un upsert normal conserva las marcas que ya puso la base y no puede inventarlas.
create or replace function public.rest_protege_reclamos_impresion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.coleccion <> 'rest_lineas'
     or coalesce(current_setting('makers.rest_reclamo_autorizado', true), '') = 'si' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.cuerpo := coalesce(new.cuerpo, '{}'::jsonb) - 'impreso';
  else
    new.cuerpo := jsonb_set(
      coalesce(new.cuerpo, '{}'::jsonb),
      '{impreso}',
      coalesce(old.cuerpo->'impreso', '{}'::jsonb),
      true
    );
  end if;
  return new;
end $$;

drop trigger if exists rest_lineas_protege_impreso on public.documentos;
create trigger rest_lineas_protege_impreso
before insert or update on public.documentos
for each row execute function public.rest_protege_reclamos_impresion();

-- ---------- Reclamo atómico: sólo la primera tablet recibe cada línea ----------
create or replace function public.rest_reclama_impresion(
  p_cuenta uuid,
  p_lineas text[],
  p_ruta text,
  p_aparato text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas text[];
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'Falta la ruta o el identificador del aparato.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with reclamadas as (
    update public.documentos d
       set cuerpo = jsonb_set(
         coalesce(d.cuerpo, '{}'::jsonb),
         '{impreso}',
         coalesce(d.cuerpo->'impreso', '{}'::jsonb) || jsonb_build_object(
           p_ruta,
           jsonb_build_object('por', p_aparato, 'en', clock_timestamp(), 'ok', false)
         ),
         true
       )
     where d.cuenta_id = p_cuenta
       and d.coleccion = 'rest_lineas'
       and d.doc_id = any(coalesce(p_lineas, '{}'::text[]))
       and coalesce(d.cuerpo #> array['impreso', p_ruta], 'null'::jsonb) = 'null'::jsonb
    returning d.doc_id
  )
  select coalesce(array_agg(doc_id order by doc_id), '{}'::text[])
    into v_lineas
    from reclamadas;

  return v_lineas;
end $$;

-- ---------- Registrar impresión hecha sin red y sincronizarla ya marcada ----------
-- La misma operación inserta/actualiza la línea y marca la ruta. La marca nunca
-- se envía por un upsert normal del navegador.
create or replace function public.rest_subir_impresion_offline(
  p_cuenta uuid,
  p_doc_id text,
  p_cuerpo jsonb,
  p_ruta text,
  p_aparato text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardada text;
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_doc_id), '') is null
     or (left(p_doc_id, 6) <> 'linea_' and left(p_doc_id, 12) <> 'cancelacion_')
     or nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'La línea, ruta o aparato no son válidos.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  insert into public.documentos as d (cuenta_id, coleccion, doc_id, cuerpo)
  values (
    p_cuenta,
    'rest_lineas',
    p_doc_id,
    jsonb_set(
      coalesce(p_cuerpo, '{}'::jsonb),
      '{impreso}',
      coalesce(p_cuerpo->'impreso', '{}'::jsonb) || jsonb_build_object(
        p_ruta,
        jsonb_build_object('por', p_aparato, 'en', clock_timestamp(), 'ok', true, 'confirmado', clock_timestamp(), 'sinRed', true)
      ),
      true
    )
  )
  on conflict (cuenta_id, coleccion, doc_id) do update
     set cuerpo = jsonb_set(
       coalesce(excluded.cuerpo, '{}'::jsonb),
       '{impreso}',
       coalesce(d.cuerpo->'impreso', '{}'::jsonb) || jsonb_build_object(
         p_ruta,
         jsonb_build_object('por', p_aparato, 'en', clock_timestamp(), 'ok', true, 'confirmado', clock_timestamp(), 'sinRed', true)
       ),
       true
     )
   where coalesce(d.cuerpo #> array['impreso', p_ruta], 'null'::jsonb) = 'null'::jsonb
  returning d.doc_id into v_guardada;

  return v_guardada is not null;
end $$;

-- ---------- Confirmar que la impresora terminó sin error ----------
create or replace function public.rest_confirma_impresion(
  p_cuenta uuid,
  p_lineas text[],
  p_ruta text,
  p_aparato text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas text[];
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'Falta la ruta o el identificador del aparato.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with confirmadas as (
    update public.documentos d
       set cuerpo = jsonb_set(
         coalesce(d.cuerpo, '{}'::jsonb),
         array['impreso', p_ruta],
         coalesce(d.cuerpo #> array['impreso', p_ruta], '{}'::jsonb) || jsonb_build_object('ok', true, 'confirmado', clock_timestamp()),
         true
       )
     where d.cuenta_id = p_cuenta
       and d.coleccion = 'rest_lineas'
       and d.doc_id = any(coalesce(p_lineas, '{}'::text[]))
       and d.cuerpo #>> array['impreso', p_ruta, 'por'] = p_aparato
       and coalesce((d.cuerpo #>> array['impreso', p_ruta, 'ok'])::boolean, false) = false
    returning d.doc_id
  )
  select coalesce(array_agg(doc_id order by doc_id), '{}'::text[])
    into v_lineas
    from confirmadas;

  return v_lineas;
end $$;

-- ---------- Recuperar un reclamo ajeno abandonado (requiere acción humana) ----------
create or replace function public.rest_reasigna_impresion(
  p_cuenta uuid,
  p_lineas text[],
  p_ruta text,
  p_aparato text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas text[];
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'Falta la ruta o el identificador del aparato.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with reasignadas as (
    update public.documentos d
       set cuerpo = jsonb_set(
         coalesce(d.cuerpo, '{}'::jsonb),
         array['impreso', p_ruta],
         jsonb_build_object('por', p_aparato, 'en', clock_timestamp(), 'ok', false, 'reasignada', true),
         true
       )
     where d.cuenta_id = p_cuenta
       and d.coleccion = 'rest_lineas'
       and d.doc_id = any(coalesce(p_lineas, '{}'::text[]))
       and coalesce((d.cuerpo #>> array['impreso', p_ruta, 'ok'])::boolean, false) = false
       and (d.cuerpo #>> array['impreso', p_ruta, 'en'])::timestamptz < clock_timestamp() - interval '2 minutes'
    returning d.doc_id
  )
  select coalesce(array_agg(doc_id order by doc_id), '{}'::text[])
    into v_lineas
    from reasignadas;

  return v_lineas;
end $$;

-- ---------- Liberar un reclamo fallido para que otra tablet pueda reintentar ----------
create or replace function public.rest_libera_impresion(
  p_cuenta uuid,
  p_lineas text[],
  p_ruta text,
  p_aparato text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas text[];
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'Falta la ruta o el identificador del aparato.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with liberadas as (
    update public.documentos d
       set cuerpo = jsonb_set(
         coalesce(d.cuerpo, '{}'::jsonb),
         '{impreso}',
         coalesce(d.cuerpo->'impreso', '{}'::jsonb) - p_ruta,
         true
       )
     where d.cuenta_id = p_cuenta
       and d.coleccion = 'rest_lineas'
       and d.doc_id = any(coalesce(p_lineas, '{}'::text[]))
       and d.cuerpo #>> array['impreso', p_ruta, 'por'] = p_aparato
       and coalesce((d.cuerpo #>> array['impreso', p_ruta, 'ok'])::boolean, false) = false
    returning d.doc_id
  )
  select coalesce(array_agg(doc_id order by doc_id), '{}'::text[])
    into v_lineas
    from liberadas;

  return v_lineas;
end $$;

-- ---------- Abrir una sola comanda cuando dos meseros tocan la mesa a la vez ----------
-- El documento de candado vive en documentos/rest_locks y sólo se modifica aquí.
-- La cabecera de la comanda se crea en la misma transacción, para que el segundo
-- aparato pueda abrir la misma cuenta y agregar sus líneas con IDs independientes.
create or replace function public.rest_reserva_comanda(
  p_cuenta uuid,
  p_mesa text,
  p_doc_id text,
  p_cuerpo jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_id text;
  v_lock_id text;
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_mesa), '') is null or nullif(btrim(p_doc_id), '') is null then
    raise exception 'Falta la mesa o el identificador de la comanda.' using errcode = '22023';
  end if;

  v_lock_id := 'mesa_' || md5(p_mesa);
  insert into public.documentos as d (cuenta_id, coleccion, doc_id, cuerpo)
  values (
    p_cuenta,
    'rest_locks',
    v_lock_id,
    jsonb_build_object('comanda', p_doc_id, 'vence', clock_timestamp() + interval '45 seconds')
  )
  on conflict (cuenta_id, coleccion, doc_id) do update
     set cuerpo = jsonb_build_object(
       'comanda', p_doc_id,
       'vence', clock_timestamp() + interval '45 seconds'
     )
   where exists (
        select 1
          from public.documentos c
         where c.cuenta_id = p_cuenta
           and c.coleccion = 'rest_comandas'
           and c.doc_id = d.cuerpo->>'comanda'
           and c.cuerpo->>'estado' in ('cobrada', 'cancelada')
      )
      or (
        coalesce((d.cuerpo->>'vence')::timestamptz, 'epoch'::timestamptz) < clock_timestamp()
        and not exists (
          select 1
            from public.documentos c
           where c.cuenta_id = p_cuenta
             and c.coleccion = 'rest_comandas'
             and c.doc_id = d.cuerpo->>'comanda'
             and c.cuerpo->>'estado' = 'abierta'
        )
      )
  returning d.cuerpo->>'comanda' into v_doc_id;

  if v_doc_id is null then
    select cuerpo->>'comanda' into v_doc_id
      from public.documentos
     where cuenta_id = p_cuenta and coleccion = 'rest_locks' and doc_id = v_lock_id;
  else
    insert into public.documentos (cuenta_id, coleccion, doc_id, cuerpo)
    values (p_cuenta, 'rest_comandas', p_doc_id, coalesce(p_cuerpo, '{}'::jsonb))
    on conflict (cuenta_id, coleccion, doc_id) do nothing;
  end if;

  return v_doc_id;
end $$;

-- ---------- Folio único por negocio y serie, protegido por el bloqueo del upsert ----------
create or replace function public.rest_siguiente_folio(
  p_cuenta uuid,
  p_serie text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_serie), '') is null or length(p_serie) > 120 then
    raise exception 'La serie del folio no es válida.' using errcode = '22023';
  end if;

  insert into public.documentos as d (cuenta_id, coleccion, doc_id, cuerpo)
  values (p_cuenta, 'rest_contadores', p_serie, jsonb_build_object('ultimo', 1))
  on conflict (cuenta_id, coleccion, doc_id) do update
     set cuerpo = jsonb_set(
       coalesce(d.cuerpo, '{}'::jsonb),
       '{ultimo}',
       to_jsonb(coalesce(nullif(d.cuerpo->>'ultimo', '')::integer, 0) + 1),
       true
     )
  returning (cuerpo->>'ultimo')::integer into v_numero;

  return v_numero;
end $$;

-- ---------- Bandera para que la aplicación siga en local si falta esta migración ----------
create or replace function public.nuvoor_rest_nube_disponible()
returns boolean
language sql
immutable
as $$ select true $$;

revoke all on function public.rest_protege_reclamos_impresion() from public;
revoke all on function public.rest_reclama_impresion(uuid, text[], text, text) from public;
revoke all on function public.rest_libera_impresion(uuid, text[], text, text) from public;
revoke all on function public.rest_subir_impresion_offline(uuid, text, jsonb, text, text) from public;
revoke all on function public.rest_confirma_impresion(uuid, text[], text, text) from public;
revoke all on function public.rest_reasigna_impresion(uuid, text[], text, text) from public;
revoke all on function public.rest_reserva_comanda(uuid, text, text, jsonb) from public;
revoke all on function public.rest_siguiente_folio(uuid, text) from public;
revoke all on function public.nuvoor_rest_nube_disponible() from public;
grant execute on function public.rest_reclama_impresion(uuid, text[], text, text) to authenticated;
grant execute on function public.rest_libera_impresion(uuid, text[], text, text) to authenticated;
grant execute on function public.rest_subir_impresion_offline(uuid, text, jsonb, text, text) to authenticated;
grant execute on function public.rest_confirma_impresion(uuid, text[], text, text) to authenticated;
grant execute on function public.rest_reasigna_impresion(uuid, text[], text, text) to authenticated;
grant execute on function public.rest_reserva_comanda(uuid, text, text, jsonb) to authenticated;
grant execute on function public.rest_siguiente_folio(uuid, text) to authenticated;
grant execute on function public.nuvoor_rest_nube_disponible() to anon, authenticated;

-- ---------- Comprobación única para el editor SQL ----------
select
  'sql/20-restaurant-nube.sql' as comprobacion,
  to_regprocedure('public.nuvoor_negocios_disponible()') is not null as sql_19_disponible,
  to_regprocedure('public.nuvoor_rest_nube_disponible()') is not null as sql_20_disponible,
  to_regprocedure('public.rest_reclama_impresion(uuid,text[],text,text)') is not null as reclama_impresion,
  to_regprocedure('public.rest_libera_impresion(uuid,text[],text,text)') is not null as libera_impresion,
  to_regprocedure('public.rest_subir_impresion_offline(uuid,text,jsonb,text,text)') is not null as subir_impresion_offline,
  to_regprocedure('public.rest_confirma_impresion(uuid,text[],text,text)') is not null as confirma_impresion,
  to_regprocedure('public.rest_reasigna_impresion(uuid,text[],text,text)') is not null as reasigna_impresion,
  to_regprocedure('public.rest_reserva_comanda(uuid,text,text,jsonb)') is not null as reserva_comanda,
  to_regprocedure('public.rest_siguiente_folio(uuid,text)') is not null as siguiente_folio,
  to_regprocedure('public.rest_protege_reclamos_impresion()') is not null as protege_reclamos,
  exists(select 1 from pg_publication_tables
          where pubname='supabase_realtime' and schemaname='public' and tablename='documentos') as realtime_documentos,
  has_function_privilege('authenticated','public.rest_reclama_impresion(uuid,text[],text,text)','EXECUTE') as reclama_permitida,
  has_function_privilege('authenticated','public.rest_libera_impresion(uuid,text[],text,text)','EXECUTE') as libera_permitida,
  has_function_privilege('authenticated','public.rest_subir_impresion_offline(uuid,text,jsonb,text,text)','EXECUTE') as offline_permitida,
  has_function_privilege('authenticated','public.rest_confirma_impresion(uuid,text[],text,text)','EXECUTE') as confirma_permitida,
  has_function_privilege('authenticated','public.rest_reasigna_impresion(uuid,text[],text,text)','EXECUTE') as reasigna_permitida,
  has_function_privilege('authenticated','public.rest_reserva_comanda(uuid,text,text,jsonb)','EXECUTE') as reserva_permitida,
  has_function_privilege('authenticated','public.rest_siguiente_folio(uuid,text)','EXECUTE') as folios_permitidos,
  has_function_privilege('anon','public.nuvoor_rest_nube_disponible()','EXECUTE') as disponibilidad_publica;
