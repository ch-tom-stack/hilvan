-- etiquetas.sql
-- Etiquetas de texto+color (tipo Gmail/Linear) para organizar/encontrar
-- cotizaciones y rodajes. Sets SEPARADOS por módulo (decisión de Tomás): una
-- etiqueta "Urgente" en cotizaciones no es la misma fila que "Urgente" en
-- rodajes, cada módulo tiene su propio catálogo.
--
-- Cotizaciones: la etiqueta se asigna al GRUPO (cotizacion_grupos), no a cada
-- versión — es la unidad que aparece en la lista y las versiones comparten
-- cliente/proyecto, así que comparten etiquetas también.
-- Correr en el SQL Editor de Supabase.

create table if not exists public.cotizacion_etiquetas (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null,
  color      text not null default '#7a9e7e',
  created_at timestamptz not null default now()
);
create unique index if not exists cotizacion_etiquetas_texto_idx on public.cotizacion_etiquetas (lower(texto));

create table if not exists public.cotizacion_grupo_etiquetas (
  grupo_id    uuid not null references public.cotizacion_grupos(id) on delete cascade,
  etiqueta_id uuid not null references public.cotizacion_etiquetas(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (grupo_id, etiqueta_id)
);

create table if not exists public.rodaje_etiquetas (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null,
  color      text not null default '#7a9e7e',
  created_at timestamptz not null default now()
);
create unique index if not exists rodaje_etiquetas_texto_idx on public.rodaje_etiquetas (lower(texto));

create table if not exists public.rodaje_etiqueta_asignaciones (
  rodaje_id   uuid not null references public.rodajes(id) on delete cascade,
  etiqueta_id uuid not null references public.rodaje_etiquetas(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (rodaje_id, etiqueta_id)
);

alter table public.cotizacion_etiquetas       enable row level security;
alter table public.cotizacion_grupo_etiquetas enable row level security;
alter table public.rodaje_etiquetas           enable row level security;
alter table public.rodaje_etiqueta_asignaciones enable row level security;

-- GRANTs: mismo patrón que rendiciones/prospectos — server actions usan el
-- cliente de sesión (createClient), no admin. Solo dashboard autenticado.
grant select, insert, update, delete on public.cotizacion_etiquetas         to authenticated;
grant select, insert, update, delete on public.cotizacion_grupo_etiquetas   to authenticated;
grant select, insert, update, delete on public.rodaje_etiquetas             to authenticated;
grant select, insert, update, delete on public.rodaje_etiqueta_asignaciones to authenticated;

grant select, insert, update, delete on public.cotizacion_etiquetas         to service_role;
grant select, insert, update, delete on public.cotizacion_grupo_etiquetas   to service_role;
grant select, insert, update, delete on public.rodaje_etiquetas             to service_role;
grant select, insert, update, delete on public.rodaje_etiqueta_asignaciones to service_role;

drop policy if exists "cotizacion_etiquetas auth all" on public.cotizacion_etiquetas;
create policy "cotizacion_etiquetas auth all" on public.cotizacion_etiquetas
  for all to authenticated using (true) with check (true);

drop policy if exists "cotizacion_grupo_etiquetas auth all" on public.cotizacion_grupo_etiquetas;
create policy "cotizacion_grupo_etiquetas auth all" on public.cotizacion_grupo_etiquetas
  for all to authenticated using (true) with check (true);

drop policy if exists "rodaje_etiquetas auth all" on public.rodaje_etiquetas;
create policy "rodaje_etiquetas auth all" on public.rodaje_etiquetas
  for all to authenticated using (true) with check (true);

drop policy if exists "rodaje_etiqueta_asignaciones auth all" on public.rodaje_etiqueta_asignaciones;
create policy "rodaje_etiqueta_asignaciones auth all" on public.rodaje_etiqueta_asignaciones
  for all to authenticated using (true) with check (true);
