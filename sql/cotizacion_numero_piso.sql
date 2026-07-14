-- cotizacion_numero_piso.sql
-- Numeración de cotizaciones con AÑO + piso (para no verse "recién nacidos").
-- Formato nuevo: CH-2026-080, CH-2026-081, ...  (antes: CH-COT-023).
--
-- SEGURO — verificado:
--  * Solo afecta cotizaciones NUEVAS. Las existentes (CH-COT-001..023) NO se tocan.
--  * Rendiciones y financiero enlazan la cotización por cotizacion_id (UUID), NO por
--    el número → las RENDIDAS quedan intactas. El número es solo etiqueta de display.
--  * Ningún código parsea el formato (se usa como string completo) → formatos mezclados
--    conviven sin romper nada.
--
-- El contador es CONTINUO (no reinicia cada año): el año es solo el prefijo del año
-- actual, y el correlativo sigue subiendo (ej. en ene-2027 seguiría CH-2027-095…), así
-- NUNCA vuelve a verse bajo. Piso = 80 → la próxima cotización arranca en CH-2026-080.
-- Cambia el 80 si quieres otro piso. Correr en el SQL Editor de Supabase.

create or replace function siguiente_numero_grupo()
returns text
language sql
as $$
  select 'CH-'
    || extract(year from (now() at time zone 'America/Santiago'))::int::text
    || '-'
    || lpad(
         greatest(
           coalesce(max( (substring(numero_base from '([0-9]+)$'))::int ), 0) + 1,
           80   -- ← PISO
         )::text, 3, '0')
  from cotizacion_grupos
  where numero_base ~ '[0-9]+$';
$$;

-- Preserva permisos de ejecución (idempotente).
grant execute on function siguiente_numero_grupo() to authenticated, service_role, anon;
