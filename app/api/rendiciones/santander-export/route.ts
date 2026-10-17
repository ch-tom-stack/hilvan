import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contentDisposition } from '@/lib/archivos'
import { revisarPago, type PagoPlanilla } from '@/lib/pagos-masivos'
import { escribirPlanilla } from '@/lib/planilla-santander'

export const runtime = 'nodejs'

// POST /api/rendiciones/santander-export { pagos: PagoPlanilla[], nombre, cuenta_origen? }
// Planilla de transferencia masiva para los gastos aprobados de una cotización
// (Centro de costos · Admin · Export). Usa el mismo generador que Financiero →
// Transferencias masivas (lib/planilla-santander.ts): cuentas y códigos de
// banco como texto, sin template en public/ (no viaja al bundle de Vercel).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('rol').eq('id', user.id).single()
  if (!profile || !['admin', 'contabilidad'].includes(profile.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: { pagos?: PagoPlanilla[]; nombre?: string; cuenta_origen?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const pagos = Array.isArray(body?.pagos) ? body.pagos : []
  if (pagos.length === 0) return NextResponse.json({ error: 'No hay pagos' }, { status: 400 })

  const malos = pagos.map(p => ({ p, e: revisarPago(p).errores })).filter(x => x.e.length)
  if (malos.length) {
    return NextResponse.json({ error: `Corrige antes: ${malos.map(x => `${x.p.nombre || x.p.rut} (${x.e.join(', ')})`).join('; ')}` }, { status: 400 })
  }
  const cuentaOrigen = String(body.cuenta_origen ?? '').replace(/\D/g, '').replace(/^0+/, '') || undefined

  const archivo = await escribirPlanilla(pagos, cuentaOrigen)
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  const filename = `santander_${String(body.nombre || 'export').replace(/\s+/g, '_')}_${fecha}.xlsx`
  return new NextResponse(archivo as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition('attachment', filename, 'santander.xlsx'),
    },
  })
}
