-- reuniones_web.sql
-- Reuniones agendadas desde la página pública (/reunion → subdominio reuniones.casahiedra.com).
-- El visitante elige un slot libre (Calendly directo) y queda agendada al instante:
-- se crea el evento en Google Calendar y se guarda acá para tracking/bandeja.
--
-- La escribe el endpoint público /api/reunion (service_role); la bandeja en Hilván
-- la lee authenticated (admin/productor). Correr en el SQL Editor de Supabase.

create table if not exists public.reuniones_web (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  sitio_web text,                 -- opcional
  instagram text,                 -- opcional
  motivo text,                    -- opcional (de qué quiere hablar)
  inicio timestamptz not null,    -- inicio del slot (UTC; se muestra en America/Santiago)
  fin timestamptz not null,
  modalidad text not null default 'videollamada',
  estado text not null default 'agendada' check (estado in ('agendada','cancelada','realizada')),
  gcal_event_id text,             -- id del evento creado en Google Calendar
  ip text,                        -- para rate-limit / anti-abuso
  created_at timestamptz not null default now()
);

create index if not exists reuniones_web_inicio_idx on public.reuniones_web (inicio);
create index if not exists reuniones_web_estado_idx on public.reuniones_web (estado);

alter table public.reuniones_web enable row level security;

grant select on public.reuniones_web to authenticated;
grant all on public.reuniones_web to service_role;

drop policy if exists "reuniones_web auth select" on public.reuniones_web;
create policy "reuniones_web auth select"
  on public.reuniones_web for select to authenticated using (true);
