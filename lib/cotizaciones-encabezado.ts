// lib/cotizaciones-encabezado.ts
// Quién es quién en el encabezado de una cotización.
//
// Modelo (sep-2026): `cliente_id` / `cliente_nombre_libre` es el CLIENTE FINAL
// (la marca) y `agencia_id` / `agencia_nombre_libre` la contraparte intermedia,
// si la hay. Antes la agencia se guardaba en cliente_* y la marca en el texto
// `cliente_final`: esas filas se leen igual acá (modelo viejo) mientras no se
// migren, así ningún encabezado cambia de un día para otro.

export interface FuenteEncabezado {
  cliente?: { nombre?: string | null; empresa?: string | null } | null
  cliente_nombre_libre?: string | null
  cliente_final?: string | null
  agencia?: { nombre?: string | null; empresa?: string | null } | null
  agencia_nombre_libre?: string | null
}

const limpio = (s?: string | null) => (s ?? '').trim() || null
const nombreDe = (c?: { nombre?: string | null; empresa?: string | null } | null) => limpio(c?.nombre) ?? limpio(c?.empresa)

export function encabezadoCotizacion(c: FuenteEncabezado): { cliente: string | null; agencia: string | null; modeloViejo: boolean } {
  const agenciaNueva = nombreDe(c.agencia) ?? limpio(c.agencia_nombre_libre)
  const clienteCampo = nombreDe(c.cliente) ?? limpio(c.cliente_nombre_libre)
  const final = limpio(c.cliente_final)

  if (agenciaNueva) return { cliente: clienteCampo ?? final, agencia: agenciaNueva, modeloViejo: false }
  // Modelo viejo: cliente_* era la agencia y cliente_final la marca. Si son
  // iguales ("Falabella - Aldo Shoes" en ambos) no hay agencia de verdad.
  if (final && clienteCampo && final.toLowerCase() !== clienteCampo.toLowerCase()) {
    return { cliente: final, agencia: clienteCampo, modeloViejo: true }
  }
  return { cliente: clienteCampo ?? final, agencia: null, modeloViejo: !!final }
}

/** "Agencia · Cliente" o solo el cliente: para listados y búsquedas. */
export function etiquetaEncabezado(c: FuenteEncabezado): string {
  const e = encabezadoCotizacion(c)
  if (!e.cliente && !e.agencia) return '—'
  return e.agencia ? `${e.agencia} · ${e.cliente ?? '—'}` : (e.cliente ?? '—')
}
