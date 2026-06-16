-- Campo subcategoria en equipos
ALTER TABLE equipos
  ADD COLUMN IF NOT EXISTS subcategoria text;

-- Nueva categoría: Fondos fotográficos
-- Ajusta el valor de `orden` según donde quieras que aparezca en el listado
INSERT INTO categorias_equipo (codigo, nombre, orden, activa)
VALUES ('FON', 'Fondos', 9, true)
ON CONFLICT (codigo) DO NOTHING;
