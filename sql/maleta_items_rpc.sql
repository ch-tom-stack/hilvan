-- ─────────────────────────────────────────────────────────────────────────────
-- T05 — Reemplazo atómico de ítems de maleta
-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase JS no expone transacciones. Esta función hace delete+insert de los
-- maleta_items dentro de una sola transacción de Postgres, de modo que si el
-- insert falla, el delete se revierte y la maleta NO queda vacía.
--
-- NO aplicar a producción desde el repo: ejecutar manualmente en Supabase.
--
-- Parámetros:
--   p_maleta_id  uuid de la maleta a actualizar
--   p_items      jsonb array: [{ "equipo_id": "...", "cantidad": 1, "notas": "..." }]
--                notas puede venir null o ausente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reemplazar_maleta_items(
  p_maleta_id uuid,
  p_items     jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Borrar los ítems actuales
  DELETE FROM public.maleta_items WHERE maleta_id = p_maleta_id;

  -- Insertar los nuevos (si los hay). Cualquier fallo aquí revierte el delete.
  IF jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.maleta_items (maleta_id, equipo_id, cantidad, notas)
    SELECT
      p_maleta_id,
      (elem->>'equipo_id')::uuid,
      coalesce((elem->>'cantidad')::int, 1),
      nullif(elem->>'notas', '')
    FROM jsonb_array_elements(p_items) AS elem;
  END IF;
END;
$$;

-- GRANTs — la función se invoca con createClient() (rol authenticated)
GRANT EXECUTE ON FUNCTION public.reemplazar_maleta_items(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reemplazar_maleta_items(uuid, jsonb) TO service_role;
