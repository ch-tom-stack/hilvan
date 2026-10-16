-- SII sin API Gateway (oct-2026)
--
-- Los documentos del SII ya no los trae el servidor: los lee la CLI `sii`
-- (albertomarturelo/sii) en el Mac, con la sesión de Casa Hiedra, y el comando
-- `npm run sii:importar -- AAAA-MM` los manda a /api/agent/sii-importar, que los
-- guarda en sii_documentos. hilvan_sii_sync / hilvan_sii_sync_ventas leen de ahí.
--
-- Esta tabla dice, por período y lado, si la importación llegó COMPLETA. Sin una
-- fila 'completo' los sync responden ERROR: así "no se pudo consultar" nunca se
-- confunde con "no hubo documentos".
--
-- Solo se accede con service role (API de agentes): RLS activado y sin políticas.

CREATE TABLE IF NOT EXISTS public.sii_importaciones (
  periodo       text NOT NULL,                       -- AAAAMM
  lado          text NOT NULL CHECK (lado IN ('compras', 'ventas', 'bhe')),
  estado        text NOT NULL CHECK (estado IN ('completo', 'incompleto')),
  documentos    int  NOT NULL DEFAULT 0,             -- filas que trajo el SII (incluye anuladas)
  errores       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- por qué quedó incompleto, textual
  herramienta   text,                                -- ej. 'sii-cli 0.10.0'
  importado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (periodo, lado)
);

ALTER TABLE public.sii_importaciones ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.sii_importaciones TO service_role;
