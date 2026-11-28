-- 47 · Registro de la red local del restaurante.
-- Ejecutar después de 45. No altera comandas, caja ni permisos de operación.
begin;

create table if not exists public.rest_red_local_sesiones (
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  id uuid not null,
  registrado timestamptz not null default clock_timestamp(),
  primary key (cuenta_id,id)
);
alter table public.rest_red_local_sesiones enable row level security;
revoke all on public.rest_red_local_sesiones from public,anon,authenticated;

create or replace function public.rest_red_local_registra(p_cuenta uuid,p_resumen jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
  sesion uuid;
  inicio timestamptz;
  fin timestamptz;
  gerente text;
  cierre text;
  aparatos jsonb;
  contadores jsonb;
  indice text;
  cantidad integer;
  rechazados integer;
  aparato jsonb;
begin
  if auth.uid() is null or not exists(
    select 1 from public.cuentas where id=p_cuenta and producto='restaurant'
  ) then raise exception 'Inicia sesión en el restaurante.' using errcode='42501';end if;
  if public.rol_en(p_cuenta) is distinct from 'admin' and
    (public.rest_personal_sesion(p_cuenta,p_resumen->>'central')->>'rol') is distinct from 'gerente'
  then raise exception 'Sólo gerencia puede registrar el cierre.' using errcode='42501';end if;
  if jsonb_typeof(p_resumen) is distinct from 'object' or octet_length(p_resumen::text)>8192 then
    raise exception 'El resumen no es válido.' using errcode='22023';
  end if;
  sesion := (p_resumen->>'id')::uuid;
  inicio := (p_resumen->>'inicio')::timestamptz;
  fin := (p_resumen->>'fin')::timestamptz;
  gerente := p_resumen->>'abiertaPor';
  cierre := p_resumen->>'cerradaPor';
  if sesion is null or inicio is null or fin is null or fin<inicio or fin-inicio>interval '24 hours'
     or fin>clock_timestamp()+interval '5 minutes'
     or coalesce(gerente,'') !~ '^[a-zA-Z0-9_-]{1,120}$'
     or (cierre is distinct from 'automatica' and coalesce(cierre,'') !~ '^[a-zA-Z0-9_-]{1,120}$')
  then raise exception 'Revisa las horas y responsables de la red.' using errcode='22023';end if;
  if jsonb_typeof(p_resumen->'tablets') is distinct from 'array'
      or jsonb_array_length(p_resumen->'tablets')>40
  then raise exception 'La lista de tablets no es válida.' using errcode='22023';end if;
  aparatos := '[]'::jsonb;
  for aparato in select value from jsonb_array_elements(p_resumen->'tablets') loop
    if coalesce(aparato->>'id','') !~ '^[a-zA-Z0-9_-]{1,120}$' then
      raise exception 'El identificador de una tablet no es válido.' using errcode='22023';
    end if;
    aparatos := aparatos || jsonb_build_array(jsonb_build_object(
      'id',aparato->>'id','nombre',left(coalesce(aparato->>'nombre','Tablet'),60)
    ));
  end loop;
  contadores := '{}'::jsonb;
  foreach indice in array array['pedidos','codigosUsados','codigosRechazados'] loop
    if coalesce(p_resumen->>indice,'') !~ '^[0-9]{1,6}$' then
      raise exception 'Revisa la cantidad de pedidos y códigos.' using errcode='22023';
    end if;
    cantidad := (p_resumen->>indice)::integer;
    contadores := contadores || jsonb_build_object(indice,cantidad);
  end loop;
  rechazados := (contadores->>'codigosRechazados')::integer;
  insert into public.rest_red_local_sesiones (cuenta_id,id) values (p_cuenta,sesion) on conflict do nothing;
  if not found then return true;end if;
  perform public.seguridad_anota('red_local',case when rechazados>0 then 'alerta' else 'aviso' end,
    'Cerró la red local del restaurante','rest_red_local_sesiones','INSERT',p_cuenta,
    jsonb_build_object('id',sesion,'inicio',inicio,'fin',fin,'duracionSegundos',
      extract(epoch from fin-inicio)::integer,'abiertaPor',gerente,'cerradaPor',cierre,'tablets',aparatos)
    || contadores);
  if not exists(select 1 from public.seguridad_eventos e
    where e.cuenta_id=p_cuenta and e.tipo='red_local' and e.detalle->>'id'=sesion::text)
  then raise exception 'No se pudo guardar el registro de la red.';end if;
  return true;
end $$;
revoke all on function public.rest_red_local_registra(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rest_red_local_registra(uuid,jsonb) to authenticated;

create or replace function public.nuvoor_red_local_disponible()
returns boolean language sql immutable as $$ select true $$;
revoke all on function public.nuvoor_red_local_disponible() from public,anon;
grant execute on function public.nuvoor_red_local_disponible() to authenticated;
notify pgrst,'reload schema';
commit;
select '47 · Restaurant: red sin internet' as migracion;
