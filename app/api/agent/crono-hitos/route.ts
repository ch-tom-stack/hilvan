import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { cargarCrono, cargarFeriados, serializarCrono } from '@/lib/agent-crono'
import { normalizarHito, type HitoEntrada } from '@/lib/crono'
import type { CronoHito } from '@/types'

export const runtime = 'nodejs'

const ACCIONES = ['reemplazar', 'agregar', 'editar', 'eliminar']

function filaDe(cronoId: string, h: HitoEntrada, orden: number) {
  return {
    ...(h.id ? { id: h.id } : {}),
    crono_id: cronoId,
    orden,
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
  }
}

// POST /api/agent/crono-hitos (JSON)
//   { crono_id, accion: 'reemplazar'|'agregar'|'editar'|'eliminar',
//     hitos?: [...]      (reemplazar, agregar)
//     hito_id?, campos?  (editar, eliminar) }
// Escribe los hitos del calendario. "reemplazar" pisa el conjunto completo (lo
// natural para cargar un crono de una vez). Reversible con /deshacer: restaura el
// conjunto COMPLETO anterior (payload.previo).
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const crono_id = typeof body?.crono_id === 'string' ? body.crono_id : ''
  if (!crono_id) return NextResponse.json({ error: 'Falta crono_id' }, { status: 400 })
  const accion = body?.accion
  if (!ACCIONES.includes(accion)) return NextResponse.json({ error: `accion debe ser: ${ACCIONES.join(', ')}` }, { status: 400 })

  const admin = createAdminClient()
  const crono = await cargarCrono(admin, crono_id)
  if (!crono) return NextResponse.json({ error: 'Crono no encontrado' }, { status: 404 })
  const previo = (crono.hitos ?? []) as CronoHito[]

  // Parsear y validar TODO antes de la primera escritura.
  if (accion === 'reemplazar' || accion === 'agregar') {
    const hitosIn = Array.isArray(body?.hitos) ? body.hitos : null
    if (!hitosIn) return NextResponse.json({ error: 'Falta "hitos" (array)' }, { status: 400 })
    const hitos: HitoEntrada[] = hitosIn.map(normalizarHito)
    if (accion === 'reemplazar') {
      const { error: eDel } = await admin.from('crono_hitos').delete().eq('crono_id', crono_id)
      if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 })
      if (hitos.length > 0) {
        const { error: eIns } = await admin.from('crono_hitos').insert(hitos.map((h, i) => filaDe(crono_id, { ...h, id: undefined }, i)))
        if (eIns) {
          // Intentar dejar el conjunto anterior de vuelta antes de fallar.
          await admin.from('crono_hitos').insert(previo.map(({ created_at: _c, updated_at: _u, ...p }) => p))
          return NextResponse.json({ error: eIns.message }, { status: 500 })
        }
      }
    } else {
      if (hitos.length === 0) return NextResponse.json({ error: '"hitos" está vacío' }, { status: 400 })
      const base = previo.length
      const { error: eIns } = await admin.from('crono_hitos').insert(hitos.map((h, i) => filaDe(crono_id, { ...h, id: undefined }, base + i)))
      if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 })
    }
  } else {
    const hito_id = typeof body?.hito_id === 'string' ? body.hito_id : ''
    const existente = previo.find((h) => h.id === hito_id)
    if (!existente) return NextResponse.json({ error: 'hito_id no encontrado en este crono' }, { status: 404 })
    if (accion === 'eliminar') {
      const { error } = await admin.from('crono_hitos').delete().eq('id', hito_id).eq('crono_id', crono_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const campos = body?.campos && typeof body.campos === 'object' ? body.campos : null
      if (!campos) return NextResponse.json({ error: 'Falta "campos" para editar' }, { status: 400 })
      // Mezclar sobre el existente y re-normalizar: así un `fecha_fin` anterior a la
      // nueva `fecha` cae a null en vez de quedar inconsistente.
      const mezcla = normalizarHito({ ...existente, ...campos, id: hito_id })
      const { id: _id, ...update } = filaDe(crono_id, mezcla, existente.orden)
      const { error } = await admin.from('crono_hitos').update(update).eq('id', hito_id).eq('crono_id', crono_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const accionId = await registrarAccion({
    herramienta: 'crono-hitos',
    payload: { ...body, previo: previo.map(({ created_at: _c, updated_at: _u, ...p }) => p) },
    resultado_tabla: 'cronos',
    resultado_id: crono_id,
    ok: true,
  })
  const [fresco, feriados] = await Promise.all([cargarCrono(admin, crono_id), cargarFeriados(admin)])
  return NextResponse.json({ ok: true, accion_id: accionId, accion, crono: fresco ? serializarCrono(fresco, feriados) : null })
}
