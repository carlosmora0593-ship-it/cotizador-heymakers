-- 42 · Personal en Imprenta y Store. Después de 38, 39 y 40.
-- Conserva config/equipo, las checadas anteriores y las funciones POS de Restaurant.
begin;

-- Una invitación de Personal no revoca una membresía real de Imprenta o Store.
-- En Restaurant se conserva exactamente el aislamiento de SQL 38.
create or replace function public.rol_en(cuenta uuid)
returns text language sql stable security definer set search_path=public as $$
 select m.rol from public.membresias m where m.usuario_id=auth.uid() and m.cuenta_id=cuenta
 and (m.rol='admin'
  or exists(select 1 from public.cuentas c where c.id=m.cuenta_id and c.producto in ('taller','tiendita'))
  or not exists(select 1 from public.rest_personal_usuarios p where p.usuario_id=m.usuario_id and p.cuenta_id=m.cuenta_id))
 limit 1;
$$;

create or replace function public.rest_personal_cuentas_restringidas()
returns uuid[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(u.cuenta_id),'{}'::uuid[]) from public.rest_personal_usuarios u where u.usuario_id=auth.uid()
 and not coalesce(public.rol_en(u.cuenta_id)='admin',false)
 and not exists(select 1 from public.cuentas c join public.membresias m on m.cuenta_id=c.id
    where c.id=u.cuenta_id and m.usuario_id=u.usuario_id and c.producto in ('taller','tiendita'))
 and not exists(select 1 from public.staff where id=auth.uid() and rol='dueno');
$$;

create or replace function public.nuvoor_personal_rol_base(p_rol text)
returns text language sql immutable set search_path=public as $$
 select case when p_rol='admin' then 'gerente' when p_rol='cajero' then 'cajero'
  when p_rol in ('cocina','diseno','produccion','inventario') then 'cocina' else 'mesero' end;
$$;
revoke all on function public.nuvoor_personal_rol_base(text) from public;

create or replace function public.nuvoor_personal_rol_perfil(p_cuenta uuid,p_datos jsonb)
returns text language sql stable security definer set search_path=public as $$
 select case when p_datos->>'fuente42'='membresia' then
   (select public.nuvoor_personal_rol_base(m.rol) from public.membresias m where m.cuenta_id=p_cuenta
     and m.usuario_id::text=p_datos->>'id' limit 1)
   else p_datos->>'rol' end;
$$;
revoke all on function public.nuvoor_personal_rol_perfil(uuid,jsonb) from public;

create or replace function public.nuvoor_personal_disponible()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.staff where id=auth.uid());
$$;
create or replace function public.nuvoor_personal_disponible(p_cuenta uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.cuentas c
  where c.id=p_cuenta and c.producto in ('taller','tiendita','restaurant')
    and c.plan<>'ninguno' and c.estado='activa' and (c.vence is null or c.vence>=now()))
 and (public.rol_en(p_cuenta) is not null or exists(
  select 1 from public.rest_personal_accesos a where a.cuenta_id=p_cuenta and a.usuario_id=auth.uid() and a.activo and a.estado='activo'));
$$;
revoke all on function public.nuvoor_personal_disponible(),public.nuvoor_personal_disponible(uuid) from public;
grant execute on function public.nuvoor_personal_disponible(),public.nuvoor_personal_disponible(uuid) to authenticated;

create or replace function public.nuvoor_personal_limite(p_producto text,p_plan text)
returns integer language sql immutable set search_path=public as $$
 select case
  when p_plan='ninguno' then 0
  when p_producto='taller' then case p_plan when 'basico' then 8 when 'maker' then 15 else 40 end
  when p_plan in ('maker','multiempresa','pro') then 40 else 15 end;
$$;
revoke all on function public.nuvoor_personal_limite(text,text) from public;

create or replace function public.nuvoor_personal_preparar(p_cuenta uuid,p_aparato text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 producto_cuenta text; salt text; perfiles jsonb; u jsonb; identificador text; nombre text;
 rol_nativo text; rol_comun text; clave text; cuerpo_perfil jsonb;
 activos text[]:='{}'; compat boolean:=false; duplicados boolean; sin_pin boolean;
begin
 if not public.nuvoor_personal_disponible(p_cuenta) or public.rol_en(p_cuenta) is distinct from 'admin' then
   raise exception 'Sólo administración puede preparar este negocio.' using errcode='42501';
 end if;
 if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then raise exception 'Dispositivo inválido.' using errcode='22023';end if;
 select producto into producto_cuenta from public.cuentas where id=p_cuenta;
 if producto_cuenta not in ('taller','tiendita') then raise exception 'Usa Personal de Restaurant.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('personal39:'||p_cuenta::text,0));
 insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo)
 values(p_cuenta,'rest_config','config_general',jsonb_build_object('pinSalt',gen_random_uuid()::text))
 on conflict(cuenta_id,coleccion,doc_id) do nothing;
 select d.cuerpo->>'pinSalt' into salt from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_config' and d.doc_id='config_general';
 if coalesce(salt,'')='' then raise exception 'Falta la configuración de PIN del negocio.';end if;
 if producto_cuenta='taller' then
   select d.cuerpo->'equipo' into perfiles from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='config' and d.doc_id='equipo';
   if jsonb_typeof(perfiles) is distinct from 'array' or jsonb_array_length(perfiles)=0 then
     perfiles:=jsonb_build_array(jsonb_build_object('id',auth.uid()::text,'nombre','Administrador','rol','admin','activo',true));
   end if;
 else
   select coalesce(jsonb_agg(jsonb_build_object('id',m.usuario_id::text,'nombre',coalesce(
         nullif(to_jsonb(p)->>'nombre',''),nullif(to_jsonb(a)->'raw_user_meta_data'->>'nombre',''),nullif(split_part(a.email,'@',1),''),'Personal'),
         'rol',m.rol,'activo',true)),'[]') into perfiles
   from public.membresias m join auth.users a on a.id=m.usuario_id left join public.perfiles p on p.id=m.usuario_id
   where m.cuenta_id=p_cuenta;
 end if;
 if jsonb_array_length(perfiles)>500 then raise exception 'El equipo necesita una revisión antes de importarse.';end if;
 for u in select value from jsonb_array_elements(perfiles) loop
   identificador:=u->>'id';
   if coalesce(identificador,'')='' or length(identificador)>120 then continue;end if;
   activos:=array_append(activos,identificador);
   nombre:=left(coalesce(nullif(btrim(u->>'nombre'),''),'Personal'),120);
   rol_nativo:=u->>'rol';
   rol_comun:=case when rol_nativo in ('admin','gerente') then 'gerente' when rol_nativo='cajero' then 'cajero'
     when rol_nativo in ('diseno','produccion','inventario','cocina') then 'cocina' else 'mesero' end;
   clave:=coalesce(u->>'pin','');
   if producto_cuenta='taller' and btrim(clave)<>'' and clave !~ '^[0-9]{4,12}$' then compat:=true;end if;
   cuerpo_perfil:=jsonb_build_object('id',identificador,'nombre',nombre,'rol',rol_comun,'rolPos',rol_nativo,
     'activo',u->>'activo' is distinct from 'false','eventoId','',
     'pin_hash',case when producto_cuenta='taller' and btrim(clave)<>'' then encode(sha256(convert_to(salt||clave,'UTF8')),'hex') else '' end,
     'fuente42',case when producto_cuenta='taller' then 'equipo' else 'membresia' end);
   if producto_cuenta='taller' and exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo'
      and d.doc_id='personal42_'||identificador and d.cuerpo->>'pin_hash' is distinct from cuerpo_perfil->>'pin_hash') then
     update public.rest_personal_operadores set vence=clock_timestamp() where cuenta_id=p_cuenta and persona=identificador;
     delete from public.rest_personal_dispositivos where acceso_id in
      (select id from public.rest_personal_accesos where cuenta_id=p_cuenta and persona_id=identificador);
   end if;
   insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo) values(p_cuenta,'rest_equipo','personal42_'||identificador,cuerpo_perfil)
   on conflict(cuenta_id,coleccion,doc_id) do update set cuerpo=case
       when producto_cuenta='tiendita' then excluded.cuerpo||jsonb_build_object('pin_hash',documentos.cuerpo->>'pin_hash')
       else excluded.cuerpo end,actualizado=clock_timestamp()
   where documentos.cuerpo is distinct from case when producto_cuenta='tiendita' then excluded.cuerpo||jsonb_build_object('pin_hash',documentos.cuerpo->>'pin_hash') else excluded.cuerpo end;
 end loop;
 update public.documentos d set cuerpo=jsonb_set(d.cuerpo,'{activo}','false'),actualizado=clock_timestamp()
 where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and d.cuerpo->>'fuente42' in ('equipo','membresia')
   and d.cuerpo->>'activo' is distinct from 'false' and not (d.cuerpo->>'id'=any(activos));
 select not exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo'
  and d.cuerpo->>'activo' is distinct from 'false' and coalesce(d.cuerpo->>'pin_hash','')<>'') into sin_pin;
 select exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo'
   and d.cuerpo->>'activo' is distinct from 'false' and coalesce(d.cuerpo->>'pin_hash','')<>''
   group by d.cuerpo->>'pin_hash' having count(*)>1) into duplicados;
 return jsonb_build_object('ok',true,'producto',producto_cuenta,'sinPin',sin_pin,'compatibilidad',compat or duplicados,'sucursal','principal');
end $$;
revoke all on function public.nuvoor_personal_preparar(uuid,text) from public;
grant execute on function public.nuvoor_personal_preparar(uuid,text) to authenticated;

create or replace function public.rest_personal_cupo(p_cuenta uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_plan text;v_producto text;v_owner uuid;v_ids uuid[];v_n integer;
begin
 select plan,producto into v_plan,v_producto from public.cuentas where id=p_cuenta;
 if v_producto in ('restaurant','tiendita') and v_plan in ('maker','multiempresa') then
  select usuario_id into v_owner from public.membresias where cuenta_id=p_cuenta and rol='admin' order by creado,usuario_id limit 1;
  select array_agg(c.id) into v_ids from public.cuentas c where c.producto=v_producto and c.plan in ('maker','multiempresa') and
   (c.id=p_cuenta or v_owner=(select m.usuario_id from public.membresias m where m.cuenta_id=c.id and m.rol='admin' order by m.creado,m.usuario_id limit 1));
 else v_ids:=array[p_cuenta];end if;
 select count(*) into v_n from public.rest_personal_accesos where cuenta_id=any(v_ids) and activo;
 return jsonb_build_object('cuentas',to_jsonb(v_ids),'limite',public.nuvoor_personal_limite(v_producto,v_plan),
  'usados',v_n,'bloqueo',coalesce(v_owner::text,p_cuenta::text));
end $$;

create or replace function public.rest_personal_admin(p_cuenta uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.cuentas c where c.id=p_cuenta and c.producto in ('restaurant','taller','tiendita')) and
 (coalesce(public.rol_en(p_cuenta)='admin',false) or (exists(select 1 from public.cuentas c where c.id=p_cuenta and c.producto='restaurant') and exists(select 1 from public.staff where id=auth.uid() and rol='dueno')) or exists(
  select 1 from public.rest_personal_accesos a join public.documentos d on d.cuenta_id=a.cuenta_id and d.coleccion='rest_equipo' and d.cuerpo->>'id'=a.persona_id
  where a.cuenta_id=p_cuenta and a.usuario_id=auth.uid() and a.activo and a.estado='activo' and a.bloqueado_pin is null
  and coalesce(d.cuerpo->>'eventoId','')='' and public.nuvoor_personal_rol_perfil(d.cuenta_id,d.cuerpo)='gerente' and d.cuerpo->>'activo' is distinct from 'false' and d.cuerpo->>'_eliminado' is distinct from 'true'
  and exists(select 1 from public.rest_personal_dispositivos x where x.acceso_id=a.id and x.bloqueado is null and x.vence>clock_timestamp() and x.fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date)))
$$;

create or replace function public.rest_personal_listar(p_cuenta uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_cuenta public.cuentas%rowtype;v_lista jsonb;
begin
 if not public.rest_personal_admin(p_cuenta) then raise exception 'No puedes administrar este equipo.' using errcode='42501';end if;
 select * into v_cuenta from public.cuentas where id=p_cuenta;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',d.cuerpo->>'id','nombre',d.cuerpo->>'nombre','rol',d.cuerpo->>'rol',
  'activo',coalesce((d.cuerpo->>'activo')::boolean,true),
  'pinConfigurado',coalesce(d.cuerpo->>'pin_hash','')<>'',
  'accesoId',a.id,'correo',a.correo,'estado',coalesce(a.estado,'sin_acceso'),
  'enviada',a.enviada,'aceptada',a.aceptada
 ) order by lower(d.cuerpo->>'nombre')),'[]') into v_lista
 from public.documentos d left join public.rest_personal_accesos a on a.cuenta_id=d.cuenta_id and a.persona_id=d.cuerpo->>'id'
 where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and coalesce(d.cuerpo->>'eventoId','')=''
 and d.cuerpo->>'_eliminado' is distinct from 'true';
 return jsonb_build_object('personas',v_lista,'cuenta',p_cuenta,'nombre',v_cuenta.nombre,
 'limite',(public.rest_personal_cupo(p_cuenta)->>'limite')::integer,
 'usados',(public.rest_personal_cupo(p_cuenta)->>'usados')::integer,
 'plan',case when v_cuenta.producto='taller' then case v_cuenta.plan when 'basico' then 'Básico' when 'maker' then 'Maker' when 'pro' then 'Pro' else 'Prueba' end when v_cuenta.plan in ('maker','multiempresa') then 'Multisucursal' else 'Estándar' end);
end $$;

create or replace function public.rest_personal_preparar(p_cuenta uuid,p_persona text,p_correo text,p_solicitud uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_c public.cuentas%rowtype;v_p jsonb;v_a public.rest_personal_accesos%rowtype;v_nonce text;v_limite integer;v_cuantos integer;v_envio public.rest_personal_envios%rowtype;v_cupo jsonb;
begin
 if not public.rest_personal_admin(p_cuenta) then raise exception 'No puedes invitar personal a este negocio.' using errcode='42501';end if;
 if p_solicitud is null then raise exception 'Falta identificar la solicitud.' using errcode='22023';end if;
 p_correo:=lower(btrim(coalesce(p_correo,'')));
 if length(p_correo)>254 or p_correo !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' then raise exception 'Escribe un correo válido.' using errcode='22023';end if;
 v_cupo:=public.rest_personal_cupo(p_cuenta);
 perform pg_advisory_xact_lock(hashtextextended('personal:'||(v_cupo->>'bloqueo'),0));
 v_cupo:=public.rest_personal_cupo(p_cuenta);
 select * into v_envio from public.rest_personal_envios where solicitud=p_solicitud;
 if found then
  select * into v_a from public.rest_personal_accesos where id=v_envio.acceso_id;
  if v_envio.cuenta_id<>p_cuenta or v_a.persona_id<>p_persona or v_a.correo<>p_correo then raise exception 'La solicitud ya pertenece a otra invitación.' using errcode='22023';end if;
  return jsonb_build_object('ok',v_envio.estado<>'error','yaEnviada',v_envio.estado='enviada','enProceso',v_envio.estado='preparando','id',v_envio.acceso_id);
 end if;
 select * into v_c from public.cuentas where id=p_cuenta for update;
 if v_c.estado<>'activa' or v_c.plan='ninguno' or (v_c.vence is not null and v_c.vence<now()) then raise exception 'El plan del negocio necesita estar vigente.' using errcode='42501';end if;
 select cuerpo into v_p from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo'
 and cuerpo->>'id'=p_persona and coalesce(cuerpo->>'eventoId','')='' and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true';
 if v_p is null or coalesce(public.nuvoor_personal_rol_perfil(p_cuenta,v_p),'') not in ('gerente','cajero','mesero','cocina') then raise exception 'Selecciona un perfil activo de Personal.' using errcode='22023';end if;
 select * into v_a from public.rest_personal_accesos where cuenta_id=p_cuenta and persona_id=p_persona for update;
 if v_a.enviada>now()-interval '60 seconds' then raise exception 'Espera un minuto antes de reenviar.' using errcode='P0001';end if;
 if v_a.estado='preparando' and v_a.actualizado>now()-interval '60 seconds' then raise exception 'La invitación todavía se está enviando.' using errcode='P0001';end if;
 if v_a.usuario_id is not null and v_a.correo<>p_correo and v_a.activo then raise exception 'Retira el acceso anterior antes de cambiar el correo.' using errcode='22023';end if;
 v_limite:=(v_cupo->>'limite')::integer;
 v_cuantos:=(v_cupo->>'usados')::integer-case when v_a.activo then 1 else 0 end;
 if v_cuantos>=v_limite then raise exception 'Este plan ya alcanzó su límite de personas con acceso.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('personal:correo:limite-hora',0));
 if (select count(*) from public.rest_personal_envios where creado>clock_timestamp()-interval '1 hour')>=100 then
  raise exception 'Se alcanzó el límite de 100 correos por hora. Intenta más tarde.' using errcode='P0001';end if;
 v_nonce:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.rest_personal_accesos(cuenta_id,persona_id,correo,solicitud,creada_por,nonce_hash,nonce_vence)
 values(p_cuenta,p_persona,p_correo,p_solicitud,auth.uid(),encode(sha256(convert_to(v_nonce,'UTF8')),'hex'),now()+interval '24 hours')
 on conflict(cuenta_id,persona_id) do update set correo=excluded.correo,solicitud=excluded.solicitud,nonce_hash=excluded.nonce_hash,nonce_vence=excluded.nonce_vence,
 activo=true,estado=case when rest_personal_accesos.estado='activo' and rest_personal_accesos.activo and rest_personal_accesos.correo=excluded.correo then 'activo' else 'preparando' end,usuario_id=case when rest_personal_accesos.correo=excluded.correo then rest_personal_accesos.usuario_id else null end,actualizado=clock_timestamp()
 returning * into v_a;
 insert into public.rest_personal_envios(solicitud,cuenta_id,acceso_id) values(p_solicitud,p_cuenta,v_a.id);
 return jsonb_build_object('ok',true,'id',v_a.id,'nonce',v_nonce,'correo',v_a.correo,'nombre',v_p->>'nombre','negocio',v_c.nombre,'usuarioId',v_a.usuario_id,'producto',v_c.producto);
end $$;

create or replace function public.rest_personal_contexto(p_cuenta uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_a public.rest_personal_accesos%rowtype;v_p jsonb;v_c public.cuentas%rowtype;
begin
 if auth.uid() is null then raise exception 'Vuelve a iniciar sesión.' using errcode='42501';end if;
 select * into v_a from public.rest_personal_accesos where cuenta_id=p_cuenta and usuario_id=auth.uid() and activo and estado='activo';
 if not found then raise exception 'Tu acceso a este negocio no está activo.' using errcode='42501';end if;
 select cuerpo into v_p from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo'
 and cuerpo->>'id'=v_a.persona_id and coalesce(cuerpo->>'eventoId','')='' and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true';
 if v_p is null or coalesce(public.nuvoor_personal_rol_perfil(p_cuenta,v_p),'') not in ('gerente','cajero','mesero','cocina') then raise exception 'Tu perfil ya no está activo.' using errcode='42501';end if;
 select * into v_c from public.cuentas where id=p_cuenta and producto in ('restaurant','tiendita','taller');
 if not found or v_c.estado<>'activa' or v_c.plan='ninguno' or (v_c.vence is not null and v_c.vence<now()) then raise exception 'El plan del negocio necesita renovarse.' using errcode='42501';end if;
 return jsonb_build_object('accesoId',v_a.id,'cuenta',p_cuenta,'negocio',v_c.nombre,'persona',v_a.persona_id,'nombre',v_p->>'nombre','rol',public.nuvoor_personal_rol_perfil(p_cuenta,v_p),'plan',v_c.plan,'vence',v_c.vence,'estado',v_c.estado,'producto',v_c.producto,'pinConfigurado',coalesce(v_p->>'pin_hash','')<>'');
end $$;

create or replace function public.rest_personal_sesion(p_cuenta uuid,p_aparato text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_ctx jsonb;
begin
 if not exists(select 1 from public.cuentas where id=p_cuenta and producto='restaurant') then
  raise exception 'El acceso operativo corresponde a Restaurant.' using errcode='42501';
 end if;
 v_ctx:=public.rest_personal_contexto(p_cuenta);
 if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then raise exception 'El dispositivo no es válido.' using errcode='22023';end if;
 if exists(select 1 from public.rest_personal_accesos where id=(v_ctx->>'accesoId')::uuid and bloqueado_pin is not null)
 or not exists(select 1 from public.rest_personal_dispositivos where acceso_id=(v_ctx->>'accesoId')::uuid and aparato=p_aparato and bloqueado is null and vence>clock_timestamp() and fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date)
 then raise exception 'Confirma tu PIN para continuar.' using errcode='42501',hint='PIN_REQUERIDO';end if;
 return v_ctx;
end $$;

create or replace function public.nuvoor_personal_sesion(p_cuenta uuid,p_aparato text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_ctx jsonb;
begin
 if public.nuvoor_personal_disponible(p_cuenta) and exists(select 1 from public.cuentas where id=p_cuenta and producto in ('taller','tiendita'))
    and public.rol_en(p_cuenta) is not null and public.rol_en(p_cuenta)<>'admin'
    and not exists(select 1 from public.rest_personal_accesos where cuenta_id=p_cuenta and usuario_id=auth.uid() and activo and estado='activo') then
   select jsonb_build_object('cuenta',c.id,'negocio',c.nombre,'producto',c.producto,'persona',d.cuerpo->>'id','nombre',d.cuerpo->>'nombre','rol',public.nuvoor_personal_rol_base(public.rol_en(p_cuenta)))
   into v_ctx from public.cuentas c join public.documentos d on d.cuenta_id=c.id and d.coleccion='rest_equipo'
   where c.id=p_cuenta and d.cuerpo->>'id'=auth.uid()::text and d.cuerpo->>'fuente42'='membresia' and d.cuerpo->>'activo' is distinct from 'false';
   if v_ctx is not null then return v_ctx;end if;
 end if;
 v_ctx:=public.rest_personal_contexto(p_cuenta);
 if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then raise exception 'El dispositivo no es válido.' using errcode='22023';end if;
 if exists(select 1 from public.rest_personal_accesos where id=(v_ctx->>'accesoId')::uuid and bloqueado_pin is not null)
 or not exists(select 1 from public.rest_personal_dispositivos where acceso_id=(v_ctx->>'accesoId')::uuid and aparato=p_aparato and bloqueado is null and vence>clock_timestamp() and fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date)
 then raise exception 'Confirma tu PIN para continuar.' using errcode='42501',hint='PIN_REQUERIDO';end if;
 return v_ctx;
end $$;

revoke all on function public.nuvoor_personal_sesion(uuid,text) from public;

grant execute on function public.nuvoor_personal_sesion(uuid,text) to authenticated;

-- Las versiones anteriores de Restaurant siguen recibiendo sólo restaurantes.
create or replace function public.rest_personal_mis_negocios()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_a record;v_d jsonb;v_out jsonb:='[]';
begin
 if auth.uid() is null then return '[]';end if;
 for v_a in select a.cuenta_id from public.rest_personal_accesos a join public.cuentas c on c.id=a.cuenta_id
    where c.producto='restaurant' and a.usuario_id=auth.uid() and a.activo and a.estado='activo' order by a.aceptada loop
  begin v_d:=public.rest_personal_contexto(v_a.cuenta_id);v_out:=v_out||jsonb_build_array(v_d);exception when insufficient_privilege then null;end;
 end loop;
 return v_out;
end $$;

create or replace function public.nuvoor_personal_mis_negocios()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_a record;v_d jsonb;v_out jsonb;
begin
 if auth.uid() is null then return '[]';end if;
 v_out:=public.rest_personal_mis_negocios();
 for v_a in select a.cuenta_id from public.rest_personal_accesos a join public.cuentas c on c.id=a.cuenta_id
    where c.producto in ('taller','tiendita') and a.usuario_id=auth.uid() and a.activo and a.estado='activo' order by a.aceptada loop
  begin v_d:=public.rest_personal_contexto(v_a.cuenta_id);v_out:=v_out||jsonb_build_array(v_d);exception when insufficient_privilege then null;end;
 end loop;
 for v_a in select c.id,c.producto,c.nombre,c.plan,c.estado,c.vence,d.cuerpo as persona
    from public.cuentas c join public.documentos d on d.cuenta_id=c.id and d.coleccion='rest_equipo'
    where c.producto='tiendita' and public.nuvoor_personal_disponible(c.id) and public.rol_en(c.id) not in ('admin')
      and d.cuerpo->>'fuente42'='membresia' and d.cuerpo->>'id'=auth.uid()::text and d.cuerpo->>'activo' is distinct from 'false'
      and not exists(select 1 from public.rest_personal_accesos a where a.cuenta_id=c.id and a.usuario_id=auth.uid() and a.activo and a.estado='activo')
 loop
   v_out:=v_out||jsonb_build_array(jsonb_build_object('cuenta',v_a.id,'producto',v_a.producto,'negocio',v_a.nombre,
    'persona',v_a.persona->>'id','nombre',v_a.persona->>'nombre','rol',public.nuvoor_personal_rol_base(public.rol_en(v_a.id)),'plan',v_a.plan,'estado',v_a.estado,'vence',v_a.vence));
 end loop;
 return v_out;
end $$;

revoke all on function public.nuvoor_personal_mis_negocios() from public, anon;
grant execute on function public.nuvoor_personal_mis_negocios() to authenticated;

create or replace function public.rest_personal_pin(p_cuenta uuid,p_aparato text,p_pin text,p_autorizar boolean default false,p_comanda text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ctx jsonb;v_id uuid;v_d public.rest_personal_dispositivos%rowtype;v_a public.rest_personal_accesos%rowtype;v_p jsonb;v_salt text;v_hash text;v_amr numeric:=0;
begin
 v_ctx:=public.rest_personal_contexto(p_cuenta);v_id:=(v_ctx->>'accesoId')::uuid;
 select * into v_a from public.rest_personal_accesos where id=v_id for update;
 if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' or (coalesce(p_pin,'') !~ '^[0-9]{4,12}$' and not (v_ctx->>'producto'='taller' and length(coalesce(p_pin,'')) between 1 and 64)) then return jsonb_build_object('ok',false,'error','Escribe un PIN válido.');end if;
 insert into public.rest_personal_dispositivos(acceso_id,aparato) values(v_id,p_aparato) on conflict do nothing;
 select * into v_d from public.rest_personal_dispositivos where acceso_id=v_id and aparato=p_aparato for update;
 if p_autorizar then
  if v_ctx->>'producto'<>'restaurant' then raise exception 'Autorización exclusiva de Restaurant.' using errcode='42501';end if;
  perform public.rest_personal_sesion(p_cuenta,p_aparato);
  if coalesce(p_comanda,'')='' then return jsonb_build_object('ok',false,'error','Primero abre el pedido.');end if;
  if v_a.bloqueado_autorizar>clock_timestamp()-interval '15 minutes' then return jsonb_build_object('ok',false,'error','Se alcanzó el límite de intentos de autorización. Espera 15 minutos.');end if;
  if v_a.bloqueado_autorizar is not null then
   update public.rest_personal_accesos set fallos_autorizar=0,bloqueado_autorizar=null where id=v_id;
   v_a.fallos_autorizar:=0;v_a.bloqueado_autorizar:=null;
  end if;
 else
  if v_a.bloqueado_pin is not null then
   -- Renovar la sesión con un código por correo permite volver a intentar el PIN propio.
   select coalesce(max((x->>'timestamp')::numeric),0) into v_amr from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) x where x->>'method' in ('otp','magiclink','invite');
   if v_amr<=extract(epoch from v_a.bloqueado_pin) then return jsonb_build_object('ok',false,'verificarCorreo',true,'error','Confirma tu correo para volver a intentar.');end if;
   update public.rest_personal_accesos set fallos_pin=0,bloqueado_pin=null where id=v_id;
   update public.rest_personal_dispositivos set fallos=0,bloqueado=null where acceso_id=v_id and aparato=p_aparato;
   v_d.fallos:=0;v_d.bloqueado:=null;
   v_a.fallos_pin:=0;v_a.bloqueado_pin:=null;
  end if;
 end if;
 select cuerpo->>'pinSalt' into v_salt from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
 v_hash:=encode(sha256(convert_to(coalesce(v_salt,'')||p_pin,'UTF8')),'hex');
 select cuerpo into v_p from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and coalesce(cuerpo->>'eventoId','')=''
 and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true'
 and (case when p_autorizar then cuerpo->>'rol' in ('gerente','cajero') else cuerpo->>'id'=v_ctx->>'persona' end)
 and coalesce(v_salt,'')<>'' and cuerpo->>'pin_hash'=v_hash limit 1;
 -- Un PIN compartido no identifica a la autoridad. No permite usar el
 -- PIN propio de un mesero que coincida con el de caja o gerencia.
 if p_autorizar and (select count(*) from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo'
 and coalesce(cuerpo->>'eventoId','')='' and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true'
 and cuerpo->>'pin_hash'=v_hash)<>1 then v_p:=null;end if;
 if v_p is null then
  if p_autorizar then
  if v_ctx->>'producto'<>'restaurant' then raise exception 'Autorización exclusiva de Restaurant.' using errcode='42501';end if;
   update public.rest_personal_accesos set fallos_autorizar=case when bloqueado_autorizar<clock_timestamp()-interval '15 minutes' then 1 else fallos_autorizar+1 end,
   bloqueado_autorizar=case when fallos_autorizar>=4 then clock_timestamp() else bloqueado_autorizar end where id=v_id;
   update public.rest_personal_dispositivos set fallos_autorizacion=case when autorizacion_bloqueada<clock_timestamp()-interval '15 minutes' then 1 else fallos_autorizacion+1 end,
   autorizacion_bloqueada=case when fallos_autorizacion>=4 then clock_timestamp() else autorizacion_bloqueada end where acceso_id=v_id and aparato=p_aparato;
  else
   update public.rest_personal_accesos set fallos_pin=fallos_pin+1,bloqueado_pin=case when fallos_pin>=4 then clock_timestamp() else null end where id=v_id;
   update public.rest_personal_dispositivos set fallos=fallos+1,bloqueado=case when fallos>=4 then clock_timestamp() else null end,vence=null where acceso_id=v_id and aparato=p_aparato;
  end if;
  return jsonb_build_object('ok',false,'verificarCorreo',not p_autorizar and v_a.fallos_pin>=4,'error','El PIN no corresponde a un perfil autorizado.');
 end if;
 if p_autorizar then
  if v_ctx->>'producto'<>'restaurant' then raise exception 'Autorización exclusiva de Restaurant.' using errcode='42501';end if;
  if not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas' and cuerpo->>'id'=p_comanda and cuerpo->>'estado'='abierta') then raise exception 'El pedido ya cambió.' using errcode='22023';end if;
  update public.rest_personal_dispositivos set fallos_autorizacion=0,autorizacion_bloqueada=null where acceso_id=v_id and aparato=p_aparato;
  update public.rest_personal_accesos set fallos_autorizar=0,bloqueado_autorizar=null where id=v_id;
 else
  update public.rest_personal_dispositivos set fallos=0,bloqueado=null,vence=clock_timestamp()+interval '12 hours',fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date,ultima_autenticacion=v_amr where acceso_id=v_id and aparato=p_aparato;
  update public.rest_personal_accesos set fallos_pin=0,bloqueado_pin=null where id=v_id;
 end if;
 return jsonb_build_object('ok',true,'persona',v_p->>'id','nombre',v_p->>'nombre');
end $$;

create or replace function public.rest_personal_fase1(p_cuenta uuid,p_aparato text,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare ctx jsonb;gerente boolean:=false;dueno boolean;persona text;nombre text;rol text;sem date;sur text;
 w public.rest_personal_semanas%rowtype;r public.rest_personal_peticiones%rowtype;
 t jsonb;xs jsonb;ys jsonb;avisos jsonb;team jsonb;perfiles jsonb;peticiones jsonb;checadas jsonb;dispo jsonb;
 sal text;hash text;pin text;f public.rest_personal_fallos%rowtype;u jsonb;v_cuenta integer;registro public.rest_personal_checadas%rowtype;
 totalmin numeric:=0;tarifa numeric;importe numeric;pd jsonb;dias integer;ultimo timestamptz;dia date;prod42 text;sin_pin42 boolean;rol_nativo42 text;persona42 text;ahora timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 if length(p_datos::text)>600000 then raise exception 'La operación es demasiado grande.';end if;
 -- SQL 38 también considera administrador al gerente con acceso personal.
 -- Esa sesión puede gestionar horarios, pero nunca habilitar un checador.
 select producto into prod42 from public.cuentas where id=p_cuenta and producto in ('restaurant','tiendita','taller');
 if prod42 is null then raise exception 'Negocio sin Personal.' using errcode='42501';end if;
 dueno:=coalesce(public.rol_en(p_cuenta)='admin',false) or
   (prod42='restaurant' and exists(select 1 from public.staff where id=auth.uid() and rol='dueno'));
 if dueno then
  gerente:=true;nombre:='Administración';rol:='gerente';
  select d.cuerpo into ctx from public.rest_personal_operadores o join public.documentos d on d.cuenta_id=o.cuenta_id and d.coleccion='rest_equipo' and d.cuerpo->>'id'=o.persona where o.cuenta_id=p_cuenta and o.usuario=auth.uid() and o.aparato=p_aparato and o.vence>ahora and d.cuerpo->>'activo' is distinct from 'false' and d.cuerpo->>'_eliminado' is distinct from 'true';
  if ctx is not null and public.nuvoor_personal_rol_perfil(p_cuenta,ctx) is null then ctx:=null;end if;
  if ctx is null and p_accion not in ('identificar','checar','bloquear') and (exists(select 1 from public.rest_personal_operadores where cuenta_id=p_cuenta and usuario=auth.uid() and aparato=p_aparato) or (prod42<>'restaurant' and exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and d.cuerpo->>'activo' is distinct from 'false' and d.cuerpo->>'_eliminado' is distinct from 'true' and coalesce(d.cuerpo->>'pin_hash','')<>''))) then raise exception 'Confirma tu PIN para continuar.' using errcode='42501',hint='PIN_REQUERIDO';end if;
  if ctx is not null then persona:=ctx->>'id';nombre:=ctx->>'nombre';rol:=public.nuvoor_personal_rol_perfil(p_cuenta,ctx);gerente:=rol='gerente';end if;
 else ctx:=public.nuvoor_personal_sesion(p_cuenta,p_aparato);persona:=ctx->>'persona';nombre:=ctx->>'nombre';rol:=public.nuvoor_personal_rol_perfil(p_cuenta,ctx);gerente:=rol='gerente';end if;
 if not exists(select 1 from public.cuentas where id=p_cuenta and (prod42='restaurant' or plan<>'ninguno') and estado='activa' and (vence is null or vence>=now())) then raise exception 'El plan no está vigente.' using errcode='42501';end if;
 sem:=coalesce((p_datos->>'semana')::date,date_trunc('week',ahora at time zone 'America/Mexico_City')::date);sur:=coalesce(nullif(p_datos->>'sucursal',''),'principal');
 if prod42<>'restaurant' and sur<>'principal' then raise exception 'Selecciona otra cuenta para cambiar de sucursal.' using errcode='42501';end if;
 if coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then raise exception 'Dispositivo inválido.' using errcode='22023';end if;
 if extract(isodow from sem)<>1 or length(sur)>120 then raise exception 'Revisa la semana y sucursal.';end if;
 -- Serializa decisiones, revisiones y checadas de cada negocio.
 perform pg_advisory_xact_lock(hashtextextended('personal39:'||p_cuenta::text,0));
 if p_accion in ('guardar_pin','guardar_persona','terminal','borrador','publicar','perfil','resolver','importar_asistencias') and not gerente then raise exception 'Sólo gerencia puede hacer esto.' using errcode='42501';end if;
 if p_accion='bloquear' then
  if prod42='restaurant' or not dueno then raise exception 'Este aparato no puede cerrar la sesión del perfil.' using errcode='42501';end if;
  insert into public.rest_personal_operadores values(p_cuenta,auth.uid(),p_aparato,'bloqueado',ahora)
  on conflict(cuenta_id,usuario,aparato) do update set vence=excluded.vence;
  return jsonb_build_object('ok',true);
 end if;
 select not exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo'
   and coalesce(d.cuerpo->>'pin_hash','')<>'' and d.cuerpo->>'activo' is distinct from 'false' and d.cuerpo->>'_eliminado' is distinct from 'true'
   and coalesce(d.cuerpo->>'eventoId','')='') into sin_pin42;
 if p_accion in ('identificar','checar') then
  if not dueno then raise exception 'Checa en un aparato del negocio, no desde tu sesión personal.' using errcode='42501';end if;
  insert into public.rest_personal_fallos values(p_cuenta,auth.uid(),0,null) on conflict do nothing;
  select * into f from public.rest_personal_fallos where cuenta_id=p_cuenta and usuario=auth.uid() for update;
  if f.hasta>ahora then return jsonb_build_object('ok',false,'espera',ceil(extract(epoch from f.hasta-ahora)),'error','Espera 30 segundos antes de intentar otra vez.');end if;
  pin:=p_datos->>'pin';select cuerpo->>'pinSalt' into sal from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
  if prod42<>'restaurant' and p_accion='identificar' and coalesce(pin,'')='' and sin_pin42 then
    select d.cuerpo into u from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo'
      and public.nuvoor_personal_rol_perfil(d.cuenta_id,d.cuerpo)='gerente' and d.cuerpo->>'activo' is distinct from 'false' and d.cuerpo->>'_eliminado' is distinct from 'true'
    order by (d.cuerpo->>'id'=auth.uid()::text) desc,d.doc_id limit 1;
    if u is not null then v_cuenta:=1;end if;
  elsif (coalesce(pin,'')~'^\d{4,12}$' or (prod42='taller' and p_datos ? 'persona' and length(coalesce(pin,'')) between 1 and 64)) and coalesce(sal,'')<>'' then
   hash:=encode(sha256(convert_to(sal||pin,'UTF8')),'hex');
   select count(*),min(cuerpo::text)::jsonb into v_cuenta,u from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'pin_hash'=hash and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true' and coalesce(cuerpo->>'eventoId','')='';
  end if;
  if coalesce(v_cuenta,0)<>1 or public.nuvoor_personal_rol_perfil(p_cuenta,u) is null or (prod42='taller' and p_datos ? 'persona' and p_datos->>'persona' is distinct from u->>'id') then
   update public.rest_personal_fallos set intentos=case when hasta is not null and hasta<=ahora then 1 else intentos+1 end,hasta=case when (case when hasta is not null and hasta<=ahora then 0 else intentos end)>=4 then ahora+interval '30 seconds' else null end where cuenta_id=p_cuenta and usuario=auth.uid();
   return jsonb_build_object('ok',false,'error','PIN incorrecto.');
  end if;
  update public.rest_personal_fallos set intentos=0,hasta=null where cuenta_id=p_cuenta and usuario=auth.uid();
  if p_accion='identificar' then
   if p_datos->>'solo_checar' is distinct from 'true' then insert into public.rest_personal_operadores values(p_cuenta,auth.uid(),p_aparato,u->>'id',ahora+interval '12 hours') on conflict(cuenta_id,usuario,aparato) do update set persona=excluded.persona,vence=excluded.vence;end if;
   return jsonb_build_object('ok',true,'persona',u->>'id','nombre',u->>'nombre','rol',public.nuvoor_personal_rol_perfil(p_cuenta,u),'rolPos',u->>'rolPos');
  end if;
  if prod42='taller' and coalesce(p_datos->>'foto','') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' then
   raise exception 'Toma la foto antes de registrar la checada.' using errcode='22023';
  end if;
  if not exists(select 1 from public.rest_personal_terminales where cuenta_id=p_cuenta and token_hash=encode(sha256(convert_to(coalesce(p_datos->>'terminal',''),'UTF8')),'hex') and usuario=auth.uid() and activo) then raise exception 'Este aparato no está autorizado como checador.' using errcode='42501';end if;
  select * into registro from public.rest_personal_checadas where cuenta_id=p_cuenta and rest_personal_checadas.persona=u->>'id' and anulada_por is null order by instante desc limit 1;
  if registro.instante>ahora-interval '15 seconds' then raise exception 'La checada acaba de registrarse. Espera un momento.';end if;
  insert into public.rest_personal_checadas(cuenta_id,persona,tipo,origen,foto) values(p_cuenta,u->>'id',case when registro.tipo='entrada' then 'salida' else 'entrada' end,'terminal',left(coalesce(p_datos->>'foto',''),500000)) returning * into registro;
  return jsonb_build_object('ok',true,'registro',to_jsonb(registro),'nombre',u->>'nombre');
 elsif p_accion='terminal' then
  if not dueno then raise exception 'Sólo la sesión del negocio puede autorizar un checador.';end if;
  if length(coalesce(p_datos->>'terminal',''))<32 then raise exception 'Identificador inválido.';end if;
  insert into public.rest_personal_terminales values(p_cuenta,encode(sha256(convert_to(p_datos->>'terminal','UTF8')),'hex'),auth.uid(),coalesce((p_datos->>'activo')::boolean,true),left(coalesce(p_datos->>'nombre','Checador'),120)) on conflict(cuenta_id,token_hash) do update set activo=excluded.activo,usuario=excluded.usuario;
 elsif p_accion='guardar_pin' then
  if prod42<>'tiendita' then raise exception 'Cambia el PIN desde el equipo original.' using errcode='42501';end if;
  pin:=p_datos->>'pin';persona42:=p_datos->>'persona';
  if coalesce(pin,'') !~ '^[0-9]{4,12}$' then raise exception 'El PIN debe tener entre 4 y 12 números.' using errcode='22023';end if;
  select cuerpo->>'pinSalt' into sal from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
  if coalesce(sal,'')='' then raise exception 'Prepara Personal antes de asignar PIN.';end if;
  hash:=encode(sha256(convert_to(sal||pin,'UTF8')),'hex');
  if exists(select 1 from public.documentos d where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and d.cuerpo->>'id'<>persona42 and d.cuerpo->>'pin_hash'=hash and d.cuerpo->>'activo' is distinct from 'false') then
   raise exception 'Ese PIN ya está asignado.' using errcode='22023';end if;
  update public.documentos set cuerpo=jsonb_set(cuerpo,'{pin_hash}',to_jsonb(hash)),actualizado=ahora
  where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'id'=persona42 and cuerpo->>'activo' is distinct from 'false';
  if not found then raise exception 'Selecciona una persona activa.' using errcode='22023';end if;
  if sin_pin42 and dueno then
   if not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'id'=persona42 and cuerpo->>'rol'='gerente') then
     raise exception 'Asigna primero el PIN de administración.' using errcode='22023';
   end if;
   insert into public.rest_personal_operadores values(p_cuenta,auth.uid(),p_aparato,persona42,ahora+interval '12 hours')
   on conflict(cuenta_id,usuario,aparato) do update set persona=excluded.persona,vence=excluded.vence;
  end if;
  update public.rest_personal_operadores set vence=ahora where cuenta_id=p_cuenta and rest_personal_operadores.persona=persona42 and aparato<>p_aparato;
  delete from public.rest_personal_dispositivos where acceso_id in (select id from public.rest_personal_accesos where cuenta_id=p_cuenta and persona_id=persona42);
  sin_pin42:=false;
 elsif p_accion='guardar_persona' then
  if prod42<>'tiendita' then raise exception 'Agrega personas desde el equipo original.' using errcode='42501';end if;
  rol_nativo42:=p_datos->>'rol';persona42:=gen_random_uuid()::text;
  if rol_nativo42 not in ('gerente','cajero','mesero','cocina') or coalesce(btrim(p_datos->>'nombre'),'')='' then raise exception 'Revisa nombre y puesto.';end if;
  insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo) values(p_cuenta,'rest_equipo','personal42_'||persona42,
    jsonb_build_object('id',persona42,'nombre',left(btrim(p_datos->>'nombre'),120),'rol',rol_nativo42,'rolPos',rol_nativo42,'activo',true,'eventoId','','pin_hash','','fuente42','personal'));
 elsif p_accion='perfil' then
  if not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'id'=p_datos->>'persona') or coalesce((p_datos->'pago'->>'monto')::numeric,0)<0 then raise exception 'Revisa el expediente y sueldo.';end if;
  insert into public.rest_personal_perfiles values(p_cuenta,p_datos->>'persona',coalesce((p_datos->>'horas')::numeric,48),coalesce(p_datos->'pago','{}'),coalesce(p_datos->'horario','{}')) on conflict(cuenta_id,persona) do update set horas=excluded.horas,pago=excluded.pago,horario=excluded.horario;
 elsif p_accion in ('borrador','publicar') then
  insert into public.rest_personal_semanas(cuenta_id,sucursal,semana) values(p_cuenta,sur,sem) on conflict do nothing;
  select * into w from public.rest_personal_semanas where cuenta_id=p_cuenta and sucursal=sur and semana=sem for update;
  if coalesce((p_datos->>'revision')::integer,-1)<>w.revision then raise exception 'El horario cambió en otro aparato. Actualiza antes de guardar.' using errcode='40001';end if;
  xs:=case when p_accion='borrador' then p_datos->'turnos' else w.borrador end;
  avisos:=public.rest_personal_revisar(p_cuenta,sem,xs,sur);
  if jsonb_array_length(avisos)>0 and p_datos->>'confirmar' is distinct from 'true' then return jsonb_build_object('ok',false,'confirmar',true,'avisos',avisos);end if;
  update public.rest_personal_semanas set borrador=xs,revision=revision+1,
   publicado=case when p_accion='publicar' then xs else publicado end,
   version=version+case when p_accion='publicar' then 1 else 0 end,
   historial=case when p_accion='publicar' then historial||jsonb_build_array(jsonb_build_object('version',version+1,'quien',nombre,'cuando',ahora,'turnos',xs)) else historial end
   where cuenta_id=p_cuenta and sucursal=sur and semana=sem;
  if p_accion='publicar' then update public.rest_personal_peticiones set estado='Publicado' where cuenta_id=p_cuenta and sucursal=sur and semana=sem and estado='Aprobado (falta publicar)';end if;
 elsif p_accion='solicitar' then
  if not gerente and p_datos->>'tipo' not in ('cambio','descanso','cobertura','vacaciones') then raise exception 'Esta solicitud la registra gerencia.' using errcode='42501';end if;
  if not gerente and rol not in ('mesero','cajero','cocina') then raise exception 'No puedes solicitar cambios.';end if;
  if gerente then persona:=p_datos->>'persona';end if;
  if coalesce(persona,'')='' or length(coalesce(p_datos->>'motivo',''))>2000 or jsonb_typeof(p_datos->'datos')<>'object' then raise exception 'Completa la solicitud.';end if;
  t:=p_datos->'datos';
  if not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'id'=persona and cuerpo->>'activo' is distinct from 'false') or length(trim(coalesce(p_datos->>'motivo','')))=0 then raise exception 'Completa la persona y el motivo.';end if;
  dia:=coalesce(t->>'desde',t->>'fecha')::date;
  if dia is null or dia<sem or dia>sem+6 or coalesce(t->>'hasta',t->>'fecha')::date<dia or coalesce(t->>'hasta',t->>'fecha')::date>sem+6 then raise exception 'Registra una solicitud por semana, dentro de la semana seleccionada.';end if;
  if p_datos->>'tipo'='ausencia' and length(trim(coalesce(t->>'justificante','')))=0 then raise exception 'Incluye la descripción o referencia del justificante.';end if;
  if p_datos->>'tipo' in ('cambio','checada') then perform public.rest_personal_intervalo(t);end if;
  if p_datos->>'tipo'='checada' and upper(public.rest_personal_intervalo(t)) at time zone 'America/Mexico_City'>ahora then raise exception 'No corrijas una checada futura.';end if;
  if coalesce((coalesce(t->>'fecha',t->>'desde'))::date,sem)<(ahora at time zone 'America/Mexico_City')::date and p_datos->>'tipo'<>'checada' then raise exception 'Elige un día futuro.';end if;
  select * into w from public.rest_personal_semanas where cuenta_id=p_cuenta and sucursal=sur and semana=sem;
  if p_datos->>'tipo'='cobertura' then
   if not exists(select 1 from public.documentos a join public.documentos b on b.cuenta_id=a.cuenta_id and b.coleccion='rest_equipo' where a.cuenta_id=p_cuenta and a.coleccion='rest_equipo' and a.cuerpo->>'id'=persona and b.cuerpo->>'id'=t->>'companero' and (case a.cuerpo->>'rol' when 'mesero' then 'servicio' when 'cocina' then 'cocina' else 'gerencia' end)=(case b.cuerpo->>'rol' when 'mesero' then 'servicio' when 'cocina' then 'cocina' else 'gerencia' end) and a.cuerpo->>'id'<>b.cuerpo->>'id' and b.cuerpo->>'activo' is distinct from 'false') then raise exception 'Elige un compañero activo del mismo puesto.';end if;
   if exists(select 1 from jsonb_array_elements(w.publicado) a,jsonb_array_elements(w.publicado) b where a->>'persona'=persona and a->>'fecha'=t->>'fecha' and b->>'persona'=t->>'companero' and public.rest_personal_intervalo(a)&&public.rest_personal_intervalo(b)) then raise exception 'Tu compañero ya trabaja en ese horario.';end if;
  end if;
  insert into public.rest_personal_peticiones(cuenta_id,sucursal,semana,persona,tipo,datos,companero,estado,motivo)
   values(p_cuenta,sur,sem,persona,p_datos->>'tipo',t,t->>'companero',case when p_datos->>'tipo'='cobertura' then 'Esperando al compañero' else 'Pendiente' end,coalesce(p_datos->>'motivo',''));
 elsif p_accion in ('aceptar','resolver') then
  select * into r from public.rest_personal_peticiones where id=(p_datos->>'id')::uuid and cuenta_id=p_cuenta for update;
  if not found then raise exception 'No existe esa solicitud.';end if;
  if p_accion='aceptar' then
   if persona is distinct from r.companero or r.estado<>'Esperando al compañero' then raise exception 'Sólo el compañero elegido puede responder.' using errcode='42501';end if;
   update public.rest_personal_peticiones set aceptada=case when p_datos->>'acepto'='true' then ahora else null end,estado=case when p_datos->>'acepto'='true' then 'Pendiente' else 'Rechazado' end,decidida=ahora,decidida_por=nombre where id=r.id;
  else
   if r.estado<>'Pendiente' then raise exception 'La solicitud ya cambió o espera al compañero.';end if;
   if p_datos->>'aprobar'='true' then
    if r.tipo='checada' then
     if (r.datos->>'fecha')::date>(ahora at time zone 'America/Mexico_City')::date then raise exception 'No corrijas una fecha futura.';end if;
     perform public.rest_personal_intervalo(r.datos);
     update public.rest_personal_checadas set anulada_por=r.id where cuenta_id=p_cuenta and rest_personal_checadas.persona=r.persona and anulada_por is null and (instante at time zone 'America/Mexico_City')::date=(r.datos->>'fecha')::date;
     insert into public.rest_personal_checadas(cuenta_id,persona,instante,tipo,origen,corregida_por,solicitud) values(p_cuenta,r.persona,((r.datos->>'fecha')::date+(r.datos->>'entrada')::time) at time zone 'America/Mexico_City','entrada','correccion',auth.uid(),r.id);
     insert into public.rest_personal_checadas(cuenta_id,persona,instante,tipo,origen,corregida_por) values(p_cuenta,r.persona,upper(public.rest_personal_intervalo(r.datos)) at time zone 'America/Mexico_City','salida','correccion',auth.uid());
    else
     select * into w from public.rest_personal_semanas where cuenta_id=p_cuenta and sucursal=r.sucursal and semana=r.semana for update;
     if not found then raise exception 'Publica primero el horario de esa semana.';end if;
     if r.tipo='cobertura' and r.aceptada is null then raise exception 'Primero debe aceptar el compañero.';end if;
     xs:='[]';v_cuenta:=0;
     for t in select value from jsonb_array_elements(w.borrador) loop
      if t->>'persona'=r.persona and (t->>'fecha')::date between coalesce(r.datos->>'desde',r.datos->>'fecha')::date and coalesce(r.datos->>'hasta',r.datos->>'fecha')::date then
       v_cuenta:=v_cuenta+1;
       if r.tipo='cambio' then t:=t||jsonb_build_object('entrada',r.datos->>'entrada','salida',r.datos->>'salida');
       elsif r.tipo='cobertura' then t:=t||jsonb_build_object('persona',r.companero);
       else t:=t||jsonb_build_object('persona','');end if;
      end if;xs:=xs||jsonb_build_array(t);
     end loop;
     if v_cuenta=0 then raise exception 'El turno ya cambió. Revisa el horario.';end if;
     if r.tipo='cambio' and v_cuenta<>1 then raise exception 'Selecciona un solo turno para cambiar sus horas.';end if;
     avisos:=public.rest_personal_revisar(p_cuenta,r.semana,xs,r.sucursal);
     if jsonb_array_length(avisos)>0 and p_datos->>'confirmar' is distinct from 'true' then return jsonb_build_object('ok',false,'confirmar',true,'avisos',avisos);end if;
     update public.rest_personal_semanas set borrador=xs,revision=revision+1 where cuenta_id=p_cuenta and sucursal=r.sucursal and semana=r.semana;
    end if;
   end if;
   update public.rest_personal_peticiones set estado=case when p_datos->>'aprobar'='true' then case when tipo='checada' then 'Aprobado' else 'Aprobado (falta publicar)' end else 'Rechazado' end,decidida=ahora,decidida_por=nombre where id=r.id;
  end if;
 elsif p_accion='importar_asistencias' then
  if jsonb_typeof(p_datos->'registros')<>'array' or jsonb_array_length(p_datos->'registros')>200 then raise exception 'Importa como máximo 200 registros por lote.';end if;
  for t in select value from jsonb_array_elements(p_datos->'registros') loop
   if coalesce(t->>'id','')='' or length(t->>'id')>200 or coalesce(t->>'tipo','') not in ('entrada','salida') or not exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'id'=t->>'uid') then raise exception 'Revisa la asistencia anterior.';end if;
   ultimo:=((t->>'fecha')::date+(t->>'hora')::time) at time zone 'America/Mexico_City';
   if ultimo>ahora then raise exception 'No se importa una checada futura.';end if;
   insert into public.rest_personal_checadas(cuenta_id,persona,instante,tipo,origen,legacy_id) values(p_cuenta,t->>'uid',ultimo,t->>'tipo','migracion-autorizada',t->>'id') on conflict(cuenta_id,legacy_id) where legacy_id is not null do nothing;
  end loop;
 elsif p_accion='disponibilidad' then
  if prod42<>'restaurant' then raise exception 'Sólo Restaurant comunica disponibilidad de cocina.' using errcode='42501';end if;
  if not gerente and rol<>'cocina' then raise exception 'Sólo cocina o gerencia cambia la disponibilidad.' using errcode='42501';end if;
  t:=case when p_datos->>'agotado'='true' then jsonb_build_object('hora',ahora,'quien',nombre) else null end;
  insert into public.rest_personal_disponibilidad values(p_cuenta,p_datos->>'platillo',t) on conflict(cuenta_id,platillo) do update set agotado=excluded.agotado;
  update public.documentos set cuerpo=jsonb_set(cuerpo,'{agotado}',coalesce(t,'null')),actualizado=ahora where cuenta_id=p_cuenta and coleccion='rest_carta' and cuerpo->>'tipo'='platillo' and cuerpo->>'id'=p_datos->>'platillo';
 elsif p_accion<>'leer' then raise exception 'Operación desconocida.';end if;
 select * into w from public.rest_personal_semanas where cuenta_id=p_cuenta and sucursal=sur and semana=sem;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.cuerpo->>'id','nombre',d.cuerpo->>'nombre','rol',d.cuerpo->>'rol','activo',d.cuerpo->>'activo' is distinct from 'false','horasSemana',coalesce(p.horas,48))),'[]') into team from public.documentos d left join public.rest_personal_perfiles p on p.cuenta_id=d.cuenta_id and p.persona=d.cuerpo->>'id' where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and d.cuerpo->>'_eliminado' is distinct from 'true' and coalesce(d.cuerpo->>'eventoId','')='';
 select coalesce(jsonb_agg(to_jsonb(p)),'[]') into perfiles from public.rest_personal_perfiles p where cuenta_id=p_cuenta and (gerente or p.persona=persona);
 select coalesce(jsonb_agg(to_jsonb(p) order by creada desc),'[]') into peticiones from public.rest_personal_peticiones p where cuenta_id=p_cuenta and (gerente or p.persona=persona or p.companero=persona);
 select coalesce(jsonb_agg((case when prod42='restaurant' then to_jsonb(c) else to_jsonb(c)-'foto' end) order by instante),'[]') into checadas from public.rest_personal_checadas c where cuenta_id=p_cuenta and instante>=(sem-14)::timestamp at time zone 'America/Mexico_City' and (gerente or c.persona=persona);
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') into dispo from public.rest_personal_disponibilidad d where cuenta_id=p_cuenta;
 return jsonb_build_object('ok',true,'producto',prod42,'sinPin',sin_pin42,'gerente',gerente,'persona',persona,'equipo',team,'perfiles',perfiles,'solicitudes',peticiones,'checadas',checadas,'disponibilidad',dispo,
  'semana',jsonb_build_object('fecha',sem,'sucursal',sur,'revision',coalesce(w.revision,0),'version',coalesce(w.version,0),'borrador',case when gerente then coalesce(w.borrador,'[]') else '[]'::jsonb end,'publicado',coalesce(w.publicado,'[]'),'historial',case when gerente then coalesce(w.historial,'[]') else '[]'::jsonb end),
  'prenomina',(select coalesce(jsonb_agg(public.rest_personal_prenomina(p_cuenta,x->>'id',sem,sem+6)),'[]') from jsonb_array_elements(team) x where gerente or x->>'id'=persona),
  'terminal',dueno and exists(select 1 from public.rest_personal_terminales where cuenta_id=p_cuenta and token_hash=encode(sha256(convert_to(coalesce(p_datos->>'terminal',''),'UTF8')),'hex') and usuario=auth.uid() and activo));
end $$;

create or replace function public.rest_actividades_rls(c uuid,tip text,dest text,d date,h date default null)
returns boolean language plpgsql stable security definer set search_path=public as $$declare x jsonb;ap text;begin
 if auth.uid() is null or not exists(select 1 from public.cuentas where id=c and producto in ('restaurant','taller','tiendita') and estado='activa' and (vence is null or vence>=now())) then return false;end if;
 if public.rest_personal_admin(c) then return true;end if;
 select q.aparato into ap from public.rest_personal_dispositivos q join public.rest_personal_accesos a on a.id=q.acceso_id where a.cuenta_id=c and a.usuario_id=auth.uid() and q.vence>clock_timestamp() and q.bloqueado is null and q.fecha_pin=(clock_timestamp() at time zone 'America/Mexico_City')::date limit 1;
 if ap is null then return false;end if;x:=public.nuvoor_personal_sesion(c,ap);
 return public.rest_objetivo_asignado(c,x->>'persona',tip,dest,d,coalesce(h,d));
 exception when insufficient_privilege then return false;
end $$;

create or replace function public.rest_personal_crear_pin(p_cuenta uuid,p_pin text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_ctx jsonb;v_salt text;
begin
 v_ctx:=public.rest_personal_contexto(p_cuenta);
 if v_ctx->>'producto'<>'restaurant' then raise exception 'Pide al administrador que asigne tu PIN en Personal.' using errcode='42501';end if;
 if coalesce(p_pin,'') !~ '^[0-9]{4,12}$' then raise exception 'El PIN debe tener entre 4 y 12 números.' using errcode='22023';end if;
 select cuerpo->>'pinSalt' into v_salt from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
 if coalesce(v_salt,'')='' then raise exception 'El gerente necesita guardar los ajustes del negocio antes de configurar el PIN.' using errcode='22023';end if;
 update public.documentos set cuerpo=jsonb_set(cuerpo,'{pin_hash}',to_jsonb(encode(sha256(convert_to(v_salt||p_pin,'UTF8')),'hex'))),actualizado=clock_timestamp()
 where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'id'=v_ctx->>'persona' and coalesce(cuerpo->>'eventoId','')='' and coalesce(cuerpo->>'pin_hash','')='';
 if not found then raise exception 'Tu perfil ya tiene PIN. Usa el actual o pide al gerente que lo cambie en Personal.' using errcode='42501';end if;
 return true;
end $$;

create or replace function public.rest_actividades_rpc(p_cuenta uuid,p_aparato text,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare ctx jsonb;gerente boolean;lectura_gerente boolean;persona text;nombre text;sem date;sur text;hoy date:=(clock_timestamp() at time zone 'America/Mexico_City')::date;
 a public.rest_actividades%rowtype;o public.rest_objetivos%rowtype;h public.rest_actividades_hechas%rowtype;
 t jsonb;v jsonb;acts jsonb:='[]';objs jsonb:='[]';rev jsonb:='[]';f date;dest text;total numeric;foto text;cantidad numeric;uid uuid;avance public.rest_objetivos_avance%rowtype;
begin
 if length(p_datos::text)>16000 then raise exception 'La operación es demasiado grande.';end if;
 ctx:=public.rest_personal_fase1(p_cuenta,p_aparato,'leer',jsonb_build_object('sucursal',p_datos->>'sucursal'));gerente:=coalesce((ctx->>'gerente')::boolean,false);persona:=ctx->>'persona';
 lectura_gerente:=gerente and p_datos->>'solo_mio' is distinct from 'true';
 select x->>'nombre' into nombre from jsonb_array_elements(ctx->'equipo') x where x->>'id'=persona;nombre:=coalesce(nombre,'Administración');
 sem:=coalesce((p_datos->>'semana')::date,date_trunc('week',hoy)::date);sur:=coalesce(p_datos->>'sucursal','principal');
 if extract(isodow from sem)<>1 or length(sur)>120 then raise exception 'Revisa semana y sucursal.';end if;
 perform pg_advisory_xact_lock(hashtextextended('actividades40:'||p_cuenta::text,0));
 if p_accion in ('guardar_actividad','quitar_actividad','guardar_objetivo','quitar_objetivo','revisar') and not gerente then raise exception 'Sólo gerencia puede hacer esto.' using errcode='42501';end if;
 if p_accion='guardar_actividad' then
  if coalesce(trim(p_datos->>'titulo'),'')='' or length(p_datos->>'titulo')>200 or length(coalesce(p_datos->>'instrucciones',''))>2000 then raise exception 'Escribe qué hay que hacer (hasta 200 caracteres).';end if;
  if p_datos->>'para_tipo' not in ('persona','puesto') or (p_datos->>'para_tipo'='puesto' and p_datos->>'para_id' not in ('gerencia','servicio','cocina')) or (p_datos->>'para_tipo'='persona' and not exists(select 1 from jsonb_array_elements(ctx->'equipo') x where x->>'id'=p_datos->>'para_id' and x->>'activo'='true')) then raise exception 'Elige una persona activa o puesto.';end if;
  if p_datos->>'repite' not in ('no','diario','semana') or (p_datos->>'repite'='no' and coalesce((p_datos->>'fecha')::date,hoy-1)<hoy) or (p_datos->>'repite'='semana' and (jsonb_typeof(p_datos->'dias')<>'array' or jsonb_array_length(p_datos->'dias')=0)) then raise exception 'Elige una fecha futura o al menos un día.';end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_datos->'dias','[]')) d where d !~ '^[0-6]$') then raise exception 'Revisa los días.';end if;
  if coalesce(p_datos->>'id','')<>'' then
   select * into a from public.rest_actividades where id=(p_datos->>'id')::uuid and cuenta_id=p_cuenta for update;
   if not found or a.revision<>coalesce((p_datos->>'revision')::integer,-1) or a.retirada is not null then raise exception 'La actividad cambió. Actualiza antes de guardar.' using errcode='40001';end if;
   update public.rest_actividades set historial=historial||jsonb_build_array(to_jsonb(a)-'historial'),vigente_desde=hoy,revision=revision+1,titulo=trim(p_datos->>'titulo'),instrucciones=coalesce(p_datos->>'instrucciones',''),para_tipo=p_datos->>'para_tipo',para_id=p_datos->>'para_id',repite=p_datos->>'repite',dias=array(select value::smallint from jsonb_array_elements_text(coalesce(p_datos->'dias','[]'))),fecha=nullif(p_datos->>'fecha','')::date,hora=nullif(p_datos->>'hora','')::time where id=a.id;
  else
   insert into public.rest_actividades(cuenta_id,sucursal,titulo,instrucciones,para_tipo,para_id,repite,dias,fecha,hora,desde,vigente_desde) values(p_cuenta,sur,trim(p_datos->>'titulo'),coalesce(p_datos->>'instrucciones',''),p_datos->>'para_tipo',p_datos->>'para_id',p_datos->>'repite',array(select value::smallint from jsonb_array_elements_text(coalesce(p_datos->'dias','[]'))),nullif(p_datos->>'fecha','')::date,nullif(p_datos->>'hora','')::time,hoy,hoy);
  end if;
 elsif p_accion='quitar_actividad' then
  update public.rest_actividades set retirada=hoy,revision=revision+1 where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid and revision=(p_datos->>'revision')::integer and retirada is null;if not found then raise exception 'La actividad cambió. Actualiza.' using errcode='40001';end if;
 elsif p_accion='guardar_objetivo' then
  if coalesce(trim(p_datos->>'titulo'),'')='' or length(p_datos->>'titulo')>200 or length(coalesce(p_datos->>'instrucciones',''))>2000 or length(coalesce(p_datos->>'unidad',''))>40 then raise exception 'Completa el objetivo.';end if;
  if p_datos->>'para_tipo' not in ('persona','puesto') or (p_datos->>'para_tipo'='puesto' and p_datos->>'para_id' not in ('gerencia','servicio','cocina')) or (p_datos->>'para_tipo'='persona' and not exists(select 1 from jsonb_array_elements(ctx->'equipo') x where x->>'id'=p_datos->>'para_id' and x->>'activo'='true')) then raise exception 'Elige una persona activa o puesto.';end if;
  f:=case p_datos->>'periodo' when 'semana' then sem when 'mes' then date_trunc('month',sem+6)::date else null end;if f is null then raise exception 'Elige semana o mes.';end if;
  if coalesce(p_datos->>'id','')<>'' then
   select * into o from public.rest_objetivos where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid for update;
   if not found or o.revision<>coalesce((p_datos->>'revision')::integer,-1) or o.retirado then raise exception 'El objetivo cambió. Actualiza.' using errcode='40001';end if;
   if o.marcada is not null or exists(select 1 from public.rest_objetivos_avance where objetivo=o.id) then raise exception 'Este objetivo ya tiene entregas. Consérvalo y crea otro para cambiarlo.';end if;
   update public.rest_objetivos set titulo=trim(p_datos->>'titulo'),instrucciones=coalesce(p_datos->>'instrucciones',''),revision=revision+1,meta=nullif(p_datos->>'meta','')::numeric,unidad=coalesce(p_datos->>'unidad','') where id=o.id;
  else
   insert into public.rest_objetivos(cuenta_id,sucursal,titulo,instrucciones,para_tipo,para_id,periodo,desde,hasta,meta,unidad) values(p_cuenta,sur,trim(p_datos->>'titulo'),coalesce(p_datos->>'instrucciones',''),p_datos->>'para_tipo',p_datos->>'para_id',p_datos->>'periodo',f,case when p_datos->>'periodo'='semana' then f+6 else (f+interval '1 month'-interval '1 day')::date end,nullif(p_datos->>'meta','')::numeric,coalesce(p_datos->>'unidad',''));
  end if;
 elsif p_accion='quitar_objetivo' then
  update public.rest_objetivos set retirado=true,revision=revision+1 where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid and revision=(p_datos->>'revision')::integer;if not found then raise exception 'El objetivo cambió. Actualiza.' using errcode='40001';end if;
 elsif p_accion in ('completar_actividad','foto_preparar') and coalesce(p_datos->>'clase','actividad')='actividad' then
  select * into a from public.rest_actividades where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid;
  f:=(p_datos->>'fecha')::date;v:=public.rest_actividad_version(to_jsonb(a),f);
  if persona is null or a.id is null or f is null or f>hoy or (a.retirada is not null and f>=a.retirada) or not public.rest_actividad_ocurre(v,f) or not public.rest_actividad_asignada(p_cuenta,persona,v->>'para_tipo',v->>'para_id',f) then raise exception 'La actividad no corresponde a tu turno publicado.' using errcode='42501';end if;
  dest:=case when v->>'para_tipo'='puesto' then 'puesto:'||(v->>'para_id') else 'persona:'||persona end;
  select * into h from public.rest_actividades_hechas where actividad=a.id and fecha=f and asignacion=dest for update;
  if h.id is not null and (h.estado in ('revision','aprobada') or h.persona<>persona) then raise exception 'La entrega ya fue enviada o aprobada; no puedes modificarla.' using errcode='42501';end if;
  if p_accion='foto_preparar' then
   uid:=gen_random_uuid();foto:=p_cuenta::text||'/'||uid::text||'.jpg';insert into public.rest_actividades_fotos values(uid,p_cuenta,auth.uid(),persona,'actividad',a.id,f,foto,clock_timestamp());return jsonb_build_object('ok',true,'objeto',foto,'bucket','restaurant-actividades');
  end if;
  if length(coalesce(p_datos->>'nota',''))>2000 then raise exception 'La nota es demasiado larga.';end if;
  perform public.rest_actividad_foto_validar(p_cuenta,persona,'actividad',a.id,f,p_datos->>'foto');
  insert into public.rest_actividades_hechas(cuenta_id,actividad,fecha,asignacion,persona,titulo,estado,nota,foto) values(p_cuenta,a.id,f,dest,persona,v->>'titulo','revision',coalesce(p_datos->>'nota',''),coalesce(p_datos->>'foto','')) on conflict(actividad,fecha,asignacion) do update set estado='revision',nota=excluded.nota,foto=excluded.foto,marcada=clock_timestamp(),revision=rest_actividades_hechas.revision+1,historial=rest_actividades_hechas.historial||jsonb_build_array(to_jsonb(h)-'historial'),revisada=null,revisada_por=null,comentario='';
 elsif p_accion in ('avanzar','cumplir_objetivo','reenviar_objetivo','foto_preparar') then
  select * into o from public.rest_objetivos where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid for update;
  if o.id is null or persona is null or o.retirado or hoy not between o.desde and o.hasta or not public.rest_objetivo_asignado(p_cuenta,persona,o.para_tipo,o.para_id,o.desde,o.hasta) then raise exception 'Este objetivo no corresponde a tus turnos publicados.' using errcode='42501';end if;
  if o.estado in ('revision','aprobada') then raise exception 'El objetivo ya fue enviado o aprobado.' using errcode='42501';end if;
  if length(coalesce(p_datos->>'nota',''))>2000 then raise exception 'La nota es demasiado larga.';end if;
  if p_accion='foto_preparar' then
   uid:=gen_random_uuid();foto:=p_cuenta::text||'/'||uid::text||'.jpg';insert into public.rest_actividades_fotos values(uid,p_cuenta,auth.uid(),persona,'objetivo',o.id,hoy,foto,clock_timestamp());return jsonb_build_object('ok',true,'objeto',foto,'bucket','restaurant-actividades');
  end if;
  perform public.rest_actividad_foto_validar(p_cuenta,persona,'objetivo',o.id,hoy,p_datos->>'foto');
  select coalesce(sum(av.cantidad),0) into total from public.rest_objetivos_avance av where av.objetivo=o.id;
  if p_accion='avanzar' then
   cantidad:=(p_datos->>'cantidad')::numeric;if o.meta is null or cantidad is null or cantidad<=0 or cantidad>1000000000 then raise exception 'Escribe cuántos lograste, mayor que cero.';end if;
   uid:=(p_datos->>'avance_id')::uuid;if uid is null then raise exception 'Falta el identificador del avance.';end if;
   select * into avance from public.rest_objetivos_avance where id=uid;
   if found then if avance.objetivo<>o.id or avance.persona<>persona or avance.cantidad<>cantidad then raise exception 'Ese avance no corresponde.';end if;
   else insert into public.rest_objetivos_avance(id,cuenta_id,objetivo,persona,cantidad,nota) values(uid,p_cuenta,o.id,persona,cantidad,coalesce(p_datos->>'nota',''));total:=total+cantidad;end if;
  elsif p_accion='cumplir_objetivo' and o.meta is not null then raise exception 'Con meta numérica debes registrar avance.';
  elsif p_accion='reenviar_objetivo' and (o.estado<>'regresada' or (o.meta is not null and total<o.meta) or (trim(coalesce(p_datos->>'nota',''))='' and coalesce(p_datos->>'foto','')='')) then raise exception 'Explica qué corregiste antes de reenviar.';end if;
  update public.rest_objetivos set estado=case when meta is null or total>=meta then 'revision' else 'pendiente' end,persona=persona,nota=coalesce(p_datos->>'nota',''),foto=coalesce(p_datos->>'foto',''),marcada=case when meta is null or total>=meta then clock_timestamp() else null end,revision=revision+1,historial=historial||jsonb_build_array(to_jsonb(o)-'historial'),comentario='',revisada=null,revisada_por=null where id=o.id;
 elsif p_accion='revisar' then
  if p_datos->>'aprobar' is distinct from 'true' and trim(coalesce(p_datos->>'comentario',''))='' then raise exception 'Escribe qué falta antes de regresar la entrega.';end if;
  if length(coalesce(p_datos->>'comentario',''))>2000 then raise exception 'El comentario es demasiado largo.';end if;
  if p_datos->>'clase'='actividad' then
   select * into h from public.rest_actividades_hechas where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid for update;
   if h.id is null or h.estado<>'revision' or h.revision<>coalesce((p_datos->>'revision')::integer,-1) then raise exception 'La entrega cambió. Actualiza antes de revisar.' using errcode='40001';end if;
   update public.rest_actividades_hechas set estado=case when p_datos->>'aprobar'='true' then 'aprobada' else 'regresada' end,comentario=coalesce(p_datos->>'comentario',''),revisada=clock_timestamp(),revisada_por=nombre,revision=revision+1,historial=historial||jsonb_build_array(to_jsonb(h)-'historial') where id=h.id;
  else
   select * into o from public.rest_objetivos where cuenta_id=p_cuenta and id=(p_datos->>'id')::uuid for update;
   if o.id is null or o.estado<>'revision' or o.revision<>coalesce((p_datos->>'revision')::integer,-1) then raise exception 'El objetivo cambió. Actualiza antes de revisar.' using errcode='40001';end if;
   update public.rest_objetivos set estado=case when p_datos->>'aprobar'='true' then 'aprobada' else 'regresada' end,comentario=coalesce(p_datos->>'comentario',''),revisada=clock_timestamp(),revisada_por=nombre,revision=revision+1,historial=historial||jsonb_build_array(to_jsonb(o)-'historial') where id=o.id;
  end if;
 elsif p_accion<>'leer' then raise exception 'Operación desconocida.';end if;
 -- Instancias reales; nada aparece antes de que se haya asignado.
 for a in select * from public.rest_actividades where cuenta_id=p_cuenta and sucursal=sur and desde<=sem+6 loop
  for f in select d::date from generate_series(sem,sem+6,interval '1 day') d loop
   v:=public.rest_actividad_version(to_jsonb(a),f);
   if (a.retirada is null or f<a.retirada) and public.rest_actividad_ocurre(v,f) and (lectura_gerente or public.rest_actividad_asignada(p_cuenta,persona,v->>'para_tipo',v->>'para_id',f)) then
    dest:=case when v->>'para_tipo'='puesto' then 'puesto:'||(v->>'para_id') else 'persona:'||(v->>'para_id') end;
    select * into h from public.rest_actividades_hechas where actividad=a.id and fecha=f and asignacion=dest;
    acts:=acts||jsonb_build_array((v-'historial')||jsonb_build_object('fecha_instancia',f,'estado',coalesce(h.estado,case when f<hoy then 'vencida' else 'pendiente' end),'hecho',case when h.id is null then null else to_jsonb(h)-'historial' end));
   end if;
  end loop;
 end loop;
 for o in select * from public.rest_objetivos where cuenta_id=p_cuenta and sucursal=sur and not retirado and desde<=sem+6 and hasta>=sem and (lectura_gerente or public.rest_objetivo_asignado(p_cuenta,persona,para_tipo,para_id,desde,hasta)) loop
  objs:=objs||jsonb_build_array((to_jsonb(o)-'historial')||jsonb_build_object('avance',coalesce((select sum(av.cantidad) from public.rest_objetivos_avance av where av.objetivo=o.id),0),'aportes',coalesce((select jsonb_agg(z) from (select av.persona,sum(av.cantidad) cantidad from public.rest_objetivos_avance av where av.objetivo=o.id group by av.persona) z),'[]'),'mio',coalesce((select sum(av.cantidad) from public.rest_objetivos_avance av where av.objetivo=o.id and av.persona=persona),0)));
 end loop;
 if lectura_gerente then
  select coalesce(jsonb_agg((to_jsonb(x)-'historial')||jsonb_build_object('clase','actividad')),'[]') into rev from public.rest_actividades_hechas x where x.cuenta_id=p_cuenta and x.estado='revision';
  rev:=rev||coalesce((select jsonb_agg((to_jsonb(x)-'historial')||jsonb_build_object('clase','objetivo')) from public.rest_objetivos x where x.cuenta_id=p_cuenta and x.estado='revision' and not x.retirado),'[]');
 end if;
 return jsonb_build_object('ok',true,'gerente',lectura_gerente,'persona',persona,'hoy',hoy,'semana',sem,'actividades',acts,'objetivos',objs,'revisiones',rev,'plantillas',case when lectura_gerente then coalesce((select jsonb_agg(to_jsonb(x)-'historial') from public.rest_actividades x where x.cuenta_id=p_cuenta and x.sucursal=sur and x.retirada is null),'[]') else '[]'::jsonb end);
end $$;

commit;
