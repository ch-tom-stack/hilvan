-- Transferencias masivas Santander (oct-2026)
--
-- 1. cuentas_bancarias: el directorio de a quién se le paga y dónde. Se llena
--    SOLO con los avisos de Santander que importa la tarea diaria (cada aviso
--    trae banco, cuenta, RUT y nombre del destinatario: si el banco lo pagó, la
--    cuenta existe → confirmada=true). También entra a mano o desde la ficha
--    del colaborador. Una persona puede tener varias cuentas: se usa la última
--    vista.
-- 2. pagos_lotes + pagos_lote_items: cada transferencia masiva que se arma en
--    Hilván. El lote genera la planilla de Office Banking; cada pago queda
--    'pendiente' hasta que el aviso o la cartola traen un cargo con el mismo
--    RUT y monto → 'pagado' (y el gasto de origen queda pagado sin conciliar).
--
-- Solo se accede con service role (server actions con requireRol y la API de
-- agentes): RLS activado y sin políticas.

CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rut             text NOT NULL,                 -- 12345678-9 (sin puntos, DV mayúscula)
  nombre          text NOT NULL,                 -- como lo muestra el banco
  banco_codigo    text NOT NULL CHECK (banco_codigo ~ '^[0-9]{3}$'),  -- código CMF/SBIF: '037'
  tipo_cuenta     text,                          -- corriente | vista | ahorro (informativo)
  numero_cuenta   text NOT NULL CHECK (numero_cuenta ~ '^[0-9]+$'),   -- solo dígitos, sin ceros a la izquierda
  email           text,
  colaborador_id  uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  fuente          text NOT NULL DEFAULT 'manual' CHECK (fuente IN ('aviso_santander', 'planilla', 'colaborador', 'manual')),
  confirmada      boolean NOT NULL DEFAULT false, -- el banco ya transfirió a esta cuenta
  veces           int NOT NULL DEFAULT 1,
  ultima_vez      date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rut, banco_codigo, numero_cuenta)
);

CREATE INDEX IF NOT EXISTS cuentas_bancarias_rut_idx ON public.cuentas_bancarias (rut);

CREATE TABLE IF NOT EXISTS public.pagos_lotes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text NOT NULL,
  fecha          date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')::date,
  cuenta_origen  text NOT NULL DEFAULT '84616290',
  estado         text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'generado', 'cerrado')),
  notas          text,
  creado_por     text,
  generado_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pagos_lote_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id         uuid NOT NULL REFERENCES public.pagos_lotes(id) ON DELETE CASCADE,
  orden           int NOT NULL DEFAULT 0,
  rut             text NOT NULL,
  nombre          text NOT NULL,
  banco_codigo    text,                          -- null = falta la cuenta (no se puede generar)
  numero_cuenta   text,
  email           text,
  monto           bigint NOT NULL CHECK (monto > 0),
  glosa           text,
  origen_tabla    text CHECK (origen_tabla IN ('rendicion_gastos', 'rendicion_mensual_gastos', 'nomina', 'libre')),
  origen_id       uuid,
  colaborador_id  uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'anulado')),
  movimiento_id   uuid REFERENCES public.movimientos_bancarios(id) ON DELETE SET NULL,
  pagado_en       date,
  marco_gasto     boolean NOT NULL DEFAULT false, -- el cierre puso pagado=true en el gasto de origen
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pagos_lote_items_lote_idx ON public.pagos_lote_items (lote_id);
CREATE INDEX IF NOT EXISTS pagos_lote_items_pendientes_idx ON public.pagos_lote_items (estado) WHERE estado = 'pendiente';

ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_lote_items ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.cuentas_bancarias TO service_role;
GRANT ALL ON public.pagos_lotes TO service_role;
GRANT ALL ON public.pagos_lote_items TO service_role;
