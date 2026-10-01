-- ============================================================
--  10 · QUIEN NO CONTRATÓ, NO TRABAJA
--  Correr después de 01…09. Es seguro repetirlo.
-- ============================================================
--  Hasta aquí había dos agujeros, y uno de los dos no se veía:
--
--  1. En el navegador, una cuenta sin plan podía usar el cotizador
--     completo como calculadora. El cálculo pasa en su máquina y nada lo
--     frenaba. Eso se cerró en cuenta.js.
--
--  2. Aquí, en la base, el "else 1" de abajo trataba cualquier plan que
--     no reconociera —incluido 'ninguno'— COMO SI FUERA BÁSICO. Hoy no
--     causaba daño porque la fecha vencida frena antes; pero el día que
--     una cuenta sin plan quedara con vigencia futura (por ejemplo si
--     alguien en Makers Lab le mueve la fecha sin mirar el plan),
--     tendría el plan Básico completo, gratis y sin que nadie se entere.
--
--  Un valor por omisión que regala permisos es una trampa esperando. Lo
--  que no se reconoce ahora vale cero, y hay que decirlo a propósito.
-- ============================================================

create or replace function public.limite_del_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c record; cuantos int;
  nivel int; tope_cot int; tope_cli int;
begin
  select * into c from public.cuentas where id = new.cuenta_id;

  --  Pedir ayuda no depende de tener plan. Al contrario: quien no puede
  --  entrar es justo quien más necesita poder escribirnos. Soporte pasa
  --  siempre, antes que cualquier otra revisión.
  if new.coleccion = 'soporte' then
    new.actualizado := now();
    return new;
  end if;

  --  Los planes van en escalera: 1 Básico, 2 Maker, 3 Pro. La prueba abre
  --  todo. Y lo que no esté en esta lista vale CERO, no Básico.
  nivel := case c.plan
             when 'basico' then 1
             when 'maker'  then 2
             when 'pro'    then 3
             when 'prueba' then 3
             else 0
           end;

  if nivel = 0 then
    raise exception 'SIN_PLAN';
  end if;

  if c.estado <> 'activa' or c.vence < now() then
    raise exception 'SUSCRIPCION_VENCIDA';
  end if;

  tope_cot := case nivel when 1 then 150 when 2 then 600 else 0 end;   -- 0 = sin tope
  tope_cli := case nivel when 1 then  50 when 2 then 400 else 0 end;

  -- Caja y ventas son del plan Pro
  if nivel < 3 and new.coleccion in ('ventas','caja') then
    raise exception 'FUNCION_PRO';
  end if;

  -- Compras, proveedores e inventario son del plan Maker en adelante
  if nivel < 2 and new.coleccion in ('compras','proveedores','inventario') then
    raise exception 'FUNCION_MAKER';
  end if;

  if tope_cli > 0 and new.coleccion = 'clientes' then
    select count(*) into cuantos from public.documentos
      where cuenta_id = new.cuenta_id and coleccion = 'clientes' and doc_id <> new.doc_id;
    if cuantos >= tope_cli then
      raise exception 'LIMITE_CLIENTES';
    end if;
  end if;

  if tope_cot > 0 and new.coleccion = 'cotizaciones' then
    select count(*) into cuantos from public.documentos
      where cuenta_id = new.cuenta_id and coleccion = 'cotizaciones' and doc_id <> new.doc_id;
    if cuantos >= tope_cot then
      raise exception 'LIMITE_COTIZACIONES';
    end if;
  end if;

  new.actualizado := now();
  return new;
end $$;


-- ---------- Comprobación ----------
--  Se prueba de verdad: se intenta guardar con una cuenta sin plan y se
--  espera que truene. Si NO truena, el arreglo no quedó.
do $$
declare prueba uuid; resultado text;
begin
  select id into prueba from public.cuentas where plan = 'ninguno' limit 1;
  if prueba is null then
    raise notice 'No hay ninguna cuenta sin plan con la cual probar. El cambio quedó, pero sin comprobar.';
    return;
  end if;
  begin
    insert into public.documentos (cuenta_id, coleccion, doc_id, cuerpo)
      values (prueba, 'cotizaciones', 'prueba-del-candado', '{"x":1}'::jsonb);
    resultado := 'MAL: la dejó guardar';
    delete from public.documentos
      where cuenta_id = prueba and doc_id = 'prueba-del-candado';
  exception when others then
    resultado := 'BIEN: la frenó con ' || SQLERRM;
  end;
  raise notice 'Candado de cuenta sin plan → %', resultado;
end $$;

select 'Planes que la base reconoce' as que,
       'basico, maker, pro, prueba (todo lo demás = sin plan)' as respuesta
union all
select 'Cuentas sin plan ahora mismo', count(*)::text from public.cuentas where plan = 'ninguno';
