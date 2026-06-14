-- Tabla de auditoría para la API de agentes (/api/agent/*)
--
-- Registra cada escritura/operación que realiza el agente IA contra Hilván,
-- con el archivo fuente y un resumen del payload, para trazabilidad y deshacer.
--
-- Cómo correrlo:
--   Pegar este archivo completo en el SQL Editor de Supabase y ejecutar.
--   (Solo se aplica una vez; no es destructivo.)

CREATE TABLE IF NOT EXISTS public.agente_acciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  herramienta     text NOT NULL,
  payload         jsonb,
  resultado_tabla text,
  resultado_id    uuid,
  archivo_url     text,
  ok              boolean NOT NULL,
  error           text,
  deshecha        boolean NOT NULL DEFAULT false
);

-- RLS: la tabla se opera exclusivamente vía service_role (token de agente).
-- No se exponen políticas para anon/authenticated.
ALTER TABLE public.agente_acciones ENABLE ROW LEVEL SECURITY;

-- GRANTs — solo service_role (la API usa createAdminClient()).
GRANT SELECT, INSERT, UPDATE ON public.agente_acciones TO service_role;
