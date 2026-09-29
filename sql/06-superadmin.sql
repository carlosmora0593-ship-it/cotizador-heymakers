-- ============================================================
--  06 · VARIAS EMPRESAS BAJO UN MISMO CORREO, Y TU PUERTA DE DUEÑO
--  Correr DESPUÉS de 01, 02, 03 y 04. Es seguro repetirlo.
-- ============================================================
--  Trae tres cosas:
--
--  1. Un correo puede pertenecer a varias empresas y cambiar entre ellas.
--     Cada empresa sigue completamente aparte: su catálogo, sus clientes,
--     sus precios y sus números no se mezclan nunca, ni siquiera entre dos
--     empresas tuyas.
--
--  2. Tu puerta de dueño: solo tu correo ve Makers Lab. No es una dirección
--     secreta —eso no protege nada—, es la base la que decide. Quien no esté
--     en la tabla `staff` pide lo que quiera y Postgres le contesta vacío.
--
--  3. Lo que Makers Lab puede leer: cuántas cuentas hay, en qué plan están,
--     cuándo vencen, cuánto usan y qué tickets abrieron. NUNCA las
--     cotizaciones, los clientes ni los precios de nadie. Eso no es una
--     regla de la pantalla: las vistas de aquí abajo simplemente no traen
--     esa información, así que no hay forma de pedirla.
-- ============================================================


-- ============================================================
--  PARTE 1 · UN CORREO, VARIAS EMPRESAS
-- ============================================================

-- ---------- 1.1 A qué empresas perteneces y con qué rol ----------
-- Antes el rol vivía en `perfiles`, que es de una sola empresa. Ahora vive
-- aquí, una línea por persona y por empresa: puedes ser administrador en
-- Hey Makers y solo ventas en otra, sin que una cosa arrastre a la otra.

create table if not exists public.membresias (
  usuario_id uuid not null references auth.users(id)     on delete cascade,
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  rol        text not null default 'admin'
             check (rol in ('admin','ventas','diseno','produccion')),
  creado     timestamptz not null default now(),
  primary key (usuario_id, cuenta_id)
);
create index if not exists membresias_cuenta_idx on public.membresias(cuenta_id);
alter table public.membresias enable row level security;

comment on table public.membresias is
  'Quién pertenece a qué empresa y con qué rol. Un correo puede tener varias.';


-- ---------- 1.2 En cuál estás parado ahora ----------
alter table public.perfiles add column if not exists cuenta_activa uuid
  references public.cuentas(id) on delete set null;


-- ---------- 1.3 Mudanza de lo que ya existe ----------
-- Cada perfil de hoy se convierte en su primera membresía, con el mismo rol
-- que traía. Los roles viejos que la base no reconoce ('dueno', 'miembro')
-- entran como administrador, que es lo que siempre quisieron decir.

insert into public.membresias (usuario_id, cuenta_id, rol, creado)
select p.id,
       p.cuenta_id,
       case when p.rol in ('admin','ventas','diseno','produccion') then p.rol
            else 'admin' end,
       coalesce(p.creado, now())
  from public.perfiles p
 where p.cuenta_id is not null
on conflict (usuario_id, cuenta_id) do nothing;

-- Y si nadie le ha dicho en cuál está parado, lo dejamos en la suya.
update public.perfiles
   set cuenta_activa = cuenta_id
 where cuenta_activa is null and cuenta_id is not null;


-- ---------- 1.4 Las dos preguntas que hace toda la base ----------
-- Estas dos funciones son el corazón de la separación entre empresas: todas
-- las reglas por fila cuelgan de ellas. Al cambiar de empresa cambia la
-- respuesta, y con eso cambia absolutamente todo lo que puedes ver.

create or replace function public.mi_cuenta()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    -- la que elegiste, siempre y cuando de verdad pertenezcas a ella
    (select p.cuenta_activa from public.perfiles p
       where p.id = auth.uid()
         and exists (select 1 from public.membresias m
                      where m.usuario_id = p.id and m.cuenta_id = p.cuenta_activa)),
    -- si no, la primera a la que entraste
    (select m.cuenta_id from public.membresias m
       where m.usuario_id = auth.uid() order by m.creado limit 1),
    -- y de último recurso, la de siempre
    (select p.cuenta_id from public.perfiles p where p.id = auth.uid())
  )
$$;

create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select m.rol from public.membresias m
      where m.usuario_id = auth.uid() and m.cuenta_id = public.mi_cuenta()),
    (select case when p.rol in ('admin','ventas','diseno','produccion') then p.rol
                 else 'admin' end
       from public.perfiles p where p.id = auth.uid())
  )
$$;


-- ---------- 1.5 Ver y cambiar de empresa ----------

drop policy if exists membresias_ver on public.membresias;
create policy membresias_ver on public.membresias
  for select using (
    usuario_id = auth.uid()
    or (cuenta_id = public.mi_cuenta() and public.mi_rol() = 'admin')
  );

-- Cambiar de empresa es una sola operación y la revisa la base: si no
-- perteneces a esa empresa, no hay cambio. No depende de la pantalla.
create or replace function public.cambiar_empresa(destino uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.membresias
                  where usuario_id = auth.uid() and cuenta_id = destino) then
    raise exception 'NO_ERES_DE_ESA_EMPRESA';
  end if;
  update public.perfiles set cuenta_activa = destino where id = auth.uid();
  return destino;
end $$;

-- Abrir otra empresa propia. Quien la abre es su administrador, y queda
-- con los mismos días de prueba que cualquiera.
create or replace function public.crear_empresa(nombre text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare nueva uuid;
begin
  if auth.uid() is null then raise exception 'SIN_SESION'; end if;

  insert into public.cuentas (nombre) values (coalesce(nullif(trim(nombre),''), 'Mi taller'))
    returning id into nueva;
  insert into public.membresias (usuario_id, cuenta_id, rol) values (auth.uid(), nueva, 'admin');
  update public.perfiles set cuenta_activa = nueva where id = auth.uid();
  return nueva;
end $$;

-- La lista que ve el menú de arriba.
create or replace view public.mis_empresas
with (security_invoker = true) as
  select c.id,
         c.nombre,
         c.plan,
         c.estado,
         c.vence,
         m.rol,
         (c.id = public.mi_cuenta()) as activa
    from public.membresias m
    join public.cuentas c on c.id = m.cuenta_id
   where m.usuario_id = auth.uid()
   order by m.creado;

-- El equipo de la empresa en la que estás parado.
create or replace view public.mi_equipo
with (security_invoker = true) as
  select p.id, p.nombre, p.correo, m.rol, m.creado
    from public.membresias m
    join public.perfiles p on p.id = m.usuario_id
   where m.cuenta_id = public.mi_cuenta();


-- ---------- 1.6 El alta de siempre, ahora con membresía ----------
create or replace function public.al_crear_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare nueva uuid;
begin
  insert into public.cuentas (nombre)
    values (coalesce(new.raw_user_meta_data->>'negocio', 'Mi taller'))
    returning id into nueva;
  insert into public.perfiles (id, cuenta_id, cuenta_activa, nombre, correo, rol)
    values (new.id, nueva, nueva, new.raw_user_meta_data->>'nombre', new.email, 'admin');
  insert into public.membresias (usuario_id, cuenta_id, rol)
    values (new.id, nueva, 'admin');
  return new;
end $$;


-- ============================================================
--  PARTE 2 · TU PUERTA DE DUEÑO
-- ============================================================

-- ---------- 2.1 Quién trabaja en Hey Makers ----------
-- Esta tabla ya la crea 04-soporte.sql. Va otra vez por si corres este
-- archivo solo.

create table if not exists public.staff (
  id      uuid primary key references auth.users(id) on delete cascade,
  nombre  text,
  correo  text,
  rol     text not null default 'soporte' check (rol in ('dueno','ventas','soporte')),
  alta    timestamptz not null default now()
);
alter table public.staff enable row level security;

drop policy if exists staff_ver on public.staff;
create policy staff_ver on public.staff
  for select using (id = auth.uid() or exists (select 1 from public.staff s where s.id = auth.uid()));

-- Nadie se da de alta solo: se agrega desde aquí, con la llave de servicio.

create or replace function public.es_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.staff where id = auth.uid()) $$;

create or replace function public.es_super()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.staff where id = auth.uid() and rol = 'dueno') $$;


-- ---------- 2.2 Tu correo, dado de alta solo ----------
-- Sin copiar ni pegar ningún uuid: lo busca por el correo. Si todavía no
-- has entrado nunca al sitio, este bloque no encuentra nada y te lo dice;
-- entra una vez y vuelve a correr este archivo.

do $$
declare
  v_correo text := 'carlosmora0593@gmail.com';   -- <<< tu correo de dueño
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_correo) limit 1;

  if v_id is null then
    raise notice 'Todavía no existe el usuario %. Entra una vez al sitio y vuelve a correr este archivo.', v_correo;
  else
    insert into public.staff (id, nombre, correo, rol)
      values (v_id, 'Carlos Mora', v_correo, 'dueno')
      on conflict (id) do update set rol = 'dueno', correo = excluded.correo;
    raise notice 'Listo: % quedó como dueño. Makers Lab solo le aparece a este correo.', v_correo;
  end if;
end $$;


-- ============================================================
--  PARTE 3 · LO QUE MAKERS LAB PUEDE LEER
-- ============================================================
--  Ninguna de estas vistas trae el contenido de un documento. Traen cuentas
--  y fechas: cuántas cotizaciones hizo un taller, no qué cotizó; cuánto
--  vende de suscripción, no a quién le vende él. Esa promesa está aquí,
--  en la forma de las vistas, no en un botón que se pueda quitar.
--
--  Todas empiezan con `where public.es_staff()`: para cualquier otro
--  usuario devuelven cero renglones, aunque las pida a mano.

-- ---------- 3.1 Las cuentas, una por renglón ----------
create or replace view public.v_cuentas as
select
  c.id,
  c.nombre                                  as taller,
  c.plan,
  c.estado,
  c.ciclo,
  c.vence,
  c.creada,
  (c.estado = 'activa' and c.vence > now()) as vigente,
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

comment on view public.v_cuentas is
  'Tablero de Makers Lab: cuántas cuentas, en qué plan y cuánto usan. Sin datos de sus clientes.';


-- ---------- 3.2 Movimiento mes con mes ----------
-- Para la gráfica de altas y bajas: cuándo se abrió cada cuenta y cuándo
-- dejó de pagar. Nada más que fechas.
create or replace view public.v_altas as
select
  c.id,
  c.nombre  as taller,
  c.plan,
  c.creada,
  c.vence,
  c.estado,
  date_trunc('month', c.creada)::date as mes_alta,
  case when c.estado <> 'activa' or c.vence < now()
       then date_trunc('month', c.vence)::date end as mes_baja
from public.cuentas c
where public.es_staff();


-- ---------- 3.3 Uso por mes ----------
-- Cuántos documentos se movieron en cada cuenta cada mes. Es el número que
-- dice si alguien está a punto de irse: deja de usarlo antes de cancelar.
create or replace view public.v_uso as
select
  d.cuenta_id,
  c.nombre                             as taller,
  date_trunc('month', d.actualizado)::date as mes,
  d.coleccion,
  count(*)                             as movimientos
from public.documentos d
join public.cuentas c on c.id = d.cuenta_id
where public.es_staff()
group by d.cuenta_id, c.nombre, date_trunc('month', d.actualizado), d.coleccion;


-- ---------- 3.4 Resumen de una sola mirada ----------
create or replace view public.v_resumen as
select
  count(*)                                                          as cuentas,
  count(*) filter (where estado = 'activa' and vence > now())        as activas,
  count(*) filter (where plan = 'prueba' and vence > now())          as en_prueba,
  count(*) filter (where plan = 'basico' and vence > now())          as basico,
  count(*) filter (where plan = 'maker'  and vence > now())          as maker,
  count(*) filter (where plan = 'pro'    and vence > now())          as pro,
  count(*) filter (where estado <> 'activa' or vence <= now())       as vencidas,
  count(*) filter (where vence > now() and vence < now() + interval '7 days') as vencen_esta_semana
from public.cuentas
where public.es_staff();


-- ---------- 3.5 La vista de soporte ----------
-- Los tickets sí traen su conversación: el cliente la escribió para que tú
-- la leas. Vive en 04-soporte.sql y no se toca aquí.


-- ---------- 3.6 El cuaderno de Makers Lab ----------
-- Lo de arriba son los números que la base ya sabe. Esto es lo que TÚ
-- anotas: tu equipo, tus alianzas, tus citas, con quién hablaste y qué
-- quedó pendiente. Son datos de Hey Makers, no de tus clientes, y por eso
-- viven en su propia tabla y no se mezclan con las cuentas de nadie.

create table if not exists public.lab_datos (
  coleccion   text not null,
  doc_id      text not null,
  cuerpo      jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now(),
  primary key (coleccion, doc_id)
);
alter table public.lab_datos enable row level security;

drop policy if exists lab_solo_staff on public.lab_datos;
create policy lab_solo_staff on public.lab_datos
  for all using (public.es_staff()) with check (public.es_staff());

create or replace function public.sella_lab()
returns trigger language plpgsql as $$
begin new.actualizado := now(); return new; end $$;

drop trigger if exists lab_sello on public.lab_datos;
create trigger lab_sello before insert or update on public.lab_datos
  for each row execute function public.sella_lab();

comment on table public.lab_datos is
  'El cuaderno de Hey Makers: equipo, alianzas, citas y notas comerciales. Solo lo ve staff.';


-- ============================================================
--  COMPROBACIÓN
-- ============================================================
select 'Tus empresas' as que, count(*)::text as cuantas from public.membresias
 where usuario_id = (select id from auth.users where lower(email) = lower('carlosmora0593@gmail.com'))
union all
select 'Eres dueño', case when exists (
  select 1 from public.staff s join auth.users u on u.id = s.id
   where lower(u.email) = lower('carlosmora0593@gmail.com') and s.rol = 'dueno')
  then 'sí' else 'no' end
union all
select 'Cuentas en total', count(*)::text from public.cuentas;
