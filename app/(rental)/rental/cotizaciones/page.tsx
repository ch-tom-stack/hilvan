import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listarRentalCotizaciones } from '@/app/actions/rental'
import type { Profile, EstadoRentalCotizacion, RentalCotizacion } from '@/types'
import { ESTADO_RENTAL_COT_LABELS } from '@/types'
import { redirect } from 'next/navigation'

const ESTADO_COLORS: Record<EstadoRentalCotizacion, string> = {
  borrador:  'text-ch-muted  border-ch-border    bg-transparent',
  enviada:   'text-blue-400  border-blue-400/30  bg-blue-400/5',
  aprobada:  'text-ch-green  border-ch-green/30  bg-ch-green/5',
  rechazada: 'text-red-400   border-red-400/30   bg-red-400/5',
  cerrada:   'text-ch-subtle border-ch-border/50  bg-transparent',
}

export default async function CotizacionesRentalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .single<Pick<Profile, 'rol'>>()

  if (!['admin', 'productor'].includes(profile?.rol ?? '')) {
    redirect('/rental')
  }

  let cotizaciones: any[] = []
  try {
    cotizaciones = await listarRentalCotizaciones()
  } catch {
    // Tabla no existe aún
  }

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Rental · Cotizaciones
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Cotizaciones
          </h1>
        </div>
        <Link
          href="/rental/cotizaciones/nueva"
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium
                     text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors duration-200"
        >
          + Nueva cotización
        </Link>
      </div>

      {cotizaciones.length === 0 ? (
        <div className="border border-dashed border-ch-border rounded-[2px] p-16 text-center">
          <p className="text-ch-muted font-body text-sm mb-1">No hay cotizaciones de rental aún.</p>
          <p className="text-ch-subtle font-body text-xs">
            Crea una cotización desde una reserva aprobada.
          </p>
        </div>
      ) : (
        <>
          {/* Tabla desktop */}
          <div className="hidden sm:block border border-ch-border overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ch-border bg-ch-surface/50">
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Número</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Cliente</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase hidden md:table-cell">Fecha</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Estado</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {cotizaciones.map((cot, i) => (
                  <tr
                    key={cot.id}
                    className={`border-b border-ch-border/50 hover:bg-ch-surface/30 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-ch-surface/20'
                    }`}
                  >
                    <td className="px-5 py-4">
                      <span className="font-body text-sm text-ch-cream font-mono">{cot.numero}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-body text-sm text-ch-cream">
                        {cot.cliente?.nombre ?? cot.cliente_nombre_libre ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="font-body text-xs text-ch-muted">
                        {new Date(cot.created_at).toLocaleDateString('es-CL')}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-body px-2.5 py-0.5 rounded-[2px] border ${ESTADO_COLORS[cot.estado as EstadoRentalCotizacion]}`}>
                        {ESTADO_RENTAL_COT_LABELS[cot.estado as EstadoRentalCotizacion]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/rental/cotizaciones/${cot.id}`}
                        className="text-ch-muted hover:text-ch-cream font-body text-xs transition-colors"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="sm:hidden space-y-3">
            {cotizaciones.map(cot => (
              <Link
                key={cot.id}
                href={`/rental/cotizaciones/${cot.id}`}
                className="flex items-center justify-between gap-4 border border-ch-border bg-ch-surface/20 p-4 hover:bg-ch-surface/40 transition-colors"
              >
                <div>
                  <p className="font-body text-sm text-ch-cream font-mono">{cot.numero}</p>
                  <p className="font-body text-xs text-ch-muted">
                    {cot.cliente?.nombre ?? cot.cliente_nombre_libre ?? '—'}
                  </p>
                </div>
                <span className={`text-xs font-body px-2.5 py-0.5 rounded-[2px] border shrink-0 ${ESTADO_COLORS[cot.estado as EstadoRentalCotizacion]}`}>
                  {ESTADO_RENTAL_COT_LABELS[cot.estado as EstadoRentalCotizacion]}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
