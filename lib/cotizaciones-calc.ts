// lib/cotizaciones-calc.ts
// Cálculos de cotización (CH-2) y rental (CH-9) + formato CLP.
// Extraído de types/index.ts en T12 — las funciones no fueron modificadas.
import type {
  CotizacionItem,
  CotizacionSubgrupo,
  CotizacionDepartamento,
  Cotizacion,
  RentalCotizacion,
  RentalCotizacionItem,
} from '@/types'

// ============================================================
// HELPERS DE CÁLCULO
// ============================================================

// Calcula precio_bruto desde neto con boleta
// Bruto = Neto / (1 - tasa)
export function calcularBruto(neto: number, tasa: number = 0.153): number {
  return Math.round(neto / (1 - tasa))
}

// Subtotal de un ítem al cliente
export function subtotalItem(item: CotizacionItem): number {
  if (item.incluido) return 0
  const base = item.precio_cliente * item.cantidad * item.dias
  if (item.descuento_item_tipo === 'porcentaje') {
    return Math.round(base * (1 - item.descuento_item / 100))
  }
  return Math.round(base - item.descuento_item)
}

// Subtotal de un sub-grupo al cliente.
// Si tiene precio_manual (bundle), ese es el valor; si no, suma de ítems.
export function subtotalSubgrupo(sg: CotizacionSubgrupo): number {
  if (sg.precio_manual != null) return Math.round(sg.precio_manual)
  return (sg.items ?? []).reduce((acc, i) => acc + subtotalItem(i), 0)
}

// Subtotal de un departamento al cliente.
// Si tiene precio_manual (bundle), ese es el valor; si no, suma sub-grupos + ítems.
export function subtotalDepartamento(dep: CotizacionDepartamento): number {
  if (dep.precio_manual != null) return Math.round(dep.precio_manual)
  const deSubs = (dep.subgrupos ?? []).reduce(
    (acc, sg) => acc + subtotalSubgrupo(sg),
    0
  )
  const directos = (dep.items ?? []).reduce(
    (acc, i) => acc + subtotalItem(i),
    0
  )
  return deSubs + directos
}

// Totales generales
export interface TotalesCotizacion {
  neto: number
  descuento_global_monto: number
  neto_con_descuento: number
  iva: number
  total: number
  costo_real: number
  margen: number
}

export function calcularTotales(cotizacion: Cotizacion): TotalesCotizacion {
  const deps = cotizacion.departamentos ?? []

  const neto = deps.reduce((acc, d) => acc + subtotalDepartamento(d), 0)

  const todosItems = deps.flatMap(d => [
    ...(d.items ?? []),
    ...(d.subgrupos ?? []).flatMap(sg => sg.items ?? []),
  ])

  const costo_real = todosItems.reduce(
    (acc, i) => acc + Math.round(i.precio_bruto * i.cantidad * i.dias),
    0
  )

  let descuento_global_monto = 0
  if (cotizacion.descuento_global > 0) {
    if (cotizacion.descuento_global_tipo === 'porcentaje') {
      descuento_global_monto = Math.round(
        (neto * cotizacion.descuento_global) / 100
      )
    } else {
      descuento_global_monto = cotizacion.descuento_global
    }
  }

  // El descuento global nunca puede superar el neto (evita totales negativos).
  // Un descuento negativo ya queda en 0 por el guard `> 0` de arriba.
  descuento_global_monto = Math.min(descuento_global_monto, neto)

  const neto_con_descuento = neto - descuento_global_monto
  const iva = cotizacion.con_iva ? Math.round(neto_con_descuento * 0.19) : 0
  const total = neto_con_descuento + iva
  const margen = total - costo_real

  return {
    neto,
    descuento_global_monto,
    neto_con_descuento,
    iva,
    total,
    costo_real,
    margen,
  }
}

// ============================================================
// FORMATO CLP
// ============================================================
export function formatCLP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

// ============================================================
// RENTAL — CÁLCULOS
// ============================================================
export function subtotalRentalItem(item: RentalCotizacionItem): number {
  if (item.incluido) return 0
  const base = item.precio_unitario * item.cantidad * item.dias
  if (item.descuento_tipo === 'porcentaje') {
    return Math.round(base * (1 - item.descuento / 100))
  }
  return Math.round(base - item.descuento)
}

export function calcularTotalesRental(cotizacion: RentalCotizacion): {
  neto: number
  descuento_global_monto: number
  neto_con_descuento: number
  iva: number
  total: number
} {
  const secciones = cotizacion.secciones ?? []
  const neto = secciones.reduce(
    (acc, s) => acc + (s.items ?? []).reduce((a, i) => a + subtotalRentalItem(i), 0),
    0,
  )
  let descuento_global_monto = 0
  if (cotizacion.descuento_global > 0) {
    if (cotizacion.descuento_global_tipo === 'porcentaje') {
      descuento_global_monto = Math.round(neto * cotizacion.descuento_global / 100)
    } else {
      descuento_global_monto = cotizacion.descuento_global
    }
  }
  const neto_con_descuento = neto - descuento_global_monto
  const iva = cotizacion.con_iva ? Math.round(neto_con_descuento * 0.19) : 0
  const total = neto_con_descuento + iva
  return { neto, descuento_global_monto, neto_con_descuento, iva, total }
}
