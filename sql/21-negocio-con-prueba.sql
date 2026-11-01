-- ============================================================
--  21 · NEGOCIO CON PRUEBA Y MIGRACIÓN INICIAL SEGURA
--  Correr después de 19-negocios-por-correo.sql y 20-restaurant-nube.sql.
--  Es seguro repetirlo. No modifica cuentas que ya existen.
--  No agregues aquí correos, nombres de clientes ni llaves.
-- ============================================================

-- ---------- Crear negocios nuevos con 15 días de prueba ----------
-- El alta normal de usuario se cambió en 07-codigos.sql: sin código nace
-- sin plan. Para crear un negocio adicional se deja aquí la prueba de 15 días
-- que pidió Carlos; la decisión sobre exigir código queda pendiente.
create or replace function public.crear_negocio(nombre text, producto text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare nueva uuid; prod text;
begin
  if auth.uid() is null then raise exception 'SIN_SESION'; end if;
  prod := lower(trim(coalesce(producto, '')));
  if prod not in ('taller','restaurant','tiendita') then
    raise exception 'PRODUCTO_NO_VALIDO';
  end if;

  insert into public.cuentas (nombre, producto, plan, estado, vence)
    values (
      coalesce(nullif(trim(nombre),''), 'Mi negocio'),
      prod,
      'prueba',
      'activa',
      now() + interval '15 days'
    )
    returning id into nueva;
  insert into public.membresias (usuario_id, cuenta_id, rol)
    values (auth.uid(), nueva, 'admin');
  return nueva;
end $$;
revoke all on function public.crear_negocio(text,text) from public;
revoke execute on function public.crear_negocio(text,text) from anon;
grant execute on function public.crear_negocio(text,text) to authenticated;

-- ---------- Reclamo atómico del primer aparato que migra los datos ----------
-- Una lectura previa en el navegador evita mezclar colas ya existentes. Este
-- candado de la base también resuelve el caso en que dos aparatos lean vacío
-- al mismo tiempo: sólo el primero puede reservar la migración.
create or replace function public.rest_reclama_migracion(p_cuenta uuid, p_aparato text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_doc_id text;
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_aparato), '') is null or length(p_aparato) > 200 then
    raise exception 'Falta un identificador válido para este aparato.' using errcode = '22023';
  end if;

  insert into public.documentos as d (cuenta_id, coleccion, doc_id, cuerpo)
  values (
    p_cuenta,
    'rest_locks',
    'migracion_inicial',
    jsonb_build_object('aparato', p_aparato, 'creado', clock_timestamp())
  )
  on conflict (cuenta_id, coleccion, doc_id) do update
     set cuerpo = jsonb_set(d.cuerpo, '{ultimo}', to_jsonb(clock_timestamp()), true)
   where d.cuerpo->>'aparato' = p_aparato
  returning d.doc_id into v_doc_id;

  return v_doc_id is not null;
end $$;
revoke all on function public.rest_reclama_migracion(uuid,text) from public;
revoke execute on function public.rest_reclama_migracion(uuid,text) from anon;
grant execute on function public.rest_reclama_migracion(uuid,text) to authenticated;

-- ---------- Detectar que la migración 21 quedó instalada ----------
create or replace function public.nuvoor_negocio_prueba_disponible()
returns boolean
language sql immutable security definer set search_path = public
as $$ select true $$;
revoke all on function public.nuvoor_negocio_prueba_disponible() from public;
grant execute on function public.nuvoor_negocio_prueba_disponible() to anon, authenticated;

-- ---------- Cerrar las RPC de operación para el rol público anon ----------
revoke execute on function public.rest_reclama_impresion(uuid, text[], text, text) from anon;
revoke execute on function public.rest_libera_impresion(uuid, text[], text, text) from anon;
revoke execute on function public.rest_subir_impresion_offline(uuid, text, jsonb, text, text) from anon;
revoke execute on function public.rest_confirma_impresion(uuid, text[], text, text) from anon;
revoke execute on function public.rest_reasigna_impresion(uuid, text[], text, text) from anon;
revoke execute on function public.rest_reserva_comanda(uuid, text, text, jsonb) from anon;
revoke execute on function public.rest_siguiente_folio(uuid, text) from anon;

-- ---------- Comprobación única para el editor SQL ----------
select
  'sql/21-negocio-con-prueba.sql' as comprobacion,
  to_regprocedure('public.crear_negocio(text,text)') is not null as crear_negocio,
  to_regprocedure('public.rest_reclama_migracion(uuid,text)') is not null as reclama_migracion,
  to_regprocedure('public.nuvoor_negocio_prueba_disponible()') is not null as disponibilidad_21,
  not has_function_privilege('anon','public.crear_negocio(text,text)','EXECUTE') as crear_negocio_anon_revocado,
  not has_function_privilege('anon','public.rest_reclama_migracion(uuid,text)','EXECUTE') as reclama_migracion_anon_revocado,
  not has_function_privilege('anon','public.rest_reclama_impresion(uuid,text[],text,text)','EXECUTE') as reclama_impresion_anon_revocado,
  not has_function_privilege('anon','public.rest_libera_impresion(uuid,text[],text,text)','EXECUTE') as libera_impresion_anon_revocado,
  not has_function_privilege('anon','public.rest_subir_impresion_offline(uuid,text,jsonb,text,text)','EXECUTE') as offline_anon_revocado,
  not has_function_privilege('anon','public.rest_confirma_impresion(uuid,text[],text,text)','EXECUTE') as confirma_anon_revocado,
  not has_function_privilege('anon','public.rest_reasigna_impresion(uuid,text[],text,text)','EXECUTE') as reasigna_anon_revocado,
  not has_function_privilege('anon','public.rest_reserva_comanda(uuid,text,text,jsonb)','EXECUTE') as reserva_anon_revocado,
  not has_function_privilege('anon','public.rest_siguiente_folio(uuid,text)','EXECUTE') as folio_anon_revocado,
  has_function_privilege('authenticated','public.rest_reclama_migracion(uuid,text)','EXECUTE') as reclama_migracion_autorizada,
  has_function_privilege('anon','public.rol_en(uuid)','EXECUTE') as rol_en_anon_conservado,
  has_function_privilege('anon','public.es_miembro(uuid)','EXECUTE') as es_miembro_anon_conservado,
  has_function_privilege('anon','public.nuvoor_negocios_disponible()','EXECUTE') as disponibilidad_19_anon_conservada,
  has_function_privilege('anon','public.nuvoor_rest_nube_disponible()','EXECUTE') as disponibilidad_20_anon_conservada,
  has_function_privilege('anon','public.nuvoor_negocio_prueba_disponible()','EXECUTE') as disponibilidad_21_anon;
