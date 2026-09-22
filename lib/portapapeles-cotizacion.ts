// lib/portapapeles-cotizacion.ts
// Copiar y pegar ítems y grupos entre cotizaciones.
//
// Vive en localStorage, no en el portapapeles del sistema: así funciona entre
// pestañas sin pedir permisos, sobrevive a recargar la página y no pisa lo que
// la persona tenga copiado en el sistema. Lo que se guarda es una COPIA sin ids:
// al pegar se crean filas nuevas en la cotización de destino.

import type { CotizacionDepartamento, CotizacionItem, CotizacionSubgrupo } from '@/types'

export const CLAVE_PORTAPAPELES = 'hilvan:portapapeles-cotizacion'

export type ItemCopiado = Omit<CotizacionItem,
  'id' | 'created_at' | 'cotizacion_id' | 'departamento_id' | 'subgrupo_id' | 'orden' | 'equipo' | 'tarifa' | 'subtotal_cliente' | 'costo_real' | 'margen'>

export interface GrupoCopiado {
  nombre: string
  precio_manual: number | null
  items: ItemCopiado[]
  subgrupos: { nombre: string; precio_manual: number | null; items: ItemCopiado[] }[]
}

export type Portapapeles =
  | { tipo: 'item'; etiqueta: string; origen: string; datos: ItemCopiado }
  | { tipo: 'grupo'; etiqueta: string; origen: string; datos: GrupoCopiado }
  /** Bloque del plan de rodaje (sin ids ni orden): se pega en cualquier rodaje. */
  | { tipo: 'bloque'; etiqueta: string; origen: string; datos: Record<string, unknown> & { titulo: string } }

export function copiaDeItem(i: CotizacionItem): ItemCopiado {
  return {
    tipo: i.tipo, equipo_id: i.equipo_id ?? null, tarifa_id: i.tarifa_id ?? null,
    nombre: i.nombre, descripcion: i.descripcion,
    con_boleta: i.con_boleta, tasa_boleta: i.tasa_boleta,
    precio_neto_proveedor: i.precio_neto_proveedor, precio_bruto: i.precio_bruto,
    precio_cliente_personalizado: i.precio_cliente_personalizado, precio_cliente: i.precio_cliente,
    cantidad: i.cantidad, dias: i.dias, unidad: i.unidad, incluido: i.incluido,
    descuento_item: i.descuento_item, descuento_item_tipo: i.descuento_item_tipo,
  }
}

export function copiaDeGrupo(d: CotizacionDepartamento): GrupoCopiado {
  const items = (l?: CotizacionItem[]) => [...(l ?? [])].sort((a, b) => a.orden - b.orden).map(copiaDeItem)
  return {
    nombre: d.nombre,
    precio_manual: d.precio_manual ?? null,
    items: items(d.items),
    subgrupos: [...(d.subgrupos ?? [])].sort((a, b) => a.orden - b.orden).map((sg: CotizacionSubgrupo) => ({
      nombre: sg.nombre, precio_manual: sg.precio_manual ?? null, items: items(sg.items),
    })),
  }
}

export function cuentaItems(g: GrupoCopiado): number {
  return g.items.length + g.subgrupos.reduce((s, sg) => s + sg.items.length, 0)
}

function almacen(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

export function guardarPortapapeles(p: Portapapeles): boolean {
  const s = almacen()
  if (!s) return false
  try { s.setItem(CLAVE_PORTAPAPELES, JSON.stringify(p)); return true } catch { return false }
}

/** Lo copiado, o null si no hay nada o no se puede leer. Nunca lanza. */
export function leerPortapapeles(): Portapapeles | null {
  const s = almacen()
  if (!s) return null
  try {
    const raw = s.getItem(CLAVE_PORTAPAPELES)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p?.tipo === 'item' && p.datos?.nombre) return p as Portapapeles
    if (p?.tipo === 'grupo' && p.datos?.nombre && Array.isArray(p.datos.items) && Array.isArray(p.datos.subgrupos)) return p as Portapapeles
    if (p?.tipo === 'bloque' && p.datos?.titulo) return p as Portapapeles
    return null
  } catch { return null }
}

export function limpiarPortapapeles(): void {
  try { almacen()?.removeItem(CLAVE_PORTAPAPELES) } catch { /* nada */ }
}
