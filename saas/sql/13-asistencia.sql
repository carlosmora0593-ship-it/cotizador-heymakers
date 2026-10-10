-- ============================================================
--  13 · Asistencia (reloj checador)
--
--  El reloj lo usa TODO el equipo, no solo quien cotiza. Y las
--  reglas que ya existen solo dejan escribir al administrador y
--  a ventas, así que producción y diseño —que son justamente
--  quienes más checan— no podrían registrar ni su entrada.
--
--  Esto abre la colección 'asistencia' para todos los miembros
--  de la cuenta, con una asimetría a propósito:
--
--    · cualquiera CREA y LEE una checada,
--    · solo el administrador la BORRA, y nadie la EDITA.
--
--  Un registro no se corrige: se borra y queda el hueco a la
--  vista. Es más honesto que arreglarlo en silencio, y evita
--  que alguien se cambie su propia hora de entrada.
--
--  Es seguro correrlo más de una vez.
-- ============================================================

-- ---------- Leer: todo el equipo ve las checadas de la cuenta ----------
drop policy if exists documentos_asistencia_leer on public.documentos;
create policy documentos_asistencia_leer on public.documentos
  for select using (
    cuenta_id = public.mi_cuenta() and coleccion = 'asistencia'
  );

-- ---------- Crear: cualquiera puede checar ----------
-- La clave personal que pide la pantalla es el control de quién es
-- quién; la base solo cuida que la checada caiga en su cuenta.
drop policy if exists documentos_asistencia_crear on public.documentos;
create policy documentos_asistencia_crear on public.documentos
  for insert with check (
    cuenta_id = public.mi_cuenta() and coleccion = 'asistencia'
  );

-- ---------- Borrar: solo el administrador ----------
drop policy if exists documentos_asistencia_borrar on public.documentos;
create policy documentos_asistencia_borrar on public.documentos
  for delete using (
    cuenta_id = public.mi_cuenta() and coleccion = 'asistencia'
    and public.mi_rol() = 'admin'
  );

-- ---------- Editar: nadie, salvo el administrador ----------
-- (el cotizador nunca edita una checada; esto es el cinturón)
drop policy if exists documentos_asistencia_editar on public.documentos;
create policy documentos_asistencia_editar on public.documentos
  for update using (
    cuenta_id = public.mi_cuenta() and coleccion = 'asistencia'
    and public.mi_rol() = 'admin'
  ) with check (cuenta_id = public.mi_cuenta());

-- ---------- Comprobación ----------
select polname as politica
  from pg_policy
 where polrelid = 'public.documentos'::regclass
   and polname like 'documentos_asistencia%'
 order by 1;
