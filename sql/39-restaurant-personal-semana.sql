-- 39 · Personal: semanas, solicitudes, checadores y disponibilidad.
-- Después de SQL 38. Carlos lo ejecuta desde Lab. Repetible, sin datos de muestra.
begin;
create table if not exists public.rest_personal_semanas(
 cuenta_id uuid references public.cuentas(id) on delete cascade,
 sucursal text not null default 'principal', semana date not null,
 borrador jsonb not null default '[]', publicado jsonb not null default '[]',
 revision integer not null default 0, version integer not null default 0,
 historial jsonb not null default '[]', primary key(cuenta_id,sucursal,semana));
create table if not exists public.rest_personal_perfiles(
 cuenta_id uuid references public.cuentas(id) on delete cascade,persona text not null,
 horas numeric not null default 48 check(horas between 1 and 168),
 pago jsonb not null default '{}', horario jsonb not null default '{}',primary key(cuenta_id,persona));
create table if not exists public.rest_personal_peticiones(
 id uuid primary key default gen_random_uuid(),cuenta_id uuid not null references public.cuentas(id) on delete cascade,
 sucursal text not null,semana date not null,persona text not null,
 tipo text not null check(tipo in ('cambio','descanso','cobertura','vacaciones','ausencia','checada')),
 datos jsonb not null,estado text not null default 'Pendiente',companero text,
 aceptada timestamptz,decidida timestamptz,decidida_por text,creada timestamptz not null default clock_timestamp(),
 creada_por uuid not null default auth.uid(),motivo text not null default '');
create table if not exists public.rest_personal_terminales(
 cuenta_id uuid references public.cuentas(id) on delete cascade,token_hash text not null,
 usuario uuid not null references auth.users(id),activo boolean not null default true,
 nombre text not null,primary key(cuenta_id,token_hash));
create table if not exists public.rest_personal_fallos(
 cuenta_id uuid references public.cuentas(id) on delete cascade,usuario uuid references auth.users(id),
 intentos integer not null default 0,hasta timestamptz,primary key(cuenta_id,usuario));
create table if not exists public.rest_personal_operadores(
 cuenta_id uuid references public.cuentas(id) on delete cascade,usuario uuid references auth.users(id),
 aparato text not null,persona text not null,vence timestamptz not null,primary key(cuenta_id,usuario,aparato));
create table if not exists public.rest_personal_checadas(
 id uuid primary key default gen_random_uuid(),cuenta_id uuid not null references public.cuentas(id) on delete cascade,
 persona text not null,instante timestamptz not null default clock_timestamp(),tipo text not null check(tipo in ('entrada','salida')),
 foto text not null default '',anulada_por uuid,origen text not null,corregida_por uuid,solicitud uuid unique);
create table if not exists public.rest_personal_disponibilidad(
 cuenta_id uuid references public.cuentas(id) on delete cascade,platillo text not null,
 agotado jsonb,primary key(cuenta_id,platillo));
alter table public.rest_personal_checadas add column if not exists anulada_por uuid;
alter table public.rest_personal_checadas add column if not exists legacy_id text;
create unique index if not exists rest_personal_checadas_legacy on public.rest_personal_checadas(cuenta_id,legacy_id) where legacy_id is not null;
do $$ declare t text;begin foreach t in array array['semanas','perfiles','peticiones','terminales','fallos','operadores','checadas','disponibilidad'] loop
 execute 'alter table public.rest_personal_'||t||' enable row level security';
 execute 'revoke all on public.rest_personal_'||t||' from anon,authenticated';
 execute 'grant all on public.rest_personal_'||t||' to service_role';
end loop;end $$;
-- No hay escrituras directas desde empleados, ni políticas que permitan elegir otra persona.
create or replace function public.rest_personal_intervalo(t jsonb)
returns tsrange language plpgsql immutable set search_path=public as $$
declare d date;e time;s time;begin
 if coalesce(t->>'fecha','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(t->>'entrada','')!~'^([01]\d|2[0-3]):[0-5]\d$' or coalesce(t->>'salida','')!~'^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Revisa fecha y horas.';end if;
 d:=(t->>'fecha')::date;e:=(t->>'entrada')::time;s:=(t->>'salida')::time;
 if e=s then raise exception 'La salida debe ser distinta de la entrada.';end if;
 return tsrange(d+e,d+s+case when s<e then interval '1 day' else interval '0' end,'[)');
end $$;
revoke all on function public.rest_personal_intervalo(jsonb) from public;
create or replace function public.rest_personal_revisar(p_cuenta uuid,p_semana date,p_turnos jsonb,p_sucursal text default 'principal')
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a jsonb;b jsonb;p jsonb;v_h numeric;v_lim numeric;avisos jsonb:='[]';ids text[]:='{}';begin
 if jsonb_typeof(p_turnos)<>'array' or jsonb_array_length(p_turnos)>500 then raise exception 'Revisa los turnos de la semana.';end if;
 for a in select value from jsonb_array_elements(p_turnos) loop
  perform public.rest_personal_intervalo(a);
  if (a->>'fecha')::date<p_semana or (a->>'fecha')::date>p_semana+6 or coalesce(a->>'puesto','') not in ('gerencia','servicio','cocina') or coalesce(a->>'id','')='' or (a->>'id')=any(ids) then raise exception 'El turno no corresponde a la semana o está duplicado.';end if;
  ids:=array_append(ids,a->>'id');
  if coalesce(a->>'persona','')<>'' then
   if exists(select 1 from public.rest_personal_semanas w cross join lateral jsonb_array_elements(w.publicado||w.borrador) z(turno) where w.cuenta_id=p_cuenta and (w.sucursal<>p_sucursal or w.semana<>p_semana) and z.turno->>'persona'=a->>'persona' and public.rest_personal_intervalo(a)&&public.rest_personal_intervalo(z.turno)) then raise exception 'La persona tiene otro turno en otra semana o sucursal.' using errcode='22023';end if;
   select cuerpo into p from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'id'=a->>'persona' and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true' and coalesce(cuerpo->>'eventoId','')='';
   if p is null or (case when p->>'rol'='mesero' then 'servicio' when p->>'rol'='cocina' then 'cocina' else 'gerencia' end)<>a->>'puesto' then raise exception 'La persona no corresponde al puesto.';end if;
   for b in select value from jsonb_array_elements(p_turnos) where value->>'id'<>a->>'id' and coalesce(value->>'persona','')<>'' loop
    if public.rest_personal_intervalo(a)&&public.rest_personal_intervalo(b) then
     if a->>'persona'=b->>'persona' then raise exception 'Una persona no puede tener dos turnos a la vez.' using errcode='22023';end if;
     if a->>'puesto'=b->>'puesto' then avisos:=avisos||jsonb_build_array('Empalme en '||(a->>'puesto'));end if;
    end if;
   end loop;
  end if;
 end loop;
 for p in select jsonb_build_object('id',x->>'persona') from jsonb_array_elements(p_turnos) x where coalesce(x->>'persona','')<>'' group by x->>'persona' loop
  select sum(extract(epoch from (upper(public.rest_personal_intervalo(x))-lower(public.rest_personal_intervalo(x))))/3600) into v_h from jsonb_array_elements(p_turnos) x where x->>'persona'=p->>'id';
  select horas into v_lim from public.rest_personal_perfiles where cuenta_id=p_cuenta and persona=p->>'id';
  if v_h>coalesce(v_lim,48) then avisos:=avisos||jsonb_build_array((p->>'id')||' quedaría con '||v_h||' h de '||coalesce(v_lim,48)||' h');end if;
 end loop;
 return (select coalesce(jsonb_agg(distinct v),'[]') from jsonb_array_elements(avisos) v);
end $$;
revoke all on function public.rest_personal_revisar(uuid,date,jsonb,text) from public;
create or replace function public.rest_personal_prenomina(p_cuenta uuid,p_persona text,p_desde date,p_hasta date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e record;entrada timestamptz;minutos numeric:=0;dias date[]:='{}';abiertas boolean:=false;pag jsonb;tarifa numeric;divisor numeric;importe numeric;propinas numeric;detalle jsonb:='[]';programados integer;retardos integer;tol integer;begin
 for e in select * from public.rest_personal_checadas where cuenta_id=p_cuenta and persona=p_persona and anulada_por is null and instante>=p_desde::timestamp at time zone 'America/Mexico_City' and instante<(p_hasta+2)::timestamp at time zone 'America/Mexico_City' order by instante,id loop
  if e.tipo='entrada' then if entrada is not null then abiertas:=true;end if;entrada:=e.instante;
  elsif entrada is not null then
   if e.instante-entrada>interval '24 hours' then abiertas:=true;end if;
   if (entrada at time zone 'America/Mexico_City')::date<=p_hasta then
    minutos:=minutos+extract(epoch from (e.instante-entrada))/60;
    if not (entrada at time zone 'America/Mexico_City')::date=any(dias) then dias:=array_append(dias,(entrada at time zone 'America/Mexico_City')::date);end if;
    detalle:=detalle||jsonb_build_array(jsonb_build_object('entrada',entrada,'salida',e.instante,'horas',round(extract(epoch from (e.instante-entrada))/3600,2)));
   end if;entrada:=null;
  end if;
 end loop;
 select pago into pag from public.rest_personal_perfiles where cuenta_id=p_cuenta and persona=p_persona;
 tarifa:=coalesce((pag->>'monto')::numeric,0);divisor:=case pag->>'forma' when 'dia' then 1 when 'dosdias' then 2 when 'quincena' then 15 when 'mes' then 30 else 7 end;
 importe:=round(case when pag->>'forma'='hora' then minutos/60*tarifa else cardinality(dias)/divisor*tarifa end,2);
 select coalesce(sum((cuerpo->>'propina')::numeric),0) into propinas from public.documentos where cuenta_id=p_cuenta and coleccion='rest_tickets' and cuerpo->>'meseroId'=p_persona and (cuerpo->>'fecha')::date between p_desde and p_hasta and cuerpo->>'cancelada' is distinct from 'true';
 select coalesce((cuerpo->>'tolerancia')::integer,10) into tol from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
 tol:=coalesce((pag->>'tolerancia')::integer,tol,10);
 select count(distinct t->>'fecha'),count(*) filter(where c.primera>(lower(public.rest_personal_intervalo(t)) at time zone 'America/Mexico_City')+coalesce(tol,10)*interval '1 minute') into programados,retardos
 from public.rest_personal_semanas w cross join lateral jsonb_array_elements(w.publicado) t
 left join lateral(select min(instante) primera from public.rest_personal_checadas where cuenta_id=p_cuenta and persona=p_persona and tipo='entrada' and anulada_por is null and (instante at time zone 'America/Mexico_City')::date=(t->>'fecha')::date) c on true
 where w.cuenta_id=p_cuenta and t->>'persona'=p_persona and (t->>'fecha')::date between p_desde and p_hasta;
 return jsonb_build_object('persona',p_persona,'horas',round(minutos/60,2),'dias',cardinality(dias),'programados',programados,'retardos',retardos,'sueldo',importe,'propinas',propinas,'importe',importe+propinas,'pendiente',entrada is not null or abiertas or tarifa<=0,'detalle',detalle);
end $$;
revoke all on function public.rest_personal_prenomina(uuid,text,date,date) from public;
create or replace function public.rest_personal_fase1(p_cuenta uuid,p_aparato text,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
#variable_conflict use_variable
declare ctx jsonb;gerente boolean:=false;dueno boolean;persona text;nombre text;rol text;sem date;sur text;
 w public.rest_personal_semanas%rowtype;r public.rest_personal_peticiones%rowtype;
 t jsonb;xs jsonb;ys jsonb;avisos jsonb;team jsonb;perfiles jsonb;peticiones jsonb;checadas jsonb;dispo jsonb;
 sal text;hash text;pin text;f public.rest_personal_fallos%rowtype;u jsonb;v_cuenta integer;registro public.rest_personal_checadas%rowtype;
 totalmin numeric:=0;tarifa numeric;importe numeric;pd jsonb;dias integer;ultimo timestamptz;dia date;ahora timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 if length(p_datos::text)>600000 then raise exception 'La operación es demasiado grande.';end if;
 -- SQL 38 también considera administrador al gerente con acceso personal.
 -- Esa sesión puede gestionar horarios, pero nunca habilitar un checador.
 dueno:=exists(select 1 from public.cuentas where id=p_cuenta and producto='restaurant') and (coalesce(public.rol_en(p_cuenta)='admin',false) or exists(select 1 from public.staff where id=auth.uid() and rol='dueno'));
 if dueno then
  gerente:=true;nombre:='Administración';rol:='gerente';
  select d.cuerpo into ctx from public.rest_personal_operadores o join public.documentos d on d.cuenta_id=o.cuenta_id and d.coleccion='rest_equipo' and d.cuerpo->>'id'=o.persona where o.cuenta_id=p_cuenta and o.usuario=auth.uid() and o.aparato=p_aparato and o.vence>ahora and d.cuerpo->>'activo' is distinct from 'false' and d.cuerpo->>'_eliminado' is distinct from 'true';
  if ctx is null and p_accion not in ('identificar','checar') and exists(select 1 from public.rest_personal_operadores where cuenta_id=p_cuenta and usuario=auth.uid() and aparato=p_aparato) then raise exception 'Confirma tu PIN para continuar.' using errcode='42501',hint='PIN_REQUERIDO';end if;
  if ctx is not null then persona:=ctx->>'id';nombre:=ctx->>'nombre';rol:=ctx->>'rol';gerente:=rol='gerente';end if;
 else ctx:=public.rest_personal_sesion(p_cuenta,p_aparato);persona:=ctx->>'persona';nombre:=ctx->>'nombre';rol:=ctx->>'rol';gerente:=rol='gerente';end if;
 if not exists(select 1 from public.cuentas where id=p_cuenta and estado='activa' and vence>now()) then raise exception 'El plan no está vigente.' using errcode='42501';end if;
 sem:=coalesce((p_datos->>'semana')::date,date_trunc('week',ahora at time zone 'America/Mexico_City')::date);sur:=coalesce(nullif(p_datos->>'sucursal',''),'principal');
 if extract(isodow from sem)<>1 or length(sur)>120 then raise exception 'Revisa la semana y sucursal.';end if;
 -- Serializa decisiones, revisiones y checadas de cada negocio.
 perform pg_advisory_xact_lock(hashtextextended('personal39:'||p_cuenta::text,0));
 if p_accion in ('terminal','borrador','publicar','perfil','resolver','importar_asistencias') and not gerente then raise exception 'Sólo gerencia puede hacer esto.' using errcode='42501';end if;
 if p_accion in ('identificar','checar') then
  if not dueno then raise exception 'Checa en un aparato del negocio, no desde tu sesión personal.' using errcode='42501';end if;
  insert into public.rest_personal_fallos values(p_cuenta,auth.uid(),0,null) on conflict do nothing;
  select * into f from public.rest_personal_fallos where cuenta_id=p_cuenta and usuario=auth.uid() for update;
  if f.hasta>ahora then return jsonb_build_object('ok',false,'espera',ceil(extract(epoch from f.hasta-ahora)),'error','Espera 30 segundos antes de intentar otra vez.');end if;
  pin:=p_datos->>'pin';select cuerpo->>'pinSalt' into sal from public.documentos where cuenta_id=p_cuenta and coleccion='rest_config' and doc_id='config_general';
  if coalesce(pin,'')~'^\d{4,12}$' and coalesce(sal,'')<>'' then
   hash:=encode(sha256(convert_to(sal||pin,'UTF8')),'hex');
   select count(*),min(cuerpo::text)::jsonb into v_cuenta,u from public.documentos where cuenta_id=p_cuenta and coleccion='rest_equipo' and cuerpo->>'pin_hash'=hash and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true' and coalesce(cuerpo->>'eventoId','')='';
  end if;
  if coalesce(v_cuenta,0)<>1 then
   update public.rest_personal_fallos set intentos=case when hasta is not null and hasta<=ahora then 1 else intentos+1 end,hasta=case when (case when hasta is not null and hasta<=ahora then 0 else intentos end)>=4 then ahora+interval '30 seconds' else null end where cuenta_id=p_cuenta and usuario=auth.uid();
   return jsonb_build_object('ok',false,'error','PIN incorrecto.');
  end if;
  update public.rest_personal_fallos set intentos=0,hasta=null where cuenta_id=p_cuenta and usuario=auth.uid();
  if p_accion='identificar' then
   if p_datos->>'solo_checar' is distinct from 'true' then insert into public.rest_personal_operadores values(p_cuenta,auth.uid(),p_aparato,u->>'id',ahora+interval '12 hours') on conflict(cuenta_id,usuario,aparato) do update set persona=excluded.persona,vence=excluded.vence;end if;
   return jsonb_build_object('ok',true,'persona',u->>'id','nombre',u->>'nombre','rol',u->>'rol');
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
  if not gerente and rol<>'cocina' then raise exception 'Sólo cocina o gerencia cambia la disponibilidad.' using errcode='42501';end if;
  t:=case when p_datos->>'agotado'='true' then jsonb_build_object('hora',ahora,'quien',nombre) else null end;
  insert into public.rest_personal_disponibilidad values(p_cuenta,p_datos->>'platillo',t) on conflict(cuenta_id,platillo) do update set agotado=excluded.agotado;
  update public.documentos set cuerpo=jsonb_set(cuerpo,'{agotado}',coalesce(t,'null')),actualizado=ahora where cuenta_id=p_cuenta and coleccion='rest_carta' and cuerpo->>'tipo'='platillo' and cuerpo->>'id'=p_datos->>'platillo';
 elsif p_accion<>'leer' then raise exception 'Operación desconocida.';end if;
 select * into w from public.rest_personal_semanas where cuenta_id=p_cuenta and sucursal=sur and semana=sem;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.cuerpo->>'id','nombre',d.cuerpo->>'nombre','rol',d.cuerpo->>'rol','activo',d.cuerpo->>'activo' is distinct from 'false','horasSemana',coalesce(p.horas,48))),'[]') into team from public.documentos d left join public.rest_personal_perfiles p on p.cuenta_id=d.cuenta_id and p.persona=d.cuerpo->>'id' where d.cuenta_id=p_cuenta and d.coleccion='rest_equipo' and d.cuerpo->>'_eliminado' is distinct from 'true' and coalesce(d.cuerpo->>'eventoId','')='';
 select coalesce(jsonb_agg(to_jsonb(p)),'[]') into perfiles from public.rest_personal_perfiles p where cuenta_id=p_cuenta and (gerente or p.persona=persona);
 select coalesce(jsonb_agg(to_jsonb(p) order by creada desc),'[]') into peticiones from public.rest_personal_peticiones p where cuenta_id=p_cuenta and (gerente or p.persona=persona or p.companero=persona);
 select coalesce(jsonb_agg(to_jsonb(c) order by instante),'[]') into checadas from public.rest_personal_checadas c where cuenta_id=p_cuenta and instante>=(sem-14)::timestamp at time zone 'America/Mexico_City' and (gerente or c.persona=persona);
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') into dispo from public.rest_personal_disponibilidad d where cuenta_id=p_cuenta;
 return jsonb_build_object('ok',true,'gerente',gerente,'persona',persona,'equipo',team,'perfiles',perfiles,'solicitudes',peticiones,'checadas',checadas,'disponibilidad',dispo,
  'semana',jsonb_build_object('fecha',sem,'sucursal',sur,'revision',coalesce(w.revision,0),'version',coalesce(w.version,0),'borrador',case when gerente then coalesce(w.borrador,'[]') else '[]'::jsonb end,'publicado',coalesce(w.publicado,'[]'),'historial',case when gerente then coalesce(w.historial,'[]') else '[]'::jsonb end),
  'prenomina',(select coalesce(jsonb_agg(public.rest_personal_prenomina(p_cuenta,x->>'id',sem,sem+6)),'[]') from jsonb_array_elements(team) x where gerente or x->>'id'=persona),
  'terminal',dueno and exists(select 1 from public.rest_personal_terminales where cuenta_id=p_cuenta and token_hash=encode(sha256(convert_to(coalesce(p_datos->>'terminal',''),'UTF8')),'hex') and usuario=auth.uid() and activo));
end $$;
revoke all on function public.rest_personal_fase1(uuid,text,text,jsonb) from public;
grant execute on function public.rest_personal_fase1(uuid,text,text,jsonb) to authenticated;
create or replace function public.nuvoor_rest_personal_semana_disponible()
returns boolean language sql stable as $$select true$$;
grant execute on function public.nuvoor_rest_personal_semana_disponible() to authenticated;
-- Impide que la cola de una carta antigua revierta la disponibilidad actual.
create or replace function public.rest_personal_disponibilidad_guardia()
returns trigger language plpgsql security definer set search_path=public as $$declare a jsonb;begin
 if new.coleccion='rest_carta' and new.cuerpo->>'tipo'='platillo' then
  select agotado into a from public.rest_personal_disponibilidad where cuenta_id=new.cuenta_id and platillo=new.cuerpo->>'id';
  if found then new.cuerpo:=jsonb_set(new.cuerpo,'{agotado}',coalesce(a,'null'));end if;
 elsif new.coleccion='rest_lineas' and new.cuerpo->>'tipo' is null and coalesce(new.cuerpo->>'enviada','') not in ('','false') and (tg_op='INSERT' or coalesce(old.cuerpo->>'enviada','') in ('','false')) then
  if exists(select 1 from public.rest_personal_disponibilidad where cuenta_id=new.cuenta_id and platillo=new.cuerpo->>'platId' and agotado is not null) then raise exception 'Cocina marcó el platillo agotado. Quítalo antes de enviar.' using errcode='22023';end if;
 end if;return new;
end $$;
revoke all on function public.rest_personal_disponibilidad_guardia() from public;
drop trigger if exists rest_personal_disponibilidad_guardia on public.documentos;
create trigger rest_personal_disponibilidad_guardia before insert or update on public.documentos for each row execute function public.rest_personal_disponibilidad_guardia();
notify pgrst,'reload schema';
commit;
