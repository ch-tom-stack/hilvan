import { describe, it, expect } from 'vitest'
import { periodoAAAAMM, prepararImportacion, verificarImportaciones, type ImportacionSii } from '@/lib/sii-cli'
import { filaDesdeDocumento, ventaDesdeDocumento, type SiiDocumento } from '@/lib/agent-sii'

// Formas reales de sii-cli 0.10.0 (observadas el 16-oct-2026), con datos inventados.
const RUT_CH = '77151117-1'

function resumen(side: 'COMPRA' | 'VENTA', filas: [string, number][]) {
  return {
    rut: RUT_CH,
    periodo: '2026-06',
    side,
    rows: filas.map(([codigoTipoDoc, totalDocumentos]) => ({ codigoTipoDoc, totalDocumentos })),
    totalDocumentos: filas.reduce((s, [, n]) => s + n, 0),
  }
}

function doc(codigoTipoDoc: string, folio: number, extra: Record<string, unknown> = {}, raw: Record<string, unknown> = {}) {
  return {
    folio,
    rutEmisor: '76000000-K',
    razonSocial: 'PROVEEDOR A LTDA',
    fechaEmision: '2026-06-10',
    fechaRecepcion: '2026-06-10 09:51:58',
    montoExento: 0,
    montoNeto: 42420,
    montoIva: 8060,
    montoTotal: 50480,
    codigoTipoDoc,
    raw: { detNroDoc: folio, detTipoDocRef: 0, detFolioDocRef: null, detAnulado: null, ...raw },
    ...extra,
  }
}

function detalle(side: 'COMPRA' | 'VENTA', docs: unknown[], rejectedTypes: string[] = []) {
  return { rut: RUT_CH, periodo: '2026-06', side, docs, incomplete: rejectedTypes.length > 0, rejectedTypes }
}

function bte(boletas: unknown[], totalBoletas: number | null = boletas.length) {
  return { rut: RUT_CH, periodo: '2026-06', side: 'RECIBIDAS', totalBoletas, totales: {}, boletas }
}

const boleta = (folio: number, estado = 'VIG') => ({
  folio,
  fecha: '08/06/2026',
  contraparteRut: '20000000-0',
  contraparteNombre: 'PERSONA B',
  totalHonorarios: 294985,
  honorariosLiquidos: 250000,
  retencionEmisor: null,
  retencionReceptor: 44985,
  estado,
  fechaAnulacion: null,
  socProfesional: false,
})

describe('periodoAAAAMM', () => {
  it('acepta AAAA-MM y AAAAMM', () => {
    expect(periodoAAAAMM('2026-06')).toBe('202606')
    expect(periodoAAAAMM('202606')).toBe('202606')
  })
  it('rechaza mes inválido o basura', () => {
    expect(periodoAAAAMM('2026-13')).toBeNull()
    expect(periodoAAAAMM('junio')).toBeNull()
    expect(periodoAAAAMM(undefined)).toBeNull()
  })
})

describe('prepararImportacion — compras', () => {
  it('mes que cuadra: completo, NC con referencia, montos y fecha', () => {
    const r = prepararImportacion(
      {
        periodo: '2026-06',
        compras: {
          resumen: resumen('COMPRA', [['33', 1], ['61', 1]]),
          detalle: detalle('COMPRA', [
            doc('33', 177152),
            doc('61', 8324, {}, { detTipoDocRef: 39, detFolioDocRef: '66991' }),
          ]),
        },
      },
      RUT_CH,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [lado] = r.lados
    expect(lado.estado).toBe('completo')
    expect(lado.errores).toEqual([])
    const [fac, nc] = lado.filas
    expect(fac).toMatchObject({
      fuente: 'rcv_compra', dte: 33, tipo_documento: 'factura', folio: '177152',
      rut_emisor: '76000000-K', fecha_documento: '2026-06-10', neto: 42420, iva: 8060, total: 50480, monto: 50480,
      doc_ref_folio: null, doc_ref_tipo: null, anulada: false,
    })
    expect(nc).toMatchObject({ tipo_documento: 'nota_credito', monto: 50480, doc_ref_folio: '66991', doc_ref_tipo: 39 })
  })

  it('exenta (34) sin IVA', () => {
    const r = prepararImportacion({
      periodo: '202606',
      compras: {
        resumen: resumen('COMPRA', [['34', 1]]),
        detalle: detalle('COMPRA', [doc('34', 1, { montoNeto: 0, montoIva: 0, montoExento: 18764, montoTotal: 18764 })]),
      },
    })
    expect(r.ok && r.lados[0].filas[0]).toMatchObject({ tipo_documento: 'exenta', monto: 18764 })
  })

  it('si el resumen dice más documentos de los que llegaron → incompleto (nunca "no hubo")', () => {
    const r = prepararImportacion({
      periodo: '2026-06',
      compras: { resumen: resumen('COMPRA', [['33', 24]]), detalle: detalle('COMPRA', [doc('33', 1)]) },
    })
    expect(r.ok && r.lados[0].estado).toBe('incompleto')
    expect(r.ok && r.lados[0].errores[0]).toContain('dice 24 documentos y llegaron 1')
  })

  it('un tipo rechazado por el SII con documentos → incompleto', () => {
    const r = prepararImportacion({
      periodo: '2026-06',
      compras: {
        resumen: resumen('COMPRA', [['33', 1], ['34', 3]]),
        detalle: detalle('COMPRA', [doc('33', 1)], ['34']),
      },
    })
    expect(r.ok && r.lados[0].estado).toBe('incompleto')
    expect(r.ok && r.lados[0].errores).toEqual(['Tipo 34: el SII rechazó el detalle (el resumen dice 3 documentos)'])
  })
})

describe('prepararImportacion — ventas', () => {
  it('el tipo 48 con 0 documentos que el SII rechaza no deja el mes incompleto', () => {
    const r = prepararImportacion({
      periodo: '2026-06',
      ventas: {
        resumen: resumen('VENTA', [['33', 1], ['48', 0]]),
        detalle: detalle('VENTA', [doc('33', 181, { rutEmisor: '77000000-K', razonSocial: 'CLIENTE C S.A.' })], ['48']),
      },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lados[0]).toMatchObject({ lado: 'ventas', fuente: 'rcv_venta', estado: 'completo', documentos: 1 })
    expect(r.lados[0].filas[0]).toMatchObject({ rut_emisor: '77000000-K', razon_social_emisor: 'CLIENTE C S.A.' })
  })
})

describe('prepararImportacion — boletas de honorarios', () => {
  it('fecha DD/MM/YYYY → ISO, bruto como monto, anuladas guardadas y marcadas', () => {
    const r = prepararImportacion({ periodo: '2026-06', bhe: bte([boleta(9), boleta(10, 'ANUL')]) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [lado] = r.lados
    expect(lado.estado).toBe('completo')
    expect(lado.filas[0]).toMatchObject({
      fuente: 'bhe_recibida', dte: 0, tipo_documento: 'boleta', folio: '9', fecha_documento: '2026-06-08',
      total: 294985, monto: 294985, anulada: false,
    })
    expect(lado.filas[1].anulada).toBe(true)
    expect('codigo' in lado.filas[0]).toBe(false) // no pisa el código que guardó el gateway
  })

  it('si el SII no informa el total o no cuadra → incompleto', () => {
    const sinTotal = prepararImportacion({ periodo: '2026-06', bhe: bte([boleta(9)], null) })
    expect(sinTotal.ok && sinTotal.lados[0].estado).toBe('incompleto')
    const noCuadra = prepararImportacion({ periodo: '2026-06', bhe: bte([boleta(9)], 5) })
    expect(noCuadra.ok && noCuadra.lados[0].errores).toEqual(['El SII dice 5 boletas y llegaron 1'])
  })
})

describe('prepararImportacion — rechazos de forma (no se escribe nada)', () => {
  it('otro período', () => {
    const r = prepararImportacion({ periodo: '2026-07', bhe: bte([boleta(9)]) })
    expect(r).toEqual({ ok: false, error: 'bhe: es del período 2026-06, no de 202607' })
  })
  it('otro RUT', () => {
    const r = prepararImportacion({ periodo: '2026-06', bhe: { ...bte([]), rut: '11111111-1' } }, RUT_CH)
    expect(r.ok).toBe(false)
  })
  it('lado cambiado (ventas mandadas como compras)', () => {
    const r = prepararImportacion({
      periodo: '2026-06',
      compras: { resumen: resumen('VENTA', []), detalle: detalle('VENTA', []) },
    })
    expect(r).toEqual({ ok: false, error: 'compras.resumen: se esperaba side COMPRA y llegó VENTA' })
  })
  it('sin ningún lado', () => {
    expect(prepararImportacion({ periodo: '2026-06' }).ok).toBe(false)
  })
})

describe('verificarImportaciones', () => {
  const imp = (lado: ImportacionSii['lado'], estado: ImportacionSii['estado'], errores: string[] = []): ImportacionSii => ({
    periodo: '202606', lado, estado, documentos: 1, errores, importado_at: '2026-10-16T21:00:00Z',
  })

  it('todo completo → ok', () => {
    expect(verificarImportaciones('202606', ['compras', 'bhe'], [imp('compras', 'completo'), imp('bhe', 'completo')])).toEqual({ ok: true })
  })

  it('sin importar → error explícito, no lista vacía', () => {
    const r = verificarImportaciones('202606', ['compras', 'bhe'], [imp('compras', 'completo')])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.faltan).toEqual(['bhe'])
    expect(r.error).toContain('NO significa que no haya documentos')
    expect(r.error).toContain('npm run sii:importar -- 2026-06')
  })

  it('incompleto → error con los motivos', () => {
    const r = verificarImportaciones('202606', ['ventas'], [imp('ventas', 'incompleto', ['Tipo 33: …'])])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.incompletos).toEqual([{ lado: 'ventas', errores: ['Tipo 33: …'], importado_at: '2026-10-16T21:00:00Z' }])
  })
})

describe('sii_documentos → filas del sync', () => {
  const base: SiiDocumento = {
    periodo: '202606', fuente: 'rcv_compra', dte: 61, tipo_documento: 'nota_credito', rut_emisor: '76000000-K',
    razon_social_emisor: 'PROVEEDOR A LTDA', folio: '8324', fecha_documento: '2026-06-10', neto: 42420, iva: 8060,
    total: 50480, monto: 50480, anulada: false, doc_ref_folio: '66991', doc_ref_tipo: 39, raw: {},
  }

  it('NC de compra lleva referencia y no da crédito fiscal', () => {
    expect(filaDesdeDocumento(base)).toMatchObject({
      tipo_documento: 'nota_credito', monto: 50480, referencia_folio: '66991', referencia_tipo: 39,
      factura_casa_hiedra: false, descripcion_sugerida: 'Nota de crédito PROVEEDOR A LTDA',
    })
  })

  it('factura de compra da crédito fiscal y no lleva referencia', () => {
    const f = filaDesdeDocumento({ ...base, dte: 33, tipo_documento: 'factura', doc_ref_folio: null, doc_ref_tipo: null })
    expect(f.factura_casa_hiedra).toBe(true)
    expect('referencia_folio' in f).toBe(false)
  })

  it('boleta de honorarios', () => {
    const f = filaDesdeDocumento({ ...base, fuente: 'bhe_recibida', dte: 0, tipo_documento: 'boleta', razon_social_emisor: 'PERSONA B', monto: 294985 })
    expect(f).toMatchObject({ fuente: 'bhe_recibida', tipo_documento: 'boleta', monto: 294985, descripcion_sugerida: 'Honorarios PERSONA B' })
  })

  it('venta: receptor = cliente, total con IVA', () => {
    const v = ventaDesdeDocumento({ ...base, fuente: 'rcv_venta', dte: 33, tipo_documento: 'factura', neto: 2679886, iva: 509178, total: 3189064 })
    expect(v).toMatchObject({ tipo_dte: 33, receptor_rut: '76000000-K', monto_neto: 2679886, iva: 509178, monto_total: 3189064 })
  })
})
