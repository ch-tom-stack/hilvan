'use client'

// CH-11 CRONOS v2 — la pantalla del crono: LA HOJA (izquierda, blanca, lo que se
// imprime) + EL PANEL (derecha, Hilván, lo que informa y no se imprime).
// Regla de Tomás: todo en una página, minimalismo, texto completo en cada hito.
// Los hitos se crean con clic en el día, se editan con clic en la etiqueta y se
// mueven arrastrando. Guardar escribe ficha + etapas + hitos + compuertas juntos.

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { crearFeriado, eliminarCrono, eliminarFeriado, guardarCrono, importarRodajesAlCrono } from '@/app/actions/cronos'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { useConfirm } from '@/components/ui/useConfirm'
import {
  avisosCrono,
  diaNum,
  diasHabiles,
  esHitoClave,
  etapaSugeridaParaTipo,
  evaluarCompuertas,
  fechaValida,
  formatoCorto,
  formatoDia,
  hitosEntre,
  hitosOrdenados,
  hoyIso,
  lecturaEtapas,
  mapaFeriados,
  montoONull,
  nombreTipoHito,
  proximoHitoClave,
  rangoCrono,
  rangoInvertido,
  DESTACABLES,
  semanasDelCrono,
  sumarDias,
  textoCheckEntrega,
  totalPagos,
  type RangoEtapa,
} from '@/lib/crono'
import {
  ESTADO_CRONO_LABELS,
  ETAPAS_CRONO,
  TIPOS_HITO_CRONO,
  formatCLP,
  type Crono,
  type CronoCompuerta,
  type CronoHito,
  type DestinoCompuerta,
  type EstadoCrono,
  type EtapaCrono,
  type Feriado,
  type TipoHitoCrono,
} from '@/types'
import {
  CH,
  CalendarioHoja,
  EtapasHoja,
  LeyendaHoja,
  PanelCompuertas,
  PanelLectura,
  PanelPagos,
  PanelSemana,
  TiraGeneral,
} from './CronoVistas'

type HitoLocal = Omit<CronoHito, 'crono_id' | 'created_at' | 'updated_at'>
type CompuertaLocal = Omit<CronoCompuerta, 'crono_id' | 'created_at' | 'updated_at'>

interface Props {
  crono: Crono
  proyectos: { id: string; nombre: string }[]
  rodajesProyecto: { id: string; nombre: string; fecha: string | null; estado: string }[]
  feriados: Feriado[]
}

interface Ficha { nombre: string; proyecto_id: string; cliente: string; responsable: string; notas: string; estado: EstadoCrono }
type EtapasForm = Record<EtapaCrono, { desde: string; hasta: string }>
interface Draft { tipo: TipoHitoCrono; titulo: string; fecha: string; fecha_fin: string; monto: string; notas: string; responsable: string; destacado: boolean; hecho: boolean }
interface Popover { hitoId: string | null; x: number; y: number; draft: Draft }

const ESTADOS: EstadoCrono[] = ['borrador', 'vigente', 'cerrado']
const inputCls = 'bg-ch-surface border border-ch-border text-ch-cream font-body text-xs px-2 py-1.5 focus:outline-none focus:border-ch-cream/40 transition-colors placeholder:text-ch-subtle [color-scheme:dark]'
const lblCls = 'font-body text-[9px] tracking-[0.4em] uppercase text-ch-muted'

const fichaDe = (c: Crono): Ficha => ({ nombre: c.nombre, proyecto_id: c.proyecto_id ?? '', cliente: c.cliente ?? '', responsable: c.responsable ?? '', notas: c.notas ?? '', estado: c.estado })
const etapasDe = (c: Crono): EtapasForm => ({
  desarrollo: { desde: c.desarrollo_desde ?? '', hasta: c.desarrollo_hasta ?? '' },
  pre:        { desde: c.pre_desde ?? '',        hasta: c.pre_hasta ?? '' },
  produccion: { desde: c.produccion_desde ?? '', hasta: c.produccion_hasta ?? '' },
  post:       { desde: c.post_desde ?? '',       hasta: c.post_hasta ?? '' },
})
const hitosDe = (c: Crono): HitoLocal[] => (c.hitos ?? []).map(({ crono_id: _c, created_at: _a, updated_at: _u, ...h }) => h)
const compuertasDe = (c: Crono): CompuertaLocal[] => (c.compuertas ?? []).map(({ crono_id: _c, created_at: _a, updated_at: _u, ...x }) => x)
function aRangos(e: EtapasForm): Record<EtapaCrono, RangoEtapa> {
  const r = {} as Record<EtapaCrono, RangoEtapa>
  for (const k of ETAPAS_CRONO) r[k.id] = { desde: e[k.id].desde || null, hasta: e[k.id].hasta || null }
  return r
}
const draftVacio = (fecha: string): Draft => ({ tipo: 'otro', titulo: '', fecha, fecha_fin: '', monto: '', notas: '', responsable: '', destacado: false, hecho: false })
const draftDe = (h: HitoLocal): Draft => ({ tipo: h.tipo, titulo: h.titulo, fecha: h.fecha ?? '', fecha_fin: h.fecha_fin ?? '', monto: h.monto != null ? String(h.monto) : '', notas: h.notas ?? '', responsable: h.responsable ?? '', destacado: !!h.destacado, hecho: h.hecho })
const snap = (f: Ficha, e: EtapasForm, h: HitoLocal[], c: CompuertaLocal[]) => JSON.stringify({ f, e, h, c })

export default function EditorCrono({ crono: inicial, proyectos, rodajesProyecto, feriados: feriadosIniciales }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  const [cronoId] = useState(inicial.id)
  const [ficha, setFicha] = useState<Ficha>(() => fichaDe(inicial))
  const [etapas, setEtapas] = useState<EtapasForm>(() => etapasDe(inicial))
  const [hitos, setHitos] = useState<HitoLocal[]>(() => hitosDe(inicial))
  const [compuertas, setCompuertas] = useState<CompuertaLocal[]>(() => compuertasDe(inicial))
  const [eliminados, setEliminados] = useState<string[]>([])
  const [eliminadasC, setEliminadasC] = useState<string[]>([])
  const [feriados, setFeriados] = useState<Feriado[]>(feriadosIniciales)
  const [popover, setPopover] = useState<Popover | null>(null)
  const [hoy, setHoy] = useState<string | undefined>(undefined)
  const [nuevoFeriado, setNuevoFeriado] = useState({ fecha: '', nombre: '' })

  const [guardadoSnap, setGuardadoSnap] = useState(() => snap(fichaDe(inicial), etapasDe(inicial), hitosDe(inicial), compuertasDe(inicial)))
  const sucio = snap(ficha, etapas, hitos, compuertas) !== guardadoSnap || eliminados.length > 0 || eliminadasC.length > 0

  useEffect(() => { setHoy(hoyIso()) }, [])
  useEffect(() => {
    if (!sucio) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [sucio])
  useEffect(() => {
    if (!popover) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopover(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popover])

  // ─── derivados ─────────────────────────────────────────────────────────────
  const rangos = useMemo(() => aRangos(etapas), [etapas])
  const rango = useMemo(() => rangoCrono(rangos, hitos), [rangos, hitos])
  const semanas = useMemo(() => (hoy || rango ? semanasDelCrono(rango, hoy ?? rango!.desde) : []), [rango, hoy])
  const fer = useMemo(() => mapaFeriados(feriados), [feriados])
  const lectura = useMemo(() => lecturaEtapas(rangos, fer, rango?.hasta), [rangos, fer, rango])
  const avisos = useMemo(() => avisosCrono(rangos, hitos, fer), [rangos, hitos, fer])
  const rodajesConfirmados = useMemo(() => new Set(rodajesProyecto.filter((r) => r.estado === 'confirmado').map((r) => r.id)), [rodajesProyecto])
  const grupos = useMemo(() => evaluarCompuertas(compuertas, hitos, rodajesConfirmados), [compuertas, hitos, rodajesConfirmados])
  const pagos = useMemo(() => totalPagos(hitos), [hitos])
  const frases = useMemo(() => {
    const ord = hitosOrdenados(hitos)
    const rod = ord.find((h) => h.tipo === 'rodaje' && fechaValida(h.fecha))
    const dev = ord.find((h) => h.tipo === 'devolucion' && fechaValida(h.fecha))
    const out: { texto: string; valor: string }[] = []
    if (rod) {
      const finRod = fechaValida(rod.fecha_fin) ? rod.fecha_fin : rod.fecha!
      ord.filter((h) => h.tipo === 'entrega' && fechaValida(h.fecha) && diaNum(h.fecha) > diaNum(finRod)).slice(0, 2)
        .forEach((h) => out.push({ texto: `Post hasta ${h.titulo || 'la entrega'}:`, valor: `${diasHabiles(sumarDias(finRod, 1), h.fecha, fer)} hábiles` }))
      if (dev && diaNum(dev.fecha!) < diaNum(rod.fecha!)) out.push({ texto: 'De la devolución al rodaje:', valor: `${diasHabiles(sumarDias(dev.fecha!, 1), sumarDias(rod.fecha!, -1), fer)} hábiles` })
    }
    return out
  }, [hitos, fer])
  const proximo = useMemo(() => {
    if (!hoy) return null
    const p = proximoHitoClave(hitos, hoy)
    return p && p.fecha ? { titulo: p.titulo || nombreTipoHito(p.tipo), fecha: p.fecha, dias: diaNum(p.fecha) - diaNum(hoy) } : null
  }, [hitos, hoy])
  const quincena = useMemo(() => (hoy ? hitosEntre(hitos, hoy, sumarDias(hoy, 13)) : []), [hitos, hoy])
  const feriadosEnRango = useMemo(() => (rango ? feriados.filter((f) => diaNum(f.fecha) >= diaNum(rango.desde) - 7 && diaNum(f.fecha) <= diaNum(rango.hasta) + 7) : []), [feriados, rango])
  const clienteProyecto = inicial.proyecto?.id === ficha.proyecto_id ? inicial.proyecto?.cliente?.nombre ?? null : null
  const rodajesSinImportar = rodajesProyecto.filter((r) => !hitos.some((h) => h.rodaje_id === r.id))

  // ─── guardar / eliminar / importar ─────────────────────────────────────────
  function guardar() {
    if (!ficha.nombre.trim()) { toastError('El crono necesita un nombre'); return }
    for (const e of ETAPAS_CRONO) if (rangoInvertido(etapas[e.id].desde, etapas[e.id].hasta)) { toastError(`${e.nombre}: la fecha de fin es anterior al inicio`); return }
    if (compuertas.some((c) => !c.texto.trim())) { toastError('Hay un check sin texto'); return }
    startTransition(async () => {
      try {
        const r = await guardarCrono(cronoId, {
          nombre: ficha.nombre.trim(), proyecto_id: ficha.proyecto_id || null, cliente: ficha.cliente, responsable: ficha.responsable, notas: ficha.notas, estado: ficha.estado,
          etapas, hitos, eliminar: eliminados, compuertas, eliminar_compuertas: eliminadasC,
        })
        if (r.error || !r.crono) { toastError(r.error ?? 'No se pudo guardar'); momento('error', { mensaje: 'No se pudo guardar el crono' }); return }
        setFicha(fichaDe(r.crono)); setEtapas(etapasDe(r.crono)); setHitos(hitosDe(r.crono)); setCompuertas(compuertasDe(r.crono)); setEliminados([]); setEliminadasC([])
        setGuardadoSnap(snap(fichaDe(r.crono), etapasDe(r.crono), hitosDe(r.crono), compuertasDe(r.crono)))
        momento('guardado', { mensaje: 'Crono guardado' })
      } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar el crono') }
    })
  }
  async function borrarCrono() {
    if (!(await confirm(`¿Eliminar el crono "${ficha.nombre}"? Se borran también sus hitos y compuertas.`))) return
    startTransition(async () => {
      try {
        const r = await eliminarCrono(cronoId)
        if (r.error) { toastError(r.error); return }
        momento('item.eliminado'); router.push('/cronos')
      } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo eliminar') }
    })
  }
  function importarRodajes() {
    if (sucio) { toastError('Guarda los cambios antes de importar rodajes'); return }
    startTransition(async () => {
      try {
        const r = await importarRodajesAlCrono(cronoId)
        if (r.error || !r.crono) { toastError(r.error ?? 'No se pudo importar'); return }
        setHitos(hitosDe(r.crono)); setGuardadoSnap(snap(ficha, etapas, hitosDe(r.crono), compuertas))
        momento('item.agregado', { mensaje: `${r.creados ?? 0} rodaje${r.creados === 1 ? '' : 's'} importado${r.creados === 1 ? '' : 's'}` })
      } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo importar') }
    })
  }

  // ─── feriados (globales, se guardan al tiro) ───────────────────────────────
  function agregarFeriado() {
    const { fecha, nombre } = nuevoFeriado
    if (!fechaValida(fecha) || !nombre.trim()) { toastError('Feriado: fecha y nombre'); return }
    startTransition(async () => {
      try {
        const r = await crearFeriado(fecha, nombre.trim())
        if (r.error) { toastError(r.error); return }
        setFeriados((fs) => [...fs.filter((f) => f.fecha !== fecha), { fecha, nombre: nombre.trim() }].sort((a, b) => a.fecha.localeCompare(b.fecha)))
        setNuevoFeriado({ fecha: '', nombre: '' })
        momento('item.agregado')
      } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo guardar el feriado') }
    })
  }
  function quitarFeriado(fecha: string) {
    startTransition(async () => {
      try {
        const r = await eliminarFeriado(fecha)
        if (r.error) { toastError(r.error); return }
        setFeriados((fs) => fs.filter((f) => f.fecha !== fecha)); momento('item.eliminado')
      } catch (e) { toastError(e instanceof Error ? e.message : 'No se pudo quitar el feriado') }
    })
  }

  // ─── hitos ─────────────────────────────────────────────────────────────────
  function posicion(e: React.MouseEvent<HTMLElement>) {
    const W = 340, H = 470
    return { x: Math.max(8, Math.min(e.clientX + 8, window.innerWidth - W - 12)), y: Math.max(8, Math.min(e.clientY + 8, window.innerHeight - H - 12)) }
  }
  const abrirNuevo = (iso: string, e: React.MouseEvent<HTMLElement>) => setPopover({ hitoId: null, ...posicion(e), draft: draftVacio(iso) })
  function abrirEditar(id: string, e: React.MouseEvent<HTMLElement>) {
    const h = hitos.find((x) => x.id === id)
    if (h) setPopover({ hitoId: id, ...posicion(e), draft: draftDe(h) })
  }
  function moverHito(id: string, isoDestino: string) {
    setHitos((hs) => hs.map((h) => {
      if (h.id !== id || !fechaValida(h.fecha)) return h
      const delta = diaNum(isoDestino) - diaNum(h.fecha)
      return { ...h, fecha: isoDestino, fecha_fin: fechaValida(h.fecha_fin) ? sumarDias(h.fecha_fin, delta) : null }
    }))
  }
  function confirmarPopover() {
    if (!popover) return
    const d = popover.draft
    if (d.fecha && !fechaValida(d.fecha)) { toastError('Fecha inválida'); return }
    if (!d.fecha && !popover.hitoId) { toastError('El hito necesita una fecha'); return }
    if (d.fecha_fin && fechaValida(d.fecha_fin) && diaNum(d.fecha_fin) <= diaNum(d.fecha)) { toastError('"Hasta" debe ser posterior a la fecha'); return }
    const base = {
      tipo: d.tipo, titulo: d.titulo.trim(), fecha: d.fecha || null,
      fecha_fin: d.fecha_fin && fechaValida(d.fecha_fin) ? d.fecha_fin : null,
      etapa: etapaSugeridaParaTipo(d.tipo),
      monto: d.tipo === 'pago' ? montoONull(d.monto) : null,
      notas: d.notas.trim() || null, responsable: d.responsable.trim() || null, destacado: DESTACABLES.has(d.tipo) && d.destacado, hecho: d.hecho,
    }
    if (popover.hitoId) {
      setHitos((hs) => hs.map((h) => (h.id === popover.hitoId ? { ...h, ...base } : h)))
      asegurarCheckEntrega(popover.hitoId, base.tipo, base.titulo)
    } else {
      const id = crypto.randomUUID()
      setHitos((hs) => [...hs, { id, orden: hs.length, rodaje_id: null, ...base }])
      asegurarCheckEntrega(id, base.tipo, base.titulo)
      momento('item.agregado')
    }
    setPopover(null)
  }
  // Cada entrega tiene su check automático en "Cerrar el proyecto" (pedido de Tomás).
  function asegurarCheckEntrega(hitoId: string, tipo: TipoHitoCrono, titulo: string) {
    if (tipo !== 'entrega') return
    setCompuertas((cs) => {
      if (cs.some((c) => c.hito_id === hitoId)) return cs
      const enCierre = cs.filter((c) => c.destino === 'cierre')
      const pagoFinal = enCierre.findIndex((c) => c.hito_id == null && /pago final/i.test(c.texto))
      const nueva: CompuertaLocal = { id: crypto.randomUUID(), destino: 'cierre', orden: 0, texto: textoCheckEntrega({ titulo }), hito_id: hitoId, responsable: null, hecho: false }
      // antes del "Pago final cobrado" si existe, si no al final del grupo
      const idxPago = pagoFinal >= 0 ? cs.indexOf(enCierre[pagoFinal]) : -1
      const out = idxPago >= 0 ? [...cs.slice(0, idxPago), nueva, ...cs.slice(idxPago)] : [...cs, nueva]
      return out.map((c, i) => ({ ...c, orden: i }))
    })
  }
  function abrirHitoPorId(id: string, e: React.MouseEvent<HTMLElement>) { abrirEditar(id, e) }
  function quitarHitoPorId(id: string) {
    setHitos((hs) => hs.filter((h) => h.id !== id)); setEliminados((xs) => [...xs, id])
    setCompuertas((cs) => cs.map((c) => (c.hito_id === id ? { ...c, hito_id: null } : c)))
    momento('item.eliminado')
  }
  function eliminarHito() {
    if (!popover?.hitoId) return
    const id = popover.hitoId
    setHitos((hs) => hs.filter((h) => h.id !== id)); setEliminados((xs) => [...xs, id])
    setCompuertas((cs) => cs.map((c) => (c.hito_id === id ? { ...c, hito_id: null } : c)))
    momento('item.eliminado'); setPopover(null)
  }
  const setDraft = (patch: Partial<Draft>) => setPopover((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p))

  // ─── compuertas ────────────────────────────────────────────────────────────
  const toggleCompuerta = (id: string, hecho: boolean) => setCompuertas((cs) => cs.map((c) => (c.id === id ? { ...c, hecho } : c)))
  const editarCompuerta = (id: string, campos: { texto?: string; responsable?: string | null; hito_id?: string | null }) => setCompuertas((cs) => cs.map((c) => (c.id === id ? { ...c, ...campos } : c)))
  const agregarCompuerta = (destino: DestinoCompuerta) => setCompuertas((cs) => [...cs, { id: crypto.randomUUID(), destino, orden: cs.length, texto: 'Nuevo check', hito_id: null, responsable: null, hecho: false }])
  const quitarCompuerta = (id: string) => { setCompuertas((cs) => cs.filter((c) => c.id !== id)); setEliminadasC((xs) => [...xs, id]) }
  const moverCompuerta = (id: string, destino: DestinoCompuerta, antesDe: string | null) =>
    setCompuertas((cs) => {
      const item = cs.find((c) => c.id === id)
      if (!item || id === antesDe) return cs
      const sin = cs.filter((c) => c.id !== id)
      const movido = { ...item, destino }
      let out: CompuertaLocal[]
      if (antesDe) {
        const i = sin.findIndex((c) => c.id === antesDe)
        out = i >= 0 ? [...sin.slice(0, i), movido, ...sin.slice(i)] : [...sin, movido]
      } else {
        // al final del grupo destino
        let last = -1
        sin.forEach((c, i) => { if (c.destino === destino) last = i })
        out = [...sin.slice(0, last + 1), movido, ...sin.slice(last + 1)]
      }
      return out.map((c, i) => ({ ...c, orden: i }))
    })

  const cliente = ficha.cliente || clienteProyecto || null

  return (
    <div className="p-4 lg:p-6 flex flex-col gap-3 min-h-screen">
      {ConfirmDialog}

      {/* Chrome de Hilván: una línea */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={ficha.proyecto_id ? `/proyectos/${ficha.proyecto_id}` : '/cronos'} className="font-body text-xs text-ch-muted hover:text-ch-cream transition-colors">← {ficha.proyecto_id ? 'Proyecto' : 'Cronos'}</Link>
          <select value={ficha.proyecto_id} onChange={(e) => setFicha({ ...ficha, proyecto_id: e.target.value })} className={inputCls} title="Proyecto (opcional)">
            <option value="">Sin proyecto</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select value={ficha.estado} onChange={(e) => setFicha({ ...ficha, estado: e.target.value as EstadoCrono })} className={inputCls} title="Estado">
            {ESTADOS.map((s) => <option key={s} value={s}>{ESTADO_CRONO_LABELS[s]}</option>)}
          </select>
          <input value={ficha.cliente} onChange={(e) => setFicha({ ...ficha, cliente: e.target.value })} placeholder={clienteProyecto ? `Cliente: ${clienteProyecto}` : 'Cliente'} className={`${inputCls} w-40`} />
          <input value={ficha.responsable} onChange={(e) => setFicha({ ...ficha, responsable: e.target.value })} placeholder="Responsable" className={`${inputCls} w-32`} />
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-body text-[11px] ${sucio ? 'text-ch-gold' : 'text-ch-subtle'}`}>{sucio ? '● Sin guardar' : '✓ Guardado'}</span>
          <a
            href={`/api/cronos/${cronoId}/pdf`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { if (sucio) { e.preventDefault(); toastError('Guarda antes de exportar: el PDF sale de lo guardado') } }}
            className={`font-body text-[10px] tracking-[0.3em] uppercase px-3 py-2.5 border border-ch-border transition-colors ch-press ${sucio ? 'text-ch-subtle' : 'text-ch-muted hover:text-ch-cream'}`}
            title={sucio ? 'Guarda primero: el PDF sale de lo guardado' : 'La hoja en una A4 horizontal'}
          >
            Exportar PDF
          </a>
          <button type="button" onClick={borrarCrono} disabled={isPending} className="font-body text-[10px] tracking-[0.3em] uppercase px-3 py-2.5 border border-ch-border text-ch-muted hover:text-red-400 hover:border-red-400/40 transition-colors disabled:opacity-50 ch-press">Eliminar</button>
          <button type="button" onClick={guardar} disabled={isPending || !sucio} className="font-body text-[10px] tracking-[0.3em] uppercase px-5 py-2.5 text-ch-black transition-colors disabled:opacity-40 ch-press" style={{ background: CH.lila }}>{isPending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* LA HOJA */}
        <div className="flex-1 min-w-0 w-full font-body flex flex-col gap-3" style={{ background: CH.blanco, color: CH.negro, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, borderBottom: `1.5px solid ${CH.negro}`, paddingBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0, flex: 1 }}>
              <input value={ficha.nombre} onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })} placeholder="Nombre del crono" aria-label="Nombre del crono" className="font-display italic bg-transparent focus:outline-none min-w-0 flex-1" style={{ fontSize: 26, lineHeight: 1, color: CH.negro, border: 'none', borderBottom: '1px solid transparent', maxWidth: 560 }} />
              <span style={{ fontSize: 11, color: CH.gris, whiteSpace: 'nowrap' }}>Cronograma{cliente ? ` · ${cliente}` : ''}</span>
            </div>
            <input value={ficha.notas} onChange={(e) => setFicha({ ...ficha, notas: e.target.value })} placeholder="Nota al pie (condiciones, supuestos)" className="bg-transparent focus:outline-none text-right" style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: CH.gris, border: 'none', width: 320 }} />
          </div>
          <EtapasHoja lectura={lectura} etapas={rangos} onCambiar={(id, campo, valor) => setEtapas({ ...etapas, [id]: { ...etapas[id], [campo]: valor } })} />
          <TiraGeneral etapas={rangos} hitos={hitos} hoy={hoy} />
          {semanas.length > 0 ? (
            <CalendarioHoja etapas={rangos} hitos={hitos} semanas={semanas} feriados={fer} hoy={hoy} rango={rango} seleccionado={popover?.hitoId ?? null} onClickDia={abrirNuevo} onClickHito={abrirEditar} onMoverHito={moverHito} />
          ) : <div style={{ height: 120 }} />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <LeyendaHoja />
            <span style={{ fontSize: 9, color: CH.grisClaro }}>clic en un día crea un hito · clic en un hito lo edita · arrastra para mover</span>
          </div>
        </div>

        {/* EL PANEL */}
        <aside className="w-full xl:w-[360px] shrink-0 flex flex-col gap-6">
          <PanelLectura lectura={lectura} frases={frases} proximo={proximo} avisos={avisos} onMoverA={(id, iso) => moverHito(id, iso)} onAbrirHito={abrirHitoPorId} onQuitarHito={quitarHitoPorId} />
          <PanelCompuertas grupos={grupos} hitos={hitos} onToggle={toggleCompuerta} onEditar={editarCompuerta} onAgregar={agregarCompuerta} onQuitar={quitarCompuerta} onMover={moverCompuerta} />
          <PanelSemana hitos={quincena} titulo="Esta semana y la próxima" />
          <PanelPagos total={pagos.total} cobrado={pagos.cobrado} pendiente={pagos.pendiente} />
          {rodajesSinImportar.length > 0 && (
            <button type="button" onClick={importarRodajes} disabled={isPending} className="self-start font-body text-[9px] tracking-[0.2em] uppercase px-2.5 py-1 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50" title="Crea un hito Rodaje por cada rodaje del proyecto que aún no esté en el crono">
              ↓ Importar {rodajesSinImportar.length} rodaje{rodajesSinImportar.length === 1 ? '' : 's'} del proyecto
            </button>
          )}
          <div className="flex flex-col gap-2">
            <span className={lblCls}>Feriados en el rango</span>
            {feriadosEnRango.length === 0 ? <span className="font-body text-xs text-ch-subtle">Ninguno.</span> : (
              <div className="flex flex-col gap-1 font-body text-xs text-ch-cream">
                {feriadosEnRango.map((f) => (
                  <div key={f.fecha} className="flex justify-between gap-2"><span>{formatoDia(f.fecha)} · {f.nombre}</span><button type="button" onClick={() => quitarFeriado(f.fecha)} className="text-ch-subtle hover:text-ch-cream" title="Quitar feriado">✕</button></div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input type="date" value={nuevoFeriado.fecha} onChange={(e) => setNuevoFeriado({ ...nuevoFeriado, fecha: e.target.value })} className={`${inputCls} w-32`} aria-label="Fecha del feriado" />
              <input value={nuevoFeriado.nombre} onChange={(e) => setNuevoFeriado({ ...nuevoFeriado, nombre: e.target.value })} placeholder="Nombre" className={`${inputCls} flex-1 min-w-0`} onKeyDown={(e) => { if (e.key === 'Enter') agregarFeriado() }} />
              <button type="button" onClick={agregarFeriado} disabled={isPending} className="font-body text-[9px] tracking-[0.2em] uppercase px-2 border border-ch-border text-ch-muted hover:text-ch-cream transition-colors">+</button>
            </div>
          </div>
        </aside>
      </div>

      {/* Ventana de hito */}
      {popover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopover(null)} />
          <div className="fixed z-50 w-[340px] bg-ch-black border border-ch-border p-4 flex flex-col gap-3 ch-modal-panel" style={{ left: popover.x, top: popover.y }}>
            <div className="flex items-baseline justify-between">
              <span className={lblCls}>{popover.hitoId ? 'Hito' : 'Nuevo hito'} · {formatoDia(popover.draft.fecha)}</span>
              <button type="button" onClick={() => setPopover(null)} className="text-ch-muted hover:text-ch-cream text-sm leading-none">✕</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {TIPOS_HITO_CRONO.map((t) => {
                const on = popover.draft.tipo === t.id
                return (
                  <button key={t.id} type="button" onClick={() => setDraft({ tipo: t.id })} className={`font-body text-[9px] tracking-[0.15em] uppercase px-2 py-1 border transition-colors ${on ? 'border-ch-cream text-ch-cream' : 'border-ch-border text-ch-muted hover:text-ch-cream'}`} style={on && t.id === 'pago' ? { borderColor: CH.amarillo, color: CH.amarillo } : undefined}>
                    {t.nombre}
                  </button>
                )
              })}
            </div>
            <textarea autoFocus rows={2} value={popover.draft.titulo} onChange={(e) => setDraft({ titulo: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmarPopover() } }} placeholder={`${nombreTipoHito(popover.draft.tipo)} — título (Enter guarda)`} className={`${inputCls} w-full resize-y leading-snug`} />
            <textarea rows={3} value={popover.draft.notas} onChange={(e) => setDraft({ notas: e.target.value })} placeholder="Detalle — se muestra bajo el título en el calendario" className={`${inputCls} w-full resize-y leading-snug`} />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className={lblCls}>Fecha</span><input type="date" value={popover.draft.fecha} onChange={(e) => setDraft({ fecha: e.target.value })} className={`${inputCls} w-full`} /></label>
              <label className="flex flex-col gap-1"><span className={lblCls}>Hasta</span><input type="date" value={popover.draft.fecha_fin} onChange={(e) => setDraft({ fecha_fin: e.target.value })} className={`${inputCls} w-full`} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1"><span className={lblCls}>Responsable</span><input value={popover.draft.responsable} onChange={(e) => setDraft({ responsable: e.target.value })} placeholder="Natalia" className={`${inputCls} w-full`} /></label>
              {popover.draft.tipo === 'pago' && (
                <label className="flex flex-col gap-1"><span className={lblCls}>Monto CLP neto</span><input inputMode="numeric" value={popover.draft.monto} onChange={(e) => setDraft({ monto: e.target.value })} placeholder="3500000" className={`${inputCls} w-full font-mono`} />
                  {montoONull(popover.draft.monto) != null && <span className="font-body text-[10px] text-ch-subtle">{formatCLP(montoONull(popover.draft.monto)!)}</span>}</label>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 font-body text-[11px] text-ch-muted cursor-pointer">
                  <input type="checkbox" checked={popover.draft.hecho} onChange={(e) => setDraft({ hecho: e.target.checked })} className="accent-[#e6e2ed]" />
                  {popover.draft.tipo === 'pago' ? 'Cobrado' : 'Hecho'}
                </label>
                {DESTACABLES.has(popover.draft.tipo) && (
                  <label className="flex items-center gap-2 font-body text-[11px] text-ch-muted cursor-pointer" title="Va destacado en la hoja, como el rodaje (p. ej. la entrega final).">
                    <input type="checkbox" checked={popover.draft.destacado} onChange={(e) => setDraft({ destacado: e.target.checked })} className="accent-[#e6e2ed]" />
                    Destacar
                  </label>
                )}
              </div>
              <div className="flex gap-2">
                {popover.hitoId && <button type="button" onClick={eliminarHito} className="font-body text-[9px] tracking-[0.2em] uppercase px-3 py-2 border border-ch-border text-ch-muted hover:text-red-400 hover:border-red-400/40 transition-colors">Quitar</button>}
                <button type="button" onClick={confirmarPopover} className="font-body text-[9px] tracking-[0.2em] uppercase px-3 py-2 text-ch-black transition-colors" style={{ background: CH.lila }}>{popover.hitoId ? 'Listo' : 'Agregar'}</button>
              </div>
            </div>
            {popover.hitoId && esHitoClave(popover.draft.tipo) && <span className="font-body text-[10px] text-ch-subtle">Hito clave: aparece en la tira general y se marca solo en las compuertas que lo usen.</span>}
            {!popover.hitoId && fechaValida(popover.draft.fecha) && fer.has(popover.draft.fecha) && <span className="font-body text-[10px]" style={{ color: CH.amarillo }}>Ojo: {formatoCorto(popover.draft.fecha)} es feriado ({fer.get(popover.draft.fecha)}).</span>}
          </div>
        </>
      )}
    </div>
  )
}
