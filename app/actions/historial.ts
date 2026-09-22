'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aplicar, type Op } from '@/lib/historial'

// Ctrl+Z / Ctrl+Shift+Z. La pila vive en acciones_ui, por usuario y por ruta:
// deshaces TUS acciones, en la pantalla donde estás, de las últimas 48 horas.

const VENTANA_MS = 48 * 60 * 60 * 1000

type Resultado = { ok: true; descripcion: string } | { ok: false; error: string; nada?: boolean }

async function usuarioActual(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Las acciones de esta ruta: la ruta guardada es prefijo de la actual (/rodaje/<id> cubre /rodaje/<id>/equipo). */
function filtroRuta(ruta: string): string[] {
  const partes = ruta.split('/').filter(Boolean)
  const prefijos: string[] = []
  for (let i = 1; i <= partes.length; i++) prefijos.push('/' + partes.slice(0, i).join('/'))
  return prefijos
}

export async function deshacer(ruta: string): Promise<Resultado> {
  const uid = await usuarioActual()
  if (!uid) return { ok: false, error: 'No autenticado' }
  const admin = createAdminClient()
  const desde = new Date(Date.now() - VENTANA_MS).toISOString()

  const { data: accion, error } = await admin
    .from('acciones_ui')
    .select('id, descripcion, ops')
    .eq('usuario_id', uid).eq('deshecha', false)
    .in('ruta', filtroRuta(ruta)).gte('created_at', desde)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!accion) return { ok: false, error: 'Nada que deshacer acá', nada: true }

  const fallo = await aplicar(admin, accion.ops as Op[], 'deshacer')
  if (fallo) return { ok: false, error: `No se pudo deshacer «${accion.descripcion}»: ${fallo}` }

  await admin.from('acciones_ui').update({ deshecha: true, deshecha_at: new Date().toISOString() }).eq('id', accion.id)
  return { ok: true, descripcion: accion.descripcion }
}

export async function rehacer(ruta: string): Promise<Resultado> {
  const uid = await usuarioActual()
  if (!uid) return { ok: false, error: 'No autenticado' }
  const admin = createAdminClient()
  const desde = new Date(Date.now() - VENTANA_MS).toISOString()
  const rutas = filtroRuta(ruta)

  // Rehacer solo lo deshecho DESPUÉS de la última acción nueva: hacer algo
  // nuevo corta la rama de "rehacer", como en cualquier editor.
  const { data: ultimaViva } = await admin
    .from('acciones_ui').select('created_at')
    .eq('usuario_id', uid).eq('deshecha', false).in('ruta', rutas).gte('created_at', desde)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  let q = admin
    .from('acciones_ui').select('id, descripcion, ops')
    .eq('usuario_id', uid).eq('deshecha', true).in('ruta', rutas).gte('created_at', desde)
  if (ultimaViva?.created_at) q = q.gt('deshecha_at', ultimaViva.created_at)
  const { data: accion, error } = await q.order('deshecha_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!accion) return { ok: false, error: 'Nada que rehacer', nada: true }

  const fallo = await aplicar(admin, accion.ops as Op[], 'rehacer')
  if (fallo) return { ok: false, error: `No se pudo rehacer «${accion.descripcion}»: ${fallo}` }

  await admin.from('acciones_ui').update({ deshecha: false, deshecha_at: null }).eq('id', accion.id)
  return { ok: true, descripcion: accion.descripcion }
}
