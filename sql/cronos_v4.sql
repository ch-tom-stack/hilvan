-- cronos_v4.sql — CRONO v4 (sep-2026): tipos de hito OFF y Emisión.
-- Correr en el SQL Editor de Supabase (idempotente). Pedido de Tomás: "no existe
-- OFF, no existe emisión". `off` = corte offline para revisión; `emision` = fecha
-- en que sale al aire o se publica. Ambos son hitos clave.
alter table public.crono_hitos drop constraint if exists crono_hitos_tipo_check;
alter table public.crono_hitos add constraint crono_hitos_tipo_check
  check (tipo in ('devolucion','pre_equipo','rodaje','off','entrega','emision','pago','reunion','otro'));
notify pgrst, 'reload schema';
