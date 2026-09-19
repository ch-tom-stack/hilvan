-- CRM · "¿En qué quedó?" (sep-2026)
--
-- El CRM solo sabe lo que pasa por correo. Lo que se habla por WhatsApp, por
-- teléfono o en persona no llega nunca, y la ficha termina mostrando abandono
-- donde hubo seguimiento (brief de calidad de leads, 19-sep-2026: Magnolia
-- plantó tres veces, Paola postergó; nada estaba registrado).
--
-- En vez de esperar que alguien se acuerde de registrar, Hilván PREGUNTA: el
-- digest de la mañana trae, por cada prospecto con reunión reciente o silencio
-- largo, un link por respuesta. El link abre /q/<token> — nunca modifica nada
-- por sí solo (los clientes de correo abren links para revisarlos).
--
-- Solo service role: RLS activado y sin políticas.

CREATE TABLE IF NOT EXISTS public.crm_preguntas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  prospecto_id   uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  perfil_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,  -- a quién se le pregunta
  motivo         text NOT NULL CHECK (motivo IN ('reunion', 'silencio')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  -- Se llenan al contestar.
  respuesta      text CHECK (respuesta IN ('hablamos', 'postergo', 'no', 'planto', 'nada')),
  detalle        text,
  respondida_at  timestamptz,
  efecto         jsonb          -- qué cambió en el CRM: ids creados, etapa anterior, snooze anterior
);

CREATE INDEX IF NOT EXISTS idx_crm_preguntas_prospecto ON public.crm_preguntas (prospecto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_preguntas_abiertas ON public.crm_preguntas (perfil_id) WHERE respuesta IS NULL;

ALTER TABLE public.crm_preguntas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.crm_preguntas TO service_role;
