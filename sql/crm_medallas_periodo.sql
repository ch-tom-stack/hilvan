-- Medallas repetibles por mes — CH-10.
--
-- Antes una medalla se ganaba UNA vez y quedaba. Ahora hay dos alcances, y el
-- reparto respeta lo que cada una significa (ver lib/crm-medallas.ts):
--
--   unica   — primeras veces e hitos de carrera. "Tu primer contacto" no puede
--             repetirse cada mes sin vaciarse.
--   mensual — las que describen un buen MES. Sus números pasan a leerse como
--             mensuales, lo que vuelve genuinamente difíciles las altas.
--
-- El nivel de una medalla es cuántos meses la ganaste. El rango global sigue
-- contando medallas DISTINTAS, no repeticiones: si las repeticiones sumaran
-- puntos, el rango máximo llegaría solo con el tiempo y dejaría de significar
-- algo. Amplitud y profundidad quedan como ejes separados.

ALTER TABLE public.crm_medallas
  ADD COLUMN IF NOT EXISTS periodo text;

-- Backfill con el mes en que se ganó. Con esto no hace falta un valor
-- centinela: las únicas se resuelven preguntando "¿existe alguna fila?" y las
-- mensuales "¿hay fila de este período?".
UPDATE public.crm_medallas
   SET periodo = to_char(ganada_en, 'YYYY-MM')
 WHERE periodo IS NULL;

ALTER TABLE public.crm_medallas
  ALTER COLUMN periodo SET NOT NULL;

-- El índice pasa a incluir el período: una medalla mensual puede repetirse en
-- meses distintos pero no dos veces en el mismo. Sigue siendo lo que hace
-- idempotente la revisión.
DROP INDEX IF EXISTS crm_medallas_una_por_persona;
CREATE UNIQUE INDEX IF NOT EXISTS crm_medallas_una_por_periodo
  ON public.crm_medallas (profile_id, medalla, periodo);

CREATE INDEX IF NOT EXISTS crm_medallas_persona
  ON public.crm_medallas (profile_id, medalla);
