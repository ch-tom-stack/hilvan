import { getCotizacionesGrupos } from '@/app/actions/cotizaciones'
import { getEtiquetasCotizacion, crearEtiquetaCotizacion, asignarEtiquetaCotizacion, quitarEtiquetaCotizacion } from '@/app/actions/etiquetas'
import Link from 'next/link'
import { numeroCotizacion, formatCLP } from '@/types'
import type { CotizacionGrupo, Cotizacion, Etiqueta } from '@/types'
import EtiquetaPicker from '@/components/ui/EtiquetaPicker'

const ESTADO_LABELS: Record<string, { label: string; color: string }> = {
  borrador:      { label: 'Borrador',      color: 'bg-ch-muted/20 text-ch-muted' },
  enviada:       { label: 'Enviada',       color: 'bg-blue-500/20 text-blue-300' },
  aprobada:      { label: 'Aprobada',      color: 'bg-ch-green/20 text-ch-green' },
  rechazada:     { label: 'Rechazada',     color: 'bg-red-500/20 text-red-400' },
  en_produccion: { label: 'En producción', color: 'bg-amber-500/20 text-amber-300' },
  cerrada:       { label: 'Cerrada',       color: 'bg-ch-muted/10 text-ch-muted/60' },
}

function TagEstado({ estado }: { estado: string }) {
  const cfg = ESTADO_LABELS[estado] ?? { label: estado, color: 'bg-ch-muted/20 text-ch-muted' }
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-body tracking-wider uppercase font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; etiqueta?: string }>
}) {
  const { q, estado, etiqueta } = await searchParams
  const [grupos, etiquetasDisponibles] = await Promise.all([
    getCotizacionesGrupos(q, estado, etiqueta) as Promise<CotizacionGrupo[]>,
    getEtiquetasCotizacion(),
  ])
  const hayFiltro = Boolean(q || estado || etiqueta)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="font-body text-xs tracking-widest uppercase text-ch-muted mb-1">Módulo</p>
          <h1 className="font-display text-3xl text-ch-cream">Cotizaciones</h1>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="flex items-center gap-2 px-4 py-2 bg-ch-cream text-ch-dark font-body text-sm font-medium hover:bg-ch-cream/90 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          Nueva cotización
        </Link>
      </div>

      {/* Búsqueda + filtro por estado */}
      <div className="mb-6 space-y-3">
        <form method="GET" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Buscar por número, cliente, proyecto o nombre…"
            className="flex-1 bg-ch-surface border border-ch-border px-3 py-2 font-body text-sm text-ch-cream placeholder:text-ch-muted focus:outline-none focus:border-ch-cream/40"
          />
          {estado && <input type="hidden" name="estado" value={estado} />}
          {etiqueta && <input type="hidden" name="etiqueta" value={etiqueta} />}
          <button
            type="submit"
            className="px-4 py-2 border border-ch-border font-body text-sm text-ch-muted hover:text-ch-cream hover:border-ch-cream/40 transition-colors ch-press"
          >
            Buscar
          </button>
          {hayFiltro && (
            <Link
              href="/cotizaciones"
              className="px-3 py-2 font-body text-xs text-ch-muted hover:text-ch-cream transition-colors whitespace-nowrap"
            >
              ✕ limpiar
            </Link>
          )}
        </form>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ESTADO_LABELS).map(([key, { label }]) => {
            const params = new URLSearchParams()
            if (q) params.set('q', q)
            if (etiqueta) params.set('etiqueta', etiqueta)
            const activo = estado === key
            if (!activo) params.set('estado', key)
            const href = params.toString() ? `/cotizaciones?${params}` : '/cotizaciones'
            return (
              <Link
                key={key}
                href={href}
                className={`px-2.5 py-1 font-body text-[11px] tracking-wide uppercase border transition-colors ${
                  activo ? 'border-ch-green text-ch-green' : 'border-ch-border text-ch-muted hover:text-ch-cream'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {etiquetasDisponibles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {etiquetasDisponibles.map((et) => {
              const params = new URLSearchParams()
              if (q) params.set('q', q)
              if (estado) params.set('estado', estado)
              const activo = etiqueta === et.id
              if (!activo) params.set('etiqueta', et.id)
              const href = params.toString() ? `/cotizaciones?${params}` : '/cotizaciones'
              return (
                <Link
                  key={et.id}
                  href={href}
                  className="px-2.5 py-1 font-body text-[11px] rounded-[2px] border transition-colors"
                  style={activo
                    ? { borderColor: et.color, color: et.color, backgroundColor: `${et.color}14` }
                    : { borderColor: 'var(--color-ch-border)', color: 'var(--color-ch-muted)' }}
                >
                  {et.texto}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista */}
      {grupos.length === 0 ? (
        <div className="border border-ch-border p-16 text-center">
          <p className="font-display text-2xl text-ch-cream/40 mb-2">
            {hayFiltro ? 'Sin resultados' : 'Sin cotizaciones'}
          </p>
          <p className="font-body text-sm text-ch-muted">
            {hayFiltro
              ? 'Prueba con otro término o quita el filtro.'
              : 'Crea la primera cotización para comenzar.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((grupo) => (
            <GrupoCotizacion key={grupo.id} grupo={grupo} etiquetasDisponibles={etiquetasDisponibles} />
          ))}
        </div>
      )}
    </div>
  )
}

function GrupoCotizacion({ grupo, etiquetasDisponibles }: { grupo: CotizacionGrupo; etiquetasDisponibles: Etiqueta[] }) {
  const cotizaciones = (grupo.cotizaciones ?? []).sort((a: Cotizacion, b: Cotizacion) => {
    if (a.version !== b.version) return b.version - a.version
    return (a.variante ?? '') > (b.variante ?? '') ? 1 : -1
  })

  const principal = cotizaciones[0]

  return (
    <div className="border border-ch-border overflow-hidden">
      {/* Fila del grupo */}
      <div className="group flex items-start sm:items-center justify-between px-4 sm:px-5 py-3 sm:py-4 bg-ch-dark/60 gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4 min-w-0">
          <span className="font-body text-[10px] text-ch-muted tracking-wider font-medium shrink-0">
            {grupo.numero_base}
          </span>
          <span className="font-body text-sm text-ch-cream font-medium truncate">
            {grupo.cliente?.nombre ?? grupo.cliente?.empresa ?? '—'}
          </span>
          {grupo.proyecto && (
            <span className="font-body text-xs text-ch-muted truncate hidden sm:block">
              · {grupo.proyecto.nombre}
            </span>
          )}
          <EtiquetaPicker
            entidadId={grupo.id}
            disponibles={etiquetasDisponibles}
            asignadas={grupo.etiquetas ?? []}
            onAsignar={asignarEtiquetaCotizacion}
            onQuitar={quitarEtiquetaCotizacion}
            onCrear={crearEtiquetaCotizacion}
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="font-body text-xs text-ch-muted whitespace-nowrap">
            {cotizaciones.length} {cotizaciones.length === 1 ? 'versión' : 'versiones'}
          </span>
          <Link
            href="/cotizaciones/nueva"
            className="font-body text-xs text-ch-muted hover:text-ch-cream transition-colors whitespace-nowrap hidden sm:block"
          >
            + cotización
          </Link>
        </div>
      </div>

      {/* Versiones */}
      <div className="divide-y divide-ch-border/50">
        {cotizaciones.map((cot: Cotizacion) => {
          const numVisible = numeroCotizacion({ grupo, version: cot.version, variante: cot.variante })
          // Sin movimiento hace rato y sigue en un estado "activo" (una cerrada
          // vieja es normal, no necesita atención). Señal blanda: solo atenúa.
          const diasSinMovimiento = (Date.now() - new Date(cot.updated_at).getTime()) / 86400000
          const stale = diasSinMovimiento > 30 && (cot.estado === 'borrador' || cot.estado === 'enviada')
          return (
            <Link
              key={cot.id}
              href={`/cotizaciones/${cot.id}`}
              className={`block px-4 sm:px-5 py-3 hover:bg-ch-border/10 transition-colors group sm:flex sm:items-center sm:justify-between ${stale ? 'opacity-50 hover:opacity-100' : ''}`}
            >
              {/* Número + nombre */}
              <div className="flex items-baseline gap-2 sm:gap-4 min-w-0">
                <span className="font-body text-[10px] text-ch-muted shrink-0 sm:w-28">
                  {numVisible}
                </span>
                <span className="font-body text-sm text-ch-cream group-hover:text-white transition-colors truncate">
                  {cot.nombre}
                </span>
              </div>
              {/* Estado + fecha */}
              <div className="flex items-center gap-3 mt-1.5 sm:mt-0 ml-[calc(0.5rem+10px)] sm:ml-0">
                <TagEstado estado={cot.estado} />
                <span className="font-body text-xs text-ch-muted">
                  {formatFecha(cot.updated_at)}
                  {stale && <span className="ml-1.5 text-ch-subtle">· sin movimiento</span>}
                </span>
                <span className="font-body text-xs text-ch-muted opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                  →
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
