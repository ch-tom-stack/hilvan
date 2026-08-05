-- CH-10 · Rework del pipeline CRM (ago 2026)
-- Columnas: prospecto · contacto (ex-calificado) · conversacion · confirmado.
-- Se eliminan como etapa: lectura_entregada, producto_propuesto,
-- cotizacion_enviada, seguimiento → pasan a Conversación y quedan como CHECKLIST.
-- `etapa` es text SIN check constraint → el remapeo es un simple UPDATE.
-- Idempotente: se puede correr más de una vez sin efecto adverso.

-- 1. Nuevas columnas ─────────────────────────────────────────────────────────
ALTER TABLE public.prospectos
  ADD COLUMN IF NOT EXISTS checklist text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.crm_interacciones
  ADD COLUMN IF NOT EXISTS cuerpo     text,
  ADD COLUMN IF NOT EXISTS respondido boolean NOT NULL DEFAULT false;

-- 2. Migración de datos ──────────────────────────────────────────────────────
-- 2a. Marcar el checklist ANTES de mover la etapa (para no perder el hito).
UPDATE public.prospectos
   SET checklist = array_append(checklist, 'lectura')
 WHERE etapa = 'lectura_entregada' AND NOT ('lectura' = ANY(checklist));

UPDATE public.prospectos
   SET checklist = array_append(checklist, 'producto_propuesto')
 WHERE etapa = 'producto_propuesto' AND NOT ('producto_propuesto' = ANY(checklist));

UPDATE public.prospectos
   SET checklist = array_append(checklist, 'cotizacion_enviada')
 WHERE etapa = 'cotizacion_enviada' AND NOT ('cotizacion_enviada' = ANY(checklist));

-- 2b. Remapear etapas.
UPDATE public.prospectos SET etapa = 'contacto'     WHERE etapa = 'calificado';
UPDATE public.prospectos SET etapa = 'conversacion'
 WHERE etapa IN ('lectura_entregada', 'producto_propuesto', 'cotizacion_enviada', 'seguimiento');

-- 3. Índice para el contador de contactos (ya existe idx_crm_interacciones_prospecto).
