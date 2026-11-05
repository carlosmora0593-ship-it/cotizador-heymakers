-- 28 · CFDI de ventas, exclusivamente TEST. Después de 19 y 26. Repetible.
-- Emisor en Ajustes; operación en los botones de cada POS. Sin llaves aquí.
begin;
create table if not exists public.fiscal_pos_emisores (
 cuenta_id uuid primary key references public.cuentas(id), organizacion text not null,
 secreto_nombre text not null check(secreto_nombre ~ '^FACTURAPI_POS_PRUEBA(_[A-Z0-9_]{1,48})?$'),
 razon text not null default '',rfc text not null default '',cp text not null default '',
 comprobado timestamptz not null default now(), activo boolean not null default true
);
alter table public.fiscal_pos_emisores enable row level security;
revoke all on public.fiscal_pos_emisores from public,anon,authenticated;
grant select on public.fiscal_pos_emisores to service_role;
create table if not exists public.fiscal_pos_facturas (
 id uuid primary key default gen_random_uuid(),cuenta_id uuid not null references public.cuentas(id),
 sistema text not null check(sistema in ('taller','restaurant','tiendita')), documento text not null,
 ambiente text not null default 'test' check(ambiente='test'),organizacion text not null,secreto_nombre text not null,
 origen_firma text not null,solicitud jsonb not null,total_centavos bigint not null check(total_centavos>0),
 estado text not null default 'pendiente' check(estado in ('pendiente','procesando','archivos_pendientes','timbrada')),
 proveedor_id text,uuid_sat text,pdf_ref text,xml_ref text,pdf_sha256 text,xml_sha256 text,
 error text,turno uuid,hasta timestamptz,intentos int not null default 0,
 creado timestamptz not null default now(),actualizado timestamptz not null default now(),
 unique(cuenta_id,sistema,documento,ambiente),unique(organizacion,proveedor_id)
);
alter table public.fiscal_pos_facturas enable row level security;
revoke all on public.fiscal_pos_facturas from public,anon,authenticated;
grant select on public.fiscal_pos_facturas to authenticated;
drop policy if exists fiscal_pos_lectura on public.fiscal_pos_facturas;
create policy fiscal_pos_lectura on public.fiscal_pos_facturas for select to authenticated
 using(public.rol_en(cuenta_id) in ('admin','ventas'));

create or replace function public.fiscal_pos_contexto(p_cuenta uuid,p_sistema text,p_documento text default '',p_escritura boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c public.cuentas%rowtype;e public.fiscal_pos_emisores%rowtype;d public.documentos%rowtype;f public.fiscal_pos_facturas%rowtype;col text;
begin
 if coalesce(public.rol_en(p_cuenta),'') not in ('admin','ventas') then raise exception 'Sin permiso en este negocio' using errcode='42501';end if;
 select * into strict c from public.cuentas where id=p_cuenta;
 if p_sistema not in ('taller','restaurant','tiendita') or not (p_sistema=coalesce(c.producto,'taller') or coalesce(to_jsonb(c)->'productos','[]'::jsonb) ? p_sistema) then raise exception 'Sistema ajeno a esta cuenta';end if;
 if p_escritura and (c.estado<>'activa' or c.plan='ninguno' or c.vence is null or c.vence<=now()) then raise exception 'La suscripción debe estar activa para generar una factura';end if;
 select * into e from public.fiscal_pos_emisores where cuenta_id=p_cuenta and activo;
 if coalesce(p_documento,'')<>'' then
  col:=case when p_sistema='restaurant' then 'rest_tickets' else 'ventas' end;
  select * into d from public.documentos where cuenta_id=p_cuenta and coleccion=col and doc_id=p_documento;
  select * into f from public.fiscal_pos_facturas where cuenta_id=p_cuenta and sistema=p_sistema and documento=p_documento;
 end if;
 return jsonb_build_object('emisor',case when e.cuenta_id is null then null else jsonb_build_object('razon',e.razon,'rfc',e.rfc,'cp',e.cp,'ambiente','test','comprobado',e.comprobado) end,
  'documento',d.cuerpo,'firma',case when d.cuerpo is null then null else md5(d.cuerpo::text) end,'factura',case when f.id is null then null else to_jsonb(f)-'secreto_nombre'-'turno'-'hasta' end,'rol',public.rol_en(p_cuenta));
end $$;
revoke all on function public.fiscal_pos_contexto(uuid,text,text,boolean) from public,anon;
grant execute on function public.fiscal_pos_contexto(uuid,text,text,boolean) to authenticated;

-- Sólo el servidor, tras verificar permiso financiero del Lab y la organización.
create or replace function public.fiscal_pos_emisor_asigna(p_cuenta uuid,p_org text,p_secreto text,p_razon text,p_rfc text,p_cp text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(p_org,'')!~'^[a-zA-Z0-9_-]{1,100}$' then raise exception 'Organización inválida';end if;
 if exists(select 1 from public.fiscal_pos_facturas f where f.cuenta_id=p_cuenta and (f.organizacion<>p_org or f.secreto_nombre<>p_secreto)) then raise exception 'Este negocio ya tiene comprobantes con otro emisor. Conserva la conexión del expediente';end if;
 insert into public.fiscal_pos_emisores(cuenta_id,organizacion,secreto_nombre,razon,rfc,cp)
 values(p_cuenta,p_org,p_secreto,left(p_razon,300),left(p_rfc,13),left(p_cp,5))
 on conflict(cuenta_id) do update set organizacion=excluded.organizacion,secreto_nombre=excluded.secreto_nombre,
 razon=excluded.razon,rfc=excluded.rfc,cp=excluded.cp,comprobado=now(),activo=true;
end
$$;
revoke all on function public.fiscal_pos_emisor_asigna(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.fiscal_pos_emisor_asigna(uuid,text,text,text,text,text) to service_role;

create or replace function public.fiscal_pos_reserva(p_actor uuid,p_cuenta uuid,p_sistema text,p_documento text,p_firma text,p_solicitud jsonb,p_total bigint,p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.cuentas%rowtype;e public.fiscal_pos_emisores%rowtype;d public.documentos%rowtype;f public.fiscal_pos_facturas%rowtype;col text;
begin
 if not exists(select 1 from public.membresias where usuario_id=p_actor and cuenta_id=p_cuenta and rol in ('admin','ventas')) then raise exception 'Sin permiso en este negocio' using errcode='42501';end if;
 select * into strict c from public.cuentas where id=p_cuenta;
 if c.estado<>'activa' or c.plan='ninguno' or c.vence is null or c.vence<=now() then raise exception 'Suscripción inactiva';end if;
 if p_sistema not in ('taller','restaurant','tiendita') or not (p_sistema=coalesce(c.producto,'taller') or coalesce(to_jsonb(c)->'productos','[]'::jsonb) ? p_sistema) then raise exception 'Sistema incorrecto';end if;
 if p_token is null then raise exception 'Falta turno de emisión';end if;
 -- Serializa las altas simultáneas de un mismo origen antes del INSERT.
 perform pg_advisory_xact_lock(hashtext(p_cuenta::text||'/'||p_sistema||'/'||p_documento));
 select * into f from public.fiscal_pos_facturas where cuenta_id=p_cuenta and sistema=p_sistema and documento=p_documento for update;
 if f.id is null then
  select * into strict e from public.fiscal_pos_emisores where cuenta_id=p_cuenta and activo;
  col:=case when p_sistema='restaurant' then 'rest_tickets' else 'ventas' end;
  select * into strict d from public.documentos where cuenta_id=p_cuenta and coleccion=col and doc_id=p_documento for share;
  if md5(d.cuerpo::text) is distinct from p_firma then raise exception 'La venta cambió. Revisa los datos de nuevo';end if;
  if p_solicitud is null or jsonb_typeof(p_solicitud)<>'object' or p_total<=0 then raise exception 'Falta validar el comprobante';end if;
  insert into public.fiscal_pos_facturas(cuenta_id,sistema,documento,organizacion,secreto_nombre,origen_firma,solicitud,total_centavos)
  values(p_cuenta,p_sistema,p_documento,e.organizacion,e.secreto_nombre,p_firma,p_solicitud,p_total) returning * into f;
 elsif p_solicitud is not null and p_solicitud is distinct from f.solicitud then
  raise exception 'La solicitud ya está fijada. Consulta la factura existente';
 end if;
 if f.estado='timbrada' then return jsonb_build_object('factura',to_jsonb(f),'adquirido',false);end if;
 if f.hasta is not null and f.hasta>now() then return jsonb_build_object('factura',to_jsonb(f),'adquirido',false);end if;
 update public.fiscal_pos_facturas set turno=p_token,hasta=clock_timestamp()+interval '5 minutes',intentos=intentos+1,
 estado=case when proveedor_id is null then 'procesando' else 'archivos_pendientes' end,actualizado=clock_timestamp() where id=f.id returning * into f;
 return jsonb_build_object('factura',to_jsonb(f),'adquirido',true);
end $$;
revoke all on function public.fiscal_pos_reserva(uuid,uuid,text,text,text,jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.fiscal_pos_reserva(uuid,uuid,text,text,text,jsonb,bigint,uuid) to service_role;

create or replace function public.fiscal_pos_resultado(p_id uuid,p_token uuid,p_datos jsonb,p_final boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare f public.fiscal_pos_facturas%rowtype;
begin
 select * into strict f from public.fiscal_pos_facturas where id=p_id for update;
 if p_token is null or f.turno is distinct from p_token or f.hasta is null or f.hasta<now() then raise exception 'Turno vencido';end if;
 if p_datos ? 'proveedor_id' then
  if f.proveedor_id is not null and f.proveedor_id<>p_datos->>'proveedor_id' then raise exception 'Otro comprobante ya está asociado';end if;
  update public.fiscal_pos_facturas set proveedor_id=p_datos->>'proveedor_id',uuid_sat=coalesce(p_datos->>'uuid_sat',uuid_sat),estado='archivos_pendientes' where id=p_id;
 end if;
 if p_datos ? 'pdf_ref' then
  if coalesce((select uuid_sat from public.fiscal_pos_facturas where id=p_id),'')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   or coalesce(p_datos->>'pdf_sha256','')!~'^[a-f0-9]{64}$' or coalesce(p_datos->>'xml_sha256','')!~'^[a-f0-9]{64}$'
   or coalesce(p_datos->>'pdf_ref','') not like f.cuenta_id::text||'/'||f.id::text||'/test/%'
   or coalesce(p_datos->>'xml_ref','') not like f.cuenta_id::text||'/'||f.id::text||'/test/%' then raise exception 'Originales incompletos';end if;
  update public.fiscal_pos_facturas set pdf_ref=p_datos->>'pdf_ref',xml_ref=p_datos->>'xml_ref',pdf_sha256=p_datos->>'pdf_sha256',xml_sha256=p_datos->>'xml_sha256',estado='timbrada',error=null where id=p_id;
 end if;
 if p_datos ? 'error' then update public.fiscal_pos_facturas set error=left(p_datos->>'error',240),estado=case when proveedor_id is null then 'pendiente' else 'archivos_pendientes' end where id=p_id;end if;
 update public.fiscal_pos_facturas set actualizado=clock_timestamp(),turno=case when p_final then null else turno end,hasta=case when p_final then null else hasta end where id=p_id;
end $$;
revoke all on function public.fiscal_pos_resultado(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.fiscal_pos_resultado(uuid,uuid,jsonb,boolean) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('facturas-ventas','facturas-ventas',false,10485760,array['application/pdf','application/xml','text/xml'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists fiscal_pos_originales on storage.objects;
create policy fiscal_pos_originales on storage.objects for select to authenticated using(
 bucket_id='facturas-ventas' and exists(select 1 from public.fiscal_pos_facturas f where f.estado='timbrada'
 and public.rol_en(f.cuenta_id) in ('admin','ventas') and (f.pdf_ref=name or f.xml_ref=name)));
notify pgrst,'reload schema';
commit;
