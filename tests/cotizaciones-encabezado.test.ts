import { describe, it, expect } from 'vitest'
import { encabezadoCotizacion, etiquetaEncabezado } from '@/lib/cotizaciones-encabezado'

describe('encabezadoCotizacion', () => {
  it('modelo nuevo: cliente = marca, agencia aparte', () => {
    expect(encabezadoCotizacion({ cliente_nombre_libre: 'Stanley Tools', agencia_nombre_libre: 'TMP.Digital' }))
      .toEqual({ cliente: 'Stanley Tools', agencia: 'TMP.Digital', modeloViejo: false })
    expect(encabezadoCotizacion({ cliente: { nombre: 'Aldo' }, agencia: { nombre: 'Falabella' } }).agencia).toBe('Falabella')
  })
  it('modelo viejo: cliente_* era la agencia y cliente_final la marca', () => {
    expect(encabezadoCotizacion({ cliente: { nombre: 'Republik' }, cliente_final: 'Falabella' }))
      .toEqual({ cliente: 'Falabella', agencia: 'Republik', modeloViejo: true })
  })
  it('modelo viejo con el mismo nombre en ambos no inventa agencia', () => {
    expect(encabezadoCotizacion({ cliente_nombre_libre: 'ArqFilmFest', cliente_final: 'ArqFilmFest' }))
      .toEqual({ cliente: 'ArqFilmFest', agencia: null, modeloViejo: true })
  })
  it('sin nada → nulos; etiqueta compacta', () => {
    expect(encabezadoCotizacion({})).toEqual({ cliente: null, agencia: null, modeloViejo: false })
    expect(etiquetaEncabezado({})).toBe('—')
    expect(etiquetaEncabezado({ cliente_nombre_libre: 'Stanley Tools', agencia_nombre_libre: 'TMP.Digital' })).toBe('TMP.Digital · Stanley Tools')
    expect(etiquetaEncabezado({ cliente: { nombre: null, empresa: 'Sky' } })).toBe('Sky')
  })
})
