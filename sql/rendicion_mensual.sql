-- Rendición mensual: gastos generales de Casa Hiedra no asociados a cotizaciones

CREATE TABLE IF NOT EXISTS public.rendiciones_mensuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo date NOT NULL UNIQUE,
  presupuesto integer NOT NULL DEFAULT 100000,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'pagado')),
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rendicion_mensual_gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rendicion_mensual_id uuid NOT NULL REFERENCES public.rendiciones_mensuales(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  monto integer NOT NULL,
  categoria text,
  archivo_url text,
  cargado_por text NOT NULL,
  cargado_por_id uuid REFERENCES auth.users(id),
  tipo_documento text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.rendiciones_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rendicion_mensual_gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_rendiciones_mensuales"
  ON public.rendiciones_mensuales
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_all_rendicion_mensual_gastos"
  ON public.rendicion_mensual_gastos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones_mensuales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendicion_mensual_gastos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones_mensuales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendicion_mensual_gastos TO service_role;
