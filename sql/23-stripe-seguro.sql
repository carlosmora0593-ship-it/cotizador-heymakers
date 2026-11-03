-- 23 · Entregas de Stripe e intentos de cobro seguros.
-- Después de 18-stripe.sql y 22-stripe-planes.sql. Repetible.
-- Sólo tablas y funciones de cobro; no cambia Auth, staff ni mi_cuenta().
begin;
alter table public.cuentas add column if not exists pago_previo boolean not null default false;
update public.cuentas c set pago_previo = true
 where not pago_previo and (plan in ('basico','maker','pro') or stripe_suscripcion is not null
 or exists (select 1 from public.pagos_pendientes p where p.cuenta_id=c.id and p.estado='pagado'));

-- Ninguna de estas tablas se expone al navegador.
create table if not exists public.stripe_control (
 cuenta_id uuid primary key references public.cuentas(id) on delete cascade,
 token uuid, hasta timestamptz,
 intento jsonb
);
create table if not exists public.stripe_entregas (
 evento text primary key,
 cuenta_id uuid not null references public.cuentas(id) on delete cascade,
 sesion text unique,
 aplicado timestamptz not null default now()
);
alter table public.stripe_control enable row level security;
alter table public.stripe_entregas enable row level security;
revoke all on public.stripe_control, public.stripe_entregas from public, anon, authenticated;
grant select on public.stripe_control, public.stripe_entregas to service_role;

-- Un solo trabajador por negocio, incluso entre instancias Edge distintas.
-- No se mantiene una transacción SQL abierta mientras se consulta Stripe.
create or replace function public.stripe_toma(p_cuenta uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into public.stripe_control(cuenta_id,token,hasta)
 values(p_cuenta,p_token,clock_timestamp()+interval '2 minutes')
 on conflict(cuenta_id) do update set token=excluded.token,hasta=excluded.hasta
 where stripe_control.hasta is null or stripe_control.hasta < clock_timestamp();
 return found;
end $$;

create or replace function public.stripe_suelta(p_cuenta uuid,p_token uuid)
returns void language sql security definer set search_path=public as $$
 update public.stripe_control set token=null,hasta=null where cuenta_id=p_cuenta and token=p_token
$$;

-- Persiste el cuerpo exacto de Checkout ANTES de enviarlo a Stripe.
-- Así un fallo de red puede reintentar con la misma Idempotency-Key.
create or replace function public.stripe_intento(p_cuenta uuid,p_token uuid,p_intento jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.stripe_control set intento=p_intento,hasta=clock_timestamp()+interval '2 minutes'
 where cuenta_id=p_cuenta and token=p_token and hasta>clock_timestamp();
 if not found then raise exception 'La operación de cobro perdió su turno'; end if;
end $$;

-- Registrar el evento y modificar la licencia es UNA transacción.
-- La unicidad de sesion cubre eventos distintos sobre un mismo pago OXXO.
create or replace function public.stripe_aplica(
 p_cuenta uuid,p_token uuid,p_evento text,p_sesion text,p_cambios jsonb,p_sumar text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare c public.cuentas%rowtype; v timestamptz;
begin
 perform 1 from public.stripe_control where cuenta_id=p_cuenta and token=p_token
 and hasta>clock_timestamp() for update;
 if not found then raise exception 'La operación de cobro perdió su turno'; end if;
 if p_evento is null or p_evento='' then raise exception 'Falta el evento'; end if;
 select * into strict c from public.cuentas where id=p_cuenta for update;
 insert into public.stripe_entregas(evento,cuenta_id,sesion)
 values(p_evento,p_cuenta,p_sesion) on conflict do nothing;
 if not found then return false; end if;
 if p_sumar is not null then
   if p_sumar not in ('mensual','anual') or p_sesion is null then raise exception 'Periodo inválido'; end if;
   v := greatest(coalesce(c.vence,now()),now())
      + case when p_sumar='anual' then interval '1 year' else interval '1 month' end + interval '1 day';
 end if;
 update public.cuentas set
   plan=coalesce(p_cambios->>'plan',plan),
   ciclo=coalesce(p_cambios->>'ciclo',ciclo),
   estado=coalesce(p_cambios->>'estado',estado),
   forma_pago=coalesce(p_cambios->>'forma_pago',forma_pago),
   stripe_suscripcion=coalesce(p_cambios->>'stripe_suscripcion',stripe_suscripcion),
   vence=coalesce(v,(p_cambios->>'vence')::timestamptz,vence),
   cobro_fallido=case when p_cambios ? 'cobro_fallido' then (p_cambios->>'cobro_fallido')::timestamptz else cobro_fallido end,
   pago_previo=pago_previo or coalesce((p_cambios->>'pago_previo')::boolean,false)
 where id=p_cuenta;
 return true;
end $$;

revoke all on function public.stripe_toma(uuid,uuid) from public,anon,authenticated;
revoke all on function public.stripe_suelta(uuid,uuid) from public,anon,authenticated;
revoke all on function public.stripe_intento(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.stripe_aplica(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.stripe_toma(uuid,uuid),public.stripe_suelta(uuid,uuid),
 public.stripe_intento(uuid,uuid,jsonb),public.stripe_aplica(uuid,uuid,text,text,jsonb,text) to service_role;

-- El navegador pregunta por ESE pago, no sólo por una licencia que ya estaba activa.
create or replace function public.stripe_confirmado(p_cuenta uuid,p_sesion text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.stripe_entregas e where e.cuenta_id=p_cuenta and e.sesion=p_sesion
 and exists(select 1 from public.membresias m where m.cuenta_id=e.cuenta_id and m.usuario_id=auth.uid()))
$$;
revoke all on function public.stripe_confirmado(uuid,text) from public,anon;
grant execute on function public.stripe_confirmado(uuid,text) to authenticated;

-- Marcar también las transferencias posteriores sin recrear aplica_pago.
create or replace function public.stripe_pago_transferencia()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.estado='pagado' then
   update public.cuentas set pago_previo=true where id=new.cuenta_id;
 end if;
 return new;
end $$;
revoke all on function public.stripe_pago_transferencia() from public,anon,authenticated;
drop trigger if exists stripe_transferencia_pagada on public.pagos_pendientes;
create trigger stripe_transferencia_pagada after insert or update of estado on public.pagos_pendientes
for each row execute function public.stripe_pago_transferencia();
commit;
