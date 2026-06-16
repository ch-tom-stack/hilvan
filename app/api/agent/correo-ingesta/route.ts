/**
 * ingesta.route.draft.ts
 * POST /api/agent/correo-ingesta  (propuesta — NO incorporado a producción)
 *
 * Recibe uno o varios documentos YA PARSEADOS (salida de parsearFacturaSII o
 * equivalente) y devuelve borradores clasificados para revisión humana.
 * NO escribe nada en DB: solo clasifica y verifica dedup contra los gastos
 * existentes. El humano (o el agente) confirma qué hacer con cada borrador.
 *
 * Flujo:
 *  1. Valida el token de agente (requireAgentToken).
 *  2. Carga las claves RUT+folio existentes en DB (últimos 6 meses).
 *  3. Ejecuta el pipeline de clasificarLote() (lógica pura, sin I/O).
 *  4. Devuelve lista de borradores con estado_dedup, origen_propuesto y
 *     sugerencias de categoría/período. Ningún borrador se persiste aquí.
 *
 * Para CONFIRMAR y cargar los documentos 'nuevo' el agente usa
 * hilvan_crear_gastos_bulk (que ya existe y maneja validación + audit log).
 */

import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { clasificarLote, construirClaveDedup, type DocumentoParsado, type TipoDocumento } from '@/lib/agent-correo-ingesta'

export const runtime = 'nodejs'

// ── Validadores de entrada ────────────────────────────────────────────────────

const TIPOS_VALIDOS: TipoDocumento[] = [
  'boleta', 'factura', 'boleta_consumo', 'exenta', 'nota_credito', 'sin_documento',
]

function validarDocumento(raw: unknown, idx: number): DocumentoParsado | string {
  if (!raw || typeof raw !== 'object') return `doc[${idx}]: debe ser un objeto`
  const d = raw as Record<string, unknown>
  if (!d.tipo_doc || !TIPOS_VALIDOS.includes(d.tipo_doc as TipoDocumento)) {
    return `doc[${idx}]: tipo_doc inválido (debe ser ${TIPOS_VALIDOS.join(' | ')})`
  }
  return {
    rut_emisor:   typeof d.rut_emisor === 'string'   ? d.rut_emisor   : null,
    razon_social: typeof d.razon_social === 'string' ? d.razon_social : null,
    folio:        typeof d.folio === 'string'        ? d.folio        : null,
    fecha:        typeof d.fecha === 'string'        ? d.fecha        : null,
    monto:        typeof d.monto === 'number' && d.monto > 0 ? d.monto : null,
    tipo_doc:     d.tipo_doc as TipoDocumento,
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Auth
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  // 2. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const rawDocs = (body as any)?.documentos
  if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
    return NextResponse.json(
      { error: 'Falta "documentos" (array no vacío)' },
      { status: 400 },
    )
  }
  if (rawDocs.length > 50) {
    return NextResponse.json(
      { error: 'Máximo 50 documentos por llamada' },
      { status: 400 },
    )
  }

  // 3. Validar todos los documentos antes de tocar DB
  const documentos: DocumentoParsado[] = []
  for (let i = 0; i < rawDocs.length; i++) {
    const resultado = validarDocumento(rawDocs[i], i)
    if (typeof resultado === 'string') {
      return NextResponse.json({ error: resultado }, { status: 400 })
    }
    documentos.push(resultado)
  }

  // 4. Cargar claves existentes de los últimos 6 meses desde DB
  //    (ventana suficiente para detectar duplicados recientes sin saturar memoria).
  const admin = createAdminClient()
  const hoy = new Date()
  const hace6Meses = new Date(hoy)
  hace6Meses.setMonth(hace6Meses.getMonth() - 6)
  const desde = hace6Meses.toISOString().slice(0, 10)

  const [{ data: gastosProyecto }, { data: gastosMensual }] = await Promise.all([
    admin
      .from('rendicion_gastos')
      .select('rut_emisor, folio')
      .gte('created_at', `${desde}T00:00:00.000Z`)
      .not('rut_emisor', 'is', null)
      .not('folio', 'is', null),
    admin
      .from('rendicion_mensual_gastos')
      .select('rut_emisor, folio')
      .gte('created_at', `${desde}T00:00:00.000Z`)
      .not('rut_emisor', 'is', null)
      .not('folio', 'is', null),
  ])

  const clavesEnDB = new Set<string>()
  for (const g of [...(gastosProyecto ?? []), ...(gastosMensual ?? [])]) {
    const clave = construirClaveDedup(g.rut_emisor, g.folio)
    if (clave) clavesEnDB.add(clave)
  }

  // 5. Pipeline de clasificación (sin I/O)
  const clasificados = clasificarLote(documentos, clavesEnDB)

  // 6. Armar respuesta
  const nuevo   = clasificados.filter((c) => c.estado_dedup === 'nuevo').length
  const existe  = clasificados.filter((c) => c.estado_dedup === 'ya_existe').length
  const dudosos = clasificados.filter((c) => c.estado_dedup === 'dudoso').length

  return NextResponse.json({
    total: clasificados.length,
    resumen: { nuevo, ya_existe: existe, dudoso: dudosos },
    borradores: clasificados.map((c) => ({
      estado_dedup:      c.estado_dedup,
      clave_dedup:       c.clave_dedup,
      origen_propuesto:  c.origen_propuesto,
      categoria_sugerida: c.categoria_sugerida,
      periodo_sugerido:  c.periodo_sugerido,
      fecha_normalizada: c.fecha_normalizada,
      monto:             c.monto,
      motivo_duda:       c.motivo_duda,
      documento: {
        rut_emisor:   c.documento.rut_emisor,
        razon_social: c.documento.razon_social,
        folio:        c.documento.folio,
        tipo_doc:     c.documento.tipo_doc,
      },
    })),
    instruccion:
      'Los borradores con estado_dedup="nuevo" pueden cargarse con hilvan_crear_gastos_bulk. ' +
      'Los "ya_existe" son duplicados probables: no cargar. ' +
      'Los "dudoso" requieren revisión manual antes de decidir.',
  })
}
