-- =============================================================================
-- Nuevos campos de header en cotizaciones
-- Correr en Supabase SQL Editor
-- =============================================================================

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS cliente_final  text,
  ADD COLUMN IF NOT EXISTS medios         text,
  ADD COLUMN IF NOT EXISTS referencia     text,
  ADD COLUMN IF NOT EXISTS solicita       text;
