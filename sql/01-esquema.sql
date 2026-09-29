-- ============================================================
--  Cotizador Hey Makers — esquema multiusuario
--  Pégalo completo en Supabase → SQL Editor → Run
-- ============================================================

-- ---------- 1. Tablas ----------

create table if not exists public.cuentas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text        not null default 'Mi taller',
  plan              text        not null default 'prueba',   -- prueba | basico | maker | pro
  estado            text        not null default 'activa',   -- activa | vencida | cancelada
  vence             timestamptz not null default (now() + interval '15 days'),
  ciclo             text,                                    -- mensual | anual
  mp_preapproval_id text,
  creada            timestamptz not null default now()
);
comment on table public.cuentas is 'Un cliente de la suscripción. Puede tener varios usuarios si el plan lo permite.';

create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  nombre     text,
  correo     text,
  rol        text not null default 'admin',                  -- admin | ventas | diseno | produccion
  creado     timestamptz not null default now()
);
create index if not exists perfiles_cuenta_idx on public.perfiles(cuenta_id);

-- Un solo almacén de documentos: catálogo, parámetros, cotizaciones y ventas.
-- 'coleccion' hace las veces de carpeta y 'cuerpo' guarda el JSON tal cual.
create table if not exists public.documentos (
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  coleccion   text not null,                                 -- config | cotizaciones | ventas
  doc_id      text not null,                                 -- catalogo | parametros | COT-...
  cuerpo      jsonb not null default '{}'::jsonb,
  fecha       text,
  total       numeric,
  actualizado timestamptz not null default now(),
  primary key (cuenta_id, coleccion, doc_id)
);
create index if not exists documentos_orden_idx on public.documentos(cuenta_id, coleccion, fecha desc);

-- ---------- 2. Cuenta a la que pertenece quien consulta ----------

create or replace function public.mi_cuenta()
returns uuid
language sql stable security definer set search_path = public
as $$ select cuenta_id from public.perfiles where id = auth.uid() $$;

-- ---------- 3. Alta automática al registrarse ----------

create or replace function public.al_crear_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare nueva uuid;
begin
  insert into public.cuentas (nombre)
    values (coalesce(new.raw_user_meta_data->>'negocio', 'Mi taller'))
    returning id into nueva;
  -- Quien abre la cuenta es su administrador. Va explícito a propósito:
  -- si este archivo se corre después de 02-roles.sql, el dueño no se queda
  -- sin permisos.
  insert into public.perfiles (id, cuenta_id, nombre, correo, rol)
    values (new.id, nueva, new.raw_user_meta_data->>'nombre', new.email, 'admin');
  return new;
end $$;

drop trigger if exists crear_cuenta_al_registrarse on auth.users;
create trigger crear_cuenta_al_registrarse
  after insert on auth.users
  for each row execute function public.al_crear_usuario();

-- ---------- 4. Seguridad por fila ----------

alter table public.cuentas    enable row level security;
alter table public.perfiles   enable row level security;
alter table public.documentos enable row level security;

drop policy if exists cuentas_ver on public.cuentas;
create policy cuentas_ver on public.cuentas
  for select using (id = public.mi_cuenta());

-- El nombre del negocio lo puede cambiar el dueño; plan, estado y vence NO
-- (esos solo los mueve el webhook con la llave de servicio).
drop policy if exists cuentas_editar on public.cuentas;
create policy cuentas_editar on public.cuentas
  for update using (id = public.mi_cuenta()) with check (id = public.mi_cuenta());

create or replace function public.protege_suscripcion()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.plan   := old.plan;
    new.estado := old.estado;
    new.vence  := old.vence;
    new.ciclo  := old.ciclo;
    new.mp_preapproval_id := old.mp_preapproval_id;
  end if;
  return new;
end $$;

drop trigger if exists no_tocar_suscripcion on public.cuentas;
create trigger no_tocar_suscripcion
  before update on public.cuentas
  for each row execute function public.protege_suscripcion();

drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles
  for select using (cuenta_id = public.mi_cuenta());

drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists documentos_todo on public.documentos;
create policy documentos_todo on public.documentos
  for all using (cuenta_id = public.mi_cuenta())
  with check (cuenta_id = public.mi_cuenta());

-- ---------- 5. Límites por plan ----------
--  prueba  : 15 días con todo abierto, para que vea qué está comprando
--  basico  : 150 cotizaciones, 50 clientes, 1 usuario. Sin caja, ventas ni compras
--  maker   : 600 cotizaciones, 400 clientes, 3 usuarios. Con compras e inventario
--  pro     : sin límites
--  Los topes viven en una sola tabla para no repetir la regla en cinco lugares.

create or replace function public.limite_del_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c record; cuantos int;
  nivel int; tope_cot int; tope_cli int;
begin
  select * into c from public.cuentas where id = new.cuenta_id;

  if c.estado <> 'activa' or c.vence < now() then
    raise exception 'SUSCRIPCION_VENCIDA';
  end if;

  -- Los planes van en escalera: 1 Básico, 2 Maker, 3 Pro. La prueba abre todo.
  nivel := case c.plan
             when 'basico' then 1
             when 'maker'  then 2
             when 'pro'    then 3
             when 'prueba' then 3
             else 1
           end;
  tope_cot := case nivel when 1 then 150 when 2 then 600 else 0 end;   -- 0 = sin tope
  tope_cli := case nivel when 1 then  50 when 2 then 400 else 0 end;

  -- Caja y ventas son del plan Pro
  if nivel < 3 and new.coleccion in ('ventas','caja') then
    raise exception 'FUNCION_PRO';
  end if;

  -- Compras, proveedores e inventario son del plan Maker en adelante
  if nivel < 2 and new.coleccion in ('compras','proveedores','inventario') then
    raise exception 'FUNCION_MAKER';
  end if;

  if tope_cli > 0 and new.coleccion = 'clientes' then
    select count(*) into cuantos from public.documentos
      where cuenta_id = new.cuenta_id and coleccion = 'clientes' and doc_id <> new.doc_id;
    if cuantos >= tope_cli then
      raise exception 'LIMITE_CLIENTES';
    end if;
  end if;

  if tope_cot > 0 and new.coleccion = 'cotizaciones' then
    select count(*) into cuantos from public.documentos
      where cuenta_id = new.cuenta_id and coleccion = 'cotizaciones' and doc_id <> new.doc_id;
    if cuantos >= tope_cot then
      raise exception 'LIMITE_COTIZACIONES';
    end if;
  end if;

  new.actualizado := now();
  return new;
end $$;

drop trigger if exists aplica_limites on public.documentos;
create trigger aplica_limites
  before insert or update on public.documentos
  for each row execute function public.limite_del_plan();

-- ---------- 6. Almacén de diseños ----------
--  Cada archivo vive en  disenos/<cuenta_id>/<nombre>
insert into storage.buckets (id, name, public)
  values ('disenos', 'disenos', false)
  on conflict (id) do nothing;

drop policy if exists disenos_leer on storage.objects;
create policy disenos_leer on storage.objects for select
  using (bucket_id = 'disenos' and (storage.foldername(name))[1] = public.mi_cuenta()::text);

drop policy if exists disenos_subir on storage.objects;
create policy disenos_subir on storage.objects for insert
  with check (bucket_id = 'disenos' and (storage.foldername(name))[1] = public.mi_cuenta()::text);

drop policy if exists disenos_borrar on storage.objects;
create policy disenos_borrar on storage.objects for delete
  using (bucket_id = 'disenos' and (storage.foldername(name))[1] = public.mi_cuenta()::text);

-- ---------- 7. Vista rápida del estado de la cuenta ----------
create or replace view public.mi_suscripcion as
  select c.id, c.nombre, c.plan, c.estado, c.vence, c.ciclo,
         (c.estado = 'activa' and c.vence > now()) as vigente,
         greatest(0, extract(day from (c.vence - now()))::int) as dias_restantes
  from public.cuentas c
  where c.id = public.mi_cuenta();
