/**
 * propuestas/04-compliance-anomalias/route.draft.ts
 *
 * BORRADOR — copiar a app/api/agent/auditoria/route.ts al incorporar.
 * Ver INCORPORACION.md para los pasos completos.
 *
 * GET /api/agent/auditoria?aging_dias=30&dias_sin_factura=30&dias_sin_rodaje=14&ventana_duplicados_dias=7
 *
 * Devuelve hallazgos de control agrupados por severidad (alta/media/info).
 * Solo LECTURA — no escribe ni muta ningún dato.
 */

import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  aplicarReglas,
  type GastoAudit,
  type CotizacionAudit,
  type ColaboradorAudit,
} from '@/lib/agent-auditoria'

export const runtime = 'nodejs'

// Umbrales por defecto (sobreescribibles por query param).
const DEFAULT_AGING_DIAS = 30
const DEFAULT_DIAS_SIN_FACTURA = 30
const DEFAULT_DIAS_SIN_RODAJE = 14
const DEFAULT_VENTANA_DUPLICADOS = 7

export async function GET(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  // ── Params ────────────────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url)
  const aging_dias = parseInt(searchParams.get('aging_dias') ?? '', 10) || DEFAULT_AGING_DIAS
  const dias_sin_factura =
    parseInt(searchParams.get('dias_sin_factura') ?? '', 10) || DEFAULT_DIAS_SIN_FACTURA
  const dias_sin_rodaje =
    parseInt(searchParams.get('dias_sin_rodaje') ?? '', 10) || DEFAULT_DIAS_SIN_RODAJE
  const ventana_duplicados_dias =
    parseInt(searchParams.get('ventana_duplicados_dias') ?? '', 10) || DEFAULT_VENTANA_DUPLICADOS

  const hoy = new Date().toISOString().slice(0, 10)
  const admin = createAdminClient()

  // ── Carga de datos (todas en paralelo) ────────────────────────────────────
  const [
    { data: gastosProyData, error: eGP },
    { data: gastosMensData, error: eGM },
    { data: cotizData, error: eCot },
    { data: colabData, error: eColab },
  ] = await Promise.all([
    // Gastos de proyecto: campos necesarios para las reglas.
    admin
      .from('rendicion_gastos')
      .select(
        'id, monto, tipo_documento, folio, rut_emisor, razon_social_emisor, descripcion, fecha_documento, created_at,' +
          'rendicion:rendiciones(cotizacion:cotizaciones(grupo:cotizacion_grupos(numero_base)))',
      )
      .order('fecha_documento', { ascending: true }),

    // Gastos mensuales.
    admin
      .from('rendicion_mensual_gastos')
      .select(
        'id, monto, tipo_documento, folio, rut_emisor, razon_social_emisor, descripcion, fecha_documento, created_at,' +
          'rendicion_mensual:rendiciones_mensuales(periodo)',
      )
      .order('fecha_documento', { ascending: true }),

    // Cotizaciones aprobadas o en producción (para estancadas y aging).
    // También incluye todas con factura emitida sin pago.
    admin
      .from('cotizaciones')
      .select(
        'id, estado, fecha_respuesta_cliente, fecha_factura_emitida, fecha_pago_recibido,' +
          'grupo:cotizacion_grupos(numero_base),' +
          'proyecto:proyectos(nombre),' +
          'cliente_id, cliente_nombre_libre,' +
          'cotizacion_departamentos(cotizacion_subgrupos(cotizacion_items(precio_cliente, cantidad, dias, con_iva, descuento_item, descuento_item_tipo))),' +
          'rodajes:rodajes(id)',
      )
      .or('estado.in.(aprobada,en_produccion),fecha_factura_emitida.not.is.null'),

    // Colaboradores con contratos y señal de onboarding completado.
    admin
      .from('colaboradores')
      .select(
        'id, nombre, contrato_marco,' +
          'contratos_generados(id, tipo, firmado, created_at),' +
          'colaboradores_links_temporales(id, tipo, used_at)',
      )
      .eq('disponible', true),
  ])

  const firstError = eGP || eGM || eCot || eColab
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 })
  }

  // ── Normalizar gastos ─────────────────────────────────────────────────────

  const gastos: GastoAudit[] = [
    ...(gastosProyData ?? []).map((g: any): GastoAudit => ({
      id: g.id,
      origen: 'proyecto',
      tipo_documento: g.tipo_documento ?? null,
      folio: g.folio ?? null,
      rut_emisor: g.rut_emisor ?? null,
      razon_social_emisor: g.razon_social_emisor ?? null,
      monto: g.monto ?? 0,
      fecha_documento: g.fecha_documento ?? g.created_at?.slice(0, 10) ?? null,
      contexto: (g.rendicion as any)?.cotizacion?.grupo?.numero_base ?? null,
      descripcion: g.descripcion ?? null,
    })),
    ...(gastosMensData ?? []).map((g: any): GastoAudit => ({
      id: g.id,
      origen: 'mensual',
      tipo_documento: g.tipo_documento ?? null,
      folio: g.folio ?? null,
      rut_emisor: g.rut_emisor ?? null,
      razon_social_emisor: g.razon_social_emisor ?? null,
      monto: g.monto ?? 0,
      fecha_documento: g.fecha_documento ?? g.created_at?.slice(0, 10) ?? null,
      contexto: (g.rendicion_mensual as any)?.periodo?.slice(0, 7) ?? null,
      descripcion: g.descripcion ?? null,
    })),
  ]

  // ── Normalizar cotizaciones ───────────────────────────────────────────────

  const cotizaciones: CotizacionAudit[] = (cotizData ?? []).map((c: any): CotizacionAudit => {
    // Calcular monto total (mismo patrón que financiero-helpers pero aquí simplificado:
    // sumamos precio_cliente × cantidad × dias, respetando "con_iva" del ítem).
    // NOTE: para el auditor no necesitamos el cálculo exacto — el flag estancado
    // no depende del monto exacto. Usamos una aproximación plana.
    let monto = 0
    const deptos: any[] = c.cotizacion_departamentos ?? []
    for (const d of deptos) {
      for (const sg of (d.cotizacion_subgrupos ?? []) as any[]) {
        for (const item of (sg.cotizacion_items ?? []) as any[]) {
          const precio = item.precio_cliente ?? 0
          const cantidad = item.cantidad ?? 1
          const dias = item.dias ?? 1
          monto += precio * cantidad * dias
        }
      }
    }

    // Cliente: nombre libre o placeholder (el agente mostrará el ID si no hay nombre).
    const cliente: string | null = c.cliente_nombre_libre ?? null

    // Tiene rodaje: el join trae array (puede ser [] si no tiene).
    const tiene_rodaje = Array.isArray(c.rodajes) && c.rodajes.length > 0

    return {
      id: c.id,
      numero: (c.grupo as any)?.numero_base ?? null,
      cliente,
      estado: c.estado,
      monto,
      fecha_respuesta_cliente: c.fecha_respuesta_cliente ?? null,
      fecha_factura_emitida: c.fecha_factura_emitida ?? null,
      tiene_rodaje,
    }
  })

  // ── Normalizar colaboradores ──────────────────────────────────────────────

  const colaboradores: ColaboradorAudit[] = (colabData ?? []).map(
    (c: any): ColaboradorAudit => {
      const links: any[] = c.colaboradores_links_temporales ?? []
      const onboarding_completado = links.some(
        (l) => l.tipo === 'onboarding' && l.used_at != null,
      )
      return {
        id: c.id,
        nombre: c.nombre,
        contrato_marco: c.contrato_marco ?? false,
        contratos: (c.contratos_generados ?? []).map((k: any) => ({
          id: k.id,
          tipo: k.tipo,
          firmado: k.firmado ?? false,
          created_at: k.created_at,
        })),
        onboarding_completado,
      }
    },
  )

  // ── Aplicar reglas ────────────────────────────────────────────────────────

  const resultado = aplicarReglas({
    gastos,
    cotizaciones,
    colaboradores,
    config: {
      aging_dias,
      dias_sin_factura,
      dias_sin_rodaje,
      ventana_duplicados_dias,
      hoy,
    },
  })

  // ── Respuesta ─────────────────────────────────────────────────────────────

  return NextResponse.json({
    resumen: {
      total: resultado.total,
      alta: resultado.alta.length,
      media: resultado.media.length,
      info: resultado.info.length,
    },
    hallazgos: {
      alta: resultado.alta,
      media: resultado.media,
      info: resultado.info,
    },
    config_usada: {
      aging_dias,
      dias_sin_factura,
      dias_sin_rodaje,
      ventana_duplicados_dias,
      hoy,
    },
    calculado_en: resultado.calculado_en,
  })
}
