-- =============================================================================
-- CH-10 CRM — Migración completa (Fase F1)
-- Correr en Supabase SQL Editor
--
-- Módulo de captación / pipeline de prospectos. Aditivo y aislado: no toca
-- ninguna tabla existente salvo por FKs nullable hacia profiles y clientes.
-- =============================================================================

-- Reutiliza la función trigger updated_at ya definida (sql/clientes.sql).
-- Se redefine aquí con IF para que esta migración sea autocontenida.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── prospectos ──────────────────────────────────────────────────────────────
-- La marca / lead. etapa default 'prospecto'. cliente_id se linkea al confirmar.
CREATE TABLE IF NOT EXISTS public.prospectos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa           text NOT NULL,
  nombre_contacto   text,
  email             text,
  telefono          text,
  origen            text,                 -- linkedin | instagram | referido | feria | web | correo | otro
  arquetipo         text,                 -- feed | temporadas | sin_definir
  etapa             text NOT NULL DEFAULT 'prospecto',
  responsable_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  score             text,                 -- alta | media | baja
  decisor           text,
  angulo            text,                 -- gancho de acercamiento
  producto_objetivo text,                 -- banco | lookbook | spot | sin_definir
  cliente_id        uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  notas             text,
  checklist         text[] NOT NULL DEFAULT '{}',  -- hitos no ordinales: lectura | producto_propuesto | cotizacion_enviada | reunion
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE public.prospectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.prospectos;
CREATE POLICY "admin full access" ON public.prospectos FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_prospectos_updated_at ON public.prospectos;
CREATE TRIGGER set_prospectos_updated_at
  BEFORE UPDATE ON public.prospectos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prospectos_etapa       ON public.prospectos (etapa);
CREATE INDEX IF NOT EXISTS idx_prospectos_responsable ON public.prospectos (responsable_id);

-- ─── crm_interacciones (bitácora) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_interacciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id  uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  fecha         date,
  tipo          text,        -- correo | reunion | lectura | llamada | mensaje
  resumen       text,
  cuerpo        text,        -- correo enviado adjunto (texto)
  respondido    boolean NOT NULL DEFAULT false,  -- el contacto tuvo respuesta
  proximo_paso  text,
  fecha_proximo date,        -- alimenta los recordatorios (F4)
  gmail_thread  text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.crm_interacciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_interacciones;
CREATE POLICY "admin full access" ON public.crm_interacciones FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crm_interacciones_prospecto ON public.crm_interacciones (prospecto_id);

-- ─── crm_lecturas (integra "La Lectura") ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_lecturas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id      uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  url               text,
  dossier_ref       text,
  producto_derivado text,    -- banco | lookbook (heurística E7)
  fecha             date,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.crm_lecturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_lecturas;
CREATE POLICY "admin full access" ON public.crm_lecturas FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crm_lecturas_prospecto ON public.crm_lecturas (prospecto_id);

-- ─── crm_contactos (árbol de contactos: varias personas por marca) ───────────
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

-- ─── crm_aprobaciones (Bandeja agente→humano; UI en F2) ──────────────────────
CREATE TABLE IF NOT EXISTS public.crm_aprobaciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,           -- prospecto_nuevo | cambio_etapa | interaccion | correo_borrador | brief_cotizacion
  prospecto_id uuid REFERENCES public.prospectos(id) ON DELETE CASCADE,
  payload      jsonb,
  estado       text NOT NULL DEFAULT 'pendiente',  -- pendiente | aprobado | descartado
  origen       text,                    -- agente | cron_correos | chat
  nota_agente  text,
  created_at   timestamptz DEFAULT now(),
  resuelto_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resuelto_at  timestamptz
);

ALTER TABLE public.crm_aprobaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_aprobaciones;
CREATE POLICY "admin full access" ON public.crm_aprobaciones FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crm_aprobaciones_estado ON public.crm_aprobaciones (estado);

-- ─── GRANTs ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospectos        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_interacciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lecturas      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contactos     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_aprobaciones  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospectos        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_interacciones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lecturas      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contactos     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_aprobaciones  TO service_role;
