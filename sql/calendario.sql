-- ============================================================
-- CH-8 Calendario
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Función updated_at genérica (puede ya existir)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── Rental de equipos (estructura para portal externo futuro) ───────────────
-- No tiene UI en Hilván todavía — solo la tabla para que una app complementaria
-- pueda conectarse via API y reservar equipos/maletas.
CREATE TABLE IF NOT EXISTS public.rental_reservas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id       UUID REFERENCES public.equipos(id) ON DELETE SET NULL,
  maleta_id       UUID REFERENCES public.maletas(id) ON DELETE SET NULL,
  cliente_id      UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','aprobada','denegada','entregada','devuelta')),
  aprobada_por    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cotizacion_id   UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT equipo_o_maleta CHECK (
    (equipo_id IS NOT NULL AND maleta_id IS NULL) OR
    (equipo_id IS NULL AND maleta_id IS NOT NULL)
  )
);

CREATE OR REPLACE TRIGGER update_rental_reservas_updated_at
  BEFORE UPDATE ON public.rental_reservas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.rental_reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_reservas_read" ON public.rental_reservas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "rental_reservas_write" ON public.rental_reservas
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_reservas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_reservas TO service_role;

-- ─── Eventos importados desde Google Calendar ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eventos_calendario (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id     TEXT UNIQUE NOT NULL,
  titulo              TEXT NOT NULL,
  descripcion         TEXT,
  fecha_inicio        TIMESTAMPTZ NOT NULL,
  fecha_fin           TIMESTAMPTZ NOT NULL,
  todo_el_dia         BOOLEAN NOT NULL DEFAULT FALSE,
  clasificacion       TEXT NOT NULL DEFAULT 'sin_clasificar'
                        CHECK (clasificacion IN ('sin_clasificar','rodaje','reunion','ignorar')),
  rodaje_id           UUID REFERENCES public.rodajes(id) ON DELETE SET NULL,
  clasificado_por     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER update_eventos_calendario_updated_at
  BEFORE UPDATE ON public.eventos_calendario
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.eventos_calendario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_calendario_read" ON public.eventos_calendario
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "eventos_calendario_write" ON public.eventos_calendario
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventos_calendario TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventos_calendario TO service_role;
