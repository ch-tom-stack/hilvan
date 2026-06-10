'use client'

import { useState, useTransition } from 'react'
import {
  formatCLP,
  calcularBruto,
  type CotizacionItem,
  type TarifaBase,
  type Equipo,
  type TipoItem,
  type UnidadItem,
} from '@/types'

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<TipoItem, string> = {
  rol:            'Rol',
  equipo_ch:      'Equipo CH',
  equipo_externo: 'Equipo externo',
  servicio:       'Servicio',
  consumible:     'Consumible',
  post_produccion:'Post-producción',
  locacion:       'Locación',
  cast:           'Cast',
  otro:           'Otro',
}

const UNIDADES: UnidadItem[] = ['día', 'hora', 'jornada', 'unidad', 'proyecto']

// ─── MODAL ÍTEM ──────────────────────────────────────────────────────────────

interface ItemModalProps {
  mode: 'nuevo' | 'editar'
  item?: CotizacionItem
  cotizacionId: string
  departamentoId: string
  subgrupoId?: string
  tarifas: TarifaBase[]
  equipos: Equipo[]
  onGuardar: (item: Omit<CotizacionItem, 'id' | 'created_at' | 'subtotal_cliente' | 'costo_real' | 'margen'>) => Promise<void>
  onCerrar: () => void
}

export default function ItemModal({
  mode, item, cotizacionId, departamentoId, subgrupoId,
  tarifas, equipos, onGuardar, onCerrar,
}: ItemModalProps) {
  const [isPending, startTransition] = useTransition()

  const [tipo, setTipo] = useState<TipoItem>(item?.tipo ?? 'rol')
  const [nombre, setNombre] = useState(item?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? '')
  const [unidad, setUnidad] = useState<UnidadItem>(item?.unidad ?? 'día')
  const [cantidad, setCantidad] = useState(item?.cantidad ?? 1)
  const [dias, setDias] = useState(item?.dias ?? 1)
  const [incluido, setIncluido] = useState(item?.incluido ?? false)

  // Fiscal
  const [conBoleta, setConBoleta] = useState(item?.con_boleta ?? false)
  const tasaBoleta = item?.tasa_boleta ?? 0.153
  const [netoProveedor, setNetoProveedor] = useState(item?.precio_neto_proveedor ?? 0)
  const [precioPersonalizado, setPrecioPersonalizado] = useState(item?.precio_cliente_personalizado ?? false)
  const [precioCliente, setPrecioCliente] = useState(item?.precio_cliente ?? 0)

  // Calcular bruto y actualizar precio cliente si no es personalizado
  const bruto = conBoleta ? calcularBruto(netoProveedor, tasaBoleta) : netoProveedor
  const precioClienteEfectivo = precioPersonalizado ? precioCliente : bruto

  // Descuento ítem
  const [descItem, setDescItem] = useState(item?.descuento_item ?? 0)
  const [descItemTipo, setDescItemTipo] = useState<'porcentaje' | 'monto'>(item?.descuento_item_tipo ?? 'porcentaje')

  // Tarifa preseleccionada
  function aplicarTarifa(t: TarifaBase) {
    setNombre(t.nombre)
    setTipo(t.tipo as TipoItem)
    setUnidad(t.unidad as UnidadItem)
    setNetoProveedor(t.precio_referencial)
    setPrecioCliente(t.precio_referencial)
  }

  function aplicarEquipo(e: Equipo) {
    setNombre(e.nombre)
    setTipo('equipo_ch')
    setNetoProveedor(e.precio_jornada ?? 0)
    setPrecioCliente(e.precio_jornada ?? 0)
  }

  const subtotalPreview = incluido ? 0 : (() => {
    const base = precioClienteEfectivo * cantidad * dias
    if (descItemTipo === 'porcentaje') return Math.round(base * (1 - descItem / 100))
    return Math.round(base - descItem)
  })()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return

    startTransition(async () => {
      await onGuardar({
        cotizacion_id: cotizacionId,
        departamento_id: departamentoId,
        subgrupo_id: subgrupoId ?? null,
        tipo,
        equipo_id: null,
        tarifa_id: null,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        con_boleta: conBoleta,
        tasa_boleta: tasaBoleta,
        precio_neto_proveedor: netoProveedor,
        precio_bruto: bruto,
        precio_cliente_personalizado: precioPersonalizado,
        precio_cliente: precioClienteEfectivo,
        cantidad,
        dias,
        unidad,
        incluido,
        descuento_item: descItem,
        descuento_item_tipo: descItemTipo,
        orden: item?.orden ?? 99,
      })
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full bg-ch-dark border-l border-ch-border overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Header modal */}
          <div className="flex items-center justify-between">
            <h2 className="font-body text-sm font-medium text-ch-cream">
              {mode === 'nuevo' ? 'Nuevo ítem' : 'Editar ítem'}
            </h2>
            <button type="button" onClick={onCerrar} className="text-ch-muted hover:text-ch-cream text-lg">✕</button>
          </div>

          {/* Biblioteca de tarifas */}
          {mode === 'nuevo' && (
            <details className="group">
              <summary className="font-body text-xs text-ch-muted cursor-pointer hover:text-ch-cream list-none flex items-center gap-1">
                <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                Cargar desde biblioteca
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto border border-ch-border rounded divide-y divide-ch-border/30">
                {tarifas.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => aplicarTarifa(t)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-ch-border/10 transition-colors text-left"
                  >
                    <span className="font-body text-xs text-ch-cream truncate">{t.nombre}</span>
                    <span className="font-body text-xs text-ch-muted shrink-0 ml-2">{formatCLP(t.precio_referencial)}</span>
                  </button>
                ))}
              </div>
            </details>
          )}

          {mode === 'nuevo' && tipo === 'equipo_ch' && equipos.length > 0 && (
            <details>
              <summary className="font-body text-xs text-ch-muted cursor-pointer hover:text-ch-cream list-none">
                ▶ Cargar equipo CH
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto border border-ch-border rounded divide-y divide-ch-border/30">
                {equipos.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => aplicarEquipo(e)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-ch-border/10 transition-colors text-left"
                  >
                    <span className="font-body text-xs text-ch-cream truncate">{e.nombre}</span>
                    <span className="font-body text-xs text-ch-muted shrink-0 ml-2">{e.precio_jornada ? formatCLP(e.precio_jornada) : '—'}</span>
                  </button>
                ))}
              </div>
            </details>
          )}

          {/* Tipo */}
          <div>
            <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Tipo</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as TipoItem)}
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
            >
              {(Object.entries(TIPO_LABELS) as [TipoItem, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Nombre */}
          <div>
            <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">Nombre *</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="ej: Director de Fotografía"
              required
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block font-body text-xs tracking-wider uppercase text-ch-muted mb-1.5">
              Descripción <span className="normal-case text-ch-muted/60">(bullets visibles al cliente)</span>
            </label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={3}
              placeholder="- Ítem 1&#10;- Ítem 2"
              className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream placeholder-ch-muted/40 focus:outline-none focus:border-ch-cream/40 resize-none"
            />
          </div>

          {/* Fiscal */}
          <div className="space-y-3 border border-ch-border rounded p-4">
            <p className="font-body text-[10px] uppercase tracking-wider text-ch-muted">Precio</p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={conBoleta}
                onChange={e => setConBoleta(e.target.checked)}
                className="accent-amber-400"
              />
              <span className="font-body text-xs text-ch-muted">Proveedor con boleta de honorarios (15.3%)</span>
            </label>

            <div>
              <label className="block font-body text-xs text-ch-muted mb-1">
                {conBoleta ? 'Neto proveedor (lo que recibe)' : 'Precio'}
              </label>
              <input
                type="number"
                min="0"
                value={netoProveedor || ''}
                onChange={e => setNetoProveedor(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
              />
            </div>

            {conBoleta && (
              <div className="flex items-center justify-between bg-amber-400/5 border border-amber-400/20 rounded px-3 py-2">
                <span className="font-body text-xs text-amber-400/80">Bruto real (costo Casa Hiedra)</span>
                <span className="font-body text-sm font-medium text-amber-300">{formatCLP(bruto)}</span>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={precioPersonalizado}
                onChange={e => {
                  setPrecioPersonalizado(e.target.checked)
                  if (e.target.checked) setPrecioCliente(bruto)
                }}
                className="accent-ch-cream"
              />
              <span className="font-body text-xs text-ch-muted">Precio al cliente personalizado</span>
            </label>

            {precioPersonalizado && (
              <div>
                <label className="block font-body text-xs text-ch-muted mb-1">Precio al cliente</label>
                <input
                  type="number"
                  min="0"
                  value={precioCliente || ''}
                  onChange={e => setPrecioCliente(Number(e.target.value) || 0)}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={incluido}
                onChange={e => setIncluido(e.target.checked)}
                className="accent-ch-cream"
              />
              <span className="font-body text-xs text-ch-muted">Marcar como "Incluida"</span>
            </label>
          </div>

          {/* Cantidad / días */}
          {!incluido && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-body text-xs text-ch-muted mb-1">Cantidad</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={cantidad}
                  onChange={e => setCantidad(Number(e.target.value) || 1)}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
              </div>
              <div>
                <label className="block font-body text-xs text-ch-muted mb-1">Días/unid</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={dias}
                  onChange={e => setDias(Number(e.target.value) || 1)}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none focus:border-ch-cream/40"
                />
              </div>
              <div>
                <label className="block font-body text-xs text-ch-muted mb-1">Unidad</label>
                <select
                  value={unidad}
                  onChange={e => setUnidad(e.target.value as UnidadItem)}
                  className="w-full bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none"
                >
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Descuento ítem */}
          {!incluido && (
            <div>
              <label className="block font-body text-xs text-ch-muted mb-1">Descuento ítem</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  value={descItem || ''}
                  onChange={e => setDescItem(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="flex-1 bg-ch-dark border border-ch-border rounded px-3 py-2 font-body text-sm text-ch-cream focus:outline-none"
                />
                <select
                  value={descItemTipo}
                  onChange={e => setDescItemTipo(e.target.value as 'porcentaje' | 'monto')}
                  className="w-20 bg-ch-dark border border-ch-border rounded px-2 py-2 font-body text-xs text-ch-cream focus:outline-none"
                >
                  <option value="porcentaje">%</option>
                  <option value="monto">$</option>
                </select>
              </div>
            </div>
          )}

          {/* Preview subtotal */}
          {!incluido && (
            <div className="flex items-center justify-between bg-ch-border/10 rounded px-4 py-3">
              <span className="font-body text-xs text-ch-muted">Subtotal al cliente</span>
              <span className="font-display text-lg text-ch-cream">{formatCLP(subtotalPreview)}</span>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending || !nombre.trim()}
              className="flex-1 py-2.5 bg-ch-cream text-ch-dark font-body text-sm font-medium rounded hover:bg-ch-cream/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : mode === 'nuevo' ? 'Agregar ítem' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2.5 border border-ch-border text-ch-muted font-body text-sm rounded hover:text-ch-cream hover:border-ch-cream/40 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
