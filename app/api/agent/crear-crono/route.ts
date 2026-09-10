import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { cargarCrono, cargarFeriados, serializarCrono, urlCrono } from '@/lib/agent-crono'
import { columnasEtapasDesde, compuertasPorDefecto, normalizarHito, rangoInvertido, type HitoEntrada } from '@/lib/crono'

export const runtime = 'nodejs'

const ESTADOS = ['borrador', 'vigente', 'cerrado']

// POST /api/agent/crear-crono (JSON)
//   { nombre, proyecto_id?, cliente?, responsable?, notas?, estado?,
//     etapas?: { desarrollo?: {desde, hasta}, pre?: {...}, produccion?: {...}, post?: {...} },
//     hitos?: [{ tipo, titulo?, fecha?, fecha_fin?, etapa?, monto?, notas?, hecho?, rodaje_id? }] }
// Crea el crono completo en una llamada. Reversible con /deshacer (borra el crono
// y sus hitos en cascada).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'Falta "nombre"' }, { status: 400 })
  const estado = ESTADOS.includes(body?.estado) ? body.estado : 'borrador'
  const proyecto_id = typeof body?.proyecto_id === 'string' && body.proyecto_id ? body.proyecto_id : null
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const cols = columnasEtapasDesde(body?.etapas)
  for (const k of ['desarrollo', 'pre', 'produccion', 'post'] as const) {
    const d = cols[`${k}_desde`] ?? null
    const h = cols[`${k}_hasta`] ?? null
    if (rangoInvertido(d, h)) return NextResponse.json({ error: `La etapa ${k} termina antes de empezar` }, { status: 400 })
  }
  // Validar TODOS los hitos antes de escribir nada.
  const hitosIn = Array.isArray(body?.hitos) ? body.hitos : []
  const hitos: HitoEntrada[] = hitosIn.map(normalizarHito)

  const admin = createAdminClient()
  if (proyecto_id) {
    const { data: proy } = await admin.from('proyectos').select('id').eq('id', proyecto_id).maybeSingle()
    if (!proy) return NextResponse.json({ error: 'proyecto_id no encontrado' }, { status: 404 })
  }

  const { data: fila, error } = await admin
    .from('cronos')
    .insert({
      nombre,
      proyecto_id,
      cliente: texto(body?.cliente),
      responsable: texto(body?.responsable),
      notas: texto(body?.notas),
      estado,
      ...cols,
    })
    .select('id')
    .single()
  if (error || !fila) {
    await registrarAccion({ herramienta: 'crear-crono', payload: body, ok: false, error: error?.message ?? 'No se pudo crear el crono' })
    return NextResponse.json({ error: error?.message ?? 'No se pudo crear el crono' }, { status: 500 })
  }
  const cronoId = fila.id as string

  if (hitos.length > 0) {
    const { error: eH } = await admin.from('crono_hitos').insert(
      hitos.map((h, i) => ({
        crono_id: cronoId,
        orden: i,
        tipo: h.tipo,
        titulo: h.titulo,
        fecha: h.fecha,
        fecha_fin: h.fecha_fin,
        etapa: h.etapa,
        monto: h.monto,
        notas: h.notas,
        responsable: h.responsable,
        destacado: h.destacado,
        hecho: h.hecho,
        rodaje_id: h.rodaje_id,
      })),
    )
    if (eH) {
      await registrarAccion({ herramienta: 'crear-crono', payload: { ...body, parcial: true, error: eH.message }, resultado_tabla: 'cronos', resultado_id: cronoId, ok: true })
      return NextResponse.json({ error: `Crono creado pero fallaron los hitos: ${eH.message}`, crono_id: cronoId, url: urlCrono(cronoId) }, { status: 500 })
    }
  }

  // Compuertas sugeridas, enganchadas a los hitos recién creados (automáticas donde
  // existe el hito; manuales donde no). Si falla, el crono igual queda creado.
  const { data: hitosCreados } = await admin.from('crono_hitos').select('id, tipo, fecha, orden').eq('crono_id', cronoId)
  const { error: eC } = await admin.from('crono_compuertas').insert(compuertasPorDefecto((hitosCreados ?? []) as any).map((c) => ({ ...c, crono_id: cronoId })))
  if (eC) console.error('[crear-crono] compuertas:', eC.message)

  const accionId = await registrarAccion({ herramienta: 'crear-crono', payload: body, resultado_tabla: 'cronos', resultado_id: cronoId, ok: true })
  const [crono, feriados] = await Promise.all([cargarCrono(admin, cronoId), cargarFeriados(admin)])
  return NextResponse.json({
    ok: true,
    accion_id: accionId,
    crono_id: cronoId,
    url: urlCrono(cronoId),
    hitos_creados: hitos.length,
    crono: crono ? serializarCrono(crono, feriados) : null,
  })
}
