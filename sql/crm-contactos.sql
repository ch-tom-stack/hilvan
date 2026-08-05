-- CH-10 · Árbol de contactos por marca (ago 2026)
-- Una marca (prospecto) tiene VARIAS personas: nombre, cargo, correo, teléfono,
-- decisor, notas y links. Idempotente.

CREATE TABLE IF NOT EXISTS public.crm_contactos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  nombre       text,
  cargo        text,
  email        text,
  telefono     text,
  es_decisor   boolean NOT NULL DEFAULT false,
  notas        text,
  links        text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.crm_contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_contactos;
CREATE POLICY "admin full access" ON public.crm_contactos FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crm_contactos_prospecto ON public.crm_contactos (prospecto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contactos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contactos TO service_role;

-- Seed: pasar el contacto principal existente (prospectos.nombre_contacto/email)
-- al árbol, sin duplicar si ya hay contactos para esa marca.
INSERT INTO public.crm_contactos (prospecto_id, nombre, email, telefono, es_decisor)
SELECT p.id, p.nombre_contacto, p.email, p.telefono, false
  FROM public.prospectos p
 WHERE (p.nombre_contacto IS NOT NULL OR p.email IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.crm_contactos c WHERE c.prospecto_id = p.id);
