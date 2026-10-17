'use server'

// Referencias OC/HES de una cotización desde el editor (sección "Referencias" del
// Panel de facturación). Cada acción verifica sesión y queda en el historial
// (Ctrl+Z). Reglas en lib/cotizacion-referencias.ts.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { registrar, opInsert, opUpdate, opDelete, type Fila, type Op } from '@/lib/historial'
import { estadoReferencias, validarReferencia, ETIQUETA_REFERENCIA, type Referencia, type EstadoRef } from '@/lib/cotizacion-referencias'
import { exigenciasDe, referenciasDe } from '@/lib/cotizacion-referencias-io'

async function sesion() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión expirada: vuelve a entrar')
  return { supabase, user }
}

async function historial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  usuarioId: string,
  cotizacion_id: string,
  descripcion: string,
  ops: (Op | null)[],
) {
  await registrar(supabase, usuarioId, { ruta: `/cotizaciones/${cotizacion_id}`, modulo: 'cotizaciones', descripcion, ops })
}

const etiqueta = (r: { tipo: string; folio: string | null }) =>
  `${ETIQUETA_REFERENCIA[r.tipo as keyof typeof ETIQUETA_REFERENCIA] ?? r.tipo}${r.folio ? ` ${r.folio}` : ''}`

export interface ReferenciasCotizacion {
  referencias: Referencia[]
  exige: { oc: boolean; hes: boolean }
  estado: { oc: EstadoRef; hes: EstadoRef }
}

export async function listarReferencias(cotizacion_id: string): Promise<ReferenciasCotizacion> {
  const { supabase } = await sesion()
  const [refs, exig] = await Promise.all([referenciasDe(supabase, [cotizacion_id]), exigenciasDe(supabase, [cotizacion_id])])
  if (!refs.ok) throw new Error(refs.error)
  if (!exig.ok) throw new Error(exig.error)
  const referencias = refs.valor.get(cotizacion_id) ?? []
  const exige = exig.valor.get(cotizacion_id) ?? { oc: false, hes: false }
  return { referencias, exige, estado: estadoReferencias(referencias, exige) }
}

/** Una referencia escrita a mano: queda confirmada. */
export async function agregarReferencia(cotizacion_id: string, datos: Record<string, unknown>): Promise<void> {
  const { supabase, user } = await sesion()
  const v = validarReferencia(datos, { confirmada: true })
  if (!v.ok) throw new Error(v.error)
  const ahora = new Date().toISOString()
  const { data, error } = await supabase
    .from('cotizacion_referencias')
    .insert({ cotizacion_id, ...v.valor, estado: 'confirmada', fuente: 'manual', created_by: user.id, confirmada_at: ahora, confirmada_por: user.id })
    .select('*')
    .single()
  if (error) throw new Error(error.code === '23505' ? 'Esa referencia ya está en la cotización' : error.message)
  await historial(supabase, user.id, cotizacion_id, `Agregar referencia ${etiqueta(v.valor)}`, [opInsert('cotizacion_referencias', [data as Fila])])
  revalidatePath(`/cotizaciones/${cotizacion_id}`)
}

/**
 * Confirmar una propuesta (o corregir una confirmada). Lo que venga en `datos`
 * reemplaza lo propuesto; el resultado debe tener folio y fecha.
 */
export async function confirmarReferencia(id: string, datos: Record<string, unknown> = {}): Promise<void> {
  const { supabase, user } = await sesion()
  const { data: antes, error: e1 } = await supabase.from('cotizacion_referencias').select('*').eq('id', id).single()
  if (e1 || !antes) throw new Error('La referencia ya no existe')
  const mezcla = { ...antes, ...Object.fromEntries(Object.entries(datos).filter(([, x]) => x !== undefined)) }
  const v = validarReferencia(mezcla, { confirmada: true })
  if (!v.ok) throw new Error(v.error)
  const cambios: Record<string, unknown> = { ...v.valor }
  if (antes.estado !== 'confirmada') {
    cambios.estado = 'confirmada'
    cambios.confirmada_at = new Date().toISOString()
    cambios.confirmada_por = user.id
  }
  const { data: despues, error } = await supabase
    .from('cotizacion_referencias').update(cambios).eq('id', id).select('*').single()
  if (error) throw new Error(error.code === '23505' ? 'Esa referencia ya está en la cotización' : error.message)
  const verbo = antes.estado === 'confirmada' ? 'Editar' : 'Confirmar'
  await historial(supabase, user.id, antes.cotizacion_id, `${verbo} referencia ${etiqueta(despues)}`, [
    opUpdate('cotizacion_referencias', [antes as Fila], [despues as Fila]),
  ])
  revalidatePath(`/cotizaciones/${antes.cotizacion_id}`)
}

/**
 * Quitar una referencia. Una PROPUESTA del correo no se borra: queda 'descartada'
 * para que la lectura del correo no la vuelva a proponer. Una confirmada se borra.
 */
export async function eliminarReferencia(id: string): Promise<void> {
  const { supabase, user } = await sesion()
  const { data: fila, error: e1 } = await supabase.from('cotizacion_referencias').select('*').eq('id', id).single()
  if (e1 || !fila) throw new Error('La referencia ya no existe')
  if (fila.estado === 'propuesta') {
    const { data: despues, error } = await supabase
      .from('cotizacion_referencias').update({ estado: 'descartada' }).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    await historial(supabase, user.id, fila.cotizacion_id, `Descartar propuesta ${etiqueta(fila)}`, [
      opUpdate('cotizacion_referencias', [fila as Fila], [despues as Fila]),
    ])
  } else {
    const { error } = await supabase.from('cotizacion_referencias').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await historial(supabase, user.id, fila.cotizacion_id, `Eliminar referencia ${etiqueta(fila)}`, [
      opDelete([{ tabla: 'cotizacion_referencias', filas: [fila as Fila] }]),
    ])
  }
  revalidatePath(`/cotizaciones/${fila.cotizacion_id}`)
}
