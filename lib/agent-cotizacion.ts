// lib/agent-cotizacion.ts
// Validación y normalización PURA del payload de creación de cotizaciones desde
// el agente (/api/agent/crear-cotizacion). Sin I/O: recibe el body y devuelve o
// bien un error de validación, o bien una estructura normalizada lista para que
// el route handler la escriba en DB replicando el shape de `copiarItem` /
// `crearCotizacion` de app/actions/cotizaciones.ts.
//
// Reglas (auditoría): valida TODO antes de la primera escritura; dinero con
// parseFloat + Number.isFinite (nunca parseInt); defaults sensatos por campo
// faltante para paridad con una cotización creada por un usuario en la UI.

import type { TipoItem, UnidadItem, TipoDescuento } from '@/types'
import { tasaRetencionBoleta } from '@/lib/rendiciones-calc'

export const TIPOS_ITEM: readonly TipoItem[] = [
  'rol',
  'equipo_ch',
  'equipo_externo',
  'servicio',
  'consumible',
  'post_produccion',
  'locacion',
  'cast',
  'otro',
]

export const UNIDADES_ITEM: readonly UnidadItem[] = [
  'día',
  'hora',
  'jornada',
  'unidad',
  'proyecto',
]

export const TIPOS_DESCUENTO: readonly TipoDescuento[] = ['porcentaje', 'monto']

export const FORMATOS_PDF = ['simple', 'detallado'] as const

// Los 8 departamentos por defecto que crea `crearCotizacion` en la UI.
export const DEPARTAMENTOS_DEFAULT = [
  'Dirección',
  'Fotografía',
  'Sonido',
  'Arte',
  'Cast',
  'Locación / Estudio',
  'Post-producción',
  'Otros / Varios',
] as const

// ── Shapes normalizados (lo que escribe el route handler) ─────────────────────

export interface ItemNormalizado {
  tipo: TipoItem
  equipo_id: string | null
  tarifa_id: string | null
  nombre: string
  descripcion: string | null
  con_boleta: boolean
  tasa_boleta: number
  precio_neto_proveedor: number
  precio_bruto: number
  precio_cliente_personalizado: boolean
  precio_cliente: number
  cantidad: number
  dias: number
  unidad: UnidadItem
  incluido: boolean
  descuento_item: number
  descuento_item_tipo: TipoDescuento
  orden: number
}

export interface SubgrupoNormalizado {
  nombre: string
  orden: number
  items: ItemNormalizado[]
}

export interface DepartamentoNormalizado {
  nombre: string
  orden: number
  items: ItemNormalizado[]
  subgrupos: SubgrupoNormalizado[]
}

export interface CabeceraNormalizada {
  nombre: string
  cliente_id: string | null
  cliente_nombre_libre: string | null
  cliente_email_libre: string | null
  proyecto_id: string | null
  con_iva: boolean
  formato_pdf: 'simple' | 'detallado'
  descuento_global: number
  descuento_global_tipo: TipoDescuento
  descripcion: string | null
  notas_internas: string | null
  notas_cliente: string | null
  fecha_factura_emitida: string | null
  numero_factura: string | null
  // Serie alternativa de numeración (ej. 'ARCH' → CH-ARCH-001). null = serie
  // activa normal (CH-{año}-NNN vía RPC). Solo letras, para que nunca colisione
  // con el formato de año ni contamine su contador.
  serie: string | null
  // true → cotización de archivo (importada, pre-Hilván): se marca es_archivo
  // en la DB para excluirla de métricas/pipeline.
  historica: boolean
}

export interface CotizacionNormalizada {
  cabecera: CabeceraNormalizada
  departamentos: DepartamentoNormalizado[]
  // true → no vinieron departamentos en el body; usar DEPARTAMENTOS_DEFAULT
  usarDepartamentosDefault: boolean
}

export type ResultadoValidacion =
  | { ok: true; data: CotizacionNormalizada }
  | { ok: false; error: string }

// ── Helpers numéricos ─────────────────────────────────────────────────────────

// Dinero / números: parseFloat + Number.isFinite (regla auditoría). Acepta number
// o string numérico. undefined/null/'' → fallback. Valor no finito → error (null).
function numOpcional(v: unknown, fallback: number): number | null {
  if (v === undefined || v === null || v === '') return fallback
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function strOpcional(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function boolConDefault(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback
  return Boolean(v)
}

// ── Validación de un ítem ─────────────────────────────────────────────────────

export function validarItem(
  raw: any,
  ctx: string,
  ordenFallback: number,
): { ok: true; data: ItemNormalizado } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: `${ctx}: ítem inválido` }
  }

  const nombre = typeof raw.nombre === 'string' ? raw.nombre.trim() : ''
  if (!nombre) return { ok: false, error: `${ctx}: cada ítem necesita "nombre"` }

  const tipo: TipoItem = raw.tipo ?? 'otro'
  if (!TIPOS_ITEM.includes(tipo)) {
    return {
      ok: false,
      error: `${ctx} ("${nombre}"): tipo inválido "${raw.tipo}". Válidos: ${TIPOS_ITEM.join(', ')}`,
    }
  }

  const unidad: UnidadItem = raw.unidad ?? 'día'
  if (!UNIDADES_ITEM.includes(unidad)) {
    return {
      ok: false,
      error: `${ctx} ("${nombre}"): unidad inválida "${raw.unidad}". Válidas: ${UNIDADES_ITEM.join(', ')}`,
    }
  }

  const descTipo: TipoDescuento = raw.descuento_item_tipo ?? 'monto'
  if (!TIPOS_DESCUENTO.includes(descTipo)) {
    return {
      ok: false,
      error: `${ctx} ("${nombre}"): descuento_item_tipo inválido. Válidos: ${TIPOS_DESCUENTO.join(', ')}`,
    }
  }

  // Números (defaults reales de la UI: cantidad/dias 1, precios/tasas/descuento 0).
  // tasa_boleta: si el ítem lleva boleta y NO se entregó tasa, usar la retención
  // del año actual (Ley 21.133, ej. 15,25% en 2026) en vez de 0 — así una boleta
  // de honorarios no queda con retención 0% por omisión. Sin boleta → 0.
  const con_boleta = boolConDefault(raw.con_boleta, false)
  const tasa_boleta = numOpcional(raw.tasa_boleta, con_boleta ? tasaRetencionBoleta() : 0)
  const precio_neto_proveedor = numOpcional(raw.precio_neto_proveedor, 0)
  const precio_bruto = numOpcional(raw.precio_bruto, 0)
  const precio_cliente = numOpcional(raw.precio_cliente, 0)
  const cantidad = numOpcional(raw.cantidad, 1)
  const dias = numOpcional(raw.dias, 1)
  const descuento_item = numOpcional(raw.descuento_item, 0)
  const orden = numOpcional(raw.orden, ordenFallback)

  const numericos: Array<[string, number | null]> = [
    ['tasa_boleta', tasa_boleta],
    ['precio_neto_proveedor', precio_neto_proveedor],
    ['precio_bruto', precio_bruto],
    ['precio_cliente', precio_cliente],
    ['cantidad', cantidad],
    ['dias', dias],
    ['descuento_item', descuento_item],
    ['orden', orden],
  ]
  for (const [campo, val] of numericos) {
    if (val === null) {
      return { ok: false, error: `${ctx} ("${nombre}"): ${campo} debe ser un número` }
    }
  }

  return {
    ok: true,
    data: {
      tipo,
      equipo_id: strOpcional(raw.equipo_id),
      tarifa_id: strOpcional(raw.tarifa_id),
      nombre,
      descripcion: strOpcional(raw.descripcion),
      con_boleta,
      tasa_boleta: tasa_boleta!,
      precio_neto_proveedor: precio_neto_proveedor!,
      precio_bruto: precio_bruto!,
      // Si el agente entrega un precio_cliente directo (recreando una cotización
      // antigua con su precio final), se marca personalizado para que ese precio
      // CUENTE en los totales (igual que cuando un usuario escribe el precio a mano).
      precio_cliente_personalizado: boolConDefault(
        raw.precio_cliente_personalizado,
        precio_cliente != null && precio_cliente > 0,
      ),
      precio_cliente: precio_cliente!,
      cantidad: cantidad!,
      dias: dias!,
      unidad,
      // OJO: `incluido=true` significa "incluido SIN costo" → subtotalItem lo cuenta
      // como 0. Una línea facturable normal es incluido=false (default correcto).
      incluido: boolConDefault(raw.incluido, false),
      descuento_item: descuento_item!,
      descuento_item_tipo: descTipo,
      orden: orden!,
    },
  }
}

// ── Validación del body completo ──────────────────────────────────────────────

export function validarCotizacion(body: any): ResultadoValidacion {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body inválido' }
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return { ok: false, error: 'Falta "nombre" de la cotización' }

  // Cliente: id O nombre libre (ambos opcionales, como en la UI).
  const cliente_id = strOpcional(body.cliente_id)
  const cliente_nombre_libre = strOpcional(body.cliente_nombre_libre)
  const cliente_email_libre = strOpcional(body.cliente_email_libre)
  const proyecto_id = strOpcional(body.proyecto_id)

  // Cabecera con defaults reales de la UI.
  const formato_pdf = body.formato_pdf ?? 'detallado'
  if (!FORMATOS_PDF.includes(formato_pdf)) {
    return { ok: false, error: `formato_pdf inválido. Válidos: ${FORMATOS_PDF.join(', ')}` }
  }

  const descuento_global_tipo: TipoDescuento = body.descuento_global_tipo ?? 'monto'
  if (!TIPOS_DESCUENTO.includes(descuento_global_tipo)) {
    return {
      ok: false,
      error: `descuento_global_tipo inválido. Válidos: ${TIPOS_DESCUENTO.join(', ')}`,
    }
  }

  const descuento_global = numOpcional(body.descuento_global, 0)
  if (descuento_global === null) {
    return { ok: false, error: 'descuento_global debe ser un número' }
  }

  // Factura emitida opcional: si viene fecha, validar formato YYYY-MM-DD.
  const fecha_factura_emitida = strOpcional(body.fecha_factura_emitida)
  if (fecha_factura_emitida && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_factura_emitida)) {
    return { ok: false, error: 'fecha_factura_emitida debe tener formato YYYY-MM-DD' }
  }
  const numero_factura = strOpcional(body.numero_factura)

  // Serie alternativa (import histórico): solo letras A-Z, 2-8 caracteres.
  // Letras-solo garantiza que jamás matchee el formato de la serie activa
  // (CH-{año}-NNN) ni su contador. Se normaliza a mayúsculas.
  let serie: string | null = null
  if (body.serie !== undefined && body.serie !== null && body.serie !== '') {
    const s = String(body.serie).trim().toUpperCase()
    if (!/^[A-Z]{2,8}$/.test(s)) {
      return { ok: false, error: 'serie inválida: solo letras A-Z, entre 2 y 8 (ej. "ARCH")' }
    }
    serie = s
  }
  const historica = boolConDefault(body.historica, false)

  const cabecera: CabeceraNormalizada = {
    nombre,
    cliente_id,
    cliente_nombre_libre,
    cliente_email_libre,
    proyecto_id,
    con_iva: boolConDefault(body.con_iva, true),
    formato_pdf,
    descuento_global,
    descuento_global_tipo,
    descripcion: strOpcional(body.descripcion),
    notas_internas: strOpcional(body.notas_internas),
    notas_cliente: strOpcional(body.notas_cliente),
    fecha_factura_emitida,
    numero_factura,
    serie,
    historica,
  }

  // Departamentos: opcionales. Si no vienen → usar los 8 por defecto.
  const rawDeps = body.departamentos
  if (rawDeps === undefined || rawDeps === null) {
    return {
      ok: true,
      data: { cabecera, departamentos: [], usarDepartamentosDefault: true },
    }
  }
  if (!Array.isArray(rawDeps)) {
    return { ok: false, error: 'departamentos debe ser un array' }
  }

  const departamentos: DepartamentoNormalizado[] = []
  for (let di = 0; di < rawDeps.length; di++) {
    const rawDep = rawDeps[di]
    if (!rawDep || typeof rawDep !== 'object') {
      return { ok: false, error: `departamento #${di + 1}: inválido` }
    }
    const depNombre = typeof rawDep.nombre === 'string' ? rawDep.nombre.trim() : ''
    if (!depNombre) {
      return { ok: false, error: `departamento #${di + 1}: necesita "nombre"` }
    }
    const depOrden = numOpcional(rawDep.orden, di)
    if (depOrden === null) {
      return { ok: false, error: `departamento "${depNombre}": orden debe ser un número` }
    }

    // Ítems directos del departamento.
    const itemsDirectos: ItemNormalizado[] = []
    const rawItems = rawDep.items
    if (rawItems !== undefined && rawItems !== null) {
      if (!Array.isArray(rawItems)) {
        return { ok: false, error: `departamento "${depNombre}": items debe ser un array` }
      }
      for (let ii = 0; ii < rawItems.length; ii++) {
        const r = validarItem(rawItems[ii], `departamento "${depNombre}", ítem #${ii + 1}`, ii)
        if (!r.ok) return r
        itemsDirectos.push(r.data)
      }
    }

    // Subgrupos.
    const subgrupos: SubgrupoNormalizado[] = []
    const rawSubs = rawDep.subgrupos
    if (rawSubs !== undefined && rawSubs !== null) {
      if (!Array.isArray(rawSubs)) {
        return { ok: false, error: `departamento "${depNombre}": subgrupos debe ser un array` }
      }
      for (let si = 0; si < rawSubs.length; si++) {
        const rawSub = rawSubs[si]
        if (!rawSub || typeof rawSub !== 'object') {
          return { ok: false, error: `departamento "${depNombre}", subgrupo #${si + 1}: inválido` }
        }
        const subNombre = typeof rawSub.nombre === 'string' ? rawSub.nombre.trim() : ''
        if (!subNombre) {
          return {
            ok: false,
            error: `departamento "${depNombre}", subgrupo #${si + 1}: necesita "nombre"`,
          }
        }
        const subOrden = numOpcional(rawSub.orden, si)
        if (subOrden === null) {
          return {
            ok: false,
            error: `subgrupo "${subNombre}": orden debe ser un número`,
          }
        }
        const subItems: ItemNormalizado[] = []
        const rawSubItems = rawSub.items
        if (rawSubItems !== undefined && rawSubItems !== null) {
          if (!Array.isArray(rawSubItems)) {
            return { ok: false, error: `subgrupo "${subNombre}": items debe ser un array` }
          }
          for (let ii = 0; ii < rawSubItems.length; ii++) {
            const r = validarItem(
              rawSubItems[ii],
              `subgrupo "${subNombre}", ítem #${ii + 1}`,
              ii,
            )
            if (!r.ok) return r
            subItems.push(r.data)
          }
        }
        subgrupos.push({ nombre: subNombre, orden: subOrden, items: subItems })
      }
    }

    departamentos.push({ nombre: depNombre, orden: depOrden, items: itemsDirectos, subgrupos })
  }

  return { ok: true, data: { cabecera, departamentos, usarDepartamentosDefault: false } }
}
