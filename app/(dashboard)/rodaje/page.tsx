import Link from 'next/link'
import { getRodajes } from '@/app/actions/rodaje'
import { EstadoRodaje } from '@/types'

const ESTADO_CONFIG: Record<EstadoRodaje, { label: string; clase: string }> = {
  borrador:   { label: 'Borrador',   clase: 'bg-zinc-800 text-zinc-400' },
  confirmado: { label: 'Confirmado', clase: 'bg-emerald-950 text-emerald-400' },
  completado: { label: 'Completado', clase: 'bg-zinc-900 text-zinc-500' },
}

export default async function RodajePage() {
  const rodajes = await getRodajes()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-medium text-zinc-100">Rodajes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{rodajes.length} producción{rodajes.length !== 1 ? 'es' : ''}</p>
        </div>
        <Link
          href="/rodaje/nuevo"
          className="bg-[#E6E2ED] text-zinc-900 text-sm font-medium px-4 py-2 rounded-[2px] hover:bg-white transition-colors"
        >
          + Nuevo rodaje
        </Link>
      </div>

      {rodajes.length === 0 ? (
        <div className="text-center py-24 text-zinc-600">
          <p className="text-sm">No hay rodajes todavía.</p>
          <Link href="/rodaje/nuevo" className="text-[#E6E2ED] text-sm mt-2 inline-block hover:underline">
            Crear el primero →
          </Link>
        </div>
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
                className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-[2px] px-5 py-4 hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-100 group-hover:text-white">
                      {r.nombre}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {fecha ? (
                        <span className="text-xs text-zinc-500">
                          {fecha}
                          {!r.fecha_confirmada && (
                            <span className="ml-1.5 text-amber-500">· fecha por confirmar</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">Fecha por definir</span>
                      )}
                      {r.proyecto && (
                        <span className="text-xs text-zinc-600">· {r.proyecto.nombre}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.locacion_nombre && (
                    <span className="text-xs text-zinc-600 hidden sm:block">{r.locacion_nombre}</span>
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
