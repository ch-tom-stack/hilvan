-- notas_credito.sql
-- Habilita el tipo de documento 'nota_credito' (NC, Tipo Doc 61 del SII) en los
-- gastos de proyecto y mensuales. Una nota de crédito RESTA una factura previa:
-- se persiste como un gasto con monto NEGATIVO y tipo_documento='nota_credito'.
--
-- Las tablas `rendicion_gastos` y `rendicion_mensual_gastos` tienen un CHECK
-- constraint sobre `tipo_documento` (ver CLAUDE.md: "tipo_documento" tiene check).
-- El CREATE TABLE original de estas tablas NO está versionado en este repo (es
-- anterior a las migraciones aquí presentes), así que NO conocemos el nombre
-- exacto del constraint de antemano.
--
-- Solución robusta: un bloque DO que, por cada tabla, BUSCA en el catálogo
-- (pg_constraint) cualquier CHECK que mencione la columna `tipo_documento`, lo
-- ELIMINA, y agrega uno nuevo con la lista ampliada. Así funciona sea cual sea
-- el nombre real del constraint (típicamente `<tabla>_tipo_documento_check`).
-- Si una tabla NO tuviera constraint sobre tipo_documento, el DROP no encuentra
-- nada y solo se agrega el nuevo (idempotente vía nombre fijo).
--
-- Valores permitidos (alineados con TipoDocRendicion en types/index.ts):
--   boleta, boleta_consumo, factura, exenta, sin_documento, nota_credito
--
-- Cómo correrlo: pegar este bloque en el SQL Editor de Supabase (proyecto
-- hilvan) y ejecutar. Idempotente.

DO $$
DECLARE
  t   text;
  con text;
  valores constant text :=
    '''boleta'',''boleta_consumo'',''factura'',''exenta'',''sin_documento'',''nota_credito''';
BEGIN
  FOREACH t IN ARRAY ARRAY['rendicion_gastos', 'rendicion_mensual_gastos'] LOOP
    -- 1) Eliminar cualquier CHECK existente que mencione `tipo_documento`.
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class      cl ON cl.oid = c.conrelid
      JOIN pg_namespace  n  ON n.oid  = cl.relnamespace
      WHERE n.nspname = 'public'
        AND cl.relname = t
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%tipo_documento%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, con);
    END LOOP;

    -- 2) Agregar el constraint ampliado con nombre estándar.
    --    NULL sigue permitido (la columna es nullable).
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (tipo_documento IS NULL OR tipo_documento IN (%s))',
      t, t || '_tipo_documento_check', valores
    );
  END LOOP;
END $$;
