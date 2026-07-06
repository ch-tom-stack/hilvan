'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import type { Equipo, CategoriaEquipo } from '@/types'
import { diasArriendoInclusive, descuentoVolumen, formatCLP } from '@/lib/cotizaciones-calc'

const ROJO = '#C11700'
const TINTA = '#0A0A0A'
const OPACO = '#353135'
const LINEA = '#0A0A0A22'
const LINEA_SUAVE = '#0A0A0A14'
const GRIS = '#B9B6B0'
const FONDO_SUAVE = '#F4F2EE'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const label: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 500, color: OPACO, display: 'block', marginBottom: 5 }
const input: React.CSSProperties = { width: '100%', fontSize: 14, padding: '8px 10px', border: `1px solid ${LINEA}`, borderRadius: 2, background: '#fff', color: TINTA, outline: 'none', fontFamily: 'inherit' }

interface EquipoRental extends Equipo { categoria?: CategoriaEquipo }
interface ItemCarrito { equipo: EquipoRental; cantidad: number }
interface Props { equipos: EquipoRental[]; categorias: CategoriaEquipo[] }

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CatalogoCliente({ equipos, categorias }: Props) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [bloqueos, setBloqueos] = useState<Record<string, number>>({})

  // Fechas por defecto: hoy → hoy (1 jornada). En efecto para evitar mismatch de hidratación.
  useEffect(() => {
    const h = hoyISO()
    setDesde(h)
    setHasta(h)
  }, [])

  const dias = desde && hasta ? diasArriendoInclusive(desde, hasta) : 0

  // Disponibilidad: consulta reservas confirmadas que se solapan con el rango.
  useEffect(() => {
    if (!desde || !hasta || hasta < desde) { setBloqueos({}); return }
    let cancelado = false
    fetch(`/api/arriendo/disponibilidad?desde=${desde}&hasta=${hasta}`)
      .then((r) => (r.ok ? r.json() : { bloqueos: {} }))
      .then((d) => { if (!cancelado) setBloqueos(d?.bloqueos ?? {}) })
      .catch(() => { if (!cancelado) setBloqueos({}) })
    return () => { cancelado = true }
  }, [desde, hasta])

  const stockLibre = useCallback((eq: EquipoRental) => {
    const stock = eq.cantidad ?? 1
    return Math.max(0, stock - (bloqueos[eq.id] ?? 0))
  }, [bloqueos])

  const equiposFiltrados = useMemo(() => {
    let lista = categoriaActiva ? equipos.filter((e) => e.categoria_codigo === categoriaActiva) : equipos
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      lista = lista.filter((e) =>
        e.nombre.toLowerCase().includes(q) ||
        e.marca?.toLowerCase().includes(q) ||
        e.modelo?.toLowerCase().includes(q) ||
        e.descripcion?.toLowerCase().includes(q),
      )
    }
    return lista
  }, [equipos, categoriaActiva, busqueda])

  const categoriasConEquipos = useMemo(
    () => categorias.filter((c) => equipos.some((e) => e.categoria_codigo === c.codigo)),
    [categorias, equipos],
  )

  const cantidadEnCarrito = (id: string) => carrito.find((i) => i.equipo.id === id)?.cantidad ?? 0

  const agregar = (eq: EquipoRental) => {
    const tope = Math.min(eq.cantidad ?? 1, stockLibre(eq) || (eq.cantidad ?? 1))
    setCarrito((prev) => {
      const existe = prev.find((i) => i.equipo.id === eq.id)
      if (existe) {
        if (existe.cantidad >= tope) return prev
        return prev.map((i) => (i.equipo.id === eq.id ? { ...i, cantidad: i.cantidad + 1 } : i))
      }
      return [...prev, { equipo: eq, cantidad: 1 }]
    })
  }
  const quitar = (id: string) => setCarrito((prev) => {
    const item = prev.find((i) => i.equipo.id === id)
    if (!item) return prev
    if (item.cantidad <= 1) return prev.filter((i) => i.equipo.id !== id)
    return prev.map((i) => (i.equipo.id === id ? { ...i, cantidad: i.cantidad - 1 } : i))
  })
  const eliminar = (id: string) => setCarrito((prev) => prev.filter((i) => i.equipo.id !== id))

  const carritoActivo = carrito.length > 0

  const cotizacion = useMemo(() => {
    const netoPorJornada = carrito.reduce((s, i) => s + (i.equipo.precio_jornada ?? 0) * i.cantidad, 0)
    const neto = netoPorJornada * dias
    const { pct, consultar } = descuentoVolumen(neto)
    const descuentoMonto = Math.round(neto * pct / 100)
    const netoConDescuento = neto - descuentoMonto
    const iva = Math.round(netoConDescuento * 0.19)
    const total = netoConDescuento + iva
    const hayConsultar = carrito.some((i) => !i.equipo.precio_jornada || i.equipo.precio_jornada === 0)
    const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0)
    return { neto, pct, consultar, descuentoMonto, iva, total, hayConsultar, totalItems }
  }, [carrito, dias])

  const panelProps = { carrito, desde, hasta, dias, cotizacion, onEliminar: eliminar }

  return (
    <div style={carritoActivo
      ? { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 36, alignItems: 'start' }
      : {}}
      className={carritoActivo ? 'ch-arriendo-grid' : ''}
    >
      {/* ── Columna principal ── */}
      <div>
        {/* Selector de fechas */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${LINEA_SUAVE}` }}>
          <div>
            <label style={label} htmlFor="desde">Retiro (desde 08:00)</label>
            <input id="desde" type="date" style={{ ...input, width: 160 }} value={desde} min={hoyISO()}
              onChange={(e) => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value) }} />
          </div>
          <div>
            <label style={label} htmlFor="hasta">Devolución (hasta 22:00)</label>
            <input id="hasta" type="date" style={{ ...input, width: 160 }} value={hasta} min={desde || hoyISO()}
              onChange={(e) => setHasta(e.target.value)} />
          </div>
          {dias > 0 && (
            <p style={{ fontSize: 13, color: OPACO, margin: '0 0 9px' }}>
              <strong style={{ color: TINTA }}>{dias}</strong> {dias === 1 ? 'jornada' : 'jornadas'}
            </p>
          )}
        </div>

        {/* Buscador */}
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar equipo, marca o modelo…" style={{ ...input, marginBottom: 14 }} />

        {/* Filtros */}
        {categoriasConEquipos.length > 1 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 22 }}>
            <Chip activo={!categoriaActiva} onClick={() => setCategoriaActiva(null)}>Todos</Chip>
            {categoriasConEquipos.map((cat) => (
              <Chip key={cat.codigo} activo={categoriaActiva === cat.codigo} onClick={() => setCategoriaActiva(cat.codigo)}>{cat.nombre}</Chip>
            ))}
          </div>
        )}

        {/* Grid */}
        {equiposFiltrados.length === 0 ? (
          <div style={{ border: `1px dashed ${LINEA}`, borderRadius: 2, padding: '64px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: OPACO, margin: 0 }}>No hay equipos{categoriaActiva ? ' en esta categoría' : ''}.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {equiposFiltrados.map((eq) => (
              <Card
                key={eq.id}
                eq={eq}
                dias={dias}
                enCarrito={cantidadEnCarrito(eq.id)}
                stockLibre={stockLibre(eq)}
                bloqueado={(eq.cantidad ?? 1) - (bloqueos[eq.id] ?? 0) <= 0}
                onAgregar={() => agregar(eq)}
                onQuitar={() => quitar(eq.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Panel lateral (desktop) ── */}
      {carritoActivo && (
        <div className="ch-arriendo-panel" style={{ position: 'sticky', top: 20 }}>
          <div style={{ border: `1px solid ${LINEA}`, borderRadius: 2, padding: 20 }}>
            <ContenidoCarrito {...panelProps} />
          </div>
        </div>
      )}

      {/* ── Barra inferior (mobile) ── */}
      {carritoActivo && <MobileCarrito {...panelProps} />}

      <style>{`
        @media (max-width: 900px) {
          .ch-arriendo-grid { display: block !important; }
          .ch-arriendo-panel { display: none !important; }
        }
        @media (min-width: 901px) { .ch-arriendo-mobile { display: none !important; } }
      `}</style>
    </div>
  )
}

/* ── Chip de filtro ── */
function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, padding: '6px 14px', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${activo ? TINTA : LINEA}`, background: activo ? TINTA : '#fff', color: activo ? '#fff' : TINTA,
    }}>{children}</button>
  )
}

/* ── Tarjeta de equipo ── */
function Card({ eq, dias, enCarrito, stockLibre, bloqueado, onAgregar, onQuitar }: {
  eq: EquipoRental; dias: number; enCarrito: number; stockLibre: number; bloqueado: boolean
  onAgregar: () => void; onQuitar: () => void
}) {
  const foto = eq.fotos?.[0] || eq.foto_url
  // La disponibilidad real por fechas la dan las reservas (bloqueado). 'en_uso' es
  // estado interno del módulo de equipos, no bloquea un arriendo futuro; sólo
  // mantención / pendiente de compra se muestran como fuera de servicio.
  const fueraServicio = eq.estado === 'en_mantenimiento' || eq.estado === 'pendiente_compra'
  const noDisponible = fueraServicio || bloqueado
  const stockTotal = eq.cantidad ?? 1
  const topeAlcanzado = enCarrito >= Math.min(stockTotal, stockLibre || stockTotal)

  return (
    <div style={{
      border: `1px solid ${enCarrito > 0 ? TINTA : LINEA}`, borderRadius: 2, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', background: '#fff', opacity: noDisponible ? 0.62 : 1,
    }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: FONDO_SUAVE }}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt={eq.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: GRIS }}>Sin foto</span>
          </div>
        )}
        {bloqueado && (
          <div style={{ position: 'absolute', top: 8, left: 8, background: ROJO, color: '#fff', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 2 }}>
            Reservado en estas fechas
          </div>
        )}
        {!bloqueado && fueraServicio && (
          <div style={{ position: 'absolute', top: 8, left: 8, background: TINTA, color: '#fff', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 2 }}>
            No disponible
          </div>
        )}
        {enCarrito > 0 && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: TINTA, color: '#fff', width: 24, height: 24, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
            {enCarrito}
          </div>
        )}
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: OPACO, margin: '0 0 4px' }}>
          {eq.codigo}{eq.categoria?.nombre ? ` · ${eq.categoria.nombre}` : ''}
        </p>
        <h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, margin: '0 0 3px', color: TINTA }}>{eq.nombre}</h3>
        {(eq.marca || eq.modelo) && (
          <p style={{ fontSize: 12, color: OPACO, margin: '0 0 6px' }}>{[eq.marca, eq.modelo].filter(Boolean).join(' ')}</p>
        )}
        <p style={{ fontSize: 14, color: TINTA, margin: '4px 0 2px', fontWeight: 500 }}>
          {eq.precio_jornada && eq.precio_jornada > 0 ? `${formatCLP(eq.precio_jornada)} / jornada` : 'Precio a consultar'}
        </p>
        {eq.precio_jornada && eq.precio_jornada > 0 && dias > 1 && (
          <p style={{ fontSize: 12, color: OPACO, margin: '0 0 4px' }}>{formatCLP(eq.precio_jornada * dias)} por {dias} jornadas</p>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 10 }}>
          {noDisponible ? (
            <div style={{ padding: '9px', border: `1px dashed ${LINEA}`, borderRadius: 2, textAlign: 'center' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: GRIS }}>
                {bloqueado ? 'No disponible en el rango' : 'Fuera de servicio'}
              </span>
            </div>
          ) : enCarrito === 0 ? (
            <button onClick={onAgregar} style={{
              width: '100%', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '9px', cursor: 'pointer',
              border: `1px solid ${TINTA}`, borderRadius: 2, background: '#fff', color: TINTA, fontFamily: 'inherit',
            }}>+ Agregar</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${TINTA}`, borderRadius: 2 }}>
              <button onClick={onQuitar} style={{ padding: '8px 14px', cursor: 'pointer', border: 'none', background: 'none', color: TINTA, fontSize: 15, fontFamily: 'inherit' }}>−</button>
              <span style={{ flex: 1, textAlign: 'center', fontSize: 14, color: TINTA }}>{enCarrito}</span>
              <button onClick={onAgregar} disabled={topeAlcanzado} style={{ padding: '8px 14px', cursor: topeAlcanzado ? 'not-allowed' : 'pointer', border: 'none', background: 'none', color: TINTA, fontSize: 15, opacity: topeAlcanzado ? 0.3 : 1, fontFamily: 'inherit' }}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Contenido del carrito / cotizador ── */
interface PanelProps {
  carrito: ItemCarrito[]
  desde: string
  hasta: string
  dias: number
  cotizacion: { neto: number; pct: number; consultar: boolean; descuentoMonto: number; iva: number; total: number; hayConsultar: boolean; totalItems: number }
  onEliminar: (id: string) => void
}

function ContenidoCarrito({ carrito, desde, hasta, dias, cotizacion, onEliminar }: PanelProps) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [numero, setNumero] = useState('')

  const puedeEnviar = !!nombre.trim() && EMAIL_RE.test(email.trim()) && carrito.length > 0 && dias > 0 && estado !== 'enviando'

  async function enviar() {
    if (!puedeEnviar) return
    setEstado('enviando'); setMsg('')
    try {
      const res = await fetch('/api/arriendo/cotizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre, email, mensaje, desde, hasta,
          equipos: carrito.map((i) => ({
            equipo_id: i.equipo.id,
            nombre: i.equipo.nombre,
            codigo: i.equipo.codigo,
            cantidad: i.cantidad,
            precio_jornada: i.equipo.precio_jornada ?? null,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setEstado('error'); setMsg(data?.error || 'No se pudo generar. Escríbenos a rental@casahiedra.com'); return }
      setNumero(data?.numero || '')
      setEstado('ok')
    } catch { setEstado('error'); setMsg('No se pudo generar. Revisa tu conexión e intenta de nuevo.') }
  }

  if (estado === 'ok') {
    return (
      <div>
        <p style={{ ...label, color: ROJO }}>Cotización {numero}</p>
        <h3 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 10px' }}>Lista</h3>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: OPACO, margin: '0 0 10px' }}>
          Te enviamos <strong style={{ color: TINTA }}>{numero}</strong> a <strong style={{ color: TINTA }}>{email}</strong>. Total estimado <strong style={{ color: TINTA }}>{formatCLP(cotizacion.total)}</strong> IVA incluido.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: OPACO, margin: 0 }}>
          Es una estimación sujeta a disponibilidad. Te escribimos para confirmar la reserva y coordinar retiro/devolución.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p style={{ ...label, marginBottom: 10 }}>Tu selección · {cotizacion.totalItems} {cotizacion.totalItems === 1 ? 'equipo' : 'equipos'}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
        {carrito.map((item) => (
          <div key={item.equipo.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, color: TINTA, margin: 0, lineHeight: 1.3 }}>
                {item.equipo.nombre}{item.cantidad > 1 && <span style={{ color: OPACO }}> ×{item.cantidad}</span>}
              </p>
              <p style={{ fontSize: 11, color: OPACO, margin: '2px 0 0' }}>
                {item.equipo.precio_jornada && item.equipo.precio_jornada > 0
                  ? `${formatCLP(item.equipo.precio_jornada * item.cantidad * (dias || 1))}${dias > 1 ? ` · ${dias}j` : ''}`
                  : 'A consultar'}
              </p>
            </div>
            <button onClick={() => onEliminar(item.equipo.id)} style={{ border: 'none', background: 'none', color: GRIS, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>✕</button>
          </div>
        ))}
      </div>

      {/* Totales */}
      <div style={{ borderTop: `1px solid ${LINEA_SUAVE}`, paddingTop: 12, marginBottom: 14 }}>
        <Fila etq="Neto" val={formatCLP(cotizacion.neto)} />
        {cotizacion.pct > 0 && <Fila etq={`Descuento volumen ${cotizacion.pct}%`} val={`− ${formatCLP(cotizacion.descuentoMonto)}`} />}
        <Fila etq="IVA 19%" val={formatCLP(cotizacion.iva)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: TINTA, fontWeight: 600 }}>Total</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: TINTA }}>{cotizacion.neto > 0 ? formatCLP(cotizacion.total) : '—'}</span>
        </div>
        {cotizacion.hayConsultar && <p style={{ fontSize: 11, color: ROJO, margin: '8px 0 0' }}>* Algunos precios a confirmar.</p>}
        {cotizacion.consultar && <p style={{ fontSize: 11, color: ROJO, margin: '8px 0 0' }}>Por este volumen consúltanos por un valor especial.</p>}
      </div>

      {/* Formulario */}
      <div style={{ borderTop: `1px solid ${LINEA_SUAVE}`, paddingTop: 14, display: 'grid', gap: 9 }}>
        <p style={label}>Generar cotización</p>
        <input style={input} placeholder="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input style={input} type="email" placeholder="Tu correo" value={email} onChange={(e) => setEmail(e.target.value)} />
        <textarea style={{ ...input, resize: 'none' }} rows={2} placeholder="Notas (opcional)" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
        {estado === 'error' && <p style={{ fontSize: 12, color: ROJO, margin: 0 }}>{msg}</p>}
        <button onClick={enviar} disabled={!puedeEnviar} style={{
          background: ROJO, color: '#fff', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.14em',
          fontSize: 13, padding: '12px 20px', borderRadius: 2, border: 'none', fontFamily: 'inherit',
          cursor: puedeEnviar ? 'pointer' : 'not-allowed', opacity: puedeEnviar ? 1 : 0.35,
        }}>
          {estado === 'enviando' ? 'Generando…' : 'Generar cotización'}
        </button>
        <p style={{ fontSize: 11, color: OPACO, textAlign: 'center', margin: 0 }}>
          O escríbenos a <a href="mailto:rental@casahiedra.com" style={{ color: TINTA }}>rental@casahiedra.com</a>
        </p>
      </div>
    </div>
  )
}

function Fila({ etq, val }: { etq: string; val: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 13, color: OPACO }}>{etq}</span>
      <span style={{ fontSize: 13, color: OPACO }}>{val}</span>
    </div>
  )
}

function MobileCarrito(props: PanelProps) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="ch-arriendo-mobile" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: '#fff', borderTop: `1px solid ${LINEA}` }}>
      <button onClick={() => setAbierto(!abierto)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: TINTA, color: '#fff', width: 24, height: 24, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{props.cotizacion.totalItems}</span>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: TINTA }}>Ver cotización</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: TINTA }}>
          {props.cotizacion.neto > 0 ? formatCLP(props.cotizacion.total) : 'A consultar'} <span style={{ color: OPACO, fontSize: 12 }}>{abierto ? '↓' : '↑'}</span>
        </span>
      </button>
      {abierto && (
        <div style={{ borderTop: `1px solid ${LINEA}`, padding: '16px 20px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
          <ContenidoCarrito {...props} />
        </div>
      )}
    </div>
  )
}
