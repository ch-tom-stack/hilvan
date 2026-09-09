import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { cargarCrono, cargarFeriados, serializarCrono } from '@/lib/agent-crono'
import type { CronoCompuerta, DestinoCompuerta } from '@/types'

export const runtime = 'nodejs'

const DESTINOS: DestinoCompuerta[] = ['pre', 'produccion', 'post', 'cierre']
const ACCIONES = ['reemplazar', 'agregar', 'marcar', 'eliminar']
const UUID_RE = /^[0-9a-f-]{36}$/i

// POST /api/agent/crono-compuertas (JSON)
//   { crono_id, accion: 'reemplazar'|'agregar'|'marcar'|'eliminar',
//     checks?: [{ destino, texto, hito_id?, responsable? }]   (reemplazar, agregar)
//     check_id?, hecho?                                         (marcar, eliminar) }
// Los checks con hito_id son automáticos: se marcan solos cuando ese hito está
// hecho — `marcar` sobre uno automático se rechaza. Reversible con /deshacer
// (restaura el conjunto anterior completo).
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
  const previo = (crono.compuertas ?? []) as CronoCompuerta[]
  const idsHitos = new Set((crono.hitos ?? []).map((h) => h.id))

  if (accion === 'reemplazar' || accion === 'agregar') {
    const entrada = Array.isArray(body?.checks) ? body.checks : null
    if (!entrada) return NextResponse.json({ error: 'Falta "checks" (array)' }, { status: 400 })
    const filas: { crono_id: string; destino: DestinoCompuerta; orden: number; texto: string; hito_id: string | null; responsable: string | null; hecho: boolean }[] = []
    const base = accion === 'agregar' ? previo.length : 0
    for (let i = 0; i < entrada.length; i++) {
      const c = entrada[i] ?? {}
      if (!DESTINOS.includes(c.destino)) return NextResponse.json({ error: `checks[${i}].destino debe ser: ${DESTINOS.join(', ')}` }, { status: 400 })
      const texto = typeof c.texto === 'string' ? c.texto.trim() : ''
      if (!texto) return NextResponse.json({ error: `checks[${i}] sin texto` }, { status: 400 })
      const hito_id = typeof c.hito_id === 'string' && UUID_RE.test(c.hito_id) ? c.hito_id : null
      if (hito_id && !idsHitos.has(hito_id)) return NextResponse.json({ error: `checks[${i}].hito_id no es un hito de este crono` }, { status: 400 })
      filas.push({ crono_id, destino: c.destino, orden: base + i, texto, hito_id, responsable: typeof c.responsable === 'string' && c.responsable.trim() ? c.responsable.trim() : null, hecho: c.hecho === true })
    }
    if (accion === 'reemplazar') {
      const { error: eDel } = await admin.from('crono_compuertas').delete().eq('crono_id', crono_id)
      if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 })
    }
    if (filas.length > 0) {
      const { error: eIns } = await admin.from('crono_compuertas').insert(filas)
      if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 })
    }
  } else {
    const check_id = typeof body?.check_id === 'string' ? body.check_id : ''
    const existente = previo.find((c) => c.id === check_id)
    if (!existente) return NextResponse.json({ error: 'check_id no encontrado en este crono' }, { status: 404 })
    if (accion === 'eliminar') {
      const { error } = await admin.from('crono_compuertas').delete().eq('id', check_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      if (existente.hito_id) return NextResponse.json({ error: 'Ese check es automático: se marca solo cuando su hito esté hecho (usa hilvan_crono_hitos para marcar el hito).' }, { status: 400 })
      const { error } = await admin.from('crono_compuertas').update({ hecho: body?.hecho !== false }).eq('id', check_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const accionId = await registrarAccion({
    herramienta: 'crono-compuertas',
    payload: { ...body, previo: previo.map(({ created_at: _c, updated_at: _u, ...p }) => p) },
    resultado_tabla: 'cronos',
    resultado_id: crono_id,
    ok: true,
  })
  const [fresco, feriados] = await Promise.all([cargarCrono(admin, crono_id), cargarFeriados(admin)])
  return NextResponse.json({ ok: true, accion_id: accionId, accion, compuertas: fresco ? serializarCrono(fresco, feriados).compuertas : null })
}
