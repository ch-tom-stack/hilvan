-- cotizacion_numero_piso.sql
-- Salta la numeración de cotizaciones a un piso (para no verse "recién nacidos"
-- con números bajos). Solo afecta a las cotizaciones NUEVAS; las ya emitidas
-- conservan su número. De ahí en adelante sigue consecutivo.
-- Cotizaciones NO son documento tributario → saltar el correlativo es válido.
--
-- Cambia el 120 por el piso que quieras (recomiendo algo no-redondo, ej. 118 o 142).
-- Correr en el SQL Editor de Supabase.

create or replace function siguiente_numero_grupo()
returns text
language sql
as $$
  select 'CH-COT-' || lpad(
    greatest(
      coalesce(max( (regexp_replace(numero_base, '[^0-9]', '', 'g'))::int ), 0) + 1,
      120   -- ← PISO: el próximo número no baja de acá
    )::text, 3, '0')
  from cotizacion_grupos
  where numero_base ~ '^CH-COT-[0-9]+$';
$$;

-- Preserva los permisos de ejecución (idempotente).
grant execute on function siguiente_numero_grupo() to authenticated, service_role, anon;
