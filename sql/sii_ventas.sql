-- sii_ventas.sql
-- Habilita el respaldo de FACTURAS EMITIDAS (RCV ventas) en sii_documentos.
-- El check de `fuente` sólo permitía compras/honorarios; agregamos 'rcv_venta'.
-- Correr en el SQL Editor de Supabase.

alter table public.sii_documentos drop constraint if exists sii_documentos_fuente_check;
alter table public.sii_documentos add constraint sii_documentos_fuente_check
  check (fuente in ('rcv_compra', 'bhe_recibida', 'rcv_venta'));
