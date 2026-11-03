-- Directorio de Imprenta: seis fichas por página y búsqueda dentro de la cuenta.
begin;
create extension if not exists pg_trgm with schema extensions;
create or replace function public.nuvoor_texto_cliente(p_cuerpo jsonb)
returns text language sql immutable parallel safe set search_path=public
as $$ select translate(lower(
 coalesce(p_cuerpo->'cliente'->>'nombre','')||' '||coalesce(p_cuerpo->'cliente'->>'razon','')||' '||
 coalesce(p_cuerpo->'cliente'->>'persona','')||' '||coalesce(p_cuerpo->'cliente'->>'rfc','')||' '||
 coalesce(p_cuerpo->'cliente'->>'mail','')||' '||coalesce(p_cuerpo->'cliente'->>'tel','')||' '||
 regexp_replace(coalesce(p_cuerpo->'cliente'->>'tel',''),'[^0-9]','','g')),'áéíóúüñ','aeiouun') $$;
create index if not exists documentos_cliente_busqueda_idx on public.documentos using gin
 (public.nuvoor_texto_cliente(cuerpo) extensions.gin_trgm_ops) where coleccion='clientes' and cuerpo ? 'cliente';
create index if not exists documentos_cliente_nombre_idx on public.documentos
 (cuenta_id,lower(coalesce(cuerpo->'cliente'->>'nombre','')),doc_id) where coleccion='clientes' and cuerpo ? 'cliente';

create or replace function public.buscar_clientes_nuvoor(p_cuenta uuid,p_busqueda text default '',p_pagina integer default 0)
returns jsonb language plpgsql stable security invoker set search_path=public
as $$
declare texto text; patron text; total integer; pagina integer; filas jsonb;
begin
 if auth.uid() is null or coalesce(public.rol_en(p_cuenta),'') not in ('admin','ventas') then
  raise exception 'No tienes permiso para consultar estos clientes' using errcode='42501';
 end if;
 texto:=translate(lower(left(btrim(coalesce(p_busqueda,'')),120)),'áéíóúüñ','aeiouun');
 if texto ~ '^[+().0-9 -]+$' then texto:=regexp_replace(texto,'[^0-9]','','g'); end if;
 patron:='%'||replace(replace(replace(texto,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 select count(*) into total from public.documentos d
  where d.cuenta_id=p_cuenta and d.coleccion='clientes' and d.cuerpo ? 'cliente'
   and (texto='' or public.nuvoor_texto_cliente(d.cuerpo) like patron);
 pagina:=least(greatest(coalesce(p_pagina,0),0),greatest(0,(total-1)/6));
 select coalesce(jsonb_agg(f),'[]'::jsonb) into filas from (
  select jsonb_build_object('id',d.doc_id,'nombre',coalesce(d.cuerpo->'cliente'->>'nombre',d.cuerpo->'cliente'->>'razon','Sin nombre'),
   'tel',coalesce(d.cuerpo->'cliente'->>'tel',''),'mail',coalesce(d.cuerpo->'cliente'->>'mail',''),
   'rfc',coalesce(d.cuerpo->'cliente'->>'rfc','')) as f
  from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='clientes' and d.cuerpo ? 'cliente'
   and (texto='' or public.nuvoor_texto_cliente(d.cuerpo) like patron)
  order by lower(coalesce(d.cuerpo->'cliente'->>'nombre','')),d.doc_id limit 6 offset pagina*6
 ) x;
 return jsonb_build_object('clientes',filas,'total',total,'pagina',pagina,'porPagina',6);
end $$;
revoke all on function public.buscar_clientes_nuvoor(uuid,text,integer) from public,anon;
grant execute on function public.buscar_clientes_nuvoor(uuid,text,integer) to authenticated;
commit;
