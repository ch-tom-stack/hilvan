// lib/pagos-masivos.ts
// Transferencias masivas de Santander — la parte pura (sin base), con tests en
// tests/pagos-masivos.test.ts. La base vive en lib/pagos-masivos-io.ts.
//
//   - RUT y cuenta: limpiar, validar, formato de la planilla.
//   - Avisos de Santander: leer banco, cuenta, RUT y nombre del destinatario
//     (los tres formatos de correo que llegan a Gmail).
//   - Planilla: las 13 columnas de Office Banking, igual que la que arma Tomás.
//   - Cierre: calzar cada pago pendiente con el cargo que trae la cartola o el
//     aviso (mismo RUT, mismo monto, fecha cercana).

import { CODIGO_SANTANDER, bancoPorCodigo, codigoBanco } from './bancos'

/** RUT de Casa Hiedra (Tomás Montealegre Producciones EIRL): nunca es destinatario. */
export const RUT_EMPRESA = '77151117-1'
/** Cuenta corriente de la empresa en Santander, como la pide la planilla. */
export const CUENTA_ORIGEN = '84616290'

// ── RUT ──────────────────────────────────────────────────────────────────────

/** '19.410.450-2' / '194104502' / '25476440k' → '19410450-2'. Vacío si no parece RUT. */
export function limpiarRut(rut: string | null | undefined): string {
  const s = String(rut ?? '').toUpperCase().replace(/[^0-9K]/g, '')
  if (s.length < 2) return ''
  const cuerpo = s.slice(0, -1).replace(/^0+/, '')
  const dv = s.slice(-1)
  if (!/^\d{6,8}$/.test(cuerpo)) return ''
  return `${cuerpo}-${dv}`
}

export function dvRut(cuerpo: string): string {
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const r = 11 - (suma % 11)
  return r === 11 ? '0' : r === 10 ? 'K' : String(r)
}

export function rutValido(rut: string | null | undefined): boolean {
  const l = limpiarRut(rut)
  if (!l) return false
  const [cuerpo, dv] = l.split('-')
  return dvRut(cuerpo) === dv
}

/** '19410450-2' → '19.410.450-2' */
export function rutConPuntos(rut: string): string {
  const l = limpiarRut(rut)
  if (!l) return rut
  const [cuerpo, dv] = l.split('-')
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

/** La planilla lleva el RUT pegado, sin puntos ni guion: '103623944', '25476440K'. */
export function rutParaPlanilla(rut: string): string {
  return limpiarRut(rut).replace('-', '')
}

/** RUTs válidos que aparecen en una glosa ("Transf a ROA PINTO 19.410.450-2"). */
export function rutsEnTexto(texto: string | null | undefined): string[] {
  const out: string[] = []
  for (const m of String(texto ?? '').matchAll(/\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/g)) {
    const r = limpiarRut(m[1])
    if (r && rutValido(r) && !out.includes(r)) out.push(r)
  }
  return out
}

// ── Cuenta ───────────────────────────────────────────────────────────────────

/** '0-000-7364371-6' → '73643716'. Solo dígitos, sin ceros a la izquierda. Null si no hay. */
export function limpiarCuenta(cuenta: string | number | null | undefined): string | null {
  const d = String(cuenta ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return d.length >= 4 ? d : null
}

/** Santander rellena a 12 dígitos ('000065550237'); los demás bancos van tal cual. */
export function cuentaParaPlanilla(bancoCodigo: string, cuenta: string): string {
  const c = limpiarCuenta(cuenta) ?? ''
  return bancoCodigo === CODIGO_SANTANDER ? c.padStart(12, '0') : c
}

// ── Avisos de Santander ──────────────────────────────────────────────────────

export interface CuentaVista {
  rut: string
  nombre: string
  banco_codigo: string
  numero_cuenta: string
  tipo_cuenta: string | null
}

export interface LecturaAviso {
  cuentas: CuentaVista[]
  monto: number | null
}

const ETIQUETAS = new Set([
  'banco', 'tipo de cuenta', 'cuenta n', 'n de cuenta', 'rut', 'nombre', 'razon social',
  'mensaje', 'e mail', 'comentario',
])

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[º°]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function tipoCuenta(s: string | undefined): string | null {
  const n = norm(s ?? '')
  if (n.includes('corriente')) return 'corriente'
  if (n.includes('vista') || n.includes('rut')) return 'vista'
  if (n.includes('ahorro')) return 'ahorro'
  return null
}

function montoDe(s: string | undefined): number | null {
  const m = String(s ?? '').match(/\$?\s*([\d.]+)(?:,\d+)?/)
  if (!m) return null
  const v = Number(m[1].replace(/\./g, ''))
  return Number.isFinite(v) && v > 0 ? v : null
}

/** Celdas de un correo convertido a texto: cada '|' o salto separa. */
function celdas(texto: string): string[] {
  return texto.split(/[|\n]/).map(c => c.replace(/^#+\s*/, '').trim()).filter(Boolean)
}

/**
 * Valor de una etiqueta dentro de una sección. Los correos ponen las etiquetas
 * de a una ("Nombre" → valor) o de a dos ("Banco | Tipo de cuenta" → dos
 * valores): se mira la racha de etiquetas seguidas para saber cuál valor toca.
 */
function valor(cs: string[], desde: number, hasta: number, etiqueta: string): string | undefined {
  for (let i = desde; i < hasta; i++) {
    if (norm(cs[i]) !== etiqueta) continue
    let ini = i
    while (ini > desde && ETIQUETAS.has(norm(cs[ini - 1]))) ini--
    let fin = i
    while (fin + 1 < hasta && ETIQUETAS.has(norm(cs[fin + 1]))) fin++
    const v = cs[fin + 1 + (i - ini)]
    if (v && !ETIQUETAS.has(norm(v))) return v
  }
  return undefined
}

/**
 * El texto plano de Santander pierde el acento combinado y deja un '?' después
 * de la letra: 'Lo?pez' → 'López', 'Josue?' → 'Josué', 'Mun?oz' → 'Muñoz'.
 */
const CON_TILDE: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', n: 'ñ', N: 'Ñ' }
export function arreglarTildes(s: string): string {
  return s.replace(/([aeiouAEIOUnN])\?/g, (_, l: string) => CON_TILDE[l]).replace(/\?/g, '')
}

function armar(p: { rut?: string; nombre?: string; banco?: string; cuenta?: string; tipo?: string }, bancoPorDefecto?: string): CuentaVista | null {
  const rut = limpiarRut(p.rut)
  if (!rut || !rutValido(rut) || rut === RUT_EMPRESA) return null
  const banco_codigo = codigoBanco(p.banco) ?? bancoPorDefecto ?? null
  const numero_cuenta = limpiarCuenta(p.cuenta)
  const nombre = arreglarTildes((p.nombre ?? '').replace(/\s+-\s+Destino$/i, '').replace(/\s+/g, ' ').trim())
  if (!banco_codigo || !numero_cuenta || !nombre) return null
  return { rut, nombre, banco_codigo, numero_cuenta, tipo_cuenta: tipoCuenta(p.tipo) }
}

/**
 * Lee un correo de mensajeria@santander.cl. Reconoce:
 *   - "Transferencia de Fondos Nro. N" (masiva / Office Banking): una línea
 *     "Nombre del destinatario : … Rut del destinatario : … Banco de destino : …
 *     Cuenta de destino: …".
 *   - "Aviso de Transferencia de Fondos": tablas Origen / Destino.
 *   - "Comprobante Transferencia de fondos" (desde la cuenta personal del dueño):
 *     "Datos de origen" (cuenta Santander del dueño) y "Datos de destino".
 * Devuelve las cuentas de terceros (nunca la de la empresa). Lo que no se lee
 * completo (sin banco reconocido, sin cuenta, RUT inválido) se omite.
 */
export function leerAvisoSantander(texto: string): LecturaAviso {
  const cuentas: CuentaVista[] = []
  const t = String(texto ?? '')

  // Formato masiva: todo en una línea con "Etiqueta : valor".
  const linea = t.replace(/\s+/g, ' ')
  const m = linea.match(/Nombre del destinatario\s*:\s*(.+?)\s+Rut del destinatario\s*:\s*([\d.kK-]+)\s+Banco de destino\s*:\s*(.+?)\s+Cuenta de destino\s*:\s*([\d-]+)/i)
  if (m) {
    const c = armar({ nombre: m[1], rut: m[2], banco: m[3], cuenta: m[4] })
    if (c) cuentas.push(c)
    const monto = montoDe(linea.match(/Monto transferido\s*:\s*([\d.]+)/i)?.[1])
    return { cuentas, monto }
  }

  const cs = celdas(t)
  const idx = (pred: (n: string) => boolean, desde = 0) => {
    for (let i = desde; i < cs.length; i++) if (pred(norm(cs[i]))) return i
    return -1
  }

  // Comprobante (cuenta personal → otra cuenta).
  const iOrigen = idx(n => n === 'datos de origen')
  const iDestino = idx(n => n === 'datos de destino')
  if (iOrigen >= 0 && iDestino > iOrigen) {
    const fin = cs.length
    const origen = armar({
      rut: valor(cs, iOrigen, iDestino, 'rut'),
      nombre: valor(cs, iOrigen, iDestino, 'nombre'),
      cuenta: valor(cs, iOrigen, iDestino, 'n de cuenta'),
      tipo: valor(cs, iOrigen, iDestino, 'tipo de cuenta'),
    }, CODIGO_SANTANDER) // el comprobante lo manda Santander por una cuenta suya
    const destino = armar({
      rut: valor(cs, iDestino, fin, 'rut'),
      nombre: valor(cs, iDestino, fin, 'nombre'),
      banco: valor(cs, iDestino, fin, 'banco'),
      cuenta: valor(cs, iDestino, fin, 'n de cuenta'),
      tipo: valor(cs, iDestino, fin, 'tipo de cuenta'),
    })
    for (const c of [origen, destino]) if (c) cuentas.push(c)
    const iMonto = idx(n => n === 'monto transferido')
    return { cuentas, monto: iMonto >= 0 ? montoDe(cs[iMonto + 1]) : null }
  }

  // Aviso de transferencia (Office Banking, una a una).
  const iDest = idx(n => n === 'destino')
  if (iDest >= 0) {
    const iFin = idx(n => n.startsWith('monto de transferencia'), iDest)
    const fin = iFin >= 0 ? iFin : cs.length
    const c = armar({
      banco: valor(cs, iDest, fin, 'banco'),
      tipo: valor(cs, iDest, fin, 'tipo de cuenta'),
      cuenta: valor(cs, iDest, fin, 'cuenta n'),
      rut: valor(cs, iDest, fin, 'rut'),
      nombre: valor(cs, iDest, fin, 'nombre'),
    })
    if (c) cuentas.push(c)
    return { cuentas, monto: iFin >= 0 ? montoDe(cs[iFin + 1]) : null }
  }

  return { cuentas, monto: null }
}

// ── Elegir la cuenta de una persona ──────────────────────────────────────────

export interface CuentaGuardada extends CuentaVista {
  id: string
  confirmada: boolean
  ultima_vez: string | null
  updated_at?: string | null
  email?: string | null
  colaborador_id?: string | null
}

/** De las cuentas conocidas de un RUT: la confirmada por el banco más reciente. */
export function elegirCuenta<T extends CuentaGuardada>(cuentas: T[]): T | null {
  const orden = [...cuentas].sort((a, b) =>
    Number(b.confirmada) - Number(a.confirmada) ||
    String(b.ultima_vez ?? '').localeCompare(String(a.ultima_vez ?? '')) ||
    String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
  return orden[0] ?? null
}

// ── Planilla de Office Banking ───────────────────────────────────────────────

export const ENCABEZADOS_PLANILLA = [
  'Cuenta origen\n(obligatorio)',
  'Moneda origen\n(obligatorio)',
  'Cuenta destino\n(obligatorio)',
  'Moneda destino\n(obligatorio)',
  'Código banco destino\n(obligatorio solo si banco destino no es Santander)',
  'RUT beneficiario\n(obligatorio solo si banco destino no es Santander)',
  'Nombre beneficiario\n(obligatorio solo si banco destino no es Santander)',
  'Monto transferencia\n(obligatorio)',
  'Glosa personalizada transferencia\n(opcional)',
  'Correo beneficiario\n(opcional)',
  'Mensaje correo beneficiario\n(opcional)',
  'Glosa cartola originador\n(opcional)',
  'Glosa cartola beneficiario\n(opcional, solo aplica si cuenta destino es Santander)',
] as const

export interface PagoPlanilla {
  rut: string
  nombre: string
  banco_codigo: string | null
  numero_cuenta: string | null
  monto: number
  glosa?: string | null
  email?: string | null
}

/** Lo que impide (o advierte) mandar este pago al banco. */
export function revisarPago(p: PagoPlanilla): { errores: string[]; avisos: string[] } {
  const errores: string[] = []
  const avisos: string[] = []
  if (!rutValido(p.rut)) errores.push(`RUT inválido (${p.rut || 'vacío'})`)
  if (limpiarRut(p.rut) === RUT_EMPRESA) errores.push('el destinatario es la misma empresa')
  if (!p.nombre?.trim()) errores.push('falta el nombre')
  const banco = bancoPorCodigo(p.banco_codigo)
  if (!banco) errores.push(p.banco_codigo ? `código de banco desconocido (${p.banco_codigo})` : 'falta el banco')
  else if (banco.aviso) avisos.push(banco.aviso)
  if (!limpiarCuenta(p.numero_cuenta)) errores.push('falta la cuenta')
  if (!Number.isInteger(p.monto) || p.monto <= 0) errores.push(`monto inválido (${p.monto})`)
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) avisos.push(`correo dudoso (${p.email}): no se incluye`)
  return { errores, avisos }
}

/**
 * Una fila de la planilla, en el orden de ENCABEZADOS_PLANILLA. Igual que la
 * planilla de Tomás: RUT y nombre van siempre (aunque Santander no los exija),
 * el código de banco solo si no es Santander, y la glosa se repite en el correo
 * y en las cartolas (la del beneficiario solo aplica a Santander).
 */
export function filaPlanilla(p: PagoPlanilla, cuentaOrigen = CUENTA_ORIGEN): (string | number | null)[] {
  const codigo = bancoPorCodigo(p.banco_codigo)!.codigo
  const santander = codigo === CODIGO_SANTANDER
  const glosa = (p.glosa ?? '').trim() || null
  const email = p.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? p.email.trim() : null
  return [
    cuentaOrigen,
    'CLP',
    cuentaParaPlanilla(codigo, p.numero_cuenta ?? ''),
    'CLP',
    santander ? null : codigo,
    rutParaPlanilla(p.rut),
    p.nombre.trim(),
    p.monto,
    glosa,
    email,
    email ? glosa : null,
    glosa,
    santander ? glosa : null,
  ]
}

// ── Cierre: calzar pagos con cargos del banco ────────────────────────────────

export interface PagoPendiente {
  id: string
  rut: string
  monto: number
  fecha_lote: string // YYYY-MM-DD
}

export interface CargoBanco {
  id: string
  fecha: string // YYYY-MM-DD
  monto: number
  tipo: string
  descripcion: string | null
}

function dias(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
}

/** Ventana del cierre: el lote se arma y se paga en Office Banking días después. */
export const VENTANA_CIERRE = { antes: 3, despues: 30 }

/**
 * Cada pago pendiente toma el cargo con su RUT y su monto exacto, dentro de la
 * ventana, el más cercano a la fecha del lote. Un cargo calza con un solo pago;
 * `usados` son los cargos que ya pagaron otro ítem.
 */
export function calzarPagos(pendientes: PagoPendiente[], cargos: CargoBanco[], usados: Set<string> = new Set()): { item_id: string; movimiento_id: string; fecha: string }[] {
  const libres = cargos.filter(c => c.tipo === 'cargo' && !usados.has(c.id))
  const tomados = new Set<string>()
  const out: { item_id: string; movimiento_id: string; fecha: string }[] = []
  const orden = [...pendientes].sort((a, b) => a.fecha_lote.localeCompare(b.fecha_lote))
  for (const p of orden) {
    const rut = limpiarRut(p.rut)
    const candidatos = libres
      .filter(c => !tomados.has(c.id) && Math.round(c.monto) === Math.round(p.monto))
      .filter(c => rutsEnTexto(c.descripcion).includes(rut))
      .map(c => ({ c, d: dias(p.fecha_lote, c.fecha) }))
      .filter(x => x.d >= -VENTANA_CIERRE.antes && x.d <= VENTANA_CIERRE.despues)
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))
    const elegido = candidatos[0]
    if (!elegido) continue
    tomados.add(elegido.c.id)
    out.push({ item_id: p.id, movimiento_id: elegido.c.id, fecha: elegido.c.fecha })
  }
  return out
}

/** Glosa por defecto: 'BH 549' para boletas, 'Factura 123', o la descripción. */
export function glosaDeGasto(g: { tipo_documento?: string | null; folio?: string | null; descripcion?: string | null }): string {
  const folio = String(g.folio ?? '').trim()
  if (folio) {
    if (g.tipo_documento === 'boleta') return `BH ${folio}`
    if (g.tipo_documento === 'factura' || g.tipo_documento === 'exenta') return `Factura ${folio}`
    return `Doc ${folio}`
  }
  return (g.descripcion ?? '').trim().slice(0, 60)
}
