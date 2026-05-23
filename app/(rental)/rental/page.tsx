import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Equipo, CategoriaEquipo } from '@/types'

export default async function RentalCatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>
}) {
  const { categoria } = await searchParams
  const admin = createAdminClient()

  const [{ data: categorias }, equiposResult] = await Promise.all([
    admin
      .from('categorias_equipo')
      .select('*')
      .eq('activa', true)
      .order('orden'),
    (async () => {
      let q = admin
        .from('equipos')
        .select('*, categoria:categorias_equipo(*)')
        .eq('rentable', true)
        .order('codigo')
      if (categoria) q = q.eq('categoria_codigo', categoria)
      return q
    })(),
  ])

  const equipos = (equiposResult.data ?? []) as (Equipo & { categoria?: CategoriaEquipo })[]

  return (
    <div className="p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <p className="text-ch-muted font-body text-[10px] tracking-[0.45em] uppercase mb-1">
            Rental · Equipos
          </p>
          <h1 className="font-display italic text-4xl lg:text-5xl text-ch-cream leading-none">
            Catálogo
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

      {/* Filtros de categoría */}
      <div className="flex gap-2 mb-8 flex-wrap">
        <Link
          href="/rental"
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
            href={`/rental?categoria=${cat.codigo}`}
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

      {/* Grid de equipos */}
      {equipos.length === 0 ? (
        <div className="border border-dashed border-ch-border rounded-[2px] p-16 text-center">
          <p className="text-ch-muted font-body text-sm mb-1">
            No hay equipos disponibles para rental{categoria ? ' en esta categoría' : ''}.
          </p>
          <p className="text-ch-subtle font-body text-xs">
            Contacta al equipo para más información.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipos.map(eq => (
            <div
              key={eq.id}
              className="border border-ch-border bg-ch-surface/30 overflow-hidden hover:bg-ch-surface/50 transition-colors"
            >
              {/* Imagen */}
              {eq.fotos?.[0] ? (
                <img
                  src={eq.fotos[0]}
                  alt={eq.nombre}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-ch-surface flex items-center justify-center">
                  <span className="text-ch-subtle font-body text-xs tracking-widest">SIN FOTO</span>
                </div>
              )}

              {/* Info */}
              <div className="p-5">
                <p className="text-ch-muted font-body text-[9px] tracking-[0.4em] uppercase mb-1">
                  {eq.codigo}{eq.categoria?.nombre ? ` · ${eq.categoria.nombre}` : ''}
                </p>
                <h3 className="font-display italic text-xl text-ch-cream mb-2 leading-tight">
                  {eq.nombre}
                </h3>
                {eq.precio_jornada && eq.precio_jornada > 0 ? (
                  <p className="text-ch-muted font-body text-xs mb-4">
                    ${eq.precio_jornada.toLocaleString('es-CL')} / jornada
                  </p>
                ) : (
                  <p className="text-ch-subtle font-body text-xs mb-4">Precio a consultar</p>
                )}
                <Link
                  href={`/rental/${eq.id}`}
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
