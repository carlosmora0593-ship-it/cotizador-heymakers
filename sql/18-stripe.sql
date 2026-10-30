-- ============================================================
--  18 · Cobro con Stripe
--  Pégalo completo en Supabase → SQL Editor → Run.
--  Se puede repetir sin romper nada.
-- ============================================================

-- ---------- 1. Lo que la cuenta necesita recordar ----------
alter table public.cuentas add column if not exists stripe_cliente     text;
alter table public.cuentas add column if not exists stripe_suscripcion text;
alter table public.cuentas add column if not exists forma_pago         text;
alter table public.cuentas add column if not exists cobro_fallido      timestamptz;

comment on column public.cuentas.stripe_cliente is
  'El cliente en Stripe. Se crea una sola vez: la tarjeta que registre hoy sigue sirviendo el año que entra.';
comment on column public.cuentas.forma_pago is
  'tarjeta | oxxo | transferencia. Sólo "tarjeta" se cobra solo.';
comment on column public.cuentas.cobro_fallido is
  'Cuándo rebotó el último cobro. Se borra en cuanto entra uno bueno. NO vence la cuenta: de eso se encarga Stripe con sus reintentos.';

-- El cliente de Stripe es único: dos cuentas no pueden compartirlo.
create unique index if not exists cuentas_stripe_cliente_unico
  on public.cuentas (stripe_cliente) where stripe_cliente is not null;

-- ---------- 2. Los pagos que se esperan por transferencia ----------
--  Un pago anual de miles de pesos por transferencia se ahorra la comisión
--  completa. A cambio, alguien de Makers lo marca a mano cuando entra.
create table if not exists public.pagos_pendientes (
  id          bigserial primary key,
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  plan        text not null,
  ciclo       text not null default 'anual',
  monto       numeric(12,2) not null,
  referencia  text not null,
  forma       text not null default 'transferencia',
  estado      text not null default 'esperando',   -- esperando | pagado | cancelado
  nota        text,
  pedido      timestamptz not null default now(),
  aplicado    timestamptz,
  aplicado_por uuid references auth.users(id)
);
comment on table public.pagos_pendientes is
  'Transferencias que el cliente dijo que iba a hacer. El Lab las marca pagadas y eso extiende la cuenta.';

create index if not exists pagos_pendientes_cuenta on public.pagos_pendientes (cuenta_id);
create index if not exists pagos_pendientes_estado on public.pagos_pendientes (estado) where estado = 'esperando';

alter table public.pagos_pendientes enable row level security;

-- El staff del Lab los ve todos y los mueve.
drop policy if exists pagos_staff on public.pagos_pendientes;
create policy pagos_staff on public.pagos_pendientes
  for all using (public.es_staff()) with check (public.es_staff());

-- El dueño de la cuenta ve los suyos, nada más para leerlos.
drop policy if exists pagos_mios on public.pagos_pendientes;
create policy pagos_mios on public.pagos_pendientes
  for select using (
    exists (select 1 from public.membresias m
             where m.cuenta_id = pagos_pendientes.cuenta_id
               and m.usuario_id = auth.uid())
  );

-- ---------- 3. Aplicar una transferencia ----------
--  Una sola función, que no sabe hacer otra cosa que extender la cuenta del
--  pago que se le señale. No acepta la fecha ni el monto: los saca del pago.
--  Así, por aquí no se puede regalar un año.
create or replace function public.aplica_pago(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  p  public.pagos_pendientes%rowtype;
  v  timestamptz;
begin
  if not public.es_staff() then
    raise exception 'Sólo el staff del Lab puede aplicar un pago';
  end if;

  select * into p from public.pagos_pendientes where id = p_id and estado = 'esperando';
  if not found then
    raise exception 'Ese pago no existe o ya se había aplicado';
  end if;

  -- Si todavía le queda tiempo, se le SUMA; si ya venció, cuenta desde hoy.
  select greatest(coalesce(vence, now()), now()) into v from public.cuentas where id = p.cuenta_id;
  v := v + (case when p.ciclo = 'anual' then interval '1 year' else interval '1 month' end) + interval '1 day';

  update public.cuentas
     set estado = 'activa',
         ciclo  = p.ciclo,
         vence  = v,
         forma_pago = p.forma,
         cobro_fallido = null
   where id = p.cuenta_id;

  update public.pagos_pendientes
     set estado = 'pagado', aplicado = now(), aplicado_por = auth.uid()
   where id = p_id;
end $$;

revoke all on function public.aplica_pago(bigint) from public;
grant execute on function public.aplica_pago(bigint) to authenticated;

comment on function public.aplica_pago is
  'Marca pagada una transferencia y extiende la cuenta. Sólo el staff del Lab.';
