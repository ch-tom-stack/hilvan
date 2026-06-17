'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RodajeBloque, calcularCascada, minutosAHora } from '@/types'
import { estiloCss } from '@/components/rodaje/BloqueLibre'
import SunCalc from 'suncalc'
import { parseFechaLocal } from '@/lib/fechas'

interface Props {
  id: string
  rodajeInicial: any
  bloquesIniciales: RodajeBloque[]
  locaciones: any[]
  solInicial: { amanecer: string; atardecer: string; dorada_am: string; dorada_pm: string } | null
}

export default function PlanViewer({ id, rodajeInicial, bloquesIniciales, locaciones, solInicial }: Props) {
  const [bloques, setBloques] = useState<RodajeBloque[]>(bloquesIniciales)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const supabase = supabaseRef.current

    const channel = supabase
      .channel(`plan-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rodaje_bloques', filter: `rodaje_id=eq.${id}` },
        async () => {
          const { data } = await supabase
            .from('rodaje_bloques')
            .select('*')
            .eq('rodaje_id', id)
            .is('padre_id', null)
            .order('orden')
          if (data) {
            setBloques(data as RodajeBloque[])
            setUltimaActualizacion(new Date())
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  const rodaje = rodajeInicial
  const bloquesRaiz = bloques.filter(b => !b.padre_id).sort((a, b) => a.orden - b.orden)
  const cascada = calcularCascada(bloquesRaiz)
  const callMin = cascada[0]?.inicio_min
  const locacionPrincipal = locaciones.find((l: any) => l.es_principal) || locaciones[0]
  const equipo = rodaje.equipo_tecnico || []
  const durTotal = bloquesRaiz.filter(b => !b.es_paralelo).reduce((acc, b) => acc + (b.duracion_min || 0), 0)
  const sol = solInicial

  const fecha = rodaje.fecha
    ? parseFechaLocal(rodaje.fecha).toLocaleDateString('es-CL', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-ch-dark text-ch-cream">

      {/* HEADER */}
      <div className="border-b border-ch-border px-4 py-5 max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-ch-subtle mb-1">Casa Hiedra</p>
            <h1 className="text-xl font-medium text-ch-cream">{rodaje.nombre}</h1>
            {fecha && <p className="text-sm text-ch-muted mt-0.5">{fecha}</p>}
            {rodaje.proyecto?.nombre && (
              <p className="text-xs text-ch-subtle mt-1">{rodaje.proyecto.nombre}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {rodaje.cliente_logo_url && (
              <img src={rodaje.cliente_logo_url} alt="Cliente" className="h-8 w-auto object-contain" style={{ filter: 'invert(1)' }} />
            )}
            {ultimaActualizacion && (
              <span className="text-[10px] text-ch-subtle">
                Actualizado {ultimaActualizacion.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Info strip */}
        <div className="flex items-center gap-4 mt-4 flex-wrap text-xs">
          {callMin !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-ch-subtle">CALL</span>
              <span className="font-medium text-lg text-ch-cream">{minutosAHora(callMin)}</span>
            </div>
          )}
          {locacionPrincipal && (
            <div className="flex items-center gap-1.5">
              <span className="text-ch-subtle">📍</span>
              <span className="text-ch-muted">{locacionPrincipal.nombre}</span>
              {locacionPrincipal.direccion && (
                <span className="text-ch-subtle">· {locacionPrincipal.direccion}</span>
              )}
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
          {durTotal > 0 && (
            <span className="text-ch-subtle ml-auto">{Math.floor(durTotal / 60)}h {durTotal % 60}min</span>
          )}
        </div>

        {/* Chiste */}
        {(rodaje.chiste_imagen_url || rodaje.chiste_texto) && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-ch-border/30">
            {rodaje.chiste_imagen_url && (
              <img src={rodaje.chiste_imagen_url} alt="" className="h-10 w-10 object-cover rounded" />
            )}
            {rodaje.chiste_texto && (
              <p className="text-xs text-ch-muted italic">{rodaje.chiste_texto}</p>
            )}
          </div>
        )}
      </div>

      {/* PLAN */}
      {bloquesRaiz.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-xs text-ch-subtle uppercase tracking-wider mb-3">Plan de rodaje</p>

          {/* Headers desktop */}
          <div className="hidden sm:grid text-xs text-ch-subtle uppercase tracking-wider pb-1 border-b border-ch-border mb-1"
            style={{ gridTemplateColumns: '56px 48px 1fr 70px 36px 36px 52px 52px 48px' }}>
            <span></span>
            <span></span>
            <span>Descripción</span>
            <span>Char #</span>
            <span className="text-center">D/N</span>
            <span className="text-center">I/E</span>
            <span className="text-center">Inicio</span>
            <span className="text-center">Fin</span>
            <span></span>
          </div>

          {bloquesRaiz.map((bloque, idx) => {
            // Bloque libre: lienzo expresivo a todo lo ancho.
            if (bloque.tipo === 'libre') {
              const est = bloque.estilo || {}
              return (
                <div key={bloque.id} className="py-3 border-b border-ch-border/30" style={{ backgroundColor: est.color_fondo }}>
                  {bloque.imagen_url && (
                    <button onClick={() => setImagenAmpliada(bloque.imagen_url!)} className="block mb-2"
                      style={{ marginLeft: est.align === 'center' ? 'auto' : undefined, marginRight: est.align === 'center' ? 'auto' : undefined }}>
                      <img src={bloque.imagen_url} alt="" className="max-h-72 w-auto max-w-full object-contain rounded-[2px] border border-ch-border hover:border-ch-muted transition-colors" />
                    </button>
                  )}
                  {bloque.contenido_rico && (
                    <p className="whitespace-pre-wrap" style={estiloCss(est)}>{bloque.contenido_rico}</p>
                  )}
                </div>
              )
            }

            const casc = cascada[idx]
            return (
              <div key={bloque.id} className={bloque.es_paralelo ? 'opacity-75' : ''}>

                {/* FILA DESKTOP */}
                <div className="hidden sm:grid items-start py-2.5 border-b border-ch-border/30 text-sm"
                  style={{ gridTemplateColumns: '56px 48px 1fr 70px 36px 36px 52px 52px 48px' }}>
                  <span className="text-xs text-ch-subtle font-mono pt-0.5">
                    {casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : '—'}
                  </span>
                  <span>
                    {bloque.scenes_label && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-[2px]"
                        style={{ backgroundColor: bloque.scenes_color || '#353135', color: '#fff', fontSize: 9 }}>
                        {bloque.scenes_label}
                      </span>
                    )}
                  </span>
                  <div>
                    <p className="text-ch-cream">{bloque.titulo}</p>
                    {bloque.descripcion && <p className="text-xs text-ch-subtle mt-0.5">{bloque.descripcion}</p>}
                    {bloque.nota_previa && <p className="text-xs text-ch-subtle italic mt-0.5">{bloque.nota_previa}</p>}
                    {bloque.imagen_url && (
                      <button onClick={() => setImagenAmpliada(bloque.imagen_url!)} className="mt-1.5 block">
                        <img src={bloque.imagen_url} alt="" className="h-16 w-24 object-cover rounded-[2px] border border-ch-border hover:border-ch-muted transition-colors" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-ch-muted pt-0.5">{bloque.character_num || ''}</span>
                  <span className="text-xs text-ch-muted text-center pt-0.5">{bloque.dia_noche || 'D'}</span>
                  <span className="text-xs text-ch-muted text-center pt-0.5">{bloque.interior_exterior || 'I'}</span>
                  <span className="text-xs font-mono text-ch-muted text-center pt-0.5">
                    {casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : '—'}
                  </span>
                  <span className="text-xs font-mono text-ch-muted text-center pt-0.5">
                    {casc.fin_min !== undefined ? minutosAHora(casc.fin_min) : '—'}
                  </span>
                  <span></span>
                </div>

                {/* FILA MÓVIL */}
                <div className="sm:hidden border-b border-ch-border/30 py-3 px-1">
                  <div className="flex items-start gap-2">
                    {bloque.scenes_label && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-[2px] shrink-0 mt-0.5"
                        style={{ backgroundColor: bloque.scenes_color || '#353135', color: '#fff' }}>
                        {bloque.scenes_label}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ch-cream">{bloque.titulo}</p>
                      {bloque.descripcion && <p className="text-xs text-ch-subtle mt-0.5">{bloque.descripcion}</p>}
                      {bloque.nota_previa && <p className="text-xs text-ch-subtle italic mt-0.5">{bloque.nota_previa}</p>}
                      {bloque.imagen_url && (
                        <button onClick={() => setImagenAmpliada(bloque.imagen_url!)} className="mt-2 block">
                          <img src={bloque.imagen_url} alt="" className="h-20 w-full max-w-[200px] object-cover rounded-[2px] border border-ch-border" />
                        </button>
                      )}
                    </div>
                    <div className="text-right shrink-0 font-mono">
                      <p className="text-xs text-ch-muted">
                        {casc.inicio_min !== undefined ? minutosAHora(casc.inicio_min) : '—'}
                        {casc.fin_min !== undefined ? ` → ${minutosAHora(casc.fin_min)}` : ''}
                      </p>
                      <p className="text-xs text-ch-subtle mt-0.5">{bloque.dia_noche || 'D'} · {bloque.interior_exterior || 'I'}</p>
                    </div>
                  </div>
                </div>

              </div>
            )
          })}

          {durTotal > 0 && (
            <p className="text-xs text-ch-subtle text-right mt-3">
              Total: {Math.floor(durTotal / 60)}h {durTotal % 60}min
            </p>
          )}
        </div>
      )}

      {/* EQUIPO */}
      {equipo.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-10">
          <p className="text-xs text-ch-subtle uppercase tracking-wider mb-3">Equipo técnico</p>
          <div className="divide-y divide-ch-border/20 border-t border-ch-border">
            {equipo.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm text-ch-cream">{p.nombre}</p>
                  <p className="text-xs text-ch-subtle">{p.rol}</p>
                </div>
                <div className="text-right">
                  {p.hora_llamado_individual && (
                    <p className="text-sm font-mono text-ch-muted">{p.hora_llamado_individual.slice(0, 5)}</p>
                  )}
                  {p.telefono && <p className="text-xs text-ch-subtle">{p.telefono}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-ch-border/20 px-4 py-4 text-center max-w-4xl mx-auto">
        <p className="text-xs text-ch-border">Casa Hiedra · Hilván</p>
      </div>

      {/* Lightbox */}
      {imagenAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImagenAmpliada(null)}
        >
          <img src={imagenAmpliada} alt="" className="max-w-full max-h-full object-contain rounded" />
        </div>
      )}
    </div>
  )
}
