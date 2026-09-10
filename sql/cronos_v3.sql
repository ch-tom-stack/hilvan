-- cronos_v3.sql — CRONO v3 (sep-2026): hitos destacados.
-- Correr en el SQL Editor de Supabase (idempotente). Pedido de Tomás: el rodaje y
-- las ENTREGAS FINALES (no el OFF ni los cortes intermedios) van destacados en la
-- hoja. El rodaje siempre; una entrega solo si lleva `destacado = true`.
alter table public.crono_hitos add column if not exists destacado boolean not null default false;
-- Que la API vea la columna al tiro (sin esto puede tardar en refrescar el caché).
notify pgrst, 'reload schema';
