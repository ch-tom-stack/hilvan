// lib/agent-audit.ts
// Log de auditoría de la API de agentes. Cada operación del agente queda
// registrada en la tabla `agente_acciones` (ver sql/agente_acciones.sql),
// con resumen del payload, archivo fuente y resultado, para trazabilidad y deshacer.

import { createAdminClient } from '@/lib/supabase/admin'

export interface AccionAgente {
  herramienta: string
  payload?: unknown
  resultado_tabla?: string | null
  resultado_id?: string | null
  archivo_url?: string | null
  ok: boolean
  error?: string | null
}

export interface AccionAgenteRow extends AccionAgente {
  id: string
  created_at: string
  deshecha: boolean
}

/**
 * Inserta una fila en agente_acciones. NUNCA lanza: si la auditoría falla,
 * se registra en consola pero el flujo principal continúa.
 * Devuelve el id de la fila creada (o null si falló).
 */
export async function registrarAccion(accion: AccionAgente): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('agente_acciones')
      .insert({
        herramienta: accion.herramienta,
        payload: accion.payload ?? null,
        resultado_tabla: accion.resultado_tabla ?? null,
        resultado_id: accion.resultado_id ?? null,
        archivo_url: accion.archivo_url ?? null,
        ok: accion.ok,
        error: accion.error ?? null,
      })
      .select('id')
      .single()
    if (error) {
      console.error('[agent-audit] insert:', error.message)
      return null
    }
    return data?.id ?? null
  } catch (e: any) {
    console.error('[agent-audit] insert:', e?.message)
    return null
  }
}

/** Busca una acción por id (para el deshacer). Devuelve null si no existe o falla. */
export async function obtenerAccion(id: string): Promise<AccionAgenteRow | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('agente_acciones')
      .select('*')
      .eq('id', id)
      .single()
    if (error) {
      console.error('[agent-audit] obtener:', error.message)
      return null
    }
    return data as AccionAgenteRow
  } catch (e: any) {
    console.error('[agent-audit] obtener:', e?.message)
    return null
  }
}
