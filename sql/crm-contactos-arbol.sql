-- CH-10 · Poblar el árbol de contactos y anclarlo a los hilos (12-ago-2026)
--
-- La bitácora por líneas pide `contacto_id` —con quién se está hablando— pero
-- 32 de 62 prospectos no tenían a NADIE en `crm_contactos`. El dato existía:
-- los 32 tienen nombre o correo en la ficha (`prospectos.nombre_contacto` /
-- `email`). Estaba en el lugar equivocado, no perdido. El caso que lo destapó:
-- Aramco, con el correo que probaba el contacto guardado como texto suelto.
--
-- La siembra original (sql/crm-contactos.sql) corrió una vez y no volvió a
-- pasar, así que todo lo creado después quedó fuera. Esto la repite.
--
-- Idempotente.

-- ─── De dónde salió el contacto ──────────────────────────────────────────────
-- Columna propia y no una convención dentro de `notas`: hoy mismo se arregló el
-- desastre de "[La Lectura]" escrito a mano dentro de un campo de texto libre.
-- La procedencia se consulta y se muestra; enterrada en prosa, no.
ALTER TABLE public.crm_contactos
  ADD COLUMN IF NOT EXISTS fuente text;

COMMENT ON COLUMN public.crm_contactos.fuente IS
  'De dónde salió este contacto: el correo, la reunión, el sitio. Sostiene la regla de no inventar datos.';

-- Un mismo correo no puede estar dos veces en la misma marca. Hoy hay 0
-- duplicados, así que el índice entra limpio; de acá en adelante lo impide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contactos_email_unico
  ON public.crm_contactos (prospecto_id, lower(email))
  WHERE email IS NOT NULL;

-- ─── Semilla: la ficha entra al árbol ────────────────────────────────────────
INSERT INTO public.crm_contactos (prospecto_id, nombre, email, telefono, es_decisor, fuente)
SELECT p.id,
       NULLIF(btrim(p.nombre_contacto), ''),
       NULLIF(btrim(p.email), ''),
       NULLIF(btrim(p.telefono), ''),
       false,
       'Ficha del prospecto (migración 12-ago-2026)'
  FROM public.prospectos p
 WHERE (NULLIF(btrim(p.nombre_contacto), '') IS NOT NULL
     OR NULLIF(btrim(p.email), '') IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.crm_contactos c WHERE c.prospecto_id = p.id);

-- ─── Anclar los hilos abiertos a su contacto ─────────────────────────────────
-- SOLO cuando la marca tiene exactamente UNA persona: con dos o más, elegir por
-- el sistema sería adivinar con quién se está hablando, y esa es justo la
-- pregunta que el hilo responde. Los ambiguos quedan sin contacto, a la vista.
UPDATE public.crm_hilos h
   SET contacto_id = (SELECT c.id FROM public.crm_contactos c WHERE c.prospecto_id = h.prospecto_id)
 WHERE h.cerrado_at IS NULL
   AND h.contacto_id IS NULL
   AND (SELECT count(*) FROM public.crm_contactos c WHERE c.prospecto_id = h.prospecto_id) = 1;

-- ─── Comprobación ────────────────────────────────────────────────────────────
--   SELECT count(*) FROM public.prospectos p
--    WHERE NOT EXISTS (SELECT 1 FROM public.crm_contactos c WHERE c.prospecto_id = p.id);
--   SELECT count(*) FROM public.crm_hilos WHERE cerrado_at IS NULL AND contacto_id IS NULL;
--
-- NOTA: la semilla copia el dato tal como está en la ficha, errores incluidos
-- (hay al menos un correo con "gmail.con"). Se corrigen con
-- hilvan_contacto_editar o desde la ficha; inventar la corrección acá sería
-- peor que arrastrar el error a la vista.
