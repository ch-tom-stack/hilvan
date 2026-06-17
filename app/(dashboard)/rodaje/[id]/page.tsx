'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getRodaje, actualizarEstadoRodaje } from '@/app/actions/rodaje'
import { toastError, toastOk } from '@/lib/toast'
import {
  getBloques, getLocaciones, crearBloque, crearBloqueDesdePlantilla,
  guardarBloques, eliminarBloque, dividirBloque, getClima,
} from '@/app/actions/rodaje-plan'
import {
  RodajeBloque, RodajeLocacion, RodajeEquipoTecnico, RodajeCitacion,
  EstadoRodaje, TipoBloque, PLANTILLAS_BLOQUES,
  calcularCascada, duracionTotalDia,
  minutosAHora, formatHora, resolverHoraLlamado,
  estadoCitacion, generarLinkCalendar,
} from '@/types'
import SunCalc from 'suncalc'
import { parseFechaLocal } from '@/lib/fechas'
import PanelEquipo from '@/components/rodaje/PanelEquipo'
import TablaPlan from '@/components/rodaje/TablaPlan'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADO_CICLO: EstadoRodaje[] = ['borrador', 'confirmado', 'completado']
const ESTADO_CONFIG: Record<EstadoRodaje, { label: string; clase: string }> = {
  borrador:   { label: 'Borrador',   clase: 'bg-ch-surface text-ch-muted' },
  confirmado: { label: 'Confirmado', clase: 'bg-emerald-950 text-emerald-400' },
  completado: { label: 'Completado', clase: 'bg-ch-surface text-ch-subtle' },
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
      const fecha = parseFechaLocal(r.fecha)
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
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al guardar')
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
    try {
      await actualizarEstadoRodaje(id, siguiente)
      setRodaje((r: any) => ({ ...r, estado: siguiente }))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al cambiar estado')
    }
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
    ? parseFechaLocal(rodaje.fecha).toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="tema-claro min-h-screen bg-ch-dark">

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
              if (!bloqueId.startsWith('temp-')) {
                try {
                  await eliminarBloque(bloqueId, id)
                } catch (e) {
                  toastError(e instanceof Error ? e.message : 'Error al eliminar bloque')
                }
              }
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
