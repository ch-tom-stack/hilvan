import { describe, it, expect } from 'vitest'
import { ensamblarResumenContador } from '@/lib/agent-resumen-contador'

describe('ensamblarResumenContador', () => {
  const base = {
    saldo_iva: 1_955_086,
    retencion_honorarios: 200_000,
    ppm: 0,
    previred: 656_158,
    iusc: 0,
    honorarios_contador: 140_000,
  }

  it('suma todos los componentes en el total', () => {
    const r = ensamblarResumenContador(base)
    // 1.955.086 + 200.000 + 0 + 656.158 + 0 + 140.000
    expect(r.total_estimado).toBe(2_951_244)
    expect(r.iva_a_favor).toBe(0)
    expect(r.lineas).toHaveLength(6)
  })

  it('IVA a favor (saldo negativo) → no resta al total, lo informa', () => {
    const r = ensamblarResumenContador({ ...base, saldo_iva: -300_000 })
    const lineaIva = r.lineas.find((l) => l.concepto === 'IVA a pagar')!
    expect(lineaIva.monto).toBe(0) // no paga IVA este mes
    expect(lineaIva.nota).toMatch(/a favor/)
    expect(r.iva_a_favor).toBe(300_000)
    // total = 0 (iva) + 200.000 + 0 + 656.158 + 0 + 140.000
    expect(r.total_estimado).toBe(996_158)
  })

  it('incluye honorarios del contador en el total', () => {
    const sin = ensamblarResumenContador({ ...base, honorarios_contador: 0 })
    const con = ensamblarResumenContador({ ...base, honorarios_contador: 140_000 })
    expect(con.total_estimado - sin.total_estimado).toBe(140_000)
    expect(con.lineas.find((l) => l.concepto === 'Honorarios del contador')?.monto).toBe(140_000)
  })

  it('redondea los montos', () => {
    const r = ensamblarResumenContador({ ...base, ppm: 12345.7, previred: 656158.4 })
    expect(r.lineas.find((l) => l.concepto === 'PPM')?.monto).toBe(12346)
    expect(r.lineas.find((l) => l.concepto === 'Previred')?.monto).toBe(656158)
  })
})
