// lib/cotizacion-referencias.ts
// Referencias de una cotización (OC, HES…): validación, estado por cotización,
// lectura de los correos que las traen y paso a la factura. SIN I/O.
// Tabla: sql/cotizacion_referencias.sql. Flujo: docs/sii/referencias-oc-hes.md.

export const TIPOS_REFERENCIA = ['oc', 'hes', 'nota_pedido', 'contrato'] as const
export type TipoReferencia = (typeof TIPOS_REFERENCIA)[number]

export const ETIQUETA_REFERENCIA: Record<TipoReferencia, string> = {
  oc: 'OC',
  hes: 'HES',
  nota_pedido: 'Nota de pedido',
  contrato: 'Contrato',
}

/** Máximo de referencias que admite el formulario del SII (filas _001…_003). */
export const MAX_REFERENCIAS_FACTURA = 3

export interface Referencia {
  id: string
  cotizacion_id: string
  tipo: TipoReferencia
  folio: string | null
  fecha: string | null // YYYY-MM-DD
  monto: number | null
  glosa: string | null
  estado: 'propuesta' | 'confirmada' | 'descartada'
  fuente: 'manual' | 'correo'
  correo_id: string | null
  correo_remitente: string | null
  correo_asunto: string | null
  correo_fecha: string | null
  nota: string | null
}

export interface ReferenciaInput {
  tipo: TipoReferencia
  folio: string | null
  fecha: string | null
  monto: number | null
  glosa: string | null
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(s: string): boolean {
  if (!FECHA.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d))
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
}

/**
 * Valida lo que escribe una persona o propone el operador. `confirmada` exige folio
 * y fecha (es lo que irá a la factura); una propuesta puede venir sin folio (la HES
 * de Falabella trae el número solo en el PDF).
 */
export function validarReferencia(
  v: Record<string, unknown>,
  { confirmada }: { confirmada: boolean },
): { ok: true; valor: ReferenciaInput } | { ok: false; error: string } {
  const tipo = String(v.tipo ?? '').trim().toLowerCase()
  if (!(TIPOS_REFERENCIA as readonly string[]).includes(tipo)) {
    return { ok: false, error: `Tipo de referencia inválido (${TIPOS_REFERENCIA.join(', ')})` }
  }
  const folio = String(v.folio ?? '').trim() || null
  if (folio && folio.length > 18) return { ok: false, error: 'El folio admite 18 caracteres (límite del SII)' }
  const fecha = String(v.fecha ?? '').trim() || null
  if (fecha && !fechaValida(fecha)) return { ok: false, error: 'Fecha inválida (AAAA-MM-DD)' }
  if (confirmada && !folio) return { ok: false, error: 'Falta el número (folio) de la referencia' }
  if (confirmada && !fecha) return { ok: false, error: 'Falta la fecha de la referencia' }
  let monto: number | null = null
  if (v.monto !== undefined && v.monto !== null && v.monto !== '') {
    const n = parseFloat(String(v.monto))
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Monto inválido' }
    monto = Math.round(n)
  }
  const glosa = String(v.glosa ?? '').trim() || null
  if (glosa && glosa.length > 1000) return { ok: false, error: 'La glosa admite 1.000 caracteres' }
  return { ok: true, valor: { tipo: tipo as TipoReferencia, folio, fecha, monto, glosa } }
}

export type EstadoRef = 'confirmada' | 'propuesta' | 'falta' | 'no_aplica'

/** Estado de OC y HES de una cotización, según lo que exige el cliente que recibe la factura. */
export function estadoReferencias(
  refs: Pick<Referencia, 'tipo' | 'estado'>[],
  exige: { oc: boolean; hes: boolean },
): { oc: EstadoRef; hes: EstadoRef } {
  const de = (tipo: TipoReferencia, exigida: boolean): EstadoRef => {
    const delTipo = refs.filter((r) => r.tipo === tipo && r.estado !== 'descartada')
    if (delTipo.some((r) => r.estado === 'confirmada')) return 'confirmada'
    if (delTipo.some((r) => r.estado === 'propuesta')) return 'propuesta'
    return exigida ? 'falta' : 'no_aplica'
  }
  return { oc: de('oc', exige.oc), hes: de('hes', exige.hes) }
}

const ORDEN_FACTURA: TipoReferencia[] = ['oc', 'hes', 'nota_pedido', 'contrato']

/**
 * Lo que va al borrador de factura (scripts/sii/factura.mjs → `referencias`): solo
 * las CONFIRMADAS, OC primero, máximo 3. Devuelve también la glosa de la OC (si hay)
 * para copiarla en la factura.
 */
export function referenciasParaFactura(refs: Referencia[]): {
  referencias: { tipo: TipoReferencia; folio: string; fecha: string }[]
  glosaOC: string | null
  omitidas: number
} {
  const confirmadas = refs
    .filter((r) => r.estado === 'confirmada' && r.folio && r.fecha)
    .sort((a, b) => ORDEN_FACTURA.indexOf(a.tipo) - ORDEN_FACTURA.indexOf(b.tipo))
  const usadas = confirmadas.slice(0, MAX_REFERENCIAS_FACTURA)
  return {
    referencias: usadas.map((r) => ({ tipo: r.tipo, folio: r.folio as string, fecha: r.fecha as string })),
    glosaOC: confirmadas.find((r) => r.tipo === 'oc' && r.glosa)?.glosa ?? null,
    omitidas: confirmadas.length - usadas.length,
  }
}

/** Fecha de un correo (ISO) en el calendario de Chile → YYYY-MM-DD. */
export function fechaChile(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

export interface CorreoReferencia {
  remitente: string
  asunto: string
  cuerpo?: string | null
  fecha: string // ISO del correo
}

export interface ReferenciaLeida {
  tipo: TipoReferencia
  folio: string | null
  fecha: string | null
  origen: 'falabella_pedido' | 'falabella_hes' | 'unabase_oc' | 'texto'
  nota: string
}

/**
 * Lee las referencias de un correo con los formatos observados (oct-2026):
 *  - Falabella OC: de proveedores_dos@falabella.cl, asunto "Pedido6001807651", cuerpo
 *    "…pedido6001807651contabilizado el09/10/2026" (MM/DD/AAAA).
 *  - Falabella HES: asunto "Nuevo Documento HES", el número SOLO viene en el PDF.
 *  - Unabase: asunto "…ha enviado Orden de Compra Nº 007225: <trabajo>".
 *  - Texto de una persona: "OC y HES de este contenido: 6001783114 1003012275",
 *    "OC 6001783114", "HES: 1003012275".
 * Devuelve [] si no reconoce nada. No inventa: lo que no está, va en null.
 */
export function leerCorreoReferencia(c: CorreoReferencia): ReferenciaLeida[] {
  const asunto = c.asunto ?? ''
  const cuerpo = c.cuerpo ?? ''
  const remitente = (c.remitente ?? '').toLowerCase()
  const fechaCorreo = fechaChile(c.fecha)

  const pedido = asunto.match(/^\s*Pedido\s*(\d{6,18})\s*$/i)
  if (pedido && remitente.endsWith('falabella.cl')) {
    const cont = cuerpo.match(/contabilizado\s*el\s*(\d{2})\/(\d{2})\/(\d{4})/i)
    return [{
      tipo: 'oc',
      folio: pedido[1],
      fecha: cont ? `${cont[3]}-${cont[1]}-${cont[2]}` : fechaCorreo,
      origen: 'falabella_pedido',
      nota: cont ? 'Fecha de contabilización del pedido (correo de Falabella)' : 'Fecha del correo',
    }]
  }

  if (/nuevo\s+documento\s+hes/i.test(asunto) && remitente.endsWith('falabella.cl')) {
    return [{
      tipo: 'hes',
      folio: null,
      fecha: fechaCorreo,
      origen: 'falabella_hes',
      nota: 'El número de la HES viene solo en el PDF adjunto: hay que escribirlo al confirmar',
    }]
  }

  const una = asunto.match(/Orden de Compra\s*N[º°o]?\s*(\d{3,18})/i)
  if (una && remitente.includes('unabase')) {
    return [{ tipo: 'oc', folio: una[1], fecha: fechaCorreo, origen: 'unabase_oc', nota: 'OC compartida por Unabase; fecha del correo' }]
  }

  // Texto libre de una persona.
  const texto = `${asunto}\n${cuerpo.split(/\n\s*(?:On |El |De:|From:)[^\n]*(?:wrote|escribió|Enviado)/)[0]}`
  const out: ReferenciaLeida[] = []
  const ambos = texto.match(/\bOC\s+y\s+HES\b[^\d]{0,60}(\d{6,18})\D{1,10}(\d{6,18})/i)
  if (ambos) {
    out.push({ tipo: 'oc', folio: ambos[1], fecha: fechaCorreo, origen: 'texto', nota: 'Escrito en el correo; fecha del correo' })
    out.push({ tipo: 'hes', folio: ambos[2], fecha: fechaCorreo, origen: 'texto', nota: 'Escrito en el correo; fecha del correo' })
    return out
  }
  const oc = texto.match(/\b(?:OC|orden de compra)\b\s*(?:N[º°o.]*)?\s*[:#]?\s*(\d{6,18})/i)
  if (oc) out.push({ tipo: 'oc', folio: oc[1], fecha: fechaCorreo, origen: 'texto', nota: 'Escrito en el correo; fecha del correo' })
  const hes = texto.match(/\bHES\b\s*(?:N[º°o.]*)?\s*[:#]?\s*(\d{6,18})/i)
  if (hes) out.push({ tipo: 'hes', folio: hes[1], fecha: fechaCorreo, origen: 'texto', nota: 'Escrito en el correo; fecha del correo' })
  return out
}

/** Texto para pedirle al cliente lo que falta (reemplaza el correo "OC pendientes"). */
export function textoPendientes(
  filas: { numero: string | null; nombre: string; cliente: string; total: number; oc: EstadoRef; hes: EstadoRef }[],
  formatCLP: (n: number) => string,
): string {
  const falta = filas.filter((f) => f.oc === 'falta' || f.hes === 'falta')
  if (!falta.length) return ''
  const porCliente = new Map<string, typeof falta>()
  for (const f of falta) porCliente.set(f.cliente, [...(porCliente.get(f.cliente) ?? []), f])
  const bloques = [...porCliente].map(([cliente, fs]) =>
    [
      cliente,
      ...fs.map((f) => {
        const que = [f.oc === 'falta' ? 'OC' : null, f.hes === 'falta' ? 'HES' : null].filter(Boolean).join(' y ')
        return `- ${f.numero ? `${f.numero} · ` : ''}${f.nombre} (${formatCLP(f.total)}): falta ${que}`
      }),
    ].join('\n'),
  )
  return bloques.join('\n\n')
}
