-- ============================================================
--  Arreglo de roles — córrelo si entraste y te quedaste como
--  "ventas" aunque seas el dueño de la cuenta.
--  Es seguro repetirlo las veces que quieras.
-- ============================================================

-- ¿Por qué pasa? Si se corrió 01-esquema.sql DESPUÉS de 02-roles.sql,
-- el disparador de alta volvió a la versión vieja y los usuarios nuevos
-- nacieron con el rol por defecto, que es 'ventas'.

-- 1. Vuelve a dejar el disparador correcto: quien abre la cuenta es admin.
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

-- 2. Toda cuenta que se haya quedado sin administrador: el primero que
--    entró pasa a serlo.
update public.perfiles p
   set rol = 'admin'
 where not exists (
         select 1 from public.perfiles q
          where q.cuenta_id = p.cuenta_id and q.rol = 'admin')
   and p.creado = (
         select min(r.creado) from public.perfiles r
          where r.cuenta_id = p.cuenta_id);

-- 3. Revisa cómo quedó tu equipo (esto solo muestra, no cambia nada).
select c.nombre as cuenta, p.correo, p.rol, p.creado
  from public.perfiles p
  join public.cuentas c on c.id = p.cuenta_id
 order by c.nombre, p.creado;
