-- ============================================================
--  17 · UN SOLO LAB, VARIOS PRODUCTOS
--  Correr después de 01…16. Es seguro repetirlo.
-- ============================================================
--  Makers OS deja de ser un producto para ser una plataforma con ediciones:
--
--    taller      · Taller Makers      — imprenta y serigrafía (el cotizador)
--    restaurant  · Makers Restaurant  — mesas, comandas y cobro
--    tiendita    · Tiendita Makers    — abarrotes (todavía no existe)
--
--  Una decisión que conviene entender: **no hay base aparte por producto**.
--  Cada cuenta dice de qué producto es, y los datos ya estaban separados por
--  cuenta desde el día uno (todo pasa por public.mi_cuenta()). Un restaurante
--  nunca ve lo de una imprenta porque nunca comparten cuenta — no porque
--  vivan en otro servidor.
--
--  Eso es justo lo que hace posible que un solo correo de staff vea todo
--  desde Makers Lab: es la misma base, la misma vista, una columna más.
-- ============================================================

alter table public.cuentas
  add column if not exists producto text not null default 'taller';

alter table public.cuentas drop constraint if exists cuentas_producto_valido;
alter table public.cuentas add constraint cuentas_producto_valido
  check (producto in ('taller', 'restaurant', 'tiendita'));

create index if not exists cuentas_producto_idx on public.cuentas(producto, creada desc);

comment on column public.cuentas.producto is
  'Qué edición de Makers OS usa esta cuenta. Las de antes de esta migración son taller.';


-- ---------- El alta se queda con el producto que diga el registro ----------
--  La pantalla de registro de cada producto manda su clave en los metadatos.
--  Si no manda nada —un registro viejo, o alguien entrando por otra puerta—
--  se queda en 'taller', que es lo que había.

create or replace function public.al_crear_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  nueva uuid;
  prod  text;
begin
  prod := coalesce(nullif(new.raw_user_meta_data->>'producto', ''), 'taller');
  if prod not in ('taller','restaurant','tiendita') then prod := 'taller'; end if;

  insert into public.cuentas (nombre, producto)
    values (coalesce(new.raw_user_meta_data->>'negocio', 'Mi negocio'), prod)
    returning id into nueva;
  insert into public.perfiles (id, cuenta_id, nombre, correo, rol)
    values (new.id, nueva, new.raw_user_meta_data->>'nombre', new.email, 'admin');
  return new;
end $$;


-- ---------- La vista del Lab, con el producto y lo del restaurante ----------
--  Una vista no guarda datos: rehacerla no pierde nada.

drop view if exists public.v_cuentas;

create view public.v_cuentas as
select
  c.id,
  c.nombre                                  as taller,
  c.producto,
  c.plan,
  c.estado,
  c.ciclo,
  c.vence,
  c.creada,
  c.es_prueba,
  c.codigo,
  (c.estado = 'activa' and c.plan <> 'ninguno' and c.vence > now()) as vigente,
  greatest(0, extract(day from (c.vence - now()))::int) as dias_restantes,
  (select count(*) from public.membresias m where m.cuenta_id = c.id)  as usuarios,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'cotizaciones')          as cotizaciones,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'ventas')                as ventas,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'clientes')              as clientes,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'compras')               as compras,
  --  Lo propio del restaurante: cuentas cerradas y mesas dadas de alta.
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'comandas')              as comandas,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'mesas')                 as mesas,
  (select max(d.actualizado) from public.documentos d
    where d.cuenta_id = c.id)                                           as ultima_actividad,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'soporte')               as tickets,
  (select p.correo from public.membresias m
     join public.perfiles p on p.id = m.usuario_id
    where m.cuenta_id = c.id order by m.creado limit 1)                 as correo_dueno
from public.cuentas c
where public.es_staff();


-- ---------- Comprobación ----------
select producto, count(*) as cuentas
  from public.cuentas
 group by producto
 order by producto;
