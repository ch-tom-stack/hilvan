-- =============================================================================
-- MIGRACIONES DE COLUMNAS (correr una sola vez si faltan)
-- =============================================================================
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS restricciones_alimentarias text;

-- =============================================================================
-- GRANTS — Hilván / Casa Hiedra
-- Correr en Supabase SQL Editor al crear o recrear la base de datos.
-- El service_role bypasses RLS pero igual necesita GRANT explícito.
-- =============================================================================

-- ─── PROFILES (gestión de usuarios y roles) ──────────────────────────────────
-- service_role necesita UPDATE para que actualizarRol() funcione con admin client
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

-- ─── RUTAS PÚBLICAS (service_role) ───────────────────────────────────────────
-- /citacion/[token]
GRANT SELECT, UPDATE ON public.rodaje_citaciones       TO service_role;
GRANT SELECT          ON public.rodaje_equipo_tecnico  TO service_role;
GRANT SELECT          ON public.rodaje_departamentos   TO service_role;
GRANT SELECT          ON public.rodajes                TO service_role;
GRANT SELECT          ON public.rodaje_escenas         TO service_role;

-- /m/[codigo] (maletas públicas)
GRANT SELECT          ON public.maletas                TO service_role;
GRANT SELECT          ON public.maleta_items           TO service_role;
GRANT SELECT, INSERT  ON public.maleta_notas           TO service_role;
GRANT SELECT          ON public.equipos                TO service_role;

-- /r/[token] (portal rendiciones externo)
GRANT SELECT, UPDATE  ON public.rendiciones_links_temporales TO service_role;
GRANT SELECT          ON public.cotizacion_items       TO service_role;
GRANT SELECT          ON public.cotizaciones           TO service_role;
GRANT SELECT          ON public.cotizacion_grupos      TO service_role;
GRANT SELECT          ON public.colaboradores          TO service_role;
GRANT SELECT, INSERT  ON public.rendicion_gastos       TO service_role;
GRANT SELECT          ON public.rendiciones            TO service_role;

-- ─── DASHBOARD AUTENTICADO (authenticated) ───────────────────────────────────
-- Módulo Cotizaciones (lectura para rendiciones y ficha colaborador)
GRANT SELECT ON public.cotizacion_departamentos  TO authenticated;
GRANT SELECT ON public.cotizacion_subgrupos      TO authenticated;

-- Módulo Colaboradores
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_tarifas              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_generados                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_links_temporales     TO authenticated;

-- Módulo Rendiciones
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendicion_gastos             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones_links_temporales TO authenticated;

-- Cotizaciones (server actions admin necesitan INSERT/UPDATE/DELETE completo)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizacion_grupos        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizacion_departamentos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizacion_subgrupos     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizacion_items         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes                 TO service_role;

-- ─── SERVICE_ROLE para server actions admin (rendiciones + colaboradores) ─────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_tarifas              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_generados                TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendicion_gastos                   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones                        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rendiciones_links_temporales       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores_links_temporales     TO service_role;
GRANT SELECT, UPDATE                 ON public.rodaje_bloques                     TO service_role;
GRANT SELECT, UPDATE                 ON public.colaboradores                      TO service_role;

-- Módulo Financiero
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_fijos         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_fijos_cuotas  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flujo_caja_manual    TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_fijos         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_fijos_cuotas  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flujo_caja_manual    TO service_role;

-- Caja períodos (apertura / cierre)
-- Correr una sola vez en Supabase SQL Editor:
-- CREATE TABLE IF NOT EXISTS public.caja_periodos (
--   id                uuid primary key default gen_random_uuid(),
--   periodo           text not null unique,
--   saldo_apertura    bigint not null default 0,
--   saldo_cierre_real bigint,
--   notas_cierre      text,
--   cerrado           boolean not null default false,
--   created_at        timestamptz default now(),
--   updated_at        timestamptz default now()
-- );
-- ALTER TABLE public.caja_periodos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "admin full access" ON public.caja_periodos FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caja_periodos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caja_periodos TO service_role;

-- Módulo Inversiones
-- CREATE TABLE public.inversiones (
--   id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   categoria             text NOT NULL CHECK (categoria IN ('equipo_audiovisual','vehiculo','software','consultoria','otro')),
--   descripcion           text NOT NULL,
--   proveedor             text,
--   rut_proveedor         text,
--   fecha_compra          date NOT NULL,
--   monto                 bigint NOT NULL DEFAULT 0,
--   tipo_documento        text CHECK (tipo_documento IN ('factura','sin_documento')),
--   factura_casa_hiedra   boolean NOT NULL DEFAULT false,
--   comprobante_url       text,
--   tratamiento_contable  text NOT NULL CHECK (tratamiento_contable IN ('activo_fijo','gasto_directo')),
--   notas                 text,
--   created_at            timestamptz DEFAULT now(),
--   created_by            uuid REFERENCES auth.users(id)
-- );
-- ALTER TABLE public.inversiones ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "admin full access" ON public.inversiones FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inversiones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inversiones TO service_role;

-- Conciliación bancaria — movimientos de tarjeta/cuenta (ver sql/conciliacion.sql)
-- CREATE TABLE IF NOT EXISTS movimientos_bancarios (...)  ← schema en sql/conciliacion.sql
-- ALTER TABLE movimientos_bancarios ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "admin_all_movimientos_bancarios" ON movimientos_bancarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_bancarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movimientos_bancarios TO service_role;

-- CH-10 CRM (schema completo en sql/crm.sql)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospectos        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_interacciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lecturas      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_aprobaciones  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospectos        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_interacciones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lecturas      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_aprobaciones  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_insights      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_insights      TO service_role;
-- Repertorio: el cuerpo de obra (schema en sql/repertorio.sql)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repertorio        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repertorio        TO service_role;
-- Medallas personales del CRM (schema en sql/crm_medallas.sql)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_medallas      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_medallas      TO service_role;
