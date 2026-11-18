'use client'

import { RodajeBloque, calcularCascada, minutosAHora } from '@/types'

// ─── Vista Timeline ───────────────────────────────────────────────────────────
// Una "hoja" blanca con su propia paleta (como la hoja de Cronos): lo que se ve
// es lo que se imprime. El eje de horas y las filas comparten la misma columna
// de pista, así que barras, líneas y horas siempre coinciden.

const ANCHO_ETIQUETA = 170
const ANCHO_HORAS = 96
const ALTO_FILA = 28
const COLOR_BASE = '#353135'

function textoSobre(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#111111' : '#ffffff'
}

export default function TimelineView({ bloquesRaiz, cascada, titulo, fecha }: {
  bloquesRaiz: RodajeBloque[]
  cascada: ReturnType<typeof calcularCascada>
  titulo?: string
  fecha?: string | null
}) {
  // El lienzo libre no tiene hora: no es parte de la línea de tiempo.
  const filas = bloquesRaiz
    .map((bloque, idx) => ({ bloque, casc: cascada[idx] }))
    .filter(f => f.bloque.tipo !== 'libre')

  const conHora = filas.filter(f => f.casc.inicio_min !== undefined && f.casc.fin_min !== undefined)
  if (conHora.length === 0) return (
    <div className="px-4 py-8 text-center text-ch-subtle text-sm">
      Pon una hora de inicio en el primer bloque para ver el timeline.
    </div>
  )

  const inicios = conHora.map(f => f.casc.inicio_min!)
  const fines = conHora.map(f => f.casc.fin_min!)
  const paso = (() => {
    const t = Math.max(...fines) - Math.min(...inicios)
    return t <= 360 ? 30 : t <= 780 ? 60 : 120
  })()
  const minTime = Math.floor(Math.min(...inicios) / paso) * paso
  const maxTime = Math.max(Math.ceil(Math.max(...fines) / paso) * paso, minTime + paso)
  const total = maxTime - minTime
  const pct = (min: number) => ((min - minTime) / total) * 100

  const marcas: number[] = []
  for (let t = minTime; t <= maxTime; t += paso) marcas.push(t)

  const fechaTxt = fecha
    ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const grilla = `${ANCHO_ETIQUETA}px 1fr ${ANCHO_HORAS}px`

  return (
    <div className="px-4 py-4">
      <div className="flex justify-end mb-2 print:hidden">
        <button
          onClick={() => window.print()}
          className="text-xs text-ch-muted border border-ch-border px-3 py-1 rounded-[2px] hover:border-ch-muted hover:text-ch-cream transition-colors ch-press"
        >
          Imprimir timeline
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="timeline-imprimible" style={{ minWidth: 760, background: '#ffffff', color: '#111111', padding: '16px 18px', border: '1px solid #e2e2e2' }}>
          {(titulo || fechaTxt) && (
            <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #111111', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{titulo}</span>
              <span style={{ fontSize: 11, color: '#666666', textTransform: 'capitalize' }}>{fechaTxt}</span>
            </div>
          )}

          {/* Eje de horas — misma grilla que las filas */}
          <div style={{ display: 'grid', gridTemplateColumns: grilla, alignItems: 'end', marginBottom: 4 }}>
            <span />
            <div style={{ position: 'relative', height: 16 }}>
              {marcas.map(m => (
                <span key={m} style={{ position: 'absolute', left: `${pct(m)}%`, transform: 'translateX(-50%)', fontSize: 10, color: '#666666', fontFamily: 'monospace' }}>
                  {minutosAHora(m)}
                </span>
              ))}
            </div>
            <span />
          </div>

          {/* Filas */}
          <div style={{ position: 'relative' }}>
            {/* Líneas de guía sobre la columna de pista */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: ANCHO_ETIQUETA, right: ANCHO_HORAS, pointerEvents: 'none' }}>
              {marcas.map(m => (
                <div key={m} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(m)}%`, borderLeft: `1px solid ${m % 60 === 0 ? '#d4d4d4' : '#eeeeee'}` }} />
              ))}
            </div>

            {filas.map(({ bloque, casc }) => {
              const color = bloque.scenes_color || COLOR_BASE
              const tieneHora = casc.inicio_min !== undefined && casc.fin_min !== undefined
              const izq = tieneHora ? pct(casc.inicio_min!) : 0
              const ancho = tieneHora ? Math.max((casc.duracion_min / total) * 100, 0.8) : 0
              const caben = ancho > 9 // el título entra dentro de la barra
              return (
                <div key={bloque.id}
                  style={{ display: 'grid', gridTemplateColumns: grilla, alignItems: 'center', height: ALTO_FILA, borderBottom: '1px solid #f0f0f0', breakInside: 'avoid' }}>
                  <div style={{ paddingRight: 10, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {bloque.es_paralelo && <span title="En paralelo" style={{ color: '#888888', fontSize: 10 }}>∥</span>}
                    <span style={{ fontSize: 11, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={bloque.titulo}>
                      {bloque.scenes_label && <b style={{ marginRight: 5, color: color === COLOR_BASE ? '#111111' : color }}>{bloque.scenes_label}</b>}
                      {bloque.titulo}
                    </span>
                  </div>

                  <div style={{ position: 'relative', height: '100%' }}>
                    {tieneHora ? (
                      <>
                        <div
                          title={`${bloque.titulo} · ${minutosAHora(casc.inicio_min!)} → ${minutosAHora(casc.fin_min!)}`}
                          style={{
                            position: 'absolute', top: 5, height: ALTO_FILA - 10, left: `${izq}%`, width: `${ancho}%`,
                            background: color, color: textoSobre(color), borderRadius: 2, display: 'flex', alignItems: 'center',
                            padding: '0 6px', overflow: 'hidden', opacity: bloque.tipo === 'pausa' ? 0.55 : 1,
                            backgroundImage: bloque.tipo === 'pausa' ? 'repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.35) 4px 6px)' : undefined,
                            printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact',
                          }}
                        >
                          {caben && <span style={{ fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bloque.titulo}</span>}
                        </div>
                        {!caben && (
                          <span style={{ position: 'absolute', top: 7, left: `calc(${izq + ancho}% + 5px)`, fontSize: 10, color: '#555555', whiteSpace: 'nowrap' }}>
                            {bloque.titulo.length > 28 ? bloque.titulo.slice(0, 27) + '…' : bloque.titulo}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 10, color: '#aaaaaa', fontStyle: 'italic', position: 'absolute', top: 7, left: 4 }}>sin hora</span>
                    )}
                  </div>

                  <span style={{ fontSize: 10, color: '#555555', fontFamily: 'monospace', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {tieneHora ? `${minutosAHora(casc.inicio_min!)} → ${minutosAHora(casc.fin_min!)}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
