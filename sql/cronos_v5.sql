-- cronos_v5.sql — CRONO v5 (sep-2026): variantes.
-- Correr en el SQL Editor de Supabase (idempotente). Una variante es un crono
-- hermano que apunta al original (`variante_de`), con un nombre corto propio
-- (`variante`, p. ej. "rodaje 24"). Comparte proyecto y cliente; tiene sus propias
-- etapas, hitos y compuertas. Solo la VIGENTE del grupo se pinta en el Calendario
-- general; "Hacer vigente" pasa las hermanas a borrador.
alter table public.cronos add column if not exists variante_de uuid references public.cronos(id) on delete set null;
alter table public.cronos add column if not exists variante text;
create index if not exists cronos_variante_de_idx on public.cronos (variante_de);
notify pgrst, 'reload schema';
