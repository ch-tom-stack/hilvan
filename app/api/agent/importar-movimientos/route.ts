import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

// POST /api/agent/importar-movimientos (JSON)
// Importa movimientos bancarios / de tarjeta (extracto). Body: { movimientos: Fila[] }.
// Cada fila: fecha (YYYY-MM-DD req), monto (req >0), tipo ('cargo'|'abono' req),
//            descripcion?, fuente?, referencia?.
//
// Robustez (auditoría jun 2026):
//   - Se VALIDA y parsea TODA fila ANTES de la primera escritura. Si alguna es
//     inválida → 400 con `fila N: motivo`, SIN escribir nada.
//   - Luego inserta acumulando creados:[{tabla:'movimientos_bancarios', id}].
//     Si un insert falla a mitad, registra la acción como reversible (ok:true)
//     con los creados hasta ahí y devuelve 500 { error, creados }.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const movimientos = body?.movimientos
  if (!Array.isArray(movimientos) || movimientos.length === 0) {
    return NextResponse.json({ error: 'Falta movimientos (array no vacío)' }, { status: 400 })
  }

  // ── 1. Validar y preparar TODAS las filas (sin escribir) ────────────────────
  const preparados: Record<string, any>[] = []

  for (let i = 0; i < movimientos.length; i++) {
    const fila = movimientos[i] ?? {}
    const where = `fila ${i}`

    const fecha = fila.fecha
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json(
        { error: `${where}: fecha inválida (formato YYYY-MM-DD)` },
        { status: 400 },
      )
    }

    const monto = parseFloat(fila.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json({ error: `${where}: monto inválido (debe ser > 0)` }, { status: 400 })
    }

    const tipo = fila.tipo
    if (tipo !== 'cargo' && tipo !== 'abono') {
      return NextResponse.json(
        { error: `${where}: tipo debe ser 'cargo' o 'abono'` },
        { status: 400 },
      )
    }

    if (fila.descripcion != null && typeof fila.descripcion !== 'string') {
      return NextResponse.json({ error: `${where}: descripcion debe ser texto` }, { status: 400 })
    }
    if (fila.fuente != null && typeof fila.fuente !== 'string') {
      return NextResponse.json({ error: `${where}: fuente debe ser texto` }, { status: 400 })
    }
    if (fila.referencia != null && typeof fila.referencia !== 'string') {
      return NextResponse.json({ error: `${where}: referencia debe ser texto` }, { status: 400 })
    }

    preparados.push({
      fecha,
      monto: Math.round(monto),
      tipo,
      descripcion: fila.descripcion?.trim() || null,
      fuente: fila.fuente?.trim() || null,
      referencia: fila.referencia?.trim() || null,
    })
  }

  // ── 2. Insertar fila por fila, acumulando los creados ───────────────────────
  const admin = createAdminClient()
  const creados: { tabla: string; id: string }[] = []

  async function falloAMitad(mensaje: string) {
    await registrarAccion({
      herramienta: 'importar-movimientos',
      payload: { creados, resumen: { total: creados.length }, error: mensaje },
      ok: true,
    })
    return NextResponse.json({ error: mensaje, creados }, { status: 500 })
  }

  for (let i = 0; i < preparados.length; i++) {
    const { data, error } = await admin
      .from('movimientos_bancarios')
      .insert(preparados[i])
      .select('id')
      .single()
    if (error) return await falloAMitad(`insertar movimiento (fila ${i}): ${error.message}`)
    creados.push({ tabla: 'movimientos_bancarios', id: data.id })
  }

  // ── 3. Éxito ────────────────────────────────────────────────────────────────
  const cargos = preparados.filter((p) => p.tipo === 'cargo').length
  const abonos = preparados.filter((p) => p.tipo === 'abono').length

  await registrarAccion({
    herramienta: 'importar-movimientos',
    payload: { creados, resumen: { total: creados.length, cargos, abonos } },
    ok: true,
  })

  return NextResponse.json({
    creados: creados.length,
    detalle: { cargos, abonos },
    ids: creados,
  })
}
