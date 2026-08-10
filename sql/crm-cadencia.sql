-- CH-10 · Cadencia de contacto (ago 2026)
-- Posponer un contacto sin perderlo: el motor de cadencia (lib/crm-cadencia.ts)
-- calcula el vencimiento desde las interacciones; esto solo guarda el snooze
-- manual, que nunca puede pasar de un tercio del tramo. Idempotente.

ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS snooze_hasta date;
