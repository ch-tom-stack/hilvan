import { getCotizacionesGrupos } from '@/app/actions/cotizaciones'
import Link from 'next/link'
import { numeroCotizacion, formatCLP } from '@/types'
import type { CotizacionGrupo, Cotizacion } from '@/types'

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
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-body tracking-wider uppercase font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export default async function CotizacionesPage() {
  const grupos = await getCotizacionesGrupos() as CotizacionGrupo[]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="font-body text-xs tracking-widest uppercase text-ch-muted mb-1">Módulo</p>
          <h1 className="font-display text-3xl text-ch-cream">Cotizaciones</h1>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="flex items-center gap-2 px-4 py-2 bg-ch-cream text-ch-dark font-body text-sm font-medium rounded hover:bg-ch-cream/90 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          Nueva cotización
        </Link>
      </div>

      {/* Lista */}
      {grupos.length === 0 ? (
        <div className="border border-ch-border rounded-lg p-16 text-center">
          <p className="font-display text-2xl text-ch-cream/40 mb-2">Sin cotizaciones</p>
          <p className="font-body text-sm text-ch-muted">Crea la primera cotización para comenzar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((grupo) => (
            <GrupoCotizacion key={grupo.id} grupo={grupo} />
          ))}
        </div>
      )}
    </div>
  )
}

function GrupoCotizacion({ grupo }: { grupo: CotizacionGrupo }) {
  const cotizaciones = (grupo.cotizaciones ?? []).sort((a: Cotizacion, b: Cotizacion) => {
    if (a.version !== b.version) return b.version - a.version
    return (a.variante ?? '') > (b.variante ?? '') ? 1 : -1
  })

  const principal = cotizaciones[0]

  return (
    <div className="border border-ch-border rounded-lg overflow-hidden">
      {/* Fila del grupo */}
      <div className="flex items-center justify-between px-5 py-4 bg-ch-dark/60">
        <div className="flex items-center gap-4">
          <span className="font-body text-xs text-ch-muted tracking-wider font-medium">
            {grupo.numero_base}
          </span>
          <span className="font-body text-sm text-ch-cream font-medium">
            {grupo.cliente?.nombre ?? grupo.cliente?.empresa ?? '—'}
          </span>
          {grupo.proyecto && (
            <span className="font-body text-xs text-ch-muted">
              · {grupo.proyecto.nombre}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-body text-xs text-ch-muted">
            {cotizaciones.length} {cotizaciones.length === 1 ? 'versión' : 'versiones'}
          </span>
          <Link
            href="/cotizaciones/nueva"
            className="font-body text-xs text-ch-muted hover:text-ch-cream transition-colors"
          >
            + cotización
          </Link>
        </div>
      </div>

      {/* Versiones */}
      <div className="divide-y divide-ch-border/50">
        {cotizaciones.map((cot: Cotizacion) => {
          const numVisible = numeroCotizacion({ grupo, version: cot.version, variante: cot.variante })
          const estado = ESTADO_LABELS[cot.estado] ?? ESTADO_LABELS.borrador
          return (
            <Link
              key={cot.id}
              href={`/cotizaciones/${cot.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-ch-border/10 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <span className="font-body text-xs text-ch-muted w-28 shrink-0">
                  {numVisible}
                </span>
                <span className="font-body text-sm text-ch-cream group-hover:text-white transition-colors">
                  {cot.nombre}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <TagEstado estado={cot.estado} />
                <span className="font-body text-xs text-ch-muted">
                  {formatFecha(cot.updated_at)}
                </span>
                <span className="font-body text-xs text-ch-muted opacity-0 group-hover:opacity-100 transition-opacity">
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
