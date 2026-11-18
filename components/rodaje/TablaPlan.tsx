'use client'

import { useState, useEffect, useRef } from 'react'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import { subirImagenBloque, eliminarImagenBloque } from '@/lib/supabase/storage-rodaje'
import {
  RodajeBloque, RodajeLocacion, BloqueEstilo, PLANTILLAS_BLOQUES,
  calcularCascada, aplicarCambioTiempo, moverBloque,
  minutosAHora, horaAMinutos,
} from '@/types'
import TimelineView from './TimelineView'
import BloqueLibre from './BloqueLibre'

// ─── Constantes ───────────────────────────────────────────────────────────────

const COLORES_RAPIDOS = [
  '#353135', '#C11700', '#E6E2ED', '#1a1a2e',
  '#16213e', '#0f3460', '#533483', '#2d6a4f',
  '#d62828', '#f77f00', '#fcbf49', '#eae2b7',
]

const COLOR_BASE = '#353135'

/** Color de la fila entera: el color del bloque, suave, para leer el plan de un vistazo. */
function tinteFila(color?: string): string | undefined {
  if (!color || color.toLowerCase() === COLOR_BASE) return undefined
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return undefined
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.2)`
}

/** Duración tecleada: «90», «1:30», «1h30», «1h». */
function parseDuracion(v: string): number {
  const t = v.trim().toLowerCase()
  const hm = /^(\d+)\s*(?:h|:)\s*(\d{0,2})$/.exec(t)
  if (hm) return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0)
  return parseInt(t, 10)
}

// ─── Texto que crece ──────────────────────────────────────────────────────────
// Un <input> corta la frase en una línea; esto muestra el texto completo y crece con él.

function AutoTextarea({ value, onChange, placeholder, className = '' }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } }}
      className={`resize-none overflow-hidden bg-transparent focus:outline-none focus:bg-ch-surface focus:rounded-[2px] px-1 w-full leading-snug ${className}`}
    />
  )
}

// ─── TimeInput ────────────────────────────────────────────────────────────────

function TimeInput({ value, onBlur, placeholder = '--:--', className = '' }: {
  value?: string | null
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

// ─── Tabla del plan ───────────────────────────────────────────────────────────

export default function TablaPlan({
  rodajeId, bloques, bloquesRaiz, cascada, locaciones, creando,
  mostrarPlantillas, setMostrarPlantillas,
  vistaTimeline, setVistaTimeline,
  onActualizar, onCrear, onCrearDesdePlantilla, onEliminar,
  seleccionadoId = null, onSeleccionar, titulo, fecha,
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
  /** Fila seleccionada (Ctrl+C / Ctrl+V / Delete la usan). */
  seleccionadoId?: string | null
  onSeleccionar?: (id: string) => void
  /** Encabezado de la hoja del timeline (lo que se imprime). */
  titulo?: string
  fecha?: string | null
}) {
  const [buscarBloque, setBuscarBloque] = useState('')
  const bloqueCoincide = (b: RodajeBloque) => {
    if (!buscarBloque.trim()) return true
    const needle = buscarBloque.trim().toLowerCase()
    return Boolean(
      b.titulo?.toLowerCase().includes(needle) ||
      b.scenes_label?.toLowerCase().includes(needle) ||
      b.descripcion?.toLowerCase().includes(needle)
    )
  }
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

  const subirYAsignar = async (bloqueId: string, file: File) => {
    setSubiendoImagen(bloqueId)
    try {
      const anterior = bloques.find(b => b.id === bloqueId)?.imagen_url
      const url = await subirImagenBloque(file, rodajeId, bloqueId)
      // La URL entra al plan local; el autoguardado la sube con el resto.
      momento('subido', { mensaje: '' })
      onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, imagen_url: url } : b))
      if (anterior) eliminarImagenBloque(anterior).catch(() => {})
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al subir imagen')
    } finally {
      setSubiendoImagen(null)
    }
  }

  const handleArchivoSeleccionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const bloqueId = bloqueParaImagenRef.current
    if (!file || !bloqueId) return
    e.target.value = ''
    await subirYAsignar(bloqueId, file)
  }

  const handleEliminarImagen = async (bloqueId: string, url: string) => {
    try {
      await eliminarImagenBloque(url)
      momento('item.eliminado')
      onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, imagen_url: null } : b))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar imagen')
    }
  }

  const actualizarCelda = (bloqueId: string, campo: string, valor: any) => {
    onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, [campo]: valor } : b))
  }

  const actualizarTiempo = (bloqueId: string, campo: 'inicio' | 'fin' | 'duracion', valorStr: string) => {
    if (!valorStr) return
    const valorMin = campo === 'duracion' ? parseDuracion(valorStr) : horaAMinutos(valorStr)
    if (isNaN(valorMin)) return
    onActualizar(aplicarCambioTiempo(bloques, bloqueId, campo, valorMin))
  }

  // Ancla el bloque a su hora actual de cascada (la congela ahí). Solo tiene
  // sentido si ya hay una hora calculada (si no, el usuario debe tipearla).
  const anclarAqui = (bloqueId: string, inicioMin: number | undefined) => {
    if (inicioMin === undefined) return
    onActualizar(aplicarCambioTiempo(bloques, bloqueId, 'inicio', inicioMin))
  }

  // Quita el ancla: el bloque vuelve a seguir el fin del bloque anterior.
  const desanclar = (bloqueId: string) => {
    // Solo local: el autoguardado manda el null (ya no se pierde en el camino).
    onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, hora_inicio_fija: null, hora_fin: null, es_anclado: false } : b))
  }

  // ── Arrastrar filas ──
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null)
  const [sobreIdx, setSobreIdx] = useState<number | null>(null)
  const origenIdx = arrastrandoId ? bloquesRaiz.findIndex(b => b.id === arrastrandoId) : -1

  const terminarArrastre = () => { setArrastrandoId(null); setSobreIdx(null) }
  const soltarEn = (idx: number) => {
    if (arrastrandoId) onActualizar(moverBloque(bloques, arrastrandoId, idx))
    terminarArrastre()
  }
  const empezarArrastre = (e: React.DragEvent, id: string) => {
    setArrastrandoId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const fila = (e.currentTarget as HTMLElement).closest('[data-fila]') as HTMLElement | null
    if (fila) e.dataTransfer.setDragImage(fila, 12, 12)
  }
  const propsDestino = (idx: number) => ({
    onDragOver: (e: React.DragEvent) => { if (!arrastrandoId) return; e.preventDefault(); if (sobreIdx !== idx) setSobreIdx(idx) },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); soltarEn(idx) },
  })
  // Línea verde donde va a caer la fila: arriba si sube, abajo si baja.
  const lineaDestino = (idx: number) =>
    arrastrandoId && sobreIdx === idx && origenIdx !== idx
      ? (idx < origenIdx ? 'shadow-[inset_0_2px_0_0_#7a9e7e]' : 'shadow-[inset_0_-2px_0_0_#7a9e7e]')
      : ''

  // Alt + ↑/↓ mueve la fila seleccionada (sin ratón).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || !seleccionadoId || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
      const t = (document.activeElement as HTMLElement | null)?.tagName
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return
      const i = bloquesRaiz.findIndex(b => b.id === seleccionadoId)
      if (i === -1) return
      e.preventDefault()
      onActualizar(moverBloque(bloques, seleccionadoId, i + (e.key === 'ArrowUp' ? -1 : 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ch-border">
        <div className="flex items-center gap-3">
          <span className="text-xs text-ch-muted uppercase tracking-wider">Plan de rodaje</span>
          <div className="flex border border-ch-border rounded-[2px] overflow-hidden">
            <button
              onClick={() => setVistaTimeline(false)}
              className={`text-xs px-2 py-0.5 transition-colors ${!vistaTimeline ? 'bg-ch-surface text-ch-cream' : 'text-ch-subtle hover:text-ch-muted'} ch-press`}
            >
              ☰ Tabla
            </button>
            <button
              onClick={() => setVistaTimeline(true)}
              className={`text-xs px-2 py-0.5 transition-colors border-l border-ch-border ${vistaTimeline ? 'bg-ch-surface text-ch-cream' : 'text-ch-subtle hover:text-ch-muted'} ch-press`}
            >
              ▬ Timeline
            </button>
          </div>
          <input
            type="text"
            value={buscarBloque}
            onChange={e => setBuscarBloque(e.target.value)}
            placeholder="Buscar bloque…"
            className="w-40 bg-transparent border border-ch-border rounded-[2px] px-2 py-1 text-xs text-ch-cream placeholder:text-ch-border focus:outline-none focus:border-ch-cream/40"
          />
        </div>
        <div className="flex gap-2 relative" ref={plantillasRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMostrarPlantillas(!mostrarPlantillas) }}
            className="text-xs text-ch-muted border border-ch-border px-3 py-1 rounded-[2px] hover:border-ch-muted hover:text-ch-cream transition-colors ch-press"
          >
            + Plantilla
          </button>
          <button
            onClick={() => onCrear({ titulo: 'Nuevo bloque', tipo: 'rodaje', duracion_min: 30 })}
            disabled={creando}
            className="text-xs text-ch-muted border border-ch-border px-3 py-1 rounded-[2px] hover:border-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50 ch-press"
          >
            {creando ? '...' : '+ Bloque'}
          </button>
          <button
            onClick={() => onCrear({ titulo: 'Libre', tipo: 'libre', duracion_min: 0 })}
            disabled={creando}
            title="Lienzo libre: pega imágenes, chistes, notas con tu propia letra y color"
            className="text-xs bg-ch-cream text-ch-dark font-medium px-3 py-1 rounded-[2px] hover:bg-white transition-colors disabled:opacity-50 ch-press"
          >
            + Libre
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
                  className="w-full text-left px-3 py-2 text-sm text-ch-muted hover:bg-ch-dark transition-colors flex items-center justify-between disabled:opacity-50 ch-press"
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

      {/* Desktop: scroll horizontal en vez de recortar columnas si no entra el ancho */}
      <div className={`${vistaTimeline ? 'hidden' : 'hidden lg:block'} overflow-x-auto`}>
        <div className="min-w-[900px]">
          {/* Headers desktop */}
          <div className="grid border-b border-ch-border px-2 py-1.5 text-xs text-ch-border uppercase tracking-wider select-none"
            style={{ gridTemplateColumns: '22px 84px 1.3fr 76px 1fr 34px 34px 84px 60px 50px 40px 48px' }}>
            <span />
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
        </div>
      </div>

      {vistaTimeline ? (
        <TimelineView bloquesRaiz={bloquesRaiz} cascada={cascada} titulo={titulo} fecha={fecha} />
      ) : bloquesRaiz.length === 0 ? (
        <div className="text-center py-12 text-ch-subtle text-sm">
          <p>El plan está vacío.</p>
          <button onClick={() => onCrear({ titulo: 'Nuevo bloque', tipo: 'rodaje', duracion_min: 30 })}
            className="text-ch-cream mt-2 inline-block hover:underline ch-press">
            Agregar primer bloque →
          </button>
        </div>
      ) : buscarBloque.trim() && !bloquesRaiz.some(bloqueCoincide) ? (
        <div className="text-center py-12 text-ch-subtle text-sm">
          <p>Sin bloques que coincidan con &ldquo;{buscarBloque}&rdquo;.</p>
        </div>
      ) : (
        <div className="lg:overflow-x-auto" onClick={() => { setVisibilidadAbierta(null); setColorPickerAbierto(null) }}>
        <div className="lg:min-w-[900px]">
          {bloquesRaiz.map((bloque, idx) => {
            // Filtro de búsqueda: NO se saca del array (desincronizaría los
            // índices que cascada[idx] usa para calcular horarios) — solo se
            // oculta la fila.
            if (!bloqueCoincide(bloque)) return null

            // Bloque libre: lienzo expresivo a todo lo ancho (fuera de la grilla).
            if (bloque.tipo === 'libre') {
              return (
                <div key={bloque.id} data-fila className={`relative ${lineaDestino(idx)} ${arrastrandoId === bloque.id ? 'opacity-40' : ''}`} {...propsDestino(idx)}>
                  <span
                    draggable
                    onDragStart={e => empezarArrastre(e, bloque.id)}
                    onDragEnd={terminarArrastre}
                    title="Arrastra para mover"
                    className="hidden lg:flex absolute left-0 top-0 bottom-0 w-[22px] items-center justify-center text-ch-border hover:text-ch-muted cursor-grab active:cursor-grabbing select-none z-10"
                  >⠿</span>
                  <div className="lg:pl-[22px]">
                    <BloqueLibre
                      bloque={bloque}
                      subiendo={subiendoImagen === bloque.id}
                      onCampo={(campo, valor) => actualizarCelda(bloque.id, campo, valor)}
                      onEstilo={(parcial: Partial<BloqueEstilo>) =>
                        actualizarCelda(bloque.id, 'estilo', { ...(bloque.estilo || {}), ...parcial })}
                      onSubirImagen={(file) => subirYAsignar(bloque.id, file)}
                      onEliminarImagen={() => bloque.imagen_url && handleEliminarImagen(bloque.id, bloque.imagen_url)}
                      onEliminar={() => onEliminar(bloque.id)}
                    />
                  </div>
                </div>
              )
            }

            const casc = cascada[idx]
            const isExpandido = expandidoMobil === bloque.id
            const isEliminando = confirmarEliminar === bloque.id

            const tinte = tinteFila(bloque.scenes_color)
            const colorBloque = bloque.scenes_color || COLOR_BASE
            const anclado = Boolean(bloque.hora_inicio_fija)

            return (
              <div
                key={bloque.id}
                data-fila
                className={`${bloque.es_paralelo ? 'opacity-75' : ''} ${arrastrandoId === bloque.id ? 'opacity-40' : ''} ${lineaDestino(idx)}`}
                onClick={() => onSeleccionar?.(bloque.id)}
                {...propsDestino(idx)}
              >

                {/* FILA DESKTOP */}
                <div
                  className={`hidden lg:grid border-b border-ch-border/30 hover:brightness-110 transition-colors group items-start min-h-[34px] border-l-2 ${seleccionadoId === bloque.id ? 'ring-1 ring-inset ring-ch-green/60' : ''}`}
                  style={{ gridTemplateColumns: '22px 84px 1.3fr 76px 1fr 34px 34px 84px 60px 50px 40px 48px', backgroundColor: tinte, borderLeftColor: tinte ? colorBloque : 'transparent' }}
                >
                  {/* Arrastrar */}
                  <div className="flex items-center justify-center self-stretch">
                    <span
                      draggable
                      onDragStart={e => empezarArrastre(e, bloque.id)}
                      onDragEnd={terminarArrastre}
                      onClick={e => e.stopPropagation()}
                      title="Arrastra para mover (o Alt + ↑ ↓)"
                      className="text-ch-border group-hover:text-ch-muted cursor-grab active:cursor-grabbing select-none text-sm leading-none px-1 py-2"
                    >⠿</span>
                  </div>

                  {/* SCENES + color */}
                  <div className="flex items-center gap-1 px-1 py-1.5 relative" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setColorPickerAbierto(colorPickerAbierto === bloque.id ? null : bloque.id)}
                      title="Color de la fila"
                      className="w-3 h-3 rounded-sm shrink-0 border border-ch-border ch-press"
                      style={{ backgroundColor: colorBloque }}
                    />
                    {colorPickerAbierto === bloque.id && (
                      <div className="absolute left-0 top-7 z-30 bg-ch-surface border border-ch-border rounded-[2px] p-2">
                        <div className="grid grid-cols-6 gap-1 mb-2">
                          {COLORES_RAPIDOS.map(c => (
                            <button key={c} onClick={() => { actualizarCelda(bloque.id, 'scenes_color', c); setColorPickerAbierto(null) }}
                              className="w-5 h-5 rounded-sm border border-ch-border hover:scale-110 transition-transform"
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <input type="color" value={bloque.scenes_color || COLOR_BASE}
                          onChange={e => actualizarCelda(bloque.id, 'scenes_color', e.target.value)}
                          className="w-full h-6 rounded cursor-pointer" />
                        {tinte && (
                          <button onClick={() => { actualizarCelda(bloque.id, 'scenes_color', COLOR_BASE); setColorPickerAbierto(null) }}
                            className="w-full mt-2 text-[11px] text-ch-subtle hover:text-ch-muted ch-press">Quitar color</button>
                        )}
                      </div>
                    )}
                    <input
                      value={bloque.scenes_label || ''}
                      onChange={e => actualizarCelda(bloque.id, 'scenes_label', e.target.value)}
                      placeholder="SCENE"
                      className="flex-1 min-w-0 bg-transparent text-xs font-medium focus:outline-none placeholder:text-ch-border truncate"
                      style={{ color: tinte ? colorBloque : '#999' }}
                    />
                  </div>

                  {/* Descripción */}
                  <div className="flex flex-col justify-center px-1 py-1.5">
                    <AutoTextarea value={bloque.titulo} onChange={v => actualizarCelda(bloque.id, 'titulo', v)}
                      className="text-sm text-ch-cream" />
                    <AutoTextarea value={bloque.descripcion || ''} onChange={v => actualizarCelda(bloque.id, 'descripcion', v)}
                      placeholder="subtexto..." className="text-xs text-ch-subtle placeholder:text-ch-border mt-0.5" />
                  </div>

                  {/* Char # */}
                  <div className="px-1 py-1.5">
                    <AutoTextarea value={bloque.character_num || ''} onChange={v => actualizarCelda(bloque.id, 'character_num', v)}
                      placeholder="—" className="text-xs text-ch-muted placeholder:text-ch-border" />
                  </div>

                  {/* Notas */}
                  <div className="px-1 py-1.5">
                    <AutoTextarea value={bloque.nota_previa || ''} onChange={v => actualizarCelda(bloque.id, 'nota_previa', v)}
                      placeholder="notas..." className="text-xs text-ch-muted placeholder:text-ch-border" />
                  </div>

                  {/* D/N */}
                  <div className="flex items-center justify-center py-1.5">
                    <button onClick={() => actualizarCelda(bloque.id, 'dia_noche', bloque.dia_noche === 'D' ? 'N' : 'D')}
                      className={`text-xs w-6 h-6 rounded-[2px] font-medium transition-colors ${bloque.dia_noche === 'N' ? 'bg-ch-surface text-ch-cream' : 'text-ch-subtle hover:text-ch-muted'} ch-press`}>
                      {bloque.dia_noche || 'D'}
                    </button>
                  </div>

                  {/* I/E */}
                  <div className="flex items-center justify-center py-1.5">
                    <button onClick={() => {
                      const ciclo: Record<string, string> = { 'I': 'E', 'E': '-', '-': 'I' }
                      actualizarCelda(bloque.id, 'interior_exterior', ciclo[bloque.interior_exterior || 'I'])
                    }} className="text-xs text-ch-subtle hover:text-ch-muted w-6 h-6 rounded-[2px] transition-colors ch-press">
                      {bloque.interior_exterior || 'I'}
                    </button>
                  </div>

                  {/* INICIO: siempre la hora real; escribirla ancla el bloque */}
                  <div className="px-1 py-2 flex items-center gap-0.5 min-w-0">
                    <TimeInput
                      value={casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : bloque.hora_inicio_fija}
                      onBlur={v => actualizarTiempo(bloque.id, 'inicio', v)}
                      className={`${anclado ? 'text-ch-cream' : 'text-ch-muted'} w-12 !px-0 shrink-0`} />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); anclado ? desanclar(bloque.id) : anclarAqui(bloque.id, casc.inicio_min) }}
                      title={anclado ? 'Hora fija — clic para liberar y seguir al bloque anterior' : 'Sigue al bloque anterior — clic para fijar esta hora'}
                      className={`shrink-0 w-3 text-[9px] leading-none transition-opacity ${anclado ? 'text-ch-gold' : 'text-ch-border opacity-0 group-hover:opacity-100 hover:text-ch-muted'} ch-press`}
                    >
                      📌
                    </button>
                  </div>

                  {/* FIN */}
                  <div className="px-1 py-2">
                    <TimeInput
                      value={casc.fin_min !== undefined ? minutosAHora(casc.fin_min) : bloque.hora_fin}
                      onBlur={v => actualizarTiempo(bloque.id, 'fin', v)}
                      className="text-ch-cream w-full"
                    />
                  </div>

                  {/* DUR */}
                  <div className="px-1 py-2">
                    <input type="text" defaultValue={bloque.duracion_min ?? ''}
                      key={`${bloque.id}-${bloque.duracion_min}`}
                      onBlur={e => actualizarTiempo(bloque.id, 'duracion', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      placeholder="min"
                      className="bg-transparent text-xs text-ch-muted focus:outline-none w-full font-mono placeholder:text-ch-border focus:bg-ch-surface focus:rounded-[2px] px-1" />
                  </div>

                  {/* IMG */}
                  <div className="flex items-center justify-center px-0.5 py-1.5" onClick={e => e.stopPropagation()}>
                    {subiendoImagen === bloque.id ? (
                      <span className="text-[10px] text-ch-border">...</span>
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
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-ch-dark border border-ch-border rounded-full text-[8px] text-red-400 hidden group-hover/img:flex items-center justify-center leading-none ch-press"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSeleccionarImagen(bloque.id)}
                        className="text-ch-border hover:text-ch-muted opacity-0 group-hover:opacity-100 transition-all text-xs leading-none ch-press"
                        title="Agregar imagen"
                      >⬜</button>
                    )}
                  </div>

                  {/* Eliminar — inline confirm */}
                  <div className="flex items-center justify-end px-1 gap-1 py-2" onClick={e => e.stopPropagation()}>
                    {isEliminando ? (
                      <>
                        <button onClick={async () => { setConfirmarEliminar(null); await onEliminar(bloque.id) }}
                          className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors ch-press">
                          Sí
                        </button>
                        <span className="text-ch-border">·</span>
                        <button onClick={() => setConfirmarEliminar(null)}
                          className="text-xs text-ch-subtle hover:text-ch-muted transition-colors ch-press">
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmarEliminar(bloque.id)}
                        className="text-ch-border hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-xs ch-press"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* FILA MÓVIL */}
                <div className="lg:hidden border-b border-ch-border/30" style={{ backgroundColor: tinte }}>
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
                          <label className="text-xs text-ch-subtle mb-1 flex items-center gap-1">
                            Inicio
                            <button
                              type="button"
                              onClick={() => bloque.hora_inicio_fija ? desanclar(bloque.id) : anclarAqui(bloque.id, casc.inicio_min)}
                              title={bloque.hora_inicio_fija ? 'Anclado — clic para liberar' : 'Libre — clic para anclar acá'}
                              className={`text-[10px] leading-none ${bloque.hora_inicio_fija ? 'text-ch-gold' : 'text-ch-border'} ch-press`}
                            >
                              📌
                            </button>
                          </label>
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
                          className="text-xs text-ch-muted border border-ch-border px-2 py-0.5 rounded-[2px] ch-press">{bloque.dia_noche || 'D'}</button>
                        <button onClick={() => {
                          const ciclo: Record<string, string> = { 'I': 'E', 'E': '-', '-': 'I' }
                          actualizarCelda(bloque.id, 'interior_exterior', ciclo[bloque.interior_exterior || 'I'])
                        }} className="text-xs text-ch-muted border border-ch-border px-2 py-0.5 rounded-[2px] ch-press">{bloque.interior_exterior || 'I'}</button>
                        <button
                          onClick={() => handleSeleccionarImagen(bloque.id)}
                          disabled={subiendoImagen === bloque.id}
                          className="text-xs text-ch-muted border border-ch-border px-2 py-0.5 rounded-[2px] disabled:opacity-50 ch-press"
                        >{subiendoImagen === bloque.id ? '...' : bloque.imagen_url ? '→ cambiar img' : '+ imagen'}</button>
                        {bloque.imagen_url && (
                          <button onClick={() => handleEliminarImagen(bloque.id, bloque.imagen_url!)}
                            className="text-xs text-red-500/70 border border-red-900/40 px-2 py-0.5 rounded-[2px] ch-press">✕ imagen</button>
                        )}
                        <button onClick={async () => await onEliminar(bloque.id)}
                          className="text-xs text-red-500 ml-auto ch-press">Eliminar</button>
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
        </div>
      )}
    </div>
  )
}
