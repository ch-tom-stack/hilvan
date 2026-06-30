-- Registro/auditoría de documentos del SII traídos por hilvan_sii_sync.
-- Snapshot FIEL de lo que el SII reporta (RCV compras + BHE recibidas) por período,
-- independiente de lo que se cargue como gasto. Sirve para validar con el contador
-- contra lo declarado. El sync hace UPSERT idempotente en cada corrida.
-- Solo lo escribe el endpoint del agente (service_role); authenticated puede leer
-- (para una futura vista). El registro crudo completo va en `raw` (jsonb).

create table if not exists public.sii_documentos (
  id uuid primary key default gen_random_uuid(),
  periodo text not null,                              -- AAAAMM del registro
  fuente text not null check (fuente in ('rcv_compra','bhe_recibida')),
  dte int not null default 0,                         -- tipo DTE (33,34,61...); 0 para BHE
  tipo_documento text,                                -- factura | exenta | boleta | nota_credito
  rut_emisor text,
  razon_social_emisor text,
  folio text,
  fecha_documento date,
  neto bigint,
  iva bigint,
  total bigint,
  monto bigint,                                       -- monto normalizado (bruto) usable como gasto
  codigo text,                                        -- código SII (BHE); null en facturas
  anulada boolean not null default false,
  doc_ref_tipo int,                                   -- NC: tipo de doc referenciado (pendiente)
  doc_ref_folio text,                                 -- NC: folio referenciado (pendiente)
  raw jsonb not null,                                 -- registro crudo del SII (respaldo fiel)
  created_at timestamptz not null default now(),      -- primera vez visto
  sincronizado_at timestamptz not null default now(), -- última sincronización
  unique (fuente, rut_emisor, folio, dte)             -- clave de upsert idempotente
);

create index if not exists sii_documentos_periodo_idx on public.sii_documentos (periodo);
create index if not exists sii_documentos_rut_folio_idx on public.sii_documentos (rut_emisor, folio);

alter table public.sii_documentos enable row level security;

-- GRANTs
grant select on public.sii_documentos to authenticated;
grant all on public.sii_documentos to service_role;

-- Política RLS: authenticated lee (futura vista del libro); el agente usa service_role.
drop policy if exists "sii_documentos auth select" on public.sii_documentos;
create policy "sii_documentos auth select"
  on public.sii_documentos for select to authenticated using (true);
