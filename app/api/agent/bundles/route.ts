import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { KIT_COMPONENTES, sueltoKit } from '@/lib/rental-kits'

export const runtime = 'nodejs'

// GET /api/agent/bundles
// Los KITS del catálogo de arriendo (lo que rental.casahiedra.com muestra como
// paquetes: Camión Completo, Maleta de Cámara, Kit Luz 3 Puntos…). SOLO LECTURA.
// Un kit es un equipo de categoría KIT; lo que incluye sale de lib/rental-kits.ts
// (la misma fuente que usa la disponibilidad), resuelto a nombres reales.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const admin = createAdminClient()
  const [{ data: kits, error }, { data: todos }] = await Promise.all([
    admin.from('equipos').select('id, codigo, nombre, descripcion, precio_jornada, rentable, estado').eq('categoria_codigo', 'KIT').order('precio_jornada', { ascending: false }),
    admin.from('equipos').select('codigo, nombre, precio_jornada'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const porCodigo = new Map((todos ?? []).map((e: any) => [e.codigo, e]))
  const precioPorCodigo: Record<string, number> = {}
  for (const e of (todos ?? []) as { codigo: string; precio_jornada: number | null }[]) precioPorCodigo[e.codigo] = e.precio_jornada ?? 0

  return NextResponse.json({
    total: (kits ?? []).length,
    bundles: (kits ?? []).map((k: any) => {
      const comps = KIT_COMPONENTES[k.codigo] ?? []
      const suelto = sueltoKit(k.codigo, precioPorCodigo)
      return {
        equipo_id: k.id, codigo: k.codigo, nombre: k.nombre, descripcion: k.descripcion ?? null,
        precio_jornada: k.precio_jornada ?? null, rentable: !!k.rentable, estado: k.estado,
        valor_suelto: suelto || null,
        incluye: comps.map(c => ({
          codigo: c.codigo, cantidad: c.cantidad,
          nombre: (porCodigo.get(c.codigo) as any)?.nombre ?? null,
          precio_jornada: (porCodigo.get(c.codigo) as any)?.precio_jornada ?? null,
        })),
        composicion_definida: comps.length > 0,
      }
    }),
  })
}
