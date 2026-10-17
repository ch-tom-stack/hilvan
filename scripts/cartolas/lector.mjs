// Lectura pura (sin red ni disco) de lo que se descarga de Office Banking Santander:
//   - cartola mensual de cuenta corriente (.tx1, ancho fijo, latin-1)
//   - movimientos no facturados de la tarjeta de crédito (mov_nac*.txt, CSV con ';')
// y el cruce contra lo que ya está en movimientos_bancarios para no duplicar.
// Lo usa scripts/cartolas-importar.mjs; tests en tests/cartolas.test.ts.

export const RUT_EMPRESA = '771511171' // 77.151.117-1 sin puntos ni guion
export const CUENTA_EMPRESA = '84616290'
export const FUENTE_CC = 'cuenta corriente'
export const FUENTE_TC = 'tarjeta de crédito'

const soloDigitos = (s) => String(s ?? '').replace(/^0+/, '')

/** '018932507K' | '18932507-k' → '18.932.507-K' */
export function formatoRut(raw) {
  const limpio = String(raw).replace(/[^\dkK]/g, '').replace(/^0+/, '').toUpperCase()
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

/** El primer RUT que aparezca en un texto, normalizado a dígitos+DV ('18932507K'). */
export function rutEnTexto(texto) {
  const m = String(texto ?? '').match(/\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/)
  return m ? m[1].replace(/[.-]/g, '').toUpperCase() : null
}

// ── Cartola de cuenta corriente (.tx1) ───────────────────────────────────────
// Cabecera: RUT(12) nombre(40) banco(3+14) cuenta(12) N°cartola(3) emisión DDMMAAAA(8)
// hora(6) …, y luego los saldos como <DDMMAAAA><+|-><16 dígitos, 2 decimales>:
// el primero es el saldo inicial y el segundo el final.
// Movimiento: DD MM A|C código(5) glosa(31) documento(10) monto(14, 2 decimales) sucursal.
// La glosa a veces empieza con el RUT de la contraparte (10 caracteres).
export function leerCartola(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim())
  const h = lineas[0] ?? ''
  const m = h.match(/^(\d{12})(.{40})(\d{3})(.{14})(\d{12})(\d{3})(\d{8})/)
  if (!m) throw new Error('no parece una cartola de Office Banking (cabecera desconocida)')
  const [, rut, nombre, , , cuenta, nro, emision] = m
  const saldos = [...h.matchAll(/(\d{8})([+-])(\d{16})/g)]
  if (saldos.length < 2) throw new Error('cabecera sin saldo inicial y final')
  const saldo = (s) => (s[2] === '-' ? -1 : 1) * (Number(s[3]) / 100)
  const fecha8 = (d) => `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`
  const desde = fecha8(saldos[0][1])
  const hasta = fecha8(saldos[1][1])
  const anioFin = Number(hasta.slice(0, 4))
  const mesFin = Number(hasta.slice(5, 7))

  const movimientos = lineas.slice(1).map((l, i) => {
    const dd = l.slice(0, 2)
    const mm = l.slice(2, 4)
    const ac = l[4]
    const glosa = l.slice(10, 41)
    const montoTxt = l.slice(51, 65)
    if (!/^\d{4}$/.test(dd + mm) || (ac !== 'A' && ac !== 'C') || !/^\d{14}$/.test(montoTxt)) {
      throw new Error(`línea ${i + 2} con formato desconocido`)
    }
    const centavos = Number(montoTxt)
    if (centavos % 100 !== 0) throw new Error(`línea ${i + 2}: monto con decimales`)
    const anio = Number(mm) <= mesFin ? anioFin : anioFin - 1
    return {
      linea: i + 1,
      fecha: `${anio}-${mm}-${dd}`,
      tipo: ac === 'A' ? 'abono' : 'cargo',
      codigo: l.slice(5, 10),
      glosa: glosa.trim(),
      monto: centavos / 100,
    }
  })

  const abonos = movimientos.filter((x) => x.tipo === 'abono').reduce((s, x) => s + x.monto, 0)
  const cargos = movimientos.filter((x) => x.tipo === 'cargo').reduce((s, x) => s + x.monto, 0)
  const saldoInicial = saldo(saldos[0])
  const saldoFinal = saldo(saldos[1])
  return {
    rut: soloDigitos(rut),
    nombre: nombre.trim(),
    cuenta: soloDigitos(cuenta),
    nro,
    emision: fecha8(emision),
    desde,
    hasta,
    saldoInicial,
    saldoFinal,
    abonos,
    cargos,
    cuadra: Math.abs(saldoInicial + abonos - cargos - saldoFinal) < 0.005,
    movimientos,
  }
}

/** Glosa legible: si empieza con un RUT, va al final con formato ('Transf a X 18.932.507-K'). */
export function descripcionCartola(glosa) {
  const m = glosa.match(/^(\d{9}[\dkK])\s+(.*)$/)
  if (m) return `${m[2].trim()} ${formatoRut(m[1])}`
  return glosa.replace(/\s+/g, ' ').trim()
}

export function filasCartola(cartola) {
  return cartola.movimientos.map((m) => ({
    fecha: m.fecha,
    monto: m.monto,
    tipo: m.tipo,
    fuente: FUENTE_CC,
    referencia: `cartola ${cartola.nro} L${m.linea}`,
    descripcion: descripcionCartola(m.glosa),
  }))
}

// ── Tarjeta de crédito: movimientos no facturados (mov_nac*.txt) ─────────────
// 'Nombre de la Empresa :  X' y luego FECHA;ESTABLECIMIENTO;DESCRIPCIÓN;MONTO;LUGAR
// con fecha DD/MM/AAAA y monto '54610,00' (negativo = pago a la tarjeta).
// SALDO INICIAL no es un movimiento. La referencia es por contenido para que
// bajar el archivo de nuevo (con más días) no duplique; el 2.º idéntico lleva ' #2'.
export function leerTarjeta(texto) {
  const lineas = texto.split(/\r?\n/)
  const empresa = (lineas.find((l) => /^Nombre de la Empresa/i.test(l)) ?? '').split(':').slice(1).join(':').trim()
  if (!lineas.some((l) => /^FECHA;ESTABLECIMIENTO;/i.test(l))) {
    throw new Error('no parece un archivo de movimientos de tarjeta (falta la cabecera FECHA;ESTABLECIMIENTO;…)')
  }
  const vistos = new Map()
  const filas = []
  for (const l of lineas) {
    const p = l.split(';')
    const fm = (p[0] ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!fm || p.length < 4) continue
    const est = p[1].trim()
    const desc = p[2].trim()
    if (/^SALDO INICIAL$/i.test(desc)) continue
    const valor = Number(p[3].trim().replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(valor) || valor === 0) throw new Error(`monto inválido: ${p[3]}`)
    const fecha = `${fm[3]}-${fm[2]}-${fm[1]}`
    const monto = Math.round(Math.abs(valor))
    const base = `TC ${fecha} ${est || desc} ${monto}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    filas.push({
      fecha,
      monto,
      tipo: valor < 0 ? 'abono' : 'cargo',
      fuente: FUENTE_TC,
      referencia: n === 1 ? base : `${base} #${n}`,
      descripcion: est ? `${est} — ${desc.toLowerCase()}` : desc.charAt(0) + desc.slice(1).toLowerCase(),
    })
  }
  return { empresa, filas }
}

// ── Cruce contra lo que ya está en Hilván ────────────────────────────────────
const dias = (a, b) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000

/**
 * Separa las filas nuevas de las que ya existen. Una fila ya existe si:
 *   1. hay un movimiento con la misma referencia (el mismo archivo otra vez), o
 *   2. hay uno con el mismo monto y tipo, aún sin par, y
 *      - la misma fecha, sin RUTs que se contradigan (si ambos traen RUT, debe ser el mismo), o
 *      - hasta `holguraDias` de diferencia y el MISMO RUT (aviso por correo vs cartola).
 * Cada existente calza con una sola fila. Los existentes que tienen otra referencia de
 * cartola no se usan para el punto 2 (son otras líneas de una cartola ya importada).
 */
export function separarNuevas(filas, existentes, { holguraDias = 3 } = {}) {
  const porRef = new Set(existentes.map((e) => e.referencia).filter(Boolean))
  const libres = existentes
    .filter((e) => !String(e.referencia ?? '').startsWith('cartola ') && !String(e.referencia ?? '').startsWith('TC '))
    .map((e) => ({ ...e, rut: rutEnTexto(e.descripcion), usado: false }))
  const nuevas = []
  const yaEstaban = []
  for (const f of filas) {
    if (porRef.has(f.referencia)) {
      yaEstaban.push({ fila: f, motivo: 'misma referencia' })
      continue
    }
    const rut = rutEnTexto(f.descripcion)
    const mismos = libres.filter((e) => !e.usado && e.monto === f.monto && e.tipo === f.tipo && e.fuente === f.fuente)
    const mismoDia = mismos.filter((e) => e.fecha === f.fecha && !(rut && e.rut && rut !== e.rut))
    const par =
      (rut && mismoDia.find((e) => e.rut === rut)) ||
      mismoDia[0] ||
      (rut && mismos.find((e) => e.rut === rut && dias(e.fecha, f.fecha) <= holguraDias))
    if (par) {
      par.usado = true
      yaEstaban.push({ fila: f, motivo: `ya cargado (${par.fecha} · ${par.descripcion ?? 'sin glosa'})` })
    } else {
      nuevas.push(f)
    }
  }
  return { nuevas, yaEstaban }
}
