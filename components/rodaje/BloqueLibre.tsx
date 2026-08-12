'use client'

import { useState } from 'react'
import { RodajeBloque, BloqueEstilo, FUENTES_PLAN, familiaFuentePlan } from '@/types'

// ─── Mapas de estilo → CSS ──────────────────────────────────────────────────

const TAMANOS: Record<NonNullable<BloqueEstilo['tamano']>, number> = {
  sm: 14, md: 18, lg: 26, xl: 40,
}
const PESOS: Record<NonNullable<BloqueEstilo['peso']>, number> = {
  thin: 300, normal: 400, bold: 700,
}

/** Estilo CSS del lienzo a partir de un BloqueEstilo (compartido con viewer/PDF). */
export function estiloCss(e?: BloqueEstilo): React.CSSProperties {
  return {
    fontFamily: familiaFuentePlan(e?.fuente),
    color: e?.color,
    backgroundColor: e?.color_fondo,
    fontSize: e?.tamano ? TAMANOS[e.tamano] : undefined,
    fontWeight: e?.peso ? PESOS[e.peso] : undefined,
    textAlign: e?.align,
    lineHeight: 1.3,
  }
}

const COLORES_TEXTO = ['#f5f0e8', '#111110', '#C11700', '#f77f00', '#fcbf49', '#2d6a4f', '#533483', '#0f3460']
const COLORES_FONDO = ['transparent', '#242422', '#1a1a2e', '#C11700', '#fcbf49', '#2d6a4f', '#eae2b7', '#f5f0e8']

// ─── Componente ───────────────────────────────────────────────────────────────

export default function BloqueLibre({
  bloque, subiendo,
  onCampo, onEstilo, onSubirImagen, onEliminarImagen, onEliminar,
}: {
  bloque: RodajeBloque
  subiendo: boolean
  onCampo: (campo: 'contenido_rico', valor: string) => void
  onEstilo: (parcial: Partial<BloqueEstilo>) => void
  onSubirImagen: (file: File) => void
  onEliminarImagen: () => void
  onEliminar: () => void
}) {
  const e = bloque.estilo || {}
  const [confirmar, setConfirmar] = useState(false)

  const handlePaste = (ev: React.ClipboardEvent) => {
    const item = Array.from(ev.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (!item) return
    const file = item.getAsFile()
    if (!file) return
    ev.preventDefault()
    // Renombrar con extensión real (el paste suele venir sin nombre).
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    onSubirImagen(new File([file], `pegado.${ext}`, { type: file.type }))
  }

  const btn = (activo: boolean) =>
    `ch-press text-[11px] px-1.5 py-0.5 rounded-[2px] border transition-colors ${
      activo ? 'border-ch-cream text-ch-cream bg-ch-surface' : 'border-ch-border text-ch-subtle hover:text-ch-muted'
    }`

  return (
    <div className="border-b border-ch-border/30 bg-ch-dark group">
      {/* Toolbar de expresión */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-1.5 border-b border-ch-border/20">
        <span className="text-[9px] tracking-[0.4em] uppercase text-ch-subtle mr-1">Libre</span>

        {/* Fuente */}
        <select
          value={e.fuente || ''}
          onChange={ev => onEstilo({ fuente: ev.target.value || undefined })}
          className="bg-ch-surface border border-ch-border rounded-[2px] text-[11px] text-ch-cream px-1 py-0.5 focus:outline-none"
        >
          <option value="">Fuente</option>
          {FUENTES_PLAN.map(f => (
            <option key={f.clave} value={f.clave}>{f.label}</option>
          ))}
        </select>

        {/* Tamaño */}
        <div className="flex gap-0.5">
          {(['sm', 'md', 'lg', 'xl'] as const).map(t => (
            <button key={t} onClick={() => onEstilo({ tamano: t })} className={btn(e.tamano === t)}>{t}</button>
          ))}
        </div>

        {/* Peso */}
        <div className="flex gap-0.5">
          <button onClick={() => onEstilo({ peso: 'thin' })} className={btn(e.peso === 'thin')}>Thin</button>
          <button onClick={() => onEstilo({ peso: 'normal' })} className={btn(!e.peso || e.peso === 'normal')}>Normal</button>
          <button onClick={() => onEstilo({ peso: 'bold' })} className={btn(e.peso === 'bold')}>Bold</button>
        </div>

        {/* Alineación */}
        <div className="flex gap-0.5">
          {(['left', 'center', 'right'] as const).map((a, i) => (
            <button key={a} onClick={() => onEstilo({ align: a })} className={btn(e.align === a)}>
              {['⬅', '⬛', '➡'][i]}
            </button>
          ))}
        </div>

        {/* Color texto */}
        <div className="flex items-center gap-0.5">
          {COLORES_TEXTO.map(c => (
            <button key={c} onClick={() => onEstilo({ color: c })}
              className={`w-4 h-4 rounded-full border ${e.color === c ? 'border-ch-cream' : 'border-ch-border'} ch-press`}
              style={{ backgroundColor: c }} title="Color de texto" />
          ))}
        </div>

        {/* Color fondo */}
        <div className="flex items-center gap-0.5">
          {COLORES_FONDO.map(c => (
            <button key={c} onClick={() => onEstilo({ color_fondo: c === 'transparent' ? undefined : c })}
              className={`w-4 h-4 rounded-[2px] border ${(e.color_fondo || 'transparent') === c ? 'border-ch-cream' : 'border-ch-border'} ch-press`}
              style={c === 'transparent' ? { backgroundImage: 'linear-gradient(45deg,#555 25%,transparent 25%,transparent 75%,#555 75%)', backgroundSize: '6px 6px' } : { backgroundColor: c }}
              title="Color de fondo" />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Imagen */}
          <label className="text-[11px] text-ch-subtle hover:text-ch-muted cursor-pointer">
            {subiendo ? '...' : bloque.imagen_url ? '→ cambiar img' : '+ imagen'}
            <input type="file" accept="image/*" className="hidden"
              onChange={ev => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) onSubirImagen(f) }} />
          </label>
          {bloque.imagen_url && (
            <button onClick={onEliminarImagen} className="text-[11px] text-red-500/70 hover:text-red-400 ch-press">✕ img</button>
          )}
          {/* Eliminar bloque */}
          {confirmar ? (
            <span className="text-[11px]">
              <button onClick={onEliminar} className="text-red-400 hover:text-red-300 font-medium ch-press">Sí</button>
              <span className="text-ch-border mx-1">·</span>
              <button onClick={() => setConfirmar(false)} className="text-ch-subtle hover:text-ch-muted ch-press">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmar(true)} className="text-ch-border hover:text-red-500 text-xs ch-press">✕</button>
          )}
        </div>
      </div>

      {/* Lienzo */}
      <div className="px-3 py-3" style={{ backgroundColor: e.color_fondo }}>
        {bloque.imagen_url && (
          <img src={bloque.imagen_url} alt=""
            className="max-h-72 w-auto max-w-full object-contain mb-2"
            style={{ marginLeft: e.align === 'center' ? 'auto' : undefined, marginRight: e.align === 'center' || e.align === 'left' ? 'auto' : undefined }} />
        )}
        <textarea
          value={bloque.contenido_rico || ''}
          onChange={ev => onCampo('contenido_rico', ev.target.value)}
          onPaste={handlePaste}
          rows={Math.max(2, (bloque.contenido_rico || '').split('\n').length)}
          placeholder="Escribe libre… pega una imagen (⌘V), un chiste, una nota."
          className="w-full bg-transparent resize-none focus:outline-none placeholder:text-ch-border/70"
          style={estiloCss(e)}
        />
      </div>
    </div>
  )
}
