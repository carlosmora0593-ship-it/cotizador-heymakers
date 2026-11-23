-- 41 · Cierre remoto y cobros tardíos. Después de SQL 30, 33 y 38. Repetible.
-- Carlos ejecuta desde Lab. No activa ni cierra cajas al instalarse.
begin;

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
  v_prefijo text;
  v_ticket jsonb;
  v_cuenta_abierta jsonb;
  v_doc public.documentos%rowtype;
  v_recibo public.documentos%rowtype;
  v_persona jsonb;
  v_salt text;
  v_espera jsonb;
  v_pendientes integer;
  v_lineas jsonb;
  v_forzar boolean := p_accion='cerrar' and coalesce(p_datos->>'forzar','false')='true';
  v_dueno boolean := public.rol_en(p_cuenta)='admin';
begin
  if public.rol_en(p_cuenta) is distinct from 'admin'
     or not exists(select 1 from public.cuentas where id=p_cuenta and producto='restaurant') then
    raise exception 'No tienes acceso a esta caja.' using errcode='42501';
  end if;
  if v_evento !~ '^[a-zA-Z0-9_-]{0,120}$' or coalesce(p_aparato,'') !~ '^[a-zA-Z0-9_-]{1,120}$' then
    raise exception 'La caja o el dispositivo no son válidos.' using errcode='22023';
  end if;
  if p_accion is null or p_accion not in ('activar','abrir','mover','cobrar','preparar','confirmar_aparato','reanudar','tomar','cerrar') then
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
  v_prefijo := case when v_evento='' then '' else 'ev_'||v_evento||'_' end;
  v_espera := v_turno->'espera';
  if v_forzar and coalesce(v_dato->>'persona','')='' and v_dueno then
    v_persona:=jsonb_build_object('nombre',coalesce(nullif(left(v_dato->>'cerradoPor',120),''),'Dueño'),'rol','admin');
  elsif p_accion in ('preparar','tomar','cerrar') then
    select cuerpo into v_persona from public.documentos where cuenta_id=p_cuenta
      and coleccion='rest_equipo' and doc_id=v_prefijo||'persona_'||(v_dato->>'persona')
      and cuerpo->>'activo' is distinct from 'false' and cuerpo->>'_eliminado' is distinct from 'true';
    select cuerpo->>'pinSalt' into v_salt from public.documentos where cuenta_id=p_cuenta
      and coleccion='rest_config' and doc_id=v_prefijo||'config_general';
    if (v_forzar and coalesce(v_persona->>'rol','') not in ('admin','gerente')) or coalesce(v_persona->>'rol','') not in ('admin','gerente','cajero')
      or ((p_accion='tomar' or p_accion='preparar' and v_dato->>'accionFinal'='tomar') and v_persona->>'rol'='cajero')
      or coalesce(v_salt,'')='' or coalesce(v_dato->>'pin','') !~ '^[0-9]{4,12}$'
      or v_persona->>'pin_hash' is distinct from encode(sha256(convert_to(v_salt||(v_dato->>'pin'),'UTF8')),'hex') then
      raise exception 'PIN inválido o perfil sin permiso para este cambio de caja.' using errcode='42501';
    end if;
  end if;

  if p_accion='cobrar' then
    if coalesce(v_id,'') !~ '^[a-zA-Z0-9_-]{1,120}$' or coalesce(v_dato->>'solicitud','') !~ '^[a-zA-Z0-9_-]{1,120}$' then
      raise exception 'Identificador de cobro inválido.' using errcode='22023';
    end if;
    select * into v_recibo from public.documentos where cuenta_id=p_cuenta
      and coleccion='rest_tickets' and doc_id=v_prefijo||'ticket_'||v_id;
    if found then
      if v_recibo.cuerpo->>'cobroSolicitud' is distinct from v_dato->>'solicitud'
         or v_recibo.cuerpo->>'cajaAparato' is distinct from p_aparato then
        raise exception 'Esta cuenta ya fue cobrada. Revisa el ticket antes de volver a cobrar.' using errcode='P0001';
      end if;
      select * into v_doc from public.documentos where cuenta_id=p_cuenta
        and coleccion='rest_comandas' and doc_id=v_prefijo||'comanda_'||v_id;
      return jsonb_build_object('estado',v_estado,'comanda',to_jsonb(v_doc),'ticket',to_jsonb(v_recibo));
    end if;
    if v_turno is null or v_turno->>'id' is distinct from v_dato->>'turnoId' or v_espera is not null then
      raise exception 'El turno cambió o está esperando el cierre. Revisa Caja antes de cobrar.' using errcode='P0001';
    end if;
    select cuerpo into v_cuenta_abierta from public.documentos where cuenta_id=p_cuenta
      and coleccion='rest_comandas' and doc_id=v_prefijo||'comanda_'||v_id;
    if v_cuenta_abierta->>'estado' is distinct from 'abierta' or v_cuenta_abierta->>'_eliminado'='true' then
      raise exception 'La cuenta ya no está abierta. Revisa Mesas antes de cobrar.' using errcode='P0001';
    end if;
    if v_cuenta_abierta->>'mesaId' is distinct from v_dato->>'mesaId'
      or v_cuenta_abierta->>'folio' is distinct from v_dato->>'folio' then
      raise exception 'La mesa o el folio cambiaron. Revisa la cuenta antes de cobrar.' using errcode='P0001';
    end if;
    select coalesce(jsonb_object_agg(cuerpo->>'id',jsonb_build_array(cuerpo->'cant',cuerpo->'precio',
        coalesce(nullif(cuerpo->'mods','null'::jsonb),'[]'::jsonb),coalesce(nullif(cuerpo->>'ivaModo',''),'incluido'))),'{}'::jsonb)
      into v_lineas from public.documentos where cuenta_id=p_cuenta and coleccion='rest_lineas'
        and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'comandaId'=v_id and cuerpo->>'id' is not null
        and cuerpo->>'tipo' is null and cuerpo->>'cancelada' is distinct from 'true'
        and cuerpo->>'_eliminado' is distinct from 'true';
    if v_lineas='{}'::jsonb or v_lineas is distinct from v_dato->'lineas' then
      raise exception 'Los platillos cambiaron. Revisa la cuenta antes de cobrar.' using errcode='P0001';
    end if;
    v_ticket := v_dato->'ticket';
    v_monto := (v_ticket->>'total')::numeric;
    if v_monto is null or not (v_monto between 0 and 999999999) or jsonb_typeof(v_ticket->'pagos') is distinct from 'array' then
      raise exception 'Importe o forma de pago inválidos.' using errcode='22023';
    end if;
    v_ticket := v_ticket || jsonb_build_object('id',v_id,'eventoId',v_evento,'turnoId',v_turno->>'id',
      'cajaCompartida',true,'cajaAparato',p_aparato,'cajaNombre',left(v_dato->>'aparatoNombre',80),
      'cobroSolicitud',v_dato->>'solicitud','cierra',to_char(v_hora,'HH24:MI'),'folio',v_cuenta_abierta->>'folio');
    perform set_config('nuvoor.caja_en_linea',p_cuenta::text||':'||v_evento||':'||v_id,true);
    update public.documentos set cuerpo=v_cuenta_abierta||v_ticket||jsonb_build_object('estado','cobrada')
      where cuenta_id=p_cuenta and coleccion='rest_comandas' and doc_id=v_prefijo||'comanda_'||v_id
      returning * into v_doc;
    insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo)
      values(p_cuenta,'rest_tickets',v_prefijo||'ticket_'||v_id,v_ticket) returning * into v_recibo;
    perform set_config('nuvoor.caja_en_linea','',true);
    return jsonb_build_object('estado',v_estado,'comanda',to_jsonb(v_doc),'ticket',to_jsonb(v_recibo));
  elsif p_accion in ('preparar','confirmar_aparato','reanudar','tomar') then
    if v_turno is null or v_turno->>'id' is distinct from v_id then
      raise exception 'El turno cambió. Revisa Caja.' using errcode='P0001';
    end if;
    if p_accion='preparar' then
      if v_dato->>'accionFinal' not in ('tomar','cerrar') or v_dato->>'accionFinal' is null then
        raise exception 'Elige qué cambio de caja vas a hacer.' using errcode='22023';
      end if;
      if v_espera is not null then
        if v_espera->>'solicitante'=p_aparato and v_espera->>'accion'=v_dato->>'accionFinal' then
          return jsonb_build_object('estado',v_estado);
        end if;
        raise exception 'Ya se pidió otro cambio de caja.' using errcode='P0001';
      end if;
      v_turno := v_turno || jsonb_build_object('espera',jsonb_build_object(
        'solicitante',p_aparato,'accion',v_dato->>'accionFinal','confirmada',false));
    elsif p_accion='confirmar_aparato' then
      if v_turno->>'aparato' is distinct from p_aparato or v_espera is null then
        raise exception 'Este dispositivo no tiene el respaldo de caja pendiente.' using errcode='P0001';
      end if;
      v_pendientes := greatest(0,(v_dato->>'pendientes')::int);
      if v_espera->>'pendientes'=v_pendientes::text then return jsonb_build_object('estado',v_estado); end if;
      v_turno := jsonb_set(v_turno,'{espera}',v_espera||jsonb_build_object('pendientes',v_pendientes,'confirmada',v_pendientes=0));
    elsif p_accion='reanudar' then
      if v_espera is null then return jsonb_build_object('estado',v_estado); end if;
      if v_espera->>'solicitante' is distinct from p_aparato and v_turno->>'aparato' is distinct from p_aparato then
        raise exception 'Reanuda en el dispositivo que solicitó o tiene la caja.' using errcode='P0001';
      end if;
      v_turno := v_turno - 'espera';
    else
      if v_turno->>'aparato'=p_aparato and v_espera is null then return jsonb_build_object('estado',v_estado); end if;
      if v_espera->>'solicitante' is distinct from p_aparato or v_espera->>'accion' is distinct from 'tomar'
         or v_espera->>'confirmada' is distinct from 'true' then
        raise exception 'La caja de respaldo todavía no confirmó que subió sus cobros.' using errcode='P0001';
      end if;
      v_turno := (v_turno - 'espera') || jsonb_build_object('aparato',p_aparato,'aparatoNombre',left(v_dato->>'aparatoNombre',80));
    end if;
  elsif p_accion in ('activar','abrir') then
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
      v_turno := v_dato || jsonb_build_object('abierto',true,'aparato',p_aparato,'aparatoNombre',left(p_datos->>'aparatoNombre',80),'eventoId',v_evento);
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
    if v_turno is null or v_turno->>'id' is distinct from v_id then
      raise exception 'El turno cambió. Revisa Caja.' using errcode='P0001';
    end if;
    if not v_forzar and (v_espera is not null or v_turno->>'aparato' is distinct from p_aparato)
      and (v_espera->>'solicitante' is distinct from p_aparato
        or v_espera->>'accion' is distinct from 'cerrar'
        or v_espera->>'confirmada' is distinct from 'true') then
      raise exception 'La caja de respaldo todavía no confirmó que subió sus cobros.' using errcode='P0001';
    end if;
    if exists(select 1 from public.documentos where cuenta_id=p_cuenta and coleccion='rest_comandas'
      and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'estado'='abierta'
      and cuerpo->>'_eliminado' is distinct from 'true') then
      raise exception 'Hay comandas abiertas en la nube.' using errcode='P0001';
    end if;
    if not v_forzar and exists(select 1 from public.documentos c where c.cuenta_id=p_cuenta and c.coleccion='rest_comandas'
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
    v_corte := (v_turno - 'espera') || jsonb_build_object('cerradoPor',v_persona->>'nombre','abierto',false,'cierra',to_char(v_hora,'HH24:MI'),
      'fechaCierre',to_char(v_hora,'YYYY-MM-DD'),'cerradoEn',clock_timestamp(),'forzado',v_forzar,
      'cerradoDesde',jsonb_build_object('aparato',p_aparato,'aparatoNombre',left(v_dato->>'aparatoNombre',80)),
      'aparatoCaja',v_turno->>'aparato','pendienteDe',v_turno->>'aparatoNombre',
      'cobradosAlCerrar',(select coalesce(jsonb_agg(distinct cuerpo->>'id'),'[]') from public.documentos where cuenta_id=p_cuenta and coleccion='rest_tickets' and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'turnoId'=v_id),
      'tardios',jsonb_build_object('cuentas',0,'total',0,'por','{}'::jsonb,'items','{}'::jsonb),
      'contado',v_monto,'resumen',v_resumen,
      'deberia',(v_resumen->>'enCaja')::numeric,'diferencia',round(v_monto-(v_resumen->>'enCaja')::numeric,2),'diferenciaConTardios',round(v_monto-(v_resumen->>'enCaja')::numeric,2));
    select v_corte || jsonb_build_object('aparatosCobro',coalesce(jsonb_agg(to_jsonb(a) order by a.nombre),'[]'::jsonb))
      into v_corte from (
        select max(nullif(cuerpo->>'cajaNombre','')) as nombre, count(*) as cuentas,
          sum((cuerpo->>'total')::numeric) as total
        from (
          select distinct on (cuerpo->>'id') cuerpo from public.documentos
          where cuenta_id=p_cuenta and coleccion='rest_tickets' and coalesce(cuerpo->>'eventoId','')=v_evento
            and cuerpo->>'turnoId'=v_id and cuerpo->>'_eliminado' is distinct from 'true'
          order by cuerpo->>'id', actualizado desc
        ) tickets
        group by cuerpo->>'cajaAparato'
      ) a;
    insert into public.documentos(cuenta_id,coleccion,doc_id,cuerpo)
      values(p_cuenta,'caja_cortes_v1',
        case when v_evento='' then 'corte_' else 'ev_'||v_evento||'_corte_' end || v_id,v_corte);
    v_turno := null;
  end if;

  v_estado := jsonb_build_object('eventoId',v_evento,'revision',coalesce((v_estado->>'revision')::bigint,0)+1,
    'turno',v_turno,'ultimoCorte',coalesce(v_corte->>'id',v_estado->>'ultimoCorte'),'ultimoCierre',case when v_corte is not null then jsonb_build_object('id',v_corte->>'id','aparatoNombre',v_corte->'cerradoDesde'->>'aparatoNombre','hora',v_corte->>'cierra') else v_estado->'ultimoCierre' end);
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
  v_corte jsonb;
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
    if new.cuerpo->>'cajaCompartida'='true'
       and (new.coleccion='rest_tickets' or new.cuerpo->>'estado'='cobrada')
       and new.cuerpo->>'cajaAparato' is distinct from v_guardado->>'cajaAparato' then
      raise exception 'Esta cuenta se cobró en otro dispositivo. Revisa el cobro pendiente antes de cerrar.' using errcode='P0001';
    end if;
    if new.coleccion='rest_comandas' and jsonb_typeof(new.cuerpo->'factura')='object' then
      v_guardado := jsonb_set(v_guardado,'{factura}',new.cuerpo->'factura',true);
    end if;
    new.cuerpo := v_guardado;
    -- Una comanda ya cobrada podía existir sin su ticket al forzar el cierre.
    -- Su reenvío conserva el importe original, pero ahora entra al corte tardío.
    select cuerpo into v_corte from public.documentos where cuenta_id=new.cuenta_id and coleccion='caja_cortes_v1'
      and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'id'=v_guardado->>'turnoId';
    if v_corte is not null and not coalesce(v_corte->'cobradosAlCerrar','[]') @> jsonb_build_array(v_guardado->>'id') then
      new.cuerpo:=new.cuerpo||jsonb_build_object('tardio',true);
    end if;
    return new;
  end if;
  if new.cuerpo->>'cajaCompartida'='true' and (new.coleccion='rest_tickets' or new.cuerpo->>'estado'='cobrada') and coalesce(new.cuerpo->>'turnoId','')<>'' then
    select cuerpo into v_corte from public.documentos where cuenta_id=new.cuenta_id and coleccion='caja_cortes_v1'
      and coalesce(cuerpo->>'eventoId','')=v_evento and cuerpo->>'id'=new.cuerpo->>'turnoId';
    if v_corte is not null then
      if coalesce(new.cuerpo->>'id','')='' or new.cuerpo->>'cajaAparato' is distinct from v_corte->>'aparato'
        or new.cuerpo->>'cajaCompartida' is distinct from 'true' then
        raise exception 'El cobro tardío no corresponde al aparato de ese corte.' using errcode='42501';end if;
      new.cuerpo:=new.cuerpo||jsonb_build_object('tardio',not coalesce(v_corte->'cobradosAlCerrar','[]') @> jsonb_build_array(new.cuerpo->>'id'));
      return new;
    end if;
  end if;
  select cuerpo into v_estado from public.documentos where cuenta_id=new.cuenta_id
    and coleccion='caja_turno_v1' and doc_id=public.rest_caja_clave(v_evento);
  if v_estado is null then return new; end if;
  if new.coleccion='rest_comandas' and new.cuerpo->>'estado' is distinct from 'cobrada' then return new; end if;
  if new.coleccion='rest_comandas' and v_guardado->>'estado'='cobrada' then return new; end if;
  if new.cuerpo->>'cajaCompartida' is distinct from 'true'
     or new.cuerpo->>'turnoId' is distinct from v_estado->'turno'->>'id'
     or (new.cuerpo->>'cajaAparato' is distinct from v_estado->'turno'->>'aparato'
       and current_setting('nuvoor.caja_en_linea',true) is distinct from
         (new.cuenta_id::text||':'||v_evento||':'||(new.cuerpo->>'id')))
     or v_estado->'turno'->>'id' is null then
    raise exception 'El cobro no corresponde al turno compartido activo.' using errcode='P0001';
  end if;
  return new;
end $$;

create or replace function public.nuvoor_rest_caja_fija_disponible()
returns boolean language sql immutable as $$ select true $$;
revoke all on function public.nuvoor_rest_caja_fija_disponible() from public;
grant execute on function public.nuvoor_rest_caja_fija_disponible() to authenticated;

-- Se usa AFTER para que el recibo esté guardado antes de actualizar el corte.
create or replace function public.rest_caja_suma_tardio41()
returns trigger language plpgsql security definer set search_path=public as $$
declare corte public.documentos%rowtype;items jsonb;pago jsonb;por jsonb;total numeric;ef numeric;cuentas integer;
begin
 if new.coleccion not in ('rest_tickets','rest_comandas') or new.cuerpo->>'cajaCompartida' is distinct from 'true' or new.cuerpo->>'tardio' is distinct from 'true' then return new;end if;
 perform public.rest_caja_bloquea(new.cuenta_id,coalesce(new.cuerpo->>'eventoId',''));
 select * into corte from public.documentos where cuenta_id=new.cuenta_id and coleccion='caja_cortes_v1' and coalesce(cuerpo->>'eventoId','')=coalesce(new.cuerpo->>'eventoId','') and cuerpo->>'id'=new.cuerpo->>'turnoId' for update;
 if not found then raise exception 'Falta el corte para el cobro tardío.';end if;
 if coalesce(corte.cuerpo->'cobradosAlCerrar','[]') @> jsonb_build_array(new.cuerpo->>'id') then return new;end if;
 if (new.cuerpo->>'total') is null or (new.cuerpo->>'total')::numeric not between 0 and 999999999 or jsonb_typeof(new.cuerpo->'pagos') is distinct from 'array' then raise exception 'Importe o pagos del cobro tardío inválidos.';end if;
 select jsonb_build_object('total',(new.cuerpo->>'total')::numeric,'por',jsonb_build_object(
 'efectivo',coalesce((new.cuerpo->>'efectivoCaja')::numeric,greatest(0,coalesce(sum((p->>'monto')::numeric) filter(where p->>'tipo'='efectivo'),0)-coalesce((new.cuerpo->>'cambio')::numeric,0))),
 'tarjeta',coalesce(sum((p->>'monto')::numeric) filter(where p->>'tipo'='tarjeta'),0),
 'transferencia',coalesce(sum((p->>'monto')::numeric) filter(where p->>'tipo'='transferencia'),0),
 'app',coalesce(sum((p->>'monto')::numeric) filter(where p->>'tipo'='app'),0),
 'otros',coalesce(sum((p->>'monto')::numeric) filter(where p->>'tipo' not in ('efectivo','tarjeta','transferencia','app')),0))) into pago from jsonb_array_elements(new.cuerpo->'pagos') p;
 items:=coalesce(corte.cuerpo->'tardios'->'items','{}');
 if items ? (new.cuerpo->>'id') then
   if items->(new.cuerpo->>'id') is distinct from pago then raise exception 'Este cobro tardío ya existe con otro importe.';end if;return new;
 end if;
 items:=jsonb_set(items,array[new.cuerpo->>'id'],pago);
 select count(*),sum((value->>'total')::numeric) into cuentas,total from jsonb_each(items);
 select jsonb_object_agg(k,suma) into por from(select p.key k,sum(p.value::numeric) suma from jsonb_each(items) i cross join lateral jsonb_each_text(i.value->'por') p group by p.key) x;
 ef:=coalesce((por->>'efectivo')::numeric,0);
 update public.documentos set cuerpo=corte.cuerpo||jsonb_build_object('tardios',jsonb_build_object('cuentas',cuentas,'total',total,'por',por,'items',items),'diferenciaConTardios',round((corte.cuerpo->>'diferencia')::numeric-ef,2)),actualizado=clock_timestamp() where cuenta_id=corte.cuenta_id and coleccion=corte.coleccion and doc_id=corte.doc_id;
 return new;
end $$;
drop trigger if exists rest_caja_suma_tardio41 on public.documentos;
create trigger rest_caja_suma_tardio41 after insert or update on public.documentos for each row execute function public.rest_caja_suma_tardio41();
-- Los cortes anteriores toman como base los recibos ya guardados, sin alterar su conteo.
update public.documentos c set cuerpo=c.cuerpo||jsonb_build_object('cobradosAlCerrar',(select coalesce(jsonb_agg(distinct t.cuerpo->>'id'),'[]') from public.documentos t where t.cuenta_id=c.cuenta_id and t.coleccion='rest_tickets' and coalesce(t.cuerpo->>'eventoId','')=coalesce(c.cuerpo->>'eventoId','') and t.cuerpo->>'turnoId'=c.cuerpo->>'id')) where c.coleccion='caja_cortes_v1' and not c.cuerpo ? 'cobradosAlCerrar';
create or replace function public.nuvoor_cierre_remoto_disponible() returns boolean language sql immutable as $$select true$$;
revoke all on function public.nuvoor_cierre_remoto_disponible() from public;
grant execute on function public.nuvoor_cierre_remoto_disponible() to authenticated;
revoke all on function public.rest_caja_suma_tardio41() from public;

-- Impide la reapertura por escrituras concurrentes de documentos completos.
-- Misma regla que el cliente; la fila de documentos serializa los UPSERT.
create or replace function public.nuvoor_caja_union41(a jsonb,b jsonb)
returns jsonb language sql immutable as $$select coalesce(jsonb_agg(v order by n),'[]') from(select distinct on (v->>'id') v,v->>'id' id,n from jsonb_array_elements(coalesce(b,'[]')||coalesce(a,'[]')) with ordinality x(v,n) where v->>'id' is not null order by v->>'id',n) x$$;
create or replace function public.nuvoor_caja_fusion41(a jsonb,b jsonb,tipo text)
returns jsonb language plpgsql immutable as $$declare r jsonb:=coalesce(b,'{}')||coalesce(a,'{}');x jsonb;y jsonb;lista jsonb:='[]';base jsonb;ga int;gb int;act text;begin
 if tipo='store' then
  for x in select value from jsonb_array_elements(public.nuvoor_caja_union41(a->'shifts',b->'shifts')) loop
   select value into y from jsonb_array_elements(coalesce(a->'shifts','[]')) where value->>'id'=x->>'id';
   base:=case when x->>'closedAt' is not null then x when y->>'closedAt' is not null then y else coalesce(y,x) end;
   lista:=lista||jsonb_build_array(base);
  end loop;
  select coalesce(jsonb_agg(z order by z->>'openedAt' desc),'[]') into lista from jsonb_array_elements(lista) z;
  act:=coalesce(b->>'activeShift',a->>'activeShift');
  if not exists(select 1 from jsonb_array_elements(lista) z where z->>'id'=act and z->>'closedAt' is null) then
   act:=a->>'activeShift';if not exists(select 1 from jsonb_array_elements(lista) z where z->>'id'=act and z->>'closedAt' is null) then act:=null;end if;
  end if;
  return r||jsonb_build_object('shifts',lista,'cashMoves',public.nuvoor_caja_union41(a->'cashMoves',b->'cashMoves'),'activeShift',act);
 end if;
 ga:=coalesce((a->>'aperturaRevision')::int,0);gb:=coalesce((b->>'aperturaRevision')::int,0);
 if ga>gb then
  if ga<>gb+1 or b->'cierre' is null or b->'cierre'='null' or a->>'reabreDe' is distinct from coalesce(b->'cierre'->>'id',concat_ws('|',b->>'fecha',b->'cierre'->>'hora',b->'cierre'->>'contado',b->'cierre'->>'esperado')) then raise exception 'La caja cambió antes de reabrir. Actualiza y vuelve a intentarlo.';end if;base:=a;
 elsif gb>ga then base:=b;
 else base:=case when b->'cierre' is not null and b->'cierre'<>'null' then b else a end;end if;
 for x in select value from jsonb_array_elements(public.nuvoor_caja_union41(a->'turnos',b->'turnos')) loop
  select value into y from jsonb_array_elements(coalesce(a->'turnos','[]')) where value->>'id'=x->>'id';
  lista:=lista||jsonb_build_array(case when x->'cierre' is not null and x->'cierre'<>'null' then x else coalesce(y,x) end);
 end loop;
 r:=r||base||jsonb_build_object('turnos',lista,'cobros',public.nuvoor_caja_union41(a->'cobros',b->'cobros'),
 'movsBorrados',coalesce((select jsonb_agg(distinct value) from jsonb_array_elements(coalesce(a->'movsBorrados','[]')||coalesce(b->'movsBorrados','[]'))),'[]'));
 r:=r||jsonb_build_object('movs',coalesce((select jsonb_agg(m) from jsonb_array_elements(public.nuvoor_caja_union41(a->'movs',b->'movs')) m where not r->'movsBorrados' @> jsonb_build_array(m->>'id')),'[]'));
 if r->'cierre' is not null and r->'cierre'<>'null' then r:=r||'{"abierta":false}';elsif jsonb_array_length(lista)>0 then r:=r||jsonb_build_object('abierta',exists(select 1 from jsonb_array_elements(lista) t where t->'cierre' is null or t->'cierre'='null'));end if;
 return r;
end $$;
create or replace function public.nuvoor_caja_cerrado_gana41()
returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.coleccion<>'caja' then return new;end if;
 if new.doc_id='turnos-tiendita' then new.cuerpo:=public.nuvoor_caja_fusion41(new.cuerpo,old.cuerpo,'store');
 elsif jsonb_typeof(new.cuerpo->'caja')='object' and jsonb_typeof(old.cuerpo->'caja')='object' then
  new.cuerpo:=new.cuerpo||jsonb_build_object('caja',public.nuvoor_caja_fusion41(new.cuerpo->'caja',old.cuerpo->'caja','imprenta'));
 end if;return new;
end $$;
drop trigger if exists nuvoor_caja_cerrado_gana41 on public.documentos;
create trigger nuvoor_caja_cerrado_gana41 before update on public.documentos for each row execute function public.nuvoor_caja_cerrado_gana41();
revoke all on function public.nuvoor_caja_union41(jsonb,jsonb),public.nuvoor_caja_fusion41(jsonb,jsonb,text),public.nuvoor_caja_cerrado_gana41() from public;

notify pgrst,'reload schema';
commit;
