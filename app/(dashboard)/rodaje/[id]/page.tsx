'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getRodaje, actualizarEstadoRodaje } from '@/app/actions/rodaje'
import {
  getBloques, getLocaciones, crearBloque, crearBloqueDesdePlantilla,
  guardarBloques, eliminarBloque, dividirBloque, getClima, actualizarImagenBloque,
} from '@/app/actions/rodaje-plan'
import { subirImagenBloque, eliminarImagenBloque } from '@/lib/supabase/storage-rodaje'
import {
  RodajeBloque, RodajeLocacion, RodajeEquipoTecnico, RodajeCitacion,
  EstadoRodaje, TipoBloque, PLANTILLAS_BLOQUES,
  calcularCascada, aplicarCambioTiempo, duracionTotalDia,
  minutosAHora, horaAMinutos, formatHora, resolverHoraLlamado,
  estadoCitacion, generarLinkCalendar,
} from '@/types'
import SunCalc from 'suncalc'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADO_CICLO: EstadoRodaje[] = ['borrador', 'confirmado', 'completado']
const ESTADO_CONFIG: Record<EstadoRodaje, { label: string; clase: string }> = {
  borrador:   { label: 'Borrador',   clase: 'bg-ch-surface text-ch-muted' },
  confirmado: { label: 'Confirmado', clase: 'bg-emerald-950 text-emerald-400' },
  completado: { label: 'Completado', clase: 'bg-ch-surface text-ch-subtle' },
}

const COLORES_RAPIDOS = [
  '#353135', '#C11700', '#E6E2ED', '#1a1a2e',
  '#16213e', '#0f3460', '#533483', '#2d6a4f',
  '#d62828', '#f77f00', '#fcbf49', '#eae2b7',
]

// ─── TimeInput ────────────────────────────────────────────────────────────────

function TimeInput({ value, onBlur, placeholder = '--:--', className = '' }: {
  value?: string
  onBlur: (val: string) => void
  placeholder?: string
  className?: string
}) {
  const [local, setLocal] = useState(value?.slice(0, 5) || '')
  useEffect(() => { setLocal(value?.slice(0, 5) || '') }, [value])

  const commit = () => {
    let v = local.replace(/[^\d:]/g, '')
    if (v.length === 3 && !v.includes(':')) v = '0' + v[0] + ':' + v.slice(1)
    if (v.length === 4 && !v.includes(':')) v = v.slice(0, 2) + ':' + v.slice(2)
    if (/^\d{1,2}:\d{2}$/.test(v)) {
      const [h, m] = v.split(':').map(Number)
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        const norm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        setLocal(norm)
        onBlur(norm)
        return
      }
    }
    setLocal(value?.slice(0, 5) || '')
  }

  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit() }}
      placeholder={placeholder}
      maxLength={5}
      className={`bg-transparent text-xs font-mono focus:outline-none focus:bg-ch-surface focus:rounded-[2px] px-1 ${className}`}
    />
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function RodajeCentroControl({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [rodaje, setRodaje] = useState<any>(null)
  const [bloques, setBloques] = useState<RodajeBloque[]>([])
  const [locaciones, setLocaciones] = useState<RodajeLocacion[]>([])
  const [sol, setSol] = useState<any>(null)
  const [clima, setClima] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [cambiosSinGuardar, setCambiosSinGuardar] = useState(false)
  const [mostrarPlantillas, setMostrarPlantillas] = useState(false)
  const [tabMobil, setTabMobil] = useState<'plan' | 'equipo'>('plan')
  const [creando, setCreando] = useState(false)
  const [vistaTimeline, setVistaTimeline] = useState(false)

  // Undo/Redo
  const [historia, setHistoria] = useState<RodajeBloque[][]>([])
  const [historiaIdx, setHistoriaIdx] = useState(-1)

  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bloquesRef = useRef<RodajeBloque[]>([])
  bloquesRef.current = bloques

  // Carga inicial
  const cargarTodo = useCallback(async () => {
    const [r, b, l] = await Promise.all([getRodaje(id), getBloques(id), getLocaciones(id)])
    setRodaje(r)
    setBloques(b)
    setLocaciones(l)
    setHistoria([b])
    setHistoriaIdx(0)

    if (r?.locacion_lat && r?.locacion_lng && r?.fecha) {
      const fecha = new Date(r.fecha + 'T12:00:00')
      const times = SunCalc.getTimes(fecha, r.locacion_lat, r.locacion_lng)
      const fmt = (d: Date) => new Intl.DateTimeFormat('es-CL', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago',
      }).format(d)
      setSol({
        amanecer: fmt(times.sunrise),
        atardecer: fmt(times.sunset),
        dorada_am: fmt(times.goldenHourEnd),
        dorada_pm: fmt(times.goldenHour),
      })
      getClima(r.locacion_lat, r.locacion_lng, r.fecha).then(setClima)
    }
  }, [id])

  const recargarBloques = useCallback(async () => {
    const b = await getBloques(id)
    setBloques(b)
    return b
  }, [id])

  useEffect(() => {
    cargarTodo().finally(() => setLoading(false))
  }, [cargarTodo])

  // Keyboard: Cmd+Z / Ctrl+Z undo, Cmd+Shift+Z / Ctrl+Y redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        setHistoriaIdx(prev => {
          const newIdx = prev - 1
          if (newIdx < 0) return prev
          setBloques(historia[newIdx])
          setCambiosSinGuardar(true)
          programarAutoSave()
          return newIdx
        })
      }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        setHistoriaIdx(prev => {
          const newIdx = prev + 1
          if (newIdx >= historia.length) return prev
          setBloques(historia[newIdx])
          setCambiosSinGuardar(true)
          programarAutoSave()
          return newIdx
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [historia])

  const programarAutoSave = useCallback(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(async () => {
      if (bloquesRef.current.length > 0) {
        setGuardando(true)
        try {
          await guardarBloques(id, bloquesRef.current.map(b => ({ ...b })))
          setCambiosSinGuardar(false)
        } finally {
          setGuardando(false)
        }
      }
    }, 30000)
  }, [id])

  const guardarAhora = async () => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    setGuardando(true)
    try {
      await guardarBloques(id, bloques.map(b => ({ ...b })))
      setCambiosSinGuardar(false)
    } finally {
      setGuardando(false)
    }
  }

  const actualizarBloques = useCallback((nuevos: RodajeBloque[]) => {
    setBloques(nuevos)
    setCambiosSinGuardar(true)
    // Agregar al historial (cortar el futuro si estábamos en undo)
    setHistoria(prev => {
      const cortado = prev.slice(0, historiaIdx + 1)
      return [...cortado, nuevos].slice(-50) // max 50 estados
    })
    setHistoriaIdx(prev => Math.min(prev + 1, 49))
    programarAutoSave()
  }, [historiaIdx, programarAutoSave])

  const resolverYCrear = (payload: Partial<RodajeBloque> & { titulo: string }) => {
    const bloquesRaiz = bloquesRef.current.filter(b => !b.padre_id).sort((a, b) => a.orden - b.orden)
    const cascada = calcularCascada(bloquesRaiz)
    const ultimoFin = cascada.length > 0 ? cascada[cascada.length - 1].fin_min : undefined
    const tempId = `temp-${Date.now()}`

    const bloqueOptimista: RodajeBloque = {
      id: tempId,
      rodaje_id: id,
      orden: bloquesRaiz.length,
      titulo: payload.titulo,
      tipo: payload.tipo ?? 'rodaje',
      scenes_label: payload.scenes_label,
      scenes_color: payload.scenes_color ?? '#353135',
      character_num: payload.character_num,
      dia_noche: payload.dia_noche ?? 'D',
      interior_exterior: payload.interior_exterior ?? 'I',
      locacion_id: payload.locacion_id,
      descripcion: payload.descripcion,
      nota_previa: payload.nota_previa,
      hora_inicio_fija: ultimoFin !== undefined ? minutosAHora(ultimoFin) : undefined,
      hora_fin: undefined,
      duracion_min: payload.duracion_min ?? 30,
      es_paralelo: false,
      es_anclado: false,
      visible_equipo: true,
      visible_catering: true,
      visible_extras: false,
      visible_cliente: false,
      created_at: '',
      updated_at: '',
    }

    actualizarBloques([...bloquesRef.current, bloqueOptimista])

    // Guardar cambios pendientes en paralelo sin bloquear
    if (cambiosSinGuardar) {
      const reales = bloquesRef.current.filter(b => !b.id.startsWith('temp-'))
      if (reales.length > 0) {
        guardarBloques(id, reales.map(b => ({ ...b }))).then(() => setCambiosSinGuardar(false)).catch(() => {})
      }
    }

    crearBloque(id, {
      ...payload,
      hora_inicio_fija: ultimoFin !== undefined ? minutosAHora(ultimoFin) : undefined,
      duracion_min: payload.duracion_min ?? 30,
    }).then(real => {
      const realBloque = real as RodajeBloque
      setBloques(prev => prev.map(b => b.id === tempId ? realBloque : b))
      setHistoria(prev => prev.map(snap => snap.map(b => b.id === tempId ? realBloque : b)))
    }).catch(() => {
      setBloques(prev => prev.filter(b => b.id !== tempId))
      setHistoria(prev => prev.map(snap => snap.filter(b => b.id !== tempId)))
    })
  }

  const handleCrearBloque = (payload: any) => {
    if (creando) return
    resolverYCrear({ titulo: payload.titulo, tipo: payload.tipo, duracion_min: payload.duracion_min })
  }

  const handleCrearDesdePlantilla = (label: string) => {
    if (creando) return
    const plantilla = PLANTILLAS_BLOQUES.find(p => p.label === label)
    if (!plantilla) return
    resolverYCrear({
      titulo: plantilla.titulo,
      tipo: plantilla.tipo,
      scenes_label: plantilla.label,
      scenes_color: plantilla.scenes_color,
      dia_noche: plantilla.dia_noche,
      interior_exterior: plantilla.interior_exterior,
      duracion_min: plantilla.duracion_min || 30,
    })
  }

  const cambiarEstado = async () => {
    const idx = ESTADO_CICLO.indexOf(rodaje.estado)
    const siguiente = ESTADO_CICLO[(idx + 1) % ESTADO_CICLO.length]
    await actualizarEstadoRodaje(id, siguiente)
    setRodaje((r: any) => ({ ...r, estado: siguiente }))
  }

  if (loading) return <div className="p-6 text-ch-subtle text-sm">Cargando...</div>
  if (!rodaje) return <div className="p-6 text-ch-subtle text-sm">Rodaje no encontrado.</div>

  const cfg = ESTADO_CONFIG[rodaje.estado as EstadoRodaje]
  const bloquesRaiz = bloques.filter(b => !b.padre_id).sort((a, b) => a.orden - b.orden)
  const cascada = calcularCascada(bloquesRaiz)
  const durTotal = duracionTotalDia(bloquesRaiz)
  const equipo: RodajeEquipoTecnico[] = rodaje.equipo_tecnico || []
  const callGeneral = cascada[0]?.inicio_min
  const locacionPrincipal = locaciones.find(l => l.es_principal) || locaciones[0]
  const puedeUndo = historiaIdx > 0
  const puedeRedo = historiaIdx < historia.length - 1

  const fecha = rodaje.fecha
    ? new Date(rodaje.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-ch-dark">

      {/* HEADER */}
      <div className="border-b border-ch-border px-4 lg:px-6 py-4">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <Link href="/rodaje" className="text-xs text-ch-subtle hover:text-ch-muted">← Rodajes</Link>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <h1 className="text-base font-medium text-ch-cream">{rodaje.nombre}</h1>
                {/* Estado — click cicla */}
                <button
                  onClick={cambiarEstado}
                  className={`text-xs px-2 py-0.5 rounded-full transition-colors hover:opacity-70 ${cfg.clase}`}
                  title="Click para cambiar estado"
                >
                  {cfg.label}
                </button>
                {rodaje.proyecto && <span className="text-xs text-ch-subtle">· {rodaje.proyecto.nombre}</span>}
              </div>
              {fecha && (
                <p className="text-sm text-ch-muted mt-0.5">
                  {fecha}
                  {!rodaje.fecha_confirmada && <span className="ml-2 text-amber-500 text-xs">· fecha por confirmar</span>}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Undo/Redo */}
              <div className="flex gap-1 border border-ch-border rounded-[2px]">
                <button onClick={() => {
                  if (!puedeUndo) return
                  const newIdx = historiaIdx - 1
                  setBloques(historia[newIdx])
                  setHistoriaIdx(newIdx)
                  setCambiosSinGuardar(true)
                  programarAutoSave()
                }} disabled={!puedeUndo} title="Deshacer (⌘Z)"
                  className="text-xs px-2 py-1 text-ch-subtle hover:text-ch-muted disabled:opacity-30 transition-colors">
                  ↩
                </button>
                <button onClick={() => {
                  if (!puedeRedo) return
                  const newIdx = historiaIdx + 1
                  setBloques(historia[newIdx])
                  setHistoriaIdx(newIdx)
                  setCambiosSinGuardar(true)
                  programarAutoSave()
                }} disabled={!puedeRedo} title="Rehacer (⌘⇧Z)"
                  className="text-xs px-2 py-1 text-ch-subtle hover:text-ch-muted disabled:opacity-30 transition-colors border-l border-ch-border">
                  ↪
                </button>
              </div>

              {cambiosSinGuardar ? (
                <button onClick={guardarAhora} disabled={guardando}
                  className="text-xs bg-amber-500 text-black font-medium px-3 py-1.5 rounded-[2px] hover:bg-amber-400 transition-colors disabled:opacity-50">
                  {guardando ? 'Guardando...' : '● Guardar'}
                </button>
              ) : (
                <span className="text-xs text-ch-border">✓ Guardado</span>
              )}

              {rodaje.fecha && (
                <a href={generarLinkCalendar(rodaje)} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-ch-muted border border-ch-border px-3 py-1.5 rounded-[2px] hover:border-ch-muted transition-colors">
                  + Calendario
                </a>
              )}
              <a href={`/api/rodaje/${id}/pdf`} target="_blank"
                className="text-xs text-ch-muted border border-ch-border px-3 py-1.5 rounded-[2px] hover:border-ch-muted transition-colors">
                PDF
              </a>
              <a href={`/rodaje/${id}/ver`} target="_blank"
                className="text-xs text-ch-muted border border-ch-border px-3 py-1.5 rounded-[2px] hover:border-ch-muted transition-colors">
                ↗ Ver
              </a>
              <Link href={`/rodaje/${id}/editar`} className="text-xs text-ch-subtle hover:text-ch-muted px-2">
                Editar
              </Link>
            </div>
          </div>

          {/* Info strip — fila 1: datos operativos */}
          <div className="flex items-center gap-4 mt-3 flex-wrap text-xs">
            {callGeneral !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-ch-subtle">CALL</span>
                <span className="font-medium text-ch-cream">{minutosAHora(callGeneral)}</span>
              </div>
            )}
            {locacionPrincipal && (
              <div className="flex items-center gap-1.5">
                <span className="text-ch-subtle">📍</span>
                <span className="text-ch-muted">{locacionPrincipal.nombre}</span>
              </div>
            )}
            {sol && (
              <div className="flex items-center gap-2 text-ch-muted">
                <span>↑{sol.amanecer}</span>
                <span className="text-amber-500">★{sol.dorada_am}</span>
                <span className="text-amber-500">★{sol.dorada_pm}</span>
                <span>↓{sol.atardecer}</span>
              </div>
            )}
            {clima && <span className="text-ch-muted">{clima.temp_min}°/{clima.temp_max}° · {clima.condicion}</span>}
            {durTotal > 0 && <span className="text-ch-subtle ml-auto">{Math.floor(durTotal / 60)}h {durTotal % 60}min</span>}
          </div>

          {/* Info strip — fila 2: chiste + logo cliente */}
          {(rodaje.chiste_texto || rodaje.chiste_imagen_url || rodaje.cliente_logo_url) && (
            <div className="flex items-start gap-4 mt-3 pt-3 border-t border-ch-border/30">
              {rodaje.cliente_logo_url && (
                <img src={rodaje.cliente_logo_url} alt="Logo cliente" className="h-6 w-auto object-contain opacity-80" style={{ filter: 'invert(1)' }} />
              )}
              {rodaje.chiste_imagen_url && (
                <img src={rodaje.chiste_imagen_url} alt="Chiste" className="h-8 w-auto object-contain" />
              )}
              {rodaje.chiste_texto && (
                <p className="text-xs text-ch-subtle italic leading-relaxed max-w-sm">{rodaje.chiste_texto}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TABS MÓVIL */}
      <div className="lg:hidden flex border-b border-ch-border">
        <button onClick={() => setTabMobil('plan')}
          className={`flex-1 py-2 text-xs font-medium ${tabMobil === 'plan' ? 'text-ch-cream border-b-2 border-ch-cream' : 'text-ch-subtle'}`}>
          Plan
        </button>
        <button onClick={() => setTabMobil('equipo')}
          className={`flex-1 py-2 text-xs font-medium ${tabMobil === 'equipo' ? 'text-ch-cream border-b-2 border-ch-cream' : 'text-ch-subtle'}`}>
          Equipo ({equipo.length})
        </button>
      </div>

      {/* CONTENIDO */}
      <div className="max-w-[1400px] mx-auto lg:grid lg:grid-cols-[1fr_300px]">
        <div className={`${tabMobil !== 'plan' ? 'hidden lg:block' : ''} border-r border-ch-border`}>
          <TablaPlan
            rodajeId={id}
            bloques={bloques}
            bloquesRaiz={bloquesRaiz}
            cascada={cascada}
            locaciones={locaciones}
            creando={creando}
            mostrarPlantillas={mostrarPlantillas}
            setMostrarPlantillas={setMostrarPlantillas}
            vistaTimeline={vistaTimeline}
            setVistaTimeline={setVistaTimeline}
            onActualizar={actualizarBloques}
            onCrear={handleCrearBloque}
            onCrearDesdePlantilla={handleCrearDesdePlantilla}
            onEliminar={async (bloqueId) => {
              const sinEl = bloques.filter(b => b.id !== bloqueId)
              actualizarBloques(sinEl)
              if (!bloqueId.startsWith('temp-')) await eliminarBloque(bloqueId, id)
            }}
          />
        </div>
        <div className={`${tabMobil !== 'equipo' ? 'hidden lg:block' : ''}`}>
          <PanelEquipo
            equipo={equipo}
            rodaje={rodaje}
            rodajeId={id}
            onPersonaAgregada={async () => {
              const r = await getRodaje(id)
              setRodaje(r)
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Tabla del plan ───────────────────────────────────────────────────────────

function TablaPlan({
  rodajeId, bloques, bloquesRaiz, cascada, locaciones, creando,
  mostrarPlantillas, setMostrarPlantillas,
  vistaTimeline, setVistaTimeline,
  onActualizar, onCrear, onCrearDesdePlantilla, onEliminar,
}: {
  rodajeId: string
  bloques: RodajeBloque[]
  bloquesRaiz: RodajeBloque[]
  cascada: ReturnType<typeof calcularCascada>
  locaciones: RodajeLocacion[]
  creando: boolean
  mostrarPlantillas: boolean
  setMostrarPlantillas: (v: boolean) => void
  vistaTimeline: boolean
  setVistaTimeline: (v: boolean) => void
  onActualizar: (b: RodajeBloque[]) => void
  onCrear: (p: any) => void
  onCrearDesdePlantilla: (label: string) => void
  onEliminar: (id: string) => Promise<void>
}) {
  const [visibilidadAbierta, setVisibilidadAbierta] = useState<string | null>(null)
  const [colorPickerAbierto, setColorPickerAbierto] = useState<string | null>(null)
  const [expandidoMobil, setExpandidoMobil] = useState<string | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null)
  const [subiendoImagen, setSubiendoImagen] = useState<string | null>(null)
  const plantillasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bloqueParaImagenRef = useRef<string | null>(null)

  const handleSeleccionarImagen = (bloqueId: string) => {
    bloqueParaImagenRef.current = bloqueId
    fileInputRef.current?.click()
  }

  const handleArchivoSeleccionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const bloqueId = bloqueParaImagenRef.current
    if (!file || !bloqueId) return
    e.target.value = ''
    setSubiendoImagen(bloqueId)
    try {
      const url = await subirImagenBloque(file, rodajeId, bloqueId)
      if (url) {
        await actualizarImagenBloque(bloqueId, rodajeId, url)
        onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, imagen_url: url } : b))
      }
    } finally {
      setSubiendoImagen(null)
    }
  }

  const handleEliminarImagen = async (bloqueId: string, url: string) => {
    await eliminarImagenBloque(url)
    await actualizarImagenBloque(bloqueId, rodajeId, null)
    onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, imagen_url: undefined } : b))
  }

  const actualizarCelda = (bloqueId: string, campo: string, valor: any) => {
    onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, [campo]: valor } : b))
  }

  const actualizarTiempo = (bloqueId: string, campo: 'inicio' | 'fin' | 'duracion', valorStr: string) => {
    if (!valorStr) return
    const valorMin = campo === 'duracion' ? parseInt(valorStr) : horaAMinutos(valorStr)
    if (isNaN(valorMin)) return
    onActualizar(aplicarCambioTiempo(bloques, bloqueId, campo, valorMin))
  }

  const mover = (idx: number, dir: 1 | -1) => {
    const nuevo = [...bloquesRaiz]
    const target = idx + dir
    if (target < 0 || target >= nuevo.length) return
    ;[nuevo[idx], nuevo[target]] = [nuevo[target], nuevo[idx]]
    onActualizar(bloques.map(b => {
      const pos = nuevo.findIndex(r => r.id === b.id)
      return pos !== -1 ? { ...b, orden: pos } : b
    }))
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ch-border">
        <div className="flex items-center gap-3">
          <span className="text-xs text-ch-muted uppercase tracking-wider">Plan de rodaje</span>
          <div className="flex border border-ch-border rounded-[2px] overflow-hidden">
            <button
              onClick={() => setVistaTimeline(false)}
              className={`text-xs px-2 py-0.5 transition-colors ${!vistaTimeline ? 'bg-ch-surface text-ch-cream' : 'text-ch-subtle hover:text-ch-muted'}`}
            >
              ☰ Tabla
            </button>
            <button
              onClick={() => setVistaTimeline(true)}
              className={`text-xs px-2 py-0.5 transition-colors border-l border-ch-border ${vistaTimeline ? 'bg-ch-surface text-ch-cream' : 'text-ch-subtle hover:text-ch-muted'}`}
            >
              ▬ Timeline
            </button>
          </div>
        </div>
        <div className="flex gap-2 relative" ref={plantillasRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMostrarPlantillas(!mostrarPlantillas) }}
            className="text-xs text-ch-muted border border-ch-border px-3 py-1 rounded-[2px] hover:border-ch-muted hover:text-ch-cream transition-colors"
          >
            + Plantilla
          </button>
          <button
            onClick={() => onCrear({ titulo: 'Nuevo bloque', tipo: 'rodaje', duracion_min: 30 })}
            disabled={creando}
            className="text-xs bg-ch-cream text-ch-dark font-medium px-3 py-1 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
          >
            {creando ? '...' : '+ Bloque'}
          </button>

          {mostrarPlantillas && (
            <div
              className="absolute top-8 right-0 z-30 bg-ch-surface border border-ch-border rounded-[2px] min-w-[180px]"
              onClick={e => e.stopPropagation()}
            >
              {PLANTILLAS_BLOQUES.map(p => (
                <button
                  key={p.label}
                  onClick={async () => {
                    setMostrarPlantillas(false)
                    await onCrearDesdePlantilla(p.label)
                  }}
                  disabled={creando}
                  className="w-full text-left px-3 py-2 text-sm text-ch-muted hover:bg-ch-dark transition-colors flex items-center justify-between disabled:opacity-50"
                >
                  <span>{p.label}</span>
                  {p.duracion_min > 0 && <span className="text-xs text-ch-subtle">{p.duracion_min}min</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* File input oculto para subida de imágenes */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleArchivoSeleccionado}
      />

      {/* Headers desktop */}
      <div className="hidden lg:grid border-b border-ch-border px-2 py-1.5 text-xs text-ch-border uppercase tracking-wider select-none"
        style={{ gridTemplateColumns: '20px 52px 76px 1fr 80px 1fr 36px 36px 60px 60px 50px 40px 56px' }}>
        <span />
        <span>↓</span>
        <span>Scenes</span>
        <span>Descripción</span>
        <span>Char #</span>
        <span>Notas</span>
        <span className="text-center">D/N</span>
        <span className="text-center">I/E</span>
        <span>Inicio</span>
        <span>Fin</span>
        <span>Dur</span>
        <span>Img</span>
        <span />
      </div>

      {vistaTimeline ? (
        <TimelineView bloquesRaiz={bloquesRaiz} cascada={cascada} />
      ) : bloquesRaiz.length === 0 ? (
        <div className="text-center py-12 text-ch-subtle text-sm">
          <p>El plan está vacío.</p>
          <button onClick={() => onCrear({ titulo: 'Nuevo bloque', tipo: 'rodaje', duracion_min: 30 })}
            className="text-ch-cream mt-2 inline-block hover:underline">
            Agregar primer bloque →
          </button>
        </div>
      ) : (
        <div onClick={() => { setVisibilidadAbierta(null); setColorPickerAbierto(null) }}>
          {bloquesRaiz.map((bloque, idx) => {
            const casc = cascada[idx]
            const isExpandido = expandidoMobil === bloque.id
            const isEliminando = confirmarEliminar === bloque.id

            return (
              <div key={bloque.id} className={bloque.es_paralelo ? 'opacity-75' : ''}>

                {/* FILA DESKTOP */}
                <div
                  className="hidden lg:grid border-b border-ch-border/30 hover:bg-ch-surface/40 transition-colors group items-center min-h-[34px]"
                  style={{ gridTemplateColumns: '20px 52px 76px 1fr 80px 1fr 36px 36px 60px 60px 50px 40px 56px' }}
                >
                  {/* Orden */}
                  <div className="flex flex-col items-center justify-center gap-0 opacity-0 group-hover:opacity-100">
                    <button onClick={() => mover(idx, -1)} disabled={idx === 0}
                      className="text-ch-subtle hover:text-ch-muted disabled:opacity-20 text-[9px] leading-none py-0.5">▲</button>
                    <button onClick={() => mover(idx, 1)} disabled={idx === bloquesRaiz.length - 1}
                      className="text-ch-subtle hover:text-ch-muted disabled:opacity-20 text-[9px] leading-none py-0.5">▼</button>
                  </div>

                  {/* Hora calculada */}
                  <div className="px-1">
                    <span className="text-xs text-ch-muted font-mono">
                      {casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : '—'}
                    </span>
                  </div>

                  {/* SCENES + color */}
                  <div className="flex items-center gap-1 px-1 relative" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setColorPickerAbierto(colorPickerAbierto === bloque.id ? null : bloque.id)}
                      className="w-2.5 h-2.5 rounded-sm shrink-0 border border-ch-border"
                      style={{ backgroundColor: bloque.scenes_color || '#353135' }}
                    />
                    {colorPickerAbierto === bloque.id && (
                      <div className="absolute left-0 top-6 z-30 bg-ch-surface border border-ch-border rounded-[2px] p-2">
                        <div className="grid grid-cols-6 gap-1 mb-2">
                          {COLORES_RAPIDOS.map(c => (
                            <button key={c} onClick={() => { actualizarCelda(bloque.id, 'scenes_color', c); setColorPickerAbierto(null) }}
                              className="w-5 h-5 rounded-sm border border-ch-border hover:scale-110 transition-transform"
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <input type="color" value={bloque.scenes_color || '#353135'}
                          onChange={e => actualizarCelda(bloque.id, 'scenes_color', e.target.value)}
                          className="w-full h-6 rounded cursor-pointer" />
                      </div>
                    )}
                    <input
                      value={bloque.scenes_label || ''}
                      onChange={e => actualizarCelda(bloque.id, 'scenes_label', e.target.value)}
                      placeholder="SCENE"
                      className="flex-1 min-w-0 bg-transparent text-xs font-medium focus:outline-none placeholder:text-ch-border truncate"
                      style={{ color: bloque.scenes_color && bloque.scenes_color !== '#353135' ? bloque.scenes_color : '#999' }}
                    />
                  </div>

                  {/* Descripción */}
                  <div className="flex flex-col justify-center px-1 py-1">
                    <input value={bloque.titulo} onChange={e => actualizarCelda(bloque.id, 'titulo', e.target.value)}
                      className="bg-transparent text-sm text-ch-cream focus:outline-none w-full focus:bg-ch-surface focus:rounded-[2px] px-1" />
                    <input value={bloque.descripcion || ''} onChange={e => actualizarCelda(bloque.id, 'descripcion', e.target.value)}
                      placeholder="subtexto..." className="bg-transparent text-xs text-ch-subtle focus:outline-none w-full mt-0.5 placeholder:text-ch-border focus:bg-ch-surface focus:rounded-[2px] px-1" />
                  </div>

                  {/* Char # */}
                  <div className="px-1">
                    <input value={bloque.character_num || ''} onChange={e => actualizarCelda(bloque.id, 'character_num', e.target.value)}
                      placeholder="—" className="bg-transparent text-xs text-ch-muted focus:outline-none w-full placeholder:text-ch-border focus:bg-ch-surface focus:rounded-[2px] px-1" />
                  </div>

                  {/* Notas */}
                  <div className="px-1">
                    <input value={bloque.nota_previa || ''} onChange={e => actualizarCelda(bloque.id, 'nota_previa', e.target.value)}
                      placeholder="notas..." className="bg-transparent text-xs text-ch-muted focus:outline-none w-full placeholder:text-ch-border focus:bg-ch-surface focus:rounded-[2px] px-1" />
                  </div>

                  {/* D/N */}
                  <div className="flex items-center justify-center">
                    <button onClick={() => actualizarCelda(bloque.id, 'dia_noche', bloque.dia_noche === 'D' ? 'N' : 'D')}
                      className={`text-xs w-6 h-6 rounded-[2px] font-medium transition-colors ${bloque.dia_noche === 'N' ? 'bg-ch-surface text-ch-cream' : 'text-ch-subtle hover:text-ch-muted'}`}>
                      {bloque.dia_noche || 'D'}
                    </button>
                  </div>

                  {/* I/E */}
                  <div className="flex items-center justify-center">
                    <button onClick={() => {
                      const ciclo: Record<string, string> = { 'I': 'E', 'E': '-', '-': 'I' }
                      actualizarCelda(bloque.id, 'interior_exterior', ciclo[bloque.interior_exterior || 'I'])
                    }} className="text-xs text-ch-subtle hover:text-ch-muted w-6 h-6 rounded-[2px] transition-colors">
                      {bloque.interior_exterior || 'I'}
                    </button>
                  </div>

                  {/* INICIO */}
                  <div className="px-1">
                    <TimeInput value={bloque.hora_inicio_fija} onBlur={v => actualizarTiempo(bloque.id, 'inicio', v)}
                      className="text-ch-cream w-full" />
                  </div>

                  {/* FIN */}
                  <div className="px-1">
                    <TimeInput
                      value={casc.fin_min !== undefined ? minutosAHora(casc.fin_min) : bloque.hora_fin}
                      onBlur={v => actualizarTiempo(bloque.id, 'fin', v)}
                      className="text-ch-cream w-full"
                    />
                  </div>

                  {/* DUR */}
                  <div className="px-1">
                    <input type="text" defaultValue={bloque.duracion_min ?? ''}
                      key={`${bloque.id}-${bloque.duracion_min}`}
                      onBlur={e => actualizarTiempo(bloque.id, 'duracion', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      placeholder="min"
                      className="bg-transparent text-xs text-ch-muted focus:outline-none w-full font-mono placeholder:text-ch-border focus:bg-ch-surface focus:rounded-[2px] px-1" />
                  </div>

                  {/* IMG */}
                  <div className="flex items-center justify-center px-0.5" onClick={e => e.stopPropagation()}>
                    {subiendoImagen === bloque.id ? (
                      <span className="text-[10px] text-zinc-600">...</span>
                    ) : bloque.imagen_url ? (
                      <div className="relative group/img">
                        <img
                          src={bloque.imagen_url}
                          alt=""
                          className="w-7 h-7 object-cover rounded-[2px] border border-ch-border cursor-pointer"
                          onClick={() => handleSeleccionarImagen(bloque.id)}
                        />
                        <button
                          onClick={() => handleEliminarImagen(bloque.id, bloque.imagen_url!)}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-ch-dark border border-ch-border rounded-full text-[8px] text-red-400 hidden group-hover/img:flex items-center justify-center leading-none"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSeleccionarImagen(bloque.id)}
                        className="text-ch-border hover:text-ch-muted opacity-0 group-hover:opacity-100 transition-all text-xs leading-none"
                        title="Agregar imagen"
                      >⬜</button>
                    )}
                  </div>

                  {/* Eliminar — inline confirm */}
                  <div className="flex items-center justify-end px-1 gap-1" onClick={e => e.stopPropagation()}>
                    {isEliminando ? (
                      <>
                        <button onClick={async () => { setConfirmarEliminar(null); await onEliminar(bloque.id) }}
                          className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors">
                          Sí
                        </button>
                        <span className="text-ch-border">·</span>
                        <button onClick={() => setConfirmarEliminar(null)}
                          className="text-xs text-ch-subtle hover:text-ch-muted transition-colors">
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmarEliminar(bloque.id)}
                        className="text-ch-border hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* FILA MÓVIL */}
                <div className="lg:hidden border-b border-ch-border/30">
                  <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-ch-surface/50"
                    onClick={() => setExpandidoMobil(isExpandido ? null : bloque.id)}>
                    <div className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: bloque.scenes_color || '#353135' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ch-cream truncate">{bloque.titulo}</p>
                      {bloque.scenes_label && <p className="text-xs truncate" style={{ color: bloque.scenes_color || '#666' }}>{bloque.scenes_label}</p>}
                    </div>
                    <div className="text-right shrink-0 font-mono">
                      <p className="text-xs text-ch-muted">
                        {casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : '—'}
                        {casc.fin_min !== undefined ? ` → ${minutosAHora(casc.fin_min)}` : ''}
                      </p>
                    </div>
                    <span className="text-ch-border text-xs">{isExpandido ? '▲' : '▼'}</span>
                  </div>

                  {isExpandido && (
                    <div className="px-4 pb-4 pt-2 border-t border-ch-border/30 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-ch-subtle mb-1 block">Título</label>
                          <input value={bloque.titulo} onChange={e => actualizarCelda(bloque.id, 'titulo', e.target.value)}
                            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1 text-sm text-ch-cream focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-xs text-ch-subtle mb-1 block">Duración (min)</label>
                          <input type="text" defaultValue={bloque.duracion_min ?? ''}
                            onBlur={e => actualizarTiempo(bloque.id, 'duracion', e.target.value)}
                            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1 text-sm text-ch-cream focus:outline-none font-mono" />
                        </div>
                        <div>
                          <label className="text-xs text-ch-subtle mb-1 block">Inicio</label>
                          <TimeInput value={bloque.hora_inicio_fija} onBlur={v => actualizarTiempo(bloque.id, 'inicio', v)}
                            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1 text-sm text-ch-cream" />
                        </div>
                        <div>
                          <label className="text-xs text-ch-subtle mb-1 block">Fin</label>
                          <TimeInput value={casc.fin_min !== undefined ? minutosAHora(casc.fin_min) : bloque.hora_fin}
                            onBlur={v => actualizarTiempo(bloque.id, 'fin', v)}
                            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1 text-sm text-ch-cream" />
                        </div>
                      </div>
                      <div className="flex gap-3 items-center flex-wrap">
                        <button onClick={() => actualizarCelda(bloque.id, 'dia_noche', bloque.dia_noche === 'D' ? 'N' : 'D')}
                          className="text-xs text-ch-muted border border-ch-border px-2 py-0.5 rounded-[2px]">{bloque.dia_noche || 'D'}</button>
                        <button onClick={() => {
                          const ciclo: Record<string, string> = { 'I': 'E', 'E': '-', '-': 'I' }
                          actualizarCelda(bloque.id, 'interior_exterior', ciclo[bloque.interior_exterior || 'I'])
                        }} className="text-xs text-ch-muted border border-ch-border px-2 py-0.5 rounded-[2px]">{bloque.interior_exterior || 'I'}</button>
                        <button
                          onClick={() => handleSeleccionarImagen(bloque.id)}
                          disabled={subiendoImagen === bloque.id}
                          className="text-xs text-ch-muted border border-ch-border px-2 py-0.5 rounded-[2px] disabled:opacity-50"
                        >{subiendoImagen === bloque.id ? '...' : bloque.imagen_url ? '→ cambiar img' : '+ imagen'}</button>
                        {bloque.imagen_url && (
                          <button onClick={() => handleEliminarImagen(bloque.id, bloque.imagen_url!)}
                            className="text-xs text-red-500/70 border border-red-900/40 px-2 py-0.5 rounded-[2px]">✕ imagen</button>
                        )}
                        <button onClick={async () => await onEliminar(bloque.id)}
                          className="text-xs text-red-500 ml-auto">Eliminar</button>
                      </div>
                      {bloque.imagen_url && (
                        <img src={bloque.imagen_url} alt="" className="w-full max-h-40 object-cover rounded-[2px] border border-ch-border" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Vista Timeline ───────────────────────────────────────────────────────────

function TimelineView({ bloquesRaiz, cascada }: {
  bloquesRaiz: RodajeBloque[]
  cascada: ReturnType<typeof calcularCascada>
}) {
  const validos = cascada.filter(c => c.inicio_min !== undefined && c.fin_min !== undefined)
  if (validos.length === 0) return (
    <div className="px-4 py-8 text-center text-ch-subtle text-sm">
      Agrega horas de inicio para ver el timeline.
    </div>
  )

  const minTime = Math.min(...validos.map(c => c.inicio_min!))
  const maxTime = Math.max(...validos.map(c => c.fin_min!))
  const total = maxTime - minTime || 1

  // Marcas de hora cada 30 min
  const marcas: number[] = []
  for (let t = Math.floor(minTime / 30) * 30; t <= maxTime; t += 30) marcas.push(t)

  return (
    <div className="px-4 py-4 overflow-x-auto">
      {/* Eje de tiempo */}
      <div className="relative mb-2" style={{ minWidth: 600 }}>
        <div className="flex" style={{ paddingLeft: 96 }}>
          {marcas.map(m => (
            <div key={m}
              className="absolute text-xs text-ch-subtle font-mono"
              style={{ left: `calc(96px + ${((m - minTime) / total) * 100}%)` }}
            >
              {minutosAHora(m)}
            </div>
          ))}
        </div>
        <div className="h-4" />
      </div>

      {/* Líneas de guía y bloques */}
      <div className="relative" style={{ minWidth: 600 }}>
        {/* Grid lines */}
        <div className="absolute inset-0 pointer-events-none" style={{ paddingLeft: 96 }}>
          {marcas.map(m => (
            <div key={m} className="absolute top-0 bottom-0 border-l border-ch-border/20"
              style={{ left: `calc(${((m - minTime) / total) * 100}%)` }} />
          ))}
        </div>

        {/* Bloques */}
        {bloquesRaiz.map((bloque, idx) => {
          const casc = cascada[idx]
          if (casc.inicio_min === undefined) return (
            <div key={bloque.id} className="flex items-center gap-2 mb-1 h-7">
              <div className="w-24 shrink-0 text-xs text-ch-subtle truncate pr-2 text-right">{bloque.titulo}</div>
              <div className="flex-1 relative h-full flex items-center">
                <div className="text-xs text-ch-border italic">sin hora</div>
              </div>
            </div>
          )

          const izq = ((casc.inicio_min! - minTime) / total) * 100
          const ancho = ((casc.duracion_min) / total) * 100

          return (
            <div key={bloque.id} className="flex items-center gap-2 mb-1 h-7">
              {/* Label */}
              <div className="w-24 shrink-0 text-right pr-2">
                {bloque.scenes_label ? (
                  <span className="text-xs font-medium" style={{ color: bloque.scenes_color || '#999' }}>
                    {bloque.scenes_label}
                  </span>
                ) : (
                  <span className="text-xs text-ch-subtle truncate">{bloque.titulo}</span>
                )}
              </div>

              {/* Barra */}
              <div className="flex-1 relative h-5">
                <div
                  className="absolute top-0 h-full rounded-[2px] flex items-center px-2 overflow-hidden"
                  style={{
                    left: `${izq}%`,
                    width: `${Math.max(ancho, 1)}%`,
                    backgroundColor: bloque.scenes_color || '#353135',
                    opacity: bloque.tipo === 'pausa' ? 0.5 : 1,
                  }}
                  title={`${bloque.titulo} · ${minutosAHora(casc.inicio_min!)} → ${minutosAHora(casc.fin_min!)}`}
                >
                  {ancho > 5 && (
                    <span className="text-xs text-white/80 truncate leading-none font-medium" style={{ fontSize: 9 }}>
                      {bloque.titulo}
                    </span>
                  )}
                </div>
              </div>

              {/* Hora */}
              <div className="w-20 shrink-0 text-xs text-ch-subtle font-mono">
                {minutosAHora(casc.inicio_min!)} → {minutosAHora(casc.fin_min!)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Panel equipo ─────────────────────────────────────────────────────────────

function PanelEquipo({ equipo, rodaje, rodajeId, onPersonaAgregada }: {
  equipo: RodajeEquipoTecnico[]
  rodaje: any
  rodajeId: string
  onPersonaAgregada: () => void
}) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('')
  const [telefono, setTelefono] = useState('')

  const handleAgregar = async () => {
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      await supabase.from('rodaje_equipo_tecnico').insert({
        rodaje_id: rodajeId,
        nombre: nombre.trim(),
        rol: rol.trim() || null,
        telefono: telefono.trim() || null,
      })
      setNombre('')
      setRol('')
      setTelefono('')
      setMostrarForm(false)
      onPersonaAgregada()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-ch-border flex items-center justify-between">
        <span className="text-xs text-ch-muted uppercase tracking-wider">Equipo técnico</span>
        <div className="flex gap-2">
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="text-xs bg-ch-cream text-ch-dark font-medium px-2.5 py-1 rounded-[2px] hover:bg-white transition-colors"
          >
            + Persona
          </button>
          <Link href={`/rodaje/${rodajeId}/equipo`} className="text-xs text-ch-subtle hover:text-ch-muted transition-colors py-1">
            Gestionar →
          </Link>
        </div>
      </div>

      {/* Form rápido */}
      {mostrarForm && (
        <div className="px-4 py-3 border-b border-ch-border bg-ch-surface/50 space-y-2">
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre *"
            className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1.5 text-sm text-ch-cream focus:outline-none focus:border-ch-muted placeholder:text-ch-subtle"
            onKeyDown={e => { if (e.key === 'Enter') handleAgregar() }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={rol}
              onChange={e => setRol(e.target.value)}
              placeholder="Rol / cargo"
              className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1.5 text-xs text-ch-cream focus:outline-none focus:border-ch-muted placeholder:text-ch-subtle"
            />
            <input
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="Teléfono"
              className="w-full bg-ch-surface border border-ch-border rounded-[2px] px-2 py-1.5 text-xs text-ch-cream focus:outline-none focus:border-ch-muted placeholder:text-ch-subtle"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAgregar}
              disabled={guardando || !nombre.trim()}
              className="text-xs bg-ch-cream text-ch-dark font-medium px-3 py-1 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50"
            >
              {guardando ? '...' : 'Agregar'}
            </button>
            <button onClick={() => setMostrarForm(false)} className="text-xs text-ch-subtle hover:text-ch-muted px-2">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {equipo.length === 0 && !mostrarForm ? (
        <div className="px-4 py-8 text-center text-ch-subtle text-sm">
          <p className="text-xs">Sin equipo agregado.</p>
        </div>
      ) : (
        <div className="divide-y divide-ch-border/20">
          {equipo.map((persona: any) => {
            const horaEfectiva = resolverHoraLlamado(persona, rodaje)
            const citacion: RodajeCitacion | undefined = Array.isArray(persona.citacion)
              ? persona.citacion[0] : persona.citacion
            const estado = citacion ? estadoCitacion(citacion) : null
            return (
              <div key={persona.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ch-cream truncate">{persona.nombre}</p>
                  <p className="text-xs text-ch-subtle truncate">{persona.rol}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono text-ch-muted">{horaEfectiva ? formatHora(horaEfectiva) : '—'}</p>
                  {estado && (
                    <span className={`text-xs ${estado.color === 'green' ? 'text-emerald-400' : estado.color === 'red' ? 'text-red-400' : estado.color === 'yellow' ? 'text-amber-400' : 'text-zinc-600'}`}>
                      {estado.label}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="px-4 py-3 border-t border-ch-border">
        <Link href={`/rodaje/${rodajeId}/citaciones`} className="text-xs text-ch-cream hover:underline">
          Ver citaciones →
        </Link>
      </div>
    </div>
  )
}
