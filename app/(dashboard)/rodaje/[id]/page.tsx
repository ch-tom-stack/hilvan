'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EVENTO_HISTORIAL } from '@/components/ui/AtajosGlobales'
import { guardarPortapapeles, leerPortapapeles, type Portapapeles } from '@/lib/portapapeles-cotizacion'
import { getRodaje, actualizarEstadoRodaje, actualizarFichaRapida } from '@/app/actions/rodaje'
import { toastError, toastOk } from '@/lib/toast'
import {
  getBloques, getLocaciones, crearBloque, crearBloqueDesdePlantilla,
  guardarBloques, eliminarBloque, dividirBloque,
  crearLocacion, actualizarLocacion, geocodificarDireccion,
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
import StickerLayerEditor from '@/components/rodaje/StickerLayerEditor'
import { getStickers } from '@/app/actions/rodaje-stickers'
import type { RodajeSticker } from '@/types'
import { momento } from '@/lib/momentos'
import { obtenerClima } from '@/lib/clima'
import { bloquesPendientes, columnasBloque, firmaBloque, firmas } from '@/lib/rodaje-plan-sync'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Espera tras el último cambio antes de guardar solo. Con 30 s, cerrar la pestaña
// o recargar perdía casi todo lo editado.
const AUTOGUARDADO_MS = 1500

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
  const [stickers, setStickers] = useState<RodajeSticker[]>([])
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

  // Undo/Redo LOCAL (ediciones en memoria, antes del autoguardado). Lo que ya
  // se guardó lo deshace el historial global (Ctrl+Z en AtajosGlobales): este
  // handler solo toma el atajo cuando tiene algo en memoria, si no lo deja pasar.
  const [historia, setHistoria] = useState<RodajeBloque[][]>([])
  const [historiaIdx, setHistoriaIdx] = useState(-1)
  const [bloqueSel, setBloqueSel] = useState<string | null>(null)

  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const climaPedidoRef = useRef<AbortController | null>(null)
  const bloquesRef = useRef<RodajeBloque[]>([])
  bloquesRef.current = bloques

  // Sincronización (lib/rodaje-plan-sync.ts): el plan se calcula aquí, al
  // instante; al servidor solo sube lo que cambió respecto de lo guardado.
  const guardadasRef = useRef<Map<string, string>>(new Map()) // id → huella guardada
  const guardandoRef = useRef(false)
  const otraVueltaRef = useRef(false)
  const guardarRef = useRef<() => Promise<void>>(async () => {})
  const temporalesBorradosRef = useRef<Set<string>>(new Set())
  const ultimaEdicionRef = useRef(0)

  // Sol y clima salen de la fecha y las coordenadas de la locación principal:
  // se recalculan cada vez que cambia alguna.
  const calcularSolYClima = useCallback((r: any) => {
    if (r?.locacion_lat && r?.locacion_lng && r?.fecha) {
      const fecha = parseFechaLocal(r.fecha)
      const times = SunCalc.getTimes(fecha, r.locacion_lat, r.locacion_lng)
      const fmt = (d: Date) => Number.isNaN(d?.getTime()) ? '—' : new Intl.DateTimeFormat('es-CL', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago',
      }).format(d)
      setSol({
        amanecer: fmt(times.sunrise),
        atardecer: fmt(times.sunset),
        dorada_am: fmt(times.goldenHourEnd),
        dorada_pm: fmt(times.goldenHour),
      })
      // El último pedido gana: si se cambia la fecha dos veces seguidas, no pisa una respuesta vieja.
      climaPedidoRef.current?.abort()
      const ctrl = new AbortController()
      climaPedidoRef.current = ctrl
      obtenerClima(r.locacion_lat, r.locacion_lng, r.fecha, ctrl.signal).then(c => { if (!ctrl.signal.aborted) setClima(c) })
    } else {
      setSol(null)
      setClima(null)
    }
  }, [])

  // Carga inicial
  const cargarTodo = useCallback(async () => {
    const [r, b, l, sk] = await Promise.all([getRodaje(id), getBloques(id), getLocaciones(id), getStickers(id)])
    setRodaje(r)
    setBloques(b)
    guardadasRef.current = firmas(b)
    setStickers(sk)
    setLocaciones(l)
    setHistoria([b])
    setHistoriaIdx(0)

    calcularSolYClima(r)
  }, [id, calcularSolYClima])

  const recargarBloques = useCallback(async () => {
    const b = await getBloques(id)
    setBloques(b)
    guardadasRef.current = firmas(b)
    return b
  }, [id])

  useEffect(() => {
    cargarTodo().finally(() => setLoading(false))
  }, [cargarTodo])

  // Tras un deshacer/rehacer GLOBAL (ya guardado en el servidor) se recarga todo.
  useEffect(() => {
    const onHistorial = () => { void cargarTodo() }
    window.addEventListener(EVENTO_HISTORIAL, onHistorial)
    return () => window.removeEventListener(EVENTO_HISTORIAL, onHistorial)
  }, [cargarTodo])

  const programarAutoSave = useCallback(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => { void guardarRef.current() }, AUTOGUARDADO_MS)
  }, [])

  // Sube lo pendiente. Nunca dos guardados a la vez: si llega otro pedido
  // mientras uno viaja, se hace una vuelta más al terminar con lo que quede.
  const guardarPendientes = useCallback(async () => {
    if (autoSaveRef.current) { clearTimeout(autoSaveRef.current); autoSaveRef.current = null }
    if (guardandoRef.current) { otraVueltaRef.current = true; return }
    const cambiados = bloquesPendientes(bloquesRef.current, guardadasRef.current)
    if (cambiados.length === 0) { setCambiosSinGuardar(false); return }

    guardandoRef.current = true
    setGuardando(true)
    let ok = true
    try {
      await guardarBloques(id, cambiados.map(b => ({ id: b.id, ...columnasBloque(b) })))
      for (const b of cambiados) guardadasRef.current.set(b.id, firmaBloque(b))
    } catch (e) {
      ok = false
      toastError(e instanceof Error ? e.message : 'No se pudo guardar el plan. Usa el botón Guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
      const quedan = bloquesPendientes(bloquesRef.current, guardadasRef.current).length > 0
      setCambiosSinGuardar(quedan)
      // Lo editado mientras viajaba el guardado sale en la vuelta siguiente.
      if (ok && quedan) {
        if (otraVueltaRef.current) void guardarRef.current()
        else programarAutoSave()
      }
      otraVueltaRef.current = false
    }
  }, [id, programarAutoSave])

  useEffect(() => { guardarRef.current = guardarPendientes }, [guardarPendientes])

  const guardarAhora = () => { void guardarPendientes() }

  // Al cambiar de pestaña o minimizar, sube lo pendiente sin esperar.
  useEffect(() => {
    const alOcultar = () => { if (document.visibilityState === 'hidden') void guardarRef.current() }
    document.addEventListener('visibilitychange', alOcultar)
    return () => document.removeEventListener('visibilitychange', alOcultar)
  }, [])

  // Avisa al cerrar la pestaña si queda algo sin guardar.
  useEffect(() => {
    if (!cambiosSinGuardar) return
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [cambiosSinGuardar])

  const actualizarBloques = useCallback((nuevos: RodajeBloque[]) => {
    setBloques(nuevos)
    setCambiosSinGuardar(true)
    // Historial local: las ediciones seguidas (tipear una palabra) son UN paso de
    // deshacer, no uno por letra. Corta el futuro si se estaba deshaciendo.
    const ahora = Date.now()
    const agrupar = ahora - ultimaEdicionRef.current < 800
    ultimaEdicionRef.current = ahora
    setHistoria(prev => {
      const cortado = prev.slice(0, historiaIdx + 1)
      if (agrupar && cortado.length > 1) return [...cortado.slice(0, -1), nuevos]
      return [...cortado, nuevos].slice(-50) // max 50 estados
    })
    if (!agrupar) setHistoriaIdx(prev => Math.min(prev + 1, 49))
    programarAutoSave()
  }, [historiaIdx, programarAutoSave])

  // Crea un bloque al instante en pantalla (id temporal) y lo da de alta en el
  // servidor por detrás. Si se editó mientras tanto, esas ediciones se conservan:
  // solo cambia el id, y el autoguardado sube la diferencia.
  const insertarOptimista = (payload: Partial<RodajeBloque> & { titulo: string }, despuesDe?: string | null) => {
    const actuales = bloquesRef.current
    const raiz = actuales.filter(b => !b.padre_id).sort((a, b) => a.orden - b.orden)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const bloqueOptimista: RodajeBloque = {
      id: tempId,
      rodaje_id: id,
      orden: raiz.length,
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
      // Sin hora_inicio_fija: el bloque nace SIGUIENDO la cascada (hereda el fin
      // del bloque anterior dinámicamente). Si se fija acá con un valor congelado,
      // deja de seguir al bloque de arriba en cuanto ese cambie — hay que anclarlo
      // a mano (toggle de la columna Inicio) si de verdad se quiere una hora fija.
      hora_inicio_fija: null,
      hora_fin: null,
      duracion_min: payload.duracion_min ?? 30,
      es_paralelo: false,
      es_anclado: false,
      visible_equipo: payload.visible_equipo ?? true,
      visible_catering: payload.visible_catering ?? true,
      visible_extras: payload.visible_extras ?? false,
      visible_cliente: payload.visible_cliente ?? false,
      imagen_url: payload.imagen_url,
      contenido_rico: payload.contenido_rico,
      estilo: payload.estilo,
      created_at: '',
      updated_at: '',
    }

    const pos = despuesDe ? raiz.findIndex(b => b.id === despuesDe) : -1
    const raizNueva = [...raiz]
    raizNueva.splice(pos >= 0 ? pos + 1 : raizNueva.length, 0, bloqueOptimista)
    const orden = new Map(raizNueva.map((b, i) => [b.id, i]))
    actualizarBloques([
      ...actuales.map(b => (orden.has(b.id) ? { ...b, orden: orden.get(b.id)! } : b)),
      { ...bloqueOptimista, orden: orden.get(tempId)! },
    ])

    crearBloque(id, { ...payload, hora_inicio_fija: null, es_anclado: false, duracion_min: payload.duracion_min ?? 30 }).then(real => {
      const realBloque = real as RodajeBloque
      if (temporalesBorradosRef.current.has(tempId)) {
        // Se borró antes de que el servidor respondiera: no dejar un huérfano.
        eliminarBloque(realBloque.id, id).catch(() => {})
        return
      }
      guardadasRef.current.set(realBloque.id, firmaBloque(realBloque))
      const conId = (b: RodajeBloque) => (b.id === tempId ? { ...b, id: realBloque.id, created_at: realBloque.created_at, updated_at: realBloque.updated_at } : b)
      setBloques(prev => prev.map(conId))
      setHistoria(prev => prev.map(snap => snap.map(conId)))
      setBloqueSel(sel => (sel === tempId ? realBloque.id : sel))
      programarAutoSave()
    }).catch(e => {
      toastError(e instanceof Error ? e.message : 'No se pudo crear el bloque')
      setBloques(prev => prev.filter(b => b.id !== tempId))
      setHistoria(prev => prev.map(snap => snap.filter(b => b.id !== tempId)))
    })
    return tempId
  }

  const resolverYCrear = (payload: Partial<RodajeBloque> & { titulo: string }) => { insertarOptimista(payload) }

  // Pegar: aparece al instante justo después del seleccionado.
  const pegarBloque = (datos: Partial<RodajeBloque> & { titulo: string }) => {
    const nuevoId = insertarOptimista({ ...datos, titulo: datos.titulo }, bloqueSel)
    setBloqueSel(nuevoId)
    toastOk(`Pegado «${datos.titulo}»`)
  }

  // Keyboard: Cmd+Z / Ctrl+Z undo, Cmd+Shift+Z / Ctrl+Y redo (local, en memoria).
  // Si no hay nada local que deshacer/rehacer, NO se detiene el evento y lo
  // toma el historial global (lo ya guardado: bloques borrados, equipo, etc.).
  useEffect(() => {
    const enCampo = () => { const t = document.activeElement?.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (document.activeElement as HTMLElement | null)?.isContentEditable }
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta || enCampo()) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        if (historiaIdx <= 0) return
        e.preventDefault(); e.stopImmediatePropagation()
        const newIdx = historiaIdx - 1
        setBloques(historia[newIdx]); setHistoriaIdx(newIdx); setCambiosSinGuardar(true); programarAutoSave()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        if (historiaIdx >= historia.length - 1) return
        e.preventDefault(); e.stopImmediatePropagation()
        const newIdx = historiaIdx + 1
        setBloques(historia[newIdx]); setHistoriaIdx(newIdx); setCambiosSinGuardar(true); programarAutoSave()
      } else if (k === 'c' && bloqueSel) {
        const b = bloquesRef.current.find(x => x.id === bloqueSel)
        if (!b) return
        e.preventDefault()
        const { id: _i, rodaje_id: _r, created_at: _c, updated_at: _u, orden: _o, padre_id: _p, hijos: _h, locacion: _l, ...datos } = b as any
        const p: Portapapeles = { tipo: 'bloque', etiqueta: b.titulo, origen: rodaje?.nombre ?? '', datos }
        guardarPortapapeles(p)
        toastOk(`Copiado el bloque «${b.titulo}». Ctrl+V lo pega después del bloque seleccionado (también en otro rodaje).`)
      } else if (k === 'v') {
        const p = leerPortapapeles()
        if (p?.tipo !== 'bloque') return
        e.preventDefault()
        pegarBloque(p.datos as Partial<RodajeBloque> & { titulo: string })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }) // sin deps a propósito: lee siempre el estado vigente

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

  // Arma la pizarra de la claqueta desde el Plan de Rodaje.
  // Los campos que vienen vacíos se omiten: un rodaje sin equipo cargado no
  // debe mostrar un "0" que parece un error (pasa de verdad — ver ALDO).
  const datosClaqueta = () => {
    const equipo = (rodaje?.equipo_tecnico ?? []) as { rol?: string | null; nombre: string }[]
    // "Dirección de Foto" y "Asistencia de Dirección" también contienen la
    // palabra: se exige coincidencia exacta.
    const director = equipo.find(m => (m.rol ?? '').trim().toLowerCase() === 'dirección')
    return {
      nombre: rodaje?.nombre ?? 'Rodaje',
      fecha: rodaje?.fecha ?? null,
      locacion: rodaje?.locacion_nombre ?? null,
      llamado: rodaje?.hora_llamado_general ?? null,
      // Solo bloques de rodaje: pre-sets, pausas y montaje no son secuencias.
      secuencias: bloquesRef.current.filter(b => b.tipo === 'rodaje' && !b.padre_id).length,
      equipo: equipo.length,
      direccion: director?.nombre ?? null,
    }
  }

  // ── Ficha rápida: fecha y locación desde el encabezado ──
  const [nuevaLoc, setNuevaLoc] = useState<{ nombre: string; direccion: string } | null>(null)
  const [guardandoLoc, setGuardandoLoc] = useState(false)

  const recargarFicha = async () => {
    const [r, l] = await Promise.all([getRodaje(id), getLocaciones(id)])
    setRodaje(r)
    setLocaciones(l)
    calcularSolYClima(r)
  }

  // Fecha y locación: se aplican en pantalla al tiro (sol y clima incluidos) y
  // se guardan por detrás; si el servidor falla, se vuelve a lo anterior.
  const cambiarFecha = async (fecha: string, confirmada?: boolean) => {
    const previo = rodaje
    const nuevo = { ...rodaje, fecha: fecha || null, ...(confirmada === undefined ? {} : { fecha_confirmada: confirmada }) }
    setRodaje(nuevo)
    if (nuevo.fecha !== previo.fecha) calcularSolYClima(nuevo)
    try {
      await actualizarFichaRapida(id, { fecha: fecha || null, ...(confirmada === undefined ? {} : { fecha_confirmada: confirmada }) })
    } catch (e) {
      setRodaje(previo)
      calcularSolYClima(previo)
      toastError(e instanceof Error ? e.message : 'No se pudo cambiar la fecha')
    }
  }

  const elegirLocacion = async (locId: string) => {
    if (locId === '__nueva') { setNuevaLoc({ nombre: '', direccion: '' }); return }
    const loc = locaciones.find(l => l.id === locId)
    if (!loc) return
    const [rodajePrevio, locsPrevias] = [rodaje, locaciones]
    const nuevo = { ...rodaje, locacion_nombre: loc.nombre, locacion_direccion: loc.direccion ?? null, locacion_lat: loc.lat ?? null, locacion_lng: loc.lng ?? null }
    setLocaciones(ls => ls.map(l => ({ ...l, es_principal: l.id === locId })))
    setRodaje(nuevo)
    calcularSolYClima(nuevo)
    try {
      await actualizarLocacion(locId, id, { es_principal: true })
    } catch (e) {
      setLocaciones(locsPrevias)
      setRodaje(rodajePrevio)
      calcularSolYClima(rodajePrevio)
      toastError(e instanceof Error ? e.message : 'No se pudo cambiar la locación')
    }
  }

  const guardarNuevaLocacion = async () => {
    if (!nuevaLoc?.nombre.trim()) return
    setGuardandoLoc(true)
    try {
      const geo = nuevaLoc.direccion.trim() ? await geocodificarDireccion(nuevaLoc.direccion.trim()) : null
      if (nuevaLoc.direccion.trim() && !geo) toastOk('No se ubicó la dirección en el mapa: se guardó sin coordenadas (sin clima ni sol)')
      await crearLocacion(id, {
        nombre: nuevaLoc.nombre.trim(),
        direccion: nuevaLoc.direccion.trim() || undefined,
        lat: geo?.lat, lng: geo?.lng,
        es_principal: true,
      })
      setNuevaLoc(null)
      await recargarFicha()
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'No se pudo guardar la locación')
    } finally {
      setGuardandoLoc(false)
    }
  }

  const cambiarEstado = async () => {
    const idx = ESTADO_CICLO.indexOf(rodaje.estado)
    const siguiente = ESTADO_CICLO[(idx + 1) % ESTADO_CICLO.length]
    try {
      await actualizarEstadoRodaje(id, siguiente)
      setRodaje((r: any) => ({ ...r, estado: siguiente }))
      if (siguiente === 'confirmado')      momento('rodaje.publicado', { claqueta: datosClaqueta() })
      else if (siguiente === 'completado') momento('rodaje.finalizado')
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
                  className={`text-xs px-2 py-0.5 rounded-full transition-colors hover:opacity-70 ${cfg.clase} ch-press`}
                  title="Click para cambiar estado"
                >
                  {cfg.label}
                </button>
                {rodaje.proyecto && <span className="text-xs text-ch-subtle">· {rodaje.proyecto.nombre}</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <input
                  type="date"
                  value={rodaje.fecha || ''}
                  onChange={e => cambiarFecha(e.target.value)}
                  title="Cambiar la fecha del rodaje"
                  className="bg-transparent border border-transparent hover:border-ch-border focus:border-ch-muted rounded-[2px] px-1 py-0.5 text-sm text-ch-muted focus:outline-none cursor-pointer"
                />
                {fecha && <span className="text-sm text-ch-muted capitalize hidden sm:inline">{fecha}</span>}
                <button
                  onClick={() => cambiarFecha(rodaje.fecha || '', !rodaje.fecha_confirmada)}
                  title="Marcar la fecha como confirmada o por confirmar"
                  className={`text-xs ch-press ${rodaje.fecha_confirmada ? 'text-emerald-500' : 'text-amber-500'}`}
                >
                  {rodaje.fecha_confirmada ? '✓ fecha confirmada' : '· fecha por confirmar'}
                </button>
              </div>
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
                  className="text-xs px-2 py-1 text-ch-subtle hover:text-ch-muted disabled:opacity-30 transition-colors ch-press">
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
                  className="text-xs px-2 py-1 text-ch-subtle hover:text-ch-muted disabled:opacity-30 transition-colors border-l border-ch-border ch-press">
                  ↪
                </button>
              </div>

              {cambiosSinGuardar ? (
                <button onClick={guardarAhora} disabled={guardando}
                  className="text-xs bg-amber-500 text-black font-medium px-3 py-1.5 rounded-[2px] hover:bg-amber-400 transition-colors disabled:opacity-50 ch-press">
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
                onClick={() => momento('pdf.generado')}
                className="text-xs text-ch-muted border border-ch-border px-3 py-1.5 rounded-[2px] hover:border-ch-muted transition-colors">
                PDF
              </a>
              <a href={`/api/rodaje/${id}/pdf?formato=tabloid`} target="_blank"
                onClick={() => momento('pdf.generado')}
                title="PDF apaisado tamaño tabloid (doble carta) para imprimir grande y pegar en set"
                className="text-xs text-ch-muted border border-ch-border px-3 py-1.5 rounded-[2px] hover:border-ch-muted transition-colors">
                PDF ⬌
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-ch-subtle">📍</span>
              {nuevaLoc ? (
                <>
                  <input
                    autoFocus
                    value={nuevaLoc.nombre}
                    onChange={e => setNuevaLoc({ ...nuevaLoc, nombre: e.target.value })}
                    placeholder="Nombre (ej. Estudio EQUECO)"
                    className="bg-ch-surface border border-ch-border rounded-[2px] px-2 py-0.5 text-xs text-ch-cream w-44 focus:outline-none focus:border-ch-muted"
                  />
                  <input
                    value={nuevaLoc.direccion}
                    onChange={e => setNuevaLoc({ ...nuevaLoc, direccion: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') guardarNuevaLocacion() }}
                    placeholder="Dirección (para clima y sol)"
                    className="bg-ch-surface border border-ch-border rounded-[2px] px-2 py-0.5 text-xs text-ch-cream w-56 focus:outline-none focus:border-ch-muted"
                  />
                  <button onClick={guardarNuevaLocacion} disabled={guardandoLoc || !nuevaLoc.nombre.trim()}
                    className="text-xs text-ch-cream border border-ch-border px-2 py-0.5 rounded-[2px] hover:border-ch-muted disabled:opacity-40 ch-press">
                    {guardandoLoc ? '…' : 'Guardar'}
                  </button>
                  <button onClick={() => setNuevaLoc(null)} className="text-xs text-ch-subtle hover:text-ch-muted ch-press">Cancelar</button>
                </>
              ) : (
                <select
                  value={locacionPrincipal?.id ?? ''}
                  onChange={e => elegirLocacion(e.target.value)}
                  title="Cambiar la locación del rodaje"
                  className="bg-transparent border border-transparent hover:border-ch-border focus:border-ch-muted rounded-[2px] px-1 py-0.5 text-xs text-ch-muted focus:outline-none cursor-pointer max-w-[260px]"
                >
                  {!locacionPrincipal && <option value="">{rodaje.locacion_nombre || 'Sin locación'}</option>}
                  {locaciones.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  <option value="__nueva">+ Otra locación…</option>
                </select>
              )}
            </div>
            {sol && (
              <div className="flex items-center gap-2 text-ch-muted">
                <span>↑{sol.amanecer}</span>
                <span className="text-amber-500">★{sol.dorada_am}</span>
                <span className="text-amber-500">★{sol.dorada_pm}</span>
                <span>↓{sol.atardecer}</span>
              </div>
            )}
            {clima && <span className="text-ch-muted">{clima.temp_min}°/{clima.temp_max}° · {clima.condicion}</span>}
            {!sol && !clima && rodaje.fecha && (!rodaje.locacion_lat || !rodaje.locacion_lng) && (
              <span className="text-ch-subtle" title="El clima y el sol se calculan con la fecha y las coordenadas de la locación">
                Sin coordenadas: pon una dirección en la locación para ver clima y sol
              </span>
            )}
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
          className={`flex-1 py-2 text-xs font-medium ${tabMobil === 'plan' ? 'text-ch-cream border-b-2 border-ch-cream' : 'text-ch-subtle'} ch-press`}>
          Plan
        </button>
        <button onClick={() => setTabMobil('equipo')}
          className={`flex-1 py-2 text-xs font-medium ${tabMobil === 'equipo' ? 'text-ch-cream border-b-2 border-ch-cream' : 'text-ch-subtle'} ch-press`}>
          Equipo ({equipo.length})
        </button>
      </div>

      {/* CONTENIDO */}
      <div className="max-w-[1400px] mx-auto lg:grid lg:grid-cols-[1fr_300px]">
        <div className={`${tabMobil !== 'plan' ? 'hidden lg:block' : ''} border-r border-ch-border`}>
          <StickerLayerEditor rodajeId={id} iniciales={stickers}>
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
            seleccionadoId={bloqueSel}
            onSeleccionar={setBloqueSel}
            titulo={rodaje.nombre}
            fecha={rodaje.fecha}
            onCrear={handleCrearBloque}
            onCrearDesdePlantilla={handleCrearDesdePlantilla}
            onEliminar={async (bloqueId) => {
              const sinEl = bloques.filter(b => b.id !== bloqueId)
              actualizarBloques(sinEl)
              guardadasRef.current.delete(bloqueId)
              if (bloqueId.startsWith('temp-')) temporalesBorradosRef.current.add(bloqueId)
              if (!bloqueId.startsWith('temp-')) {
                try {
                  await eliminarBloque(bloqueId, id)
                } catch (e) {
                  toastError(e instanceof Error ? e.message : 'Error al eliminar bloque')
                }
              }
            }}
          />
          </StickerLayerEditor>
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
