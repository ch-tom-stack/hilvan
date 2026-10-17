import { describe, it, expect } from 'vitest'
import { codigoBanco, bancoPorCodigo } from '../lib/bancos'
import {
  calzarPagos, cuentaParaPlanilla, elegirCuenta, filaPlanilla, glosaDeGasto, leerAvisoSantander,
  limpiarCuenta, limpiarRut, revisarPago, rutParaPlanilla, rutValido, rutsEnTexto,
} from '../lib/pagos-masivos'

describe('RUT', () => {
  it('limpia y valida', () => {
    expect(limpiarRut('19.410.450-2')).toBe('19410450-2')
    expect(limpiarRut('103623944')).toBe('10362394-4')
    expect(limpiarRut('25476440k')).toBe('25476440-K')
    expect(limpiarRut('abc')).toBe('')
    expect(rutValido('19.410.450-2')).toBe(true)
    expect(rutValido('25476440K')).toBe(true)
    expect(rutValido('19.410.450-3')).toBe(false)
    expect(rutParaPlanilla('25.476.440-K')).toBe('25476440K')
  })
  it('saca los RUT de una glosa', () => {
    expect(rutsEnTexto('Transf a ROA PINTO NATALIA ALEJANDRA 19.410.450-2')).toEqual(['19410450-2'])
    expect(rutsEnTexto('Transf.Internet a 19.527.892-k')).toEqual(['19527892-K'])
    expect(rutsEnTexto('Compra COPEC 60141')).toEqual([])
  })
})

describe('bancos y cuentas', () => {
  it('reconoce los nombres que usa el banco', () => {
    expect(codigoBanco('BANCO SANTANDER CHILE')).toBe('037')
    expect(codigoBanco('BANCO SANTANDER (CHILE)')).toBe('037')
    expect(codigoBanco('Banco de Chile')).toBe('001')
    expect(codigoBanco('Chile')).toBe('001')
    expect(codigoBanco('BANCO DEL ESTADO DE CHILE')).toBe('012')
    expect(codigoBanco('Falabella')).toBe('051')
    expect(codigoBanco('Itaú')).toBe('039')
    expect(codigoBanco('BANCO DE CREDITO E INVERSIONES')).toBe('016')
    expect(codigoBanco('51')).toBe('051')
    expect(codigoBanco('Otro')).toBeNull()
    expect(bancoPorCodigo(51)?.nombre).toBe('Falabella')
  })
  it('limpia la cuenta y la formatea para la planilla', () => {
    expect(limpiarCuenta('0-000-7364371-6')).toBe('73643716')
    expect(limpiarCuenta('000065550237')).toBe('65550237')
    expect(cuentaParaPlanilla('037', '65550237')).toBe('000065550237')
    expect(cuentaParaPlanilla('051', '19993246348')).toBe('19993246348')
  })
})

describe('leerAvisoSantander', () => {
  it('formato masiva (Transferencia de Fondos Nro.)', () => {
    const texto = ' Aviso de transferencia de fondos - Cliente\n\n| Estimado(a) Cliente: EMPRESA E.I.R.L Le informamos que hoy 08/10/2026 13:36 hemos realizado una transferencia de fondos desde su cuenta nro. 000084616290, de acuerdo al siguiente detalle: Nombre del destinatario : PEREZ MUNOZ VANESA ANDREA - Destino Rut del destinatario : 18.897.494-5 Banco de destino : BANCO SANTANDER CHILE Cuenta de destino: 000074320821 Monto transferido : 500.000 Autorizada: Adjuntamos información |'
    expect(leerAvisoSantander(texto)).toEqual({
      cuentas: [{ rut: '18897494-5', nombre: 'PEREZ MUNOZ VANESA ANDREA', banco_codigo: '037', numero_cuenta: '74320821', tipo_cuenta: null }],
      monto: 500000,
    })
  })

  it('aviso de transferencia una a una', () => {
    const texto = [
      '| | # Aviso de Transferencia de Fondos | |',
      '| ### Origen |', '| |', '| Tipo de cuenta | Cuenta Nº |', '| Cuenta Corriente | 0-000-8461629-0 |',
      '| RUT | Razon Social |', '| 77.151.117-1 | TOMAS MONTEALEGRE PRODUCCIONES E.I.R.L |',
      '| ### Destino |', '| |', '| Banco | Tipo de cuenta |', '| BANCO SANTANDER (CHILE) | Cuenta Corriente |',
      '| Cuenta Nº | RUT |', '| 0-000-7364371-6 | 19.410.450-2 |', '| Nombre |', '| ROA PINTO NATALIA ALEJANDRA |',
      '| Mensaje |', '| Pago de Remuneraciones |', '', '| Monto de transferencia 01-10-2026 | $ 530.000 |',
    ].join('\n')
    expect(leerAvisoSantander(texto)).toEqual({
      cuentas: [{ rut: '19410450-2', nombre: 'ROA PINTO NATALIA ALEJANDRA', banco_codigo: '037', numero_cuenta: '73643716', tipo_cuenta: 'corriente' }],
      monto: 530000,
    })
  })

  it('comprobante desde la cuenta personal: guarda el origen, nunca la empresa', () => {
    const texto = [
      '| Monto transferido |', '', '| |', '| $ 4.500.000 |', '| Datos de origen |', '| |', '| Tipo de cuenta |', '| |', '| Cuenta Vista |',
      '| |', '| Nº de cuenta |', '| |', '| 0-070-02-82433-1 |', '| |', '| RUT |', '| |', '| 18.932.507-K |',
      '| Nombre | TOMAS IGNACIO MONTEALEGRE MULLER |', '| Comentario | |', '| Datos de destino |', '| |', '| Nombre |', '| |',
      '| TOMAS MONTEALEGRE PRODUCCIONES E.I.R.L |', '| |', '| RUT |', '| |', '| 77.151.117-1 |', '| |', '| Banco |', '| |',
      '| Banco Santander |', '| Tipo de cuenta | Cuenta Corriente |', '| Nº de cuenta | 0-000-84-61629-0 |', '| E-mail | |',
    ].join('\n')
    expect(leerAvisoSantander(texto)).toEqual({
      cuentas: [{ rut: '18932507-K', nombre: 'TOMAS IGNACIO MONTEALEGRE MULLER', banco_codigo: '037', numero_cuenta: '7002824331', tipo_cuenta: 'vista' }],
      monto: 4500000,
    })
  })

  it('un correo que no es aviso no inventa cuentas', () => {
    expect(leerAvisoSantander('+ Claves para fortalecer tu empresa.')).toEqual({ cuentas: [], monto: null })
  })
})

describe('planilla', () => {
  const santander = { rut: '10.362.394-4', nombre: 'ORTEGA CHAVEZ FELIPE RICARDO', banco_codigo: '037', numero_cuenta: '65550237', monto: 320425, glosa: 'BH 549', email: 'ornamentastudio@gmail.com' }
  const falabella = { rut: '17.622.809-1', nombre: 'Karen CABRERA', banco_codigo: '051', numero_cuenta: '19993246348', monto: 150000, glosa: 'BH 794', email: 'karen.cabrerazurita@gmail.com' }

  it('arma las filas igual que la planilla de Office Banking', () => {
    expect(filaPlanilla(santander)).toEqual(['84616290', 'CLP', '000065550237', 'CLP', null, '103623944', 'ORTEGA CHAVEZ FELIPE RICARDO', 320425, 'BH 549', 'ornamentastudio@gmail.com', 'BH 549', 'BH 549', 'BH 549'])
    expect(filaPlanilla(falabella)).toEqual(['84616290', 'CLP', '19993246348', 'CLP', '051', '176228091', 'Karen CABRERA', 150000, 'BH 794', 'karen.cabrerazurita@gmail.com', 'BH 794', 'BH 794', null])
  })

  it('revisa lo que el banco rechazaría', () => {
    expect(revisarPago(santander)).toEqual({ errores: [], avisos: [] })
    expect(revisarPago({ ...santander, banco_codigo: null, numero_cuenta: null, monto: 10.5 }).errores)
      .toEqual(['falta el banco', 'falta la cuenta', 'monto inválido (10.5)'])
    expect(revisarPago({ ...santander, rut: '77.151.117-1' }).errores).toContain('el destinatario es la misma empresa')
    expect(revisarPago({ ...santander, banco_codigo: '049' }).avisos[0]).toMatch(/BICE/)
  })
})

describe('elegirCuenta', () => {
  it('prefiere la confirmada por el banco y la más reciente', () => {
    const base = { rut: '1-9', nombre: 'x', banco_codigo: '037', tipo_cuenta: null }
    const vieja = { ...base, id: 'a', numero_cuenta: '1', confirmada: true, ultima_vez: '2026-05-01' }
    const nueva = { ...base, id: 'b', numero_cuenta: '2', confirmada: true, ultima_vez: '2026-10-01' }
    const ficha = { ...base, id: 'c', numero_cuenta: '3', confirmada: false, ultima_vez: '2026-10-10' }
    expect(elegirCuenta([vieja, ficha, nueva])?.id).toBe('b')
    expect(elegirCuenta([ficha])?.id).toBe('c')
    expect(elegirCuenta([])).toBeNull()
  })
})

describe('calzarPagos', () => {
  const pend = [
    { id: 'p1', rut: '19410450-2', monto: 530000, fecha_lote: '2026-10-01' },
    { id: 'p2', rut: '20663627-0', monto: 250000, fecha_lote: '2026-10-01' },
  ]
  it('calza por RUT + monto dentro de la ventana', () => {
    const cargos = [
      { id: 'm1', fecha: '2026-10-02', monto: 530000, tipo: 'cargo', descripcion: 'Transf a ROA PINTO NATALIA ALEJANDRA 19.410.450-2' },
      { id: 'm2', fecha: '2026-10-02', monto: 250000, tipo: 'cargo', descripcion: 'Transf a Josué 17.105.922-4' }, // otro RUT
      { id: 'm3', fecha: '2026-12-15', monto: 250000, tipo: 'cargo', descripcion: 'Transf a FERNANDEZ 20.663.627-0' }, // fuera de ventana
    ]
    expect(calzarPagos(pend, cargos)).toEqual([{ item_id: 'p1', movimiento_id: 'm1', fecha: '2026-10-02' }])
  })
  it('un cargo paga un solo ítem y respeta los ya usados', () => {
    const dos = [
      { id: 'a', rut: '19410450-2', monto: 1000, fecha_lote: '2026-10-01' },
      { id: 'b', rut: '19410450-2', monto: 1000, fecha_lote: '2026-10-01' },
    ]
    const cargos = [
      { id: 'm1', fecha: '2026-10-01', monto: 1000, tipo: 'cargo', descripcion: 'Transf.Internet a 19.410.450-2' },
      { id: 'm2', fecha: '2026-10-03', monto: 1000, tipo: 'abono', descripcion: 'de 19.410.450-2' },
    ]
    expect(calzarPagos(dos, cargos)).toHaveLength(1)
    expect(calzarPagos(dos, cargos, new Set(['m1']))).toHaveLength(0)
  })
})

describe('glosaDeGasto', () => {
  it('usa el folio de la boleta', () => {
    expect(glosaDeGasto({ tipo_documento: 'boleta', folio: '549' })).toBe('BH 549')
    expect(glosaDeGasto({ tipo_documento: 'factura', folio: '12' })).toBe('Factura 12')
    expect(glosaDeGasto({ descripcion: 'Arriendo lente' })).toBe('Arriendo lente')
  })
})

describe('escribirPlanilla', () => {
  it('guarda cuentas, códigos y RUT como texto (Excel no se come los ceros)', async () => {
    const ExcelJS = (await import('exceljs')).default
    const { escribirPlanilla } = await import('../lib/planilla-santander')
    const buf = await escribirPlanilla([
      { rut: '10.362.394-4', nombre: 'ORTEGA CHAVEZ FELIPE RICARDO', banco_codigo: '037', numero_cuenta: '65550237', monto: 320425, glosa: 'BH 549', email: 'ornamentastudio@gmail.com' },
      { rut: '17.622.809-1', nombre: 'Karen CABRERA', banco_codigo: '051', numero_cuenta: '19993246348', monto: 150000, glosa: 'BH 794' },
    ])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Hoja1')!
    expect(ws.getRow(1).getCell(1).value).toBe('Cuenta origen\n(obligatorio)')
    expect(ws.getRow(2).getCell(1).value).toBe('84616290')
    expect(ws.getRow(2).getCell(3).value).toBe('000065550237')
    expect(ws.getRow(2).getCell(5).value).toBeNull()
    expect(ws.getRow(2).getCell(8).value).toBe(320425)
    expect(ws.getRow(3).getCell(5).value).toBe('051')
    expect(ws.getRow(3).getCell(6).value).toBe('176228091')
    expect(ws.getRow(3).getCell(10).value).toBeNull()
    expect(ws.rowCount).toBe(3)
  })
})
