-- Venta por peso en las comandas de la estación Bluetooth de Restaurant.
-- Aplica después de 29-restaurant-impresion-en-segundo-plano.sql.
-- El peso se etiqueta en la impresión. Las cantidades guardadas no cambian.
begin;

do $$ begin
  if to_regprocedure('public.rest_bt_toma(text,text)') is null then
    raise exception 'Instala primero el SQL 29 de impresión en segundo plano.';
  end if;
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

commit;
select true as impresion_por_peso_disponible;
