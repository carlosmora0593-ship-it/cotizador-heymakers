-- ============================================================
--  04 · SOPORTE: del botón de ayuda del cotizador a Makers Lab
--  Correr DESPUÉS de 01-esquema.sql, 02-roles.sql y 03-arreglo-roles.sql.
--  Es seguro correrlo varias veces.
-- ============================================================
--  El botón de ayuda del cotizador guarda cada reporte como un documento
--  de la colección "soporte" de esa cuenta. Este archivo no inventa tablas
--  nuevas: solo abre una rendija para que TU equipo de Makers Lab pueda
--  leer y contestar esos reportes —y nada más que esos— de todas las
--  cuentas, sin tocar cotizaciones, clientes ni precios de nadie.
-- ============================================================


-- ---------- 1. Quién trabaja en Makers Lab ----------
-- Tu equipo NO vive en la tabla perfiles: esa es de los talleres.
-- Aquí van las personas de Hey Makers que dan soporte.

create table if not exists public.staff (
  id      uuid primary key references auth.users(id) on delete cascade,
  nombre  text,
  correo  text,
  rol     text not null default 'soporte' check (rol in ('dueno','ventas','soporte')),
  alta    timestamptz not null default now()
);
alter table public.staff enable row level security;

-- La pregunta va PRIMERO, porque la política de abajo la usa y Postgres
-- exige que la función exista cuando se crea la política.
--
-- Va como security definer por una razón de fondo: la versión evidente de
-- la política —"deja ver la tabla a quien esté en la tabla"— se pregunta a
-- sí misma, y Postgres contesta "infinite recursion detected". Una función
-- security definer lee sin volver a pasar por la política.

create or replace function public.es_staff()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.staff where id = auth.uid()) $$;

drop policy if exists staff_ver on public.staff;
create policy staff_ver on public.staff
  for select using (id = auth.uid() or public.es_staff());

-- Nadie se da de alta solo. Se agrega desde el panel con la llave de servicio.

create or replace function public.mi_rol_staff()
returns text
language sql stable security definer set search_path = public
as $$ select rol from public.staff where id = auth.uid() $$;


-- ---------- 2. La rendija: solo la colección "soporte" ----------
-- La política vieja (cada quien ve lo suyo) se queda intacta. Esta se suma
-- y NO alcanza a ninguna otra colección: si alguien de tu equipo intentara
-- leer cotizaciones de un taller, Postgres se lo niega igual que a un extraño.

drop policy if exists soporte_staff_lee on public.documentos;
create policy soporte_staff_lee on public.documentos
  for select using (coleccion = 'soporte' and public.es_staff());

drop policy if exists soporte_staff_contesta on public.documentos;
create policy soporte_staff_contesta on public.documentos
  for update using (coleccion = 'soporte' and public.es_staff())
  with check (coleccion = 'soporte' and public.es_staff());


-- ---------- 3. El cliente no puede falsear el reloj ----------
-- Los sellos de tiempo los pone la base, no el navegador: así el minuto en
-- que entró un reporte y el minuto en que se contestó no dependen de la hora
-- de la computadora de nadie ni se pueden editar después.

create or replace function public.sella_soporte()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  hay_respuesta boolean;
begin
  if new.coleccion <> 'soporte' then return new; end if;

  -- cuándo entró: se fija una sola vez y ya no se mueve
  if tg_op = 'INSERT' then
    new.cuerpo = jsonb_set(new.cuerpo, '{sellos,entro}', to_jsonb(now()), true);
  elsif old.cuerpo ? 'sellos' then
    new.cuerpo = jsonb_set(new.cuerpo, '{sellos}',
                           coalesce(old.cuerpo->'sellos', '{}'::jsonb) || coalesce(new.cuerpo->'sellos', '{}'::jsonb), true);
  end if;

  -- primera respuesta: el primer mensaje que escribe soporte
  hay_respuesta = exists (
    select 1 from jsonb_array_elements(coalesce(new.cuerpo->'mensajes', '[]'::jsonb)) m
    where m->>'de' = 'soporte');
  if hay_respuesta and (new.cuerpo->'sellos'->>'contestado') is null then
    new.cuerpo = jsonb_set(new.cuerpo, '{sellos,contestado}', to_jsonb(now()), true);
    new.cuerpo = jsonb_set(new.cuerpo, '{sellos,contestoQuien}', to_jsonb(coalesce(auth.uid()::text, 'sistema')), true);
  end if;

  -- soporte dice que ya quedó
  if new.cuerpo->>'estado' = 'esperando' and (new.cuerpo->'sellos'->>'resuelto') is null then
    new.cuerpo = jsonb_set(new.cuerpo, '{sellos,resuelto}', to_jsonb(now()), true);
  end if;

  -- el cliente lo confirma: esto SOLO puede hacerlo el dueño de la cuenta
  if new.cuerpo->>'estado' = 'cerrado' and (new.cuerpo->'sellos'->>'confirmado') is null then
    if public.es_staff() and new.cuenta_id <> public.mi_cuenta() then
      raise exception 'Un ticket lo cierra el cliente, no soporte';
    end if;
    new.cuerpo = jsonb_set(new.cuerpo, '{sellos,confirmado}', to_jsonb(now()), true);
  end if;

  -- reabrir cuenta como reapertura, y el reloj nunca se reinicia
  if tg_op = 'UPDATE'
     and old.cuerpo->>'estado' in ('esperando','cerrado')
     and new.cuerpo->>'estado' = 'enviado' then
    new.cuerpo = jsonb_set(new.cuerpo, '{reabierto}',
                 to_jsonb(coalesce((old.cuerpo->>'reabierto')::int, 0) + 1), true);
    new.cuerpo = new.cuerpo #- '{sellos,resuelto}';
  end if;

  return new;
end $$;

drop trigger if exists sella_soporte on public.documentos;
create trigger sella_soporte
  before insert or update on public.documentos
  for each row execute function public.sella_soporte();


-- ---------- 4. En vivo ----------
-- Con esto, la respuesta que tu equipo escribe en Makers Lab le aparece al
-- cliente en su cotizador sin que recargue nada.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documentos')
  then
    alter publication supabase_realtime add table public.documentos;
  end if;
end $$;


-- ---------- 5. La vista que lee Makers Lab ----------
-- Plana y cómoda: un renglón por reporte, con su cuenta, su plan y sus tiempos
-- ya calculados. Solo la ven quienes están en staff.

create or replace view public.v_soporte
with (security_invoker = true) as
select
  d.cuenta_id,
  c.negocio                                   as taller,
  c.plan,
  c.estado                                    as estado_cuenta,
  d.doc_id                                    as ticket_id,
  d.cuerpo->>'folio'                          as folio,
  d.cuerpo->>'asunto'                         as asunto,
  d.cuerpo->>'estado'                         as estado,
  coalesce((d.cuerpo->>'bloquea')::boolean, false) as bloquea,
  d.cuerpo->'contexto'->>'pantalla'           as pantalla,
  d.cuerpo->'contexto'->>'version'            as version,
  d.cuerpo->'contexto'->>'navegador'          as navegador,
  coalesce((d.cuerpo->>'reabierto')::int, 0)  as reaperturas,
  (d.cuerpo->'sellos'->>'entro')::timestamptz      as entro,
  (d.cuerpo->'sellos'->>'contestado')::timestamptz as contestado,
  (d.cuerpo->'sellos'->>'resuelto')::timestamptz   as resuelto,
  (d.cuerpo->'sellos'->>'confirmado')::timestamptz as confirmado,
  extract(epoch from ((d.cuerpo->'sellos'->>'contestado')::timestamptz
                    - (d.cuerpo->'sellos'->>'entro')::timestamptz)) / 3600 as horas_en_contestar,
  extract(epoch from ((d.cuerpo->'sellos'->>'confirmado')::timestamptz
                    - (d.cuerpo->'sellos'->>'entro')::timestamptz)) / 3600 as horas_en_resolver,
  jsonb_array_length(coalesce(d.cuerpo->'errores', '[]'::jsonb)) as errores_capturados,
  d.cuerpo->'mensajes'                        as mensajes,
  d.cuerpo->'contexto'                        as contexto,
  d.cuerpo->'errores'                         as errores,
  d.actualizado
from public.documentos d
join public.cuentas c on c.id = d.cuenta_id
where d.coleccion = 'soporte';


-- ---------- 6. Da de alta a tu primer soporte ----------
-- Crea la persona en Authentication → Users, copia su id y corre esto
-- cambiando el uuid y el nombre:
--
--   insert into public.staff (id, nombre, correo, rol)
--   values ('PEGA-AQUI-EL-UUID', 'NOMBRE DE LA PERSONA', 'SU-CORREO', 'dueno')
--   on conflict (id) do update set rol = excluded.rol;
--
-- Comprueba que quedó:
--   select * from public.v_soporte order by entro desc;
