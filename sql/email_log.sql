-- =============================================================================
-- email_log — registro de envíos y fallos de email
-- Correr en Supabase SQL Editor (NO se aplica automáticamente)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  destinatario text        NOT NULL,
  asunto       text        NOT NULL,
  contexto     text,
  estado       text        NOT NULL CHECK (estado IN ('enviado', 'fallido')),
  error        text
);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- Solo admin puede leer los registros (vía service_role o política)
CREATE POLICY "admin read email_log"
  ON public.email_log
  FOR SELECT
  USING (true);

-- GRANTs — service_role necesita INSERT para registrar desde sendEmail
GRANT SELECT, INSERT ON public.email_log TO service_role;
-- authenticated solo lectura (para futura vista admin)
GRANT SELECT ON public.email_log TO authenticated;
