-- ============================================================
--  08 · QUE MAKERS LAB PUEDA MANDAR
--  Correr después de 01…07. Es seguro repetirlo.
-- ============================================================
--  Hasta aquí, Makers Lab solo miraba. Los botones de plan y vigencia
--  estaban en pantalla pero no llegaban a la base: el disparador que
--  protege la suscripción frena a cualquiera que entre por el navegador,
--  y eso incluye a tu propio tablero.
--
--  Esta es la puerta para que tu equipo sí mande, con dos condiciones que
--  no se pueden saltar:
--    · Solo quien está en la tabla staff.
--    · Cada cambio queda escrito con quién lo hizo y cuándo.
--
--  Sigue sin poder tocar las cotizaciones, los clientes ni los precios de
--  ningún taller: eso no cambia y no tiene por qué cambiar.
-- ============================================================


-- ---------- 1. La bitácora ----------
--  Sin esto, "¿quién le regaló tres meses a esta cuenta?" no tiene
--  respuesta. Con esto la tiene siempre.

create table if not exists public.lab_bitacora (
  id        bigserial primary key,
  cuenta_id uuid references public.cuentas(id) on delete cascade,
  quien     uuid references auth.users(id),
  correo    text,
  que       text not null,
  antes     jsonb,
  despues   jsonb,
  cuando    timestamptz not null default now()
);
create index if not exists lab_bitacora_cuenta_idx on public.lab_bitacora(cuenta_id, cuando desc);
alter table public.lab_bitacora enable row level security;

drop policy if exists bitacora_staff on public.lab_bitacora;
create policy bitacora_staff on public.lab_bitacora
  for select using (public.es_staff());

comment on table public.lab_bitacora is
  'Qué cambió tu equipo en la suscripción de cada cuenta, y quién. Solo se lee; la escriben las funciones.';


-- ---------- 2. Cambiar el plan de una cuenta ----------
--  Un solo camino para todo: cambiar de plan, alargar la vigencia,
--  pausar, reactivar o dar de baja. Pasar por una sola puerta es lo que
--  permite que TODO quede en la bitácora sin depender de que alguien se
--  acuerde de anotarlo.

create or replace function public.staff_cambia_plan(
  p_cuenta    uuid,
  p_plan      text default null,     -- null = no lo toques
  p_vence     timestamptz default null,
  p_estado    text default null,
  p_ciclo     text default null,
  p_es_prueba boolean default null,
  p_motivo    text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare antes public.cuentas%rowtype; despues public.cuentas%rowtype; mi_correo text;
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Hey Makers puede cambiar un plan';
  end if;

  select * into antes from public.cuentas where id = p_cuenta;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Esa cuenta no existe.');
  end if;

  if p_plan is not null and p_plan not in ('ninguno','basico','maker','pro','prueba') then
    return jsonb_build_object('ok', false, 'motivo', 'Plan desconocido: ' || p_plan);
  end if;
  if p_estado is not null and p_estado not in ('activa','vencida','cancelada') then
    return jsonb_build_object('ok', false, 'motivo', 'Estado desconocido: ' || p_estado);
  end if;

  update public.cuentas
     set plan      = coalesce(p_plan, plan),
         vence     = coalesce(p_vence, vence),
         estado    = coalesce(p_estado, estado),
         ciclo     = coalesce(p_ciclo, ciclo),
         es_prueba = coalesce(p_es_prueba, es_prueba)
   where id = p_cuenta
   returning * into despues;

  select u.email into mi_correo from auth.users u where u.id = auth.uid();

  insert into public.lab_bitacora (cuenta_id, quien, correo, que, antes, despues)
  values (p_cuenta, auth.uid(), mi_correo,
          coalesce(p_motivo, 'Cambio de suscripción desde Makers Lab'),
          jsonb_build_object('plan', antes.plan,   'estado', antes.estado,
                             'vence', antes.vence, 'ciclo', antes.ciclo, 'es_prueba', antes.es_prueba),
          jsonb_build_object('plan', despues.plan, 'estado', despues.estado,
                             'vence', despues.vence,'ciclo', despues.ciclo,'es_prueba', despues.es_prueba));

  return jsonb_build_object('ok', true, 'plan', despues.plan, 'estado', despues.estado,
                            'vence', despues.vence);
end $$;

grant execute on function public.staff_cambia_plan(uuid, text, timestamptz, text, text, boolean, text) to authenticated;


-- ---------- 3. El disparador deja pasar a staff ----------
--  protege_suscripcion() frena al navegador, y hace bien. Pero las
--  funciones de arriba son security definer y no corren como
--  'authenticated', así que pasan sin que haya que abrirle la mano a
--  nadie más. Se deja explícito para que se lea y no se adivine.

create or replace function public.protege_suscripcion()
returns trigger language plpgsql as $$
begin
  -- Solo frenamos a quien entra por el navegador con su propia sesión.
  -- Las funciones del panel corren con otros permisos y no caen aquí.
  if auth.role() = 'authenticated' then
    new.plan   := old.plan;
    new.estado := old.estado;
    new.vence  := old.vence;
    new.ciclo  := old.ciclo;
    new.mp_preapproval_id := old.mp_preapproval_id;
  end if;
  return new;
end $$;


-- ---------- 4. Los códigos, desde el panel ----------

create or replace function public.staff_codigo_activo(p_codigo text, p_activo boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.es_staff() then raise exception 'Solo el equipo de Hey Makers'; end if;
  update public.codigos set activo = p_activo where codigo = upper(btrim(p_codigo));
  if not found then return jsonb_build_object('ok', false, 'motivo', 'Ese código no existe.'); end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.staff_codigo_activo(text, boolean) to authenticated;


-- ---------- 5. Lo que ve el panel de una cuenta ----------
--  v_cuentas se queda como está —números y nada de contenido— y le
--  sumamos lo que hace falta para administrar la suscripción.

--  Ojo: "create or replace view" solo deja cambiar lo que hay DENTRO de
--  cada columna, no agregar columnas en medio ni cambiarles el orden.
--  Como aquí sumamos es_prueba y codigo, hay que rehacerla. No se pierde
--  nada: una vista no guarda datos, solo es una forma de mirarlos.
drop view if exists public.v_cuentas;

create view public.v_cuentas as
select
  c.id,
  c.nombre                                  as taller,
  c.plan,
  c.estado,
  c.ciclo,
  c.vence,
  c.creada,
  c.es_prueba,
  c.codigo,
  (c.estado = 'activa' and c.plan <> 'ninguno' and c.vence > now()) as vigente,
  greatest(0, extract(day from (c.vence - now()))::int) as dias_restantes,
  (select count(*) from public.membresias m where m.cuenta_id = c.id)  as usuarios,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'cotizaciones')          as cotizaciones,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'ventas')                as ventas,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'clientes')              as clientes,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'compras')               as compras,
  (select max(d.actualizado) from public.documentos d
    where d.cuenta_id = c.id)                                           as ultima_actividad,
  (select count(*) from public.documentos d
    where d.cuenta_id = c.id and d.coleccion = 'soporte')               as tickets,
  (select p.correo from public.membresias m
     join public.perfiles p on p.id = m.usuario_id
    where m.cuenta_id = c.id order by m.creado limit 1)                 as correo_dueno
from public.cuentas c
where public.es_staff();


-- ---------- Comprobación ----------
select 'Eres staff' as que, case when public.es_staff() then 'sí' else 'no' end as respuesta
union all
select 'Cuentas que ves', count(*)::text from public.v_cuentas
union all
select 'Códigos', count(*)::text from public.codigos;
