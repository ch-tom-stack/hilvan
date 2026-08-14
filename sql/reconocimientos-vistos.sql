-- Quién ya vio cada mención.
--
-- POR QUÉ NO ALCANZA `reconocimientos.visto_en`. Esa columna es de una sola
-- persona: servía cuando el pergamino se le abría sólo al mencionado. Pero una
-- mención es un RECONOCIMIENTO PÚBLICO —se le abre a todo el equipo— y "visto"
-- pasa a ser una relación entre una mención y cada persona, no un dato de la
-- mención.
--
-- Con la columna vieja, el primero en entrar la marcaba vista y los demás no
-- la veían nunca.

CREATE TABLE IF NOT EXISTS public.reconocimientos_vistos (
  reconocimiento_id uuid NOT NULL REFERENCES public.reconocimientos(id) ON DELETE CASCADE,
  persona_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visto_en          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reconocimiento_id, persona_id)
);

CREATE INDEX IF NOT EXISTS reconocimientos_vistos_persona
  ON public.reconocimientos_vistos (persona_id);

ALTER TABLE public.reconocimientos_vistos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso por sesión" ON public.reconocimientos_vistos;
CREATE POLICY "acceso por sesión" ON public.reconocimientos_vistos FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconocimientos_vistos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconocimientos_vistos TO service_role;
