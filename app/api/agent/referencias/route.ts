import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { opInsert, opUpdate, type Fila } from '@/lib/historial'
import { calcularTotalCot, clienteCot, nombreCot, COT_COBRAR_SELECT } from '@/app/actions/financiero-helpers'
import {
  estadoReferencias,
  leerCorreoReferencia,
  validarReferencia,
  type Referencia,
} from '@/lib/cotizacion-referencias'
import { COLUMNAS_REFERENCIA, exigenciasDe, referenciasDe } from '@/lib/cotizacion-referencias-io'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

// POST /api/agent/referencias (JSON) — OC / HES de las cotizaciones.
//   { accion: "pendientes" }
//       Cotizaciones aprobadas / en producción sin factura, con su estado de OC y HES
//       (lo que exige el cliente), sus referencias, y los correos ya procesados
//       (correos_vistos) para que la lectura del correo no repita nada.
//   { accion: "proponer", cotizacion_id, correo: {id, remitente, asunto, cuerpo?, fecha},
//     referencias?: [{tipo, folio?, fecha?, monto?, glosa?}], nota? }
//       Deja PROPUESTAS (no confirma). Si no se pasan `referencias`, se leen del correo
//       con los formatos conocidos (lib/cotizacion-referencias.ts). Idempotente por
//       cotización + correo. Tomás confirma en Hilván o por chat.
//   { accion: "confirmar", referencia_id, folio?, fecha?, monto?, glosa? }
//       SOLO con el OK explícito de Tomás. Completa y confirma una propuesta.
// Escrituras reversibles con hilvan_deshacer (herramienta referencia-*).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const admin = createAdminClient()

  if (body?.accion === 'pendientes') {
    const { data: cots, error } = await admin
      .from('cotizaciones')
      .select(`${COT_COBRAR_SELECT}, cliente_id, agencia_id`)
      .in('estado', ['aprobada', 'en_produccion'])
      .is('fecha_factura_emitida', null)
      .order('fecha_respuesta_cliente', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const ids = (cots ?? []).map((c: any) => c.id as string)
    const [refs, exig] = await Promise.all([referenciasDe(admin, ids), exigenciasDe(admin, ids)])
    if (!refs.ok) return NextResponse.json({ error: refs.error }, { status: 500 })
    if (!exig.ok) return NextResponse.json({ error: exig.error }, { status: 500 })

    const { data: vistos, error: eV } = await admin
      .from('cotizacion_referencias')
      .select('correo_id')
      .not('correo_id', 'is', null)
      .gte('created_at', new Date(Date.now() - 120 * 86_400_000).toISOString())
    if (eV) return NextResponse.json({ error: eV.message }, { status: 500 })

    const cotizaciones = (cots ?? []).map((c: any) => {
      const rs = (refs.valor.get(c.id) ?? []).filter((r) => r.estado !== 'descartada')
      const exige = exig.valor.get(c.id) ?? { oc: false, hes: false }
      return {
        id: c.id,
        numero: c.grupo?.numero_base ?? null,
        nombre: nombreCot(c),
        cliente: clienteCot(c),
        neto_aprox: calcularTotalCot(c),
        aprobada: c.fecha_respuesta_cliente ?? null,
        exige,
        ...estadoReferencias(rs, exige),
        referencias: rs.map((r) => ({ id: r.id, tipo: r.tipo, folio: r.folio, fecha: r.fecha, estado: r.estado })),
      }
    })
    return NextResponse.json({
      cotizaciones,
      correos_vistos: [...new Set((vistos ?? []).map((v: any) => v.correo_id as string))],
      nota: 'oc/hes: confirmada | propuesta (por confirmar) | falta (el cliente la exige) | no_aplica. neto_aprox es el total de la cotización.',
    })
  }

  if (body?.accion === 'proponer') {
    const cotizacion_id = String(body.cotizacion_id ?? '')
    if (!UUID.test(cotizacion_id)) return NextResponse.json({ error: 'cotizacion_id inválido' }, { status: 400 })
    const c = body.correo ?? {}
    const correo = {
      id: texto(c.id, 200),
      remitente: texto(c.remitente, 200) ?? '',
      asunto: texto(c.asunto, 300) ?? '',
      cuerpo: typeof c.cuerpo === 'string' ? c.cuerpo.slice(0, 20000) : '',
      fecha: texto(c.fecha, 40) ?? '',
    }
    if (!correo.id) return NextResponse.json({ error: 'Falta correo.id (id del mensaje de Gmail)' }, { status: 400 })
    if (!correo.fecha || Number.isNaN(new Date(correo.fecha).getTime())) {
      return NextResponse.json({ error: 'Falta correo.fecha (ISO)' }, { status: 400 })
    }

    const { data: cot, error: eC } = await admin.from('cotizaciones').select('id').eq('id', cotizacion_id).maybeSingle()
    if (eC) return NextResponse.json({ error: eC.message }, { status: 500 })
    if (!cot) return NextResponse.json({ error: 'La cotización no existe' }, { status: 404 })

    // Ya procesado: devolver lo que hay (propuesto, confirmado o descartado).
    const { data: previas, error: eP } = await admin
      .from('cotizacion_referencias').select(COLUMNAS_REFERENCIA)
      .eq('cotizacion_id', cotizacion_id).eq('correo_id', correo.id)
    if (eP) return NextResponse.json({ error: eP.message }, { status: 500 })
    if (previas?.length) {
      return NextResponse.json({ creadas: [], ya_existian: previas, nota: 'Este correo ya se había procesado para esta cotización.' })
    }

    const crudas: Record<string, unknown>[] = Array.isArray(body.referencias) && body.referencias.length
      ? body.referencias
      : leerCorreoReferencia(correo)
    if (!crudas.length) {
      return NextResponse.json({ error: 'El correo no trae una referencia reconocible: pasa `referencias` explícitas o no la propongas' }, { status: 422 })
    }
    const filas = []
    for (const r of crudas) {
      const v = validarReferencia(r, { confirmada: false })
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      filas.push({
        cotizacion_id, ...v.valor,
        estado: 'propuesta', fuente: 'correo',
        correo_id: correo.id, correo_remitente: correo.remitente || null, correo_asunto: correo.asunto || null, correo_fecha: correo.fecha,
        nota: texto(body.nota, 500) ?? texto((r as any).nota, 500),
      })
    }
    // El índice (cotización, correo) es único: una referencia por correo y cotización.
    // Si un correo trae OC y HES, la HES va como segunda fila con el id del correo + "#hes".
    filas.forEach((f, i) => { if (i > 0) f.correo_id = `${correo.id}#${f.tipo}` })

    const { data: creadas, error: eI } = await admin.from('cotizacion_referencias').insert(filas).select('*')
    if (eI) {
      return NextResponse.json({ error: eI.code === '23505' ? 'Esa referencia ya está en la cotización' : eI.message }, { status: eI.code === '23505' ? 409 : 500 })
    }
    const accion_id = await registrarAccion({
      herramienta: 'referencia-proponer',
      payload: { op: opInsert('cotizacion_referencias', (creadas ?? []) as Fila[]) },
      resultado_tabla: 'cotizacion_referencias',
      resultado_id: creadas?.[0]?.id ?? null,
      ok: true,
    })
    return NextResponse.json({ creadas, accion_id, nota: 'Quedaron como PROPUESTAS: Tomás las confirma en el Panel de facturación de la cotización (o te dice que las confirmes).' })
  }

  if (body?.accion === 'confirmar') {
    const id = String(body.referencia_id ?? '')
    if (!UUID.test(id)) return NextResponse.json({ error: 'referencia_id inválido' }, { status: 400 })
    const { data: antes, error: e1 } = await admin.from('cotizacion_referencias').select('*').eq('id', id).maybeSingle()
    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
    if (!antes) return NextResponse.json({ error: 'La referencia no existe' }, { status: 404 })
    if (antes.estado === 'descartada') return NextResponse.json({ error: 'Tomás descartó esta referencia' }, { status: 409 })
    const cambios = Object.fromEntries(
      ['folio', 'fecha', 'monto', 'glosa'].filter((k) => body[k] !== undefined).map((k) => [k, body[k]]),
    )
    const v = validarReferencia({ ...antes, ...cambios }, { confirmada: true })
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const { data: despues, error } = await admin
      .from('cotizacion_referencias')
      .update({ ...v.valor, estado: 'confirmada', confirmada_at: antes.confirmada_at ?? new Date().toISOString() })
      .eq('id', id).select('*').single()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Esa referencia ya está en la cotización' : error.message }, { status: 500 })
    const accion_id = await registrarAccion({
      herramienta: 'referencia-confirmar',
      payload: { op: opUpdate('cotizacion_referencias', [antes as Fila], [despues as Fila]) },
      resultado_tabla: 'cotizacion_referencias',
      resultado_id: id,
      ok: true,
    })
    return NextResponse.json({ referencia: despues as Referencia, accion_id })
  }

  return NextResponse.json({ error: 'accion debe ser pendientes, proponer o confirmar' }, { status: 400 })
}
