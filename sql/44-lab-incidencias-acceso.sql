-- 44 · Lab: detectar y restaurar el vínculo original de un negocio.
-- Ejecutar después de 24 y 43. Repetible. La instalación no cambia cuentas.
begin;

create or replace function public.lab_accesos_sin_negocio(p_usuario uuid)
returns table (
  usuario uuid, cuenta uuid, nombre text, correo text, negocio text,
  producto text, plan text, motivo text, reparable boolean
)
language sql stable set search_path = pg_catalog, public
as $$
  with casos as (
    select u.id as usuario, c.id as cuenta, coalesce(p.nombre, '') as nombre,
      u.email::text as correo, c.nombre as negocio, c.producto, c.plan,
      case
        when c.id is null then 'Falta el negocio original.'
        when u.banned_until > now() then 'El inicio de sesión está suspendido.'
        when p.rol is distinct from 'admin'
          or lower(u.email) is distinct from lower(p.correo)
          or p.creado is distinct from c.creada
          or abs(extract(epoch from c.creada - u.created_at)) >= 1
          or coalesce(p.cuenta_activa, c.id) <> c.id
          or exists (select 1 from public.perfiles otro
                     where otro.cuenta_id = c.id and otro.id <> p.id)
          or exists (select 1 from public.membresias m where m.cuenta_id = c.id)
          then 'El alta no permite confirmar que este negocio le pertenezca.'
        when c.estado is distinct from 'activa'
          then 'El negocio requiere revisión de su estado.'
        when c.producto not in ('taller','restaurant','tiendita')
          then 'Revisa el sistema asignado a este negocio.'
        else null
      end as impedimento
    from auth.users u
    join public.perfiles p on p.id = u.id
    left join public.cuentas c on c.id = p.cuenta_id
    where (p_usuario is null or u.id = p_usuario)
      and u.email_confirmed_at is not null and u.deleted_at is null
      and u.invited_at is null
      and not exists (select 1 from public.membresias m where m.usuario_id = u.id)
  )
  select usuario, cuenta, nombre, correo, negocio, producto, plan,
    coalesce(impedimento, 'Falta el vínculo al negocio que se creó con este usuario.'),
    impedimento is null
  from casos
  order by negocio nulls last, usuario;
$$;
revoke all on function public.lab_accesos_sin_negocio(uuid) from public, anon, authenticated;

create or replace function public.staff_incidencias_acceso()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public
as $$
begin
  if not public.es_staff() then
    raise exception 'Sólo el equipo de Nuvoor puede consultar las incidencias.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'puedeReparar', public.es_super(),
    'casos', coalesce((select jsonb_agg(to_jsonb(i) order by i.negocio, i.usuario)
                       from public.lab_accesos_sin_negocio(null) i), '[]'::jsonb)
  );
end $$;
revoke all on function public.staff_incidencias_acceso() from public, anon;
grant execute on function public.staff_incidencias_acceso() to authenticated;

create or replace function public.staff_repara_acceso_original(p_usuario uuid, p_cuenta uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  original record;
  anterior uuid;
begin
  if not public.es_super() then
    raise exception 'Sólo el dueño de Nuvoor puede reparar este acceso.' using errcode = '42501';
  end if;

  -- Los mismos registros se bloquean antes de volver a validar el vínculo.
  -- Las llaves foráneas impiden agregar otra membresía durante la reparación.
  select p.cuenta_activa into anterior
    from auth.users u
    join public.perfiles p on p.id = u.id
    join public.cuentas c on c.id = p.cuenta_id
   where u.id = p_usuario and c.id = p_cuenta
   for update of u, p, c;
  if not found then
    raise exception 'Cambió el negocio original. Actualiza la lista de incidencias.';
  end if;

  if exists (select 1 from public.membresias
             where usuario_id = p_usuario and cuenta_id = p_cuenta and rol = 'admin') then
    return jsonb_build_object('ok', true, 'yaReparado', true);
  end if;
  select * into original from public.lab_accesos_sin_negocio(p_usuario);
  if not found or original.cuenta is distinct from p_cuenta or not original.reparable then
    raise exception 'El vínculo necesita revisión manual. Actualiza la lista de incidencias.';
  end if;

  insert into public.membresias (usuario_id, cuenta_id, rol)
    values (p_usuario, p_cuenta, 'admin');
  update public.perfiles set cuenta_activa = p_cuenta where id = p_usuario and cuenta_activa is null;

  insert into public.lab_bitacora (cuenta_id, quien, que, antes, despues)
    values (p_cuenta, auth.uid(), 'Acceso original restaurado desde Nuvoor Lab',
      jsonb_build_object('membresia', false, 'cuenta_activa', anterior),
      jsonb_build_object('usuario', p_usuario, 'rol', 'admin', 'cuenta_activa', p_cuenta));
  return jsonb_build_object('ok', true, 'yaReparado', false);
end $$;
revoke all on function public.staff_repara_acceso_original(uuid, uuid) from public, anon;
grant execute on function public.staff_repara_acceso_original(uuid, uuid) to authenticated;

create or replace function public.nuvoor_lab_incidencias_acceso_disponible()
returns boolean language sql stable set search_path = pg_catalog, public
as $$ select public.es_staff() $$;
revoke all on function public.nuvoor_lab_incidencias_acceso_disponible() from public, anon;
grant execute on function public.nuvoor_lab_incidencias_acceso_disponible() to authenticated;

notify pgrst, 'reload schema';
commit;
select '44 · Nuvoor Lab: incidencias de acceso' as migracion;
