-- Traslado de cuentas abiertas. Requiere SQL 19, 20 y 30.
-- Se instala una sola vez desde el editor SQL. No cambia mesas ni comandas existentes.
begin;

do $$ begin
  if to_regprocedure('public.rest_caja_bloquea(uuid,text)') is null then
    raise exception 'Instala primero 30-restaurant-caja-compartida.sql.';
  end if;
end $$;

-- Conserva el contrato usado por las versiones anteriores de Restaurant.
-- Consultar la cabecera bajo el mismo candado permite reabrir la mesa que se liberó.
create or replace function public.rest_reserva_comanda(
  p_cuenta uuid, p_mesa text, p_doc_id text, p_cuerpo jsonb
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_doc_id text;
begin
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_mesa), '') is null or p_mesa = 'llevar'
     or nullif(btrim(p_doc_id), '') is null or jsonb_typeof(p_cuerpo) is distinct from 'object' then
    raise exception 'Falta la mesa o la comanda.' using errcode = '22023';
  end if;

  perform public.rest_caja_bloquea(p_cuenta, '');
  select doc_id into v_doc_id from public.documentos
   where cuenta_id = p_cuenta and coleccion = 'rest_comandas'
     and coalesce(cuerpo->>'eventoId', '') = '' and cuerpo->>'mesaId' = p_mesa
     and cuerpo->>'estado' = 'abierta' and cuerpo->>'_eliminado' is distinct from 'true'
   order by actualizado desc, doc_id limit 1;
  if v_doc_id is not null then return v_doc_id; end if;

  insert into public.documentos (cuenta_id, coleccion, doc_id, cuerpo)
  values (p_cuenta, 'rest_comandas', p_doc_id, (p_cuerpo - 'ultimoTraslado') ||
    jsonb_build_object('mesaId', p_mesa, 'estado', 'abierta', 'eventoId', ''))
  on conflict (cuenta_id, coleccion, doc_id) do nothing;
  return p_doc_id;
end $$;

create or replace function public.rest_traslada_mesa(
  p_cuenta uuid, p_evento text, p_comanda text, p_origen text, p_destino text,
  p_persona text, p_pin text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_evento text := coalesce(p_evento, '');
  v_persona jsonb;
  v_salt text;
  v_comanda jsonb;
  v_mesa jsonb;
  v_traslado jsonb;
  v_resultado jsonb;
begin
  if p_cuenta is null or public.rol_en(p_cuenta) is distinct from 'admin' then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if p_comanda is null or p_origen is null or p_destino is null
     or p_origen = p_destino or p_origen = 'llevar' or p_destino = 'llevar' then
    raise exception 'Elige otra mesa libre.' using errcode = '22023';
  end if;

  select cuerpo into v_persona from public.documentos
   where cuenta_id = p_cuenta and coleccion = 'rest_equipo'
     and coalesce(cuerpo->>'eventoId', '') = v_evento and cuerpo->>'id' = p_persona
     and cuerpo->>'activo' is distinct from 'false'
     and cuerpo->>'_eliminado' is distinct from 'true';
  select cuerpo->>'pinSalt' into v_salt from public.documentos
   where cuenta_id = p_cuenta and coleccion = 'rest_config'
     and coalesce(cuerpo->>'eventoId', '') = v_evento
     and cuerpo->>'_eliminado' is distinct from 'true';
  if v_persona is null or coalesce(v_persona->>'rol', '') not in ('admin','gerente','cajero')
     or coalesce(v_salt, '') = '' or coalesce(p_pin, '') !~ '^[0-9]{4,12}$'
     or v_persona->>'pin_hash' is distinct from
        encode(sha256(convert_to(v_salt || p_pin, 'UTF8')), 'hex') then
    raise exception 'PIN inválido o perfil sin permiso para transferir.' using errcode = '42501';
  end if;

  perform public.rest_caja_bloquea(p_cuenta, v_evento);
  select cuerpo into v_comanda from public.documentos
   where cuenta_id = p_cuenta and coleccion = 'rest_comandas' and doc_id = p_comanda
     and coalesce(cuerpo->>'eventoId', '') = v_evento
     and cuerpo->>'_eliminado' is distinct from 'true'
   for update;
  if v_comanda is null or v_comanda->>'estado' is distinct from 'abierta'
     or nullif(v_comanda->>'appId', '') is not null
     or v_comanda->>'mesaId' is distinct from p_origen then
    raise exception 'La cuenta ya se cerró o cambió de mesa. Actualiza y vuelve a intentarlo.';
  end if;

  select cuerpo into v_mesa from public.documentos
   where cuenta_id = p_cuenta and coleccion = 'rest_mesas' and cuerpo->>'id' = p_destino
     and coalesce(cuerpo->>'eventoId', '') = v_evento and cuerpo->>'tipo' = 'mesa'
     and cuerpo->>'activa' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true'
   for update;
  if v_mesa is null or nullif(v_mesa->>'grupo', '') is not null then
    raise exception 'La mesa de destino ya no está disponible.';
  end if;
  if exists (
    select 1 from public.documentos where cuenta_id = p_cuenta and coleccion = 'rest_comandas'
      and coalesce(cuerpo->>'eventoId', '') = v_evento and cuerpo->>'mesaId' = p_destino
      and cuerpo->>'estado' = 'abierta' and cuerpo->>'_eliminado' is distinct from 'true'
  ) then
    raise exception 'La mesa de destino ya está ocupada.';
  end if;

  v_traslado := jsonb_build_object(
    'origen', p_origen, 'nombreOrigen', v_comanda->>'mesaNombre',
    'destino', p_destino, 'nombreDestino', v_mesa->>'nombre', 'zona', coalesce(v_mesa->>'zona', 'Salón'),
    'por', p_persona, 'nombre', v_persona->>'nombre', 'en', clock_timestamp()
  );
  update public.documentos set cuerpo = v_comanda || jsonb_build_object(
    'mesaId', p_destino, 'mesaNombre', coalesce(v_mesa->>'nombre', 'Mesa'),
    'ultimoTraslado', v_traslado
  )
  where cuenta_id = p_cuenta and coleccion = 'rest_comandas' and doc_id = p_comanda
  returning to_jsonb(documentos) into v_resultado;
  return v_resultado;
end $$;
revoke all on function public.rest_traslada_mesa(uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.rest_traslada_mesa(uuid,text,text,text,text,text,text) to authenticated;

-- Los aparatos que aún tienen la mesa anterior pueden seguir subiendo líneas y
-- cambios de la cuenta. Un guardado viejo de la cabecera no deshace el traslado.
create or replace function public.rest_protege_traslado()
returns trigger language plpgsql set search_path = public as $$
declare
  v_cabecera jsonb;
  v_evento text := coalesce(new.cuerpo->>'eventoId', '');
  v_mesa text := new.cuerpo->>'mesaId';
begin
  if new.coleccion = 'rest_comandas' then
    if tg_op = 'INSERT' and new.cuerpo->>'estado' = 'abierta' and v_mesa <> 'llevar'
       and not exists (select 1 from public.documentos where cuenta_id = new.cuenta_id
         and coleccion = new.coleccion and doc_id = new.doc_id) then
      -- El trigger rest_caja_protege_cobro ya tomó el candado de caja.
      -- Protege la mesa reservada por un traslado si llega una alta sin red.
      if exists (
        select 1 from public.documentos where cuenta_id = new.cuenta_id and coleccion = new.coleccion
          and doc_id <> new.doc_id and coalesce(cuerpo->>'eventoId', '') = v_evento
          and cuerpo->>'mesaId' = v_mesa and cuerpo->>'estado' = 'abierta' and cuerpo ? 'ultimoTraslado'
          and cuerpo->>'_eliminado' is distinct from 'true'
      ) then raise exception 'La mesa de destino ya está ocupada.' using errcode = '23505'; end if;
    end if;
    if current_user not in ('authenticated','anon') then return new; end if;
    if tg_op = 'UPDATE' and old.cuerpo ? 'ultimoTraslado' then
      if old.cuerpo->>'estado' in ('cobrada','cancelada') and new.cuerpo->>'estado' = 'abierta' then
        new.cuerpo := old.cuerpo;
        return new;
      end if;
      if new.cuerpo->'ultimoTraslado' is distinct from old.cuerpo->'ultimoTraslado'
         or v_mesa is distinct from old.cuerpo->>'mesaId' then
        new.cuerpo := new.cuerpo || jsonb_build_object('mesaNombre', old.cuerpo->>'mesaNombre');
      end if;
      new.cuerpo := new.cuerpo || jsonb_build_object(
        'mesaId', old.cuerpo->>'mesaId', 'ultimoTraslado', old.cuerpo->'ultimoTraslado');
    elsif tg_op = 'UPDATE' and v_mesa is distinct from old.cuerpo->>'mesaId'
          and old.cuerpo->>'mesaId' is not null and new.cuerpo->>'_eliminado' is distinct from 'true' then
      raise exception 'Transfiere la mesa con autorización.' using errcode = '42501';
    else
      new.cuerpo := new.cuerpo - 'ultimoTraslado';
    end if;
  elsif new.coleccion = 'rest_tickets' then
    select cuerpo into v_cabecera from public.documentos
     where cuenta_id = new.cuenta_id and coleccion = 'rest_comandas'
       and coalesce(cuerpo->>'eventoId', '') = v_evento and cuerpo->>'id' = new.cuerpo->>'id'
       and cuerpo ? 'ultimoTraslado' and cuerpo->>'_eliminado' is distinct from 'true'
     limit 1;
    if v_cabecera is not null then
      new.cuerpo := new.cuerpo || jsonb_build_object(
        'mesaId', v_cabecera->>'mesaId', 'mesaNombre', v_cabecera->>'mesaNombre');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rest_protege_traslado_mesas on public.documentos;
create trigger rest_protege_traslado_mesas
before insert or update on public.documentos
for each row when (new.coleccion in ('rest_comandas','rest_tickets'))
execute function public.rest_protege_traslado();

commit;

select to_regprocedure('public.rest_traslada_mesa(uuid,text,text,text,text,text,text)') is not null
  as traslado_disponible;
