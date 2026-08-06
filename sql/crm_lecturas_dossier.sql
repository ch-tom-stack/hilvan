-- Archiva la lectura completa dentro de Hilván.
--
-- Qué pasaba: el webhook del sitio mandaba solo el RESUMEN de la lectura
-- (héroe, villano, vaca púrpura, dirección, ocasión) como texto plano dentro de
-- `notas` del prospecto. El dossier completo —citas verbatim del sitio,
-- pruebas, señales, imágenes— quedaba únicamente en `lecturas.dossier` del
-- Supabase DEL SITIO, al que el equipo no entra.
--
-- La tabla crm_lecturas ya existía pero guarda solo una REFERENCIA
-- (dossier_ref es texto), y de hecho el webhook nunca la llenaba.
--
-- Con esto el análisis queda donde se usa: al aprobar el lead en la Bandeja,
-- el dossier se archiva junto al prospecto. Es el insumo directo del brief
-- creativo cuando el prospecto avanza a cotización.

ALTER TABLE public.crm_lecturas
  ADD COLUMN IF NOT EXISTS dossier jsonb;

COMMENT ON COLUMN public.crm_lecturas.dossier IS
  'Dossier completo de La Lectura tal como lo produjo el sitio. Lo manda el webhook y se archiva al aprobar la propuesta.';

-- Para encontrar prospectos con lectura archivada sin traer el jsonb entero.
CREATE INDEX IF NOT EXISTS crm_lecturas_con_dossier
  ON public.crm_lecturas (prospecto_id)
  WHERE dossier IS NOT NULL;
