// lib/pagos-masivos-io.ts
// Transferencias masivas — la parte que toca la base. La lógica pura (RUT,
// avisos, planilla, calce) está en lib/pagos-masivos.ts. Todo con service role:
// quien llama (server action con requireRol o API de agentes) ya validó acceso.

import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularRetencion } from './rendiciones-calc'
import { codigoBanco } from './bancos'
import {
  VENTANA_CIERRE, calzarPagos, elegirCuenta, glosaDeGasto, limpiarCuenta, limpiarRut, revisarPago,
  rutsEnTexto, type CuentaGuardada, type CuentaVista, type PagoPlanilla,
} from './pagos-masivos'

type Admin = SupabaseClient

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// ── Directorio de cuentas ────────────────────────────────────────────────────

/**
 * Guarda las cuentas leídas de avisos (o de una planilla). Si ya existía la
 * misma (RUT + banco + cuenta) suma una vez vista; si no, la crea y la enlaza al
 * colaborador con ese RUT. Nunca borra ni pisa otra cuenta de la persona.
 */
export async function guardarCuentas(
  admin: Admin,
  cuentas: (CuentaVista & { email?: string | null })[],
  opts: { fecha: string; fuente: 'aviso_santander' | 'planilla' | 'colaborador' | 'manual'; confirmada: boolean },
): Promise<{ nuevas: CuentaVista[]; vistas: number; error?: string }> {
  const nuevas: CuentaVista[] = []
  let vistas = 0
  if (cuentas.length === 0) return { nuevas, vistas }

  const ruts = [...new Set(cuentas.map(c => c.rut))]
  const [{ data: existentes, error: e1 }, colaboradores] = await Promise.all([
    admin.from('cuentas_bancarias').select('id, rut, banco_codigo, numero_cuenta, veces, ultima_vez, confirmada, email').in('rut', ruts),
    colaboradoresPorRut(admin, ruts),
  ])
  if (e1) return { nuevas, vistas, error: e1.message }

  for (const c of cuentas) {
    const ya = (existentes ?? []).find(e => e.rut === c.rut && e.banco_codigo === c.banco_codigo && e.numero_cuenta === c.numero_cuenta)
    if (ya) {
      const cambios: Record<string, unknown> = { veces: (ya.veces ?? 1) + 1, updated_at: new Date().toISOString() }
      if (!ya.ultima_vez || ya.ultima_vez < opts.fecha) cambios.ultima_vez = opts.fecha
      if (opts.confirmada && !ya.confirmada) cambios.confirmada = true
      if (c.email && !ya.email) cambios.email = c.email
      const { error } = await admin.from('cuentas_bancarias').update(cambios).eq('id', ya.id)
      if (error) return { nuevas, vistas, error: error.message }
      ya.veces = cambios.veces as number
      vistas++
      continue
    }
    const fila = {
      rut: c.rut, nombre: c.nombre, banco_codigo: c.banco_codigo, numero_cuenta: c.numero_cuenta,
      tipo_cuenta: c.tipo_cuenta, email: c.email ?? null, fuente: opts.fuente, confirmada: opts.confirmada,
      ultima_vez: opts.fecha, colaborador_id: colaboradores.get(c.rut)?.id ?? null,
    }
    const { data, error } = await admin.from('cuentas_bancarias').insert(fila).select('id, rut, banco_codigo, numero_cuenta, veces, ultima_vez, confirmada, email').single()
    if (error) return { nuevas, vistas, error: error.message }
    existentes?.push(data)
    nuevas.push(c)
  }
  return { nuevas, vistas }
}

interface ColaboradorFicha {
  id: string
  nombre: string
  rut: string
  email: string | null
  banco: string | null
  tipo_cuenta: string | null
  numero_cuenta: string | null
}

async function colaboradoresPorRut(admin: Admin, ruts: string[]): Promise<Map<string, ColaboradorFicha>> {
  // El RUT en colaboradores viene con o sin puntos: se compara normalizado.
  const { data } = await admin.from('colaboradores').select('id, nombre, rut, email, banco, tipo_cuenta, numero_cuenta').not('rut', 'is', null)
  const quiero = new Set(ruts.map(limpiarRut))
  const out = new Map<string, ColaboradorFicha>()
  for (const c of (data ?? []) as ColaboradorFicha[]) {
    const r = limpiarRut(c.rut)
    if (r && quiero.has(r)) out.set(r, c)
  }
  return out
}

export interface CuentaResuelta {
  rut: string
  nombre: string
  banco_codigo: string | null
  numero_cuenta: string | null
  email: string | null
  colaborador_id: string | null
  /** De dónde salió la cuenta: el directorio (confirmada o no) o la ficha del colaborador. */
  origen: 'directorio' | 'confirmada' | 'ficha' | null
}

/** La cuenta a usar para cada RUT: la del directorio confirmada por el banco > ficha del colaborador. */
export async function resolverCuentas(admin: Admin, ruts: string[]): Promise<Map<string, CuentaResuelta>> {
  const limpios = [...new Set(ruts.map(limpiarRut).filter(Boolean))]
  const out = new Map<string, CuentaResuelta>()
  if (limpios.length === 0) return out
  const [{ data: cuentas }, colaboradores] = await Promise.all([
    admin.from('cuentas_bancarias').select('*').in('rut', limpios),
    colaboradoresPorRut(admin, limpios),
  ])
  for (const rut of limpios) {
    const col = colaboradores.get(rut)
    const elegida = elegirCuenta(((cuentas ?? []) as CuentaGuardada[]).filter(c => c.rut === rut))
    if (elegida) {
      out.set(rut, {
        rut, nombre: col?.nombre ?? elegida.nombre, banco_codigo: elegida.banco_codigo, numero_cuenta: elegida.numero_cuenta,
        email: elegida.email ?? col?.email ?? null, colaborador_id: col?.id ?? elegida.colaborador_id ?? null,
        origen: elegida.confirmada ? 'confirmada' : 'directorio',
      })
    } else if (col) {
      const banco_codigo = codigoBanco(col.banco)
      const numero_cuenta = limpiarCuenta(col.numero_cuenta)
      out.set(rut, {
        rut, nombre: col.nombre, banco_codigo, numero_cuenta, email: col.email, colaborador_id: col.id,
        origen: banco_codigo && numero_cuenta ? 'ficha' : null,
      })
    }
  }
  return out
}

// ── Armar un lote ────────────────────────────────────────────────────────────

export interface PedidoLote {
  nombre?: string
  fecha?: string // YYYY-MM-DD, default hoy
  nomina?: boolean
  gastos?: { tabla: 'rendicion_gastos' | 'rendicion_mensual_gastos'; id: string }[]
  pagos?: { rut: string; monto: number; glosa?: string; nombre?: string; email?: string }[]
  notas?: string
}

export interface ItemArmado extends PagoPlanilla {
  orden: number
  origen_tabla: 'rendicion_gastos' | 'rendicion_mensual_gastos' | 'nomina' | 'libre'
  origen_id: string | null
  colaborador_id: string | null
  errores: string[]
  avisos: string[]
}

function hoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

/**
 * Resuelve lo pedido en pagos con cuenta, monto neto y glosa, SIN escribir.
 * Lo que no se puede pagar queda con `errores` (y sin bloquear al resto); lo
 * dudoso con `avisos` (ej. el mismo monto ya se le transfirió hace poco).
 */
export async function prepararLote(admin: Admin, pedido: PedidoLote, nomina: { nombre: string; monto: number; rut?: string }[]): Promise<{ fecha: string; nombre: string; items: ItemArmado[]; rechazados: string[] }> {
  const fecha = pedido.fecha && /^\d{4}-\d{2}-\d{2}$/.test(pedido.fecha) ? pedido.fecha : hoyChile()
  const mes = MESES[Number(fecha.slice(5, 7)) - 1]
  const rechazados: string[] = []
  const crudos: Omit<ItemArmado, 'orden' | 'banco_codigo' | 'numero_cuenta' | 'errores' | 'avisos' | 'colaborador_id'>[] = []

  if (pedido.nomina) {
    for (const p of nomina) {
      const rut = limpiarRut(p.rut)
      if (!rut) { rechazados.push(`nómina: ${p.nombre} no tiene RUT (agrégalo en Financiero → Nómina)`); continue }
      crudos.push({ rut, nombre: p.nombre, monto: Math.round(p.monto), glosa: `Remuneración ${mes}`, email: null, origen_tabla: 'nomina', origen_id: null })
    }
  }

  for (const tabla of ['rendicion_gastos', 'rendicion_mensual_gastos'] as const) {
    const ids = (pedido.gastos ?? []).filter(g => g.tabla === tabla).map(g => g.id)
    if (ids.length === 0) continue
    const sel = tabla === 'rendicion_gastos'
      ? 'id, monto, tipo_documento, folio, descripcion, rut_emisor, razon_social_emisor, fecha_documento, pagado, colaborador:colaboradores(nombre, rut, email)'
      : 'id, monto, tipo_documento, folio, descripcion, rut_emisor, razon_social_emisor, fecha_documento, pagado'
    const { data, error } = await admin.from(tabla).select(sel).in('id', ids)
    if (error) { rechazados.push(`${tabla}: ${error.message}`); continue }
    for (const id of ids) {
      const g = (data ?? []).find((x: any) => x.id === id) as any
      if (!g) { rechazados.push(`gasto ${id} no existe en ${tabla}`); continue }
      if (g.pagado) { rechazados.push(`${g.razon_social_emisor || g.descripcion}: ya está pagado`); continue }
      const col = g.colaborador as { nombre: string; rut: string | null; email: string | null } | null
      const rut = limpiarRut(col?.rut || g.rut_emisor)
      if (!rut) { rechazados.push(`${g.razon_social_emisor || g.descripcion}: el gasto no tiene RUT del emisor`); continue }
      const { neto } = calcularRetencion({ monto: g.monto ?? 0, tipo_documento: g.tipo_documento, fecha: g.fecha_documento })
      crudos.push({
        rut, nombre: col?.nombre || g.razon_social_emisor || g.descripcion || rut, monto: Math.round(neto),
        glosa: glosaDeGasto(g), email: col?.email ?? null, origen_tabla: tabla, origen_id: g.id,
      })
    }
  }

  for (const p of pedido.pagos ?? []) {
    const rut = limpiarRut(p.rut)
    const monto = Number(p.monto)
    if (!rut) { rechazados.push(`pago libre: RUT inválido (${p.rut})`); continue }
    if (!Number.isFinite(monto) || monto <= 0) { rechazados.push(`pago libre a ${p.rut}: monto inválido`); continue }
    crudos.push({ rut, nombre: p.nombre?.trim() || '', monto: Math.round(monto), glosa: p.glosa?.trim() || null, email: p.email?.trim() || null, origen_tabla: 'libre', origen_id: null })
  }

  // Cuentas + revisión + "¿ya se le pagó?" (gasto en otro lote, o mismo RUT y monto en el banco hace poco).
  const cuentas = await resolverCuentas(admin, crudos.map(c => c.rut))
  const origenIds = crudos.map(c => c.origen_id).filter((x): x is string => !!x)
  const [{ data: enOtros }, { data: cargosRecientes }] = await Promise.all([
    origenIds.length
      ? admin.from('pagos_lote_items').select('origen_id, estado, lote:pagos_lotes(nombre)').in('origen_id', origenIds).neq('estado', 'anulado')
      : Promise.resolve({ data: [] as any[] }),
    admin.from('movimientos_bancarios').select('fecha, monto, descripcion').eq('tipo', 'cargo').gte('fecha', sumarDias(fecha, -120))
      .in('monto', [...new Set(crudos.map(c => c.monto))]),
  ])

  const items: ItemArmado[] = crudos.map((c, i) => {
    const cuenta = cuentas.get(c.rut)
    const it: ItemArmado = {
      ...c, orden: i,
      nombre: c.nombre || cuenta?.nombre || '',
      email: c.email || cuenta?.email || null,
      banco_codigo: cuenta?.origen ? cuenta.banco_codigo : null,
      numero_cuenta: cuenta?.origen ? cuenta.numero_cuenta : null,
      colaborador_id: cuenta?.colaborador_id ?? null,
      errores: [], avisos: [],
    }
    const r = revisarPago(it)
    it.errores.push(...r.errores)
    it.avisos.push(...r.avisos)
    if (!cuenta?.origen) it.errores = it.errores.map(e => (e === 'falta la cuenta' || e === 'falta el banco') ? `${e}: no hay cuenta conocida para ${c.rut}` : e)
    else if (cuenta.origen === 'ficha') it.avisos.push('cuenta tomada de la ficha del colaborador: el banco todavía no la confirmó')
    const otro = (enOtros ?? []).find((x: any) => x.origen_id && x.origen_id === c.origen_id) as any
    if (otro) it.errores.push(`este gasto ya está en el lote "${otro.lote?.nombre ?? '?'}" (${otro.estado})`)
    // La nómina se repite cada mes por el mismo monto: solo es sospechoso si
    // ya se pagó en los últimos 20 días. Una boleta, en los últimos 120.
    const desde = sumarDias(fecha, c.origen_tabla === 'nomina' ? -20 : -120)
    const previo = (cargosRecientes ?? []).find((m: any) => m.fecha >= desde && Math.round(m.monto) === c.monto && rutsEnTexto(m.descripcion).includes(c.rut))
    if (previo) it.avisos.push(`ya se le transfirió $${c.monto.toLocaleString('es-CL')} el ${previo.fecha}: revisa que no sea el mismo pago`)
    return it
  })

  const nombre = pedido.nombre?.trim() || `Transferencia masiva ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`
  return { fecha, nombre, items, rechazados }
}

/** Inserta el lote y sus pagos (los que tienen errores también: se corrigen después). */
export async function crearLote(admin: Admin, prep: Awaited<ReturnType<typeof prepararLote>>, creadoPor: string, notas?: string): Promise<{ lote: Record<string, any>; items: Record<string, any>[] } | { error: string }> {
  if (prep.items.length === 0) return { error: 'No quedó ningún pago para el lote' }
  const { data: lote, error } = await admin.from('pagos_lotes')
    .insert({ nombre: prep.nombre, fecha: prep.fecha, creado_por: creadoPor, notas: notas ?? null })
    .select('*').single()
  if (error) return { error: error.message }
  const filas = prep.items.map(it => ({
    lote_id: lote.id, orden: it.orden, rut: it.rut, nombre: it.nombre || it.rut, banco_codigo: it.banco_codigo,
    numero_cuenta: it.numero_cuenta, email: it.email, monto: it.monto, glosa: it.glosa, origen_tabla: it.origen_tabla,
    origen_id: it.origen_id, colaborador_id: it.colaborador_id,
  }))
  const { data: items, error: e2 } = await admin.from('pagos_lote_items').insert(filas).select('*')
  if (e2) {
    await admin.from('pagos_lotes').delete().eq('id', lote.id)
    return { error: e2.message }
  }
  return { lote, items: items ?? [] }
}

// ── Leer lotes ───────────────────────────────────────────────────────────────

export interface ItemLote {
  id: string
  lote_id: string
  orden: number
  rut: string
  nombre: string
  banco_codigo: string | null
  numero_cuenta: string | null
  email: string | null
  monto: number
  glosa: string | null
  origen_tabla: string | null
  origen_id: string | null
  estado: 'pendiente' | 'pagado' | 'anulado'
  movimiento_id: string | null
  pagado_en: string | null
  errores: string[]
  avisos: string[]
}

export interface Lote {
  id: string
  nombre: string
  fecha: string
  cuenta_origen: string
  estado: 'borrador' | 'generado' | 'cerrado'
  notas: string | null
  creado_por: string | null
  generado_at: string | null
  created_at: string
  items: ItemLote[]
  total: number
  pagado: number
}

export async function leerLotes(admin: Admin, opts: { id?: string; limite?: number; estado?: string } = {}): Promise<Lote[]> {
  let q = admin.from('pagos_lotes').select('*, items:pagos_lote_items(*)').order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (opts.id) q = q.eq('id', opts.id)
  if (opts.estado) q = q.eq('estado', opts.estado)
  const { data, error } = await q.limit(opts.limite ?? 30)
  if (error) throw new Error(error.message)
  return (data ?? []).map((l: any) => {
    const items: ItemLote[] = [...(l.items ?? [])].sort((a: any, b: any) => a.orden - b.orden).map((it: any) => {
      const r = it.estado === 'anulado' ? { errores: [], avisos: [] } : revisarPago(it)
      return { ...it, monto: Number(it.monto), ...r }
    })
    const vivos = items.filter(i => i.estado !== 'anulado')
    return {
      ...l, items,
      total: vivos.reduce((s, i) => s + i.monto, 0),
      pagado: vivos.filter(i => i.estado === 'pagado').reduce((s, i) => s + i.monto, 0),
    }
  })
}

// ── Cierre automático ────────────────────────────────────────────────────────

/**
 * Marca 'pagado' cada pago pendiente cuyo cargo ya está en movimientos_bancarios
 * (mismo RUT en la glosa y mismo monto), deja pagado sin conciliar el gasto de
 * origen y cierra los lotes completos. Si un movimiento enlazado se borró
 * (ej. se deshizo la importación), el pago vuelve a pendiente. Idempotente:
 * se llama tras cada importación y al mirar los lotes.
 */
export async function cerrarPagos(admin: Admin): Promise<{ pagados: { item_id: string; nombre: string; monto: number; fecha: string }[]; reabiertos: number; lotes_cerrados: number }> {
  const res = { pagados: [] as { item_id: string; nombre: string; monto: number; fecha: string }[], reabiertos: 0, lotes_cerrados: 0 }

  // 1. Pagos cuyo movimiento ya no existe → pendientes otra vez.
  const { data: huerfanos } = await admin.from('pagos_lote_items').select('id, origen_tabla, origen_id, marco_gasto, pagado_en').eq('estado', 'pagado').is('movimiento_id', null)
  for (const h of huerfanos ?? []) {
    if (h.marco_gasto && h.origen_id && (h.origen_tabla === 'rendicion_gastos' || h.origen_tabla === 'rendicion_mensual_gastos')) {
      await admin.from(h.origen_tabla).update({ pagado: false, fecha_pago: null }).eq('id', h.origen_id).eq('fecha_pago', h.pagado_en)
    }
    await admin.from('pagos_lote_items').update({ estado: 'pendiente', pagado_en: null, marco_gasto: false }).eq('id', h.id)
    res.reabiertos++
  }

  // 2. Pendientes → buscar su cargo.
  const { data: pendientes } = await admin.from('pagos_lote_items')
    .select('id, rut, nombre, monto, origen_tabla, origen_id, lote:pagos_lotes!inner(id, fecha)')
    .eq('estado', 'pendiente')
  if (pendientes?.length) {
    const fechas = pendientes.map((p: any) => p.lote.fecha as string).sort()
    const [{ data: cargos }, { data: usados }] = await Promise.all([
      admin.from('movimientos_bancarios').select('id, fecha, monto, tipo, descripcion').eq('tipo', 'cargo')
        .gte('fecha', sumarDias(fechas[0], -VENTANA_CIERRE.antes)).lte('fecha', sumarDias(fechas[fechas.length - 1], VENTANA_CIERRE.despues))
        .in('monto', [...new Set(pendientes.map((p: any) => Number(p.monto)))]),
      admin.from('pagos_lote_items').select('movimiento_id').not('movimiento_id', 'is', null),
    ])
    const calces = calzarPagos(
      pendientes.map((p: any) => ({ id: p.id, rut: p.rut, monto: Number(p.monto), fecha_lote: p.lote.fecha })),
      (cargos ?? []).map((c: any) => ({ ...c, monto: Number(c.monto) })),
      new Set((usados ?? []).map((u: any) => u.movimiento_id)),
    )
    for (const c of calces) {
      const p = pendientes.find((x: any) => x.id === c.item_id) as any
      let marco = false
      if (p.origen_id && (p.origen_tabla === 'rendicion_gastos' || p.origen_tabla === 'rendicion_mensual_gastos')) {
        const { data: g } = await admin.from(p.origen_tabla).update({ pagado: true, fecha_pago: c.fecha })
          .eq('id', p.origen_id).eq('pagado', false).select('id')
        marco = (g?.length ?? 0) > 0
      }
      const { error } = await admin.from('pagos_lote_items')
        .update({ estado: 'pagado', movimiento_id: c.movimiento_id, pagado_en: c.fecha, marco_gasto: marco }).eq('id', c.item_id)
      if (!error) res.pagados.push({ item_id: c.item_id, nombre: p.nombre, monto: Number(p.monto), fecha: c.fecha })
    }
  }

  // 3. Lotes con todo pagado o anulado → cerrados (y al revés si se reabrió algo).
  const { data: lotes } = await admin.from('pagos_lotes').select('id, estado, items:pagos_lote_items(estado)').neq('estado', 'borrador')
  for (const l of (lotes ?? []) as any[]) {
    const vivos = (l.items ?? []).filter((i: any) => i.estado !== 'anulado')
    const completo = vivos.length > 0 && vivos.every((i: any) => i.estado === 'pagado')
    if (completo && l.estado !== 'cerrado') {
      await admin.from('pagos_lotes').update({ estado: 'cerrado' }).eq('id', l.id)
      res.lotes_cerrados++
    } else if (!completo && l.estado === 'cerrado') {
      await admin.from('pagos_lotes').update({ estado: 'generado' }).eq('id', l.id)
    }
  }
  return res
}

/** Candidatos para un lote: gastos aprobados sin pagar (proyecto) y mensuales con emisor. */
export async function gastosPorPagar(admin: Admin): Promise<{ tabla: 'rendicion_gastos' | 'rendicion_mensual_gastos'; id: string; proveedor: string; rut: string | null; contexto: string; glosa: string; neto: number; fecha: string | null }[]> {
  const [{ data: proyecto }, { data: mensuales }] = await Promise.all([
    admin.from('rendicion_gastos')
      .select('id, monto, tipo_documento, folio, descripcion, rut_emisor, razon_social_emisor, fecha_documento, origen, estado, colaborador:colaboradores(nombre, rut), rendicion:rendiciones(cotizacion:cotizaciones(nombre))')
      .eq('pagado', false)
      .or('and(origen.eq.interno,estado.eq.enviada),estado.eq.aprobada,estado.eq.pago_aprobado'),
    admin.from('rendicion_mensual_gastos')
      .select('id, monto, tipo_documento, folio, descripcion, rut_emisor, razon_social_emisor, fecha_documento')
      // Solo boletas de honorarios: el resto de los mensuales (facturas de
      // tiendas, suscripciones) se pagó con tarjeta, no por transferencia.
      .eq('pagado', false).eq('tipo_documento', 'boleta').not('rut_emisor', 'is', null).gte('fecha_documento', sumarDias(hoyChile(), -120)),
  ])
  const fila = (tabla: 'rendicion_gastos' | 'rendicion_mensual_gastos', g: any, contexto: string) => ({
    tabla, id: g.id,
    proveedor: g.colaborador?.nombre || g.razon_social_emisor || g.descripcion || '—',
    rut: limpiarRut(g.colaborador?.rut || g.rut_emisor) || null,
    contexto,
    glosa: glosaDeGasto(g),
    neto: calcularRetencion({ monto: g.monto ?? 0, tipo_documento: g.tipo_documento, fecha: g.fecha_documento }).neto,
    fecha: g.fecha_documento ?? null,
  })
  return [
    ...(proyecto ?? []).map((g: any) => fila('rendicion_gastos', g, g.rendicion?.cotizacion?.nombre ?? 'Proyecto')),
    ...(mensuales ?? []).map((g: any) => fila('rendicion_mensual_gastos', g, 'Gasto mensual')),
  ]
}
