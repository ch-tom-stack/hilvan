// types/index.ts

// ============================================================
// AUTH / USUARIOS
// ============================================================
export type Rol = 'admin' | 'productor' | 'colaborador' | 'cliente'

export interface Profile {
  id: string
  email: string
  nombre: string
  rol: Rol
  created_at: string
}

// ============================================================
// EQUIPOS (Chat 1 — no modificar)
// ============================================================
export type EstadoEquipo = 'disponible' | 'en_uso' | 'en_mantenimiento' | 'pendiente_compra'

export interface CategoriaEquipo {
  id: string
  codigo: string
  nombre: string
  orden: number
}

export interface Equipo {
  id: string
  codigo: string
  nombre: string
  categoria_id: string
  categoria_codigo?: string
  categoria?: CategoriaEquipo
  descripcion?: string
  marca?: string
  modelo?: string
  numero_serie?: string
  estado: EstadoEquipo
  precio_jornada?: number
  foto_url?: string
  fotos?: string[]
  cantidad?: number
  rentable?: boolean
  notas?: string
  created_at: string
}

export interface MaletaNota {
  id: string
  maleta_id: string
  contenido: string
  created_at: string
  created_by?: string
  autor?: Profile
  autor_nombre?: string
}

export interface Maleta {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  foto_url?: string
  foto_empaque?: string
  notas?: MaletaNota[]
  items?: MaletaItem[]
  created_at: string
}

export interface MaletaItem {
  id: string
  maleta_id: string
  equipo_id: string
  equipo?: Equipo
  cantidad: number
  notas?: string
}

// ============================================================
// CLIENTES
// ============================================================
export interface Cliente {
  id: string
  nombre: string
  empresa?: string
  email?: string
  telefono?: string
  rut?: string
  direccion?: string
  notas?: string
  created_at: string
  created_by?: string
}

// ============================================================
// PROYECTOS
// ============================================================
export type EstadoProyecto =
  | 'prospecto'
  | 'activo'
  | 'en_rodaje'
  | 'post'
  | 'entregado'
  | 'cerrado'

export interface Proyecto {
  id: string
  nombre: string
  cliente_id?: string
  cliente?: Cliente
  estado: EstadoProyecto
  descripcion?: string
  fecha_inicio?: string
  fecha_cierre?: string
  created_at: string
  created_by?: string
}

// ============================================================
// TARIFAS BASE
// ============================================================
export type TipoItem =
  | 'rol'
  | 'equipo_ch'
  | 'equipo_externo'
  | 'servicio'
  | 'consumible'
  | 'post_produccion'
  | 'locacion'
  | 'cast'
  | 'otro'

export type UnidadItem = 'día' | 'hora' | 'jornada' | 'unidad' | 'proyecto'

export interface TarifaBase {
  id: string
  tipo: TipoItem
  nombre: string
  descripcion?: string
  precio_referencial: number
  unidad: UnidadItem
  activo: boolean
  created_at: string
}

// ============================================================
// COTIZACIONES
// ============================================================
export type EstadoCotizacion =
  | 'borrador'
  | 'enviada'
  | 'aprobada'
  | 'rechazada'
  | 'en_produccion'
  | 'cerrada'

export type FormatoPDF = 'simple' | 'detallado'
export type TipoDescuento = 'porcentaje' | 'monto'

// --- Grupo (familia de versiones y variantes) ---
export interface CotizacionGrupo {
  id: string
  numero_base: string
  cliente_id?: string
  cliente?: Cliente
  proyecto_id?: string
  proyecto?: Proyecto
  created_at: string
  created_by?: string
  cotizaciones?: Cotizacion[]
}

// --- Cotización (una versión/variante específica) ---
export interface Cotizacion {
  id: string
  grupo_id: string
  grupo?: CotizacionGrupo
  version: number
  variante?: string | null
  copiada_de?: string

  nombre: string
  cliente_id?: string
  cliente?: Cliente
  cliente_nombre_libre?: string
  cliente_email_libre?: string
  proyecto_id?: string
  proyecto?: Proyecto

  estado: EstadoCotizacion
  token?: string
  fecha_envio?: string
  fecha_respuesta_cliente?: string
  comentario_cliente?: string

  con_iva: boolean
  formato_pdf: FormatoPDF
  descuento_global: number
  descuento_global_tipo: TipoDescuento

  descripcion?: string
  notas_internas?: string
  notas_cliente?: string

  created_at: string
  updated_at: string
  created_by?: string

  departamentos?: CotizacionDepartamento[]
}

// Número visible — calculado, nunca almacenado
export function numeroCotizacion(c: {
  grupo?: { numero_base: string }
  version: number
  variante?: string | null
}): string {
  const base = c.grupo?.numero_base ?? '—'
  if (c.version === 1 && !c.variante) return base
  const v = `v${c.version}`
  const var_ = c.variante ? `-${c.variante}` : ''
  return `${base} ${v}${var_}`
}

// --- Departamento ---
export interface CotizacionDepartamento {
  id: string
  cotizacion_id: string
  nombre: string
  orden: number
  subgrupos?: CotizacionSubgrupo[]
  items?: CotizacionItem[]
}

// --- Sub-grupo ---
export interface CotizacionSubgrupo {
  id: string
  cotizacion_id: string
  departamento_id: string
  nombre: string
  orden: number
  items?: CotizacionItem[]
}

// --- Ítem ---
export interface CotizacionItem {
  id: string
  cotizacion_id: string
  departamento_id: string
  subgrupo_id?: string | null

  tipo: TipoItem
  equipo_id?: string | null
  equipo?: Equipo
  tarifa_id?: string | null
  tarifa?: TarifaBase

  nombre: string
  descripcion?: string

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
  created_at: string

  // calculados (desde vista cotizacion_items_totales)
  subtotal_cliente?: number
  costo_real?: number
  margen?: number
}

// ============================================================
// HELPERS DE CÁLCULO
// ============================================================

// Calcula precio_bruto desde neto con boleta
// Bruto = Neto / (1 - tasa)
export function calcularBruto(neto: number, tasa: number = 0.153): number {
  return Math.round(neto / (1 - tasa))
}

// Subtotal de un ítem al cliente
export function subtotalItem(item: CotizacionItem): number {
  if (item.incluido) return 0
  const base = item.precio_cliente * item.cantidad * item.dias
  if (item.descuento_item_tipo === 'porcentaje') {
    return Math.round(base * (1 - item.descuento_item / 100))
  }
  return Math.round(base - item.descuento_item)
}

// Subtotal de un sub-grupo al cliente
export function subtotalSubgrupo(sg: CotizacionSubgrupo): number {
  return (sg.items ?? []).reduce((acc, i) => acc + subtotalItem(i), 0)
}

// Subtotal de un departamento al cliente
export function subtotalDepartamento(dep: CotizacionDepartamento): number {
  const deSubs = (dep.subgrupos ?? []).reduce(
    (acc, sg) => acc + subtotalSubgrupo(sg),
    0
  )
  const directos = (dep.items ?? []).reduce(
    (acc, i) => acc + subtotalItem(i),
    0
  )
  return deSubs + directos
}

// Totales generales
export interface TotalesCotizacion {
  neto: number
  descuento_global_monto: number
  neto_con_descuento: number
  iva: number
  total: number
  costo_real: number
  margen: number
}

export function calcularTotales(cotizacion: Cotizacion): TotalesCotizacion {
  const deps = cotizacion.departamentos ?? []

  const neto = deps.reduce((acc, d) => acc + subtotalDepartamento(d), 0)

  const todosItems = deps.flatMap(d => [
    ...(d.items ?? []),
    ...(d.subgrupos ?? []).flatMap(sg => sg.items ?? []),
  ])

  const costo_real = todosItems.reduce(
    (acc, i) => acc + Math.round(i.precio_bruto * i.cantidad * i.dias),
    0
  )

  let descuento_global_monto = 0
  if (cotizacion.descuento_global > 0) {
    if (cotizacion.descuento_global_tipo === 'porcentaje') {
      descuento_global_monto = Math.round(
        (neto * cotizacion.descuento_global) / 100
      )
    } else {
      descuento_global_monto = cotizacion.descuento_global
    }
  }

  const neto_con_descuento = neto - descuento_global_monto
  const iva = cotizacion.con_iva ? Math.round(neto_con_descuento * 0.19) : 0
  const total = neto_con_descuento + iva
  const margen = total - costo_real

  return {
    neto,
    descuento_global_monto,
    neto_con_descuento,
    iva,
    total,
    costo_real,
    margen,
  }
}

// ============================================================
// FORMATO CLP
// ============================================================
export function formatCLP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CL')
}
