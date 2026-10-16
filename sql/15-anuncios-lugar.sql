-- ============================================================
--  15 · DÓNDE SALE CADA ANUNCIO, Y CUÁL ES DE CASA
--  Correr después de 12-anuncios.sql. Es seguro repetirlo.
-- ============================================================
--  Hasta ahora todos los anuncios salían en un solo lugar: el pie de la
--  pantalla de cotizar. Ahora hay un segundo espacio —la pantalla bloqueada,
--  que se queda prendida mientras nadie trabaja— y conviene poder venderlos
--  por separado: no vale lo mismo un anuncio que se ve de reojo mientras se
--  cotiza que uno que se queda a la vista media hora.
--
--  También se separa la publicidad propia de la vendida. Las dos se escriben
--  igual; la diferencia es de relleno: un anuncio de casa sólo sale cuando
--  ese espacio no tiene nada vendido. Así nunca se le quita lugar a quien
--  pagó, y el hueco no se queda vacío.
-- ============================================================

alter table public.anuncios
  add column if not exists lugar   text    not null default 'cotizador',
  add column if not exists interna boolean not null default false;

alter table public.anuncios drop constraint if exists anuncios_lugar_valido;
alter table public.anuncios add constraint anuncios_lugar_valido
  check (lugar in ('cotizador', 'bloqueo', 'ambos'));

create index if not exists anuncios_lugar_idx on public.anuncios(activo, lugar, orden, id);

comment on column public.anuncios.lugar is
  'cotizador = pie de la pantalla de cotizar · bloqueo = pantalla bloqueada · ambos';
comment on column public.anuncios.interna is
  'Publicidad de casa: sólo sale cuando ese espacio no tiene nada vendido.';


-- ---------- La vista del Lab, con los dos campos nuevos ----------
--  Sin security_invoker a propósito, igual que antes: la vista corre como su
--  dueño y quien cuida la puerta es el "where public.es_staff()".

drop view if exists public.v_anuncios;

create view public.v_anuncios as
  select a.id, a.titulo, a.anunciante, a.imagen, a.enlace, a.alt, a.nota,
         a.activo, a.orden, a.desde, a.hasta, a.vistas, a.clics,
         a.lugar, a.interna,
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
  'Los anuncios con su estado, dónde salen y su porcentaje de clic. Sólo la ve el staff.';
