-- cronos_v2.sql — CRONO v2 (sep-2026): la hoja + el panel de lectura.
-- Correr DESPUÉS de sql/cronos.sql, en el SQL Editor de Supabase. No es destructivo.
--
-- Qué suma (decisiones de Tomás, 9-sep-2026):
--   - `responsable` en cada hito (texto libre).
--   - `feriados`: feriados de Chile, editables, precargados 2026–2027. Se pintan en
--     el calendario y se descuentan de todo cálculo de días hábiles.
--   - `crono_compuertas`: los checks que deben estar ok para pasar a la siguiente
--     etapa. Un check con `hito_id` es AUTOMÁTICO (se marca solo cuando ese hito
--     está hecho — un pago cobrado, una entrega hecha, un rodaje confirmado);
--     sin `hito_id` es manual, con responsable en texto libre.

alter table public.crono_hitos add column if not exists responsable text;

create table if not exists public.feriados (
  fecha   date primary key,
  nombre  text not null,
  created_at timestamptz not null default now()
);
alter table public.feriados enable row level security;
drop policy if exists "feriados auth all" on public.feriados;
create policy "feriados auth all" on public.feriados for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.feriados to authenticated;
grant select, insert, update, delete on public.feriados to service_role;

-- Feriados de Chile 2026 y 2027 (ley 2.977 y leyes especiales; los irrenunciables
-- no se distinguen acá). Revisar cada año: los que caen en fin de semana igual se
-- cargan, porque no son hábiles de todos modos.
insert into public.feriados (fecha, nombre) values
  ('2026-01-01','Año Nuevo'),
  ('2026-04-03','Viernes Santo'),
  ('2026-04-04','Sábado Santo'),
  ('2026-05-01','Día del Trabajo'),
  ('2026-05-21','Glorias Navales'),
  ('2026-06-21','Pueblos Indígenas'),
  ('2026-06-29','San Pedro y San Pablo'),
  ('2026-07-16','Virgen del Carmen'),
  ('2026-08-15','Asunción de la Virgen'),
  ('2026-09-18','Fiestas Patrias'),
  ('2026-09-19','Glorias del Ejército'),
  ('2026-10-12','Encuentro de Dos Mundos'),
  ('2026-10-31','Iglesias Evangélicas'),
  ('2026-11-01','Todos los Santos'),
  ('2026-12-08','Inmaculada Concepción'),
  ('2026-12-25','Navidad'),
  ('2027-01-01','Año Nuevo'),
  ('2027-03-26','Viernes Santo'),
  ('2027-03-27','Sábado Santo'),
  ('2027-05-01','Día del Trabajo'),
  ('2027-05-21','Glorias Navales'),
  ('2027-06-21','Pueblos Indígenas'),
  ('2027-06-28','San Pedro y San Pablo'),
  ('2027-07-16','Virgen del Carmen'),
  ('2027-08-15','Asunción de la Virgen'),
  ('2027-09-17','Feriado adicional Fiestas Patrias'),
  ('2027-09-18','Fiestas Patrias'),
  ('2027-09-19','Glorias del Ejército'),
  ('2027-10-11','Encuentro de Dos Mundos'),
  ('2027-10-31','Iglesias Evangélicas'),
  ('2027-11-01','Todos los Santos'),
  ('2027-12-08','Inmaculada Concepción'),
  ('2027-12-25','Navidad')
on conflict (fecha) do nothing;

create table if not exists public.crono_compuertas (
  id           uuid primary key default gen_random_uuid(),
  crono_id     uuid not null references public.cronos(id) on delete cascade,
  destino      text not null check (destino in ('pre','produccion','post','cierre')),
  orden        integer not null default 0,
  texto        text not null,
  hito_id      uuid references public.crono_hitos(id) on delete set null,  -- con hito_id = automático
  responsable  text,
  hecho        boolean not null default false,   -- solo cuenta en los manuales
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists crono_compuertas_crono_idx on public.crono_compuertas (crono_id, destino, orden);
drop trigger if exists set_crono_compuertas_updated_at on public.crono_compuertas;
create trigger set_crono_compuertas_updated_at before update on public.crono_compuertas
  for each row execute function public.set_updated_at();
alter table public.crono_compuertas enable row level security;
drop policy if exists "crono_compuertas auth all" on public.crono_compuertas;
create policy "crono_compuertas auth all" on public.crono_compuertas for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.crono_compuertas to authenticated;
grant select, insert, update, delete on public.crono_compuertas to service_role;
