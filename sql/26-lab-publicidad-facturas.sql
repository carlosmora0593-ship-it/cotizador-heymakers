-- 26 · Medición de publicidad y archivo de facturas de suscripciones.
-- Después de 09, 12, 16, 19, 23 y 24. Repetible. No activa cobros ni timbrado.
begin;

-- Las vistas y clics no son una edición del arte: no invalidan su ficha abierta.
create or replace function public.sella_anuncio()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (to_jsonb(new)-'vistas'-'clics'-'actualizado') is distinct from
    (to_jsonb(old)-'vistas'-'clics'-'actualizado') then new.actualizado:=clock_timestamp(); end if;
 return new;
end $$;

create table if not exists public.anuncios_borradores (
 id bigint primary key references public.anuncios(id) on delete cascade,
 cuerpo jsonb not null, actualizado timestamptz not null default clock_timestamp()
);
alter table public.anuncios_borradores enable row level security;
revoke all on public.anuncios_borradores from anon,authenticated;
grant select on public.anuncios_borradores to authenticated;
drop policy if exists anuncios_borradores_staff on public.anuncios_borradores;
create policy anuncios_borradores_staff on public.anuncios_borradores for select to authenticated using(public.es_staff());
create or replace function public.lab_anuncio_guarda(p_id bigint,p_datos jsonb,p_modo text,p_revision timestamptz default null,p_borrador timestamptz default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare a public.anuncios%rowtype; rev timestamptz; nuevo boolean:=p_id is null; d date; h date;
begin
 if not public.es_staff() then raise exception 'Sólo Nuvoor publica anuncios' using errcode='42501'; end if;
 if p_modo is null or p_modo not in ('borrador','publicar','apagar') then raise exception 'Operación inválida'; end if;
 if not nuevo then
  select * into strict a from public.anuncios where id=p_id for update;
  select actualizado into rev from public.anuncios_borradores where id=p_id;
  if a.actualizado is distinct from p_revision or rev is distinct from p_borrador then
   raise exception 'El anuncio cambió en otra sesión. Cierra y vuelve a abrir su ficha';
  end if;
 end if;
 if p_modo='apagar' then
  if nuevo then raise exception 'El anuncio todavía no está guardado'; end if;
  update public.anuncios set activo=false where id=p_id; return p_id;
 end if;
 d:=nullif(p_datos->>'desde','')::date; h:=nullif(p_datos->>'hasta','')::date;
 if d is not null and h is not null and d>h then raise exception 'La fecha final es anterior al inicio'; end if;
 if p_modo='publicar' and coalesce(p_datos->>'imagen','')!~'^https?://' then raise exception 'Falta una dirección válida para la imagen'; end if;
 if length(coalesce(p_datos->>'imagen',''))>5000 or length(coalesce(p_datos->>'titulo',''))>250 then raise exception 'El anuncio es demasiado largo'; end if;
 if nuevo then
  insert into public.anuncios(imagen,activo,titulo) values('',false,coalesce(p_datos->>'titulo','')) returning id into p_id;
 end if;
 if p_modo='borrador' then
  insert into public.anuncios_borradores(id,cuerpo) values(p_id,p_datos)
  on conflict(id) do update set cuerpo=excluded.cuerpo,actualizado=clock_timestamp();
  return p_id;
 end if;
 update public.anuncios set titulo=coalesce(p_datos->>'titulo',''),imagen=p_datos->>'imagen',
 anunciante=coalesce(p_datos->>'anunciante',''),enlace=nullif(p_datos->>'enlace',''),alt=coalesce(p_datos->>'alt',''),nota=coalesce(p_datos->>'nota',''),
 activo=true,orden=coalesce((p_datos->>'orden')::integer,0),desde=d,hasta=h,lugar=coalesce(p_datos->>'lugar','cotizador'),
 interna=coalesce((p_datos->>'interna')::boolean,false),
 giros=coalesce(array(select jsonb_array_elements_text(p_datos->'giros')),array[]::text[]),
 estados=coalesce(array(select jsonb_array_elements_text(p_datos->'estados')),array[]::text[])
 where id=p_id;
 delete from public.anuncios_borradores where id=p_id;
 return p_id;
end $$;
revoke all on function public.lab_anuncio_guarda(bigint,jsonb,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.lab_anuncio_guarda(bigint,jsonb,text,timestamptz,timestamptz) to authenticated;

create table if not exists public.anuncios_medicion (
 id boolean primary key default true check(id), inicio timestamptz not null default now()
);
insert into public.anuncios_medicion(id) values(true) on conflict do nothing;
create table if not exists public.anuncios_eventos (
 evento uuid primary key, anuncio_id bigint not null, cuenta_id uuid not null,
 tipo text not null check(tipo in ('vista','clic')), creado timestamptz not null default now()
);
create index if not exists anuncios_eventos_limite on public.anuncios_eventos(cuenta_id,creado);
-- Sin FK al anuncio: quitar una campaña no borra su reporte histórico.
create table if not exists public.anuncios_diario (
 anuncio_id bigint not null, cuenta_id uuid not null, fecha date not null,
 titulo text not null default '', vistas bigint not null default 0, clics bigint not null default 0,
 primary key(anuncio_id,cuenta_id,fecha)
);
create index if not exists anuncios_diario_fecha on public.anuncios_diario(fecha,anuncio_id);
alter table public.anuncios_medicion enable row level security;
alter table public.anuncios_eventos enable row level security;
alter table public.anuncios_diario enable row level security;
revoke all on public.anuncios_medicion,public.anuncios_eventos,public.anuncios_diario from anon,authenticated;

create or replace function public.anuncio_registra(p_id bigint,p_tipo text,p_cuenta uuid,p_evento uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.anuncios%rowtype; dia date; n integer;
begin
 if auth.uid() is null or p_cuenta is null or not public.es_miembro(p_cuenta) then
  raise exception 'No puedes registrar anuncios de este negocio' using errcode='42501';
 end if;
 if p_tipo is null or p_tipo not in ('vista','clic') or p_evento is null then raise exception 'Evento inválido'; end if;
 select * into a from public.anuncios where id=p_id and activo
 and (desde is null or desde<=current_date) and (hasta is null or hasta>=current_date);
 if not found then return false; end if;
 -- Un límite por negocio evita que un navegador dispare incrementos sin fin.
 perform pg_advisory_xact_lock(hashtext('anuncios:'||p_cuenta::text));
 select count(*) into n from public.anuncios_eventos where cuenta_id=p_cuenta and creado>now()-interval '1 minute';
 if n>=120 then return false; end if;
 insert into public.anuncios_eventos(evento,anuncio_id,cuenta_id,tipo) values(p_evento,p_id,p_cuenta,p_tipo)
 on conflict do nothing;
 if not found then return false; end if;
 dia:=(now() at time zone 'America/Mexico_City')::date;
 insert into public.anuncios_diario(anuncio_id,cuenta_id,fecha,titulo,vistas,clics)
 values(p_id,p_cuenta,dia,a.titulo,case when p_tipo='vista' then 1 else 0 end,case when p_tipo='clic' then 1 else 0 end)
 on conflict(anuncio_id,cuenta_id,fecha) do update set titulo=excluded.titulo,
 vistas=anuncios_diario.vistas+excluded.vistas,clics=anuncios_diario.clics+excluded.clics;
 update public.anuncios set vistas=vistas+case when p_tipo='vista' then 1 else 0 end,
 clics=clics+case when p_tipo='clic' then 1 else 0 end where id=p_id;
 return true;
end $$;
revoke all on function public.anuncio_registra(bigint,text,uuid,uuid) from public,anon;
grant execute on function public.anuncio_registra(bigint,text,uuid,uuid) to authenticated;

-- Compatibilidad con aplicaciones antiguas, antes de que actualicen cuenta.js.
create or replace function public.anuncio_marca(p_id bigint,p_tipo text)
returns void language plpgsql security definer set search_path=public as $$
begin perform public.anuncio_registra(p_id,p_tipo,public.mi_cuenta(),gen_random_uuid()); end $$;
revoke all on function public.anuncio_marca(bigint,text) from public,anon;
grant execute on function public.anuncio_marca(bigint,text) to authenticated;

create or replace function public.lab_reporte_publicidad(p_desde date,p_hasta date,p_anuncio bigint default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare resultado jsonb;
begin
 if not public.es_staff() then raise exception 'Sólo Nuvoor puede consultar este reporte' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Elige un periodo de hasta un año'; end if;
 with filas as (select * from public.anuncios_diario where fecha between p_desde and p_hasta and (p_anuncio is null or anuncio_id=p_anuncio)),
 total as (select coalesce(sum(vistas),0) vistas,coalesce(sum(clics),0) clics,count(distinct cuenta_id) alcance from filas),
 dias as (select fecha, sum(vistas) vistas,sum(clics) clics,count(distinct cuenta_id) alcance from filas group by fecha),
 campanas as (select f.anuncio_id,coalesce(max(a.titulo),max(f.titulo),'Anuncio retirado') titulo,
 sum(f.vistas) vistas,sum(f.clics) clics,count(distinct f.cuenta_id) alcance
 from filas f left join public.anuncios a on a.id=f.anuncio_id group by f.anuncio_id)
 select jsonb_build_object('desde',p_desde,'hasta',p_hasta,'zona','America/Mexico_City',
 'inicio',(select inicio from public.anuncios_medicion limit 1),'totales',(select to_jsonb(t) from total t),
 'dias',coalesce((select jsonb_agg(to_jsonb(d) order by fecha) from dias d),'[]'::jsonb),
 'campanas',coalesce((select jsonb_agg(to_jsonb(c) order by vistas desc) from campanas c),'[]'::jsonb)) into resultado;
 return resultado;
end $$;
revoke all on function public.lab_reporte_publicidad(date,date,bigint) from public,anon;
grant execute on function public.lab_reporte_publicidad(date,date,bigint) to authenticated;

create table if not exists public.lab_facturacion_equipo(usuario_id uuid primary key references public.staff(id) on delete cascade,permitido boolean not null default false);
alter table public.lab_facturacion_equipo enable row level security;
revoke all on public.lab_facturacion_equipo from anon,authenticated;
create or replace function public.lab_puede_facturar()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.staff s left join public.lab_facturacion_equipo p on p.usuario_id=s.id
 where s.id=auth.uid() and (s.rol='dueno' or coalesce(p.permitido,false)))
$$;
revoke all on function public.lab_puede_facturar() from public,anon;
grant execute on function public.lab_puede_facturar() to authenticated;

create table if not exists public.pagos_suscripcion (
 id uuid primary key default gen_random_uuid(), cuenta_id uuid not null references public.cuentas(id),
 referencia text not null unique, importe_centavos bigint not null check(importe_centavos>0),
 moneda text not null, pagado timestamptz not null, plan text not null default '', ciclo text not null default '',
 prueba boolean not null default true, creado timestamptz not null default now()
);
alter table public.pagos_suscripcion enable row level security;
revoke all on public.pagos_suscripcion from anon,authenticated;
alter table public.facturas_suscripcion add column if not exists pago_id uuid references public.pagos_suscripcion(id);
alter table public.facturas_suscripcion add column if not exists pdf_ref text;
alter table public.facturas_suscripcion add column if not exists xml_ref text;
alter table public.facturas_suscripcion add column if not exists proveedor_id text;
alter table public.facturas_suscripcion add column if not exists envio_estado text not null default 'pendiente';
alter table public.facturas_suscripcion add column if not exists envio_error text;
create unique index if not exists factura_pago_unico on public.facturas_suscripcion(pago_id) where pago_id is not null;
-- La factura sólo puede escribirla el servidor; no se admite un folio inventado desde el navegador.
revoke insert,update,delete on public.facturas_suscripcion from anon,authenticated;
drop policy if exists facsus_ver on public.facturas_suscripcion;
create policy facsus_ver on public.facturas_suscripcion for select to authenticated
 using (public.lab_puede_facturar() or (public.es_miembro(cuenta_id) and public.rol_en(cuenta_id)='admin'));
grant select on public.facturas_suscripcion to authenticated;

create or replace function public.registra_pago_suscripcion(p_cuenta uuid,p_referencia text,p_centavos bigint,p_moneda text,p_fecha timestamptz,p_plan text,p_ciclo text,p_prueba boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare pago public.pagos_suscripcion%rowtype;
begin
 if p_centavos is null or p_centavos<=0 or p_centavos>100000000000 or p_fecha is null
 or length(coalesce(p_referencia,'')) not between 4 and 220 or lower(coalesce(p_moneda,''))!~'^[a-z]{3}$' then
  raise exception 'Datos del pago inválidos';
 end if;
 insert into public.pagos_suscripcion(cuenta_id,referencia,importe_centavos,moneda,pagado,plan,ciclo,prueba)
 values(p_cuenta,p_referencia,p_centavos,lower(p_moneda),p_fecha,coalesce(p_plan,''),coalesce(p_ciclo,''),coalesce(p_prueba,true))
 on conflict(referencia) do nothing;
 select * into strict pago from public.pagos_suscripcion where referencia=p_referencia for update;
 if pago.cuenta_id<>p_cuenta or pago.importe_centavos<>p_centavos or pago.moneda<>lower(p_moneda) or pago.prueba<>coalesce(p_prueba,true) then
  raise exception 'La referencia ya corresponde a otro pago';
 end if;
 insert into public.facturas_suscripcion(cuenta_id,pago_id,periodo,concepto,total,estado,motivo)
 values(p_cuenta,pago.id,date_trunc('month',p_fecha at time zone 'America/Mexico_City')::date,
 'Suscripción Nuvoor · '||coalesce(p_plan,''),p_centavos/100.0,'pendiente','Falta configurar el emisor en Facturapi')
 on conflict(pago_id) where pago_id is not null do nothing;
 return pago.id;
end $$;
revoke all on function public.registra_pago_suscripcion(uuid,text,bigint,text,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.registra_pago_suscripcion(uuid,text,bigint,text,timestamptz,text,text,boolean) to service_role;

create or replace function public.lab_facturas_lista(p_desde date,p_hasta date,p_busqueda text default '')
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.lab_puede_facturar() then raise exception 'Necesitas permiso de facturación del dueño de Nuvoor' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Elige un periodo de hasta un año'; end if;
 return jsonb_build_object('configurada',false,'filas',coalesce((
  select jsonb_agg(to_jsonb(x) order by pagado desc) from (
   select p.id pago_id,p.cuenta_id,c.nombre negocio,p.referencia,p.importe_centavos,p.moneda,p.pagado,p.plan,p.ciclo,p.prueba,
   f.id factura_id,f.periodo,f.estado,f.uuid_sat,f.serie,f.folio,f.motivo,f.envio_estado,f.envio_error,
   (f.pdf_ref is not null) pdf,(f.xml_ref is not null) xml
   from public.pagos_suscripcion p join public.cuentas c on c.id=p.cuenta_id
   left join public.facturas_suscripcion f on f.pago_id=p.id
   where (p.pagado at time zone 'America/Mexico_City')::date between p_desde and p_hasta
   and (coalesce(p_busqueda,'')='' or c.nombre ilike '%'||p_busqueda||'%' or p.referencia ilike '%'||p_busqueda||'%' or coalesce(f.folio,'') ilike '%'||p_busqueda||'%')
   order by p.pagado desc limit 1000
  ) x),'[]'::jsonb));
end $$;
revoke all on function public.lab_facturas_lista(date,date,text) from public,anon;
grant execute on function public.lab_facturas_lista(date,date,text) to authenticated;

create or replace function public.lab_facturas_archivo(p_id bigint,p_formato text)
returns text language plpgsql security definer set search_path=public as $$
declare ruta text;
begin
 if not public.lab_puede_facturar() then raise exception 'Sin permiso de facturación' using errcode='42501'; end if;
 if p_formato not in ('pdf','xml') then raise exception 'Formato inválido'; end if;
 select case when p_formato='pdf' then pdf_ref else xml_ref end into ruta
 from public.facturas_suscripcion where id=p_id;
 if ruta is null then raise exception 'El archivo todavía no está disponible'; end if;
 insert into public.lab_bitacora(quien,que,despues)
 values(auth.uid(),'Solicitó archivo de factura',jsonb_build_object('factura',p_id,'formato',p_formato));
 return ruta;
end $$;
revoke all on function public.lab_facturas_archivo(bigint,text) from public,anon;
grant execute on function public.lab_facturas_archivo(bigint,text) to authenticated;

create or replace function public.lab_facturas_permisos(p_usuario uuid default null,p_permitir boolean default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.staff where id=auth.uid() and rol='dueno') then raise exception 'Sólo el dueño configura estos permisos' using errcode='42501'; end if;
 if p_usuario is not null and p_permitir is not null then
  if not exists(select 1 from public.staff where id=p_usuario and rol<>'dueno') then raise exception 'No se encontró esa persona del equipo'; end if;
  insert into public.lab_facturacion_equipo(usuario_id,permitido) values(p_usuario,p_permitir)
  on conflict(usuario_id) do update set permitido=excluded.permitido;
  insert into public.lab_bitacora(quien,que,despues) values(auth.uid(),'Permiso de facturación',jsonb_build_object('usuario',p_usuario,'permitido',p_permitir));
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'nombre',s.nombre,'rol',s.rol,'permitido',s.rol='dueno' or coalesce(p.permitido,false)) order by s.nombre)
 from public.staff s left join public.lab_facturacion_equipo p on p.usuario_id=s.id),'[]'::jsonb);
end $$;
revoke all on function public.lab_facturas_permisos(uuid,boolean) from public,anon;
grant execute on function public.lab_facturas_permisos(uuid,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('facturas-suscripcion','facturas-suscripcion',false,10485760,array['application/pdf','application/xml','text/xml'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists facturas_suscripcion_archivo on storage.objects;
create policy facturas_suscripcion_archivo on storage.objects for select to authenticated
 using(bucket_id='facturas-suscripcion' and public.lab_puede_facturar()
 and exists(select 1 from public.facturas_suscripcion f where f.pdf_ref=name or f.xml_ref=name));
-- Subida y escritura: sólo servidor. Los enlaces de descarga serán temporales.
notify pgrst,'reload schema';
commit;
