-- Bloque "libre" del plan de rodaje: devuelve la expresión que el equipo tenía en el Google Sheet
-- (pegar PNGs/chistes, texto con formato, colores y fuentes con personalidad).

-- 1) Columnas del lienzo y su estilo.
ALTER TABLE rodaje_bloques
  ADD COLUMN IF NOT EXISTS contenido_rico text,           -- texto/HTML libre del bloque
  ADD COLUMN IF NOT EXISTS estilo jsonb;                  -- BloqueEstilo: { fuente, color, color_fondo, tamano, peso, align }

-- 2) IMPORTANTE: rodaje_bloques.tipo SÍ tiene un CHECK constraint en prod
--    (rodaje_bloques_tipo_check) que NO incluía 'libre' → el insert de un bloque
--    libre fallaba (código 23514) y el optimismo del editor lo revertía en silencio.
--    Hay que recrear el constraint incluyendo 'libre'.
ALTER TABLE rodaje_bloques DROP CONSTRAINT IF EXISTS rodaje_bloques_tipo_check;
ALTER TABLE rodaje_bloques
  ADD CONSTRAINT rodaje_bloques_tipo_check
  CHECK (tipo IN ('rodaje', 'pausa', 'traslado', 'montaje', 'otro', 'libre'));

-- Notas:
-- * imagen_url (ya existente) se reutiliza para la imagen pegada/subida del bloque libre.
-- * rodaje_bloques tiene REPLICA IDENTITY FULL → los cambios viajan por Realtime al viewer sin tocar políticas.
