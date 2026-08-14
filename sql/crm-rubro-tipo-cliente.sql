-- CH-10 · Reemplazar `segmento` por rubro + tipo de cliente (13-ago-2026)
--
-- El eje `segmento` tenía dos problemas y el segundo se veía menos:
--
--  1. Clasificaba al trabajo por el género de quien aparece o compra:
--     'ropa_intima_fem', 'masculino_estereotipo'. "Deportes/herramientas" son
--     dos rubros, no un género. Describir así al equipo y a los clientes no
--     corresponde.
--
--  2. No repartía. De 66 prospectos, 45 quedaron en 'general', 16 sin
--     clasificar, 4 en 'masculino_estereotipo', 1 en 'estudiante' y CERO en
--     'ropa_intima_fem'. Un eje donde dos tercios caen en el cajón "otros" no
--     está tomando ninguna decisión: el reparto se resolvía igual por producto
--     y tamaño.
--
-- Ahora son dos preguntas distintas, que es lo que siempre fueron:
--   · rubro        — de qué es la marca (moda, deporte, herramientas…)
--   · tipo_cliente — con quién se trabaja (marca directa, agencia, estudiante…)
--
-- El reparto NO cambia: los cuatro valores viejos mapean uno a uno a los ejes
-- nuevos, así que a cada persona le sigue tocando lo mismo. Cambia cómo se
-- nombra, no quién trabaja qué.
--
-- Idempotente.

ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS rubro        text,
  ADD COLUMN IF NOT EXISTS tipo_cliente text;

COMMENT ON COLUMN public.prospectos.rubro IS
  'De qué es la marca: moda, moda_intima, belleza, deporte, herramientas, consumo, retail, servicios, educacion, inmobiliaria, turismo, entretenimiento, rental, otro.';
COMMENT ON COLUMN public.prospectos.tipo_cliente IS
  'Con quién se trabaja: marca, agencia, institucion, emprendedor, estudiante, productora.';

-- ─── Migración de los valores viejos ─────────────────────────────────────────
-- Sólo se traduce lo que tiene una equivalencia CIERTA. 'general' no se traduce:
-- no significaba nada, y convertirlo en un rubro inventado propagaría el mismo
-- vacío con un nombre nuevo. Esos quedan por clasificar, que es lo que son.

UPDATE public.prospectos SET rubro = 'rental'
 WHERE segmento = 'rental' AND rubro IS NULL;

UPDATE public.prospectos SET rubro = 'moda_intima'
 WHERE segmento = 'ropa_intima_fem' AND rubro IS NULL;

-- 'masculino_estereotipo' cubría deporte Y herramientas sin distinguirlos. Se
-- deja el más probable según el portafolio (Stanley, Black&Decker) pero queda
-- anotado: hay que revisar esos 4 a mano.
UPDATE public.prospectos SET rubro = 'herramientas'
 WHERE segmento = 'masculino_estereotipo' AND rubro IS NULL;

UPDATE public.prospectos SET tipo_cliente = 'estudiante'
 WHERE segmento = 'estudiante' AND tipo_cliente IS NULL;

-- `segmento` se deja como estaba: es el registro de lo que se clasificó antes y
-- no cuesta nada conservarlo. El código deja de leerlo.

-- ─── Comprobación ────────────────────────────────────────────────────────────
--   SELECT rubro, count(*) FROM public.prospectos GROUP BY 1 ORDER BY 2 DESC;
--   SELECT tipo_cliente, count(*) FROM public.prospectos GROUP BY 1 ORDER BY 2 DESC;
--
-- Los 4 que venían de 'masculino_estereotipo', para revisar si son deporte:
--   SELECT empresa, rubro FROM public.prospectos
--    WHERE segmento = 'masculino_estereotipo';
