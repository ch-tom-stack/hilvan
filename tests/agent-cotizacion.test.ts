import { describe, it, expect } from 'vitest'
import { validarCotizacion, DEPARTAMENTOS_DEFAULT } from '@/lib/agent-cotizacion'

describe('validarCotizacion — cabecera y defaults', () => {
  it('rechaza body sin nombre', () => {
    const r = validarCotizacion({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/nombre/)
  })

  it('acepta nombre mínimo y aplica defaults de la UI', () => {
    const r = validarCotizacion({ nombre: 'Spot Verano' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.cabecera.nombre).toBe('Spot Verano')
    expect(r.data.cabecera.con_iva).toBe(true)
    expect(r.data.cabecera.formato_pdf).toBe('detallado')
    expect(r.data.cabecera.descuento_global).toBe(0)
    expect(r.data.cabecera.descuento_global_tipo).toBe('monto')
    // Sin departamentos → usar los 8 por defecto
    expect(r.data.usarDepartamentosDefault).toBe(true)
    expect(DEPARTAMENTOS_DEFAULT.length).toBe(8)
  })

  it('normaliza strings vacíos a null (cliente/proyecto/notas)', () => {
    const r = validarCotizacion({
      nombre: 'X',
      cliente_id: '   ',
      proyecto_id: '',
      notas_cliente: '',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.cabecera.cliente_id).toBeNull()
    expect(r.data.cabecera.proyecto_id).toBeNull()
    expect(r.data.cabecera.notas_cliente).toBeNull()
  })

  it('valida formato de fecha_factura_emitida', () => {
    const r = validarCotizacion({ nombre: 'X', fecha_factura_emitida: '14-06-2026' })
    expect(r.ok).toBe(false)
    const ok = validarCotizacion({ nombre: 'X', fecha_factura_emitida: '2026-06-14' })
    expect(ok.ok).toBe(true)
  })

  it('rechaza descuento_global no finito', () => {
    const r = validarCotizacion({ nombre: 'X', descuento_global: 'abc' })
    expect(r.ok).toBe(false)
  })

  it('rechaza formato_pdf / descuento_global_tipo inválidos', () => {
    expect(validarCotizacion({ nombre: 'X', formato_pdf: 'raro' }).ok).toBe(false)
    expect(validarCotizacion({ nombre: 'X', descuento_global_tipo: 'raro' }).ok).toBe(false)
  })
})

describe('validarCotizacion — departamentos / subgrupos / ítems', () => {
  it('normaliza un ítem completo con defaults reales', () => {
    const r = validarCotizacion({
      nombre: 'Coti',
      departamentos: [
        {
          nombre: 'Fotografía',
          items: [{ tipo: 'rol', nombre: 'DOP', precio_cliente: 500000 }],
        },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.usarDepartamentosDefault).toBe(false)
    const item = r.data.departamentos[0].items[0]
    expect(item.tipo).toBe('rol')
    expect(item.precio_cliente).toBe(500000)
    // defaults de la UI
    expect(item.cantidad).toBe(1)
    expect(item.dias).toBe(1)
    expect(item.unidad).toBe('día')
    // línea facturable: incluido=false (incluido=true contaría como $0)
    expect(item.incluido).toBe(false)
    // al dar un precio_cliente directo, se marca personalizado para que cuente
    expect(item.precio_cliente_personalizado).toBe(true)
    expect(item.con_boleta).toBe(false)
    expect(item.tasa_boleta).toBe(0)
    expect(item.descuento_item).toBe(0)
    expect(item.descuento_item_tipo).toBe('monto')
    expect(item.orden).toBe(0)
  })

  it('acepta precio string numérico (parseFloat) y conserva decimales', () => {
    const r = validarCotizacion({
      nombre: 'C',
      departamentos: [{ nombre: 'D', items: [{ nombre: 'X', precio_cliente: '1234.56' }] }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.departamentos[0].items[0].precio_cliente).toBe(1234.56)
  })

  it('rechaza tipo de ítem inválido', () => {
    const r = validarCotizacion({
      nombre: 'C',
      departamentos: [{ nombre: 'D', items: [{ tipo: 'bet', nombre: 'X' }] }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/tipo inválido/)
  })

  it('rechaza unidad inválida', () => {
    const r = validarCotizacion({
      nombre: 'C',
      departamentos: [{ nombre: 'D', items: [{ nombre: 'X', unidad: 'semana' }] }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/unidad inválida/)
  })

  it('rechaza ítem sin nombre', () => {
    const r = validarCotizacion({
      nombre: 'C',
      departamentos: [{ nombre: 'D', items: [{ tipo: 'rol' }] }],
    })
    expect(r.ok).toBe(false)
  })

  it('rechaza precio no finito en un ítem', () => {
    const r = validarCotizacion({
      nombre: 'C',
      departamentos: [{ nombre: 'D', items: [{ nombre: 'X', precio_cliente: 'NaN' }] }],
    })
    expect(r.ok).toBe(false)
  })

  it('rechaza departamento sin nombre', () => {
    const r = validarCotizacion({ nombre: 'C', departamentos: [{ items: [] }] })
    expect(r.ok).toBe(false)
  })

  it('procesa subgrupos con sus ítems', () => {
    const r = validarCotizacion({
      nombre: 'C',
      departamentos: [
        {
          nombre: 'Arte',
          subgrupos: [{ nombre: 'Utilería', items: [{ nombre: 'Mesa', tipo: 'consumible' }] }],
        },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const sg = r.data.departamentos[0].subgrupos[0]
    expect(sg.nombre).toBe('Utilería')
    expect(sg.items[0].nombre).toBe('Mesa')
    expect(sg.items[0].tipo).toBe('consumible')
  })

  it('rechaza departamentos que no sean array', () => {
    const r = validarCotizacion({ nombre: 'C', departamentos: 'nope' })
    expect(r.ok).toBe(false)
  })

  it('departamentos vacío [] NO usa default (lista explícita vacía)', () => {
    const r = validarCotizacion({ nombre: 'C', departamentos: [] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.usarDepartamentosDefault).toBe(false)
    expect(r.data.departamentos.length).toBe(0)
  })
})
