-- Habilita la reconciliación de correos del operador de CRM.
--
-- Contexto: el operador cruza el Gmail de Tomás y los .eml de Natalia contra
-- el CRM y registra los toques que nadie anotó. La deuda de registro es
-- estructural, así que la rutina corre semanal — y una rutina que se repite
-- necesita ser idempotente y trazable.
--
-- Ver docs/crm/operador-verificado.md §6 (carencias 4 y 5).

-- ── 4 · Quién mandó el correo ────────────────────────────────────────────────
-- Hoy el autor real (Simón / Natalia) solo se infiere de la cuenta emisora, y
-- se pierde al registrar. Es trazabilidad, NO insumo de rankings: medir
-- personas con esto contradice las reglas del módulo.
ALTER TABLE public.crm_interacciones
  ADD COLUMN IF NOT EXISTS enviado_por text;

COMMENT ON COLUMN public.crm_interacciones.enviado_por IS
  'Quién hizo el contacto (texto libre: "Simón", "Natalia"). Trazabilidad del historial, no métrica de personas.';

-- ── 5 · Un hilo de correo = un toque ─────────────────────────────────────────
-- Sin esto, correr la reconciliación dos veces registra el mismo correo dos
-- veces e infla el contador de la tarjeta, que es la única señal del tablero.
--
-- Índice PARCIAL: solo aplica cuando hay hilo. Los toques manuales desde el
-- Kanban no traen gmail_thread y deben poder repetirse el mismo día — alguien
-- puede llamar dos veces a la misma persona.
CREATE UNIQUE INDEX IF NOT EXISTS crm_interacciones_hilo_unico
  ON public.crm_interacciones (prospecto_id, gmail_thread)
  WHERE gmail_thread IS NOT NULL;

-- Para el barrido incremental: "dame los hilos que ya registré".
CREATE INDEX IF NOT EXISTS crm_interacciones_prospecto_fecha
  ON public.crm_interacciones (prospecto_id, fecha DESC);
