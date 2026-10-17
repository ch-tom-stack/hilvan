// lib/bancos.ts
// Códigos de banco para las transferencias (planilla masiva de Santander).
//
// Fuente: listado "Bancos" de la CMF (cmfchile.cl, artículo 47003, revisado el
// 17-oct-2026). Coopeuch no es banco pero recibe transferencias con su código
// histórico 672. La planilla de Office Banking lleva el código como texto de 3
// dígitos ('051'), no como número.
//
// Si aparece un banco que no está acá, se agrega con el código de la CMF —
// nunca adivinado.

export interface Banco {
  codigo: string
  nombre: string
  /** Frases que, contenidas en el nombre (normalizado), identifican al banco. */
  frases: string[]
  /** Nombres que solo cuentan si son el texto completo (ej. 'chile'). */
  exactos?: string[]
  /** Advertencia que se muestra al pagar a este banco. */
  aviso?: string
}

export const CODIGO_SANTANDER = '037'

export const BANCOS: Banco[] = [
  { codigo: '001', nombre: 'Banco de Chile', frases: ['banco de chile', 'edwards'], exactos: ['chile'] },
  { codigo: '009', nombre: 'Banco Internacional', frases: ['internacional'] },
  { codigo: '012', nombre: 'BancoEstado', frases: ['bancoestado', 'banco estado', 'banco del estado', 'cuentarut', 'cuenta rut'], exactos: ['estado'] },
  { codigo: '014', nombre: 'Scotiabank', frases: ['scotiabank', 'scotia'] },
  { codigo: '016', nombre: 'BCI', frases: ['bci', 'credito e inversiones'] },
  { codigo: '028', nombre: 'BICE', frases: ['bice'] },
  { codigo: '031', nombre: 'HSBC', frases: ['hsbc'] },
  { codigo: '037', nombre: 'Santander', frases: ['santander'] },
  { codigo: '039', nombre: 'Itaú', frases: ['itau', 'corpbanca'] },
  { codigo: '041', nombre: 'JP Morgan', frases: ['jp morgan', 'jpmorgan'] },
  {
    codigo: '049', nombre: 'Security', frases: ['security'],
    aviso: 'La CMF autorizó en oct-2025 la fusión de Banco Security con BICE: confirma con el destinatario que su cuenta sigue recibiendo con el código 049.',
  },
  { codigo: '051', nombre: 'Falabella', frases: ['falabella'] },
  { codigo: '053', nombre: 'Ripley', frases: ['ripley'] },
  { codigo: '055', nombre: 'Consorcio', frases: ['consorcio'] },
  { codigo: '059', nombre: 'BTG Pactual', frases: ['btg'] },
  { codigo: '060', nombre: 'China Construction Bank', frases: ['china construction'] },
  { codigo: '061', nombre: 'Bank of China', frases: ['bank of china'] },
  { codigo: '062', nombre: 'Tanner', frases: ['tanner'] },
  { codigo: '063', nombre: 'Tenpo', frases: ['tenpo'] },
  { codigo: '672', nombre: 'Coopeuch', frases: ['coopeuch'] },
]

function normalizar(s: string): string {
  return ` ${s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

/** Banco por código ('51', '051' o 51). */
export function bancoPorCodigo(codigo: string | number | null | undefined): Banco | undefined {
  if (codigo == null || codigo === '') return undefined
  const c = String(codigo).replace(/\D/g, '').padStart(3, '0')
  return BANCOS.find(b => b.codigo === c)
}

/**
 * Código de banco a partir de un nombre como lo escribe el banco o la ficha:
 * 'BANCO SANTANDER (CHILE)' → '037', 'Banco Falabella' → '051', 'BancoEstado' → '012'.
 * Null si no se reconoce (mejor nada que un código equivocado).
 */
export function codigoBanco(nombre: string | null | undefined): string | null {
  if (!nombre) return null
  if (/^\s*\d{1,3}\s*$/.test(nombre)) return bancoPorCodigo(nombre)?.codigo ?? null
  const n = normalizar(nombre)
  // Santander primero: 'banco santander chile' también contiene 'chile'.
  const santander = BANCOS.find(b => b.codigo === CODIGO_SANTANDER)!
  if (santander.frases.some(f => n.includes(` ${f} `))) return santander.codigo
  for (const b of BANCOS) {
    if (b.exactos?.some(e => n === ` ${e} `)) return b.codigo
    if (b.frases.some(f => n.includes(` ${f} `))) return b.codigo
  }
  return null
}

/**
 * El valor para colaboradores.banco, que tiene check constraint con la lista
 * del formulario de la ficha. Lo que no está en esa lista va como 'Otro' (el
 * código exacto queda en cuentas_bancarias).
 */
const BANCOS_FICHA: Record<string, string> = {
  '001': 'Banco de Chile', '012': 'BancoEstado', '037': 'Santander', '016': 'BCI', '039': 'Itaú',
  '014': 'Scotiabank', '049': 'Security', '051': 'Falabella', '053': 'Ripley', '055': 'Consorcio', '028': 'BICE',
}
export function bancoFicha(codigo: string | null | undefined): string | null {
  if (!codigo) return null
  return BANCOS_FICHA[codigo] ?? 'Otro'
}

export function nombreBanco(codigo: string | null | undefined): string {
  return bancoPorCodigo(codigo)?.nombre ?? (codigo ? `banco ${codigo}` : '—')
}
