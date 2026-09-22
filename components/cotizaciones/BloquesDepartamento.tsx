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

/**
 * Subir / bajar un puesto. Siempre visibles (en el celular no existe el hover) y
 * disponibles en cualquier estado de la cotización: el orden es presentación,
 * no entra en ningún total.
 */
function Flechas({ onSubir, onBajar, que }: { onSubir?: () => void; onBajar?: () => void; que: string }) {
  const base = 'font-body text-[11px] leading-none px-1 py-1 transition-colors ch-press'
  const clase = (activo: boolean) => `${base} ${activo ? 'text-ch-muted hover:text-ch-cream' : 'text-ch-border cursor-default'}`
  return (
    <span className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={onSubir} disabled={!onSubir} aria-label={`Subir ${que}`} title="Subir" className={clase(!!onSubir)}>↑</button>
      <button type="button" onClick={onBajar} disabled={!onBajar} aria-label={`Bajar ${que}`} title="Bajar" className={clase(!!onBajar)}>↓</button>
    </span>
  )
}

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
  /** antesDeId: soltar SOBRE un ítem lo deja justo antes de ese; null = al final del grupo. */
  onMoverItem: (itemId: string, fromDep: string, fromSg: string | null, toDep: string, toSg: string | null, antesDeId?: string | null) => void
  /** undefined cuando ya es el primero / el último. */
  onSubir?: () => void
  onBajar?: () => void
  onMoverSg: (sg: CotizacionSubgrupo, dir: -1 | 1) => void
  onMoverItemPuesto: (item: CotizacionItem, sgId: string | null, dir: -1 | 1) => void
  /** Portapapeles (localStorage): qué hay copiado, para mostrar "Pegar". */
  copiado: { tipo: 'item' | 'grupo'; etiqueta: string } | null
  onCopiarItem: (item: CotizacionItem) => void
  onCopiarGrupo: () => void
  onPegarItem: (sgId: string | null) => void
  /** Selección con clic (para Ctrl+C / Ctrl+V): id del ítem o del grupo seleccionado. */
  seleccionId: string | null
  onSeleccionarItem: (item: CotizacionItem, sgId: string | null) => void
  onSeleccionarGrupo: () => void
}

export default function DepBlock({
  dep, editable, showInterno,
  onRenombrar, onPrecio, onEliminar, onAgregarSg,
  onRenombrarSg, onPrecioSg, onEliminarSg,
  onAgregarItem, onEditarItem, onEliminarItem, onMoverItem,
  onSubir, onBajar, onMoverSg, onMoverItemPuesto,
  copiado, onCopiarItem, onCopiarGrupo, onPegarItem,
  seleccionId, onSeleccionarItem, onSeleccionarGrupo,
}: DepBlockProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [overDir, setOverDir] = useState(false)
  const subtotal = subtotalDepartamento(dep)
  const bundle = dep.precio_manual != null

  // Lee el ítem arrastrado y lo mueve a (este depto, toSg).
  const soltar = (e: React.DragEvent, toSg: string | null, antesDeId: string | null = null) => {
    try {
      const { itemId, fromDep, fromSg } = JSON.parse(e.dataTransfer.getData('application/json'))
      if (itemId && itemId !== antesDeId) onMoverItem(itemId, fromDep, fromSg ?? null, dep.id, toSg, antesDeId)
    } catch { /* drop inválido */ }
  }

  return (
    <div className={`border overflow-hidden ${seleccionId === dep.id ? 'border-ch-green' : 'border-ch-border'}`}>
      {/* Header departamento (clic = seleccionar el grupo para Ctrl+C) */}
      <div className="flex items-center justify-between px-4 py-3 bg-ch-dark/40 cursor-default" onClick={onSeleccionarGrupo}>
        <div className="flex items-center gap-3">
          <button onClick={() => setCollapsed(v => !v)} className="text-ch-muted hover:text-ch-cream transition-colors text-xs ch-press">
            {collapsed ? '▶' : '▼'}
          </button>
          <Flechas onSubir={onSubir} onBajar={onBajar} que={`el grupo ${dep.nombre}`} />
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
              <button onClick={onAgregarSg} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20 ch-press">
                + sub-grupo
              </button>
              <button onClick={() => onAgregarItem(undefined)} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20 ch-press">
                + ítem
              </button>
              {copiado?.tipo === 'item' && (
                <button onClick={() => onPegarItem(null)} title={`Pegar «${copiado.etiqueta}» acá`} className="font-body text-[10px] text-ch-green hover:text-ch-green-light transition-colors px-1.5 py-0.5 rounded hover:bg-ch-green/10 ch-press">
                  pegar ítem
                </button>
              )}
              <button onClick={onCopiarGrupo} title="Copiar el grupo completo (con sub-grupos e ítems) para pegarlo en esta u otra cotización" className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1 ch-press">⧉</button>
              <button onClick={onPrecio} title="Precio del bundle" className={`font-body text-[10px] px-1 transition-colors ${bundle ? 'text-ch-green hover:text-ch-green-light' : 'text-ch-muted hover:text-ch-cream'} ch-press`}>$</button>
              <button onClick={onRenombrar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1 ch-press">✎</button>
              <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 transition-colors px-1 ch-press">✕</button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-ch-border/30">
          {/* Sub-grupos */}
          {(dep.subgrupos ?? []).map((sg, iSg, todosSg) => (
            <SgBlock
              key={sg.id}
              sg={sg}
              onSubir={iSg > 0 ? () => onMoverSg(sg, -1) : undefined}
              onBajar={iSg < todosSg.length - 1 ? () => onMoverSg(sg, 1) : undefined}
              onMoverItemPuesto={(item, dir) => onMoverItemPuesto(item, sg.id, dir)}
              onSoltarSobreItem={(e, item) => soltar(e, sg.id, item.id)}
              copiado={copiado}
              onCopiarItem={onCopiarItem}
              onPegarItem={() => onPegarItem(sg.id)}
              seleccionId={seleccionId}
              onSeleccionarItem={item => onSeleccionarItem(item, sg.id)}
              depId={dep.id}
              editable={editable}
              showInterno={showInterno}
              bundlePadre={bundle}
              onRenombrar={() => onRenombrarSg(sg)}
              onPrecio={() => onPrecioSg(sg)}
              onEliminar={() => onEliminarSg(sg)}
              onAgregarItem={() => onAgregarItem(sg.id)}
              onEditarItem={item => onEditarItem(item, sg.id)}
              onEliminarItem={item => onEliminarItem(item, sg.id)}
              onSoltarItem={e => soltar(e, sg.id)}
            />
          ))}

          {/* Ítems directos (zona de drop = soltar como directo / sacar de subgrupo) */}
          <div
            onDragOver={editable ? (e => { e.preventDefault(); setOverDir(true) }) : undefined}
            onDragLeave={editable ? (() => setOverDir(false)) : undefined}
            onDrop={editable ? (e => { e.preventDefault(); setOverDir(false); soltar(e, null) }) : undefined}
            className={overDir ? 'ring-1 ring-inset ring-ch-green/60 bg-ch-green/5' : ''}
          >
            {(dep.items ?? []).map((item, i, todos) => (
              <ItemRow
                key={item.id}
                item={item}
                onSubir={i > 0 ? () => onMoverItemPuesto(item, null, -1) : undefined}
                onBajar={i < todos.length - 1 ? () => onMoverItemPuesto(item, null, 1) : undefined}
                onSoltarSobre={e => soltar(e, null, item.id)}
                onCopiar={() => onCopiarItem(item)}
                seleccionado={seleccionId === item.id}
                onSeleccionar={() => onSeleccionarItem(item, null)}
                editable={editable}
                showInterno={showInterno}
                indent={false}
                bundle={bundle}
                depId={dep.id}
                onEditar={() => onEditarItem(item)}
                onEliminar={() => onEliminarItem(item)}
              />
            ))}
            {/* Tira de drop visible solo al arrastrar: deja un objetivo aunque no haya ítems directos */}
            {editable && (dep.subgrupos?.length ?? 0) > 0 && (
              <div className="px-4 py-1.5 text-[10px] text-ch-border italic select-none">
                Suelta aquí para dejar el ítem fuera de un subgrupo (directo)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SG BLOCK ────────────────────────────────────────────────────────────────

interface SgBlockProps {
  sg: CotizacionSubgrupo
  depId: string
  editable: boolean
  showInterno: boolean
  bundlePadre: boolean
  onRenombrar: () => void
  onPrecio: () => void
  onEliminar: () => void
  onAgregarItem: () => void
  onEditarItem: (item: CotizacionItem) => void
  onEliminarItem: (item: CotizacionItem) => void
  onSoltarItem: (e: React.DragEvent) => void
  onSoltarSobreItem: (e: React.DragEvent, item: CotizacionItem) => void
  onSubir?: () => void
  onBajar?: () => void
  onMoverItemPuesto: (item: CotizacionItem, dir: -1 | 1) => void
  copiado: { tipo: 'item' | 'grupo'; etiqueta: string } | null
  onCopiarItem: (item: CotizacionItem) => void
  onPegarItem: () => void
  seleccionId: string | null
  onSeleccionarItem: (item: CotizacionItem) => void
}

function SgBlock({
  sg, depId, editable, showInterno, bundlePadre,
  onRenombrar, onPrecio, onEliminar, onAgregarItem,
  onEditarItem, onEliminarItem, onSoltarItem, onSoltarSobreItem,
  onSubir, onBajar, onMoverItemPuesto, copiado, onCopiarItem, onPegarItem, seleccionId, onSeleccionarItem,
}: SgBlockProps) {
  const subtotal = subtotalSubgrupo(sg)
  const bundle = bundlePadre || sg.precio_manual != null
  const [over, setOver] = useState(false)

  return (
    <div
      onDragOver={editable ? (e => { e.preventDefault(); e.stopPropagation(); setOver(true) }) : undefined}
      onDragLeave={editable ? (() => setOver(false)) : undefined}
      onDrop={editable ? (e => { e.preventDefault(); e.stopPropagation(); setOver(false); onSoltarItem(e) }) : undefined}
      className={over ? 'ring-1 ring-inset ring-ch-green/60 bg-ch-green/5' : ''}
    >
      {/* Header sub-grupo */}
      <div className="flex items-center justify-between px-4 py-2 bg-ch-dark/20">
        <div className="flex items-center gap-2">
          <Flechas onSubir={onSubir} onBajar={onBajar} que={`el sub-grupo ${sg.nombre}`} />
          <span className="font-body text-xs font-semibold text-ch-cream/80">{sg.nombre}</span>
          {sg.precio_manual != null && (
            <span className="font-body text-[9px] text-ch-green bg-ch-green/10 px-1.5 py-0.5 rounded uppercase tracking-wider">bundle</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-ch-cream">{formatCLP(subtotal)}</span>
          {editable && (
            <div className="flex items-center gap-1">
              <button onClick={onAgregarItem} className="font-body text-[10px] text-ch-muted hover:text-ch-cream transition-colors px-1.5 py-0.5 rounded hover:bg-ch-border/20 ch-press">
                + ítem
              </button>
              {copiado?.tipo === 'item' && (
                <button onClick={onPegarItem} title={`Pegar «${copiado.etiqueta}» acá`} className="font-body text-[10px] text-ch-green hover:text-ch-green-light transition-colors px-1.5 py-0.5 rounded hover:bg-ch-green/10 ch-press">
                  pegar ítem
                </button>
              )}
              <button onClick={onPrecio} title="Precio del bundle" className={`font-body text-[10px] px-1 transition-colors ${sg.precio_manual != null ? 'text-ch-green hover:text-ch-green-light' : 'text-ch-muted hover:text-ch-cream'} ch-press`}>$</button>
              <button onClick={onRenombrar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 ch-press">✎</button>
              <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 px-1 ch-press">✕</button>
            </div>
          )}
        </div>
      </div>
      {/* Ítems del sub-grupo */}
      {(sg.items ?? []).map((item, i, todos) => (
        <ItemRow
          key={item.id}
          item={item}
          onSubir={i > 0 ? () => onMoverItemPuesto(item, -1) : undefined}
          onBajar={i < todos.length - 1 ? () => onMoverItemPuesto(item, 1) : undefined}
          onSoltarSobre={e => onSoltarSobreItem(e, item)}
          onCopiar={() => onCopiarItem(item)}
          seleccionado={seleccionId === item.id}
          onSeleccionar={() => onSeleccionarItem(item)}
          editable={editable}
          showInterno={showInterno}
          indent={true}
          bundle={bundle}
          depId={depId}
          sgId={sg.id}
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
  depId: string
  sgId?: string
  onEditar: () => void
  onEliminar: () => void
  onSubir?: () => void
  onBajar?: () => void
  onSoltarSobre: (e: React.DragEvent) => void
  onCopiar: () => void
  seleccionado: boolean
  onSeleccionar: () => void
}

function ItemRow({ item, editable, showInterno, indent, bundle, depId, sgId, onEditar, onEliminar, onSubir, onBajar, onSoltarSobre, onCopiar, seleccionado, onSeleccionar }: ItemRowProps) {
  const [encima, setEncima] = useState(false)
  const subtotal = subtotalItem(item)
  const costo = Math.round(item.precio_bruto * item.cantidad * item.dias)
  const margen = subtotal - costo

  return (
    <div
      draggable={editable}
      onDragStart={e => {
        e.dataTransfer.setData('application/json', JSON.stringify({ itemId: item.id, fromDep: depId, fromSg: sgId ?? null }))
        e.dataTransfer.effectAllowed = 'move'
      }}
      // Soltar SOBRE un ítem = dejarlo justo antes. stopPropagation para que no
      // lo reciba además el grupo, que lo mandaría al final.
      onDragOver={editable ? (e => { e.preventDefault(); e.stopPropagation(); setEncima(true) }) : undefined}
      onDragLeave={editable ? (() => setEncima(false)) : undefined}
      onDrop={editable ? (e => { e.preventDefault(); e.stopPropagation(); setEncima(false); onSoltarSobre(e) }) : undefined}
      onClick={e => { e.stopPropagation(); onSeleccionar() }}
      className={`flex items-start justify-between py-2 pr-4 hover:bg-ch-border/5 group ${indent ? 'pl-8' : 'pl-4'} ${editable ? 'cursor-grab active:cursor-grabbing' : ''} border-t ${encima ? 'border-ch-green' : 'border-transparent'} border-l-2 ${seleccionado ? 'border-l-ch-green bg-ch-surface/30' : 'border-l-transparent'}`}
    >
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <Flechas onSubir={onSubir} onBajar={onBajar} que={item.nombre} />
          {editable && (
            <span className="font-body text-[10px] text-ch-border group-hover:text-ch-muted shrink-0 select-none" title="Arrastra para mover">⠿</span>
          )}
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
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button onClick={onCopiar} title="Copiar ítem (para pegarlo en esta u otra cotización)" className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 ch-press">⧉</button>
          {editable && (
            <>
              <button onClick={onEditar} className="font-body text-[10px] text-ch-muted hover:text-ch-cream px-1 ch-press">✎</button>
              <button onClick={onEliminar} className="font-body text-[10px] text-ch-muted hover:text-red-400 px-1 ch-press">✕</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
