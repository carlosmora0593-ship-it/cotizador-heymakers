-- ============================================================
--  11 · EL DIAGNÓSTICO: qué necesita cada taller
--  Correr después de 01…10. Es seguro repetirlo.
-- ============================================================
--  Seis preguntas antes de elegir plan. Sirven para dos cosas a la vez,
--  y conviene no perder de vista ninguna:
--
--   · Para el taller: que no tenga que adivinar cuál plan le toca.
--   · Para Hey Makers: saber qué pide la gente que llega. Después de
--     cincuenta respuestas, "casi nadie lleva inventario" o "la mitad
--     cotiza en Excel" dejan de ser corazonadas y pasan a ser datos.
--
--  Va en su propia tabla y no en 'documentos' a propósito: quien contesta
--  esto TODAVÍA NO TIENE PLAN, y documentos ya no deja escribir sin plan.
--  Meterlo ahí obligaría a abrirle un hueco al candado que acabamos de
--  cerrar. Una tabla aparte, con su propia regla, no le debe nada a la otra.
-- ============================================================

create table if not exists public.diagnosticos (
  id          bigserial primary key,
  cuenta_id   uuid references public.cuentas(id) on delete set null,
  usuario_id  uuid references auth.users(id) on delete set null,
  correo      text,
  respuestas  jsonb not null default '{}'::jsonb,
  recomendado text,            -- el plan que le sugerimos
  eligio      text,            -- el que de verdad acabó contratando
  creado      timestamptz not null default now()
);
create index if not exists diag_creado_idx on public.diagnosticos(creado desc);
create index if not exists diag_cuenta_idx on public.diagnosticos(cuenta_id);

alter table public.diagnosticos enable row level security;

--  Cada quien escribe el suyo y ve el suyo. El equipo los ve todos.
drop policy if exists diag_mio on public.diagnosticos;
create policy diag_mio on public.diagnosticos
  for select using (usuario_id = auth.uid() or public.es_staff());

drop policy if exists diag_escribo on public.diagnosticos;
create policy diag_escribo on public.diagnosticos
  for insert with check (usuario_id = auth.uid());

--  Que nadie se adjudique el diagnóstico de otro ni invente el correo:
--  esos tres campos los pone la base, no el navegador.
create or replace function public.sella_diagnostico()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.usuario_id := auth.uid();
  new.cuenta_id  := public.mi_cuenta();
  select email into new.correo from auth.users where id = auth.uid();
  new.creado := now();
  return new;
end $$;

drop trigger if exists sella_diagnostico on public.diagnosticos;
create trigger sella_diagnostico before insert on public.diagnosticos
  for each row execute function public.sella_diagnostico();

comment on table public.diagnosticos is
  'Las seis preguntas que contesta quien llega sin código, y el plan que le recomendamos.';


-- ---------- Lo que ve Makers Lab ----------
--  Plano y listo para contar. Cada respuesta en su columna, para no andar
--  escarbando el jsonb cada vez que se quiera un total.

drop view if exists public.v_diagnosticos;

create view public.v_diagnosticos as
select
  d.id,
  d.creado,
  d.correo,
  d.cuenta_id,
  c.nombre                                     as taller,
  d.recomendado,
  d.eligio,
  (d.eligio is not null)                       as contrato,
  (d.eligio is not null and d.eligio = d.recomendado) as hizo_caso,
  d.respuestas->>'gente'                       as gente,
  d.respuestas->>'cotiza'                      as cotizaciones_mes,
  d.respuestas->>'como'                        as como_cotiza_hoy,
  d.respuestas->>'donde'                       as de_donde_llego,
  d.respuestas->'hace'                         as que_hace,
  d.respuestas->'necesita'                     as que_necesita,
  c.plan                                       as plan_actual
from public.diagnosticos d
left join public.cuentas c on c.id = d.cuenta_id
where public.es_staff()
order by d.creado desc;


-- ---------- Los totales, ya sumados ----------
--  La pregunta que de verdad importa: de los que contestan, ¿cuántos
--  acaban pagando, y les atinamos el plan?

create or replace view public.v_diagnostico_resumen as
select
  count(*)                                                    as contestaron,
  count(*) filter (where eligio is not null)                  as contrataron,
  round(100.0 * count(*) filter (where eligio is not null)
        / nullif(count(*), 0), 1)                             as por_ciento_contrata,
  count(*) filter (where eligio = recomendado)                as siguieron_la_sugerencia,
  count(*) filter (where recomendado = 'basico')              as les_toco_basico,
  count(*) filter (where recomendado = 'maker')               as les_toco_maker,
  count(*) filter (where recomendado = 'pro')                 as les_toco_pro
from public.diagnosticos
where public.es_staff();


-- ---------- Comprobación ----------
select 'Tabla de diagnósticos' as que, count(*)::text as respuesta from public.diagnosticos
union all
select 'La vista responde', case when exists (
  select 1 from information_schema.views where table_schema='public' and table_name='v_diagnosticos')
  then 'sí' else 'no' end;
