-- 45 · Lab: monitor de seguridad. Quién cambió algo delicado, desde dónde y cuándo.
-- Ejecutar después de 44. Repetible. No cambia los datos de ningún negocio: sólo empieza a anotar.
-- Anota: planes y vigencias, el equipo de Nuvoor, membresías, roles, códigos, transferencias,
-- PIN y roles del personal, bloqueos por PIN equivocado y los intentos que el sistema frena.
-- Los inicios de sesión salen del registro de Supabase (auth.audit_log_entries).
-- Nunca guarda un PIN, una contraseña ni una llave: sólo que cambió.
begin;

create table if not exists public.seguridad_eventos (
  id         bigserial primary key,
  cuando     timestamptz not null default clock_timestamp(),
  tipo       text not null,
  gravedad   text not null default 'info' check (gravedad in ('info','aviso','alerta','critico')),
  que        text not null,
  tabla      text,
  operacion  text,
  cuenta_id  uuid,
  quien      uuid,
  correo     text,
  via        text,
  ip         text,
  pais       text,
  navegador  text,
  detalle    jsonb not null default '{}'::jsonb
);
-- La cadena completa de x-forwarded-for: si alguien inventa ese encabezado, aquí se ve junto a la IP que puso el proxy.
alter table public.seguridad_eventos add column if not exists cadena text;
create index if not exists seguridad_eventos_cuando_idx on public.seguridad_eventos (cuando desc);
create index if not exists seguridad_eventos_gravedad_idx on public.seguridad_eventos (gravedad, cuando desc);
alter table public.seguridad_eventos enable row level security;
revoke all on public.seguridad_eventos from public, anon, authenticated;
revoke all on sequence public.seguridad_eventos_id_seq from public, anon, authenticated;
comment on table public.seguridad_eventos is
  'Monitor de seguridad de Nuvoor Lab. Sólo la escriben los disparadores y sólo la lee el equipo de Nuvoor con staff_seguridad().';

-- ---------- De dónde viene el cambio ----------
-- PostgREST deja los encabezados y la sesión de cada petición en request.headers y request.jwt.claims.
-- Un cambio desde el editor SQL o una conexión directa no trae encabezados: se anota como «sql».
create or replace function public.seguridad_contexto()
returns jsonb language plpgsql stable set search_path = pg_catalog, public
as $$
declare h jsonb := '{}'::jsonb; c jsonb := '{}'::jsonb; v_ip text; v_via text;
begin
  begin h := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb); exception when others then h := '{}'::jsonb; end;
  begin c := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb); exception when others then c := '{}'::jsonb; end;
  -- cf-connecting-ip la pone Cloudflare y no se puede inventar; x-forwarded-for sí: por eso va al final y se guarda completa.
  v_ip := nullif(btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1))), '');
  v_via := case
    when c->>'role' = 'service_role' then 'servicio'
    when c->>'role' in ('authenticated', 'anon') then 'app'
    when session_user::text = 'supabase_auth_admin' then 'auth'
    when session_user::text in ('postgres', 'supabase_admin', 'dashboard_user', 'supabase_read_only_user') then 'sql'
    else session_user::text
  end;
  return jsonb_build_object(
    'ip', left(v_ip, 64), 'pais', left(nullif(h->>'cf-ipcountry', ''), 8), 'cadena', left(nullif(h->>'x-forwarded-for', ''), 200),
    'navegador', left(nullif(h->>'user-agent', ''), 300),
    'rol', c->>'role', 'quien', nullif(c->>'sub', ''), 'correo', nullif(c->>'email', ''), 'via', v_via);
end $$;
revoke all on function public.seguridad_contexto() from public, anon, authenticated;

-- ---------- Anotar (nunca frena al negocio) ----------
create or replace function public.seguridad_anota(p_tipo text, p_gravedad text, p_que text,
  p_tabla text, p_operacion text, p_cuenta uuid, p_detalle jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
declare x jsonb; v_quien uuid; v_correo text;
begin
  x := public.seguridad_contexto();
  begin v_quien := (x->>'quien')::uuid; exception when others then v_quien := null; end;
  v_correo := x->>'correo';
  if v_correo is null and v_quien is not null then
    begin select u.email::text into v_correo from auth.users u where u.id = v_quien; exception when others then v_correo := null; end;
  end if;
  insert into public.seguridad_eventos (tipo, gravedad, que, tabla, operacion, cuenta_id, quien, correo, via, ip, pais, navegador, cadena, detalle)
  values (p_tipo, coalesce(p_gravedad, 'info'), p_que, p_tabla, p_operacion, p_cuenta, v_quien, v_correo,
          x->>'via', x->>'ip', x->>'pais', x->>'navegador', x->>'cadena', coalesce(p_detalle, '{}'::jsonb));
exception when others then
  raise warning 'seguridad_anota: %', sqlerrm;
end $$;
revoke all on function public.seguridad_anota(text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.seguridad_es_staff()
returns boolean language plpgsql stable security definer set search_path = pg_catalog, public
as $$ begin return coalesce(public.es_staff(), false); exception when others then return false; end $$;
revoke all on function public.seguridad_es_staff() from public, anon, authenticated;

-- Qué columnas cambiaron, sin copiar las que no se deben guardar.
create or replace function public.seguridad_diferencias(p_antes jsonb, p_despues jsonb, p_columnas text[], p_ocultas text[] default '{}')
returns jsonb language plpgsql immutable set search_path = pg_catalog, public
as $$
declare k text; r jsonb := '{}'::jsonb;
begin
  foreach k in array p_columnas loop
    if (p_antes->k) is distinct from (p_despues->k) then
      r := r || jsonb_build_object(k, case when k = any(p_ocultas) then jsonb_build_object('cambio', true)
                                           else jsonb_build_object('antes', p_antes->k, 'despues', p_despues->k) end);
    end if;
  end loop;
  return r;
end $$;
revoke all on function public.seguridad_diferencias(jsonb, jsonb, text[], text[]) from public, anon, authenticated;

-- ---------- 1. Negocios: plan, estado, vigencia, producto ----------
create or replace function public.seguridad_cuentas_intento()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare d jsonb;
begin
  -- Corre antes de no_tocar_suscripcion: ve lo que el navegador quiso cambiar antes de que se le regrese.
  if coalesce(public.seguridad_contexto()->>'rol', '') = 'authenticated'
     and coalesce(current_setting('makers.cambio_autorizado', true), '') <> 'si' then
    d := public.seguridad_diferencias(to_jsonb(old), to_jsonb(new), array['plan','estado','vence','ciclo','producto','mp_preapproval_id']);
    if d <> '{}'::jsonb then
      perform public.seguridad_anota('intento', case when public.seguridad_es_staff() then 'aviso' else 'critico' end,
        'Intentaron cambiar el plan o la vigencia desde el navegador; el sistema lo regresó.', 'cuentas', 'UPDATE', old.id, d);
    end if;
  end if;
  return new;
exception when others then
  raise warning 'seguridad_cuentas_intento: %', sqlerrm;
  return new;
end $$;

create or replace function public.seguridad_cuentas()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare d jsonb; x jsonb; v_g text; v_que text; v_aut boolean;
begin
  x := public.seguridad_contexto();
  v_aut := coalesce(current_setting('makers.cambio_autorizado', true), '') = 'si';
  if tg_op = 'INSERT' then
    perform public.seguridad_anota('negocio', 'info', 'Negocio nuevo', 'cuentas', tg_op, new.id,
      jsonb_build_object('nombre', to_jsonb(new)->'nombre', 'producto', to_jsonb(new)->'producto', 'plan', to_jsonb(new)->'plan'));
    return new;
  elsif tg_op = 'DELETE' then
    perform public.seguridad_anota('negocio', case when x->>'via' = 'sql' then 'aviso' else 'critico' end, 'Se borró un negocio', 'cuentas', tg_op, old.id,
      jsonb_build_object('nombre', to_jsonb(old)->'nombre', 'producto', to_jsonb(old)->'producto', 'plan', to_jsonb(old)->'plan'));
    return old;
  end if;
  d := public.seguridad_diferencias(to_jsonb(old), to_jsonb(new), array['plan','estado','vence','ciclo','producto','mp_preapproval_id']);
  if d = '{}'::jsonb then return new; end if;
  v_g := case
    when x->>'via' in ('servicio', 'auth') then 'info'
    when x->>'via' = 'sql' then 'aviso'
    when public.seguridad_es_staff() then 'info'
    when v_aut then 'info'
    else 'critico' end;
  v_que := case
    when x->>'via' = 'servicio' then 'El cobro automático cambió el plan o la vigencia'
    when x->>'via' = 'sql' then 'Cambio directo en la base de datos al plan o la vigencia'
    when public.seguridad_es_staff() then 'El equipo de Nuvoor cambió el plan o la vigencia'
    when v_aut then 'Se canjeó un código o se aplicó un cambio autorizado'
    else 'Cambió el plan o la vigencia sin autorización' end;
  perform public.seguridad_anota('plan', v_g, v_que, 'cuentas', tg_op, new.id, d);
  return new;
exception when others then
  raise warning 'seguridad_cuentas: %', sqlerrm;
  return coalesce(new, old);
end $$;

-- ---------- 2. El equipo de Nuvoor (Lab) ----------
create or replace function public.seguridad_staff()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  perform public.seguridad_anota('equipo_nuvoor', 'critico',
    case tg_op when 'INSERT' then 'Alguien nuevo entró al equipo de Nuvoor (Lab)'
               when 'DELETE' then 'Alguien salió del equipo de Nuvoor (Lab)'
               else 'Cambió el rol de alguien del equipo de Nuvoor (Lab)' end,
    'staff', tg_op, null,
    jsonb_build_object('persona', r->'id', 'correo', r->'correo', 'nombre', r->'nombre', 'rol', r->'rol')
      || case when tg_op = 'UPDATE' then jsonb_build_object('cambios', public.seguridad_diferencias(to_jsonb(old), to_jsonb(new), array['rol','correo'])) else '{}'::jsonb end);
  return coalesce(new, old);
exception when others then
  raise warning 'seguridad_staff: %', sqlerrm;
  return coalesce(new, old);
end $$;

-- ---------- 3. Quién entra a qué negocio y con qué rol ----------
create or replace function public.seguridad_membresias()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb := to_jsonb(coalesce(new, old)); x jsonb; v_g text := 'info'; v_otro boolean;
begin
  x := public.seguridad_contexto();
  if tg_op <> 'DELETE' and new.rol = 'admin' and x->>'via' = 'app' and not public.seguridad_es_staff() then
    v_g := 'aviso';
    select exists (select 1 from public.membresias m where m.cuenta_id = new.cuenta_id and m.usuario_id <> new.usuario_id and m.rol = 'admin') into v_otro;
    -- Alguien se dio a sí mismo el rol de administrador en un negocio que ya tenía dueño.
    if (x->>'quien') = new.usuario_id::text and v_otro then v_g := 'alerta'; end if;
  end if;
  perform public.seguridad_anota('membresia', v_g,
    case tg_op when 'INSERT' then 'Alguien recibió acceso a un negocio'
               when 'DELETE' then 'Alguien perdió el acceso a un negocio'
               else 'Cambió el rol de alguien en un negocio' end,
    'membresias', tg_op, (r->>'cuenta_id')::uuid,
    jsonb_build_object('usuario', r->'usuario_id', 'rol', r->'rol')
      || case when tg_op = 'UPDATE' then jsonb_build_object('cambios', public.seguridad_diferencias(to_jsonb(old), to_jsonb(new), array['rol'])) else '{}'::jsonb end);
  return coalesce(new, old);
exception when others then
  raise warning 'seguridad_membresias: %', sqlerrm;
  return coalesce(new, old);
end $$;

-- ---------- 4. Roles de Imprenta (perfiles) y el intento de subirse de rol ----------
create or replace function public.seguridad_perfiles_intento()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_admin boolean := false;
begin
  if coalesce(public.seguridad_contexto()->>'rol', '') = 'authenticated'
     and (new.rol is distinct from old.rol or new.cuenta_id is distinct from old.cuenta_id) then
    begin v_admin := public.mi_rol() = 'admin'; exception when others then v_admin := false; end;
    if not v_admin and not public.seguridad_es_staff() then
      perform public.seguridad_anota('intento', 'critico', 'Intentaron subirse de rol o cambiarse de negocio; el sistema lo regresó.',
        'perfiles', 'UPDATE', old.cuenta_id,
        jsonb_build_object('usuario', old.id, 'cambios', public.seguridad_diferencias(to_jsonb(old), to_jsonb(new), array['rol','cuenta_id'])));
    end if;
  end if;
  return new;
exception when others then
  raise warning 'seguridad_perfiles_intento: %', sqlerrm;
  return new;
end $$;

create or replace function public.seguridad_perfiles()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare d jsonb;
begin
  d := public.seguridad_diferencias(to_jsonb(old), to_jsonb(new), array['rol','cuenta_id']);
  if d <> '{}'::jsonb then
    perform public.seguridad_anota('rol', 'aviso', 'Cambió el rol o el negocio de un usuario', 'perfiles', tg_op, new.cuenta_id,
      jsonb_build_object('usuario', new.id, 'cambios', d));
  end if;
  return new;
exception when others then
  raise warning 'seguridad_perfiles: %', sqlerrm;
  return new;
end $$;

-- ---------- 5. Códigos de curso y transferencias ----------
create or replace function public.seguridad_codigos()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb := to_jsonb(coalesce(new, old)); x jsonb; v_g text;
begin
  x := public.seguridad_contexto();
  v_g := case when x->>'via' = 'app' and not public.seguridad_es_staff() then 'critico' else 'aviso' end;
  perform public.seguridad_anota('codigo', v_g,
    case tg_op when 'INSERT' then 'Se creó un código de curso' when 'DELETE' then 'Se borró un código de curso' else 'Cambió un código de curso' end,
    'codigos', tg_op, null,
    jsonb_build_object('codigo', r->'codigo', 'plan', r->'plan', 'dias', r->'dias', 'usos_max', r->'usos_max', 'activo', r->'activo')
      || case when tg_op = 'UPDATE' then jsonb_build_object('cambios', public.seguridad_diferencias(to_jsonb(old), to_jsonb(new), array['plan','dias','usos_max','vence','activo'])) else '{}'::jsonb end);
  return coalesce(new, old);
exception when others then
  raise warning 'seguridad_codigos: %', sqlerrm;
  return coalesce(new, old);
end $$;

create or replace function public.seguridad_pagos()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare x jsonb;
begin
  if new.estado is distinct from old.estado and new.estado = 'pagado' then
    x := public.seguridad_contexto();
    perform public.seguridad_anota('pago', case when x->>'via' = 'app' and not public.seguridad_es_staff() then 'critico' else 'aviso' end,
      'Una transferencia se marcó como pagada', 'pagos_pendientes', tg_op, new.cuenta_id,
      jsonb_build_object('pago', new.id, 'plan', new.plan, 'monto', new.monto, 'referencia', new.referencia));
  end if;
  return new;
exception when others then
  raise warning 'seguridad_pagos: %', sqlerrm;
  return new;
end $$;

-- ---------- 6. El personal: PIN y roles (Restaurant y la Imprenta de antes) ----------
create or replace function public.seguridad_equipo()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_cuenta uuid := coalesce(new.cuenta_id, old.cuenta_id); a jsonb; b jsonb; d jsonb := '[]'::jsonb; p jsonb; q jsonb; v_g text := 'info'; v_que text;
begin
  if coalesce(new.coleccion, old.coleccion) = 'rest_equipo' then
    a := case when tg_op <> 'INSERT' then old.cuerpo end;
    b := case when tg_op <> 'DELETE' then new.cuerpo end;
    if tg_op = 'UPDATE' then
      p := public.seguridad_diferencias(a, b, array['pin_hash','rol','activo','nombre'], array['pin_hash']);
      if p = '{}'::jsonb then return new; end if;
      if p ? 'pin_hash' or p ? 'rol' then v_g := 'aviso'; end if;
      v_que := case when p ? 'pin_hash' then 'Cambió el PIN de una persona del personal'
                    when p ? 'rol' then 'Cambió el rol de una persona del personal'
                    else 'Cambió una persona del personal' end;
    else
      p := '{}'::jsonb;
      v_que := case when tg_op = 'INSERT' then 'Se dio de alta una persona del personal' else 'Se borró una persona del personal' end;
    end if;
    perform public.seguridad_anota('personal', v_g, v_que, 'documentos', tg_op, v_cuenta,
      jsonb_build_object('persona', coalesce(b, a)->'id', 'nombre', coalesce(b, a)->'nombre', 'rol', coalesce(b, a)->'rol', 'cambios', p));
  else
    -- config/equipo de la Imprenta: compara persona por persona sin copiar los PIN.
    a := coalesce(case when tg_op <> 'INSERT' then old.cuerpo->'equipo' end, '[]'::jsonb);
    b := coalesce(case when tg_op <> 'DELETE' then new.cuerpo->'equipo' end, '[]'::jsonb);
    if jsonb_typeof(a) <> 'array' then a := '[]'::jsonb; end if;
    if jsonb_typeof(b) <> 'array' then b := '[]'::jsonb; end if;
    for p in select * from jsonb_array_elements(b) loop
      select e into q from jsonb_array_elements(a) e where e->>'id' = p->>'id' limit 1;
      if q is null then
        d := d || jsonb_build_array(jsonb_build_object('persona', p->>'nombre', 'que', 'alta', 'rol', p->>'rol'));
      else
        if (q->'pin') is distinct from (p->'pin') then d := d || jsonb_build_array(jsonb_build_object('persona', p->>'nombre', 'que', 'pin')); end if;
        if (q->'rol') is distinct from (p->'rol') then d := d || jsonb_build_array(jsonb_build_object('persona', p->>'nombre', 'que', 'rol', 'antes', q->>'rol', 'despues', p->>'rol')); end if;
        if (q->'activo') is distinct from (p->'activo') then d := d || jsonb_build_array(jsonb_build_object('persona', p->>'nombre', 'que', 'activo', 'despues', p->'activo')); end if;
      end if;
    end loop;
    for q in select * from jsonb_array_elements(a) loop
      if not exists (select 1 from jsonb_array_elements(b) e where e->>'id' = q->>'id') then
        d := d || jsonb_build_array(jsonb_build_object('persona', q->>'nombre', 'que', 'baja'));
      end if;
    end loop;
    if jsonb_array_length(d) = 0 then return coalesce(new, old); end if;
    if exists (select 1 from jsonb_array_elements(d) e where e->>'que' in ('pin','rol','alta')) then v_g := 'aviso'; end if;
    perform public.seguridad_anota('personal', v_g, 'Cambió el equipo de la Imprenta (PIN, roles o personas)', 'documentos', tg_op, v_cuenta,
      jsonb_build_object('cambios', d));
  end if;
  return coalesce(new, old);
exception when others then
  raise warning 'seguridad_equipo: %', sqlerrm;
  return coalesce(new, old);
end $$;

-- ---------- 7. PIN equivocado: bloqueos ----------
create or replace function public.seguridad_bloqueo_pin()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r jsonb := to_jsonb(new); v_hasta timestamptz; v_cuenta uuid;
begin
  if tg_table_name = 'rest_personal_fallos' then
    v_hasta := (r->>'hasta')::timestamptz; v_cuenta := (r->>'cuenta_id')::uuid;
    if v_hasta is null or v_hasta <= now() or (tg_op = 'UPDATE' and (to_jsonb(old)->>'hasta') is not distinct from (r->>'hasta')) then return new; end if;
    perform public.seguridad_anota('pin', 'alerta', 'PIN equivocado varias veces: la puerta quedó bloqueada un rato', tg_table_name, tg_op, v_cuenta,
      jsonb_build_object('usuario', r->'usuario', 'intentos', r->'intentos', 'hasta', r->'hasta'));
  else
    v_hasta := (r->>'bloqueado')::timestamptz;
    if v_hasta is null or (tg_op = 'UPDATE' and (to_jsonb(old)->>'bloqueado') is not distinct from (r->>'bloqueado')) then return new; end if;
    select a.cuenta_id into v_cuenta from public.rest_personal_accesos a where a.id = (r->>'acceso_id')::uuid;
    perform public.seguridad_anota('pin', 'alerta', 'PIN equivocado varias veces en un aparato de Mi jornada: quedó bloqueado', tg_table_name, tg_op, v_cuenta,
      jsonb_build_object('acceso', r->'acceso_id', 'fallos', r->'fallos', 'bloqueado', r->'bloqueado'));
  end if;
  return new;
exception when others then
  raise warning 'seguridad_bloqueo_pin: %', sqlerrm;
  return new;
end $$;

do $$
declare f text;
begin
  foreach f in array array['seguridad_cuentas_intento','seguridad_cuentas','seguridad_staff','seguridad_membresias','seguridad_perfiles_intento',
                           'seguridad_perfiles','seguridad_codigos','seguridad_pagos','seguridad_equipo','seguridad_bloqueo_pin'] loop
    execute format('revoke all on function public.%I() from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------- Los disparadores (sólo donde existe la tabla) ----------
-- Los de «intento» empiezan con aa_ para correr antes de no_tocar_suscripcion y no_tocar_rol.
do $$
begin
  if to_regclass('public.cuentas') is not null then
    drop trigger if exists aa_seguridad_intento on public.cuentas;
    create trigger aa_seguridad_intento before update on public.cuentas for each row execute function public.seguridad_cuentas_intento();
    drop trigger if exists zz_seguridad on public.cuentas;
    create trigger zz_seguridad after insert or update or delete on public.cuentas for each row execute function public.seguridad_cuentas();
  end if;
  if to_regclass('public.staff') is not null then
    drop trigger if exists zz_seguridad on public.staff;
    create trigger zz_seguridad after insert or update or delete on public.staff for each row execute function public.seguridad_staff();
  end if;
  if to_regclass('public.membresias') is not null then
    drop trigger if exists zz_seguridad on public.membresias;
    create trigger zz_seguridad after insert or update of rol or delete on public.membresias for each row execute function public.seguridad_membresias();
  end if;
  if to_regclass('public.perfiles') is not null then
    drop trigger if exists aa_seguridad_intento on public.perfiles;
    create trigger aa_seguridad_intento before update of rol, cuenta_id on public.perfiles for each row execute function public.seguridad_perfiles_intento();
    drop trigger if exists zz_seguridad on public.perfiles;
    create trigger zz_seguridad after update of rol, cuenta_id on public.perfiles for each row execute function public.seguridad_perfiles();
  end if;
  if to_regclass('public.codigos') is not null then
    drop trigger if exists zz_seguridad on public.codigos;
    create trigger zz_seguridad after insert or update of plan, dias, usos_max, vence, activo or delete on public.codigos for each row execute function public.seguridad_codigos();
  end if;
  if to_regclass('public.pagos_pendientes') is not null then
    drop trigger if exists zz_seguridad on public.pagos_pendientes;
    create trigger zz_seguridad after update of estado on public.pagos_pendientes for each row execute function public.seguridad_pagos();
  end if;
  if to_regclass('public.documentos') is not null then
    drop trigger if exists zz_seguridad_equipo on public.documentos;
    drop trigger if exists zz_seguridad_equipo_baja on public.documentos;
    create trigger zz_seguridad_equipo after insert or update on public.documentos for each row
      when (new.coleccion = 'rest_equipo' or (new.coleccion = 'config' and new.doc_id = 'equipo'))
      execute function public.seguridad_equipo();
    create trigger zz_seguridad_equipo_baja after delete on public.documentos for each row
      when (old.coleccion = 'rest_equipo' or (old.coleccion = 'config' and old.doc_id = 'equipo'))
      execute function public.seguridad_equipo();
  end if;
  if to_regclass('public.rest_personal_fallos') is not null then
    drop trigger if exists zz_seguridad on public.rest_personal_fallos;
    create trigger zz_seguridad after insert or update of hasta on public.rest_personal_fallos for each row execute function public.seguridad_bloqueo_pin();
  end if;
  if to_regclass('public.rest_personal_dispositivos') is not null then
    drop trigger if exists zz_seguridad on public.rest_personal_dispositivos;
    create trigger zz_seguridad after insert or update of bloqueado on public.rest_personal_dispositivos for each row execute function public.seguridad_bloqueo_pin();
  end if;
end $$;

-- ---------- Lo que ve el Lab ----------
create or replace function public.staff_seguridad(p_horas integer default 168)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public
as $$
declare
  v_desde timestamptz;
  v_eventos jsonb := '[]'::jsonb;
  v_sesiones jsonb;
  v_sesiones_motivo text;
  v_pin jsonb := '[]'::jsonb;
  v_derivadas jsonb := '[]'::jsonb;
  v_resumen jsonb;
begin
  if not public.seguridad_es_staff() then
    raise exception 'Sólo el equipo de Nuvoor puede ver el monitor de seguridad.' using errcode = '42501';
  end if;
  v_desde := now() - make_interval(hours => greatest(1, least(coalesce(p_horas, 168), 24 * 90)));
  delete from public.seguridad_eventos where cuando < now() - interval '180 days';

  -- Lo que anotaron los disparadores, más lo que el equipo hizo desde el Lab.
  select coalesce(jsonb_agg(e order by e->>'cuando' desc), '[]'::jsonb) into v_eventos from (
    select jsonb_build_object('cuando', s.cuando, 'tipo', s.tipo, 'gravedad', s.gravedad, 'que', s.que, 'tabla', s.tabla,
      'operacion', s.operacion, 'cuenta', s.cuenta_id, 'negocio', c.nombre, 'quien', s.quien, 'correo', s.correo,
      'staff', exists (select 1 from public.staff st where st.id = s.quien),
      'via', s.via, 'ip', s.ip, 'pais', s.pais, 'navegador', s.navegador, 'cadena', s.cadena, 'detalle', s.detalle) as e
    from public.seguridad_eventos s left join public.cuentas c on c.id = s.cuenta_id
    where s.cuando >= v_desde
    order by s.cuando desc limit 400
  ) x;
  if to_regclass('public.lab_bitacora') is not null then
    v_eventos := v_eventos || coalesce((select jsonb_agg(jsonb_build_object('cuando', b.cuando, 'tipo', 'lab', 'gravedad', 'info',
        'que', b.que, 'tabla', 'lab_bitacora', 'cuenta', b.cuenta_id, 'negocio', c.nombre, 'quien', b.quien, 'correo', b.correo,
        'staff', true, 'via', 'lab', 'detalle', jsonb_build_object('antes', b.antes, 'despues', b.despues)) order by b.cuando desc)
      from (select * from public.lab_bitacora where cuando >= v_desde order by cuando desc limit 200) b
      left join public.cuentas c on c.id = b.cuenta_id), '[]'::jsonb);
  end if;

  -- Inicios de sesión, altas y contraseñas: el registro de Supabase guarda la IP.
  if to_regclass('auth.audit_log_entries') is null then
    v_sesiones_motivo := 'sin_registro';
  else
    begin
      execute $q$
        with base as (
          select a.created_at as cuando, nullif(a.ip_address, '') as ip, a.payload->>'action' as accion,
                 a.payload->>'actor_username' as correo, a.payload->>'actor_id' as usuario
          from auth.audit_log_entries a
          where a.created_at >= $1
            and a.payload->>'action' in ('login','user_signedup','user_recovery_requested','user_updated_password','user_modified',
                                         'user_deleted','user_invited','user_repeated_signup','token_revoked','logout','user_reauthenticate_requested')
          order by a.created_at desc limit 500
        ),
        -- La primera vez que cada persona entró desde cada IP en los 60 días anteriores: una sola pasada.
        primera as (
          select a.payload->>'actor_id' as usuario, a.ip_address as ip, min(a.created_at) as cuando
          from auth.audit_log_entries a
          where a.created_at >= $1 - interval '60 days' and a.payload->>'action' = 'login' and coalesce(a.ip_address, '') <> ''
          group by 1, 2
        )
        select coalesce(jsonb_agg(jsonb_build_object('cuando', b.cuando, 'ip', b.ip, 'accion', b.accion, 'correo', b.correo, 'usuario', b.usuario,
          'staff', exists (select 1 from public.staff st where st.id::text = b.usuario),
          'ipNueva', b.accion = 'login' and p.cuando = b.cuando
        ) order by b.cuando desc), '[]'::jsonb)
        from base b left join primera p on p.usuario = b.usuario and p.ip = b.ip
      $q$ into v_sesiones using v_desde;
    exception when others then
      v_sesiones := null; v_sesiones_motivo := 'sin_permiso';
    end;
  end if;

  -- Alertas que salen de juntar varios renglones.
  if v_sesiones is not null then
    select coalesce(jsonb_agg(z), '[]'::jsonb) into v_derivadas from (
      select jsonb_build_object('gravedad', 'alerta', 'que', 'Muchas cuentas nuevas desde la misma IP', 'ip', s->>'ip',
        'cuantas', count(*), 'cuando', max(s->>'cuando')) as z
      from jsonb_array_elements(v_sesiones) s where s->>'accion' = 'user_signedup' and s->>'ip' is not null
      group by s->>'ip', date_trunc('hour', (s->>'cuando')::timestamptz) having count(*) >= 5
      union all
      select jsonb_build_object('gravedad', 'aviso', 'que', 'Muchos correos de recuperar contraseña para la misma persona', 'correo', s->>'correo',
        'cuantas', count(*), 'cuando', max(s->>'cuando'))
      from jsonb_array_elements(v_sesiones) s where s->>'accion' = 'user_recovery_requested'
      group by s->>'correo', date_trunc('hour', (s->>'cuando')::timestamptz) having count(*) >= 4
      union all
      select jsonb_build_object('gravedad', 'alerta', 'que', 'Alguien del equipo de Nuvoor entró desde una IP nueva', 'correo', s->>'correo',
        'ip', s->>'ip', 'cuando', s->>'cuando')
      from jsonb_array_elements(v_sesiones) s where (s->>'staff')::boolean and (s->>'ipNueva')::boolean
    ) y;
  end if;

  -- PIN: quién está bloqueado o va fallando.
  if to_regclass('public.rest_personal_fallos') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('negocio', c.nombre, 'cuenta', f.cuenta_id, 'usuario', f.usuario, 'correo', u.email,
        'intentos', f.intentos, 'hasta', f.hasta, 'bloqueado', f.hasta > now()) order by f.hasta desc nulls last), '[]'::jsonb)
      from public.rest_personal_fallos f
      left join public.cuentas c on c.id = f.cuenta_id
      left join auth.users u on u.id = f.usuario
      where f.intentos > 0 or f.hasta >= $1
    $q$ into v_pin using v_desde;
  end if;

  v_resumen := jsonb_build_object(
    'desde', v_desde,
    'criticos', (select count(*) from jsonb_array_elements(v_eventos) e where e->>'gravedad' = 'critico'),
    'alertas', (select count(*) from jsonb_array_elements(v_eventos) e where e->>'gravedad' = 'alerta') + jsonb_array_length(v_derivadas),
    'avisos', (select count(*) from jsonb_array_elements(v_eventos) e where e->>'gravedad' = 'aviso'),
    'cambios', jsonb_array_length(v_eventos),
    'inicios', case when v_sesiones is null then null else (select count(*) from jsonb_array_elements(v_sesiones) s where s->>'accion' = 'login') end,
    'ips', case when v_sesiones is null then null else (select count(distinct s->>'ip') from jsonb_array_elements(v_sesiones) s where s->>'ip' is not null) end,
    'altas', case when v_sesiones is null then null else (select count(*) from jsonb_array_elements(v_sesiones) s where s->>'accion' = 'user_signedup') end,
    'pinBloqueados', (select count(*) from jsonb_array_elements(v_pin) p where (p->>'bloqueado')::boolean)
  );
  return jsonb_build_object('resumen', v_resumen, 'eventos', v_eventos, 'sesiones', v_sesiones, 'sesionesMotivo', v_sesiones_motivo,
                            'derivadas', v_derivadas, 'pin', v_pin, 'yo', public.seguridad_contexto() - 'quien' - 'correo' - 'rol');
end $$;
revoke all on function public.staff_seguridad(integer) from public, anon;
grant execute on function public.staff_seguridad(integer) to authenticated;

-- Un renglón de prueba con la IP y el navegador de quien lo pide: sirve para ver que el monitor sí anota.
create or replace function public.staff_seguridad_prueba()
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public
as $$
begin
  if not public.seguridad_es_staff() then
    raise exception 'Sólo el equipo de Nuvoor puede probar el monitor.' using errcode = '42501';
  end if;
  perform public.seguridad_anota('prueba', 'info', 'Prueba del monitor desde el Lab', null, null, null, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.staff_seguridad_prueba() from public, anon;
grant execute on function public.staff_seguridad_prueba() to authenticated;

create or replace function public.nuvoor_seguridad_disponible()
returns boolean language sql stable set search_path = pg_catalog, public
as $$ select public.es_staff() $$;
revoke all on function public.nuvoor_seguridad_disponible() from public, anon;
grant execute on function public.nuvoor_seguridad_disponible() to authenticated;

notify pgrst, 'reload schema';
commit;
select '45 · Nuvoor Lab: monitor de seguridad' as migracion;
