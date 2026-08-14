-- CH-10 · Cómo llegó el prospecto (13-ago-2026)
--
-- SOLO ESQUEMA. Ninguna fila se toca.
--
-- Problema: nadie —ni Tomás, ni el equipo, ni el operador— puede responder de
-- dónde salió un lead. De Soracci sólo se sabe "Interesado vía landing de
-- producto (lookbook)". No se sabe si descargó el paquete de precios o sólo
-- dejó el correo, en qué página lo dejó, ni si venía del video de campaña de
-- Instagram.
--
-- No es que el dato se haya perdido: NUNCA SE CAPTURÓ. El sitio manda ocho
-- campos y ninguno lo dice. Por eso esto no arregla lo viejo, sólo abre el
-- casillero para lo que venga.
--
-- Son tres preguntas distintas y por eso tres campos, no un texto libre. Un
-- texto libre es lo que ya hay —"Interesado vía landing de producto"— y no se
-- puede filtrar, contar ni comparar: no se puede saber cuántos leads trajo la
-- campaña de Instagram si vive dentro de una frase.
--
-- Idempotente.

ALTER TABLE public.prospectos
  -- QUÉ HIZO. Vocabulario cerrado que define el sitio (es quien conoce sus
  -- flujos) y se documenta en docs/crm/reglas-reparto.md. Ej.: dejo_correo,
  -- descargo_precios, pidio_brief, hizo_lectura, agendo_reunion.
  ADD COLUMN IF NOT EXISTS lead_accion  text,
  -- DÓNDE. La URL NUESTRA en la que ocurrió. Distinto de `url`, que es el sitio
  -- del prospecto — confundirlos es parte del enredo actual.
  ADD COLUMN IF NOT EXISTS lead_pagina  text,
  -- DE DÓNDE VENÍA. La campaña o fuente: instagram_video_agosto, organico,
  -- directo. Sale de los UTM cuando existen.
  ADD COLUMN IF NOT EXISTS lead_campana text,
  -- Todo lo crudo que el sitio quiera adjuntar: utm_*, referrer, dispositivo.
  -- Va aparte para que los tres campos de arriba se mantengan legibles y
  -- consultables, sin cerrarle la puerta a lo que no anticipamos.
  ADD COLUMN IF NOT EXISTS lead_datos   jsonb;

COMMENT ON COLUMN public.prospectos.lead_accion  IS 'Qué hizo: dejó el correo, descargó precios, pidió brief, hizo la Lectura.';
COMMENT ON COLUMN public.prospectos.lead_pagina  IS 'En qué página NUESTRA ocurrió. No confundir con `url`, que es el sitio del prospecto.';
COMMENT ON COLUMN public.prospectos.lead_campana IS 'De dónde venía: campaña, fuente o medio. Sale de los UTM.';
COMMENT ON COLUMN public.prospectos.lead_datos   IS 'Crudo del sitio: utm_*, referrer, lo que sea. Respaldo de los tres campos de arriba.';

-- Para contar leads por campaña sin recorrer la tabla entera.
CREATE INDEX IF NOT EXISTS idx_prospectos_lead_campana
  ON public.prospectos (lead_campana) WHERE lead_campana IS NOT NULL;

-- ─── Lo viejo queda vacío, y está bien ───────────────────────────────────────
-- Rellenar estos campos para los 66 prospectos existentes sería inventar: el
-- dato no se capturó. Un NULL dice "no sabemos", que es la verdad; un valor
-- adivinado diría "sabemos" y sería falso.
--
-- ─── Comprobación ────────────────────────────────────────────────────────────
--   SELECT lead_campana, count(*) FROM public.prospectos
--    WHERE lead_campana IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;
