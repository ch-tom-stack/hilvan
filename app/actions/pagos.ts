'use server'

// Transferencias masivas de Santander (Financiero → Masivas).
// Todo pasa por lib/pagos-masivos-io.ts con service role, DESPUÉS de validar
// sesión y rol (admin o contabilidad, igual que cuentas por pagar).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { capturar, opDelete, opInsert, opUpdate, registrar, type Fila } from '@/lib/historial'
import { _getNomina } from './financiero-config'
import { limpiarCuenta, limpiarRut, rutValido } from '@/lib/pagos-masivos'
import { bancoPorCodigo } from '@/lib/bancos'
import {
  cerrarPagos, crearLote, gastosPorPagar, guardarCuentas, leerLotes, prepararLote, resolverCuentas,
  type Lote, type PedidoLote,
} from '@/lib/pagos-masivos-io'

const RUTA = '/financiero/masivas'

async function usuarioConRol(): Promise<{ id: string; nombre: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin permisos')
  const { data: profile } = await supabase.from('profiles').select('rol, nombre').eq('id', user.id).single()
  if (!profile || !['admin', 'contabilidad'].includes(profile.rol)) throw new Error('Sin permisos')
  return { id: user.id, nombre: profile.nombre || user.email || 'Hilván' }
}

export interface DatosMasivas {
  lotes: Lote[]
  nomina: { nombre: string; rut: string | null; monto: number; tipo: string; tiene_cuenta: boolean }[]
  gastos: (Awaited<ReturnType<typeof gastosPorPagar>>[number] & { tiene_cuenta: boolean })[]
  cuentasSinColaborador: number
}

export async function getMasivas(): Promise<DatosMasivas> {
  await usuarioConRol()
  const admin = createAdminClient()
  await cerrarPagos(admin)
  const [lotes, nomina, gastos, { count }] = await Promise.all([
    leerLotes(admin, { limite: 20 }),
    _getNomina(),
    gastosPorPagar(admin),
    admin.from('cuentas_bancarias').select('id', { count: 'exact', head: true }).is('colaborador_id', null),
  ])
  const cuentas = await resolverCuentas(admin, [...nomina.map(p => p.rut ?? ''), ...gastos.map(g => g.rut ?? '')])
  const tiene = (rut?: string | null) => !!(rut && cuentas.get(limpiarRut(rut))?.origen)
  return {
    lotes,
    nomina: nomina.map(p => ({ nombre: p.nombre, rut: p.rut ?? null, monto: p.monto, tipo: p.tipo, tiene_cuenta: tiene(p.rut) })),
    gastos: gastos.map(g => ({ ...g, tiene_cuenta: tiene(g.rut) })),
    cuentasSinColaborador: count ?? 0,
  }
}

export async function crearLoteMasivo(pedido: PedidoLote): Promise<{ id?: string; rechazados?: string[]; error?: string }> {
  const u = await usuarioConRol()
  const admin = createAdminClient()
  const prep = await prepararLote(admin, pedido, await _getNomina())
  const r = await crearLote(admin, prep, u.nombre, pedido.notas)
  if ('error' in r) return { error: r.error, rechazados: prep.rechazados }
  await registrar(admin, u.id, {
    ruta: RUTA, modulo: 'financiero', descripcion: `Crear lote "${prep.nombre}" (${r.items.length} pagos)`,
    ops: [opInsert('pagos_lotes', [r.lote as Fila]), opInsert('pagos_lote_items', r.items as Fila[])],
  })
  revalidatePath(RUTA)
  return { id: r.lote.id, rechazados: prep.rechazados }
}

async function editarItem(itemId: string, cambios: Record<string, unknown>, descripcion: string): Promise<{ error?: string }> {
  const u = await usuarioConRol()
  const admin = createAdminClient()
  const antes = await capturar(admin, 'pagos_lote_items', { col: 'id', valor: itemId })
  if (!antes[0]) return { error: 'El pago no existe' }
  if (antes[0].estado === 'pagado') return { error: 'Ese pago ya llegó al banco: no se modifica' }
  const { error } = await admin.from('pagos_lote_items').update(cambios).eq('id', itemId)
  if (error) return { error: error.message }
  const despues = await capturar(admin, 'pagos_lote_items', { col: 'id', valor: itemId })
  await registrar(admin, u.id, { ruta: RUTA, modulo: 'financiero', descripcion, ops: [opUpdate('pagos_lote_items', antes, despues)] })
  revalidatePath(RUTA)
  return {}
}

export async function anularPagoMasivo(itemId: string, anular: boolean) {
  return editarItem(itemId, { estado: anular ? 'anulado' : 'pendiente' }, anular ? 'Anular pago del lote' : 'Reactivar pago del lote')
}

export async function editarPagoMasivo(itemId: string, datos: { monto?: number; glosa?: string }) {
  const cambios: Record<string, unknown> = {}
  if (datos.monto != null) {
    const m = Math.round(Number(datos.monto))
    if (!Number.isFinite(m) || m <= 0) return { error: 'Monto inválido' }
    cambios.monto = m
  }
  if (datos.glosa != null) cambios.glosa = datos.glosa.trim() || null
  return editarItem(itemId, cambios, 'Editar pago del lote')
}

/** Le pone cuenta a un pago que no tenía: queda en el directorio (sin confirmar) y en el pago. */
export async function asignarCuentaPago(itemId: string, datos: { banco_codigo: string; numero_cuenta: string; email?: string }): Promise<{ error?: string }> {
  await usuarioConRol()
  const admin = createAdminClient()
  const banco = bancoPorCodigo(datos.banco_codigo)
  const numero = limpiarCuenta(datos.numero_cuenta)
  if (!banco) return { error: 'Elige el banco' }
  if (!numero) return { error: 'Número de cuenta inválido' }
  const { data: item } = await admin.from('pagos_lote_items').select('rut, nombre').eq('id', itemId).maybeSingle()
  if (!item) return { error: 'El pago no existe' }
  if (!rutValido(item.rut)) return { error: 'El RUT del pago es inválido' }
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  const g = await guardarCuentas(admin, [{ rut: item.rut, nombre: item.nombre, banco_codigo: banco.codigo, numero_cuenta: numero, tipo_cuenta: null, email: datos.email || null }], { fecha: hoy, fuente: 'manual', confirmada: false })
  if (g.error) return { error: g.error }
  const cambios: Record<string, unknown> = { banco_codigo: banco.codigo, numero_cuenta: numero }
  if (datos.email) cambios.email = datos.email.trim()
  return editarItem(itemId, cambios, 'Asignar cuenta a un pago')
}

export async function agregarPagoLibre(loteId: string, datos: { rut: string; monto: number; glosa?: string; nombre?: string }): Promise<{ error?: string; rechazados?: string[] }> {
  const u = await usuarioConRol()
  const admin = createAdminClient()
  const { data: lote } = await admin.from('pagos_lotes').select('id, fecha, items:pagos_lote_items(orden)').eq('id', loteId).maybeSingle()
  if (!lote) return { error: 'El lote no existe' }
  const prep = await prepararLote(admin, { fecha: lote.fecha, pagos: [datos] }, [])
  if (prep.items.length === 0) return { error: prep.rechazados.join('; ') || 'Pago inválido' }
  const it = prep.items[0]
  const orden = Math.max(-1, ...((lote.items ?? []) as { orden: number }[]).map(i => i.orden)) + 1
  const { data, error } = await admin.from('pagos_lote_items').insert({
    lote_id: loteId, orden, rut: it.rut, nombre: it.nombre || it.rut, banco_codigo: it.banco_codigo, numero_cuenta: it.numero_cuenta,
    email: it.email, monto: it.monto, glosa: it.glosa, origen_tabla: 'libre', colaborador_id: it.colaborador_id,
  }).select('*').single()
  if (error) return { error: error.message }
  await registrar(admin, u.id, { ruta: RUTA, modulo: 'financiero', descripcion: `Agregar pago a ${it.nombre || it.rut}`, ops: [opInsert('pagos_lote_items', [data as Fila])] })
  revalidatePath(RUTA)
  return {}
}

export async function eliminarLoteMasivo(loteId: string): Promise<{ error?: string }> {
  const u = await usuarioConRol()
  const admin = createAdminClient()
  const [lote, items] = await Promise.all([
    capturar(admin, 'pagos_lotes', { col: 'id', valor: loteId }),
    capturar(admin, 'pagos_lote_items', { col: 'lote_id', valor: loteId }),
  ])
  if (!lote[0]) return { error: 'El lote no existe' }
  if (items.some(i => i.estado === 'pagado')) return { error: 'El lote tiene pagos que ya llegaron al banco: anula los pendientes en vez de borrarlo' }
  const { error } = await admin.from('pagos_lotes').delete().eq('id', loteId)
  if (error) return { error: error.message }
  await registrar(admin, u.id, { ruta: RUTA, modulo: 'financiero', descripcion: `Borrar lote "${lote[0].nombre}"`, ops: [opDelete([{ tabla: 'pagos_lotes', filas: lote }, { tabla: 'pagos_lote_items', filas: items }])] })
  revalidatePath(RUTA)
  return {}
}
