-- ============================================================
--  16 · A QUIÉN LE TOCA CADA ANUNCIO
--  Correr después de 12 y 15. Es seguro repetirlo.
-- ============================================================
--  Un anuncio de pestañas no tiene nada que hacer en el cotizador de una
--  imprenta, y uno de blancos al mayoreo no le sirve a una tiendita. Dos
--  listas resuelven eso:
--
--   · giros   — para qué ediciones de Makers OS: taller, restaurant, tiendita…
--   · estados — en qué estados de la república
--
--  LA LISTA VACÍA SIGNIFICA «TODOS». Es a propósito: un anuncio que nadie
--  segmentó debe verse en todas partes, que es como se comportaban los que
--  ya existían. Si vacío significara «ninguno», esta migración apagaría de
--  golpe toda la publicidad que ya está corriendo.
--
--  El filtrado final se hace en el navegador, no aquí. La base manda todos
--  los anuncios vigentes y cada taller se queda con los suyos. Es poca cosa
--  —son unos cuantos— y así no hay que mandarle al servidor en qué estado
--  está cada taller.
-- ============================================================

alter table public.anuncios
  add column if not exists giros   text[] not null default '{}',
  add column if not exists estados text[] not null default '{}';

comment on column public.anuncios.giros is
  'Ediciones a las que les toca. Vacío = todas.';
comment on column public.anuncios.estados is
  'Claves de estado (MIC, JAL, CMX…). Vacío = todo el país.';


-- ---------- La vista del Lab ----------
drop view if exists public.v_anuncios;

create view public.v_anuncios as
  select a.id, a.titulo, a.anunciante, a.imagen, a.enlace, a.alt, a.nota,
         a.activo, a.orden, a.desde, a.hasta, a.vistas, a.clics,
         a.lugar, a.interna, a.giros, a.estados,
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
  'Los anuncios con su estado, dónde salen, a quién le tocan y su % de clic. Sólo la ve el staff.';
