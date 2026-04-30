import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TagEstado from '@/components/equipos/TagEstado'
import type { Equipo, CategoriaEquipo } from '@/types'

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
    <div className="p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-2">
            Módulo CH-1
          </p>
          <h1 className="font-display italic text-5xl text-ch-cream leading-none">
            Equipos
          </h1>
        </div>
        <Link
          href="/equipos/nuevo"
          className="bg-ch-green hover:bg-ch-green-light text-ch-black font-body
                     font-medium text-[10px] tracking-[0.35em] uppercase px-6 py-3
                     transition-colors duration-200"
        >
          + Agregar equipo
        </Link>
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

      {/* Tabla */}
      {!equipos || equipos.length === 0 ? (
        <div className="border border-dashed border-ch-border p-16 text-center">
          <p className="text-ch-muted font-body text-sm">No hay equipos registrados aún.</p>
          <Link href="/equipos/nuevo" className="text-ch-green font-body text-sm mt-2 inline-block hover:text-ch-green-light">
            Agregar el primero →
          </Link>
        </div>
      ) : (
        <div className="border border-ch-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ch-border bg-ch-surface/50">
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Código</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Nombre</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Categoría</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Cant.</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Estado</th>
                <th className="text-left px-5 py-3 text-ch-muted font-body text-[10px] tracking-[0.35em] uppercase">Rental</th>
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
                  <td className="px-5 py-4">
                    <span className="font-body text-xs text-ch-muted">{eq.categoria?.nombre}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-body text-xs text-ch-cream">{eq.cantidad}</span>
                  </td>
                  <td className="px-5 py-4">
                    <TagEstado estado={eq.estado} />
                  </td>
                  <td className="px-5 py-4">
                    <span className={`font-body text-[10px] tracking-wider ${eq.rentable ? 'text-ch-green' : 'text-ch-muted'}`}>
                      {eq.rentable ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/equipos/${eq.id}/editar`}
                      className="text-ch-muted hover:text-ch-cream font-body text-xs transition-colors"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
