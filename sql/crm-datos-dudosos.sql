-- CH-10 · Etiqueta de datos por verificar + dos correcciones (13-ago-2026)
--
-- Contiene tres cosas que se corren juntas porque se pisan entre sí.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CORRECCIÓN: `general` sí tenía significado
--
-- La migración anterior no tradujo `segmento = 'general'` con el argumento de
-- que "no significaba nada". Estaba mal: significaba "ninguna especialidad
-- aplica", pasaba el filtro de las reglas y dejaba que producto y tamaño
-- decidieran el responsable. Su equivalente exacto en la lista nueva es `otro`.
--
-- Sin esto, 45 prospectos que antes se repartían solos quedaron sin repartir —
-- lo contrario de lo prometido ("el reparto no cambia").
UPDATE public.prospectos
   SET rubro = 'otro'
 WHERE segmento = 'general' AND rubro IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) CORRECCIÓN: los que tienen dossier vinieron de La Lectura
--
-- El 12-ago el operador hizo una barrida de orígenes y cambió cuatro prospectos
-- de 'lectura' a 'correo'. Hizo lo razonable —en ese momento TODO el sitio
-- llegaba etiquetado 'lectura' por el bug del emisor— pero se pasó con los que
-- sí venían de ahí.
--
-- El dossier es la prueba: el sitio sólo lo produce cuando alguien entrega una
-- URL para analizar, o sea cuando llenó el formulario de La Lectura. Son
-- entrantes, y un entrante no debe recibir el toque 1 de valor en frío.
UPDATE public.prospectos p
   SET origen = 'lectura'
 WHERE p.origen = 'correo'
   AND EXISTS (
     SELECT 1 FROM public.crm_lecturas l
      WHERE l.prospecto_id = p.id AND l.dossier IS NOT NULL
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) NUEVO: etiqueta de datos por verificar
--
-- Distinto de "En frío", y la diferencia importa porque el riesgo es opuesto:
-- un prospecto frío no empeora si lo dejas quieto; uno con la ficha equivocada
-- empeora cada vez que lo trabajas. Escribirle a la persona equivocada de la
-- empresa equivocada es peor que no escribirle.
--
-- Es ortogonal a la etapa a propósito: no es una fase del embudo —meterlo ahí
-- ensuciaría las métricas de conversión— sino una marca sobre la confianza en
-- los datos, que puede ocurrir en cualquier etapa.
ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS datos_dudosos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duda          text;

COMMENT ON COLUMN public.prospectos.datos_dudosos IS
  'La ficha tiene datos que no son de fiar (contacto de otra empresa, nombre mal capturado). Sale de la agenda hasta resolverse.';
COMMENT ON COLUMN public.prospectos.duda IS
  'Qué es lo que está mal. Sin esto la marca es un semáforo sin instrucción.';

CREATE INDEX IF NOT EXISTS idx_prospectos_datos_dudosos
  ON public.prospectos (datos_dudosos) WHERE datos_dudosos;

-- ─── Marcar los conocidos ────────────────────────────────────────────────────
-- Salieron de la corrida del agente del 7-ago-2026 (31 propuestas en dos
-- minutos), que trajo contactos que no corresponden a la empresa.

UPDATE public.prospectos
   SET datos_dudosos = true,
       duda = 'El contacto es de otra empresa: Esteban Pozo tiene correo @exmax.cl, no de Aramco. Vino de la corrida del agente del 7-ago-2026. Verificar de qué empresa es realmente antes de escribirle.'
 WHERE empresa ILIKE 'Aramco%' AND NOT datos_dudosos;

UPDATE public.prospectos
   SET datos_dudosos = true,
       duda = 'Contacto traído por la corrida del agente del 7-ago-2026, sin confirmar que corresponda a la empresa. Verificar antes de escribir.'
 WHERE empresa ILIKE 'OH!Creativo%' AND NOT datos_dudosos;

-- Este además tiene el NOMBRE mal capturado: "Quiénes Somos" es un ítem de menú
-- del sitio, no una marca. Se marca por lo mismo.
UPDATE public.prospectos
   SET datos_dudosos = true,
       duda = 'El nombre de empresa se capturó del menú del sitio ("Quiénes Somos"), no es la marca. Corregir nombre y verificar el contacto. Corrida del agente del 7-ago-2026.'
 WHERE empresa ILIKE 'Qui%nes Somos%' AND NOT datos_dudosos;

-- ─── Comprobación ────────────────────────────────────────────────────────────
--   SELECT rubro, count(*) FROM public.prospectos GROUP BY 1 ORDER BY 2 DESC;
--   SELECT empresa, origen FROM public.prospectos
--    WHERE EXISTS (SELECT 1 FROM public.crm_lecturas l
--                   WHERE l.prospecto_id = prospectos.id AND l.dossier IS NOT NULL);
--   SELECT empresa, duda FROM public.prospectos WHERE datos_dudosos;
