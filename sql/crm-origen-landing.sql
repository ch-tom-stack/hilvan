-- CH-10 · Corregir el origen de los leads de landing (13-ago-2026)
--
-- El sitio no mandaba `origen` —el campo no existía en su emisor— y Hilván lo
-- asumía 'lectura' por el nombre del endpoint (/api/lectura-lead). Resultado:
-- todo lead del sitio quedó etiquetado como si hubiera pasado por La Lectura,
-- vinieran de un landing de producto o de una investigación real.
--
-- Ambos lados ya están corregidos: el sitio manda `origen` explícito
-- (landing | brief | lectura) y Hilván dejó de asumir. Esto arregla lo viejo.
--
-- El criterio NO es el campo `origen` —que es justamente el que miente— sino
-- dos hechos:
--   · tener dossier archivado  → hubo Lectura de verdad
--   · el texto del formulario  → vino de un landing
-- Regla del emisor: una Lectura fallida no genera lead, así que la ausencia de
-- dossier significa "esto no fue una Lectura", no "la Lectura falló".
--
-- Idempotente.

UPDATE public.prospectos p
   SET origen = 'landing'
 WHERE p.origen = 'lectura'
   -- Sin dossier archivado: no hubo Lectura.
   AND NOT EXISTS (
     SELECT 1 FROM public.crm_lecturas l
      WHERE l.prospecto_id = p.id AND l.dossier IS NOT NULL
   )
   -- Y con la huella del formulario de landing en alguna de sus notas.
   AND EXISTS (
     SELECT 1 FROM public.crm_notas n
      WHERE n.prospecto_id = p.id
        AND n.cuerpo ILIKE '%Interesado vía landing de producto%'
   );

-- ─── Comprobación ────────────────────────────────────────────────────────────
-- Antes: 17 con origen='lectura' (16 landing + 1 Lectura real).
-- Después debería quedar sólo el que tiene dossier:
--   SELECT p.origen, count(*) FROM public.prospectos p
--    WHERE p.origen IN ('lectura','landing') GROUP BY 1;
--
-- Y que ninguno con origen='lectura' haya quedado sin dossier:
--   SELECT p.empresa FROM public.prospectos p
--    WHERE p.origen = 'lectura'
--      AND NOT EXISTS (SELECT 1 FROM public.crm_lecturas l
--                       WHERE l.prospecto_id = p.id AND l.dossier IS NOT NULL);
--
-- NOTA: `origen` decide la temperatura del prospecto (frío vs entrante) y con
-- eso la secuencia de correos. Un lead de landing levantó la mano y no debe
-- recibir el toque 1 de valor en frío — por eso esta corrección cambia qué se
-- le escribe, no sólo una etiqueta.
