-- Capa de stickers flotantes del plan de rodaje: imágenes (PNG) y notas de texto
-- que se posan ENCIMA de la grilla (como en el Google Sheet). Posición/tamaño en
-- fracción del ancho/alto del plan (0..1) para escalar en distintos tamaños/orientaciones.
-- Imágenes en el bucket Storage 'rodaje-imagenes' (ruta {rodajeId}/stickers/{id}.png).

create table if not exists public.rodaje_stickers (
  id uuid primary key default gen_random_uuid(),
  rodaje_id uuid not null references public.rodajes(id) on delete cascade,
  tipo text not null default 'imagen' check (tipo in ('imagen','texto')),
  imagen_url text,
  contenido text,                  -- texto de la nota
  estilo jsonb,                    -- fuente, color, tamaño, peso (notas)
  x numeric not null default 0.1,  -- 0..1 fracción del ancho
  y numeric not null default 0.1,  -- 0..1 fracción del alto
  w numeric not null default 0.25, -- 0..1 fracción del ancho
  rot numeric not null default 0,  -- grados
  z int not null default 0,        -- orden de apilado
  created_at timestamptz not null default now()
);

alter table public.rodaje_stickers enable row level security;
alter table public.rodaje_stickers replica identity full;  -- realtime al viewer

-- GRANTs
grant select on public.rodaje_stickers to anon;
grant select, insert, update, delete on public.rodaje_stickers to authenticated;
grant all on public.rodaje_stickers to service_role;

-- Políticas RLS (permisivas, igual que rodaje_bloques): anon lee (viewer público),
-- authenticated administra (editor).
drop policy if exists "rodaje_stickers anon select" on public.rodaje_stickers;
create policy "rodaje_stickers anon select"
  on public.rodaje_stickers for select to anon using (true);

drop policy if exists "rodaje_stickers auth all" on public.rodaje_stickers;
create policy "rodaje_stickers auth all"
  on public.rodaje_stickers for all to authenticated using (true) with check (true);
