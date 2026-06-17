'use client'

import { useState, useEffect, useRef } from 'react'
import { toastError } from '@/lib/toast'
import { actualizarImagenBloque } from '@/app/actions/rodaje-plan'
import { subirImagenBloque, eliminarImagenBloque } from '@/lib/supabase/storage-rodaje'
import {
  RodajeBloque, RodajeLocacion, BloqueEstilo, PLANTILLAS_BLOQUES,
  calcularCascada, aplicarCambioTiempo,
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

// ─── Tabla del plan ───────────────────────────────────────────────────────────

export default function TablaPlan({
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

  const subirYAsignar = async (bloqueId: string, file: File) => {
    setSubiendoImagen(bloqueId)
    try {
      const url = await subirImagenBloque(file, rodajeId, bloqueId)
      if (url) {
        await actualizarImagenBloque(bloqueId, rodajeId, url)
        onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, imagen_url: url } : b))
      }
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
      await actualizarImagenBloque(bloqueId, rodajeId, null)
      onActualizar(bloques.map(b => b.id === bloqueId ? { ...b, imagen_url: undefined } : b))
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Error al eliminar imagen')
    }
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
            onClick={() => onCrear({ titulo: 'Libre', tipo: 'libre', duracion_min: 0 })}
            disabled={creando}
            title="Lienzo libre: pega imágenes, chistes, notas con tu propia letra y color"
            className="text-xs text-ch-muted border border-ch-border px-3 py-1 rounded-[2px] hover:border-ch-muted hover:text-ch-cream transition-colors disabled:opacity-50"
          >
            + Libre
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
            // Bloque libre: lienzo expresivo a todo lo ancho (fuera de la grilla).
            if (bloque.tipo === 'libre') {
              return (
                <BloqueLibre
                  key={bloque.id}
                  bloque={bloque}
                  subiendo={subiendoImagen === bloque.id}
                  onCampo={(campo, valor) => actualizarCelda(bloque.id, campo, valor)}
                  onEstilo={(parcial: Partial<BloqueEstilo>) =>
                    actualizarCelda(bloque.id, 'estilo', { ...(bloque.estilo || {}), ...parcial })}
                  onSubirImagen={(file) => subirYAsignar(bloque.id, file)}
                  onEliminarImagen={() => bloque.imagen_url && handleEliminarImagen(bloque.id, bloque.imagen_url)}
                  onEliminar={() => onEliminar(bloque.id)}
                />
              )
            }

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
