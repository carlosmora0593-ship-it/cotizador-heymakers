-- ============================================================
--  09 · EL CONTADOR DE TIMBRES Y LAS FACTURAS DE SUSCRIPCIÓN
--  Correr después de 01…08. Es seguro repetirlo.
-- ============================================================
--  Esto se instala ANTES de que exista el timbrado, a propósito.
--
--  El consumo viejo no se puede reconstruir: si el mes que viene alguien
--  pregunta cuántas facturas emitió en octubre y nadie las estuvo
--  contando, la respuesta es "no sé" y no hay forma de averiguarlo. Por
--  eso el contador va primero, aunque todavía no haya nada que contar.
-- ============================================================


-- ---------- 1. Cuántos timbres incluye cada plan ----------
--  Vive en la base y no en el navegador porque de aquí sale lo que se le
--  cobra a alguien. Cambiar un número aquí cambia la factura del mes.

create table if not exists public.plan_timbres (
  plan     text primary key,
  incluye  int  not null default 0,
  sobre    numeric(10,2) not null default 2.00   -- precio del excedente, IVA incluido
);

insert into public.plan_timbres (plan, incluye, sobre) values
  ('ninguno', 0,   0.00),
  ('basico',  0,   0.00),
  ('prueba',  20,  2.00),
  ('maker',   100, 2.00),
  ('pro',     300, 2.00)
on conflict (plan) do update
  set incluye = excluded.incluye, sobre = excluded.sobre;

comment on table public.plan_timbres is
  'Cuántas facturas incluye cada plan al mes y a cómo sale la que se pasa. De aquí sale el cobro.';


-- ---------- 2. Un renglón por factura timbrada ----------
--  Se escribe desde el servidor, nunca desde el navegador: si el navegador
--  pudiera escribir aquí, cualquiera podría borrar su propio consumo.
--
--  Guarda el UUID que devuelve el SAT y el costo que TE cobró el PAC, para
--  que a fin de mes no haya que adivinar ni volver a preguntarle al PAC.

create table if not exists public.timbres (
  id          bigserial primary key,
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  periodo     date not null,                  -- siempre el día 1 del mes
  uuid_sat    text,
  serie       text,
  folio       text,
  total       numeric(12,2),                  -- lo que dice la factura emitida
  costo_pac   numeric(10,4) default 0.60,     -- lo que te costó a ti
  cancelado   boolean not null default false,
  creado      timestamptz not null default now()
);
create index if not exists timbres_cuenta_idx on public.timbres(cuenta_id, periodo);
create unique index if not exists timbres_uuid_idx on public.timbres(uuid_sat) where uuid_sat is not null;

alter table public.timbres enable row level security;

--  Cada taller ve su propio consumo: es su dinero, tiene derecho a
--  revisarlo antes de que le llegue el cobro. Y el equipo de Hey Makers ve
--  todos, porque es quien factura el excedente.
drop policy if exists timbres_mios on public.timbres;
create policy timbres_mios on public.timbres
  for select using (cuenta_id = public.mi_cuenta() or public.es_staff());

comment on table public.timbres is
  'Un renglón por factura timbrada. Lo escribe el servidor con la llave de servicio; nadie lo edita desde el navegador.';


-- ---------- 3. Lo que va del mes ----------
--  La pregunta que el cotizador le hace a la base cada vez que alguien
--  abre la pantalla de facturar: ¿cuántas llevo, cuántas me quedan, y si
--  me paso cuánto me va a costar?

create or replace function public.mis_timbres(p_periodo date default null)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with yo as (select public.mi_cuenta() as id),
  mes as (select coalesce(date_trunc('month', p_periodo)::date, date_trunc('month', now())::date) as p),
  c as (select plan from public.cuentas where id = (select id from yo)),
  t as (select * from public.plan_timbres
         where plan = coalesce((select plan from c), 'ninguno')),
  usados as (select count(*)::int as n from public.timbres
              where cuenta_id = (select id from yo)
                and periodo = (select p from mes)
                and not cancelado)
  select jsonb_build_object(
    'periodo',   (select p from mes),
    'plan',      coalesce((select plan from c), 'ninguno'),
    'incluye',   coalesce((select incluye from t), 0),
    'usados',    (select n from usados),
    'restantes', greatest(0, coalesce((select incluye from t), 0) - (select n from usados)),
    'excedente', greatest(0, (select n from usados) - coalesce((select incluye from t), 0)),
    'precio_extra', coalesce((select sobre from t), 0),
    'por_cobrar', round(greatest(0, (select n from usados) - coalesce((select incluye from t), 0))
                        * coalesce((select sobre from t), 0), 2)
  )
$$;

grant execute on function public.mis_timbres(date) to authenticated;


-- ---------- 4. Lo mismo, para todos, desde Makers Lab ----------

create or replace view public.v_timbres as
select
  c.id                                  as cuenta_id,
  c.nombre                              as taller,
  c.plan,
  date_trunc('month', now())::date      as periodo,
  coalesce(pt.incluye, 0)               as incluye,
  count(t.id) filter (where not t.cancelado
                        and t.periodo = date_trunc('month', now())::date)::int as usados,
  greatest(0, count(t.id) filter (where not t.cancelado
                        and t.periodo = date_trunc('month', now())::date)::int
              - coalesce(pt.incluye, 0))                                       as excedente,
  round(greatest(0, count(t.id) filter (where not t.cancelado
                        and t.periodo = date_trunc('month', now())::date)::int
                    - coalesce(pt.incluye, 0)) * coalesce(pt.sobre, 0), 2)     as por_cobrar,
  --  Lo que TE costó a ti este mes: la suma de lo que cobró el PAC por cada
  --  timbre, no un promedio de todos los meses.
  round(coalesce(sum(t.costo_pac) filter (where not t.cancelado
                        and t.periodo = date_trunc('month', now())::date), 0), 2) as costo_del_mes
from public.cuentas c
left join public.plan_timbres pt on pt.plan = c.plan
left join public.timbres t on t.cuenta_id = c.id
where public.es_staff()
group by c.id, c.nombre, c.plan, pt.incluye, pt.sobre;


-- ---------- 5. Las facturas que Hey Makers le emite a cada taller ----------
--  Las de la suscripción, no las de los talleres a sus clientes. Van
--  aparte porque son de otro emisor y de otro negocio.

create table if not exists public.facturas_suscripcion (
  id          bigserial primary key,
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  periodo     date not null,
  concepto    text,
  subtotal    numeric(12,2) not null default 0,
  iva         numeric(12,2) not null default 0,
  total       numeric(12,2) not null default 0,
  uuid_sat    text,
  serie       text,
  folio       text,
  pdf_url     text,
  xml_url     text,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente','timbrada','cancelada','error')),
  motivo      text,
  creada      timestamptz not null default now()
);
create index if not exists facsus_cuenta_idx on public.facturas_suscripcion(cuenta_id, periodo desc);
create unique index if not exists facsus_uuid_idx on public.facturas_suscripcion(uuid_sat) where uuid_sat is not null;

alter table public.facturas_suscripcion enable row level security;

--  El taller ve las suyas —son su comprobante de gasto— y el equipo ve todas.
drop policy if exists facsus_ver on public.facturas_suscripcion;
create policy facsus_ver on public.facturas_suscripcion
  for select using (cuenta_id = public.mi_cuenta() or public.es_staff());

comment on table public.facturas_suscripcion is
  'Las facturas que Hey Makers emite por la suscripción. Las escribe el servidor al timbrar.';


-- ---------- 6. Que el Lab se entere solo ----------

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='timbres')
  then alter publication supabase_realtime add table public.timbres; end if;
end $$;


-- ---------- Comprobación ----------
select 'Planes con timbres' as que, count(*)::text as respuesta from public.plan_timbres
union all
select 'Timbres registrados', count(*)::text from public.timbres
union all
select 'Lo que llevo este mes', coalesce(public.mis_timbres()->>'usados', 'sin cuenta')
union all
select 'Facturas de suscripción', count(*)::text from public.facturas_suscripcion;
