'use client'

import { useState } from 'react'
import {
  subtotalDepartamento,
  subtotalSubgrupo,
  subtotalItem,
  formatCLP,
  type CotizacionDepartamento,
  type CotizacionSubgrupo,
  type CotizacionItem,
  type TipoItem,
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

// ─── DEP BLOCK ───────────────────────────────────────────────────────────────

interface DepBlockProps {
  dep: CotizacionDepartamento
  editable: boolean
  showInterno: boolean
  onRenombrar: () => void
  onPrecio: () => void
  onEliminar: () => void
  onAgregarSg: () => void
  onRenombrarSg: (sg: CotizacionSubgrupo) => void
  onPrecioSg: (sg: CotizacionSubgrupo) => void
  onEliminarSg: (sg: CotizacionSubgrupo) => void
  onAgregarItem: (sgId?: string) => void
  onEditarItem: (item: CotizacionItem, sgId?: string) => void
  onEliminarItem: (item: CotizacionItem, sgId?: string) => void
}

export default function DepBlock({
  dep, editable, showInterno,
  onRenombrar, onPrecio, onEliminar, onAgregarSg,
  onRenombrarSg, onPrecioSg, onEliminarSg,
  onAgregarItem, onEditarItem, onEliminarItem,
}: DepBlockProps) {
  const [collapsed, setCollapsed] = useState(false)
  const subtotal = subtotalDepartamento(dep)
  const bundle = dep.precio_manual != null

  return (
    <div className="border border-ch-border overflow-hidden">
      {/* Header departamento */}
      <div className="flex items-center justify-between px-4 py-3 bg-ch-dark/40">
        <div className="flex items-center gap-3">
          <button onClick={() => setCollapsed(v => !v)} className="text-ch-muted hover:text-ch-cream transition-colors text-xs">
            {collapsed ? '▶' : '▼'}
          </button>
          <span className="font-body text-sm font-medium text-ch-cream uppercase tracking-wider">
            {dep.nombre}
          </span>
          {bundle && (
            <span className="font-body text-[9px] text-ch-green bg-ch-green/10 px-1.5 py-0.5 rounded uppercase tracking-wider">bundle</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-sm text-ch-cream">{formatCLP(subtotal)}</span>
          {editable && (
            <div className="flex items-center gap-1">
              <button onClick={onAgregarSg} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20">
                + sub-grupo
              </button>
              <button onClick={() => onAgregarItem(undefined)} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20">
                + ítem
              </button>
              <button onClick={onPrecio} title="Precio del bundle" className={`font-body text-[10px] px-1 transition-colors ${bundle ? 'text-ch-green hover:text-ch-green-light' : 'text-ch-muted hover:text-ch-cream'}`}>$</button>
              <button onClick={onRenombrar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1">✎</button>
              <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 transition-colors px-1">✕</button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-ch-border/30">
          {/* Sub-grupos */}
          {(dep.subgrupos ?? []).map(sg => (
            <SgBlock
              key={sg.id}
              sg={sg}
              editable={editable}
              showInterno={showInterno}
              bundlePadre={bundle}
              onRenombrar={() => onRenombrarSg(sg)}
              onPrecio={() => onPrecioSg(sg)}
              onEliminar={() => onEliminarSg(sg)}
              onAgregarItem={() => onAgregarItem(sg.id)}
              onEditarItem={item => onEditarItem(item, sg.id)}
              onEliminarItem={item => onEliminarItem(item, sg.id)}
            />
          ))}

          {/* Ítems directos */}
          {(dep.items ?? []).map(item => (
            <ItemRow
              key={item.id}
              item={item}
              editable={editable}
              showInterno={showInterno}
              indent={false}
              bundle={bundle}
              onEditar={() => onEditarItem(item)}
              onEliminar={() => onEliminarItem(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SG BLOCK ────────────────────────────────────────────────────────────────

interface SgBlockProps {
  sg: CotizacionSubgrupo
  editable: boolean
  showInterno: boolean
  bundlePadre: boolean
  onRenombrar: () => void
  onPrecio: () => void
  onEliminar: () => void
  onAgregarItem: () => void
  onEditarItem: (item: CotizacionItem) => void
  onEliminarItem: (item: CotizacionItem) => void
}

function SgBlock({
  sg, editable, showInterno, bundlePadre,
  onRenombrar, onPrecio, onEliminar, onAgregarItem,
  onEditarItem, onEliminarItem,
}: SgBlockProps) {
  const subtotal = subtotalSubgrupo(sg)
  const bundle = bundlePadre || sg.precio_manual != null

  return (
    <div>
      {/* Header sub-grupo */}
      <div className="flex items-center justify-between px-4 py-2 bg-ch-dark/20">
        <div className="flex items-center gap-2">
          <span className="font-body text-xs font-semibold text-ch-cream/80">{sg.nombre}</span>
          {sg.precio_manual != null && (
            <span className="font-body text-[9px] text-ch-green bg-ch-green/10 px-1.5 py-0.5 rounded uppercase tracking-wider">bundle</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-ch-cream">{formatCLP(subtotal)}</span>
          {editable && (
            <div className="flex items-center gap-1">
              <button onClick={onAgregarItem} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20">
                + ítem
              </button>
              <button onClick={onPrecio} title="Precio del bundle" className={`font-body text-[10px] px-1 transition-colors ${sg.precio_manual != null ? 'text-ch-green hover:text-ch-green-light' : 'text-ch-muted hover:text-ch-cream'}`}>$</button>
              <button onClick={onRenombrar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1">✎</button>
              <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 px-1">✕</button>
            </div>
          )}
        </div>
      </div>
      {/* Ítems del sub-grupo */}
      {(sg.items ?? []).map(item => (
        <ItemRow
          key={item.id}
          item={item}
          editable={editable}
          showInterno={showInterno}
          indent={true}
          bundle={bundle}
          onEditar={() => onEditarItem(item)}
          onEliminar={() => onEliminarItem(item)}
        />
      ))}
    </div>
  )
}

// ─── ITEM ROW ────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: CotizacionItem
  editable: boolean
  showInterno: boolean
  indent: boolean
  bundle?: boolean
  onEditar: () => void
  onEliminar: () => void
}

function ItemRow({ item, editable, showInterno, indent, bundle, onEditar, onEliminar }: ItemRowProps) {
  const subtotal = subtotalItem(item)
  const costo = Math.round(item.precio_bruto * item.cantidad * item.dias)
  const margen = subtotal - costo

  return (
    <div className={`flex items-start justify-between py-2 pr-4 hover:bg-ch-border/5 group ${indent ? 'pl-8' : 'pl-4'}`}>
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <span className="font-body text-xs text-ch-cream truncate">
            {item.nombre}
          </span>
          {item.incluido && (
            <span className="font-body text-[10px] text-ch-muted bg-ch-border/20 px-1.5 py-0.5 rounded">incluido</span>
          )}
          {item.con_boleta && (
            <span className="font-body text-[10px] text-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 rounded">boleta</span>
          )}
        </div>
        {item.descripcion && (
          <p className="font-body text-[10px] text-ch-muted mt-0.5 leading-relaxed">{item.descripcion}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-body text-[10px] text-ch-muted/60">
            {TIPO_LABELS[item.tipo]}
          </span>
          {!item.incluido && (item.cantidad > 1 || item.dias > 1) && (
            <span className="font-body text-[10px] text-ch-muted/60">
              · {formatCLP(item.precio_cliente)} × {item.cantidad} × {item.dias} {item.unidad}
            </span>
          )}
        </div>
        {showInterno && !item.incluido && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-body text-[10px] text-ch-muted/40">
              costo {formatCLP(costo)}
            </span>
            <span className={`font-body text-[10px] ${margen >= 0 ? 'text-ch-green/60' : 'text-red-400/60'}`}>
              margen {formatCLP(margen)}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`font-body text-xs ${bundle ? 'text-ch-muted/40' : 'text-ch-cream'}`}>
          {bundle ? '—' : item.incluido ? 'Incluida' : formatCLP(subtotal)}
        </span>
        {editable && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEditar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1">✎</button>
            <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 px-1">✕</button>
          </div>
        )}
      </div>
    </div>
  )
}
