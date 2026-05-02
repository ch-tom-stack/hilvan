import { getMaletas } from '@/app/actions/maletas'
import Link from 'next/link'
import type { Maleta } from '@/types'

export default async function MaletasPage() {
  const maletas = await getMaletas() as Maleta[]

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Equipos · Maletas
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Maletas
          </h1>
        </div>
        <div className="flex gap-3">
          <Link
            href="/equipos"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[10px] tracking-[0.35em] uppercase px-5 py-3 transition-colors"
          >
            ← Equipos
          </Link>
          <Link
            href="/equipos/maletas/nueva"
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3 transition-colors"
          >
            + Nueva maleta
          </Link>
        </div>
      </div>

      {maletas.length === 0 ? (
        <div className="border border-dashed border-ch-border p-16 text-center">
          <p className="text-ch-muted font-body text-sm">No hay maletas registradas aún.</p>
          <Link href="/equipos/maletas/nueva" className="text-ch-green font-body text-sm mt-2 inline-block hover:text-ch-green-light">
            Crear la primera →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {maletas.map(maleta => (
            <div key={maleta.id} className="border border-ch-border bg-ch-surface/30 overflow-hidden">
              {maleta.foto_empaque ? (
                <img src={maleta.foto_empaque} alt="" className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-ch-surface flex items-center justify-center">
                  <span className="text-ch-border font-body text-xs tracking-widest">SIN FOTO</span>
                </div>
              )}
              <div className="p-5">
                <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-1">{maleta.codigo}</p>
                <h3 className="font-display italic text-xl text-ch-cream mb-2">{maleta.nombre}</h3>
                <p className="text-ch-muted font-body text-xs mb-4">
                  {maleta.items?.length || 0} ítems
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/m/${maleta.codigo}`}
                    target="_blank"
                    className="flex-1 text-center border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-widest uppercase py-2 transition-colors"
                  >
                    Ficha pública
                  </Link>
                  <Link
                    href={`/equipos/maletas/${maleta.id}/editar`}
                    className="flex-1 text-center border border-ch-border text-ch-muted hover:text-ch-cream font-body text-[9px] tracking-widest uppercase py-2 transition-colors"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
