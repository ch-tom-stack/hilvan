-- CH-10 · Casilla de borradores de respuesta (ago 2026)
-- Un operador (humano o IA/Cowork) redacta un correo de respuesta con material,
-- links y paquetes en PDF. NO se envía solo: es un borrador para revisar/enviar.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.crm_borradores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  contacto_id  uuid REFERENCES public.crm_contactos(id) ON DELETE SET NULL,
  asunto       text,
  cuerpo       text,
  links        text[] NOT NULL DEFAULT '{}',   -- links a material propio dentro del correo
  adjuntos     text[] NOT NULL DEFAULT '{}',   -- paquetes/PDF (URLs o refs)
  estado       text NOT NULL DEFAULT 'borrador', -- borrador | listo | enviado
  autor        text,                            -- 'operador' | 'ia' (informativo)
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.crm_borradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_borradores;
CREATE POLICY "admin full access" ON public.crm_borradores FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crm_borradores_prospecto ON public.crm_borradores (prospecto_id);

DROP TRIGGER IF EXISTS set_crm_borradores_updated_at ON public.crm_borradores;
CREATE TRIGGER set_crm_borradores_updated_at
  BEFORE UPDATE ON public.crm_borradores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_borradores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_borradores TO service_role;
