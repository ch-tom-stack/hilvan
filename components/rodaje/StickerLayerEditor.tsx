'use client'

import { useEffect, useRef, useState } from 'react'
import { RodajeSticker, familiaFuentePlan } from '@/types'
import { estiloCss } from './BloqueLibre'
import { toastError } from '@/lib/toast'
import { momento } from '@/lib/momentos'
import {
  crearSticker, actualizarSticker, eliminarSticker, subirImagenSticker,
} from '@/app/actions/rodaje-stickers'

const clamp = (v: number) => Math.max(-0.05, Math.min(1.02, v))
const fileToDataUrl = (f: Blob): Promise<string> =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f) })

type Drag = { id: string; mode: 'move' | 'resize' | 'rotate'; sx: number; sy: number; x: number; y: number; w: number; rot: number; rw: number; rh: number; cx: number; cy: number }

export default function StickerLayerEditor({ rodajeId, iniciales, children }: { rodajeId: string; iniciales: RodajeSticker[]; children: React.ReactNode }) {
  const [stickers, setStickers] = useState<RodajeSticker[]>(iniciales)
  const [sel, setSel] = useState<string | null>(null)
  const [quitarAuto, setQuitarAuto] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const cropRef = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; x: number; y: number; w: number; h: number; ew: number; eh: number } | null>(null)
  const stickersRef = useRef(stickers); stickersRef.current = stickers

  const seleccionado = stickers.find(s => s.id === sel) || null
  const maxZ = stickers.reduce((m, s) => Math.max(m, s.z ?? 0), 0)

  // ── Procesar imagen vía el endpoint (quitar-fondo / borde / trim) ──────────
  async function procesar(src: Blob | string, op: string, params?: Record<string, string>): Promise<string> {
    const fd = new FormData()
    const blob = src instanceof Blob ? src : await (await fetch(src)).blob()
    fd.append('file', blob, 'img.png')
    fd.append('op', op)
    if (params) for (const k in params) fd.append(k, params[k])
    const res = await fetch('/api/sticker-procesar', { method: 'POST', body: fd })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Error procesando la imagen') }
    return fileToDataUrl(await res.blob())
  }

  // ── Agregar sticker de imagen (con quitar-fondo automático opcional) ────────
  async function agregarImagen(file: File) {
    setOcupado(true)
    try {
      let dataUrl = quitarAuto ? await procesar(file, 'quitar-fondo') : await fileToDataUrl(file)
      const url = await subirImagenSticker(rodajeId, `s${Date.now()}`, dataUrl)
      const nuevo = await crearSticker(rodajeId, { tipo: 'imagen', imagen_url: url, x: 0.34, y: 0.3, w: 0.24, z: maxZ + 1 })
      setStickers(p => [...p, nuevo]); setSel(nuevo.id); momento('subido', { mensaje: '' })
    } catch (e) { toastError(e instanceof Error ? e.message : 'Error al agregar imagen'); momento('error', { mensaje: 'Error al agregar imagen' }) }
    finally { setOcupado(false) }
  }

  async function agregarNota() {
    const txt = window.prompt('Texto de la nota:')
    if (!txt?.trim()) return
    try {
      const nuevo = await crearSticker(rodajeId, { tipo: 'texto', contenido: txt.trim(), estilo: { fuente: 'marcador', color: '#C11700', tamano: 'md' }, x: 0.3, y: 0.35, w: 0.3, z: maxZ + 1 })
      setStickers(p => [...p, nuevo]); setSel(nuevo.id); momento('item.agregado')
    } catch (e) { toastError(e instanceof Error ? e.message : 'Error al agregar nota'); momento('error', { mensaje: 'Error al agregar nota' }) }
  }

  // ── Aplicar una operación de imagen al sticker seleccionado ─────────────────
  async function aplicarOp(s: RodajeSticker, op: string, params?: Record<string, string>) {
    if (!s.imagen_url) return
    setOcupado(true)
    try {
      const dataUrl = await procesar(s.imagen_url, op, params)
      const url = await subirImagenSticker(rodajeId, `s${s.id}-${Date.now()}`, dataUrl)
      await actualizarSticker(s.id, rodajeId, { imagen_url: url })
      setStickers(p => p.map(x => x.id === s.id ? { ...x, imagen_url: url } : x))
    } catch (e) { toastError(e instanceof Error ? e.message : 'Error al procesar') }
    finally { setOcupado(false) }
  }

  async function borrar(s: RodajeSticker) {
    setStickers(p => p.filter(x => x.id !== s.id)); setSel(null)
    try { await eliminarSticker(s.id, rodajeId); momento('item.eliminado') } catch (e) { toastError(e instanceof Error ? e.message : 'Error al eliminar'); momento('error', { mensaje: 'Error al eliminar' }) }
  }

  // ── Drag / resize / rotate ──────────────────────────────────────────────────
  function iniciar(e: React.PointerEvent, s: RodajeSticker, mode: Drag['mode']) {
    e.preventDefault(); e.stopPropagation()
    setSel(s.id)
    const r = layerRef.current!.getBoundingClientRect()
    const el = document.getElementById('stk-' + s.id)!.getBoundingClientRect()
    dragRef.current = { id: s.id, mode, sx: e.clientX, sy: e.clientY, x: s.x, y: s.y, w: s.w, rot: s.rot, rw: r.width, rh: r.height, cx: el.left + el.width / 2, cy: el.top + el.height / 2 }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  function mover(e: PointerEvent) {
    const d = dragRef.current; if (!d) return
    setStickers(prev => prev.map(s => {
      if (s.id !== d.id) return s
      if (d.mode === 'move') return { ...s, x: clamp(d.x + (e.clientX - d.sx) / d.rw), y: clamp(d.y + (e.clientY - d.sy) / d.rh) }
      if (d.mode === 'resize') return { ...s, w: Math.max(0.04, d.w + (e.clientX - d.sx) / d.rw) }
      const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180 / Math.PI + 90
      return { ...s, rot: Math.round(a) }
    }))
  }
  function soltar() {
    const d = dragRef.current; dragRef.current = null
    window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar)
    if (!d) return
    const s = stickersRef.current.find(x => x.id === d.id)
    if (s) actualizarSticker(s.id, rodajeId, { x: s.x, y: s.y, w: s.w, rot: s.rot }).catch(() => {})
  }

  // ── Recorte manual (caja sobre el sticker seleccionado) ─────────────────────
  function iniciarCrop(e: React.PointerEvent, s: RodajeSticker, mode: 'move' | 'resize') {
    e.preventDefault(); e.stopPropagation()
    if (!crop) return
    const el = document.getElementById('stk-' + s.id)!.getBoundingClientRect()
    cropRef.current = { mode, sx: e.clientX, sy: e.clientY, ...crop, ew: el.width, eh: el.height }
    window.addEventListener('pointermove', cropMover); window.addEventListener('pointerup', cropSoltar)
  }
  function cropMover(e: PointerEvent) {
    const d = cropRef.current; if (!d) return
    const dx = (e.clientX - d.sx) / d.ew, dy = (e.clientY - d.sy) / d.eh
    if (d.mode === 'move') {
      setCrop({ x: Math.max(0, Math.min(1 - d.w, d.x + dx)), y: Math.max(0, Math.min(1 - d.h, d.y + dy)), w: d.w, h: d.h })
    } else {
      setCrop({ x: d.x, y: d.y, w: Math.max(0.05, Math.min(1 - d.x, d.w + dx)), h: Math.max(0.05, Math.min(1 - d.y, d.h + dy)) })
    }
  }
  function cropSoltar() {
    cropRef.current = null
    window.removeEventListener('pointermove', cropMover); window.removeEventListener('pointerup', cropSoltar)
  }
  async function aplicarRecorte() {
    const s = seleccionado; if (!s || !crop) return
    await aplicarOp(s, 'crop', { x: String(crop.x), y: String(crop.y), w: String(crop.w), h: String(crop.h) })
    setCrop(null)
  }

  // pegar imagen (⌘V) en cualquier parte del editor
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const item = Array.from(ev.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
      if (!item) return
      const f = item.getAsFile(); if (f) { ev.preventDefault(); agregarImagen(new File([f], 'pegado.png', { type: f.type })) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quitarAuto, maxZ])

  return (
    <>
      {/* Toolbar de la capa */}
      <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-ch-border text-xs">
        <span className="text-[9px] tracking-[0.4em] uppercase text-ch-subtle mr-1">Stickers</span>
        <button onClick={() => fileRef.current?.click()} disabled={ocupado}
          className="text-ch-muted border border-ch-border px-2 py-0.5 rounded-[2px] hover:text-ch-cream disabled:opacity-50">+ imagen</button>
        <button onClick={agregarNota} disabled={ocupado}
          className="text-ch-muted border border-ch-border px-2 py-0.5 rounded-[2px] hover:text-ch-cream disabled:opacity-50">+ nota</button>
        <label className="flex items-center gap-1 text-ch-muted cursor-pointer ml-1">
          <input type="checkbox" checked={quitarAuto} onChange={e => setQuitarAuto(e.target.checked)} />
          quitar fondo al subir
        </label>
        {ocupado && <span className="text-ch-subtle">procesando…</span>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) agregarImagen(f) }} />
      </div>

      {/* Barra del sticker seleccionado */}
      {seleccionado && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-1.5 border-b border-ch-border/60 text-xs bg-ch-surface/40">
          {seleccionado.tipo === 'imagen' && (crop ? <>
            <button onClick={aplicarRecorte} disabled={ocupado} className="text-ch-green hover:text-ch-green-light disabled:opacity-50">aplicar recorte</button>
            <span className="text-ch-border">·</span>
            <button onClick={() => setCrop(null)} className="text-ch-muted hover:text-ch-cream">cancelar</button>
            <span className="text-ch-border">·</span>
          </> : <>
            <button onClick={() => aplicarOp(seleccionado, 'quitar-fondo')} disabled={ocupado} className="text-ch-muted hover:text-ch-cream disabled:opacity-50">quitar fondo</button>
            <span className="text-ch-border">·</span>
            <button onClick={() => aplicarOp(seleccionado, 'borde', { color: 'ffffff', grosor: '12' })} disabled={ocupado} className="text-ch-muted hover:text-ch-cream disabled:opacity-50">borde</button>
            <span className="text-ch-border">·</span>
            <button onClick={() => aplicarOp(seleccionado, 'trim')} disabled={ocupado} className="text-ch-muted hover:text-ch-cream disabled:opacity-50">auto-trim</button>
            <span className="text-ch-border">·</span>
            <button onClick={() => setCrop({ x: 0.12, y: 0.12, w: 0.76, h: 0.76 })} disabled={ocupado} className="text-ch-muted hover:text-ch-cream disabled:opacity-50">✂ recortar</button>
            <span className="text-ch-border">·</span>
          </>)}
          <button onClick={() => actualizarSticker(seleccionado.id, rodajeId, { z: maxZ + 1 }).then(() => setStickers(p => p.map(x => x.id === seleccionado.id ? { ...x, z: maxZ + 1 } : x)))} className="text-ch-muted hover:text-ch-cream">al frente</button>
          <span className="text-ch-border">·</span>
          <button onClick={() => borrar(seleccionado)} className="text-red-500/70 hover:text-red-400">eliminar</button>
        </div>
      )}

      {/* Plan + capa de stickers encima (alineada al plan) */}
      <div className="relative">
        {children}
        <div ref={layerRef} className="pointer-events-none absolute inset-0 z-20" onPointerDown={() => setSel(null)}>
        {stickers.map(s => {
          const activo = s.id === sel
          const base: React.CSSProperties = {
            position: 'absolute', left: `${(s.x ?? 0) * 100}%`, top: `${(s.y ?? 0) * 100}%`,
            width: `${(s.w ?? 0.25) * 100}%`, transform: `rotate(${s.rot || 0}deg)`, transformOrigin: 'top left', zIndex: s.z ?? 0,
          }
          return (
            <div key={s.id} id={'stk-' + s.id} style={base}
              className={`pointer-events-auto cursor-move ${activo ? 'outline outline-1 outline-ch-green' : ''}`}
              onPointerDown={e => iniciar(e, s, 'move')}
              onDoubleClick={() => { if (s.tipo === 'texto') { const t = window.prompt('Editar nota:', s.contenido || ''); if (t != null) { actualizarSticker(s.id, rodajeId, { contenido: t }); setStickers(p => p.map(x => x.id === s.id ? { ...x, contenido: t } : x)) } } }}>
              {s.tipo === 'texto'
                ? <div style={estiloCss(s.estilo)} className="whitespace-pre-wrap select-none">{s.contenido}</div>
                /* eslint-disable-next-line @next/next/no-img-element */
                : s.imagen_url ? <img src={s.imagen_url} alt="" draggable={false} className="w-full select-none" /> : null}

              {activo && !crop && <>
                {/* redimensionar (esquina inferior derecha) */}
                <div onPointerDown={e => iniciar(e, s, 'resize')} className="pointer-events-auto absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-ch-green border border-white cursor-nwse-resize" />
                {/* rotar (arriba) */}
                <div onPointerDown={e => iniciar(e, s, 'rotate')} className="pointer-events-auto absolute -top-5 left-1/2 -translate-x-1/2 w-3 h-3 bg-ch-green border border-white rounded-full cursor-grab" />
              </>}

              {/* Caja de recorte manual */}
              {activo && crop && s.tipo === 'imagen' && (
                <div className="pointer-events-auto absolute inset-0" onPointerDown={e => e.stopPropagation()}>
                  <div className="absolute border-2 border-ch-green cursor-move"
                    style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
                    onPointerDown={e => iniciarCrop(e, s, 'move')}>
                    <div onPointerDown={e => iniciarCrop(e, s, 'resize')} className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-ch-green border border-white cursor-nwse-resize" />
                  </div>
                </div>
              )}
            </div>
          )
        })}
        </div>
      </div>
    </>
  )
}
