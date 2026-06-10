// Helpers internos compartidos de financiero — sin 'use server'.
// Funciones síncronas, selects SQL, cálculos y tipos que usan los sub-módulos
// de financiero (config, resultados, flujo, gastos-fijos). No son server actions.

import { calcularRetencion } from '@/types'

// ── Periodos ──────────────────────────────────────────────────────────────────

export function inicioPeriodo(mes: string) { return `${mes}-01` }
export function finPeriodo(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${mes}-${String(last).padStart(2, '0')}`
}

export function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function generarFechaVencimiento(fechaInicio: string, n: number, dia: number): string {
  const [year, month] = fechaInicio.split('-').map(Number)
  const d = new Date(year, month - 1 + (n - 1), 1)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const day = Math.min(dia, lastDay)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ── Selects de cotizaciones ───────────────────────────────────────────────────

// Select mínimo para calcular totales de cotizaciones
export const COT_FINANCIERO_SELECT = `
  id, nombre, estado, con_iva, descuento_global, descuento_global_tipo,
  fecha_factura_emitida, fecha_pago_recibido, numero_factura,
  cliente_nombre_libre,
  grupo:cotizacion_grupos(numero_base),
  cliente:clientes(nombre),
  departamentos:cotizacion_departamentos(
    subgrupos:cotizacion_subgrupos(
      items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
    ),
    items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
  )
`

export const COT_COBRAR_SELECT = `
  id, nombre, estado, con_iva, descuento_global, descuento_global_tipo,
  fecha_factura_emitida, fecha_pago_recibido, numero_factura,
  cliente_nombre_libre, fecha_respuesta_cliente,
  grupo:cotizacion_grupos(numero_base),
  cliente:clientes(nombre),
  departamentos:cotizacion_departamentos(
    subgrupos:cotizacion_subgrupos(
      items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
    ),
    items:cotizacion_items(precio_cliente, cantidad, dias, incluido, descuento_item, descuento_item_tipo, subgrupo_id)
  )
`

// ── Cálculos de cotización ────────────────────────────────────────────────────

export function calcularTotalCot(cot: any): number {
  const deps: any[] = cot.departamentos ?? []
  let neto = 0
  for (const dep of deps) {
    // Solo items directos del departamento (los de subgrupos tienen subgrupo_id != null)
    for (const item of (dep.items ?? []).filter((i: any) => i.subgrupo_id === null)) {
      if (!item.incluido) {
        const base = item.precio_cliente * item.cantidad * item.dias
        neto += item.descuento_item_tipo === 'porcentaje'
          ? Math.round(base * (1 - item.descuento_item / 100))
          : Math.round(base - item.descuento_item)
      }
    }
    for (const sg of dep.subgrupos ?? []) {
      for (const item of sg.items ?? []) {
        if (!item.incluido) {
          const base = item.precio_cliente * item.cantidad * item.dias
          neto += item.descuento_item_tipo === 'porcentaje'
            ? Math.round(base * (1 - item.descuento_item / 100))
            : Math.round(base - item.descuento_item)
        }
      }
    }
  }
  let desc = 0
  if (cot.descuento_global > 0) {
    desc = cot.descuento_global_tipo === 'porcentaje'
      ? Math.round(neto * cot.descuento_global / 100)
      : cot.descuento_global
  }
  const neto_cd = neto - desc
  const iva = cot.con_iva ? Math.round(neto_cd * 0.19) : 0
  return neto_cd + iva
}

export function nombreCot(cot: any): string {
  const base = (cot.grupo as any)?.numero_base ?? '—'
  return `${base} · ${cot.nombre}`
}

export function clienteCot(cot: any): string {
  return (cot.cliente as any)?.nombre ?? cot.cliente_nombre_libre ?? '—'
}

// ── Cálculo de campos para exportación al contador ────────────────────────────

export function calcularCamposContador(monto: number, tipo_documento: string | null, factura_casa_hiedra: boolean) {
  const credito_fiscal = factura_casa_hiedra ? Math.round(monto / 1.19 * 0.19) : 0
  const monto_neto = factura_casa_hiedra ? Math.round(monto / 1.19) : monto
  const iva = factura_casa_hiedra ? monto - monto_neto : 0
  const { retencion } = calcularRetencion({ monto, tipo_documento })
  return { credito_fiscal, monto_neto, iva, retencion }
}

// ── Tipos compartidos / nómina ────────────────────────────────────────────────

export interface PersonaNomina {
  nombre: string
  monto: number
  tipo: 'contrato' | 'honorarios'
}

export const NOMINA_DEFAULT: PersonaNomina[] = [
  { nombre: 'Tomás M.', monto: 550000, tipo: 'contrato' },
  { nombre: 'Natalia', monto: 550000, tipo: 'contrato' },
  { nombre: 'Simón Fernández', monto: 250000, tipo: 'honorarios' },
  { nombre: 'Josué de la Fuente', monto: 250000, tipo: 'honorarios' },
]
