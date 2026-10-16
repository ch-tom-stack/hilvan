-- SII: cola de importaciones para el trabajador del Mac (oct-2026)
--
-- La sesión del SII y la clave (Llavero de macOS) viven solo en el Mac de Tomás.
-- Hilván no puede leer el SII: encola el pedido y el Mac, cada 5 minutos y en
-- segundo plano (launchd), pregunta si hay trabajo, importa y reporta.
--   · sii_solicitudes → los pedidos (del operador o del cron de los lunes).
--   · sii_trabajador  → una sola fila: último latido del Mac y si está BLOQUEADO
--                       (el SII rechazó el login: no se vuelve a intentar hasta
--                       que Tomás lo libere desde el Mac).
--
-- Solo se accede con service role (API de agentes): RLS activado y sin políticas.

CREATE TABLE IF NOT EXISTS public.sii_solicitudes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo        text NOT NULL,                                   -- AAAAMM
  lados          text[] NOT NULL DEFAULT ARRAY['compras', 'ventas', 'bhe'],
  estado         text NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente', 'en_curso', 'hecha', 'fallida')),
  origen         text NOT NULL CHECK (origen IN ('agente', 'cron')),
  solicitado_at  timestamptz NOT NULL DEFAULT now(),
  tomado_at      timestamptz,
  terminado_at   timestamptz,
  resultado      jsonb,                                           -- lo que respondió sii-importar por lado
  error          text                                             -- textual, si falló
);

-- Un solo pedido abierto por período: pedir dos veces no duplica trabajo.
CREATE UNIQUE INDEX IF NOT EXISTS sii_solicitudes_abierta_idx
  ON public.sii_solicitudes (periodo) WHERE estado IN ('pendiente', 'en_curso');
CREATE INDEX IF NOT EXISTS sii_solicitudes_solicitado_idx ON public.sii_solicitudes (solicitado_at DESC);

CREATE TABLE IF NOT EXISTS public.sii_trabajador (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ultimo_latido   timestamptz,
  version         text,                                           -- ej. 'sii-cli 0.10.0'
  bloqueado       boolean NOT NULL DEFAULT false,
  motivo_bloqueo  text,
  bloqueado_at    timestamptz
);
INSERT INTO public.sii_trabajador (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.sii_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sii_trabajador  ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.sii_solicitudes TO service_role;
GRANT ALL ON public.sii_trabajador  TO service_role;
