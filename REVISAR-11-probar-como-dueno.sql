-- ============================================================
--  REVISAR · ¿De verdad ya se puede reactivar?
--  OPCIONAL. Córrelo DESPUÉS de CORRER-11, y en una pestaña aparte.
--  NO guarda nada: se deshace sola al terminar.
-- ============================================================
--  Por qué hace falta este truco:
--
--  El SQL Editor de Supabase NO trae sesión de nadie. Ahí auth.uid() es
--  nulo y es_staff() contesta "no", aunque tú seas el dueño de todo. Por
--  eso mi prueba anterior tronó con "Solo el equipo de Hey Makers": no
--  era tu cuenta, era que el editor no tiene token.
--
--  Aquí se le presta tu identidad a la transacción —se arma el token que
--  el navegador mandaría— para probar en las mismas condiciones en que
--  corre el Lab. Al final revienta a propósito y todo se deshace.
-- ============================================================

do $$
declare
  v_correo  text := 'carlosmora0593@gmail.com';   -- <- cámbialo si entras con otro
  v_uid     uuid;
  v_staff   boolean;
  v_id      uuid;
  v_taller  text;
  v_antes   text;
  v_despues text;
  v_resp    jsonb;
begin
  --  1. Tu usuario, antes de prestarle la identidad a nadie.
  select id into v_uid from auth.users where lower(email) = lower(v_correo) limit 1;
  if v_uid is null then
    raise exception 'REVISIÓN: no hay ningún usuario con el correo %. Cámbialo arriba.', v_correo;
  end if;

  select exists(select 1 from public.staff where id = v_uid) into v_staff;
  if not v_staff then
    raise exception E'REVISIÓN: % existe pero NO está en la tabla staff.\nEso sí sería el problema. Agrégalo con:\n  insert into public.staff (id, rol) values (''%'', ''dueno'');',
      v_correo, v_uid;
  end if;

  --  2. La cuenta más vieja, sólo para probar.
  select id, nombre, plan into v_id, v_taller, v_antes
    from public.cuentas order by creada limit 1;
  if v_id is null then
    raise exception 'REVISIÓN: no hay ni una cuenta que probar.';
  end if;

  --  3. Se arma el token, igual que el que manda el navegador.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated', 'email', v_correo)::text, true);
  perform set_config('role', 'authenticated', true);

  --  4. La misma llamada que hace el botón Reactivar del Lab.
  v_resp := public.staff_cambia_plan(
    v_id, 'pro', now() + interval '30 days', 'activa', 'mensual', false,
    'REVISIÓN de CORRER-11 — se deshace sola');

  select plan into v_despues from public.cuentas where id = v_id;

  --  5. El veredicto, y la transacción se deshace entera.
  raise exception E'REVISIÓN sobre "%"\n  eres staff: sí\n  el plan pasó de "%" a "%"\n  la función contestó: %\n\n%\n\nNada se guardó.',
    v_taller, v_antes, v_despues, v_resp::text,
    case when v_despues = 'pro'
      then 'RESULTADO: SIRVE. Ya puedes reactivar suscripciones desde el Lab.'
      else 'RESULTADO: el disparador sigue revirtiendo el cambio. Mándame este mensaje completo.'
    end;
end $$;
