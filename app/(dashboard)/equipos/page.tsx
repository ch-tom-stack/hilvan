import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TagEstado from '@/components/equipos/TagEstado'
import ToggleRentable from '@/components/equipos/ToggleRentable'
import type { Equipo, CategoriaEquipo } from '@/types'
import EstadoVacio from '@/components/ui/EstadoVacio'

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string }>
}) {
  const { categoria, q } = await searchParams
  const supabase = await createClient()

  const { data: categorias } = await supabase
    .from('categorias_equipo')
    .select('*')
    .eq('activa', true)
    .order('orden')

  let query = supabase
    .from('equipos')
    .select('*, categoria:categorias_equipo(*)')
    .order('codigo')

  if (categoria) query = query.eq('categoria_codigo', categoria)
  if (q) query = query.ilike('nombre', `%${q}%`)

  const { data: equipos } = await query

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
            Módulo CH-1
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Equipos
          </h1>
        </div>
        <div className="flex gap-3">
          <Link
            href="/equipos/maletas"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
                       text-[10px] tracking-[0.35em] uppercase px-5 py-3
                       transition-colors duration-200"
          >
            Maletas
          </Link>
          <Link
            href="/equipos/bundles"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
                       text-[10px] tracking-[0.35em] uppercase px-5 py-3
                       transition-colors duration-200"
          >
            Bundles
          </Link>
          <Link
            href="/equipos/reservas"
            className="border border-ch-border text-ch-muted hover:text-ch-cream font-body
                       text-[10px] tracking-[0.35em] uppercase px-5 py-3
                       transition-colors duration-200"
          >
            Reservas
          </Link>
          <Link
            href="/equipos/nuevo"
            className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body
                       font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3
                       transition-colors duration-200"
          >
            + Agregar equipo
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Link
          href="/equipos"
          className={`px-4 py-2 font-body text-xs border transition-colors ${
            !categoria
              ? 'border-ch-green text-ch-cream bg-ch-surface'
              : 'border-ch-border text-ch-muted hover:text-ch-cream'
          }`}
        >
          Todos
        </Link>
        {(categorias as CategoriaEquipo[])?.map(cat => (
          <Link
            key={cat.codigo}
            href={`/equipos?categoria=${cat.codigo}`}
            className={`px-4 py-2 font-body text-xs border transition-colors ${
              categoria === cat.codigo
                ? 'border-ch-green text-ch-cream bg-ch-surface'
                : 'border-ch-border text-ch-muted hover:text-ch-cream'
            }`}
          >
            {cat.nombre}
          </Link>
        ))}
      </div>

      {/* Listado */}
      {!equipos || equipos.length === 0 ? (
        <EstadoVacio mensaje="No hay equipos registrados aún." />
      ) : (
        <>
          {/* Tarjetas — móvil */}
          <div className="sm:hidden space-y-3">
            {(equipos as Equipo[]).map(eq => (
              <Link
                key={eq.id}
                href={`/equipos/${eq.id}`}
                className="flex items-center gap-4 border border-ch-border bg-ch-surface/20 p-4 hover:bg-ch-surface/40 transition-colors"
              >
                {eq.fotos?.[0] ? (
                  <img src={eq.fotos[0]} alt={eq.nombre} className="w-14 h-14 object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 bg-ch-surface flex-shrink-0 flex items-center justify-center">
                    <span className="text-ch-subtle font-body text-[8px] tracking-widest">SIN<br/>FOTO</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-body text-[9px] text-ch-muted font-mono mb-0.5">{eq.codigo}</p>
                  <p className="font-body text-sm text-ch-cream truncate">{eq.nombre}</p>
                  <p className="font-body text-[10px] text-ch-muted mt-0.5">{eq.categoria?.nombre}</p>
                </div>
                <div className="flex-shrink-0">
                  <TagEstado estado={eq.estado} />
                </div>
              </Link>
            ))}
          </div>

          {/* Tabla — desktop */}
          <div className="hidden sm:block border border-ch-border overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ch-border bg-ch-surface/50">
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Código</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Nombre</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase hidden md:table-cell">Categoría</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Cant.</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Estado</th>
                  <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase hidden md:table-cell">Rental</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(equipos as Equipo[]).map((eq, i) => (
                  <tr
                    key={eq.id}
                    className={`border-b border-ch-border/50 hover:bg-ch-surface/30 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-ch-surface/20'
                    }`}
                  >
                    <td className="px-5 py-4">
                      <span className="font-body text-xs text-ch-muted font-mono">{eq.codigo}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {eq.fotos?.[0] && (
                          <img src={eq.fotos[0]} alt="" className="w-8 h-8 object-cover flex-shrink-0" />
                        )}
                        <span className="font-body text-sm text-ch-cream">{eq.nombre}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="font-body text-xs text-ch-muted">{eq.categoria?.nombre}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-body text-xs text-ch-cream">{eq.cantidad}</span>
                    </td>
                    <td className="px-5 py-4">
                      <TagEstado estado={eq.estado} />
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <ToggleRentable id={eq.id} rentable={eq.rentable ?? false} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/equipos/${eq.id}`}
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
        </>
      )}

    </div>
  )
}
