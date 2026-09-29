-- ============================================================
--  07 · CÓDIGOS DE CURSO
--  Correr después de 01…06. Es seguro repetirlo.
-- ============================================================
--  Cambia quién tiene derecho a probar gratis.
--
--  Hasta hoy, cualquiera que se registrara obtenía una prueba con todo
--  abierto. Eso tiene un agujero: basta con abrir otro correo para volver
--  a empezar, y así para siempre. Quien paga termina siendo el único que
--  no encontró el truco.
--
--  De aquí en adelante:
--    · Con código de curso  → prueba del plan Maker, 15 días.
--    · Sin código           → la cuenta se crea, pero sin plan: puede
--                             entrar y mirar, y para guardar su trabajo
--                             tiene que contratar.
--
--  El código lo generas tú por curso, decides cuántos alumnos pueden
--  usarlo y hasta cuándo sirve.
-- ============================================================


-- ---------- 1. Qué plan trae cada cuenta ----------
--  'ninguno' es un estado nuevo y necesario: una cuenta que existe, que
--  puede entrar, pero que todavía no compró nada. Antes no existía esa
--  posibilidad y por eso todos entraban de prueba.

alter table public.cuentas add column if not exists es_prueba boolean not null default false;
alter table public.cuentas add column if not exists codigo    text;

comment on column public.cuentas.es_prueba is
  'true = el plan que tiene es de cortesía y se acaba. Sirve para no confundir una prueba de Maker con un Maker pagado.';
comment on column public.cuentas.codigo is
  'Con qué código de curso entró, si entró con uno. Para saber qué curso trae mejores clientes.';

-- Las cuentas que ya existen y están en prueba quedan marcadas como tales.
update public.cuentas set es_prueba = true where plan = 'prueba' and es_prueba = false;


-- ---------- 2. Los códigos ----------

create table if not exists public.codigos (
  codigo    text primary key,
  curso     text,                                    -- "Serigrafía octubre 2026"
  plan      text not null default 'maker' check (plan in ('basico','maker','pro')),
  dias      int  not null default 15 check (dias between 1 and 365),
  usos_max  int  not null default 0,                 -- 0 = sin tope
  usos      int  not null default 0,
  vence     timestamptz,                             -- hasta cuándo sirve el código
  activo    boolean not null default true,
  nota      text,
  creado    timestamptz not null default now()
);
alter table public.codigos enable row level security;

comment on table public.codigos is
  'Los códigos que repartes en tus cursos. Nadie puede leer esta tabla desde fuera: se consulta por función.';

-- Solo tu equipo ve y crea códigos. Un alumno NUNCA puede leer esta tabla,
-- ni para adivinar códigos ni para ver cuántos usos le quedan a uno.
drop policy if exists codigos_staff on public.codigos;
create policy codigos_staff on public.codigos
  for all using (public.es_staff()) with check (public.es_staff());


-- ---------- 3. Revisar un código, sin enseñar la tabla ----------
--  La pantalla de registro llama a esto ANTES de crear la cuenta, para no
--  dejar a nadie con un correo dado de alta y un código que no servía.
--  Contesta solo lo necesario: si sirve, para qué curso es y qué da.
--  Nunca dice cuántos usos lleva ni qué otros códigos existen.

create or replace function public.revisa_codigo(p_codigo text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare c record; limpio text;
begin
  limpio := upper(btrim(coalesce(p_codigo, '')));
  if limpio = '' then
    return jsonb_build_object('ok', false, 'motivo', 'Escribe el código que te dieron en el curso.');
  end if;

  select * into c from public.codigos where codigo = limpio;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'Ese código no existe. Revisa cómo está escrito.');
  end if;
  if not c.activo then
    return jsonb_build_object('ok', false, 'motivo', 'Ese código ya no está en uso.');
  end if;
  if c.vence is not null and c.vence < now() then
    return jsonb_build_object('ok', false, 'motivo', 'Ese código ya venció.');
  end if;
  if c.usos_max > 0 and c.usos >= c.usos_max then
    return jsonb_build_object('ok', false, 'motivo', 'Ese código ya lo usaron todos los lugares que tenía.');
  end if;

  return jsonb_build_object('ok', true, 'curso', c.curso, 'plan', c.plan, 'dias', c.dias);
end $$;

-- Que la pantalla de registro pueda preguntar sin haber entrado todavía.
grant execute on function public.revisa_codigo(text) to anon, authenticated;


-- ---------- 4. Canjearlo ----------
--  Lo llama la persona recién registrada, ya con sesión. Vuelve a revisar
--  todo: entre que preguntamos y canjeamos pudo llenarse el cupo, y no
--  queremos regalar un lugar que ya no había.

create or replace function public.canjear_codigo(p_codigo text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare c record; limpio text; mi_id uuid; ya text;
begin
  mi_id := auth.uid();
  if mi_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'No hay sesión.');
  end if;

  limpio := upper(btrim(coalesce(p_codigo, '')));

  select * into c from public.codigos where codigo = limpio for update;
  if not found or not c.activo
     or (c.vence is not null and c.vence < now())
     or (c.usos_max > 0 and c.usos >= c.usos_max) then
    return jsonb_build_object('ok', false, 'motivo', 'Ese código ya no se puede usar.');
  end if;

  -- Una cuenta no canjea dos veces: si ya trae código, se queda como está.
  select codigo into ya from public.cuentas where id = public.mi_cuenta();
  if ya is not null then
    return jsonb_build_object('ok', false, 'motivo', 'Esta cuenta ya usó un código.');
  end if;

  update public.cuentas
     set plan      = c.plan,
         estado    = 'activa',
         es_prueba = true,
         codigo    = c.codigo,
         vence     = now() + (c.dias || ' days')::interval
   where id = public.mi_cuenta();

  update public.codigos set usos = usos + 1 where codigo = c.codigo;

  return jsonb_build_object('ok', true, 'plan', c.plan, 'dias', c.dias, 'curso', c.curso);
end $$;

grant execute on function public.canjear_codigo(text) to authenticated;


-- ---------- 5. El alta ya no regala prueba ----------
--  La cuenta nace sin plan. Quien traiga código lo canjea enseguida y
--  pasa a Maker; quien no, verá la pantalla de planes.

alter table public.cuentas alter column vence set default now();

create or replace function public.al_crear_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare nueva uuid;
begin
  insert into public.cuentas (nombre, plan, estado, vence, es_prueba)
    values (coalesce(new.raw_user_meta_data->>'negocio', 'Mi taller'),
            'ninguno', 'activa', now(), false)
    returning id into nueva;
  insert into public.perfiles (id, cuenta_id, cuenta_activa, nombre, correo, rol)
    values (new.id, nueva, nueva, new.raw_user_meta_data->>'nombre', new.email, 'admin');
  insert into public.membresias (usuario_id, cuenta_id, rol)
    values (new.id, nueva, 'admin');
  return new;
end $$;


-- ---------- 6. Generar un código ----------
--  Para no escribir el insert a mano cada vez que abres un curso.
--    select public.nuevo_codigo('Serigrafía octubre 2026', 30);
--  Devuelve el código ya creado, listo para dictar en clase.

create or replace function public.nuevo_codigo(
  p_curso text,
  p_lugares int default 0,          -- 0 = sin tope
  p_dias int default 15,
  p_plan text default 'maker',
  p_valido_dias int default 60      -- cuánto tiempo sirve el código en sí
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare nuevo text; intentos int := 0;
begin
  if not public.es_staff() then
    raise exception 'Solo el equipo de Hey Makers genera códigos';
  end if;

  -- Letras y números sin los que se confunden al dictarlos: nada de O/0,
  -- I/1, S/5. Quien lo apunta en una libreta lo agradece.
  loop
    nuevo := 'HM-' || string_agg(
      substr('ABCDEFGHJKLMNPQRTUVWXYZ2346789', (random()*29)::int + 1, 1), '')
      from generate_series(1, 6);
    exit when not exists (select 1 from public.codigos where codigo = nuevo);
    intentos := intentos + 1;
    if intentos > 20 then raise exception 'No pude generar un código libre'; end if;
  end loop;

  insert into public.codigos (codigo, curso, plan, dias, usos_max, vence)
    values (nuevo, p_curso, p_plan, p_dias, greatest(0, p_lugares),
            now() + (greatest(1, p_valido_dias) || ' days')::interval);

  return jsonb_build_object('codigo', nuevo, 'curso', p_curso, 'plan', p_plan,
                            'dias', p_dias, 'lugares', p_lugares);
end $$;

grant execute on function public.nuevo_codigo(text, int, int, text, int) to authenticated;


-- ---------- 7. Cómo va cada código ----------
create or replace view public.v_codigos as
select c.codigo, c.curso, c.plan, c.dias,
       c.usos, c.usos_max,
       case when c.usos_max = 0 then null else greatest(0, c.usos_max - c.usos) end as lugares_libres,
       c.vence, c.activo, c.creado,
       (select count(*) from public.cuentas k where k.codigo = c.codigo) as cuentas_abiertas
  from public.codigos c
 where public.es_staff()
 order by c.creado desc;


-- ---------- Comprobación ----------
select 'Códigos que existen' as que, count(*)::text as cuantos from public.codigos
union all
select 'Cuentas sin plan', count(*)::text from public.cuentas where plan = 'ninguno';
