-- descuento_codigos.sql
-- Códigos de descuento únicos que se emiten al capturar un lead en el pop-up de
-- Rental (10% en el primer arriendo, vigencia 90 días). Se aplican en el
-- cotizador web y SE APILAN con la promo Jul-Ago y el descuento por volumen.
--
-- Regla: UN código por correo. Si el mismo correo vuelve a pedirlo, se le
-- reenvía el MISMO código (no se emite otro).
-- Correr en el SQL Editor de Supabase.

create table if not exists public.descuento_codigos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  email             text not null,
  nombre            text,
  pct               int  not null default 10 check (pct > 0 and pct <= 50),
  origen            text not null default 'rental',
  estado            text not null default 'emitido' check (estado in ('emitido', 'usado', 'anulado')),
  vence_at          date not null,
  usado_at          timestamptz,
  -- Última cotización web que lo aplicó (informativo; no lo quema).
  cotizacion_id     uuid,
  created_at        timestamptz not null default now()
);

-- Un código vigente por correo (case-insensitive).
create index if not exists descuento_codigos_email_idx on public.descuento_codigos (lower(email));
create index if not exists descuento_codigos_estado_idx on public.descuento_codigos (estado, vence_at);

-- Solo se accede con service_role (rutas públicas usan createAdminClient).
alter table public.descuento_codigos enable row level security;
grant select, insert, update on public.descuento_codigos to service_role;
