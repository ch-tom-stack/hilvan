import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contentDisposition } from '@/lib/archivos'
import { leerLotes } from '@/lib/pagos-masivos-io'
import { escribirPlanilla } from '@/lib/planilla-santander'

export const runtime = 'nodejs'

// GET /api/pagos/lotes/[id]/planilla — la planilla .xlsx para subir a Office
// Banking (Transferencias → Masivas). Solo admin/contabilidad. Lleva solo los
// pagos PENDIENTES (lo ya pagado o anulado no se vuelve a mandar); si alguno
// pendiente tiene errores (sin cuenta, RUT inválido…) no se genera nada.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || !['admin', 'contabilidad'].includes(profile.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const [lote] = await leerLotes(admin, { id })
  if (!lote) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })

  const pendientes = lote.items.filter(i => i.estado === 'pendiente')
  if (pendientes.length === 0) return NextResponse.json({ error: 'El lote no tiene pagos pendientes' }, { status: 400 })
  const conError = pendientes.filter(i => i.errores.length)
  if (conError.length) {
    return NextResponse.json({ error: `Corrige antes: ${conError.map(i => `${i.nombre} (${i.errores.join(', ')})`).join('; ')}` }, { status: 400 })
  }

  const archivo = await escribirPlanilla(pendientes, lote.cuenta_origen)
  if (lote.estado === 'borrador') {
    await admin.from('pagos_lotes').update({ estado: 'generado', generado_at: new Date().toISOString() }).eq('id', id)
  }

  const base = /^transferencia/i.test(lote.nombre) ? lote.nombre : `Transferencia Masiva ${lote.fecha.slice(8, 10)}-${lote.fecha.slice(5, 7)} ${lote.nombre}`
  const nombre = `${base}.xlsx`
  return new NextResponse(archivo as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition('attachment', nombre, 'transferencia-masiva.xlsx'),
      'Cache-Control': 'no-store',
    },
  })
}
