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

  const carritoActivo = carrito.length > 0

  const equiposFiltrados = useMemo(
    () => categoriaActiva ? equipos.filter(e => e.categoria_codigo === categoriaActiva) : equipos,
    [equipos, categoriaActiva]
  )

  const categoriasConEquipos = useMemo(
    () => categorias.filter(c => equipos.some(e => e.categoria_codigo === c.codigo)),
    [categorias, equipos]
  )

  const cantidadEnCarrito = (id: string) => carrito.find(i => i.equipo.id === id)?.cantidad ?? 0

  const agregar = (eq: Equipo & { categoria?: CategoriaEquipo }) => {
    setCarrito(prev => {
      const existe = prev.find(i => i.equipo.id === eq.id)
      if (existe) return prev.map(i => i.equipo.id === eq.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { equipo: eq, cantidad: 1 }]
    })
  }

  const quitar = (id: string) => {
    setCarrito(prev => {
      const item = prev.find(i => i.equipo.id === id)
      if (!item) return prev
      if (item.cantidad <= 1) return prev.filter(i => i.equipo.id !== id)
      return prev.map(i => i.equipo.id === id ? { ...i, cantidad: i.cantidad - 1 } : i)
    })
  }

  const eliminar = (id: string) => setCarrito(prev => prev.filter(i => i.equipo.id !== id))

  const totalJornada = carrito.reduce((s, i) => s + (i.equipo.precio_jornada ?? 0) * i.cantidad, 0)
  const totalGeneral = totalJornada * jornadas
  const hayConsultar = carrito.some(i => !i.equipo.precio_jornada || i.equipo.precio_jornada === 0)
  const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0)

  return (
    /* Layout: una sola columna sin carrito, dos columnas con carrito */
    <div className={`transition-all duration-300 ${
      carritoActivo
        ? 'lg:grid lg:grid-cols-[1fr_300px] lg:gap-10 lg:items-start'
        : 'max-w-6xl mx-auto'
    }`}>

      {/* Columna principal */}
      <div>
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
                    !disponible
                      ? 'border-ch-border opacity-50'
                      : enCarrito > 0
                        ? 'border-ch-green'
                        : 'border-ch-border hover:bg-ch-surface/60'
                  }`}
                >
                  {/* Imagen */}
                  <div className="relative">
                    {eq.fotos?.[0] || eq.foto_url ? (
                      <img
                        src={(eq.fotos?.[0] || eq.foto_url)!}
                        alt={eq.nombre}
                        className="w-full h-52 object-cover"
                      />
                    ) : (
                      <div className="w-full h-52 bg-ch-surface flex items-center justify-center">
                        <span className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-subtle">Sin foto</span>
                      </div>
                    )}
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

                  {/* Info */}
                  <div className="p-5 flex flex-col flex-1">
                    <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-1">
                      {eq.codigo}{eq.categoria?.nombre ? ` · ${eq.categoria.nombre}` : ''}
                    </p>
                    <h3 className="font-display italic text-xl text-ch-cream mb-1 leading-tight">{eq.nombre}</h3>
                    {(eq.marca || eq.modelo) && (
                      <p className="font-body text-xs text-ch-subtle mb-2">{[eq.marca, eq.modelo].filter(Boolean).join(' ')}</p>
                    )}
                    {eq.descripcion && (
                      <p className="font-body text-xs text-ch-muted leading-relaxed mb-3 line-clamp-2">{eq.descripcion}</p>
                    )}
                    <p className="font-body text-xs text-ch-muted mb-4">
                      {eq.precio_jornada && eq.precio_jornada > 0
                        ? `$${eq.precio_jornada.toLocaleString('es-CL')} / jornada`
                        : 'Precio a consultar'}
                    </p>

                    <div className="mt-auto">
                      {disponible ? (
                        enCarrito === 0 ? (
                          <button
                            onClick={() => agregar(eq)}
                            className="w-full font-body text-[9px] tracking-[0.35em] uppercase py-2.5 border border-ch-border text-ch-muted hover:border-ch-green hover:text-ch-green transition-colors"
                          >
                            + Agregar
                          </button>
                        ) : (
                          <div className="flex items-center border border-ch-green">
                            <button onClick={() => quitar(eq.id)} className="px-4 py-2.5 text-ch-green hover:bg-ch-green/10 transition-colors font-body text-sm">−</button>
                            <span className="flex-1 text-center font-body text-xs text-ch-cream">{enCarrito}</span>
                            <button onClick={() => agregar(eq)} className="px-4 py-2.5 text-ch-green hover:bg-ch-green/10 transition-colors font-body text-sm">+</button>
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

        {/* CTA estático */}
        <div className="mt-16 border border-ch-border bg-ch-surface/20 p-10 text-center">
          <p className="font-body text-[9px] tracking-[0.5em] uppercase text-ch-muted mb-4">¿Necesitas algo específico?</p>
          <h2 className="font-display italic text-3xl text-ch-cream mb-3 leading-none">Escríbenos</h2>
          <p className="font-body text-sm text-ch-muted mb-6 max-w-sm mx-auto leading-relaxed">
            Agrega equipos a tu selección para calcular el total, o contáctanos directamente.
          </p>
          <a
            href="mailto:rental@casahiedra.com?subject=Consulta%20arriendo%20de%20equipos"
            className="inline-block font-body text-[10px] tracking-[0.4em] uppercase px-8 py-3.5 border border-ch-border text-ch-muted hover:text-ch-cream hover:border-ch-muted transition-colors"
          >
            rental@casahiedra.com
          </a>
        </div>
      </div>

      {/* Panel lateral — solo desktop, solo con carrito */}
      {carritoActivo && (
        <div className="hidden lg:block sticky top-6">
          <PanelCarrito
            carrito={carrito}
            jornadas={jornadas}
            setJornadas={setJornadas}
            totalJornada={totalJornada}
            totalGeneral={totalGeneral}
            hayConsultar={hayConsultar}
            totalItems={totalItems}
            onEliminar={eliminar}
          />
        </div>
      )}

      {/* Bottom bar — solo mobile, solo con carrito */}
      {carritoActivo && (
        <MobileCarrito
          carrito={carrito}
          jornadas={jornadas}
          setJornadas={setJornadas}
          totalJornada={totalJornada}
          totalGeneral={totalGeneral}
          hayConsultar={hayConsultar}
          totalItems={totalItems}
          onEliminar={eliminar}
        />
      )}
    </div>
  )
}

/* ─── Panel de carrito compartido ─── */

interface PanelProps {
  carrito: ItemCarrito[]
  jornadas: number
  setJornadas: (n: number) => void
  totalJornada: number
  totalGeneral: number
  hayConsultar: boolean
  totalItems: number
  onEliminar: (id: string) => void
}

function ContenidoCarrito({ carrito, jornadas, setJornadas, totalJornada, totalGeneral, hayConsultar, onEliminar }: PanelProps) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enviar = async () => {
    if (!nombre.trim() || !email.trim()) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/arriendo/cotizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          email,
          mensaje,
          jornadas,
          equipos: carrito.map(i => ({
            nombre: i.equipo.nombre,
            codigo: i.equipo.codigo,
            cantidad: i.cantidad,
            precio_jornada: i.equipo.precio_jornada ?? null,
          })),
        }),
      })
      if (!res.ok) throw new Error()
      setEnviado(true)
    } catch {
      setError('No se pudo enviar. Escríbenos a rental@casahiedra.com')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <p className="font-body text-[9px] tracking-[0.45em] uppercase text-ch-muted">
        Selección · {carrito.reduce((s, i) => s + i.cantidad, 0)} {carrito.reduce((s, i) => s + i.cantidad, 0) === 1 ? 'equipo' : 'equipos'}
      </p>

      {/* Items */}
      <div className="space-y-3">
        {carrito.map(item => (
          <div key={item.equipo.id} className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-body text-xs text-ch-cream leading-snug">
                {item.equipo.nombre}
                {item.cantidad > 1 && <span className="text-ch-muted ml-1">×{item.cantidad}</span>}
              </p>
              <p className="font-body text-[10px] text-ch-muted">
                {item.equipo.precio_jornada && item.equipo.precio_jornada > 0
                  ? `$${(item.equipo.precio_jornada * item.cantidad).toLocaleString('es-CL')} / jornada`
                  : 'A consultar'}
              </p>
            </div>
            <button onClick={() => onEliminar(item.equipo.id)} className="text-ch-subtle hover:text-ch-muted transition-colors font-body text-xs shrink-0 mt-0.5">✕</button>
          </div>
        ))}
      </div>

      {/* Jornadas */}
      <div className="border-t border-ch-border pt-4">
        <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted mb-2">Jornadas</p>
        <div className="flex items-center border border-ch-border">
          <button onClick={() => setJornadas(Math.max(1, jornadas - 1))} className="px-4 py-2 text-ch-muted hover:text-ch-cream transition-colors font-body text-sm">−</button>
          <span className="flex-1 text-center font-body text-sm text-ch-cream">{jornadas}</span>
          <button onClick={() => setJornadas(jornadas + 1)} className="px-4 py-2 text-ch-muted hover:text-ch-cream transition-colors font-body text-sm">+</button>
        </div>
      </div>

      {/* Total */}
      <div className="border-t border-ch-border pt-4 space-y-1">
        {totalJornada > 0 && jornadas > 1 && (
          <div className="flex justify-between">
            <span className="font-body text-xs text-ch-muted">Por jornada</span>
            <span className="font-body text-xs text-ch-muted">${totalJornada.toLocaleString('es-CL')}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-muted">
            Total{jornadas > 1 ? ` (${jornadas}j)` : ''}
          </span>
          <span className="font-display italic text-2xl text-ch-cream">
            {totalJornada > 0 ? `$${totalGeneral.toLocaleString('es-CL')}` : '—'}
          </span>
        </div>
        {hayConsultar && (
          <p className="font-body text-[10px] text-ch-gold">* Algunos precios a confirmar</p>
        )}
      </div>

      {/* Formulario o confirmación */}
      <div className="border-t border-ch-border pt-4">
        {enviado ? (
          <div className="bg-ch-green/10 border border-ch-green/30 p-4 text-center space-y-1">
            <p className="font-body text-sm text-ch-cream">✓ Solicitud enviada</p>
            <p className="font-body text-xs text-ch-muted">Revisa tu correo. Te respondemos a la brevedad.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted">Solicitar cotización</p>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Tu nombre"
              className="w-full bg-ch-dark border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green"
            />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Tu correo"
              className="w-full bg-ch-dark border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green"
            />
            <textarea
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              placeholder="Fechas u otras notas (opcional)"
              rows={2}
              className="w-full bg-ch-dark border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-subtle focus:outline-none focus:border-ch-green resize-none"
            />
            {error && <p className="font-body text-[11px] text-ch-gold">{error}</p>}
            <button
              onClick={enviar}
              disabled={enviando || !nombre.trim() || !email.trim()}
              className="w-full font-body text-[10px] tracking-[0.4em] uppercase px-5 py-3 bg-ch-green text-ch-black hover:bg-ch-green-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enviando ? 'Enviando…' : 'Enviar solicitud →'}
            </button>
          </div>
        )}
      </div>

      {/* Contacto directo */}
      <div className="border-t border-ch-border pt-4 text-center">
        <p className="font-body text-[9px] tracking-[0.3em] uppercase text-ch-subtle mb-1">O escríbenos directamente</p>
        <a href="mailto:rental@casahiedra.com" className="font-body text-xs text-ch-muted hover:text-ch-green transition-colors">
          rental@casahiedra.com
        </a>
      </div>
    </div>
  )
}

function PanelCarrito(props: PanelProps) {
  return (
    <div className="border border-ch-border bg-ch-surface/30 p-6">
      <ContenidoCarrito {...props} />
    </div>
  )
}

function MobileCarrito(props: PanelProps) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-ch-border bg-ch-dark">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <span className="bg-ch-green text-ch-black font-body text-xs font-bold w-6 h-6 flex items-center justify-center">
            {props.totalItems}
          </span>
          <span className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-cream">Ver selección</span>
        </div>
        <span className="font-body text-sm text-ch-green">
          {props.totalGeneral > 0 ? `$${props.totalGeneral.toLocaleString('es-CL')}` : 'A consultar'}
          <span className="text-ch-muted text-xs ml-1">{abierto ? '↓' : '↑'}</span>
        </span>
      </button>
      {abierto && (
        <div className="border-t border-ch-border px-5 pb-6 pt-4 max-h-[70vh] overflow-y-auto">
          <ContenidoCarrito {...props} />
        </div>
      )}
    </div>
  )
}
