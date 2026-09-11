import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { cargarCrono, cargarFeriados, serializarCrono, urlCrono } from '@/lib/agent-crono'

export const runtime = 'nodejs'

// POST /api/agent/crono-variante (JSON) — { crono_id, nombre }
// Duplica un crono como variante del mismo grupo (espejo de duplicarComoVariante
// en app/actions/cronos.ts): ficha + etapas + hitos + compuertas, re-enganchando
// los checks automáticos a los hitos copiados. Nace en borrador. Reversible con
// /deshacer (borra la variante en cascada).
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
  const variante = typeof body?.nombre === 'string' ? body.nombre.trim() : ''
  if (!crono_id) return NextResponse.json({ error: 'Falta crono_id' }, { status: 400 })
  if (!variante) return NextResponse.json({ error: 'Falta "nombre" (nombre corto de la variante)' }, { status: 400 })

  const admin = createAdminClient()
  const origen = await cargarCrono(admin, crono_id)
  if (!origen) return NextResponse.json({ error: 'Crono no encontrado' }, { status: 404 })

  const { id: _id, created_at: _c, updated_at: _u, hitos, compuertas, proyecto: _p, ...ficha } = origen
  const { data: nuevo, error: e1 } = await admin
    .from('cronos')
    .insert({ ...ficha, variante_de: origen.variante_de ?? origen.id, variante, estado: 'borrador' })
    .select('id')
    .single()
  if (e1 || !nuevo) {
    await registrarAccion({ herramienta: 'crono-variante', payload: body, ok: false, error: e1?.message ?? 'No se pudo crear la variante' })
    return NextResponse.json({ error: e1?.message ?? 'No se pudo crear la variante' }, { status: 500 })
  }
  const nuevoId = nuevo.id as string

  const mapa = new Map<string, string>()
  const filasH = (hitos ?? []).map((h) => {
    const nid = crypto.randomUUID()
    mapa.set(h.id, nid)
    const { id: _hid, crono_id: _cid, created_at: _hc, updated_at: _hu, ...resto } = h
    return { ...resto, id: nid, crono_id: nuevoId }
  })
  const filasC = (compuertas ?? []).map((c) => {
    const { id: _cid2, crono_id: _cc, created_at: _cc2, updated_at: _cu, ...resto } = c
    return { ...resto, crono_id: nuevoId, hito_id: c.hito_id ? mapa.get(c.hito_id) ?? null : null }
  })
  const abortar = async (msg: string) => {
    await admin.from('cronos').delete().eq('id', nuevoId)
    await registrarAccion({ herramienta: 'crono-variante', payload: body, ok: false, error: msg })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  if (filasH.length > 0) {
    const { error: e2 } = await admin.from('crono_hitos').insert(filasH)
    if (e2) return abortar(e2.message)
  }
  if (filasC.length > 0) {
    const { error: e3 } = await admin.from('crono_compuertas').insert(filasC)
    if (e3) return abortar(e3.message)
  }

  const accionId = await registrarAccion({ herramienta: 'crono-variante', payload: body, resultado_tabla: 'cronos', resultado_id: nuevoId, ok: true })
  const [fresco, feriados] = await Promise.all([cargarCrono(admin, nuevoId), cargarFeriados(admin)])
  return NextResponse.json({ ok: true, accion_id: accionId, crono_id: nuevoId, url: urlCrono(nuevoId), crono: fresco ? serializarCrono(fresco, feriados) : null })
}
