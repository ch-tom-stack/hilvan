-- rodaje_nomina.sql
-- Nómina del equipo técnico: los datos que producción necesita de cada persona
-- (RUT, dirección, restricción alimentaria, transporte, estacionamiento, patente).
-- Se editan en /rodaje/[id]/equipo → pestaña "Nómina" y se exportan a Excel.
-- Los valores vacíos de RUT y restricción se completan en pantalla con los del
-- directorio de colaboradores cuando la persona está vinculada a uno.
-- Correr en el SQL Editor de Supabase.

alter table public.rodaje_equipo_tecnico
  add column if not exists rut text,
  add column if not exists direccion text,
  add column if not exists restriccion_alimentaria text,
  add column if not exists necesita_transporte boolean not null default false,
  add column if not exists necesita_estacionamiento boolean not null default false,
  add column if not exists patente text;
