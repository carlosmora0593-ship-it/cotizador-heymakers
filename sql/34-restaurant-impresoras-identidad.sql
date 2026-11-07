-- Después de SQL 20, 29 y 32. Conserva los reclamos de impresión anteriores.
begin;

create table if not exists public.rest_cocina_equipos (
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  aparato text not null,
  evento text not null,
  nombre text not null,
  impresoras jsonb not null,
  actualizado timestamptz not null default clock_timestamp(),
  primary key(cuenta_id,aparato,evento)
);
alter table public.rest_cocina_equipos enable row level security;
revoke all on public.rest_cocina_equipos from public,anon,authenticated;

create or replace function public.rest_cocina_estaciones(p_cuenta uuid,p_evento text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este restaurante.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(e)) from public.rest_cocina_equipos e
    where e.cuenta_id=p_cuenta and e.evento=coalesce(p_evento,'')),'[]'::jsonb) ||
    coalesce((select jsonb_agg(jsonb_build_object('aparato',b.aparato,'nombre','Tablet de cocina',
      'evento',b.evento,'impresoras',(select jsonb_agg(jsonb_build_object('nombre',split_part(r.key,'|',1),
        'ruta',r.key,'categorias',r.value,'cocina',true,'cancela',false)) from jsonb_each(b.rutas) r)))
      from public.rest_estaciones_bt b where b.cuenta_id=p_cuenta and b.evento=coalesce(p_evento,'')
        and b.vence>clock_timestamp() and not exists(select 1 from public.rest_cocina_equipos e
          where e.cuenta_id=b.cuenta_id and e.aparato=b.aparato and e.evento=b.evento)),'[]'::jsonb);
end $$;

create or replace function public.rest_ruta_impresora(p_cuenta uuid,p_aparato text,p_ruta text)
returns text language sql stable security definer set search_path=public as $$
  select coalesce((select p->>'ruta' from public.rest_cocina_equipos e
    cross join lateral jsonb_array_elements(e.impresoras) p
    where e.cuenta_id=p_cuenta and e.aparato=p_aparato
      and (p->>'ruta'=regexp_replace(p_ruta,'\|cancelacion$','')
        or p->'aliases' ? regexp_replace(p_ruta,'\|cancelacion$',''))
    order by e.actualizado desc limit 1) || case when right(p_ruta,12)='|cancelacion' then '|cancelacion' else '' end,p_ruta)
$$;

create or replace function public.rest_cocina_configurar(
  p_cuenta uuid,p_aparato text,p_evento text,p_nombre text,p_impresoras jsonb,p_confirmar boolean default false
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_evento text:=coalesce(p_evento,'');
  v_prev jsonb;
  v_lista jsonb:='[]'::jsonb;
  v_p jsonb;
  v_ant jsonb;
  v_conflictos jsonb;
  v_alias text;
  v_ruta text;
  v_sufijo text;
begin
  if public.rol_en(p_cuenta) is distinct from 'admin' then
    raise exception 'Se necesita un administrador del negocio.' using errcode='42501';
  end if;
  if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' or v_evento !~ '^[a-zA-Z0-9_-]{0,120}$'
    or jsonb_typeof(p_impresoras) is distinct from 'array' or jsonb_array_length(p_impresoras)>16
    or octet_length(p_impresoras::text)>20000 then
    raise exception 'Configuración de cocina inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rest_impresoras:'||p_cuenta::text,0));
  select impresoras into v_prev from public.rest_cocina_equipos
    where cuenta_id=p_cuenta and aparato=p_aparato and evento=v_evento;
  for v_p in select value from jsonb_array_elements(p_impresoras) loop
    if coalesce(v_p->>'id','') !~ '^[a-zA-Z0-9_-]{1,120}$'
      or coalesce(v_p->>'ruta','') !~ '^(bt-[a-f0-9]{12}|sistema-[a-zA-Z0-9_-]{1,120})$'
      or jsonb_typeof(v_p->'categorias') is distinct from 'array'
      or jsonb_typeof(v_p->'aliases') is distinct from 'array'
      or jsonb_array_length(v_p->'aliases')>64 then
      raise exception 'Identidad de impresora inválida.' using errcode='22023';
    end if;
    select p into v_ant from jsonb_array_elements(coalesce(v_prev,'[]'::jsonb)) p where p->>'id'=v_p->>'id';
    if v_ant->>'ruta' is distinct from v_p->>'ruta' then v_ant:=null; end if;
    -- Los nombres viejos siguen resolviendo la misma impresora física.
    v_p:=v_p||jsonb_build_object('aliases',(select coalesce(jsonb_agg(distinct a),'[]'::jsonb)
      from jsonb_array_elements(coalesce(v_ant->'aliases','[]'::jsonb)||(v_p->'aliases')) a));
    v_lista:=v_lista||jsonb_build_array(v_p);
  end loop;
  if exists(select 1 from jsonb_array_elements(v_lista) a cross join jsonb_array_elements(v_lista) b
    where a->>'id'<b->>'id' and a->>'ruta'=b->>'ruta'
      and (a->>'cocina'='true' or a->>'cancela'='true') and (b->>'cocina'='true' or b->>'cancela'='true')
      and (a->'categorias'='[]'::jsonb or b->'categorias'='[]'::jsonb or exists(
        select 1 from jsonb_array_elements_text(a->'categorias') c where b->'categorias' ? c))) then
    raise exception 'Esa impresora Bluetooth ya está configurada para las mismas categorías.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(distinct jsonb_build_object('aparato',e->>'aparato','nombre',e->>'nombre',
    'impresora',b->>'nombre','categorias',b->'categorias','ruta',b->>'ruta')),'[]'::jsonb)
    into v_conflictos from jsonb_array_elements(public.rest_cocina_estaciones(p_cuenta,v_evento)) e
    cross join lateral jsonb_array_elements(e->'impresoras') b cross join jsonb_array_elements(v_lista) a
    where e->>'aparato'<>p_aparato
      and not exists(select 1 from jsonb_array_elements(coalesce(v_prev,'[]'::jsonb)) previo
        where (previo-'aliases'-'nombre')=(a-'aliases'-'nombre'))
      and (a->>'cocina'='true' and b->>'cocina'='true' or a->>'cancela'='true' and b->>'cancela'='true')
      and (a->'categorias'='[]'::jsonb or b->'categorias'='[]'::jsonb or exists(
        select 1 from jsonb_array_elements_text(a->'categorias') c where b->'categorias' ? c));
  if v_conflictos<>'[]'::jsonb and v_lista is distinct from v_prev and not coalesce(p_confirmar,false) then
    return jsonb_build_object('guardado',false,'conflictos',v_conflictos);
  end if;
  insert into public.rest_cocina_equipos(cuenta_id,aparato,evento,nombre,impresoras)
    values(p_cuenta,p_aparato,v_evento,left(coalesce(nullif(btrim(p_nombre),''),'Dispositivo de cocina'),80),v_lista)
    on conflict(cuenta_id,aparato,evento) do update set nombre=excluded.nombre,
      impresoras=excluded.impresoras,actualizado=clock_timestamp();
  perform set_config('makers.rest_reclamo_autorizado','si',true);
  for v_p in select value from jsonb_array_elements(v_lista) loop
    for v_alias in select jsonb_array_elements_text(v_p->'aliases') loop
      foreach v_sufijo in array array['','|cancelacion'] loop
        v_ruta:=(v_p->>'ruta')||v_sufijo;
        update public.documentos d set cuerpo=jsonb_set(d.cuerpo,array['impreso',v_ruta],
          d.cuerpo #> array['impreso',v_alias||v_sufijo],true)
          where d.cuenta_id=p_cuenta and d.coleccion='rest_lineas'
            and coalesce(d.cuerpo->>'eventoId','')=v_evento
            and d.cuerpo #>> array['impreso',v_alias||v_sufijo,'por']=p_aparato
            and not exists(select 1 from jsonb_array_elements(coalesce(v_prev,'[]'::jsonb)) anterior
              where anterior->>'id'=v_p->>'id' and anterior->>'ruta' is distinct from v_p->>'ruta')
            and (d.cuerpo #> array['impreso',v_ruta] is null
              or d.cuerpo #>> array['impreso',v_ruta,'ok'] is distinct from 'true'
                and d.cuerpo #>> array['impreso',v_alias||v_sufijo,'ok']='true');
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('guardado',true,'conflictos',v_conflictos,'impresoras',v_lista);
end $$;

revoke all on function public.rest_ruta_impresora(uuid,text,text) from public,anon,authenticated;
revoke all on function public.rest_cocina_estaciones(uuid,text),public.rest_cocina_configurar(uuid,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rest_cocina_estaciones(uuid,text),public.rest_cocina_configurar(uuid,text,text,text,jsonb,boolean) to authenticated;

-- Las funciones de reclamo que siguen conservan sus permisos y la lógica de peso del SQL 32.

create or replace function public.rest_reclama_impresion(
  p_cuenta uuid,
  p_lineas text[],
  p_ruta text,
  p_aparato text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('rest_impresoras:'||p_cuenta::text,0));
  p_ruta := public.rest_ruta_impresora(p_cuenta,p_aparato,p_ruta);
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'Falta la ruta o el identificador del aparato.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with reclamadas as (
    update public.documentos d
       set cuerpo = jsonb_set(
         coalesce(d.cuerpo, '{}'::jsonb),
         '{impreso}',
         coalesce(d.cuerpo->'impreso', '{}'::jsonb) || jsonb_build_object(
           p_ruta,
           jsonb_build_object('por', p_aparato, 'en', clock_timestamp(), 'ok', false)
         ),
         true
       )
     where d.cuenta_id = p_cuenta
       and d.coleccion = 'rest_lineas'
       and d.doc_id = any(coalesce(p_lineas, '{}'::text[]))
       and coalesce(d.cuerpo #> array['impreso', p_ruta], 'null'::jsonb) = 'null'::jsonb
    returning d.doc_id
  )
  select coalesce(array_agg(doc_id order by doc_id), '{}'::text[])
    into v_lineas
    from reclamadas;

  return v_lineas;
end $$;

create or replace function public.rest_subir_impresion_offline(
  p_cuenta uuid,
  p_doc_id text,
  p_cuerpo jsonb,
  p_ruta text,
  p_aparato text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardada text;
begin
  perform pg_advisory_xact_lock(hashtextextended('rest_impresoras:'||p_cuenta::text,0));
  p_ruta := public.rest_ruta_impresora(p_cuenta,p_aparato,p_ruta);
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_doc_id), '') is null
     or (left(p_doc_id, 6) <> 'linea_' and left(p_doc_id, 12) <> 'cancelacion_')
     or nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'La línea, ruta o aparato no son válidos.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  insert into public.documentos as d (cuenta_id, coleccion, doc_id, cuerpo)
  values (
    p_cuenta,
    'rest_lineas',
    p_doc_id,
    jsonb_set(
      coalesce(p_cuerpo, '{}'::jsonb),
      '{impreso}',
      coalesce(p_cuerpo->'impreso', '{}'::jsonb) || jsonb_build_object(
        p_ruta,
        jsonb_build_object('por', p_aparato, 'en', clock_timestamp(), 'ok', true, 'confirmado', clock_timestamp(), 'sinRed', true)
      ),
      true
    )
  )
  on conflict (cuenta_id, coleccion, doc_id) do update
     set cuerpo = jsonb_set(
       coalesce(excluded.cuerpo, '{}'::jsonb),
       '{impreso}',
       coalesce(d.cuerpo->'impreso', '{}'::jsonb) || jsonb_build_object(
         p_ruta,
         jsonb_build_object('por', p_aparato, 'en', clock_timestamp(), 'ok', true, 'confirmado', clock_timestamp(), 'sinRed', true)
       ),
       true
     )
   where coalesce(d.cuerpo #> array['impreso', p_ruta], 'null'::jsonb) = 'null'::jsonb
  returning d.doc_id into v_guardada;

  return v_guardada is not null;
end $$;

create or replace function public.rest_confirma_impresion(
  p_cuenta uuid,
  p_lineas text[],
  p_ruta text,
  p_aparato text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('rest_impresoras:'||p_cuenta::text,0));
  p_ruta := public.rest_ruta_impresora(p_cuenta,p_aparato,p_ruta);
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'Falta la ruta o el identificador del aparato.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with confirmadas as (
    update public.documentos d
       set cuerpo = jsonb_set(
         coalesce(d.cuerpo, '{}'::jsonb),
         array['impreso', p_ruta],
         coalesce(d.cuerpo #> array['impreso', p_ruta], '{}'::jsonb) || jsonb_build_object('ok', true, 'confirmado', clock_timestamp()),
         true
       )
     where d.cuenta_id = p_cuenta
       and d.coleccion = 'rest_lineas'
       and d.doc_id = any(coalesce(p_lineas, '{}'::text[]))
       and d.cuerpo #>> array['impreso', p_ruta, 'por'] = p_aparato
       and coalesce((d.cuerpo #>> array['impreso', p_ruta, 'ok'])::boolean, false) = false
    returning d.doc_id
  )
  select coalesce(array_agg(doc_id order by doc_id), '{}'::text[])
    into v_lineas
    from confirmadas;

  return v_lineas;
end $$;

create or replace function public.rest_reasigna_impresion(
  p_cuenta uuid,
  p_lineas text[],
  p_ruta text,
  p_aparato text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('rest_impresoras:'||p_cuenta::text,0));
  p_ruta := public.rest_ruta_impresora(p_cuenta,p_aparato,p_ruta);
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'Falta la ruta o el identificador del aparato.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with reasignadas as (
    update public.documentos d
       set cuerpo = jsonb_set(
         coalesce(d.cuerpo, '{}'::jsonb),
         array['impreso', p_ruta],
         jsonb_build_object('por', p_aparato, 'en', clock_timestamp(), 'ok', false, 'reasignada', true),
         true
       )
     where d.cuenta_id = p_cuenta
       and d.coleccion = 'rest_lineas'
       and d.doc_id = any(coalesce(p_lineas, '{}'::text[]))
       and coalesce((d.cuerpo #>> array['impreso', p_ruta, 'ok'])::boolean, false) = false
       and (d.cuerpo #>> array['impreso', p_ruta, 'en'])::timestamptz < clock_timestamp() - interval '2 minutes'
    returning d.doc_id
  )
  select coalesce(array_agg(doc_id order by doc_id), '{}'::text[])
    into v_lineas
    from reasignadas;

  return v_lineas;
end $$;

create or replace function public.rest_libera_impresion(
  p_cuenta uuid,
  p_lineas text[],
  p_ruta text,
  p_aparato text
)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('rest_impresoras:'||p_cuenta::text,0));
  p_ruta := public.rest_ruta_impresora(p_cuenta,p_aparato,p_ruta);
  if p_cuenta is null or not public.es_miembro(p_cuenta) then
    raise exception 'No tienes acceso a este Restaurant.' using errcode = '42501';
  end if;
  if nullif(btrim(p_ruta), '') is null or nullif(btrim(p_aparato), '') is null then
    raise exception 'Falta la ruta o el identificador del aparato.' using errcode = '22023';
  end if;

  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  with liberadas as (
    update public.documentos d
       set cuerpo = jsonb_set(
         coalesce(d.cuerpo, '{}'::jsonb),
         '{impreso}',
         coalesce(d.cuerpo->'impreso', '{}'::jsonb) - p_ruta,
         true
       )
     where d.cuenta_id = p_cuenta
       and d.coleccion = 'rest_lineas'
       and d.doc_id = any(coalesce(p_lineas, '{}'::text[]))
       and d.cuerpo #>> array['impreso', p_ruta, 'por'] = p_aparato
       and coalesce((d.cuerpo #>> array['impreso', p_ruta, 'ok'])::boolean, false) = false
    returning d.doc_id
  )
  select coalesce(array_agg(doc_id order by doc_id), '{}'::text[])
    into v_lineas
    from liberadas;

  return v_lineas;
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
  perform pg_advisory_xact_lock(hashtextextended('rest_impresoras:'||v.cuenta_id::text,0));
  p_ruta := public.rest_ruta_impresora(v.cuenta_id,v.aparato,p_ruta);
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
    'doc_id',t.doc_id,
    -- La estación Android ya instalada imprime cantidades enteras. Una línea
    -- de peso es un pedido completo y lleva los gramos o kilos en su rótulo.
    'nombre',case when t.peso is null then t.cuerpo->'nombre' else to_jsonb(
      (case when t.peso < 1 then trim_scale(t.peso * 1000)::text || ' g'
            else trim_scale(t.peso)::text || ' kg' end) || ' ' ||
      coalesce(nullif(t.cuerpo->>'nombre',''),'Platillo')
    ) end,
    'cant',case when t.peso is null then t.cuerpo->'cant' else to_jsonb(1) end,
    'comensal',t.cuerpo->'comensal','mods',t.cuerpo->'mods','nota',t.cuerpo->'nota',
    'enviada',t.cuerpo->'enviada'
    ) order by t.doc_id) into v_lineas
  from (
    select doc_id,cuerpo,case when cuerpo->>'unidadVenta'='kg'
      and jsonb_typeof(cuerpo->'cant')='number' then (cuerpo->>'cant')::numeric end as peso
    from tomadas
  ) t;
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
  perform pg_advisory_xact_lock(hashtextextended('rest_impresoras:'||v.cuenta_id::text,0));
  p_ruta := public.rest_ruta_impresora(v.cuenta_id,v.aparato,p_ruta);
  perform set_config('makers.rest_reclamo_autorizado', 'si', true);
  update public.documentos d set cuerpo=jsonb_set(d.cuerpo,array['impreso',p_ruta],
    (d.cuerpo #> array['impreso',p_ruta]) || jsonb_build_object('ok',true,'confirmado',clock_timestamp()),true)
  where d.cuenta_id=v.cuenta_id and d.coleccion='rest_lineas' and d.doc_id=any(p_lineas)
    and d.cuerpo->>'eventoId'=v.evento and d.cuerpo #>> array['impreso',p_ruta,'por']=v.aparato
    and d.cuerpo #>> array['impreso',p_ruta,'ok']='false';
end $$;

notify pgrst, 'reload schema';
commit;
