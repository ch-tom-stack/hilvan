-- cotizaciones_archivo.sql
-- Soporte para importar cotizaciones HISTÓRICAS (pre-Hilván, ej. las ~34 del
-- Excel) sin contaminar la numeración ni las métricas de las activas.
--
-- 1) `es_archivo` en cotizaciones: flag filtrable para excluirlas de reportes,
--    pipeline y "cotizaciones de este mes". Default false (todo lo existente y
--    lo nuevo normal queda en false).
-- 2) Blindaje de siguiente_numero_grupo(): la versión anterior tomaba el máximo
--    de TODO numero_base que terminara en dígitos — un CH-ARCH-200 habría
--    empujado el contador activo a 201. Ahora solo cuenta los formatos reales
--    de la serie activa (CH-{año}-NNN y el legado CH-COT-NNN); cualquier serie
--    alternativa (CH-ARCH-…, CH-loquesea-…) queda fuera del contador.
--
-- El contador de la serie de archivo NO necesita RPC: lo calcula el endpoint
-- crear-cotizacion (max de 'CH-{SERIE}-%' + 1) — es un import puntual, no un
-- flujo concurrente.
-- Correr en el SQL Editor de Supabase.

alter table public.cotizaciones
  add column if not exists es_archivo boolean not null default false;

create index if not exists cotizaciones_es_archivo_idx
  on public.cotizaciones (es_archivo) where es_archivo;

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
  -- SOLO la serie activa: CH-2026-095 / CH-COT-023. Series alternativas
  -- (CH-ARCH-001…) no cuentan para este correlativo.
  where numero_base ~ '^CH-[0-9]{4}-[0-9]+$'
     or numero_base ~ '^CH-COT-[0-9]+$';
$$;

grant execute on function siguiente_numero_grupo() to authenticated, service_role, anon;
