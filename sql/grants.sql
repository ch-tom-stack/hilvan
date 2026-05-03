-- =============================================================================
-- MIGRACIONES DE COLUMNAS (correr una sola vez si faltan)
-- =============================================================================
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS restricciones_alimentarias text;

-- =============================================================================
-- GRANTS — Hilván / Casa Hiedra
-- Correr en Supabase SQL Editor al crear o recrear la base de datos.
-- El service_role bypasses RLS pero igual necesita GRANT explícito.
-- =============================================================================

-- ─── RUTAS PÚBLICAS (service_role) ───────────────────────────────────────────
-- /citacion/[token]
GRANT SELECT, UPDATE ON public.rodaje_citaciones       TO service_role;
GRANT SELECT          ON public.rodaje_equipo_tecnico  TO service_role;
GRANT SELECT          ON public.rodaje_departamentos   TO service_role;
GRANT SELECT          ON public.rodajes                TO service_role;
GRANT SELECT          ON public.rodaje_escenas         TO service_role;

-- /m/[codigo] (maletas públicas)
GRANT SELECT          ON public.maletas                TO service_role;
GRANT SELECT          ON public.maleta_items           TO service_role;
GRANT SELECT, INSERT  ON public.maleta_notas           TO service_role;
GRANT SELECT          ON public.equipos                TO service_role;

-- /r/[token] (portal rendiciones externo)
GRANT SELECT, UPDATE  ON public.rendiciones_links_temporales TO service_role;
GRANT SELECT          ON public.cotizacion_items       TO service_role;
GRANT SELECT          ON public.cotizaciones           TO service_role;
GRANT SELECT          ON public.cotizacion_grupos      TO service_role;
GRANT SELECT          ON public.colaboradores          TO service_role;
GRANT SELECT, INSERT  ON public.rendicion_gastos       TO service_role;
GRANT SELECT          ON public.rendiciones            TO service_role;

-- ─── DASHBOARD AUTENTICADO (authenticated) ───────────────────────────────────
-- Módulo Cotizaciones (lectura para rendiciones y ficha colaborador)
GRANT SELECT ON public.cotizacion_departamentos  TO authenticated;
GRANT SELECT ON public.cotizacion_subgrupos      TO authenticated;

-- Módulo Colaboradores
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_tarifas              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_generados                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_links_temporales     TO authenticated;

-- Módulo Rendiciones
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendicion_gastos             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones_links_temporales TO authenticated;

-- ─── SERVICE_ROLE para server actions admin (rendiciones + colaboradores) ─────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_tarifas              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_generados                TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendicion_gastos                   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones                        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones_links_temporales       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_links_temporales     TO service_role;
GRANT SELECT, UPDATE                 ON public.rodaje_bloques                     TO service_role;
GRANT SELECT, UPDATE                 ON public.colaboradores                      TO service_role;
