// lib/rental-kits.ts
// Composición de kits/packs de rental: qué equipos individuales contiene cada kit.
// Modelado en código (set fijo y chico) en vez de una tabla, para no requerir
// migración. Se usa para DOS cosas:
//   1) Disponibilidad real: arrendar un kit ocupa sus componentes (y viceversa),
//      evitando el doble-booking (ej. la Maleta de Cámara y la A7S III suelta).
//   2) Valor "suelto" derivado (tachado en la tarjeta) = suma de los componentes,
//      siempre al día si cambian los precios.

export interface Componente { codigo: string; cantidad: number }

const uno = (codigos: string[]): Componente[] => codigos.map((codigo) => ({ codigo, cantidad: 1 }))

// Maleta de Cámara: 2 cuerpos + 6 G Master + 2 monitores + lav (los filtros no son ítem con precio).
const MALETA_CAMARA: Componente[] = uno([
  'CH-CAM-002', 'CH-CAM-003',
  'CH-OPT-001', 'CH-OPT-002', 'CH-OPT-003', 'CH-OPT-004', 'CH-OPT-005', 'CH-OPT-006',
  'CH-MON-001', 'CH-MON-003', 'CH-SON-001',
])

// Kit Luz 3 Puntos.
const LUZ_3P: Componente[] = [
  { codigo: 'CH-ILU-003', cantidad: 1 }, // Forza 720B
  { codigo: 'CH-ILU-002', cantidad: 2 }, // 2× Nanlux 150C
  { codigo: 'CH-MOD-004', cantidad: 1 }, // Octabox 150
  { codigo: 'CH-ILU-007', cantidad: 1 }, // difusores 2x2
  { codigo: 'CH-ILU-008', cantidad: 1 }, // paños negros
  { codigo: 'CH-GRI-003', cantidad: 3 }, // 3 C-stands
]

export const KIT_COMPONENTES: Record<string, Componente[]> = {
  'CH-KIT-001': MALETA_CAMARA,
  'CH-KIT-002': [...MALETA_CAMARA, { codigo: 'CH-MOV-001', cantidad: 1 }, { codigo: 'CH-MOV-002', cantidad: 1 }], // Entrevista = maleta + 2 trípodes
  'CH-KIT-003': uno(['CH-OPT-007', 'CH-OPT-008', 'CH-OPT-009', 'CH-OPT-010', 'CH-OPT-011']), // Maleta Athena (5 lentes)
  'CH-KIT-004': LUZ_3P,
  'CH-KIT-006': [...MALETA_CAMARA, ...LUZ_3P], // Producto = maleta + luz 3 puntos
  'CH-KIT-007': [{ codigo: 'CH-ILU-004', cantidad: 1 }], // Pack Nanlux (1200B + fresnel; el fresnel no es ítem)
  'CH-ILU-012': [ // Pack Godox
    { codigo: 'CH-ILU-001', cantidad: 2 }, { codigo: 'CH-ILU-010', cantidad: 1 },
    { codigo: 'CH-ILU-005', cantidad: 1 }, { codigo: 'CH-ILU-011', cantidad: 1 },
  ],
  // El camión carga prácticamente todo el inventario individual relevante.
  'CH-CAMION': [
    ...uno(['CH-CAM-002', 'CH-CAM-003', 'CH-OPT-001', 'CH-OPT-002', 'CH-OPT-003', 'CH-OPT-004', 'CH-OPT-005', 'CH-OPT-006']),
    { codigo: 'CH-ILU-004', cantidad: 1 }, { codigo: 'CH-ILU-003', cantidad: 1 }, { codigo: 'CH-ILU-002', cantidad: 2 },
    { codigo: 'CH-ILU-001', cantidad: 2 }, { codigo: 'CH-ILU-010', cantidad: 1 }, { codigo: 'CH-ILU-005', cantidad: 1 }, { codigo: 'CH-ILU-011', cantidad: 1 },
    ...uno(['CH-MOD-002', 'CH-MOV-004', 'CH-MOV-003', 'CH-MOV-001', 'CH-MOV-002']),
    { codigo: 'CH-GRI-003', cantidad: 6 }, ...uno(['CH-GRI-016', 'CH-GRI-017']),
    { codigo: 'CH-ILU-007', cantidad: 1 }, { codigo: 'CH-ILU-008', cantidad: 1 }, { codigo: 'CH-ILU-009', cantidad: 1 },
    ...uno(['CH-MON-002', 'CH-MON-003', 'CH-SON-001', 'CH-MOD-004', 'CH-RIG-004']),
  ],
}

export function componentesDe(codigo: string): Componente[] {
  return KIT_COMPONENTES[codigo] ?? []
}

// Valor suelto de un kit = suma de sus componentes (precio × cantidad).
export function sueltoKit(codigo: string, precioPorCodigo: Record<string, number>): number {
  return componentesDe(codigo).reduce((s, c) => s + (precioPorCodigo[c.codigo] ?? 0) * c.cantidad, 0)
}

// Dada la lista de códigos con reserva confirmada (aprobada/entregada) que se
// solapan con el rango, calcula la ocupación por código expandiendo kits↔componentes.
// Devuelve, por código, cuántas unidades quedan ocupadas (el front bloquea si stock − ocupado ≤ 0).
export function expandirOcupacion(
  reservados: string[],
  stockPorCodigo: Record<string, number>,
): Record<string, number> {
  const directas: Record<string, number> = {}
  for (const c of reservados) directas[c] = (directas[c] ?? 0) + 1

  // Pass A — kits reservados ocupan sus componentes.
  const load: Record<string, number> = { ...directas }
  for (const [kit, comps] of Object.entries(KIT_COMPONENTES)) {
    const n = directas[kit] ?? 0
    if (n > 0) for (const c of comps) load[c.codigo] = (load[c.codigo] ?? 0) + c.cantidad * n
  }

  // Pass B — si un componente quedó agotado, el kit que lo contiene no se puede armar.
  for (const [kit, comps] of Object.entries(KIT_COMPONENTES)) {
    const stockKit = stockPorCodigo[kit] ?? 1
    if ((load[kit] ?? 0) >= stockKit) continue
    const agotado = comps.some((c) => (load[c.codigo] ?? 0) >= (stockPorCodigo[c.codigo] ?? 1))
    if (agotado) load[kit] = stockKit
  }

  return load
}

// Dada la lista de códigos reservados (con la nueva reserva incluida), devuelve
// los códigos que quedan SOBRE-comprometidos (ocupado > stock), expandiendo kits.
// Se usa en la aprobación de reservas para frenar el doble-booking de verdad.
export function sobrecupo(reservados: string[], stockPorCodigo: Record<string, number>): string[] {
  const load = expandirOcupacion(reservados, stockPorCodigo)
  return Object.entries(load)
    .filter(([codigo, n]) => n > (stockPorCodigo[codigo] ?? 1))
    .map(([codigo]) => codigo)
}
