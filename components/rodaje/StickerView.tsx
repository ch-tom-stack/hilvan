import type { CSSProperties } from 'react'
import { RodajeSticker } from '@/types'
import { estiloCss } from './BloqueLibre'

// Render de un sticker flotante (imagen o nota) posado sobre el plan.
// Posición/tamaño en fracción del ancho/alto del contenedor del plan (0..1).
export default function StickerView({ s }: { s: RodajeSticker }) {
  const base: CSSProperties = {
    position: 'absolute',
    left: `${(s.x ?? 0) * 100}%`,
    top: `${(s.y ?? 0) * 100}%`,
    width: `${(s.w ?? 0.25) * 100}%`,
    transform: `rotate(${s.rot || 0}deg)`,
    transformOrigin: 'top left',
    zIndex: s.z ?? 0,
  }

  if (s.tipo === 'texto') {
    return (
      <div style={{ ...base, ...estiloCss(s.estilo) }} className="whitespace-pre-wrap">
        {s.contenido}
      </div>
    )
  }

  return s.imagen_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.imagen_url} alt="" style={{ ...base, height: 'auto' }} />
  ) : null
}
