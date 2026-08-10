-- CH-10 · Ejes de asignación de responsable (ago 2026)
-- tamaño de empresa + segmento → alimentan la función determinista de reparto.
-- Los rellena el operador/agente al clasificar. Sin CHECK: valores validados en app.
-- Idempotente.

ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS tamano   text,   -- chica | mediana | grande
  ADD COLUMN IF NOT EXISTS segmento text;   -- general | estudiante | ropa_intima_fem | masculino_estereotipo | rental
