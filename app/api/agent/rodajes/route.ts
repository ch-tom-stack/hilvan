import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/rodajes?q=
// Lista/busca rodajes por nombre. Devuelve también el número de la cotización
// asociada (numero_base del grupo) para que el agente pueda cruzar con cotizaciones.
//   [{ id, nombre, fecha, estado, cotizacion_numero }]
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('rodajes')
    .select(`
      id, nombre, fecha, estado,
      cotizacion:cotizaciones(grupo:cotizacion_grupos(numero_base))
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ql = q.toLowerCase()
  const filas = (data ?? [])
    .map((r: any) => ({
      id: r.id as string,
      nombre: r.nombre as string,
      fecha: (r.fecha as string | null) ?? null,
      estado: r.estado as string,
      cotizacion_numero:
        (r.cotizacion as any)?.grupo?.numero_base ?? null,
    }))
    .filter(
      (r) =>
        !ql ||
        r.nombre.toLowerCase().includes(ql) ||
        String(r.cotizacion_numero ?? '').toLowerCase().includes(ql) ||
        r.estado.toLowerCase().includes(ql),
    )
    .slice(0, 50)

  return NextResponse.json(filas)
}
