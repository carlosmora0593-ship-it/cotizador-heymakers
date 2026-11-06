-- Caja de Restaurant por negocio y punto de venta. Requiere SQL 19 y 20.
-- Instalar las funciones no activa ninguna caja. Se activa desde la caja física.
begin;

create or replace function public.rest_caja_clave(p_evento text)
returns text language sql immutable set search_path = public
as $$ select case when coalesce(p_evento,'') = '' then 'principal' else 'evento_' || p_evento end $$;

create or replace function public.rest_caja_bloquea(p_cuenta uuid,p_evento text)
returns void language sql volatile set search_path = public
as $$ select pg_advisory_xact_lock(hashtextextended(p_cuenta::text || ':caja:' || coalesce(p_evento,''),0)) $$;

create or replace function public.rest_caja_resumen(p_cuenta uuid,p_evento text,p_turno jsonb)
returns jsonb language sql stable set search_path = public as $$
  with tickets as (
    select distinct on (t.cuerpo->>'id') t.cuerpo from public.documentos t
    where t.cuenta_id = p_cuenta and t.coleccion = 'rest_tickets'
      and coalesce(t.cuerpo->>'eventoId','') = p_evento
      and t.cuerpo->>'turnoId' = p_turno->>'id'
      and t.cuerpo->>'_eliminado' is distinct from 'true'
      and not exists(select 1 from public.documentos c where c.cuenta_id=t.cuenta_id
        and c.coleccion='rest_comandas' and coalesce(c.cuerpo->>'eventoId','')=p_evento
        and c.cuerpo->>'id'=t.cuerpo->>'id' and c.cuerpo->>'estado'='cancelada')
    order by t.cuerpo->>'id',t.actualizado desc,t.doc_id
  ), pagos as (
    select t.cuerpo,
      coalesce((t.cuerpo->>'efectivoCaja')::numeric,
        greatest(0,coalesce(sum((p.dato->>'monto')::numeric) filter(where p.dato->>'tipo'='efectivo'),0)
          - coalesce((t.cuerpo->>'cambio')::numeric,0))) as efectivo,
      coalesce(sum((p.dato->>'monto')::numeric) filter(where p.dato->>'tipo'='tarjeta'),0) as tarjeta,
      coalesce(sum((p.dato->>'monto')::numeric) filter(where p.dato->>'tipo'='transferencia'),0) as transferencia,
      coalesce(sum((p.dato->>'monto')::numeric) filter(where p.dato->>'tipo'='app'),0) as app,
      coalesce(sum((p.dato->>'monto')::numeric)
        filter(where coalesce(p.dato->>'tipo','') not in ('efectivo','tarjeta','transferencia','app')),0) as otros
    from tickets t
    left join lateral jsonb_array_elements(coalesce(t.cuerpo->'pagos','[]'::jsonb)) p(dato) on true
    group by t.cuerpo
  ), cobros as (
    select count(*) as cuentas, coalesce(sum((cuerpo->>'total')::numeric),0) as total,
      coalesce(sum((cuerpo->>'propina')::numeric),0) as propinas,
      coalesce(sum(efectivo),0) as efectivo, coalesce(sum(tarjeta),0) as tarjeta,
      coalesce(sum(transferencia),0) as transferencia, coalesce(sum(app),0) as app,
      coalesce(sum(otros),0) as otros
    from pagos
  ), movimientos as (
    select coalesce(sum((m->>'monto')::numeric) filter(where m->>'tipo'='entrada'),0) as entradas,
      coalesce(sum((m->>'monto')::numeric) filter(where m->>'tipo'='salida'),0) as retiros
    from jsonb_array_elements(coalesce(p_turno->'movs','[]'::jsonb)) m
  ), comandas as (
    select cuerpo from public.documentos
    where cuenta_id = p_cuenta and coleccion = 'rest_comandas'
      and coalesce(cuerpo->>'eventoId','') = p_evento
      and cuerpo->>'turnoId' = p_turno->>'id'
      and cuerpo->>'_eliminado' is distinct from 'true'
  ), cancelaciones as (
    select coalesce(sum((l.cuerpo->>'importe')::numeric),0) as importe
    from public.documentos l join comandas c on c.cuerpo->>'id' = l.cuerpo->>'comandaId'
    where l.cuenta_id = p_cuenta and l.coleccion = 'rest_lineas'
      and coalesce(l.cuerpo->>'eventoId','') = p_evento and l.cuerpo->>'tipo' = 'cancelacion'
      and l.cuerpo->>'_eliminado' is distinct from 'true'
  )
  select jsonb_build_object(
    'cuentas',c.cuentas,'total',c.total,'venta',c.total-c.propinas,'propinas',c.propinas,
    'efectivoCaja',c.efectivo,'por',jsonb_build_object(
      'efectivo',c.efectivo,'tarjeta',c.tarjeta,'transferencia',c.transferencia,'app',c.app,'otros',c.otros),
    'entradas',m.entradas,'retiros',m.retiros,'movs',m.entradas-m.retiros,
    'enCaja',(p_turno->>'fondo')::numeric+c.efectivo+m.entradas-m.retiros,
    'cuentasCanceladas',(select count(*) from comandas where cuerpo->>'estado'='cancelada'),
    'cancelado',a.importe)
  from cobros c cross join movimientos m cross join cancelaciones a
$$;

create or replace function public.rest_caja_operar(
  p_cuenta uuid,p_evento text,p_aparato text,p_accion text,p_datos jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_estado jsonb;
  v_turno jsonb;
  v_corte jsonb;
  v_resumen jsonb;
  v_dato jsonb := coalesce(p_datos,'{}'::jsonb);
  v_evento text := coalesce(p_evento,'');
  v_clave text;
  v_id text;
  v_monto numeric;
  v_hora timestamp := clock_timestamp() at time zone 'America/Mexico_City';
  v_folio integer;
begin
  if public.rol_en(p_cuenta) is distinct from 'admin'
     or not exists(select 1 from public.cuentas where id=p_cuenta and producto='restaurant') then
    raise exception 'No tienes acceso a esta caja.' using errcode='42501';
  end if;
  if v_evento !~ '^[a-zA-Z0-9_-]{0,120}$' or coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then
    raise exception 'La caja o el dispositivo no son válidos.' using errcode='22023';
  end if;
  if p_accion is null or p_accion not in ('activar','abrir','mover','cerrar') then
    raise exception 'La acción de caja no es válida.' using errcode='22023';
  end if;
  v_clave := public.rest_caja_clave(v_evento);
  perform public.rest_caja_bloquea(p_cuenta,v_evento);
  select cuerpo into v_estado from public.documentos
    where cuenta_id=p_cuenta and coleccion='caja_turno_v1' and doc_id=v_clave;
  v_turno := nullif(v_estado->'turno','null'::jsonb);

  if p_accion='activar' and v_estado is not null then
    return jsonb_build_object('estado',v_estado);
  elsif p_accion<>'activar' and v_estado is null then
    raise exception 'Activa la caja compartida desde la caja física.' using errcode='P0001';
  end if;

  v_id := v_dato->>'id';
  if p_accion in ('activar','abrir') then
    if v_turno is not null then
      if v_turno->>'id'=v_id then return jsonb_build_object('estado',v_estado); end if;
      raise exception 'Ya existe un turno abierto en esta caja.' using errcode='P0001';
    end if;
    if p_accion='abrir' or v_id is not null then
      if coalesce(v_id,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then
        raise exception 'Identificador de turno inválido.' using errcode='22023';
      end if;
      if exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='caja_cortes_v1'
        and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'id'=v_id) then
        raise exception 'Ese turno ya tiene un corte guardado.' using errcode='P0001';
      end if;
      v_monto := (v_dato->>'fondo')::numeric;
      if v_monto is null or not (v_monto between 0 and 999999999) then
        raise exception 'Fondo de apertura inválido.' using errcode='22023';
      end if;
      if p_accion='abrir' then
        v_folio := public.rest_siguiente_folio(p_cuenta,'caja_compartida_v1');
        v_dato := jsonb_build_object('id',v_id,'folio','TUR-N-'||lpad(v_folio::text,greatest(5,length(v_folio::text)),'0'),
          'abre',to_char(v_hora,'HH24:MI'),'fecha',to_char(v_hora,'YYYY-MM-DD'),
          'cajero',left(v_dato->>'cajero',120),'cajeroId',v_dato->>'cajeroId','fondo',v_monto,'movs','[]'::jsonb);
      elsif v_dato->>'abierto' is distinct from 'true' or jsonb_typeof(coalesce(v_dato->'movs','[]'::jsonb)) <> 'array' then
        raise exception 'El turno local no es válido.' using errcode='22023';
      end if;
      v_turno := v_dato || jsonb_build_object('abierto',true,'aparato',p_aparato,'eventoId',v_evento);
    end if;
  elsif p_accion='mover' then
    if v_turno is null or v_turno->>'id' is distinct from v_dato->>'turnoId' then
      if exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='caja_cortes_v1'
        and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'id'=v_dato->>'turnoId'
        and cuerpo->'movs' @> jsonb_build_array(jsonb_build_object('id',v_id))) then
        return jsonb_build_object('estado',v_estado);
      end if;
      raise exception 'El turno cambió. Revisa la caja.' using errcode='P0001';
    end if;
    if coalesce(v_id,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then
      raise exception 'Identificador de movimiento inválido.' using errcode='22023';
    end if;
    if coalesce(v_turno->'movs','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id',v_id)) then
      return jsonb_build_object('estado',v_estado);
    end if;
    v_monto := (v_dato->>'monto')::numeric;
    if v_monto is null or not (v_monto > 0 and v_monto <= 999999999)
       or coalesce(v_dato->>'tipo','') not in ('entrada','salida')
       or coalesce(btrim(v_dato->>'nota'),'')='' then
      raise exception 'Movimiento de caja inválido.' using errcode='22023';
    end if;
    v_turno := jsonb_set(v_turno,'{movs}',coalesce(v_turno->'movs','[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('id',v_id,'tipo',v_dato->>'tipo','monto',v_monto,'nota',left(v_dato->>'nota',500),
        'quien',left(v_dato->>'quien',120),'hora',to_char(v_hora,'HH24:MI'),'fecha',to_char(v_hora,'YYYY-MM-DD'))));
  else
    select cuerpo into v_corte from public.documentos where cuenta_id=p_cuenta and coleccion='caja_cortes_v1'
      and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'id'=v_id;
    if v_corte is not null then return jsonb_build_object('estado',v_estado,'corte',v_corte); end if;
    if v_turno is null or v_turno->>'id' is distinct from v_id or v_turno->>'aparato' is distinct from p_aparato then
      raise exception 'Cierra el turno desde el dispositivo que lo abrió.' using errcode='P0001';
    end if;
    if exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas'
      and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'estado'='abierta'
      and cuerpo->>'_eliminado' is distinct from 'true') then
      raise exception 'Hay comandas abiertas en la nube.' using errcode='P0001';
    end if;
    if exists(select 1 from public.documentos c where c.cuenta_id=p_cuenta and c.coleccion='rest_comandas'
      and coalesce(c.cuerpo->>'eventoId','')=v_evento and c.cuerpo->>'turnoId'=v_id
      and c.cuerpo->>'estado'='cobrada' and not exists(select 1 from public.documentos t
        where t.cuenta_id=c.cuenta_id and t.coleccion='rest_tickets'
          and coalesce(t.cuerpo->>'eventoId','')=v_evento and t.cuerpo->>'turnoId'=v_id
          and t.cuerpo->>'id'=c.cuerpo->>'id' and t.cuerpo->>'_eliminado' is distinct from 'true')) then
      raise exception 'Hay tickets pendientes de sincronizar. Vuelve a intentar.' using errcode='P0001';
    end if;
    v_monto := (v_dato->>'contado')::numeric;
    if v_monto is null or not (v_monto between 0 and 999999999) then
      raise exception 'Efectivo contado inválido.' using errcode='22023';
    end if;
    v_resumen := public.rest_caja_resumen(p_cuenta,v_evento,v_turno);
    v_corte := v_turno || jsonb_build_object('abierto',false,'cierra',to_char(v_hora,'HH24:MI'),
      'fechaCierre',to_char(v_hora,'YYYY-MM-DD'),'contado',v_monto,'resumen',v_resumen,
      'deberia',(v_resumen->>'enCaja')::numeric,'diferencia',round(v_monto-(v_resumen->>'enCaja')::numeric,2));
    insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo)
      values(p_cuenta,'caja_cortes_v1',
        case when v_evento='' then 'corte_' else 'ev_'||v_evento||'_corte_' end || v_id,v_corte);
    v_turno := null;
  end if;

  v_estado := jsonb_build_object('eventoId',v_evento,'revision',coalesce((v_estado->>'revision')::bigint,0)+1,
    'turno',v_turno,'ultimoCorte',coalesce(v_corte->>'id',v_estado->>'ultimoCorte'));
  insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo)
    values(p_cuenta,'caja_turno_v1',v_clave,v_estado)
    on conflict(cuenta_id,coleccion,doc_id) do update set cuerpo=excluded.cuerpo;
  return jsonb_build_object('estado',v_estado,'corte',v_corte);
end $$;

create or replace function public.rest_caja_protege_cobro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_evento text := coalesce(new.cuerpo->>'eventoId','');
  v_estado jsonb;
  v_guardado jsonb;
begin
  if new.coleccion not in ('rest_comandas','rest_tickets') then return new; end if;
  perform public.rest_caja_bloquea(new.cuenta_id,v_evento);
  if tg_op='UPDATE' then
    v_guardado := old.cuerpo;
  else
    select cuerpo into v_guardado from public.documentos where cuenta_id=new.cuenta_id
      and coleccion=new.coleccion and doc_id=new.doc_id;
  end if;
  if v_guardado->>'cajaCompartida'='true'
     and (new.coleccion='rest_tickets' or v_guardado->>'estado'='cobrada') then
    if new.coleccion='rest_comandas' and jsonb_typeof(new.cuerpo->'factura')='object' then
      v_guardado := jsonb_set(v_guardado,'{factura}',new.cuerpo->'factura',true);
    end if;
    new.cuerpo := v_guardado;
    return new;
  end if;
  select cuerpo into v_estado from public.documentos where cuenta_id=new.cuenta_id
    and coleccion='caja_turno_v1' and doc_id=public.rest_caja_clave(v_evento);
  if v_estado is null then return new; end if;
  if new.coleccion='rest_comandas' and new.cuerpo->>'estado' is distinct from 'cobrada' then return new; end if;
  if new.coleccion='rest_comandas' and v_guardado->>'estado'='cobrada' then return new; end if;
  if new.cuerpo->>'cajaCompartida' is distinct from 'true'
     or new.cuerpo->>'turnoId' is distinct from v_estado->'turno'->>'id'
     or new.cuerpo->>'cajaAparato' is distinct from v_estado->'turno'->>'aparato'
     or v_estado->'turno'->>'id' is null then
    raise exception 'El cobro no corresponde al turno compartido activo.' using errcode='P0001';
  end if;
  return new;
end $$;

drop trigger if exists rest_caja_protege_cobro on public.documentos;
create trigger rest_caja_protege_cobro before insert or update on public.documentos
for each row execute function public.rest_caja_protege_cobro();

create or replace function public.nuvoor_rest_caja_disponible()
returns boolean language sql immutable as $$ select true $$;
revoke all on function public.rest_caja_clave(text) from public;
revoke all on function public.rest_caja_bloquea(uuid,text) from public;
revoke all on function public.rest_caja_resumen(uuid,text,jsonb) from public;
revoke all on function public.rest_caja_protege_cobro() from public;
revoke all on function public.rest_caja_operar(uuid,text,text,text,jsonb) from public;
revoke all on function public.nuvoor_rest_caja_disponible() from public;
grant execute on function public.rest_caja_operar(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.nuvoor_rest_caja_disponible() to authenticated;

commit;
select public.nuvoor_rest_caja_disponible() as caja_compartida_instalada;
