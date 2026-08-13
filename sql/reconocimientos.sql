-- Reconocimientos — CH-10
--
-- Una mención escrita a mano por una persona, no otorgada por una regla.
--
-- POR QUÉ EXISTE. Las 38 medallas las concede un umbral, y eso las hace justas
-- y también baratas: la máquina no puede sorprenderse. Un reconocimiento cuesta
-- que alguien se dé cuenta y se siente a escribirlo, y por eso es el único
-- símbolo del sistema que no se puede inflar.
--
-- Decisiones que explican la forma de esta tabla:
--
-- 1. NO tiene contador, ni rareza, ni puntos, ni suma al rango. En cuanto un
--    reconocimiento entra a una fórmula deja de ser una mención y pasa a ser
--    otra medalla con otro nombre.
--
-- 2. `texto` es obligatorio y libre. Un reconocimiento sin motivo escrito es
--    una palmada en la espalda: se agradece y se olvida.
--
-- 3. Es LO ÚNICO que ve todo el equipo. Las medallas y las misiones diarias de
--    cada uno siguen siendo de cada uno — lo especial se ve, lo diario no.
--
-- 4. `visto_en` es del destinatario: marca cuándo se le mostró, para no volver
--    a abrirle el pergamino en cada carga.

CREATE TABLE IF NOT EXISTS public.reconocimientos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  otorgado_por uuid NOT NULL REFERENCES public.profiles(id),

  titulo       text NOT NULL,
  texto        text NOT NULL,
  -- Una imagen pegada, como una foto en el pergamino. Opcional: la mención
  -- vale por lo escrito, la imagen sólo la hace más entretenida.
  imagen_url   text,

  visto_en     timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reconocimientos_persona
  ON public.reconocimientos (persona_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reconocimientos_fecha
  ON public.reconocimientos (created_at DESC);

ALTER TABLE public.reconocimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso por sesión" ON public.reconocimientos;
CREATE POLICY "acceso por sesión" ON public.reconocimientos FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconocimientos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconocimientos TO service_role;

-- Para bases donde la tabla ya existía sin la columna:
ALTER TABLE public.reconocimientos ADD COLUMN IF NOT EXISTS imagen_url text;
