import Link from 'next/link'
import { getRodajes } from '@/app/actions/rodaje'
import { EstadoRodaje } from '@/types'
import EstadoVacio from '@/components/ui/EstadoVacio'

const ESTADO_CONFIG: Record<EstadoRodaje, { label: string; clase: string }> = {
  borrador:   { label: 'Borrador',   clase: 'bg-ch-surface text-ch-muted' },
  confirmado: { label: 'Confirmado', clase: 'bg-emerald-950 text-emerald-400' },
  completado: { label: 'Completado', clase: 'bg-ch-surface text-ch-subtle' },
}

export default async function RodajePage() {
  const rodajes = await getRodajes()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-medium text-ch-cream">Rodajes</h1>
          <p className="text-sm text-ch-muted mt-0.5">{rodajes.length} producción{rodajes.length !== 1 ? 'es' : ''}</p>
        </div>
        <Link
          href="/rodaje/nuevo"
          className="bg-ch-cream text-ch-dark text-sm font-medium px-4 py-2 rounded-[2px] hover:bg-white transition-colors"
        >
          + Nuevo rodaje
        </Link>
      </div>

      {rodajes.length === 0 ? (
        <EstadoVacio
          mensaje="No hay rodajes todavía."
          accion={<Link href="/rodaje/nuevo" className="font-body text-[10px] tracking-[0.35em] uppercase text-ch-green hover:text-ch-green-light transition-colors">Crear el primero →</Link>}
        />
      ) : (
        <div className="space-y-2">
          {rodajes.map((r: any) => {
            const cfg = ESTADO_CONFIG[r.estado as EstadoRodaje]
            const fecha = r.fecha
              ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                })
              : null

            return (
              <Link
                key={r.id}
                href={`/rodaje/${r.id}`}
                className="flex items-center justify-between bg-ch-surface border border-ch-border rounded-[2px] px-5 py-4 hover:border-ch-muted transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-ch-cream group-hover:text-white">
                      {r.nombre}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {fecha ? (
                        <span className="text-xs text-ch-muted">
                          {fecha}
                          {!r.fecha_confirmada && (
                            <span className="ml-1.5 text-amber-500">· fecha por confirmar</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-ch-subtle">Fecha por definir</span>
                      )}
                      {r.proyecto && (
                        <span className="text-xs text-ch-subtle">· {r.proyecto.nombre}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.locacion_nombre && (
                    <span className="text-xs text-ch-subtle hidden sm:block">{r.locacion_nombre}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.clase}`}>
                    {cfg.label}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
