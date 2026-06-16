-- Columnas de identificación de equipo (marca, modelo, número de serie)
ALTER TABLE equipos
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS numero_serie text;
