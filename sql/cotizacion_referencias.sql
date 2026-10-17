-- Referencias de una cotización: OC y HES (oct-2026)
--
-- Las facturas de Casa Hiedra llevan referencias (OC 801, HES) que hoy se copian a
-- mano desde los correos de los clientes. Esta tabla las guarda por cotización para
-- que el borrador de factura (scripts/sii/factura.mjs) las tome solo, y para saber
-- qué cotizaciones aprobadas siguen sin OC o sin HES.
--
--   · estado 'propuesta'  → la detectó el operador leyendo el correo; Tomás la
--                            confirma con un botón en Hilván (o por chat).
--   · estado 'confirmada' → la ingresó o aprobó una persona. Solo estas van a la factura.
--   · estado 'descartada' → Tomás dijo que no corresponde. Se guarda para que la
--                            lectura del correo no la vuelva a proponer.
--
-- Una OC que cubre varias cotizaciones es una fila en cada una (mismo folio).
-- Ver docs/sii/referencias-oc-hes.md.

CREATE TABLE IF NOT EXISTS public.cotizacion_referencias (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id    uuid NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('oc', 'hes', 'nota_pedido', 'contrato')),
  folio            text CHECK (folio IS NULL OR length(folio) BETWEEN 1 AND 18),
  fecha            date,
  monto            bigint,                       -- neto de la OC, si se conoce
  glosa            text,                         -- texto de la línea de la OC, para la factura
  estado           text NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('propuesta', 'confirmada', 'descartada')),
  fuente           text NOT NULL DEFAULT 'manual' CHECK (fuente IN ('manual', 'correo')),
  correo_id        text,                         -- id del mensaje de Gmail
  correo_remitente text,
  correo_asunto    text,
  correo_fecha     timestamptz,
  nota             text,                         -- por qué se propuso (lo escribe el operador)
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  confirmada_at    timestamptz,
  confirmada_por   uuid,
  -- Confirmada exige folio y fecha (la HES de Falabella llega propuesta sin número).
  CONSTRAINT cotizacion_referencias_confirmada_completa
    CHECK (estado <> 'confirmada' OR (folio IS NOT NULL AND fecha IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS cotizacion_referencias_cot_idx ON public.cotizacion_referencias (cotizacion_id);
-- Leer el mismo correo dos veces no duplica la propuesta.
CREATE UNIQUE INDEX IF NOT EXISTS cotizacion_referencias_correo_idx
  ON public.cotizacion_referencias (cotizacion_id, correo_id) WHERE correo_id IS NOT NULL;
-- El mismo documento no se repite en una cotización.
CREATE UNIQUE INDEX IF NOT EXISTS cotizacion_referencias_folio_idx
  ON public.cotizacion_referencias (cotizacion_id, tipo, folio) WHERE folio IS NOT NULL AND estado <> 'descartada';

ALTER TABLE public.cotizacion_referencias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizacion_referencias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizacion_referencias TO service_role;
DROP POLICY IF EXISTS "cotizacion_referencias auth all" ON public.cotizacion_referencias;
CREATE POLICY "cotizacion_referencias auth all" ON public.cotizacion_referencias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Qué exige cada cliente para facturarle (el que recibe la factura: la agencia si
-- hay, si no el cliente).
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS exige_oc  boolean NOT NULL DEFAULT false;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS exige_hes boolean NOT NULL DEFAULT false;

-- Según las facturas emitidas en 2026: Falabella pide OC y HES; Estudio Prende
-- (Republik), OC.
UPDATE public.clientes SET exige_oc = true, exige_hes = true
  WHERE id IN ('57e2cd2b-2167-45cb-bfda-91086562d7a3', '83ed988d-21ec-456c-b380-62d6ab397eb0');
UPDATE public.clientes SET exige_oc = true
  WHERE id = '964fabaa-c9db-4e48-88c3-77a52af8acdf';
