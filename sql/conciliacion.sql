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

DROP POLICY IF EXISTS "admin_all_movimientos_bancarios" ON movimientos_bancarios;
CREATE POLICY "admin_all_movimientos_bancarios"
  ON movimientos_bancarios FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_bancarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_bancarios TO service_role;

-- -----------------------------------------------------------------------------
-- Conciliación N:M — libro de asignaciones (ledger)
-- Un movimiento puede repartirse entre varias obligaciones (transferencia
-- combinada) y una obligación puede recibir varios movimientos (pago parcial).
-- Cada fila es UNA asignación: "tanto de este movimiento paga esta obligación".
-- Reemplaza el par 1:1 movimientos_bancarios.conciliado_tabla/_id (que se
-- mantiene solo como referencia del caso simple / display).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conciliaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id uuid NOT NULL REFERENCES movimientos_bancarios(id) ON DELETE CASCADE,
  match_tabla text NOT NULL CHECK (match_tabla IN (
    'rendicion_gastos','rendicion_mensual_gastos','gastos_fijos_cuotas','cotizaciones'
  )),
  match_id uuid NOT NULL,
  monto integer NOT NULL CHECK (monto > 0),
  fecha_pago date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_concil_mov ON conciliaciones(movimiento_id);
CREATE INDEX IF NOT EXISTS idx_concil_match ON conciliaciones(match_tabla, match_id);
CREATE INDEX IF NOT EXISTS idx_concil_fecha ON conciliaciones(fecha_pago);

ALTER TABLE conciliaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_conciliaciones" ON conciliaciones;
CREATE POLICY "admin_all_conciliaciones"
  ON conciliaciones FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliaciones TO service_role;

-- -----------------------------------------------------------------------------
-- Backfill: las conciliaciones 1:1 que ya existen (Bloque A/B/C) se migran al
-- ledger para que el cálculo de "pagado" basado en asignaciones no las pierda.
-- Solo migra movimientos ligados a una obligación real (no flujo_caja_manual) y
-- que aún no tengan fila en el ledger. Idempotente (NOT EXISTS).
-- -----------------------------------------------------------------------------
INSERT INTO conciliaciones (movimiento_id, match_tabla, match_id, monto, fecha_pago)
SELECT m.id, m.conciliado_tabla, m.conciliado_id, m.monto, m.fecha
FROM movimientos_bancarios m
WHERE m.conciliado = true
  AND m.conciliado_tabla IN (
    'rendicion_gastos','rendicion_mensual_gastos','gastos_fijos_cuotas','cotizaciones'
  )
  AND m.conciliado_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.movimiento_id = m.id);
