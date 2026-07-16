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

// ── Arriendo web (rental.casahiedra.com) ──────────────────────────────────
// Jornadas inclusivas: lun→mié = 3. Retiro desde 08:00, devolución hasta 22:00.
export function diasArriendoInclusive(desde: string, hasta: string): number {
  // desde/hasta en 'YYYY-MM-DD'. Se cuentan ambos extremos.
  const a = new Date(desde + 'T12:00:00')
  const b = new Date(hasta + 'T12:00:00')
  const ms = b.getTime() - a.getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.round(ms / 86_400_000) + 1
}

// Descuento estándar por volumen sobre el neto (escalera acordada con el dueño).
// ≥$2.000.000 mantiene 15% y además avisa "consúltanos por un valor especial".
export function descuentoVolumen(neto: number): { pct: number; consultar: boolean } {
  if (neto >= 2_000_000) return { pct: 15, consultar: true }
  if (neto >= 1_500_000) return { pct: 15, consultar: false }
  if (neto >= 1_000_000) return { pct: 10, consultar: false }
  if (neto >= 500_000) return { pct: 5, consultar: false }
  return { pct: 0, consultar: false }
}

// Mínimo de arriendo web (neto): bajo esto no se genera cotización, para cubrir
// el costo fijo de gestión (retiro en bodega, preparación, entrega/recepción).
export const ARRIENDO_MINIMO = 50_000

// Promo de lanzamiento: −30% sobre arriendos ≥ $500.000 neto, sólo Julio–Agosto
// 2026. Se apila con el descuento por volumen. Se apaga sola el 1-sep.
export const PROMO_ARRIENDO = {
  desde: '2026-07-01',
  hasta: '2026-08-31',
  pct: 30,
  umbral: 500_000,
  etiqueta: 'Promo Julio–Agosto',
}

function fechaSantiago(d: Date): string {
  // 'YYYY-MM-DD' en zona America/Santiago (en-CA formatea ISO).
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export function promoArriendoActiva(hoy: Date = new Date()): boolean {
  const iso = fechaSantiago(hoy)
  return iso >= PROMO_ARRIENDO.desde && iso <= PROMO_ARRIENDO.hasta
}

// Cálculo canónico del arriendo web (front y back usan esto). Descuentos fuertes
// (promo + volumen) SÓLO sobre $500.000; bajo eso, precio lista.
// `codigoPct` = código de descuento del pop-up (10% primer arriendo). SE APILA con
// promo y volumen, y a diferencia de esos aplica en CUALQUIER monto (bajo $500k
// es el único descuento). El % SIEMPRE lo valida el servidor, nunca el cliente.
export function calcularArriendoWeb(neto: number, hoy: Date = new Date(), codigoPct = 0): {
  minimoOk: boolean
  promoActiva: boolean
  promoPct: number
  volumenPct: number
  codigoPct: number
  descuentoPct: number
  descuentoMonto: number
  netoConDescuento: number
  iva: number
  total: number
  consultar: boolean
} {
  const minimoOk = neto >= ARRIENDO_MINIMO
  const { pct: volumenPct, consultar } = descuentoVolumen(neto) // ya sólo ≥500k
  const promoActiva = promoArriendoActiva(hoy) && neto >= PROMO_ARRIENDO.umbral
  const promoPct = promoActiva ? PROMO_ARRIENDO.pct : 0
  const cod = Number.isFinite(codigoPct) && codigoPct > 0 ? Math.min(50, Math.round(codigoPct)) : 0
  const descuentoPct = promoPct + volumenPct + cod
  const descuentoMonto = Math.round(neto * descuentoPct / 100)
  const netoConDescuento = neto - descuentoMonto
  const iva = Math.round(netoConDescuento * 0.19)
  const total = netoConDescuento + iva
  return { minimoOk, promoActiva, promoPct, volumenPct, codigoPct: cod, descuentoPct, descuentoMonto, netoConDescuento, iva, total, consultar }
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
