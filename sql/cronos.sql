-- cronos.sql — CRONO: el cronograma de proyecto (sep-2026)
--
-- Un crono es el calendario maestro de una producción: las CUATRO etapas
-- (desarrollo → preproducción → producción → postproducción) como rangos de
-- fechas, más los HITOS que cuelgan de ellas — entregas, pagos, reuniones — con un
-- "zoom" fijo sobre los cuatro que siempre importan en Casa Hiedra: la devolución
-- al cliente, la pre de equipo, el rodaje y las entregas de post.
--
-- Decisiones (Tomás, sep-2026):
--   - Cuelga del PROYECTO, pero el proyecto es OPCIONAL: un crono puede nacer
--     suelto (un editor de documento) y vincularse después.
--   - Primera versión: vista interna + MCP. Sin vista pública ni PDF todavía.
--   - Las etapas son columnas explícitas (no jsonb): se consultan y filtran desde
--     SQL y desde el agente sin desarmar nada.
--   - Un hito de tipo `rodaje` puede apuntar a un rodaje real (`rodaje_id`) — es
--     solo referencia; la fecha queda copiada en el hito para que el crono siga
--     leyéndose igual aunque el rodaje se borre (ON DELETE SET NULL).
--   - `monto` en CLP entero (bigint), como el resto de la casa (formatCLP).
--
-- Cómo correrlo: pegar este archivo completo en el SQL Editor de Supabase y
-- ejecutar. No es destructivo (todo es IF NOT EXISTS / DROP POLICY IF EXISTS).

create table if not exists public.cronos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  proyecto_id      uuid references public.proyectos(id) on delete set null,
  cliente          text,          -- texto libre; si hay proyecto con cliente, la UI muestra ese
  responsable      text,
  notas            text,
  estado           text not null default 'borrador'
                   check (estado in ('borrador','vigente','cerrado')),
  -- Etapas: rango [desde, hasta] por etapa. Una etapa sin `hasta` se considera
  -- abierta hasta el `desde` de la siguiente etapa con fecha.
  desarrollo_desde date,
  desarrollo_hasta date,
  pre_desde        date,
  pre_hasta        date,
  produccion_desde date,
  produccion_hasta date,
  post_desde       date,
  post_hasta       date,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists cronos_proyecto_idx on public.cronos (proyecto_id);
create index if not exists cronos_updated_idx  on public.cronos (updated_at desc);

create table if not exists public.crono_hitos (
  id          uuid primary key default gen_random_uuid(),
  crono_id    uuid not null references public.cronos(id) on delete cascade,
  orden       integer not null default 0,
  tipo        text not null default 'otro'
              check (tipo in ('devolucion','pre_equipo','rodaje','entrega','pago','reunion','otro')),
  titulo      text not null default '',
  fecha       date,                 -- null = sin fecha todavía (queda al final de la lista)
  fecha_fin   date,                 -- rango opcional (un rodaje de 3 jornadas); null = un día
  etapa       text check (etapa in ('desarrollo','pre','produccion','post')),  -- null = se deduce de la fecha
  monto       bigint,               -- solo tiene sentido en `pago` (CLP)
  notas       text,
  hecho       boolean not null default false,
  rodaje_id   uuid references public.rodajes(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists crono_hitos_crono_idx on public.crono_hitos (crono_id, orden);
create index if not exists crono_hitos_fecha_idx on public.crono_hitos (fecha);

-- updated_at automático — reusa public.set_updated_at() (sql/clientes.sql); se
-- redeclara idéntica por si este archivo corre antes en una base nueva.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_cronos_updated_at on public.cronos;
create trigger set_cronos_updated_at before update on public.cronos
  for each row execute function public.set_updated_at();

drop trigger if exists set_crono_hitos_updated_at on public.crono_hitos;
create trigger set_crono_hitos_updated_at before update on public.crono_hitos
  for each row execute function public.set_updated_at();

-- RLS: todo el equipo autenticado lee y escribe (mismo criterio que rodajes);
-- el agente entra por service_role (createAdminClient).
alter table public.cronos      enable row level security;
alter table public.crono_hitos enable row level security;

drop policy if exists "cronos auth all" on public.cronos;
create policy "cronos auth all" on public.cronos
  for all to authenticated using (true) with check (true);

drop policy if exists "crono_hitos auth all" on public.crono_hitos;
create policy "crono_hitos auth all" on public.crono_hitos
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.cronos      to authenticated;
grant select, insert, update, delete on public.crono_hitos to authenticated;
grant select, insert, update, delete on public.cronos      to service_role;
grant select, insert, update, delete on public.crono_hitos to service_role;
