// tests/crono.test.ts — lógica pura del CRONO (lib/crono.ts).

import { describe, it, expect } from 'vitest'
import {
  fechaValida,
  fechaONull,
  diaNum,
  isoDeDia,
  sumarDias,
  diaSemana,
  formatoLargo,
  formatoRango,
  etapaDeFecha,
  finEfectivoEtapa,
  rangoInvertido,
  hitosOrdenados,
  hitosDelDia,
  zoomClave,
  totalPagos,
  rangoCrono,
  semanasDelCrono,
  lunesDe,
  normalizarHito,
  columnasEtapasDesde,
  montoONull,
  proximoHitoClave,
  type RangoEtapa,
} from '@/lib/crono'
import type { CronoHito, EtapaCrono } from '@/types'

const etapas: Record<EtapaCrono, RangoEtapa> = {
  desarrollo: { desde: '2026-09-07', hasta: '2026-09-18' },
  pre:        { desde: '2026-09-21', hasta: null },          // abierta: termina el día antes de producción
  produccion: { desde: '2026-10-13', hasta: '2026-10-15' },
  post:       { desde: '2026-10-16', hasta: '2026-11-06' },
}

function hito(o: Partial<CronoHito> & { fecha: string | null }): CronoHito {
  return {
    id: crypto.randomUUID(), crono_id: 'c', orden: 0, tipo: 'otro', titulo: '', fecha_fin: null,
    etapa: null, monto: null, notas: null, responsable: null, hecho: false, rodaje_id: null, created_at: '', updated_at: '',
    ...o,
  }
}

describe('fechas', () => {
  it('valida YYYY-MM-DD de verdad', () => {
    expect(fechaValida('2026-09-07')).toBe(true)
    expect(fechaValida('2026-02-30')).toBe(false)
    expect(fechaValida('2026-13-01')).toBe(false)
    expect(fechaValida('07-09-2026')).toBe(false)
    expect(fechaValida(null)).toBe(false)
  })
  it('fechaONull acepta timestamps y descarta basura', () => {
    expect(fechaONull('2026-09-07T12:00:00Z')).toBe('2026-09-07')
    expect(fechaONull(' 2026-09-07 ')).toBe('2026-09-07')
    expect(fechaONull('ayer')).toBeNull()
    expect(fechaONull(undefined)).toBeNull()
  })
  it('diaNum/isoDeDia hacen roundtrip y sumarDias cruza meses', () => {
    expect(isoDeDia(diaNum('2026-09-07'))).toBe('2026-09-07')
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(diaNum('2026-09-08') - diaNum('2026-09-07')).toBe(1)
  })
  it('la semana parte el lunes', () => {
    expect(diaSemana('2026-09-07')).toBe(0) // lunes
    expect(diaSemana('2026-09-13')).toBe(6) // domingo
    expect(lunesDe('2026-09-10')).toBe('2026-09-07')
    expect(lunesDe('2026-09-07')).toBe('2026-09-07')
  })
  it('formatea sin Intl', () => {
    expect(formatoLargo('2026-09-07')).toBe('7 de septiembre de 2026')
    expect(formatoRango('2026-10-13', '2026-10-15')).toBe('13 oct – 15 oct')
    expect(formatoRango('2026-10-13', null)).toBe('13 oct')
    expect(formatoRango(null, '2026-10-15')).toBe('')
  })
})

describe('etapas', () => {
  it('deduce la etapa de una fecha, incluida una etapa abierta', () => {
    expect(etapaDeFecha(etapas, '2026-09-10')).toBe('desarrollo')
    expect(etapaDeFecha(etapas, '2026-09-19')).toBeNull()       // hueco entre etapas
    expect(etapaDeFecha(etapas, '2026-10-01')).toBe('pre')      // pre abierta
    expect(etapaDeFecha(etapas, '2026-10-12')).toBe('pre')      // último día antes de producción
    expect(etapaDeFecha(etapas, '2026-10-13')).toBe('produccion')
    expect(etapaDeFecha(etapas, '2026-11-06')).toBe('post')
    expect(etapaDeFecha(etapas, '2026-11-07')).toBeNull()
  })
  it('fin efectivo: hasta, o el día antes de la siguiente, o abierto', () => {
    expect(finEfectivoEtapa(etapas, 'pre')).toBe(diaNum('2026-10-12'))
    expect(finEfectivoEtapa({ ...etapas, post: { desde: '2026-10-16', hasta: null } }, 'post', 99)).toBe(99)
    expect(finEfectivoEtapa({ ...etapas, desarrollo: { desde: null, hasta: null } }, 'desarrollo')).toBeNull()
  })
  it('detecta rangos invertidos', () => {
    expect(rangoInvertido('2026-09-10', '2026-09-09')).toBe(true)
    expect(rangoInvertido('2026-09-10', '2026-09-10')).toBe(false)
    expect(rangoInvertido('2026-09-10', null)).toBe(false)
  })
  it('columnasEtapasDesde solo toca lo que viene', () => {
    const cols = columnasEtapasDesde({ pre: { desde: '2026-09-21', hasta: 'x' }, post: { desde: null } })
    expect(cols).toEqual({ pre_desde: '2026-09-21', pre_hasta: null, post_desde: null, post_hasta: null })
    expect(columnasEtapasDesde(undefined)).toEqual({})
  })
})

describe('hitos', () => {
  const hs = [
    hito({ tipo: 'pago', fecha: '2026-11-09', monto: 3_500_000, orden: 0 }),
    hito({ tipo: 'rodaje', fecha: '2026-10-13', fecha_fin: '2026-10-15', orden: 1 }),
    hito({ tipo: 'devolucion', fecha: '2026-09-18', orden: 2, hecho: true }),
    hito({ tipo: 'entrega', fecha: null, orden: 3 }),
    hito({ tipo: 'pago', fecha: '2026-09-10', monto: 3_500_000, hecho: true, orden: 4 }),
  ]
  it('ordena por fecha y deja los sin fecha al final', () => {
    expect(hitosOrdenados(hs).map((h) => h.fecha)).toEqual(['2026-09-10', '2026-09-18', '2026-10-13', '2026-11-09', null])
  })
  it('un rango cubre cada día', () => {
    expect(hitosDelDia(hs, '2026-10-14').map((h) => h.tipo)).toEqual(['rodaje'])
    expect(hitosDelDia(hs, '2026-10-16')).toHaveLength(0)
  })
  it('el zoom agrupa los 4 tipos clave en orden', () => {
    const z = zoomClave(hs)
    expect(z.map((g) => g.tipo)).toEqual(['devolucion', 'pre_equipo', 'rodaje', 'entrega'])
    expect(z[1].hitos).toHaveLength(0)
    expect(z[3].hitos[0].fecha).toBeNull()
  })
  it('suma pagos y separa lo cobrado', () => {
    expect(totalPagos(hs)).toEqual({ total: 7_000_000, cobrado: 3_500_000, pendiente: 3_500_000 })
  })
  it('próximo hito clave ignora hechos y pasados', () => {
    expect(proximoHitoClave(hs, '2026-09-18')?.tipo).toBe('rodaje') // la devolución del 18 está hecha
    expect(proximoHitoClave(hs, '2026-10-16')).toBeNull()          // la entrega no tiene fecha
  })
  it('rangoCrono mezcla etapas e hitos', () => {
    expect(rangoCrono(etapas, hs)).toEqual({ desde: '2026-09-07', hasta: '2026-11-09' })
    expect(rangoCrono({ desarrollo: { desde: null, hasta: null }, pre: { desde: null, hasta: null }, produccion: { desde: null, hasta: null }, post: { desde: null, hasta: null } }, [])).toBeNull()
  })
})

describe('semanas (la grilla de una página)', () => {
  it('cubre el rango de lunes a domingo', () => {
    const s = semanasDelCrono({ desde: '2026-09-07', hasta: '2026-11-09' }, '2026-09-10')
    expect(s[0]).toBe('2026-09-07')
    expect(s[s.length - 1]).toBe('2026-11-09')
    expect(s).toHaveLength(10)
  })
  it('sin rango muestra las semanas alrededor de hoy, mínimo 4', () => {
    const s = semanasDelCrono(null, '2026-09-10')
    expect(s[0]).toBe('2026-09-07')
    expect(s).toHaveLength(4)
  })
})

describe('normalizarHito (entradas del agente)', () => {
  it('defiende cada campo sin lanzar', () => {
    const h = normalizarHito({ tipo: 'lo-que-sea', fecha: '2026-10-13', fecha_fin: '2026-10-10', monto: '1.200.000', etapa: 'x', hecho: 'sí' })
    expect(h.tipo).toBe('otro')
    expect(h.fecha_fin).toBeNull()     // fin anterior a la fecha → null
    expect(h.monto).toBeNull()         // monto solo en pago
    expect(h.etapa).toBeNull()
    expect(h.hecho).toBe(false)
  })
  it('pago con monto en string chileno', () => {
    const h = normalizarHito({ tipo: 'pago', fecha: '2026-09-10', monto: '3.500.000', titulo: '  50% inicio ' })
    expect(h.monto).toBe(3_500_000)
    expect(h.titulo).toBe('50% inicio')
  })
  it('montoONull', () => {
    expect(montoONull(1200000.4)).toBe(1200000)
    expect(montoONull('-5')).toBeNull()
    expect(montoONull('')).toBeNull()
  })
})

import { diasHabiles, lecturaEtapas, avisosCrono, evaluarCompuertas, compuertasPorDefecto, mapaFeriados, habilAnterior, hitosEntre } from '@/lib/crono'

describe('v2: feriados, lectura, compuertas', () => {
  const fer = mapaFeriados([{ fecha: '2026-09-18', nombre: 'Fiestas Patrias' }, { fecha: '2026-10-12', nombre: 'Encuentro de Dos Mundos' }])
  it('cuenta hábiles descontando fines de semana y feriados', () => {
    expect(diasHabiles('2026-09-14', '2026-09-20', fer)).toBe(4)   // lun–jue; vie 18 feriado
    expect(diasHabiles('2026-10-12', '2026-10-12', fer)).toBe(0)
    expect(diasHabiles('2026-10-13', '2026-10-15', fer)).toBe(3)
    expect(diasHabiles('2026-10-15', '2026-10-13', fer)).toBe(0)
  })
  it('lectura por etapa con fin efectivo y peso', () => {
    const l = lecturaEtapas(etapas, fer)
    expect(l.find((x) => x.id === 'pre')?.hasta).toBe('2026-10-12')
    expect(l.find((x) => x.id === 'produccion')).toMatchObject({ corridos: 3, habiles: 3 })
    expect(Math.round(l.reduce((s, x) => s + x.peso, 0) * 100)).toBe(100)
  })
  it('avisa un hito clave en feriado y sugiere el hábil anterior', () => {
    const av = avisosCrono(etapas, [hito({ tipo: 'devolucion', titulo: 'Devolución', fecha: '2026-09-18' }), hito({ tipo: 'entrega', fecha: null })], fer)
    expect(av.map((a) => a.tipo)).toEqual(['hito_no_habil', 'sin_fecha'])
    expect(av[0].sugerido).toBe('2026-09-17')
    expect(habilAnterior('2026-09-20', fer)).toBe('2026-09-17') // dom → sáb → vie feriado → jue
  })
  it('evalúa compuertas automáticas y manuales', () => {
    const pago = hito({ tipo: 'pago', fecha: '2026-09-10', hecho: true })
    const dev = hito({ tipo: 'devolucion', fecha: '2026-09-18' })
    const rod = hito({ tipo: 'rodaje', fecha: '2026-10-13', rodaje_id: 'r1' })
    const cs = compuertasPorDefecto([pago, dev, rod]).map((c, i) => ({ ...c, id: `c${i}` }))
    const g = evaluarCompuertas(cs, [pago, dev, rod], new Set(['r1']))
    const pre = g.find((x) => x.destino === 'pre')!
    expect(pre.checks.map((c) => c.ok)).toEqual([true, false, false])
    expect(pre.faltan).toBe(2)
    const prod = g.find((x) => x.destino === 'produccion')!
    expect(prod.checks.find((c) => c.texto.startsWith('Rodaje confirmado'))?.ok).toBe(true) // rodaje real confirmado
    expect(prod.checks.find((c) => c.texto.startsWith('Pre de equipo'))?.automatica).toBe(false) // no había hito → manual
  })
  it('hitosEntre incluye rangos que cruzan el límite', () => {
    const rod = hito({ tipo: 'rodaje', fecha: '2026-10-13', fecha_fin: '2026-10-15' })
    expect(hitosEntre([rod], '2026-10-15', '2026-10-20')).toHaveLength(1)
    expect(hitosEntre([rod], '2026-10-16', '2026-10-20')).toHaveLength(0)
  })
})
