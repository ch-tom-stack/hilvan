import { NextResponse } from 'next/server'
import { requireAgentToken } from '@/lib/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAccion } from '@/lib/agent-audit'
import { bloqueosCotizacion, capturarArbolCotizacion, borrarCotizacion } from '@/lib/cotizaciones-eliminar'

export const runtime = 'nodejs'

// POST /api/agent/cotizacion-eliminar (JSON: { cotizacion_id } | { numero })
// Elimina UNA cotización (versión/variante). Borrado real y reversible: el
// árbol completo (grupo numerado si era la última versión, cotización, grupos,
// sub-grupos e ítems) queda en la acción y /deshacer lo reinserta con los
// mismos ids. Se niega si tiene rendiciones, gastos rendidos o rodajes.
// `numero` solo sirve si el grupo tiene un único documento.
export async function POST(req: Request) {
  const unauthorized = requireAgentToken(req)
  if (unauthorized) return unauthorized

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const admin = createAdminClient()
  let cotizacionId = typeof body?.cotizacion_id === 'string' ? body.cotizacion_id.trim() : ''
  if (!cotizacionId) {
    const numero = typeof body?.numero === 'string' ? body.numero.trim() : ''
    if (!numero) return NextResponse.json({ error: 'Se requiere cotizacion_id o numero' }, { status: 400 })
    const { data: grupo } = await admin.from('cotizacion_grupos').select('id').eq('numero_base', numero).maybeSingle()
    if (!grupo) return NextResponse.json({ error: `No existe la cotización "${numero}"` }, { status: 404 })
    const { data: cots } = await admin.from('cotizaciones').select('id, version, variante, estado').eq('grupo_id', grupo.id)
    if (!cots || cots.length === 0) return NextResponse.json({ error: `"${numero}" no tiene documentos` }, { status: 404 })
    if (cots.length > 1) {
      return NextResponse.json({ error: `"${numero}" tiene ${cots.length} documentos; indica cotizacion_id`, documentos: cots }, { status: 400 })
    }
    cotizacionId = cots[0].id
  }

  const bloqueos = await bloqueosCotizacion(admin, cotizacionId)
  if (bloqueos.length > 0) {
    return NextResponse.json({ error: `No se puede eliminar: ${bloqueos.join('; ')}.` }, { status: 400 })
  }
  const arbol = await capturarArbolCotizacion(admin, cotizacionId)
  if (!arbol) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })

  const fallo = await borrarCotizacion(admin, cotizacionId, arbol)
  if (fallo) {
    await registrarAccion({ herramienta: 'cotizacion-eliminar', payload: { cotizacion_id: cotizacionId }, ok: false, error: fallo })
    return NextResponse.json({ error: fallo }, { status: 500 })
  }

  await registrarAccion({
    herramienta: 'cotizacion-eliminar',
    payload: { cotizacion_id: cotizacionId, numero: arbol.numero, nombre: arbol.nombre, version: arbol.version, variante: arbol.variante, borro_grupo: arbol.borraGrupo, items: arbol.items, op: arbol.op },
    resultado_tabla: 'cotizaciones',
    resultado_id: cotizacionId,
    ok: true,
  })

  return NextResponse.json({
    ok: true, cotizacion_id: cotizacionId, numero: arbol.numero, nombre: arbol.nombre,
    version: arbol.version, variante: arbol.variante, items_borrados: arbol.items,
    grupo_borrado: arbol.borraGrupo,
    nota: arbol.borraGrupo ? `Era el único documento: el número ${arbol.numero} queda libre pero NO se reutiliza (contador continuo).` : 'El grupo conserva sus otras versiones/variantes.',
  })
}
