-- fecha_documento_gastos.sql
-- Agrega `fecha_documento` (la fecha real del documento/boleta, distinta de la
-- fecha de carga `created_at`) a los gastos de proyecto y mensuales.
--
-- Se usa para:
--   (a) cuadrar por mes tributario (filtro `periodo` por fecha del documento), y
--   (b) calcular la retención con el AÑO correcto de la boleta
--       (Ley 21.133, tasaRetencionBoleta).
--
-- Columna nullable: es aditiva, no rompe inserts existentes.
--
-- Cómo correrlo: pegar este bloque en el SQL Editor de Supabase
-- (proyecto hilvan) y ejecutar. Idempotente (IF NOT EXISTS).

ALTER TABLE public.rendicion_gastos ADD COLUMN IF NOT EXISTS fecha_documento date;
ALTER TABLE public.rendicion_mensual_gastos ADD COLUMN IF NOT EXISTS fecha_documento date;
