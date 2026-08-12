-- CH-10 · Bitácora conversacional: hilos, dirección y respuestas (ago 2026)
--
-- Hasta ahora la bitácora sólo sabía de toques NUESTROS: cada fila era "le
-- escribimos", y que el otro lado hubiera contestado era un booleano
-- (`respondido`) sin contenido. No se podía guardar QUÉ respondieron, ni quién
-- de la empresa lo dijo, ni quién de Casa Hiedra escribió.
--
-- Este script convierte la bitácora en una conversación:
--   · `crm_hilos`  — una línea de conversación entre un emisor (nosotros) y un
--     destinatario (un contacto de la marca). Se cierra y se abre otra cuando
--     cambia la contraparte o cuando se retoma después de mucho tiempo.
--   · `direccion`  — 'enviado' | 'recibido'. Los recibidos NO son toques
--     nuestros: si contaran, una respuesta del cliente movería la escalera de
--     cadencia como si lo hubiéramos perseguido.
--   · `responde_a` — a qué mensaje contesta este, para poder encadenar.
--
-- Idempotente: se puede correr más de una vez.

-- ─── crm_hilos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_hilos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospecto_id   uuid NOT NULL REFERENCES public.prospectos(id) ON DELETE CASCADE,
  -- Destinatario: con quién de la marca se está hablando. Puede cambiar.
  contacto_id    uuid REFERENCES public.crm_contactos(id) ON DELETE SET NULL,
  -- Emisor: quién de Casa Hiedra lleva esta línea. Cambia si se reasigna.
  responsable_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  titulo         text,
  abierto_at     date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Santiago')::date),
  cerrado_at     date,
  -- cambio_contacto | cambio_responsable | reinicio | sin_respuesta | manual
  motivo_cierre  text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.crm_hilos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin full access" ON public.crm_hilos;
CREATE POLICY "admin full access" ON public.crm_hilos FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_crm_hilos_prospecto ON public.crm_hilos (prospecto_id);
CREATE INDEX IF NOT EXISTS idx_crm_hilos_abiertos  ON public.crm_hilos (prospecto_id) WHERE cerrado_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_hilos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_hilos TO service_role;

-- ─── crm_interacciones: dirección, hilo, quién y a quién ─────────────────────
ALTER TABLE public.crm_interacciones
  ADD COLUMN IF NOT EXISTS hilo_id        uuid REFERENCES public.crm_hilos(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direccion      text NOT NULL DEFAULT 'enviado',
  ADD COLUMN IF NOT EXISTS contacto_id    uuid REFERENCES public.crm_contactos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enviado_por_id uuid REFERENCES public.profiles(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responde_a     uuid REFERENCES public.crm_interacciones(id) ON DELETE SET NULL,
  -- Denormalizado a propósito. La verdad es `crm_hilos.cerrado_at`, pero el
  -- motor de cadencia se lee en el digest diario y en cada herramienta del
  -- operador: hacer que esa consulta dependa de un embed anidado le agrega un
  -- modo de falla a la query más usada del CRM, por una condición que cambia
  -- una vez cada varios meses. Lo mantienen cerrarHilo/reabrirHilo.
  ADD COLUMN IF NOT EXISTS cuenta_cadencia boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE public.crm_interacciones
    ADD CONSTRAINT chk_interaccion_direccion CHECK (direccion IN ('enviado', 'recibido'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_crm_interacciones_hilo ON public.crm_interacciones (hilo_id);

-- ─── Backfill: un hilo por prospecto que ya tenga bitácora ───────────────────
-- Sin esto, los prospectos existentes quedarían con interacciones huérfanas y
-- la UI no tendría dónde colgarlas. El hilo hereda el responsable actual y el
-- contacto decisor (o el más antiguo), que es la mejor aproximación disponible.
INSERT INTO public.crm_hilos (prospecto_id, contacto_id, responsable_id, titulo, abierto_at)
SELECT p.id,
       (SELECT c.id FROM public.crm_contactos c
         WHERE c.prospecto_id = p.id
         ORDER BY c.es_decisor DESC, c.created_at ASC LIMIT 1),
       p.responsable_id,
       'Hilo inicial',
       COALESCE((SELECT MIN(i.fecha) FROM public.crm_interacciones i WHERE i.prospecto_id = p.id),
                (now() AT TIME ZONE 'America/Santiago')::date)
  FROM public.prospectos p
 WHERE EXISTS (SELECT 1 FROM public.crm_interacciones i WHERE i.prospecto_id = p.id)
   AND NOT EXISTS (SELECT 1 FROM public.crm_hilos h WHERE h.prospecto_id = p.id);

UPDATE public.crm_interacciones i
   SET hilo_id = h.id
  FROM public.crm_hilos h
 WHERE h.prospecto_id = i.prospecto_id
   AND h.cerrado_at IS NULL
   AND i.hilo_id IS NULL;

-- `enviado_por_id` se deja NULL en lo histórico a propósito: `enviado_por` es
-- texto libre ('Simón', 'Natalia') y aparearlo contra profiles por nombre sería
-- adivinar. La UI cae al texto cuando no hay id.

-- ─── Comprobación ────────────────────────────────────────────────────────────
-- SELECT count(*) FILTER (WHERE hilo_id IS NULL) AS sin_hilo,
--        count(*) FILTER (WHERE direccion = 'recibido') AS recibidos,
--        count(*) AS total
--   FROM public.crm_interacciones;
