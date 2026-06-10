'use client'

import { RodajeBloque, calcularCascada, minutosAHora } from '@/types'

// ─── Vista Timeline ───────────────────────────────────────────────────────────

export default function TimelineView({ bloquesRaiz, cascada }: {
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
