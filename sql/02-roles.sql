-- ============================================================
--  ORDEN DE EJECUCIÓN: primero 01-esquema.sql y luego ESTE.
--  Si alguna vez vuelves a correr el 01, corre este otra vez:
--  el 01 reescribe el disparador de alta y se pierden los roles.
--  Roles de usuario — ejecútalo DESPUÉS de 01-esquema.sql
--  Pégalo completo en Supabase → SQL Editor → Run
-- ============================================================

-- ---------- 1. Roles válidos ----------
--  admin      : todo, incluido invitar gente, caja, ventas y ajustes
--  ventas     : cotiza, confirma pedidos, clientes y consulta el catálogo.
--               Ve el tablero de producción, pero no mueve nada de ahí.
--  diseno     : la mesa de diseño y el tablero. Cambia archivos, no precios.
--  produccion : solo el tablero de órdenes y su estatus. No ve dinero.

alter table public.perfiles drop constraint if exists perfiles_rol_valido;
update public.perfiles set rol = 'admin' where rol in ('dueno','owner') or rol is null;
alter table public.perfiles
  add constraint perfiles_rol_valido check (rol in ('admin','ventas','diseno','produccion'));
alter table public.perfiles alter column rol set default 'ventas';

-- El primero que se registra de cada cuenta es administrador.
create or replace function public.al_crear_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare nueva uuid;
begin
  insert into public.cuentas (nombre)
    values (coalesce(new.raw_user_meta_data->>'negocio', 'Mi taller'))
    returning id into nueva;
  insert into public.perfiles (id, cuenta_id, nombre, correo, rol)
    values (new.id, nueva, new.raw_user_meta_data->>'nombre', new.email, 'admin');
  return new;
end $$;

create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = public
as $$ select rol from public.perfiles where id = auth.uid() $$;

-- ---------- 2. Qué puede tocar cada rol ----------
-- Lectura: producción solo ve las cotizaciones (de ahí salen las órdenes)
-- y el catálogo, que necesita para leer las técnicas. Nada de ventas ni caja.
drop policy if exists documentos_todo on public.documentos;

drop policy if exists documentos_leer on public.documentos;
create policy documentos_leer on public.documentos
  for select using (
    cuenta_id = public.mi_cuenta() and (
      public.mi_rol() = 'admin'
      or (public.mi_rol() = 'ventas'     and coleccion in ('config','cotizaciones','clientes'))
      or (public.mi_rol() in ('produccion','diseno') and coleccion in ('config','cotizaciones'))
    )
  );

drop policy if exists documentos_crear on public.documentos;
create policy documentos_crear on public.documentos
  for insert with check (
    cuenta_id = public.mi_cuenta() and (
      public.mi_rol() = 'admin'
      or (public.mi_rol() = 'ventas' and coleccion in ('cotizaciones','clientes'))
    )
  );

-- Producción puede actualizar una cotización existente (para mover el estatus
-- de su orden y palomear el checklist), pero no crear ni borrar.
drop policy if exists documentos_actualizar on public.documentos;
create policy documentos_actualizar on public.documentos
  for update using (
    cuenta_id = public.mi_cuenta() and (
      public.mi_rol() = 'admin'
      or (public.mi_rol() = 'ventas'     and coleccion in ('cotizaciones','clientes'))
      or (public.mi_rol() in ('produccion','diseno') and coleccion = 'cotizaciones')
    )
  ) with check (cuenta_id = public.mi_cuenta());

drop policy if exists documentos_borrar on public.documentos;
create policy documentos_borrar on public.documentos
  for delete using (
    cuenta_id = public.mi_cuenta() and (
      public.mi_rol() = 'admin'
      or (public.mi_rol() = 'ventas' and coleccion in ('cotizaciones','clientes'))
    )
  );

-- Producción no debe cambiar precios ni el cuerpo comercial de la cotización:
-- solo se le permite mover 'op' y 'checklist'.
create or replace function public.produccion_solo_estatus()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.coleccion = 'cotizaciones' then
    -- Producción solo mueve el estatus, la bitácora y el checklist.
    if public.mi_rol() = 'diseno' then
      -- Solo puede mover las aplicaciones (ahí viven los archivos) y la bitácora.
      if (new.cuerpo->'cot') - 'apps' - 'op' is distinct from (old.cuerpo->'cot') - 'apps' - 'op' then
        raise exception 'DISENO_SOLO_ARCHIVOS';
      end if;
      if (new.cuerpo->'cot'->'op') - 'bitacora' - 'archivosCambiados'
         is distinct from (old.cuerpo->'cot'->'op') - 'bitacora' - 'archivosCambiados' then
        raise exception 'DISENO_SOLO_ARCHIVOS';
      end if;
    end if;

    if public.mi_rol() = 'produccion' then
      -- Nada fuera de 'op' y 'checklist'…
      if (new.cuerpo->'cot') - 'op' - 'checklist' is distinct from (old.cuerpo->'cot') - 'op' - 'checklist' then
        raise exception 'PRODUCCION_SOLO_ESTATUS';
      end if;
      -- …y dentro de 'op', solo el estatus, su historial y la bitácora.
      if (new.cuerpo->'cot'->'op') - 'estatus' - 'historial' - 'bitacora'
         is distinct from (old.cuerpo->'cot'->'op') - 'estatus' - 'historial' - 'bitacora' then
        raise exception 'PRODUCCION_SOLO_ESTATUS';
      end if;
    end if;
    -- Ventas cotiza y confirma pedidos, pero no toca lo que pasa en el taller:
    -- ni el estatus, ni la bitácora, ni el checklist.
    if public.mi_rol() = 'ventas' then
      if (new.cuerpo->'cot'->'checklist') is distinct from (old.cuerpo->'cot'->'checklist')
         or (new.cuerpo->'cot'->'op'->'estatus')  is distinct from (old.cuerpo->'cot'->'op'->'estatus')
         or (new.cuerpo->'cot'->'op'->'bitacora') is distinct from (old.cuerpo->'cot'->'op'->'bitacora')
         or (new.cuerpo->'cot'->'op'->'admin')    is distinct from (old.cuerpo->'cot'->'op'->'admin')
      then
        raise exception 'VENTAS_NO_TOCA_PRODUCCION';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists limita_produccion on public.documentos;
create trigger limita_produccion
  before update on public.documentos
  for each row execute function public.produccion_solo_estatus();

-- ---------- 3. El administrador manda en los perfiles de su cuenta ----------
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles
  for update using (
    id = auth.uid() or (cuenta_id = public.mi_cuenta() and public.mi_rol() = 'admin')
  ) with check (cuenta_id = public.mi_cuenta());

drop policy if exists perfiles_borrar on public.perfiles;
create policy perfiles_borrar on public.perfiles
  for delete using (
    cuenta_id = public.mi_cuenta() and public.mi_rol() = 'admin' and id <> auth.uid()
  );

-- Nadie puede auto-ascenderse a administrador.
create or replace function public.protege_rol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and public.mi_rol() <> 'admin' then
    new.rol := old.rol;
    new.cuenta_id := old.cuenta_id;
  end if;
  return new;
end $$;

drop trigger if exists no_tocar_rol on public.perfiles;
create trigger no_tocar_rol
  before update on public.perfiles
  for each row execute function public.protege_rol();

-- ---------- 4. Los diseños los ve todo el equipo de la cuenta ----------
-- (ya estaba así: la regla del bucket usa mi_cuenta(), no el rol)

-- ---------- 5. Vista del equipo ----------
create or replace view public.mi_equipo as
  select p.id, p.nombre, p.correo, p.rol, p.creado
  from public.perfiles p
  where p.cuenta_id = public.mi_cuenta();
