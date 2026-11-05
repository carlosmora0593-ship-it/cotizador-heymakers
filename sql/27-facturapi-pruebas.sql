-- 27 · Conexión y cola fiscal de PRUEBA. Después de 26. Repetible.
begin;
create table if not exists public.facturapi_conexion (
 id boolean primary key default true check(id), disponible boolean not null default false,
 organizacion text, mensaje text not null default 'Pendiente de comprobar', comprobada timestamptz
);
insert into public.facturapi_conexion(id) values(true) on conflict do nothing;
alter table public.facturapi_conexion enable row level security;
revoke all on public.facturapi_conexion from anon,authenticated;
create table if not exists public.facturapi_cola (
 factura_id bigint primary key references public.facturas_suscripcion(id),
 solicitada boolean not null default true, solicitante uuid references auth.users(id),
 token uuid, hasta timestamptz, organizacion text, solicitud jsonb,
 intentos integer not null default 0, actualizada timestamptz not null default now()
);
alter table public.facturapi_cola enable row level security;
revoke all on public.facturapi_cola from anon,authenticated;
alter table public.facturas_suscripcion add column if not exists proveedor_estado text;
alter table public.facturas_suscripcion add column if not exists proveedor_organizacion text;
alter table public.facturas_suscripcion add column if not exists pdf_sha256 text;
alter table public.facturas_suscripcion add column if not exists xml_sha256 text;

create or replace function public.lab_facturapi_estado()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.lab_puede_facturar() then raise exception 'Sin permiso de facturación' using errcode='42501'; end if;
 return (select jsonb_build_object('disponible',disponible,'mensaje',mensaje,'comprobada',comprobada,'ambiente','pruebas','correos',false) from public.facturapi_conexion where id);
end $$;
revoke all on function public.lab_facturapi_estado() from public,anon;
grant execute on function public.lab_facturapi_estado() to authenticated;

create or replace function public.facturapi_conexion_guarda(p_disponible boolean,p_organizacion text,p_mensaje text)
returns void language sql security definer set search_path=public as $$
 update public.facturapi_conexion set disponible=p_disponible,organizacion=p_organizacion,mensaje=left(p_mensaje,240),comprobada=clock_timestamp() where id
$$;
revoke all on function public.facturapi_conexion_guarda(boolean,text,text) from public,anon,authenticated;
grant execute on function public.facturapi_conexion_guarda(boolean,text,text) to service_role;

-- La solicitud (y su autorización) se guarda antes de despertar el servidor.
create or replace function public.lab_facturapi_solicita(p_factura bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare f public.facturas_suscripcion%rowtype;p public.pagos_suscripcion%rowtype;
begin
 if not public.lab_puede_facturar() then raise exception 'Sin permiso de facturación' using errcode='42501'; end if;
 select * into strict f from public.facturas_suscripcion where id=p_factura for update;
 select * into strict p from public.pagos_suscripcion where id=f.pago_id;
 if not p.prueba or p.moneda<>'mxn' then raise exception 'Esta conexión sólo procesa pagos de prueba en MXN'; end if;
 if f.estado='cancelada' then raise exception 'No se puede procesar una factura cancelada'; end if;
 if f.pdf_ref is not null and f.xml_ref is not null and f.estado='timbrada' then return false; end if;
 insert into public.facturapi_cola(factura_id,solicitante) values(p_factura,auth.uid())
 on conflict(factura_id) do update set solicitada=true,solicitante=excluded.solicitante,actualizada=clock_timestamp();
 insert into public.lab_bitacora(quien,que,despues) values(auth.uid(),'Solicitó factura de prueba',jsonb_build_object('factura',p_factura));
 return true;
end $$;
revoke all on function public.lab_facturapi_solicita(bigint) from public,anon;
grant execute on function public.lab_facturapi_solicita(bigint) to authenticated;

create or replace function public.facturapi_reserva(p_token uuid,p_organizacion text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q public.facturapi_cola%rowtype;f public.facturas_suscripcion%rowtype;p public.pagos_suscripcion%rowtype;
begin
 if p_token is null or length(coalesce(p_organizacion,'')) not between 1 and 100 then raise exception 'Falta organización o turno'; end if;
 select * into q from public.facturapi_cola where solicitada and (hasta is null or hasta<now())
 order by actualizada for update skip locked limit 1;
 if not found then return null; end if;
 select * into strict f from public.facturas_suscripcion where id=q.factura_id;
 select * into strict p from public.pagos_suscripcion where id=f.pago_id;
 if not p.prueba or p.moneda<>'mxn' then raise exception 'Pago ajeno a las pruebas'; end if;
 if q.organizacion is not null and q.organizacion<>p_organizacion then raise exception 'La factura pertenece a otra organización; revisa la conexión'; end if;
 update public.facturapi_cola set token=p_token,hasta=now()+interval '5 minutes',organizacion=p_organizacion,intentos=intentos+1 where factura_id=f.id;
 return jsonb_build_object('factura',to_jsonb(f),'pago',to_jsonb(p),'solicitud',q.solicitud);
end $$;
revoke all on function public.facturapi_reserva(uuid,text) from public,anon,authenticated;
grant execute on function public.facturapi_reserva(uuid,text) to service_role;

-- Sólo actualiza el trabajo bajo el turno vigente. El cuerpo del proveedor
-- queda fijado antes de POST: una respuesta perdida se reintenta idéntica.
create or replace function public.facturapi_anota(p_factura bigint,p_token uuid,p_datos jsonb,p_final boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare q public.facturapi_cola%rowtype;f public.facturas_suscripcion%rowtype;
begin
 select * into strict q from public.facturapi_cola where factura_id=p_factura for update;
 if p_token is null or q.token is distinct from p_token or q.hasta is null or q.hasta<now() then raise exception 'El turno de la factura caducó'; end if;
 select * into strict f from public.facturas_suscripcion where id=p_factura for update;
 if p_datos ? 'solicitud' then
  if q.solicitud is not null and q.solicitud is distinct from p_datos->'solicitud' then raise exception 'No se puede cambiar el cuerpo de un reintento'; end if;
  update public.facturapi_cola set solicitud=p_datos->'solicitud' where factura_id=p_factura;
 end if;
 if p_datos ? 'proveedor_id' then
  if f.proveedor_id is not null and f.proveedor_id<>p_datos->>'proveedor_id' then raise exception 'Otro documento ya fue asignado al pago'; end if;
  update public.facturas_suscripcion set proveedor_id=p_datos->>'proveedor_id',proveedor_organizacion=q.organizacion,
   proveedor_estado=p_datos->>'proveedor_estado',uuid_sat=coalesce(p_datos->>'uuid_sat',uuid_sat),
   serie=coalesce(p_datos->>'serie',serie),folio=coalesce(p_datos->>'folio',folio) where id=p_factura;
 end if;
 if p_datos ? 'pdf_ref' then
  if f.proveedor_estado is distinct from 'valid' or f.uuid_sat is null or p_datos->>'xml_ref' is null then raise exception 'El documento o sus originales todavía no están completos'; end if;
  if coalesce(p_datos->>'pdf_sha256','')!~'^[a-f0-9]{64}$' or coalesce(p_datos->>'xml_sha256','')!~'^[a-f0-9]{64}$' then raise exception 'Falta verificar los originales'; end if;
  update public.facturas_suscripcion set pdf_ref=p_datos->>'pdf_ref',xml_ref=p_datos->>'xml_ref',
   pdf_sha256=p_datos->>'pdf_sha256',xml_sha256=p_datos->>'xml_sha256',subtotal=(p_datos->>'subtotal')::numeric,iva=(p_datos->>'iva')::numeric,
   estado='timbrada',motivo='Comprobante de prueba. Sin validez fiscal; receptor ficticio.' where id=p_factura;
 end if;
 if p_datos ? 'error' then update public.facturas_suscripcion set motivo=left(p_datos->>'error',240) where id=p_factura; end if;
 if p_final then
  update public.facturapi_cola set solicitada=false,token=null,hasta=null,actualizada=clock_timestamp() where factura_id=p_factura;
  insert into public.lab_bitacora(quien,que,despues) values(q.solicitante,'Resultado de factura de prueba',jsonb_build_object('factura',p_factura,'archivos',p_datos ? 'pdf_ref','pendiente',p_datos->>'error'));
 end if;
end $$;
revoke all on function public.facturapi_anota(bigint,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.facturapi_anota(bigint,uuid,jsonb,boolean) to service_role;
create or replace function public.lab_facturas_lista(p_desde date,p_hasta date,p_busqueda text default '')
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.lab_puede_facturar() then raise exception 'Necesitas permiso de facturación del dueño de Nuvoor' using errcode='42501'; end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>366 then raise exception 'Elige un periodo de hasta un año'; end if;
 return jsonb_build_object('configurada',(select disponible from public.facturapi_conexion where id),'filas',coalesce((
  select jsonb_agg(to_jsonb(x) order by pagado desc) from (
   select p.id pago_id,p.cuenta_id,c.nombre negocio,p.referencia,p.importe_centavos,p.moneda,p.pagado,p.plan,p.ciclo,p.prueba,
   f.id factura_id,f.periodo,f.estado,f.uuid_sat,f.serie,f.folio,f.motivo,f.envio_estado,f.envio_error,f.proveedor_id,f.proveedor_estado,
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


notify pgrst,'reload schema';
commit;
