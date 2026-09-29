-- ============================================================
--  RESCATE — arregla el rol del dueño y le pone a una cuenta el plan
--  que tú decidas, a mano.
--
--  Córrelo en Supabase → SQL Editor. Es seguro repetirlo las veces
--  que quieras. Sirve también para las cortesías que dé el equipo de
--  ventas y para las cuentas de prueba que no pasan por Mercado Pago.
-- ============================================================


-- ---------- 1. Quien abre una cuenta nace administrador ----------
--  Si se corrió 01-esquema.sql después de 02-roles.sql, el disparador de
--  alta volvió a la versión vieja y el dueño se quedó con un rol que la
--  base no reconoce. Desde aquí nacen bien los que entren de hoy en
--  adelante.

create or replace function public.al_crear_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare nueva uuid;
begin
  insert into public.cuentas (nombre)
    values (coalesce(new.raw_user_meta_data->>'negocio', 'Mi taller'))
    returning id into nueva;
  insert into public.perfiles (id, cuenta_id, nombre, correo, rol)
    values (new.id, nueva, new.raw_user_meta_data->>'nombre', new.email, 'admin');
  return new;
end $$;


-- ---------- 2. Rescate de los que ya entraron ----------
--  Toda cuenta que se haya quedado sin administrador: el primero que
--  entró pasa a serlo.

update public.perfiles p
   set rol = 'admin'
 where not exists (
         select 1 from public.perfiles q
          where q.cuenta_id = p.cuenta_id and q.rol = 'admin')
   and p.creado = (
         select min(r.creado) from public.perfiles r
          where r.cuenta_id = p.cuenta_id);

--  Y cualquier rol que no sea de los cuatro, cuando esa persona es la
--  única de su cuenta, también pasa a administrador.
update public.perfiles p
   set rol = 'admin'
 where p.rol not in ('admin','ventas','diseno','produccion')
   and (select count(*) from public.perfiles q where q.cuenta_id = p.cuenta_id) = 1;


-- ---------- 3. El plan de una cuenta ----------
--  El disparador que protege la suscripción solo frena al navegador.
--  Desde aquí sí se puede: para eso es la consola del dueño.
--
--  >>> LO ÚNICO QUE CAMBIAS SON ESTOS TRES RENGLONES <<<
--      correo : de quién es la cuenta
--      plan   : 'basico', 'maker', 'pro' o 'prueba'
--      meses  : cuánto le dura a partir de hoy

do $$
declare
  v_correo text := 'carlosmora0593@gmail.com';
  v_plan   text := 'pro';
  v_meses  int  := 120;
  cuantas  int;
begin
  update public.cuentas c
     set plan   = v_plan,
         estado = 'activa',
         ciclo  = 'anual',
         vence  = now() + (v_meses || ' months')::interval
   where c.id in (select p.cuenta_id
                    from public.perfiles p
                    left join auth.users u on u.id = p.id
                   where lower(coalesce(p.correo, u.email, '')) = lower(v_correo));

  get diagnostics cuantas = row_count;
  if cuantas = 0 then
    raise notice 'No encontré ninguna cuenta con el correo %. Revisa cómo está escrito.', v_correo;
  else
    raise notice 'Listo: % cuenta(s) quedaron en el plan % por % meses.', cuantas, v_plan, v_meses;
  end if;
end $$;


-- ---------- 4. Cómo quedó (esto solo muestra, no cambia nada) ----------
select p.correo,
       p.rol,
       c.nombre       as cuenta,
       c.plan,
       c.estado,
       c.vence::date  as vence
  from public.perfiles p
  join public.cuentas c on c.id = p.cuenta_id
 order by c.nombre, p.creado;
