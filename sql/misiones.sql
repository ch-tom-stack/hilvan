-- Misiones — CH-10
--
-- Encargos acotados, diarios o semanales, que una persona recibe al entrar a
-- Hilván. El diseño completo está en docs/crm/reglas-misiones.md; acá solo lo
-- que la tabla necesita saber.
--
-- Decisiones que explican la forma de esta tabla:
--
-- 1. Guarda SOLO las elegidas. El operador propone dos o tres opciones por
--    espacio y Tomás elige en el chat; acá llega la elegida. Por eso no hay
--    `slot_id` ni `recomendada`: esa etapa vive fuera.
--
-- 2. `vencida` NO se guarda, se calcula al leer. El vencimiento se cuenta en
--    días hábiles de cada persona —la misión del lunes de Natalia sobrevive su
--    martes libre— y esa jornada puede cambiar. Un estado congelado quedaría
--    mal el día que alguien cambie de días; el cálculo en lectura no.
--
-- 3. `declarada_en` la escribe la persona y nadie más. Es honor system: si el
--    sistema pudiera marcar cumplida una misión, dejaría de serlo.
--
-- 4. El conteo NUNCA va dentro de `texto`. "Tus 11 sin primer contacto" es
--    falso en tres días. El número vive en `fuente_verificacion` con
--    `verificado_en`, que es lo que envejece con honestidad.

CREATE TABLE IF NOT EXISTS public.misiones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  tipo                text NOT NULL CHECK (tipo IN ('diaria', 'semanal')),
  texto               text NOT NULL,
  guia                text,

  -- Qué dato la justifica y cuándo se comprobó. Un conteo sin fecha no vale.
  fuente_verificacion text,
  verificado_en       date,

  -- Diaria: el día hábil al que corresponde.
  -- Semanal: el lunes de su semana.
  fecha_objetivo      date NOT NULL,

  cumplida_en         timestamptz,
  creada_por          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS misiones_persona_fecha
  ON public.misiones (persona_id, fecha_objetivo DESC);

-- Una misión por persona, tipo y fecha: si Tomás cambia de opinión se edita la
-- que hay, no se apila otra encima.
CREATE UNIQUE INDEX IF NOT EXISTS misiones_una_por_dia
  ON public.misiones (persona_id, tipo, fecha_objetivo);

ALTER TABLE public.misiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acceso por sesión" ON public.misiones;
CREATE POLICY "acceso por sesión" ON public.misiones FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.misiones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.misiones TO service_role;
