-- Cliente y agencia en el encabezado de la cotización (sep-2026).
--
-- `cliente_id` / `cliente_nombre_libre` pasan a ser el CLIENTE FINAL (la marca)
-- y `agencia_id` / `agencia_nombre_libre` la contraparte intermedia, opcional.
-- El texto `cliente_final` queda como campo heredado: el código lo sigue
-- leyendo (modelo viejo) hasta que se migre.

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS agencia_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agencia_nombre_libre text;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_agencia ON public.cotizaciones (agencia_id);

-- ── Bug de datos: ítems sin boleta con tasa de retención ─────────────────────
-- 57 ítems al 24-sep-2026 (ej. "Adaptaciones 4:5" en CH-2026-110, tasa 0.153).
UPDATE public.cotizacion_items SET tasa_boleta = 0 WHERE con_boleta = false AND tasa_boleta <> 0;

-- ── Migración opcional del modelo viejo (correr cuando Tomás lo confirme) ────
-- Filas con `cliente_final` distinto del cliente: la agencia estaba en cliente_*
-- y la marca en cliente_final. Se mueven a su lugar y cliente_final se vacía.
-- UPDATE public.cotizaciones c
-- SET agencia_id = c.cliente_id,
--     agencia_nombre_libre = COALESCE(c.cliente_nombre_libre, (SELECT nombre FROM public.clientes WHERE id = c.cliente_id)),
--     cliente_id = NULL,
--     cliente_nombre_libre = c.cliente_final,
--     cliente_final = NULL
-- WHERE c.cliente_final IS NOT NULL AND btrim(c.cliente_final) <> ''
--   AND c.agencia_id IS NULL AND c.agencia_nombre_libre IS NULL
--   AND lower(btrim(c.cliente_final)) <> lower(btrim(COALESCE(c.cliente_nombre_libre, (SELECT nombre FROM public.clientes WHERE id = c.cliente_id), '')));
