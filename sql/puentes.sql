-- Puentes — CH-10
--
-- Cuándo alguien cruzó desde Hilván a otra app de Casa Hiedra.
--
-- POR QUÉ ES UNA TABLA Y NO UNA CONSULTA. El resto de las medallas se calcula
-- contando filas que ya existen: cotizaciones, rodajes, gastos. Cruzar a otra
-- app no deja rastro en ninguna tabla —Bastidor vive en otro dominio y no
-- comparte base—, así que el hecho hay que guardarlo cuando ocurre o se pierde.
--
-- LO QUE MIDE, CON PRECISIÓN. El clic en el enlace, no la visita. Hilván no
-- puede saber si la otra app cargó, si el enlace funcionaba o si la persona se
-- arrepintió en el camino. La medalla se llama según lo que de verdad se sabe.
--
-- `veces` y `ultima` quedan por si alguna vez interesa una medalla de
-- constancia, pero hoy nada las lee: la de Bastidor se gana la primera vez.

CREATE TABLE IF NOT EXISTS public.puentes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  destino    text NOT NULL,
  veces      integer NOT NULL DEFAULT 1,
  primera    timestamptz NOT NULL DEFAULT now(),
  ultima     timestamptz NOT NULL DEFAULT now()
);

-- Una fila por persona y destino: el cruce se acumula, no se apila.
CREATE UNIQUE INDEX IF NOT EXISTS puentes_persona_destino
  ON public.puentes (persona_id, destino);

ALTER TABLE public.puentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso por sesión" ON public.puentes;
CREATE POLICY "acceso por sesión" ON public.puentes FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.puentes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.puentes TO service_role;
