-- CH-10 · Quitar el rótulo "La Lectura" a lo que no lo es (13-ago-2026)
--
-- Mientras el sitio mandaba el resumen del formulario dentro del campo
-- `lectura`, Hilván lo guardaba como nota BLOQUEADA titulada "La Lectura".
-- Resultado: fichas con un registro congelado que afirma contener una
-- investigación y contiene tres líneas de formulario. Caso testigo: Soracci.cl,
-- 96 caracteres —"Plazo: Explorando opciones"— con candado.
--
-- Ambos lados ya están corregidos. Esto arregla lo que alcanzó a entrar.
--
-- El criterio es el dossier: si el prospecto no tiene uno archivado, no hubo
-- Lectura, así que la nota no puede llamarse así. Regla del emisor: una Lectura
-- fallida no produce lead, de modo que la ausencia de dossier significa "esto
-- no fue una Lectura", nunca "la Lectura falló".
--
-- Idempotente.

UPDATE public.crm_notas n
   SET tipo      = 'nota',
       titulo    = 'Lo que dijo en el formulario',
       -- Se desbloquea a propósito: no es un documento recibido sino algo que
       -- el lead escribió, y va a haber que corregirlo o completarlo.
       bloqueada = false
 WHERE n.tipo = 'lectura'
   AND NOT EXISTS (
     SELECT 1 FROM public.crm_lecturas l
      WHERE l.prospecto_id = n.prospecto_id AND l.dossier IS NOT NULL
   )
   -- Sólo las que entraron por el webhook con el formulario adentro. Las 15
   -- migradas de `prospectos.notas` sí son Lecturas de verdad en texto plano y
   -- NO se tocan: su marca es que no llevan la huella del formulario.
   AND n.cuerpo ILIKE '%Interesado vía landing de producto%';

-- El prefijo de la nota de procedencia también quedó mintiendo en los leads de
-- landing: decía "[La Lectura]" porque `origen` se asumía.
UPDATE public.crm_notas n
   SET cuerpo = replace(n.cuerpo, '[La Lectura] Lead entrante', '[Sitio] Lead entrante')
  FROM public.prospectos p
 WHERE p.id = n.prospecto_id
   AND n.cuerpo LIKE '[La Lectura] Lead entrante%'
   AND p.origen <> 'lectura';

-- ─── Comprobación ────────────────────────────────────────────────────────────
-- Ninguna nota tipo 'lectura' sin dossier y con huella de formulario:
--   SELECT count(*) FROM public.crm_notas n
--    WHERE n.tipo = 'lectura'
--      AND n.cuerpo ILIKE '%Interesado vía landing de producto%';
--
-- Las notas tipo 'lectura' que quedan, y si su prospecto tiene dossier:
--   SELECT p.empresa, n.titulo, n.bloqueada,
--          EXISTS (SELECT 1 FROM public.crm_lecturas l
--                   WHERE l.prospecto_id = p.id AND l.dossier IS NOT NULL) AS con_dossier
--     FROM public.crm_notas n JOIN public.prospectos p ON p.id = n.prospecto_id
--    WHERE n.tipo = 'lectura';
