import { describe, it, expect } from 'vitest'
import { limpiarTexto, normalizarReferencias, referenciasScript } from '../scripts/sii/factura.mjs'

describe('limpiarTexto', () => {
  it('cambia la raya larga que el SII rechaza y conserva las tildes', () => {
    expect(limpiarTexto('PRUEBA HILVÁN — NO EMITIR')).toBe('PRUEBA HILVÁN - NO EMITIR')
  })
  it('cambia comillas tipográficas y quita lo que no es Latin-1', () => {
    expect(limpiarTexto('“Video” 9:16 ✅ …')).toBe('"Video" 9:16 ...')
  })
})

describe('normalizarReferencias', () => {
  it('OC y HES con sus códigos del SII', () => {
    expect(
      normalizarReferencias([
        { tipo: 'oc', folio: '6001807651', fecha: '2026-09-11' },
        { tipo: 'HES', folio: ' 1003053261 ', fecha: '2026-09-11', razon: 'Hoja — entrada' },
      ]),
    ).toEqual([
      { tipo: '801', folio: '6001807651', fecha: '2026-09-11', razon: '6001807651' },
      { tipo: 'HES', folio: '1003053261', fecha: '2026-09-11', razon: 'Hoja - entrada' },
    ])
  })
  it('sin referencias → lista vacía', () => {
    expect(normalizarReferencias(undefined)).toEqual([])
  })
  it('rechaza más de 3, folio largo, fecha mal escrita o sin tipo', () => {
    const r = { tipo: 'oc', folio: '1', fecha: '2026-09-11' }
    expect(() => normalizarReferencias([r, r, r, r])).toThrow('3 referencias')
    expect(() => normalizarReferencias([{ ...r, folio: '1234567890123456789' }])).toThrow('18 caracteres')
    expect(() => normalizarReferencias([{ ...r, fecha: '11/09/2026' }])).toThrow('AAAA-MM-DD')
    expect(() => normalizarReferencias([{ ...r, tipo: '' }])).toThrow('falta tipo')
  })
})

describe('referenciasScript', () => {
  it('es JavaScript válido con las referencias incrustadas', () => {
    const js = referenciasScript([{ tipo: '801', folio: '007060', fecha: '2026-09-12', razon: '' }])
    expect(() => new Function(`return ${js}`)).not.toThrow()
    expect(js).toContain('"folio":"007060"')
  })
})
