'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import type { Equipo, CategoriaEquipo } from '@/types'
import { diasArriendoInclusive, calcularArriendoWeb, ARRIENDO_MINIMO, formatCLP } from '@/lib/cotizaciones-calc'

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
interface Props { equipos: EquipoRental[]; categorias: CategoriaEquipo[]; kits?: EquipoRental[]; camion?: EquipoRental | null }

// Valor suelto de referencia por kit (para mostrar el ahorro tachado vs. el pack).
const SUELTO: Record<string, number> = {
  'CH-KIT-001': 313000, 'CH-KIT-002': 345000, 'CH-KIT-003': 116000,
  'CH-KIT-004': 179000, 'CH-KIT-006': 492000, 'CH-ILU-012': 46000, 'CH-CAMION': 950000,
}
// URL del video del camión. Cuando exista, se activa el botón "Ver el camión".
const VIDEO_CAMION = ''
// Manifiesto descriptivo del camión (lo que carga).
const CAMION_CARGA: { h: string; it: string[] }[] = [
  { h: 'Cámaras', it: ['Sony A7S III', 'Sony A7 IV'] },
  { h: 'Óptica · G Master', it: ['14 · 24 · 35', '50 · 85 · 90'] },
  { h: 'Luces', it: ['Nanlux 1200B + fresnel', 'Nanlite Forza 720B', '2× Nanlux 150C', 'Pack Godox (2×SL150 + SL300 + ML100)', 'Aputure Spotlight'] },
  { h: 'Movimiento', it: ['DJI Ronin RS2', 'Edelkrone slider', 'Follow Focus DJI (LiDAR)', 'Trípodes'] },
  { h: 'Grip / soportes', it: ['6 C-stands · 4 barras', '1 pie faena heavy-duty', '6 pie de foco', '7 pesas · 2 apple box', 'Yegua/carro · escalera'] },
  { h: 'Difusión', it: ['Tamizador 4×4 (→ 2× 2×2) con silks', '4 telas negras', '6 banderas'] },
  { h: 'Monitores', it: ['Atomos Ninja', 'Seetec', 'Hollyland Mars', 'LCD cliente (extra)'] },
  { h: 'Cables · audio', it: ['10× extensión 10 m', 'Cable HDMI 10 m', 'Lav Lark Max'] },
]

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CatalogoCliente({ equipos, categorias, kits = [], camion = null }: Props) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [bloqueos, setBloqueos] = useState<Record<string, number>>({})
  const [kitDetalle, setKitDetalle] = useState<EquipoRental | null>(null)
  const [videoOpen, setVideoOpen] = useState(false)

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
    const calc = calcularArriendoWeb(neto)
    const hayConsultar = carrito.some((i) => !i.equipo.precio_jornada || i.equipo.precio_jornada === 0)
    const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0)
    return { neto, ...calc, hayConsultar, totalItems }
  }, [carrito, dias])

  const panelProps = { carrito, desde, hasta, dias, cotizacion, onEliminar: eliminar }

  return (
    <>
      {/* ── Camión (hero) ── */}
      {camion && (
        <CamionHero
          camion={camion}
          enCarrito={cantidadEnCarrito(camion.id) > 0}
          onAdd={() => agregar(camion)}
          onVer={() => setVideoOpen(true)}
        />
      )}

      {/* ── Banda de kits y packs ── */}
      {kits.length > 0 && (
        <KitsBand
          kits={kits}
          carrito={carrito}
          onDetalle={setKitDetalle}
          onAdd={agregar}
        />
      )}

    <div style={carritoActivo
      ? { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 36, alignItems: 'start' }
      : {}}
      className={carritoActivo ? 'ch-arriendo-grid' : ''}
    >
      {/* ── Columna principal ── */}
      <div>
        {(camion || kits.length > 0) && (
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 16px' }}>Equipo individual</h2>
        )}
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

      {/* ── Modal de detalle de kit ── */}
      {kitDetalle && (
        <KitModal
          kit={kitDetalle}
          enCarrito={cantidadEnCarrito(kitDetalle.id) > 0}
          onAdd={() => { agregar(kitDetalle); setKitDetalle(null) }}
          onClose={() => setKitDetalle(null)}
        />
      )}

      {/* ── Modal de video del camión ── */}
      {videoOpen && VIDEO_CAMION && <VideoModal onClose={() => setVideoOpen(false)} />}
    </>
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
  cotizacion: {
    neto: number; minimoOk: boolean; promoActiva: boolean; promoPct: number; volumenPct: number
    descuentoPct: number; descuentoMonto: number; iva: number; total: number
    consultar: boolean; hayConsultar: boolean; totalItems: number
  }
  onEliminar: (id: string) => void
}

function ContenidoCarrito({ carrito, desde, hasta, dias, cotizacion, onEliminar }: PanelProps) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [numero, setNumero] = useState('')

  const puedeEnviar = !!nombre.trim() && EMAIL_RE.test(email.trim()) && carrito.length > 0 && dias > 0 && cotizacion.minimoOk && estado !== 'enviando'

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
        {cotizacion.descuentoPct > 0 && (
          <Fila
            etq={cotizacion.promoPct > 0 && cotizacion.volumenPct > 0
              ? `Promo 30% + volumen ${cotizacion.volumenPct}%`
              : cotizacion.promoPct > 0
                ? 'Promo Julio–Agosto 30%'
                : `Descuento volumen ${cotizacion.volumenPct}%`}
            val={`− ${formatCLP(cotizacion.descuentoMonto)}`}
          />
        )}
        <Fila etq="IVA 19%" val={formatCLP(cotizacion.iva)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: TINTA, fontWeight: 600 }}>Total</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: TINTA }}>{cotizacion.neto > 0 ? formatCLP(cotizacion.total) : '—'}</span>
        </div>
        {cotizacion.promoPct > 0 && (
          <p style={{ fontSize: 11, color: ROJO, margin: '8px 0 0', fontWeight: 500 }}>✓ Promo Julio–Agosto aplicada (−30% sobre $500.000).</p>
        )}
        {cotizacion.neto > 0 && !cotizacion.minimoOk && (
          <p style={{ fontSize: 11, color: ROJO, margin: '8px 0 0' }}>Arriendo mínimo {formatCLP(ARRIENDO_MINIMO)} neto — agrega equipos o jornadas.</p>
        )}
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

/* ── Camión (hero) ── */
const kick: React.CSSProperties = { fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: OPACO, margin: '0 0 8px' }

function CamionHero({ camion, enCarrito, onAdd, onVer }: {
  camion: EquipoRental; enCarrito: boolean; onAdd: () => void; onVer: () => void
}) {
  const precio = camion.precio_jornada ?? 0
  const suelto = SUELTO[camion.codigo]
  const foto = camion.fotos?.[0] || camion.foto_url
  return (
    <div style={{ border: `1px solid ${LINEA}`, borderRadius: 2, overflow: 'hidden', marginBottom: 30 }}>
      <div className="ch-camion-hero" style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 26, padding: '26px 28px 20px', alignItems: 'center' }}>
        <div>
          <p style={kick}>Casa Hiedra · Rental</p>
          <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.02, margin: '0 0 8px' }}>Camión Completo</h2>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Shineray T32 · doble cabina · encarrozado cerrado</p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: OPACO, margin: '6px 0 16px' }}>Una producción entera en un solo arriendo: cámaras, óptica, luces grandes, grip, monitores y movimiento — llega todo en el camión.</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontSize: 30, fontWeight: 800 }}>{formatCLP(precio)}</b>
            <span style={{ fontSize: 14, color: OPACO }}>/ jornada</span>
          </div>
          {suelto ? <p style={{ fontSize: 12, color: OPACO, margin: '2px 0 0' }}><s style={{ color: GRIS }}>{formatCLP(suelto)}</s> suelto</p> : null}
          <p style={{ fontSize: 12.5, color: OPACO, margin: '10px 0 16px', lineHeight: 1.45 }}>Incluye <b style={{ color: TINTA }}>asistente de gaffer que conduce</b> + hasta <b style={{ color: TINTA }}>$25.000</b> en bencina.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button onClick={onAdd} style={{ background: enCarrito ? TINTA : ROJO, color: '#fff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.13em', fontSize: 12.5, padding: '12px 22px', border: 'none', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit' }}>
              {enCarrito ? '✓ En tu cotización' : 'Cotizar el camión'}
            </button>
            {VIDEO_CAMION ? (
              <button onClick={onVer} style={{ background: 'none', border: 'none', color: TINTA, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
                <span style={{ width: 22, height: 22, border: `1px solid ${TINTA}`, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>▶</span> Ver el camión
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <div style={{ background: FONDO_SUAVE, borderRadius: 2, padding: 14 }}>
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto} alt="Camión Casa Hiedra" style={{ width: '100%', display: 'block', borderRadius: 2 }} />
            ) : <TruckSVG />}
          </div>
          {!foto && <p style={{ fontSize: 10.5, letterSpacing: '0.04em', color: '#9a978f', textAlign: 'center', margin: '8px 0 0' }}>Ilustración provisional — se reemplaza por la foto real del camión</p>}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${LINEA_SUAVE}`, padding: '18px 28px 24px' }}>
        <p style={{ ...kick, marginBottom: 14 }}>Lo que carga</p>
        <div className="ch-carga-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px 22px' }}>
          {CAMION_CARGA.map((c) => (
            <div key={c.h}>
              <h4 style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: ROJO, margin: '0 0 6px', fontWeight: 700 }}>{c.h}</h4>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {c.it.map((x, i) => <li key={i} style={{ fontSize: 12, color: TINTA, lineHeight: 1.55 }}>{x}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <style>{`@media (max-width:640px){ .ch-camion-hero{ grid-template-columns:1fr !important; } .ch-carga-grid{ grid-template-columns:repeat(2,1fr) !important; } }`}</style>
    </div>
  )
}

function TruckSVG() {
  return (
    <svg viewBox="0 0 520 250" role="img" aria-label="Camión Shineray T32 doble cabina con encarrozado cerrado y rin sobre la cabina" style={{ display: 'block', width: '100%', height: 'auto' }}>
      <line x1="34" y1="210" x2="492" y2="210" stroke="#0A0A0A22" strokeWidth="2" />
      <path d="M250,206 L250,100 L360,100 L398,152 L446,154 L446,206 Z" fill="#fff" stroke="#0A0A0A" strokeWidth="3" />
      <rect x="262" y="108" width="44" height="30" fill="#ECEAE6" stroke="#0A0A0A" strokeWidth="1.5" />
      <rect x="312" y="108" width="40" height="30" fill="#ECEAE6" stroke="#0A0A0A" strokeWidth="1.5" />
      <path d="M360,108 L392,148 L360,148 Z" fill="#ECEAE6" stroke="#0A0A0A" strokeWidth="1.5" />
      <line x1="308" y1="138" x2="308" y2="206" stroke="#0A0A0A" strokeWidth="1.5" />
      <line x1="282" y1="150" x2="294" y2="150" stroke="#0A0A0A" strokeWidth="2" />
      <line x1="320" y1="150" x2="332" y2="150" stroke="#0A0A0A" strokeWidth="2" />
      <rect x="430" y="156" width="16" height="20" fill="#E4E2DE" stroke="#0A0A0A" strokeWidth="1.5" />
      <line x1="430" y1="163" x2="446" y2="163" stroke="#0A0A0A" strokeWidth="1" />
      <line x1="430" y1="169" x2="446" y2="169" stroke="#0A0A0A" strokeWidth="1" />
      <rect x="431" y="178" width="15" height="9" fill="#ECEAE6" stroke="#0A0A0A" strokeWidth="1.5" />
      <rect x="443" y="188" width="9" height="16" fill="#fff" stroke="#0A0A0A" strokeWidth="2" />
      <circle cx="437" cy="198" r="2.5" fill="#C11700" />
      <path d="M42,206 L42,50 L344,50 L344,100 L250,100 L250,206 Z" fill="#fff" stroke="#0A0A0A" strokeWidth="3" />
      <line x1="42" y1="66" x2="344" y2="66" stroke="#0A0A0A" strokeWidth="1.5" />
      <line x1="250" y1="66" x2="250" y2="100" stroke="#0A0A0A22" strokeWidth="1.5" />
      <line x1="58" y1="66" x2="58" y2="206" stroke="#0A0A0A22" strokeWidth="1.5" />
      <circle cx="50" cy="150" r="3" fill="#0A0A0A" />
      <circle cx="146" cy="120" r="15" fill="#C11700" />
      <text x="146" y="124" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">CH</text>
      <text x="146" y="152" textAnchor="middle" fontSize="10" letterSpacing="1.5" fontWeight="700" fill="#0A0A0A">CASA HIEDRA</text>
      <line x1="42" y1="206" x2="446" y2="206" stroke="#0A0A0A" strokeWidth="2" />
      <circle cx="118" cy="206" r="30" fill="#fff" stroke="#0A0A0A" strokeWidth="4" />
      <circle cx="118" cy="206" r="11" fill="#0A0A0A" />
      <circle cx="118" cy="206" r="4" fill="#C11700" />
      <circle cx="392" cy="206" r="30" fill="#fff" stroke="#0A0A0A" strokeWidth="4" />
      <circle cx="392" cy="206" r="11" fill="#0A0A0A" />
      <circle cx="392" cy="206" r="4" fill="#C11700" />
    </svg>
  )
}

/* ── Banda de kits ── */
function KitsBand({ kits, carrito, onDetalle, onAdd }: {
  kits: EquipoRental[]; carrito: ItemCarrito[]; onDetalle: (k: EquipoRental) => void; onAdd: (k: EquipoRental) => void
}) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 4px' }}>Kits y packs</h2>
      <p style={{ fontSize: 13, color: OPACO, margin: '0 0 16px' }}>Paquetes armados con descuento sobre el valor suelto.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {kits.map((k) => (
          <KitCard key={k.id} kit={k} enCarrito={carrito.some((i) => i.equipo.id === k.id)} onDetalle={() => onDetalle(k)} onAdd={() => onAdd(k)} />
        ))}
      </div>
    </div>
  )
}

// Íconos placeholder por kit (mientras no haya foto). Se muestran cuando el kit no tiene imagen.
function kitIcon(codigo: string): React.ReactNode {
  const p = { width: 76, height: 76, viewBox: '0 0 100 100', fill: 'none', stroke: TINTA, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (codigo) {
    case 'CH-KIT-001': // Maleta de Cámara — estuche + 2 cámaras + lentes
      return (
        <svg {...p}>
          <path d="M42 24 v-4 h16 v4" /><path d="M14 34 v-6 a4 4 0 0 1 4 -4 h64 a4 4 0 0 1 4 4 v6" />
          <rect x="14" y="34" width="72" height="50" rx="4" />
          <rect x="22" y="45" width="24" height="15" rx="2" /><circle cx="34" cy="52" r="4.5" /><circle cx="34" cy="52" r="1.8" fill={ROJO} stroke="none" />
          <rect x="54" y="45" width="24" height="15" rx="2" /><circle cx="66" cy="52" r="4.5" />
          <circle cx="30" cy="72" r="6" /><circle cx="50" cy="72" r="6" /><circle cx="70" cy="72" r="6" />
        </svg>
      )
    case 'CH-KIT-002': // Entrevista — 2 cámaras sobre trípodes
      return (
        <svg {...p}>
          <path d="M30 47 L19 84 M30 47 L30 82 M30 47 L41 84" />
          <rect x="20" y="30" width="20" height="14" rx="2" /><circle cx="30" cy="37" r="4.2" /><circle cx="30" cy="37" r="1.7" fill={ROJO} stroke="none" />
          <path d="M70 47 L59 84 M70 47 L70 82 M70 47 L81 84" />
          <rect x="60" y="30" width="20" height="14" rx="2" /><circle cx="70" cy="37" r="4.2" />
        </svg>
      )
    case 'CH-KIT-003': // Lentes Athena — 5 lentes
      return (
        <svg {...p}>
          <circle cx="30" cy="60" r="15" /><circle cx="30" cy="60" r="6.5" fill={ROJO} stroke="none" />
          <circle cx="56" cy="62" r="12.5" /><circle cx="56" cy="62" r="5.5" />
          <circle cx="76" cy="58" r="10.5" /><circle cx="76" cy="58" r="4.5" />
          <circle cx="44" cy="34" r="10" /><circle cx="44" cy="34" r="4" />
          <circle cx="66" cy="34" r="8.5" /><circle cx="66" cy="34" r="3.5" />
        </svg>
      )
    case 'CH-KIT-004': // Luz 3 Puntos — luz en C-stand + paño negro
      return (
        <svg {...p}>
          <path d="M32 44 v38 M22 86 L32 78 L42 86" />
          <rect x="20" y="26" width="24" height="18" rx="2" /><line x1="18" y1="24" x2="13" y2="19" /><line x1="46" y1="24" x2="51" y2="19" />
          <circle cx="34" cy="35" r="2.2" fill={ROJO} stroke="none" />
          <line x1="56" y1="24" x2="88" y2="24" /><rect x="61" y="26" width="22" height="38" rx="1" fill={TINTA} stroke="none" />
        </svg>
      )
    case 'CH-KIT-006': // Producto — producto + luz
      return (
        <svg {...p}>
          <rect x="15" y="20" width="22" height="16" rx="2" /><line x1="30" y1="36" x2="45" y2="55" />
          <line x1="20" y1="76" x2="80" y2="76" />
          <rect x="45" y="57" width="24" height="19" rx="2" /><path d="M45 57 l6 -5 h24 l-6 5" /><path d="M69 57 l6 -5 v19 l-6 5" />
          <circle cx="21" cy="24" r="2.6" fill={ROJO} stroke="none" />
        </svg>
      )
    case 'CH-ILU-012': // Pack Godox — foco COB con olla
      return (
        <svg {...p}>
          <path d="M44 36 L22 26 L22 66 L44 56 Z" /><rect x="44" y="38" width="22" height="16" rx="2" />
          <line x1="16" y1="30" x2="9" y2="25" /><line x1="14" y1="46" x2="6" y2="46" /><line x1="16" y1="62" x2="9" y2="67" />
          <path d="M66 46 v30 M56 80 L66 72 L76 80" /><circle cx="55" cy="46" r="2.4" fill={ROJO} stroke="none" />
        </svg>
      )
    default:
      return null
  }
}

function KitCard({ kit, enCarrito, onDetalle, onAdd }: {
  kit: EquipoRental; enCarrito: boolean; onDetalle: () => void; onAdd: () => void
}) {
  const precio = kit.precio_jornada ?? 0
  const suelto = SUELTO[kit.codigo]
  const foto = kit.fotos?.[0] || kit.foto_url
  return (
    <div style={{ border: `1px solid ${enCarrito ? TINTA : LINEA}`, borderRadius: 2, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt={kit.nombre} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ aspectRatio: '4 / 3', background: FONDO_SUAVE, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          {kitIcon(kit.codigo) ?? <span style={{ fontSize: 13, fontWeight: 700, color: '#B9B6B0', textAlign: 'center', lineHeight: 1.3 }}>{kit.nombre}</span>}
        </div>
      )}
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: ROJO, margin: '0 0 4px', fontWeight: 700 }}>Kit</p>
        <h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, margin: '0 0 4px' }}>{kit.nombre}</h3>
        <p style={{ fontSize: 12, color: OPACO, margin: '0 0 10px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{kit.descripcion}</p>
        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16, fontWeight: 800 }}>{formatCLP(precio)}</b>
            <span style={{ fontSize: 11, color: OPACO }}>/ jornada</span>
            {suelto ? <s style={{ fontSize: 11, color: GRIS }}>{formatCLP(suelto)}</s> : null}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onDetalle} style={{ flex: 1, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px', cursor: 'pointer', border: `1px solid ${TINTA}`, borderRadius: 2, background: '#fff', color: TINTA, fontFamily: 'inherit' }}>Detalle</button>
            <button onClick={onAdd} style={{ flex: 1, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px', cursor: 'pointer', border: 'none', borderRadius: 2, background: enCarrito ? TINTA : ROJO, color: '#fff', fontFamily: 'inherit' }}>{enCarrito ? '✓ Agregado' : 'Agregar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function KitModal({ kit, enCarrito, onAdd, onClose }: {
  kit: EquipoRental; enCarrito: boolean; onAdd: () => void; onClose: () => void
}) {
  const precio = kit.precio_jornada ?? 0
  const suelto = SUELTO[kit.codigo]
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 2, maxWidth: 460, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '24px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: ROJO, margin: '0 0 4px', fontWeight: 700 }}>Kit · Casa Hiedra</p>
            <h3 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{kit.nombre}</h3>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: OPACO, lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
        </div>
        <p style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: OPACO, margin: '18px 0 8px' }}>Incluye</p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: TINTA, margin: 0, whiteSpace: 'pre-wrap' }}>{kit.descripcion}</p>
        <div style={{ borderTop: `1px solid ${LINEA_SUAVE}`, marginTop: 18, paddingTop: 16, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 26, fontWeight: 800 }}>{formatCLP(precio)}</b>
          <span style={{ fontSize: 13, color: OPACO }}>/ jornada</span>
          {suelto ? <s style={{ fontSize: 13, color: GRIS }}>{formatCLP(suelto)} suelto</s> : null}
        </div>
        <button onClick={onAdd} style={{ marginTop: 16, width: '100%', background: enCarrito ? TINTA : ROJO, color: '#fff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.13em', fontSize: 12.5, padding: '13px', border: 'none', borderRadius: 2, cursor: 'pointer', fontFamily: 'inherit' }}>
          {enCarrito ? '✓ En tu cotización' : 'Agregar a la cotización'}
        </button>
      </div>
    </div>
  )
}

function VideoModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 900 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', marginBottom: 8, fontFamily: 'inherit' }}>Cerrar ✕</button>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={VIDEO_CAMION} controls autoPlay style={{ width: '100%', display: 'block' }} />
      </div>
    </div>
  )
}
