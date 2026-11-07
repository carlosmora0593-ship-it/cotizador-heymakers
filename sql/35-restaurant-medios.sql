-- Logos y fotografías del menú. Ejecutar después del SQL 20.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('restaurant-medios','restaurant-medios',true,204800,array['image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.rest_medio_cuenta(p_ruta text)
returns uuid language sql immutable as $$
  select case when p_ruta ~ '^[a-fA-F0-9-]{36}/(logo|platillos|categorias)/[a-fA-F0-9-]{36}\.webp$'
    and split_part(p_ruta,'/',1) ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    then split_part(p_ruta,'/',1)::uuid end
$$;
drop policy if exists restaurant_medios_leer on storage.objects;
create policy restaurant_medios_leer on storage.objects for select to anon,authenticated
  using(bucket_id='restaurant-medios');
drop policy if exists restaurant_medios_subir on storage.objects;
create policy restaurant_medios_subir on storage.objects for insert to authenticated
  with check(bucket_id='restaurant-medios' and public.rol_en(public.rest_medio_cuenta(name))='admin');
drop policy if exists restaurant_medios_cambiar on storage.objects;
create policy restaurant_medios_cambiar on storage.objects for update to authenticated
  using(bucket_id='restaurant-medios' and public.rol_en(public.rest_medio_cuenta(name))='admin')
  with check(bucket_id='restaurant-medios' and public.rol_en(public.rest_medio_cuenta(name))='admin');
drop policy if exists restaurant_medios_borrar on storage.objects;
create policy restaurant_medios_borrar on storage.objects for delete to authenticated
  using(bucket_id='restaurant-medios' and public.rol_en(public.rest_medio_cuenta(name))='admin');

create or replace function public.rest_protege_medios()
returns trigger language plpgsql set search_path=public as $$
declare v_campo text;
begin
  if new.coleccion='rest_config' then v_campo:='logo';
  elsif new.coleccion='rest_carta' and new.cuerpo->>'tipo' in ('platillo','categoria') then v_campo:='foto';
  else return new;
  end if;
  if current_setting('nuvoor.medio_autorizado',true)=new.cuenta_id::text then return new; end if;
  -- Las versiones anteriores omiten estas propiedades al guardar el resto del menú.
  new.cuerpo:=new.cuerpo-v_campo;
  if tg_op='UPDATE' and old.cuerpo ? v_campo then
    new.cuerpo:=jsonb_set(new.cuerpo,array[v_campo],old.cuerpo->v_campo,true);
  end if;
  return new;
end $$;
drop trigger if exists rest_protege_medios on public.documentos;
create trigger rest_protege_medios before insert or update on public.documentos
  for each row execute function public.rest_protege_medios();

create or replace function public.rest_medios_confirmar(
  p_cuenta uuid,p_evento text,p_tipo text,p_id text,p_ruta text,p_anterior text
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_evento text:=coalesce(p_evento,'');
  v_prefijo text;
  v_col text;
  v_id text;
  v_campo text;
  v_doc public.documentos%rowtype;
begin
  if public.rol_en(p_cuenta) is distinct from 'admin' then
    raise exception 'Se necesita un administrador del negocio.' using errcode='42501';
  end if;
  if v_evento !~ '^[a-zA-Z0-9_-]{0,120}$' or coalesce(p_id,'') !~ '^[a-zA-Z0-9_-]{1,120}$'
    or coalesce(p_tipo,'') not in ('logo','platillos','categorias') then
    raise exception 'La imagen no corresponde a un elemento válido.' using errcode='22023';
  end if;
  if coalesce(p_ruta,'')<>'' and (public.rest_medio_cuenta(p_ruta) is distinct from p_cuenta
    or split_part(p_ruta,'/',2)<>p_tipo or not exists(select 1 from storage.objects
      where bucket_id='restaurant-medios' and name=p_ruta)) then
    raise exception 'La imagen aún no está guardada en la nube de este negocio.' using errcode='22023';
  end if;
  v_prefijo:=case when v_evento='' then '' else 'ev_'||v_evento||'_' end;
  v_col:=case when p_tipo='logo' then 'rest_config' else 'rest_carta' end;
  v_id:=v_prefijo||case p_tipo when 'logo' then 'config_general' when 'platillos' then 'plat_'||p_id else 'cat_'||p_id end;
  v_campo:=case when p_tipo='logo' then 'logo' else 'foto' end;
  select * into v_doc from public.documentos where cuenta_id=p_cuenta and coleccion=v_col and doc_id=v_id for update;
  if not found or v_doc.cuerpo->>'_eliminado'='true' then
    raise exception 'El elemento cambió o ya fue eliminado.' using errcode='P0001';
  end if;
  if coalesce(v_doc.cuerpo->>v_campo,'')=coalesce(p_ruta,'') then
    return jsonb_build_object('documento',to_jsonb(v_doc),'anterior',p_anterior);
  end if;
  if coalesce(v_doc.cuerpo->>v_campo,'') is distinct from coalesce(p_anterior,'') then
    raise exception 'Otro equipo cambió esta imagen. Conservamos tu copia pendiente para que la revises.' using errcode='P0001';
  end if;
  perform set_config('nuvoor.medio_autorizado',p_cuenta::text,true);
  update public.documentos set cuerpo=jsonb_set(cuerpo,array[v_campo],to_jsonb(coalesce(p_ruta,'')),true)
    where cuenta_id=p_cuenta and coleccion=v_col and doc_id=v_id returning * into v_doc;
  return jsonb_build_object('documento',to_jsonb(v_doc),'anterior',p_anterior);
end $$;

create or replace function public.rest_medio_sin_uso(p_cuenta uuid,p_ruta text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.rol_en(p_cuenta)='admin' and public.rest_medio_cuenta(p_ruta)=p_cuenta and not exists(
    select 1 from public.documentos where cuenta_id=p_cuenta and coleccion in ('rest_config','rest_carta')
      and (cuerpo->>'logo'=p_ruta or cuerpo->>'foto'=p_ruta) and cuerpo->>'_eliminado' is distinct from 'true')
$$;
create or replace function public.nuvoor_rest_medios_disponible()
returns boolean language sql immutable as $$ select true $$;
revoke all on function public.rest_medios_confirmar(uuid,text,text,text,text,text),
  public.rest_medio_sin_uso(uuid,text),public.nuvoor_rest_medios_disponible() from public,anon,authenticated;
grant execute on function public.rest_medios_confirmar(uuid,text,text,text,text,text),
  public.rest_medio_sin_uso(uuid,text),public.nuvoor_rest_medios_disponible() to authenticated;

notify pgrst,'reload schema';
commit;
