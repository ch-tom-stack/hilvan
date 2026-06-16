-- Columnas para el módulo Rental (CH-9)
-- Agregar a la tabla equipos si no existen

ALTER TABLE equipos
  ADD COLUMN IF NOT EXISTS rentable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS precio_jornada integer;

-- GRANTs (por si acaso)
GRANT SELECT (rentable, precio_jornada) ON equipos TO anon;
GRANT UPDATE (rentable, precio_jornada) ON equipos TO authenticated;
