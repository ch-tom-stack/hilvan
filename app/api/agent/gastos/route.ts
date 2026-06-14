import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularRetencion } from '@/lib/rendiciones-calc'

export const runtime = 'nodejs'

// GET /api/agent/gastos
// Lectura unificada de gastos de PROYECTO (rendicion_gastos) y MENSUALES
// (rendicion_mensual_gastos), en cualquier estado.
//
// Query params (todos opcionales):
//   q              — texto libre (case-insensitive) sobre rut_emisor, razon_social_emisor, descripcion
//   tipo_documento — boleta | factura | boleta_consumo | exenta | sin_documento
//   periodo        — YYYY-MM  (mensual: por campo `periodo`; proyecto: por mes de created_at)
//   estado         — filtro exacto sobre el estado del gasto
//
// Devuelve lista plana de hasta 200 ítems ordenada por created_at desc.
export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const tipo_documento = searchParams.get('tipo_documento')?.trim() ?? ''
  const periodo = searchParams.get('periodo')?.trim() ?? ''
  const estado = searchParams.get('estado')?.trim() ?? ''

  const admin = createAdminClient()

  // ── Construir filtros de texto (ilike) ────────────────────────────────────
  const qFilter = q
    ? `rut_emisor.ilike.*${q}*,razon_social_emisor.ilike.*${q}*,descripcion.ilike.*${q}*`
    : null

  // ── 1. rendicion_gastos (PROYECTO) ────────────────────────────────────────
  // Embed: rendicion → estado, y cotizacion → grupo → numero_base
  let proyQuery = admin
    .from('rendicion_gastos')
    .select(
      'id,monto,tipo,tipo_documento,estado,rut_emisor,razon_social_emisor,descripcion,created_at,' +
        'rendicion:rendiciones(estado,cotizacion:cotizaciones(grupo:cotizacion_grupos(numero_base)))',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (qFilter) proyQuery = proyQuery.or(qFilter)
  if (tipo_documento) proyQuery = proyQuery.eq('tipo_documento', tipo_documento)
  if (estado) proyQuery = proyQuery.eq('estado', estado)
  if (periodo) {
    // created_at entre el primer y último día del mes (UTC)
    const [yy, mm] = periodo.split('-').map(Number)
    const desde = `${periodo}-01T00:00:00.000Z`
    const hasta = new Date(Date.UTC(yy, mm, 1)).toISOString() // primer día del mes siguiente
    proyQuery = proyQuery.gte('created_at', desde).lt('created_at', hasta)
  }

  const { data: proyData, error: proyError } = await proyQuery
  if (proyError) return NextResponse.json({ error: proyError.message }, { status: 500 })

  // ── 2. rendicion_mensual_gastos (MENSUAL) ─────────────────────────────────
  let mensQuery = admin
    .from('rendicion_mensual_gastos')
    .select(
      'id,monto,tipo,tipo_documento,estado,rut_emisor,razon_social_emisor,descripcion,created_at,' +
        'rendicion_mensual:rendiciones_mensuales(periodo)',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (qFilter) mensQuery = mensQuery.or(qFilter)
  if (tipo_documento) mensQuery = mensQuery.eq('tipo_documento', tipo_documento)
  if (estado) mensQuery = mensQuery.eq('estado', estado)
  if (periodo) {
    // filtra por el campo `periodo` de la tabla padre (= YYYY-MM-01)
    mensQuery = mensQuery.eq('rendicion_mensual.periodo', `${periodo}-01`)
  }

  const { data: mensData, error: mensError } = await mensQuery
  if (mensError) return NextResponse.json({ error: mensError.message }, { status: 500 })

  // ── Normalizar y combinar ─────────────────────────────────────────────────
  type GastoItem = {
    origen: 'proyecto' | 'mensual'
    id: string
    contexto: string | null
    descripcion: string | null
    tipo: string | null
    tipo_documento: string | null
    monto: number
    rut_emisor: string | null
    razon_social_emisor: string | null
    estado: string | null
    retencion: number
    neto: number
    created_at: string
  }

  const proyItems: GastoItem[] = (proyData ?? []).map((g: any) => {
    const numero = g.rendicion?.cotizacion?.grupo?.numero_base ?? null
    const contexto = numero != null ? `CH-COT-${String(numero).padStart(3, '0')}` : null
    const { retencion, neto } = calcularRetencion({
      monto: g.monto ?? 0,
      tipo_documento: g.tipo_documento,
      fecha: g.created_at,
    })
    return {
      origen: 'proyecto',
      id: g.id,
      contexto,
      descripcion: g.descripcion ?? null,
      tipo: g.tipo ?? null,
      tipo_documento: g.tipo_documento ?? null,
      monto: g.monto ?? 0,
      rut_emisor: g.rut_emisor ?? null,
      razon_social_emisor: g.razon_social_emisor ?? null,
      estado: g.estado ?? null,
      retencion,
      neto,
      created_at: g.created_at,
    }
  })

  const mensItems: GastoItem[] = (mensData ?? []).map((g: any) => {
    const periodoRaw: string | null = g.rendicion_mensual?.periodo ?? null
    // periodo viene como YYYY-MM-DD → devolver YYYY-MM
    const contexto = periodoRaw ? periodoRaw.slice(0, 7) : null
    const { retencion, neto } = calcularRetencion({
      monto: g.monto ?? 0,
      tipo_documento: g.tipo_documento,
      fecha: g.created_at,
    })
    return {
      origen: 'mensual',
      id: g.id,
      contexto,
      descripcion: g.descripcion ?? null,
      tipo: g.tipo ?? null,
      tipo_documento: g.tipo_documento ?? null,
      monto: g.monto ?? 0,
      rut_emisor: g.rut_emisor ?? null,
      razon_social_emisor: g.razon_social_emisor ?? null,
      estado: g.estado ?? null,
      retencion,
      neto,
      created_at: g.created_at,
    }
  })

  // Combinar y ordenar por created_at desc, limitar a 200
  const combined = [...proyItems, ...mensItems]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 200)

  return NextResponse.json(combined)
}
