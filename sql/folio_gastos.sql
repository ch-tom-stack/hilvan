-- Folio del documento (boleta/factura SII) en los gastos.
-- Permite deduplicar por RUT + folio al cargar el RCV en bloque.
-- El dueño corre este SQL en Supabase ANTES de desplegar el código que lo escribe.

ALTER TABLE rendicion_gastos ADD COLUMN IF NOT EXISTS folio text;
ALTER TABLE rendicion_mensual_gastos ADD COLUMN IF NOT EXISTS folio text;
