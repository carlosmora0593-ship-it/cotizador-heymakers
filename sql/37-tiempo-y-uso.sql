-- ============================================================
--  37 · CUÁNTO TIEMPO SE QUEDAN EN NUVOOR.MX Y CUÁNTO USAN
--       IMPRENTA, RESTAURANT Y STORE
--  Correr después de 36-altas-y-visitas.sql. Es seguro repetirlo.
--  No toca cuentas, planes, cotizaciones ni datos de ningún negocio.
-- ============================================================
--  1. nuvoor.mx: cada página manda cuántos segundos estuvo a la vista
--     (sólo con la pestaña al frente). Se suma al renglón de la visita
--     de ese día. Sigue sin guardarse nombre, correo ni IP.
--
--  2. Los sistemas: mientras alguien trabaja en Imprenta, Restaurant o
--     Store (pantalla al frente y moviéndose en los últimos minutos),
--     el sistema manda cada par de minutos los segundos de uso. Se
--     guarda por día, negocio, usuario y sistema. Sólo cuenta tiempo;
--     no guarda qué hicieron ni nada de lo que capturan.
--
--  Sólo el equipo de Nuvoor puede leer ambas cosas (Lab › Uso y visitas).
-- ============================================================

begin;

-- ---------- 1. Tiempo en nuvoor.mx ----------
alter table public.visitas_web add column if not exists segundos int not null default 0;

create or replace function public.suma_tiempo_visita(p_visitante text, p_pagina text default '/', p_segundos int default 0)
returns void
language plpgsql security definer set search_path = public
as $$
declare v text; pg text; s int; hoy date;
begin
  v  := left(regexp_replace(coalesce(p_visitante, ''), '[^A-Za-z0-9_-]', '', 'g'), 40);
  if length(v) < 8 then return; end if;
  s  := least(greatest(coalesce(p_segundos, 0), 0), 1800);   -- nunca más de 30 min por envío
  if s = 0 then return; end if;
  pg := left(coalesce(nullif(btrim(p_pagina), ''), '/'), 80);
  hoy := (now() at time zone 'America/Mexico_City')::date;
  update public.visitas_web
     set segundos = least(segundos + s, 4 * 3600), ultima = now()
   where dia = hoy and visitante = v and pagina = pg;
end $$;
revoke all on function public.suma_tiempo_visita(text, text, int) from public;
grant execute on function public.suma_tiempo_visita(text, text, int) to anon, authenticated;

-- Por día ahora también trae el tiempo (columna nueva al final).
create or replace view public.v_visitas_dia as
select dia,
       count(distinct visitante)::int as personas,
       sum(vistas)::int               as vistas,
       sum(segundos)::int             as segundos
  from public.visitas_web
 where public.es_staff()
 group by dia;
grant select on public.v_visitas_dia to authenticated;


-- ---------- 2. Tiempo de uso de los sistemas ----------
create table if not exists public.uso_apps (
  dia        date not null,
  cuenta_id  uuid not null,
  usuario_id uuid not null,
  producto   text not null check (producto in ('imprenta', 'restaurant', 'store')),
  segundos   int  not null default 0,
  envios     int  not null default 0,
  primera    timestamptz not null default now(),
  ultima     timestamptz not null default now(),
  primary key (dia, cuenta_id, usuario_id, producto)
);
create index if not exists uso_apps_dia_idx on public.uso_apps (dia);
alter table public.uso_apps enable row level security;

drop policy if exists uso_apps_staff on public.uso_apps;
create policy uso_apps_staff on public.uso_apps for select using (public.es_staff());

-- Lo llama cada sistema mientras se usa. El negocio que manda se revisa:
-- si el usuario no es miembro, se usa su negocio activo.
create or replace function public.suma_uso(p_producto text, p_segundos int, p_cuenta uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare u uuid := auth.uid(); c uuid; s int; hoy date; pr text := lower(coalesce(p_producto, ''));
begin
  if u is null then return; end if;
  if pr not in ('imprenta', 'restaurant', 'store') then return; end if;
  s := least(greatest(coalesce(p_segundos, 0), 0), 900);      -- nunca más de 15 min por envío
  if s = 0 then return; end if;
  if p_cuenta is not null and public.es_miembro(p_cuenta) then c := p_cuenta; else c := public.mi_cuenta(); end if;
  if c is null then return; end if;
  hoy := (now() at time zone 'America/Mexico_City')::date;
  insert into public.uso_apps (dia, cuenta_id, usuario_id, producto, segundos, envios)
  values (hoy, c, u, pr, s, 1)
  on conflict (dia, cuenta_id, usuario_id, producto) do update
    set segundos = least(public.uso_apps.segundos + excluded.segundos, 18 * 3600),
        envios   = public.uso_apps.envios + 1,
        ultima   = now();
end $$;
revoke all on function public.suma_uso(text, int, uuid) from public, anon;
grant execute on function public.suma_uso(text, int, uuid) to authenticated;

-- Para Lab: el uso con el nombre del negocio. Sólo el equipo.
create or replace view public.v_uso_apps as
select u.dia, u.cuenta_id, coalesce(c.nombre, 'Negocio sin nombre') as negocio,
       u.usuario_id, u.producto, u.segundos, u.envios, u.primera, u.ultima
  from public.uso_apps u
  left join public.cuentas c on c.id = u.cuenta_id
 where public.es_staff();
grant select on public.v_uso_apps to authenticated;

-- Para que Lab › Base de datos sepa que ya está puesto.
create or replace function public.nuvoor_uso_disponible()
returns boolean language sql immutable as $$ select true $$;
revoke all on function public.nuvoor_uso_disponible() from public;
grant execute on function public.nuvoor_uso_disponible() to authenticated;

notify pgrst, 'reload schema';
commit;

select (select count(*) from public.visitas_web) as visitas_guardadas,
       (select count(*) from public.uso_apps)    as registros_de_uso;
