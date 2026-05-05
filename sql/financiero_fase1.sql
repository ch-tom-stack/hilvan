-- =============================================================================
-- FINANCIERO — FASE 1: Schema y base de datos
-- Correr en Supabase SQL Editor (una sola vez)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.1 Campos nuevos en rendicion_gastos
-- -----------------------------------------------------------------------------
ALTER TABLE public.rendicion_gastos
  ADD COLUMN IF NOT EXISTS rut_emisor           text,
  ADD COLUMN IF NOT EXISTS razon_social_emisor  text,
  ADD COLUMN IF NOT EXISTS factura_casa_hiedra  boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- 1.2 Campos nuevos en rendicion_mensual_gastos
-- -----------------------------------------------------------------------------
ALTER TABLE public.rendicion_mensual_gastos
  ADD COLUMN IF NOT EXISTS rut_emisor           text,
  ADD COLUMN IF NOT EXISTS razon_social_emisor  text,
  ADD COLUMN IF NOT EXISTS factura_casa_hiedra  boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- 1.3 Campos nuevos en cotizaciones
-- -----------------------------------------------------------------------------
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS fecha_factura_emitida  date,
  ADD COLUMN IF NOT EXISTS fecha_pago_recibido    date,
  ADD COLUMN IF NOT EXISTS numero_factura         text;

-- -----------------------------------------------------------------------------
-- 1.4 Tabla gastos_fijos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gastos_fijos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text        NOT NULL,
  descripcion     text,
  tipo            text        NOT NULL CHECK (tipo IN ('credito_bancario', 'prestamo_socio', 'otro')),
  acreedor        text,
  monto_total     integer     NOT NULL,
  monto_cuota     integer     NOT NULL,
  n_cuotas        integer     NOT NULL,
  dia_vencimiento integer     NOT NULL CHECK (dia_vencimiento BETWEEN 1 AND 28),
  fecha_inicio    date        NOT NULL,
  tasa_interes    numeric(5,2),
  activo          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gastos_fijos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_gastos_fijos"
  ON public.gastos_fijos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 1.5 Tabla gastos_fijos_cuotas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gastos_fijos_cuotas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gasto_fijo_id     uuid        NOT NULL REFERENCES public.gastos_fijos(id) ON DELETE CASCADE,
  numero_cuota      integer     NOT NULL,
  fecha_vencimiento date        NOT NULL,
  monto             integer     NOT NULL,
  pagada            boolean     NOT NULL DEFAULT false,
  fecha_pago        date,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gastos_fijos_cuotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_gastos_fijos_cuotas"
  ON public.gastos_fijos_cuotas FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 1.6 Tabla flujo_caja_manual
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.flujo_caja_manual (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion text        NOT NULL,
  monto       integer     NOT NULL,
  fecha       date        NOT NULL,
  tipo        text        NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users(id)
);

ALTER TABLE public.flujo_caja_manual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_flujo_caja_manual"
  ON public.flujo_caja_manual FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 1.7 Grants para tablas nuevas
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_fijos         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_fijos_cuotas  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flujo_caja_manual    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_fijos         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_fijos_cuotas  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flujo_caja_manual    TO service_role;
