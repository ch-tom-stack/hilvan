import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularMontoBruto, yearParaRetencion } from '@/lib/agent-gastos'
import { registrarAccion } from '@/lib/agent-audit'

export const runtime = 'nodejs'

const TIPO_LABEL: Record<string, string> = {
  honorarios: 'Honorarios', transporte: 'Transporte', alimentacion: 'Alimentación',
  arte: 'Arte / Props', insumos: 'Insumos', servicios: 'Servicios', viaticos: 'Viáticos', otro: 'Gasto',
}

// POST /api/agent/crear-gastos-bulk (JSON)
// Carga masiva de gastos del SII (RCV) en bloque. Body: { gastos: Fila[] }.
// Cada fila declara su `origen` ('mensual' | 'proyecto') y sus campos.
//
// Reglas de robustez (auditoría jun 2026):
//   - Se VALIDA y parsea TODA fila ANTES de la primera escritura. Si alguna
//     fila es inválida → 400 con el detalle (índice + motivo), SIN escribir nada.
//   - Luego se inserta fila por fila, acumulando los creados. Si un insert falla
//     a mitad, se registra la acción como reversible (ok:true) con los `creados`
//     hasta ahí y se devuelve 500 con { error, creados } (la reversión usa
//     payload.creados, no resultado_tabla/_id).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const gastos = body?.gastos
  if (!Array.isArray(gastos) || gastos.length === 0) {
    return NextResponse.json({ error: 'Falta gastos (array no vacío)' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── 1. Parsear y validar TODAS las filas (sin escribir) ───────────────────
  // Estructura preparada de cada fila: tabla destino + payload de insert listo.
  type Preparado =
    | { origen: 'mensual'; periodo: string; insert: Record<string, any> }
    | { origen: 'proyecto'; cotizacion_item_id: string; insert: Record<string, any> }

  const preparados: Preparado[] = []

  for (let i = 0; i < gastos.length; i++) {
    const fila = gastos[i] ?? {}
    const where = `fila ${i}`

    const origen = fila.origen
    if (origen !== 'mensual' && origen !== 'proyecto') {
      return NextResponse.json(
        { error: `${where}: origen debe ser 'mensual' o 'proyecto'` },
        { status: 400 },
      )
    }

    const tipo_documento = fila.tipo_documento
    if (!tipo_documento || typeof tipo_documento !== 'string') {
      return NextResponse.json({ error: `${where}: falta tipo_documento` }, { status: 400 })
    }
    if (fila.monto_es !== 'neto' && fila.monto_es !== 'bruto') {
      return NextResponse.json(
        { error: `${where}: monto_es debe ser 'neto' o 'bruto'` },
        { status: 400 },
      )
    }
    const monto = parseFloat(fila.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json({ error: `${where}: monto inválido` }, { status: 400 })
    }
    if (
      fila.fecha_documento != null &&
      (typeof fila.fecha_documento !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha_documento))
    ) {
      return NextResponse.json(
        { error: `${where}: fecha_documento inválida (formato YYYY-MM-DD)` },
        { status: 400 },
      )
    }

    const rut_emisor = fila.rut_emisor || null
    const razon_social_emisor = fila.razon_social_emisor || null
    const folio = fila.folio || null
    const fecha_documento = fila.fecha_documento || null
    const factura_casa_hiedra = fila.factura_casa_hiedra ?? false

    if (origen === 'mensual') {
      const periodo = fila.periodo
      if (!periodo || typeof periodo !== 'string' || !/^\d{4}-\d{2}$/.test(periodo)) {
        return NextResponse.json(
          { error: `${where}: periodo inválido (formato YYYY-MM)` },
          { status: 400 },
        )
      }
      if (!fila.categoria || typeof fila.categoria !== 'string') {
        return NextResponse.json({ error: `${where}: falta categoria` }, { status: 400 })
      }
      if (!fila.descripcion || typeof fila.descripcion !== 'string' || !fila.descripcion.trim()) {
        return NextResponse.json({ error: `${where}: falta descripcion` }, { status: 400 })
      }

      const year = yearParaRetencion(fecha_documento, periodo)
      const { montoBruto } = calcularMontoBruto({ monto, monto_es: fila.monto_es, tipo_documento, year })

      preparados.push({
        origen: 'mensual',
        periodo,
        insert: {
          descripcion: fila.descripcion.trim(),
          categoria: fila.categoria,
          tipo_documento,
          monto: montoBruto,
          cargado_por: 'Agente IA',
          rut_emisor,
          razon_social_emisor,
          factura_casa_hiedra,
          fecha_documento,
          folio,
        },
      })
    } else {
      // proyecto
      const cotizacion_item_id = fila.cotizacion_item_id
      if (!cotizacion_item_id || typeof cotizacion_item_id !== 'string') {
        return NextResponse.json(
          { error: `${where}: falta cotizacion_item_id` },
          { status: 400 },
        )
      }
      if (!fila.descripcion || typeof fila.descripcion !== 'string' || !fila.descripcion.trim()) {
        return NextResponse.json({ error: `${where}: falta descripcion` }, { status: 400 })
      }

      // Verificar que el ítem exista y obtener su cotización.
      const { data: item, error: eItem } = await admin
        .from('cotizacion_items')
        .select('cotizacion_id')
        .eq('id', cotizacion_item_id)
        .maybeSingle()
      if (eItem) {
        return NextResponse.json({ error: `${where}: ${eItem.message}` }, { status: 500 })
      }
      if (!item?.cotizacion_id) {
        return NextResponse.json(
          { error: `${where}: cotizacion_item_id no encontrado` },
          { status: 400 },
        )
      }

      const tipo = typeof fila.tipo === 'string' && fila.tipo ? fila.tipo : 'otro'
      const descripcionFinal = fila.descripcion.trim() || TIPO_LABEL[tipo] || 'Gasto'

      const year = yearParaRetencion(fecha_documento)
      const { montoBruto } = calcularMontoBruto({ monto, monto_es: fila.monto_es, tipo_documento, year })

      preparados.push({
        origen: 'proyecto',
        cotizacion_item_id,
        insert: {
          // rendicion_id se resuelve al insertar (puede crear la rendición)
          cotizacion_item_id,
          cotizacion_id: item.cotizacion_id, // interno, se quita antes del insert real
          tipo,
          descripcion: descripcionFinal,
          tipo_documento,
          monto: montoBruto,
          estado: 'enviada',
          rut_emisor,
          razon_social_emisor,
          factura_casa_hiedra,
          fecha_documento,
          folio,
        },
      })
    }
  }

  // ── 2. Insertar fila por fila, acumulando los creados ─────────────────────
  const creados: { tabla: string; id: string }[] = []
  // Cache: periodo → rendicion_mensual_id  y  cotizacion_id → rendicion_id
  const rendMensualPorPeriodo = new Map<string, string>()
  const rendProyectoPorCotizacion = new Map<string, string>()

  async function falloAMitad(mensaje: string) {
    // Registrar como reversible con lo creado hasta ahora (reversión por payload.creados).
    const total = creados.length
    await registrarAccion({
      herramienta: 'crear-gastos-bulk',
      payload: {
        creados,
        resumen: {
          mensual: creados.filter((c) => c.tabla === 'rendicion_mensual_gastos').length,
          proyecto: creados.filter((c) => c.tabla === 'rendicion_gastos').length,
          total,
        },
        error: mensaje,
      },
      ok: true,
    })
    return NextResponse.json({ error: mensaje, creados }, { status: 500 })
  }

  for (const p of preparados) {
    if (p.origen === 'mensual') {
      let rendicionId = rendMensualPorPeriodo.get(p.periodo)
      if (!rendicionId) {
        const periodoDate = `${p.periodo}-01`
        const { data: existente } = await admin
          .from('rendiciones_mensuales')
          .select('id')
          .eq('periodo', periodoDate)
          .maybeSingle()
        if (existente) {
          rendicionId = existente.id
        } else {
          const { data: creada, error: eCrear } = await admin
            .from('rendiciones_mensuales')
            .insert({ periodo: periodoDate })
            .select('id')
            .single()
          if (eCrear) return await falloAMitad(`crear rendición mensual ${p.periodo}: ${eCrear.message}`)
          rendicionId = creada.id
        }
        rendMensualPorPeriodo.set(p.periodo, rendicionId!)
      }

      const { data, error } = await admin
        .from('rendicion_mensual_gastos')
        .insert({ ...p.insert, rendicion_mensual_id: rendicionId })
        .select('id')
        .single()
      if (error) return await falloAMitad(`insertar gasto mensual: ${error.message}`)
      creados.push({ tabla: 'rendicion_mensual_gastos', id: data.id })
    } else {
      // proyecto: separar el cotizacion_id interno del payload real
      const { cotizacion_id, ...insertReal } = p.insert
      let rendicionId = rendProyectoPorCotizacion.get(cotizacion_id)
      if (!rendicionId) {
        const { data: rend } = await admin
          .from('rendiciones')
          .select('id')
          .eq('cotizacion_id', cotizacion_id)
          .maybeSingle()
        if (rend) {
          rendicionId = rend.id
        } else {
          const { data: creada, error: eCrear } = await admin
            .from('rendiciones')
            .insert({ cotizacion_id })
            .select('id')
            .single()
          if (eCrear) return await falloAMitad(`crear rendición de proyecto: ${eCrear.message}`)
          rendicionId = creada.id
        }
        rendProyectoPorCotizacion.set(cotizacion_id, rendicionId!)
      }

      const { data, error } = await admin
        .from('rendicion_gastos')
        .insert({ ...insertReal, rendicion_id: rendicionId, foto_url: null })
        .select('id')
        .single()
      if (error) return await falloAMitad(`insertar gasto de proyecto: ${error.message}`)
      creados.push({ tabla: 'rendicion_gastos', id: data.id })
    }
  }

  // ── 3. Éxito ──────────────────────────────────────────────────────────────
  const mensual = creados.filter((c) => c.tabla === 'rendicion_mensual_gastos').length
  const proyecto = creados.filter((c) => c.tabla === 'rendicion_gastos').length
  const total = creados.length

  await registrarAccion({
    herramienta: 'crear-gastos-bulk',
    payload: { creados, resumen: { mensual, proyecto, total } },
    ok: true,
  })

  return NextResponse.json({
    creados: total,
    detalle: { mensual, proyecto },
    ids: creados,
  })
}
