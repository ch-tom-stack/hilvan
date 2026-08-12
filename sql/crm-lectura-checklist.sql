-- CH-10 · Marcar el hito 'lectura' donde la lectura ya existe (ago 2026)
--
-- Los leads que llegan de La Lectura se aprueban en la Bandeja: ahí se crea el
-- prospecto y se archiva el dossier en crm_lecturas. Esa vía —la única de las
-- tres que registran lectura— no marcaba el hito en el checklist, así que la
-- ficha mostraba el dossier completo con el hito en blanco.
--
-- El código ya quedó corregido (lib/crm-aprobaciones.ts). Esto arregla las que
-- entraron antes: 3 de las 4 lecturas archivadas.
--
-- Idempotente: sólo agrega el hito a quien tiene lectura y no lo tiene marcado.

UPDATE public.prospectos p
   SET checklist = COALESCE(p.checklist, '{}') || ARRAY['lectura']
 WHERE EXISTS (SELECT 1 FROM public.crm_lecturas l WHERE l.prospecto_id = p.id)
   AND NOT (COALESCE(p.checklist, '{}') @> ARRAY['lectura']);

-- Comprobación: tiene que devolver 0.
--   SELECT count(*)
--     FROM public.prospectos p
--    WHERE EXISTS (SELECT 1 FROM public.crm_lecturas l WHERE l.prospecto_id = p.id)
--      AND NOT (COALESCE(p.checklist, '{}') @> ARRAY['lectura']);
