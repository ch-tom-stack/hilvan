'use client'

import { useState, useMemo } from 'react'
import type { Equipo, CategoriaEquipo } from '@/types'

interface ItemCarrito {
  equipo: Equipo & { categoria?: CategoriaEquipo }
  cantidad: number
}

interface Props {
  equipos: (Equipo & { categoria?: CategoriaEquipo })[]
  categorias: CategoriaEquipo[]
}

export default function CatalogoCliente({ equipos, categorias }: Props) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [jornadas, setJornadas] = useState(1)
  const [carritoAbierto, setCarritoAbierto] = useState(false)

  // Filtro client-side
  const equiposFiltrados = useMemo(() =>
    categoriaActiva
      ? equipos.filter(e => e.categoria_codigo === categoriaActiva)
      : equipos,
    [equipos, categoriaActiva]
  )

  // Solo categorías con equipos rentables
  const categoriasConEquipos = useMemo(() =>
    categorias.filter(c => equipos.some(e => e.categoria_codigo === c.codigo)),
    [categorias, equipos]
  )

  // Cantidad en carrito de un equipo
  const cantidadEnCarrito = (id: string) =>
    carrito.find(i => i.equipo.id === id)?.cantidad ?? 0

  const agregarAlCarrito = (eq: Equipo & { categoria?: CategoriaEquipo }) => {
    setCarrito(prev => {
      const existe = prev.find(i => i.equipo.id === eq.id)
      if (existe) return prev.map(i => i.equipo.id === eq.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { equipo: eq, cantidad: 1 }]
    })
    setCarritoAbierto(true)
  }

  const quitarDelCarrito = (id: string) => {
    setCarrito(prev => {
      const item = prev.find(i => i.equipo.id === id)
      if (!item) return prev
      if (item.cantidad <= 1) return prev.filter(i => i.equipo.id !== id)
      return prev.map(i => i.equipo.id === id ? { ...i, cantidad: i.cantidad - 1 } : i)
    })
  }

  const eliminarDelCarrito = (id: string) =>
    setCarrito(prev => prev.filter(i => i.equipo.id !== id))

  // Totales
  const totalJornada = carrito.reduce((sum, item) => {
    const precio = item.equipo.precio_jornada ?? 0
    return sum + precio * item.cantidad
  }, 0)
  const totalGeneral = totalJornada * jornadas
  const hayPreciosAConsultar = carrito.some(i => !i.equipo.precio_jornada || i.equipo.precio_jornada === 0)
  const totalItems = carrito.reduce((sum, i) => sum + i.cantidad, 0)

  // Generar mailto con el carrito
  const generarMailto = () => {
    const lineas = carrito.map(i => {
      const precio = i.equipo.precio_jornada && i.equipo.precio_jornada > 0
        ? `$${(i.equipo.precio_jornada * i.cantidad).toLocaleString('es-CL')} / jornada`
        : 'precio a consultar'
      return `- ${i.equipo.nombre}${i.cantidad > 1 ? ` (x${i.cantidad})` : ''} — ${precio}`
    }).join('\n')

    const resumen = totalGeneral > 0
      ? `\n\nTotal estimado: $${totalGeneral.toLocaleString('es-CL')} (${jornadas} jornada${jornadas > 1 ? 's' : ''})`
      : ''

    const body = `Hola, me interesa arrendar los siguientes equipos:\n\n${lineas}${resumen}\n\nJornadas: ${jornadas}\nFechas: \n\nGracias`
    return `mailto:rental@casahiedra.com?subject=Solicitud%20de%20arriendo%20de%20equipos&body=${encodeURIComponent(body)}`
  }

  return (
    <div className="pb-48 lg:pb-0">

      {/* Filtros */}
      {categoriasConEquipos.length > 1 && (
        <div className="flex gap-2 mb-10 flex-wrap">
          <button
            onClick={() => setCategoriaActiva(null)}
            className={`px-4 py-2 font-body text-xs border transition-colors ${
              !categoriaActiva
                ? 'border-ch-green text-ch-cream bg-ch-surface'
                : 'border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted'
            }`}
          >
            Todos
          </button>
          {categoriasConEquipos.map(cat => (
            <button
              key={cat.codigo}
              onClick={() => setCategoriaActiva(cat.codigo)}
              className={`px-4 py-2 font-body text-xs border transition-colors ${
                categoriaActiva === cat.codigo
                  ? 'border-ch-green text-ch-cream bg-ch-surface'
                  : 'border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted'
              }`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {equiposFiltrados.length === 0 ? (
        <div className="border border-dashed border-ch-border p-20 text-center">
          <p className="font-body text-sm text-ch-muted mb-1">
            No hay equipos disponibles{categoriaActiva ? ' en esta categoría' : ''}.
          </p>
          <p className="font-body text-xs text-ch-subtle">Contáctanos para consultar disponibilidad.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {equiposFiltrados.map(eq => {
            const disponible = eq.estado === 'disponible'
            const enCarrito = cantidadEnCarrito(eq.id)

            return (
              <div
                key={eq.id}
                className={`border bg-ch-surface/30 overflow-hidden transition-colors flex flex-col ${
                  disponible
                    ? enCarrito > 0
                      ? 'border-ch-green'
                      : 'border-ch-border hover:bg-ch-surface/60'
                    : 'border-ch-border opacity-50'
                }`}
              >
                {/* Imagen */}
                {eq.fotos?.[0] || eq.foto_url ? (
                  <div className="relative">
                    <img
                      src={(eq.fotos?.[0] || eq.foto_url)!}
                      alt={eq.nombre}
                      className="w-full h-52 object-cover"
                    />
                    {!disponible && (
                      <div className="absolute top-3 left-3 bg-ch-black/80 border border-ch-border px-2 py-1">
                        <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-gold">No disponible</span>
                      </div>
                    )}
                    {enCarrito > 0 && (
                      <div className="absolute top-3 right-3 bg-ch-green text-ch-black w-6 h-6 flex items-center justify-center font-body text-xs font-bold">
                        {enCarrito}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative w-full h-52 bg-ch-surface flex items-center justify-center">
                    <span className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-subtle">Sin foto</span>
                    {!disponible && (
                      <div className="absolute top-3 left-3 bg-ch-black/80 border border-ch-border px-2 py-1">
                        <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-gold">No disponible</span>
                      </div>
                    )}
                    {enCarrito > 0 && (
                      <div className="absolute top-3 right-3 bg-ch-green text-ch-black w-6 h-6 flex items-center justify-center font-body text-xs font-bold">
                        {enCarrito}
                      </div>
                    )}
                  </div>
                )}

                {/* Info */}
                <div className="p-5 flex flex-col flex-1">
                  <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">
                    {eq.codigo}{eq.categoria?.nombre ? ` · ${eq.categoria.nombre}` : ''}
                  </p>
                  <h3 className="font-display italic text-xl text-ch-cream mb-1 leading-tight">
                    {eq.nombre}
                  </h3>
                  {(eq.marca || eq.modelo) && (
                    <p className="font-body text-xs text-ch-subtle mb-2">
                      {[eq.marca, eq.modelo].filter(Boolean).join(' ')}
                    </p>
                  )}
                  {eq.descripcion && (
                    <p className="font-body text-xs text-ch-muted leading-relaxed mb-3 line-clamp-2">
                      {eq.descripcion}
                    </p>
                  )}
                  <p className="font-body text-xs text-ch-muted mb-4">
                    {eq.precio_jornada && eq.precio_jornada > 0
                      ? `$${eq.precio_jornada.toLocaleString('es-CL')} / jornada`
                      : 'Precio a consultar'}
                  </p>

                  {/* Botones carrito */}
                  <div className="mt-auto">
                    {disponible ? (
                      enCarrito === 0 ? (
                        <button
                          onClick={() => agregarAlCarrito(eq)}
                          className="w-full font-body text-[9px] tracking-[0.35em] uppercase py-2.5 border border-ch-border text-ch-muted hover:border-ch-green hover:text-ch-green transition-colors"
                        >
                          + Agregar
                        </button>
                      ) : (
                        <div className="flex items-center border border-ch-green">
                          <button
                            onClick={() => quitarDelCarrito(eq.id)}
                            className="px-4 py-2.5 text-ch-green hover:bg-ch-green/10 transition-colors font-body text-sm"
                          >
                            −
                          </button>
                          <span className="flex-1 text-center font-body text-xs text-ch-cream">
                            {enCarrito}
                          </span>
                          <button
                            onClick={() => agregarAlCarrito(eq)}
                            className="px-4 py-2.5 text-ch-green hover:bg-ch-green/10 transition-colors font-body text-sm"
                          >
                            +
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="w-full py-2.5 border border-dashed border-ch-border text-center">
                        <span className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-subtle">No disponible</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Panel carrito — desktop: lateral fijo | mobile: bottom sheet */}
      {carrito.length > 0 && (
        <>
          {/* Mobile: barra inferior siempre visible */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-ch-border bg-ch-dark">
            <button
              onClick={() => setCarritoAbierto(!carritoAbierto)}
              className="w-full flex items-center justify-between px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <span className="bg-ch-green text-ch-black font-body text-xs font-bold w-6 h-6 flex items-center justify-center">
                  {totalItems}
                </span>
                <span className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-cream">
                  Ver selección
                </span>
              </div>
              <span className="font-body text-sm text-ch-green">
                {totalGeneral > 0
                  ? `$${totalGeneral.toLocaleString('es-CL')}`
                  : 'A consultar'}
                <span className="text-ch-muted text-xs ml-1">↑</span>
              </span>
            </button>

            {carritoAbierto && (
              <div className="border-t border-ch-border px-5 pb-5 pt-4 max-h-[60vh] overflow-y-auto">
                <ResumenCarrito
                  carrito={carrito}
                  jornadas={jornadas}
                  setJornadas={setJornadas}
                  totalJornada={totalJornada}
                  totalGeneral={totalGeneral}
                  hayPreciosAConsultar={hayPreciosAConsultar}
                  onEliminar={eliminarDelCarrito}
                  onSolicitar={generarMailto}
                />
              </div>
            )}
          </div>

          {/* Desktop: panel lateral sticky */}
          <div className="hidden lg:block fixed top-0 right-0 h-full w-80 border-l border-ch-border bg-ch-dark z-40 overflow-y-auto">
            <div className="p-6 pt-8">
              <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted mb-6">
                Selección — {totalItems} {totalItems === 1 ? 'equipo' : 'equipos'}
              </p>
              <ResumenCarrito
                carrito={carrito}
                jornadas={jornadas}
                setJornadas={setJornadas}
                totalJornada={totalJornada}
                totalGeneral={totalGeneral}
                hayPreciosAConsultar={hayPreciosAConsultar}
                onEliminar={eliminarDelCarrito}
                onSolicitar={generarMailto}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ResumenCarrito({
  carrito,
  jornadas,
  setJornadas,
  totalJornada,
  totalGeneral,
  hayPreciosAConsultar,
  onEliminar,
  onSolicitar,
}: {
  carrito: ItemCarrito[]
  jornadas: number
  setJornadas: (n: number) => void
  totalJornada: number
  totalGeneral: number
  hayPreciosAConsultar: boolean
  onEliminar: (id: string) => void
  onSolicitar: () => string
}) {
  return (
    <div className="space-y-4">
      {/* Items */}
      <div className="space-y-3">
        {carrito.map(item => (
          <div key={item.equipo.id} className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-body text-xs text-ch-cream leading-snug truncate">
                {item.equipo.nombre}
                {item.cantidad > 1 && (
                  <span className="text-ch-muted ml-1">×{item.cantidad}</span>
                )}
              </p>
              <p className="font-body text-[10px] text-ch-muted">
                {item.equipo.precio_jornada && item.equipo.precio_jornada > 0
                  ? `$${(item.equipo.precio_jornada * item.cantidad).toLocaleString('es-CL')} / jornada`
                  : 'A consultar'}
              </p>
            </div>
            <button
              onClick={() => onEliminar(item.equipo.id)}
              className="text-ch-subtle hover:text-ch-muted transition-colors font-body text-xs shrink-0 mt-0.5"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Jornadas */}
      <div className="border-t border-ch-border pt-4">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-3">
          Jornadas
        </p>
        <div className="flex items-center border border-ch-border">
          <button
            onClick={() => setJornadas(Math.max(1, jornadas - 1))}
            className="px-4 py-2 text-ch-muted hover:text-ch-cream transition-colors font-body text-sm"
          >
            −
          </button>
          <span className="flex-1 text-center font-body text-sm text-ch-cream">{jornadas}</span>
          <button
            onClick={() => setJornadas(jornadas + 1)}
            className="px-4 py-2 text-ch-muted hover:text-ch-cream transition-colors font-body text-sm"
          >
            +
          </button>
        </div>
      </div>

      {/* Total */}
      <div className="border-t border-ch-border pt-4 space-y-1.5">
        {totalJornada > 0 && jornadas > 1 && (
          <div className="flex justify-between">
            <span className="font-body text-xs text-ch-muted">Por jornada</span>
            <span className="font-body text-xs text-ch-muted">
              ${totalJornada.toLocaleString('es-CL')}
            </span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted">
            Total {jornadas > 1 ? `(${jornadas} jornadas)` : ''}
          </span>
          <span className="font-display italic text-2xl text-ch-cream">
            {totalGeneral > 0
              ? `$${totalGeneral.toLocaleString('es-CL')}`
              : '—'}
          </span>
        </div>
        {hayPreciosAConsultar && (
          <p className="font-body text-[10px] text-ch-gold">
            * Algunos equipos tienen precio a consultar
          </p>
        )}
      </div>

      {/* CTA */}
      <a
        href={onSolicitar()}
        className="block text-center font-body text-[10px] tracking-[0.4em] uppercase px-5 py-3.5 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors"
      >
        Solicitar cotización →
      </a>
    </div>
  )
}
