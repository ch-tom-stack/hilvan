-- CH-0/CH-10 · Todos ven a quién está asignado cada prospecto (ago 2026)
--
-- Síntoma: en la tabla del CRM la columna Responsable aparece vacía ("—") para
-- unos usuarios y con nombre para otros, según el rol.
--
-- Causa: los 58 prospectos TIENEN responsable_id — se verificó contra la base.
-- Lo que falla es el join `responsable:profiles(...)`, que se hace con el
-- cliente de sesión y por lo tanto pasa por las políticas de `profiles`. Si esa
-- tabla sólo deja ver la fila propia, PostgREST no devuelve error: devuelve la
-- relación en null. El prospecto se ve, el nombre no. Un permiso que falta se
-- disfraza de dato que falta.
--
-- El reparto es información de equipo: saber que Fundamenta la lleva Natalia no
-- es dato sensible, es lo que evita escribirle dos veces al mismo cliente.
--
-- Sólo se toca la LECTURA. Quién puede modificar perfiles no cambia acá.
-- Idempotente.

-- Antes: mirar qué políticas de SELECT hay hoy sobre profiles.
--   SELECT policyname, cmd, qual FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'profiles';

DROP POLICY IF EXISTS "perfiles visibles para autenticados" ON public.profiles;
CREATE POLICY "perfiles visibles para autenticados"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.profiles TO authenticated;

-- Comprobación: con la sesión de Natalia (no admin), esto tiene que devolver
-- las 7 filas del equipo, no 1.
--   SELECT count(*) FROM public.profiles;
--
-- Y en la app: /crm → vista Tabla → la columna Responsable con nombre en las 58
-- filas, entrando con una cuenta de rol `productor`.
--
-- NOTA: si ya existía otra política de SELECT más restrictiva y con otro
-- nombre, esta se SUMA (las políticas permisivas se combinan con OR), así que
-- el resultado igual es "todos ven a todos". Si en cambio se quiere dejar una
-- sola política, borrar la vieja por nombre con el SELECT de arriba a la vista.
