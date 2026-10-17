import { describe, it, expect } from 'vitest'
// @ts-expect-error — módulo .mjs sin tipos (lo usa scripts/cartolas-importar.mjs)
import { descripcionCartola, filasCartola, formatoRut, leerCartola, leerTarjeta, rutEnTexto, separarNuevas } from '../scripts/cartolas/lector.mjs'

// Arma una cartola sintética con el ancho fijo de Office Banking.
const pad = (s: string, n: number) => s.padEnd(n).slice(0, n)
const num = (n: number, ancho: number) => String(Math.round(n * 100)).padStart(ancho, '0')
function cabecera(saldoIni: number, saldoFin: number, desde = '31082026', hasta = '30092026') {
  return (
    '000771511171' + pad('EMPRESA DE PRUEBA E.I.R.L', 40) + '037' + pad('BCO. SANTANDER', 14) +
    '000084616290' + '059' + '17102026' + '100447' + 'MONEDA LOCALPESOS DE CHI' + '0000650101' + '0001' +
    desde + '+' + num(saldoIni, 16) + hasta + '+' + num(saldoFin, 16) + '0'.repeat(40)
  )
}
function mov(ddmm: string, ac: 'A' | 'C', glosa: string, monto: number) {
  return ddmm + ac + '00694' + pad(glosa, 31) + '0000000000' + num(monto, 14) + '401Agustinas      '
}

describe('formatoRut / rutEnTexto', () => {
  it('formatea y extrae RUTs', () => {
    expect(formatoRut('018932507K')).toBe('18.932.507-K')
    expect(formatoRut('0771511171')).toBe('77.151.117-1')
    expect(rutEnTexto('Transf a Diego López 15.499.108-5 — reembolso')).toBe('154991085')
    expect(rutEnTexto('Transf.Internet a 19.527.892-k')).toBe('19527892K')
    expect(rutEnTexto('Compra COPEC 60141')).toBeNull()
  })
})

describe('leerCartola', () => {
  const texto = [
    cabecera(1000, 1000 + 500000 - 120000 - 2000),
    mov('0109', 'A', '018932507K Transf de PERSONA UN', 500000),
    mov('0209', 'C', 'Transf.Internet a 19.410.450-2', 120000),
    mov('3009', 'C', 'COM.MANTENCION PLAN', 2000),
  ].join('\r\n')

  it('lee cabecera, movimientos y valida que cuadre', () => {
    const c = leerCartola(texto)
    expect(c).toMatchObject({ rut: '771511171', cuenta: '84616290', nro: '059', desde: '2026-08-31', hasta: '2026-09-30', cuadra: true })
    expect(c.movimientos).toHaveLength(3)
    expect(c.movimientos[0]).toMatchObject({ fecha: '2026-09-01', tipo: 'abono', monto: 500000 })
  })

  it('detecta una cartola que no cuadra', () => {
    const malo = texto.replace(num(1000 + 500000 - 120000 - 2000, 16), num(999, 16))
    expect(leerCartola(malo).cuadra).toBe(false)
  })

  it('pone el año anterior a los meses que cruzan diciembre', () => {
    const c = leerCartola([cabecera(0, 1000, '30112026', '02012027'), mov('1512', 'A', 'DEPOSITO', 1000)].join('\n'))
    expect(c.movimientos[0].fecha).toBe('2026-12-15')
  })

  it('arma filas con referencia estable y la glosa legible', () => {
    const filas = filasCartola(leerCartola(texto))
    expect(filas[0]).toMatchObject({ referencia: 'cartola 059 L1', descripcion: 'Transf de PERSONA UN 18.932.507-K', fuente: 'cuenta corriente' })
    expect(descripcionCartola('Compra   PAYU *UBER EATS ')).toBe('Compra PAYU *UBER EATS')
  })

  it('rechaza un archivo que no es cartola', () => {
    expect(() => leerCartola('"CUENTA:","0000000084616290"')).toThrow(/cabecera/)
  })
})

describe('leerTarjeta', () => {
  const texto = [
    'Nombre de la Empresa :  EMPRESA DE PRUEBA E.I.R.L', '', '',
    'FECHA;ESTABLECIMIENTO;DESCRIPCIÓN;MONTO;LUGAR',
    '09/10/2026;COPEC 1;COMPRA DE BENCINA;50100,00;SANTIAGO;',
    '09/10/2026;COPEC 1;COMPRA DE BENCINA;50100,00;SANTIAGO;',
    '09/10/2026;;PAGO;-295187,00;;',
    '05/10/2026;;SALDO INICIAL;245400,00;;',
  ].join('\n')

  it('salta el saldo inicial, el pago es abono y los repetidos llevan #2', () => {
    const { empresa, filas } = leerTarjeta(texto)
    expect(empresa).toBe('EMPRESA DE PRUEBA E.I.R.L')
    expect(filas.map((f: { referencia: string }) => f.referencia)).toEqual([
      'TC 2026-10-09 COPEC 1 50100',
      'TC 2026-10-09 COPEC 1 50100 #2',
      'TC 2026-10-09 PAGO 295187',
    ])
    expect(filas[2]).toMatchObject({ tipo: 'abono', monto: 295187, descripcion: 'Pago' })
  })
})

describe('separarNuevas', () => {
  const f = (fecha: string, monto: number, descripcion: string, referencia: string, tipo = 'cargo') =>
    ({ fecha, monto, tipo, fuente: 'cuenta corriente', descripcion, referencia })

  it('no duplica el mismo archivo ni lo cargado a mano o por correo', () => {
    const filas = [
      f('2026-10-01', 1000, 'Compra X', 'cartola 060 L1'),
      f('2026-10-02', 250000, 'Transf a FERNANDEZ 20.663.627-0', 'cartola 060 L2'),
      f('2026-10-02', 250000, 'Transf a ROA PINTO 19.410.450-2', 'cartola 060 L3'),
      f('2026-10-06', 80000, 'Transf a Josué De l 17.105.922-4', 'cartola 060 L4'),
      f('2026-10-07', 5000, 'Compra Y', 'cartola 060 L5'),
    ]
    const existentes = [
      f('2026-10-01', 1000, 'Compra X', 'cartola 060 L1'), // mismo archivo otra vez
      f('2026-10-02', 250000, 'Transf a Simón Fernández 20.663.627-0', ''), // a mano: calza por RUT, no el primero
      f('2026-10-03', 80000, 'Transf a Josué De la Fuente 17.105.922-4', 'gmail:abc'), // correo, 3 días antes
    ]
    const { nuevas, yaEstaban } = separarNuevas(filas, existentes)
    expect(nuevas.map((x: { referencia: string }) => x.referencia)).toEqual(['cartola 060 L3', 'cartola 060 L5'])
    expect(yaEstaban).toHaveLength(3)
  })

  it('con fecha distinta exige el mismo RUT', () => {
    const { nuevas } = separarNuevas(
      [f('2026-10-06', 80000, 'Transf a OTRA 11.111.111-1', 'cartola 060 L1')],
      [f('2026-10-05', 80000, 'Transf a Josué 17.105.922-4', 'gmail:x')],
    )
    expect(nuevas).toHaveLength(1)
  })

  it('un existente calza con una sola fila', () => {
    const { nuevas } = separarNuevas(
      [f('2026-10-08', 200000, 'Traspaso Internet a T. Crédito', 'cartola 060 L1'), f('2026-10-08', 200000, 'Traspaso Internet a T. Crédito', 'cartola 060 L2')],
      [f('2026-10-08', 200000, 'Traspaso Internet a T. Crédito', '')],
    )
    expect(nuevas).toHaveLength(1)
  })
})
