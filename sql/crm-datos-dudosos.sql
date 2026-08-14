-- CH-10 · Etiqueta de datos por verificar (13-ago-2026)
--
-- SOLO ESQUEMA. Ninguna fila se toca acá.
--
-- La versión anterior de este archivo además reclasificaba prospectos y marcaba
-- empresas por nombre con ILIKE, escribiendo explicaciones inventadas dentro de
-- los datos. Eso no es una migración: es adivinar en masa y dejar el resultado
-- indistinguible de un dato verificado. La reclasificación la hace el agente,
-- prospecto por prospecto y con fuente.
--
-- ─── Qué es esta etiqueta ────────────────────────────────────────────────────
-- La FICHA no es de fiar: el contacto es de otra empresa, el nombre se capturó
-- de un menú del sitio, el dato vino de una corrida que trajo basura.
--
-- Distinto de "En frío", y la diferencia manda el diseño porque el riesgo es
-- opuesto: un prospecto frío no empeora si lo dejas quieto; uno con la ficha
-- equivocada empeora cada vez que lo trabajas. Por eso sale de la agenda y del
-- digest hasta resolverse — pero se devuelve aparte en `por_verificar`, no
-- escondido: resolverlo es trabajo y sin verlo nadie lo hace.
--
-- Ortogonal a la etapa a propósito: no es una fase del embudo —meterlo ahí
-- ensuciaría las métricas de conversión— sino una marca sobre la confianza en
-- los datos, que puede ocurrir en cualquier etapa.
--
-- Idempotente.

ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS datos_dudosos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duda          text;

COMMENT ON COLUMN public.prospectos.datos_dudosos IS
  'La ficha tiene datos que no son de fiar. Sale de la agenda hasta resolverse.';
COMMENT ON COLUMN public.prospectos.duda IS
  'Qué es lo que está mal. Sin esto la marca es un semáforo sin instrucción.';

CREATE INDEX IF NOT EXISTS idx_prospectos_datos_dudosos
  ON public.prospectos (datos_dudosos) WHERE datos_dudosos;

-- ─── Lo que NO va acá ────────────────────────────────────────────────────────
-- Lo hace el agente con herramientas, dejando rastro en la auditoría:
--
--   · Clasificar rubro y tipo de cliente de los 62 sin clasificar
--     → hilvan_clasificar_prospecto, con fuente para cada uno.
--   · Marcar las fichas con contactos erróneos de la corrida del 7-ago
--     → hilvan_datos_dudosos, diciendo qué está mal en cada caso.
--   · Devolver a `origen = 'lectura'` los que tienen dossier archivado
--     → hilvan_editar_prospecto.
--
-- ─── Comprobación ────────────────────────────────────────────────────────────
--   SELECT empresa, duda FROM public.prospectos WHERE datos_dudosos;
