-- =============================================================================
-- CONCILIACIÓN BANCARIA — Schema
-- El dueño corre este SQL en Supabase ANTES de desplegar el código que lo escribe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Estado de pago a nivel gasto
-- -----------------------------------------------------------------------------
ALTER TABLE rendicion_gastos ADD COLUMN IF NOT EXISTS pagado boolean NOT NULL DEFAULT false;
ALTER TABLE rendicion_gastos ADD COLUMN IF NOT EXISTS fecha_pago date;
ALTER TABLE rendicion_mensual_gastos ADD COLUMN IF NOT EXISTS pagado boolean NOT NULL DEFAULT false;
ALTER TABLE rendicion_mensual_gastos ADD COLUMN IF NOT EXISTS fecha_pago date;

-- -----------------------------------------------------------------------------
-- Movimientos bancarios / tarjeta (extractos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  descripcion text,
  monto integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('cargo','abono')),
  fuente text,
  referencia text,
  conciliado boolean NOT NULL DEFAULT false,
  conciliado_tabla text,
  conciliado_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movbanc_fecha ON movimientos_bancarios(fecha);
CREATE INDEX IF NOT EXISTS idx_movbanc_conciliado ON movimientos_bancarios(conciliado);

-- -----------------------------------------------------------------------------
-- Grants (la API usa service role; se documentan igual que el resto de tablas)
-- -----------------------------------------------------------------------------
ALTER TABLE movimientos_bancarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_movimientos_bancarios"
  ON movimientos_bancarios FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_bancarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_bancarios TO service_role;
