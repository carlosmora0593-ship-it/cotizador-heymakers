-- ============================================================
--  22 · Planes de Stripe en pagos por transferencia
--  Correr después de sql/18-stripe.sql. Se puede repetir.
--  Reemplaza únicamente aplica_pago y agrega un marcador de revisión.
-- ============================================================

create or replace function public.aplica_pago(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  p public.pagos_pendientes%rowtype;
  v timestamptz;
  plan_interno text;
begin
  if not public.es_staff() then
    raise exception 'Sólo el staff del Lab puede aplicar un pago';
  end if;

  select * into p from public.pagos_pendientes where id = p_id and estado = 'esperando' for update;
  if not found then
    raise exception 'Ese pago no existe o ya se había aplicado';
  end if;

  plan_interno := case p.plan
    when 'imprenta_basico' then 'basico'
    when 'imprenta_maker' then 'maker'
    when 'imprenta_pro' then 'pro'
    when 'restaurant_estandar' then 'basico'
    when 'restaurant_multi' then 'maker'
    when 'store_estandar' then 'basico'
    when 'store_multi' then 'maker'
    when 'taller_basico' then 'basico'
    when 'taller_maker' then 'maker'
    when 'taller_pro' then 'pro'
    when 'rest_normal' then 'basico'
    when 'rest_multi' then 'maker'
    when 'tienda_normal' then 'basico'
    when 'tienda_multi' then 'maker'
    else null
  end;
  if plan_interno is null then
    raise exception 'El plan de esta transferencia no se reconoce';
  end if;

  -- Si todavía le queda tiempo, se le suma; si ya venció, cuenta desde hoy.
  select greatest(coalesce(vence, now()), now()) into v
    from public.cuentas where id = p.cuenta_id for update;
  v := v + (case when p.ciclo = 'anual' then interval '1 year' else interval '1 month' end) + interval '1 day';

  update public.cuentas
     set plan = plan_interno,
         estado = 'activa',
         ciclo = p.ciclo,
         vence = v,
         forma_pago = p.forma,
         cobro_fallido = null
   where id = p.cuenta_id;

  update public.pagos_pendientes
     set estado = 'pagado', aplicado = now(), aplicado_por = auth.uid()
   where id = p_id;
end $$;

create or replace function public.nuvoor_stripe_planes_disponible()
returns boolean
language sql stable security definer set search_path = public
as $$ select true $$;

revoke all on function public.nuvoor_stripe_planes_disponible() from public;
grant execute on function public.nuvoor_stripe_planes_disponible() to authenticated;

comment on function public.aplica_pago is
  'Marca pagada una transferencia y extiende la cuenta asignando el plan interno de Nuvoor. Sólo el staff del Lab.';
