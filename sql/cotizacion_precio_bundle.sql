-- Precio nativo de bundle a nivel de categoría/subcategoría.
-- Si precio_manual está seteado (no null), el total de esa categoría/subcategoría
-- es ese valor (ignora la suma de ítems) y los ítems se muestran solo como descripción.
-- Permite precificar el bundle, no equipo por equipo (modelo real de Casa Hiedra).

ALTER TABLE cotizacion_departamentos
  ADD COLUMN IF NOT EXISTS precio_manual numeric;

ALTER TABLE cotizacion_subgrupos
  ADD COLUMN IF NOT EXISTS precio_manual numeric;

-- El cálculo (lib/cotizaciones-calc.ts) y el render (PDF + vista cliente) ya lo respetan:
-- backward-compatible — si la columna no existiera, el campo llega undefined y se cae a la suma.
