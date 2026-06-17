// lib/agent-resumen-contador.ts
// Ensamblado puro del "resumen para el contador" (estimación de lo que la empresa
// debe transferir/declarar en el mes). La matemática tributaria por ítem (IVA,
// retención) se hace en el route reusando calcularRetencion/calcularTotalCot; acá
// solo se arma el desglose y el total a partir de los componentes ya calculados.
// Sin I/O → testeable en aislamiento.

import { formatCLP } from '@/lib/cotizaciones-calc'

export interface ComponentesContador {
  /** iva_debito − iva_credito. Puede ser negativo = crédito IVA a favor. */
  saldo_iva: number
  retencion_honorarios: number
  ppm: number
  previred: number
  iusc: number
  honorarios_contador: number
}

export interface LineaContador {
  concepto: string
  monto: number
  nota?: string
}

export interface ResumenContadorTotal {
  lineas: LineaContador[]
  total_estimado: number
  /** Si el IVA del mes da a favor (saldo_iva < 0), cuánto se arrastra. */
  iva_a_favor: number
}

/**
 * Arma el desglose y el total a transferir/declarar. Si el IVA da a favor
 * (saldo_iva < 0) no suma negativo al total (ese crédito se arrastra al mes
 * siguiente, no reduce las otras obligaciones).
 */
export function ensamblarResumenContador(c: ComponentesContador): ResumenContadorTotal {
  const iva_a_pagar = Math.max(0, c.saldo_iva)
  const iva_a_favor = c.saldo_iva < 0 ? -c.saldo_iva : 0

  const lineas: LineaContador[] = [
    {
      concepto: 'IVA a pagar',
      monto: iva_a_pagar,
      nota:
        iva_a_favor > 0
          ? `Este mes el IVA da a favor: ${formatCLP(iva_a_favor)} de crédito que se arrastra al mes siguiente`
          : undefined,
    },
    { concepto: 'Retención de honorarios', monto: Math.round(c.retencion_honorarios) },
    { concepto: 'PPM', monto: Math.round(c.ppm) },
    { concepto: 'Previred', monto: Math.round(c.previred) },
    { concepto: 'IUSC', monto: Math.round(c.iusc) },
    { concepto: 'Honorarios del contador', monto: Math.round(c.honorarios_contador) },
  ]

  const total_estimado = lineas.reduce((s, l) => s + l.monto, 0)
  return { lineas, total_estimado, iva_a_favor }
}
