-- ============================================================
--  19 · VARIOS NEGOCIOS POR CORREO, CON CUENTAS INDEPENDIENTES
--  Correr después de 01, 02, 06, 10, 17 y CORRER-11 (que va después de 08).
--  No depende de sql/18.
--  Es seguro repetirlo.
--  No agregues aquí correos, nombres de clientes ni llaves.
-- ============================================================

-- ---------- Rol del usuario en la cuenta de cada fila ----------
create or replace function public.rol_en(cuenta uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select m.rol
    from public.membresias m
   where m.usuario_id = auth.uid()
     and m.cuenta_id = cuenta
   limit 1
$$;

create or replace function public.es_miembro(cuenta uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.rol_en(cuenta) is not null $$;

revoke all on function public.rol_en(uuid) from public;
revoke all on function public.es_miembro(uuid) from public;
grant execute on function public.rol_en(uuid) to authenticated;
grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.rol_en(uuid) to anon;
grant execute on function public.es_miembro(uuid) to anon;

-- ---------- Documentos: mismo acceso por colección, rol de ESA cuenta ----------
drop policy if exists documentos_todo on public.documentos;
drop policy if exists documentos_leer on public.documentos;
drop policy if exists documentos_crear on public.documentos;
drop policy if exists documentos_actualizar on public.documentos;
drop policy if exists documentos_borrar on public.documentos;

create policy documentos_leer on public.documentos
  for select using (
    public.rol_en(cuenta_id) = 'admin'
    or (public.rol_en(cuenta_id) = 'ventas'
        and coleccion in ('config','cotizaciones','clientes'))
    or (public.rol_en(cuenta_id) in ('produccion','diseno')
        and coleccion in ('config','cotizaciones'))
  );

create policy documentos_crear on public.documentos
  for insert with check (
    public.rol_en(cuenta_id) = 'admin'
    or (public.rol_en(cuenta_id) = 'ventas'
        and coleccion in ('cotizaciones','clientes'))
  );

create policy documentos_actualizar on public.documentos
  for update using (
    public.rol_en(cuenta_id) = 'admin'
    or (public.rol_en(cuenta_id) = 'ventas'
        and coleccion in ('cotizaciones','clientes'))
    or (public.rol_en(cuenta_id) in ('produccion','diseno')
        and coleccion = 'cotizaciones')
  ) with check (
    public.rol_en(cuenta_id) = 'admin'
    or (public.rol_en(cuenta_id) = 'ventas'
        and coleccion in ('cotizaciones','clientes'))
    or (public.rol_en(cuenta_id) in ('produccion','diseno')
        and coleccion = 'cotizaciones')
  );

create policy documentos_borrar on public.documentos
  for delete using (
    public.rol_en(cuenta_id) = 'admin'
    or (public.rol_en(cuenta_id) = 'ventas'
        and coleccion in ('cotizaciones','clientes'))
  );

-- El candado de producción también consulta el rol de la cuenta de la fila.
create or replace function public.produccion_solo_estatus()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare rol text;
begin
  if new.cuenta_id is distinct from old.cuenta_id then
    raise exception 'NO_CAMBIAR_CUENTA_DOCUMENTO';
  end if;
  rol := public.rol_en(old.cuenta_id);

  if new.coleccion = 'cotizaciones' then
    if rol = 'diseno' then
      if (new.cuerpo->'cot') - 'apps' - 'op'
         is distinct from (old.cuerpo->'cot') - 'apps' - 'op' then
        raise exception 'DISENO_SOLO_ARCHIVOS';
      end if;
      if (new.cuerpo->'cot'->'op') - 'bitacora' - 'archivosCambiados'
         is distinct from (old.cuerpo->'cot'->'op') - 'bitacora' - 'archivosCambiados' then
        raise exception 'DISENO_SOLO_ARCHIVOS';
      end if;
    end if;

    if rol = 'produccion' then
      if (new.cuerpo->'cot') - 'op' - 'checklist'
         is distinct from (old.cuerpo->'cot') - 'op' - 'checklist' then
        raise exception 'PRODUCCION_SOLO_ESTATUS';
      end if;
      if (new.cuerpo->'cot'->'op') - 'estatus' - 'historial' - 'bitacora'
         is distinct from (old.cuerpo->'cot'->'op') - 'estatus' - 'historial' - 'bitacora' then
        raise exception 'PRODUCCION_SOLO_ESTATUS';
      end if;
    end if;

    if rol = 'ventas' then
      if (new.cuerpo->'cot'->'checklist') is distinct from (old.cuerpo->'cot'->'checklist')
         or (new.cuerpo->'cot'->'op'->'estatus') is distinct from (old.cuerpo->'cot'->'op'->'estatus')
         or (new.cuerpo->'cot'->'op'->'bitacora') is distinct from (old.cuerpo->'cot'->'op'->'bitacora')
         or (new.cuerpo->'cot'->'op'->'admin') is distinct from (old.cuerpo->'cot'->'op'->'admin') then
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

-- ---------- La cuenta se ve y se puede editar si hay membresía ----------
drop policy if exists cuentas_ver on public.cuentas;
create policy cuentas_ver on public.cuentas
  for select using (public.es_miembro(id));

drop policy if exists cuentas_editar on public.cuentas;
create policy cuentas_editar on public.cuentas
  for update using (public.es_miembro(id))
  with check (public.es_miembro(id));

-- Protege la edición del negocio. Sin esta versión, Imprenta podría cambiar
-- producto desde el navegador y evitar los límites de su plan.
create or replace function public.protege_suscripcion()
returns trigger language plpgsql set search_path = public as $$
begin
  -- staff_cambia_plan levanta esta bandera sólo durante su transacción.
  -- Así el Lab puede cambiar planes sin abrir esa edición al navegador.
  if coalesce(current_setting('makers.cambio_autorizado', true), '') = 'si' then
    return new;
  end if;

  if auth.role() = 'authenticated' then
    new.plan              := old.plan;
    new.estado            := old.estado;
    new.vence             := old.vence;
    new.ciclo             := old.ciclo;
    new.mp_preapproval_id := old.mp_preapproval_id;
    new.producto          := old.producto;
  end if;
  return new;
end $$;

-- perfiles y el bucket disenos conservan mi_cuenta(): son ajustes del usuario
-- y de Imprenta; los datos de Restaurant/Store no dependen de esas políticas.

-- ---------- La vista de negocios: columnas nuevas al final ----------
create or replace view public.mis_empresas
with (security_invoker = true) as
  select c.id,
         c.nombre,
         c.plan,
         c.estado,
         c.vence,
         m.rol,
         (c.id = public.mi_cuenta()) as activa,
         c.producto
    from public.membresias m
    join public.cuentas c on c.id = m.cuenta_id
   where m.usuario_id = auth.uid()
   order by m.creado;

-- Crea un negocio nuevo ligado al mismo usuario, sin mover cuenta_activa.
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

  insert into public.cuentas (nombre, producto)
    values (coalesce(nullif(trim(nombre),''), 'Mi negocio'), prod)
    returning id into nueva;
  insert into public.membresias (usuario_id, cuenta_id, rol)
    values (auth.uid(), nueva, 'admin');
  return nueva;
end $$;
revoke all on function public.crear_negocio(text,text) from public;
grant execute on function public.crear_negocio(text,text) to authenticated;

-- ---------- El plan escalonado sólo limita a Imprenta ----------
create or replace function public.limite_del_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c record; cuantos int;
  nivel int; tope_cot int; tope_cli int;
begin
  select * into c from public.cuentas where id = new.cuenta_id;

  if new.coleccion = 'soporte' then
    new.actualizado := now();
    return new;
  end if;

  nivel := case c.plan
             when 'basico' then 1
             when 'maker' then 2
             when 'pro' then 3
             when 'multiempresa' then case when c.producto in ('restaurant','tiendita') then 3 else 0 end
             when 'prueba' then 3
             else 0
           end;
  if nivel = 0 then raise exception 'SIN_PLAN'; end if;
  if c.estado <> 'activa' or c.vence < now() then
    raise exception 'SUSCRIPCION_VENCIDA';
  end if;

  -- Restaurant y Store no usan topes ni funciones por nivel de Imprenta.
  if c.producto <> 'taller' then
    new.actualizado := now();
    return new;
  end if;

  tope_cot := case nivel when 1 then 150 when 2 then 600 else 0 end;
  tope_cli := case nivel when 1 then 50 when 2 then 400 else 0 end;

  if nivel < 3 and new.coleccion in ('ventas','caja') then
    raise exception 'FUNCION_PRO';
  end if;
  if nivel < 2 and new.coleccion in ('compras','proveedores','inventario') then
    raise exception 'FUNCION_MAKER';
  end if;

  if tope_cli > 0 and new.coleccion = 'clientes' then
    select count(*) into cuantos from public.documentos
     where cuenta_id = new.cuenta_id and coleccion = 'clientes' and doc_id <> new.doc_id;
    if cuantos >= tope_cli then raise exception 'LIMITE_CLIENTES'; end if;
  end if;
  if tope_cot > 0 and new.coleccion = 'cotizaciones' then
    select count(*) into cuantos from public.documentos
     where cuenta_id = new.cuenta_id and coleccion = 'cotizaciones' and doc_id <> new.doc_id;
    if cuantos >= tope_cot then raise exception 'LIMITE_COTIZACIONES'; end if;
  end if;

  new.actualizado := now();
  return new;
end $$;

-- El portal detecta si esta migración ya quedó aplicada.
create or replace function public.nuvoor_negocios_disponible()
returns boolean language sql immutable security definer set search_path = public
as $$ select true $$;
revoke all on function public.nuvoor_negocios_disponible() from public;
grant execute on function public.nuvoor_negocios_disponible() to anon, authenticated;

-- ---------- Comprobación única para leer en el editor SQL ----------
select
  'sql/19-negocios-por-correo.sql' as comprobacion,
  to_regprocedure('public.rol_en(uuid)') is not null as rol_en,
  to_regprocedure('public.es_miembro(uuid)') is not null as es_miembro,
  to_regprocedure('public.crear_negocio(text,text)') is not null as crear_negocio,
  to_regprocedure('public.nuvoor_negocios_disponible()') is not null as disponibilidad,
  to_regprocedure('public.protege_suscripcion()') is not null as protege_suscripcion,
  coalesce(position('makers.cambio_autorizado' in pg_get_functiondef(to_regprocedure('public.protege_suscripcion()'))) > 0, false) as protege_lab,
  coalesce(position('new.producto' in pg_get_functiondef(to_regprocedure('public.protege_suscripcion()'))) > 0, false) as protege_producto,
  to_regprocedure('public.limite_del_plan()') is not null as limite_del_plan,
  has_function_privilege('anon','public.rol_en(uuid)','EXECUTE') as rol_en_anon,
  has_function_privilege('anon','public.es_miembro(uuid)','EXECUTE') as es_miembro_anon,
  exists(select 1 from information_schema.columns
          where table_schema='public' and table_name='cuentas' and column_name='producto') as cuentas_producto,
  exists(select 1 from information_schema.columns
          where table_schema='public' and table_name='mis_empresas' and column_name='producto') as mis_empresas_producto,
  (select count(*) = 2 from pg_policies
    where schemaname='public' and tablename='cuentas'
      and policyname in ('cuentas_ver','cuentas_editar')) as politicas_cuentas,
  (select count(*) = 4 from pg_policies
    where schemaname='public' and tablename='documentos'
      and policyname in ('documentos_leer','documentos_crear','documentos_actualizar','documentos_borrar')) as cuatro_politicas_documentos,
  (select array_agg(policyname order by policyname) from pg_policies
    where schemaname='public' and tablename='documentos'
      and policyname in ('documentos_leer','documentos_crear','documentos_actualizar','documentos_borrar')) as politicas_documentos,
  exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='documentos'
            and t.tgname='limita_produccion' and not t.tgisinternal) as trigger_produccion,
  exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='cuentas'
            and t.tgname='no_tocar_suscripcion' and not t.tgisinternal) as trigger_suscripcion;
