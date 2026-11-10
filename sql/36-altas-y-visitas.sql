-- ============================================================
--  36 · CUENTAS NUEVAS DESDE LAB Y VISITAS DE NUVOOR.MX
--  Correr después de 07-codigos.sql y 08-lab-manda.sql.
--  Es seguro repetirlo. No toca cuentas, planes, cotizaciones ni
--  datos de ningún negocio.
-- ============================================================
--  1. Un interruptor que se prende y apaga desde Lab › Códigos:
--     «Cuentas nuevas: abiertas / cerradas». Lo leen nuvoor.mx y la
--     pantalla de acceso de la app. Cerradas, sólo entra quien trae
--     un código de Lab.
--     Ojo: en Supabase, «Allow new users to sign up» se queda PRENDIDO;
--     quien decide es este interruptor. Sin código y con las cuentas
--     cerradas, la pantalla no deja crear cuenta; y aun si alguien se
--     da de alta por fuera, nace sin plan y no puede guardar nada.
--
--  2. El contador de visitas de nuvoor.mx. Cada navegador recibe un
--     número al azar (no se guarda nombre, correo ni IP) y se cuenta
--     una persona por día. Sólo el equipo de Nuvoor lo puede leer.
-- ============================================================

begin;

-- ---------- 1. Interruptores públicos ----------
create table if not exists public.ajustes_publicos (
  clave       text primary key,
  valor       jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now(),
  quien       uuid references auth.users(id)
);
alter table public.ajustes_publicos enable row level security;

-- Cualquiera puede leerlos (son públicos a propósito); nadie los escribe
-- directo: sólo con staff_altas(), que revisa que seas del equipo.
drop policy if exists ajustes_publicos_leer on public.ajustes_publicos;
create policy ajustes_publicos_leer on public.ajustes_publicos for select using (true);

insert into public.ajustes_publicos (clave, valor)
values ('altas', '{"abiertas": false}'::jsonb)
on conflict (clave) do nothing;

create or replace function public.altas_abiertas()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select (valor->>'abiertas')::boolean
                     from public.ajustes_publicos where clave = 'altas'), false)
$$;
revoke all on function public.altas_abiertas() from public;
grant execute on function public.altas_abiertas() to anon, authenticated;

create or replace function public.staff_altas(p_abiertas boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare antes jsonb; nuevo boolean := coalesce(p_abiertas, false);
begin
  if not public.es_staff() then raise exception 'Solo el equipo de Nuvoor'; end if;
  select valor into antes from public.ajustes_publicos where clave = 'altas';
  insert into public.ajustes_publicos (clave, valor, actualizado, quien)
  values ('altas', jsonb_build_object('abiertas', nuevo), now(), auth.uid())
  on conflict (clave) do update
    set valor = excluded.valor, actualizado = now(), quien = auth.uid();
  insert into public.lab_bitacora (quien, que, antes, despues)
  values (auth.uid(),
          case when nuevo then 'Abrió las cuentas nuevas' else 'Cerró las cuentas nuevas' end,
          antes, jsonb_build_object('abiertas', nuevo));
  return jsonb_build_object('ok', true, 'abiertas', nuevo);
end $$;
revoke all on function public.staff_altas(boolean) from public, anon;
grant execute on function public.staff_altas(boolean) to authenticated;


-- ---------- 2. Visitas de nuvoor.mx ----------
create table if not exists public.visitas_web (
  dia       date not null,
  visitante text not null,
  pagina    text not null default '/',
  origen    text,
  vistas    int  not null default 1,
  primera   timestamptz not null default now(),
  ultima    timestamptz not null default now(),
  primary key (dia, visitante, pagina)
);
alter table public.visitas_web enable row level security;

drop policy if exists visitas_staff on public.visitas_web;
create policy visitas_staff on public.visitas_web for select using (public.es_staff());

-- La página llama a esto al abrirse. Recorta todo lo que llega y no
-- acepta cualquier cosa como visitante.
create or replace function public.cuenta_visita(p_visitante text, p_pagina text default '/', p_origen text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v text; pg text; og text; hoy date;
begin
  v  := left(regexp_replace(coalesce(p_visitante, ''), '[^A-Za-z0-9_-]', '', 'g'), 40);
  if length(v) < 8 then return; end if;
  pg := left(coalesce(nullif(btrim(p_pagina), ''), '/'), 80);
  og := left(nullif(btrim(coalesce(p_origen, '')), ''), 80);
  hoy := (now() at time zone 'America/Mexico_City')::date;
  insert into public.visitas_web (dia, visitante, pagina, origen)
  values (hoy, v, pg, og)
  on conflict (dia, visitante, pagina) do update
    set vistas = least(public.visitas_web.vistas + 1, 500), ultima = now();
end $$;
revoke all on function public.cuenta_visita(text, text, text) from public;
grant execute on function public.cuenta_visita(text, text, text) to anon, authenticated;

-- Personas distintas y páginas vistas por día. Sólo el equipo.
create or replace view public.v_visitas_dia as
select dia,
       count(distinct visitante)::int as personas,
       sum(vistas)::int               as vistas
  from public.visitas_web
 where public.es_staff()
 group by dia;
grant select on public.v_visitas_dia to authenticated;

-- De dónde llegan (últimos 30 días): google.com, facebook.com, directo…
create or replace view public.v_visitas_origen as
select coalesce(origen, 'directo') as origen,
       count(distinct visitante)::int as personas
  from public.visitas_web
 where public.es_staff()
   and dia >= (now() at time zone 'America/Mexico_City')::date - 29
 group by 1;
grant select on public.v_visitas_origen to authenticated;

-- Para que Lab › Base de datos sepa que ya está puesto.
create or replace function public.nuvoor_altas_disponible()
returns boolean language sql immutable as $$ select true $$;
revoke all on function public.nuvoor_altas_disponible() from public;
grant execute on function public.nuvoor_altas_disponible() to authenticated;

notify pgrst, 'reload schema';
commit;

select public.altas_abiertas() as cuentas_nuevas_abiertas,
       (select count(*) from public.visitas_web) as visitas_guardadas;
