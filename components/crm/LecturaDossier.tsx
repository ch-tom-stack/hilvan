'use client'

import { useState } from 'react'
import type { CrmLectura } from '@/types'

/**
 * Renderiza el dossier de La Lectura dentro de la ficha del prospecto.
 *
 * El dossier lo produce OTRO sistema (el sitio) y llega como jsonb, así que
 * acá se lee a la defensiva: si cambia su forma, la sección degrada a lo que
 * sí entiende en vez de romper la ficha. Nada es obligatorio.
 *
 * Es el insumo del brief creativo cuando el prospecto avanza a cotización.
 */

// ── Lectores defensivos ──────────────────────────────────────────────────────
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const txt = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const PRODUCTO_LABEL: Record<string, string> = {
  'banco-audiovisual': 'Banco audiovisual',
  'contenido-temporada': 'Contenido de temporada',
  'lookbook': 'Lookbook',
  'pieza-ancla': 'Pieza ancla',
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-ch-border pt-4">
      <p className="font-body text-[9px] tracking-[0.35em] uppercase text-ch-subtle mb-2">{titulo}</p>
      {children}
    </div>
  )
}

function Cita({ children }: { children: string }) {
  // Verbatim del sitio de la marca: se marca como cita, no como voz nuestra.
  return (
    <p className="border-l-2 border-ch-border pl-3 my-2 font-body text-xs text-ch-muted italic">
      “{children}”
    </p>
  )
}

export default function LecturaDossier({ lectura }: { lectura: CrmLectura }) {
  const [abierto, setAbierto] = useState(false)

  const d = obj(lectura.dossier)
  const url = lectura.url ?? (d ? txt(obj(d.senales)?.url) : null)

  // Sin dossier archivado: se conserva el comportamiento viejo (solo el link).
  if (!d) {
    return (
      <div>
        <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em] mb-1">La Lectura</p>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="font-body text-sm text-ch-green hover:text-ch-green-light transition-colors break-all">
            {lectura.dossier_ref || url}
          </a>
        ) : (
          <p className="font-body text-sm text-ch-cream">{lectura.dossier_ref || '—'}</p>
        )}
        <p className="font-body text-[10px] text-ch-subtle mt-1">
          Sin dossier archivado — es anterior al archivado automático.
        </p>
      </div>
    )
  }

  const sintesis = obj(d.sintesis)
  const senales = obj(d.senales)
  const lect = obj(sintesis?.lectura)
  const direccion = obj(sintesis?.direccion)
  const ocasion = obj(direccion?.ocasion)
  const benchmark = obj(sintesis?.benchmark)
  const vimos = arr(sintesis?.vimos)
  const tensiones = arr(sintesis?.tensiones)
  const esquemas = arr(sintesis?.esquemas)
  const fuentes = arr(d.fuentes)
  const imagenes = arr(d.imagenes).filter((x): x is string => typeof x === 'string')

  const producto = txt(direccion?.productoTransicional)

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-body text-[9px] text-ch-subtle uppercase tracking-[0.3em]">La Lectura</p>
        <button
          type="button"
          onClick={() => setAbierto(a => !a)}
          className="font-body text-[10px] tracking-[0.3em] uppercase text-ch-green hover:text-ch-green-light transition-colors shrink-0 ch-press"
        >
          {abierto ? 'Cerrar' : 'Ver dossier'}
        </button>
      </div>

      {/* Resumen siempre visible: lo que sirve de un vistazo */}
      <div className="space-y-1.5">
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="block font-body text-xs text-ch-green hover:text-ch-green-light transition-colors break-all">
            {url}
          </a>
        )}
        {producto && (
          <p className="font-body text-xs text-ch-cream">
            Producto propuesto: <span className="text-ch-gold">{PRODUCTO_LABEL[producto] ?? producto}</span>
          </p>
        )}
        {ocasion && txt(ocasion.nombre) && (
          <p className="font-body text-xs text-ch-muted">
            {txt(ocasion.nombre)}
            {txt(ocasion.cuando) ? ` · ${txt(ocasion.cuando)}` : ''}
          </p>
        )}
        {d.bloqueado === true && (
          <p className="font-body text-[10px] text-ch-gold">
            El sitio propio no se pudo leer — se investigó por fuentes públicas.
          </p>
        )}
      </div>

      {abierto && (
        <div className="mt-4 space-y-4 ch-fade-up">

          {lect && (
            <Bloque titulo="La lectura">
              <div className="space-y-2.5">
                {txt(lect.heroe) && <Campo k="Héroe" v={txt(lect.heroe)!} />}
                {txt(lect.villano) && <Campo k="Villano" v={txt(lect.villano)!} />}
                {txt(lect.vacaPurpura) && <Campo k="Vaca púrpura" v={txt(lect.vacaPurpura)!} acento />}
              </div>
            </Bloque>
          )}

          {direccion && txt(direccion.enfoque) && (
            <Bloque titulo="Dirección propuesta">
              <p className="font-body text-xs text-ch-cream leading-relaxed">{txt(direccion.enfoque)}</p>
              {ocasion && txt(ocasion.porque) && (
                <p className="font-body text-xs text-ch-muted leading-relaxed mt-2">{txt(ocasion.porque)}</p>
              )}
            </Bloque>
          )}

          {vimos.length > 0 && (
            <Bloque titulo={`Lo que vimos (${vimos.length})`}>
              <div className="space-y-3">
                {vimos.map((v, i) => {
                  const o = obj(v)
                  const observacion = txt(o?.observacion)
                  if (!observacion) return null
                  return (
                    <div key={i}>
                      <p className="font-body text-xs text-ch-cream leading-relaxed">{observacion}</p>
                      {txt(o?.cita) && <Cita>{txt(o!.cita)!}</Cita>}
                    </div>
                  )
                })}
              </div>
            </Bloque>
          )}

          {tensiones.length > 0 && (
            <Bloque titulo={`Tensiones (${tensiones.length})`}>
              <ul className="space-y-2">
                {tensiones.map((t, i) => {
                  const detalle = txt(obj(t)?.detalle)
                  if (!detalle) return null
                  return (
                    <li key={i} className="font-body text-xs text-ch-cream leading-relaxed flex gap-2">
                      <span className="text-ch-subtle shrink-0">·</span>
                      <span>{detalle}</span>
                    </li>
                  )
                })}
              </ul>
            </Bloque>
          )}

          {esquemas.length > 0 && (
            <Bloque titulo="Esquemas activados">
              <div className="space-y-4">
                {esquemas.map((e, i) => {
                  const o = obj(e)
                  if (!o) return null
                  return (
                    <div key={i} className="border border-ch-border bg-ch-surface/20 p-3">
                      {txt(o.id) && (
                        <p className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-gold mb-1.5">{txt(o.id)}</p>
                      )}
                      {txt(o.notamos) && (
                        <p className="font-body text-xs text-ch-cream leading-relaxed">{txt(o.notamos)}</p>
                      )}
                      {txt(o.cita) && <Cita>{txt(o.cita)!}</Cita>}
                      {txt(o.porQueImporta) && (
                        <p className="font-body text-xs text-ch-muted leading-relaxed mt-1.5">{txt(o.porQueImporta)}</p>
                      )}
                      {txt(o.pregunta) && (
                        <p className="font-display italic text-sm text-ch-cream mt-2">{txt(o.pregunta)}</p>
                      )}
                      {txt(o.desbloquea) && (
                        <p className="font-body text-[11px] text-ch-green mt-1.5">{txt(o.desbloquea)}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </Bloque>
          )}

          {benchmark && (
            <Bloque titulo="Benchmark">
              {txt(benchmark.similares) && (
                <p className="font-body text-xs text-ch-cream leading-relaxed">{txt(benchmark.similares)}</p>
              )}
              {txt(benchmark.diferenciacion) && (
                <p className="font-body text-xs text-ch-muted leading-relaxed mt-2">{txt(benchmark.diferenciacion)}</p>
              )}
            </Bloque>
          )}

          {senales && <Senales senales={senales} />}

          {imagenes.length > 0 && (
            <Bloque titulo={`Imágenes de la marca (${imagenes.length})`}>
              <div className="flex flex-wrap gap-2">
                {imagenes.slice(0, 12).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" loading="lazy"
                    className="w-16 h-16 object-cover border border-ch-border" />
                ))}
              </div>
            </Bloque>
          )}

          {fuentes.length > 0 && (
            <Bloque titulo={`Fuentes consultadas (${fuentes.length})`}>
              <ul className="space-y-1">
                {fuentes.map((f, i) => {
                  const o = obj(f)
                  const titulo = txt(o?.titulo)
                  const fu = txt(o?.url)
                  if (!titulo) return null
                  return (
                    <li key={i} className="font-body text-[11px] text-ch-muted">
                      {txt(o?.tipo) && <span className="text-ch-subtle">[{txt(o!.tipo)}] </span>}
                      {fu ? (
                        <a href={fu} target="_blank" rel="noopener noreferrer"
                          className="text-ch-muted hover:text-ch-green transition-colors">{titulo}</a>
                      ) : titulo}
                    </li>
                  )
                })}
              </ul>
            </Bloque>
          )}
        </div>
      )}
    </div>
  )
}

function Campo({ k, v, acento }: { k: string; v: string; acento?: boolean }) {
  return (
    <div>
      <p className="font-body text-[9px] tracking-[0.25em] uppercase text-ch-subtle mb-0.5">{k}</p>
      <p className={`font-body text-xs leading-relaxed ${acento ? 'text-ch-gold' : 'text-ch-cream'}`}>{v}</p>
    </div>
  )
}

function Senales({ senales }: { senales: Record<string, unknown> }) {
  const precios = obj(senales.precios)
  const redes = arr(senales.redes).filter((x): x is string => typeof x === 'string')
  const datos: [string, string][] = []
  if (txt(senales.plataforma)) datos.push(['Plataforma', txt(senales.plataforma)!])
  if (typeof senales.skus === 'number' && senales.skus > 0) datos.push(['SKUs', String(senales.skus)])
  if (precios && typeof precios.min === 'number' && typeof precios.max === 'number') {
    datos.push(['Precios', `${precios.min}–${precios.max}${txt(precios.moneda) ? ' ' + txt(precios.moneda) : ''}`])
  }
  if (redes.length) datos.push(['Redes', String(redes.length)])
  if (senales.tieneAbout === true) datos.push(['Sobre nosotros', 'sí'])

  if (datos.length === 0) return null
  return (
    <Bloque titulo="Señales del sitio">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        {datos.map(([k, v]) => (
          <div key={k}>
            <p className="font-body text-[9px] tracking-[0.2em] uppercase text-ch-subtle">{k}</p>
            <p className="font-body text-xs text-ch-cream">{v}</p>
          </div>
        ))}
      </div>
    </Bloque>
  )
}
