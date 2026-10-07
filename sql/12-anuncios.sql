-- ============================================================
--  12 · EL CARRUSEL: publicidad que gestiona sólo Makers Lab
--  Correr después de 01…11. Es seguro repetirlo.
-- ============================================================
--  Un espacio de anuncios que ven TODOS los talleres y que sólo el equipo
--  de Hey Makers puede llenar. Está pensado para venderse, así que lleva
--  dos cosas que el día que alguien pague van a hacer falta: vigencia
--  (desde / hasta) y cuenta de vistas y clics.
--
--  Dos decisiones que conviene entender antes de tocar nada:
--
--   · La tabla NO lleva cuenta_id. Es a propósito: un anuncio no es de un
--     taller, es del Lab, y lo ve todo el mundo. Es la única tabla del
--     sistema que se comporta así.
--
--   · Los contadores NO se actualizan desde el navegador. Si la política
--     dejara a cualquiera hacer update para sumar un clic, dejaría también
--     cambiarle el enlace a un anuncio ajeno. Se suman con una función
--     security definer que sólo sabe sumar de uno en uno.
-- ============================================================

create table if not exists public.anuncios (
  id           bigserial primary key,
  titulo       text not null default '',
  imagen       text not null,                 -- dirección pública de la foto
  enlace       text,                          -- a dónde lleva el clic
  alt          text,                          -- para quien no ve la imagen
  anunciante   text,                          -- quién paga (interno)
  nota         text,                          -- recordatorios del Lab (interno)
  activo       boolean not null default true,
  orden        int not null default 0,
  desde        date,                          -- vigencia; nulo = desde siempre
  hasta        date,                          -- nulo = sin fecha de salida
  vistas       bigint not null default 0,
  clics        bigint not null default 0,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create index if not exists anuncios_orden_idx on public.anuncios(activo, orden, id);

alter table public.anuncios enable row level security;

--  Quien tenga cuenta ve los que están al aire. El equipo los ve todos,
--  incluso los apagados y los que todavía no empiezan.
drop policy if exists anuncios_ver on public.anuncios;
create policy anuncios_ver on public.anuncios
  for select using (
    public.es_staff()
    or (activo
        and (desde is null or desde <= current_date)
        and (hasta is null or hasta >= current_date))
  );

--  Escribir, sólo el Lab.
drop policy if exists anuncios_alta on public.anuncios;
create policy anuncios_alta on public.anuncios
  for insert with check (public.es_staff());

drop policy if exists anuncios_cambio on public.anuncios;
create policy anuncios_cambio on public.anuncios
  for update using (public.es_staff()) with check (public.es_staff());

drop policy if exists anuncios_baja on public.anuncios;
create policy anuncios_baja on public.anuncios
  for delete using (public.es_staff());

create or replace function public.sella_anuncio()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.actualizado := now();
  return new;
end $$;

drop trigger if exists sella_anuncio on public.anuncios;
create trigger sella_anuncio before update on public.anuncios
  for each row execute function public.sella_anuncio();

comment on table public.anuncios is
  'El carrusel de publicidad. Lo ve todo el mundo; lo escribe sólo el staff del Lab.';


-- ---------- Los contadores ----------
--  Una sola función, que no sabe hacer otra cosa que sumar uno. No acepta
--  el número a sumar ni ningún otro campo, así que por aquí no se puede
--  cambiar un anuncio: es la diferencia entre contar y poder editar.

create or replace function public.anuncio_marca(p_id bigint, p_tipo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_tipo not in ('vista','clic') then
    raise exception 'Sólo se puede marcar vista o clic';
  end if;
  update public.anuncios
     set vistas = vistas + (case when p_tipo = 'vista' then 1 else 0 end),
         clics  = clics  + (case when p_tipo = 'clic'  then 1 else 0 end)
   where id = p_id
     and activo
     and (desde is null or desde <= current_date)
     and (hasta is null or hasta >= current_date);
end $$;

revoke all on function public.anuncio_marca(bigint, text) from public;
grant execute on function public.anuncio_marca(bigint, text) to authenticated;

comment on function public.anuncio_marca is
  'Suma una vista o un clic. Es lo único que el navegador puede hacerle a un anuncio.';


-- ---------- Las fotos ----------
--  Bucket público: la imagen de un anuncio se enseña a todo el que entra,
--  así que no tiene caso firmar direcciones. Subir y borrar, sólo el staff.

insert into storage.buckets (id, name, public)
  values ('anuncios', 'anuncios', true)
  on conflict (id) do nothing;

drop policy if exists anuncios_foto_leer on storage.objects;
create policy anuncios_foto_leer on storage.objects for select
  using (bucket_id = 'anuncios');

drop policy if exists anuncios_foto_subir on storage.objects;
create policy anuncios_foto_subir on storage.objects for insert
  with check (bucket_id = 'anuncios' and public.es_staff());

drop policy if exists anuncios_foto_cambiar on storage.objects;
create policy anuncios_foto_cambiar on storage.objects for update
  using (bucket_id = 'anuncios' and public.es_staff());

drop policy if exists anuncios_foto_borrar on storage.objects;
create policy anuncios_foto_borrar on storage.objects for delete
  using (bucket_id = 'anuncios' and public.es_staff());


-- ---------- Lo que ve Makers Lab ----------
--  Sin security_invoker a propósito: la vista corre como su dueño y quien
--  cuida la puerta es el "where public.es_staff()" de abajo. Con invoker,
--  cada quien la leería con sus propios permisos y no vería nada.

drop view if exists public.v_anuncios;

create view public.v_anuncios as
  select a.id, a.titulo, a.anunciante, a.imagen, a.enlace, a.alt, a.nota,
         a.activo, a.orden, a.desde, a.hasta, a.vistas, a.clics,
         case
           when not a.activo then 'apagado'
           when a.desde is not null and a.desde > current_date then 'programado'
           when a.hasta is not null and a.hasta < current_date then 'vencido'
           else 'al aire'
         end as estado,
         case when a.vistas > 0
              then round(a.clics::numeric / a.vistas * 100, 2)
              else 0 end as pct_clic,
         a.creado, a.actualizado
    from public.anuncios a
   where public.es_staff()
   order by a.activo desc, a.orden, a.id;

grant select on public.v_anuncios to authenticated;

comment on view public.v_anuncios is
  'Los anuncios con su estado y su porcentaje de clic. Sólo la ve el staff.';
