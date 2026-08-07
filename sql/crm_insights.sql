-- Insights de abordaje por prospecto — CH-10.
--
-- Qué resuelve: el operador investiga la marca (Brave), lee su dossier de La
-- Lectura y aplica reglas de la literatura de ventas, pero todo eso se
-- evaporaba en el chat. Nati y Simón recibían el borrador sin ver EN QUÉ se
-- basaba, así que no podían corregirlo con criterio ni reusar el hallazgo.
--
-- Acá queda junto al prospecto, visible en su ficha.
--
-- No es la bitácora (eso es crm_interacciones: lo que pasó) ni el borrador
-- (crm_borradores: lo que se va a mandar). Es el porqué.

CREATE TABLE IF NOT EXISTS public.crm_insights (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,

  -- investigacion = lo que se encontró de la marca (Brave, su sitio, su IG)
  -- lectura       = extraído del dossier de La Lectura
  -- literatura    = qué corresponde hacer según la secuencia de ventas
  tipo         text NOT NULL DEFAULT 'investigacion'
               CHECK (tipo IN ('investigacion', 'lectura', 'literatura')),

  titulo       text NOT NULL,
  detalle      text,
  -- URL si vino de la web, o el nombre de la obra si vino de la literatura
  fuente       text,

  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_insights_prospecto
  ON public.crm_insights (prospecto_id, created_at DESC);

ALTER TABLE public.crm_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_insights;
CREATE POLICY "admin full access" ON public.crm_insights FOR ALL USING (true) WITH CHECK (true);

-- Toda tabla nueva necesita GRANTs explícitos (ver sql/grants.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_insights TO service_role;
