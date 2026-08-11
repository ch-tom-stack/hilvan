-- Medallas del CRM y atribución de contactos — CH-10.
--
-- Dos cosas, y la primera es el prerrequisito de la segunda.
--
-- 1. `crm_interacciones` no guardaba QUIÉN registró el contacto. Sin eso no
--    hay tracking por persona: lo único atribuible era el `responsable_id` del
--    prospecto, que es el REPARTO y no el trabajo. Natalia tiene más contactos
--    registrados que Simón porque le tocaron más prospectos.
--
-- 2. Las medallas son personales y NO comparativas, a propósito. En un equipo
--    de cuatro donde todos se ven, una medalla comparativa mide quién recibió
--    más asignaciones — justo lo que docs/crm/operador-contexto.md §6 prohíbe.

-- ── 1. Atribución ────────────────────────────────────────────────────────────
ALTER TABLE public.crm_interacciones
  ADD COLUMN IF NOT EXISTS registrado_por uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS crm_interacciones_autor
  ON public.crm_interacciones (registrado_por, fecha DESC);

-- Las filas que ya existen quedan con NULL A PROPÓSITO. Asignarlas al
-- responsable actual del prospecto sería inventar un dato: el responsable pudo
-- cambiar, y buena parte de esos toques los cargó el operador en la
-- conciliación, no la persona. Las medallas cuentan desde acá.

-- ── 2. Medallas ganadas ──────────────────────────────────────────────────────
-- Se guardan en vez de calcularse al vuelo por dos razones: queda la fecha en
-- que se ganó, y permite detectar la transición para celebrarla UNA vez.
CREATE TABLE IF NOT EXISTS public.crm_medallas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Clave estable de lib/crm-medallas.ts. Texto y no enum: agregar una medalla
  -- no debería necesitar una migración.
  medalla    text NOT NULL,
  ganada_en  date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
  created_at timestamptz DEFAULT now()
);

-- Una medalla se gana una sola vez. El índice es lo que hace que revisarlas sea
-- idempotente: la revisión puede correr en cada carga sin duplicar ni recelebrar.
CREATE UNIQUE INDEX IF NOT EXISTS crm_medallas_una_por_persona
  ON public.crm_medallas (profile_id, medalla);

ALTER TABLE public.crm_medallas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_medallas;
CREATE POLICY "admin full access" ON public.crm_medallas FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_medallas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_medallas TO service_role;
