import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SELECT_CRONO_AGENTE, cargarFeriados, serializarCrono } from '@/lib/agent-crono'
import { hitosOrdenados } from '@/lib/crono'
import type { Crono, CronoHito } from '@/types'

export const runtime = 'nodejs'

// GET /api/agent/cronos?q=&proyecto_id=&estado=
// Lista/busca cronos por nombre, proyecto o cliente. Devuelve el resumen de cada
// uno (etapas, rango, próximo hito clave, url) sin la lista completa de hitos.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
  const proyectoId = url.searchParams.get('proyecto_id')?.trim() ?? ''
  const estado = url.searchParams.get('estado')?.trim() ?? ''

  const admin = createAdminClient()
  let query = admin.from('cronos').select(SELECT_CRONO_AGENTE).order('updated_at', { ascending: false }).limit(200)
  if (proyectoId) query = query.eq('proyecto_id', proyectoId)
  if (estado) query = query.eq('estado', estado)
  const [{ data, error }, feriados] = await Promise.all([query, cargarFeriados(admin)])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = ((data ?? []) as unknown as Crono[])
    .map((c) => ({ ...c, hitos: hitosOrdenados((c.hitos ?? []) as CronoHito[]) }))
    .filter((c) =>
      !q ||
      c.nombre.toLowerCase().includes(q) ||
      c.proyecto?.nombre?.toLowerCase().includes(q) ||
      c.cliente?.toLowerCase().includes(q) ||
      c.proyecto?.cliente?.nombre?.toLowerCase().includes(q),
    )
    .slice(0, 50)
    .map((c) => {
      const { hitos, compuertas: _c, lectura: _l, avisos, ...resto } = serializarCrono(c, feriados)
      return { ...resto, n_hitos: hitos.length, n_avisos: avisos.length }
    })

  return NextResponse.json(filas)
}
