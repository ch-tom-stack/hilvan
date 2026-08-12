'use client'

import { useState, useMemo, useTransition } from 'react'
import { eliminarInversion } from '@/app/actions/inversiones'
import { momento } from '@/lib/momentos'
import { formatCLP, CATEGORIAS_INVERSION } from '@/types'
import type { Inversion, CategoriaInversion } from '@/types'
import FormularioInversion from './FormularioInversion'

interface Props {
  inversiones: Inversion[]
}

const ORDEN_CATEGORIAS: CategoriaInversion[] = [
  'equipo_audiovisual',
  'vehiculo',
  'software',
  'consultoria',
  'otro',
]

function formatFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}

export default function ListaInversiones({ inversiones: inicial }: Props) {
  const añoActual = new Date().getFullYear()
  const años = useMemo(() => {
    const set = new Set<number>()
    inicial.forEach(i => set.add(parseInt(i.fecha_compra.slice(0, 4))))
    set.add(añoActual)
    return Array.from(set).sort((a, b) => b - a)
  }, [inicial, añoActual])

  const [lista, setLista] = useState<Inversion[]>(inicial)
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaInversion | 'todas'>('todas')
  const [filtroAño, setFiltroAño] = useState<number>(añoActual)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [inversionEditando, setInversionEditando] = useState<Inversion | null>(null)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ─── Filtrado ─────────────────────────────────────────────────────────────

  const filtradas = useMemo(() => {
    return lista.filter(inv => {
      if (filtroCategoria !== 'todas' && inv.categoria !== filtroCategoria) return false
      const año = parseInt(inv.fecha_compra.slice(0, 4))
      if (año !== filtroAño) return false
      return true
    })
  }, [lista, filtroCategoria, filtroAño])

  // Agrupar por categoría
  const porCategoria = useMemo(() => {
    const groups = new Map<CategoriaInversion, Inversion[]>()
    for (const cat of ORDEN_CATEGORIAS) {
      const items = filtradas.filter(i => i.categoria === cat)
      if (items.length > 0) groups.set(cat, items)
    }
    return groups
  }, [filtradas])

  const total = filtradas.reduce((acc, i) => acc + i.monto, 0)

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function abrirNueva() {
    setInversionEditando(null)
    setModalAbierto(true)
  }

  function abrirEditar(inv: Inversion) {
    setInversionEditando(inv)
    setModalAbierto(true)
  }

  function cerrarModal() {
    setModalAbierto(false)
    setInversionEditando(null)
  }

  function onGuardado(inv: Inversion) {
    setLista(prev => {
      const existe = prev.find(i => i.id === inv.id)
      if (existe) return prev.map(i => i.id === inv.id ? inv : i)
      return [inv, ...prev]
    })
    cerrarModal()
  }

  function confirmarEliminar(id: string) {
    setConfirmandoEliminar(id)
  }

  function cancelarEliminar() {
    setConfirmandoEliminar(null)
  }

  function ejecutarEliminar(id: string) {
    startTransition(async () => {
      const res = await eliminarInversion(id)
      momento('item.eliminado')
      if (!res.error) {
        setLista(prev => prev.filter(i => i.id !== id))
        setConfirmandoEliminar(null)
      }
    })
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  const labelCls = 'font-body text-[10px] tracking-[0.35em] uppercase text-ch-muted'

  return (
    <div>
      {/* Controles superiores */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro categoría */}
          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value as CategoriaInversion | 'todas')}
            className="bg-transparent border border-ch-border text-ch-muted font-body text-[10px] tracking-[0.3em] uppercase px-3 py-2 focus:outline-none focus:border-ch-cream transition-colors"
          >
            <option value="todas">Todas las categorías</option>
            {ORDEN_CATEGORIAS.map(cat => (
              <option key={cat} value={cat}>{CATEGORIAS_INVERSION[cat]}</option>
            ))}
          </select>

          {/* Filtro año */}
          <select
            value={filtroAño}
            onChange={e => setFiltroAño(Number(e.target.value))}
            className="bg-transparent border border-ch-border text-ch-muted font-body text-[10px] tracking-[0.3em] uppercase px-3 py-2 focus:outline-none focus:border-ch-cream transition-colors"
          >
            {años.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <button
          onClick={abrirNueva}
          className="border border-ch-cream text-ch-cream hover:bg-ch-cream hover:text-ch-dark font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors ch-press"
        >
          + Nueva inversión
        </button>
      </div>

      {/* Modal crear / editar */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-ch-dark border border-ch-border p-8 overflow-y-auto max-h-[85vh]">
            <p className={`${labelCls} mb-2`}>
              {inversionEditando ? 'Editar inversión' : 'Nueva inversión'}
            </p>
            <FormularioInversion
              inversion={inversionEditando ?? undefined}
              onGuardado={onGuardado}
              onCancelar={cerrarModal}
            />
          </div>
        </div>
      )}

      {/* Tabla por categorías */}
      {porCategoria.size === 0 ? (
        <p className="text-ch-muted font-body text-sm text-center py-16">
          No hay inversiones registradas para este período.
        </p>
      ) : (
        <div className="space-y-10">
          {ORDEN_CATEGORIAS.filter(cat => porCategoria.has(cat)).map(cat => {
            const items = porCategoria.get(cat)!
            const subtotal = items.reduce((acc, i) => acc + i.monto, 0)

            return (
              <div key={cat}>
                {/* Header categoría */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <span className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted">
                      {CATEGORIAS_INVERSION[cat]}
                    </span>
                    <div className="h-px flex-1 bg-ch-border w-16" />
                  </div>
                  <span className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted">
                    Subtotal: {formatCLP(subtotal)}
                  </span>
                </div>

                {/* Filas */}
                <div className="border border-ch-border divide-y divide-ch-border">
                  {items.map(inv => (
                    <div key={inv.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                      {confirmandoEliminar === inv.id ? (
                        /* Confirmar eliminar inline */
                        <div className="flex items-center gap-3">
                          <span className="text-ch-muted font-body text-xs flex-1">
                            ¿Eliminar <strong className="text-ch-cream">{inv.descripcion}</strong>?
                          </span>
                          <button
                            onClick={() => ejecutarEliminar(inv.id)}
                            disabled={isPending}
                            className="border border-red-400 text-red-400 hover:bg-red-400 hover:text-ch-dark font-body text-[10px] tracking-widest uppercase px-3 py-1 transition-colors disabled:opacity-50 ch-press"
                          >
                            Sí
                          </button>
                          <button
                            onClick={cancelarEliminar}
                            className="text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-widest uppercase transition-colors ch-press"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        /* Fila normal */
                        <div className="flex items-start gap-4 flex-wrap lg:flex-nowrap">
                          {/* Fecha */}
                          <span className="text-ch-muted font-body text-xs w-24 shrink-0 pt-0.5">
                            {formatFecha(inv.fecha_compra)}
                          </span>

                          {/* Descripción + proveedor */}
                          <div className="flex-1 min-w-0">
                            <p className="text-ch-cream font-body text-sm leading-snug">
                              {inv.descripcion}
                            </p>
                            {inv.proveedor && (
                              <p className="text-ch-muted font-body text-xs mt-0.5">
                                {inv.proveedor}
                                {inv.rut_proveedor && <span className="ml-1 opacity-60">· {inv.rut_proveedor}</span>}
                              </p>
                            )}
                            {inv.notas && (
                              <p className="text-ch-muted/70 font-body text-xs mt-0.5 italic">
                                {inv.notas}
                              </p>
                            )}
                          </div>

                          {/* Monto */}
                          <span className="text-ch-cream font-body text-sm w-28 text-right shrink-0 pt-0.5">
                            {formatCLP(inv.monto)}
                          </span>

                          {/* Doc + crédito fiscal */}
                          <div className="flex flex-col items-end gap-1 w-36 shrink-0">
                            {inv.tipo_documento === 'factura' && (
                              <span className="font-body text-[9px] tracking-widest uppercase text-ch-muted border border-ch-border px-1.5 py-0.5">
                                Factura
                              </span>
                            )}
                            {inv.factura_casa_hiedra && (
                              <span className="font-body text-[9px] tracking-widest uppercase text-green-400 border border-green-400/30 px-1.5 py-0.5">
                                Crédito fiscal
                              </span>
                            )}
                            {inv.tipo_documento === 'sin_documento' && (
                              <span className="font-body text-[9px] tracking-widest uppercase text-ch-muted/60 border border-ch-border/40 px-1.5 py-0.5">
                                Sin doc
                              </span>
                            )}
                          </div>

                          {/* Tratamiento */}
                          <div className="w-28 shrink-0 text-right">
                            <span className={`font-body text-[9px] tracking-widest uppercase px-1.5 py-0.5 border ${
                              inv.tratamiento_contable === 'activo_fijo'
                                ? 'text-amber-400 border-amber-400/30'
                                : 'text-ch-muted border-ch-border/40'
                            }`}>
                              {inv.tratamiento_contable === 'activo_fijo' ? 'Activo fijo' : 'Gasto directo'}
                            </span>
                          </div>

                          {/* Comprobante */}
                          <div className="w-8 shrink-0 text-center pt-0.5">
                            {inv.comprobante_url ? (
                              <a
                                href={inv.comprobante_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Ver comprobante"
                                className="text-ch-muted hover:text-ch-cream transition-colors text-sm"
                              >
                                📎
                              </a>
                            ) : (
                              <span className="text-ch-subtle text-sm">—</span>
                            )}
                          </div>

                          {/* Acciones */}
                          <div className="flex items-center gap-3 shrink-0 pt-0.5">
                            <button
                              onClick={() => abrirEditar(inv)}
                              className="text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-widest uppercase transition-colors ch-press"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => confirmarEliminar(inv.id)}
                              className="text-ch-muted hover:text-red-400 font-body text-[10px] tracking-widest uppercase transition-colors ch-press"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Total general */}
          <div className="border-t border-ch-border pt-4 flex justify-between items-center">
            <span className="font-body text-[10px] tracking-[0.45em] uppercase text-ch-muted">
              Total del período {filtroAño}
              {filtroCategoria !== 'todas' && ` · ${CATEGORIAS_INVERSION[filtroCategoria]}`}
            </span>
            <span className="font-display italic text-2xl text-ch-cream">
              {formatCLP(total)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
