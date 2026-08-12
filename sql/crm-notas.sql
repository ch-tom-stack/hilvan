-- CH-10 · Notas individuales por prospecto (ago 2026)
--
-- `prospectos.notas` era un único campo de texto, y la gente ya lo estaba
-- usando como si fueran varias notas: de 34 prospectos con notas, 21 tienen
-- varios párrafos y 19 llevan el prefijo "[La Lectura]" puesto a mano. La nota
-- más larga son 2.137 caracteres en una cajita de tres líneas. Esto formaliza
-- lo que ya pasaba.
--
-- `bloqueada` congela una nota: lo que se guardó como registro —una lectura, un
-- acuerdo con el cliente— deja de poder editarse sin querer.
--
-- La Lectura de los prospectos que SÍ tienen dossier en `crm_lecturas` NO se
-- copia acá: se muestra en la ficha leyendo esa tabla. Duplicarla dejaría dos
-- respuestas para "¿qué dice la Lectura?", que es el error que este CRM ya
-- cometió tres veces.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.crm_notas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  -- nota = escrita por alguien | lectura = vino de La Lectura sin dossier
  -- estructurado | acuerdo = lo pactado con el cliente
  tipo         text NOT NULL DEFAULT 'nota'
               CHECK (tipo IN ('nota', 'lectura', 'acuerdo')),
  titulo       text,
  cuerpo       text NOT NULL DEFAULT '',
  autor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Congelada: no se edita ni se borra desde la UI.
  bloqueada    boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.crm_notas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_notas;
CREATE POLICY "admin full access" ON public.crm_notas FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crm_notas_prospecto
  ON public.crm_notas (prospecto_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_notas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_notas TO service_role;

-- ─── Migración ───────────────────────────────────────────────────────────────
-- No se parten las notas en varias automáticamente: cortar por saltos de línea
-- es adivinar, y con textos de 2.000 caracteres el destrozo sería silencioso.
-- Cada nota migra entera; dividirlas queda para las manos de alguien.

-- 1) Los que traen "[La Lectura]" pero NO tienen dossier archivado: su Lectura
--    existe solo como este texto, así que se preserva como nota bloqueada.
INSERT INTO public.crm_notas (prospecto_id, tipo, titulo, cuerpo, bloqueada)
SELECT p.id, 'lectura', 'La Lectura', p.notas, true
  FROM public.prospectos p
 WHERE p.notas IS NOT NULL AND btrim(p.notas) <> ''
   AND p.notas ILIKE '%[La Lectura]%'
   AND NOT EXISTS (SELECT 1 FROM public.crm_lecturas l WHERE l.prospecto_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.crm_notas n WHERE n.prospecto_id = p.id);

-- 2) Todo el resto: nota normal, editable. Incluye a los que SÍ tienen dossier
--    —su tarjeta de La Lectura se muestra aparte desde crm_lecturas, así que
--    esta nota queda como lo que es: texto que alguien escribió y puede depurar.
INSERT INTO public.crm_notas (prospecto_id, tipo, titulo, cuerpo, bloqueada)
SELECT p.id, 'nota', 'Notas', p.notas, false
  FROM public.prospectos p
 WHERE p.notas IS NOT NULL AND btrim(p.notas) <> ''
   AND NOT EXISTS (SELECT 1 FROM public.crm_notas n WHERE n.prospecto_id = p.id);

-- 3) Vaciar el campo viejo, SOLO donde la migración dejó su nota. El guard evita
--    borrar texto que por lo que sea no alcanzó a copiarse.
UPDATE public.prospectos p
   SET notas = NULL
 WHERE p.notas IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.crm_notas n
                WHERE n.prospecto_id = p.id AND n.cuerpo = p.notas);

-- ─── Comprobación ────────────────────────────────────────────────────────────
-- Debe dar 0 en la primera y 0 en la segunda:
--   SELECT count(*) FROM public.prospectos WHERE notas IS NOT NULL AND btrim(notas) <> '';
--   SELECT count(*) FROM public.crm_notas WHERE btrim(cuerpo) = '';
-- Y el reparto por tipo:
--   SELECT tipo, bloqueada, count(*) FROM public.crm_notas GROUP BY 1,2;
