-- documento_recibido.sql
-- Aspecto "documento" de una rendición, INDEPENDIENTE del pago y del tipo:
-- ¿el proveedor ya emitió su boleta/factura y la tenemos?
--   true  = sí la tenemos (default: la mayoría de los gastos se cargan CON su
--           documento, incluidos los del RCV/BHE del SII).
--   false = "cargado/pagado pero documento PENDIENTE" (ej. le pagaste a alguien
--           y aún no emite la boleta de honorarios).
-- Distinto de tipo_documento='sin_documento' (que es "no habrá documento,
-- aceptado") y de sin_documento_aceptado.
--
-- Correr en el SQL Editor de Supabase (proyecto hilvan). Idempotente.

alter table public.rendicion_gastos
  add column if not exists documento_recibido boolean not null default true;

alter table public.rendicion_mensual_gastos
  add column if not exists documento_recibido boolean not null default true;
