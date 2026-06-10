-- ─────────────────────────────────────────────────────────────────────────────
-- T05 — Defensa en BD contra doble creación de proyecto desde una cotización
-- ─────────────────────────────────────────────────────────────────────────────
-- La protección principal es a nivel de app:
--   1. responderCotizacion() hace la transición de estado idempotente
--      (.eq('estado','enviada') + .select()) — solo crea proyecto si hubo transición.
--   2. autoCrearProyectoDesdeAprobacion() verifica cotizaciones.proyecto_id antes de crear.
--
-- Este índice es una red de seguridad adicional: garantiza que dos cotizaciones
-- distintas no puedan apuntar al mismo proyecto auto-creado. NULLs no chocan,
-- así que las cotizaciones sin proyecto no se ven afectadas.
--
-- NO aplicar a producción desde el repo: ejecutar manualmente en Supabase tras
-- confirmar que no existan duplicados previos:
--   SELECT proyecto_id, count(*) FROM public.cotizaciones
--   WHERE proyecto_id IS NOT NULL GROUP BY proyecto_id HAVING count(*) > 1;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS cotizaciones_proyecto_id_unico
  ON public.cotizaciones (proyecto_id)
  WHERE proyecto_id IS NOT NULL;
