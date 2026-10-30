-- ============================================================
--  18 · VARIOS POS EN UNA CUENTA
--  Correr después de sql/17-productos.sql. Es seguro repetirlo.
-- ============================================================

alter table public.cuentas
  add column if not exists productos text[] not null default array['taller']::text[];

-- Conserva la edición que ya tenía cada cuenta, sin perder ningún dato.
update public.cuentas
   set productos = array[producto]::text[]
 where cardinality(productos) is null
    or cardinality(productos) = 0
    or productos = array['taller']::text[] and producto <> 'taller';

alter table public.cuentas drop constraint if exists cuentas_productos_validos;
alter table public.cuentas add constraint cuentas_productos_validos
  check (
    cardinality(productos) between 1 and 3
    and productos <@ array['taller', 'restaurant', 'tiendita']::text[]
  );

create index if not exists cuentas_productos_idx
  on public.cuentas using gin(productos);

comment on column public.cuentas.productos is
  'POS habilitados para esta cuenta. La llave de servicio actualiza la lista al confirmar una suscripción.';

-- El portal usa esta respuesta para evitar que un alta pierda un producto
-- si todavía no se ha ejecutado esta migración en el proyecto de Supabase.
create or replace function public.makers_productos_multiples_disponible()
returns boolean language sql immutable security definer set search_path = public
as $$ select true $$;
revoke all on function public.makers_productos_multiples_disponible() from public;
grant execute on function public.makers_productos_multiples_disponible() to anon, authenticated;

-- En cuentas con más de un producto se mantiene producto como compatibilidad
-- con versiones anteriores; vale por el primer elemento de productos.
create or replace function public.protege_suscripcion()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.plan              := old.plan;
    new.estado            := old.estado;
    new.vence             := old.vence;
    new.ciclo             := old.ciclo;
    new.mp_preapproval_id := old.mp_preapproval_id;
    new.producto          := old.producto;
    new.productos         := old.productos;
  end if;
  return new;
end $$;

-- El alta nueva acepta una lista de POS. Los registros viejos y las otras
-- puertas de alta siguen funcionando: si no mandan productos, usa producto.
create or replace function public.al_crear_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  nueva uuid;
  lista text[];
  primero text;
begin
  if jsonb_typeof(new.raw_user_meta_data->'productos') = 'array' then
    select array_agg(distinct x.producto order by x.producto)
      into lista
      from jsonb_array_elements_text(new.raw_user_meta_data->'productos') as x(producto)
     where x.producto in ('taller', 'restaurant', 'tiendita');
  end if;

  if coalesce(cardinality(lista), 0) = 0 then
    primero := coalesce(nullif(new.raw_user_meta_data->>'producto', ''), 'taller');
    if primero not in ('taller', 'restaurant', 'tiendita') then primero := 'taller'; end if;
    lista := array[primero]::text[];
  end if;

  -- Taller conserva su catálogo y sus tres licencias independientes.
  -- La licencia Multiempresa agrupa Restaurante + Tiendita.
  if 'taller' = any(lista) and cardinality(lista) > 1 then
    lista := array['taller']::text[];
  elsif 'restaurant' = any(lista) and 'tiendita' = any(lista) then
    lista := array['restaurant', 'tiendita']::text[];
  end if;
  primero := lista[1];

  insert into public.cuentas (nombre, producto, productos)
    values (
      coalesce(new.raw_user_meta_data->>'negocio', 'Mi negocio'),
      primero,
      lista
    )
    returning id into nueva;

  insert into public.perfiles (id, cuenta_id, cuenta_activa, nombre, correo, rol)
    values (new.id, nueva, nueva, new.raw_user_meta_data->>'nombre', new.email, 'admin');

  if to_regclass('public.membresias') is not null then
    execute 'insert into public.membresias (usuario_id, cuenta_id, rol) values ($1, $2, ''admin'') on conflict do nothing'
      using new.id, nueva;
  end if;
  return new;
end $$;

-- Makers Lab sigue leyendo una sola vista; ahora también recibe la lista.
drop view if exists public.v_cuentas;
create view public.v_cuentas as
select
  c.id,
  c.nombre                                  as taller,
  c.producto,
  c.productos,
  c.plan,
  c.estado,
  c.ciclo,
  c.vence,
  c.creada,
  c.es_prueba,
  c.codigo,
  (c.estado = 'activa' and c.plan <> 'ninguno' and c.vence > now()) as vigente,
  greatest(0, extract(day from (c.vence - now()))::int) as dias_restantes,
  (select count(*) from public.membresias m where m.cuenta_id = c.id) as usuarios,
  (select count(*) from public.documentos d where d.cuenta_id = c.id and d.coleccion = 'cotizaciones') as cotizaciones,
  (select count(*) from public.documentos d where d.cuenta_id = c.id and d.coleccion = 'ventas') as ventas,
  (select count(*) from public.documentos d where d.cuenta_id = c.id and d.coleccion = 'clientes') as clientes,
  (select count(*) from public.documentos d where d.cuenta_id = c.id and d.coleccion = 'compras') as compras,
  (select count(*) from public.documentos d where d.cuenta_id = c.id and d.coleccion = 'comandas') as comandas,
  (select count(*) from public.documentos d where d.cuenta_id = c.id and d.coleccion = 'mesas') as mesas,
  (select max(d.actualizado) from public.documentos d where d.cuenta_id = c.id) as ultima_actividad,
  (select count(*) from public.documentos d where d.cuenta_id = c.id and d.coleccion = 'soporte') as tickets,
  (select p.correo from public.membresias m join public.perfiles p on p.id = m.usuario_id
    where m.cuenta_id = c.id order by m.creado limit 1) as correo_dueno
from public.cuentas c
where public.es_staff();
