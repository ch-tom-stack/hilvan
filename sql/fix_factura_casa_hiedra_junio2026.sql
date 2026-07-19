-- Corrige las 22 facturas de RCV compras de junio 2026 que se cargaron con
-- factura_casa_hiedra=false por defecto (antes del fix en lib/agent-sii.ts que
-- ahora marca true por defecto en facturas/exentas de RCV compras — ver
-- resumen_contador / IVA crédito). Todas están en rendicion_mensual_gastos.
-- Verificado por rut_emisor+folio contra sii_documentos (fuente='rcv_compra')
-- antes de generar esta lista — no se inventaron RUTs.

update public.rendicion_mensual_gastos
set factura_casa_hiedra = true
where id in (
  'e61d4097-03bd-46c9-a47c-58ab1ec94af8', -- Alimentos Fruna, folio 12385881
  '34132602-bfde-4095-86d1-710842952573', -- Electrónica Retail, folio 1241960
  '4cef3852-2cb3-4347-9334-98fa8406adc5', -- Forestal Río Claro, folio 177112
  'd3cc05c1-8394-4ee2-9fbf-d955eb652d44', -- Comercializadora Berrios, folio 24869
  '3da68d0c-4985-4f8c-89f3-bf6ba7a2c671', -- BCI Seguros Generales, folio 16545711
  '030af45a-6f08-4618-8648-c4c9c91c8718', -- Comercial y Servicios Pimenisa, folio 39667
  '42c58f3a-8caf-482b-a479-8a3a707eefdf', -- Forestal Río Claro, folio 177152
  'e0925852-8d86-4606-b0da-4ee2365e9eea', -- Patio Constructor, folio 9608
  '8686c472-418e-47a4-be89-22e0aa60825e', -- Patio Constructor, folio 9627
  '497c91e5-ce7e-4458-8202-fa8104253949', -- Patio Constructor, folio 9644
  'c596217a-6835-487d-897c-fc53f28ea39d', -- Comercializadora Berrios, folio 24934
  '5659670e-f133-4880-87c9-05d66c0fb731', -- Patio Constructor, folio 9678
  '6632db63-e214-41a3-a8c9-5357c3c9feee', -- Soc Concesionaria Autopista Central, folio 13350166
  '913896a5-d0a8-4d88-975c-bd9f9e2ff23c', -- Patio Constructor, folio 9700
  '962e4f2c-a5c2-4a13-b5ae-3b877e65e92e', -- Forestal Río Claro, folio 177321
  'dbd34525-b05f-4093-8dcb-d6f992f6d7b8', -- Patio Constructor, folio 9729
  'a68d07c8-0304-41a8-aa05-166ebacdc24c', -- Patio Constructor, folio 9735
  '9872477e-78f6-48c0-bd43-3df86cbc7198', -- Patio Constructor, folio 9748
  'f63c12a7-8baf-40e0-91f1-394af39a1d38', -- Comercializadora Berrios, folio 25113
  '09d92ff0-875b-4138-ae18-bc1d4a346554', -- Forestal Río Claro, folio 177505
  'c8c278ba-dd89-4c23-8ee8-41a92aa3c6d0', -- Santander - Chile, folio 56302815
  'f584f57f-0cbe-40e8-869a-111a39170b76'  -- Comercial y Servicios Pimenisa, folio 40470
)
and tipo_documento = 'factura'
and (factura_casa_hiedra = false or factura_casa_hiedra is null);

-- Para revertir (si hiciera falta):
-- update public.rendicion_mensual_gastos set factura_casa_hiedra = false
-- where id in (/* la misma lista de arriba */);
