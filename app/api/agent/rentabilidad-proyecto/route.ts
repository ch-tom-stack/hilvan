// propuestas/02-rentabilidad-proyecto/route.draft.ts
//
// BORRADOR — NO es un route activo. Guardado como .draft.ts para que Next.js
// no lo registre. Incorporar copiando a app/api/agent/rentabilidad-proyecto/route.ts
// (y renombrando la función si hace falta).
//
// GET /api/agent/rentabilidad-proyecto
//
// Dos modos:
//
//   1. Proyecto individual:
//      ?numero=CH-COT-005          → por número de grupo
//      ?cotizacion_id=<uuid>        → por UUID de cotización
//      (&costos_adicionales=<json>) → costos extra en JSON (array de CostoAdicional)
//
//   2. Resumen de todos los proyectos:
//      ?resumen=true               → lista plana + totales de todos los proyectos
//      (&estados=aprobada,...)      → filtrar por estados (default: todos)
//
// Auth: requireAgentToken (HILVAN_AGENT_TOKEN)
// DB:   createAdminClient (bypassa RLS — este endpoint es interno del agente)

import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { COT_COBRAR_SELECT, calcularTotalCot, clienteCot, nombreCot } from '@/app/actions/financiero-helpers'
import {
  calcularRentabilidad,
  calcularResumen,
  type GastoProyecto,
  type CostoAdicional,
  type InputRentabilidad,
} from '@/lib/agent-rentabilidad'

export const runtime = 'nodejs'

// ── SELECT de gastos del proyecto ─────────────────────────────────────────────
// Join: rendicion_gastos → rendiciones → cotizaciones.grupo
// Traemos todos los gastos (cualquier estado) porque el costo real incluye
// gastos pendientes de aprobación — el dueño los conoce y ya los comprometió.
const GASTOS_PROY_SELECT = `
  id, monto, tipo, tipo_documento,
  razon_social_emisor, descripcion,
  fecha_documento, created_at,
  rendicion:rendiciones(
    cotizacion:cotizaciones(
      id,
      grupo:cotizacion_grupos(numero_base)
    )
  )
`

export async function GET(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const resumenMode = searchParams.get('resumen') === 'true'
  const numero = searchParams.get('numero')?.trim() ?? ''
  const cotizacion_id_param = searchParams.get('cotizacion_id')?.trim() ?? ''
  const estadosFiltro = searchParams.get('estados')?.split(',').map((s) => s.trim()).filter(Boolean) ?? []

  // Costos adicionales opcionales (JSON)
  let costos_adicionales: CostoAdicional[] = []
  const rawCostos = searchParams.get('costos_adicionales')
  if (rawCostos) {
    try {
      const parsed = JSON.parse(rawCostos)
      if (Array.isArray(parsed)) costos_adicionales = parsed
    } catch {
      return NextResponse.json(
        { error: 'costos_adicionales debe ser JSON válido (array)' },
        { status: 400 },
      )
    }
  }

  if (!resumenMode && !numero && !cotizacion_id_param) {
    return NextResponse.json(
      {
        error:
          'Se requiere al menos uno: numero, cotizacion_id o resumen=true',
      },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // ────────────────────────────────────────────────────────────────────────────
  // MODO RESUMEN: todos los proyectos
  // ────────────────────────────────────────────────────────────────────────────
  if (resumenMode) {
    // Traer todas las cotizaciones (o filtrar por estados)
    let query = admin.from('cotizaciones').select(COT_COBRAR_SELECT)
    if (estadosFiltro.length > 0) {
      query = query.in('estado', estadosFiltro)
    }
    const { data: cotizaciones, error: errCots } = await query.order('created_at', { ascending: false })
    if (errCots) return NextResponse.json({ error: errCots.message }, { status: 500 })

    // Traer TODOS los gastos de proyecto de una vez (más eficiente que N queries)
    const { data: todosGastos, error: errGastos } = await admin
      .from('rendicion_gastos')
      .select(GASTOS_PROY_SELECT)

    if (errGastos) return NextResponse.json({ error: errGastos.message }, { status: 500 })

    // Indexar gastos por cotizacion_id
    const gastosPorCotizacion = new Map<string, GastoProyecto[]>()
    for (const g of (todosGastos ?? []) as any[]) {
      const cotId = g.rendicion?.cotizacion?.id as string | null
      if (!cotId) continue
      if (!gastosPorCotizacion.has(cotId)) gastosPorCotizacion.set(cotId, [])
      gastosPorCotizacion.get(cotId)!.push({
        id: g.id,
        monto: g.monto ?? 0,
        tipo: g.tipo ?? null,
        tipo_documento: g.tipo_documento ?? null,
        razon_social_emisor: g.razon_social_emisor ?? null,
        descripcion: g.descripcion ?? null,
        fecha_documento: g.fecha_documento ?? null,
        created_at: g.created_at,
      })
    }

    // Calcular rentabilidad de cada cotización
    const resultados = (cotizaciones ?? []).map((cot: any) => {
      const input: InputRentabilidad = {
        numero: (cot.grupo as any)?.numero_base ?? null,
        cotizacion_id: cot.id,
        nombre_proyecto: cot.nombre ?? '—',
        cliente: clienteCot(cot),
        estado_cotizacion: cot.estado ?? '—',
        ingreso_cotizado: calcularTotalCot(cot),
        facturacion: {
          fecha_factura_emitida: cot.fecha_factura_emitida ?? null,
          fecha_pago_recibido: cot.fecha_pago_recibido ?? null,
          numero_factura: cot.numero_factura ?? null,
        },
        gastos: gastosPorCotizacion.get(cot.id) ?? [],
        costos_adicionales: [],
      }
      return calcularRentabilidad(input)
    })

    return NextResponse.json(calcularResumen(resultados))
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MODO INDIVIDUAL: un proyecto por número o cotizacion_id
  // ────────────────────────────────────────────────────────────────────────────

  // ── 1. Resolver cotización ────────────────────────────────────────────────
  let cotizacion: any = null
  let cotizacionIds: string[] = []

  if (cotizacion_id_param) {
    const { data, error } = await admin
      .from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .eq('id', cotizacion_id_param)
      .single()
    if (error || !data) {
      return NextResponse.json(
        { error: `Cotización no encontrada: ${cotizacion_id_param}` },
        { status: 404 },
      )
    }
    cotizacion = data
    cotizacionIds = [cotizacion_id_param]
  } else {
    // Buscar por número de grupo → puede haber varias versiones
    const { data: grupo, error: errGrupo } = await admin
      .from('cotizacion_grupos')
      .select('id, numero_base')
      .eq('numero_base', numero)
      .single()
    if (errGrupo || !grupo) {
      return NextResponse.json(
        { error: `No se encontró ningún grupo con número "${numero}"` },
        { status: 404 },
      )
    }

    // Traer todas las versiones del grupo; usar la más reciente como cotización principal
    const { data: cots, error: errCots } = await admin
      .from('cotizaciones')
      .select(COT_COBRAR_SELECT)
      .eq('grupo_id', grupo.id)
      .order('created_at', { ascending: false })
    if (errCots || !cots || cots.length === 0) {
      return NextResponse.json(
        { error: `No se encontraron cotizaciones para el grupo ${numero}` },
        { status: 404 },
      )
    }
    cotizacion = cots[0]
    cotizacionIds = (cots as any[]).map((c) => c.id)
  }

  // ── 2. Traer gastos de TODAS las versiones del grupo ─────────────────────
  // (Un gasto puede estar asociado a una rendición de cualquier versión.)
  // Primero obtenemos las rendiciones de esas cotizaciones.
  const { data: rendiciones, error: errRend } = await admin
    .from('rendiciones')
    .select('id')
    .in('cotizacion_id', cotizacionIds)

  if (errRend) return NextResponse.json({ error: errRend.message }, { status: 500 })

  const rendicionIds = (rendiciones ?? []).map((r: any) => r.id as string)

  let gastos: GastoProyecto[] = []
  if (rendicionIds.length > 0) {
    const { data: gastosRaw, error: errGastos } = await admin
      .from('rendicion_gastos')
      .select('id, monto, tipo, tipo_documento, razon_social_emisor, descripcion, fecha_documento, created_at')
      .in('rendicion_id', rendicionIds)
      .order('created_at', { ascending: true })

    if (errGastos) return NextResponse.json({ error: errGastos.message }, { status: 500 })

    gastos = (gastosRaw ?? []).map((g: any) => ({
      id: g.id,
      monto: g.monto ?? 0,
      tipo: g.tipo ?? null,
      tipo_documento: g.tipo_documento ?? null,
      razon_social_emisor: g.razon_social_emisor ?? null,
      descripcion: g.descripcion ?? null,
      fecha_documento: g.fecha_documento ?? null,
      created_at: g.created_at,
    }))
  }

  // ── 3. Construir input y calcular ─────────────────────────────────────────
  const input: InputRentabilidad = {
    numero: (cotizacion.grupo as any)?.numero_base ?? null,
    cotizacion_id: cotizacion.id,
    nombre_proyecto: cotizacion.nombre ?? '—',
    cliente: clienteCot(cotizacion),
    estado_cotizacion: cotizacion.estado ?? '—',
    ingreso_cotizado: calcularTotalCot(cotizacion),
    facturacion: {
      fecha_factura_emitida: cotizacion.fecha_factura_emitida ?? null,
      fecha_pago_recibido: cotizacion.fecha_pago_recibido ?? null,
      numero_factura: cotizacion.numero_factura ?? null,
    },
    gastos,
    costos_adicionales,
  }

  const resultado = calcularRentabilidad(input)

  // ── 4. Metadata extra (versiones del grupo) ───────────────────────────────
  const meta = {
    versiones_cotizacion: cotizacionIds.length,
    cotizacion_activa: cotizacion.id,
    label: nombreCot(cotizacion),
  }

  return NextResponse.json({ meta, ...resultado })
}
