-- ============================================================
--  14 · LOS TIPS DEL TABLERO: consejos que gestiona Makers Lab
--  Correr después de 01…13. Es seguro repetirlo.
-- ============================================================
--  El tablero de cada taller enseña un "tip del día" que cambia solo. Hasta
--  ahora eran doce, escritos en el código del cotizador. Con esta tabla se
--  pueden escribir desde el Lab sin volver a publicar nada.
--
--  Tres decisiones que conviene entender:
--
--   · La tabla NO lleva cuenta_id, igual que los anuncios: un tip no es de
--     un taller, es de Hey Makers y lo lee todo el mundo.
--
--   · Un tip puede tener dueño (rol). Vacío = lo ve cualquiera; "ventas" =
--     sólo quien entra con ese rol. Así se le puede hablar a producción de
--     lo de producción sin aburrir a los demás.
--
--   · Si esta tabla no existe, el cotizador NO se rompe: trae doce tips de
--     fábrica y los usa. Por eso la política de lectura puede ser estricta
--     sin miedo a dejar un hueco en la pantalla.
-- ============================================================

create table if not exists public.tips (
  id           bigserial primary key,
  titulo       text not null,
  texto        text not null,
  rol          text not null default '',      -- '' = todos
  activo       boolean not null default true,
  orden        int not null default 0,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),
  constraint tips_rol_valido check (rol in ('', 'admin', 'ventas', 'produccion', 'diseno'))
);
create index if not exists tips_orden_idx on public.tips(activo, orden, id);

alter table public.tips enable row level security;

--  Quien tenga cuenta lee los prendidos. El staff los ve todos.
drop policy if exists tips_ver on public.tips;
create policy tips_ver on public.tips
  for select using ( public.es_staff() or activo );

--  Escribir, sólo el Lab.
drop policy if exists tips_alta on public.tips;
create policy tips_alta on public.tips
  for insert with check (public.es_staff());

drop policy if exists tips_cambio on public.tips;
create policy tips_cambio on public.tips
  for update using (public.es_staff()) with check (public.es_staff());

drop policy if exists tips_baja on public.tips;
create policy tips_baja on public.tips
  for delete using (public.es_staff());

create or replace function public.sella_tip()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.actualizado := now();
  return new;
end $$;

drop trigger if exists sella_tip on public.tips;
create trigger sella_tip before update on public.tips
  for each row execute function public.sella_tip();

comment on table public.tips is
  'El tip del día del tablero. Lo lee todo el mundo; lo escribe sólo el staff del Lab.';


-- ---------- Lo que ve Makers Lab ----------
--  Sin security_invoker a propósito, igual que v_anuncios: la vista corre
--  como su dueño y quien cuida la puerta es el "where public.es_staff()".

drop view if exists public.v_tips;

create view public.v_tips as
  select t.id, t.titulo, t.texto, t.rol, t.activo, t.orden, t.creado, t.actualizado
    from public.tips t
   where public.es_staff()
   order by t.activo desc, t.orden, t.id;

grant select on public.v_tips to authenticated;

comment on view public.v_tips is
  'Los tips con todo y los apagados. Sólo la ve el staff.';
