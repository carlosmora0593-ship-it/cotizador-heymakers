-- Ejecutar después de 20-restaurant-nube.sql. Los permisos son sólo para imprimir.
begin;

create table if not exists public.rest_estaciones_bt (
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  aparato text not null,
  usuario_id uuid not null,
  huella bytea not null unique,
  evento text not null,
  rutas jsonb not null,
  desde timestamptz not null,
  vence timestamptz not null,
  primary key (cuenta_id, aparato)
);
alter table public.rest_estaciones_bt enable row level security;
revoke all on public.rest_estaciones_bt from public, anon, authenticated;

create index if not exists rest_lineas_bt_pendientes
  on public.documentos (cuenta_id, (cuerpo->>'eventoId'), actualizado)
  where coleccion = 'rest_lineas' and cuerpo ? 'envioId';
create index if not exists rest_lineas_bt_envio
  on public.documentos (cuenta_id, (cuerpo->>'comandaId'), (cuerpo->>'envioId'))
  where coleccion = 'rest_lineas' and cuerpo ? 'envioId';
create index if not exists rest_comandas_bt_abiertas
  on public.documentos (cuenta_id, (cuerpo->>'id'), (cuerpo->>'eventoId'))
  where coleccion = 'rest_comandas' and cuerpo->>'estado' = 'abierta';

create or replace function public.rest_bt_activa(p_cuenta uuid, p_aparato text, p_evento text, p_rutas jsonb)
returns text
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  if public.rol_en(p_cuenta) is distinct from 'admin' then
    raise exception 'Se necesita un administrador del negocio' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cuentas c where c.id=p_cuenta and c.estado='activa'
      and c.plan <> 'ninguno' and (c.vence is null or c.vence > now())
  ) then
    raise exception 'La suscripción del negocio está inactiva' using errcode = '42501';
  end if;
  if coalesce(length(p_aparato),0) not between 1 and 120 or coalesce(length(p_evento),121) > 120
     or jsonb_typeof(p_rutas) is distinct from 'object' or octet_length(p_rutas::text) > 10000 then
    raise exception 'Configuración de estación inválida' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_each(p_rutas)) not between 1 and 16 or exists (
    select 1 from jsonb_each(p_rutas) as r
      where length(r.key) not between 1 and 300 or jsonb_typeof(r.value) <> 'array'
  ) then
    raise exception 'Rutas de cocina inválidas' using errcode = '22023';
  end if;

  insert into public.rest_estaciones_bt (cuenta_id,aparato,usuario_id,huella,evento,rutas,desde,vence)
  values (p_cuenta,p_aparato,auth.uid(),sha256(convert_to(v_token,'UTF8')),p_evento,p_rutas,now(),now()+interval '18 hours')
  on conflict (cuenta_id,aparato) do update set
    usuario_id=excluded.usuario_id, huella=excluded.huella, evento=excluded.evento, rutas=excluded.rutas,
    desde=case when rest_estaciones_bt.vence > now() and rest_estaciones_bt.evento=excluded.evento
                then rest_estaciones_bt.desde else excluded.desde end,
    vence=excluded.vence;
  return v_token;
end $$;

-- La clave sólo resuelve una estación vigente y una de las rutas autorizadas.
create or replace function public.rest_bt_estacion(p_token text, p_ruta text)
returns public.rest_estaciones_bt
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v public.rest_estaciones_bt;
begin
  select s.* into v from public.rest_estaciones_bt s
  join public.membresias m on m.cuenta_id=s.cuenta_id and m.usuario_id=s.usuario_id and m.rol='admin'
  join public.cuentas c on c.id=s.cuenta_id and c.estado='activa' and c.plan <> 'ninguno'
    and (c.vence is null or c.vence > now())
  where length(p_token)=72 and s.huella=sha256(convert_to(p_token,'UTF8'))
    and s.vence > now() and s.rutas ? p_ruta;
  if not found then raise exception 'La estación ya no está autorizada' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function public.rest_bt_toma(p_token text, p_ruta text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v public.rest_estaciones_bt := public.rest_bt_estacion(p_token,p_ruta);
  v_cats jsonb := v.rutas->p_ruta;
  v_envio text;
  v_comanda jsonb;
  v_lineas jsonb;
begin
  -- Espera el lote completo, incluso si esta impresora sólo recibe una categoría.
  select l.cuerpo->>'envioId', c.cuerpo into v_envio, v_comanda
  from public.documentos l
  join public.documentos c on c.cuenta_id=l.cuenta_id and c.coleccion='rest_comandas'
    and c.cuerpo->>'id'=l.cuerpo->>'comandaId' and c.cuerpo->>'eventoId'=v.evento and c.cuerpo->>'estado'='abierta'
  where l.cuenta_id=v.cuenta_id and l.coleccion='rest_lineas' and l.cuerpo ? 'envioId'
    and l.cuerpo->>'eventoId'=v.evento and l.actualizado>=v.desde
    and l.cuerpo->>'enviadaTs' ~ '^[0-9]{1,16}$'
    and (case when l.cuerpo->>'enviadaTs' ~ '^[0-9]{1,16}$' then (l.cuerpo->>'enviadaTs')::bigint end)
        >= extract(epoch from v.desde - interval '2 minutes')*1000
    and nullif(l.cuerpo->>'enviada','') is not null and l.cuerpo->>'cancelada' is distinct from 'true'
    and l.cuerpo #> array['impreso',p_ruta] is null
    and (v_cats='[]'::jsonb or v_cats ? (l.cuerpo->>'categoria'))
    and (select count(*) from public.documentos b where b.cuenta_id=l.cuenta_id and b.coleccion='rest_lineas'
          and b.cuerpo ? 'envioId' and b.cuerpo->>'comandaId'=l.cuerpo->>'comandaId'
          and b.cuerpo->>'envioId'=l.cuerpo->>'envioId')
        >= (case when l.cuerpo->>'envioTotal' ~ '^[1-9][0-9]{0,3}$' then (l.cuerpo->>'envioTotal')::int else 1 end)
  order by l.actualizado,l.doc_id limit 1;
  if not found then return null; end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with tomadas as (
    update public.documentos d
      set cuerpo=jsonb_set(d.cuerpo,'{impreso}',coalesce(d.cuerpo->'impreso','{}'::jsonb)
        || jsonb_build_object(p_ruta,jsonb_build_object('por',v.aparato,'en',clock_timestamp(),'ok',false)),true)
    where d.cuenta_id=v.cuenta_id and d.coleccion='rest_lineas' and d.cuerpo->>'eventoId'=v.evento
      and d.cuerpo->>'comandaId'=v_comanda->>'id' and d.cuerpo->>'envioId'=v_envio
      and nullif(d.cuerpo->>'enviada','') is not null and d.cuerpo->>'cancelada' is distinct from 'true'
      and d.cuerpo #> array['impreso',p_ruta] is null
      and (v_cats='[]'::jsonb or v_cats ? (d.cuerpo->>'categoria'))
    returning d.doc_id, d.cuerpo
  )
  select jsonb_agg(jsonb_build_object(
    'doc_id',t.doc_id,'nombre',t.cuerpo->'nombre','cant',t.cuerpo->'cant',
    'comensal',t.cuerpo->'comensal','mods',t.cuerpo->'mods','nota',t.cuerpo->'nota',
    'enviada',t.cuerpo->'enviada'
  ) order by t.doc_id) into v_lineas from tomadas t;
  if v_lineas is null then return null; end if;
  return jsonb_build_object(
    'mesa',v_comanda->'mesaNombre','folio',v_comanda->'folio','fecha',v_comanda->'fecha',
    'llevar',v_comanda->>'mesaId'='llevar',
    'app',case when nullif(v_comanda->>'appId','') is not null then coalesce(nullif(v_comanda->>'appNombre',''),'Plataforma') end,
    'mesero',v_comanda->'mesero','personas',v_comanda->'personas','lineas',v_lineas
  );
end $$;

create or replace function public.rest_bt_confirma(p_token text, p_ruta text, p_lineas text[])
returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v public.rest_estaciones_bt := public.rest_bt_estacion(p_token,p_ruta);
begin
  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  update public.documentos d set cuerpo=jsonb_set(d.cuerpo,array['impreso',p_ruta],
    (d.cuerpo #> array['impreso',p_ruta]) || jsonb_build_object('ok',true,'confirmado',clock_timestamp()),true)
  where d.cuenta_id=v.cuenta_id and d.coleccion='rest_lineas' and d.doc_id=any(p_lineas)
    and d.cuerpo->>'eventoId'=v.evento and d.cuerpo #>> array['impreso',p_ruta,'por']=v.aparato
    and d.cuerpo #>> array['impreso',p_ruta,'ok']='false';
end $$;

create or replace function public.rest_bt_apaga(p_cuenta uuid, p_aparato text)
returns void
language sql security definer set search_path = pg_catalog, public
as $$
  delete from public.rest_estaciones_bt where cuenta_id=p_cuenta and aparato=p_aparato and usuario_id=auth.uid();
$$;

revoke all on function public.rest_bt_estacion(text,text) from public, anon, authenticated;
revoke all on function public.rest_bt_activa(uuid,text,text,jsonb), public.rest_bt_apaga(uuid,text) from public, anon, authenticated;
grant execute on function public.rest_bt_activa(uuid,text,text,jsonb), public.rest_bt_apaga(uuid,text) to authenticated;
revoke all on function public.rest_bt_toma(text,text), public.rest_bt_confirma(text,text,text[]) from public, anon, authenticated;
grant execute on function public.rest_bt_toma(text,text), public.rest_bt_confirma(text,text,text[]) to anon;

notify pgrst, 'reload schema';
commit;
