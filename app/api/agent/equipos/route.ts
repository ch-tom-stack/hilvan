import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// GET /api/agent/equipos?q=&categoria=&solo_rentables=
// Catálogo de equipos (CH-1), SOLO LECTURA. Lo mismo que se ve en /equipos y en
// rental.casahiedra.com, para armar cotizaciones sin salir a la web.
//   q          texto en código, nombre, marca, modelo
//   categoria  código (CAM, OPT, ILU…) o nombre de la categoría
//   solo_rentables=true  solo los marcados como rentables (los del catálogo web)
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim().toLowerCase()
  const cat = (sp.get('categoria') ?? '').trim().toLowerCase()
  const soloRentables = sp.get('solo_rentables') === 'true'

  const admin = createAdminClient()
  let consulta = admin
    .from('equipos')
    .select('id, codigo, nombre, marca, modelo, descripcion, estado, cantidad, precio_jornada, rentable, categoria_codigo, categoria:categorias_equipo(codigo, nombre, orden)')
    .order('codigo')
  if (soloRentables) consulta = consulta.eq('rentable', true)
  const { data, error } = await consulta
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []).filter((e: any) => {
    const c = e.categoria as { codigo?: string; nombre?: string } | null
    if (cat && !(c?.codigo?.toLowerCase() === cat || c?.nombre?.toLowerCase() === cat || String(e.categoria_codigo ?? '').toLowerCase() === cat)) return false
    if (!q) return true
    return [e.codigo, e.nombre, e.marca, e.modelo, e.descripcion].some(v => String(v ?? '').toLowerCase().includes(q))
  })

  const { data: cats } = await admin.from('categorias_equipo').select('codigo, nombre').eq('activa', true).order('orden')

  return NextResponse.json({
    total: filas.length,
    categorias: (cats ?? []).map((c: any) => ({ codigo: c.codigo, nombre: c.nombre })),
    equipos: filas.map((e: any) => ({
      equipo_id: e.id, codigo: e.codigo, nombre: e.nombre,
      categoria: (e.categoria as any)?.nombre ?? null, categoria_codigo: (e.categoria as any)?.codigo ?? e.categoria_codigo ?? null,
      marca: e.marca ?? null, modelo: e.modelo ?? null,
      precio_jornada: e.precio_jornada ?? null, estado: e.estado, cantidad: e.cantidad ?? 1, rentable: !!e.rentable,
    })),
  })
}
