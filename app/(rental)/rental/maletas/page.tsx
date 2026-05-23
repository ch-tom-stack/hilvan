import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Maleta } from '@/types'

export default async function RentalMaletasPage() {
  const admin = createAdminClient()
  const { data: maletas } = await admin
    .from('maletas')
    .select('id, codigo, nombre, descripcion, foto_url, foto_empaque, created_at')
    .order('codigo')

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Rental · Maletas
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Maletas
          </h1>
        </div>
        <Link
          href="/rental/reservas/nueva"
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium
                     text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors duration-200"
        >
          + Solicitar reserva
        </Link>
      </div>

      {!maletas || maletas.length === 0 ? (
        <div className="border border-dashed border-ch-border rounded-[2px] p-16 text-center">
          <p className="text-ch-muted font-body text-sm mb-1">No hay maletas registradas aún.</p>
          <p className="text-ch-subtle font-body text-xs">Contacta al equipo para más información.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(maletas as Maleta[]).map(m => (
            <div
              key={m.id}
              className="border border-ch-border bg-ch-surface/30 overflow-hidden hover:bg-ch-surface/50 transition-colors"
            >
              {/* Imagen de empaque */}
              {(m.foto_empaque || m.foto_url) ? (
                <img
                  src={m.foto_empaque ?? m.foto_url!}
                  alt={m.nombre}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-ch-surface flex items-center justify-center">
                  <span className="text-ch-subtle font-body text-xs tracking-widest">SIN FOTO</span>
                </div>
              )}

              <div className="p-5">
                <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-1">
                  {m.codigo}
                </p>
                <h3 className="font-display italic text-xl text-ch-cream mb-2 leading-tight">
                  {m.nombre}
                </h3>
                {m.descripcion && (
                  <p className="text-ch-muted font-body text-xs mb-4 line-clamp-2 leading-relaxed">
                    {m.descripcion}
                  </p>
                )}
                <Link
                  href={`/rental/maletas/${m.id}`}
                  className="block text-center border border-ch-border text-ch-muted hover:text-ch-cream
                             font-body text-[9px] tracking-widest uppercase py-2 transition-colors"
                >
                  Ver detalle
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
