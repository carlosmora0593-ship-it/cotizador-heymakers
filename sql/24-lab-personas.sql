-- Nuvoor Lab: personas y fichas de seguimiento. Seguro de repetir.
-- No modifica Auth, planes, membresías ni datos internos de los negocios.
begin;

create or replace function public.staff_usuarios()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null or not public.es_staff() then
    raise exception 'Sólo el equipo de Nuvoor puede consultar estas personas' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(f order by f->>'nombre') from (
    select jsonb_build_object(
      'id',u.id,'nombre',coalesce(n.cuerpo->>'nombre',nullif(p.nombre,''),nullif(u.raw_user_meta_data->>'full_name',''),''),
      'apellidos',coalesce(n.cuerpo->>'apellidos',''), 'correo',coalesce(u.email,p.correo,''),
      'tel',coalesce(n.cuerpo->>'tel',u.phone,''),'pais',coalesce(n.cuerpo->>'pais',''),
      'estadoGeo',coalesce(n.cuerpo->>'estadoGeo',''),'ciudad',coalesce(n.cuerpo->>'ciudad',''),
      'idioma',coalesce(n.cuerpo->>'idioma',''),'nota',coalesce(n.cuerpo->>'nota',''),
      'creado',u.created_at,'ultimo',u.last_sign_in_at,'revision',n.actualizado,
      'negocios',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nombre',c.nombre,'producto',c.producto,'rol',m.rol) order by c.nombre)
        from public.membresias m join public.cuentas c on c.id=m.cuenta_id where m.usuario_id=u.id),'[]'::jsonb)
    ) as f
    from auth.users u left join public.perfiles p on p.id=u.id
    left join public.lab_datos n on n.coleccion='personas' and n.doc_id=u.id::text
    where u.deleted_at is null
  ) x),'[]'::jsonb);
end $$;
revoke all on function public.staff_usuarios() from public,anon;
grant execute on function public.staff_usuarios() to authenticated;

create or replace function public.staff_guarda_ficha(p_tipo text,p_id uuid,p_datos jsonb,p_revision timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare col text; permitidos text[]; dato record; anterior jsonb; nuevo jsonb;
        rev timestamptz; salida timestamptz; cu uuid;
begin
  if auth.uid() is null or not public.es_staff() then
    raise exception 'Sólo el equipo de Nuvoor puede editar estas fichas' using errcode='42501';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' or octet_length(p_datos::text)>20000 then
    raise exception 'Ficha no válida';
  end if;
  if p_tipo='persona' then
    col:='personas';
    permitidos:=array['nombre','apellidos','tel','pais','estadoGeo','ciudad','idioma','nota'];
    if not exists(select 1 from auth.users where id=p_id and deleted_at is null) then raise exception 'La persona ya no existe'; end if;
  elsif p_tipo='negocio' then
    col:='notas_cuenta'; cu:=p_id;
    permitidos:=array['nombre','contacto','tel','pais','estadoGeo','ciudad','direccion','zona','sitio','razon','rfc','cp'];
    if not exists(select 1 from public.cuentas where id=p_id) then raise exception 'El negocio ya no existe'; end if;
  else raise exception 'Tipo de ficha no válido';
  end if;
  for dato in select key,value from jsonb_each(p_datos) loop
    if not dato.key=any(permitidos) or jsonb_typeof(dato.value)<>'string' or length(dato.value#>>'{}')>2000 then
      raise exception 'La ficha contiene un campo no permitido';
    end if;
  end loop;
  if p_datos ? 'zona' and nullif(p_datos->>'zona','') is not null and not exists(select 1 from pg_timezone_names where name=p_datos->>'zona') then
    raise exception 'Revisa la zona horaria';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(col||p_id::text,0));
  select cuerpo,actualizado into anterior,rev from public.lab_datos where coleccion=col and doc_id=p_id::text for update;
  if rev is distinct from p_revision then
    raise exception 'La ficha cambió en otro dispositivo. Actualízala antes de guardar.' using errcode='40001';
  end if;
  if p_tipo='negocio' and p_datos ? 'nombre' then
    if length(btrim(p_datos->>'nombre')) not between 1 and 200 then raise exception 'Escribe el nombre del negocio'; end if;
    update public.cuentas set nombre=btrim(p_datos->>'nombre') where id=p_id;
  end if;
  nuevo:=coalesce(anterior,'{}'::jsonb)||(p_datos-'nombre');
  if p_tipo='persona' then nuevo:=coalesce(anterior,'{}'::jsonb)||p_datos; end if;
  insert into public.lab_datos(coleccion,doc_id,cuerpo) values(col,p_id::text,nuevo)
    on conflict(coleccion,doc_id) do update set cuerpo=excluded.cuerpo
    returning actualizado into salida;
  -- Registra sólo qué campos cambiaron; evita duplicar datos personales en la bitácora.
  insert into public.lab_bitacora(cuenta_id,quien,que,antes,despues)
    values(cu,auth.uid(),'Ficha de '||p_tipo||' actualizada',null,
      jsonb_build_object('tipo',p_tipo,'id',p_id,'campos',(select jsonb_agg(key) from jsonb_object_keys(p_datos) key)));
  return jsonb_build_object('ok',true,'revision',salida);
end $$;
revoke all on function public.staff_guarda_ficha(text,uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.staff_guarda_ficha(text,uuid,jsonb,timestamptz) to authenticated;

create or replace function public.nuvoor_lab_personas_disponible()
returns boolean language sql stable security invoker set search_path=public
as $$ select auth.uid() is not null and public.es_staff() $$;
revoke all on function public.nuvoor_lab_personas_disponible() from public,anon;
grant execute on function public.nuvoor_lab_personas_disponible() to authenticated;

commit;
