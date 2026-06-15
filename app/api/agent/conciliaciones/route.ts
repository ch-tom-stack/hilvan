import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { esMatchTablaValida, type MatchTabla } from '@/lib/agent-conciliacion'
import {
  totalDeObligacion,
  etiquetaObligacion,
} from '@/lib/agent-conciliacion-io'

export const runtime = 'nodejs'

// GET /api/agent/conciliaciones — inspecciona el ledger de conciliación N:M.
//
// Dos modos (exactamente uno):
//   ?movimiento_id=UUID
//     → cómo se repartió ESE movimiento: sus asignaciones (a qué obligación y
//       cuánto), cuánto quedó asignado y cuánto resto sin asignar.
//   ?match_tabla=...&match_id=UUID
//     → qué movimientos pagaron ESA obligación y cuánto: asignaciones, total a
//       cubrir, cuánto se asignó, cuánto falta y si quedó cubierta.
//
// Solo lectura. Útil para auditar los splits antes de deshacer o reportar.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const movimientoId = searchParams.get('movimiento_id')?.trim() ?? ''
  const matchTabla = searchParams.get('match_tabla')?.trim() ?? ''
  const matchId = searchParams.get('match_id')?.trim() ?? ''

  const admin = createAdminClient()

  // ── Modo A: por movimiento ──────────────────────────────────────────────────
  if (movimientoId) {
    const { data: mov, error: eMov } = await admin
      .from('movimientos_bancarios')
      .select('id, fecha, descripcion, tipo, monto, fuente, conciliado')
      .eq('id', movimientoId)
      .maybeSingle()
    if (eMov) return NextResponse.json({ error: eMov.message }, { status: 500 })
    if (!mov) return NextResponse.json({ error: 'movimiento_id no encontrado' }, { status: 404 })

    const { data: filas, error: eFilas } = await admin
      .from('conciliaciones')
      .select('id, match_tabla, match_id, monto, fecha_pago')
      .eq('movimiento_id', movimientoId)
      .order('fecha_pago', { ascending: true })
    if (eFilas) return NextResponse.json({ error: eFilas.message }, { status: 500 })

    const asignaciones = []
    for (const f of (filas ?? []) as {
      id: string
      match_tabla: string
      match_id: string
      monto: number
      fecha_pago: string
    }[]) {
      const obligacion = esMatchTablaValida(f.match_tabla)
        ? await etiquetaObligacion(admin, f.match_tabla, f.match_id)
        : f.match_id
      asignaciones.push({
        match_tabla: f.match_tabla,
        match_id: f.match_id,
        obligacion,
        monto: f.monto,
        fecha_pago: f.fecha_pago,
      })
    }
    const asignado = asignaciones.reduce((s, a) => s + (a.monto ?? 0), 0)

    return NextResponse.json({
      modo: 'movimiento',
      movimiento: {
        id: mov.id,
        fecha: mov.fecha,
        descripcion: mov.descripcion,
        tipo: mov.tipo,
        monto: mov.monto,
        fuente: mov.fuente,
        conciliado: mov.conciliado,
      },
      asignaciones,
      asignado,
      resto: mov.monto - asignado,
    })
  }

  // ── Modo B: por obligación ──────────────────────────────────────────────────
  if (matchId) {
    if (!esMatchTablaValida(matchTabla)) {
      return NextResponse.json(
        {
          error:
            "match_tabla inválida (rendicion_gastos | rendicion_mensual_gastos | gastos_fijos_cuotas | cotizaciones)",
        },
        { status: 400 },
      )
    }
    const tabla = matchTabla as MatchTabla

    const { data: filas, error: eFilas } = await admin
      .from('conciliaciones')
      .select('id, movimiento_id, monto, fecha_pago')
      .eq('match_tabla', tabla)
      .eq('match_id', matchId)
      .order('fecha_pago', { ascending: true })
    if (eFilas) return NextResponse.json({ error: eFilas.message }, { status: 500 })

    const movIds = Array.from(new Set((filas ?? []).map((f: any) => f.movimiento_id)))
    const movPorId = new Map<string, { fecha: string; descripcion: string | null; monto: number }>()
    if (movIds.length > 0) {
      const { data: movs, error: eMovs } = await admin
        .from('movimientos_bancarios')
        .select('id, fecha, descripcion, monto')
        .in('id', movIds)
      if (eMovs) return NextResponse.json({ error: eMovs.message }, { status: 500 })
      for (const m of (movs ?? []) as any[]) {
        movPorId.set(m.id, { fecha: m.fecha, descripcion: m.descripcion, monto: m.monto })
      }
    }

    const asignaciones = ((filas ?? []) as any[]).map((f) => ({
      movimiento_id: f.movimiento_id,
      movimiento: movPorId.get(f.movimiento_id)
        ? `${movPorId.get(f.movimiento_id)!.fecha} · ${movPorId.get(f.movimiento_id)!.descripcion ?? '—'}`
        : null,
      monto: f.monto,
      fecha_pago: f.fecha_pago,
    }))
    const asignado = asignaciones.reduce((s, a) => s + (a.monto ?? 0), 0)

    const t = await totalDeObligacion(admin, tabla, matchId)
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: 404 })
    const etiqueta = await etiquetaObligacion(admin, tabla, matchId)

    return NextResponse.json({
      modo: 'obligacion',
      obligacion: { tabla, id: matchId, etiqueta, total: t.total },
      asignaciones,
      asignado,
      pendiente: Math.max(0, t.total - asignado),
      cubierta: t.total > 0 && asignado >= t.total,
    })
  }

  return NextResponse.json(
    { error: 'Pasa movimiento_id, o match_tabla + match_id' },
    { status: 400 },
  )
}
