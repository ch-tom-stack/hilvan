-- Bloque "libre" del plan de rodaje: devuelve la expresión que el equipo tenía en el Google Sheet
-- (pegar PNGs/chistes, texto con formato, colores y fuentes con personalidad).
--
-- TipoBloque NO tiene check constraint en la DB, así que el nuevo tipo 'libre' no requiere migración.
-- Solo se agregan dos columnas para el lienzo y su estilo.

ALTER TABLE rodaje_bloques
  ADD COLUMN IF NOT EXISTS contenido_rico text,           -- texto/HTML libre del bloque
  ADD COLUMN IF NOT EXISTS estilo jsonb;                  -- BloqueEstilo: { fuente, color, color_fondo, tamano, peso, align }

-- Notas:
-- * imagen_url (ya existente) se reutiliza para la imagen pegada/subida del bloque libre.
-- * rodaje_bloques tiene REPLICA IDENTITY FULL → los cambios viajan por Realtime al viewer sin tocar políticas.
