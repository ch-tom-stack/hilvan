-- =============================================================================
-- CH-7 Clientes — Migración completa
-- Correr en Supabase SQL Editor
-- =============================================================================

-- ─── Función trigger updated_at (sin moddatetime) ────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── clientes — nuevas columnas ───────────────────────────────────────────────
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS parent_id   uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ciudad      text,
  ADD COLUMN IF NOT EXISTS pais        text NOT NULL DEFAULT 'Chile',
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS set_clientes_updated_at ON public.clientes;
CREATE TRIGGER set_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── proyectos — nuevas columnas ──────────────────────────────────────────────
ALTER TABLE public.proyectos
  ADD COLUMN IF NOT EXISTS notas      text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 'cancelado' como estado: si existe CHECK constraint hay que recrearlo
-- Si el campo es texto libre (sin constraint), solo actualiza el tipo TS
DO $$
BEGIN
  -- Intenta agregar cancelado al constraint si existe
  -- Si falla silenciosamente, el campo es texto libre
  ALTER TABLE public.proyectos
    DROP CONSTRAINT IF EXISTS proyectos_estado_check;
  ALTER TABLE public.proyectos
    ADD CONSTRAINT proyectos_estado_check
    CHECK (estado IN ('prospecto','activo','en_rodaje','post','entregado','cerrado','cancelado'));
EXCEPTION WHEN others THEN
  NULL; -- constraint no existía o no hay problema
END $$;

DROP TRIGGER IF EXISTS set_proyectos_updated_at ON public.proyectos;
CREATE TRIGGER set_proyectos_updated_at
  BEFORE UPDATE ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── cliente_contactos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cliente_contactos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  cargo       text,
  email       text,
  telefono    text,
  area        text,
  notas       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.cliente_contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.cliente_contactos;
CREATE POLICY "admin full access" ON public.cliente_contactos FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_cliente_contactos_updated_at ON public.cliente_contactos;
CREATE TRIGGER set_cliente_contactos_updated_at
  BEFORE UPDATE ON public.cliente_contactos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── proyecto_contactos (pivot) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proyecto_contactos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id     uuid NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  contacto_id     uuid NOT NULL REFERENCES public.cliente_contactos(id) ON DELETE CASCADE,
  rol_en_proyecto text,
  UNIQUE (proyecto_id, contacto_id)
);

ALTER TABLE public.proyecto_contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.proyecto_contactos;
CREATE POLICY "admin full access" ON public.proyecto_contactos FOR ALL USING (true) WITH CHECK (true);

-- ─── proyecto_tareas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proyecto_tareas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  texto       text NOT NULL,
  completada  boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.proyecto_tareas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.proyecto_tareas;
CREATE POLICY "admin full access" ON public.proyecto_tareas FOR ALL USING (true) WITH CHECK (true);

-- ─── GRANTs ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proyectos          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_contactos  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proyecto_contactos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proyecto_tareas    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proyectos          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_contactos  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proyecto_contactos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proyecto_tareas    TO service_role;
