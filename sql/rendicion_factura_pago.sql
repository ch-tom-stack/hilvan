-- Agregar campos de factura emitida y pago recibido a rendiciones

ALTER TABLE public.rendiciones
  ADD COLUMN IF NOT EXISTS factura_emitida boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS factura_archivos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pago_recibido boolean NOT NULL DEFAULT false;
