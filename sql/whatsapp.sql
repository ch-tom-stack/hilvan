-- WhatsApp → CRM (sep-2026)
--
-- El número de empresa se conecta a la Cloud API de Meta en modo COEXISTENCIA:
-- la app del celular sigue igual y cada mensaje —el que llega y el que se manda
-- desde el teléfono— llega además a /api/whatsapp/webhook.
--
-- Dos tablas, por una decisión de privacidad: a ese número también le escriben
-- proveedores, equipo y gente que no es venta.
--   · whatsapp_mensajes      → contenido, SOLO de números que calzan con un
--                              prospecto o un contacto del CRM.
--   · whatsapp_desconocidos  → cuarentena: número, nombre de perfil y fechas.
--                              NUNCA el texto. Se purga a los 30 días.
--
-- Solo se accede con service role (webhook y API de agentes): RLS activado y
-- sin políticas.

CREATE TABLE IF NOT EXISTS public.whatsapp_mensajes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id          text NOT NULL UNIQUE,          -- wamid de Meta: hace idempotente el webhook
  telefono       text NOT NULL,                 -- la contraparte, solo dígitos con código país (569…)
  direccion      text NOT NULL CHECK (direccion IN ('recibido', 'enviado')),
  tipo           text NOT NULL DEFAULT 'text',  -- text | audio | image | document | media_placeholder | …
  texto          text,                          -- null en medios; se borra a los 90 días de procesado
  enviado_at     timestamptz NOT NULL,          -- timestamp del mensaje según Meta
  origen         text NOT NULL DEFAULT 'webhook' CHECK (origen IN ('webhook', 'historial')),
  prospecto_id   uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  contacto_id    uuid REFERENCES public.crm_contactos(id) ON DELETE SET NULL,
  -- Se llena cuando el operador resume la conversación y la registra en el CRM.
  procesado_at   timestamptz,
  accion_id      uuid,                          -- agente_acciones.id que lo procesó (para deshacer)
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensajes_pendientes
  ON public.whatsapp_mensajes (prospecto_id, enviado_at) WHERE procesado_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensajes_telefono ON public.whatsapp_mensajes (telefono);

CREATE TABLE IF NOT EXISTS public.whatsapp_desconocidos (
  telefono        text PRIMARY KEY,
  nombre_perfil   text,                         -- el nombre público de WhatsApp, para poder decidir quién es
  primer_mensaje  timestamptz NOT NULL,
  ultimo_mensaje  timestamptz NOT NULL,
  mensajes        integer NOT NULL DEFAULT 1,
  -- pendiente: nadie decidió · ignorar: no es venta, no volver a preguntar
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'ignorar')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_mensajes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_desconocidos ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.whatsapp_mensajes     TO service_role;
GRANT ALL ON public.whatsapp_desconocidos TO service_role;
