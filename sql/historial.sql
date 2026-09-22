-- Historial de acciones de PERSONAS (Ctrl+Z / Ctrl+Shift+Z en toda la app), sep-2026.
--
-- Hermana de agente_acciones, pero para lo que el equipo hace en pantalla.
-- Cada acción guarda sus operaciones (insert / update / delete) con los datos
-- necesarios para volver atrás Y para rehacer. Vive en el servidor: sobrevive a
-- recargar la página y funciona en el celular.
--
-- Solo service role: RLS activado y sin políticas. Las server actions verifican
-- sesión y que la acción sea del mismo usuario antes de tocar nada.

CREATE TABLE IF NOT EXISTS public.acciones_ui (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ruta          text NOT NULL,          -- dónde se hizo: /cotizaciones/<id>, /rodaje/<id>
  modulo        text NOT NULL,          -- cotizaciones | rodaje | crm | …
  descripcion   text NOT NULL,          -- "Eliminar ítem Foquista" (lo que muestra el aviso)
  ops           jsonb NOT NULL,         -- [{tipo:'insert'|'update'|'delete', …}] en orden de ejecución
  created_at    timestamptz NOT NULL DEFAULT now(),
  deshecha      boolean NOT NULL DEFAULT false,
  deshecha_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_acciones_ui_usuario_ruta ON public.acciones_ui (usuario_id, ruta, created_at DESC);

ALTER TABLE public.acciones_ui ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.acciones_ui TO service_role;
