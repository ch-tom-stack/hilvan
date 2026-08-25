-- rodaje_equipo_salida.sql
-- Hora de SALIDA individual por persona del equipo técnico. En un rodaje real
-- casi nunca todos entran y salen a la misma hora (ej. el artista invitado
-- llega 11:00 y sale 13:35 mientras dirección cubre la jornada completa), y esa
-- diferencia es la que hay que respetar al planificar los bloques.
-- Complementa hora_llamado_individual (que ya existía). La escribe
-- hilvan_rodaje_equipo (MCP) y es editable en la app.
-- Correr en el SQL Editor de Supabase.

alter table public.rodaje_equipo_tecnico
  add column if not exists hora_salida_individual time;
