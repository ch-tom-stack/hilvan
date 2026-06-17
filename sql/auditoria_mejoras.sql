-- =============================================================================
-- MEJORAS DE AUDITORÍA / COMPLIANCE — campos para resolver falsos positivos.
-- El dueño corre este SQL en Supabase ANTES de desplegar el código que lo usa.
-- Idempotente (ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- #1 — sin_documento_aceptado: el gasto no tiene respaldo Y se decidió aceptarlo
--      así a propósito (reembolso informal). La auditoría lo baja de alta a info.
ALTER TABLE rendicion_gastos          ADD COLUMN IF NOT EXISTS sin_documento_aceptado boolean NOT NULL DEFAULT false;
ALTER TABLE rendicion_mensual_gastos  ADD COLUMN IF NOT EXISTS sin_documento_aceptado boolean NOT NULL DEFAULT false;

-- #2 — folio_compartido: este gasto es PARTE de una factura que cubre varios
--      gastos/cotizaciones (mismo RUT+folio a propósito). La auditoría NO lo
--      marca como duplicado cuando todo el grupo está marcado así.
ALTER TABLE rendicion_gastos          ADD COLUMN IF NOT EXISTS folio_compartido boolean NOT NULL DEFAULT false;
ALTER TABLE rendicion_mensual_gastos  ADD COLUMN IF NOT EXISTS folio_compartido boolean NOT NULL DEFAULT false;

-- #4 — referencia_externa: número de invoice propio de un proveedor extranjero
--      (Anthropic, Spotify, etc.) que no emite documento tributario chileno con
--      folio. Una vez registrado, la auditoría no lo marca como folio faltante.
ALTER TABLE rendicion_gastos          ADD COLUMN IF NOT EXISTS referencia_externa text;
ALTER TABLE rendicion_mensual_gastos  ADD COLUMN IF NOT EXISTS referencia_externa text;
