-- 43 · Altas por producto y canje de códigos del Lab.
-- Ejecutar después de 07 y 19. Repetible. No cambia cuentas existentes.
begin;

create or replace function public.al_crear_usuario()
returns trigger
language plpgsql security definer set search_path=public as $$
declare negocio uuid; sistema text;
begin
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

create or replace function public.canjear_codigo(p_codigo text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  usuario uuid := auth.uid();
  clave text := upper(btrim(coalesce(p_codigo, '')));
  negocio public.cuentas%rowtype;
  codigo public.codigos%rowtype;
  nuevo_vencimiento timestamptz;
  permiso_anterior text;
begin
  if usuario is null then
    return jsonb_build_object('ok', false, 'motivo', 'Inicia sesión para usar tu código.');
  end if;

  select * into negocio from public.cuentas c
   where c.id=public.mi_cuenta() and exists (
     select 1 from public.membresias m
      where m.cuenta_id=c.id and m.usuario_id=usuario and m.rol='admin'
   ) for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'No encontramos un negocio a tu nombre para activar. Pide apoyo al equipo de Nuvoor.');
  end if;

  if negocio.codigo is not null then
    if negocio.codigo=clave and negocio.plan not in ('ninguno','prueba') and negocio.estado='activa'
       and (negocio.vence is null or negocio.vence>now()) then
      return jsonb_build_object('ok', true, 'plan', negocio.plan, 'vence', negocio.vence, 'cuenta', negocio.id);
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'Este negocio ya tiene un código registrado. Si no puedes entrar, pide apoyo a Nuvoor.');
  end if;
  if negocio.estado <> 'activa' or negocio.plan not in ('ninguno','prueba') then
    return jsonb_build_object('ok', false, 'motivo', 'Este código sólo se puede usar en un negocio nuevo o en prueba.');
  end if;

  select * into codigo from public.codigos where codigos.codigo=clave for update;
  if not found or not codigo.activo or codigo.vence<=now()
     or (codigo.usos_max>0 and codigo.usos>=codigo.usos_max) then
    return jsonb_build_object('ok', false, 'motivo', 'El código venció, ya no está activo o no tiene lugares disponibles.');
  end if;

  nuevo_vencimiento := now()+make_interval(days => codigo.dias);
  permiso_anterior := current_setting('makers.cambio_autorizado', true);
  perform set_config('makers.cambio_autorizado', 'si', true);
  update public.cuentas
     set plan=codigo.plan, es_prueba=true, codigo=clave, vence=nuevo_vencimiento
   where id=negocio.id returning * into negocio;
  perform set_config('makers.cambio_autorizado', coalesce(permiso_anterior, ''), true);
  if negocio.plan is distinct from codigo.plan or negocio.vence is distinct from nuevo_vencimiento then
    raise exception 'Nuvoor no pudo activar esta licencia. El código sigue disponible.';
  end if;
  update public.codigos set usos=usos+1 where codigos.codigo=clave;
  return jsonb_build_object('ok', true, 'plan', negocio.plan, 'dias', codigo.dias,
                            'curso', codigo.curso, 'vence', negocio.vence, 'cuenta', negocio.id);
end $$;

revoke all on function public.canjear_codigo(text) from public, anon;
grant execute on function public.canjear_codigo(text) to authenticated;

create or replace function public.nuvoor_codigos_disponibles()
returns boolean language sql immutable set search_path=public as $$ select true $$;
revoke all on function public.nuvoor_codigos_disponibles() from public, anon;
grant execute on function public.nuvoor_codigos_disponibles() to authenticated;

notify pgrst, 'reload schema';
commit;
select '43 · Altas y canje de códigos' as migracion;
