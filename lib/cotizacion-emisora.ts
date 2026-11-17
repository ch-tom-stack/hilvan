// lib/cotizacion-emisora.ts
// Quién factura una cotización y a qué cuenta se le paga (nov-2026).
//
// Casa Hiedra emite con dos RUT:
//  - AFECTA (con IVA): Tomás Montealegre Producciones EIRL, 77.151.117-1,
//    cuenta corriente Santander.
//  - EXENTA (sin IVA, giro cultural): Producciones Culturales Tomás Ignacio
//    Montealegre Müller EIRL, 77.956.984-5, chequera electrónica BancoEstado.
// La cotización decide con `con_iva`: con IVA → afecta; sin IVA → exenta.
//
// Regla Falabella: si la factura la recibe Falabella (RUT 77.261.280-K, todas
// sus marcas comparten RUT), va además nuestro N° de proveedor. Cuando el
// trabajo llega por una agencia (Republik, Rose Studio…) la factura es para la
// agencia y el número NO va. Quién recibe la factura = la agencia si hay, si no
// el cliente (misma regla que OC/HES en lib/cotizacion-referencias-io.ts).

export interface DatosEmisora {
  clave: 'afecta' | 'exenta'
  razonSocial: string
  direccion: string
  rut: string
  email: string
  banco: {
    titular: string
    rut: string
    banco: string
    tipoCuenta: string
    numero: string
    email: string
    swift: string
    codigoCmf: string
  }
}

export const EMISORA_AFECTA: DatosEmisora = {
  clave: 'afecta',
  razonSocial: 'TOMAS MONTEALEGRE PRODUCCIONES E.I.R.L.',
  direccion: 'MORANDE 835 P 5 OF518 518, Santiago, Santiago, 8320000, Región Metropolitana, Chile',
  rut: '77151117-1',
  email: 'tomas@casahiedra.com',
  banco: {
    titular: 'TOMAS MONTEALEGRE PRODUCCIONES EIRL',
    rut: '77151117-1',
    banco: 'Santander Chile',
    tipoCuenta: 'Cuenta Corriente',
    numero: '000084616290',
    email: 'estudiocasahiedra@gmail.com',
    swift: 'BSCHCLRM',
    codigoCmf: '037',
  },
}

// Fuente: formulario de proveedor firmado por Tomás (sep-2026) + cartola
// BancoEstado (la cuenta figura como "Chequera Electrónica").
export const EMISORA_EXENTA: DatosEmisora = {
  clave: 'exenta',
  razonSocial: 'PRODUCCIONES CULTURALES TOMÁS IGNACIO MONTEALEGRE MÜLLER E.I.R.L.',
  direccion: 'GUARDIA VIEJA 202 OF 902 P 9, Providencia, Santiago, 7510188, Región Metropolitana, Chile',
  rut: '77956984-5',
  email: 'tomas@casahiedra.com',
  banco: {
    titular: 'PRODUCCIONES CULTURALES TOMÁS IGNACIO MONTEALEGRE MÜLLER EIRL',
    rut: '77956984-5',
    banco: 'BancoEstado',
    tipoCuenta: 'Chequera Electrónica',
    numero: '90277664967',
    email: 'tomas@casahiedra.com',
    swift: 'BECHCLRM',
    codigoCmf: '012',
  },
}

export function emisoraDe(c: { con_iva?: boolean | null }): DatosEmisora {
  return c.con_iva === false ? EMISORA_EXENTA : EMISORA_AFECTA
}

// ── Número de proveedor ────────────────────────────────────────────────

const RUT_FALABELLA = '77261280K'
export const NUMERO_PROVEEDOR_FALABELLA = '1000325857'

const rutLimpio = (r?: string | null) => (r ?? '').replace(/[^0-9kK]/g, '').toUpperCase()
const texto = (s?: string | null) => (s ?? '').trim()

type ClienteMin = { nombre?: string | null; empresa?: string | null; rut?: string | null } | null | undefined

/** ¿Este cliente es Falabella? Por RUT; sin RUT cargado, por el nombre. */
function esFalabella(c: ClienteMin, nombreLibre?: string | null): boolean {
  const rut = rutLimpio(c?.rut)
  if (rut) return rut === RUT_FALABELLA
  const nombre = `${texto(c?.nombre)} ${texto(c?.empresa)} ${c ? '' : texto(nombreLibre)}`
  return /falabella/i.test(nombre)
}

export interface FuenteProveedor {
  cliente?: ClienteMin
  cliente_nombre_libre?: string | null
  agencia_id?: string | null
  agencia?: ClienteMin
  agencia_nombre_libre?: string | null
}

/** N° de proveedor que exige quien recibe la factura, o null si no aplica. */
export function numeroProveedorDe(c: FuenteProveedor): { cliente: string; numero: string } | null {
  const hayAgencia = !!(c.agencia_id || c.agencia || texto(c.agencia_nombre_libre))
  const recibe = hayAgencia
    ? esFalabella(c.agencia, c.agencia_nombre_libre)
    : esFalabella(c.cliente, c.cliente_nombre_libre)
  return recibe ? { cliente: 'Falabella', numero: NUMERO_PROVEEDOR_FALABELLA } : null
}
